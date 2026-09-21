import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import * as path from 'path';

import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { POModule } from './modules/po/po.module';
import { ScriptsModule } from './modules/scripts/scripts.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { MastersModule } from './modules/masters/masters.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AppConfigModule } from './modules/config/config.module';
import { POImportModule } from './modules/po-import/po-import.module';
import { LocationsModule } from './modules/locations/locations.module';
import { ExceptionsModule } from './modules/exceptions/exceptions.module';
import { BulkImportModule } from './modules/bulk-import/bulk-import.module';
import { InvoiceImportModule } from './modules/invoice-import/invoice-import.module';
import { SheetTrackerImportModule } from './modules/sheet-tracker-import/sheet-tracker-import.module';
import { GrnImportModule } from './modules/grn-import/grn-import.module';
import { DispatchReportImportModule } from './modules/dispatch-report-import/dispatch-report-import.module';
import { CompilationsModule } from './modules/compilations/compilations.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { StuckStockModule } from './modules/stuck-stock/stuck-stock.module';
import { POMappingModule } from './modules/po-mapping/po-mapping.module';
import { PartnersbizModule } from './modules/partnersbiz/partnersbiz.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UserModule,
    POModule,
    ScriptsModule,
    TasksModule,
    ReturnsModule,
    MastersModule,
    NotificationsModule,
    ReportsModule,
    AutomationModule,
    AppConfigModule,
    POImportModule,
    LocationsModule,
    ExceptionsModule,
    BulkImportModule,
    InvoiceImportModule,
    GrnImportModule,
    SheetTrackerImportModule,
    DispatchReportImportModule,
    CompilationsModule,
    DocumentsModule,
    InventoryModule,
    StuckStockModule,
    POMappingModule,
    PartnersbizModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
