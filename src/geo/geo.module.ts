import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller.js';
import { GeoService } from './geo.service.js';
import { Nominatim } from './nominatim.js';

@Module({
  controllers: [GeoController],
  providers: [Nominatim, GeoService],
})
export class GeoModule {}
