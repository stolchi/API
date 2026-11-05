import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793910636671 implements MigrationInterface {
  name = 'InitialSchema1793910636671';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cafes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "slug" character varying(80) NOT NULL, "logoUrl" character varying(500), "primaryColor" character varying(7), "phone" character varying(20), "address" character varying(255), "workingHours" jsonb, "currency" character varying(3) NOT NULL DEFAULT 'UZS', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_1e8e00a60bc4dd368d8d55a1d7e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ebc025fc40ea1c22c5293bb11c" ON "cafes"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tables" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cafeId" uuid NOT NULL, "name" character varying(60) NOT NULL, "zone" character varying(60), "qrToken" character varying(64) NOT NULL, CONSTRAINT "PK_7cf2aca7af9550742f855d4eb69" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_abaf622190a7d09033f5a6fc1a" ON "tables"  ("cafeId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0fc85221960b588e27d825c4ab" ON "tables"  ("qrToken") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f0dea5ba1e2db0b2020b7df8b0" ON "tables"  ("cafeId", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cafeId" uuid NOT NULL, "name" character varying(120) NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d28705261b7dd30bdafb5f1e75" ON "categories"  ("cafeId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('SUPER_ADMIN', 'OWNER', 'CASHIER', 'WAITER', 'COOK')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cafeId" uuid, "name" character varying(120) NOT NULL, "phone" character varying(20) NOT NULL, "passwordHash" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL, "pinCode" character varying(255), CONSTRAINT "CHK_users_cafe_matches_role" CHECK (("role" = 'SUPER_ADMIN' AND "cafeId" IS NULL) OR ("role" <> 'SUPER_ADMIN' AND "cafeId" IS NOT NULL)), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_24bfb9adf5b991d76101742177" ON "users"  ("cafeId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a000cca60bcf04454e72769949" ON "users"  ("phone") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_source_enum" AS ENUM('POS', 'QR', 'TELEGRAM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_type_enum" AS ENUM('DINE_IN', 'TAKEAWAY', 'DELIVERY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('NEW', 'ACCEPTED', 'COOKING', 'READY', 'SERVED', 'PAID', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cafeId" uuid NOT NULL, "number" integer NOT NULL, "businessDate" date NOT NULL, "source" "public"."orders_source_enum" NOT NULL, "type" "public"."orders_type_enum" NOT NULL, "tableId" uuid, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'NEW', "customerName" character varying(120), "customerPhone" character varying(20), "telegramUserId" bigint, "total" integer NOT NULL DEFAULT '0', "note" text, "createdById" uuid, "publicToken" uuid NOT NULL DEFAULT gen_random_uuid(), CONSTRAINT "CHK_orders_total_not_negative" CHECK ("total" >= 0), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_56a8525037d782243c9363c99c" ON "orders"  ("cafeId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_16e332224a80e41e624133f536" ON "orders"  ("publicToken") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b5e993756840478eeddcede3b8" ON "orders"  ("cafeId", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_71809baa9c56c441da8500ac9e" ON "orders"  ("cafeId", "businessDate", "number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cafeId" uuid NOT NULL, "categoryId" uuid NOT NULL, "name" character varying(160) NOT NULL, "description" text, "price" integer NOT NULL, "imageUrl" character varying(500), "isAvailable" boolean NOT NULL DEFAULT true, "sortOrder" integer NOT NULL DEFAULT '0', CONSTRAINT "CHK_products_price_not_negative" CHECK ("price" >= 0), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a368ca8bf88d5acd8756aade83" ON "products"  ("cafeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ff56834e735fa78a15d0cf2192" ON "products"  ("categoryId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orderId" uuid NOT NULL, "productId" uuid, "nameSnapshot" character varying(160) NOT NULL, "priceSnapshot" integer NOT NULL, "quantity" integer NOT NULL, "note" text, CONSTRAINT "CHK_order_items_price_not_negative" CHECK ("priceSnapshot" >= 0), CONSTRAINT "CHK_order_items_quantity_positive" CHECK ("quantity" > 0), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f1d359a55923bb45b057fbdab0" ON "order_items"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_method_enum" AS ENUM('CASH', 'CARD', 'CLICK', 'PAYME')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orderId" uuid NOT NULL, "method" "public"."payments_method_enum" NOT NULL, "amount" integer NOT NULL, CONSTRAINT "CHK_payments_amount_positive" CHECK ("amount" > 0), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af929a5f2a400fdb6913b4967e" ON "payments"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "tokenHash" character varying(64) NOT NULL, "familyId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_40e9a8b923a1b3fb4429a5c624" ON "refresh_tokens"  ("familyId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "telegram_bots" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cafeId" uuid NOT NULL, "tokenEncrypted" text NOT NULL, "username" character varying(64), "webhookSecret" character varying(128) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_1d99bf3a01aa3127a7e8db5a1a4" UNIQUE ("cafeId"), CONSTRAINT "REL_1d99bf3a01aa3127a7e8db5a1a" UNIQUE ("cafeId"), CONSTRAINT "PK_9e5e0f5ed67ad4ffab01efd80cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "tables" ADD CONSTRAINT "FK_abaf622190a7d09033f5a6fc1a3" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_d28705261b7dd30bdafb5f1e753" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_24bfb9adf5b991d761017421771" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_56a8525037d782243c9363c99c7" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_2a7fdd7af437285a3ef0fc8b64f" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_39b1402eea81b07616277578fa5" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_a368ca8bf88d5acd8756aade83d" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_cdb99c05982d5191ac8465ac010" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_bots" ADD CONSTRAINT "FK_1d99bf3a01aa3127a7e8db5a1a4" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "telegram_bots" DROP CONSTRAINT "FK_1d99bf3a01aa3127a7e8db5a1a4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_cdb99c05982d5191ac8465ac010"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_ff56834e735fa78a15d0cf21926"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_a368ca8bf88d5acd8756aade83d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_39b1402eea81b07616277578fa5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_2a7fdd7af437285a3ef0fc8b64f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_56a8525037d782243c9363c99c7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_24bfb9adf5b991d761017421771"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_d28705261b7dd30bdafb5f1e753"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tables" DROP CONSTRAINT "FK_abaf622190a7d09033f5a6fc1a3"`,
    );
    await queryRunner.query(`DROP TABLE "telegram_bots"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_40e9a8b923a1b3fb4429a5c624"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c25bc63d248ca90e8dcc1d92d0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_610102b60fea1455310ccd299d"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_af929a5f2a400fdb6913b4967e"`,
    );
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f1d359a55923bb45b057fbdab0"`,
    );
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ff56834e735fa78a15d0cf2192"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a368ca8bf88d5acd8756aade83"`,
    );
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_71809baa9c56c441da8500ac9e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b5e993756840478eeddcede3b8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_16e332224a80e41e624133f536"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_56a8525037d782243c9363c99c"`,
    );
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."orders_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."orders_source_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a000cca60bcf04454e72769949"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_24bfb9adf5b991d76101742177"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d28705261b7dd30bdafb5f1e75"`,
    );
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f0dea5ba1e2db0b2020b7df8b0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0fc85221960b588e27d825c4ab"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_abaf622190a7d09033f5a6fc1a"`,
    );
    await queryRunner.query(`DROP TABLE "tables"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ebc025fc40ea1c22c5293bb11c"`,
    );
    await queryRunner.query(`DROP TABLE "cafes"`);
  }
}
