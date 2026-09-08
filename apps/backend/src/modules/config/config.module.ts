import { Module } from '@nestjs/common';
import { RiskEngine } from '../../engines/risk.engine';
import { ConfigController } from './config.controller';

@Module({
  providers: [RiskEngine],
  controllers: [ConfigController],
})
export class AppConfigModule {}
