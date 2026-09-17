import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { DispatchReportUploadBatchEntity } from '../../database/entities/dispatch-report-upload-batch.entity';
import { DispatchReportRowEntity } from '../../database/entities/dispatch-report-row.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';

import { DispatchReportImportService } from './dispatch-report-import.service';
import { DispatchReportImportController } from './dispatch-report-import.controller';
import { BulkImportModule } from '../bulk-import/bulk-import.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DispatchReportUploadBatchEntity, DispatchReportRowEntity, DispatchEntity, POMasterEntity]),
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }),
    BulkImportModule,
  ],
  providers: [DispatchReportImportService],
  controllers: [DispatchReportImportController],
  exports: [DispatchReportImportService],
})
export class DispatchReportImportModule {}
