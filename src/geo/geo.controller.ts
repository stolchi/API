import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { RequireAny } from '../common/auth/decorators.js';
import { Permission } from '../common/permissions.js';
import { GeoService } from './geo.service.js';

export class SearchPlacesQueryDto {
  @ApiProperty({ example: "Farg'ona, Mustaqillik", minLength: 3 })
  @IsString()
  @Length(3, 200)
  q!: string;

  @ApiPropertyOptional({ description: 'Prefer places around this point.' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;
}

export class PlaceDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;
}

@ApiTags('geo')
@ApiBearerAuth()
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  /** For staff setting a delivery point: who takes or edits orders. */
  @Get('search')
  @RequireAny(Permission.ORDERS_CREATE, Permission.ORDERS_EDIT)
  @ApiOkResponse({ type: [PlaceDto] })
  search(@Query() { q, latitude, longitude }: SearchPlacesQueryDto) {
    return this.geo.search(
      q,
      latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : undefined,
    );
  }
}
