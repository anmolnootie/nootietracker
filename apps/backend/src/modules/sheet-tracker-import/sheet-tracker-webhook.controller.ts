import { Controller, Post, Body, Headers, HttpCode, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { SheetTrackerImportService } from './sheet-tracker-import.service';

/**
 * Receives the Master Dispatch & GRN Tracker straight from Google Sheets
 * (a small Apps Script in the sheet posts its rows on a timer) - free, and
 * needs no Google Cloud project. NOT behind the normal JWT login, since
 * Google's servers call it; authenticated by the x-sync-key header against
 * SHEET_SYNC_KEY. If that variable isn't set the endpoint stays closed.
 */
@Controller('webhooks/google-sheets')
export class SheetTrackerWebhookController {
  constructor(
    private readonly service: SheetTrackerImportService,
    private readonly config: ConfigService,
  ) {}

  @Post('tracker')
  @HttpCode(200)
  async receive(@Body() body: { rows?: any[][] }, @Headers('x-sync-key') key: string | undefined) {
    const expected = this.config.get<string>('SHEET_SYNC_KEY');
    if (!expected) throw new UnauthorizedException('Google Sheets sync is not configured (SHEET_SYNC_KEY not set)');
    const a = Buffer.from(key ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid sync key');

    if (!body || !Array.isArray(body.rows)) throw new BadRequestException('Expected { "rows": [[...], ...] }');

    const result = await this.service.syncFromGrid(body.rows);
    if ('unchanged' in result) return { status: 'UNCHANGED', message: 'Sheet is identical to the last sync - nothing applied' };
    return {
      status: result.status,
      batchCode: result.batchCode,
      rows: result.totalRows,
      applied: result.appliedCount,
      skipped: result.skippedCount,
    };
  }
}
