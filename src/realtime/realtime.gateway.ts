import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { isUUID } from 'class-validator';
import type { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import type { AccessTokenPayload } from '../common/auth/jwt-auth.guard.js';
import { Permission, permissionsOf } from '../common/permissions.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { Order } from '../database/entities/order.entity.js';
import { User } from '../database/entities/user.entity.js';

export const cafeRoom = (cafeId: string) => `cafe:${cafeId}`;
export const kitchenRoom = (cafeId: string) => `kitchen:${cafeId}`;
export const orderRoom = (orderId: string) => `order:${orderId}`;
export const screenRoom = (cafeId: string) => `screen:${cafeId}`;
const userRoom = (userId: string) => `user:${userId}`;
/** Couriers hear that deliveries changed, never what is in them. */
export const couriersRoom = (cafeId: string) => `couriers:${cafeId}`;

/**
 * Rooms are chosen by the server from the credentials given at connection time.
 * Clients cannot ask to join a room, so a customer only ever hears about their order.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit {
  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Cafe) private readonly cafes: Repository<Cafe>,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        () => next(new Error('Unauthorized')),
      );
    });
  }

  /** Staff get the full order; `customer` is all that reaches the public order room. */
  emitOrderCreated(cafeId: string, order: unknown): void {
    this.toStaff(cafeId).emit('order.created', order);
    this.notifyScreen(cafeId);
    this.notifyCouriers(cafeId, order);
  }

  emitOrderUpdated(cafeId: string, order: unknown): void {
    this.toStaff(cafeId).emit('order.updated', order);
    this.notifyCouriers(cafeId, order);
  }

  emitOrderStatusChanged(
    cafeId: string,
    order: unknown,
    customer: { id: string; number: number; status: string },
  ): void {
    this.toStaff(cafeId).emit('order.status_changed', order);
    this.notifyCouriers(cafeId, order);
    this.server
      .to(orderRoom(customer.id))
      .emit('order.status_changed', customer);
    this.notifyScreen(cafeId);
  }

  /**
   * The order's contents, details or cancellation changed: the customer's page reads it
   * again. No data, because what the customer may see comes from the public endpoint.
   */
  emitOrderChanged(orderId: string): void {
    this.server.to(orderRoom(orderId)).emit('order.changed');
  }

  /** A courier's own list changed: given one, taken off one, or one of theirs moved on. */
  emitCourierChanged(userIds: readonly string[]): void {
    if (userIds.length === 0) return;
    this.server.to(userIds.map(userRoom)).emit('courier.changed');
  }

  /** Lets the kitchen know to look again at an order it may already have finished. */
  emitOrderItemsAdded(cafeId: string, order: unknown): void {
    this.toStaff(cafeId).emit('order.items_added', order);
  }

  /**
   * Their permissions changed, or they lost access: the client reconnects, which puts
   * it in the right rooms and reloads the user, or finds out it is signed out.
   */
  reconnectUsers(userIds: readonly string[]): void {
    if (userIds.length === 0) return;
    this.server.in(userIds.map(userRoom)).disconnectSockets(true);
  }

  emitProductAvailabilityChanged(
    cafeId: string,
    product: { id: string; isAvailable: boolean },
  ): void {
    this.toStaff(cafeId).emit('product.availability_changed', product);
  }

  /** A delivery changed: every courier of the cafe reads their lists again. */
  private notifyCouriers(cafeId: string, order: unknown): void {
    if ((order as { type?: unknown }).type === 'DELIVERY') {
      this.server.to(couriersRoom(cafeId)).emit('courier.changed');
    }
  }

  /** Carries no data on purpose: what a public screen may show comes from its own endpoint. */
  private notifyScreen(cafeId: string): void {
    this.server.to(screenRoom(cafeId)).emit('screen.changed');
  }

  private toStaff(cafeId: string) {
    // A socket in both rooms still gets each event only once.
    return this.server.to([cafeRoom(cafeId), kitchenRoom(cafeId)]);
  }

  private async authenticate(socket: Socket): Promise<void> {
    const { token, orderToken, screen } = socket.handshake.auth as {
      token?: unknown;
      orderToken?: unknown;
      screen?: unknown;
    };

    if (typeof token === 'string') {
      const payload = await this.jwt.verifyAsync<
        AccessTokenPayload & { exp: number }
      >(token);
      const user = await this.users.findOne({
        where: { id: payload.sub, isActive: true },
        relations: { role: true },
      });
      if (!user?.cafeId) throw new Error('Not a cafe user');

      const permissions = permissionsOf(user.role);
      await socket.join(userRoom(user.id));
      // Order events carry customer data, so a role that cannot see orders hears none.
      if (permissions.includes(Permission.ORDERS_VIEW)) {
        await socket.join(cafeRoom(user.cafeId));
      } else if (permissions.includes(Permission.KITCHEN_WORK)) {
        await socket.join(kitchenRoom(user.cafeId));
      }
      if (permissions.includes(Permission.DELIVERY_COURIER)) {
        await socket.join(couriersRoom(user.cafeId));
      }
      this.disconnectAtExpiry(socket, payload.exp);
      return;
    }

    if (typeof orderToken === 'string' && isUUID(orderToken)) {
      const order = await this.orders.findOneBy({ publicToken: orderToken });
      if (!order) throw new Error('Unknown order');
      await socket.join(orderRoom(order.id));
      return;
    }

    if (typeof screen === 'string') {
      const cafe = await this.cafes.findOneBy({ slug: screen, isActive: true });
      if (!cafe) throw new Error('Unknown cafe');
      await socket.join(screenRoom(cafe.id));
      return;
    }

    throw new Error('No credentials');
  }

  /** The client reconnects with a fresh token; an expired one must stop receiving data. */
  private disconnectAtExpiry(socket: Socket, exp: number): void {
    const timer = setTimeout(
      () => socket.disconnect(true),
      exp * 1000 - Date.now(),
    );
    timer.unref();
    socket.once('disconnect', () => clearTimeout(timer));
  }
}
