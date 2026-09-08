import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export interface ExtractedSkuRow {
  skuCode: string;
  skuName: string;
  upc: string | null;
  mrp: number | null;
  unitPrice: number | null;
  stockQuantity: number | null;
}

export interface SkuExtractionResult {
  rows: ExtractedSkuRow[];
  warnings: string[];
}

type SkuField = 'skuCode' | 'skuName' | 'upc' | 'mrp' | 'unitPrice' | 'stockQuantity';

// Deliberately its own small alias set (not shared with the PO import/bulk-import
// pipelines) - this file describes a standalone stock/SKU master, not a PO line-item
// export, so it needs its own "stock quantity" concept that those pipelines don't have.
const ALIASES: Record<SkuField, string[]> = {
  skuCode: ['sku', 'sku code', 'item code', 'product code', 'sku id', 'item id'],
  skuName: ['product name', 'item name', 'product description', 'description', 'sku name', 'name'],
  upc: ['upc', 'product upc', 'barcode', 'ean', 'gtin', 'ean/upc'],
  mrp: ['mrp', 'maximum retail price', 'm.r.p'],
  unitPrice: ['unit price', 'price', 'rate', 'cost price', 'landing rate', 'landing price'],
  stockQuantity: [
    'stock',
    'stock qty',
    'stock quantity',
    'on hand',
    'on hand qty',
    'available stock',
    'closing stock',
    'current stock',
    'inventory',
    'quantity',
    'qty',
  ],
};

@Injectable()
export class SkuExtractionService {
  extract(buffer: Buffer, fileName: string): SkuExtractionResult {
    const ext = fileName.split('.').pop()?.toLowerCase();
    let workbook: XLSX.WorkBook;
    if (ext === 'csv') {
      workbook = XLSX.read(buffer.toString('utf-8'), { type: 'string' });
    } else if (ext === 'xlsx' || ext === 'xls') {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } else {
      throw new BadRequestException(`Unsupported file type: .${ext || 'unknown'} - upload .xlsx, .xls, or .csv`);
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('The uploaded file has no sheets/data');
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const warnings: string[] = [];
    if (rows.length < 2) {
      return { rows: [], warnings: ['The uploaded file has no data rows.'] };
    }

    const header = rows[0].map((h) => String(h).trim());
    const mapping = this.mapHeaders(header);
    const colIndex = (field: SkuField): number => (mapping[field] ? header.indexOf(mapping[field] as string) : -1);
    const cols: Record<SkuField, number> = {
      skuCode: colIndex('skuCode'),
      skuName: colIndex('skuName'),
      upc: colIndex('upc'),
      mrp: colIndex('mrp'),
      unitPrice: colIndex('unitPrice'),
      stockQuantity: colIndex('stockQuantity'),
    };

    if (cols.skuCode === -1) {
      return { rows: [], warnings: ['Could not find a SKU/item code column in the uploaded file.'] };
    }
    if (!mapping.skuName) warnings.push('Could not confidently identify a "product name" column - names may be blank.');
    if (!mapping.stockQuantity) warnings.push('Could not confidently identify a "stock quantity" column - quantities may be blank.');

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

    const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
    const extracted: ExtractedSkuRow[] = [];
    let skippedNoCode = 0;

    for (const row of dataRows) {
      const skuCode = cellStr(row, cols.skuCode);
      if (!skuCode) {
        skippedNoCode++;
        continue;
      }
      extracted.push({
        skuCode,
        skuName: cellStr(row, cols.skuName) || skuCode,
        upc: cellStr(row, cols.upc),
        mrp: cellNum(row, cols.mrp),
        unitPrice: cellNum(row, cols.unitPrice),
        stockQuantity: cellNum(row, cols.stockQuantity),
      });
    }

    if (skippedNoCode > 0) {
      warnings.push(`Skipped ${skippedNoCode} row(s) with no SKU code (likely footer/summary rows).`);
    }
    if (extracted.length === 0) {
      warnings.push('No rows with a recognizable SKU code were found.');
    }

    return { rows: extracted, warnings };
  }

  private mapHeaders(headers: string[]): Partial<Record<SkuField, string>> {
    const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) })).filter((h) => h.norm !== '');
    const used = new Set<string>();
    const mapping: Partial<Record<SkuField, string>> = {};
    const fields = Object.keys(ALIASES) as SkuField[];

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
      const exact = find(ALIASES[field], true);
      if (exact) {
        mapping[field] = exact;
        used.add(exact);
      }
    }
    for (const field of fields) {
      if (mapping[field]) continue;
      const partial = find(ALIASES[field], false);
      if (partial) {
        mapping[field] = partial;
        used.add(partial);
      }
    }
    return mapping;
  }
}
