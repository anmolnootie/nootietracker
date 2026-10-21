import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { format } from 'date-fns';

import { DnUploadBatchEntity } from '../../database/entities/dn-upload-batch.entity';
import { DnImportRowEntity } from '../../database/entities/dn-import-row.entity';
import { FileReaderService } from '../bulk-import/file-reader.service';
import { parseIstTimestamp } from '../../common/ist-timestamp.util';
import { BackgroundImportRunner, failStalledBatches } from '../../common/background-import-runner';

const ACTIVE_STATUSES = ['PROCESSING'];

// One alias per DN export column. Fixed-format vendor export, same
// rationale as prn-import.service.ts's PRN_FIELD_ALIASES.
type DnField =
  | 'facilityName'
  | 'dnId'
  | 'dnDate'
  | 'vendorName'
  | 'vendorGstin'
  | 'purchaseNumber'
  | 'manufacturer'
  | 'invoiceId'
  | 'itemId'
  | 'productName'
  | 'upcId'
  | 'dnQuantity'
  | 'unitLandingPrice'
  | 'itemDnAmount'
  | 'dnNetAmount'
  | 'remark'
  | 'reason';

const DN_FIELD_ALIASES: Record<DnField, string[]> = {
  facilityName: ['facility_name'],
  dnId: ['dn id'],
  dnDate: ['dn date'],
  vendorName: ['vendor name'],
  vendorGstin: ['vendor gstin'],
  purchaseNumber: ['purchase number'],
  manufacturer: ['manufacturer'],
  invoiceId: ['invoice id'],
  itemId: ['item id'],
  productName: ['product name'],
  upcId: ['upc id'],
  dnQuantity: ['dn quantity'],
  unitLandingPrice: ['unit landing price'],
  itemDnAmount: ['item dn amount'],
  dnNetAmount: ['dn net amount (incl. tax)'],
  remark: ['remark'],
  reason: ['reason'],
};

function parseNumber(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  const s = String(v).replace(/[,₹$\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function parseInt10(v: any): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.trunc(n);
}

@Injectable()
export class DnImportService {
  private readonly logger = new Logger(DnImportService.name);
  private readonly runner = new BackgroundImportRunner();

  constructor(
    @InjectRepository(DnUploadBatchEntity)
    private readonly batchRepository: Repository<DnUploadBatchEntity>,
    @InjectRepository(DnImportRowEntity)
    private readonly rowRepository: Repository<DnImportRowEntity>,
    private readonly fileReaderService: FileReaderService,
  ) {}

  /**
   * Registers the upload and returns right away; the import itself runs in
   * the background (queued behind any other DN import already running -
   * see the runner field above). Every row is an independent insert with no
   * per-row lookup, so they're all written in one bulk INSERT instead of
   * one at a time.
   */
  async startFile(buffer: Buffer, fileName: string, uploadedByUserId: string): Promise<DnUploadBatchEntity> {
    const batchCode = await this.generateBatchCode();
    const batch = await this.batchRepository.save(
      this.batchRepository.create({ batchCode, fileName, uploadedByUserId, status: 'PROCESSING' }),
    );
    this.runner.enqueue(batch.id, () => this.runImport(batch, buffer, fileName));
    return batch;
  }

  private async runImport(batch: DnUploadBatchEntity, buffer: Buffer, fileName: string): Promise<void> {
    try {
      const parsed = this.parseSheet(buffer, fileName);

      await this.rowRepository.save(
        parsed.map((row) => this.rowRepository.create({ batchId: batch.id, ...row })),
        { chunk: 200 },
      );

      await this.batchRepository.update(batch.id, { totalRows: parsed.length, status: 'COMPLETED' });
    } catch (err) {
      this.logger.error(`DN import failed for batch ${batch.batchCode}`, err as any);
      await this.batchRepository.update(batch.id, { status: 'FAILED', errorMessage: (err as Error).message });
    }
  }

  /** Reads a DN sheet into typed rows, skipping fully-blank lines. */
  parseSheet(buffer: Buffer, fileName: string) {
    const { headers, rows } = this.fileReaderService.read(buffer, fileName);
    const mapping = this.mapHeaders(headers);

    const out: Omit<DnImportRowEntity, 'id' | 'batchId' | 'createdAt' | 'batch'>[] = [];

    rows.forEach((row, rowIndex) => {
      const get = (field: DnField) => (mapping[field] ? row[mapping[field]!] : undefined);
      const text = (field: DnField) => {
        const v = get(field);
        return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim();
      };

      // Skip rows with no real content (e.g. trailing blank lines).
      if (!text('dnId') && !text('itemId') && !text('productName')) return;

      out.push({
        rowIndex,
        facilityName: text('facilityName'),
        dnId: text('dnId'),
        dnDate: parseIstTimestamp(get('dnDate')),
        vendorName: text('vendorName'),
        vendorGstin: text('vendorGstin'),
        purchaseNumber: text('purchaseNumber'),
        manufacturer: text('manufacturer'),
        invoiceId: text('invoiceId'),
        itemId: text('itemId'),
        productName: text('productName'),
        upcId: text('upcId'),
        dnQuantity: parseInt10(get('dnQuantity')),
        unitLandingPrice: parseNumber(get('unitLandingPrice')),
        itemDnAmount: parseNumber(get('itemDnAmount')),
        dnNetAmount: parseNumber(get('dnNetAmount')),
        remark: text('remark'),
        reason: text('reason'),
        errorMessage: null,
      });
    });
    return out;
  }

  private mapHeaders(headers: string[]): Partial<Record<DnField, string>> {
    const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) })).filter((h) => h.norm !== '');
    const mapping: Partial<Record<DnField, string>> = {};
    const fields = Object.keys(DN_FIELD_ALIASES) as DnField[];

    for (const field of fields) {
      for (const alias of DN_FIELD_ALIASES[field]) {
        const na = normalize(alias);
        const match = normalized.find((h) => h.norm === na);
        if (match) {
          mapping[field] = match.raw;
          break;
        }
      }
    }
    return mapping;
  }

  private async generateBatchCode(): Promise<string> {
    const datePart = format(new Date(), 'yyyyMMdd');
    const latest = await this.batchRepository.findOne({ where: { batchCode: Like(`DN-${datePart}-%`) }, order: { batchCode: 'DESC' } });
    const next = parseInt((latest?.batchCode ?? '').split('-').pop() || '0', 10) + 1;
    const seq = String(next).padStart(3, '0');
    return `DN-${datePart}-${seq}`;
  }

  async listBatches(): Promise<DnUploadBatchEntity[]> {
    await failStalledBatches(this.batchRepository, this.runner.getInFlightIds(), ACTIVE_STATUSES);
    return this.batchRepository.find({ order: { uploadedAt: 'DESC' } });
  }

  async getBatch(id: string): Promise<DnUploadBatchEntity> {
    await failStalledBatches(this.batchRepository, this.runner.getInFlightIds(), ACTIVE_STATUSES);
    return this.batchRepository.findOneByOrFail({ id });
  }

  async getRows(batchId: string): Promise<DnImportRowEntity[]> {
    return this.rowRepository.find({ where: { batchId }, order: { rowIndex: 'ASC' } });
  }

  /** Removes this batch's upload history only - same rationale as invoice-import's deleteBatch. */
  async deleteBatch(id: string): Promise<void> {
    await this.batchRepository.delete(id);
  }
}
