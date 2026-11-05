import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { Category } from './category.entity.js';
import { TenantEntity } from './tenant.entity.js';

@Entity('products')
@Check('CHK_products_price_not_negative', `"price" >= 0`)
export class Product extends TenantEntity {
  @Index()
  @Column({ type: 'uuid' })
  categoryId!: string;

  // NO ACTION (not RESTRICT) so that deleting a cafe can still cascade through both tables.
  @ManyToOne(() => Category, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'categoryId' })
  category?: Relation<Category>;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Whole so'm. */
  @Column({ type: 'integer' })
  price!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'boolean', default: true })
  isAvailable!: boolean;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;
}
