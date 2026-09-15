import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReturnTrackerEntity, POMasterEntity, POLineItemEntity])],
  providers: [ReturnsService],
  controllers: [ReturnsController],
  exports: [ReturnsService],
})
export class ReturnsModule {}
