import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Order } from '../database/entities/order.entity.js';

/** What happened to an order, for whoever reacts outside the HTTP request. */
export type OrderEvent =
  | { kind: 'created'; order: Order }
  | { kind: 'status'; order: Order; from: Order['status'] }
  | { kind: 'changed'; order: Order }
  /** A courier on the way said when they will arrive. */
  | { kind: 'eta'; order: Order };

/**
 * Told after the transaction commits. A listener's failure (Telegram being down, say)
 * is logged and never reaches the person who changed the order.
 */
@Injectable()
export class OrderEvents {
  private readonly logger = new Logger(OrderEvents.name);
  private readonly emitter = new EventEmitter();

  emit(event: OrderEvent): void {
    this.emitter.emit('order', event);
  }

  on(listener: (event: OrderEvent) => Promise<void>): void {
    this.emitter.on('order', (event: OrderEvent) => {
      listener(event).catch((error: unknown) =>
        this.logger.error(`An order listener failed: ${String(error)}`),
      );
    });
  }
}
