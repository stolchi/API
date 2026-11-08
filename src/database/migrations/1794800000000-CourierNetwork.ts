import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Couriers from the shared network, and cafes that send deliveries to them. */
export class CourierNetwork1794800000000 implements MigrationInterface {
  name = 'CourierNetwork1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "network_couriers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "phone" character varying(20) NOT NULL, "passwordHash" character varying(255) NOT NULL, "vehicle" character varying(12) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_network_couriers" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_network_couriers_phone" ON "network_couriers" ("phone")`,
    );
    await queryRunner.query(
      `CREATE TABLE "network_courier_sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "courierId" uuid NOT NULL, "tokenHash" character varying(64) NOT NULL, "familyId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_network_courier_sessions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_network_courier_sessions_courierId" ON "network_courier_sessions" ("courierId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_network_courier_sessions_tokenHash" ON "network_courier_sessions" ("tokenHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_network_courier_sessions_familyId" ON "network_courier_sessions" ("familyId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "network_courier_sessions" ADD CONSTRAINT "FK_network_courier_sessions_courierId" FOREIGN KEY ("courierId") REFERENCES "network_couriers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "cafes" ADD "deliveryMode" character varying(10) NOT NULL DEFAULT 'OWN'`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD "latitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD "longitude" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "cafes" ADD CONSTRAINT "CHK_cafes_location_whole" CHECK (("latitude" IS NULL) = ("longitude" IS NULL))`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders" ADD "offeredAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD "networkCourierId" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_networkCourierId" ON "orders" ("networkCourierId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_networkCourierId" FOREIGN KEY ("networkCourierId") REFERENCES "network_couriers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // One courier per delivery: the cafe's own, or one from the network.
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_one_courier" CHECK ("courierId" IS NULL OR "networkCourierId" IS NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_one_courier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_networkCourierId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_orders_networkCourierId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "networkCourierId"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "offeredAt"`);
    await queryRunner.query(
      `ALTER TABLE "cafes" DROP CONSTRAINT "CHK_cafes_location_whole"`,
    );
    await queryRunner.query(`ALTER TABLE "cafes" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "cafes" DROP COLUMN "latitude"`);
    await queryRunner.query(`ALTER TABLE "cafes" DROP COLUMN "deliveryMode"`);
    await queryRunner.query(`DROP TABLE "network_courier_sessions"`);
    await queryRunner.query(`DROP TABLE "network_couriers"`);
  }
}
