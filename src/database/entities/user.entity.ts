import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppBaseEntity } from './base.entity.js';
import { Cafe } from './cafe.entity.js';
import { StaffRole } from './staff-role.entity.js';

@Entity('users')
@Check(
  'CHK_users_staff_have_cafe_and_role',
  `("isSuperAdmin" AND "cafeId" IS NULL AND "roleId" IS NULL) OR (NOT "isSuperAdmin" AND "cafeId" IS NOT NULL AND "roleId" IS NOT NULL)`,
)
export class User extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid', nullable: true })
  cafeId!: string | null;

  @ManyToOne(() => Cafe, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cafeId' })
  cafe?: Relation<Cafe> | null;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** Login identifier, unique across the whole platform. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  /** The platform owner, who belongs to no cafe. */
  @Column({ type: 'boolean', default: false })
  isSuperAdmin!: boolean;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  roleId!: string | null;

  // No cascade: a role with staff cannot be deleted. It still goes along with its cafe.
  @ManyToOne(() => StaffRole)
  @JoinColumn({ name: 'roleId' })
  role?: Relation<StaffRole> | null;

  /** Inactive staff cannot sign in. Kept rather than deleted, as orders point to them. */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  pinCode!: string | null;
}
