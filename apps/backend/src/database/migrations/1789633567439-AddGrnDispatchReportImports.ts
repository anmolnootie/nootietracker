import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGrnDispatchReportImports1789633567439 implements MigrationInterface {
    name = 'AddGrnDispatchReportImports1789633567439'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."dispatch_report_upload_batches_status_enum" AS ENUM('PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "dispatch_report_upload_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchCode" character varying NOT NULL, "fileName" character varying NOT NULL, "platform" character varying, "uploadedByUserId" uuid NOT NULL, "uploadedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."dispatch_report_upload_batches_status_enum" NOT NULL DEFAULT 'PROCESSING', "totalRows" integer NOT NULL DEFAULT '0', "reconciledCount" integer NOT NULL DEFAULT '0', "mismatchCount" integer NOT NULL DEFAULT '0', "errorMessage" text, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b79d9c0aa5104ddefc058f3f102" UNIQUE ("batchCode"), CONSTRAINT "PK_ddc3bee62a7de6fee57b18f8672" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."dispatch_report_rows_matchstatus_enum" AS ENUM('RECONCILED', 'MISMATCH', 'INVALID')`);
        await queryRunner.query(`CREATE TABLE "dispatch_report_rows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchId" uuid NOT NULL, "rowIndex" integer NOT NULL, "poNumber" character varying, "invoiceNumber" character varying, "invoiceValue" numeric(15,2), "matchStatus" "public"."dispatch_report_rows_matchstatus_enum" NOT NULL, "matchedPoId" uuid, "errorMessage" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3aa350568d41bb7da243e4aec7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."grn_upload_batches_status_enum" AS ENUM('PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "grn_upload_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchCode" character varying NOT NULL, "fileName" character varying NOT NULL, "uploadedByUserId" uuid NOT NULL, "uploadedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."grn_upload_batches_status_enum" NOT NULL DEFAULT 'PROCESSING', "totalRows" integer NOT NULL DEFAULT '0', "matchedCount" integer NOT NULL DEFAULT '0', "unmatchedCount" integer NOT NULL DEFAULT '0', "errorMessage" text, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_35eaa3ac3a3ab4d0cca2ad4a06d" UNIQUE ("batchCode"), CONSTRAINT "PK_5bff6fc7329f235ed9d7b355226" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."grn_import_rows_matchstatus_enum" AS ENUM('MATCHED', 'PO_NOT_FOUND', 'INVALID')`);
        await queryRunner.query(`CREATE TABLE "grn_import_rows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchId" uuid NOT NULL, "rowIndex" integer NOT NULL, "poNumber" character varying, "invoiceNumber" character varying, "grnNumber" character varying, "grnValue" numeric(15,2), "outcome" character varying, "discrepancyReason" text, "discrepancyAmount" numeric(15,2), "matchStatus" "public"."grn_import_rows_matchstatus_enum" NOT NULL, "matchedPoId" uuid, "errorMessage" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_83c7c37bd1b52061a42616fa8c4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" ADD CONSTRAINT "FK_6165de7607339c127cfcc9201c8" FOREIGN KEY ("batchId") REFERENCES "dispatch_report_upload_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "grn_import_rows" ADD CONSTRAINT "FK_da22ee85961d40bb4c431ac8ea6" FOREIGN KEY ("batchId") REFERENCES "grn_upload_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "grn_import_rows" DROP CONSTRAINT "FK_da22ee85961d40bb4c431ac8ea6"`);
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" DROP CONSTRAINT "FK_6165de7607339c127cfcc9201c8"`);
        await queryRunner.query(`DROP TABLE "grn_import_rows"`);
        await queryRunner.query(`DROP TYPE "public"."grn_import_rows_matchstatus_enum"`);
        await queryRunner.query(`DROP TABLE "grn_upload_batches"`);
        await queryRunner.query(`DROP TYPE "public"."grn_upload_batches_status_enum"`);
        await queryRunner.query(`DROP TABLE "dispatch_report_rows"`);
        await queryRunner.query(`DROP TYPE "public"."dispatch_report_rows_matchstatus_enum"`);
        await queryRunner.query(`DROP TABLE "dispatch_report_upload_batches"`);
        await queryRunner.query(`DROP TYPE "public"."dispatch_report_upload_batches_status_enum"`);
    }

}
