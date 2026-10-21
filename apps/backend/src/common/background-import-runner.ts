import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';

/**
 * Generalizes bulk-import.service.ts's background-job machinery (a private
 * serial queue + in-flight tracking) so every simple batch-upload import
 * (GRN, Invoice, PRN, DN, Daily Dispatch Report, ...) gets the same "upload
 * returns immediately and processes in the background" behavior without
 * re-implementing it each time. Deliberately smaller than bulk-import's own
 * version - no cancel button here (that needs a CANCELLED status value,
 * which these entities don't have), just: don't block the HTTP request, and
 * never run two imports of the SAME type at once (two imports of the same
 * type could both look up and create the same not-yet-existing PO).
 *
 * Instantiate one PER SERVICE (not shared across different import types) -
 * it's a plain class, not a NestJS provider, so each service just holds its
 * own `private readonly runner = new BackgroundImportRunner();`.
 */
export class BackgroundImportRunner {
  private readonly logger = new Logger(BackgroundImportRunner.name);
  private queue: Promise<unknown> = Promise.resolve();
  private readonly inFlight = new Set<string>();

  isInFlight(id: string): boolean {
    return this.inFlight.has(id);
  }

  /** For failStalledBatches() below - never mistake an import this process is actively running for a stalled one. */
  getInFlightIds(): Set<string> {
    return this.inFlight;
  }

  /** Queues `work` behind any already-running import of this type and returns immediately - never awaited by the caller. */
  enqueue(id: string, work: () => Promise<void>): void {
    this.inFlight.add(id);
    this.queue = this.queue
      .then(() => work())
      .catch((err) => this.logger.error(`Background import ${id} crashed`, err as any))
      .finally(() => this.inFlight.delete(id));
  }
}

/**
 * An import whose server died mid-run stays PROCESSING forever and never
 * updates again - mark it FAILED so it doesn't look like it's still going.
 * Re-uploading the same file is the recovery path for whichever rows never
 * got written. Call from each service's listBatches()/getBatch() the same
 * way bulk-import.service.ts's own failStalledBatches() does.
 */
export async function failStalledBatches(
  repository: Repository<any>,
  inFlightIds: Set<string>,
  activeStatuses: string[],
  stallMinutes = 5,
): Promise<void> {
  const query = repository
    .createQueryBuilder()
    .update()
    .set({
      status: 'FAILED',
      errorMessage:
        'Interrupted - the server restarted or lost its connection mid-import. Upload the file again to finish: rows already imported are recognised as duplicates and skipped where this import type supports that.',
    } as any)
    .where('status IN (:...active)', { active: activeStatuses })
    .andWhere(`"updatedAt" < now() - interval '${stallMinutes} minutes'`);
  if (inFlightIds.size > 0) query.andWhere('id NOT IN (:...running)', { running: [...inFlightIds] });
  await query.execute();
}
