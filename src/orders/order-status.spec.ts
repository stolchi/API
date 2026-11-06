import { OrderStatus, Role } from '../common/enums.js';
import { DEFAULT_ROLES, Permission } from '../common/permissions.js';
import { canTransition, maySetStatus } from './order-status.js';

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

describe('maySetStatus', () => {
  const allowedFor = (systemKey: Role) => {
    const role = DEFAULT_ROLES.find((item) => item.systemKey === systemKey);
    return ALL.filter((to) => maySetStatus(role?.permissions ?? [], to)).sort();
  };

  it('limits the cook to kitchen steps', () => {
    expect(allowedFor(Role.COOK)).toEqual([ACCEPTED, COOKING, READY].sort());
  });

  it('lets a default waiter cancel, but not take money or move the order on', () => {
    expect(allowedFor(Role.WAITER)).toEqual([CANCELLED]);
  });

  it('gives the owner every step', () => {
    expect(allowedFor(Role.OWNER)).toEqual(ALL.filter((s) => s !== NEW).sort());
  });

  it('gives someone without permissions nothing', () => {
    expect(ALL.some((to) => maySetStatus([], to))).toBe(false);
  });

  it('follows the permission, not the role', () => {
    expect(maySetStatus([Permission.ORDERS_SERVE], SERVED)).toBe(true);
  });
});
