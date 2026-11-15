/**
 * Warehouse Master parsers - a port of the artifact's reference/core.js
 * (parseOrderBook, parseDispatch, parseTabs, buildPOs) and of the "PO Control
 * Tower: Complete System Manual" sections 4-7. Pure functions over rows of
 * DISPLAY TEXT (what Google Sheets / SheetJS `raw: false` gives), so the same
 * cleaning rules apply: PO numbers normalised, 22 channel spellings mapped,
 * money with ₹ and commas, day-first / month-first dates, duplicate Order Book
 * rows merged, values over ₹50,00,000 cleared.
 */
import { normalizePlatform } from '@po-control-tower/shared';

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
function mkIso(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
const dayNum = (s: string) => { const p = s.split('-').map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5); };
const diff = (a: string, b: string) => dayNum(a) - dayNum(b);

export function num(x: unknown): number | null {
  if (x == null) return null;
  const s = String(x).replace(/[₹,\s]/g, '');
  if (s === '' || isNaN(Number(s))) return null;
  return parseFloat(s);
}
export function normPo(x: unknown): string {
  return String(x ?? '').trim().replace(/\n/g, '').replace(/\.0$/, '').toUpperCase().replace(/\s/g, '');
}
const normChan = (x: unknown): string => normalizePlatform(x) ?? '';
const PART: Record<string, string> = {
  safexpress: 'Safexpress', 'safe express': 'Safexpress', 'self delivery': 'Self Delivery', 'self vehicle': 'Self Delivery', 'self vechile': 'Self Delivery',
  dtdc: 'DTDC', rivigo: 'Rivigo', 'om logistics': 'Om Logistics', delhivery: 'Delhivery', bluedart: 'BlueDart',
};

/** Manual §6 date reader. `ref` picks between d/m and m/d when both are valid; `pref` = 'mdy' for month-first tabs. */
export function pdate(raw: unknown, ref?: string | null, pref?: 'mdy'): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s === '(blank)' || s === '-') return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return mkIso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m && MON[m[2].toLowerCase()]) return mkIso(+m[3], MON[m[2].toLowerCase()], +m[1]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    const c: string[] = [];
    if (b <= 12 && a <= 31) { const v = mkIso(y, b, a); if (v) c.push(v); }
    if (a <= 12 && b <= 31) { const v = mkIso(y, a, b); if (v && !c.includes(v)) c.push(v); }
    if (!c.length) return null;
    if (c.length === 1) return c[0];
    if (ref) { let best = c[0], bd = 1e9; c.forEach((v) => { const d = Math.abs(diff(v, ref)); if (d < bd) { bd = d; best = v; } }); return best; }
    return pref === 'mdy' ? c[c.length - 1] : c[0];
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})$/);
  if (m && MON[m[2].toLowerCase()]) return mkIso(+m[3], MON[m[2].toLowerCase()], +m[1]);
  return null;
}
const cell = (r: unknown[] | undefined, i: number) => (r && r[i] != null ? String(r[i]) : '');

export interface ObRec { po: string; date: string | null; chan: string; qty: number | null; amt: number | null; status: string; disp: string | null; rem: string[]; n: number }
export function parseOrderBook(rows: unknown[][], asof: string): Map<string, ObRec> {
  const out = new Map<string, ObRec>();
  let ref: string | null = null;
  for (const r of rows) {
    const po = normPo(cell(r, 2));
    if (!po) continue;
    const d = pdate(cell(r, 1), ref);
    if (d && d <= asof) ref = d;
    const q = cell(r, 4), sh = cell(r, 6);
    const remark = [cell(r, 13), num(sh) == null ? sh : '', num(q) == null ? q : ''].join(' ').replace(/\s+/g, ' ').trim();
    const rec: ObRec = { po, date: d, chan: normChan(cell(r, 3)), qty: num(q), amt: num(cell(r, 5)), status: cell(r, 11).trim(), disp: pdate(cell(r, 12), ref), rem: remark ? [remark] : [], n: 1 };
    const c = out.get(po);
    if (!c) { out.set(po, rec); continue; }
    c.n++;
    (['date', 'qty', 'amt', 'disp'] as const).forEach((f) => { if (c[f] == null && rec[f] != null) (c as any)[f] = rec[f]; });
    if (!c.status && rec.status) c.status = rec.status;
    if (!c.chan && rec.chan) c.chan = rec.chan;
    if (remark) c.rem.push(remark);
  }
  return out;
}

export interface DispatchRow { po: string; inv: string; chan: string; loc: string; expiry: string | null; disp: string | null }
/** Only what PO building needs from DISPATCH + GRN; invoice details go through the sheet-tracker sync. */
export function parseDispatch(rows: unknown[][]): DispatchRow[] {
  const out: DispatchRow[] = [];
  for (const r of rows) {
    const po = normPo(cell(r, 2));
    if (!po) continue;
    out.push({ po, inv: cell(r, 3).trim(), chan: normChan(cell(r, 4)), loc: cell(r, 5).trim(), expiry: pdate(cell(r, 11)), disp: pdate(cell(r, 1)) });
  }
  return out;
}
export const partnerName = (x: string) => PART[x.trim().toLowerCase()] || x.trim();

export interface TabRec { src: string; chan: string; loc?: string; date?: string | null; expiry?: string | null; tstatus?: string; tdisp?: string; appt?: string | null; qty?: number | null; amt?: number | null }
export function parseTabs(t: { blinkit?: unknown[][]; flipkart?: unknown[][]; zepto?: unknown[][]; swiggy?: unknown[][] }): Map<string, TabRec> {
  const tabs = new Map<string, TabRec>();
  (t.blinkit || []).forEach((r) => { const po = normPo(cell(r, 0)); if (po) tabs.set(po, { src: 'Blinkit tab', chan: 'Blinkit', loc: cell(r, 1).trim(), date: pdate(cell(r, 2), null, 'mdy'), expiry: pdate(cell(r, 3), null, 'mdy'), tstatus: cell(r, 4).trim(), qty: num(cell(r, 5)), amt: num(cell(r, 7)) }); });
  (t.flipkart || []).forEach((r) => { const po = normPo(cell(r, 0)); if (po) tabs.set(po, { src: 'Flipkart tab', chan: 'Flipkart', date: pdate(cell(r, 1), null, 'mdy'), expiry: pdate(cell(r, 2), null, 'mdy'), amt: num(cell(r, 3)), qty: num(cell(r, 4)), tstatus: cell(r, 5).trim() }); });
  (t.zepto || []).forEach((r) => {
    const po = normPo(cell(r, 0)); if (!po) return;
    const rem = cell(r, 5).trim();
    tabs.set(po, { src: 'Zepto tab', chan: 'Zepto', loc: cell(r, 1).trim(), tdisp: cell(r, 2).trim(), appt: pdate(cell(r, 3)), qty: num(cell(r, 4)), expiry: /^\d/.test(rem) ? pdate(rem) : null, date: pdate(cell(r, 6)) });
  });
  (t.swiggy || []).forEach((r) => { const po = normPo(cell(r, 3)); if (po) tabs.set(po, { src: 'Swiggy tab', chan: 'Swiggy Instamart', loc: cell(r, 0).trim(), appt: pdate(cell(r, 1)), qty: num(cell(r, 2)), tstatus: cell(r, 4).trim() }); });
  return tabs;
}

export interface BuiltPo { po: string; plat: string; date: string | null; exp: string | null; loc: string; qty: number | null; amt: number | null; dec: string; reason: string; rem: string; src: string; appt: string | null }
/** Manual §7: one row per PO from Order Book + Dispatch + platform tabs, with the derived decision and the gap notes. */
export function buildPOs(ob: Map<string, ObRec>, dg: DispatchRow[], tabs: Map<string, TabRec>): BuiltPo[] {
  const byPo = new Map<string, DispatchRow[]>();
  dg.forEach((l) => { if (!byPo.has(l.po)) byPo.set(l.po, []); byPo.get(l.po)!.push(l); });
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (k: string) => { if (!seen.has(k)) { seen.add(k); keys.push(k); } };
  ob.forEach((_, k) => add(k)); byPo.forEach((_, k) => add(k)); tabs.forEach((_, k) => add(k));
  const P: BuiltPo[] = [];
  for (const k of keys) {
    const o = ob.get(k), t = tabs.get(k), L = byPo.get(k) || [];
    const src: string[] = [];
    if (o) src.push('Order Book'); if (L.length) src.push('Dispatch sheet'); if (t) src.push(t.src);
    let chan = (o && o.chan) || (t && t.chan) || '';
    if (!chan && L.length) { const c: Record<string, number> = {}; L.forEach((l) => { c[l.chan] = (c[l.chan] || 0) + 1; }); chan = Object.keys(c).sort((a, b) => c[b] - c[a])[0] || ''; }
    chan = chan || 'Other';
    let date = o ? o.date : null;
    if (!date && t) date = t.date || null;
    let exp = (t && t.expiry) || null;
    if (!exp) { const e = L.find((l) => l.expiry); if (e) exp = e.expiry; }
    const loc = (t && t.loc) || (L[0] && L[0].loc) || '';
    let qty = o ? o.qty : null, amt = o ? o.amt : null;
    if (qty == null && t) qty = t.qty ?? null;
    if (amt == null && t) amt = t.amt ?? null;
    if (amt != null && amt > 5e6) amt = null;
    const rem = o ? Array.from(new Set(o.rem.filter((x) => x))).join(' | ') : '';
    const ost = o ? o.status.toLowerCase() : '';
    const ru = rem.toUpperCase();
    let dec = '', reason = '';
    if (L.length) dec = 'Accepted';
    else if (ost === 'cancelled' || ru.includes('CANCEL') || ru.includes('CANCLLED')) {
      if (ru.includes('LESS VALUE') || ru.includes('LOW VALUE')) { dec = 'Declined'; reason = 'Low value'; }
      else if (ru.includes('MAPPED')) { dec = 'Cancelled'; reason = 'PO mapped / merged'; }
      else if (ru.includes('AUTO')) { dec = 'Cancelled'; reason = 'Auto-cancelled by platform'; }
      else { dec = 'Cancelled'; reason = 'Cancelled (reason not recorded)'; }
    } else if (ru.includes('EXPIRY TOO CLOSE')) { dec = 'Declined'; reason = 'Expiry too close'; }
    else if (ru.includes('MAPPED')) { dec = 'Cancelled'; reason = 'PO mapped / merged'; }
    else if (t && (t.appt || String(t.tdisp || '').toUpperCase() === 'DISPATCHED' || ['dispatched', 'in transit'].includes(String(t.tstatus || '').toLowerCase()))) dec = 'Accepted';
    else dec = 'Pending';
    const note: string[] = [];
    if (t && !L.length && (['DISPATCHED', 'DELIVERED'].includes(String(t.tdisp || '').toUpperCase()) || ['dispatched', 'in transit', 'delivered'].includes(String(t.tstatus || '').toLowerCase()))) note.push('Platform tab shows dispatched but no invoice in Dispatch sheet');
    if (!o && !L.length) note.push('On platform tab but NOT in Order Book');
    if (!o && L.length) note.push('Dispatched but NOT in Order Book');
    if (o && o.n > 1) note.push('Duplicate Order Book rows merged');
    if (o && o.amt != null && o.amt > 5e6) note.push('PO value looked like a PO number; cleared');
    const firstDisp = L.map((l) => l.disp).filter(Boolean).sort()[0] || null;
    P.push({ po: k, plat: chan, date: date || firstDisp, exp, loc, qty, amt, dec, reason, rem: [rem].concat(note).filter((x) => x).join(' | '), src: src.join(' + '), appt: (t && t.appt) || null });
  }
  return P;
}
