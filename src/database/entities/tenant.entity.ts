import { Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppBaseEntity } from './base.entity.js';
import { Cafe } from './cafe.entity.js';

/** Base class for every table whose rows belong to exactly one cafe. */
export abstract class TenantEntity extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  cafeId!: string;

  @ManyToOne(() => Cafe, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cafeId' })
  cafe?: Relation<Cafe>;
}
