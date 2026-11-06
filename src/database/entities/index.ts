import { CafeTable } from './cafe-table.entity.js';
import { Cafe } from './cafe.entity.js';
import { Category } from './category.entity.js';
import { OrderItem } from './order-item.entity.js';
import { Order } from './order.entity.js';
import { Payment } from './payment.entity.js';
import { Product } from './product.entity.js';
import { RefreshToken } from './refresh-token.entity.js';
import { StaffRole } from './staff-role.entity.js';
import { TelegramBot } from './telegram-bot.entity.js';
import { User } from './user.entity.js';

export {
  CafeTable,
  Cafe,
  Category,
  OrderItem,
  Order,
  Payment,
  Product,
  RefreshToken,
  StaffRole,
  TelegramBot,
  User,
};
export { TenantEntity } from './tenant.entity.js';

export const ALL_ENTITIES = [
  Cafe,
  StaffRole,
  User,
  RefreshToken,
  Category,
  Product,
  CafeTable,
  Order,
  OrderItem,
  Payment,
  TelegramBot,
];
