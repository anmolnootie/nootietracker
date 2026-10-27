import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskEngine } from '../../engines/risk.engine';
import { SystemConfigEntity } from '../../database/entities/system-config.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfigEntity, AuditLogEntity])],
  providers: [RiskEngine, ConfigService],
  controllers: [ConfigController],
  exports: [RiskEngine, ConfigService],
})
export class AppConfigModule {}
