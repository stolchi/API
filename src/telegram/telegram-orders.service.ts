import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderSource } from '../common/enums.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { OrdersService } from '../orders/orders.service.js';
import type { PublicOrderDto } from '../public/public.dto.js';
import { toPublicOrderDto } from '../public/public.service.js';
import { verifyInitData } from './init-data.js';
import type { CreateTelegramOrderDto } from './telegram.dto.js';
import { TelegramService } from './telegram.service.js';

@Injectable()
export class TelegramOrdersService {
  constructor(
    @InjectRepository(Cafe) private readonly cafes: Repository<Cafe>,
    private readonly orders: OrdersService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * Only a Mini App opened from the cafe's own bot can order here: its signature is
   * checked with that bot's token. The order then waits for someone to call.
   */
  async create(
    slug: string,
    { initData, ...dto }: CreateTelegramOrderDto,
  ): Promise<PublicOrderDto> {
    const cafe = await this.cafes.findOneBy({ slug, isActive: true });
    if (!cafe) throw new NotFoundException();
    const token = await this.telegram.tokenForCafe(cafe.id);
    const user = token && verifyInitData(initData, token);
    if (!user) throw new UnauthorizedException('Open the menu from the bot');

    const order = await this.orders.create(cafe.id, {
      ...dto,
      source: OrderSource.TELEGRAM,
      tableId: null,
      customerName: dto.customerName || user.firstName || undefined,
      telegramUserId: String(user.id),
    });
    return toPublicOrderDto(order);
  }
}
