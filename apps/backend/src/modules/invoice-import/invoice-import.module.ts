import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { InvoiceUploadBatchEntity } from '../../database/entities/invoice-upload-batch.entity';
import { InvoiceImportRowEntity } from '../../database/entities/invoice-import-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';

import { InvoiceImportService } from './invoice-import.service';
import { InvoiceImportController } from './invoice-import.controller';
import { BulkImportModule } from '../bulk-import/bulk-import.module';
import { POModule } from '../po/po.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InvoiceUploadBatchEntity, InvoiceImportRowEntity, POMasterEntity, DispatchEntity]),
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }),
    BulkImportModule,
    POModule,
  ],
  providers: [InvoiceImportService],
  controllers: [InvoiceImportController],
  exports: [InvoiceImportService],
})
export class InvoiceImportModule {}
