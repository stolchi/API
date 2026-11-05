import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CafeTable } from '../database/entities/cafe-table.entity.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { Category } from '../database/entities/category.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { Product } from '../database/entities/product.entity.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PublicController } from './public.controller.js';
import { PublicService } from './public.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cafe, CafeTable, Category, Order, Product]),
    OrdersModule,
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
