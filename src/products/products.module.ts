import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../database/entities/category.entity.js';
import { Product } from '../database/entities/product.entity.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Category]),
    StorageModule,
    RealtimeModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
