import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { SheetTrackerUploadBatchEntity } from '../../database/entities/sheet-tracker-upload-batch.entity';
import { SheetTrackerRowEntity } from '../../database/entities/sheet-tracker-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';

import { SheetTrackerImportService } from './sheet-tracker-import.service';
import { SheetTrackerImportController } from './sheet-tracker-import.controller';
import { SheetTrackerWebhookController } from './sheet-tracker-webhook.controller';
import { BulkImportModule } from '../bulk-import/bulk-import.module';
import { POModule } from '../po/po.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SheetTrackerUploadBatchEntity, SheetTrackerRowEntity, POMasterEntity, DispatchEntity, AppointmentEntity, GRNTrackerEntity]),
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }),
    BulkImportModule,
    POModule,
  ],
  providers: [SheetTrackerImportService],
  controllers: [SheetTrackerImportController, SheetTrackerWebhookController],
})
export class SheetTrackerImportModule {}
