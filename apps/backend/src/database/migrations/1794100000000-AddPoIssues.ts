import { MigrationInterface, QueryRunner } from 'typeorm';

/** Control Tower issues CRM (po_issues). New table only - no existing data touched. DDL as TypeORM generates it for POIssueEntity. */
export class AddPoIssues1794100000000 implements MigrationInterface {
  name = 'AddPoIssues1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "po_issues" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "poId" uuid NOT NULL, "issueType" character varying NOT NULL, "priority" character varying NOT NULL DEFAULT 'Medium', "status" character varying NOT NULL DEFAULT 'Open', "assignee" character varying, "nextActionDate" date, "description" text, "resolution" text, "raisedByUserId" uuid, "resolvedAt" TIMESTAMP, "resolvedByUserId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_696814d6a8cbd382703ac11098d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_5ef81e61a17b5da643db18e3c9" ON "po_issues" ("poId")`);
    await queryRunner.query(
      `ALTER TABLE "po_issues" ADD CONSTRAINT "FK_5ef81e61a17b5da643db18e3c98" FOREIGN KEY ("poId") REFERENCES "po_master"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "po_issues" DROP CONSTRAINT "FK_5ef81e61a17b5da643db18e3c98"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5ef81e61a17b5da643db18e3c9"`);
    await queryRunner.query(`DROP TABLE "po_issues"`);
  }
}
