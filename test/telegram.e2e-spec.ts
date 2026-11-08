import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  decryptSecret,
  parseSecretKey,
} from '../src/common/crypto/secret-box.js';
import { Role } from '../src/common/enums.js';
import { TelegramBot } from '../src/database/entities/index.js';
import { signInitData } from '../src/telegram/init-data.js';
import { TelegramApi } from '../src/telegram/telegram-api.js';
import { TelegramService } from '../src/telegram/telegram.service.js';
import type { FakeTelegramApi } from './fake-telegram.js';
import {
  API,
  createCatalog,
  createTestApp,
  loginAs,
  registerCafe,
  resetDatabase,
  type Catalog,
  type RegisteredCafe,
} from './utils.js';

const TOKEN_A = '111111:AAFabcdefghijklmnopqrstuvwxyz0123456';
const TOKEN_B = '222222:BBFabcdefghijklmnopqrstuvwxyz0123456';
const OWNER_CHAT = 9001;
const CUSTOMER = 4242;

/** Notifications go out after the response: wait for them a little. */
async function eventually(check: () => void, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

describe('Telegram bot (e2e)', () => {
  let app: NestExpressApplication;
  let fake: FakeTelegramApi;
  let cafeA: RegisteredCafe;
  let cafeB: RegisteredCafe;
  let a: Catalog;
  let slug: string;

  const as = (token: string) => ({
    put: (path: string) =>
      request(app.getHttpServer())
        .put(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      request(app.getHttpServer())
        .post(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    patch: (path: string) =>
      request(app.getHttpServer())
        .patch(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    get: (path: string) =>
      request(app.getHttpServer())
        .get(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    delete: (path: string) =>
      request(app.getHttpServer())
        .delete(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
  });
  const botOf = (cafeId: string) =>
    app.get(DataSource).manager.findOneByOrFail(TelegramBot, { cafeId });
  const connect = (token = TOKEN_A, cafe = cafeA) =>
    as(cafe.token).put('/cafes/current/telegram-bot').send({ token });

  const webhook = (bot: TelegramBot, update: object, secret?: string) =>
    request(app.getHttpServer())
      .post(`${API}/telegram/webhook/${bot.id}`)
      .set('X-Telegram-Bot-Api-Secret-Token', secret ?? bot.webhookSecret)
      .send(update);
  const say = (text: string, chat = { id: CUSTOMER, type: 'private' }) => ({
    update_id: 1,
    message: { message_id: 1, text, chat },
  });

  const initData = (token = TOKEN_A, userId = CUSTOMER) =>
    signInitData(
      {
        auth_date: String(Math.floor(Date.now() / 1000)),
        user: JSON.stringify({ id: userId, first_name: 'Aziz' }),
      },
      token,
    );
  const miniAppOrder = (body: object) =>
    request(app.getHttpServer())
      .post(`${API}/public/cafes/${slug}/telegram-orders`)
      .send({
        type: 'DELIVERY',
        customerPhone: '+998901112233',
        address: 'Chilonzor 9',
        items: [{ productId: a.osh.id, quantity: 2 }],
        initData: initData(),
        ...body,
      });

  beforeAll(async () => {
    app = await createTestApp();
    fake = app.get(TelegramApi) as unknown as FakeTelegramApi;
  });
  beforeEach(async () => {
    await resetDatabase(app);
    fake.reset();
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
    a = await createCatalog(app, cafeA.token);
    slug = (await as(cafeA.token).get('/cafes/current')).body.slug;
    await as(cafeA.token)
      .patch('/cafes/current')
      .send({ orderTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] })
      .expect(200);
  });
  afterAll(() => app.close());

  describe('connecting', () => {
    it('checks the token, keeps it encrypted, and points the bot here', async () => {
      const { body } = await connect().expect(200);
      const bot = await botOf(cafeA.cafeId);
      expect(body.telegramBot).toEqual({
        username: 'bot111111_bot',
        isActive: true,
        error: null,
        notificationsLinked: false,
        linkUrl: `https://t.me/bot111111_bot?start=staff_${bot.linkCode}`,
      });
      expect(JSON.stringify(body)).not.toContain(TOKEN_A);
      expect(bot.tokenEncrypted).not.toContain(TOKEN_A);
      const key = parseSecretKey(process.env.TELEGRAM_TOKEN_KEY ?? '');
      expect(decryptSecret(bot.tokenEncrypted, key)).toBe(TOKEN_A);

      expect(fake.webhooks).toEqual([
        {
          token: TOKEN_A,
          url: `https://api.stolchi.test/api/v1/telegram/webhook/${bot.id}`,
          secret: bot.webhookSecret,
        },
      ]);
      expect(fake.menuButtons).toEqual([
        {
          token: TOKEN_A,
          url: `https://menu.stolchi.test/${slug}?via=telegram`,
        },
      ]);
    });

    it('refuses a token Telegram does not know, and keeps nothing', async () => {
      await connect('333333:REVOKEDabcdefghijklmnopqrstuvwxyz0123').expect(400);
      await connect('not-a-token').expect(400);
      const { body } = await as(cafeA.token).get('/cafes/current').expect(200);
      expect(body.telegramBot).toBeNull();
    });

    it("shows Telegram's reason when the webhook is refused", async () => {
      fake.webhookError = 'Bad Request: bad webhook';
      const { body } = await connect().expect(200);
      expect(body.telegramBot).toMatchObject({
        isActive: false,
        error: 'Bad Request: bad webhook',
      });
    });

    it('keeps the webhook secret for the same bot, and forgets its chat for another', async () => {
      await connect().expect(200);
      const first = await botOf(cafeA.cafeId);
      await webhook(first, say(`/start staff_${first.linkCode}`)).expect(200);

      await connect().expect(200);
      const again = await botOf(cafeA.cafeId);
      expect(again.webhookSecret).toBe(first.webhookSecret);
      expect(again.notifyChatId).toBe(String(CUSTOMER));

      await connect(TOKEN_B).expect(200);
      const other = await botOf(cafeA.cafeId);
      expect(other.username).toBe('bot222222_bot');
      expect(other.notifyChatId).toBeNull();
      expect(other.linkCode).not.toBe(first.linkCode);
    });

    it('is for those who manage settings, and only touches their own cafe', async () => {
      const cashier = await loginAs(app, Role.CASHIER, cafeA.cafeId);
      await as(cashier)
        .put('/cafes/current/telegram-bot')
        .send({ token: TOKEN_A })
        .expect(403);
      await connect().expect(200);
      const { body } = await as(cafeB.token).get('/cafes/current').expect(200);
      expect(body.telegramBot).toBeNull();
    });

    it('disconnects: Telegram stops calling and the token is gone', async () => {
      await connect().expect(200);
      const { body } = await as(cafeA.token)
        .delete('/cafes/current/telegram-bot')
        .expect(200);
      expect(body.telegramBot).toBeNull();
      expect(fake.deleted).toEqual([TOKEN_A]);
    });
  });

  describe('updates from Telegram', () => {
    it('refuses an update without the secret, or for an unknown bot', async () => {
      await connect().expect(200);
      const bot = await botOf(cafeA.cafeId);
      await webhook(bot, say('/start'), 'wrong').expect(401);
      await request(app.getHttpServer())
        .post(`${API}/telegram/webhook/${bot.id}`)
        .send(say('/start'))
        .expect(401);
      await request(app.getHttpServer())
        .post(`${API}/telegram/webhook/00000000-0000-4000-8000-000000000000`)
        .set('X-Telegram-Bot-Api-Secret-Token', bot.webhookSecret)
        .send(say('/start'))
        .expect(401);
      expect(fake.sent).toEqual([]);
    });

    it('answers /start with a button that opens the menu', async () => {
      await connect().expect(200);
      await webhook(await botOf(cafeA.cafeId), say('/start')).expect(200);
      expect(fake.sent).toEqual([
        expect.objectContaining({
          chatId: String(CUSTOMER),
          openApp: {
            text: expect.any(String),
            url: `https://menu.stolchi.test/${slug}?via=telegram`,
          },
        }),
      ]);
    });

    it('links a staff group with the secret link, and stays quiet in groups otherwise', async () => {
      await connect().expect(200);
      const bot = await botOf(cafeA.cafeId);
      const group = { id: -100123, type: 'supergroup' };
      await webhook(bot, say('/start', group)).expect(200);
      expect(fake.sent).toEqual([]);

      await webhook(bot, say('/start staff_wrong', group)).expect(200);
      expect((await botOf(cafeA.cafeId)).notifyChatId).toBeNull();

      await webhook(bot, say(`/start staff_${bot.linkCode}`, group)).expect(
        200,
      );
      expect((await botOf(cafeA.cafeId)).notifyChatId).toBe('-100123');
      const { body } = await as(cafeA.token).get('/cafes/current');
      expect(body.telegramBot.notificationsLinked).toBe(true);
    });

    it('sends a test message once a chat is linked', async () => {
      await connect().expect(200);
      await as(cafeA.token)
        .post('/cafes/current/telegram-bot/test')
        .expect(409);
      const bot = await botOf(cafeA.cafeId);
      await webhook(
        bot,
        say(`/start staff_${bot.linkCode}`, {
          id: OWNER_CHAT,
          type: 'private',
        }),
      ).expect(200);
      fake.reset();
      await as(cafeA.token)
        .post('/cafes/current/telegram-bot/test')
        .expect(204);
      expect(fake.sent).toEqual([
        expect.objectContaining({ chatId: String(OWNER_CHAT) }),
      ]);
    });
  });

  describe('orders from the Mini App', () => {
    async function linkOwner() {
      await connect().expect(200);
      const bot = await botOf(cafeA.cafeId);
      await webhook(
        bot,
        say(`/start staff_${bot.linkCode}`, {
          id: OWNER_CHAT,
          type: 'private',
        }),
      ).expect(200);
      fake.reset();
    }

    it('takes a signed order, which waits for a call, and tells both sides', async () => {
      await linkOwner();
      const { body } = await miniAppOrder({}).expect(201);
      expect(body).toMatchObject({
        status: 'NEW',
        displayNumber: 'D-1',
        type: 'DELIVERY',
      });

      const { body: list } = await as(cafeA.token).get('/orders?active=true');
      expect(list.items[0]).toMatchObject({
        source: 'TELEGRAM',
        customerName: 'Aziz',
        address: 'Chilonzor 9',
      });

      await eventually(() => {
        const owner = fake.sent.find((m) => m.chatId === String(OWNER_CHAT));
        const customer = fake.sent.find((m) => m.chatId === String(CUSTOMER));
        expect(owner?.text).toContain('#D-1');
        expect(owner?.text).toContain('+998901112233');
        expect(owner?.text).toContain('Chilonzor 9');
        expect(customer?.text).toContain('#D-1');
      });
    });

    it('refuses what the bot did not sign', async () => {
      await connect().expect(200);
      await miniAppOrder({
        initData: 'user=%7B%22id%22%3A1%7D&hash=00',
      }).expect(401);
      await miniAppOrder({ initData: initData(TOKEN_B) }).expect(401);
      // Cafe B has no bot, so nothing it receives can be checked.
      await request(app.getHttpServer())
        .post(
          `${API}/public/cafes/${(await as(cafeB.token).get('/cafes/current')).body.slug}/telegram-orders`,
        )
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: a.osh.id, quantity: 1 }],
          initData: initData(),
        })
        .expect(401);
    });

    it('needs an address for a delivery, and no table orders', async () => {
      await connect().expect(200);
      await miniAppOrder({ address: '' }).expect(400);
      await miniAppOrder({ type: 'DINE_IN' }).expect(400);
      const { body } = await miniAppOrder({
        type: 'TAKEAWAY',
        address: undefined,
        location: undefined,
      }).expect(201);
      expect(body).toMatchObject({ status: 'NEW', type: 'TAKEAWAY' });
    });

    it('keeps the customer told: accepted, changed, on the way, cancelled with a reason', async () => {
      await linkOwner();
      const { body: placed } = await miniAppOrder({}).expect(201);
      const { body: list } = await as(cafeA.token).get('/orders?active=true');
      const order = list.items[0];
      await eventually(() => expect(fake.sent).toHaveLength(2));
      fake.reset();
      const toCustomer = () =>
        fake.sent
          .filter((m) => m.chatId === String(CUSTOMER))
          .map((m) => m.text);

      await as(cafeA.token)
        .put(`/orders/${order.id}/items`)
        .send({ items: [{ id: order.items[0].id, quantity: 1 }] })
        .expect(200);
      await eventually(() =>
        expect(toCustomer().at(-1)).toContain("o'zgartirildi"),
      );

      await as(cafeA.token)
        .patch(`/orders/${order.id}/status`)
        .send({ status: 'ACCEPTED' })
        .expect(200);
      await eventually(() =>
        expect(toCustomer().at(-1)).toContain('qabul qilindi'),
      );

      // Cooking is not worth a message.
      await as(cafeA.token)
        .patch(`/orders/${order.id}/status`)
        .send({ status: 'COOKING' })
        .expect(200);
      await as(cafeA.token)
        .patch(`/orders/${order.id}/status`)
        .send({ status: 'READY' })
        .expect(200);
      await as(cafeA.token)
        .patch(`/orders/${order.id}/status`)
        .send({ status: 'SERVED' })
        .expect(200);
      await eventually(() => expect(toCustomer().at(-1)).toContain("yo'lga"));
      expect(toCustomer()).toHaveLength(3);

      const { body: second } = await miniAppOrder({}).expect(201);
      fake.reset();
      const { body: again } = await as(cafeA.token).get('/orders?active=true');
      const waiting = again.items.find(
        (o: { publicToken: string }) => o.publicToken === second.publicToken,
      );
      await as(cafeA.token)
        .post(`/orders/${waiting.id}/cancel`)
        .send({ reason: 'Osh tugagan' })
        .expect(200);
      await eventually(() =>
        expect(toCustomer().at(-1)).toContain('Sababi: Osh tugagan'),
      );
      expect(placed.publicToken).not.toBe(second.publicToken);
    });

    it('tells the customer when a courier leaves, and how long they will be', async () => {
      await linkOwner();
      await miniAppOrder({}).expect(201);
      const { body: list } = await as(cafeA.token).get('/orders?active=true');
      const order = list.items[0];
      await as(cafeA.token)
        .patch(`/orders/${order.id}/status`)
        .send({ status: 'ACCEPTED' })
        .expect(200);
      const courier = await loginAs(app, Role.COURIER, cafeA.cafeId);
      await as(courier).post(`/courier/orders/${order.id}/claim`).expect(200);
      for (const status of ['COOKING', 'READY']) {
        await as(cafeA.token)
          .patch(`/orders/${order.id}/status`)
          .send({ status })
          .expect(200);
      }
      fake.reset();
      await as(courier)
        .post(`/courier/orders/${order.id}/pick-up`)
        .send({ etaMinutes: 25 })
        .expect(200);
      await eventually(() => {
        const message = fake.sent.find((m) => m.chatId === String(CUSTOMER));
        expect(message?.text).toContain('Kuryer buyurtmangiz');
        expect(message?.text).toMatch(/2[45] daqiqada/);
      });
    });

    it('says nothing about orders from the till', async () => {
      await linkOwner();
      await as(cafeA.token)
        .post('/orders')
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: a.osh.id, quantity: 1 }],
        })
        .expect(201);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fake.sent).toEqual([]);
    });
  });

  describe('daily summary', () => {
    it('goes to the linked chat once, after closing time', async () => {
      await connect().expect(200);
      const bot = await botOf(cafeA.cafeId);
      await webhook(
        bot,
        say(`/start staff_${bot.linkCode}`, {
          id: OWNER_CHAT,
          type: 'private',
        }),
      ).expect(200);
      const { body: order } = await as(cafeA.token)
        .post('/orders')
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: a.osh.id, quantity: 2 }],
        })
        .expect(201);
      for (const status of ['COOKING', 'READY', 'SERVED']) {
        await as(cafeA.token)
          .patch(`/orders/${order.id}/status`)
          .send({ status })
          .expect(200);
      }
      await as(cafeA.token)
        .post(`/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: order.total })
        .expect(201);
      await as(cafeA.token).post(`/orders/${order.id}/close`).expect(200);
      fake.reset();

      const summaries = app.get(TelegramService);
      // 22:30 and 23:30 in Tashkent (UTC+5), today.
      const today = new Date();
      const at = (hour: number) => {
        const day = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Tashkent',
        }).format(today);
        return new Date(`${day}T${String(hour).padStart(2, '0')}:30:00+05:00`);
      };
      await summaries.sendDailySummaries(at(22));
      expect(fake.sent).toEqual([]);
      await summaries.sendDailySummaries(at(23));
      await summaries.sendDailySummaries(at(23));
      expect(fake.sent).toHaveLength(1);
      expect(fake.sent[0]).toMatchObject({ chatId: String(OWNER_CHAT) });
      expect(fake.sent[0].text).toContain("90 000 so'm");
      expect(fake.sent[0].text).toContain('Osh: 2');
    });
  });
});
