import type { MigrationInterface, QueryRunner } from 'typeorm';

/** What a network courier and the cafe settled at hand-over. */
export class CourierSettlement1794900000000 implements MigrationInterface {
  name = 'CourierSettlement1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "courierSettlement" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "courierSettlement"`,
    );
  }
}
