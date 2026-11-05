import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { PaymentMethod } from '../../common/enums.js';
import { AppBaseEntity } from './base.entity.js';
import { Order } from './order.entity.js';

/** Tenant-scoped through its order. */
@Entity('payments')
@Check('CHK_payments_amount_positive', `"amount" > 0`)
export class Payment extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order?: Relation<Order>;

  @Column({ type: 'enum', enum: PaymentMethod })
  method!: PaymentMethod;

  /** Whole so'm. */
  @Column({ type: 'integer' })
  amount!: number;
}
