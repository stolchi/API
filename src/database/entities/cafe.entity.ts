import { Check, Column, Entity, Index } from 'typeorm';
import { OrderType, ServiceMode } from '../../common/enums.js';
import { AppBaseEntity } from './base.entity.js';

@Entity('cafes')
@Check(
  'CHK_cafes_service_charge_range',
  `"serviceChargePercent" BETWEEN 0 AND 50`,
)
@Check(
  'CHK_cafes_fees_not_negative',
  `"packagingFee" >= 0 AND "deliveryFee" >= 0`,
)
export class Cafe extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  slug!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl!: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  primaryColor!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  workingHours!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 3, default: 'UZS' })
  currency!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({
    type: 'enum',
    enum: ServiceMode,
    default: ServiceMode.TABLE_SERVICE,
  })
  serviceMode!: ServiceMode;

  /** The kinds of order the cafe takes. Never empty. */
  @Column({
    type: 'enum',
    enum: OrderType,
    array: true,
    default: [OrderType.DINE_IN, OrderType.TAKEAWAY],
  })
  orderTypes!: OrderType[];

  /** Added to dine-in orders only. */
  @Column({ type: 'smallint', default: 0 })
  serviceChargePercent!: number;

  /** Whole so'm per takeaway or delivery order. */
  @Column({ type: 'integer', default: 0 })
  packagingFee!: number;

  /** Whole so'm per delivery order. */
  @Column({ type: 'integer', default: 0 })
  deliveryFee!: number;
}
