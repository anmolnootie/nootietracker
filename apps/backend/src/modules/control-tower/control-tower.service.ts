import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FulfilmentDecision, NonFulfilmentReason, NON_FULFILMENT_REASON_LABELS, POStatus } from '@po-control-tower/shared';
import { POMasterEntity } from '../../database/entities/po-master.entity';
import { POLineItemEntity } from '../../database/entities/po-line-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DispatchEntity } from '../../database/entities/dispatch.entity';
import { LogisticsTrackerEntity } from '../../database/entities/logistics-tracker.entity';
import { GRNTrackerEntity } from '../../database/entities/grn-tracker.entity';
import { ReturnTrackerEntity } from '../../database/entities/return-tracker.entity';
import { SheetTrackerRowEntity } from '../../database/entities/sheet-tracker-row.entity';
import { SheetTrackerUploadBatchEntity } from '../../database/entities/sheet-tracker-upload-batch.entity';
import { InvoiceImportRowEntity } from '../../database/entities/invoice-import-row.entity';
import { ConfigService } from '../config/config.service';
import {
  aggregate, CtInvoice, CtPo, CtTracking, Derived, deriveAll, FLAGS, GAPS, inPeriod, journey, journeyOf, normChan, normPlat,
  PLATS, SlaConfig, STAGES,
} from './control-tower.core';

/** Calendar day in IST for a stored timestamp - vendor data is IST (see CLAUDE.md "Timezone handling"). */
export function istDay(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const t = new Date(d);
  if (isNaN(t.getTime())) return null;
  return new Date(t.getTime() + 330 * 60000).toISOString().slice(0, 10);
}
const num = (v: unknown): number | null => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
const titleStatus = (s: string | null | undefined): string => {
  const t = String(s || '').trim();
  if (!t) return '';
  const st = t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return st === 'Rto' ? 'RTO' : st;
};
const GRN_DONE = ['done', 'completed', 'complete', 'received', 'closed'];
const GRN_PENDING = ['pending', 'partial', 'not updated'];

export interface RegisterFilter {
  from?: string; to?: string; platform?: string; gap?: string; stage?: number; flag?: number; q?: string; openOnly?: boolean;
}

interface Snapshot {
  asof: string;
  cfg: SlaConfig;
  rows: Derived[];
  builtAt: number;
}

@Injectable()
export class ControlTowerService {
  private cache: Snapshot | null = null;
  private building: Promise<Snapshot> | null = null;
  private static readonly TTL_MS = 30_000;

  constructor(
    @InjectRepository(POMasterEntity) private readonly poRepo: Repository<POMasterEntity>,
    @InjectRepository(POLineItemEntity) private readonly lineRepo: Repository<POLineItemEntity>,
    @InjectRepository(AppointmentEntity) private readonly apptRepo: Repository<AppointmentEntity>,
    @InjectRepository(DispatchEntity) private readonly dispatchRepo: Repository<DispatchEntity>,
    @InjectRepository(LogisticsTrackerEntity) private readonly logisticsRepo: Repository<LogisticsTrackerEntity>,
    @InjectRepository(GRNTrackerEntity) private readonly grnRepo: Repository<GRNTrackerEntity>,
    @InjectRepository(ReturnTrackerEntity) private readonly returnRepo: Repository<ReturnTrackerEntity>,
    @InjectRepository(SheetTrackerRowEntity) private readonly sheetRowRepo: Repository<SheetTrackerRowEntity>,
    @InjectRepository(SheetTrackerUploadBatchEntity) private readonly sheetBatchRepo: Repository<SheetTrackerUploadBatchEntity>,
    @InjectRepository(InvoiceImportRowEntity) private readonly invoiceRowRepo: Repository<InvoiceImportRowEntity>,
    private readonly config: ConfigService,
  ) {}

  /** Drop the cached snapshot after any write that changes a PO's tracking/issues. */
  invalidate(): void {
    this.cache = null;
  }

  /** Extension points filled in by later steps (team tracking fields, open issues). */
  protected async loadTracking(_poIds: string[]): Promise<Record<string, CtTracking>> {
    return {};
  }
  protected async loadOpenIssues(): Promise<{ po: string; status: string }[]> {
    return [];
  }

  async snapshot(): Promise<Snapshot> {
    if (this.cache && Date.now() - this.cache.builtAt < ControlTowerService.TTL_MS) return this.cache;
    if (!this.building) {
      this.building = this.build().then((s) => { this.cache = s; return s; }).finally(() => { this.building = null; });
    }
    return this.building;
  }

  private async build(): Promise<Snapshot> {
    const asof = istDay(new Date())!;
    const cfg = await this.config.getControlTowerSla();
    const pos = await this.poRepo.find({ where: { isDeleted: false } });
    const ids = pos.map((p) => p.id);
    const byId = new Map(pos.map((p) => [p.id, p]));

    const [qtyRows, appts, dispatches, logistics, grns, returns] = await Promise.all([
      this.lineRepo.createQueryBuilder('l').select('l."poId"', 'poId').addSelect('SUM(l.quantity)', 'qty').groupBy('l."poId"').getRawMany(),
      this.apptRepo.find(),
      this.dispatchRepo.find(),
      this.logisticsRepo.find(),
      this.grnRepo.find(),
      this.returnRepo.find(),
    ]);
    const qty = new Map<string, number>(qtyRows.map((r) => [r.poId, Number(r.qty)]));
    const apptBy = new Map(appts.map((a) => [a.poId, a]));
    const dispBy = new Map(dispatches.map((d) => [d.poId, d]));
    const logBy = new Map(logistics.map((l) => [l.poId, l]));
    const grnBy = new Map(grns.map((g) => [g.poId, g]));
    const rtoPo = new Set(returns.filter((r) => r.returnType === 'RECALL_NOT_DELIVERED').map((r) => r.poId));

    const invoices = await this.buildInvoices(byId, dispBy, logBy, grnBy, rtoPo);
    const hasInv = new Set(invoices.map((i) => i.po));

    const P: CtPo[] = pos.map((p) => {
      let amt = num(p.poValue);
      if (amt != null && amt > 5e6) amt = null; // core.js: a "value" this large is a mistyped PO number
      return {
        id: p.id,
        po: p.poNumber,
        plat: normChan(p.channelId) || 'Other',
        date: istDay(p.poDate),
        exp: istDay(p.poExpiryDate),
        loc: p.location || '',
        qty: qty.get(p.id) ?? null,
        amt,
        ...this.decisionOf(p, hasInv.has(p.poNumber), apptBy.get(p.id), dispBy.get(p.id)),
        rem: p.remarks || '',
        src: p.sourceType === 'BULK_IMPORT' ? 'Bulk import' : 'Manual',
      };
    });

    const trk = await this.loadTracking(ids);
    const issues = await this.loadOpenIssues();
    const rows = deriveAll(P, invoices, trk, issues, cfg, asof);
    return { asof, cfg, rows, builtAt: Date.now() };
  }

  /**
   * Decision as the artifact's buildPOs() infers it, from this app's fields:
   * any invoice = Accepted; a recorded non-fulfilment or a cancelled PO =
   * Declined/Cancelled/Expired; a booked appointment or dispatch signal =
   * Accepted; else Pending. A team-set decision (tracking) overrides this in derive().
   */
  private decisionOf(p: POMasterEntity, invoiced: boolean, appt?: AppointmentEntity, disp?: DispatchEntity): { dec: string; reason: string } {
    if (invoiced) return { dec: 'Accepted', reason: '' };
    if (p.fulfilmentDecision === FulfilmentDecision.NOT_FULFILLED || p.status === POStatus.CANCELLED) {
      const r = p.nonFulfilmentReason as NonFulfilmentReason | null;
      const label = r ? NON_FULFILMENT_REASON_LABELS[r] : p.status === POStatus.CANCELLED ? 'Cancelled (reason not recorded)' : '';
      if (r === NonFulfilmentReason.PO_EXPIRED) return { dec: 'Expired', reason: label };
      if (r === NonFulfilmentReason.PO_CANCELLED || r === NonFulfilmentReason.DUPLICATE_PO || p.status === POStatus.CANCELLED) {
        return { dec: 'Cancelled', reason: label };
      }
      return { dec: 'Declined', reason: label };
    }
    if (appt?.confirmedAt || appt?.appointmentDate || disp?.dispatchStatus) return { dec: 'Accepted', reason: '' };
    return { dec: 'Pending', reason: '' };
  }

  /**
   * Every invoice of every PO (the artifact's Dispatch-sheet rows). Sources, first wins per invoice number:
   *  1. the latest completed Master Tracker sync (one row per invoice, with delivery/GRN status and losses),
   *  2. matched Invoice Bulk Upload rows not on the sheet (split POs),
   *  3. the PO's dispatch record, for a dispatched PO with no invoice row at all.
   */
  private async buildInvoices(
    byId: Map<string, POMasterEntity>,
    dispBy: Map<string, DispatchEntity>,
    logBy: Map<string, LogisticsTrackerEntity>,
    grnBy: Map<string, GRNTrackerEntity>,
    rtoPo: Set<string>,
  ): Promise<CtInvoice[]> {
    const poByNumber = new Map<string, POMasterEntity>();
    byId.forEach((p) => poByNumber.set(p.poNumber, p));
    const out: CtInvoice[] = [];
    const seen = new Set<string>();

    const grnFields = (po: POMasterEntity | undefined) => {
      const g = po ? grnBy.get(po.id) : undefined;
      return { gno: g?.grnNumber || '', gdate: istDay(g?.grnDate), gamt: num(g?.grnValue) };
    };
    const poGrnDone = (po: POMasterEntity | undefined) => {
      const g = po ? grnBy.get(po.id) : undefined;
      return !!g && !!g.outcome && g.outcome !== 'NO_GRN';
    };
    const delivDate = (po: POMasterEntity | undefined) => (po ? istDay(logBy.get(po.id)?.actualDeliveryDate) : null);

    const batch = await this.sheetBatchRepo.findOne({ where: { status: 'COMPLETED' }, order: { uploadedAt: 'DESC' } });
    if (batch) {
      const rows = await this.sheetRowRepo.find({ where: { batchId: batch.id }, order: { rowIndex: 'ASC' } });
      for (const r of rows) {
        const poNumber = String(r.poNumber || '').trim();
        if (!poNumber || !poByNumber.has(poNumber)) continue;
        const inv = String(r.invoiceNumber || '').trim();
        const key = inv ? `inv:${inv}` : `row:${r.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const po = poByNumber.get(poNumber);
        const status = titleStatus(r.deliveryStatus);
        const g = String(r.grnStatus || '').trim().toLowerCase();
        let grn: CtInvoice['grn'] = '';
        if (status === 'RTO') grn = 'NA';
        else if (GRN_DONE.includes(g)) grn = 'Done';
        else if (GRN_PENDING.includes(g)) grn = 'Pending';
        else if (g.startsWith('n/a')) grn = 'NA';
        else if (status === 'Delivered') grn = poGrnDone(po) ? 'Done' : 'Pending';
        if (grn === 'Pending' && poGrnDone(po)) grn = 'Done';
        out.push({
          po: poNumber, inv, disp: istDay(r.dispatchDate), val: num(r.invoiceValue), awb: String(r.docketAwb || '').trim(),
          partner: String(r.deliveryPartner || '').trim(), status, grn, deliv: delivDate(po),
          sq: null, sv: num(r.shortageValue), dq: null, dv: num(r.damageValue), eq: null, ev: num(r.excessValue),
          cn: String(r.creditNoteNumber || '').trim(), cnv: null, loc: r.location || '', ...grnFields(po),
        });
      }
    }

    // Status for an invoice that isn't on the sheet, from the PO's own records.
    const statusFromPo = (po: POMasterEntity): string => {
      if (rtoPo.has(po.id)) return 'RTO';
      const l = logBy.get(po.id);
      const t = titleStatus(l?.lastTrackedStatus);
      if (t) return t;
      if (l?.actualDeliveryDate) return 'Delivered';
      return 'Dispatched';
    };
    const extra = (po: POMasterEntity, inv: string, disp: string | null, val: number | null, awb: string) => {
      const status = statusFromPo(po);
      const grn: CtInvoice['grn'] = status === 'RTO' ? 'NA' : poGrnDone(po) ? 'Done' : status === 'Delivered' ? 'Pending' : '';
      out.push({
        po: po.poNumber, inv, disp, val, awb, partner: '', status, grn, deliv: delivDate(po),
        sq: null, sv: null, dq: null, dv: null, eq: null, ev: null, cn: '', cnv: null, ...grnFields(po),
      });
    };

    const invRows = await this.invoiceRowRepo.find({ where: { matchStatus: 'MATCHED' }, order: { createdAt: 'DESC' } });
    for (const r of invRows) {
      const inv = String(r.invoiceNumber || '').trim();
      const po = r.matchedPoId ? byId.get(r.matchedPoId) : undefined;
      if (!inv || !po || seen.has(`inv:${inv}`)) continue;
      seen.add(`inv:${inv}`);
      extra(po, inv, istDay(r.invoiceDate), num(r.invoiceValue), String(r.awbNumber || '').trim());
    }

    const invoicedPos = new Set(out.map((i) => i.po));
    dispBy.forEach((d, poId) => {
      const po = byId.get(poId);
      if (!po || invoicedPos.has(po.poNumber)) return;
      if (!d.invoiceNumber && !d.actualDispatchDate) return;
      if (d.invoiceNumber && seen.has(`inv:${d.invoiceNumber}`)) return;
      extra(po, d.invoiceNumber || '', istDay(d.actualDispatchDate || d.invoiceDate), num(d.invoiceValue), d.awbNumber || d.docketNumber || '');
    });
    return out;
  }

  /* ---------- queries ---------- */

  private scoped(s: Snapshot, f: RegisterFilter): Derived[] {
    const range = f.from || f.to ? { from: f.from || '2000-01-01', to: f.to || s.asof } : null;
    const plat = f.platform && f.platform !== 'ALL' ? f.platform : null;
    return s.rows.filter((d) => inPeriod(d, range) && (!plat || d.plat === plat));
  }

  async summary(f: RegisterFilter) {
    const s = await this.snapshot();
    const R = this.scoped(s, f);
    const a = aggregate(R);
    const platforms = PLATS.map((p) => {
      const rows = this.scoped(s, { ...f, platform: p });
      const ag = aggregate(rows);
      return { platform: p, n: ag.n, value: ag.value, open: ag.stage[1].n + ag.stage[2].n + ag.stage[3].n + ag.stage[4].n, flags: ag.flags, expiring: ag.expiring };
    }).filter((x) => x.n > 0);
    return {
      asof: s.asof, from: f.from || null, to: f.to || null, platform: f.platform || 'ALL', cfg: s.cfg,
      aggregate: a,
      stages: STAGES.map((st) => ({ ...st, ...a.stage[st.n] })),
      flags: FLAGS.filter((x) => !!x).map((fl) => ({ ...fl!, count: a.flag[fl!.n], value: a.flagVal[fl!.n] })),
      platforms,
    };
  }

  async journey(f: RegisterFilter) {
    const s = await this.snapshot();
    const R = this.scoped(s, f);
    const { steps, side } = journey(R);
    const by = Object.fromEntries(steps.map((x) => [x.k, x]));
    const gaps = GAPS.map((g) => ({ ...g, n: by[g.from].n - by[g.to].n, v: by[g.from].v - by[g.to].v }));
    return { asof: s.asof, count: R.length, steps, gaps, side };
  }

  async register(f: RegisterFilter) {
    const s = await this.snapshot();
    let R = this.scoped(s, f);
    if (f.gap) {
      const g = GAPS.find((x) => x.k === f.gap);
      if (g) R = R.filter((d) => { const j = journeyOf(d); return j[g.from] && !j[g.to]; });
    }
    if (f.stage) R = R.filter((d) => d.stage === Number(f.stage));
    if (f.flag) R = R.filter((d) => d.pri === Number(f.flag));
    if (f.openOnly) R = R.filter((d) => d.stage <= 4);
    if (f.q) {
      const q = f.q.toLowerCase();
      R = R.filter((d) => d.po.toLowerCase().includes(q) || (d.loc || '').toLowerCase().includes(q));
    }
    return {
      asof: s.asof,
      count: R.length,
      value: R.reduce((t, d) => t + (d.value || 0), 0),
      rows: R.map((d) => this.row(d)),
    };
  }

  /** One PO's derived state plus its full invoice list - the journey drawer. */
  async po(poNumber: string) {
    const s = await this.snapshot();
    const d = s.rows.find((x) => x.po === poNumber);
    if (!d) throw new NotFoundException(`PO ${poNumber} not found`);
    return { ...this.row(d), journey: journeyOf(d), invoices: d.inv.list, stageInfo: STAGES[d.stage - 1], flagInfo: d.pri ? FLAGS[d.pri] : null };
  }

  private row(d: Derived) {
    const { inv, ...rest } = d;
    return {
      ...rest,
      plat: normPlat(d.plat),
      invCount: inv.n, invTransit: inv.transit, invDelivered: inv.deliv, invRto: inv.rto, firstDispatch: inv.first, lastDispatch: inv.last,
      stageShort: STAGES[d.stage - 1].short, flagName: d.pri ? FLAGS[d.pri]!.name : null,
    };
  }

  /** Look up PO ids by number - for callers that need to write. */
  async poIdsByNumber(numbers: string[]): Promise<Map<string, string>> {
    if (!numbers.length) return new Map();
    const rows = await this.poRepo.find({ where: { poNumber: In(numbers) }, select: ['id', 'poNumber'] });
    return new Map(rows.map((r) => [r.poNumber, r.id]));
  }
}
