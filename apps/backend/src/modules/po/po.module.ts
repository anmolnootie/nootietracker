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

import { POService } from './po.service';
import { POController } from './po.controller';
import { StatusEngine } from '../../engines/status.engine';
import { RiskEngine } from '../../engines/risk.engine';
import { DispatchPlanningEngine } from '../../engines/dispatch-planning.engine';

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
    ]),
  ],
  providers: [POService, StatusEngine, RiskEngine, DispatchPlanningEngine],
  controllers: [POController],
})
export class POModule {}
