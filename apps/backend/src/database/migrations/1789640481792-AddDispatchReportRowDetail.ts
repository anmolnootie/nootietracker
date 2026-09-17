import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDispatchReportRowDetail1789640481792 implements MigrationInterface {
    name = 'AddDispatchReportRowDetail1789640481792'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" ADD "partyName" character varying`);
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" ADD "location" character varying`);
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" ADD "poValue" numeric(15,2)`);
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" ADD "reportedFillRatePercent" numeric(5,2)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" DROP COLUMN "reportedFillRatePercent"`);
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" DROP COLUMN "poValue"`);
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" DROP COLUMN "location"`);
        await queryRunner.query(`ALTER TABLE "dispatch_report_rows" DROP COLUMN "partyName"`);
    }

}
