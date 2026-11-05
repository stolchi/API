import { Column, Entity, Index } from 'typeorm';
import { TenantEntity } from './tenant.entity.js';

/** A physical table in a cafe. Named CafeTable to avoid clashing with TypeORM's `Table`. */
@Entity('tables')
@Index(['cafeId', 'name'], { unique: true })
export class CafeTable extends TenantEntity {
  @Column({ type: 'varchar', length: 60 })
  name!: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  zone!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  qrToken!: string;
}
