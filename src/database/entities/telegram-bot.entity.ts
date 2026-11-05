import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AppBaseEntity } from './base.entity.js';
import { Cafe } from './cafe.entity.js';

@Entity('telegram_bots')
export class TelegramBot extends AppBaseEntity {
  @Column({ type: 'uuid', unique: true })
  cafeId!: string;

  @OneToOne(() => Cafe, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cafeId' })
  cafe?: Relation<Cafe>;

  @Column({ type: 'text' })
  tokenEncrypted!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', length: 128 })
  webhookSecret!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
