import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StuckStockEntity } from '../../database/entities/stuck-stock.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';

import { StuckStockService } from './stuck-stock.service';
import { StuckStockController } from './stuck-stock.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StuckStockEntity, POMasterEntity, POLineItemEntity, DispatchEntity])],
  providers: [StuckStockService],
  controllers: [StuckStockController],
  exports: [StuckStockService],
})
export class StuckStockModule {}
