import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCafe, RequireAny } from '../common/auth/decorators.js';
import { Permission } from '../common/permissions.js';
import { CafeDto, SetTelegramBotDto, UpdateCafeDto } from './cafes.dto.js';
import { CafesService } from './cafes.service.js';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

@ApiTags('cafes')
@ApiBearerAuth()
@Controller('cafes/current')
export class CafesController {
  constructor(private readonly cafes: CafesService) {}

  @Get()
  @ApiOkResponse({ type: CafeDto })
  current(@CurrentCafe() cafeId: string): Promise<CafeDto> {
    return this.cafes.current(cafeId);
  }

  @Patch()
  @RequireAny(Permission.SETTINGS_MANAGE)
  @ApiOkResponse({ type: CafeDto })
  update(
    @CurrentCafe() cafeId: string,
    @Body() dto: UpdateCafeDto,
  ): Promise<CafeDto> {
    return this.cafes.update(cafeId, dto);
  }

  @Post('logo')
  @RequireAny(Permission.SETTINGS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: CafeDto })
  setLogo(
    @CurrentCafe() cafeId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<CafeDto> {
    return this.cafes.setLogo(cafeId, file);
  }

  @Put('telegram-bot')
  @RequireAny(Permission.SETTINGS_MANAGE)
  @ApiOkResponse({ type: CafeDto })
  setTelegramBot(
    @CurrentCafe() cafeId: string,
    @Body() dto: SetTelegramBotDto,
  ): Promise<CafeDto> {
    return this.cafes.setTelegramBot(cafeId, dto.token);
  }
}
