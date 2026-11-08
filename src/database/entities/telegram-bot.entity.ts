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

  /** True once Telegram has the webhook: the bot answers customers. */
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** Where the cafe hears about new orders: the owner's chat, or a staff group. */
  @Column({ type: 'bigint', nullable: true })
  notifyChatId!: string | null;

  /** In the link that ties that chat to the cafe: t.me/bot?start=staff_{code}. */
  @Column({ type: 'varchar', length: 32 })
  linkCode!: string;

  /** What went wrong the last time the bot was set up, for the settings page. */
  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  /** The business day the last daily summary was sent for. */
  @Column({ type: 'date', nullable: true })
  lastSummaryOn!: string | null;
}
