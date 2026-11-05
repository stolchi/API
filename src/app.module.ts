import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CafesController } from './cafes/cafes.controller.js';
import { CategoriesController } from './categories/categories.controller.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { validateEnv } from './config/env.validation.js';
import { buildDataSourceOptions } from './database/database.config.js';
import { Cafe, Category } from './database/entities/index.js';

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
    TypeOrmModule.forFeature([Cafe, Category]),
    AuthModule,
  ],
  controllers: [AppController, CafesController, CategoriesController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
