import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderSource, OrderType } from '../common/enums.js';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { CafeTable } from '../database/entities/cafe-table.entity.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { Category } from '../database/entities/category.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { Product } from '../database/entities/product.entity.js';
import { OrdersService } from '../orders/orders.service.js';
import type {
  CreatePublicOrderDto,
  PublicMenuDto,
  PublicOrderDto,
  PublicTableDto,
} from './public.dto.js';

function toPublicOrderDto(order: Order): PublicOrderDto {
  return {
    publicToken: order.publicToken,
    number: order.number,
    status: order.status,
    type: order.type,
    total: order.total,
    createdAt: order.createdAt,
    items: (order.items ?? []).map((item) => ({
      name: item.nameSnapshot,
      price: item.priceSnapshot,
      quantity: item.quantity,
      note: item.note,
    })),
  };
}

@Injectable()
export class PublicService {
  private readonly categories: TenantRepository<Category>;
  private readonly products: TenantRepository<Product>;
  private readonly tenantTables: TenantRepository<CafeTable>;

  constructor(
    @InjectRepository(Cafe) private readonly cafes: Repository<Cafe>,
    @InjectRepository(CafeTable) private readonly tables: Repository<CafeTable>,
    @InjectRepository(Order) private readonly orderRows: Repository<Order>,
    @InjectRepository(Category) categories: Repository<Category>,
    @InjectRepository(Product) products: Repository<Product>,
    private readonly orders: OrdersService,
  ) {
    this.categories = new TenantRepository(categories);
    this.products = new TenantRepository(products);
    this.tenantTables = new TenantRepository(tables);
  }

  async menu(slug: string): Promise<PublicMenuDto> {
    const cafe = await this.cafeBySlug(slug);
    const [categories, products] = await Promise.all([
      this.categories.forCafe(cafe.id).find({
        where: { isActive: true },
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
      this.products.forCafe(cafe.id).find({
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
    ]);

    return {
      cafe: {
        name: cafe.name,
        slug: cafe.slug,
        logoUrl: cafe.logoUrl,
        primaryColor: cafe.primaryColor,
        phone: cafe.phone,
        address: cafe.address,
        workingHours: cafe.workingHours,
        currency: cafe.currency,
      },
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        products: products
          .filter((product) => product.categoryId === category.id)
          .map((product) => ({
            id: product.id,
            name: product.name,
            description: product.description,
            price: product.price,
            imageUrl: product.imageUrl,
            isAvailable: product.isAvailable,
          })),
      })),
    };
  }

  async table(qrToken: string): Promise<PublicTableDto> {
    const table = await this.tables.findOne({
      where: { qrToken, cafe: { isActive: true } },
      relations: { cafe: true },
    });
    if (!table?.cafe) throw new NotFoundException();
    return {
      name: table.name,
      cafeSlug: table.cafe.slug,
      cafeName: table.cafe.name,
    };
  }

  async createOrder(
    slug: string,
    { qrToken, ...dto }: CreatePublicOrderDto,
  ): Promise<PublicOrderDto> {
    const cafe = await this.cafeBySlug(slug);
    const order = await this.orders.create(cafe.id, {
      ...dto,
      source: OrderSource.QR,
      tableId: await this.tableIdOf(cafe.id, dto.type, qrToken),
    });
    return toPublicOrderDto(order);
  }

  async orderStatus(publicToken: string): Promise<PublicOrderDto> {
    const order = await this.orderRows.findOne({
      where: { publicToken },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException();
    return toPublicOrderDto(order);
  }

  /** A token only counts within its own cafe: another cafe's QR code is unknown here. */
  private async tableIdOf(
    cafeId: string,
    type: OrderType,
    qrToken: string | undefined,
  ): Promise<string | null> {
    if (!qrToken) return null;
    if (type !== OrderType.DINE_IN) {
      throw new BadRequestException('Only a DINE_IN order can have a table');
    }
    const table = await this.tenantTables
      .forCafe(cafeId)
      .findOne({ where: { qrToken } });
    if (!table) throw new BadRequestException('Unknown table');
    return table.id;
  }

  private async cafeBySlug(slug: string): Promise<Cafe> {
    const cafe = await this.cafes.findOneBy({ slug, isActive: true });
    if (!cafe) throw new NotFoundException();
    return cafe;
  }
}
