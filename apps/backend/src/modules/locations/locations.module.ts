import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationMasterEntity } from '../../database/entities/location-master.entity';
import { PendingLocationEntity } from '../../database/entities/pending-location.entity';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { ExceptionsModule } from '../exceptions/exceptions.module';

@Module({
  imports: [TypeOrmModule.forFeature([LocationMasterEntity, PendingLocationEntity]), ExceptionsModule],
  providers: [LocationsService],
  controllers: [LocationsController],
  exports: [LocationsService],
})
export class LocationsModule {}
