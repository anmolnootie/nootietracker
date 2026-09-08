import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { POMappingEntity } from '../../database/entities/po-mapping.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';

import { POMappingService } from './po-mapping.service';
import { POMappingController } from './po-mapping.controller';
import { StuckStockModule } from '../stuck-stock/stuck-stock.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([POMappingEntity, POMasterEntity, POLineItemEntity, AppointmentEntity, DispatchEntity, GRNTrackerEntity]),
    StuckStockModule,
  ],
  providers: [POMappingService],
  controllers: [POMappingController],
  exports: [POMappingService],
})
export class POMappingModule {}
