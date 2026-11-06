import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cafe } from '../database/entities/cafe.entity.js';
import { TelegramBot } from '../database/entities/telegram-bot.entity.js';
import { StorageModule } from '../storage/storage.module.js';
import { CafesController } from './cafes.controller.js';
import { CafesService } from './cafes.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Cafe, TelegramBot]), StorageModule],
  controllers: [CafesController],
  providers: [CafesService],
})
export class CafesModule {}
