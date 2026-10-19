import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { PrnUploadBatchEntity } from '../../database/entities/prn-upload-batch.entity';
import { PrnImportRowEntity } from '../../database/entities/prn-import-row.entity';

import { PrnImportService } from './prn-import.service';
import { PrnImportController } from './prn-import.controller';
import { BulkImportModule } from '../bulk-import/bulk-import.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PrnUploadBatchEntity, PrnImportRowEntity]),
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }),
    BulkImportModule,
  ],
  providers: [PrnImportService],
  controllers: [PrnImportController],
  exports: [PrnImportService],
})
export class PrnImportModule {}
