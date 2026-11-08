import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCafe, Public, RequireAny } from '../common/auth/decorators.js';
import { Permission } from '../common/permissions.js';
import { CafeDto } from '../cafes/cafes.dto.js';
import { CafesService } from '../cafes/cafes.service.js';
import { PublicOrderDto } from '../public/public.dto.js';
import { CreateTelegramOrderDto, SetTelegramBotDto } from './telegram.dto.js';
import { TelegramOrdersService } from './telegram-orders.service.js';
import { TelegramService, type TelegramUpdate } from './telegram.service.js';

@ApiTags('cafes')
@ApiBearerAuth()
@RequireAny(Permission.SETTINGS_MANAGE)
@Controller('cafes/current/telegram-bot')
export class TelegramSettingsController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly cafes: CafesService,
  ) {}

  @Put()
  @ApiOkResponse({ type: CafeDto })
  async connect(
    @CurrentCafe() cafeId: string,
    @Body() dto: SetTelegramBotDto,
  ): Promise<CafeDto> {
    await this.telegram.connect(cafeId, dto.token);
    return this.cafes.current(cafeId);
  }

  @Delete()
  @ApiOkResponse({ type: CafeDto })
  async disconnect(@CurrentCafe() cafeId: string): Promise<CafeDto> {
    await this.telegram.disconnect(cafeId);
    return this.cafes.current(cafeId);
  }

  @Post('test')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  sendTest(@CurrentCafe() cafeId: string): Promise<void> {
    return this.telegram.sendTest(cafeId);
  }
}

/** Telegram calls this; the secret header proves it. */
@Public()
@Controller('telegram/webhook')
export class TelegramWebhookController {
  constructor(private readonly telegram: TelegramService) {}

  @Post(':botId')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  handle(
    @Param('botId', ParseUUIDPipe) botId: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramUpdate,
  ): Promise<void> {
    return this.telegram.handleUpdate(botId, secret, update);
  }
}

@ApiTags('public')
@Public()
@Controller('public/cafes')
export class TelegramOrdersController {
  constructor(private readonly orders: TelegramOrdersService) {}

  @Post(':slug/telegram-orders')
  @ApiCreatedResponse({ type: PublicOrderDto })
  create(
    @Param('slug') slug: string,
    @Body() dto: CreateTelegramOrderDto,
  ): Promise<PublicOrderDto> {
    return this.orders.create(slug, dto);
  }
}
