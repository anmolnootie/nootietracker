import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { format } from 'date-fns';

import { DispatchReportUploadBatchEntity } from '../../database/entities/dispatch-report-upload-batch.entity';
import { DispatchReportRowEntity } from '../../database/entities/dispatch-report-row.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { FileReaderService } from '../bulk-import/file-reader.service';

// Deliberately a small, self-contained alias set - same rationale as
// invoice-import.service.ts.
type DispatchReportField = 'poNumber' | 'invoiceNumber' | 'invoiceValue';

const FIELD_ALIASES: Record<DispatchReportField, string[]> = {
  poNumber: ['po number', 'po no', 'purchase order', 'purchase order number', 'po id', 'po#'],
  invoiceNumber: ['invoice number', 'invoice no', 'invoice id', 'invoice#'],
  invoiceValue: ['invoice value', 'invoice amount', 'total invoice value', 'net amount'],
};

function parseNumber(v: any): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  const s = String(v).replace(/[,₹$\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
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
    private readonly fileReaderService: FileReaderService,
  ) {}

  async processFile(buffer: Buffer, fileName: string, platform: string | null, uploadedByUserId: string): Promise<DispatchReportUploadBatchEntity> {
    const batchCode = await this.generateBatchCode();
    let batch = await this.batchRepository.save(
      this.batchRepository.create({ batchCode, fileName, platform, uploadedByUserId, status: 'PROCESSING' }),
    );

    try {
      const { headers, rows } = this.fileReaderService.read(buffer, fileName);
      const mapping = this.mapHeaders(headers);

      let reconciledCount = 0;
      let mismatchCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const get = (field: DispatchReportField) => (mapping[field] ? row[mapping[field]!] : undefined);

        const poNumber = get('poNumber') ? String(get('poNumber')).trim() : null;
        const invoiceNumber = get('invoiceNumber') ? String(get('invoiceNumber')).trim() : null;
        const invoiceValue = parseNumber(get('invoiceValue'));

        const result = await this.reconcile(invoiceNumber);

        await this.rowRepository.save(
          this.rowRepository.create({
            batchId: batch.id,
            rowIndex: i,
            poNumber,
            invoiceNumber,
            invoiceValue,
            matchStatus: result.matchStatus,
            matchedPoId: result.matchedPoId,
            errorMessage: result.errorMessage,
          }),
        );

        if (result.matchStatus === 'RECONCILED') reconciledCount++;
        else mismatchCount++;
      }

      batch.totalRows = rows.length;
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
  ): Promise<{ matchStatus: DispatchReportRowEntity['matchStatus']; matchedPoId: string | null; errorMessage: string | null }> {
    if (!invoiceNumber) {
      return { matchStatus: 'INVALID', matchedPoId: null, errorMessage: 'Invoice Number missing on this row' };
    }

    const dispatch = await this.dispatchRepository.findOne({ where: { invoiceNumber } });
    if (!dispatch) {
      return { matchStatus: 'MISMATCH', matchedPoId: null, errorMessage: `Invoice ${invoiceNumber} is in the channel report but not found in this system` };
    }

    return { matchStatus: 'RECONCILED', matchedPoId: dispatch.poId, errorMessage: null };
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
    const countToday = await this.batchRepository.count({ where: { batchCode: Like(`DSR-${datePart}-%`) } });
    const seq = String(countToday + 1).padStart(3, '0');
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
}
