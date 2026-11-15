import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Post, Req, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@po-control-tower/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WarehouseMasterService } from './warehouse-master.service';

/** Warehouse Master import: upload the workbook (ADMIN/SCM); anyone signed in can read the last result. */
@Controller('warehouse-master')
@UseGuards(AuthGuard('jwt'))
export class WarehouseMasterController {
  constructor(private readonly service: WarehouseMasterService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Post('upload')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SCM)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 40 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('Attach the Warehouse Master Excel file');
    return this.service.start(file.buffer, file.originalname, req.user.userId);
  }
}

/**
 * Automatic sync target for the Apps Script inside the Warehouse Master
 * spreadsheet (shown on Uploads > Warehouse Master). Public route guarded by
 * the same x-sync-key / SHEET_SYNC_KEY as the tracker sync; closed when unset.
 * Body: { tabs: { "ORDER BOOK": string[][], "DISPATCH + GRN": string[][], ... } } (display values).
 */
@Controller('webhooks/google-sheets')
export class WarehouseMasterWebhookController {
  constructor(private readonly service: WarehouseMasterService, private readonly config: ConfigService) {}

  @Post('warehouse-master')
  @HttpCode(200)
  receive(@Body() body: { tabs?: Record<string, unknown[][]> }, @Headers('x-sync-key') key: string | undefined) {
    const expected = this.config.get<string>('SHEET_SYNC_KEY');
    if (!expected) throw new UnauthorizedException('Google Sheets sync is not configured (SHEET_SYNC_KEY not set)');
    const a = Buffer.from(key ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid sync key');
    if (!body?.tabs || typeof body.tabs !== 'object') throw new BadRequestException('Expected { "tabs": { "<tab name>": [[...], ...] } }');
    return this.service.startFromSheet(body.tabs);
  }
}
