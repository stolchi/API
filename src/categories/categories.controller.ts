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
import { CurrentCafe, Roles } from '../common/auth/decorators.js';
import { Role } from '../common/enums.js';
import {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './categories.dto.js';
import { CategoriesService } from './categories.service.js';

@ApiTags('categories')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Roles(Role.OWNER, Role.CASHIER, Role.WAITER)
  @ApiOkResponse({ type: [CategoryDto] })
  list(@CurrentCafe() cafeId: string): Promise<CategoryDto[]> {
    return this.categories.list(cafeId);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.CASHIER, Role.WAITER)
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
