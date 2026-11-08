import {
  Check,
  Column,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { OrderSource, OrderStatus, OrderType } from '../../common/enums.js';
import { CafeTable } from './cafe-table.entity.js';
import { OrderItem } from './order-item.entity.js';
import { Payment } from './payment.entity.js';
import { TenantEntity } from './tenant.entity.js';
import { User } from './user.entity.js';

@Entity('orders')
@Index(['cafeId', 'businessDate', 'number'], { unique: true })
@Index(['cafeId', 'status'])
@Check('CHK_orders_total_not_negative', `"total" >= 0`)
export class Order extends TenantEntity {
  /** Restarts from 1 for each cafe on each `businessDate`. */
  @Column({ type: 'integer' })
  number!: number;

  /** Calendar day in Asia/Tashkent that `number` belongs to. */
  @Column({ type: 'date' })
  businessDate!: string;

  @Column({ type: 'enum', enum: OrderSource })
  source!: OrderSource;

  @Column({ type: 'enum', enum: OrderType })
  type!: OrderType;

  @Column({ type: 'uuid', nullable: true })
  tableId!: string | null;

  @ManyToOne(() => CafeTable, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tableId' })
  table?: Relation<CafeTable> | null;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.NEW })
  status!: OrderStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  customerName!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  customerPhone!: string | null;

  /** Telegram ids exceed 32 bits; pg returns bigint as a string. */
  @Column({ type: 'bigint', nullable: true })
  telegramUserId!: string | null;

  /** Whole so'm: the items plus the charges below. */
  @Column({ type: 'integer', default: 0 })
  total!: number;

  /** The cafe's rate when the order was placed, so a later change leaves it alone. */
  @Column({ type: 'smallint', default: 0 })
  serviceChargePercent!: number;

  /** Whole so'm, worked out from the items and `serviceChargePercent`. */
  @Column({ type: 'integer', default: 0 })
  serviceCharge!: number;

  /** Whole so'm, for the containers of a takeaway or delivery. */
  @Column({ type: 'integer', default: 0 })
  packagingFee!: number;

  /** Whole so'm. */
  @Column({ type: 'integer', default: 0 })
  deliveryFee!: number;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: Relation<User> | null;

  /** Lets a customer follow one order without an account. */
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  @Generated('uuid')
  publicToken!: string;

  @OneToMany(() => OrderItem, (item) => item.order)
  items?: Relation<OrderItem>[];

  @OneToMany(() => Payment, (payment) => payment.order)
  payments?: Relation<Payment>[];
}
