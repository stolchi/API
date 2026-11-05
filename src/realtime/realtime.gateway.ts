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
import { Role } from '../common/enums.js';
import { Order } from '../database/entities/order.entity.js';

export const cafeRoom = (cafeId: string) => `cafe:${cafeId}`;
export const kitchenRoom = (cafeId: string) => `kitchen:${cafeId}`;
export const orderRoom = (orderId: string) => `order:${orderId}`;

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
  }

  emitOrderUpdated(cafeId: string, order: unknown): void {
    this.toStaff(cafeId).emit('order.updated', order);
  }

  emitOrderStatusChanged(
    cafeId: string,
    order: unknown,
    customer: { id: string; number: number; status: string },
  ): void {
    this.toStaff(cafeId).emit('order.status_changed', order);
    this.server
      .to(orderRoom(customer.id))
      .emit('order.status_changed', customer);
  }

  emitProductAvailabilityChanged(
    cafeId: string,
    product: { id: string; isAvailable: boolean },
  ): void {
    this.toStaff(cafeId).emit('product.availability_changed', product);
  }

  private toStaff(cafeId: string) {
    // A socket in both rooms still gets each event only once.
    return this.server.to([cafeRoom(cafeId), kitchenRoom(cafeId)]);
  }

  private async authenticate(socket: Socket): Promise<void> {
    const { token, orderToken } = socket.handshake.auth as {
      token?: unknown;
      orderToken?: unknown;
    };

    if (typeof token === 'string') {
      const payload = await this.jwt.verifyAsync<
        AccessTokenPayload & { exp: number }
      >(token);
      if (!payload.cafeId) throw new Error('Not a cafe user');
      await socket.join(
        payload.role === Role.COOK
          ? kitchenRoom(payload.cafeId)
          : cafeRoom(payload.cafeId),
      );
      this.disconnectAtExpiry(socket, payload.exp);
      return;
    }

    if (typeof orderToken === 'string' && isUUID(orderToken)) {
      const order = await this.orders.findOneBy({ publicToken: orderToken });
      if (!order) throw new Error('Unknown order');
      await socket.join(orderRoom(order.id));
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
