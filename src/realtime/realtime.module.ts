import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Order } from '../database/entities/order.entity.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Order])],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
