/**
 * Control Tower business logic, ported line-for-line from the "PO Control
 * Tower" artifact's reference/core.js (docs/control-tower/reference on the
 * docs/control-tower-spec branch). Pure functions, no DB or Nest - keep it that
 * way so the unit tests can exercise it directly.
 *
 * Preserve exactly: stage numbers 1-9, flag priority order 1-10 (first match
 * wins), and journeyOf()'s "a later step implies the earlier ones" rule.
 * All dates are ISO calendar-day strings ('YYYY-MM-DD', IST) - diff() counts
 * whole days.
 */

export const PLATS = ['Blinkit', 'Zepto', 'Swiggy Instamart', 'BigBasket', 'Flipkart', 'Amazon', 'Supertails', 'FirstClub', 'Tata 1mg', 'Other'];
export const DECISIONS = ['Pending', 'Accepted', 'Declined', 'Cancelled', 'Expired'] as const;
export const REASONS = ['Low value', 'Expiry too close', 'Stock not available', 'Out of service area', 'Price mismatch', 'PO mapped / merged', 'Auto-cancelled by platform', 'Cancelled (reason not recorded)', 'Other'];
export const ISSUE_TYPES = ['Missing in warehouse', 'PO printout missing', 'Expiry risk', 'Shortage / damage claim', 'RTO / credit note', 'GRN delay', 'Appointment / reschedule', 'Platform cancellation', 'Price / data mismatch', 'Other'];
export const ISSUE_STATUS = ['Open', 'In progress', 'Waiting on platform', 'Resolved'];
export const PRIORITIES = ['High', 'Medium', 'Low'];

export const STAGES = [
  { n: 1, name: 'Received, decision pending', short: 'Decision pending' },
  { n: 2, name: 'Accepted, handover pending', short: 'Handover pending' },
  { n: 3, name: 'Handed to warehouse, ack pending', short: 'Ack pending' },
  { n: 4, name: 'In warehouse, pending dispatch', short: 'In warehouse' },
  { n: 5, name: 'In transit', short: 'In transit' },
  { n: 6, name: 'Delivered, GRN pending', short: 'GRN pending' },
  { n: 7, name: 'RTO / returned', short: 'RTO' },
  { n: 8, name: 'Closed, delivered and GRN done', short: 'Closed' },
  { n: 9, name: 'Closed, not fulfilled', short: 'Not fulfilled' },
];

export const FLAGS = [
  null,
  { n: 1, name: 'Expired, not dispatched', team: 'Order desk', tone: 'crit', act: 'Dispatch now or ask the platform for an expiry extension' },
  { n: 2, name: 'Expiring soon', team: 'Order desk', tone: 'crit', act: 'Prioritise dispatch and book the appointment now' },
  { n: 3, name: 'Printout not handed to warehouse', team: 'Order desk', tone: 'warn', act: 'Find the printout, hand it to the warehouse, log the date' },
  { n: 4, name: 'Warehouse has not acknowledged', team: 'Warehouse', tone: 'warn', act: 'Warehouse to acknowledge receipt of the PO printout' },
  { n: 5, name: 'In warehouse, not dispatched', team: 'Warehouse', tone: 'warn', act: 'Pick, pack and dispatch; log the invoice' },
  { n: 6, name: 'In transit overdue', team: 'Logistics', tone: 'warn', act: 'Chase the courier and update delivery status' },
  { n: 7, name: 'No decision', team: 'Order desk', tone: 'info', act: 'Decide Accept or Decline and record the reason' },
  { n: 8, name: 'GRN pending', team: 'Accounts', tone: 'info', act: 'Chase GRN from the platform' },
  { n: 9, name: 'Credit note pending', team: 'Accounts', tone: 'info', act: 'Raise or chase the credit note' },
  { n: 10, name: 'Unaccounted, legacy', team: 'Order desk', tone: 'mute', act: 'Backlog: confirm if declined, expired or lost, then set Decision' },
];

export interface SlaConfig {
  sla_decision: number;
  sla_handover: number;
  sla_ack: number;
  sla_dispatch: number;
  expiry_warn: number;
  sla_transit: number;
  sla_grn: number;
  legacy_days: number;
  cn_days: number;
}
export const DEFAULT_CFG: SlaConfig = { sla_decision: 1, sla_handover: 1, sla_ack: 1, sla_dispatch: 3, expiry_warn: 3, sla_transit: 7, sla_grn: 7, legacy_days: 30, cn_days: 60 };
export const SLA_KEYS = Object.keys(DEFAULT_CFG) as (keyof SlaConfig)[];

export const JSTEPS = [
  { k: 'recv', name: 'PO received', hint: 'Every PO that reached us' },
  { k: 'acc', name: 'Accepted', hint: 'Order desk said yes' },
  { k: 'hand', name: 'Printout handed to warehouse', hint: 'Printout given to a person' },
  { k: 'ack', name: 'Warehouse acknowledged', hint: 'Warehouse confirmed it holds it' },
  { k: 'inv', name: 'Invoiced', hint: 'Invoice raised' },
  { k: 'disp', name: 'Dispatched', hint: 'Left with a courier or own vehicle' },
  { k: 'deliv', name: 'Delivered', hint: 'Reached the platform warehouse' },
  { k: 'grn', name: 'GRN done', hint: 'Platform confirmed receipt' },
] as const;
export type JStepKey = (typeof JSTEPS)[number]['k'];

/* ---------- date helpers (ISO day strings) ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
export function dayNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const p = s.split('-').map(Number);
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5);
}
export function diff(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = dayNum(a), y = dayNum(b);
  return x == null || y == null ? null : x - y;
}
export function addDays(s: string, n: number): string {
  const t = new Date((dayNum(s)! + n) * 864e5);
  return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
}

const CH: Record<string, string> = {
  blinkit: 'Blinkit', zepto: 'Zepto', swiggy: 'Swiggy Instamart', 'swiggy instamart': 'Swiggy Instamart', instamart: 'Swiggy Instamart',
  'big basket': 'BigBasket', bigbasket: 'BigBasket', supertails: 'Supertails', 'super tails': 'Supertails', flipkart: 'Flipkart',
  etrade: 'Amazon', 'e-trade': 'Amazon', 'e trade': 'Amazon', firstclub: 'FirstClub', amazon: 'Amazon', 'amazon india': 'Amazon',
  'tata 1mg': 'Tata 1mg', tata1mg: 'Tata 1mg', '1mg': 'Tata 1mg', 'first club': 'FirstClub', other: 'Other',
};
/** core.js normChan, plus 'instamart' (this app stores Swiggy POs as channel "Instamart"). */
export function normChan(x: unknown): string {
  const k = String(x || '').trim().toLowerCase();
  if (CH[k]) return CH[k];
  return k ? 'Other' : '';
}
export function normPlat(x: unknown): string {
  const k = String(x || '').trim().toLowerCase();
  return k === 'etrade' || k === 'e-trade' || k === 'e trade' ? 'Amazon' : (x as string) || 'Other';
}

/* ---------- input shapes ---------- */
export interface CtPo {
  po: string;
  plat: string;
  date: string | null;
  exp: string | null;
  loc: string;
  qty: number | null;
  amt: number | null;
  dec: string;
  reason: string;
  rem: string;
  src: string;
  /** Not in core.js: carried through so the API can link back to the PO screen. */
  id?: string;
}
export interface CtInvoice {
  po: string;
  inv: string;
  disp: string | null;
  val: number | null;
  awb: string;
  partner: string;
  status: string;
  grn: '' | 'Done' | 'Pending' | 'NA';
  deliv: string | null;
  sq: number | null; sv: number | null;
  dq: number | null; dv: number | null;
  eq: number | null; ev: number | null;
  cn: string; cnv: number | null;
  gno: string; gdate: string | null; gamt: number | null;
  loc?: string;
  expiry?: string | null;
  comment?: string;
}
export interface CtTracking {
  dec?: string; reason?: string; handed?: string | null; handedTo?: string; ack?: string | null; ackBy?: string;
  owner?: string; rem?: string; ewb?: string; printout?: string | null;
}
export interface InvAgg {
  n: number; val: number; first: string | null; last: string | null; transit: number; deliv: number; rto: number;
  grnP: number; loss: number; cnP: number; list: CtInvoice[];
}
const emptyAgg = (): InvAgg => ({ n: 0, val: 0, first: null, last: null, transit: 0, deliv: 0, rto: 0, grnP: 0, loss: 0, cnP: 0, list: [] });

/* ---------- derived state ---------- */
export function indexInvoices(I: CtInvoice[], cfg: SlaConfig, asof: string): Map<string, InvAgg> {
  const m = new Map<string, InvAgg>();
  for (const l of I) {
    let a = m.get(l.po);
    if (!a) { a = emptyAgg(); m.set(l.po, a); }
    a.n++; a.val += l.val || 0; a.list.push(l);
    if (l.disp) {
      if (!a.first || l.disp < a.first) a.first = l.disp;
      if (!a.last || l.disp > a.last) a.last = l.disp;
    }
    const s = l.status;
    if (s === 'Dispatched' || s === 'In Transit' || s === 'Arrived') a.transit++;
    else if (s === 'Delivered') a.deliv++;
    else if (s === 'RTO') a.rto++;
    if (l.grn === 'Pending') a.grnP++;
    const loss = (l.sv || 0) + (l.dv || 0);
    a.loss += loss;
    const days = l.disp ? diff(asof, l.disp) : null;
    if (!l.cn && (s === 'RTO' || loss > 0) && days != null && days <= cfg.cn_days) a.cnP++;
  }
  return m;
}

export type Derived = ReturnType<typeof derive>;

export function derive(p: CtPo, inv: InvAgg | undefined, trk: CtTracking | undefined, cfg: SlaConfig, asof: string, openIssues?: number) {
  const t = trk || {};
  const a = inv || emptyAgg();
  const dec = t.dec || p.dec || 'Pending';
  const plat = normPlat(p.plat);
  const pdt = p.date || a.first || null;
  const age = pdt ? diff(asof, pdt) : null;
  const dte = p.exp ? diff(p.exp, asof) : null;
  const K = t.handed || null, L = t.ack || null;
  let stage: number;
  if (a.n > 0) {
    if (a.transit > 0) stage = 5;
    else if (a.grnP > 0) stage = 6;
    else if (a.rto > 0 && a.deliv === 0) stage = 7;
    else stage = 8;
  } else if (dec === 'Declined' || dec === 'Cancelled' || dec === 'Expired') stage = 9;
  else if (L) stage = 4;
  else if (K) stage = 3;
  else if (dec === 'Accepted') stage = 2;
  else stage = 1;
  let pri = 0;
  const openNo = a.n === 0 && (dec === 'Pending' || dec === 'Accepted');
  if (openNo) {
    if (p.exp && dte! < 0) pri = 1;
    else if (p.exp && dte! <= cfg.expiry_warn) pri = 2;
    else if (dec === 'Accepted') {
      if (!K && age != null && age > cfg.sla_handover) pri = 3;
      else if (K && !L && diff(asof, K)! > cfg.sla_ack) pri = 4;
      else if (L && age != null && age > cfg.sla_dispatch) pri = 5;
    } else {
      if (age == null || age > cfg.legacy_days) pri = 10;
      else if (age > cfg.sla_decision) pri = 7;
    }
  } else if (a.n > 0) {
    const dl = a.last ? diff(asof, a.last)! : 0;
    if (a.transit > 0 && dl > cfg.sla_transit) pri = 6;
    else if (a.grnP > 0 && dl > cfg.sla_grn) pri = 8;
    else if (a.cnP > 0) pri = 9;
  }
  const value = p.amt != null && p.amt > 0 ? p.amt : a.val || 0;
  return {
    id: p.id, po: p.po, plat, date: pdt, orderDate: p.date, exp: p.exp, loc: p.loc, qty: p.qty, amt: p.amt, dec,
    reason: t.reason || p.reason || '', stage, pri, age, dte, inv: a, invoiced: a.val, value, openIssues: openIssues || 0,
    rem: [p.rem, t.rem].filter((x) => x).join(' | '), src: p.src,
    ewb: t.ewb || '', printout: t.printout || null, handed: K, handedTo: t.handedTo || '', ack: L, ackBy: t.ackBy || '',
    owner: t.owner || '', tracked: !!trk, fill: p.amt && p.amt > 0 ? a.val / p.amt : null,
  };
}

export function deriveAll(P: CtPo[], I: CtInvoice[], trkMap: Record<string, CtTracking>, issues: { po: string; status: string }[], cfg: SlaConfig, asof: string): Derived[] {
  const idx = indexInvoices(I, cfg, asof);
  const oi: Record<string, number> = {};
  issues.forEach((x) => { if (x.status !== 'Resolved' && x.po) oi[x.po] = (oi[x.po] || 0) + 1; });
  return P.map((p) => derive(p, idx.get(p.po), trkMap[p.po], cfg, asof, oi[p.po]));
}

export function aggregate(D: Derived[]) {
  const r = {
    n: 0, value: 0, accepted: 0, notFul: 0, undecided: 0, accNotDisp: 0, dispatched: 0, invoiced: 0, transit: 0, grnP: 0, rto: 0,
    flags: 0, expiring: 0, undecidedValue: 0, notDispValue: 0, fillNum: 0, fillDen: 0, fill: 0,
    stage: {} as Record<number, { n: number; v: number }>, flag: {} as Record<number, number>, flagVal: {} as Record<number, number>,
  };
  for (let i = 1; i <= 9; i++) r.stage[i] = { n: 0, v: 0 };
  for (let i = 1; i <= 10; i++) { r.flag[i] = 0; r.flagVal[i] = 0; }
  for (const d of D) {
    r.n++; r.value += d.amt || 0; if (d.dec === 'Accepted') r.accepted++;
    r.stage[d.stage].n++; r.stage[d.stage].v += d.amt || 0;
    if (d.stage === 9) r.notFul++;
    if (d.stage === 1) { r.undecided++; r.undecidedValue += d.amt || 0; }
    if (d.stage >= 2 && d.stage <= 4) { r.accNotDisp++; r.notDispValue += d.amt || 0; }
    if (d.inv.n > 0) { r.dispatched++; r.invoiced += d.invoiced; }
    if (d.stage === 5) r.transit++;
    if (d.stage === 6) r.grnP++;
    if (d.inv.rto > 0) r.rto++;
    if (d.pri > 0) {
      r.flags++; r.flag[d.pri]++;
      r.flagVal[d.pri] += d.pri === 6 || d.pri === 8 || d.pri === 9 ? d.invoiced : d.value || 0;
      if (d.pri <= 2) r.expiring++;
    }
    if (d.amt && d.amt > 0) { r.fillNum += d.invoiced; r.fillDen += d.amt; }
  }
  r.fill = r.fillDen ? r.fillNum / r.fillDen : 0;
  return r;
}

export type Journey = Record<JStepKey, boolean>;

/** A later step implies the earlier ones. */
export function journeyOf(d: Derived): Journey {
  const a = d.inv, n = a.n > 0;
  const grn = a.list.some((l) => l.grn === 'Done');
  const deliv = a.deliv > 0 || grn;
  const disp = n && a.list.some((l) => l.disp || l.awb);
  const ack = !!d.ack || n;
  const hand = !!d.handed || ack;
  const acc = d.dec === 'Accepted' || hand || n;
  return { recv: true, acc, hand, ack, inv: n, disp: !!disp, deliv, grn };
}

export function journey(D: Derived[]) {
  const steps = JSTEPS.map((s) => ({ k: s.k as JStepKey, name: s.name, hint: s.hint, n: 0, v: 0 }));
  const side = {
    rto: { n: 0, v: 0 }, cnRaised: { n: 0, v: 0 }, cnPending: { n: 0, v: 0 },
    short: { q: 0, v: 0 }, dmg: { q: 0, v: 0 }, exc: { q: 0, v: 0 }, ewbHave: 0, ewbNeed: 0,
    ds: {} as Record<string, { n: number; v: number }>, gs: {} as Record<string, { n: number; v: number }>,
    handExplicit: 0, declined: 0, printoutHave: 0,
  };
  for (const d of D) {
    const j = journeyOf(d);
    steps.forEach((o) => { if (j[o.k]) { o.n++; o.v += d.value || 0; } });
    if (d.stage === 9) side.declined++;
    if (d.handed) side.handExplicit++;
    if (d.printout) side.printoutHave++;
    for (const l of d.inv.list) {
      const st = l.status || '(no status)';
      side.ds[st] = side.ds[st] || { n: 0, v: 0 }; side.ds[st].n++; side.ds[st].v += l.val || 0;
      const g = l.grn || '(no GRN info)';
      side.gs[g] = side.gs[g] || { n: 0, v: 0 }; side.gs[g].n++; side.gs[g].v += l.val || 0;
      if (l.status === 'RTO') { side.rto.n++; side.rto.v += l.val || 0; }
      side.short.q += l.sq || 0; side.short.v += l.sv || 0;
      side.dmg.q += l.dq || 0; side.dmg.v += l.dv || 0;
      side.exc.q += l.eq || 0; side.exc.v += l.ev || 0;
      if (l.cn) { side.cnRaised.n++; side.cnRaised.v += l.cnv || 0; }
    }
    if (d.inv.n > 0) { side.ewbNeed++; if (d.ewb) side.ewbHave++; }
    if (d.inv.cnP > 0) { side.cnPending.n++; side.cnPending.v += d.inv.loss || 0; }
  }
  return { steps, side };
}

/** Gap pills between funnel steps: POs that reached step `from` but not step `to`. */
export const GAPS: { k: string; from: JStepKey; to: JStepKey; label: string }[] = [
  { k: 'not_accepted', from: 'recv', to: 'acc', label: 'not accepted' },
  { k: 'not_handed', from: 'acc', to: 'hand', label: 'accepted, not handed' },
  { k: 'not_acked', from: 'hand', to: 'ack', label: 'handed, not acknowledged' },
  { k: 'not_invoiced', from: 'ack', to: 'inv', label: 'acknowledged, not invoiced' },
  { k: 'not_dispatched', from: 'inv', to: 'disp', label: 'invoiced, not dispatched' },
  { k: 'not_delivered', from: 'disp', to: 'deliv', label: 'dispatched, not delivered' },
  { k: 'no_grn', from: 'deliv', to: 'grn', label: 'delivered without GRN' },
];

/* ---------- period ---------- */
export type PeriodKey = 'fy' | '90d' | '30d' | '7d' | 'month' | 'last' | 'all' | 'custom';
function monthStart(iso: string, off: number): string {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + off;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}
/** v3.js setPeriod(): resolves a chip to [from, to]; 'all' returns null (no range). */
export function periodRange(k: PeriodKey, asof: string, from?: string, to?: string): { from: string; to: string } | null {
  if (k === 'all') return null;
  if (k === 'custom') {
    let f = from || addDays(asof, -30), t = to || asof;
    if (f > t) [f, t] = [t, f];
    return { from: f, to: t };
  }
  if (k === 'last') return { from: monthStart(asof, -1), to: addDays(monthStart(asof, 0), -1) };
  const f = k === 'fy' ? '2026-04-01' : k === '90d' ? addDays(asof, -90) : k === '30d' ? addDays(asof, -30) : k === '7d' ? addDays(asof, -7) : monthStart(asof, 0);
  return { from: f, to: asof };
}
/** v3.js inP(): no range = everything; with a range, undated POs are excluded. */
export function inPeriod(d: { date: string | null }, range: { from: string; to: string } | null): boolean {
  if (!range) return true;
  return !!d.date && d.date >= range.from && d.date <= range.to;
}

/** v3.js inGap(): reached `from` but not the next step, and not closed as not fulfilled (stage 9). */
export function inGapOf(d: Derived, g: { from: JStepKey; to: JStepKey }): boolean {
  const j = journeyOf(d);
  return j[g.from] && !j[g.to] && d.stage !== 9;
}
