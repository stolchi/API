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
  Not,
  type EntityTarget,
  type FindOptionsWhere,
} from 'typeorm';
import { tashkentDate } from '../common/dates.js';
import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  ProductUnit,
} from '../common/enums.js';
import { Permission } from '../common/permissions.js';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { MAX_MONEY } from '../common/validation.js';
import { CafeTable } from '../database/entities/cafe-table.entity.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { OrderItem } from '../database/entities/order-item.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { Payment } from '../database/entities/payment.entity.js';
import { Product } from '../database/entities/product.entity.js';
import type { TenantEntity } from '../database/entities/tenant.entity.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { chargesFor, totalsOf } from './charges.js';
import { itemsTotalOf, maxQuantityOf } from './order-lines.js';
import { displayNumberOf } from './order-number.js';
import { canTransition, maySetStatus } from './order-status.js';
import type {
  CreateOrderItemDto,
  ListOrdersQueryDto,
  OrderDto,
  OrderPageDto,
  UpdateOrderItemDto,
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

const FINISHED = [OrderStatus.PAID, OrderStatus.CANCELLED];

/**
 * A Telegram order is a delivery, which someone confirms by phone first. Orders from
 * staff or a table's QR go straight to work, and with nothing to cook they are ready.
 */
function startingStatus(
  source: OrderSource,
  items: readonly { sendsToKitchen: boolean }[],
): OrderStatus {
  if (source === OrderSource.TELEGRAM) return OrderStatus.NEW;
  return items.some((item) => item.sendsToKitchen)
    ? OrderStatus.ACCEPTED
    : OrderStatus.READY;
}

/** Once the kitchen has started, whatever is added must reach it as something new. */
const STARTED: readonly OrderStatus[] = [
  OrderStatus.COOKING,
  OrderStatus.READY,
  OrderStatus.SERVED,
];

function paidAmountOf(order: Order): number {
  return (order.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
}

/** The charges an order keeps from when it was placed. */
export const amountsOf = (order: Order) => ({
  itemsTotal: itemsTotalOf(order.items ?? []),
  serviceChargePercent: order.serviceChargePercent,
  serviceCharge: order.serviceCharge,
  packagingFee: order.packagingFee,
  deliveryFee: order.deliveryFee,
  total: order.total,
});

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    number: order.number,
    displayNumber: displayNumberOf(order),
    businessDate: order.businessDate,
    source: order.source,
    type: order.type,
    status: order.status,
    tableId: order.tableId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    ...amountsOf(order),
    paidAmount: paidAmountOf(order),
    note: order.note,
    createdById: order.createdById,
    publicToken: order.publicToken,
    createdAt: order.createdAt,
    items: (order.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      name: item.nameSnapshot,
      price: item.priceSnapshot,
      unit: item.unit,
      quantity: item.quantity,
      weighed: item.weighed,
      sendsToKitchen: item.sendsToKitchen,
      note: item.note,
      addedQuantity: item.addedQuantity,
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
      const cafe = await manager.findOneBy(Cafe, { id: cafeId });
      if (!cafe) throw new NotFoundException();
      if (!cafe.orderTypes.includes(input.type)) {
        throw new ConflictException(
          `This cafe does not take ${input.type} orders`,
        );
      }
      if (input.tableId) {
        const tables = await this.scope(manager, cafeId, CafeTable).count({
          id: input.tableId,
        });
        if (tables === 0) throw new BadRequestException('Unknown table');
      }

      // Staff weigh as they take the order; a customer can only guess.
      const items = await this.priceItems(
        manager,
        cafeId,
        input.items,
        input.source === OrderSource.POS,
      );
      const charges = chargesFor(input.type, cafe);
      const { serviceCharge, total } = totalsOf(itemsTotalOf(items), charges);
      if (total > MAX_MONEY)
        throw new BadRequestException('Order is too large');

      const businessDate = tashkentDate();
      const order = await this.scope(manager, cafeId, Order).create({
        number: await this.nextNumber(manager, cafeId, businessDate),
        businessDate,
        source: input.source,
        status: startingStatus(input.source, items),
        type: input.type,
        tableId: input.tableId ?? null,
        ...charges,
        serviceCharge,
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
    {
      date,
      status,
      active,
      mine,
      source,
      tableId,
      page,
      limit,
    }: ListOrdersQueryDto,
    userId?: string,
  ): Promise<OrderPageDto> {
    const where: FindOptionsWhere<Order> = {
      ...(date && { businessDate: date }),
      ...(active !== undefined && {
        status: active ? Not(In(FINISHED)) : In(FINISHED),
      }),
      ...(status && { status }),
      ...(mine && userId && { createdById: userId }),
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
      order: {
        createdAt: 'DESC',
        number: 'DESC',
        items: { createdAt: 'ASC', nameSnapshot: 'ASC' },
      },
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
    permissions: readonly Permission[],
  ): Promise<Order> {
    // Nothing ever goes back to NEW: that is a conflict below, whoever is asking.
    if (to !== OrderStatus.NEW && !maySetStatus(permissions, to)) {
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
        await this.assertWeighed(manager, id);
        const paid = await this.paidSoFar(manager, id);
        if (paid < order.total) {
          throw new ConflictException('The order is not fully paid yet');
        }
      }
      // Money already taken is only for someone who handles money to undo.
      if (
        to === OrderStatus.CANCELLED &&
        !permissions.includes(Permission.ORDERS_PAYMENT) &&
        (await this.paidSoFar(manager, id)) > 0
      ) {
        throw new ForbiddenException(
          'An order with payments can only be cancelled by someone who takes payments',
        );
      }
      await this.scope(manager, cafeId, Order).update({ id }, { status: to });
      if (to === OrderStatus.READY) {
        await manager.update(OrderItem, { orderId: id }, { addedQuantity: 0 });
      }
    });

    const order = await this.load(this.dataSource.manager, cafeId, id);
    this.realtime.emitOrderStatusChanged(cafeId, toOrderDto(order), {
      id: order.id,
      number: order.number,
      status: order.status,
    });
    return order;
  }

  /**
   * Replaces the lines of an order in progress. Food added after cooking began goes
   * back to the kitchen, even from READY or SERVED: nobody would cook it otherwise.
   * That is the one step backwards an order can take, so it is not in `canTransition`.
   */
  async updateItems(
    cafeId: string,
    id: string,
    lines: UpdateOrderItemDto[],
  ): Promise<Order> {
    const { before, added } = await this.dataSource.transaction(
      async (manager) => {
        const order = await this.lock(manager, cafeId, id);
        if (
          order.status === OrderStatus.PAID ||
          order.status === OrderStatus.CANCELLED
        ) {
          throw new ConflictException(
            `A ${order.status} order cannot be changed`,
          );
        }
        const started = STARTED.includes(order.status);
        const existing = await manager.find(OrderItem, {
          where: { orderId: id },
        });
        const byId = new Map(existing.map((item) => [item.id, item]));

        const keptIds = lines.flatMap((line) => (line.id ? [line.id] : []));
        if (new Set(keptIds).size !== keptIds.length) {
          throw new BadRequestException('An order line was sent twice');
        }

        const fresh: CreateOrderItemDto[] = [];
        const kept: (OrderItem & { next: UpdateOrderItemDto })[] = [];
        for (const line of lines) {
          if (line.id) {
            const item = byId.get(line.id);
            if (!item) throw new BadRequestException('Unknown order line');
            kept.push(Object.assign(item, { next: line }));
          } else if (line.productId) {
            fresh.push({
              productId: line.productId,
              variantId: line.variantId,
              quantity: line.quantity,
              note: line.note,
            });
          } else {
            throw new BadRequestException('A new line needs a product');
          }
        }
        for (const item of kept) {
          if (item.next.quantity > maxQuantityOf(item.unit)) {
            throw new BadRequestException(`Too much of "${item.nameSnapshot}"`);
          }
        }
        const priced = await this.priceItems(manager, cafeId, fresh, true);

        const itemsTotal =
          itemsTotalOf(
            kept.map((item) => ({ ...item, quantity: item.next.quantity })),
          ) + itemsTotalOf(priced);
        // The order keeps its own rates; only the service charge follows the food.
        const { serviceCharge, total } = totalsOf(itemsTotal, order);
        if (total > MAX_MONEY) {
          throw new BadRequestException('Order is too large');
        }
        if (total < (await this.paidSoFar(manager, id))) {
          throw new ConflictException(
            'The order cannot cost less than what has been paid',
          );
        }

        const keptSet = new Set(keptIds);
        const removed = existing.filter((item) => !keptSet.has(item.id));
        if (removed.length > 0) {
          await manager.delete(
            OrderItem,
            removed.map((item) => item.id),
          );
        }

        // Only food for the kitchen sends an order back there.
        let added = 0;
        for (const item of kept) {
          const growth = Math.max(0, item.next.quantity - item.quantity);
          if (started && item.sendsToKitchen) added += growth;
          await manager.update(
            OrderItem,
            { id: item.id, orderId: id },
            {
              quantity: item.next.quantity,
              // Staff changing a weight have put it on the scales.
              weighed:
                item.weighed ||
                item.next.weighed === true ||
                item.next.quantity !== item.quantity,
              note: item.next.note ?? null,
              addedQuantity: started
                ? Math.min(item.addedQuantity + growth, item.next.quantity)
                : 0,
            },
          );
        }
        if (priced.length > 0) {
          await manager.insert(
            OrderItem,
            priced.map((item) => ({
              ...item,
              orderId: id,
              addedQuantity: started ? item.quantity : 0,
            })),
          );
          if (started) {
            added += priced
              .filter((item) => item.sendsToKitchen)
              .reduce((sum, item) => sum + item.quantity, 0);
          }
        }

        const backToKitchen =
          added > 0 &&
          (order.status === OrderStatus.READY ||
            order.status === OrderStatus.SERVED);
        await this.scope(manager, cafeId, Order).update(
          { id },
          {
            total,
            serviceCharge,
            ...(backToKitchen && { status: OrderStatus.COOKING }),
          },
        );
        return { before: order.status, added };
      },
    );

    const order = await this.load(this.dataSource.manager, cafeId, id);
    const dto = toOrderDto(order);
    this.realtime.emitOrderUpdated(cafeId, dto);
    if (order.status !== before) {
      this.realtime.emitOrderStatusChanged(cafeId, dto, {
        id: order.id,
        number: order.number,
        status: order.status,
      });
    }
    if (added > 0) this.realtime.emitOrderItemsAdded(cafeId, dto);
    return order;
  }

  async moveToTable(
    cafeId: string,
    id: string,
    tableId: string,
  ): Promise<Order> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lock(manager, cafeId, id);
      if (
        order.status === OrderStatus.PAID ||
        order.status === OrderStatus.CANCELLED
      ) {
        throw new ConflictException(`A ${order.status} order cannot be moved`);
      }
      if (order.type !== OrderType.DINE_IN) {
        throw new ConflictException('Only a DINE_IN order can change tables');
      }
      const tables = await this.scope(manager, cafeId, CafeTable).count({
        id: tableId,
      });
      if (tables === 0) throw new BadRequestException('Unknown table');
      await this.scope(manager, cafeId, Order).update({ id }, { tableId });
    });

    const order = await this.load(this.dataSource.manager, cafeId, id);
    this.realtime.emitOrderUpdated(cafeId, toOrderDto(order));
    return order;
  }

  /** One order paid several ways at once is recorded whole, or not at all. */
  async addPayments(
    cafeId: string,
    id: string,
    payments: readonly { method: PaymentMethod; amount: number }[],
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
      await this.assertWeighed(manager, id);
      const unpaid = order.total - (await this.paidSoFar(manager, id));
      const amount = payments.reduce((sum, item) => sum + item.amount, 0);
      if (amount > unpaid) {
        throw new BadRequestException(
          `The payment exceeds the unpaid amount of ${unpaid}`,
        );
      }
      await manager.insert(
        Payment,
        payments.map((item) => ({
          orderId: id,
          method: item.method,
          amount: item.amount,
        })),
      );
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

  /**
   * Name and price are copied here, so later menu edits cannot change this order.
   * `weighed`: whoever orders has the scales, so a weight given is the real one.
   */
  private async priceItems(
    manager: EntityManager,
    cafeId: string,
    items: CreateOrderItemDto[],
    weighed: boolean,
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
      if (item.quantity > maxQuantityOf(product.unit)) {
        throw new BadRequestException(`Too much of "${product.name}"`);
      }
      const variant = product.variants.find(({ id }) => id === item.variantId);
      if (product.variants.length > 0 ? !variant : item.variantId) {
        throw new BadRequestException(
          `Choose one of the sizes of "${product.name}"`,
        );
      }
      return {
        productId: product.id,
        variantId: variant?.id ?? null,
        nameSnapshot: variant
          ? `${product.name} (${variant.name})`
          : product.name,
        priceSnapshot: variant?.price ?? product.price,
        unit: product.unit,
        quantity: item.quantity,
        weighed: weighed || product.unit !== ProductUnit.KG,
        sendsToKitchen: product.sendsToKitchen,
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

  /** A guessed weight is not a price yet: it has to be weighed before money is taken. */
  private async assertWeighed(manager: EntityManager, orderId: string) {
    if (
      await manager.exists(OrderItem, { where: { orderId, weighed: false } })
    ) {
      throw new ConflictException('Some items still need weighing');
    }
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
