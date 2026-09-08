import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([POMasterEntity, GRNTrackerEntity, ReturnTrackerEntity])],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
