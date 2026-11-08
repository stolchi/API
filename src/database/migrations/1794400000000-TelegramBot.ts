import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A bot tells the cafe about orders in a chat it is linked to, once a day too. */
export class TelegramBot1794400000000 implements MigrationInterface {
  name = 'TelegramBot1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "telegram_bots" ADD "notifyChatId" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_bots" ADD "linkCode" character varying(32) NOT NULL DEFAULT substr(md5(random()::text), 1, 24)`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_bots" ALTER COLUMN "linkCode" DROP DEFAULT`,
    );
    await queryRunner.query(`ALTER TABLE "telegram_bots" ADD "lastError" text`);
    await queryRunner.query(
      `ALTER TABLE "telegram_bots" ADD "lastSummaryOn" date`,
    );
    // A bot saved before now was never checked with Telegram.
    await queryRunner.query(`UPDATE "telegram_bots" SET "isActive" = false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'lastSummaryOn',
      'lastError',
      'linkCode',
      'notifyChatId',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "telegram_bots" DROP COLUMN "${column}"`,
      );
    }
  }
}
