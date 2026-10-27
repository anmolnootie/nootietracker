import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInvoiceImportSkipped1793600000000 implements MigrationInterface {
    name = 'AddInvoiceImportSkipped1793600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."invoice_import_rows_matchstatus_enum" ADD VALUE IF NOT EXISTS 'SKIPPED'`);
        await queryRunner.query(`ALTER TABLE "invoice_upload_batches" ADD "skippedCount" integer NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice_upload_batches" DROP COLUMN "skippedCount"`);
        // Postgres can't drop a single enum value; SKIPPED stays on the type.
    }

}
