import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { ProductUnit } from '../common/enums.js';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { Category } from '../database/entities/category.entity.js';
import {
  Product,
  type ProductVariant,
} from '../database/entities/product.entity.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { detectImageType } from '../storage/image-type.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  CreateProductDto,
  ProductVariantDto,
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
  unit: product.unit,
  variants: product.variants,
  sendsToKitchen: product.sendsToKitchen,
  imageUrl: product.imageUrl,
  isAvailable: product.isAvailable,
  sortOrder: product.sortOrder,
});

/**
 * Sizes keep their ids across edits, so a cart holding one still finds it. With sizes,
 * the product's own price is the cheapest of them. A weighed product has no sizes.
 */
function sizing(
  unit: ProductUnit,
  wanted: readonly ProductVariantDto[],
  existing: readonly ProductVariant[],
  price: number,
): { variants: ProductVariant[]; price: number } {
  if (unit === ProductUnit.KG && wanted.length > 0) {
    throw new BadRequestException('A product sold by weight has no sizes');
  }
  const known = new Set(existing.map((variant) => variant.id));
  const ids = wanted.flatMap((variant) => (variant.id ? [variant.id] : []));
  if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    throw new BadRequestException('Unknown or repeated size');
  }
  const variants = wanted.map((variant) => ({
    id: variant.id ?? randomUUID(),
    name: variant.name.trim(),
    price: variant.price,
  }));
  return {
    variants,
    price:
      variants.length > 0
        ? Math.min(...variants.map((variant) => variant.price))
        : price,
  };
}

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
    return toProductDto(
      await this.products.forCafe(cafeId).create({
        ...dto,
        ...sizing(
          dto.unit ?? ProductUnit.PIECE,
          dto.variants ?? [],
          [],
          dto.price,
        ),
      }),
    );
  }

  async update(
    cafeId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductDto> {
    const before = await this.load(cafeId, id);
    if (dto.categoryId) await this.assertCategory(cafeId, dto.categoryId);
    await this.products.forCafe(cafeId).update(
      { id },
      {
        ...dto,
        ...sizing(
          dto.unit ?? before.unit,
          dto.variants ?? before.variants,
          before.variants,
          dto.price ?? before.price,
        ),
      },
    );
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
