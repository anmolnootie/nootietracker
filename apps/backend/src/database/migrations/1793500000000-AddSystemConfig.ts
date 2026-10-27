import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSystemConfig1793500000000 implements MigrationInterface {
    name = 'AddSystemConfig1793500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "system_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying NOT NULL, "value" jsonb NOT NULL, "updatedByUserId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_system_configs_key" UNIQUE ("key"), CONSTRAINT "PK_system_configs_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`INSERT INTO "system_configs" ("key", "value") VALUES ('risk_thresholds', '{"black":1,"red":2,"orange":4,"yellow":7}')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "system_configs"`);
    }

}
