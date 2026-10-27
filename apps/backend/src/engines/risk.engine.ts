import { Injectable } from '@nestjs/common';
import { RiskStatus } from '@po-control-tower/shared';
import { POMasterEntity } from '../database/entities/po-master.entity';
import { ConfigService, RiskThresholds } from '../modules/config/config.service';

/**
 * Risk Engine
 * Computes risk status (Color) and Priority Score based on:
 * 1. Days remaining to expiry
 * 2. Current stage in the PO lifecycle
 * 3. Delays/discrepancies
 *
 * Risk Color Bands are admin-editable (System Settings) via ConfigService;
 * defaults mirror the original design:
 * - BLACK: < 1 day to expiry, or critical failure (no delivery attempt, critical damage)
 * - RED: 1-2 days to expiry, or significant delays, or failed GRN match
 * - ORANGE: 3-4 days to expiry, or minor delays
 * - YELLOW: 5-7 days to expiry
 * - GREEN: 7+ days to expiry, all on track
 */
@Injectable()
export class RiskEngine {
  constructor(private readonly configService: ConfigService) {}

  async computeRisk(
    po: POMasterEntity,
    daysToExpiry: number,
    stage: string,
    hasDelays: boolean = false,
    hasDiscrepancies: boolean = false,
  ): Promise<{ riskStatus: RiskStatus; priorityScore: number }> {
    const thresholds = await this.configService.getRiskThresholds();
    let riskStatus = this.getRiskByDaysToExpiry(daysToExpiry, thresholds);
    let priorityScore = this.calculatePriorityScore(daysToExpiry, stage, hasDelays, hasDiscrepancies);

    // Override risk if there are critical issues
    if (hasDelays && riskStatus === RiskStatus.YELLOW) {
      riskStatus = RiskStatus.ORANGE;
    }
    if (hasDelays && riskStatus === RiskStatus.ORANGE) {
      riskStatus = RiskStatus.RED;
    }
    if (hasDiscrepancies && riskStatus !== RiskStatus.BLACK) {
      riskStatus = RiskStatus.RED;
    }

    return { riskStatus, priorityScore };
  }

  private getRiskByDaysToExpiry(daysToExpiry: number, thresholds: RiskThresholds): RiskStatus {
    if (daysToExpiry < thresholds.black) {
      return RiskStatus.BLACK;
    }
    if (daysToExpiry < thresholds.red) {
      return RiskStatus.RED;
    }
    if (daysToExpiry < thresholds.orange) {
      return RiskStatus.ORANGE;
    }
    if (daysToExpiry < thresholds.yellow) {
      return RiskStatus.YELLOW;
    }
    return RiskStatus.GREEN;
  }

  private calculatePriorityScore(
    daysToExpiry: number,
    stage: string,
    hasDelays: boolean,
    hasDiscrepancies: boolean,
  ): number {
    let score = 0;

    // Base score from days to expiry (0-50 points)
    // 0 days = 50 points (highest priority)
    // 14 days = 0 points (low priority)
    score += Math.max(0, Math.min(50, 50 - (daysToExpiry * 3.57)));

    // Stage-based score (0-30 points)
    // Later stages are more concerning if delayed
    const stageScores: Record<string, number> = {
      RECEIVED: 0,
      APPOINTMENT_REQUESTED: 5,
      APPOINTMENT_CONFIRMED: 8,
      READY_FOR_DISPATCH: 12,
      DISPATCHED: 15,
      IN_TRANSIT: 20,
      DELIVERED: 25,
      GRN_PENDING: 28,
      RECONCILED: 5,
      CLOSED: 0,
    };
    score += stageScores[stage] || 0;

    // Delays penalty (0-10 points)
    if (hasDelays) {
      score += 10;
    }

    // Discrepancies penalty (0-10 points)
    if (hasDiscrepancies) {
      score += 10;
    }

    // Normalize to 0-100
    return Math.min(100, score);
  }

  getDaysToExpiry(expiryDate: Date): number {
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  isUrgent(riskStatus: RiskStatus): boolean {
    return [RiskStatus.BLACK, RiskStatus.RED].includes(riskStatus);
  }

  getThresholds(): Promise<RiskThresholds> {
    return this.configService.getRiskThresholds();
  }
}
