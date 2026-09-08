import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Request,
  Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { BulkImportService } from './bulk-import.service';
import { ColumnMappingService } from './column-mapping.service';
import { POReportsService } from './po-reports.service';

@Controller('bulk-import')
@UseGuards(AuthGuard('jwt'))
export class BulkImportController {
  constructor(
    private readonly bulkImportService: BulkImportService,
    private readonly columnMappingService: ColumnMappingService,
    private readonly poReportsService: POReportsService,
  ) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 10))
  async upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('platform') platform: string,
    @Request() req: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    if (!platform) {
      throw new BadRequestException('platform is required');
    }

    const batches = [];
    for (const file of files) {
      const batch = await this.bulkImportService.processFile(file.buffer, file.originalname, platform, req.user.userId);
      batches.push(batch);
    }
    return batches;
  }

  @Get('batches')
  listBatches() {
    return this.bulkImportService.listBatches();
  }

  @Get('batches/:id')
  async getBatch(@Param('id') id: string) {
    const batch = await this.bulkImportService.getBatch(id);
    const processedRows = await this.bulkImportService.getProcessedRows(id);
    const reconciliation = this.bulkImportService.getBatchReconciliationSummary(processedRows);
    return { batch, reconciliation };
  }

  @Get('batches/:id/raw')
  getRaw(@Param('id') id: string) {
    return this.bulkImportService.getRawRows(id);
  }

  @Get('batches/:id/processed')
  getProcessed(@Param('id') id: string) {
    return this.bulkImportService.getProcessedRows(id);
  }

  @Get('batches/:id/delete-preview')
  getDeletePreview(@Param('id') id: string) {
    return this.bulkImportService.getDeletePreview(id);
  }

  @Delete('batches/:id')
  deleteBatch(@Param('id') id: string) {
    return this.bulkImportService.deleteBatch(id);
  }

  @Post('processed-rows/:id/reprocess')
  async reprocessRow(@Param('id') id: string, @Body() corrections: Record<string, any>, @Request() req: any) {
    return this.bulkImportService.reprocessRow(id, corrections, req.user.userId);
  }

  @Get('column-mappings')
  listMappings() {
    return this.columnMappingService.listMappings();
  }

  @Post('column-mappings')
  createMapping(@Body() body: { platform?: string; standardField: string; rawColumnAlias: string }) {
    return this.columnMappingService.createMapping(body);
  }

  @Get('reports/sku-summary')
  getSkuSummary(@Query('batchId') batchId?: string, @Query('platform') platform?: string) {
    return this.poReportsService.getSkuSummary({ batchId, platform });
  }

  @Get('reports/po-summary')
  getPoSummary(@Query('batchId') batchId?: string, @Query('platform') platform?: string) {
    return this.poReportsService.getPoSummary({ batchId, platform });
  }

  @Get('reports/sku-summary.xlsx')
  async downloadSkuSummary(@Query('batchId') batchId: string, @Query('platform') platform: string, @Res() res: Response) {
    const buffer = await this.poReportsService.buildSkuSummaryWorkbook({ batchId, platform });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sku-summary.xlsx"');
    res.send(buffer);
  }

  @Get('reports/po-summary.xlsx')
  async downloadPoSummary(@Query('batchId') batchId: string, @Query('platform') platform: string, @Res() res: Response) {
    const buffer = await this.poReportsService.buildPoSummaryWorkbook({ batchId, platform });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="po-summary.xlsx"');
    res.send(buffer);
  }
}
