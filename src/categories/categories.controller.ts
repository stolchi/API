import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentCafe, Roles } from '../common/auth/decorators.js';
import { Role } from '../common/enums.js';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { Category } from '../database/entities/category.entity.js';

class CategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;
}

const toDto = ({ id, name, sortOrder, isActive }: Category): CategoryDto => ({
  id,
  name,
  sortOrder,
  isActive,
});

/** Read-only for now; the full CRUD arrives in Phase 2. */
@ApiTags('categories')
@ApiBearerAuth()
@Roles(Role.OWNER, Role.CASHIER, Role.WAITER)
@Controller('categories')
export class CategoriesController {
  private readonly categories: TenantRepository<Category>;

  constructor(@InjectRepository(Category) repository: Repository<Category>) {
    this.categories = new TenantRepository(repository);
  }

  @Get()
  @ApiOkResponse({ type: [CategoryDto] })
  async list(@CurrentCafe() cafeId: string): Promise<CategoryDto[]> {
    const rows = await this.categories
      .forCafe(cafeId)
      .find({ order: { sortOrder: 'ASC', name: 'ASC' } });
    return rows.map(toDto);
  }

  @Get(':id')
  @ApiOkResponse({ type: CategoryDto })
  async get(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryDto> {
    const row = await this.categories
      .forCafe(cafeId)
      .findOne({ where: { id } });
    // Another cafe's id looks exactly like one that does not exist.
    if (!row) throw new NotFoundException();
    return toDto(row);
  }
}
