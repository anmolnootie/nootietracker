import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPoExpiredNonFulfilmentReason1790250000000 implements MigrationInterface {
    name = 'AddPoExpiredNonFulfilmentReason1790250000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."po_master_nonfulfilmentreason_enum" ADD VALUE IF NOT EXISTS 'PO_EXPIRED'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres can't drop an enum value short of recreating the type and
        // re-pointing the column - not attempted, same as AddUploadBatchCancelled.
    }

}
