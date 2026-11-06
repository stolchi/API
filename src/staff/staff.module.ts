import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [RealtimeModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
