import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCafe, Roles } from '../common/auth/decorators.js';
import { Role } from '../common/enums.js';
import {
  CreateTableDto,
  TableDto,
  TableQrQueryDto,
  UpdateTableDto,
} from './tables.dto.js';
import { TablesService } from './tables.service.js';

@ApiTags('tables')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @Roles(Role.OWNER, Role.CASHIER, Role.WAITER)
  @ApiOkResponse({ type: [TableDto] })
  list(@CurrentCafe() cafeId: string): Promise<TableDto[]> {
    return this.tables.list(cafeId);
  }

  // Declared before ':id' so that the path is not read as an id.
  @Get('qr.pdf')
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'A4 document with the QR codes of all tables.',
    schema: { type: 'string', format: 'binary' },
  })
  async qrPdf(@CurrentCafe() cafeId: string): Promise<StreamableFile> {
    return new StreamableFile(await this.tables.qrPdf(cafeId), {
      type: 'application/pdf',
      disposition: 'attachment; filename="stolchi-qr.pdf"',
    });
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.CASHIER, Role.WAITER)
  @ApiOkResponse({ type: TableDto })
  get(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TableDto> {
    return this.tables.get(cafeId, id);
  }

  @Get(':id/qr')
  @ApiProduces('image/png', 'image/svg+xml')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async qr(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() { format = 'png' }: TableQrQueryDto,
  ): Promise<StreamableFile> {
    return format === 'svg'
      ? new StreamableFile(Buffer.from(await this.tables.qrSvg(cafeId, id)), {
          type: 'image/svg+xml',
          disposition: 'attachment; filename="stolchi-qr.svg"',
        })
      : new StreamableFile(await this.tables.qrPng(cafeId, id), {
          type: 'image/png',
          disposition: 'attachment; filename="stolchi-qr.png"',
        });
  }

  @Post()
  @ApiCreatedResponse({ type: TableDto })
  create(
    @CurrentCafe() cafeId: string,
    @Body() dto: CreateTableDto,
  ): Promise<TableDto> {
    return this.tables.create(cafeId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: TableDto })
  update(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ): Promise<TableDto> {
    return this.tables.update(cafeId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tables.remove(cafeId, id);
  }
}
