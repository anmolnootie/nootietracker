import { MigrationInterface, QueryRunner } from "typeorm";

// automation.service.ts's recallCheck used to do "look up the Recall row,
// insert one if missing" as two separate steps, so two overlapping passes
// reaching the same PO together could both insert - live had 6 POs with two
// RECALL_NOT_DELIVERED rows apiece and, since each insert also raised its own
// credit-note task, two duplicate RETURN_CN tasks per PO too. The code now
// goes through ReturnsService.createIfMissing() (a per-PO lock), which only
// lets the winner raise the task; this migration cleans up what already
// happened and adds the database-level guarantee for return_trackers.
//
// Data safety:
//  - return_trackers: within a duplicate group, keeps whichever row has a
//    rootCause (real, human-entered data) if one does; otherwise keeps the
//    earliest. Deletes only the others IN THAT SAME GROUP - a PO with two
//    return_trackers rows of genuinely DIFFERENT types (e.g. one RECALL_NOT_
//    DELIVERED, one REJECTED_GRN) is not "duplicate" and is left alone.
//  - tasks: within a PO+taskType group that is ALL still-open (nothing
//    COMPLETED to protect), keeps the earliest and deletes the rest - a
//    completed task is never touched, and never deleted.
//  - The unique index on return_trackers.poId is only added if no PO still
//    has two rows afterwards; otherwise it's skipped with a notice rather
//    than failing the boot.
export class DedupeReturnTrackers1790340000000 implements MigrationInterface {
    name = 'DedupeReturnTrackers1790340000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DELETE FROM return_trackers rt
            USING (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY "poId", "returnType"
                           ORDER BY (CASE WHEN "rootCause" IS NOT NULL THEN 0 ELSE 1 END), "createdAt", id
                       ) AS rn
                FROM return_trackers
            ) d
            WHERE rt.id = d.id AND d.rn > 1
        `);

        await queryRunner.query(`
            DELETE FROM tasks t
            USING (
                SELECT id,
                       ROW_NUMBER() OVER (PARTITION BY "poId", "taskType" ORDER BY "createdAt", id) AS rn,
                       COUNT(*) FILTER (WHERE status = 'COMPLETED') OVER (PARTITION BY "poId", "taskType") AS completed_count
                FROM tasks
                WHERE "taskType" = 'RETURN_CN'
            ) d
            WHERE t.id = d.id AND d.rn > 1 AND d.completed_count = 0
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM return_trackers GROUP BY "poId" HAVING count(*) > 1) THEN
                    RAISE NOTICE 'return_trackers: some POs still have several rows (different return types, or duplicates with real data in both) - unique index on poId NOT created, resolve those by hand';
                ELSE
                    CREATE UNIQUE INDEX IF NOT EXISTS "UQ_return_trackers_poId" ON return_trackers ("poId");
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // The index is dropped; the deleted duplicate rows are not restored.
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_return_trackers_poId"`);
    }

}
