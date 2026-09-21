import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUploadBatchProcessedRows1789993819138 implements MigrationInterface {
    name = 'AddUploadBatchProcessedRows1789993819138'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "upload_batches" ADD "processedRows" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "upload_batches" DROP COLUMN "processedRows"`);
    }

}
