import { addDays, Derived, diff } from './control-tower.core';

/**
 * Time-based numbers for the dashboard charts. Pure, like control-tower.core.
 *
 * - Activity is counted by the date each thing happened: POs by PO date,
 *   invoices by dispatch date, deliveries by delivery date, GRNs by GRN date.
 *   So the timeline shows what happened in each day / week / month, not the
 *   later fate of the POs received then.
 * - Age and expiry describe the open POs (stages 1-4) right now.
 */
export type TrendUnit = 'day' | 'week' | 'month';

export interface TrendBucket {
  key: string; start: string; end: string;
  received: number; receivedValue: number;
  dispatched: number; dispatchedValue: number;
  delivered: number; grnDone: number;
  byPlatform: Record<string, number>;
  /** Median days from PO date to first dispatch, for POs received in this bucket. */
  leadDays: number | null;
}

const AGE_BANDS: { label: string; min: number; max: number }[] = [
  { label: '0-2 days', min: 0, max: 2 },
  { label: '3-5 days', min: 3, max: 5 },
  { label: '6-10 days', min: 6, max: 10 },
  { label: '11-20 days', min: 11, max: 20 },
  { label: '21-45 days', min: 21, max: 45 },
  { label: 'Over 45 days', min: 46, max: Infinity },
];
const EXPIRY_DAYS = 14;

const monday = (s: string) => {
  const dow = (new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return addDays(s, -dow);
};
const bucketStart = (s: string, unit: TrendUnit) => (unit === 'day' ? s : unit === 'week' ? monday(s) : s.slice(0, 7) + '-01');
const nextStart = (s: string, unit: TrendUnit) => {
  if (unit === 'day') return addDays(s, 1);
  if (unit === 'week') return addDays(s, 7);
  const [y, m] = s.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * @param all   every PO for the platform filter, ignoring the period (activity needs invoices of older POs too)
 * @param scoped the POs in the period (for age / expiry, consistent with the other dashboard numbers)
 */
export function trends(all: Derived[], scoped: Derived[], range: { from: string; to: string } | null, asof: string) {
  // Window: the period, or for "all time" the span of the data (capped at three years back).
  let from = range?.from || null;
  const to = range?.to && range.to < asof ? range.to : asof;
  if (!from) {
    const floor = addDays(asof, -3 * 365);
    let min: string | null = null;
    for (const d of all) {
      if (d.date && d.date >= floor && (!min || d.date < min)) min = d.date;
      for (const l of d.inv.list) if (l.disp && l.disp >= floor && (!min || l.disp < min)) min = l.disp;
    }
    from = min || addDays(asof, -89);
  }
  if (from > to) from = to;
  const span = diff(to, from)! + 1;
  const unit: TrendUnit = span <= 45 ? 'day' : span <= 210 ? 'week' : 'month';

  const buckets: TrendBucket[] = [];
  const index = new Map<string, TrendBucket>();
  for (let s = bucketStart(from, unit); s <= to; s = nextStart(s, unit)) {
    const b: TrendBucket = {
      key: s, start: s < from ? from : s, end: addDays(nextStart(s, unit), -1) > to ? to : addDays(nextStart(s, unit), -1),
      received: 0, receivedValue: 0, dispatched: 0, dispatchedValue: 0, delivered: 0, grnDone: 0, byPlatform: {}, leadDays: null,
    };
    buckets.push(b); index.set(s, b);
  }
  const at = (day: string | null | undefined) => (day && day >= from! && day <= to ? index.get(bucketStart(day, unit)) : undefined);

  const leads = new Map<string, number[]>();
  for (const d of all) {
    const b = at(d.date);
    if (b) {
      b.received++; b.receivedValue += d.value || 0;
      b.byPlatform[d.plat] = (b.byPlatform[d.plat] || 0) + 1;
      if (d.inv.first && d.date) {
        const lead = diff(d.inv.first, d.date);
        if (lead != null && lead >= 0) { const arr = leads.get(b.key) || []; arr.push(lead); leads.set(b.key, arr); }
      }
    }
    for (const l of d.inv.list) {
      const bd = at(l.disp);
      if (bd) { bd.dispatched++; bd.dispatchedValue += l.val || 0; }
      const bv = at(l.deliv);
      if (bv) bv.delivered++;
      const bg = at(l.gdate);
      if (bg && l.grn !== 'Pending') bg.grnDone++;
    }
  }
  for (const b of buckets) b.leadDays = median(leads.get(b.key) || []);

  const open = scoped.filter((d) => d.stage <= 4);
  const age = AGE_BANDS.map((band) => {
    const xs = open.filter((d) => d.age != null && d.age >= band.min && d.age <= band.max);
    return { label: band.label, n: xs.length, v: xs.reduce((t, d) => t + (d.value || 0), 0) };
  });
  const undated = open.filter((d) => d.age == null).length;

  const expired = open.filter((d) => d.dte != null && d.dte < 0);
  const expiry = Array.from({ length: EXPIRY_DAYS }, (_, i) => {
    const day = addDays(asof, i);
    const xs = open.filter((d) => d.dte === i);
    return { day, n: xs.length, v: xs.reduce((t, d) => t + (d.value || 0), 0) };
  });

  return {
    asof, from, to, unit, buckets,
    age, undated, openCount: open.length,
    expired: { n: expired.length, v: expired.reduce((t, d) => t + (d.value || 0), 0) },
    expiry,
  };
}
