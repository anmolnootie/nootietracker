import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { TaskEntity } from '../../database/entities/task.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { CustomerMasterEntity } from '../../database/entities/customer-master.entity';
import { TransporterMasterEntity } from '../../database/entities/transporter-master.entity';
import { POChangeHistoryEntity } from '../../database/entities/po-change-history.entity';
import { BulkPOProcessedRowEntity } from '../../database/entities/bulk-processed-row.entity';
import { UploadBatchEntity } from '../../database/entities/upload-batch.entity';
import { PODeletionAuditEntity } from '../../database/entities/po-deletion-audit.entity';

import { POService } from './po.service';
import { POPdfService } from './po-pdf.service';
import { POController } from './po.controller';
import { StatusEngine } from '../../engines/status.engine';
import { RiskEngine } from '../../engines/risk.engine';
import { DispatchPlanningEngine } from '../../engines/dispatch-planning.engine';
import { LocationDispatchEngine } from '../../engines/location-dispatch.engine';
import { FulfilmentStatusEngine } from '../../engines/fulfilment-status.engine';
import { TasksModule } from '../tasks/tasks.module';
import { ReturnsModule } from '../returns/returns.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LocationsModule } from '../locations/locations.module';
import { ExceptionsModule } from '../exceptions/exceptions.module';
import { DocumentsModule } from '../documents/documents.module';
import { POMappingModule } from '../po-mapping/po-mapping.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      POMasterEntity,
      POLineItemEntity,
      AppointmentEntity,
      DispatchEntity,
      LogisticsTrackerEntity,
      GRNTrackerEntity,
      ReturnTrackerEntity,
      TaskEntity,
      AuditLogEntity,
      CustomerMasterEntity,
      TransporterMasterEntity,
      POChangeHistoryEntity,
      BulkPOProcessedRowEntity,
      UploadBatchEntity,
      PODeletionAuditEntity,
    ]),
    TasksModule,
    ReturnsModule,
    NotificationsModule,
    LocationsModule,
    ExceptionsModule,
    DocumentsModule,
    POMappingModule,
  ],
  providers: [POService, POPdfService, StatusEngine, RiskEngine, DispatchPlanningEngine, LocationDispatchEngine, FulfilmentStatusEngine],
  controllers: [POController],
  exports: [POService],
})
export class POModule {}
