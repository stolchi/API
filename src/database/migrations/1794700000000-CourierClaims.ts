import type { MigrationInterface, QueryRunner } from 'typeorm';

/** When a courier on the way expects to arrive. */
export class CourierClaims1794700000000 implements MigrationInterface {
  name = 'CourierClaims1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "deliveryEta" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "deliveryEta"`);
  }
}
