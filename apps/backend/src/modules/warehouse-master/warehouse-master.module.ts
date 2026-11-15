import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { POTrackingEntity } from '../../database/entities/po-tracking.entity';
import { SystemConfigEntity } from '../../database/entities/system-config.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { SheetTrackerImportModule } from '../sheet-tracker-import/sheet-tracker-import.module';
import { ControlTowerModule } from '../control-tower/control-tower.module';
import { WarehouseMasterController, WarehouseMasterWebhookController } from './warehouse-master.controller';
import { WarehouseMasterService } from './warehouse-master.service';

@Module({
  // Every repository the service injects must be listed here (CLAUDE.md: a missing one crashes the app at boot).
  imports: [TypeOrmModule.forFeature([POMasterEntity, AppointmentEntity, DispatchEntity, POTrackingEntity, SystemConfigEntity, UserEntity]), SheetTrackerImportModule, ControlTowerModule],
  controllers: [WarehouseMasterController, WarehouseMasterWebhookController],
  providers: [WarehouseMasterService],
})
export class WarehouseMasterModule {}
