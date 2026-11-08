import { Role } from './enums.js';

/** Everything a cafe can allow or refuse its staff. Roles are lists of these. */
export enum Permission {
  DASHBOARD_VIEW = 'DASHBOARD_VIEW',
  ORDERS_VIEW = 'ORDERS_VIEW',
  ORDERS_CREATE = 'ORDERS_CREATE',
  ORDERS_EDIT = 'ORDERS_EDIT',
  ORDERS_CANCEL = 'ORDERS_CANCEL',
  ORDERS_SERVE = 'ORDERS_SERVE',
  ORDERS_PAYMENT = 'ORDERS_PAYMENT',
  KITCHEN_WORK = 'KITCHEN_WORK',
  MENU_AVAILABILITY = 'MENU_AVAILABILITY',
  MENU_MANAGE = 'MENU_MANAGE',
  TABLES_MANAGE = 'TABLES_MANAGE',
  SETTINGS_MANAGE = 'SETTINGS_MANAGE',
  STAFF_MANAGE = 'STAFF_MANAGE',
  /** Delivers the orders assigned to them, and takes the money for them. */
  DELIVERY_COURIER = 'DELIVERY_COURIER',
}

const ALL_PERMISSIONS = Object.values(Permission);

const {
  DASHBOARD_VIEW,
  ORDERS_VIEW,
  ORDERS_CREATE,
  ORDERS_EDIT,
  ORDERS_CANCEL,
  ORDERS_SERVE,
  ORDERS_PAYMENT,
  KITCHEN_WORK,
  MENU_AVAILABILITY,
  DELIVERY_COURIER,
} = Permission;

/** The roles every cafe starts with. The owner's list is fixed; the others can be edited. */
export const DEFAULT_ROLES: readonly {
  systemKey: Role;
  name: string;
  permissions: Permission[];
}[] = [
  { systemKey: Role.OWNER, name: 'Boshliq', permissions: ALL_PERMISSIONS },
  {
    systemKey: Role.CASHIER,
    name: 'Kassir',
    permissions: [
      DASHBOARD_VIEW,
      ORDERS_VIEW,
      ORDERS_CREATE,
      ORDERS_EDIT,
      ORDERS_CANCEL,
      ORDERS_SERVE,
      ORDERS_PAYMENT,
      KITCHEN_WORK,
      MENU_AVAILABILITY,
    ],
  },
  {
    systemKey: Role.WAITER,
    name: 'Ofitsiant',
    permissions: [ORDERS_VIEW, ORDERS_CREATE, ORDERS_EDIT, ORDERS_CANCEL],
  },
  { systemKey: Role.COOK, name: 'Oshpaz', permissions: [KITCHEN_WORK] },
  { systemKey: Role.COURIER, name: 'Kuryer', permissions: [DELIVERY_COURIER] },
];

/** Working with orders in any way needs seeing them, so a role cannot end up half-usable. */
export function withImpliedPermissions(
  permissions: readonly Permission[],
): Permission[] {
  const needView = permissions.some((permission) =>
    [
      ORDERS_CREATE,
      ORDERS_EDIT,
      ORDERS_CANCEL,
      ORDERS_SERVE,
      ORDERS_PAYMENT,
    ].includes(permission),
  );
  return [...new Set([...permissions, ...(needView ? [ORDERS_VIEW] : [])])];
}

/**
 * What a role actually allows. The owner always has everything, so a permission added
 * in a later release cannot leave a cafe with nobody able to hand it out.
 */
export function permissionsOf(
  role: { systemKey: Role | null; permissions: string[] } | null | undefined,
): Permission[] {
  if (!role) return [];
  return role.systemKey === Role.OWNER
    ? ALL_PERMISSIONS
    : (role.permissions as Permission[]);
}
