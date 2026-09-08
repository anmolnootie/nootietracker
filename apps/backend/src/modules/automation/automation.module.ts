import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';

import { AutomationService } from './automation.service';
import { POModule } from '../po/po.module';
import { TasksModule } from '../tasks/tasks.module';
import { ReturnsModule } from '../returns/returns.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([POMasterEntity, AppointmentEntity, DispatchEntity, LogisticsTrackerEntity, GRNTrackerEntity]),
    POModule,
    TasksModule,
    ReturnsModule,
    NotificationsModule,
  ],
  providers: [AutomationService],
})
export class AutomationModule {}
