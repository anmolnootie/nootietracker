import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { UploadBatchEntity } from '../../database/entities/upload-batch.entity';
import { BulkPORawRowEntity } from '../../database/entities/bulk-raw-row.entity';
import { BulkPOProcessedRowEntity } from '../../database/entities/bulk-processed-row.entity';
import { ColumnMappingEntity } from '../../database/entities/column-mapping.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { POChangeHistoryEntity } from '../../database/entities/po-change-history.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { NotificationEntity } from '../../database/entities/notification.entity';

import { BulkImportService } from './bulk-import.service';
import { BulkImportController } from './bulk-import.controller';
import { FileReaderService } from './file-reader.service';
import { ColumnMappingService } from './column-mapping.service';
import { DataCleaningService } from './data-cleaning.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { POCompilationService } from './po-compilation.service';
import { POReportsService } from './po-reports.service';
import { ReconciliationEngine } from '../../engines/reconciliation.engine';
import { FulfilmentStatusEngine } from '../../engines/fulfilment-status.engine';

import { POModule } from '../po/po.module';
import { LocationsModule } from '../locations/locations.module';
import { ExceptionsModule } from '../exceptions/exceptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UploadBatchEntity,
      BulkPORawRowEntity,
      BulkPOProcessedRowEntity,
      ColumnMappingEntity,
      POMasterEntity,
      POLineItemEntity,
      AppointmentEntity,
      DispatchEntity,
      LogisticsTrackerEntity,
      GRNTrackerEntity,
      POChangeHistoryEntity,
      AuditLogEntity,
      NotificationEntity,
    ]),
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }),
    POModule,
    LocationsModule,
    ExceptionsModule,
  ],
  providers: [
    BulkImportService,
    FileReaderService,
    ColumnMappingService,
    DataCleaningService,
    DuplicateDetectionService,
    POCompilationService,
    POReportsService,
    ReconciliationEngine,
    FulfilmentStatusEngine,
  ],
  controllers: [BulkImportController],
  exports: [BulkImportService, POReportsService],
})
export class BulkImportModule {}
