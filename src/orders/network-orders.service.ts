import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, IsNull, Not, type EntityManager } from 'typeorm';
import { DeliveryMode, OrderStatus, OrderType } from '../common/enums.js';
import { distanceKm, roughly, type Point } from '../common/geo.js';
import { Permission } from '../common/permissions.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { PaymentMethod } from '../common/enums.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { displayNumberOf } from './order-number.js';
import { OrderEvents } from './order-events.js';
import { OrdersService, toOrderDto } from './orders.service.js';

/** Taken by a courier from the network until it leaves the cafe, as with staff. */
const CLAIMABLE: readonly OrderStatus[] = [
  OrderStatus.ACCEPTED,
  OrderStatus.COOKING,
  OrderStatus.READY,
];
const FINISHED: readonly OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.CANCELLED,
];

/** How many deliveries one network courier may carry at once. */
export const MAX_ACTIVE_NETWORK_DELIVERIES = 3;

const NETWORK_CAFES = [DeliveryMode.NETWORK, DeliveryMode.BOTH];

const pointOf = (place: {
  latitude: number | null;
  longitude: number | null;
}): Point | null =>
  place.latitude === null || place.longitude === null
    ? null
    : { latitude: place.latitude, longitude: place.longitude };

const paidOf = (order: Order) =>
  (order.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);

/**
 * What changes hands for a network courier. They keep the delivery fee: what the
 * customer still owes is collected at the door, and the cafe is settled with at
 * pick-up — paid by the courier, or paying them if the customer paid ahead.
 */
export function networkMoney(order: Order) {
  const settled = order.courierSettlement;
  // Once handed over, what the courier paid the cafe is among the payments, but the
  // customer still owes it to the courier.
  const paidByCustomer =
    paidOf(order) - (settled !== null && settled > 0 ? settled : 0);
  const collectFromCustomer = Math.max(0, order.total - paidByCustomer);
  return {
    deliveryFee: order.deliveryFee,
    collectFromCustomer,
    settlement: settled ?? collectFromCustomer - order.deliveryFee,
  };
}

/**
 * Deliveries offered to couriers from the network. This is the one place that reads
 * across cafes on purpose: a courier sees each cafe's offered deliveries, and only
 * the area and the money until they take one.
 */
@Injectable()
export class NetworkOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeGateway,
    private readonly events: OrderEvents,
  ) {}

  // ---- The cafe's side --------------------------------------------------------

  /** Puts a delivery out to the network, or takes it back while nobody has it. */
  async offer(cafeId: string, id: string, offered: boolean): Promise<Order> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockCafeOrder(manager, cafeId, id);
      if (order.type !== OrderType.DELIVERY) {
        throw new ConflictException('Only a delivery can go to couriers');
      }
      if (
        FINISHED.includes(order.status) ||
        order.status === OrderStatus.SERVED
      ) {
        throw new ConflictException(
          `A ${order.status} order cannot be offered`,
        );
      }
      if (offered) {
        const cafe = await manager.findOneByOrFail(Cafe, { id: cafeId });
        if (!NETWORK_CAFES.includes(cafe.deliveryMode)) {
          throw new ConflictException(
            'This cafe does not use network couriers',
          );
        }
        if (!pointOf(cafe)) {
          throw new ConflictException('Put the cafe on the map first');
        }
        if (order.courierId) {
          throw new ConflictException('One of the cafe’s couriers has it');
        }
      } else if (order.networkCourierId) {
        throw new ConflictException('A network courier has taken it');
      }
      await manager.update(
        Order,
        { id, cafeId },
        { offeredAt: offered ? (order.offeredAt ?? new Date()) : null },
      );
    });
    return this.announce(cafeId, id);
  }

  /**
   * The network courier came for it. Staff confirm they handed it over and settled up:
   * money the courier paid is recorded; money paid to them is not the cafe's income.
   */
  async handOver(
    cafeId: string,
    id: string,
    permissions: readonly Permission[],
  ): Promise<Order> {
    const order = await this.orders.get(cafeId, id);
    if (!order.networkCourierId) {
      throw new ConflictException('No network courier has taken it');
    }
    if (order.status !== OrderStatus.READY) {
      throw new ConflictException('It has to be ready to hand over');
    }
    const { settlement } = networkMoney(order);
    if (settlement > 0) {
      if (!permissions.includes(Permission.ORDERS_PAYMENT)) {
        throw new ForbiddenException(
          'Taking the courier’s money needs payments',
        );
      }
      await this.orders.addPayments(cafeId, id, [
        { method: PaymentMethod.CASH, amount: settlement },
      ]);
    }
    await this.dataSource.manager.update(
      Order,
      { id, cafeId },
      { courierSettlement: settlement },
    );
    return this.orders.changeStatus(cafeId, id, OrderStatus.SERVED, [
      Permission.ORDERS_SERVE,
    ]);
  }

  // ---- The courier's side -------------------------------------------------------

  /** Offered deliveries nobody has taken, nearest first when the courier says where. */
  async nearby(near: Point | null, radiusKm: number) {
    const offers = await this.dataSource.manager.find(Order, {
      where: {
        type: OrderType.DELIVERY,
        offeredAt: Not(IsNull()),
        courierId: IsNull(),
        networkCourierId: IsNull(),
        status: In(CLAIMABLE),
        cafe: { isActive: true, deliveryMode: In(NETWORK_CAFES) },
      },
      relations: { cafe: true, items: true, payments: true },
      order: { offeredAt: 'ASC' },
      take: 200,
    });
    return offers
      .map((order) => ({ order, cafePoint: pointOf(order.cafe!) }))
      .filter(
        (offer): offer is { order: Order; cafePoint: Point } =>
          offer.cafePoint !== null,
      )
      .map(({ order, cafePoint }) => ({
        order,
        toCafeKm: near ? distanceKm(near, cafePoint) : null,
      }))
      .filter(({ toCafeKm }) => toCafeKm === null || toCafeKm <= radiusKm)
      .sort((a, b) => (a.toCafeKm ?? 0) - (b.toCafeKm ?? 0));
  }

  /** The courier's own deliveries still to make. */
  mine(courierId: string): Promise<Order[]> {
    return this.dataSource.manager.find(Order, {
      where: { networkCourierId: courierId, status: Not(In(FINISHED)) },
      relations: { cafe: true, items: true, payments: true },
      order: { createdAt: 'ASC' },
    });
  }

  /** Takes a delivery. Two at once: the first gets it, the other is told. */
  async claim(courierId: string, id: string): Promise<Order> {
    const cafeId = await this.dataSource.transaction(async (manager) => {
      const order = await this.lockAny(manager, id);
      const cafe = await manager.findOneByOrFail(Cafe, { id: order.cafeId });
      if (
        order.type !== OrderType.DELIVERY ||
        !order.offeredAt ||
        !NETWORK_CAFES.includes(cafe.deliveryMode) ||
        !cafe.isActive
      ) {
        throw new NotFoundException();
      }
      if (order.courierId || order.networkCourierId) {
        throw new ConflictException('Another courier has taken it');
      }
      if (!CLAIMABLE.includes(order.status)) {
        throw new ConflictException(`A ${order.status} order cannot be taken`);
      }
      const carrying = await manager.count(Order, {
        where: { networkCourierId: courierId, status: Not(In(FINISHED)) },
      });
      if (carrying >= MAX_ACTIVE_NETWORK_DELIVERIES) {
        throw new BadRequestException(
          `At most ${MAX_ACTIVE_NETWORK_DELIVERIES} deliveries at a time`,
        );
      }
      await manager.update(Order, { id }, { networkCourierId: courierId });
      return order.cafeId;
    });
    return this.announce(cafeId, id);
  }

  /** Gives a delivery back before collecting it, for another courier to take. */
  async release(courierId: string, id: string): Promise<Order> {
    const cafeId = await this.dataSource.transaction(async (manager) => {
      const order = await this.lockAny(manager, id);
      if (order.networkCourierId !== courierId) throw new NotFoundException();
      if (!CLAIMABLE.includes(order.status)) {
        throw new ConflictException('It has already been handed over');
      }
      await manager.update(Order, { id }, { networkCourierId: null });
      return order.cafeId;
    });
    return this.announce(cafeId, id);
  }

  /** On the way: how long it will take, which the customer is told. */
  async setEta(courierId: string, id: string, etaMinutes: number) {
    const order = await this.ownOrder(courierId, id, OrderStatus.SERVED);
    await this.dataSource.manager.update(
      Order,
      { id },
      { deliveryEta: new Date(Date.now() + etaMinutes * 60_000) },
    );
    const updated = await this.announce(order.cafeId, id);
    this.events.emit({ kind: 'eta', order: updated });
    return updated;
  }

  /** Handed to the customer. The cafe was settled with at pick-up, so it closes. */
  async deliver(courierId: string, id: string): Promise<Order> {
    const order = await this.ownOrder(courierId, id, OrderStatus.SERVED);
    return this.orders.changeStatus(order.cafeId, id, OrderStatus.PAID, [
      Permission.ORDERS_PAYMENT,
    ]);
  }

  /** What a courier sees of an order: the full one once it is theirs. */
  toOffer(order: Order, toCafeKm: number | null) {
    const cafePoint = pointOf(order.cafe!)!;
    const dropoff = pointOf(order);
    return {
      id: order.id,
      displayNumber: displayNumberOf(order),
      status: order.status,
      cafe: {
        name: order.cafe!.name,
        address: order.cafe!.address,
        phone: order.cafe!.phone,
        location: cafePoint,
      },
      approximateDropoff: dropoff && roughly(dropoff),
      toCafeKm,
      tripKm: dropoff ? distanceKm(cafePoint, dropoff) : null,
      money: networkMoney(order),
      items: (order.items ?? []).map((item) => ({
        name: item.nameSnapshot,
        unit: item.unit,
        quantity: item.quantity,
      })),
      createdAt: order.createdAt,
    };
  }

  toDelivery(order: Order) {
    return {
      ...this.toOffer(order, null),
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      address: order.address,
      dropoff: pointOf(order),
      note: order.note,
      deliveryEta: order.deliveryEta,
    };
  }

  private async ownOrder(
    courierId: string,
    id: string,
    status: OrderStatus,
  ): Promise<Order> {
    const order = await this.dataSource.manager.findOne(Order, {
      where: { id, networkCourierId: courierId },
    });
    if (!order) throw new NotFoundException();
    if (order.status !== status) {
      throw new ConflictException(
        `This needs the order to be ${status}, not ${order.status}`,
      );
    }
    return order;
  }

  /** Tells the cafe's staff and every courier, then returns the order as it is now. */
  private async announce(cafeId: string, id: string): Promise<Order> {
    const order = await this.orders.get(cafeId, id);
    this.realtime.emitOrderUpdated(cafeId, toOrderDto(order));
    return order;
  }

  private async lockCafeOrder(
    manager: EntityManager,
    cafeId: string,
    id: string,
  ): Promise<Order> {
    const order = await manager.findOne(Order, {
      where: { id, cafeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) throw new NotFoundException();
    return order;
  }

  private async lockAny(manager: EntityManager, id: string): Promise<Order> {
    const order = await manager.findOne(Order, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) throw new NotFoundException();
    return order;
  }
}
