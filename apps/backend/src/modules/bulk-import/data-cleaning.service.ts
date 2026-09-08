import { Injectable } from '@nestjs/common';
import { ExceptionSeverity, ExceptionType, StandardBulkField } from '@po-control-tower/shared';

export interface CleanedRow {
  platform?: string;
  poNumber?: string;
  poDate?: Date;
  appointmentDate?: Date;
  appointmentTime?: string;
  warehouse?: string;
  skuCode?: string;
  upc?: string;
  productName?: string;
  mrp?: number;
  orderedQty?: number;
  acceptedQty?: number;
  dispatchedQty?: number;
  deliveredQty?: number;
  rejectedQty?: number;
  pendingQty?: number;
  unitPrice?: number;
  poValue?: number;
  appointmentStatus?: string;
  deliveryStatus?: string;
  poStatus?: string;
  expiryDate?: Date;
}

export interface CleaningIssue {
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  message: string;
}

export interface CleaningResult {
  isBlank: boolean;
  cleaned: CleanedRow;
  issues: CleaningIssue[];
  status: 'VALID' | 'INVALID' | 'WARNING';
}

const NUMERIC_FIELDS: [StandardBulkField, keyof CleanedRow][] = [
  ['ordered_qty', 'orderedQty'],
  ['accepted_qty', 'acceptedQty'],
  ['dispatched_qty', 'dispatchedQty'],
  ['delivered_qty', 'deliveredQty'],
  ['rejected_qty', 'rejectedQty'],
  ['pending_qty', 'pendingQty'],
  ['unit_price', 'unitPrice'],
  ['po_value', 'poValue'],
  ['mrp', 'mrp'],
];

@Injectable()
export class DataCleaningService {
  clean(
    rawRow: Record<string, any>,
    mapping: Partial<Record<StandardBulkField, string>>,
    defaultPlatform: string,
  ): CleaningResult {
    const isEmptyCell = (v: any) => v === undefined || v === null || String(v).trim() === '';
    const allEmpty = Object.values(rawRow).every(isEmptyCell);
    if (allEmpty) {
      return { isBlank: true, cleaned: {}, issues: [], status: 'INVALID' };
    }

    const get = (field: StandardBulkField): any => {
      const col = mapping[field];
      if (!col) return undefined;
      const v = rawRow[col];
      return isEmptyCell(v) ? undefined : v;
    };

    const issues: CleaningIssue[] = [];
    const cleaned: CleanedRow = {};

    cleaned.platform = cleanText(get('platform')) || defaultPlatform;
    cleaned.poNumber = cleanText(get('po_number'));
    cleaned.warehouse = cleanText(get('warehouse'));
    cleaned.skuCode = cleanText(get('sku_code'));
    cleaned.upc = cleanText(get('upc'));
    // Many Quick Commerce exports identify products by UPC only, with no
    // internal SKU/Item Code column at all - UPC uniquely identifies the
    // product just as well, so fall back to it as the compilation identifier.
    if (!cleaned.skuCode && cleaned.upc) cleaned.skuCode = cleaned.upc;
    cleaned.productName = cleanText(get('product_name'));
    cleaned.appointmentTime = cleanText(get('appointment_time'));
    cleaned.appointmentStatus = cleanText(get('appointment_status'));
    cleaned.deliveryStatus = cleanText(get('delivery_status'));
    cleaned.poStatus = cleanText(get('po_status'));

    if (!cleaned.poNumber) {
      issues.push({ exceptionType: ExceptionType.MISSING_PO, severity: ExceptionSeverity.HIGH, message: 'PO Number is missing' });
    }
    if (!cleaned.skuCode) {
      issues.push({ exceptionType: ExceptionType.MISSING_SKU, severity: ExceptionSeverity.HIGH, message: 'SKU Code is missing' });
    }
    if (!cleaned.warehouse) {
      issues.push({ exceptionType: ExceptionType.MISSING_WAREHOUSE, severity: ExceptionSeverity.MEDIUM, message: 'Warehouse/FC is missing' });
    }

    const poDateRaw = get('po_date');
    if (poDateRaw !== undefined) {
      const d = parseFlexibleDate(poDateRaw);
      if (d) cleaned.poDate = d;
      else issues.push({ exceptionType: ExceptionType.INVALID_DATE, severity: ExceptionSeverity.MEDIUM, message: `Unparseable PO Date: "${poDateRaw}"` });
    }

    const expiryRaw = get('expiry_date');
    if (expiryRaw !== undefined) {
      const d = parseFlexibleDate(expiryRaw);
      if (d) cleaned.expiryDate = d;
      else issues.push({ exceptionType: ExceptionType.INVALID_DATE, severity: ExceptionSeverity.HIGH, message: `Unparseable Expiry Date: "${expiryRaw}"` });
    } else {
      issues.push({
        exceptionType: ExceptionType.MISSING_MANDATORY_DATA,
        severity: ExceptionSeverity.HIGH,
        message: 'Expiry Date not available in source file - required to compile a new PO',
      });
    }

    // A fresh PO simply doesn't have an appointment yet - that's the normal
    // starting state, not a data problem, so a blank appointment_date is not
    // flagged. Only a genuinely unparseable (present but malformed) value is
    // worth a look.
    const apptDateRaw = get('appointment_date');
    if (apptDateRaw !== undefined) {
      const d = parseFlexibleDate(apptDateRaw);
      if (d) cleaned.appointmentDate = d;
      else issues.push({ exceptionType: ExceptionType.INVALID_DATE, severity: ExceptionSeverity.LOW, message: `Unparseable Appointment Date: "${apptDateRaw}"` });
    }

    for (const [field, key] of NUMERIC_FIELDS) {
      const raw = get(field);
      if (raw === undefined) continue;
      const n = parseNumber(raw);
      if (n === null) {
        issues.push({
          exceptionType: ExceptionType.MISSING_MANDATORY_DATA,
          severity: ExceptionSeverity.LOW,
          message: `Unparseable numeric value for ${field}: "${raw}" - treated as not available`,
        });
        continue;
      }
      if (n < 0) {
        issues.push({ exceptionType: ExceptionType.NEGATIVE_QUANTITY, severity: ExceptionSeverity.MEDIUM, message: `${field} is negative (${n})` });
      }
      (cleaned as any)[key] = n;
    }

    if (cleaned.pendingQty === undefined && cleaned.orderedQty !== undefined && cleaned.deliveredQty !== undefined) {
      cleaned.pendingQty = Math.max(0, cleaned.orderedQty - cleaned.deliveredQty);
    }

    if ((cleaned.poStatus || '').toLowerCase().includes('cancel')) {
      issues.push({
        exceptionType: ExceptionType.CANCELLED_PO,
        severity: ExceptionSeverity.MEDIUM,
        message: `PO Status is "${cleaned.poStatus}"`,
      });
    }

    const hardErrors = issues.filter((i) => i.severity === ExceptionSeverity.HIGH || i.severity === ExceptionSeverity.CRITICAL);
    const status: CleaningResult['status'] = hardErrors.length > 0 ? 'INVALID' : issues.length > 0 ? 'WARNING' : 'VALID';

    return { isBlank: false, cleaned, issues, status };
  }
}

function cleanText(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || undefined;
}

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

  // DD/MM/YYYY or DD-MM-YYYY (Indian exports default to day-first, unlike JS's native parser)
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
