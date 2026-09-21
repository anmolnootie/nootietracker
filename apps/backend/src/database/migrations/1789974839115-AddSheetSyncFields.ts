import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSheetSyncFields1789974839115 implements MigrationInterface {
    name = 'AddSheetSyncFields1789974839115'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sheet_tracker_upload_batches" ADD "payloadHash" character varying`);
        await queryRunner.query(`ALTER TABLE "sheet_tracker_upload_batches" ALTER COLUMN "uploadedByUserId" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sheet_tracker_upload_batches" ALTER COLUMN "uploadedByUserId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "sheet_tracker_upload_batches" DROP COLUMN "payloadHash"`);
    }

}
