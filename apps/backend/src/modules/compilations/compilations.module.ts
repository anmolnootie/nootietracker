import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompilationEntity } from '../../database/entities/compilation.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { CompilationsService } from './compilations.service';
import { CompilationsController } from './compilations.controller';
import { BulkImportModule } from '../bulk-import/bulk-import.module';

@Module({
  imports: [TypeOrmModule.forFeature([CompilationEntity, POMasterEntity]), BulkImportModule],
  providers: [CompilationsService],
  controllers: [CompilationsController],
})
export class CompilationsModule {}
