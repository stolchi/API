import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CafesModule } from './cafes/cafes.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { validateEnv } from './config/env.validation.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { GeoModule } from './geo/geo.module.js';
import { buildDataSourceOptions } from './database/database.config.js';
import { OrdersModule } from './orders/orders.module.js';
import { ProductsModule } from './products/products.module.js';
import { PublicModule } from './public/public.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { StaffModule } from './staff/staff.module.js';
import { TablesModule } from './tables/tables.module.js';
import { TelegramModule } from './telegram/telegram.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildDataSourceOptions({
          DATABASE_HOST: config.get('DATABASE_HOST'),
          DATABASE_PORT: config.get('DATABASE_PORT'),
          DATABASE_USER: config.get('DATABASE_USER'),
          DATABASE_PASSWORD: config.get('DATABASE_PASSWORD'),
          DATABASE_NAME: config.get('DATABASE_NAME'),
        }),
    }),
    AuthModule,
    CafesModule,
    RealtimeModule,
    CategoriesModule,
    ProductsModule,
    TablesModule,
    OrdersModule,
    StaffModule,
    PublicModule,
    DashboardModule,
    TelegramModule,
    GeoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
