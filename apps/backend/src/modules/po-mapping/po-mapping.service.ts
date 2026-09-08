import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { POMappingEntity } from '../../database/entities/po-mapping.entity';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { GRNOutcome, POMappingStatus } from '@po-control-tower/shared';
import { StuckStockService } from '../stuck-stock/stuck-stock.service';

export type MappingExecutionStatus = 'APPOINTMENT_PENDING' | 'APPOINTMENT_BOOKED' | 'DISPATCHED' | 'RECEIVED';

export interface POMappingWithExecution extends POMappingEntity {
  executionStatus: MappingExecutionStatus;
}

export interface MappedStockForNewPo {
  newPoId: string;
  totalQuantityMapped: number;
  totalValueMapped: number;
  lines: POMappingWithExecution[];
}

export interface UpdatePOMappingInput {
  status?: POMappingStatus;
  remarks?: string;
  newAppointmentDate?: string | null;
}

export interface MapWholePOInput {
  originalPoId: string;
  newPoId: string;
  lines: { skuCode: string; quantityMapped: number }[];
  reason?: string;
  remarks?: string;
  newAppointmentDate?: string;
  createdByUserId?: string;
}

export interface MapWholePOResult {
  mappings: POMappingEntity[];
  totalValueMapped: number;
  newPoValue: number;
  coveragePercent: number;
}

// A whole-PO mapping should meaningfully fulfil the new PO, not just token-cover
// it - the combined value mapped across every included SKU line must reach at
// least this fraction of the new PO's total value.
const MIN_NEW_PO_COVERAGE_RATIO = 0.7;

interface BuiltMappingLine {
  originalPoId: string;
  originalPoNumber: string;
  skuCode: string;
  skuName: string;
  newPoId: string;
  newPoNumber: string;
  originalQuantity: number;
  availableQuantity: number;
  quantityMapped: number;
  quantityRemaining: number;
  originalValue: number;
  valueMapped: number;
  valueRemaining: number;
}

@Injectable()
export class POMappingService {
  constructor(
    @InjectRepository(POMappingEntity)
    private readonly mappingRepository: Repository<POMappingEntity>,
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(POLineItemEntity)
    private readonly lineItemRepository: Repository<POLineItemEntity>,
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepository: Repository<AppointmentEntity>,
    @InjectRepository(DispatchEntity)
    private readonly dispatchRepository: Repository<DispatchEntity>,
    @InjectRepository(GRNTrackerEntity)
    private readonly grnRepository: Repository<GRNTrackerEntity>,
    private readonly stuckStockService: StuckStockService,
  ) {}

  /**
   * Maps every given SKU line of an old, stuck PO onto a single new PO in one
   * atomic action - mapping is always PO-to-PO, never a lone SKU line. The
   * combined value mapped across all included lines must reach 70% of the new
   * PO's total value; individual lines don't each need to clear that bar on
   * their own. All-or-nothing: if the aggregate falls short, or any single
   * line fails its own availability/SKU-match checks, nothing is written.
   */
  async mapWholePO(input: MapWholePOInput): Promise<MapWholePOResult> {
    if (!input.lines || input.lines.length === 0) {
      throw new BadRequestException('At least one SKU line is required to map a PO');
    }

    const [originalPo, newPo] = await Promise.all([
      this.poRepository.findOne({ where: { id: input.originalPoId } }),
      this.poRepository.findOne({ where: { id: input.newPoId } }),
    ]);
    if (!originalPo) throw new NotFoundException(`Original PO ${input.originalPoId} not found`);
    if (!newPo) throw new NotFoundException(`New PO ${input.newPoId} not found`);

    const builtLines: BuiltMappingLine[] = [];
    for (const line of input.lines) {
      builtLines.push(await this.buildLine(originalPo, newPo, line.skuCode, line.quantityMapped));
    }

    const totalValueMapped = builtLines.reduce((sum, l) => sum + l.valueMapped, 0);
    const newPoValue = Number(newPo.poValue);
    const coveragePercent = newPoValue > 0 ? totalValueMapped / newPoValue : 0;

    if (coveragePercent < MIN_NEW_PO_COVERAGE_RATIO) {
      throw new BadRequestException(
        `PO mapping must cover at least ${MIN_NEW_PO_COVERAGE_RATIO * 100}% of new PO ${newPo.poNumber}'s value (₹${newPoValue.toFixed(2)}) - this mapping only covers ₹${totalValueMapped.toFixed(2)} (${(coveragePercent * 100).toFixed(1)}%)`,
      );
    }

    const mappingDate = new Date();
    const mappings = await this.mappingRepository.manager.transaction(async (manager) => {
      const repo = manager.withRepository(this.mappingRepository);
      const saved: POMappingEntity[] = [];
      for (const built of builtLines) {
        saved.push(
          await repo.save(
            repo.create({
              ...built,
              mappingDate,
              reason: input.reason ?? null,
              newAppointmentDate: input.newAppointmentDate ? new Date(input.newAppointmentDate) : null,
              remarks: input.remarks ?? null,
              createdByUserId: input.createdByUserId ?? null,
            }),
          ),
        );
      }
      return saved;
    });

    for (const line of input.lines) {
      await this.syncStuckStockState(input.originalPoId, line.skuCode);
    }

    return { mappings, totalValueMapped, newPoValue, coveragePercent };
  }

  /**
   * Automatically finds the best new PO to map an entire stuck PO onto, across
   * every SKU line at once - searches every other live PO, matches whichever
   * of its SKUs the stuck PO also carries, and picks the one whose combined
   * matched value clears the 70%-of-its-value bar with the highest coverage.
   */
  async autoMapWholePO(input: {
    originalPoId: string;
    reason?: string;
    remarks?: string;
    newAppointmentDate?: string;
    createdByUserId?: string;
  }): Promise<MapWholePOResult & { candidatesConsidered: number }> {
    const originalPo = await this.poRepository.findOne({ where: { id: input.originalPoId } });
    if (!originalPo) throw new NotFoundException(`Original PO ${input.originalPoId} not found`);

    const originalLines = await this.lineItemRepository.find({ where: { poId: input.originalPoId } });
    const availabilityBySku = new Map<string, { availableQuantity: number; rate: number }>();
    for (const li of originalLines) {
      const { availableQuantity, rate } = await this.computeAvailability(originalPo, li.skuCode);
      if (availableQuantity > 0) availabilityBySku.set(li.skuCode, { availableQuantity, rate });
    }
    if (availabilityBySku.size === 0) {
      throw new BadRequestException(`Nothing available to map on ${originalPo.poNumber}`);
    }

    const otherPos = await this.poRepository.find({ where: { isDeleted: false } });
    const candidatePos = otherPos.filter((p) => p.id !== originalPo.id);
    const allOtherLines = await this.lineItemRepository.find({ where: { poId: In(candidatePos.map((p) => p.id)) } });
    const linesByPoId = new Map<string, POLineItemEntity[]>();
    for (const li of allOtherLines) {
      const list = linesByPoId.get(li.poId) ?? [];
      list.push(li);
      linesByPoId.set(li.poId, list);
    }

    let best: { po: POMasterEntity; lines: { skuCode: string; quantityMapped: number }[]; totalValueMapped: number; coveragePercent: number } | null = null;
    let candidatesConsidered = 0;

    for (const po of candidatePos) {
      const poLines = linesByPoId.get(po.id) ?? [];
      if (poLines.length === 0) continue;
      const poValue = Number(po.poValue);
      if (poValue <= 0) continue;

      const matchedLines: { skuCode: string; quantityMapped: number }[] = [];
      let totalValueMapped = 0;
      for (const li of poLines) {
        const avail = availabilityBySku.get(li.skuCode);
        if (!avail) continue;
        const need = Number(li.quantity) - Number(li.dispatchedQuantity ?? 0);
        if (need <= 0) continue;
        const quantityMapped = Math.min(avail.availableQuantity, need);
        if (quantityMapped <= 0) continue;
        matchedLines.push({ skuCode: li.skuCode, quantityMapped });
        totalValueMapped += quantityMapped * avail.rate;
      }
      if (matchedLines.length === 0) continue;

      candidatesConsidered++;
      const coveragePercent = totalValueMapped / poValue;
      if (coveragePercent < MIN_NEW_PO_COVERAGE_RATIO) continue;
      if (!best || coveragePercent > best.coveragePercent) {
        best = { po, lines: matchedLines, totalValueMapped, coveragePercent };
      }
    }

    if (!best) {
      throw new BadRequestException(
        `No eligible new PO found for ${originalPo.poNumber} - no other live PO's stuck-SKU overlap reaches ${MIN_NEW_PO_COVERAGE_RATIO * 100}% of its value (${candidatesConsidered} candidate(s) considered)`,
      );
    }

    const result = await this.mapWholePO({
      originalPoId: input.originalPoId,
      newPoId: best.po.id,
      lines: best.lines,
      reason: input.reason ?? 'Auto-mapped by system',
      remarks: input.remarks,
      newAppointmentDate: input.newAppointmentDate,
      createdByUserId: input.createdByUserId,
    });

    return { ...result, candidatesConsidered };
  }

  /** Leftover quantity on the original PO/SKU still free to map (its own remaining qty minus whatever's already ACTIVE-mapped elsewhere), plus the per-unit rate used for value math. */
  private async computeAvailability(originalPo: POMasterEntity, skuCode: string): Promise<{ lineItem: POLineItemEntity; leftover: number; rate: number; availableQuantity: number }> {
    const lineItem = await this.lineItemRepository.findOne({ where: { poId: originalPo.id, skuCode } });
    if (!lineItem) throw new NotFoundException(`SKU ${skuCode} not found on original PO ${originalPo.poNumber}`);

    const leftover = Number(lineItem.quantity) - Number(lineItem.dispatchedQuantity ?? 0);
    const rate = lineItem.unitPrice != null ? Number(lineItem.unitPrice) : lineItem.lineValue && lineItem.quantity ? Number(lineItem.lineValue) / Number(lineItem.quantity) : 0;

    const activeMappings = await this.mappingRepository.find({
      where: { originalPoId: originalPo.id, skuCode, status: POMappingStatus.ACTIVE },
    });
    const alreadyMapped = activeMappings.reduce((sum, m) => sum + Number(m.quantityMapped), 0);
    const availableQuantity = leftover - alreadyMapped;

    return { lineItem, leftover, rate, availableQuantity };
  }

  /** Validates and computes one mapping line's fields as part of a whole-PO batch; throws if the line itself is invalid. Does not persist. */
  private async buildLine(originalPo: POMasterEntity, newPo: POMasterEntity, skuCode: string, quantityMapped: number): Promise<BuiltMappingLine> {
    const { lineItem, leftover, rate, availableQuantity } = await this.computeAvailability(originalPo, skuCode);

    if (quantityMapped <= 0) {
      throw new BadRequestException(`quantityMapped for ${skuCode} must be greater than 0`);
    }
    if (quantityMapped > availableQuantity) {
      throw new BadRequestException(`Only ${availableQuantity} units of ${skuCode} remain available to map on ${originalPo.poNumber}`);
    }

    const newLineItem = await this.lineItemRepository.findOne({ where: { poId: newPo.id, skuCode } });
    if (!newLineItem) {
      throw new BadRequestException(`New PO ${newPo.poNumber} does not carry SKU ${skuCode} - it can only be mapped against a PO ordering the same SKU`);
    }
    const newPoNeed = Number(newLineItem.quantity) - Number(newLineItem.dispatchedQuantity ?? 0);
    if (newPoNeed <= 0) {
      throw new BadRequestException(`New PO ${newPo.poNumber} has no outstanding quantity left for SKU ${skuCode} to map against`);
    }

    return {
      originalPoId: originalPo.id,
      originalPoNumber: originalPo.poNumber,
      skuCode,
      skuName: lineItem.skuName,
      newPoId: newPo.id,
      newPoNumber: newPo.poNumber,
      originalQuantity: leftover,
      availableQuantity,
      quantityMapped,
      quantityRemaining: availableQuantity - quantityMapped,
      originalValue: leftover * rate,
      valueMapped: quantityMapped * rate,
      valueRemaining: (availableQuantity - quantityMapped) * rate,
    };
  }

  async list(filters: { originalPoId?: string; newPoId?: string; status?: POMappingStatus }): Promise<POMappingWithExecution[]> {
    const where: any = {};
    if (filters.originalPoId) where.originalPoId = filters.originalPoId;
    if (filters.newPoId) where.newPoId = filters.newPoId;
    if (filters.status) where.status = filters.status;
    const mappings = await this.mappingRepository.find({ where, order: { mappingDate: 'DESC' } });
    return this.enrichWithExecutionStatus(mappings);
  }

  async getById(id: string): Promise<POMappingEntity> {
    const mapping = await this.mappingRepository.findOne({ where: { id } });
    if (!mapping) throw new NotFoundException(`PO Mapping ${id} not found`);
    return mapping;
  }

  /** Every ACTIVE mapping feeding a given new PO, with totals - the "Mapped Stock Available" indicator for that PO. */
  async getMappedStockForNewPo(newPoId: string): Promise<MappedStockForNewPo> {
    const lines = await this.mappingRepository.find({ where: { newPoId, status: POMappingStatus.ACTIVE }, order: { mappingDate: 'DESC' } });
    const enriched = await this.enrichWithExecutionStatus(lines);
    return {
      newPoId,
      totalQuantityMapped: lines.reduce((sum, l) => sum + Number(l.quantityMapped), 0),
      totalValueMapped: lines.reduce((sum, l) => sum + Number(l.valueMapped), 0),
      lines: enriched,
    };
  }

  /**
   * Called after a PO's GRN is recorded with an outcome that means stock
   * actually arrived (anything but NO_GRN) - marks every still-unrecovered
   * ACTIVE mapping feeding that PO as recovered and permanently deducts the
   * mapped quantity from the original stuck-stock line. This is the only
   * path that can resolve the original stuck stock; mapping alone never does.
   */
  async recoverMappingsForNewPo(newPoId: string, outcome: string): Promise<void> {
    if (outcome === GRNOutcome.NO_GRN) return;

    const mappings = await this.mappingRepository.find({ where: { newPoId, status: POMappingStatus.ACTIVE } });
    for (const mapping of mappings) {
      if (mapping.recoveredAt) continue;
      await this.mappingRepository.update(mapping.id, { recoveredAt: new Date() });
      await this.stuckStockService.applyRecovery(mapping.originalPoId, mapping.skuCode, Number(mapping.quantityMapped));
    }
  }

  /** Derives each mapping's execution progress from the new PO's real appointment/dispatch/GRN records - never a separately-tracked, hand-advanced field. */
  private async enrichWithExecutionStatus(mappings: POMappingEntity[]): Promise<POMappingWithExecution[]> {
    if (mappings.length === 0) return [];
    const newPoIds = [...new Set(mappings.map((m) => m.newPoId))];

    const [appointments, dispatches, grns] = await Promise.all([
      this.appointmentRepository.find({ where: { poId: In(newPoIds) } }),
      this.dispatchRepository.find({ where: { poId: In(newPoIds) } }),
      this.grnRepository.find({ where: { poId: In(newPoIds) } }),
    ]);
    const appointmentByPoId = new Map(appointments.map((a) => [a.poId, a]));
    const dispatchByPoId = new Map(dispatches.map((d) => [d.poId, d]));
    const grnByPoId = new Map(grns.map((g) => [g.poId, g]));

    return mappings.map((m) => {
      const grn = grnByPoId.get(m.newPoId);
      const dispatch = dispatchByPoId.get(m.newPoId);
      const appointment = appointmentByPoId.get(m.newPoId);

      let executionStatus: MappingExecutionStatus;
      if (m.recoveredAt || grn?.grnDate) executionStatus = 'RECEIVED';
      else if (dispatch?.actualDispatchDate) executionStatus = 'DISPATCHED';
      else if (appointment?.confirmedAt) executionStatus = 'APPOINTMENT_BOOKED';
      else executionStatus = 'APPOINTMENT_PENDING';

      return { ...m, executionStatus };
    });
  }

  async update(id: string, data: UpdatePOMappingInput): Promise<POMappingEntity> {
    const mapping = await this.getById(id);
    const patch: Partial<POMappingEntity> = {};
    if (data.status) patch.status = data.status;
    if (data.remarks !== undefined) patch.remarks = data.remarks;
    if (data.newAppointmentDate !== undefined) patch.newAppointmentDate = data.newAppointmentDate ? new Date(data.newAppointmentDate) : null;

    await this.mappingRepository.update(id, patch);

    if (data.status && data.status !== POMappingStatus.ACTIVE) {
      await this.syncStuckStockState(mapping.originalPoId, mapping.skuCode);
    }
    return this.getById(id);
  }

  /** Every mapping line ever created in the same batch (shared originalPoId/newPoId/mappingDate) - used to act on a whole PO-to-PO mapping event at once. */
  async listBatch(originalPoId: string, newPoId: string, mappingDate: string): Promise<POMappingWithExecution[]> {
    const lines = await this.mappingRepository.find({ where: { originalPoId, newPoId, mappingDate: new Date(mappingDate) } });
    return this.enrichWithExecutionStatus(lines);
  }

  async updateBatch(originalPoId: string, newPoId: string, mappingDate: string, data: UpdatePOMappingInput): Promise<POMappingWithExecution[]> {
    const rawLines = await this.mappingRepository.find({ where: { originalPoId, newPoId, mappingDate: new Date(mappingDate) } });
    for (const line of rawLines) {
      await this.update(line.id, data);
    }
    return this.listBatch(originalPoId, newPoId, mappingDate);
  }

  async listForOriginal(originalPoId: string, skuCode: string): Promise<POMappingEntity[]> {
    return this.mappingRepository.find({ where: { originalPoId, skuCode }, order: { mappingDate: 'DESC' } });
  }

  /** Re-derives the linked stuck-stock row's status from every currently-ACTIVE mapping for this (PO, SKU) - called after any mapping is created or its status changes away from ACTIVE. */
  private async syncStuckStockState(originalPoId: string, skuCode: string): Promise<void> {
    const activeMappings = await this.mappingRepository.find({ where: { originalPoId, skuCode, status: POMappingStatus.ACTIVE } });
    const totalActiveMapped = activeMappings.reduce((sum, m) => sum + Number(m.quantityMapped), 0);
    const latest = activeMappings.sort((a, b) => b.mappingDate.getTime() - a.mappingDate.getTime())[0];
    await this.stuckStockService.recomputeMappingState(originalPoId, skuCode, totalActiveMapped, latest?.newPoId ?? null);
  }
}
