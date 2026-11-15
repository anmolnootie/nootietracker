import { MigrationInterface, QueryRunner } from 'typeorm';

/** Control Tower team entry fields (po_tracking), one row per PO. New table only - no existing data touched. */
export class AddPoTracking1794000000000 implements MigrationInterface {
  name = 'AddPoTracking1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "po_tracking" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "poId" uuid NOT NULL, "decision" character varying, "decisionReason" character varying, "printoutReceivedOn" date, "handedOn" date, "handedTo" character varying, "ackOn" date, "ackBy" character varying, "owner" character varying, "remarks" text, "ewayBillNo" character varying, "updatedByUserId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_po_tracking_poId" UNIQUE ("poId"), CONSTRAINT "PK_po_tracking_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "po_tracking" ADD CONSTRAINT "FK_b888102e250c17c1582eb7ba235" FOREIGN KEY ("poId") REFERENCES "po_master"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "po_tracking" DROP CONSTRAINT "FK_b888102e250c17c1582eb7ba235"`);
    await queryRunner.query(`DROP TABLE "po_tracking"`);
  }
}
