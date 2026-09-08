import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import ExcelJS from 'exceljs';

import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { BulkPOProcessedRowEntity } from '../../database/entities/bulk-processed-row.entity';

// Formats a date for the exported spreadsheet fixed to IST, independent of the
// server's own clock/timezone - `toLocaleDateString` without an explicit
// timeZone only "worked" on this dev machine by coincidence (see the same
// class of bug fixed in po-import.service.ts's PDF date parser).
function formatIST(date: Date | null | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

const YELLOW_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
const GRAND_TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

export interface ReportFilters {
  batchId?: string;
  poIds?: string[];
  platform?: string;
}

export interface SkuSummaryRow {
  upc: string | null;
  name: string;
  mrp: number | null;
  unitsOrdered: number;
  totalAmount: number;
  isDuplicateMrp: boolean;
  mismatchDetail: string | null;
}

export interface PoSummaryRow {
  poNumber: string;
  facilityName: string;
  orderDate: Date;
  expiryDate: Date;
  totalAmount: number;
  dispatchDate: Date | null;
  locationType: string | null;
}

/**
 * Employee-facing rollups that replace the manual Excel pivots built after
 * every bulk PO upload - a SKU-level movement summary and a PO/facility
 * summary with the auto-calculated dispatch date already filled in.
 */
@Injectable()
export class POReportsService {
  constructor(
    @InjectRepository(POMasterEntity) private readonly poRepository: Repository<POMasterEntity>,
    @InjectRepository(POLineItemEntity) private readonly lineRepository: Repository<POLineItemEntity>,
    @InjectRepository(DispatchEntity) private readonly dispatchRepository: Repository<DispatchEntity>,
    @InjectRepository(BulkPOProcessedRowEntity) private readonly processedRepository: Repository<BulkPOProcessedRowEntity>,
  ) {}

  private async resolvePoIds(filters: ReportFilters): Promise<string[] | undefined> {
    // Explicit PO id list (e.g. from a Compilation) wins outright - the compiler
    // owns which POs are in scope, not a batch lookup.
    if (filters.poIds) return filters.poIds;
    if (!filters.batchId) return undefined;
    // Scope to exactly the POs this batch touched (via the processed rows it
    // produced), rather than po_master.lastBulkBatchId, which only remembers
    // the most recent batch and would go stale after a later re-upload.
    const rows = await this.processedRepository.find({ where: { batchId: filters.batchId } });
    return [...new Set(rows.map((r) => r.matchedPoId).filter((id): id is string => !!id))];
  }

  async getSkuSummary(filters: ReportFilters): Promise<{ rows: SkuSummaryRow[]; grandTotal: { unitsOrdered: number; totalAmount: number } }> {
    const poIds = await this.resolvePoIds(filters);

    let qb = this.lineRepository
      .createQueryBuilder('li')
      .innerJoin('li.po', 'po')
      .select('li.upc', 'upc')
      .addSelect('li.skuName', 'name')
      .addSelect('li.mrp', 'mrp')
      .addSelect('SUM(li.quantity)', 'unitsOrdered')
      .addSelect('SUM(COALESCE(li.lineValue, li.quantity * li.unitPrice, 0))', 'totalAmount')
      .groupBy('li.upc')
      .addGroupBy('li.skuName')
      .addGroupBy('li.mrp');

    if (poIds) qb = qb.andWhere('li.poId IN (:...poIds)', { poIds: poIds.length ? poIds : ['00000000-0000-0000-0000-000000000000'] });
    if (filters.platform) qb = qb.andWhere('po.channelId = :platform', { platform: filters.platform });

    const raw = await qb.getRawMany();

    // A UPC appearing at more than one distinct MRP is the same physical
    // product priced inconsistently - a real catalog/pricing issue. Grouping
    // this by name instead of UPC was wrong: different UPCs are different
    // products (different pack size/variant) even when the source file gives
    // them an identical name, so they must never be compared against each
    // other.
    const mrpsByUpc = new Map<string, Set<number>>();
    for (const r of raw) {
      if (r.mrp === null || !r.upc) continue;
      const set = mrpsByUpc.get(r.upc) ?? new Set<number>();
      set.add(Number(r.mrp));
      mrpsByUpc.set(r.upc, set);
    }

    // For flagged UPCs, work out exactly which locations are paying the
    // outlier price(s) so the warning can name them instead of just saying
    // "mismatch" - that's what actually lets someone verify pricing before
    // dispatch instead of hunting through every PO by hand.
    const duplicateUpcs = [...mrpsByUpc.entries()].filter(([, mrps]) => mrps.size > 1).map(([upc]) => upc);
    const mismatchDetailByUpc = new Map<string, string>();

    if (duplicateUpcs.length > 0) {
      let detailQb = this.lineRepository
        .createQueryBuilder('li')
        .innerJoin('li.po', 'po')
        .select('li.upc', 'upc')
        .addSelect('li.skuName', 'name')
        .addSelect('li.mrp', 'mrp')
        .addSelect('po.location', 'location')
        .addSelect('SUM(li.quantity)', 'units')
        .where('li.upc IN (:...duplicateUpcs)', { duplicateUpcs })
        .groupBy('li.upc')
        .addGroupBy('li.skuName')
        .addGroupBy('li.mrp')
        .addGroupBy('po.location');

      if (poIds) detailQb = detailQb.andWhere('li.poId IN (:...poIds)', { poIds: poIds.length ? poIds : ['00000000-0000-0000-0000-000000000000'] });
      if (filters.platform) detailQb = detailQb.andWhere('po.channelId = :platform', { platform: filters.platform });

      const detailRaw = await detailQb.getRawMany();

      const byUpc = new Map<string, { name: string; mrp: number; location: string; units: number }[]>();
      for (const d of detailRaw) {
        const list = byUpc.get(d.upc) ?? [];
        list.push({ name: d.name, mrp: Number(d.mrp), location: d.location || 'an unknown location', units: Number(d.units) || 0 });
        byUpc.set(d.upc, list);
      }

      for (const [upc, entries] of byUpc) {
        // Roll each location up to a single mrp -> total units so the
        // "majority" price is picked by total volume, not by row count.
        const unitsByMrp = new Map<number, number>();
        const locationsByMrp = new Map<number, string[]>();
        for (const e of entries) {
          unitsByMrp.set(e.mrp, (unitsByMrp.get(e.mrp) || 0) + e.units);
          const locs = locationsByMrp.get(e.mrp) ?? [];
          if (!locs.includes(e.location)) locs.push(e.location);
          locationsByMrp.set(e.mrp, locs);
        }
        const sortedMrps = [...unitsByMrp.entries()].sort((a, b) => b[1] - a[1]);
        const [majorityMrp] = sortedMrps[0];
        const minorityMrps = sortedMrps.slice(1);
        const name = entries[0].name;
        const minorityText = minorityMrps
          .map(([mrp]) => `₹${mrp} at ${locationsByMrp.get(mrp)!.join(', ')}`)
          .join('; ');
        mismatchDetailByUpc.set(
          upc,
          `${name} (UPC ${upc}) is showing ${minorityText} vs ₹${majorityMrp} across other locations. Please verify pricing before dispatch.`,
        );
      }
    }

    const rows: SkuSummaryRow[] = raw
      .map((r) => ({
        upc: r.upc,
        name: r.name,
        mrp: r.mrp !== null ? Number(r.mrp) : null,
        unitsOrdered: Number(r.unitsOrdered) || 0,
        totalAmount: Number(r.totalAmount) || 0,
        isDuplicateMrp: r.upc ? (mrpsByUpc.get(r.upc)?.size ?? 0) > 1 : false,
        mismatchDetail: r.upc ? mismatchDetailByUpc.get(r.upc) ?? null : null,
      }))
      .sort((a, b) => b.unitsOrdered - a.unitsOrdered);

    const grandTotal = {
      unitsOrdered: rows.reduce((s, r) => s + r.unitsOrdered, 0),
      totalAmount: rows.reduce((s, r) => s + r.totalAmount, 0),
    };

    return { rows, grandTotal };
  }

  async getPoSummary(filters: ReportFilters): Promise<{ rows: PoSummaryRow[]; grandTotal: number }> {
    const poIds = await this.resolvePoIds(filters);

    let qb = this.poRepository.createQueryBuilder('po');
    if (poIds) qb = qb.andWhere('po.id IN (:...poIds)', { poIds: poIds.length ? poIds : ['00000000-0000-0000-0000-000000000000'] });
    if (filters.platform) qb = qb.andWhere('po.channelId = :platform', { platform: filters.platform });

    const pos = await qb.orderBy('po.poExpiryDate', 'ASC').getMany();
    const dispatches = pos.length
      ? await this.dispatchRepository.findBy({ poId: In(pos.map((p) => p.id)) })
      : [];
    const dispatchByPoId = new Map(dispatches.map((d) => [d.poId, d]));

    const rows: PoSummaryRow[] = pos.map((po) => {
      const dispatch = dispatchByPoId.get(po.id);
      return {
        poNumber: po.poNumber,
        facilityName: po.location,
        orderDate: po.poDate,
        expiryDate: po.poExpiryDate,
        totalAmount: Number(po.poValue) || 0,
        dispatchDate: dispatch?.recommendedDispatchDate ?? null,
        locationType: dispatch?.locationType ?? null,
      };
    });

    const grandTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
    return { rows, grandTotal };
  }

  async buildSkuSummaryWorkbook(filters: ReportFilters): Promise<Buffer> {
    const { rows, grandTotal } = await this.getSkuSummary(filters);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('SKU Summary');

    sheet.columns = [
      { header: 'upc', key: 'upc', width: 16 },
      { header: 'name', key: 'name', width: 45 },
      { header: 'mrp', key: 'mrp', width: 10 },
      { header: 'Sum of units_ordered', key: 'unitsOrdered', width: 20 },
      { header: 'Sum of total_amount', key: 'totalAmount', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };

    const totalRow = sheet.addRow({ upc: 'Grand Total', name: '', mrp: '', unitsOrdered: grandTotal.unitsOrdered, totalAmount: grandTotal.totalAmount });
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => (cell.fill = GRAND_TOTAL_FILL));

    for (const r of rows) {
      const row = sheet.addRow({ upc: r.upc, name: r.name, mrp: r.mrp, unitsOrdered: r.unitsOrdered, totalAmount: r.totalAmount });
      if (r.isDuplicateMrp) row.eachCell((cell) => (cell.fill = YELLOW_FILL));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async buildPoSummaryWorkbook(filters: ReportFilters): Promise<Buffer> {
    const { rows, grandTotal } = await this.getPoSummary(filters);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('PO Summary');

    sheet.columns = [
      { header: 'po_number', key: 'poNumber', width: 18 },
      { header: 'facility_name', key: 'facilityName', width: 28 },
      { header: 'order_date', key: 'orderDate', width: 14 },
      { header: 'expiry_date', key: 'expiryDate', width: 14 },
      { header: 'Sum of total_amount', key: 'totalAmount', width: 20 },
      { header: 'DISPATCH DATE', key: 'dispatchDate', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const r of rows) {
      sheet.addRow({
        poNumber: r.poNumber,
        facilityName: r.facilityName,
        orderDate: formatIST(r.orderDate),
        expiryDate: formatIST(r.expiryDate),
        totalAmount: r.totalAmount,
        dispatchDate: r.dispatchDate ? formatIST(r.dispatchDate) : '-',
      });
    }

    const totalRow = sheet.addRow({ poNumber: 'Grand Total', facilityName: '', orderDate: '', expiryDate: '', totalAmount: grandTotal, dispatchDate: '' });
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => (cell.fill = GRAND_TOTAL_FILL));

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
