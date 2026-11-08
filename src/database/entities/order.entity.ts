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
import { NetworkCourier } from './network-courier.entity.js';
import { OrderItem } from './order-item.entity.js';
import { Payment } from './payment.entity.js';
import { TenantEntity } from './tenant.entity.js';
import { User } from './user.entity.js';

@Entity('orders')
@Index(['cafeId', 'businessDate', 'number'], { unique: true })
@Index(['cafeId', 'status'])
@Check('CHK_orders_total_not_negative', `"total" >= 0`)
@Check(
  'CHK_orders_one_courier',
  `"courierId" IS NULL OR "networkCourierId" IS NULL`,
)
@Check(
  'CHK_orders_location_whole',
  `("latitude" IS NULL) = ("longitude" IS NULL)`,
)
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

  /** Where a delivery goes, with any landmark. Required for DELIVERY. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  /** The delivery point on a map, so a courier can be routed there. Both or neither. */
  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  /** Why it was cancelled, told to the customer. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  cancelReason!: string | null;

  /**
   * When someone at the cafe first opened it. Empty means nobody has looked yet, so a
   * customer's order keeps standing out. Orders taken by staff are seen as they are made.
   */
  @Column({ type: 'timestamptz', nullable: true })
  seenAt!: Date | null;

  /** When the courier expects to hand it over, set as they leave with it. */
  @Column({ type: 'timestamptz', nullable: true })
  deliveryEta!: Date | null;

  /** When the cafe put it out to network couriers. Empty: only its own can take it. */
  @Column({ type: 'timestamptz', nullable: true })
  offeredAt!: Date | null;

  /** The network courier who took it. Exclusive with `courierId`. */
  @Index('IDX_orders_networkCourierId')
  @Column({ type: 'uuid', nullable: true })
  networkCourierId!: string | null;

  @ManyToOne(() => NetworkCourier, { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'networkCourierId',
    foreignKeyConstraintName: 'FK_orders_networkCourierId',
  })
  networkCourier?: Relation<NetworkCourier> | null;

  /**
   * Settled with a network courier at hand-over: above zero they paid the cafe (a
   * payment, though not the customer's money), below zero the cafe paid them.
   */
  @Column({ type: 'integer', nullable: true })
  courierSettlement!: number | null;

  /** The cafe's own courier taking it, for a delivery. */
  @Index('IDX_orders_courierId')
  @Column({ type: 'uuid', nullable: true })
  courierId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'courierId',
    foreignKeyConstraintName: 'FK_orders_courierId',
  })
  courier?: Relation<User> | null;

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
