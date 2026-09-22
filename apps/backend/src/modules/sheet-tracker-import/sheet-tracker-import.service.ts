import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { format } from 'date-fns';

import { SheetTrackerUploadBatchEntity } from '../../database/entities/sheet-tracker-upload-batch.entity';
import { SheetTrackerRowEntity } from '../../database/entities/sheet-tracker-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { GRNOutcome } from '@po-control-tower/shared';
import { FileReaderService, ParsedFile } from '../bulk-import/file-reader.service';
import { POService } from '../po/po.service';

// The "Master Dispatch & GRN Tracker" sheet: one row per PO carrying its
// dispatch details, delivery dates, and GRN reconciliation. Headers are
// matched by the same small normalize/exact/partial approach as the other
// upload pipelines (exact pass first, so "GRN Status" never gets taken by
// the plain "Status" alias).
type Field =
  | 'dispatchDate' | 'poNumber' | 'invoiceNumber' | 'channel' | 'location' | 'invoiceValue'
  | 'docketAwb' | 'deliveryPartner' | 'deliveryStatus' | 'comment' | 'expiryDate' | 'appointmentDate'
  | 'grnStatus' | 'shortageQty' | 'shortageValue' | 'damageQty' | 'damageValue' | 'excessQty'
  | 'excessValue' | 'netDiscrepancy' | 'creditNoteNumber' | 'creditNoteValue';

const ALIASES: Record<Field, string[]> = {
  dispatchDate: ['dispatch date'],
  poNumber: ['po number', 'po no', 'po id'],
  invoiceNumber: ['invoice number', 'invoice no', 'voucher no'],
  channel: ['channel', 'sales channel', 'party name'],
  location: ['location / hub', 'location', 'hub'],
  invoiceValue: ['invoice value', 'invoice amount'],
  docketAwb: ['docket / awb number', 'awb number', 'docket number', 'awb', 'docket'],
  deliveryPartner: ['delivery partner', 'transporter'],
  deliveryStatus: ['status', 'delivery status'],
  comment: ['comment', 'comments', 'remarks'],
  // "Expriy Date" is how the real sheet spells it
  expiryDate: ['expiry date', 'expriy date', 'po expiry date'],
  appointmentDate: ['appointment date'],
  grnStatus: ['grn status'],
  shortageQty: ['shortage qty'],
  shortageValue: ['shortage value'],
  damageQty: ['damage qty'],
  damageValue: ['damage value'],
  excessQty: ['excess qty'],
  excessValue: ['excess value'],
  netDiscrepancy: ['net discrepancy'],
  creditNoteNumber: ['credit note #', 'credit note number', 'credit note no'],
  creditNoteValue: ['credit note value'],
};

function text(v: any): string | null {
  if (v === undefined || v === null || v === '') return null;
  return String(v).trim() || null;
}

function num(v: any): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  const s = String(v ?? '').replace(/[,₹$\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function date(v: any): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = String(v ?? '').trim();
  if (!s) return null;
  // "2026-04-07" (what the Google Sheet script sends) - build the local date
  // directly; new Date('2026-04-07') would be UTC midnight and can land on the
  // previous day depending on server timezone.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const d = new Date(Number(y), Number(dmy[2]) - 1, Number(dmy[1]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  // "07-Apr-2026" style
  const named = s.match(/^(\d{1,2})[ /-]([A-Za-z]{3,9})[ /-](\d{4})$/);
  if (named) {
    const d = new Date(`${named[1]} ${named[2]} ${named[3]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const native = new Date(s);
  return Number.isNaN(native.getTime()) ? null : native;
}

// A sheet missing any of these isn't the tracker - refuse rather than misapply.
const REQUIRED_FIELDS: Field[] = ['poNumber', 'invoiceNumber', 'grnStatus'];

// Compare calendar days (dates in the sheet carry no meaningful time).
function sameDay(a: Date | string | null | undefined, b: Date | null): boolean {
  if (!a || !b) return false;
  const x = new Date(a);
  return x.getFullYear() === b.getFullYear() && x.getMonth() === b.getMonth() && x.getDate() === b.getDate();
}

const GRN_DONE = new Set(['completed', 'complete', 'done', 'received', 'closed']);

// The tracker can carry more than one row for the same PO Number (multiple
// SKU lines, multiple shipment legs, ...). Rows for one PO are applied in
// whatever order they appear in the sheet, each straight-up overwriting
// dispatchStatus - so a later, less-advanced row ("In Transit") could
// silently undo an already-recorded more-advanced one ("Delivered") from an
// earlier row, even within the very same sync. Rank the forward-progress
// spellings and refuse to move backward through them. Terminal negative
// outcomes (RTO/Returned/Cancelled) and any unrecognised text sit outside
// this chain and are always applied, same as before.
const DELIVERY_STATUS_RANK: Record<string, number> = { DISPATCHED: 1, INVOICED: 2, INTRANSIT: 3, DELIVERED: 4 };
function deliveryStatusRank(raw: string | null | undefined): number | null {
  if (!raw) return null;
  return DELIVERY_STATUS_RANK[raw.toUpperCase().replace(/[^A-Z]/g, '')] ?? null;
}

@Injectable()
export class SheetTrackerImportService {
  private readonly logger = new Logger(SheetTrackerImportService.name);

  constructor(
    @InjectRepository(SheetTrackerUploadBatchEntity)
    private readonly batchRepository: Repository<SheetTrackerUploadBatchEntity>,
    @InjectRepository(SheetTrackerRowEntity)
    private readonly rowRepository: Repository<SheetTrackerRowEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(DispatchEntity)
    private readonly dispatchRepository: Repository<DispatchEntity>,
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepository: Repository<AppointmentEntity>,
    @InjectRepository(GRNTrackerEntity)
    private readonly grnRepository: Repository<GRNTrackerEntity>,
    private readonly fileReaderService: FileReaderService,
    private readonly poService: POService,
  ) {}

  async processFile(buffer: Buffer, fileName: string, uploadedByUserId: string): Promise<SheetTrackerUploadBatchEntity> {
    return this.processParsed(this.fileReaderService.read(buffer, fileName), fileName, uploadedByUserId, null);
  }

  /**
   * Automatic sync from the Google Sheet (pushed by an Apps Script). Refuses
   * a sheet whose headers don't look like the tracker rather than guessing,
   * and does nothing if the rows are identical to the last sync's.
   */
  async syncFromGrid(grid: any[][]): Promise<{ unchanged: true } | { busy: true; batchCode: string } | SheetTrackerUploadBatchEntity> {
    if (!Array.isArray(grid) || grid.length === 0) throw new BadRequestException('No rows received');

    const parsed = this.fileReaderService.fromGrid(grid);
    const mapping = this.mapHeaders(parsed.headers);
    const missing = REQUIRED_FIELDS.filter((f) => !mapping[f]);
    if (missing.length) {
      throw new BadRequestException(
        `Sheet headers don't look like the Master Dispatch & GRN Tracker - couldn't find: ${missing.map((f) => ALIASES[f][0]).join(', ')}. Nothing was applied.`,
      );
    }

    const hash = createHash('sha256').update(JSON.stringify(parsed.rows)).digest('hex');
    const last = await this.batchRepository.findOne({ where: { status: 'COMPLETED' }, order: { uploadedAt: 'DESC' } });
    // Identical sheet = nothing to do - unless some of its rows were skipped last
    // time because their PO didn't exist yet and it does now (e.g. the PO import
    // finished after the sheet was first synced). Those rows still need applying.
    if (last?.payloadHash === hash && !(await this.hasRowsWhosePoHasSinceArrived(last.id))) return { unchanged: true };

    // Applying ~2,000 rows takes minutes against a remote database - longer
    // than Google's script will wait for a reply. So: refuse to overlap a run
    // that's still going, then answer right away and finish in the background
    // (the outcome shows on the batch, like any upload).
    // A running sync saves progress every few seconds (which bumps updatedAt).
    // A PROCESSING batch that hasn't moved for 5 minutes died with its server
    // (restart/redeploy) - mark it failed so it can't block the next sync.
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    await this.batchRepository
      .createQueryBuilder()
      .update()
      .set({ status: 'FAILED', errorMessage: 'Interrupted (the server restarted mid-run) - the next sync redoes it' })
      .where("status = 'PROCESSING' AND \"updatedAt\" < :stale", { stale })
      .execute();
    const running = await this.batchRepository.findOne({ where: { status: 'PROCESSING' }, order: { uploadedAt: 'DESC' } });
    if (running) return { busy: true, batchCode: running.batchCode };

    const batch = await this.createBatch('Google Sheet sync', null, hash);
    void this.runBatch(batch, parsed).catch((err) => this.logger.error(`Background sync ${batch.batchCode} crashed`, err as any));
    return batch;
  }

  private async hasRowsWhosePoHasSinceArrived(batchId: string): Promise<boolean> {
    const [{ n }] = await this.rowRepository.query(
      `SELECT count(*)::int AS n FROM sheet_tracker_rows r
       WHERE r."batchId" = $1 AND r."matchStatus" = 'PO_NOT_FOUND'
         AND EXISTS (SELECT 1 FROM po_master p WHERE p."poNumber" = r."poNumber")`,
      [batchId],
    );
    return n > 0;
  }

  private async processParsed(
    parsed: ParsedFile,
    fileName: string,
    uploadedByUserId: string | null,
    payloadHash: string | null,
  ): Promise<SheetTrackerUploadBatchEntity> {
    return this.runBatch(await this.createBatch(fileName, uploadedByUserId, payloadHash), parsed);
  }

  private async createBatch(fileName: string, uploadedByUserId: string | null, payloadHash: string | null) {
    const batchCode = await this.generateBatchCode();
    return this.batchRepository.save(
      this.batchRepository.create({ batchCode, fileName, uploadedByUserId, payloadHash, status: 'PROCESSING' }),
    );
  }

  private async runBatch(created: SheetTrackerUploadBatchEntity, parsed: ParsedFile): Promise<SheetTrackerUploadBatchEntity> {
    let batch = created;
    try {
      const mapping = this.mapHeaders(parsed.headers);

      // Read every row into typed values first; a row with no PO number is a
      // blank/subtotal line, not a tracker row.
      const candidates: { index: number; r: any }[] = [];
      parsed.rows.forEach((row, index) => {
        const get = (f: Field) => (mapping[f] ? row[mapping[f]!] : undefined);
        const poNumber = text(get('poNumber'));
        if (!poNumber) return;
        candidates.push({
          index,
          r: {
            poNumber,
            invoiceNumber: text(get('invoiceNumber')),
            channel: text(get('channel')),
            location: text(get('location')),
            dispatchDate: date(get('dispatchDate')),
            invoiceValue: num(get('invoiceValue')),
            docketAwb: text(get('docketAwb')),
            deliveryPartner: text(get('deliveryPartner')),
            deliveryStatus: text(get('deliveryStatus')),
            comment: text(get('comment')),
            expiryDate: date(get('expiryDate')),
            appointmentDate: date(get('appointmentDate')),
            grnStatus: text(get('grnStatus')),
            shortageQty: num(get('shortageQty')) ?? 0,
            shortageValue: num(get('shortageValue')) ?? 0,
            damageQty: num(get('damageQty')) ?? 0,
            damageValue: num(get('damageValue')) ?? 0,
            excessQty: num(get('excessQty')) ?? 0,
            excessValue: num(get('excessValue')) ?? 0,
            netDiscrepancy: num(get('netDiscrepancy')),
            creditNoteNumber: text(get('creditNoteNumber')),
            creditNoteValue: num(get('creditNoteValue')),
          },
        });
      });

      // Total known up front, so the batch shows "n of total" while it runs.
      batch.totalRows = candidates.length;
      batch = await this.batchRepository.save(batch);

      // Load everything the sheet refers to in a handful of queries rather than
      // several per row - against a remote database that's the difference
      // between seconds and an hour.
      const poNumbers = [...new Set(candidates.map((c) => c.r.poNumber as string))];
      const pos = await this.loadInChunks(poNumbers, (chunk) => this.poRepository.find({ where: { poNumber: In(chunk) } }));
      const poByNumber = new Map(pos.map((po) => [po.poNumber, po]));
      const poIds = pos.map((po) => po.id);
      const dispatchByPo = new Map((await this.loadInChunks(poIds, (c) => this.dispatchRepository.find({ where: { poId: In(c) } }))).map((d) => [d.poId, d]));
      const appointmentByPo = new Map((await this.loadInChunks(poIds, (c) => this.appointmentRepository.find({ where: { poId: In(c) } }))).map((a) => [a.poId, a]));
      const grnByPo = new Map((await this.loadInChunks(poIds, (c) => this.grnRepository.find({ where: { poId: In(c) } }))).map((g) => [g.poId, g]));

      let applied = 0;
      let skipped = 0;
      let pending: SheetTrackerRowEntity[] = [];
      let lastFlush = Date.now();

      const flush = async () => {
        if (pending.length) await this.rowRepository.save(pending, { chunk: 100 });
        pending = [];
        // Saving the batch also bumps updatedAt, which is how a stalled sync
        // (server restarted mid-run) is told apart from a busy one.
        batch.appliedCount = applied;
        batch.skippedCount = skipped;
        batch = await this.batchRepository.save(batch);
        lastFlush = Date.now();
      };

      for (const { index, r } of candidates) {
        const po = poByNumber.get(r.poNumber);
        const result = po
          ? await this.applyRow(r, po, dispatchByPo.get(po.id), appointmentByPo.get(po.id), grnByPo)
          : { matchStatus: 'PO_NOT_FOUND' as const, matchedPoId: null, netDiscrepancy: r.netDiscrepancy, actions: null, errorMessage: `No PO found with number ${r.poNumber}` };

        pending.push(
          this.rowRepository.create({
            batchId: batch.id,
            rowIndex: index,
            poNumber: r.poNumber,
            invoiceNumber: r.invoiceNumber,
            channel: r.channel,
            location: r.location,
            dispatchDate: r.dispatchDate,
            invoiceValue: r.invoiceValue,
            docketAwb: r.docketAwb,
            deliveryPartner: r.deliveryPartner,
            deliveryStatus: r.deliveryStatus,
            grnStatus: r.grnStatus,
            shortageValue: r.shortageValue,
            damageValue: r.damageValue,
            excessValue: r.excessValue,
            netDiscrepancy: result.netDiscrepancy,
            creditNoteNumber: r.creditNoteNumber,
            matchStatus: result.matchStatus,
            matchedPoId: result.matchedPoId,
            actions: result.actions,
            errorMessage: result.errorMessage,
          }),
        );
        if (result.matchStatus === 'APPLIED') applied++;
        else skipped++;

        if (pending.length >= 50 || Date.now() - lastFlush > 10_000) await flush();
      }
      await flush();

      batch.totalRows = applied + skipped;
      batch.appliedCount = applied;
      batch.skippedCount = skipped;
      batch.status = 'COMPLETED';
      batch = await this.batchRepository.save(batch);
    } catch (err) {
      this.logger.error(`Sheet tracker import failed for batch ${batch.batchCode}`, err as any);
      batch.status = 'FAILED';
      batch.errorMessage = (err as Error).message;
      batch = await this.batchRepository.save(batch);
    }
    return batch;
  }

  private async loadInChunks<T, K>(keys: K[], load: (chunk: K[]) => Promise<T[]>): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < keys.length; i += 1000) out.push(...(await load(keys.slice(i, i + 1000))));
    return out;
  }

  /**
   * The tracker is the master record, so unlike the single-purpose uploads it
   * updates several parts of a PO at once - but only ever with what the row
   * actually carries (blank cells never overwrite existing data), only where
   * the value actually differs (so re-syncing an unchanged sheet does almost
   * no work), and each part reports what it did so nothing changes silently.
   * Status/risk/dispatch-window recalculation is left to the 5-minute
   * automation sweep, which already does it for every open PO.
   */
  private async applyRow(
    r: any,
    po: POMasterEntity,
    dispatch: DispatchEntity | undefined,
    appointment: AppointmentEntity | undefined,
    grnByPo: Map<string, GRNTrackerEntity>,
  ): Promise<{
    matchStatus: SheetTrackerRowEntity['matchStatus'];
    matchedPoId: string | null;
    netDiscrepancy: number | null;
    actions: string | null;
    errorMessage: string | null;
  }> {
    const actions: string[] = [];
    // Net discrepancy as the sheet defines it: shortage + damage - excess.
    const net = r.netDiscrepancy ?? r.shortageValue + r.damageValue - r.excessValue;

    // ---- Dispatch details
    if (dispatch) {
      let changed = false;
      let invoiceValueChanged = false;
      const setIf = (differs: boolean, apply: () => void) => {
        if (differs) {
          apply();
          changed = true;
        }
      };
      setIf(!!r.dispatchDate && !sameDay(dispatch.actualDispatchDate, r.dispatchDate), () => (dispatch.actualDispatchDate = r.dispatchDate));
      setIf(!!r.invoiceNumber && dispatch.invoiceNumber !== r.invoiceNumber, () => (dispatch.invoiceNumber = r.invoiceNumber));
      if (r.invoiceValue != null && Number(dispatch.invoiceValue) !== r.invoiceValue) {
        dispatch.invoiceValue = r.invoiceValue;
        changed = invoiceValueChanged = true;
      }
      setIf(!!r.docketAwb && dispatch.awbNumber !== r.docketAwb, () => (dispatch.awbNumber = r.docketAwb));
      setIf(!!r.deliveryPartner && dispatch.transporterId !== r.deliveryPartner, () => (dispatch.transporterId = r.deliveryPartner));
      const newRank = deliveryStatusRank(r.deliveryStatus);
      const oldRank = deliveryStatusRank(dispatch.dispatchStatus);
      const isRegression = newRank !== null && oldRank !== null && newRank < oldRank;
      setIf(!!r.deliveryStatus && dispatch.dispatchStatus !== r.deliveryStatus && !isRegression, () => (dispatch.dispatchStatus = r.deliveryStatus));
      setIf(!!r.comment && dispatch.remarks !== r.comment, () => (dispatch.remarks = r.comment));
      if (changed) {
        await this.dispatchRepository.save(dispatch);
        actions.push('Dispatch updated');
        if (invoiceValueChanged) await this.poService.recomputeFillRate(po.id);
      }
    }

    // ---- Appointment + expiry
    if (appointment && r.appointmentDate && !sameDay(appointment.appointmentDate, r.appointmentDate)) {
      appointment.appointmentDate = r.appointmentDate;
      await this.appointmentRepository.save(appointment);
      actions.push('Appointment date set');
    }
    if (r.expiryDate && !sameDay(po.poExpiryDate, r.expiryDate)) {
      po.poExpiryDate = r.expiryDate;
      await this.poRepository.save(po);
      actions.push('Expiry date set');
    }

    // ---- GRN reconciliation (only once the sheet says the GRN is done)
    let grnError: string | null = null;
    if (r.grnStatus && GRN_DONE.has(r.grnStatus.toLowerCase().replace(/[^a-z]/g, ''))) {
      try {
        const done = await this.applyGrn(po.id, r, net, grnByPo);
        if (done) actions.push(done);
      } catch (err) {
        grnError = `GRN not recorded: ${(err as Error).message}`;
      }
    }

    return {
      matchStatus: grnError ? 'INVALID' : 'APPLIED',
      matchedPoId: po.id,
      netDiscrepancy: net,
      actions: actions.length ? actions.join(' · ') : 'No changes - sheet matched what the system already had',
      errorMessage: grnError,
    };
  }

  private async applyGrn(poId: string, r: any, net: number, grnByPo: Map<string, GRNTrackerEntity>): Promise<string | null> {
    const existing = grnByPo.get(poId);
    const hasShort = r.shortageQty > 0 || r.shortageValue > 0;
    const hasDamage = r.damageQty > 0 || r.damageValue > 0;
    const hasExcess = r.excessQty > 0 || r.excessValue > 0;
    let outcome: GRNOutcome;
    if (hasShort && hasDamage) outcome = GRNOutcome.MISMATCHED;
    else if (hasShort) outcome = GRNOutcome.SHORTAGE;
    else if (hasDamage) outcome = GRNOutcome.DAMAGE;
    else if (hasExcess) outcome = GRNOutcome.OTHER; // received more than invoiced
    else if (net !== 0) outcome = GRNOutcome.MISMATCHED; // sheet shows a discrepancy but no breakdown
    else outcome = GRNOutcome.MATCHED;

    // The sheet has no GRN number or received value: GRN number is the
    // invoice number, and the received value is the invoice value less the
    // net discrepancy.
    const grnNumber = r.invoiceNumber;
    if (!grnNumber) throw new Error('an Invoice Number is needed to record the GRN');
    const grnValue = r.invoiceValue != null ? r.invoiceValue - net : 0;

    const notes = [
      hasShort ? `Shortage ${r.shortageQty} unit(s) / ₹${r.shortageValue}` : null,
      hasDamage ? `Damage ${r.damageQty} unit(s) / ₹${r.damageValue}` : null,
      hasExcess ? `Excess ${r.excessQty} unit(s) / ₹${r.excessValue}` : null,
      r.creditNoteValue != null ? `Credit note value ₹${r.creditNoteValue}` : null,
    ].filter(Boolean) as string[];
    const reason = notes.length ? `${notes.join('; ')} (per master tracker)` : '';
    const remarks = notes.length ? notes.join('; ') : null;

    if (!existing?.grnDate) {
      // First time this PO's GRN is recorded: full recordGRN path so mapping
      // recovery, task completion, and NO_GRN/discrepancy handling all fire.
      await this.poService.recordGRN(poId, {
        grnNumber,
        grnValue,
        outcome,
        discrepancyReason: outcome === GRNOutcome.MATCHED ? undefined : reason || 'Discrepancy per master tracker',
        discrepancyAmount: net,
      });
      const grn = await this.grnRepository.findOneByOrFail({ poId });
      grn.shortQuantity = r.shortageQty || null;
      grn.rejectedQuantity = r.damageQty || null;
      if (r.creditNoteNumber) grn.creditNoteNumber = r.creditNoteNumber;
      if (remarks) grn.remarks = remarks;
      await this.grnRepository.save(grn);
      // Later rows for the same PO (the sheet has several) must see this GRN
      // as already recorded, not record it a second time.
      grnByPo.set(poId, grn);
      return `GRN recorded (${outcome})`;
    }

    // Already recorded (an earlier sync, or a manual entry): refresh the
    // reconciliation figures in place - and only if they differ - without
    // re-firing side effects like duplicate discrepancy tasks.
    const nextReason = outcome === GRNOutcome.MATCHED ? '' : reason;
    const differs =
      Number(existing.grnValue) !== grnValue ||
      existing.outcome !== outcome ||
      Number(existing.discrepancyAmount ?? 0) !== net ||
      (existing.discrepancyReason ?? '') !== nextReason ||
      Number(existing.shortQuantity ?? 0) !== (r.shortageQty || 0) ||
      Number(existing.rejectedQuantity ?? 0) !== (r.damageQty || 0) ||
      (!!r.creditNoteNumber && existing.creditNoteNumber !== r.creditNoteNumber) ||
      (!!remarks && existing.remarks !== remarks);
    if (!differs) return null;

    existing.grnValue = grnValue;
    existing.outcome = outcome;
    existing.discrepancyAmount = net;
    existing.discrepancyReason = nextReason;
    existing.shortQuantity = r.shortageQty || null;
    existing.rejectedQuantity = r.damageQty || null;
    if (r.creditNoteNumber) existing.creditNoteNumber = r.creditNoteNumber;
    if (remarks) existing.remarks = remarks;
    await this.grnRepository.save(existing);
    return 'GRN figures refreshed';
  }

  private mapHeaders(headers: string[]): Partial<Record<Field, string>> {
    const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) })).filter((h) => h.norm !== '');
    const used = new Set<string>();
    const mapping: Partial<Record<Field, string>> = {};
    const fields = Object.keys(ALIASES) as Field[];

    const find = (aliases: string[], exact: boolean): string | null => {
      for (const alias of aliases) {
        const na = normalize(alias);
        if (na === '') continue;
        const match = normalized.find((h) => !used.has(h.raw) && (exact ? h.norm === na : h.norm.includes(na)));
        if (match) return match.raw;
      }
      return null;
    };

    for (const pass of [true, false]) {
      for (const field of fields) {
        if (mapping[field]) continue;
        const hit = find(ALIASES[field], pass);
        if (hit) {
          mapping[field] = hit;
          used.add(hit);
        }
      }
    }
    return mapping;
  }

  private async generateBatchCode(): Promise<string> {
    const datePart = format(new Date(), 'yyyyMMdd');
    // Numbered from the highest existing code, not a count: deleting a batch
    // from history would otherwise make the next code collide with a survivor.
    const latest = await this.batchRepository.findOne({ where: { batchCode: Like(`SHT-${datePart}-%`) }, order: { batchCode: 'DESC' } });
    const next = parseInt((latest?.batchCode ?? '').split('-').pop() || '0', 10) + 1;
    return `SHT-${datePart}-${String(next).padStart(3, '0')}`;
  }

  async listBatches() {
    return this.batchRepository.find({ order: { uploadedAt: 'DESC' } });
  }

  async getBatch(id: string) {
    return this.batchRepository.findOneByOrFail({ id });
  }

  async getRows(batchId: string) {
    return this.rowRepository.find({ where: { batchId }, order: { rowIndex: 'ASC' } });
  }

  /** Removes the upload record only - never undoes what was applied to POs. */
  async deleteBatch(id: string): Promise<void> {
    await this.batchRepository.delete(id);
  }
}
