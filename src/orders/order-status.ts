import { OrderStatus, Role } from '../common/enums.js';

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

const ALL = Object.values(OrderStatus);

/** The statuses each role may move an order to. */
const ROLE_TARGETS: Partial<Record<Role, readonly OrderStatus[]>> = {
  [Role.OWNER]: ALL,
  [Role.CASHIER]: ALL,
  [Role.WAITER]: [ACCEPTED, SERVED],
  [Role.COOK]: [ACCEPTED, COOKING, READY],
};

export function roleMaySetStatus(role: Role, to: OrderStatus): boolean {
  return ROLE_TARGETS[role]?.includes(to) ?? false;
}
