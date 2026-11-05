import { Column, Entity } from 'typeorm';
import { TenantEntity } from './tenant.entity.js';

@Entity('categories')
export class Category extends TenantEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
