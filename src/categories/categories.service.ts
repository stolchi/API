import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { isForeignKeyViolation } from '../common/validation.js';
import { Category } from '../database/entities/category.entity.js';
import type {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './categories.dto.js';

const toDto = ({ id, name, sortOrder, isActive }: Category): CategoryDto => ({
  id,
  name,
  sortOrder,
  isActive,
});

@Injectable()
export class CategoriesService {
  private readonly categories: TenantRepository<Category>;

  constructor(@InjectRepository(Category) repository: Repository<Category>) {
    this.categories = new TenantRepository(repository);
  }

  async list(cafeId: string): Promise<CategoryDto[]> {
    const rows = await this.categories
      .forCafe(cafeId)
      .find({ order: { sortOrder: 'ASC', name: 'ASC' } });
    return rows.map(toDto);
  }

  async get(cafeId: string, id: string): Promise<CategoryDto> {
    return toDto(await this.load(cafeId, id));
  }

  async create(cafeId: string, dto: CreateCategoryDto): Promise<CategoryDto> {
    return toDto(await this.categories.forCafe(cafeId).create({ ...dto }));
  }

  async update(
    cafeId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    await this.load(cafeId, id);
    await this.categories.forCafe(cafeId).update({ id }, { ...dto });
    return toDto(await this.load(cafeId, id));
  }

  async remove(cafeId: string, id: string): Promise<void> {
    await this.load(cafeId, id);
    try {
      await this.categories.forCafe(cafeId).delete({ id });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Move or delete the products in this category first',
        );
      }
      throw error;
    }
  }

  private async load(cafeId: string, id: string): Promise<Category> {
    const row = await this.categories
      .forCafe(cafeId)
      .findOne({ where: { id } });
    // Another cafe's id looks exactly like one that does not exist.
    if (!row) throw new NotFoundException();
    return row;
  }
}
