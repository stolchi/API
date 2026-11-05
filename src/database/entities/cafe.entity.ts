import { Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity.js';

@Entity('cafes')
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
}
