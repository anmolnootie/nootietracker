import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDnImport1792397991176 implements MigrationInterface {
    name = 'AddDnImport1792397991176'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."dn_upload_batches_status_enum" AS ENUM('PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "dn_upload_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchCode" character varying NOT NULL, "fileName" character varying NOT NULL, "uploadedByUserId" uuid NOT NULL, "uploadedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."dn_upload_batches_status_enum" NOT NULL DEFAULT 'PROCESSING', "totalRows" integer NOT NULL DEFAULT '0', "errorMessage" text, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e41e3be7fc3bb46b81002d8a040" UNIQUE ("batchCode"), CONSTRAINT "PK_d1b8e26955499a256ad986b3788" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "dn_import_rows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchId" uuid NOT NULL, "rowIndex" integer NOT NULL, "facilityName" character varying, "dnId" character varying, "dnDate" TIMESTAMP, "vendorName" character varying, "vendorGstin" character varying, "purchaseNumber" character varying, "manufacturer" character varying, "invoiceId" character varying, "itemId" character varying, "productName" character varying, "upcId" character varying, "dnQuantity" integer, "unitLandingPrice" numeric(15,2), "itemDnAmount" numeric(15,2), "dnNetAmount" numeric(15,2), "remark" text, "reason" text, "errorMessage" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dfa827552429eb2c72823bf3028" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "dn_import_rows" ADD CONSTRAINT "FK_049114dcdeadd91dcbe319f6750" FOREIGN KEY ("batchId") REFERENCES "dn_upload_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dn_import_rows" DROP CONSTRAINT "FK_049114dcdeadd91dcbe319f6750"`);
        await queryRunner.query(`DROP TABLE "dn_import_rows"`);
        await queryRunner.query(`DROP TABLE "dn_upload_batches"`);
        await queryRunner.query(`DROP TYPE "public"."dn_upload_batches_status_enum"`);
    }

}
