import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { User } from '../database/entities/user.entity.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Cafe, Order, User])],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
