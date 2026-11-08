import type { MigrationInterface, QueryRunner } from 'typeorm';

/** When the cafe first looked at an order, so new ones are not missed. */
export class SeenOrders1794500000000 implements MigrationInterface {
  name = 'SeenOrders1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "seenAt" TIMESTAMP WITH TIME ZONE`,
    );
    // Everything before now has been dealt with one way or another.
    await queryRunner.query(`UPDATE "orders" SET "seenAt" = "createdAt"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "seenAt"`);
  }
}
