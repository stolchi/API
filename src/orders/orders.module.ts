import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { OrderEvents } from './order-events.js';
import {
  CourierOrdersController,
  CouriersController,
  OrdersController,
} from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [RealtimeModule],
  controllers: [OrdersController, CouriersController, CourierOrdersController],
  providers: [OrdersService, OrderEvents],
  exports: [OrdersService, OrderEvents],
})
export class OrdersModule {}
