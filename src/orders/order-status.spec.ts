import { OrderStatus, Role } from '../common/enums.js';
import { canTransition, roleMaySetStatus } from './order-status.js';

const { NEW, ACCEPTED, COOKING, READY, SERVED, PAID, CANCELLED } = OrderStatus;
const ALL = Object.values(OrderStatus);

describe('canTransition', () => {
  const FLOW = [NEW, ACCEPTED, COOKING, READY, SERVED, PAID];

  it('allows exactly the next step of the flow, plus cancelling', () => {
    FLOW.slice(0, -1).forEach((from, index) => {
      const allowed = ALL.filter((to) => canTransition(from, to));
      expect(allowed.sort()).toEqual([FLOW[index + 1], CANCELLED].sort());
    });
  });

  it.each([PAID, CANCELLED])('treats %s as final', (from) => {
    expect(ALL.filter((to) => canTransition(from, to))).toEqual([]);
  });
});

describe('roleMaySetStatus', () => {
  it('limits the cook to kitchen steps', () => {
    expect(ALL.filter((to) => roleMaySetStatus(Role.COOK, to)).sort()).toEqual(
      [ACCEPTED, COOKING, READY].sort(),
    );
  });

  it('does not let a waiter take money or cancel', () => {
    expect(roleMaySetStatus(Role.WAITER, PAID)).toBe(false);
    expect(roleMaySetStatus(Role.WAITER, CANCELLED)).toBe(false);
  });

  it('gives a super admin, who has no cafe, nothing', () => {
    expect(ALL.some((to) => roleMaySetStatus(Role.SUPER_ADMIN, to))).toBe(
      false,
    );
  });
});
