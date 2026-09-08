import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentEntity } from '../../database/entities/document.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { FileStorageService } from './file-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity])],
  providers: [DocumentsService, FileStorageService],
  controllers: [DocumentsController],
  exports: [DocumentsService, FileStorageService],
})
export class DocumentsModule {}
