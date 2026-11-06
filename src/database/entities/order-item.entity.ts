import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppBaseEntity } from './base.entity.js';
import { Order } from './order.entity.js';
import { Product } from './product.entity.js';

/** Tenant-scoped through its order. Name and price are snapshots of the product at order time. */
@Entity('order_items')
@Check('CHK_order_items_quantity_positive', `"quantity" > 0`)
@Check('CHK_order_items_price_not_negative', `"priceSnapshot" >= 0`)
export class OrderItem extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order?: Relation<Order>;

  @Column({ type: 'uuid', nullable: true })
  productId!: string | null;

  @ManyToOne(() => Product, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product?: Relation<Product> | null;

  @Column({ type: 'varchar', length: 160 })
  nameSnapshot!: string;

  /** Whole so'm. */
  @Column({ type: 'integer' })
  priceSnapshot!: number;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  /** How much of `quantity` was added after cooking began, until the order is ready again. */
  @Column({ type: 'integer', default: 0 })
  addedQuantity!: number;
}
