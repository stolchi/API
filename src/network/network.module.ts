import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { NetworkCourierSession } from '../database/entities/network-courier-session.entity.js';
import { NetworkCourier } from '../database/entities/network-courier.entity.js';
import { OrdersModule } from '../orders/orders.module.js';
import { NetworkAuthController } from './network-auth.controller.js';
import { NetworkAuthService } from './network-auth.service.js';
import { NetworkCourierGuard } from './network-courier.guard.js';
import { NetworkOrdersController } from './network-orders.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([NetworkCourier, NetworkCourierSession]),
    AuthModule,
    OrdersModule,
  ],
  controllers: [NetworkAuthController, NetworkOrdersController],
  providers: [NetworkAuthService, NetworkCourierGuard],
})
export class NetworkModule {}
