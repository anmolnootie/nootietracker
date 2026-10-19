import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPrnImport1792390995713 implements MigrationInterface {
    name = 'AddPrnImport1792390995713'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."prn_upload_batches_status_enum" AS ENUM('PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "prn_upload_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchCode" character varying NOT NULL, "fileName" character varying NOT NULL, "uploadedByUserId" uuid NOT NULL, "uploadedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."prn_upload_batches_status_enum" NOT NULL DEFAULT 'PROCESSING', "totalRows" integer NOT NULL DEFAULT '0', "errorMessage" text, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fa9650433222d94ad6132806e47" UNIQUE ("batchCode"), CONSTRAINT "PK_cfda516700853cad4dc871e0a38" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "prn_import_rows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batchId" uuid NOT NULL, "rowIndex" integer NOT NULL, "lookupCategory" character varying, "fromDispatchedFc" character varying, "fromDispatchedFacilityName" character varying, "stoInvoiceId" character varying, "wmsOrderId" character varying, "posFacilityId" character varying, "posFacilityName" character varying, "gstTin" character varying, "legalName" character varying, "merchantId" character varying, "merchantName" character varying, "vendorId" character varying, "vendorName" character varying, "invoiceId" character varying, "invoiceTypeId" integer, "invoiceDescription" character varying, "posTimestamp" TIMESTAMP, "itemId" character varying, "manufacturerId" character varying, "manufacturer" character varying, "inventoryType" character varying, "upcId" character varying, "productName" character varying, "mrp" numeric(15,2), "quantity" integer, "landingPrice" numeric(15,2), "totalTax" numeric(15,2), "totalCostPrice" numeric(15,2), "prnValue" numeric(15,2), "merchantInvoiceId" character varying, "txnSign" integer, "errorMessage" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8fdee18bad15ae3da103a7a124c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "prn_import_rows" ADD CONSTRAINT "FK_53458c1e3044d3e7501ae384490" FOREIGN KEY ("batchId") REFERENCES "prn_upload_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "prn_import_rows" DROP CONSTRAINT "FK_53458c1e3044d3e7501ae384490"`);
        await queryRunner.query(`DROP TABLE "prn_import_rows"`);
        await queryRunner.query(`DROP TABLE "prn_upload_batches"`);
        await queryRunner.query(`DROP TYPE "public"."prn_upload_batches_status_enum"`);
    }

}
