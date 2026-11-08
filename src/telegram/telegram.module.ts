import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CafesModule } from '../cafes/cafes.module.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { TelegramBot } from '../database/entities/telegram-bot.entity.js';
import { OrdersModule } from '../orders/orders.module.js';
import { TelegramApi } from './telegram-api.js';
import {
  TelegramOrdersController,
  TelegramSettingsController,
  TelegramWebhookController,
} from './telegram.controller.js';
import { TelegramOrdersService } from './telegram-orders.service.js';
import { TelegramService } from './telegram.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramBot, Cafe, Order]),
    CafesModule,
    OrdersModule,
  ],
  controllers: [
    TelegramSettingsController,
    TelegramWebhookController,
    TelegramOrdersController,
  ],
  providers: [TelegramApi, TelegramService, TelegramOrdersService],
})
export class TelegramModule {}
