import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { Role } from '../../common/enums.js';
import { AppBaseEntity } from './base.entity.js';
import { Cafe } from './cafe.entity.js';

@Entity('users')
@Check(
  'CHK_users_cafe_matches_role',
  `("role" = 'SUPER_ADMIN' AND "cafeId" IS NULL) OR ("role" <> 'SUPER_ADMIN' AND "cafeId" IS NOT NULL)`,
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

  @Column({ type: 'enum', enum: Role })
  role!: Role;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  pinCode!: string | null;
}
