import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfigEntity } from '../../database/entities/system-config.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';

export interface RiskThresholds {
  black: number;
  red: number;
  orange: number;
  yellow: number;
}

const RISK_THRESHOLDS_KEY = 'risk_thresholds';
const DEFAULT_RISK_THRESHOLDS: RiskThresholds = { black: 1, red: 2, orange: 4, yellow: 7 };
const CACHE_TTL_MS = 60_000;

@Injectable()
export class ConfigService {
  private riskThresholdsCache: { value: RiskThresholds; expiresAt: number } | null = null;

  constructor(
    @InjectRepository(SystemConfigEntity) private readonly configRepository: Repository<SystemConfigEntity>,
    @InjectRepository(AuditLogEntity) private readonly auditLogRepository: Repository<AuditLogEntity>,
  ) {}

  async getRiskThresholds(): Promise<RiskThresholds> {
    if (this.riskThresholdsCache && this.riskThresholdsCache.expiresAt > Date.now()) {
      return this.riskThresholdsCache.value;
    }
    const row = await this.configRepository.findOneBy({ key: RISK_THRESHOLDS_KEY });
    const value = (row?.value as unknown as RiskThresholds) ?? DEFAULT_RISK_THRESHOLDS;
    this.riskThresholdsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  async updateRiskThresholds(partial: Partial<RiskThresholds>, updatedByUserId: string): Promise<RiskThresholds> {
    const current = await this.getRiskThresholds();
    const next: RiskThresholds = { ...current, ...partial };

    for (const field of ['black', 'red', 'orange', 'yellow'] as const) {
      if (!Number.isInteger(next[field]) || next[field] < 0) {
        throw new BadRequestException(`${field} threshold must be a non-negative whole number of days`);
      }
    }
    if (!(next.black < next.red && next.red < next.orange && next.orange < next.yellow)) {
      throw new BadRequestException('Thresholds must be ascending: black < red < orange < yellow');
    }

    const row = await this.configRepository.findOneBy({ key: RISK_THRESHOLDS_KEY });
    if (row) {
      await this.auditLogRepository.save(
        this.auditLogRepository.create({
          tableName: 'system_configs',
          recordId: row.id,
          fieldName: RISK_THRESHOLDS_KEY,
          oldValue: JSON.stringify(current),
          newValue: JSON.stringify(next),
          userId: updatedByUserId,
        }),
      );
      await this.configRepository.update(row.id, { value: next, updatedByUserId } as any);
    } else {
      const created = await this.configRepository.save(
        this.configRepository.create({
          key: RISK_THRESHOLDS_KEY,
          value: next as unknown as Record<string, unknown>,
          updatedByUserId,
        }),
      );
      await this.auditLogRepository.save(
        this.auditLogRepository.create({
          tableName: 'system_configs',
          recordId: created.id,
          fieldName: RISK_THRESHOLDS_KEY,
          oldValue: JSON.stringify(current),
          newValue: JSON.stringify(next),
          userId: updatedByUserId,
        }),
      );
    }

    this.riskThresholdsCache = { value: next, expiresAt: Date.now() + CACHE_TTL_MS };
    return next;
  }
}
