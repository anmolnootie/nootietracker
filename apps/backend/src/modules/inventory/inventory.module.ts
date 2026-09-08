import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { SkuMasterEntity } from '../../database/entities/sku-master.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { SkuExtractionService } from './sku-extraction.service';
import { POModule } from '../po/po.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SkuMasterEntity]),
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }),
    POModule,
  ],
  providers: [InventoryService, SkuExtractionService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
