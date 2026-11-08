import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { NetworkOrdersService } from './network-orders.service.js';
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
  providers: [OrdersService, OrderEvents, NetworkOrdersService],
  exports: [OrdersService, OrderEvents, NetworkOrdersService],
})
export class OrdersModule {}
