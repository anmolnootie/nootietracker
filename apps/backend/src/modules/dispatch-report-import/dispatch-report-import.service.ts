import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { format } from 'date-fns';

import { DispatchReportUploadBatchEntity } from '../../database/entities/dispatch-report-upload-batch.entity';
import { DispatchReportRowEntity } from '../../database/entities/dispatch-report-row.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { FileReaderService } from '../bulk-import/file-reader.service';

// Deliberately a small, self-contained alias set - same rationale as
// invoice-import.service.ts. Real channel dispatch reports are one
// multi-channel file (party name/location are per-row columns), often
// with a merged "PO Count" subtotal column per channel block that isn't
// per-row data - deliberately not aliased/parsed here.
type DispatchReportField = 'partyName' | 'location' | 'invoiceNumber' | 'invoiceValue' | 'poNumber' | 'poValue' | 'fillRatePercent';

const FIELD_ALIASES: Record<DispatchReportField, string[]> = {
  partyName: ['party name', 'sales channel', 'channel', 'customer', 'platform'],
  location: ['location', 'warehouse', 'city', 'facility'],
  // "voucher no" is the wording seen in real channel exports for what this
  // system calls Invoice Number - listed first so it's tried before the
  // more generic aliases.
  invoiceNumber: ['voucher no', 'voucher number', 'invoice number', 'invoice no', 'invoice id', 'invoice#'],
  // "gross total" is another real-export wording for the same figure -
  // some channel reports call it Invoice Value, others Gross Total; both
  // feed the same Invoice Value / PO Value fill-rate calculation.
  invoiceValue: ['gross total', 'invoice value', 'invoice amount', 'total invoice value', 'net amount'],
  poNumber: ['po number', 'po no', 'purchase order', 'purchase order number', 'po id', 'po#'],
  poValue: ['po value', 'order value', 'total po value'],
  // "Overall Fillrate"/"Overall Fill Rate" is a per-channel-block rollup
  // (like "PO Count" above), not per-row data - the exact-match pass below
  // locks "Fill Rate %" in first, so the rollup column is never mistaken
  // for it even though "fillrate" is a substring of both once normalized.
  fillRatePercent: ['fill rate %', 'fill rate', 'fillrate'],
};

/**
 * xlsx's raw:true numeric parsing returns the true underlying number for a
 * numeric cell (Excel showing "1.72371E+12" is just a column-width display
 * artifact, not the stored value) - String(n) is safe here since JS only
 * switches to exponential notation above 1e21, far beyond any real PO/
 * invoice number. Kept as its own helper so every import service converts
 * numeric-looking identifier cells the same, explicit way rather than an
 * ad-hoc String(...) that would be easy to get wrong for a future field.
 */
function cellToString(v: any): string | null {
  if (v === undefined || v === null || v === '') return null;
  return String(v).trim();
}

function parseNumber(v: any): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  const s = String(v).replace(/[,₹$%\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/**
 * Excel/xlsx stores a percentage-formatted cell as its raw fraction (0.8),
 * with "%" purely a display format - raw:true parsing hands back that
 * fraction, not "80". A real fill rate is never between 0 and 1 on a 0-100
 * scale, so scale any such value up; a plain "80%" string (no cell-level
 * percent format, just typed text) already parses to 80 and is left as-is.
 */
function parsePercent(v: any): number | null {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return null;
    return v > 0 && v <= 1 ? v * 100 : v;
  }
  const s = String(v).replace(/[,\s]/g, '').trim();
  if (!s) return null;
  const hadPercentSign = s.includes('%');
  const n = Number(s.replace('%', ''));
  if (Number.isNaN(n)) return null;
  return !hadPercentSign && n > 0 && n <= 1 ? n * 100 : n;
}

/**
 * A channel's own daily dispatch/fill-rate report, cross-checked against
 * what's already in the system - purely a comparison, never a write. The
 * real point of this upload is surfacing the MISMATCH case: an invoice
 * number the channel says was dispatched that this system has no record of
 * at all (the "Reconciliation Mismatch Alarm" from the spec).
 */
@Injectable()
export class DispatchReportImportService {
  private readonly logger = new Logger(DispatchReportImportService.name);

  constructor(
    @InjectRepository(DispatchReportUploadBatchEntity)
    private readonly batchRepository: Repository<DispatchReportUploadBatchEntity>,
    @InjectRepository(DispatchReportRowEntity)
    private readonly rowRepository: Repository<DispatchReportRowEntity>,
    @InjectRepository(DispatchEntity)
    private readonly dispatchRepository: Repository<DispatchEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    private readonly fileReaderService: FileReaderService,
  ) {}

  async processFile(buffer: Buffer, fileName: string, uploadedByUserId: string): Promise<DispatchReportUploadBatchEntity> {
    const batchCode = await this.generateBatchCode();
    let batch = await this.batchRepository.save(
      this.batchRepository.create({ batchCode, fileName, uploadedByUserId, status: 'PROCESSING' }),
    );

    try {
      const { headers, rows } = this.fileReaderService.read(buffer, fileName);
      const mapping = this.mapHeaders(headers);

      let reconciledCount = 0;
      let mismatchCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const get = (field: DispatchReportField) => (mapping[field] ? row[mapping[field]!] : undefined);

        const partyName = cellToString(get('partyName'));
        const location = cellToString(get('location'));
        const poNumber = cellToString(get('poNumber'));
        const poValue = parseNumber(get('poValue'));
        const invoiceNumber = cellToString(get('invoiceNumber'));
        const invoiceValue = parseNumber(get('invoiceValue'));
        const reportedFillRatePercent = parsePercent(get('fillRatePercent'));

        // A row with neither an invoice number nor a PO number can never be
        // reconciled against anything - this is the real report's own
        // trailing "Total" line (party name reads as the literal text
        // "Total" from that row's merge, everything else numeric subtotals)
        // as much as a blank spacer row. Skip both silently rather than
        // surface a manufactured INVALID row on every single upload.
        if (!invoiceNumber && !poNumber) continue;

        const result = await this.reconcile(invoiceNumber, poNumber);

        await this.rowRepository.save(
          this.rowRepository.create({
            batchId: batch.id,
            rowIndex: i,
            partyName,
            location,
            poNumber,
            poValue,
            invoiceNumber,
            invoiceValue,
            reportedFillRatePercent,
            matchStatus: result.matchStatus,
            matchedPoId: result.matchedPoId,
            errorMessage: result.errorMessage,
          }),
        );

        if (result.matchStatus === 'RECONCILED') reconciledCount++;
        else mismatchCount++;
      }

      // Counts only rows actually processed (skipped totals/spacer rows
      // excluded) so this always equals reconciledCount + mismatchCount -
      // rows.length here would silently disagree with that sum by however
      // many trailing "Total" rows the file happened to carry.
      batch.totalRows = reconciledCount + mismatchCount;
      batch.reconciledCount = reconciledCount;
      batch.mismatchCount = mismatchCount;
      batch.status = 'COMPLETED';
      batch = await this.batchRepository.save(batch);
    } catch (err) {
      this.logger.error(`Dispatch report reconciliation failed for batch ${batch.batchCode}`, err as any);
      batch.status = 'FAILED';
      batch.errorMessage = (err as Error).message;
      batch = await this.batchRepository.save(batch);
    }

    return batch;
  }

  private async reconcile(
    invoiceNumber: string | null,
    poNumber: string | null,
  ): Promise<{ matchStatus: DispatchReportRowEntity['matchStatus']; matchedPoId: string | null; errorMessage: string | null }> {
    if (!invoiceNumber) {
      return { matchStatus: 'INVALID', matchedPoId: null, errorMessage: 'Voucher/Invoice Number missing on this row' };
    }

    const dispatch = await this.dispatchRepository.findOne({ where: { invoiceNumber } });
    if (dispatch) {
      return { matchStatus: 'RECONCILED', matchedPoId: dispatch.poId, errorMessage: null };
    }

    // Distinguish "we've never heard of this PO at all" from the narrower,
    // spec-defined mismatch case: the PO is known, it just hasn't had this
    // invoice number recorded yet (e.g. Invoice Bulk Upload hasn't run for
    // it) - both are still MISMATCH, but the second is a much smaller gap.
    const po = poNumber ? await this.poRepository.findOne({ where: { poNumber } }) : null;
    const errorMessage = po
      ? `PO ${poNumber} exists but invoice ${invoiceNumber} hasn't been recorded against it in this system yet`
      : `Invoice ${invoiceNumber}${poNumber ? ` (PO ${poNumber})` : ''} is in the channel report but not found in this system at all`;

    return { matchStatus: 'MISMATCH', matchedPoId: po?.id ?? null, errorMessage };
  }

  private mapHeaders(headers: string[]): Partial<Record<DispatchReportField, string>> {
    const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) })).filter((h) => h.norm !== '');
    const used = new Set<string>();
    const mapping: Partial<Record<DispatchReportField, string>> = {};
    const fields = Object.keys(FIELD_ALIASES) as DispatchReportField[];

    const find = (aliases: string[], exact: boolean): string | null => {
      for (const alias of aliases) {
        const na = normalize(alias);
        if (na === '') continue;
        const match = normalized.find(
          (h) => !used.has(h.raw) && (exact ? h.norm === na : h.norm.includes(na) || na.includes(h.norm)),
        );
        if (match) return match.raw;
      }
      return null;
    };

    for (const field of fields) {
      const exact = find(FIELD_ALIASES[field], true);
      if (exact) {
        mapping[field] = exact;
        used.add(exact);
      }
    }
    for (const field of fields) {
      if (mapping[field]) continue;
      const partial = find(FIELD_ALIASES[field], false);
      if (partial) {
        mapping[field] = partial;
        used.add(partial);
      }
    }
    return mapping;
  }

  private async generateBatchCode(): Promise<string> {
    const datePart = format(new Date(), 'yyyyMMdd');
    // Numbered from the highest existing code, not a count: deleting a batch
    // from history would otherwise make the next code collide with a survivor.
    const latest = await this.batchRepository.findOne({ where: { batchCode: Like(`DSR-${datePart}-%`) }, order: { batchCode: 'DESC' } });
    const next = parseInt((latest?.batchCode ?? '').split('-').pop() || '0', 10) + 1;
    const seq = String(next).padStart(3, '0');
    return `DSR-${datePart}-${seq}`;
  }

  async listBatches(): Promise<DispatchReportUploadBatchEntity[]> {
    return this.batchRepository.find({ order: { uploadedAt: 'DESC' } });
  }

  async getBatch(id: string): Promise<DispatchReportUploadBatchEntity> {
    return this.batchRepository.findOneByOrFail({ id });
  }

  async getRows(batchId: string): Promise<DispatchReportRowEntity[]> {
    return this.rowRepository.find({ where: { batchId }, order: { rowIndex: 'ASC' } });
  }

  /** Purely a reconciliation record - never wrote anything, so deleting it is a plain removal (rows cascade via the FK). */
  async deleteBatch(id: string): Promise<void> {
    await this.batchRepository.delete(id);
  }
}
