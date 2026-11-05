import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  In,
  type EntityTarget,
  type FindOptionsWhere,
} from 'typeorm';
import { tashkentDate } from '../common/dates.js';
import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  Role,
} from '../common/enums.js';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { MAX_MONEY } from '../common/validation.js';
import { CafeTable } from '../database/entities/cafe-table.entity.js';
import { OrderItem } from '../database/entities/order-item.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { Payment } from '../database/entities/payment.entity.js';
import { Product } from '../database/entities/product.entity.js';
import type { TenantEntity } from '../database/entities/tenant.entity.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { canTransition, roleMaySetStatus } from './order-status.js';
import type {
  CreateOrderItemDto,
  ListOrdersQueryDto,
  OrderDto,
  OrderPageDto,
} from './orders.dto.js';

export interface CreateOrderInput {
  source: OrderSource;
  type: OrderType;
  tableId?: string | null;
  items: CreateOrderItemDto[];
  note?: string;
  customerName?: string;
  customerPhone?: string;
  createdById?: string;
}

function paidAmountOf(order: Order): number {
  return (order.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
}

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    number: order.number,
    businessDate: order.businessDate,
    source: order.source,
    type: order.type,
    status: order.status,
    tableId: order.tableId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    total: order.total,
    paidAmount: paidAmountOf(order),
    note: order.note,
    createdById: order.createdById,
    publicToken: order.publicToken,
    createdAt: order.createdAt,
    items: (order.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.nameSnapshot,
      price: item.priceSnapshot,
      quantity: item.quantity,
      note: item.note,
    })),
    payments: (order.payments ?? []).map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: payment.amount,
      createdAt: payment.createdAt,
    })),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(cafeId: string, input: CreateOrderInput): Promise<Order> {
    this.assertTypeRules(input);

    const orderId = await this.dataSource.transaction(async (manager) => {
      if (input.tableId) {
        const tables = await this.scope(manager, cafeId, CafeTable).count({
          id: input.tableId,
        });
        if (tables === 0) throw new BadRequestException('Unknown table');
      }

      const items = await this.priceItems(manager, cafeId, input.items);
      const total = items.reduce(
        (sum, item) => sum + item.priceSnapshot * item.quantity,
        0,
      );
      if (total > MAX_MONEY)
        throw new BadRequestException('Order is too large');

      const businessDate = tashkentDate();
      const order = await this.scope(manager, cafeId, Order).create({
        number: await this.nextNumber(manager, cafeId, businessDate),
        businessDate,
        source: input.source,
        type: input.type,
        tableId: input.tableId ?? null,
        total,
        note: input.note ?? null,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        createdById: input.createdById ?? null,
      });
      await manager.insert(
        OrderItem,
        items.map((item) => ({ ...item, orderId: order.id })),
      );
      return order.id;
    });

    // Announced only after the commit: nobody hears about an order that rolled back.
    const order = await this.load(this.dataSource.manager, cafeId, orderId);
    this.realtime.emitOrderCreated(cafeId, toOrderDto(order));
    return order;
  }

  async list(
    cafeId: string,
    { date, status, source, tableId, page, limit }: ListOrdersQueryDto,
  ): Promise<OrderPageDto> {
    const where: FindOptionsWhere<Order> = {
      ...(date && { businessDate: date }),
      ...(status && { status }),
      ...(source && { source }),
      ...(tableId && { tableId }),
    };
    const [rows, total] = await this.scope(
      this.dataSource.manager,
      cafeId,
      Order,
    ).findAndCount({
      where,
      relations: { items: true, payments: true },
      order: { createdAt: 'DESC', number: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(toOrderDto), total, page, limit };
  }

  get(cafeId: string, id: string): Promise<Order> {
    return this.load(this.dataSource.manager, cafeId, id);
  }

  /** The single place an order's status changes. */
  async changeStatus(
    cafeId: string,
    id: string,
    to: OrderStatus,
    role: Role,
  ): Promise<Order> {
    if (!roleMaySetStatus(role, to)) {
      throw new ForbiddenException(`Your role cannot set an order to ${to}`);
    }

    await this.dataSource.transaction(async (manager) => {
      const order = await this.lock(manager, cafeId, id);
      if (!canTransition(order.status, to)) {
        throw new ConflictException(
          `An order cannot go from ${order.status} to ${to}`,
        );
      }
      if (to === OrderStatus.PAID) {
        const paid = await this.paidSoFar(manager, id);
        if (paid < order.total) {
          throw new ConflictException('The order is not fully paid yet');
        }
      }
      await this.scope(manager, cafeId, Order).update({ id }, { status: to });
    });

    const order = await this.load(this.dataSource.manager, cafeId, id);
    this.realtime.emitOrderStatusChanged(cafeId, toOrderDto(order), {
      id: order.id,
      number: order.number,
      status: order.status,
    });
    return order;
  }

  async addPayment(
    cafeId: string,
    id: string,
    method: PaymentMethod,
    amount: number,
  ): Promise<Order> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lock(manager, cafeId, id);
      if (
        order.status === OrderStatus.PAID ||
        order.status === OrderStatus.CANCELLED
      ) {
        throw new ConflictException(
          `A ${order.status} order cannot take payments`,
        );
      }
      const unpaid = order.total - (await this.paidSoFar(manager, id));
      if (amount > unpaid) {
        throw new BadRequestException(
          `The payment exceeds the unpaid amount of ${unpaid}`,
        );
      }
      await manager.insert(Payment, { orderId: id, method, amount });
    });

    const order = await this.load(this.dataSource.manager, cafeId, id);
    this.realtime.emitOrderUpdated(cafeId, toOrderDto(order));
    return order;
  }

  private assertTypeRules({ type, tableId, customerPhone }: CreateOrderInput) {
    if (type === OrderType.DINE_IN && !tableId) {
      throw new BadRequestException('A DINE_IN order needs a table');
    }
    if (type !== OrderType.DINE_IN && tableId) {
      throw new BadRequestException('Only a DINE_IN order can have a table');
    }
    if (type === OrderType.DELIVERY && !customerPhone) {
      throw new BadRequestException('A DELIVERY order needs a customer phone');
    }
  }

  /** Name and price are copied here, so later menu edits cannot change this order. */
  private async priceItems(
    manager: EntityManager,
    cafeId: string,
    items: CreateOrderItemDto[],
  ) {
    const ids = [...new Set(items.map((item) => item.productId))];
    const products = await this.scope(manager, cafeId, Product).find({
      where: { id: In(ids) },
      relations: { category: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    return items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Unknown product ${item.productId}`);
      }
      if (!product.isAvailable || !product.category?.isActive) {
        throw new ConflictException(`"${product.name}" is not available`);
      }
      return {
        productId: product.id,
        nameSnapshot: product.name,
        priceSnapshot: product.price,
        quantity: item.quantity,
        note: item.note ?? null,
      };
    });
  }

  private async nextNumber(
    manager: EntityManager,
    cafeId: string,
    businessDate: string,
  ): Promise<number> {
    // Held until commit, so concurrent orders of one cafe wait here for their number.
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`order-number:${cafeId}:${businessDate}`],
    );
    const [last] = await this.scope(manager, cafeId, Order).find({
      where: { businessDate },
      order: { number: 'DESC' },
      take: 1,
    });
    return (last?.number ?? 0) + 1;
  }

  private async paidSoFar(manager: EntityManager, orderId: string) {
    return (await manager.sum(Payment, 'amount', { orderId })) ?? 0;
  }

  /** Serializes changes to one order, e.g. two cashiers taking the same payment. */
  private async lock(
    manager: EntityManager,
    cafeId: string,
    id: string,
  ): Promise<Order> {
    const order = await this.scope(manager, cafeId, Order).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) throw new NotFoundException();
    return order;
  }

  private async load(
    manager: EntityManager,
    cafeId: string,
    id: string,
  ): Promise<Order> {
    const order = await this.scope(manager, cafeId, Order).findOne({
      where: { id },
      relations: { items: true, payments: true },
      order: {
        items: { createdAt: 'ASC', nameSnapshot: 'ASC' },
        payments: { createdAt: 'ASC' },
      },
    });
    if (!order) throw new NotFoundException();
    return order;
  }

  private scope<T extends TenantEntity>(
    manager: EntityManager,
    cafeId: string,
    entity: EntityTarget<T>,
  ) {
    return new TenantRepository(manager.getRepository(entity)).forCafe(cafeId);
  }
}
