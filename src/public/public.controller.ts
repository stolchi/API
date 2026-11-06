import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/decorators.js';
import {
  CreatePublicOrderDto,
  PublicMenuDto,
  PublicOrderDto,
  PublicScreenDto,
  PublicTableDto,
} from './public.dto.js';
import { PublicService } from './public.service.js';

/** Used by customers, without an account. The cafe comes from the slug or a token. */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(private readonly publicApi: PublicService) {}

  @Get('cafes/:slug/menu')
  @ApiOkResponse({ type: PublicMenuDto })
  menu(@Param('slug') slug: string): Promise<PublicMenuDto> {
    return this.publicApi.menu(slug);
  }

  @Get('cafes/:slug/screen')
  @ApiOkResponse({ type: PublicScreenDto })
  screen(@Param('slug') slug: string): Promise<PublicScreenDto> {
    return this.publicApi.screen(slug);
  }

  @Get('tables/:qrToken')
  @ApiOkResponse({ type: PublicTableDto })
  table(@Param('qrToken') qrToken: string): Promise<PublicTableDto> {
    return this.publicApi.table(qrToken);
  }

  @Post('cafes/:slug/orders')
  @ApiCreatedResponse({ type: PublicOrderDto })
  createOrder(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicOrderDto,
  ): Promise<PublicOrderDto> {
    return this.publicApi.createOrder(slug, dto);
  }

  @Get('orders/:publicToken')
  @ApiOkResponse({ type: PublicOrderDto })
  orderStatus(
    @Param('publicToken', ParseUUIDPipe) publicToken: string,
  ): Promise<PublicOrderDto> {
    return this.publicApi.orderStatus(publicToken);
  }
}
