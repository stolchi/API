import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CafeTable } from '../database/entities/cafe-table.entity.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { TablesController } from './tables.controller.js';
import { TablesService } from './tables.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CafeTable, Cafe])],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
