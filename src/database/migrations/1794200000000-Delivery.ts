import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A delivery's address, and the reason an order was cancelled. */
export class Delivery1794200000000 implements MigrationInterface {
  name = 'Delivery1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "address" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "cancelReason" character varying(300)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "cancelReason"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "address"`);
  }
}
