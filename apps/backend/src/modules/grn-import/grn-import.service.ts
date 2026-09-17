import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { format } from 'date-fns';

import { GrnUploadBatchEntity } from '../../database/entities/grn-upload-batch.entity';
import { GrnImportRowEntity } from '../../database/entities/grn-import-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { GRNOutcome } from '@po-control-tower/shared';
import { FileReaderService } from '../bulk-import/file-reader.service';
import { POService } from '../po/po.service';

// Deliberately a small, self-contained alias set - same rationale as
// invoice-import.service.ts. GRN sheets vary a lot in wording for the
// outcome/status column, so that one gets its own value-level alias map
// below rather than just a header alias.
type GrnField = 'poNumber' | 'invoiceNumber' | 'grnNumber' | 'grnValue' | 'outcome' | 'discrepancyReason' | 'discrepancyAmount';

const GRN_FIELD_ALIASES: Record<GrnField, string[]> = {
  poNumber: ['po number', 'po no', 'purchase order', 'purchase order number', 'po id', 'po#'],
  invoiceNumber: ['invoice number', 'invoice no', 'invoice id', 'invoice#'],
  grnNumber: ['grn number', 'grn no', 'grn id', 'grn#'],
  grnValue: ['grn value', 'grn amount', 'received value'],
  outcome: ['grn status', 'outcome', 'status', 'grn outcome'],
  discrepancyReason: ['discrepancy reason', 'reason', 'remarks'],
  discrepancyAmount: ['discrepancy amount', 'discrepancy value', 'short value'],
};

// Free-text GRN Status wording -> GRNOutcome. Spec's "Match / Shortage /
// Damage / Not done" maps directly onto the outcome enum already used by
// the single-PO recordGRN flow - no separate "GRN Status" field needed.
const OUTCOME_ALIASES: Record<string, GRNOutcome> = {
  match: GRNOutcome.MATCHED,
  matched: GRNOutcome.MATCHED,
  ok: GRNOutcome.MATCHED,
  mismatch: GRNOutcome.MISMATCHED,
  mismatched: GRNOutcome.MISMATCHED,
  shortage: GRNOutcome.SHORTAGE,
  short: GRNOutcome.SHORTAGE,
  damage: GRNOutcome.DAMAGE,
  damaged: GRNOutcome.DAMAGE,
  notdone: GRNOutcome.NO_GRN,
  nogrn: GRNOutcome.NO_GRN,
  pending: GRNOutcome.NO_GRN,
  other: GRNOutcome.OTHER,
};

function normalizeOutcome(raw: string | undefined): GRNOutcome | null {
  if (!raw) return null;
  const key = String(raw).toLowerCase().replace(/[^a-z]/g, '');
  return OUTCOME_ALIASES[key] ?? null;
}

function parseNumber(v: any): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  const s = String(v).replace(/[,₹$\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

@Injectable()
export class GrnImportService {
  private readonly logger = new Logger(GrnImportService.name);

  constructor(
    @InjectRepository(GrnUploadBatchEntity)
    private readonly batchRepository: Repository<GrnUploadBatchEntity>,
    @InjectRepository(GrnImportRowEntity)
    private readonly rowRepository: Repository<GrnImportRowEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(DispatchEntity)
    private readonly dispatchRepository: Repository<DispatchEntity>,
    private readonly fileReaderService: FileReaderService,
    private readonly poService: POService,
  ) {}

  async processFile(buffer: Buffer, fileName: string, uploadedByUserId: string): Promise<GrnUploadBatchEntity> {
    const batchCode = await this.generateBatchCode();
    let batch = await this.batchRepository.save(
      this.batchRepository.create({ batchCode, fileName, uploadedByUserId, status: 'PROCESSING' }),
    );

    try {
      const { headers, rows } = this.fileReaderService.read(buffer, fileName);
      const mapping = this.mapHeaders(headers);

      let matchedCount = 0;
      let unmatchedCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const get = (field: GrnField) => (mapping[field] ? row[mapping[field]!] : undefined);

        const poNumber = get('poNumber') ? String(get('poNumber')).trim() : null;
        const invoiceNumber = get('invoiceNumber') ? String(get('invoiceNumber')).trim() : null;
        const grnNumber = get('grnNumber') ? String(get('grnNumber')).trim() : null;
        const grnValue = parseNumber(get('grnValue'));
        const outcome = normalizeOutcome(get('outcome') ? String(get('outcome')) : undefined);
        const discrepancyReason = get('discrepancyReason') ? String(get('discrepancyReason')).trim() : null;
        const discrepancyAmount = parseNumber(get('discrepancyAmount'));

        const result = await this.matchAndApply(poNumber, invoiceNumber, {
          grnNumber,
          grnValue,
          outcome,
          discrepancyReason,
          discrepancyAmount,
        });

        await this.rowRepository.save(
          this.rowRepository.create({
            batchId: batch.id,
            rowIndex: i,
            poNumber,
            invoiceNumber,
            grnNumber,
            grnValue,
            outcome: outcome,
            discrepancyReason,
            discrepancyAmount,
            matchStatus: result.matchStatus,
            matchedPoId: result.matchedPoId,
            errorMessage: result.errorMessage,
          }),
        );

        if (result.matchStatus === 'MATCHED') matchedCount++;
        else unmatchedCount++;
      }

      batch.totalRows = rows.length;
      batch.matchedCount = matchedCount;
      batch.unmatchedCount = unmatchedCount;
      batch.status = 'COMPLETED';
      batch = await this.batchRepository.save(batch);
    } catch (err) {
      this.logger.error(`GRN import failed for batch ${batch.batchCode}`, err as any);
      batch.status = 'FAILED';
      batch.errorMessage = (err as Error).message;
      batch = await this.batchRepository.save(batch);
    }

    return batch;
  }

  private async matchAndApply(
    poNumber: string | null,
    invoiceNumber: string | null,
    data: { grnNumber: string | null; grnValue: number | null; outcome: GRNOutcome | null; discrepancyReason: string | null; discrepancyAmount: number | null },
  ): Promise<{ matchStatus: GrnImportRowEntity['matchStatus']; matchedPoId: string | null; errorMessage: string | null }> {
    // PO Number is the primary key (globally unique); fall back to Invoice
    // Number via the dispatch record when the sheet only carries that.
    let po: POMasterEntity | null = null;
    if (poNumber) {
      po = await this.poRepository.findOne({ where: { poNumber } });
    }
    if (!po && invoiceNumber) {
      const dispatch = await this.dispatchRepository.findOne({ where: { invoiceNumber } });
      if (dispatch) po = await this.poRepository.findOne({ where: { id: dispatch.poId } });
    }
    if (!po) {
      return { matchStatus: 'PO_NOT_FOUND', matchedPoId: null, errorMessage: `No PO found for ${poNumber || invoiceNumber || '(row has neither PO Number nor Invoice Number)'}` };
    }

    if (!data.grnNumber || data.grnValue == null || !data.outcome) {
      return { matchStatus: 'INVALID', matchedPoId: po.id, errorMessage: 'grnNumber, grnValue, and a recognizable outcome/GRN status are all required' };
    }
    if (data.outcome !== GRNOutcome.MATCHED && !data.discrepancyReason) {
      return { matchStatus: 'INVALID', matchedPoId: po.id, errorMessage: 'discrepancyReason is required unless the GRN outcome is MATCHED' };
    }

    try {
      // Reuses the exact same path the single-PO GRN screen uses - this is
      // what triggers stuck-stock mapping recovery, task completion, and
      // auto-created returns on NO_GRN. Never write GRNTrackerEntity directly
      // here, or those side effects would silently not happen for bulk rows.
      await this.poService.recordGRN(po.id, {
        grnNumber: data.grnNumber,
        grnValue: data.grnValue,
        outcome: data.outcome,
        discrepancyReason: data.discrepancyReason ?? undefined,
        discrepancyAmount: data.discrepancyAmount ?? undefined,
      });
    } catch (err) {
      return { matchStatus: 'INVALID', matchedPoId: po.id, errorMessage: (err as Error).message };
    }

    return { matchStatus: 'MATCHED', matchedPoId: po.id, errorMessage: null };
  }

  private mapHeaders(headers: string[]): Partial<Record<GrnField, string>> {
    const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) })).filter((h) => h.norm !== '');
    const used = new Set<string>();
    const mapping: Partial<Record<GrnField, string>> = {};
    const fields = Object.keys(GRN_FIELD_ALIASES) as GrnField[];

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
      const exact = find(GRN_FIELD_ALIASES[field], true);
      if (exact) {
        mapping[field] = exact;
        used.add(exact);
      }
    }
    for (const field of fields) {
      if (mapping[field]) continue;
      const partial = find(GRN_FIELD_ALIASES[field], false);
      if (partial) {
        mapping[field] = partial;
        used.add(partial);
      }
    }
    return mapping;
  }

  private async generateBatchCode(): Promise<string> {
    const datePart = format(new Date(), 'yyyyMMdd');
    const countToday = await this.batchRepository.count({ where: { batchCode: Like(`GRN-${datePart}-%`) } });
    const seq = String(countToday + 1).padStart(3, '0');
    return `GRN-${datePart}-${seq}`;
  }

  async listBatches(): Promise<GrnUploadBatchEntity[]> {
    return this.batchRepository.find({ order: { uploadedAt: 'DESC' } });
  }

  async getBatch(id: string): Promise<GrnUploadBatchEntity> {
    return this.batchRepository.findOneByOrFail({ id });
  }

  async getRows(batchId: string): Promise<GrnImportRowEntity[]> {
    return this.rowRepository.find({ where: { batchId }, order: { rowIndex: 'ASC' } });
  }
}
