import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppBaseEntity } from './base.entity.js';
import { User } from './user.entity.js';

@Entity('refresh_tokens')
export class RefreshToken extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User>;

  /** SHA-256 of the opaque token; the token itself is only ever in the cookie. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  /** Shared by all rotations of one login, so a replay can revoke the whole chain. */
  @Index()
  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
