import { Injectable, Logger } from '@nestjs/common';
// pdf-parse ships as CJS with no default-export interop; require() avoids TS/ESM friction.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
import * as XLSX from 'xlsx';

export interface ExtractedLineItem {
  skuCode: string;
  skuName: string;
  quantity: number;
  mrp?: number | null;
  upc?: string | null;
  unitPrice?: number | null;
}

export interface ExtractedPODraft {
  poNumber: string | null;
  poDate: string | null;
  poExpiryDate: string | null;
  poDeliveryDate: string | null;
  channelId: string | null;
  customerId: string | null;
  location: string | null;
  poValue: number | null;
  lineItems: ExtractedLineItem[];
  warnings: string[];
}

// Common quick-commerce buyer legal names -> the channel names used elsewhere in the app.
const KNOWN_BUYERS: Record<string, string> = {
  'BLINK COMMERCE PRIVATE LIMITED': 'Blinkit',
  'ZEPTO': 'Zepto',
  'INSTAMART': 'Instamart',
  'SWIGGY': 'Instamart',
  'FLIPKART': 'Flipkart',
  'BIGBASKET': 'BigBasket',
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

// Deliberately a small, self-contained alias set - kept separate from the Bulk
// PO Compilation module's ColumnMappingService/STANDARD_BULK_FIELDS on purpose,
// so this single-PO Excel path never depends on (or is affected by) the bulk
// pipeline's per-platform mapping overrides.
type ExcelHeaderField = 'poNumber' | 'poDate' | 'expiryDate' | 'channelId' | 'location' | 'poValue' | 'skuCode' | 'skuName' | 'quantity' | 'mrp' | 'upc' | 'unitPrice';

const GENERIC_EXCEL_ALIASES: Record<ExcelHeaderField, string[]> = {
  poNumber: ['po number', 'po no', 'purchase order', 'purchase order number', 'order id', 'po id', 'po#'],
  poDate: ['po date', 'order date', 'purchase order date', 'date'],
  expiryDate: ['expiry date', 'po expiry date', 'valid till', 'validity date'],
  channelId: ['platform', 'channel', 'marketplace'],
  location: ['warehouse', 'fc', 'facility', 'destination', 'delivery location', 'warehouse name', 'warehouse/fc'],
  poValue: ['po value', 'total value', 'order value', 'total amount', 'net amount'],
  skuCode: ['sku', 'sku code', 'item code', 'product code', 'sku id'],
  skuName: ['product name', 'item name', 'product description', 'description', 'sku name'],
  quantity: ['ordered qty', 'ordered quantity', 'order qty', 'po qty', 'quantity', 'qty'],
  mrp: ['mrp', 'maximum retail price', 'm.r.p'],
  upc: ['upc', 'product upc', 'barcode', 'ean', 'gtin', 'ean/upc'],
  // "Landing Rate" (base cost + tax) is what's actually paid per unit, so it
  // must win over the pre-tax "Basic Cost Price"/"cost_price" columns that
  // often sit right next to it in the same sheet - listed first so the
  // two-pass matcher locks it in before ever considering the alternatives.
  unitPrice: ['landing rate', 'landing price', 'unit price', 'basic cost price', 'cost price', 'rate'],
};

/**
 * Per-platform alias overrides, merged on top of GENERIC_EXCEL_ALIASES (platform
 * aliases tried first). Add a platform's real export column names here as new
 * formats show up - this is the intended extension point, not the alias lists
 * above. Starting with Blinkit's two known export shapes: the single-PO
 * "Item Code / Product Description / Quantity" sheet, and the multi-PO
 * "po_number / item_id / name / units_ordered" bulk sheet.
 */
const PLATFORM_EXCEL_ALIASES: Record<string, Partial<Record<ExcelHeaderField, string[]>>> = {
  blinkit: {
    poNumber: ['po_number', 'po id'],
    poDate: ['order_date', 'order date'],
    expiryDate: ['expiry_date'],
    location: ['facility_name', 'facility name'],
    skuCode: ['item_id', 'item id'],
    skuName: ['name'],
    quantity: ['units_ordered', 'units ordered', 'ordered_quantity'],
    poValue: ['total_amount'],
  },
};

// Legal/registered names seen in vendor/manufacturer columns -> the channel
// names used elsewhere in the app - reused when a sheet has no explicit
// platform/channel column but does name the buyer somewhere in the row.
const VENDOR_NAME_TO_CHANNEL: Record<string, string> = {
  'BLINK COMMERCE': 'Blinkit',
  ZEPTO: 'Zepto',
  INSTAMART: 'Instamart',
  SWIGGY: 'Instamart',
  FLIPKART: 'Flipkart',
  BIGBASKET: 'BigBasket',
};

@Injectable()
export class POImportService {
  private readonly logger = new Logger(POImportService.name);

  async extractHeaderFromPdf(buffer: Buffer): Promise<Partial<ExtractedPODraft>> {
    const { text } = await pdfParse(buffer);

    const poNumber = this.matchOne(text, /P\.O\.\s*Number\s*:\s*(\S+)/i);
    const poDateRaw = this.matchOne(text, /^Date\s*:\s*(.+)$/im);
    const poExpiryRaw = this.matchOne(text, /PO expiry date\s*:\s*(.+)$/im);
    const poDeliveryRaw = this.matchOne(text, /PO delivery date\s*:\s*(.+)$/im);
    const netAmountRaw = this.matchOne(text, /Net amount\s*:?\s*([\d,]+\.?\d*)/i);

    const buyerName = this.extractBuyerName(text);
    const location = this.extractWarehouseLine(text);

    return {
      poNumber,
      poDate: this.parseFlexibleDate(poDateRaw),
      poExpiryDate: this.parseFlexibleDate(poExpiryRaw),
      poDeliveryDate: this.parseFlexibleDate(poDeliveryRaw),
      channelId: buyerName ? this.normalizeBuyer(buyerName) : null,
      customerId: buyerName || null,
      location,
      poValue: netAmountRaw ? Number(netAmountRaw.replace(/,/g, '')) : null,
    };
  }

  /**
   * The companion Excel/CSV uploaded alongside a PO PDF. Two real shapes exist:
   * a single-PO detail sheet (use every row), and a multi-PO "Bulk PO" sheet
   * with a po_number column repeating many different POs' line items in one
   * file - when that column is present, only rows matching `poNumber` (the
   * PDF's own extracted PO number) are kept, so uploading the full bulk sheet
   * doesn't dump every other PO's SKUs onto this one.
   */
  extractLineItemsFromXlsx(buffer: Buffer, platform?: string, poNumber?: string | null): ExtractedLineItem[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 2) return [];

    const header = rows[0].map((h) => String(h).trim());
    const mapping = this.mapExcelHeaders(header, platform);
    const colIndex = (field: ExcelHeaderField): number => (mapping[field] ? header.indexOf(mapping[field] as string) : -1);
    const skuCodeCol = colIndex('skuCode');
    const skuNameCol = colIndex('skuName');
    const quantityCol = colIndex('quantity');
    const poNumberCol = colIndex('poNumber');
    const mrpCol = colIndex('mrp');
    const upcCol = colIndex('upc');
    const unitPriceCol = colIndex('unitPrice');
    if (skuCodeCol === -1 || skuNameCol === -1 || quantityCol === -1) return [];

    const cellStr = (row: any[], col: number): string | null => {
      if (col < 0 || row[col] === undefined) return null;
      const v = String(row[col]).trim();
      return v === '' ? null : v;
    };
    const cellNum = (row: any[], col: number): number | null => {
      const v = cellStr(row, col);
      if (v === null) return null;
      const n = Number(v.replace(/,/g, ''));
      return Number.isNaN(n) ? null : n;
    };
    // Excel/CSV numeric po_number cells can round-trip as "5625710061821" vs
    // "5625710061821.0" - compare the numeric value, not the raw string.
    const poNumbersMatch = (a: string, b: string): boolean => {
      if (a.trim() === b.trim()) return true;
      const na = Number(a);
      const nb = Number(b);
      return !Number.isNaN(na) && !Number.isNaN(nb) && na === nb;
    };

    let dataRows = rows.slice(1);
    if (poNumberCol !== -1 && poNumber) {
      dataRows = dataRows.filter((row) => {
        const cell = cellStr(row, poNumberCol);
        return cell !== null && poNumbersMatch(cell, poNumber);
      });
    }

    const items: ExtractedLineItem[] = [];
    for (const row of dataRows) {
      const skuCode = cellStr(row, skuCodeCol);
      const skuName = cellStr(row, skuNameCol);
      const quantity = cellNum(row, quantityCol);
      if (!skuCode || !skuName || !quantity) continue; // hits totals/footer rows once the code column runs dry
      items.push({
        skuCode,
        skuName,
        quantity,
        mrp: cellNum(row, mrpCol),
        upc: cellStr(row, upcCol),
        unitPrice: cellNum(row, unitPriceCol),
      });
    }
    return items;
  }

  /**
   * A single Excel/CSV file = one PO with N line-item rows (PO-level fields are
   * typically repeated on every row in these exports). This is intentionally
   * NOT the Bulk PO Compilation pipeline - no batching, dedup, or exception
   * queue, just a header-column guess feeding the same review-before-confirm
   * form used for the PDF path.
   *
   * `platform` (e.g. 'blinkit') selects a per-platform alias overlay tried
   * before the generic aliases. `fileName` is used only as a last-resort
   * fallback for PO Number when no column in the sheet carries it at all
   * (real single-PO line-item exports sometimes don't).
   */
  buildDraftFromExcel(buffer: Buffer, platform?: string, fileName?: string): ExtractedPODraft {
    const warnings: string[] = [];
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const empty: ExtractedPODraft = {
      poNumber: null,
      poDate: null,
      poExpiryDate: null,
      poDeliveryDate: null,
      channelId: null,
      customerId: null,
      location: null,
      poValue: null,
      lineItems: [],
      warnings: ['The uploaded file has no data rows.'],
    };
    if (rows.length < 2) return empty;

    const header = rows[0].map((h) => String(h).trim());
    const mapping = this.mapExcelHeaders(header, platform);
    const colIndex = (field: ExcelHeaderField): number => (mapping[field] ? header.indexOf(mapping[field] as string) : -1);

    const cols: Record<ExcelHeaderField, number> = {
      poNumber: colIndex('poNumber'),
      poDate: colIndex('poDate'),
      expiryDate: colIndex('expiryDate'),
      channelId: colIndex('channelId'),
      location: colIndex('location'),
      poValue: colIndex('poValue'),
      skuCode: colIndex('skuCode'),
      skuName: colIndex('skuName'),
      quantity: colIndex('quantity'),
      mrp: colIndex('mrp'),
      upc: colIndex('upc'),
      unitPrice: colIndex('unitPrice'),
    };

    const allDataRows = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));

    const cellStr = (row: any[], col: number): string | null => {
      if (col < 0 || row[col] === undefined) return null;
      const v = String(row[col]).trim();
      return v === '' ? null : v;
    };
    const cellNum = (row: any[], col: number): number | null => {
      const v = cellStr(row, col);
      if (v === null) return null;
      const n = Number(v.replace(/,/g, ''));
      return Number.isNaN(n) ? null : n;
    };

    // Real exports often end in a footer/summary block ("Total Quantity",
    // "Net amount", "Cart Discount"...) whose values land in arbitrary columns
    // that happen to overlap the item table's columns (e.g. the grand total
    // sometimes prints in the same column as each line's own Total Amount).
    // Only rows with a genuine SKU code AND name are treated as real line
    // items - every other extraction (line items, PO value sum, header
    // fields) is scoped to just those rows so footer noise can't leak in.
    const dataRows = allDataRows.filter((row) => cellStr(row, cols.skuCode) && cellStr(row, cols.skuName));

    const firstNonEmpty = (col: number, transform: (v: string) => string | number | null = (v) => v) => {
      for (const row of dataRows) {
        const raw = cellStr(row, col);
        if (raw !== null) {
          const t = transform(raw);
          if (t !== null) return t;
        }
      }
      return null;
    };
    // po_value-shaped columns are almost always a PER-LINE amount in tabular
    // exports (e.g. "Total Amount" per row), not a single repeated document
    // total - summing every genuine line item gives the real PO value, taking
    // just the first row's value would silently under-report it.
    const sumColumn = (col: number): number | null => {
      if (col < 0) return null;
      let total = 0;
      let sawAny = false;
      for (const row of dataRows) {
        const n = cellNum(row, col);
        if (n !== null) {
          total += n;
          sawAny = true;
        }
      }
      return sawAny ? total : null;
    };

    let poNumber = firstNonEmpty(cols.poNumber) as string | null;
    const poDate = firstNonEmpty(cols.poDate, (v) => this.parseExcelDateString(v)) as string | null;
    const poExpiryDate = firstNonEmpty(cols.expiryDate, (v) => this.parseExcelDateString(v)) as string | null;
    let channelId = firstNonEmpty(cols.channelId) as string | null;
    const location = firstNonEmpty(cols.location) as string | null;
    const poValue = sumColumn(cols.poValue);

    if (!channelId) {
      channelId = this.inferChannelFromRow(header, dataRows[0] || []) || (platform ? this.titleCase(platform) : null);
    }

    if (!poNumber && fileName) {
      // Real single-PO detail exports sometimes carry the PO number only in
      // the filename (e.g. "PO_51024410018979_ItemDetails.xlsx"), not as a
      // column at all - a long digit run is the most reliable signal there.
      const fromFileName = fileName.match(/\d{5,}/);
      if (fromFileName) {
        poNumber = fromFileName[0];
        warnings.push(`PO Number "${poNumber}" was guessed from the file name - please confirm it's correct.`);
      }
    }

    const lineItems: ExtractedLineItem[] = [];
    for (const row of dataRows) {
      const skuCode = cellStr(row, cols.skuCode) as string;
      const skuName = cellStr(row, cols.skuName) as string;
      const quantity = cellNum(row, cols.quantity);
      if (!quantity) continue;
      lineItems.push({
        skuCode,
        skuName,
        quantity,
        mrp: cellNum(row, cols.mrp),
        upc: cellStr(row, cols.upc),
        unitPrice: cellNum(row, cols.unitPrice),
      });
    }
    if (lineItems.length === 0) {
      warnings.push('Could not find a recognizable SKU/Quantity table in the uploaded file - add line items manually.');
    }

    (['poDate', 'expiryDate', 'location', 'poValue'] as ExcelHeaderField[]).forEach((field) => {
      if (!mapping[field]) warnings.push(`Could not confidently identify a column for "${field}" - please check.`);
    });
    if (!mapping.poNumber && !poNumber) {
      warnings.push('Could not confidently identify a column for "poNumber" - please check.');
    }
    if (!mapping.channelId && !channelId) {
      warnings.push('Could not confidently identify a column for "channelId" - please check.');
    }

    return {
      poNumber,
      poDate,
      poExpiryDate,
      poDeliveryDate: null,
      channelId,
      customerId: channelId,
      location,
      poValue,
      lineItems,
      warnings,
    };
  }

  private inferChannelFromRow(headers: string[], row: any[]): string | null {
    const vendorColIndexes = headers
      .map((h, i) => ({ h: h.toLowerCase(), i }))
      .filter(({ h }) => h.includes('vendor') || h.includes('manufacturer') || h.includes('entity'))
      .map(({ i }) => i);

    for (const i of vendorColIndexes) {
      const value = String(row[i] ?? '').toUpperCase();
      if (!value) continue;
      for (const [key, channel] of Object.entries(VENDOR_NAME_TO_CHANNEL)) {
        if (value.includes(key)) return channel;
      }
    }
    return null;
  }

  private titleCase(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  private mapExcelHeaders(headers: string[], platform?: string): Partial<Record<ExcelHeaderField, string>> {
    const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) })).filter((h) => h.norm !== '');
    const used = new Set<string>();
    const mapping: Partial<Record<ExcelHeaderField, string>> = {};
    const fields = Object.keys(GENERIC_EXCEL_ALIASES) as ExcelHeaderField[];
    const platformOverrides = (platform && PLATFORM_EXCEL_ALIASES[platform.toLowerCase()]) || {};

    const aliasesFor = (field: ExcelHeaderField): string[] => [
      ...(platformOverrides[field] || []),
      ...GENERIC_EXCEL_ALIASES[field],
    ];

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

    // Exact matches first across every field, then partial - same two-pass
    // rule as the bulk pipeline's mapper, to stop a generic alias (e.g. "date"
    // for poDate) from stealing a header meant for a more specific field
    // (e.g. "PO Expiry Date") just because it's declared first.
    for (const field of fields) {
      const exact = find(aliasesFor(field), true);
      if (exact) {
        mapping[field] = exact;
        used.add(exact);
      }
    }
    for (const field of fields) {
      if (mapping[field]) continue;
      const partial = find(aliasesFor(field), false);
      if (partial) {
        mapping[field] = partial;
        used.add(partial);
      }
    }
    return mapping;
  }

  /**
   * Excel-typical date strings (DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD) are parsed
   * component-by-component and rebuilt with an explicit "+05:30" offset - same
   * IST-safety rule as parseFlexibleDate below, so this never silently depends
   * on the server process's local timezone.
   */
  private parseExcelDateString(raw: string): string | null {
    const cleaned = raw.trim();

    const isoLike = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoLike) {
      const [, y, m, d] = isoLike;
      return this.buildIsoIst(Number(y), Number(m), Number(d));
    }

    const dmy = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return this.buildIsoIst(Number(y), Number(m), Number(d));
    }

    // Excel serial date (e.g. 46000) - convert via the same epoch xlsx itself uses.
    if (/^\d+(\.\d+)?$/.test(cleaned)) {
      const serial = Number(cleaned);
      const parsed = XLSX.SSF.parse_date_code(serial);
      if (parsed) return this.buildIsoIst(parsed.y, parsed.m, parsed.d);
    }

    return this.parseFlexibleDate(cleaned);
  }

  private buildIsoIst(year: number, month: number, day: number): string | null {
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${year}-${pad(month)}-${pad(day)}T00:00:00+05:30`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  async buildDraft(pdfBuffer: Buffer, linesBuffer?: Buffer): Promise<ExtractedPODraft> {
    const warnings: string[] = [];
    let header: Partial<ExtractedPODraft> = {};
    try {
      header = await this.extractHeaderFromPdf(pdfBuffer);
    } catch (err) {
      this.logger.error('Failed to parse PDF header', err as any);
      warnings.push('Could not read the PDF - fill in PO details manually.');
    }

    let lineItems: ExtractedLineItem[] = [];
    if (linesBuffer) {
      try {
        // The PDF's own header already told us the platform (via the buyer
        // name) and PO number - reuse both so a multi-PO "Bulk PO" companion
        // sheet gets filtered down to just this PO's rows automatically,
        // instead of the user having to hand-trim it first.
        const platformHint = header.channelId ? header.channelId.toLowerCase() : undefined;
        lineItems = this.extractLineItemsFromXlsx(linesBuffer, platformHint, header.poNumber);
        if (lineItems.length === 0) {
          warnings.push('Could not find a recognizable item table in the uploaded line-items file.');
        }
      } catch (err) {
        this.logger.error('Failed to parse line-items file', err as any);
        warnings.push('Could not read the line-items file - add SKUs manually.');
      }
    } else {
      warnings.push('No line-items file uploaded - PDF tables are not reliably parseable, so SKUs must be added manually or pasted in.');
    }

    (['poNumber', 'poDate', 'poExpiryDate', 'channelId', 'customerId', 'location', 'poValue'] as const).forEach((field) => {
      if (!header[field]) warnings.push(`Could not confidently extract "${field}" - please check.`);
    });

    return {
      poNumber: header.poNumber ?? null,
      poDate: header.poDate ?? null,
      poExpiryDate: header.poExpiryDate ?? null,
      poDeliveryDate: header.poDeliveryDate ?? null,
      channelId: header.channelId ?? null,
      customerId: header.customerId ?? null,
      location: header.location ?? null,
      poValue: header.poValue ?? null,
      lineItems,
      warnings,
    };
  }

  private matchOne(text: string, re: RegExp): string | null {
    const m = text.match(re);
    return m ? m[1].trim() : null;
  }

  private extractBuyerName(text: string): string | null {
    // The buyer/customer legal name is the first non-blank line right after the "Purchase Order" title.
    const lines = text.split('\n').map((l) => l.trim());
    const titleIdx = lines.findIndex((l) => l === 'Purchase Order');
    if (titleIdx === -1) return null;
    for (let i = titleIdx + 1; i < lines.length; i++) {
      if (lines[i]) return lines[i];
    }
    return null;
  }

  private extractWarehouseLine(text: string): string | null {
    // The warehouse line sits between the CIN line and "Contact Name:" near the top of the doc.
    const lines = text.split('\n').map((l) => l.trim());
    const cinIdx = lines.findIndex((l) => /^CIN\s*:/.test(l));
    const contactIdx = lines.findIndex((l) => /^Contact Name\s*:/.test(l));
    if (cinIdx !== -1 && contactIdx !== -1 && contactIdx > cinIdx + 1) {
      return lines.slice(cinIdx + 1, contactIdx).join(' ').trim() || null;
    }
    return null;
  }

  private normalizeBuyer(name: string): string {
    const upper = name.toUpperCase();
    for (const [key, channel] of Object.entries(KNOWN_BUYERS)) {
      if (upper.includes(key)) return channel;
    }
    return name;
  }

  /**
   * These PO documents always print times in IST with no offset marker (e.g.
   * "Aug. 31, 2026, 1:58 p.m."). Parsing that string with a bare `new Date(...)`
   * would use the *server's* local timezone, which is only IST by accident of
   * this dev machine's settings - on a UTC-clocked host it would silently land
   * 5.5 hours off. Instead we pull the components out ourselves and build an
   * ISO string with an explicit "+05:30" offset, which `Date` parses the same
   * way regardless of where the process runs.
   */
  private parseFlexibleDate(raw: string | null): string | null {
    if (!raw) return null;
    const cleaned = raw.replace(/,\s*$/, '').replace(/\./g, '');
    const match = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (!match) return null;

    const [, monthName, day, year, hourStr, minute, meridiem] = match;
    const month = MONTHS[monthName.toLowerCase()];
    if (month === undefined) return null;

    let hour = Number(hourStr) % 12;
    if (meridiem.toLowerCase() === 'pm') hour += 12;

    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${year}-${pad(month + 1)}-${pad(Number(day))}T${pad(hour)}:${minute}:00+05:30`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
