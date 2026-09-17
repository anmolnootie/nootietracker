import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { format } from 'date-fns';

import { InvoiceUploadBatchEntity } from '../../database/entities/invoice-upload-batch.entity';
import { InvoiceImportRowEntity } from '../../database/entities/invoice-import-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { FileReaderService } from '../bulk-import/file-reader.service';
import { POService } from '../po/po.service';

// Deliberately a small, self-contained alias set, same rationale as
// po-import.service.ts's GENERIC_EXCEL_ALIASES: kept independent of the
// bulk PO pipeline's ColumnMappingService/per-platform overrides, since an
// invoice sheet's handful of columns don't need that machinery.
type InvoiceField = 'poNumber' | 'invoiceNumber' | 'invoiceValue' | 'invoiceDate' | 'awbNumber';

const INVOICE_FIELD_ALIASES: Record<InvoiceField, string[]> = {
  poNumber: ['po number', 'po no', 'purchase order', 'purchase order number', 'po id', 'po#'],
  invoiceNumber: ['invoice number', 'invoice no', 'invoice id', 'invoice#'],
  invoiceValue: ['invoice value', 'invoice amount', 'total invoice value', 'net amount'],
  invoiceDate: ['invoice date', 'date of invoice'],
  awbNumber: ['awb number', 'awb no', 'awb', 'airway bill number'],
};

function parseNumber(v: any): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  const s = String(v).replace(/[,₹$\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function parseFlexibleDate(value: any): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const str = String(value).trim();
  if (!str) return null;

  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const ymd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const native = new Date(str);
  if (!Number.isNaN(native.getTime())) return native;

  return null;
}

@Injectable()
export class InvoiceImportService {
  private readonly logger = new Logger(InvoiceImportService.name);

  constructor(
    @InjectRepository(InvoiceUploadBatchEntity)
    private readonly batchRepository: Repository<InvoiceUploadBatchEntity>,
    @InjectRepository(InvoiceImportRowEntity)
    private readonly rowRepository: Repository<InvoiceImportRowEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(DispatchEntity)
    private readonly dispatchRepository: Repository<DispatchEntity>,
    private readonly fileReaderService: FileReaderService,
    private readonly poService: POService,
  ) {}

  async processFile(buffer: Buffer, fileName: string, uploadedByUserId: string): Promise<InvoiceUploadBatchEntity> {
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
        const get = (field: InvoiceField) => (mapping[field] ? row[mapping[field]!] : undefined);

        const poNumber = get('poNumber') ? String(get('poNumber')).trim() : null;
        const invoiceNumber = get('invoiceNumber') ? String(get('invoiceNumber')).trim() : null;
        const invoiceValue = parseNumber(get('invoiceValue'));
        const invoiceDate = parseFlexibleDate(get('invoiceDate'));
        const awbNumber = get('awbNumber') ? String(get('awbNumber')).trim() : null;

        const result = await this.matchAndApply(poNumber, { invoiceNumber, invoiceValue, invoiceDate, awbNumber });

        await this.rowRepository.save(
          this.rowRepository.create({
            batchId: batch.id,
            rowIndex: i,
            poNumber,
            invoiceNumber,
            invoiceValue,
            invoiceDate,
            awbNumber,
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
      this.logger.error(`Invoice import failed for batch ${batch.batchCode}`, err as any);
      batch.status = 'FAILED';
      batch.errorMessage = (err as Error).message;
      batch = await this.batchRepository.save(batch);
    }

    return batch;
  }

  private async matchAndApply(
    poNumber: string | null,
    data: { invoiceNumber: string | null; invoiceValue: number | null; invoiceDate: Date | null; awbNumber: string | null },
  ): Promise<{ matchStatus: InvoiceImportRowEntity['matchStatus']; matchedPoId: string | null; errorMessage: string | null }> {
    if (!poNumber) {
      return { matchStatus: 'INVALID', matchedPoId: null, errorMessage: 'PO Number missing on this row' };
    }

    // poNumber is globally unique (po-master.entity.ts) - no channel disambiguation needed.
    const po = await this.poRepository.findOne({ where: { poNumber } });
    if (!po) {
      return { matchStatus: 'PO_NOT_FOUND', matchedPoId: null, errorMessage: `No PO found with number ${poNumber}` };
    }

    const dispatch = await this.dispatchRepository.findOneBy({ poId: po.id });
    if (!dispatch) {
      return { matchStatus: 'NO_DISPATCH_RECORD', matchedPoId: po.id, errorMessage: `PO ${poNumber} has no dispatch record` };
    }

    if (data.invoiceNumber !== undefined && data.invoiceNumber !== null) dispatch.invoiceNumber = data.invoiceNumber;
    if (data.invoiceValue !== undefined && data.invoiceValue !== null) dispatch.invoiceValue = data.invoiceValue;
    if (data.invoiceDate !== undefined && data.invoiceDate !== null) dispatch.invoiceDate = data.invoiceDate;
    if (data.awbNumber !== undefined && data.awbNumber !== null) dispatch.awbNumber = data.awbNumber;
    // An invoice landing against this PO is itself the dispatch signal.
    dispatch.dispatchStatus = 'INVOICED';
    await this.dispatchRepository.save(dispatch);

    await this.poService.recomputeFillRate(po.id);

    return { matchStatus: 'MATCHED', matchedPoId: po.id, errorMessage: null };
  }

  private mapHeaders(headers: string[]): Partial<Record<InvoiceField, string>> {
    const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) })).filter((h) => h.norm !== '');
    const used = new Set<string>();
    const mapping: Partial<Record<InvoiceField, string>> = {};
    const fields = Object.keys(INVOICE_FIELD_ALIASES) as InvoiceField[];

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
      const exact = find(INVOICE_FIELD_ALIASES[field], true);
      if (exact) {
        mapping[field] = exact;
        used.add(exact);
      }
    }
    for (const field of fields) {
      if (mapping[field]) continue;
      const partial = find(INVOICE_FIELD_ALIASES[field], false);
      if (partial) {
        mapping[field] = partial;
        used.add(partial);
      }
    }
    return mapping;
  }

  private async generateBatchCode(): Promise<string> {
    const datePart = format(new Date(), 'yyyyMMdd');
    const countToday = await this.batchRepository.count({ where: { batchCode: Like(`INV-${datePart}-%`) } });
    const seq = String(countToday + 1).padStart(3, '0');
    return `INV-${datePart}-${seq}`;
  }

  async listBatches(): Promise<InvoiceUploadBatchEntity[]> {
    return this.batchRepository.find({ order: { uploadedAt: 'DESC' } });
  }

  async getBatch(id: string): Promise<InvoiceUploadBatchEntity> {
    return this.batchRepository.findOneByOrFail({ id });
  }

  async getRows(batchId: string): Promise<InvoiceImportRowEntity[]> {
    return this.rowRepository.find({ where: { batchId }, order: { rowIndex: 'ASC' } });
  }

  /**
   * Removes this batch's upload history only (rows cascade via the FK) -
   * never touches the DispatchEntity/POMasterEntity fields it already wrote.
   * Those are real data, not tied to the audit trail's lifetime; undoing
   * them here would be indistinguishable from a fresh, unrelated edit and
   * could clobber a newer invoice upload that happened to touch the same PO.
   */
  async deleteBatch(id: string): Promise<void> {
    await this.batchRepository.delete(id);
  }
}
