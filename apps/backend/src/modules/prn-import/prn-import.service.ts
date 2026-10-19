import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { format } from 'date-fns';

import { PrnUploadBatchEntity } from '../../database/entities/prn-upload-batch.entity';
import { PrnImportRowEntity } from '../../database/entities/prn-import-row.entity';
import { FileReaderService } from '../bulk-import/file-reader.service';

// One alias per PRN export column. This is a fixed-format vendor export
// (Blink Commerce/Zepto's PRN sheet), so unlike invoice-import's multi-alias
// map there's no need to guess at variant header spellings - just normalize
// case/spacing/underscores and match the known column name.
type PrnField =
  | 'lookupCategory'
  | 'fromDispatchedFc'
  | 'fromDispatchedFacilityName'
  | 'stoInvoiceId'
  | 'wmsOrderId'
  | 'posFacilityId'
  | 'posFacilityName'
  | 'gstTin'
  | 'legalName'
  | 'merchantId'
  | 'merchantName'
  | 'vendorId'
  | 'vendorName'
  | 'invoiceId'
  | 'invoiceTypeId'
  | 'invoiceDescription'
  | 'posTimestamp'
  | 'itemId'
  | 'manufacturerId'
  | 'manufacturer'
  | 'inventoryType'
  | 'upcId'
  | 'productName'
  | 'mrp'
  | 'quantity'
  | 'landingPrice'
  | 'totalTax'
  | 'totalCostPrice'
  | 'prnValue'
  | 'merchantInvoiceId'
  | 'txnSign';

const PRN_FIELD_ALIASES: Record<PrnField, string[]> = {
  lookupCategory: ['lookup_category'],
  fromDispatchedFc: ['From_Dispatched_FC'],
  fromDispatchedFacilityName: ['From_Dispatched_Facility_Name'],
  stoInvoiceId: ['sto_invoice_id'],
  wmsOrderId: ['wms_order_id'],
  posFacilityId: ['pos_facility_id'],
  posFacilityName: ['pos_facility_name'],
  gstTin: ['gst_tin'],
  legalName: ['legal_name'],
  merchantId: ['merchant_id'],
  merchantName: ['merchant_name'],
  vendorId: ['vendor_id'],
  vendorName: ['vendor_name'],
  invoiceId: ['invoice_id'],
  invoiceTypeId: ['invoice_type_id'],
  invoiceDescription: ['invoice_description'],
  posTimestamp: ['pos_timestamp'],
  itemId: ['item_id'],
  manufacturerId: ['manufacturer_id'],
  manufacturer: ['manufacturer'],
  inventoryType: ['inventory_type'],
  upcId: ['upc_id'],
  productName: ['product_name'],
  mrp: ['mrp'],
  quantity: ['quantity'],
  landingPrice: ['landing_price'],
  totalTax: ['total_tax'],
  totalCostPrice: ['total_cost_price'],
  prnValue: ['prn_value'],
  merchantInvoiceId: ['merchant_invoice_id'],
  txnSign: ['txn_sign'],
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

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Reinterprets naive y/mo/d/h/mi/s components as IST (Indian quick-commerce
 * data), independent of server timezone. */
function istToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - IST_OFFSET_MS);
}

function parseTimestamp(value: any): Date | null {
  // The export's timestamp carries no timezone marker (Indian quick-commerce
  // data, meant as IST). For a CSV upload, FileReaderService's cellDates
  // option has SheetJS auto-parse "YYYY-MM-DD HH:mm:ss" text into a Date via
  // an ambiguous, server-local-timezone-dependent parse - verified empirically
  // that its LOCAL getters still round-trip the exact naive components
  // regardless of system TZ (the ambiguous parse and these getters are each
  // other's inverse), so re-deriving from local getters and re-applying our
  // own explicit IST interpretation makes the result deterministic.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return istToUtc(value.getFullYear(), value.getMonth() + 1, value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds());
  }

  const str = String(value ?? '').trim();
  if (!str) return null;
  const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    return istToUtc(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s || 0));
  }

  const native = new Date(str);
  return Number.isNaN(native.getTime()) ? null : native;
}

@Injectable()
export class PrnImportService {
  private readonly logger = new Logger(PrnImportService.name);

  constructor(
    @InjectRepository(PrnUploadBatchEntity)
    private readonly batchRepository: Repository<PrnUploadBatchEntity>,
    @InjectRepository(PrnImportRowEntity)
    private readonly rowRepository: Repository<PrnImportRowEntity>,
    private readonly fileReaderService: FileReaderService,
  ) {}

  async processFile(buffer: Buffer, fileName: string, uploadedByUserId: string): Promise<PrnUploadBatchEntity> {
    const batchCode = await this.generateBatchCode();
    let batch = await this.batchRepository.save(
      this.batchRepository.create({ batchCode, fileName, uploadedByUserId, status: 'PROCESSING' }),
    );

    try {
      const parsed = this.parseSheet(buffer, fileName);

      for (const row of parsed) {
        await this.rowRepository.save(this.rowRepository.create({ batchId: batch.id, ...row }));
      }

      batch.totalRows = parsed.length;
      batch.status = 'COMPLETED';
      batch = await this.batchRepository.save(batch);
    } catch (err) {
      this.logger.error(`PRN import failed for batch ${batch.batchCode}`, err as any);
      batch.status = 'FAILED';
      batch.errorMessage = (err as Error).message;
      batch = await this.batchRepository.save(batch);
    }

    return batch;
  }

  /** Reads a PRN sheet into typed rows, skipping fully-blank lines. */
  parseSheet(buffer: Buffer, fileName: string) {
    const { headers, rows } = this.fileReaderService.read(buffer, fileName);
    const mapping = this.mapHeaders(headers);

    const out: Omit<PrnImportRowEntity, 'id' | 'batchId' | 'createdAt' | 'batch'>[] = [];

    rows.forEach((row, rowIndex) => {
      const get = (field: PrnField) => (mapping[field] ? row[mapping[field]!] : undefined);
      const text = (field: PrnField) => {
        const v = get(field);
        return v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim();
      };

      // Skip rows with no real content (e.g. trailing blank lines).
      if (!text('itemId') && !text('invoiceId') && !text('productName')) return;

      out.push({
        rowIndex,
        lookupCategory: text('lookupCategory'),
        fromDispatchedFc: text('fromDispatchedFc'),
        fromDispatchedFacilityName: text('fromDispatchedFacilityName'),
        stoInvoiceId: text('stoInvoiceId'),
        wmsOrderId: text('wmsOrderId'),
        posFacilityId: text('posFacilityId'),
        posFacilityName: text('posFacilityName'),
        gstTin: text('gstTin'),
        legalName: text('legalName'),
        merchantId: text('merchantId'),
        merchantName: text('merchantName'),
        vendorId: text('vendorId'),
        vendorName: text('vendorName'),
        invoiceId: text('invoiceId'),
        invoiceTypeId: parseInt10(get('invoiceTypeId')),
        invoiceDescription: text('invoiceDescription'),
        posTimestamp: parseTimestamp(get('posTimestamp')),
        itemId: text('itemId'),
        manufacturerId: text('manufacturerId'),
        manufacturer: text('manufacturer'),
        inventoryType: text('inventoryType'),
        upcId: text('upcId'),
        productName: text('productName'),
        mrp: parseNumber(get('mrp')),
        quantity: parseInt10(get('quantity')),
        landingPrice: parseNumber(get('landingPrice')),
        totalTax: parseNumber(get('totalTax')),
        totalCostPrice: parseNumber(get('totalCostPrice')),
        prnValue: parseNumber(get('prnValue')),
        merchantInvoiceId: text('merchantInvoiceId'),
        txnSign: parseInt10(get('txnSign')),
        errorMessage: null,
      });
    });
    return out;
  }

  private mapHeaders(headers: string[]): Partial<Record<PrnField, string>> {
    const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) })).filter((h) => h.norm !== '');
    const mapping: Partial<Record<PrnField, string>> = {};
    const fields = Object.keys(PRN_FIELD_ALIASES) as PrnField[];

    for (const field of fields) {
      for (const alias of PRN_FIELD_ALIASES[field]) {
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
    const latest = await this.batchRepository.findOne({ where: { batchCode: Like(`PRN-${datePart}-%`) }, order: { batchCode: 'DESC' } });
    const next = parseInt((latest?.batchCode ?? '').split('-').pop() || '0', 10) + 1;
    const seq = String(next).padStart(3, '0');
    return `PRN-${datePart}-${seq}`;
  }

  async listBatches(): Promise<PrnUploadBatchEntity[]> {
    return this.batchRepository.find({ order: { uploadedAt: 'DESC' } });
  }

  async getBatch(id: string): Promise<PrnUploadBatchEntity> {
    return this.batchRepository.findOneByOrFail({ id });
  }

  async getRows(batchId: string): Promise<PrnImportRowEntity[]> {
    return this.rowRepository.find({ where: { batchId }, order: { rowIndex: 'ASC' } });
  }

  /** Removes this batch's upload history only - same rationale as invoice-import's deleteBatch. */
  async deleteBatch(id: string): Promise<void> {
    await this.batchRepository.delete(id);
  }
}
