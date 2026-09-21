import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
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
  expiryDate: ['expiry date', 'po expiry date'],
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

const GRN_DONE = new Set(['completed', 'complete', 'done', 'received', 'closed']);

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
  async syncFromGrid(grid: any[][]): Promise<{ unchanged: true } | SheetTrackerUploadBatchEntity> {
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
    if (last?.payloadHash === hash) return { unchanged: true };

    return this.processParsed(parsed, 'Google Sheet sync', null, hash);
  }

  private async processParsed(
    parsed: ParsedFile,
    fileName: string,
    uploadedByUserId: string | null,
    payloadHash: string | null,
  ): Promise<SheetTrackerUploadBatchEntity> {
    const batchCode = await this.generateBatchCode();
    let batch = await this.batchRepository.save(
      this.batchRepository.create({ batchCode, fileName, uploadedByUserId, payloadHash, status: 'PROCESSING' }),
    );

    try {
      const { headers, rows } = parsed;
      const mapping = this.mapHeaders(headers);
      let applied = 0;
      let skipped = 0;

      for (let i = 0; i < rows.length; i++) {
        const get = (f: Field) => (mapping[f] ? rows[i][mapping[f]!] : undefined);
        const poNumber = text(get('poNumber'));
        // No PO number = a blank/subtotal line, not a tracker row.
        if (!poNumber) continue;

        const r = {
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
        };

        const result = await this.applyRow(r);

        await this.rowRepository.save(
          this.rowRepository.create({
            batchId: batch.id,
            rowIndex: i,
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
      }

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

  /**
   * The tracker is the master record, so unlike the single-purpose uploads it
   * updates several parts of a PO at once - but only ever with what the row
   * actually carries (blank cells never overwrite existing data), and each
   * part reports what it did so nothing changes silently.
   */
  private async applyRow(r: any): Promise<{
    matchStatus: SheetTrackerRowEntity['matchStatus'];
    matchedPoId: string | null;
    netDiscrepancy: number | null;
    actions: string | null;
    errorMessage: string | null;
  }> {
    const po = await this.poRepository.findOne({ where: { poNumber: r.poNumber } });
    if (!po) {
      return { matchStatus: 'PO_NOT_FOUND', matchedPoId: null, netDiscrepancy: r.netDiscrepancy, actions: null, errorMessage: `No PO found with number ${r.poNumber}` };
    }

    const actions: string[] = [];
    // Net discrepancy as the sheet defines it: shortage + damage - excess.
    const net = r.netDiscrepancy ?? r.shortageValue + r.damageValue - r.excessValue;

    // ---- Dispatch details
    const dispatch = await this.dispatchRepository.findOneBy({ poId: po.id });
    if (dispatch) {
      const before = JSON.stringify(dispatch);
      if (r.dispatchDate) dispatch.actualDispatchDate = r.dispatchDate;
      if (r.invoiceNumber) dispatch.invoiceNumber = r.invoiceNumber;
      if (r.invoiceValue != null) dispatch.invoiceValue = r.invoiceValue;
      if (r.docketAwb) dispatch.awbNumber = r.docketAwb;
      if (r.deliveryPartner) dispatch.transporterId = r.deliveryPartner;
      if (r.deliveryStatus) dispatch.dispatchStatus = r.deliveryStatus;
      if (r.comment) dispatch.remarks = r.comment;
      if (JSON.stringify(dispatch) !== before) {
        await this.dispatchRepository.save(dispatch);
        actions.push('Dispatch updated');
      }
    }

    // ---- Appointment + expiry
    const appointment = await this.appointmentRepository.findOneBy({ poId: po.id });
    if (appointment && r.appointmentDate) {
      appointment.appointmentDate = r.appointmentDate;
      await this.appointmentRepository.save(appointment);
      actions.push('Appointment date set');
    }
    if (r.expiryDate) {
      po.poExpiryDate = r.expiryDate;
      await this.poRepository.save(po);
      actions.push('Expiry date set');
    }

    // ---- GRN reconciliation (only once the sheet says the GRN is done)
    let grnError: string | null = null;
    if (r.grnStatus && GRN_DONE.has(r.grnStatus.toLowerCase().replace(/[^a-z]/g, ''))) {
      try {
        const done = await this.applyGrn(po.id, r, net);
        if (done) actions.push(done);
      } catch (err) {
        grnError = `GRN not recorded: ${(err as Error).message}`;
      }
    }

    // Keep derived values in step with what was just written.
    await this.poService.recomputeFillRate(po.id);
    await this.poService.recomputeStatus(po.id);
    await this.poService.recomputeRisk(po.id);
    await this.poService.recomputeDispatchPlan(po.id);

    return {
      matchStatus: grnError ? 'INVALID' : 'APPLIED',
      matchedPoId: po.id,
      netDiscrepancy: net,
      actions: actions.length ? actions.join(' · ') : 'No changes - sheet matched what the system already had',
      errorMessage: grnError,
    };
  }

  private async applyGrn(poId: string, r: any, net: number): Promise<string | null> {
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

    const existing = await this.grnRepository.findOneBy({ poId });
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
    } else {
      // Already recorded (e.g. an earlier upload of this same sheet): refresh
      // the reconciliation figures in place without re-firing side effects
      // like duplicate discrepancy tasks.
      existing.grnValue = grnValue;
      existing.outcome = outcome;
      existing.discrepancyAmount = net;
      existing.discrepancyReason = outcome === GRNOutcome.MATCHED ? '' : reason;
    }
    const grn = existing?.grnDate ? existing : await this.grnRepository.findOneByOrFail({ poId });
    grn.shortQuantity = r.shortageQty || null;
    grn.rejectedQuantity = r.damageQty || null;
    if (r.creditNoteNumber) grn.creditNoteNumber = r.creditNoteNumber;
    grn.remarks = notes.length ? notes.join('; ') : grn.remarks;
    await this.grnRepository.save(grn);
    return existing?.grnDate ? 'GRN figures refreshed' : `GRN recorded (${outcome})`;
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
    const countToday = await this.batchRepository.count({ where: { batchCode: Like(`SHT-${datePart}-%`) } });
    return `SHT-${datePart}-${String(countToday + 1).padStart(3, '0')}`;
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
