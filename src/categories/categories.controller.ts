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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCafe, RequireAny } from '../common/auth/decorators.js';
import { Permission } from '../common/permissions.js';
import {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './categories.dto.js';
import { CategoriesService } from './categories.service.js';

/** Taking or editing an order means picking from the menu. */
const MENU_READERS = [
  Permission.MENU_MANAGE,
  Permission.MENU_AVAILABILITY,
  Permission.ORDERS_CREATE,
  Permission.ORDERS_EDIT,
];

@ApiTags('categories')
@ApiBearerAuth()
@RequireAny(Permission.MENU_MANAGE)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequireAny(...MENU_READERS)
  @ApiOkResponse({ type: [CategoryDto] })
  list(@CurrentCafe() cafeId: string): Promise<CategoryDto[]> {
    return this.categories.list(cafeId);
  }

  @Get(':id')
  @RequireAny(...MENU_READERS)
  @ApiOkResponse({ type: CategoryDto })
  get(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryDto> {
    return this.categories.get(cafeId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: CategoryDto })
  create(
    @CurrentCafe() cafeId: string,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categories.create(cafeId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CategoryDto })
  update(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categories.update(cafeId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.categories.remove(cafeId, id);
  }
}
