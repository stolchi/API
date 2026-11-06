import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Roles become rows each cafe can edit, and staff can be deactivated. The permission
 * lists are spelled out because a migration must keep meaning what it meant today.
 */
export class StaffRoles1793990000000 implements MigrationInterface {
  name = 'StaffRoles1793990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."staff_roles_systemkey_enum" AS ENUM('OWNER', 'CASHIER', 'WAITER', 'COOK')`,
    );
    await queryRunner.query(
      `CREATE TABLE "staff_roles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cafeId" uuid NOT NULL, "name" character varying(60) NOT NULL, "systemKey" "public"."staff_roles_systemkey_enum", "permissions" text array NOT NULL DEFAULT '{}', CONSTRAINT "PK_87101d9c9d1604a36152cfad1c5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_58c8273c065b184b5fdc9d43a6" ON "staff_roles" ("cafeId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0be89faf9b8c4765fbad12bc94" ON "staff_roles" ("cafeId", "systemKey")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_867c41a8b11d0de5f13c75a292" ON "staff_roles" ("cafeId", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_roles" ADD CONSTRAINT "FK_58c8273c065b184b5fdc9d43a6c" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Every existing cafe gets the default roles.
    await queryRunner.query(`
      INSERT INTO "staff_roles" ("cafeId", "name", "systemKey", "permissions")
      SELECT "cafes"."id", defaults."name", defaults."systemKey"::"public"."staff_roles_systemkey_enum", defaults."permissions"
      FROM "cafes" CROSS JOIN (VALUES
        ('Boshliq', 'OWNER', ARRAY['DASHBOARD_VIEW','ORDERS_VIEW','ORDERS_CREATE','ORDERS_EDIT','ORDERS_CANCEL','ORDERS_SERVE','ORDERS_PAYMENT','KITCHEN_WORK','MENU_AVAILABILITY','MENU_MANAGE','TABLES_MANAGE','SETTINGS_MANAGE','STAFF_MANAGE']),
        ('Kassir', 'CASHIER', ARRAY['DASHBOARD_VIEW','ORDERS_VIEW','ORDERS_CREATE','ORDERS_EDIT','ORDERS_CANCEL','ORDERS_SERVE','ORDERS_PAYMENT','KITCHEN_WORK','MENU_AVAILABILITY']),
        ('Ofitsiant', 'WAITER', ARRAY['ORDERS_VIEW','ORDERS_CREATE','ORDERS_EDIT','ORDERS_CANCEL']),
        ('Oshpaz', 'COOK', ARRAY['KITCHEN_WORK'])
      ) AS defaults("name", "systemKey", "permissions")
    `);

    await queryRunner.query(
      `ALTER TABLE "users" ADD "isSuperAdmin" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "roleId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "isActive" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "isSuperAdmin" = true WHERE "role" = 'SUPER_ADMIN'`,
    );
    await queryRunner.query(`
      UPDATE "users" SET "roleId" = "staff_roles"."id"
      FROM "staff_roles"
      WHERE "staff_roles"."cafeId" = "users"."cafeId"
        AND "staff_roles"."systemKey"::text = "users"."role"::text
    `);

    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_cafe_matches_role"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_368e146b785b574f42ae9e53d5" ON "users" ("roleId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_staff_have_cafe_and_role" CHECK (("isSuperAdmin" AND "cafeId" IS NULL AND "roleId" IS NULL) OR (NOT "isSuperAdmin" AND "cafeId" IS NOT NULL AND "roleId" IS NOT NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_368e146b785b574f42ae9e53d5e" FOREIGN KEY ("roleId") REFERENCES "staff_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "order_items" ADD "addedQuantity" integer NOT NULL DEFAULT '0'`,
    );
  }

  /** Staff on a custom role fall back to waiter, the old role with the least reach over money. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN "addedQuantity"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('SUPER_ADMIN', 'OWNER', 'CASHIER', 'WAITER', 'COOK')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" "public"."users_role_enum"`,
    );
    await queryRunner.query(`
      UPDATE "users" SET "role" = CASE
        WHEN "users"."isSuperAdmin" THEN 'SUPER_ADMIN'
        ELSE COALESCE(
          (SELECT "systemKey"::text FROM "staff_roles" WHERE "staff_roles"."id" = "users"."roleId"),
          'WAITER'
        )
      END::"public"."users_role_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_368e146b785b574f42ae9e53d5e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_staff_have_cafe_and_role"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_368e146b785b574f42ae9e53d5"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isActive"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roleId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isSuperAdmin"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_cafe_matches_role" CHECK (("role" = 'SUPER_ADMIN' AND "cafeId" IS NULL) OR ("role" <> 'SUPER_ADMIN' AND "cafeId" IS NOT NULL))`,
    );
    await queryRunner.query(`DROP TABLE "staff_roles"`);
    await queryRunner.query(`DROP TYPE "public"."staff_roles_systemkey_enum"`);
  }
}
