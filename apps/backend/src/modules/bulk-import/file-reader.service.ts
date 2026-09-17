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

    // Real exports often carry a merged title banner ("Dispatch Report-11-Sep-2026")
    // above the real column headers - a merged range only stores its value in the
    // top-left cell, so that row reads back as a single non-empty cell versus a
    // real header row's many. Scan for the first row with more than one non-empty
    // cell and treat that as the header row, rather than always assuming row 1 is.
    const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (grid.length === 0) return { headers: [], rows: [] };

    const nonEmptyCount = (row: any[]) => row.filter((c) => c !== '' && c !== null && c !== undefined).length;
    const found = grid.findIndex((row) => nonEmptyCount(row) > 1);
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
