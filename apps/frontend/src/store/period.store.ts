import { create } from 'zustand';

/** Period chips from the artifact's v3.js. */
export type PeriodKey = 'fy' | '90d' | '30d' | '7d' | 'month' | 'last' | 'all' | 'custom';
export const PERIODS: { k: PeriodKey; chip: string; label: string }[] = [
  { k: 'fy', chip: 'FY', label: 'This financial year' },
  { k: '90d', chip: '90d', label: 'Last 90 days' },
  { k: '30d', chip: '30d', label: 'Last 30 days' },
  { k: '7d', chip: '7d', label: 'Last 7 days' },
  { k: 'month', chip: 'Month', label: 'This month' },
  { k: 'last', chip: 'Last mo.', label: 'Last month' },
  { k: 'all', chip: 'All', label: 'All time' },
  { k: 'custom', chip: 'Custom', label: 'Custom range' },
];

/** Today as an IST calendar day - matches the backend's as-of date. */
export function istToday(): string {
  return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
}
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const monthStart = (iso: string, off: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1 + off, 1)).toISOString().slice(0, 10);

/** Same rules as the backend's periodRange(); null = no range (All). */
export function rangeFor(k: PeriodKey, from?: string, to?: string): { from: string; to: string } | null {
  const a = istToday();
  if (k === 'all') return null;
  if (k === 'custom') {
    let f = from || addDays(a, -30), t = to || a;
    if (f > t) [f, t] = [t, f];
    return { from: f, to: t };
  }
  if (k === 'last') return { from: monthStart(a, -1), to: addDays(monthStart(a, 0), -1) };
  const f = k === 'fy' ? '2026-04-01' : k === '90d' ? addDays(a, -90) : k === '30d' ? addDays(a, -30) : k === '7d' ? addDays(a, -7) : monthStart(a, 0);
  return { from: f, to: a };
}

interface PeriodStore {
  pkey: PeriodKey;
  /** The applied range every Control Tower page queries with. */
  range: { from: string; to: string } | null;
  /** Custom From/To being edited; nothing refreshes until apply(). */
  draft: { from: string; to: string };
  choose: (k: PeriodKey) => void;
  setDraft: (d: Partial<{ from: string; to: string }>) => void;
  apply: () => void;
}

/** Global period filter shared by every Control Tower page (kept in memory for the session). */
export const usePeriodStore = create<PeriodStore>((set, get) => ({
  pkey: 'fy',
  range: rangeFor('fy'),
  draft: rangeFor('custom')!,
  choose: (k) => {
    if (k === 'custom') {
      // Show From/To; keep the current results until Apply.
      const cur = get().range;
      set({ pkey: 'custom', draft: cur ? { ...cur } : rangeFor('custom')! });
      return;
    }
    set({ pkey: k, range: rangeFor(k) });
  },
  setDraft: (d) => set({ draft: { ...get().draft, ...d } }),
  apply: () => {
    const { draft } = get();
    set({ range: rangeFor('custom', draft.from, draft.to) });
  },
}));

export function periodLabel(pkey: PeriodKey, range: { from: string; to: string } | null): string {
  if (pkey === 'custom' && range) return `${range.from} to ${range.to}`;
  return PERIODS.find((p) => p.k === pkey)?.label || '';
}
