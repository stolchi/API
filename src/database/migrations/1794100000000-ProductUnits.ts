import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Products sold by weight or in sizes, and products that skip the kitchen. */
export class ProductUnits1794100000000 implements MigrationInterface {
  name = 'ProductUnits1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."products_unit_enum" AS ENUM('PIECE', 'KG')`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "unit" "public"."products_unit_enum" NOT NULL DEFAULT 'PIECE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "variants" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "sendsToKitchen" boolean NOT NULL DEFAULT true`,
    );

    await queryRunner.query(
      `ALTER TABLE "order_items" ALTER COLUMN "nameSnapshot" TYPE character varying(240)`,
    );
    await queryRunner.query(`ALTER TABLE "order_items" ADD "variantId" uuid`);
    await queryRunner.query(
      `CREATE TYPE "public"."order_items_unit_enum" AS ENUM('PIECE', 'KG')`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD "unit" "public"."order_items_unit_enum" NOT NULL DEFAULT 'PIECE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD "weighed" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD "sendsToKitchen" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of ['sendsToKitchen', 'weighed', 'unit', 'variantId']) {
      await queryRunner.query(
        `ALTER TABLE "order_items" DROP COLUMN "${column}"`,
      );
    }
    await queryRunner.query(`DROP TYPE "public"."order_items_unit_enum"`);
    await queryRunner.query(
      `ALTER TABLE "order_items" ALTER COLUMN "nameSnapshot" TYPE character varying(160) USING left("nameSnapshot", 160)`,
    );
    for (const column of ['sendsToKitchen', 'variants', 'unit']) {
      await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "${column}"`);
    }
    await queryRunner.query(`DROP TYPE "public"."products_unit_enum"`);
  }
}
