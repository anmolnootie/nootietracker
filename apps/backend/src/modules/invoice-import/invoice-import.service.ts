import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { format } from 'date-fns';
// pdf-parse ships as CJS with no default-export interop; require() avoids TS/ESM friction - same approach as po-import.service.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

import { InvoiceUploadBatchEntity } from '../../database/entities/invoice-upload-batch.entity';
import { InvoiceImportRowEntity } from '../../database/entities/invoice-import-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { DispatchReportRowEntity } from '../../database/entities/dispatch-report-row.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { FileReaderService } from '../bulk-import/file-reader.service';
import { POService } from '../po/po.service';
import { BackgroundImportRunner, failStalledBatches } from '../../common/background-import-runner';

const ACTIVE_STATUSES = ['PROCESSING'];

// Deliberately a small, self-contained alias set, same rationale as
// po-import.service.ts's GENERIC_EXCEL_ALIASES: kept independent of the
// bulk PO pipeline's ColumnMappingService/per-platform overrides, since an
// invoice sheet's handful of columns don't need that machinery.
type InvoiceField = 'poNumber' | 'invoiceNumber' | 'invoiceValue' | 'invoiceDate' | 'awbNumber' | 'customerName';

interface ParsedInvoiceRow {
  rowIndex: number;
  poNumber: string | null;
  invoiceNumber: string | null;
  invoiceValue: number | null;
  invoiceDate: Date | null;
  awbNumber: string | null;
  customerName: string | null;
  // PDF only: per-SKU quantities off the invoice's item table, plus the
  // invoice's own printed quantity total to check them against.
  lines?: InvoiceLine[];
  printedTotalQty?: number | null;
}

export interface InvoiceLine {
  ean: string;
  qty: number;
}

const INVOICE_FIELD_ALIASES: Record<InvoiceField, string[]> = {
  poNumber: ['po number', 'po no', 'purchase order', 'purchase order number', 'po id', 'po#'],
  invoiceNumber: ['invoice number', 'invoice no', 'invoice id', 'invoice#'],
  invoiceValue: ['invoice value', 'invoice amount', 'total invoice value', 'net amount'],
  invoiceDate: ['invoice date', 'date of invoice'],
  awbNumber: ['awb number', 'awb no', 'awb', 'airway bill number'],
  customerName: ['customer name', 'customer', 'party name'],
};

// Buyer names as they appear on a Vasy invoice -> channel names used on
// POMasterEntity.channelId. Same buyers as po-import.service.ts's
// VENDOR_NAME_TO_CHANNEL; checked in order, first hit wins.
const PDF_BUYER_TO_CHANNEL: [string, string][] = [
  ['BLINK COMMERCE', 'Blinkit'],
  ['BLINKIT', 'Blinkit'],
  ['ZEPTO', 'Zepto'],
  ['INSTAMART', 'Instamart'],
  ['SWIGGY', 'Instamart'],
  ['FLIPKART', 'Flipkart'],
];

// Vasy PDFs bundle every platform's invoices together; only this channel's
// are applied for now; the rest are recorded as SKIPPED.
const PDF_IMPORT_CHANNEL = 'Blinkit';

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
  private readonly runner = new BackgroundImportRunner();

  constructor(
    @InjectRepository(InvoiceUploadBatchEntity)
    private readonly batchRepository: Repository<InvoiceUploadBatchEntity>,
    @InjectRepository(InvoiceImportRowEntity)
    private readonly rowRepository: Repository<InvoiceImportRowEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(DispatchEntity)
    private readonly dispatchRepository: Repository<DispatchEntity>,
    @InjectRepository(DispatchReportRowEntity)
    private readonly dispatchReportRowRepository: Repository<DispatchReportRowEntity>,
    @InjectRepository(POLineItemEntity)
    private readonly poLineItemRepository: Repository<POLineItemEntity>,
    private readonly fileReaderService: FileReaderService,
    private readonly poService: POService,
  ) {}

  /**
   * Registers the upload and returns right away; the import itself runs in
   * the background (queued behind any other invoice import already running
   * - see the runner field above). Progress and the outcome show on the
   * batch (status, totalRows/matchedCount/unmatchedCount), polled the same
   * way bulk-import's own upload is.
   */
  async startFile(buffer: Buffer, fileName: string, uploadedByUserId: string): Promise<InvoiceUploadBatchEntity> {
    const batchCode = await this.generateBatchCode();
    const batch = await this.batchRepository.save(
      this.batchRepository.create({ batchCode, fileName, uploadedByUserId, status: 'PROCESSING' }),
    );
    this.runner.enqueue(batch.id, () => this.runImport(batch, buffer, fileName));
    return batch;
  }

  private async runImport(batch: InvoiceUploadBatchEntity, buffer: Buffer, fileName: string): Promise<void> {
    try {
      const isPdf = (fileName.split('.').pop() || '').toLowerCase() === 'pdf';
      const parsed = isPdf ? await this.parsePdf(buffer) : this.parseSheet(buffer, fileName);
      if (parsed.length === 0 && isPdf) {
        throw new Error(
          "Couldn't find any invoices in this PDF - expected Vasy-style \"Invoice No. :...\" labels on each page. If this is a different export format, it isn't supported yet.",
        );
      }

      let matchedCount = 0;
      let unmatchedCount = 0;
      let skippedCount = 0;
      let lastFlush = Date.now();

      for (let i = 0; i < parsed.length; i++) {
        const { rowIndex, poNumber, invoiceNumber, invoiceValue, invoiceDate, awbNumber, lines, printedTotalQty } = parsed[i];
        let { customerName } = parsed[i];

        // PDF only: apply an invoice only once it's confirmed to be for
        // PDF_IMPORT_CHANNEL - by buyer name in the text, else by the resolved
        // PO's channel. Anything else (another platform, or a buyer like a
        // retail store that's neither) is skipped.
        let skipReason: string | null = null;
        if (isPdf) {
          if (!customerName) {
            customerName = (await this.resolvePo(poNumber, invoiceNumber))?.channelId ?? null;
          }
          if (customerName !== PDF_IMPORT_CHANNEL) {
            skipReason = customerName
              ? `${customerName} invoice - only ${PDF_IMPORT_CHANNEL} invoices are imported from PDFs for now`
              : `Buyer isn't ${PDF_IMPORT_CHANNEL} and no ${PDF_IMPORT_CHANNEL} PO matched - only ${PDF_IMPORT_CHANNEL} invoices are imported from PDFs for now`;
          }
        }

        const result = skipReason
          ? { matchStatus: 'SKIPPED' as const, matchedPoId: null, errorMessage: skipReason }
          : await this.matchAndApply(poNumber, { invoiceNumber, invoiceValue, invoiceDate, awbNumber }, lines, printedTotalQty);

        // Show the PO this row resolved to even though the sheet itself has no PO column.
        const linkedPoNumber =
          poNumber ?? (result.matchedPoId ? (await this.poRepository.findOne({ where: { id: result.matchedPoId } }))?.poNumber ?? null : null);

        await this.rowRepository.save(
          this.rowRepository.create({
            batchId: batch.id,
            rowIndex,
            poNumber: linkedPoNumber,
            invoiceNumber,
            invoiceValue,
            invoiceDate,
            awbNumber,
            customerName,
            lineItems: lines?.length ? lines : null,
            matchStatus: result.matchStatus,
            matchedPoId: result.matchedPoId,
            errorMessage: result.errorMessage,
          }),
        );

        if (result.matchStatus === 'MATCHED') matchedCount++;
        else if (result.matchStatus === 'SKIPPED') skippedCount++;
        else unmatchedCount++;

        // Saving progress bumps updatedAt, which is how failStalledBatches()
        // tells a stalled import (server restarted mid-run) apart from a
        // merely slow one - so it must happen at least every few seconds
        // even when rows are slow, not just at the very end.
        if (i > 0 && (i % 25 === 0 || Date.now() - lastFlush > 5000)) {
          await this.batchRepository.update(batch.id, {
            totalRows: matchedCount + unmatchedCount + skippedCount,
            matchedCount,
            unmatchedCount,
            skippedCount,
          });
          lastFlush = Date.now();
        }
      }

      await this.batchRepository.update(batch.id, {
        totalRows: matchedCount + unmatchedCount + skippedCount,
        matchedCount,
        unmatchedCount,
        skippedCount,
        status: 'COMPLETED',
      });
    } catch (err) {
      this.logger.error(`Invoice import failed for batch ${batch.batchCode}`, err as any);
      await this.batchRepository.update(batch.id, { status: 'FAILED', errorMessage: (err as Error).message });
    }
  }

  /**
   * Reads an invoice sheet (.xlsx/.xls/.csv) into typed rows, skipping
   * blank/total lines (a row with neither an invoice number nor a PO
   * number). Shared with GRN Bulk Upload's "from invoices" mode so both
   * read the same export the same way. See parsePdf() below for the other
   * supported source: Vasy ERP's PDF invoice export, which carries the same
   * four fields but in a completely different shape (no spreadsheet exists
   * for that source).
   */
  parseSheet(buffer: Buffer, fileName: string): ParsedInvoiceRow[] {
    const { headers, rows } = this.fileReaderService.read(buffer, fileName);
    const mapping = this.mapHeaders(headers);
    const out: ParsedInvoiceRow[] = [];

    rows.forEach((row, rowIndex) => {
      const get = (field: InvoiceField) => (mapping[field] ? row[mapping[field]!] : undefined);
      const text = (field: InvoiceField) => (get(field) ? String(get(field)).trim() : null);
      const poNumber = text('poNumber');
      const invoiceNumber = text('invoiceNumber');
      if (!invoiceNumber && !poNumber) return;
      out.push({
        rowIndex,
        poNumber,
        invoiceNumber,
        invoiceValue: parseNumber(get('invoiceValue')),
        invoiceDate: parseFlexibleDate(get('invoiceDate')),
        awbNumber: text('awbNumber'),
        customerName: text('customerName'),
      });
    });
    return out;
  }

  /**
   * Vasy ERP's GST tax invoice PDF export - the only format this source
   * offers (no spreadsheet register exists), so this reads the PDF text
   * directly rather than going through FileReaderService. One PDF commonly
   * bundles many invoices back to back (each 1-3 pages, header repeated on
   * every page), so rows are grouped by Invoice No. rather than assumed
   * one-per-file.
   *
   * The template's text-extraction order is scrambled within each page's
   * header table (pdf-parse/pdf.js follows internal PDF object order, not
   * visual reading order): a page's Invoice Date value is emitted just
   * BEFORE that page's "Invoice No. :<value>" line, with the "Invoice Date"
   * label itself left dangling with no value after it. Every other field we
   * need (PO Number via "Reference No. :PO#...", Net Amount) is instead
   * emitted AFTER its page's "Invoice No." line and before the next one -
   * so each field is paired with whichever "Invoice No." occurrence is
   * nearest to it: backward for those, forward for the date.
   *
   * No AWB field exists in this format ("Vehicle No." is a generic
   * box/truck label, not a courier AWB) - left null here by design, same as
   * the spreadsheet path leaves it null when its own column is absent.
   */
  async parsePdf(buffer: Buffer): Promise<ParsedInvoiceRow[]> {
    const { text } = await pdfParse(buffer);
    return this.parsePdfText(text);
  }

  parsePdfText(text: string): ParsedInvoiceRow[] {
    const invoiceMatches: { value: string; index: number }[] = [];
    const invoiceNoRe = /Invoice No\.\s*:\s*(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = invoiceNoRe.exec(text))) {
      invoiceMatches.push({ value: m[1].trim(), index: m.index });
    }
    if (invoiceMatches.length === 0) return [];

    const nearestBefore = (pos: number): string | null => {
      let best: { value: string; index: number } | null = null;
      for (const im of invoiceMatches) {
        if (im.index <= pos && (!best || im.index > best.index)) best = im;
      }
      return best?.value ?? null;
    };
    const nearestAfter = (pos: number): string | null => {
      let best: { value: string; index: number } | null = null;
      for (const im of invoiceMatches) {
        if (im.index >= pos && (!best || im.index < best.index)) best = im;
      }
      return best?.value ?? null;
    };

    const poByInvoice = new Map<string, string>();
    const poNumberRe = /Reference No\.\s*:\s*PO#\s*(\S+)/gi;
    while ((m = poNumberRe.exec(text))) {
      const inv = nearestBefore(m.index);
      if (inv && !poByInvoice.has(inv)) poByInvoice.set(inv, m[1].trim());
    }

    const valueByInvoice = new Map<string, number>();
    const netAmountRe = /Net Amount\s*:\s*([\d,]+\.?\d*)/gi;
    while ((m = netAmountRe.exec(text))) {
      const inv = nearestBefore(m.index);
      const value = parseNumber(m[1]);
      if (inv && value !== null) valueByInvoice.set(inv, value);
    }

    const dateByInvoice = new Map<string, Date>();
    // Date value directly before the label it belongs to, per the scrambled
    // ordering explained above; a few spaces/newlines of slack between them.
    const dateBeforeInvoiceNoRe = /:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+Invoice No\./gi;
    while ((m = dateBeforeInvoiceNoRe.exec(text))) {
      const inv = nearestAfter(m.index);
      const parsedDate = parseFlexibleDate(m[1]);
      if (inv && parsedDate && !dateByInvoice.has(inv)) dateByInvoice.set(inv, parsedDate);
    }
    // Fallback for a cleaner export where the label and value sit together normally.
    const dateLabelRe = /Invoice Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/gi;
    while ((m = dateLabelRe.exec(text))) {
      const inv = nearestBefore(m.index);
      const parsedDate = parseFlexibleDate(m[1]);
      if (inv && parsedDate && !dateByInvoice.has(inv)) dateByInvoice.set(inv, parsedDate);
    }

    // Item rows: "<Itemcode/EAN> <Qty> <Free Qty> <HSN> <Unit> ...", e.g.
    // "7419870829292 72.00 0.00 96190040 PCS 93.31 ...". The description
    // wraps onto lines above it, but these five fields stay on one line.
    // Each row is emitted after its page's "Invoice No.", like PO Number.
    const linesByInvoice = new Map<string, Map<string, number>>();
    const itemRowRe = /\b(\d{8,14})\s+(\d[\d,]*\.\d+)\s+\d[\d,]*\.\d+\s+\d{4,8}\s+[A-Z]{2,}\b/g;
    while ((m = itemRowRe.exec(text))) {
      const inv = nearestBefore(m.index);
      const qty = parseNumber(m[2]);
      if (!inv || qty === null) continue;
      const lines = linesByInvoice.get(inv) ?? new Map<string, number>();
      lines.set(m[1], (lines.get(m[1]) ?? 0) + qty);
      linesByInvoice.set(inv, lines);
    }

    // Last page's "Total : 494.00 39,488.64 ..." - the first figure is the
    // invoice's total quantity.
    const totalQtyByInvoice = new Map<string, number>();
    const totalRe = /Total\s*:\s*(\d[\d,]*\.\d+)/g;
    while ((m = totalRe.exec(text))) {
      const inv = nearestBefore(m.index);
      const value = parseNumber(m[1]);
      if (inv && value !== null) totalQtyByInvoice.set(inv, value);
    }

    // Buyer platform per invoice: scan each page's slice of text (its
    // "Invoice No." up to the next one) for a known buyer name. A bundled
    // Vasy export mixes every platform's invoices in one file.
    const channelByInvoice = new Map<string, string>();
    invoiceMatches.forEach((im, i) => {
      if (channelByInvoice.has(im.value)) return;
      const slice = text.slice(im.index, invoiceMatches[i + 1]?.index ?? text.length).toUpperCase();
      const hit = PDF_BUYER_TO_CHANNEL.find(([needle]) => slice.includes(needle));
      if (hit) channelByInvoice.set(im.value, hit[1]);
    });

    // Preserve document order - the first time each invoice number appears.
    const seen = new Set<string>();
    const out: ParsedInvoiceRow[] = [];
    let rowIndex = 0;
    for (const im of invoiceMatches) {
      if (seen.has(im.value)) continue;
      seen.add(im.value);
      out.push({
        rowIndex: rowIndex++,
        poNumber: poByInvoice.get(im.value) ?? null,
        invoiceNumber: im.value,
        invoiceValue: valueByInvoice.get(im.value) ?? null,
        invoiceDate: dateByInvoice.get(im.value) ?? null,
        awbNumber: null,
        customerName: channelByInvoice.get(im.value) ?? null,
        lines: [...(linesByInvoice.get(im.value) ?? new Map<string, number>())].map(([ean, qty]) => ({ ean, qty })),
        printedTotalQty: totalQtyByInvoice.get(im.value) ?? null,
      });
    }
    return out;
  }

  private async matchAndApply(
    poNumber: string | null,
    data: { invoiceNumber: string | null; invoiceValue: number | null; invoiceDate: Date | null; awbNumber: string | null },
    lines?: InvoiceLine[],
    printedTotalQty?: number | null,
  ): Promise<{ matchStatus: InvoiceImportRowEntity['matchStatus']; matchedPoId: string | null; errorMessage: string | null }> {
    const po = await this.resolvePo(poNumber, data.invoiceNumber);
    if (!po) {
      const what = poNumber ? `PO ${poNumber}` : data.invoiceNumber ? `invoice ${data.invoiceNumber}` : 'this row';
      return {
        matchStatus: 'PO_NOT_FOUND',
        matchedPoId: null,
        errorMessage: poNumber
          ? `No PO found with number ${poNumber}, and invoice ${data.invoiceNumber ?? '(none)'} isn't on any dispatch record or uploaded Daily Dispatch Report either.`
          : `Couldn't link ${what} to a PO - this sheet has no PO Number, and the voucher isn't in any uploaded Daily Dispatch Report yet. Upload that report first, then re-upload this sheet.`,
      };
    }
    const resolvedPoNumber = po.poNumber;

    const dispatch = await this.dispatchRepository.findOneBy({ poId: po.id });
    if (!dispatch) {
      return { matchStatus: 'NO_DISPATCH_RECORD', matchedPoId: po.id, errorMessage: `PO ${resolvedPoNumber} has no dispatch record` };
    }

    if (data.invoiceNumber !== undefined && data.invoiceNumber !== null) dispatch.invoiceNumber = data.invoiceNumber;
    if (data.invoiceValue !== undefined && data.invoiceValue !== null) dispatch.invoiceValue = data.invoiceValue;
    if (data.invoiceDate !== undefined && data.invoiceDate !== null) dispatch.invoiceDate = data.invoiceDate;
    if (data.awbNumber !== undefined && data.awbNumber !== null) dispatch.awbNumber = data.awbNumber;
    // An invoice landing against this PO is itself the dispatch signal.
    dispatch.dispatchStatus = 'INVOICED';
    await this.dispatchRepository.save(dispatch);

    await this.poService.recomputeFillRate(po.id);

    const notes: string[] = [];
    if (lines?.length) {
      const readQty = lines.reduce((sum, l) => sum + l.qty, 0);
      if (printedTotalQty != null && Math.abs(readQty - printedTotalQty) > 0.001) {
        notes.push(`Read ${readQty} units from the item rows but the invoice total says ${printedTotalQty} - check dispatched quantities on this PO`);
      }
      notes.push(...(await this.applyDispatchedQuantities(po.id, data.invoiceNumber, lines)));
    }

    return { matchStatus: 'MATCHED', matchedPoId: po.id, errorMessage: notes.length ? notes.join('. ') : null };
  }

  /**
   * Sets each PO line's dispatchedQuantity to that SKU's total across every
   * invoice matched to the PO, so a PO billed on several invoices adds up.
   * Earlier invoices' lines come from their saved import rows (latest row
   * per invoice number), and this invoice replaces any earlier upload of
   * itself - so re-uploading the same PDF never double-counts. Lines are
   * matched by EAN against upc, falling back to skuCode. PO lines no invoice
   * mentions are left as they are. Returns notes for the row.
   */
  private async applyDispatchedQuantities(poId: string, invoiceNumber: string | null, lines: InvoiceLine[]): Promise<string[]> {
    const priorRows = await this.rowRepository.find({
      where: { matchedPoId: poId, matchStatus: 'MATCHED' },
      order: { createdAt: 'DESC' },
    });
    const totals = new Map<string, number>();
    const add = (ls: InvoiceLine[]) => ls.forEach((l) => totals.set(l.ean, (totals.get(l.ean) ?? 0) + Number(l.qty)));
    const seenInvoices = new Set<string>(invoiceNumber ? [invoiceNumber] : []);
    for (const r of priorRows) {
      if (!r.invoiceNumber || seenInvoices.has(r.invoiceNumber)) continue;
      seenInvoices.add(r.invoiceNumber);
      if (r.lineItems) add(r.lineItems);
    }
    add(lines);

    const poLines = await this.poLineItemRepository.find({ where: { poId } });
    const matchedEans = new Set<string>();
    const changed: POLineItemEntity[] = [];
    for (const li of poLines) {
      const key = li.upc && totals.has(li.upc) ? li.upc : totals.has(li.skuCode) ? li.skuCode : null;
      if (!key) continue;
      matchedEans.add(key);
      li.dispatchedQuantity = totals.get(key)!;
      changed.push(li);
    }
    if (changed.length) await this.poLineItemRepository.save(changed);

    const notOnPo = lines.filter((l) => !matchedEans.has(l.ean)).map((l) => l.ean);
    return notOnPo.length ? [`${notOnPo.length} invoiced SKU(s) not on this PO: ${notOnPo.join(', ')}`] : [];
  }

  /**
   * The real invoice sheet carries no PO Number - only the voucher/invoice
   * number. PO is resolved, in order, from: an explicit PO Number column if
   * the sheet has one; a dispatch record already carrying this invoice
   * number (re-uploads/corrections); or the Daily Dispatch Report, which is
   * the one document that pairs each voucher number with its PO number.
   */
  async resolvePo(poNumber: string | null, invoiceNumber: string | null): Promise<POMasterEntity | null> {
    // A PO number that doesn't resolve (e.g. typed slightly differently on a
    // Vasy invoice) still falls through to the invoice-number lookups below.
    if (poNumber) {
      const po = await this.poRepository.findOne({ where: { poNumber } });
      if (po) return po;
    }
    if (!invoiceNumber) return null;

    const existing = await this.dispatchRepository.findOne({ where: { invoiceNumber } });
    if (existing) return this.poRepository.findOne({ where: { id: existing.poId } });

    const reportRows = await this.dispatchReportRowRepository.find({
      where: { invoiceNumber },
      order: { createdAt: 'DESC' },
    });
    for (const r of reportRows) {
      if (!r.poNumber) continue;
      const po = await this.poRepository.findOne({ where: { poNumber: r.poNumber } });
      if (po) return po;
    }
    return null;
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
    // Numbered from the highest existing code, not a count: deleting a batch
    // from history would otherwise make the next code collide with a survivor.
    const latest = await this.batchRepository.findOne({ where: { batchCode: Like(`INV-${datePart}-%`) }, order: { batchCode: 'DESC' } });
    const next = parseInt((latest?.batchCode ?? '').split('-').pop() || '0', 10) + 1;
    const seq = String(next).padStart(3, '0');
    return `INV-${datePart}-${seq}`;
  }

  async listBatches(): Promise<InvoiceUploadBatchEntity[]> {
    await failStalledBatches(this.batchRepository, this.runner.getInFlightIds(), ACTIVE_STATUSES);
    return this.batchRepository.find({ order: { uploadedAt: 'DESC' } });
  }

  async getBatch(id: string): Promise<InvoiceUploadBatchEntity> {
    await failStalledBatches(this.batchRepository, this.runner.getInFlightIds(), ACTIVE_STATUSES);
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
