import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerMasterEntity } from '../../database/entities/customer-master.entity';
import { TransporterMasterEntity } from '../../database/entities/transporter-master.entity';
import { OwnerMasterEntity } from '../../database/entities/owner-master.entity';
import { MastersService } from './masters.service';
import { MastersController } from './masters.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerMasterEntity, TransporterMasterEntity, OwnerMasterEntity])],
  providers: [MastersService],
  controllers: [MastersController],
  exports: [MastersService],
})
export class MastersModule {}
