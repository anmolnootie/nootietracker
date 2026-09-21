import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { POMasterEntity } from '../../database/entities/po-master.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';

export interface DispatchDashboardFilters {
  fy?: number; // start year of the financial year (Apr-Mar); default = current
  channel?: string;
  month?: string; // 'YYYY-MM'
  status?: string;
  partner?: string;
  aging?: string;
}

interface Row {
  id: string;
  poNumber: string;
  channel: string;
  location: string;
  dispatchDate: Date;
  invoiceNumber: string | null;
  invoiceValue: number;
  awb: string | null;
  partner: string;
  status: string;
  grnDone: boolean;
  grnOutcome: string | null;
  monthKey: string;
  aging: string;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AGING_BUCKETS = ['0-3 Days', '4-7 Days', '8-15 Days', '16-30 Days', '30+ Days'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Sheets and manual entry spell the same status several ways ("DELIVERED", "In Transit", "IN TRANSIT"). */
function normalizeStatus(raw: string | null, poStatus: string): string {
  const s = (raw ?? '').trim();
  if (s) {
    const up = s.toUpperCase();
    const known: Record<string, string> = {
      DELIVERED: 'Delivered',
      'IN TRANSIT': 'In Transit',
      INTRANSIT: 'In Transit',
      RTO: 'RTO',
      'NEED TO MARK RTO': 'Need to Mark RTO',
      RETURNED: 'Returned',
      CANCELLED: 'Cancelled',
      CANCELED: 'Cancelled',
      INVOICED: 'Invoiced',
      DISPATCHED: 'Dispatched',
    };
    return known[up] ?? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  if (['DELIVERED', 'GRN_PENDING', 'RECONCILED', 'CLOSED'].includes(poStatus)) return 'Delivered';
  if (poStatus === 'IN_TRANSIT') return 'In Transit';
  if (poStatus === 'RETURNED') return 'Returned';
  if (poStatus === 'CANCELLED') return 'Cancelled';
  return 'Dispatched';
}

function normalizePartner(raw: string | null): string {
  const s = (raw ?? '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Not assigned';
}

function fyStartYear(d: Date): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

@Injectable()
export class DispatchDashboardService {
  constructor(
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
  ) {}

  async getDashboard(filters: DispatchDashboardFilters) {
    const now = new Date();
    const fy = filters.fy && !Number.isNaN(filters.fy) ? Number(filters.fy) : fyStartYear(now);
    const start = new Date(fy, 3, 1); // 1 Apr
    const end = new Date(fy + 1, 3, 1); // 1 Apr next year

    const raw = await this.poRepository
      .createQueryBuilder('po')
      .innerJoin(DispatchEntity, 'dsp', 'dsp.poId = po.id')
      .leftJoin(GRNTrackerEntity, 'g', 'g.poId = po.id')
      .select('po.id', 'id')
      .addSelect('po.poNumber', 'poNumber')
      .addSelect('po.channelId', 'channel')
      .addSelect('po.location', 'location')
      .addSelect('po.status', 'poStatus')
      .addSelect('dsp.actualDispatchDate', 'dispatchDate')
      .addSelect('dsp.invoiceNumber', 'invoiceNumber')
      .addSelect('dsp.invoiceValue', 'invoiceValue')
      .addSelect('dsp.awbNumber', 'awb')
      .addSelect('dsp.transporterId', 'partner')
      .addSelect('dsp.dispatchStatus', 'dispatchStatus')
      .addSelect('g.grnDate', 'grnDate')
      .addSelect('g.outcome', 'grnOutcome')
      .where('po.isDeleted = false')
      .andWhere('dsp.actualDispatchDate IS NOT NULL')
      .andWhere('dsp.actualDispatchDate >= :start AND dsp.actualDispatchDate < :end', { start, end })
      .getRawMany();

    // FY options: from the earliest dispatch year to the current FY.
    const earliest = await this.poRepository
      .createQueryBuilder('po')
      .innerJoin(DispatchEntity, 'dsp', 'dsp.poId = po.id')
      .select('MIN(dsp.actualDispatchDate)', 'min')
      .where('po.isDeleted = false')
      .getRawOne();
    const firstFy = earliest?.min ? fyStartYear(new Date(earliest.min)) : fyStartYear(now);
    const fyOptions: number[] = [];
    for (let y = fyStartYear(now); y >= Math.min(firstFy, fyStartYear(now)); y--) fyOptions.push(y);

    const rows: Row[] = raw.map((r) => {
      // Dates read from Google-exported sheets can sit 10s before midnight;
      // snap to the minute so a 1 May date never lands in April.
      const dispatchDate = new Date(Math.round(new Date(r.dispatchDate).getTime() / 60000) * 60000);
      const status = normalizeStatus(r.dispatchStatus, r.poStatus);
      const open = !['Delivered', 'RTO', 'Need to Mark RTO', 'Returned', 'Cancelled'].includes(status);
      let aging = 'Delivered / No Aging';
      if (status !== 'Delivered') aging = 'RTO / Cancelled';
      if (open) {
        const days = Math.max(0, Math.floor((now.getTime() - dispatchDate.getTime()) / DAY_MS));
        aging = days <= 3 ? '0-3 Days' : days <= 7 ? '4-7 Days' : days <= 15 ? '8-15 Days' : days <= 30 ? '16-30 Days' : '30+ Days';
      }
      return {
        id: r.id,
        poNumber: r.poNumber,
        channel: r.channel || 'Unknown',
        location: r.location || '-',
        dispatchDate,
        invoiceNumber: r.invoiceNumber || null,
        invoiceValue: Number(r.invoiceValue) || 0,
        awb: r.awb || null,
        partner: normalizePartner(r.partner),
        status,
        grnDone: !!r.grnDate,
        grnOutcome: r.grnOutcome || null,
        monthKey: `${dispatchDate.getFullYear()}-${String(dispatchDate.getMonth() + 1).padStart(2, '0')}`,
        aging,
      };
    });

    // "Safexpress" / "SAfexpress" / "safexpress" are one partner: group
    // case-insensitively and show the most common spelling.
    const spellings = new Map<string, Map<string, number>>();
    rows.forEach((r) => {
      const k = r.partner.toLowerCase();
      const m = spellings.get(k) ?? new Map<string, number>();
      m.set(r.partner, (m.get(r.partner) ?? 0) + 1);
      spellings.set(k, m);
    });
    rows.forEach((r) => {
      const best = [...spellings.get(r.partner.toLowerCase())!.entries()].sort((a, b) => b[1] - a[1])[0][0];
      r.partner = best;
    });

    // Cross-filtering: every visual respects every active filter EXCEPT its
    // own dimension, so clicking a slice narrows the others without making
    // the chart you clicked collapse to a single bar.
    type Dim = 'channel' | 'month' | 'status' | 'partner' | 'aging';
    const active: Record<Dim, string | undefined> = {
      channel: filters.channel || undefined,
      month: filters.month || undefined,
      status: filters.status || undefined,
      partner: filters.partner || undefined,
      aging: filters.aging || undefined,
    };
    const pick = (r: Row): Record<Dim, string> => ({ channel: r.channel, month: r.monthKey, status: r.status, partner: r.partner, aging: r.aging });
    const filtered = (except?: Dim) =>
      rows.filter((r) => {
        const v = pick(r);
        return (Object.keys(active) as Dim[]).every((d) => d === except || !active[d] || v[d] === active[d]);
      });
    const countBy = (list: Row[], key: (r: Row) => string) => {
      const m = new Map<string, number>();
      list.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
      return m;
    };

    const main = filtered();
    const kpis = {
      totalPOs: main.length,
      delivered: main.filter((r) => r.status === 'Delivered').length,
      inTransit: main.filter((r) => r.status === 'In Transit').length,
      grnDone: main.filter((r) => r.grnDone).length,
      grnPending: main.filter((r) => r.status === 'Delivered' && !r.grnDone).length,
      totalInvoiceValue: main.reduce((s, r) => s + r.invoiceValue, 0),
    };

    const sortedCounts = (m: Map<string, number>) => [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    // Month order follows the financial year: Apr..Mar.
    const monthsInFy = Array.from({ length: 12 }, (_, i) => {
      const m = (3 + i) % 12;
      const y = m >= 3 ? fy : fy + 1;
      return { value: `${y}-${String(m + 1).padStart(2, '0')}`, label: MONTH_LABELS[m] };
    });
    const monthRows = filtered('month');
    const byMonth = monthsInFy.map((mo) => {
      const inMonth = monthRows.filter((r) => r.monthKey === mo.value);
      return { ...mo, count: inMonth.length, invoiceValue: inMonth.reduce((s, r) => s + r.invoiceValue, 0) };
    });

    const agingCounts = countBy(filtered('aging'), (r) => r.aging);
    const agingOrder = ['Delivered / No Aging', ...AGING_BUCKETS.slice().reverse(), 'RTO / Cancelled'];
    const byAging = agingOrder.filter((b) => agingCounts.has(b)).map((name) => ({ name, count: agingCounts.get(name)! }));

    const slicerOptions = (dim: Dim, list: Row[]) => sortedCounts(countBy(list, (r) => pick(r)[dim])).sort((a, b) => a.name.localeCompare(b.name));

    const table = main
      .slice()
      .sort((a, b) => b.dispatchDate.getTime() - a.dispatchDate.getTime())
      .slice(0, 300)
      .map((r) => ({
        id: r.id,
        poNumber: r.poNumber,
        location: r.location,
        channel: r.channel,
        dispatchDate: r.dispatchDate,
        invoiceNumber: r.invoiceNumber,
        invoiceValue: r.invoiceValue,
        partner: r.partner,
        awb: r.awb,
        status: r.status,
        grn: r.grnDone ? (r.grnOutcome ?? 'Done') : r.status === 'Delivered' ? 'Pending' : '-',
      }));

    return {
      fy,
      fyLabel: `FY ${fy}-${fy + 1}`,
      fyOptions,
      kpis,
      slicers: {
        channels: slicerOptions('channel', filtered('channel')),
        months: monthsInFy
          .map((mo) => ({ value: mo.value, label: mo.label, count: monthRows.filter((r) => r.monthKey === mo.value).length }))
          .filter((mo) => mo.count > 0),
        statuses: slicerOptions('status', filtered('status')),
      },
      byPartner: sortedCounts(countBy(filtered('partner'), (r) => r.partner)),
      byAging,
      byMonth,
      table: { total: main.length, rows: table },
    };
  }
}
