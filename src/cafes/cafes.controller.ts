import { Controller, Get, NotFoundException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentCafe } from '../common/auth/decorators.js';
import { Cafe } from '../database/entities/cafe.entity.js';

class CafeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  currency!: string;
}

@ApiTags('cafes')
@ApiBearerAuth()
@Controller('cafes')
export class CafesController {
  constructor(
    @InjectRepository(Cafe) private readonly cafes: Repository<Cafe>,
  ) {}

  @Get('current')
  @ApiOkResponse({ type: CafeDto })
  async current(@CurrentCafe() cafeId: string): Promise<CafeDto> {
    const cafe = await this.cafes.findOneBy({ id: cafeId });
    if (!cafe) throw new NotFoundException();
    return {
      id: cafe.id,
      name: cafe.name,
      slug: cafe.slug,
      currency: cafe.currency,
    };
  }
}
