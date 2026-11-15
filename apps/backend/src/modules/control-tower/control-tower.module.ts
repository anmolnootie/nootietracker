import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { SheetTrackerRowEntity } from '../../database/entities/sheet-tracker-row.entity';
import { SheetTrackerUploadBatchEntity } from '../../database/entities/sheet-tracker-upload-batch.entity';
import { InvoiceImportRowEntity } from '../../database/entities/invoice-import-row.entity';
import { AppConfigModule } from '../config/config.module';
import { ControlTowerController } from './control-tower.controller';
import { ControlTowerService } from './control-tower.service';

@Module({
  imports: [
    // Every repository ControlTowerService injects must be listed here - a missing one crashes the whole app at boot (CLAUDE.md).
    TypeOrmModule.forFeature([
      POMasterEntity, POLineItemEntity, AppointmentEntity, DispatchEntity, LogisticsTrackerEntity, GRNTrackerEntity,
      ReturnTrackerEntity, SheetTrackerRowEntity, SheetTrackerUploadBatchEntity, InvoiceImportRowEntity,
    ]),
    AppConfigModule,
  ],
  controllers: [ControlTowerController],
  providers: [ControlTowerService],
  exports: [ControlTowerService],
})
export class ControlTowerModule {}
