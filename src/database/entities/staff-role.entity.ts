import { Column, Entity, Index } from 'typeorm';
import { Role } from '../../common/enums.js';
import { TenantEntity } from './tenant.entity.js';

/** A cafe's own set of permissions. Every cafe starts with the default ones. */
@Entity('staff_roles')
@Index(['cafeId', 'name'], { unique: true })
@Index(['cafeId', 'systemKey'], { unique: true })
export class StaffRole extends TenantEntity {
  @Column({ type: 'varchar', length: 60 })
  name!: string;

  /** Set on default roles, which cannot be renamed or deleted. */
  @Column({ type: 'enum', enum: Role, nullable: true })
  systemKey!: Role | null;

  /** Values of `Permission`. */
  @Column({ type: 'text', array: true, default: '{}' })
  permissions!: string[];
}
