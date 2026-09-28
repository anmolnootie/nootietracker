import { Repository } from 'typeorm';
import { GRNTrackerEntity } from './entities/grn-tracker.entity';

/**
 * Makes sure a PO has a GRN row, creating the empty placeholder only if none
 * exists. Returns true only for the caller that actually created it.
 *
 * The old pattern was "look it up, then insert if missing" as two separate
 * steps, so two callers reaching the same PO together (the bulk import and the
 * 5-minute "delivered awaiting GRN" sweep) both saw "none" and both inserted -
 * 99 live POs ended up with two GRN rows. Here the look-up and the insert run
 * inside one transaction that first takes a Postgres advisory lock keyed on the
 * PO, so a second caller waits for the first to commit and then sees its row.
 * Nothing is ever updated or deleted: an existing row is left exactly as is.
 */
export async function ensureGrnPlaceholder(repo: Repository<GRNTrackerEntity>, poId: string): Promise<boolean> {
  return repo.manager.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`grn:${poId}`]);
    if (await tx.exists(GRNTrackerEntity, { where: { poId } })) return false;
    await tx.insert(GRNTrackerEntity, { poId, slaStatus: 'ON_TIME' });
    return true;
  });
}
