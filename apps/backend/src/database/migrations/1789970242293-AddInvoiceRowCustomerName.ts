import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInvoiceRowCustomerName1789970242293 implements MigrationInterface {
    name = 'AddInvoiceRowCustomerName1789970242293'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice_import_rows" ADD "customerName" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice_import_rows" DROP COLUMN "customerName"`);
    }

}
