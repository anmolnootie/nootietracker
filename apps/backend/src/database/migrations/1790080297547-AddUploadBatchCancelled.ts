import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUploadBatchCancelled1790080297547 implements MigrationInterface {
    name = 'AddUploadBatchCancelled1790080297547'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."upload_batches_status_enum" ADD VALUE IF NOT EXISTS 'CANCELLED'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres has no ADD VALUE ... IF NOT EXISTS reversal short of recreating
        // the enum type (and re-pointing the column at it) - not attempted here,
        // since a CANCELLED batch already in the table would make that a data
        // migration, not a schema one. Left as a no-op.
    }

}
