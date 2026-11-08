import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A courier role in every cafe, and the courier a delivery is given to. */
export class Couriers1794600000000 implements MigrationInterface {
  name = 'Couriers1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Text instead of an enum: adding a value to an enum cannot be used in the same
    // transaction, and every new default role would need it.
    await queryRunner.query(
      `ALTER TABLE "staff_roles" ALTER COLUMN "systemKey" TYPE character varying(20) USING "systemKey"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."staff_roles_systemkey_enum"`);
    await queryRunner.query(`
      INSERT INTO "staff_roles" ("cafeId", "name", "systemKey", "permissions")
      SELECT "cafes"."id",
        -- A cafe that already made its own "Kuryer" role keeps it under that name.
        CASE WHEN EXISTS (
          SELECT 1 FROM "staff_roles" r WHERE r."cafeId" = "cafes"."id" AND r."name" = 'Kuryer'
        ) THEN 'Kuryer (standart)' ELSE 'Kuryer' END,
        'COURIER', ARRAY['DELIVERY_COURIER']
      FROM "cafes"
    `);

    await queryRunner.query(`ALTER TABLE "orders" ADD "courierId" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_courierId" ON "orders" ("courierId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_courierId" FOREIGN KEY ("courierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_courierId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_courierId"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "courierId"`);
    await queryRunner.query(
      `DELETE FROM "staff_roles" WHERE "systemKey" = 'COURIER' AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."roleId" = "staff_roles"."id")`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."staff_roles_systemkey_enum" AS ENUM('OWNER', 'CASHIER', 'WAITER', 'COOK')`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_roles" ALTER COLUMN "systemKey" TYPE "public"."staff_roles_systemkey_enum" USING "systemKey"::"public"."staff_roles_systemkey_enum"`,
    );
  }
}
