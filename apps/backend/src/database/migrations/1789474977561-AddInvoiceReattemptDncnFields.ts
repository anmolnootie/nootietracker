import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInvoiceReattemptDncnFields1789474977561 implements MigrationInterface {
    name = 'AddInvoiceReattemptDncnFields1789474977561'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // dispatch: AWB + invoice value/date (invoiceNumber already exists)
        await queryRunner.query(`ALTER TABLE "dispatch" ADD "awbNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "dispatch" ADD "invoiceValue" numeric(15,2)`);
        await queryRunner.query(`ALTER TABLE "dispatch" ADD "invoiceDate" TIMESTAMP`);

        // po_master: invoice-value-based Fill Rate + reattempt-clone flag
        await queryRunner.query(`ALTER TABLE "po_master" ADD "fillRatePercent" numeric(5,2)`);
        await queryRunner.query(`ALTER TABLE "po_master" ADD "isReattemptPo" boolean NOT NULL DEFAULT false`);

        // return_trackers: DNCN type/value (creditNoteNumber already doubles as the DNCN number field)
        await queryRunner.query(`CREATE TYPE "public"."return_trackers_dncntype_enum" AS ENUM('DEBIT', 'CREDIT')`);
        await queryRunner.query(`ALTER TABLE "return_trackers" ADD "dncnType" "public"."return_trackers_dncntype_enum"`);
        await queryRunner.query(`ALTER TABLE "return_trackers" ADD "dncnValue" numeric(15,2)`);

        // Invoice Bulk Upload pipeline
        await queryRunner.query(`CREATE TYPE "public"."invoice_upload_batches_status_enum" AS ENUM('PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "invoice_upload_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchCode" character varying NOT NULL, "fileName" character varying NOT NULL, "uploadedByUserId" uuid NOT NULL, "uploadedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."invoice_upload_batches_status_enum" NOT NULL DEFAULT 'PROCESSING', "totalRows" integer NOT NULL DEFAULT '0', "matchedCount" integer NOT NULL DEFAULT '0', "unmatchedCount" integer NOT NULL DEFAULT '0', "errorMessage" text, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_invoice_upload_batches_batchCode" UNIQUE ("batchCode"), CONSTRAINT "PK_invoice_upload_batches" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."invoice_import_rows_matchstatus_enum" AS ENUM('MATCHED', 'PO_NOT_FOUND', 'NO_DISPATCH_RECORD', 'INVALID')`);
        await queryRunner.query(`CREATE TABLE "invoice_import_rows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchId" uuid NOT NULL, "rowIndex" integer NOT NULL, "poNumber" character varying, "invoiceNumber" character varying, "invoiceValue" numeric(15,2), "invoiceDate" TIMESTAMP, "awbNumber" character varying, "matchStatus" "public"."invoice_import_rows_matchstatus_enum" NOT NULL, "matchedPoId" uuid, "errorMessage" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_invoice_import_rows" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "invoice_import_rows" ADD CONSTRAINT "FK_365a846567ad8352e223527796a" FOREIGN KEY ("batchId") REFERENCES "invoice_upload_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice_import_rows" DROP CONSTRAINT "FK_365a846567ad8352e223527796a"`);
        await queryRunner.query(`DROP TABLE "invoice_import_rows"`);
        await queryRunner.query(`DROP TYPE "public"."invoice_import_rows_matchstatus_enum"`);
        await queryRunner.query(`DROP TABLE "invoice_upload_batches"`);
        await queryRunner.query(`DROP TYPE "public"."invoice_upload_batches_status_enum"`);

        await queryRunner.query(`ALTER TABLE "return_trackers" DROP COLUMN "dncnValue"`);
        await queryRunner.query(`ALTER TABLE "return_trackers" DROP COLUMN "dncnType"`);
        await queryRunner.query(`DROP TYPE "public"."return_trackers_dncntype_enum"`);

        await queryRunner.query(`ALTER TABLE "po_master" DROP COLUMN "isReattemptPo"`);
        await queryRunner.query(`ALTER TABLE "po_master" DROP COLUMN "fillRatePercent"`);

        await queryRunner.query(`ALTER TABLE "dispatch" DROP COLUMN "invoiceDate"`);
        await queryRunner.query(`ALTER TABLE "dispatch" DROP COLUMN "invoiceValue"`);
        await queryRunner.query(`ALTER TABLE "dispatch" DROP COLUMN "awbNumber"`);
    }
}
