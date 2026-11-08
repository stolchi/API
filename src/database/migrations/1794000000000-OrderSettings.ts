import type { MigrationInterface, QueryRunner } from 'typeorm';

/** How a cafe serves and which orders it takes, and the charges an order carries. */
export class OrderSettings1794000000000 implements MigrationInterface {
  name = 'OrderSettings1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."cafes_servicemode_enum" AS ENUM('TABLE_SERVICE', 'SELF_SERVICE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD "serviceMode" "public"."cafes_servicemode_enum" NOT NULL DEFAULT 'TABLE_SERVICE'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cafes_ordertypes_enum" AS ENUM('DINE_IN', 'TAKEAWAY', 'DELIVERY')`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD "orderTypes" "public"."cafes_ordertypes_enum" array NOT NULL DEFAULT '{DINE_IN,TAKEAWAY}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD "serviceChargePercent" smallint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD "packagingFee" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD "deliveryFee" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD CONSTRAINT "CHK_cafes_service_charge_range" CHECK ("serviceChargePercent" BETWEEN 0 AND 50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD CONSTRAINT "CHK_cafes_fees_not_negative" CHECK ("packagingFee" >= 0 AND "deliveryFee" >= 0)`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders" ADD "serviceChargePercent" smallint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "serviceCharge" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "packagingFee" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "deliveryFee" integer NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'deliveryFee',
      'packagingFee',
      'serviceCharge',
      'serviceChargePercent',
    ]) {
      await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "${column}"`);
    }
    await queryRunner.query(
      `ALTER TABLE "cafes" DROP CONSTRAINT "CHK_cafes_fees_not_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" DROP CONSTRAINT "CHK_cafes_service_charge_range"`,
    );
    for (const column of [
      'deliveryFee',
      'packagingFee',
      'serviceChargePercent',
      'orderTypes',
      'serviceMode',
    ]) {
      await queryRunner.query(`ALTER TABLE "cafes" DROP COLUMN "${column}"`);
    }
    await queryRunner.query(`DROP TYPE "public"."cafes_ordertypes_enum"`);
    await queryRunner.query(`DROP TYPE "public"."cafes_servicemode_enum"`);
  }
}
