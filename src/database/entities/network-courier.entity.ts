import { Column, Entity, Index } from 'typeorm';
import { Vehicle } from '../../common/enums.js';
import { AppBaseEntity } from './base.entity.js';

/**
 * Someone who carries deliveries for any cafe that asks the network: signed up on the
 * courier site, belonging to no cafe. Not a `User`, so no staff route can take them.
 */
@Entity('network_couriers')
export class NetworkCourier extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 12 })
  vehicle!: Vehicle;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
