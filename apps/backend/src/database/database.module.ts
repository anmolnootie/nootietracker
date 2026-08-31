import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { UserEntity } from './entities/user.entity';
import { POMasterEntity } from './entities/po-master.entity';
import { POLineItemEntity } from './entities/po-line-item.entity';
import { AppointmentEntity } from './entities/appointment.entity';
import { DispatchEntity } from './entities/dispatch.entity';
import { LogisticsTrackerEntity } from './entities/logistics-tracker.entity';
import { GRNTrackerEntity } from './entities/grn-tracker.entity';
import { ReturnTrackerEntity } from './entities/return-tracker.entity';
import { TaskEntity } from './entities/task.entity';
import { CustomerMasterEntity } from './entities/customer-master.entity';
import { TransporterMasterEntity } from './entities/transporter-master.entity';
import { OwnerMasterEntity } from './entities/owner-master.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { NotificationEntity } from './entities/notification.entity';
import { DocumentEntity } from './entities/document.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: configService.get('DATABASE_PORT', 5432),
        username: configService.get('DATABASE_USER', 'po_control_tower'),
        password: configService.get('DATABASE_PASSWORD', 'password'),
        database: configService.get('DATABASE_NAME', 'po_control_tower_db'),
        entities: [
          UserEntity,
          POMasterEntity,
          POLineItemEntity,
          AppointmentEntity,
          DispatchEntity,
          LogisticsTrackerEntity,
          GRNTrackerEntity,
          ReturnTrackerEntity,
          TaskEntity,
          CustomerMasterEntity,
          TransporterMasterEntity,
          OwnerMasterEntity,
          AuditLogEntity,
          NotificationEntity,
          DocumentEntity,
        ],
        synchronize: true, // Use migrations in production
        logging: process.env.NODE_ENV === 'development',
      }),
    }),
    TypeOrmModule.forFeature([
      UserEntity,
      POMasterEntity,
      POLineItemEntity,
      AppointmentEntity,
      DispatchEntity,
      LogisticsTrackerEntity,
      GRNTrackerEntity,
      ReturnTrackerEntity,
      TaskEntity,
      CustomerMasterEntity,
      TransporterMasterEntity,
      OwnerMasterEntity,
      AuditLogEntity,
      NotificationEntity,
      DocumentEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
