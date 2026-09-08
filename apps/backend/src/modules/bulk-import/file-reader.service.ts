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

    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    return { headers, rows };
  }
}
