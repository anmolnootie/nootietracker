import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

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
import { LocationMasterEntity } from './entities/location-master.entity';
import { UploadBatchEntity } from './entities/upload-batch.entity';
import { BulkPORawRowEntity } from './entities/bulk-raw-row.entity';
import { BulkPOProcessedRowEntity } from './entities/bulk-processed-row.entity';
import { ExceptionEntity } from './entities/exception.entity';
import { POChangeHistoryEntity } from './entities/po-change-history.entity';
import { ColumnMappingEntity } from './entities/column-mapping.entity';
import { CompilationEntity } from './entities/compilation.entity';
import { PODeletionAuditEntity } from './entities/po-deletion-audit.entity';
import { SkuMasterEntity } from './entities/sku-master.entity';
import { StuckStockEntity } from './entities/stuck-stock.entity';
import { POMappingEntity } from './entities/po-mapping.entity';
import { PendingLocationEntity } from './entities/pending-location.entity';
import { InvoiceUploadBatchEntity } from './entities/invoice-upload-batch.entity';
import { InvoiceImportRowEntity } from './entities/invoice-import-row.entity';
import { GrnUploadBatchEntity } from './entities/grn-upload-batch.entity';
import { GrnImportRowEntity } from './entities/grn-import-row.entity';
import { DispatchReportUploadBatchEntity } from './entities/dispatch-report-upload-batch.entity';
import { DispatchReportRowEntity } from './entities/dispatch-report-row.entity';

const ENTITIES = [
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
  LocationMasterEntity,
  UploadBatchEntity,
  BulkPORawRowEntity,
  BulkPOProcessedRowEntity,
  ExceptionEntity,
  POChangeHistoryEntity,
  ColumnMappingEntity,
  CompilationEntity,
  PODeletionAuditEntity,
  SkuMasterEntity,
  StuckStockEntity,
  POMappingEntity,
  PendingLocationEntity,
  InvoiceUploadBatchEntity,
  InvoiceImportRowEntity,
  GrnUploadBatchEntity,
  GrnImportRowEntity,
  DispatchReportUploadBatchEntity,
  DispatchReportRowEntity,
];

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        return {
          type: 'postgres' as const,
          host: configService.get<string>('DATABASE_HOST', 'localhost'),
          port: Number(configService.get('DATABASE_PORT', 5432)),
          username: configService.get<string>('DATABASE_USER', 'po_control_tower'),
          password: configService.get<string>('DATABASE_PASSWORD', 'password'),
          database: configService.get<string>('DATABASE_NAME', 'po_control_tower_db'),
          entities: ENTITIES,
          // Production runs off checked-in migrations (see database/migrations),
          // applied automatically on every boot - never auto-alters the schema
          // from entity metadata the way dev's synchronize:true does.
          synchronize: !isProduction,
          migrationsRun: isProduction,
          migrations: isProduction ? [__dirname + '/migrations/*.{ts,js}'] : undefined,
          ssl: configService.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
          logging: process.env.NODE_ENV === 'development',
        };
      },
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
