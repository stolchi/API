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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCafe, RequireAny } from '../common/auth/decorators.js';
import { Permission } from '../common/permissions.js';
import {
  CreateProductDto,
  ListProductsQueryDto,
  ProductDto,
  SetAvailabilityDto,
  UpdateProductDto,
} from './products.dto.js';
import { ProductsService } from './products.service.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Taking or editing an order means picking from the menu. */
const MENU_READERS = [
  Permission.MENU_MANAGE,
  Permission.MENU_AVAILABILITY,
  Permission.ORDERS_CREATE,
  Permission.ORDERS_EDIT,
];

@ApiTags('products')
@ApiBearerAuth()
@RequireAny(Permission.MENU_MANAGE)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequireAny(...MENU_READERS)
  @ApiOkResponse({ type: [ProductDto] })
  list(
    @CurrentCafe() cafeId: string,
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductDto[]> {
    return this.products.list(cafeId, query);
  }

  @Get(':id')
  @RequireAny(...MENU_READERS)
  @ApiOkResponse({ type: ProductDto })
  get(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductDto> {
    return this.products.get(cafeId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: ProductDto })
  create(
    @CurrentCafe() cafeId: string,
    @Body() dto: CreateProductDto,
  ): Promise<ProductDto> {
    return this.products.create(cafeId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ProductDto })
  update(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDto> {
    return this.products.update(cafeId, id, dto);
  }

  @Patch(':id/availability')
  @RequireAny(Permission.MENU_MANAGE, Permission.MENU_AVAILABILITY)
  @ApiOkResponse({ type: ProductDto })
  setAvailability(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAvailabilityDto,
  ): Promise<ProductDto> {
    return this.products.setAvailability(cafeId, id, dto.isAvailable);
  }

  @Post(':id/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: ProductDto })
  setImage(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<ProductDto> {
    return this.products.setImage(cafeId, id, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.products.remove(cafeId, id);
  }
}
