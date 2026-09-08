import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExceptionType, ExceptionSeverity } from '@po-control-tower/shared';
import { BulkPOProcessedRowEntity } from '../database/entities/bulk-processed-row.entity';
import { POLineItemEntity } from '../database/entities/po-line-item.entity';
import { ExceptionsService, RaiseExceptionInput } from '../modules/exceptions/exceptions.service';

const EPSILON = 0.01;

@Injectable()
export class ReconciliationEngine {
  constructor(
    private readonly exceptionsService: ExceptionsService,
    @InjectRepository(POLineItemEntity) private readonly lineRepository: Repository<POLineItemEntity>,
  ) {}

  /** Ordered = Delivered + Pending, and PO Value = Qty x Unit Price - flag drift. */
  async reconcileRow(row: BulkPOProcessedRowEntity, batchId: string): Promise<number> {
    const issues: RaiseExceptionInput[] = [];

    if (row.orderedQty != null && row.deliveredQty != null && row.pendingQty != null) {
      const expectedPending = Number(row.orderedQty) - Number(row.deliveredQty);
      if (Math.abs(expectedPending - Number(row.pendingQty)) > EPSILON) {
        issues.push({
          batchId,
          poId: row.matchedPoId,
          rawRowId: row.rawRowId,
          processedRowId: row.id,
          poNumber: row.poNumber,
          skuCode: row.skuCode,
          warehouse: row.warehouse,
          exceptionType: ExceptionType.QUANTITY_MISMATCH,
          severity: ExceptionSeverity.MEDIUM,
          recommendedAction: `Ordered (${row.orderedQty}) should equal Delivered (${row.deliveredQty}) + Pending (${row.pendingQty}); expected pending ${expectedPending}.`,
        });
      }
    }

    if (row.orderedQty != null && row.unitPrice != null && row.poValue != null) {
      const expectedValue = Number(row.orderedQty) * Number(row.unitPrice);
      const diff = Math.abs(expectedValue - Number(row.poValue));
      if (diff > 1) {
        issues.push({
          batchId,
          poId: row.matchedPoId,
          rawRowId: row.rawRowId,
          processedRowId: row.id,
          poNumber: row.poNumber,
          skuCode: row.skuCode,
          warehouse: row.warehouse,
          exceptionType: ExceptionType.VALUE_MISMATCH,
          severity: ExceptionSeverity.MEDIUM,
          financialImpact: diff,
          recommendedAction: `PO Value (${row.poValue}) should equal Qty x Unit Price (${expectedValue.toFixed(2)}).`,
        });
      }
    }

    if (row.upc && row.mrp != null && row.matchedPoId) {
      const mrpIssue = await this.checkMrpMismatch(row, batchId);
      if (mrpIssue) issues.push(mrpIssue);
    }

    if (issues.length > 0) await this.exceptionsService.raiseMany(issues);
    return issues.length;
  }

  /**
   * Cross-references this row's UPC+MRP against every other live PO's line
   * items for the same UPC. A UPC uniquely identifies one physical product,
   * so more than one MRP for it is a real pricing inconsistency - unlike
   * QUANTITY_MISMATCH/VALUE_MISMATCH, this can't be caught by looking at the
   * row in isolation, since the row itself is internally consistent; it only
   * shows up by comparing against everything else already in the system.
   */
  private async checkMrpMismatch(row: BulkPOProcessedRowEntity, batchId: string): Promise<RaiseExceptionInput | null> {
    const breakdown = await this.getMrpBreakdown(row.upc!);
    if (!breakdown) return null;

    const { unitsByMrp, locationsByMrp } = breakdown;
    const [majorityMrp] = [...unitsByMrp.entries()].sort((a, b) => b[1] - a[1])[0];
    const currentMrp = Number(row.mrp);
    if (currentMrp === majorityMrp) return null;

    const thisLocations = [...(locationsByMrp.get(currentMrp) ?? [])].join(', ') || row.warehouse || 'this location';

    return {
      batchId,
      poId: row.matchedPoId,
      rawRowId: row.rawRowId,
      processedRowId: row.id,
      poNumber: row.poNumber,
      skuCode: row.skuCode,
      warehouse: row.warehouse,
      exceptionType: ExceptionType.MRP_MISMATCH,
      severity: ExceptionSeverity.MEDIUM,
      financialImpact: Math.abs(currentMrp - majorityMrp) * (Number(row.orderedQty) || 0),
      recommendedAction: `${row.productName || row.skuCode} (UPC ${row.upc}) is showing ₹${currentMrp} at ${thisLocations} vs ₹${majorityMrp} across other locations. Please verify pricing before dispatch.`,
    };
  }

  /**
   * Exposed for bulk-import.service.ts's Fix & Recompile flow, which needs to
   * know whether a corrected row's MRP still disagrees with the rest of the
   * system before it can auto-resolve a stale MRP_MISMATCH exception -
   * mirrors checkMrpMismatch's own majority-price logic exactly, so both
   * paths agree on what counts as "still mismatched".
   */
  async hasMrpMismatch(upc: string, mrp: number): Promise<boolean> {
    const breakdown = await this.getMrpBreakdown(upc);
    if (!breakdown) return false;
    const [majorityMrp] = [...breakdown.unitsByMrp.entries()].sort((a, b) => b[1] - a[1])[0];
    return majorityMrp !== mrp;
  }

  private async getMrpBreakdown(upc: string): Promise<{ unitsByMrp: Map<number, number>; locationsByMrp: Map<number, Set<string>> } | null> {
    const raw = await this.lineRepository
      .createQueryBuilder('li')
      .innerJoin('li.po', 'po')
      .select('li.mrp', 'mrp')
      .addSelect('po.location', 'location')
      .addSelect('SUM(li.quantity)', 'units')
      .where('li.upc = :upc', { upc })
      .groupBy('li.mrp')
      .addGroupBy('po.location')
      .getRawMany();

    const unitsByMrp = new Map<number, number>();
    const locationsByMrp = new Map<number, Set<string>>();
    for (const r of raw) {
      const mrp = Number(r.mrp);
      unitsByMrp.set(mrp, (unitsByMrp.get(mrp) || 0) + (Number(r.units) || 0));
      const set = locationsByMrp.get(mrp) ?? new Set<string>();
      if (r.location) set.add(r.location);
      locationsByMrp.set(mrp, set);
    }

    return unitsByMrp.size > 1 ? { unitsByMrp, locationsByMrp } : null;
  }

  summarize(rows: BulkPOProcessedRowEntity[]) {
    const sum = (pick: (r: BulkPOProcessedRowEntity) => number | null | undefined) =>
      rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0);

    return {
      totalPoValue: sum((r) => r.poValue),
      totalOrderedQty: sum((r) => r.orderedQty),
      totalDeliveredQty: sum((r) => r.deliveredQty),
      totalPendingQty: sum((r) => r.pendingQty),
      totalPendingValue: rows.reduce((s, r) => s + (Number(r.pendingQty) || 0) * (Number(r.unitPrice) || 0), 0),
    };
  }
}
