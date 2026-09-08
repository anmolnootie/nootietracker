import { Module } from '@nestjs/common';
import { PartnersbizService } from './partnersbiz.service';
import { PartnersbizController } from './partnersbiz.controller';
import { POModule } from '../po/po.module';
import { LocationsModule } from '../locations/locations.module';
import { ExceptionsModule } from '../exceptions/exceptions.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [POModule, LocationsModule, ExceptionsModule, UserModule],
  providers: [PartnersbizService],
  controllers: [PartnersbizController],
})
export class PartnersbizModule {}
