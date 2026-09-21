import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { GrnUploadBatchEntity } from '../../database/entities/grn-upload-batch.entity';
import { GrnImportRowEntity } from '../../database/entities/grn-import-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';

import { GrnImportService } from './grn-import.service';
import { GrnImportController } from './grn-import.controller';
import { BulkImportModule } from '../bulk-import/bulk-import.module';
import { POModule } from '../po/po.module';
import { InvoiceImportModule } from '../invoice-import/invoice-import.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GrnUploadBatchEntity, GrnImportRowEntity, POMasterEntity, DispatchEntity, GRNTrackerEntity]),
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }),
    BulkImportModule,
    POModule,
    InvoiceImportModule,
  ],
  providers: [GrnImportService],
  controllers: [GrnImportController],
  exports: [GrnImportService],
})
export class GrnImportModule {}
