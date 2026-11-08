import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Not, Repository } from 'typeorm';
import { OrderSource, OrderStatus, OrderType } from '../common/enums.js';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { CafeTable } from '../database/entities/cafe-table.entity.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { Category } from '../database/entities/category.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { Product } from '../database/entities/product.entity.js';
import { displayNumberOf } from '../orders/order-number.js';
import { amountsOf, OrdersService } from '../orders/orders.service.js';
import type {
  CreatePublicOrderDto,
  PublicMenuDto,
  PublicOrderDto,
  PublicScreenDto,
  PublicTableDto,
} from './public.dto.js';

const { ACCEPTED, COOKING, READY } = OrderStatus;

/** Long enough for any real order; numbers restart daily, so yesterday's must drop off. */
const SCREEN_WINDOW_MS = 12 * 60 * 60 * 1000;

export function toPublicOrderDto(order: Order): PublicOrderDto {
  return {
    publicToken: order.publicToken,
    number: order.number,
    displayNumber: displayNumberOf(order),
    status: order.status,
    type: order.type,
    cancelReason: order.cancelReason,
    ...amountsOf(order),
    createdAt: order.createdAt,
    items: (order.items ?? []).map((item) => ({
      name: item.nameSnapshot,
      price: item.priceSnapshot,
      unit: item.unit,
      quantity: item.quantity,
      weighed: item.weighed,
      note: item.note,
    })),
  };
}

@Injectable()
export class PublicService {
  private readonly categories: TenantRepository<Category>;
  private readonly products: TenantRepository<Product>;
  private readonly tenantTables: TenantRepository<CafeTable>;
  private readonly tenantOrders: TenantRepository<Order>;

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
    this.tenantOrders = new TenantRepository(orderRows);
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
        orderTypes: cafe.orderTypes,
        serviceChargePercent: cafe.serviceChargePercent,
        packagingFee: cafe.packagingFee,
        deliveryFee: cafe.deliveryFee,
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
            unit: product.unit,
            variants: product.variants,
            imageUrl: product.imageUrl,
            isAvailable: product.isAvailable,
          })),
      })),
    };
  }

  async screen(slug: string): Promise<PublicScreenDto> {
    const cafe = await this.cafeBySlug(slug);
    const orders = await this.tenantOrders.forCafe(cafe.id).find({
      select: { number: true, source: true, status: true },
      // A delivery is not collected at the counter, so it stays off the screen.
      where: {
        status: In([ACCEPTED, COOKING, READY]),
        type: Not(OrderType.DELIVERY),
        createdAt: MoreThan(new Date(Date.now() - SCREEN_WINDOW_MS)),
      },
      order: { createdAt: 'ASC' },
    });
    const numbersWhere = (wanted: (status: OrderStatus) => boolean) =>
      orders.filter(({ status }) => wanted(status)).map(displayNumberOf);
    return {
      cafeName: cafe.name,
      logoUrl: cafe.logoUrl,
      primaryColor: cafe.primaryColor,
      preparing: numbersWhere((status) => status !== READY),
      ready: numbersWhere((status) => status === READY),
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
