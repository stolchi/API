import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { Category } from '../database/entities/category.entity.js';
import { Product } from '../database/entities/product.entity.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { detectImageType } from '../storage/image-type.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  CreateProductDto,
  ListProductsQueryDto,
  ProductDto,
  UpdateProductDto,
} from './products.dto.js';

export const toProductDto = (product: Product): ProductDto => ({
  id: product.id,
  categoryId: product.categoryId,
  name: product.name,
  description: product.description,
  price: product.price,
  imageUrl: product.imageUrl,
  isAvailable: product.isAvailable,
  sortOrder: product.sortOrder,
});

@Injectable()
export class ProductsService {
  private readonly products: TenantRepository<Product>;
  private readonly categories: TenantRepository<Category>;

  constructor(
    @InjectRepository(Product) products: Repository<Product>,
    @InjectRepository(Category) categories: Repository<Category>,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeGateway,
  ) {
    this.products = new TenantRepository(products);
    this.categories = new TenantRepository(categories);
  }

  async list(
    cafeId: string,
    query: ListProductsQueryDto,
  ): Promise<ProductDto[]> {
    const rows = await this.products.forCafe(cafeId).find({
      where: query.categoryId ? { categoryId: query.categoryId } : {},
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return rows.map(toProductDto);
  }

  async get(cafeId: string, id: string): Promise<ProductDto> {
    return toProductDto(await this.load(cafeId, id));
  }

  async create(cafeId: string, dto: CreateProductDto): Promise<ProductDto> {
    await this.assertCategory(cafeId, dto.categoryId);
    return toProductDto(await this.products.forCafe(cafeId).create({ ...dto }));
  }

  async update(
    cafeId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductDto> {
    const before = await this.load(cafeId, id);
    if (dto.categoryId) await this.assertCategory(cafeId, dto.categoryId);
    await this.products.forCafe(cafeId).update({ id }, { ...dto });
    const after = await this.load(cafeId, id);
    if (before.isAvailable !== after.isAvailable) {
      this.announceAvailability(after);
    }
    return toProductDto(after);
  }

  async setAvailability(
    cafeId: string,
    id: string,
    isAvailable: boolean,
  ): Promise<ProductDto> {
    await this.load(cafeId, id);
    await this.products.forCafe(cafeId).update({ id }, { isAvailable });
    const product = await this.load(cafeId, id);
    this.announceAvailability(product);
    return toProductDto(product);
  }

  async setImage(
    cafeId: string,
    id: string,
    file: { buffer: Buffer } | undefined,
  ): Promise<ProductDto> {
    if (!file) throw new BadRequestException('file is required');
    const extension = detectImageType(file.buffer);
    if (!extension) {
      throw new BadRequestException(
        'Only JPEG, PNG and WebP images are allowed',
      );
    }

    const before = await this.load(cafeId, id);
    const imageUrl = await this.storage.save({
      buffer: file.buffer,
      extension,
    });
    await this.products.forCafe(cafeId).update({ id }, { imageUrl });
    if (before.imageUrl) await this.storage.remove(before.imageUrl);
    return toProductDto(await this.load(cafeId, id));
  }

  async remove(cafeId: string, id: string): Promise<void> {
    const product = await this.load(cafeId, id);
    await this.products.forCafe(cafeId).delete({ id });
    if (product.imageUrl) await this.storage.remove(product.imageUrl);
  }

  private announceAvailability(product: Product): void {
    this.realtime.emitProductAvailabilityChanged(product.cafeId, {
      id: product.id,
      isAvailable: product.isAvailable,
    });
  }

  /** Blocks attaching a product to a category that belongs to another cafe. */
  private async assertCategory(
    cafeId: string,
    categoryId: string,
  ): Promise<void> {
    const count = await this.categories
      .forCafe(cafeId)
      .count({ id: categoryId });
    if (count === 0) throw new BadRequestException('Unknown category');
  }

  private async load(cafeId: string, id: string): Promise<Product> {
    const row = await this.products.forCafe(cafeId).findOne({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }
}
