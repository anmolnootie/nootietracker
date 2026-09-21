import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, any>[];
}

@Injectable()
export class FileReaderService {
  read(buffer: Buffer, fileName: string): ParsedFile {
    const ext = fileName.split('.').pop()?.toLowerCase();
    let workbook: XLSX.WorkBook;

    if (ext === 'csv') {
      workbook = XLSX.read(buffer.toString('utf-8'), { type: 'string', cellDates: true });
    } else if (ext === 'xlsx' || ext === 'xls') {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } else {
      throw new BadRequestException(`Unsupported file type: .${ext || 'unknown'} - upload .xlsx, .xls, or .csv`);
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('The uploaded file has no sheets/data');
    const sheet = workbook.Sheets[sheetName];

    // Real exports often carry a title banner ("Dispatch Report-11-Sep-2026")
    // and sometimes a merged group-label row ("DISPATCH DETAILS", "DELIVERY",
    // ...) above the real column headers. A merged range only stores its value
    // in its top-left cell, so those rows read back as one or a handful of
    // non-empty cells versus a real header row's many. Take the first row in
    // the top of the sheet that is nearly as wide as the widest one there -
    // row 1 for an ordinary file, the real header row under any banner rows.
    const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    // Google Sheets' Excel export leaves every date ~10 seconds short of its
    // real instant, so a date-only cell for 7 Apr parses as 6 Apr 23:59:50 -
    // a full day early once the time is dropped. No real date here carries
    // seconds precision, so snap Date cells to the nearest minute.
    return this.fromGrid(grid.map((row) => row.map((v) => (v instanceof Date ? new Date(Math.round(v.getTime() / 60000) * 60000) : v))));
  }

  /**
   * Turns a raw grid (array of rows) into headers + keyed rows, finding the
   * real header row under any title/group banner rows. Used for files and
   * for sheets pushed in directly (Google Apps Script).
   */
  fromGrid(grid: any[][]): ParsedFile {
    if (!grid || grid.length === 0) return { headers: [], rows: [] };
    const nonEmptyCount = (row: any[]) => row.filter((c) => c !== '' && c !== null && c !== undefined).length;
    const window = grid.slice(0, 15);
    const widest = Math.max(...window.map(nonEmptyCount));
    const found = window.findIndex((row) => nonEmptyCount(row) > 1 && nonEmptyCount(row) >= widest * 0.8);
    const headerRowIndex = found >= 0 ? found : 0;
    const headerRow = grid[headerRowIndex];
    const headers = headerRow.map((h) => String(h ?? '').trim());

    const rows: Record<string, any>[] = [];
    for (let i = headerRowIndex + 1; i < grid.length; i++) {
      const dataRow = grid[i];
      const obj: Record<string, any> = {};
      let hasAnyValue = false;
      headers.forEach((h, colIdx) => {
        if (!h) return;
        const v = dataRow[colIdx];
        obj[h] = v === undefined ? '' : v;
        if (v !== undefined && v !== '') hasAnyValue = true;
      });
      if (hasAnyValue) rows.push(obj);
    }

    return { headers: headers.filter((h) => h !== ''), rows };
  }
}
