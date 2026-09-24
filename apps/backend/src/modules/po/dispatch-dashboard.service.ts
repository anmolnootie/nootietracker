import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import ExcelJS from 'exceljs';

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
  fulfilmentDecision: string;
}

// The broader population behind Total POs/Dispatched/Not Fulfilled: every PO
// for the FY (by PO Date, since that's the one date every PO has), whether or
// not it's shipped yet - unlike Row above, which only ever holds POs that
// already have a real dispatch date.
interface AllPoRow {
  id: string;
  poNumber: string;
  channel: string;
  location: string;
  poDate: Date;
  dispatchDate: Date | null;
  invoiceNumber: string | null;
  invoiceValue: number;
  awb: string | null;
  partner: string;
  status: string;
  grnDone: boolean;
  grnOutcome: string | null;
  dispatched: boolean;
  fulfilmentDecision: string;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AGING_BUCKETS = ['0-3 Days', '4-7 Days', '8-15 Days', '16-30 Days', '30+ Days'];
const DAY_MS = 24 * 60 * 60 * 1000;

const TERMINAL_NEGATIVE_STATUSES = new Set(['RTO', 'Need to Mark RTO', 'Returned', 'Cancelled']);

/** Sheets and manual entry spell the same status several ways ("DELIVERED", "In Transit", "IN TRANSIT"). */
function normalizeStatus(raw: string | null, poStatus: string): string {
  const s = (raw ?? '').trim();
  let mapped: string | null = null;
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
    mapped = known[up] ?? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  // po.status RETURNED/CANCELLED is a definitive, later signal - returns
  // processing sets it but never touches dispatch.dispatchStatus, so a PO
  // returned after being marked Delivered/In Transit kept showing whatever
  // stale text was there before the return. Don't let it, UNLESS the raw
  // text already agrees (e.g. "RTO"), which carries more detail worth
  // keeping than the generic "Returned"/"Cancelled".
  if ((poStatus === 'RETURNED' || poStatus === 'CANCELLED') && !(mapped && TERMINAL_NEGATIVE_STATUSES.has(mapped))) {
    return poStatus === 'RETURNED' ? 'Returned' : 'Cancelled';
  }
  if (mapped) return mapped;
  if (['DELIVERED', 'GRN_PENDING', 'RECONCILED', 'CLOSED'].includes(poStatus)) return 'Delivered';
  if (poStatus === 'IN_TRANSIT') return 'In Transit';
  return 'Dispatched';
}

function normalizePartner(raw: string | null): string {
  const s = (raw ?? '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Not assigned';
}

// For a PO that hasn't been dispatched yet, normalizeStatus's fallback chain
// assumes a dispatch already happened (it was only ever fed rows that have
// one) - so RECEIVED/APPOINTMENT_REQUESTED/etc. would wrongly fall through to
// "Dispatched". This covers every POStatus value directly instead.
function prettifyPoStatus(poStatus: string): string {
  return poStatus
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function fyStartYear(d: Date): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

// Fixed to IST regardless of the server's own clock/timezone - see the same
// class of bug fixed in po-reports.service.ts's date formatter.
function formatIST(date: Date | null | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

const GRAND_TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

// Shared by both the dispatch-scoped (Row) and all-POs (AllPoRow) export
// paths - both carry these same fields, just with dispatchDate/partner/awb
// possibly null on the latter (a PO that hasn't shipped yet).
function toExportRow(r: {
  poNumber: string;
  location: string;
  channel: string;
  dispatchDate: Date | null;
  invoiceNumber: string | null;
  invoiceValue: number;
  partner: string;
  awb: string | null;
  status: string;
  grnDone: boolean;
  grnOutcome: string | null;
  fulfilmentDecision: string;
}) {
  return {
    poNumber: r.poNumber,
    location: r.location,
    channel: r.channel,
    dispatchDate: formatIST(r.dispatchDate),
    invoiceNumber: r.invoiceNumber || '',
    invoiceValue: r.invoiceValue,
    partner: r.partner,
    awb: r.awb || '',
    status: r.status,
    grn: r.grnDone ? (r.grnOutcome ?? 'Done') : r.status === 'Delivered' ? 'Pending' : '-',
    fulfilment: fulfilmentLabel(r.fulfilmentDecision),
    // Same flag the dashboard shows with a ⚠️ - a GRN recorded while the
    // status still isn't Delivered means the status cell is stale.
    note: r.grnDone && r.status !== 'Delivered' ? `GRN recorded but status still "${r.status}" - check the source sheet` : '',
  };
}

type Dim = 'channel' | 'month' | 'status' | 'partner' | 'aging';

const pick = (r: Row): Record<Dim, string> => ({ channel: r.channel, month: r.monthKey, status: r.status, partner: r.partner, aging: r.aging });

const activeFiltersOf = (filters: DispatchDashboardFilters): Record<Dim, string | undefined> => ({
  channel: filters.channel || undefined,
  month: filters.month || undefined,
  status: filters.status || undefined,
  partner: filters.partner || undefined,
  aging: filters.aging || undefined,
});

/** Rows passing every active filter except (optionally) one dimension - see the cross-filtering note in getDashboard. */
const rowsMatching = (rows: Row[], active: Record<Dim, string | undefined>, except?: Dim): Row[] =>
  rows.filter((r) => {
    const v = pick(r);
    return (Object.keys(active) as Dim[]).every((d) => d === except || !active[d] || v[d] === active[d]);
  });

/** The headline tiles, each of which opens the list of POs behind its number. */
export type DispatchKpi = 'totalPOs' | 'dispatched' | 'notFulfilled' | 'delivered' | 'inTransit' | 'grnDone' | 'grnPending' | 'invoiceValue';
export const DISPATCH_KPIS: DispatchKpi[] = ['totalPOs', 'dispatched', 'notFulfilled', 'delivered', 'inTransit', 'grnDone', 'grnPending', 'invoiceValue'];

type RowKpi = 'delivered' | 'inTransit' | 'grnDone' | 'grnPending' | 'invoiceValue';
type AllPoKpi = 'totalPOs' | 'dispatched' | 'notFulfilled';

function isAllPoKpi(kpi: DispatchKpi): kpi is AllPoKpi {
  return kpi === 'totalPOs' || kpi === 'dispatched' || kpi === 'notFulfilled';
}

const KPI_PREDICATES: Record<RowKpi, (r: Row) => boolean> = {
  delivered: (r) => r.status === 'Delivered',
  inTransit: (r) => r.status === 'In Transit',
  grnDone: (r) => r.grnDone,
  grnPending: (r) => r.status === 'Delivered' && !r.grnDone,
  invoiceValue: () => true,
};

// Total POs/Dispatched/Not Fulfilled only ever honour the Channel filter (see
// loadAllPOs's comment), so their list view does the same - never the
// dispatch-only dimensions (month/status/partner/aging).
const ALL_PO_PREDICATES: Record<AllPoKpi, (r: AllPoRow) => boolean> = {
  totalPOs: () => true,
  dispatched: (r) => r.dispatched,
  notFulfilled: (r) => r.fulfilmentDecision === 'NOT_FULFILLED',
};

// The list is for reading down and searching, so it isn't capped at the 300 the
// dashboard table shows - but a ceiling keeps one request bounded.
const KPI_LIST_LIMIT = 5000;

const fulfilmentLabel = (d: string) => (d === 'NOT_FULFILLED' ? 'Not Fulfilled' : 'Fulfilled');

const toTableRow = (r: Row) => ({
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
  // A GRN means the goods were physically received, so one recorded while the
  // sheet still says In Transit/Dispatched means the sheet's status cell is
  // stale, not that goods were GRN'd mid-transit - flag it for someone to fix
  // at the source rather than silently reinterpreting the status here.
  grnStatusMismatch: r.grnDone && r.status !== 'Delivered',
  fulfilment: fulfilmentLabel(r.fulfilmentDecision),
});

// Same shape as toTableRow, but for the broader all-POs population - dates
// and dispatch-only fields (partner/AWB) can genuinely be absent here.
const toAllPoTableRow = (r: AllPoRow) => ({
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
  grn: r.grnDone ? (r.grnOutcome ?? 'Done') : r.dispatched && r.status === 'Delivered' ? 'Pending' : '-',
  grnStatusMismatch: r.grnDone && r.dispatched && r.status !== 'Delivered',
  fulfilment: fulfilmentLabel(r.fulfilmentDecision),
});

@Injectable()
export class DispatchDashboardService {
  constructor(
    @InjectRepository(POMasterEntity)
    private readonly poRepository: Repository<POMasterEntity>,
  ) {}

  private resolveFy(filters: DispatchDashboardFilters, now: Date): number {
    return filters.fy && !Number.isNaN(filters.fy) ? Number(filters.fy) : fyStartYear(now);
  }

  /** Every dispatched, non-deleted PO in the financial year, normalised (status/partner spellings merged). */
  private async loadRows(fy: number, now: Date): Promise<Row[]> {
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
      .addSelect('po.fulfilmentDecision', 'fulfilmentDecision')
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
        fulfilmentDecision: r.fulfilmentDecision || 'FULFILLED',
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

    return rows;
  }

  /**
   * Every non-deleted PO for the FY, scoped by PO Date (the one date every PO
   * has, unlike a dispatch date which only exists once shipped) - the basis
   * for the Total POs / Dispatched / Not Fulfilled tiles. Deliberately
   * separate from loadRows above: every existing chart, slicer and the on-page
   * table stay exactly as they were, built only from POs that have actually
   * shipped, since aging/month-of-dispatch/delivery-partner don't mean
   * anything for one that hasn't.
   */
  private async loadAllPOs(fy: number): Promise<AllPoRow[]> {
    const start = new Date(fy, 3, 1);
    const end = new Date(fy + 1, 3, 1);

    const raw = await this.poRepository
      .createQueryBuilder('po')
      .leftJoin(DispatchEntity, 'dsp', 'dsp.poId = po.id')
      .leftJoin(GRNTrackerEntity, 'g', 'g.poId = po.id')
      .select('po.id', 'id')
      .addSelect('po.poNumber', 'poNumber')
      .addSelect('po.channelId', 'channel')
      .addSelect('po.location', 'location')
      .addSelect('po.status', 'poStatus')
      .addSelect('po.poDate', 'poDate')
      .addSelect('po.fulfilmentDecision', 'fulfilmentDecision')
      .addSelect('dsp.actualDispatchDate', 'dispatchDate')
      .addSelect('dsp.invoiceNumber', 'invoiceNumber')
      .addSelect('dsp.invoiceValue', 'invoiceValue')
      .addSelect('dsp.awbNumber', 'awb')
      .addSelect('dsp.transporterId', 'partner')
      .addSelect('dsp.dispatchStatus', 'dispatchStatus')
      .addSelect('g.grnDate', 'grnDate')
      .addSelect('g.outcome', 'grnOutcome')
      .where('po.isDeleted = false')
      .andWhere('po.poDate >= :start AND po.poDate < :end', { start, end })
      .getRawMany();

    return raw.map((r) => {
      // Same minute-snap as loadRows - Google-exported dates can sit 10s
      // before midnight.
      const dispatchDate = r.dispatchDate ? new Date(Math.round(new Date(r.dispatchDate).getTime() / 60000) * 60000) : null;
      const status = dispatchDate ? normalizeStatus(r.dispatchStatus, r.poStatus) : prettifyPoStatus(r.poStatus);
      return {
        id: r.id,
        poNumber: r.poNumber,
        channel: r.channel || 'Unknown',
        location: r.location || '-',
        poDate: new Date(r.poDate),
        dispatchDate,
        invoiceNumber: r.invoiceNumber || null,
        invoiceValue: Number(r.invoiceValue) || 0,
        awb: r.awb || null,
        partner: dispatchDate ? normalizePartner(r.partner) : '-',
        status,
        grnDone: !!r.grnDate,
        grnOutcome: r.grnOutcome || null,
        dispatched: !!dispatchDate,
        fulfilmentDecision: r.fulfilmentDecision || 'FULFILLED',
      };
    });
  }

  async getDashboard(filters: DispatchDashboardFilters) {
    const now = new Date();
    const fy = this.resolveFy(filters, now);
    const rows = await this.loadRows(fy, now);

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

    // Cross-filtering: every visual respects every active filter EXCEPT its
    // own dimension, so clicking a slice narrows the others without making
    // the chart you clicked collapse to a single bar.
    const active = activeFiltersOf(filters);
    const filtered = (except?: Dim) => rowsMatching(rows, active, except);
    const countBy = (list: Row[], key: (r: Row) => string) => {
      const m = new Map<string, number>();
      list.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
      return m;
    };

    const main = filtered();

    // Total POs/Dispatched/Not Fulfilled come from the broader all-POs
    // population (every PO for the FY, dispatched or not) - only the Channel
    // filter applies to it, since Month/Status/Partner/Aging are dimensions
    // of a dispatch that may not exist yet for every one of these POs.
    const allPOs = await this.loadAllPOs(fy);
    const allFiltered = active.channel ? allPOs.filter((r) => r.channel === active.channel) : allPOs;

    const kpis = {
      totalPOs: allFiltered.length,
      dispatched: allFiltered.filter((r) => r.dispatched).length,
      notFulfilled: allFiltered.filter((r) => r.fulfilmentDecision === 'NOT_FULFILLED').length,
      delivered: main.filter(KPI_PREDICATES.delivered).length,
      inTransit: main.filter(KPI_PREDICATES.inTransit).length,
      grnDone: main.filter(KPI_PREDICATES.grnDone).length,
      grnPending: main.filter(KPI_PREDICATES.grnPending).length,
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
      .map(toTableRow);

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

  /**
   * Every PO behind one headline tile, for the list that opens when it's clicked.
   * Honours the same active filters as the tiles (so the list always matches the
   * number that was clicked) and, unlike the dashboard table, isn't cut at 300.
   */
  async getKpiList(filters: DispatchDashboardFilters, kpi: DispatchKpi) {
    const now = new Date();
    const fy = this.resolveFy(filters, now);

    if (isAllPoKpi(kpi)) {
      const allPOs = await this.loadAllPOs(fy);
      const matching = (filters.channel ? allPOs.filter((r) => r.channel === filters.channel) : allPOs).filter(ALL_PO_PREDICATES[kpi]);
      // Undispatched POs sort by PO Date (no dispatch date to sort by); dispatched ones still go newest-first.
      matching.sort((a, b) => (b.dispatchDate ?? b.poDate).getTime() - (a.dispatchDate ?? a.poDate).getTime());
      return {
        fy,
        fyLabel: `FY ${fy}-${fy + 1}`,
        kpi,
        total: matching.length,
        invoiceValue: matching.reduce((sum, r) => sum + r.invoiceValue, 0),
        truncated: matching.length > KPI_LIST_LIMIT,
        rows: matching.slice(0, KPI_LIST_LIMIT).map(toAllPoTableRow),
      };
    }

    const rows = await this.loadRows(fy, now);
    const matching = rowsMatching(rows, activeFiltersOf(filters)).filter(KPI_PREDICATES[kpi]);
    // "Total Invoice Value" reads best biggest-first; everything else newest-dispatched-first.
    matching.sort((a, b) => (kpi === 'invoiceValue' ? b.invoiceValue - a.invoiceValue : 0) || b.dispatchDate.getTime() - a.dispatchDate.getTime());

    return {
      fy,
      fyLabel: `FY ${fy}-${fy + 1}`,
      kpi,
      total: matching.length,
      invoiceValue: matching.reduce((sum, r) => sum + r.invoiceValue, 0),
      truncated: matching.length > KPI_LIST_LIMIT,
      rows: matching.slice(0, KPI_LIST_LIMIT).map(toTableRow),
    };
  }

  /**
   * The same PO list as getKpiList, as a downloadable .xlsx - the "Download
   * Excel" button on each dashboard tile's list. Not capped at KPI_LIST_LIMIT:
   * a spreadsheet has no reason to stop at 5,000 rows the way an on-page list
   * does, so this exports every matching PO.
   */
  async buildKpiListWorkbook(filters: DispatchDashboardFilters, kpi: DispatchKpi): Promise<Buffer> {
    const now = new Date();
    const fy = this.resolveFy(filters, now);

    let exportRows: ReturnType<typeof toExportRow>[];
    if (isAllPoKpi(kpi)) {
      const allPOs = await this.loadAllPOs(fy);
      const matching = (filters.channel ? allPOs.filter((r) => r.channel === filters.channel) : allPOs).filter(ALL_PO_PREDICATES[kpi]);
      matching.sort((a, b) => (b.dispatchDate ?? b.poDate).getTime() - (a.dispatchDate ?? a.poDate).getTime());
      exportRows = matching.map(toExportRow);
    } else {
      const rows = await this.loadRows(fy, now);
      const matching = rowsMatching(rows, activeFiltersOf(filters)).filter(KPI_PREDICATES[kpi]);
      matching.sort((a, b) => (kpi === 'invoiceValue' ? b.invoiceValue - a.invoiceValue : 0) || b.dispatchDate.getTime() - a.dispatchDate.getTime());
      exportRows = matching.map(toExportRow);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('POs');
    sheet.columns = [
      { header: 'PO Number', key: 'poNumber', width: 18 },
      { header: 'Location/Hub', key: 'location', width: 28 },
      { header: 'Channel', key: 'channel', width: 14 },
      { header: 'Dispatched', key: 'dispatchDate', width: 14 },
      { header: 'Invoice No.', key: 'invoiceNumber', width: 18 },
      { header: 'Invoice Value', key: 'invoiceValue', width: 16 },
      { header: 'Delivery Partner', key: 'partner', width: 18 },
      { header: 'AWB', key: 'awb', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'GRN', key: 'grn', width: 12 },
      { header: 'Fulfilment', key: 'fulfilment', width: 14 },
      { header: 'Note', key: 'note', width: 40 },
    ];
    sheet.getRow(1).font = { bold: true };

    let totalInvoiceValue = 0;
    for (const r of exportRows) {
      totalInvoiceValue += r.invoiceValue;
      sheet.addRow(r);
    }

    const totalRow = sheet.addRow({ poNumber: 'Grand Total', location: '', channel: '', dispatchDate: '', invoiceNumber: '', invoiceValue: totalInvoiceValue, partner: '', awb: '', status: '', grn: '', fulfilment: '', note: '' });
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => (cell.fill = GRAND_TOTAL_FILL));

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
