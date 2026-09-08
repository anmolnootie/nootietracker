import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExceptionEntity } from '../../database/entities/exception.entity';
import { BulkPORawRowEntity } from '../../database/entities/bulk-raw-row.entity';
import { BulkPOProcessedRowEntity } from '../../database/entities/bulk-processed-row.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { ExceptionsService } from './exceptions.service';
import { ExceptionsController } from './exceptions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExceptionEntity, BulkPORawRowEntity, BulkPOProcessedRowEntity, POMasterEntity])],
  providers: [ExceptionsService],
  controllers: [ExceptionsController],
  exports: [ExceptionsService],
})
export class ExceptionsModule {}
