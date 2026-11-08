import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { ProductUnit } from '../../common/enums.js';
import { Category } from './category.entity.js';
import { TenantEntity } from './tenant.entity.js';

/** One size or portion of a product, with its own price. */
export interface ProductVariant {
  /** Stays the same across edits, so carts and orders can point to it. */
  id: string;
  name: string;
  /** Whole so'm. */
  price: number;
}

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

  /**
   * Whole so'm: per piece, or per kilogram when `unit` is KG. With variants it is
   * the cheapest of them, for showing "from".
   */
  @Column({ type: 'integer' })
  price!: number;

  @Column({ type: 'enum', enum: ProductUnit, default: ProductUnit.PIECE })
  unit!: ProductUnit;

  /** Empty, or the sizes to choose from: then one must be chosen. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  variants!: ProductVariant[];

  /** False for what is ready to hand over, such as bottled drinks or bread. */
  @Column({ type: 'boolean', default: true })
  sendsToKitchen!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'boolean', default: true })
  isAvailable!: boolean;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;
}
