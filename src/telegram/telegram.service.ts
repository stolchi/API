import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { IsNull, Not, Repository } from 'typeorm';
import {
  decryptSecret,
  encryptSecret,
  parseSecretKey,
} from '../common/crypto/secret-box.js';
import { tashkentDate, tashkentHour } from '../common/dates.js';
import {
  OrderSource,
  OrderStatus,
  OrderType,
  ProductUnit,
} from '../common/enums.js';
import { formatMoney } from '../common/money.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { TelegramBot } from '../database/entities/telegram-bot.entity.js';
import { OrderEvents, type OrderEvent } from '../orders/order-events.js';
import { displayNumberOf } from '../orders/order-number.js';
import { TelegramApi, TelegramRefused } from './telegram-api.js';

/** The hour, in Tashkent, after which the day's summary goes out. */
export const SUMMARY_HOUR = 23;
const SUMMARY_CHECK_MS = 5 * 60 * 1000;

export const NEEDS_HTTPS = 'NEEDS_HTTPS';

/** The bits of a Telegram update this bot reads. */
export interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number; type: string };
  };
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const grams = (quantity: number) =>
  quantity < 1000
    ? `${quantity} g`
    : `${(quantity / 1000)
        .toFixed(3)
        .replace(/\.?0+$/, '')
        .replace('.', ',')} kg`;

function itemLines(order: Order): string {
  return (order.items ?? [])
    .map(
      (item) =>
        `• ${item.unit === ProductUnit.KG ? grams(item.quantity) : `${item.quantity} ×`} ${escape(item.nameSnapshot)}`,
    )
    .join('\n');
}

/** What the customer is told when their order reaches a status, if anything. */
function customerNotice(order: Order): string | null {
  const number = `<b>#${displayNumberOf(order)}</b>`;
  switch (order.status) {
    case OrderStatus.ACCEPTED:
      return `✅ Buyurtmangiz ${number} qabul qilindi va tayyorlanmoqda.`;
    case OrderStatus.READY:
      return order.type === OrderType.TAKEAWAY
        ? `🍽 Buyurtmangiz ${number} tayyor! Olib ketishingiz mumkin.`
        : null;
    case OrderStatus.SERVED:
      return order.type === OrderType.DELIVERY
        ? `🚚 Buyurtmangiz ${number} yo'lga chiqdi.`
        : null;
    case OrderStatus.CANCELLED:
      return [
        `❌ Buyurtmangiz ${number} bekor qilindi.`,
        order.cancelReason && `Sababi: ${escape(order.cancelReason)}`,
      ]
        .filter(Boolean)
        .join('\n');
    default:
      return null;
  }
}

/**
 * One backend, many bots: each cafe's bot is looked up by id on every update, and
 * its token is only ever decrypted to talk to Telegram.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly tokenKey: Buffer;
  private summaryTimer: NodeJS.Timeout | undefined;

  constructor(
    @InjectRepository(TelegramBot)
    private readonly bots: Repository<TelegramBot>,
    @InjectRepository(Cafe) private readonly cafes: Repository<Cafe>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly api: TelegramApi,
    private readonly events: OrderEvents,
    private readonly config: ConfigService,
  ) {
    this.tokenKey = parseSecretKey(
      config.getOrThrow<string>('TELEGRAM_TOKEN_KEY'),
    );
  }

  onModuleInit(): void {
    this.events.on((event) => this.onOrderEvent(event));
    if (this.config.get('NODE_ENV') !== 'test') {
      this.summaryTimer = setInterval(() => {
        this.sendDailySummaries().catch((error: unknown) =>
          this.logger.error(`Daily summaries failed: ${String(error)}`),
        );
      }, SUMMARY_CHECK_MS);
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.summaryTimer);
  }

  /** Checks the token with Telegram, keeps it encrypted, and points the bot here. */
  async connect(cafeId: string, token: string): Promise<void> {
    const me = await this.api.getMe(token).catch((error: unknown) => {
      if (error instanceof TelegramRefused) {
        throw new BadRequestException('Telegram did not accept this token');
      }
      throw error;
    });
    const existing = await this.bots.findOneBy({ cafeId });
    const sameBot = existing?.username === me.username;
    const bot = await this.bots.save({
      ...(existing ?? {
        cafeId,
        webhookSecret: randomBytes(32).toString('hex'),
      }),
      tokenEncrypted: encryptSecret(token, this.tokenKey),
      username: me.username,
      // Another bot means other chats: the old link would not reach them.
      linkCode:
        sameBot && existing
          ? existing.linkCode
          : randomBytes(12).toString('hex'),
      notifyChatId: sameBot ? (existing?.notifyChatId ?? null) : null,
      isActive: false,
      lastError: null,
    });
    await this.setUp(bot, token);
  }

  /** Telegram stops sending updates here, and the token is forgotten. */
  async disconnect(cafeId: string): Promise<void> {
    const bot = await this.bots.findOneBy({ cafeId });
    if (!bot) return;
    await this.api
      .deleteWebhook(this.tokenOf(bot))
      .catch((error: unknown) =>
        this.logger.warn(`Could not remove a webhook: ${String(error)}`),
      );
    await this.bots.delete({ id: bot.id });
  }

  async sendTest(cafeId: string): Promise<void> {
    const bot = await this.bots.findOneBy({ cafeId });
    if (!bot) throw new NotFoundException();
    if (!bot.notifyChatId) {
      throw new ConflictException('No chat is linked to this bot yet');
    }
    const cafe = await this.cafes.findOneByOrFail({ id: cafeId });
    await this.api
      .sendMessage(
        this.tokenOf(bot),
        bot.notifyChatId,
        `✅ ${escape(cafe.name)}: bot ishlayapti. Yangi buyurtmalar shu yerga keladi.`,
      )
      .catch((error: unknown) => {
        if (error instanceof TelegramRefused) {
          throw new ConflictException(`Telegram: ${error.message}`);
        }
        throw error;
      });
  }

  /** An update from Telegram. Answered 200 unless it is not really from Telegram. */
  async handleUpdate(
    botId: string,
    secret: string | undefined,
    update: TelegramUpdate,
  ): Promise<void> {
    const bot = await this.bots.findOneBy({ id: botId });
    if (!bot || !secret || !this.sameSecret(secret, bot.webhookSecret)) {
      throw new UnauthorizedException();
    }
    const message = update.message;
    if (!message) return;
    const cafe = await this.cafes.findOneByOrFail({ id: bot.cafeId });
    const token = this.tokenOf(bot);
    const [command, payload] = (message.text ?? '').trim().split(/\s+/, 2);
    try {
      if (
        command?.startsWith('/start') &&
        payload === `staff_${bot.linkCode}`
      ) {
        await this.bots.update(
          { id: bot.id },
          { notifyChatId: String(message.chat.id) },
        );
        await this.api.sendMessage(
          token,
          message.chat.id,
          `✅ Endi bu chatga <b>${escape(cafe.name)}</b> buyurtmalari va kunlik hisobot keladi.`,
        );
        return;
      }
      // Mini App buttons only work in a private chat.
      if (message.chat.type !== 'private') return;
      await this.api.sendMessage(
        token,
        message.chat.id,
        `Assalomu alaykum! <b>${escape(cafe.name)}</b> menyusidan buyurtma bering: yetkazib beramiz yoki olib ketasiz.`,
        { openApp: { text: '🍽 Menyuni ochish', url: this.miniAppUrl(cafe) } },
      );
    } catch (error) {
      // Telegram retries anything but a 200, which would repeat the reply.
      this.logger.warn(`Could not answer an update: ${String(error)}`);
    }
  }

  /** The cafe's bot token, to check what a Mini App signed. Null without a working bot. */
  async tokenForCafe(cafeId: string): Promise<string | null> {
    const bot = await this.bots.findOneBy({ cafeId });
    return bot ? this.tokenOf(bot) : null;
  }

  /** The day's numbers, to each cafe that linked a chat, once, after closing time. */
  async sendDailySummaries(now = new Date()): Promise<void> {
    if (tashkentHour(now) < SUMMARY_HOUR) return;
    const today = tashkentDate(now);
    const due = await this.bots.find({
      where: { isActive: true, notifyChatId: Not(IsNull()) },
    });
    for (const bot of due) {
      if (!bot.notifyChatId || bot.lastSummaryOn === today) continue;
      // Marked first: a failed send is not retried every five minutes all night.
      await this.bots.update({ id: bot.id }, { lastSummaryOn: today });
      await this.api
        .sendMessage(
          this.tokenOf(bot),
          bot.notifyChatId,
          await this.summaryOf(bot.cafeId, today),
        )
        .catch((error: unknown) =>
          this.logger.warn(`Could not send a summary: ${String(error)}`),
        );
    }
  }

  private async summaryOf(cafeId: string, date: string): Promise<string> {
    const orders = await this.orders.find({
      where: { cafeId, businessDate: date },
      relations: { items: true },
    });
    const kept = orders.filter((o) => o.status !== OrderStatus.CANCELLED);
    const paid = kept.filter((o) => o.status === OrderStatus.PAID);
    const sold = new Map<string, number>();
    for (const item of kept.flatMap((o) => o.items ?? [])) {
      sold.set(
        item.nameSnapshot,
        (sold.get(item.nameSnapshot) ?? 0) +
          (item.unit === ProductUnit.KG ? 1 : item.quantity),
      );
    }
    const top = [...sold.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `• ${escape(name)}: ${count}`);
    return [
      `📊 <b>${date}</b> kunlik hisobot`,
      `Tushum: <b>${formatMoney(paid.reduce((sum, o) => sum + o.total, 0))}</b>`,
      `Buyurtmalar: ${kept.length}` +
        (orders.length > kept.length
          ? `, bekor qilingan: ${orders.length - kept.length}`
          : ''),
      ...(top.length > 0 ? ['Eng ko‘p sotilgan:', ...top] : []),
    ].join('\n');
  }

  private async onOrderEvent(event: OrderEvent): Promise<void> {
    const { order } = event;
    if (order.source !== OrderSource.TELEGRAM && !order.telegramUserId) return;
    const bot = await this.bots.findOneBy({
      cafeId: order.cafeId,
      isActive: true,
    });
    if (!bot) return;
    const token = this.tokenOf(bot);
    const number = `<b>#${displayNumberOf(order)}</b>`;

    if (event.kind === 'created') {
      if (bot.notifyChatId) {
        await this.api.sendMessage(
          token,
          bot.notifyChatId,
          [
            `🆕 Yangi buyurtma ${number}`,
            [order.customerName, order.customerPhone]
              .filter(Boolean)
              .map((part) => escape(String(part)))
              .join(', '),
            order.address && `📍 ${escape(order.address)}`,
            itemLines(order),
            `Jami: <b>${formatMoney(order.total)}</b>`,
            "Qo'ng'iroq qilib, panelda qabul qiling.",
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
      if (order.telegramUserId) {
        await this.api.sendMessage(
          token,
          order.telegramUserId,
          `📝 Buyurtmangiz ${number} yuborildi. Tez orada siz bilan bog'lanamiz.\n\n${itemLines(order)}\nJami: <b>${formatMoney(order.total)}</b>`,
        );
      }
      return;
    }
    if (!order.telegramUserId) return;
    if (event.kind === 'status') {
      const notice = customerNotice(order);
      if (notice) {
        await this.api.sendMessage(token, order.telegramUserId, notice);
      }
      return;
    }
    if (
      order.status !== OrderStatus.PAID &&
      order.status !== OrderStatus.CANCELLED
    ) {
      await this.api.sendMessage(
        token,
        order.telegramUserId,
        `✏️ Buyurtmangiz ${number} o'zgartirildi:\n\n${itemLines(order)}\nJami: <b>${formatMoney(order.total)}</b>`,
      );
    }
  }

  /** Webhook and menu button, both of which Telegram only accepts over https. */
  private async setUp(bot: TelegramBot, token: string): Promise<void> {
    const apiUrl = this.config.get<string>('PUBLIC_API_URL') ?? '';
    if (!apiUrl.startsWith('https://')) {
      await this.bots.update({ id: bot.id }, { lastError: NEEDS_HTTPS });
      return;
    }
    const cafe = await this.cafes.findOneByOrFail({ id: bot.cafeId });
    try {
      await this.api.setWebhook(
        token,
        `${apiUrl.replace(/\/+$/, '')}/api/v1/telegram/webhook/${bot.id}`,
        bot.webhookSecret,
      );
      if (this.miniAppUrl(cafe).startsWith('https://')) {
        await this.api.setMenuButton(token, 'Menyu', this.miniAppUrl(cafe));
      }
      await this.bots.update(
        { id: bot.id },
        { isActive: true, lastError: null },
      );
    } catch (error) {
      if (!(error instanceof TelegramRefused)) throw error;
      await this.bots.update(
        { id: bot.id },
        { isActive: false, lastError: error.message },
      );
    }
  }

  private miniAppUrl(cafe: Cafe): string {
    const base = this.config
      .getOrThrow<string>('MENU_APP_URL')
      .replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(cafe.slug)}?via=telegram`;
  }

  private tokenOf(bot: TelegramBot): string {
    return decryptSecret(bot.tokenEncrypted, this.tokenKey);
  }

  private sameSecret(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
