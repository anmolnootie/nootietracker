import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { GrnUploadBatchEntity } from '../../database/entities/grn-upload-batch.entity';
import { GrnImportRowEntity } from '../../database/entities/grn-import-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';

import { GrnImportService } from './grn-import.service';
import { GrnImportController } from './grn-import.controller';
import { BulkImportModule } from '../bulk-import/bulk-import.module';
import { POModule } from '../po/po.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GrnUploadBatchEntity, GrnImportRowEntity, POMasterEntity, DispatchEntity]),
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }),
    BulkImportModule,
    POModule,
  ],
  providers: [GrnImportService],
  controllers: [GrnImportController],
  exports: [GrnImportService],
})
export class GrnImportModule {}
