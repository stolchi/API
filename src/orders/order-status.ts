import { OrderStatus } from '../common/enums.js';
import { Permission } from '../common/permissions.js';

const { NEW, ACCEPTED, COOKING, READY, SERVED, PAID, CANCELLED } = OrderStatus;

/** NEW → ACCEPTED → COOKING → READY → SERVED → PAID, plus CANCELLED from any status before PAID. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [NEW]: [ACCEPTED, CANCELLED],
  [ACCEPTED]: [COOKING, CANCELLED],
  [COOKING]: [READY, CANCELLED],
  [READY]: [SERVED, CANCELLED],
  [SERVED]: [PAID, CANCELLED],
  [PAID]: [],
  [CANCELLED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The permission needed to move an order to each status. */
const REQUIRED: Partial<Record<OrderStatus, Permission>> = {
  [ACCEPTED]: Permission.KITCHEN_WORK,
  [COOKING]: Permission.KITCHEN_WORK,
  [READY]: Permission.KITCHEN_WORK,
  [SERVED]: Permission.ORDERS_SERVE,
  [PAID]: Permission.ORDERS_PAYMENT,
  [CANCELLED]: Permission.ORDERS_CANCEL,
};

export function maySetStatus(
  permissions: readonly Permission[],
  to: OrderStatus,
): boolean {
  const required = REQUIRED[to];
  return required !== undefined && permissions.includes(required);
}
