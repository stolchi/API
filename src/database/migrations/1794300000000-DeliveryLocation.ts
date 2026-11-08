import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Where on the map a delivery goes. */
export class DeliveryLocation1794300000000 implements MigrationInterface {
  name = 'DeliveryLocation1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "latitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "longitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_location_whole" CHECK (("latitude" IS NULL) = ("longitude" IS NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_location_whole"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "latitude"`);
  }
}
