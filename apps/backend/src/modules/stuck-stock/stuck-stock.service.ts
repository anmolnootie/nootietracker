import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { differenceInCalendarDays } from 'date-fns';

import { StuckStockEntity } from '../../database/entities/stuck-stock.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import {
  POStatus,
  FulfilmentDecision,
  NonFulfilmentReason,
  StuckStockReason,
  StuckStockStatus,
  StuckStockAgingBucket,
} from '@po-control-tower/shared';

const NOT_STUCK_STATUSES = [POStatus.DELIVERED, POStatus.GRN_PENDING, POStatus.RECONCILED, POStatus.CLOSED];

export interface StuckStockWithAging extends StuckStockEntity {
  daysStuck: number;
  agingBucket: StuckStockAgingBucket;
}

export interface StuckStockDetectionResult {
  scanned: number;
  created: number;
  updated: number;
  autoResolved: number;
}

export interface StuckStockByPO {
  poId: string;
  poNumber: string;
  channelId: string;
  poValue: number;
  stuckValue: number;
  stuckQuantity: number;
  reasons: StuckStockReason[];
  maxDaysStuck: number;
  status: StuckStockStatus.OPEN | StuckStockStatus.PARTIALLY_MAPPED | StuckStockStatus.MAPPED;
  lines: StuckStockWithAging[];
}

export interface StuckStockSummary {
  totalValue: number;
  totalQuantity: number;
  totalRecords: number;
  byStatus: Record<string, number>;
  byAgingBucket: Record<StuckStockAgingBucket, { count: number; value: number }>;
  valueStuckOver30Days: number;
}

@Injectable()
export class StuckStockService {
  private readonly logger = new Logger(StuckStockService.name);

  constructor(
    @InjectRepository(StuckStockEntity)
    private readonly stuckStockRepository: Repository<StuckStockEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(POLineItemEntity)
    private readonly lineItemRepository: Repository<POLineItemEntity>,
    @InjectRepository(DispatchEntity)
    private readonly dispatchRepository: Repository<DispatchEntity>,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledDetection() {
    try {
      await this.detect();
    } catch (err) {
      this.logger.error('Stuck stock detection sweep failed', err as any);
    }
  }

  /**
   * Scans every live PO for stock that never made it out due to a stuck
   * reason (expired/cancelled PO, missed appointment, RTO...) and upserts one
   * stuck_stock row per (PO, SKU) with leftover quantity. Re-running never
   * resets a row a person has already worked (RESOLVED/WRITTEN_OFF stay put),
   * and any previously-open row whose PO has since resolved gets auto-closed.
   */
  async detect(): Promise<StuckStockDetectionResult> {
    const now = new Date();
    const pos = await this.poRepository.find({ where: { isDeleted: false } });
    const candidates = pos.filter((po) => this.isStuckCandidate(po, now));

    const dispatches = await this.dispatchRepository.find({ where: { poId: In(candidates.map((p) => p.id)) } });
    const dispatchByPoId = new Map(dispatches.map((d) => [d.poId, d]));

    let created = 0;
    let updated = 0;
    const stillStuckKeys = new Set<string>();

    for (const po of candidates) {
      const lineItems = await this.lineItemRepository.find({ where: { poId: po.id } });
      const reason = this.inferReason(po, now);
      const dateDispatched = dispatchByPoId.get(po.id)?.actualDispatchDate ?? null;

      for (const li of lineItems) {
        const leftover = Number(li.quantity) - Number(li.dispatchedQuantity ?? 0);
        if (leftover <= 0) continue;

        const rate = li.unitPrice != null ? Number(li.unitPrice) : li.lineValue && li.quantity ? Number(li.lineValue) / Number(li.quantity) : 0;
        const value = leftover * rate;
        const key = `${po.id}:${li.skuCode}`;
        stillStuckKeys.add(key);

        const existing = await this.stuckStockRepository.findOne({ where: { poId: po.id, skuCode: li.skuCode } });
        if (existing) {
          if (existing.status === StuckStockStatus.RESOLVED || existing.status === StuckStockStatus.WRITTEN_OFF) continue;
          await this.stuckStockRepository.update(existing.id, {
            quantity: leftover,
            value,
            warehouse: po.location,
            dateDispatched,
            reason,
          });
          updated++;
        } else {
          await this.stuckStockRepository.save(
            this.stuckStockRepository.create({
              poId: po.id,
              poNumber: po.poNumber,
              skuCode: li.skuCode,
              skuName: li.skuName,
              quantity: leftover,
              value,
              warehouse: po.location,
              dateDispatched,
              reason,
              status: StuckStockStatus.OPEN,
            }),
          );
          created++;
        }
      }
    }

    const openRecords = await this.stuckStockRepository.find({
      where: { status: In([StuckStockStatus.OPEN, StuckStockStatus.PARTIALLY_MAPPED]) },
    });
    let autoResolved = 0;
    for (const record of openRecords) {
      if (stillStuckKeys.has(`${record.poId}:${record.skuCode}`)) continue;
      await this.stuckStockRepository.update(record.id, { status: StuckStockStatus.RESOLVED, resolvedAt: now });
      autoResolved++;
    }

    return { scanned: candidates.length, created, updated, autoResolved };
  }

  async list(filters: { status?: StuckStockStatus; reason?: StuckStockReason; warehouse?: string }): Promise<StuckStockWithAging[]> {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.reason) where.reason = filters.reason;
    if (filters.warehouse) where.warehouse = filters.warehouse;
    const records = await this.stuckStockRepository.find({ where, order: { value: 'DESC' } });
    return records.map((r) => this.withAging(r));
  }

  async getById(id: string): Promise<StuckStockWithAging> {
    const record = await this.stuckStockRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Stuck stock record ${id} not found`);
    return this.withAging(record);
  }

  async update(id: string, data: { ownerId?: string | null; remarks?: string | null; status?: StuckStockStatus.RESOLVED | StuckStockStatus.WRITTEN_OFF | StuckStockStatus.OPEN }): Promise<StuckStockEntity> {
    const existing = await this.stuckStockRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`Stuck stock record ${id} not found`);
    const patch: Partial<StuckStockEntity> = { ...data };
    if (data.status === StuckStockStatus.RESOLVED) patch.resolvedAt = new Date();
    await this.stuckStockRepository.update(id, patch);
    return this.stuckStockRepository.findOneOrFail({ where: { id } });
  }

  async getByPoAndSku(poId: string, skuCode: string): Promise<StuckStockEntity | null> {
    return this.stuckStockRepository.findOne({ where: { poId, skuCode } });
  }

  /** Recomputes a stuck-stock row's status/mappedPoId from its ACTIVE PO Mapping links - called by POMappingService after any mapping is created or its status changes. */
  async recomputeMappingState(poId: string, skuCode: string, totalActiveMapped: number, latestActiveNewPoId: string | null): Promise<void> {
    const record = await this.stuckStockRepository.findOne({ where: { poId, skuCode } });
    if (!record) return;
    if (record.status === StuckStockStatus.RESOLVED || record.status === StuckStockStatus.WRITTEN_OFF) return;

    const status = totalActiveMapped <= 0
      ? StuckStockStatus.OPEN
      : totalActiveMapped >= Number(record.quantity)
        ? StuckStockStatus.MAPPED
        : StuckStockStatus.PARTIALLY_MAPPED;

    await this.stuckStockRepository.update(record.id, {
      status,
      mappedPoId: status === StuckStockStatus.MAPPED ? latestActiveNewPoId : null,
    });
  }

  /**
   * Permanently deducts a recovered quantity from a stuck-stock line - called
   * by POMappingService once the *new* PO's GRN actually completes for a
   * mapping (not when the mapping is merely created). Only fully-recovered
   * lines auto-resolve; a partially-recovered line just gets a smaller
   * effective "still stuck" balance while staying MAPPED/PARTIALLY_MAPPED.
   */
  async applyRecovery(poId: string, skuCode: string, additionalRecoveredQuantity: number): Promise<void> {
    const record = await this.stuckStockRepository.findOne({ where: { poId, skuCode } });
    if (!record) return;
    if (record.status === StuckStockStatus.RESOLVED || record.status === StuckStockStatus.WRITTEN_OFF) return;

    const recoveredQuantity = Number(record.recoveredQuantity) + additionalRecoveredQuantity;
    const patch: Partial<StuckStockEntity> = { recoveredQuantity };
    if (recoveredQuantity >= Number(record.quantity)) {
      patch.status = StuckStockStatus.RESOLVED;
      patch.resolvedAt = new Date();
    }
    await this.stuckStockRepository.update(record.id, patch);
  }

  async getSummary(): Promise<StuckStockSummary> {
    const records = await this.stuckStockRepository.find({
      where: { status: In([StuckStockStatus.OPEN, StuckStockStatus.PARTIALLY_MAPPED, StuckStockStatus.MAPPED]) },
    });

    const byAgingBucket: StuckStockSummary['byAgingBucket'] = {
      '0-7': { count: 0, value: 0 },
      '8-15': { count: 0, value: 0 },
      '16-30': { count: 0, value: 0 },
      '31-60': { count: 0, value: 0 },
      '60+': { count: 0, value: 0 },
    };
    const byStatus: Record<string, number> = {};
    let totalValue = 0;
    let totalQuantity = 0;
    let valueStuckOver30Days = 0;

    for (const r of records) {
      const { daysStuck, agingBucket } = this.computeAging(r.firstDetectedAt);
      totalValue += Number(r.value);
      totalQuantity += Number(r.quantity);
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      byAgingBucket[agingBucket].count++;
      byAgingBucket[agingBucket].value += Number(r.value);
      if (daysStuck > 30) valueStuckOver30Days += Number(r.value);
    }

    return { totalValue, totalQuantity, totalRecords: records.length, byStatus, byAgingBucket, valueStuckOver30Days };
  }

  /**
   * The "Stuck PO" view: every currently-stuck line grouped back up to its
   * PO, so the user sees "PO BLK123 has ₹2.1L stuck" instead of a flat list
   * of SKU rows - matching how the business actually thinks about mapping
   * (map the whole PO), even though detection itself stays SKU-level.
   */
  async listGroupedByPO(): Promise<StuckStockByPO[]> {
    const records = await this.stuckStockRepository.find({
      where: { status: In([StuckStockStatus.OPEN, StuckStockStatus.PARTIALLY_MAPPED, StuckStockStatus.MAPPED]) },
      order: { value: 'DESC' },
    });
    if (records.length === 0) return [];

    const pos = await this.poRepository.find({ where: { id: In([...new Set(records.map((r) => r.poId))]) } });
    const poById = new Map(pos.map((p) => [p.id, p]));

    const byPoId = new Map<string, StuckStockWithAging[]>();
    for (const record of records) {
      const withAging = this.withAging(record);
      const list = byPoId.get(record.poId) ?? [];
      list.push(withAging);
      byPoId.set(record.poId, list);
    }

    const groups: StuckStockByPO[] = [];
    for (const [poId, lines] of byPoId) {
      const po = poById.get(poId);
      if (!po) continue;

      const allMapped = lines.every((l) => l.status === StuckStockStatus.MAPPED);
      const anyProgress = lines.some((l) => l.status !== StuckStockStatus.OPEN);
      const status = allMapped ? StuckStockStatus.MAPPED : anyProgress ? StuckStockStatus.PARTIALLY_MAPPED : StuckStockStatus.OPEN;

      groups.push({
        poId,
        poNumber: po.poNumber,
        channelId: po.channelId,
        poValue: Number(po.poValue),
        stuckValue: lines.reduce((sum, l) => sum + Number(l.value), 0),
        stuckQuantity: lines.reduce((sum, l) => sum + Number(l.quantity), 0),
        reasons: [...new Set(lines.map((l) => l.reason))],
        maxDaysStuck: Math.max(...lines.map((l) => l.daysStuck)),
        status,
        lines,
      });
    }

    return groups.sort((a, b) => b.stuckValue - a.stuckValue);
  }

  private withAging(record: StuckStockEntity): StuckStockWithAging {
    const { daysStuck, agingBucket } = this.computeAging(record.firstDetectedAt);
    return { ...record, daysStuck, agingBucket };
  }

  private computeAging(firstDetectedAt: Date): { daysStuck: number; agingBucket: StuckStockAgingBucket } {
    const daysStuck = Math.max(0, differenceInCalendarDays(new Date(), firstDetectedAt));
    let agingBucket: StuckStockAgingBucket;
    if (daysStuck <= 7) agingBucket = '0-7';
    else if (daysStuck <= 15) agingBucket = '8-15';
    else if (daysStuck <= 30) agingBucket = '16-30';
    else if (daysStuck <= 60) agingBucket = '31-60';
    else agingBucket = '60+';
    return { daysStuck, agingBucket };
  }

  private isStuckCandidate(po: POMasterEntity, now: Date): boolean {
    if (po.status === POStatus.CANCELLED) return true;
    if (po.status === POStatus.RETURNED) return true;
    if (po.fulfilmentDecision === FulfilmentDecision.NOT_FULFILLED) return true;
    if (new Date(po.poExpiryDate) < now && !NOT_STUCK_STATUSES.includes(po.status) && po.status !== POStatus.CLOSED) return true;
    return false;
  }

  private inferReason(po: POMasterEntity, now: Date): StuckStockReason {
    if (po.status === POStatus.CANCELLED) return StuckStockReason.PO_CANCELLED;
    if (po.status === POStatus.RETURNED) return StuckStockReason.RTO;
    if (po.nonFulfilmentReason === NonFulfilmentReason.PO_CANCELLED) return StuckStockReason.PO_CANCELLED;
    if (po.nonFulfilmentReason === NonFulfilmentReason.APPOINTMENT_NOT_AVAILABLE) return StuckStockReason.APPOINTMENT_EXPIRED;
    if (new Date(po.poExpiryDate) < now) return StuckStockReason.EXPIRED_PO;
    return StuckStockReason.OTHER;
  }
}
