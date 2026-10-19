import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { DnUploadBatchEntity } from '../../database/entities/dn-upload-batch.entity';
import { DnImportRowEntity } from '../../database/entities/dn-import-row.entity';

import { DnImportService } from './dn-import.service';
import { DnImportController } from './dn-import.controller';
import { BulkImportModule } from '../bulk-import/bulk-import.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DnUploadBatchEntity, DnImportRowEntity]),
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }),
    BulkImportModule,
  ],
  providers: [DnImportService],
  controllers: [DnImportController],
  exports: [DnImportService],
})
export class DnImportModule {}
