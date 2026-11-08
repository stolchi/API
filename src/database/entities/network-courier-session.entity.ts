import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppBaseEntity } from './base.entity.js';
import { NetworkCourier } from './network-courier.entity.js';

/** A network courier's refresh token, rotated as staff ones are. */
@Entity('network_courier_sessions')
export class NetworkCourierSession extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  courierId!: string;

  @ManyToOne(() => NetworkCourier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courierId' })
  courier?: Relation<NetworkCourier>;

  /** SHA-256 of the opaque token; the token itself is only ever in the cookie. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Index()
  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
