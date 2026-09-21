import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSheetTrackerImport1789972446681 implements MigrationInterface {
    name = 'AddSheetTrackerImport1789972446681'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."sheet_tracker_upload_batches_status_enum" AS ENUM('PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "sheet_tracker_upload_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchCode" character varying NOT NULL, "fileName" character varying NOT NULL, "uploadedByUserId" uuid NOT NULL, "uploadedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."sheet_tracker_upload_batches_status_enum" NOT NULL DEFAULT 'PROCESSING', "totalRows" integer NOT NULL DEFAULT '0', "appliedCount" integer NOT NULL DEFAULT '0', "skippedCount" integer NOT NULL DEFAULT '0', "errorMessage" text, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8dde8dbe25b8e93dc7e38c70725" UNIQUE ("batchCode"), CONSTRAINT "PK_678c09431df597e6df5751d80ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."sheet_tracker_rows_matchstatus_enum" AS ENUM('APPLIED', 'PO_NOT_FOUND', 'INVALID')`);
        await queryRunner.query(`CREATE TABLE "sheet_tracker_rows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchId" uuid NOT NULL, "rowIndex" integer NOT NULL, "poNumber" character varying, "invoiceNumber" character varying, "channel" character varying, "location" character varying, "dispatchDate" TIMESTAMP, "invoiceValue" numeric(15,2), "docketAwb" character varying, "deliveryPartner" character varying, "deliveryStatus" character varying, "grnStatus" character varying, "shortageValue" numeric(15,2), "damageValue" numeric(15,2), "excessValue" numeric(15,2), "netDiscrepancy" numeric(15,2), "creditNoteNumber" character varying, "matchStatus" "public"."sheet_tracker_rows_matchstatus_enum" NOT NULL, "matchedPoId" uuid, "actions" text, "errorMessage" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5e1ecd1d8d8043684fcf6424b5a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "sheet_tracker_rows" ADD CONSTRAINT "FK_14bff7bfb0c1df22e2ad77f9424" FOREIGN KEY ("batchId") REFERENCES "sheet_tracker_upload_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sheet_tracker_rows" DROP CONSTRAINT "FK_14bff7bfb0c1df22e2ad77f9424"`);
        await queryRunner.query(`DROP TABLE "sheet_tracker_rows"`);
        await queryRunner.query(`DROP TYPE "public"."sheet_tracker_rows_matchstatus_enum"`);
        await queryRunner.query(`DROP TABLE "sheet_tracker_upload_batches"`);
        await queryRunner.query(`DROP TYPE "public"."sheet_tracker_upload_batches_status_enum"`);
    }

}
