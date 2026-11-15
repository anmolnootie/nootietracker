import React from 'react';
import { PERIODS, periodLabel, usePeriodStore } from '@/store/period.store';

/** Indian digit grouping, no decimals. */
export const inr = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('en-IN'));
/** Rupees, compact above a lakh (12.4 L, 3.1 Cr) like the artifact's money(). */
export function money(v: number | null | undefined): string {
  const n = v || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${inr(n)}`;
}
export const fd = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${String(y).slice(2)}`;
};

/** Flag tones from core.js FLAGS. */
export const TONE: Record<string, string> = {
  crit: 'bg-red-100 text-red-800 border-red-200',
  warn: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-sky-100 text-sky-800 border-sky-200',
  mute: 'bg-gray-100 text-gray-600 border-gray-200',
  ok: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};
export const FLAG_TONE: Record<number, string> = { 1: 'crit', 2: 'crit', 3: 'warn', 4: 'warn', 5: 'warn', 6: 'warn', 7: 'info', 8: 'info', 9: 'info', 10: 'mute' };

export const Card: React.FC<{ title: string; sub?: string; children: React.ReactNode; className?: string }> = ({ title, sub, children, className }) => (
  <section className={`bg-white rounded-2xl ring-1 ring-[#efe3d6] shadow-[0_1px_2px_rgba(43,33,24,0.05)] p-5 ${className || ''}`}>
    <h2 className="text-[15px] font-semibold text-ct-ink tracking-tight">{title}</h2>
    {sub ? <p className="text-xs text-gray-500 mt-0.5 mb-4">{sub}</p> : <div className="mb-3" />}
    {children}
  </section>
);

/**
 * Global period bar: FY / 90d / 30d / 7d / Month / Last month / All / Custom.
 * Custom shows From/To and changes nothing until Apply is pressed.
 */
export const PeriodBar: React.FC = () => {
  const { pkey, range, draft, choose, setDraft, apply } = usePeriodStore();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Period" className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-[#f6eee5]">
        {PERIODS.map((p) => (
          <button
            key={p.k}
            onClick={() => choose(p.k)}
            aria-pressed={pkey === p.k}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              pkey === p.k ? 'bg-ct-orange text-white border-ct-orange' : 'bg-white text-gray-700 border-gray-300 hover:border-ct-orange'
            }`}
          >
            {p.chip}
          </button>
        ))}
      </div>
      {pkey === 'custom' && (
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1">From<input type="date" value={draft.from} onChange={(e) => setDraft({ from: e.target.value })} className="border rounded px-2 py-1" /></label>
          <label className="flex items-center gap-1">To<input type="date" value={draft.to} onChange={(e) => setDraft({ to: e.target.value })} className="border rounded px-2 py-1" /></label>
          <button onClick={apply} className="px-3 py-1 rounded bg-ct-orange text-white font-medium hover:opacity-90">Apply</button>
        </div>
      )}
      <span className="text-xs text-gray-500">{periodLabel(pkey, range)}</span>
    </div>
  );
};

export interface CtRow {
  id?: string; po: string; plat: string; stage: number; pri: number; value: number; age: number | null; dte: number | null;
  loc: string; dec: string; stageShort: string; flagName: string | null; invCount: number; date: string | null; exp: string | null;
  openIssues: number; owner: string;
}

/** A PO card for the kanban and work lists. */
export const PoCard: React.FC<{ d: CtRow; onOpen: (po: string) => void }> = ({ d, onOpen }) => (
  <button onClick={() => onOpen(d.po)} className="w-full text-left bg-white border border-gray-200 rounded-lg p-2.5 hover:border-ct-orange hover:shadow-sm transition">
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-xs font-semibold text-ct-ink truncate">{d.po}</span>
      <span className="text-xs text-gray-500 shrink-0">{money(d.value)}</span>
    </div>
    <div className="text-[11px] text-gray-500 truncate">{d.plat} · {d.loc || 'no facility'}{d.age != null ? ` · ${d.age}d old` : ''}</div>
    {d.pri > 0 && <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${TONE[FLAG_TONE[d.pri]]}`}>{d.flagName}</span>}
    {d.openIssues > 0 && <span className="inline-block mt-1 ml-1 text-[10px] px-1.5 py-0.5 rounded border bg-purple-100 text-purple-800 border-purple-200">{d.openIssues} issue{d.openIssues > 1 ? 's' : ''}</span>}
  </button>
);

const KAN_STAGES = [1, 2, 3, 4, 5, 6, 7];
/** Open POs by stage (v3.js v_kanban): flagged first, then by flag priority, then oldest. */
export const StageKanban: React.FC<{ rows: CtRow[]; stages: { n: number; short: string }[]; onOpen: (po: string) => void }> = ({ rows, stages, onOpen }) => {
  const [limit, setLimit] = React.useState(12);
  const by: Record<number, CtRow[]> = {};
  KAN_STAGES.forEach((c) => (by[c] = []));
  let closed = 0, nf = 0;
  rows.forEach((d) => { if (by[d.stage]) by[d.stage].push(d); else if (d.stage === 8) closed++; else nf++; });
  KAN_STAGES.forEach((c) => by[c].sort((a, b) => Number(b.pri > 0) - Number(a.pri > 0) || (a.pri || 99) - (b.pri || 99) || (b.age || 0) - (a.age || 0)));
  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">Closed: {inr(closed)} delivered and done, {inr(nf)} not fulfilled.</p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {KAN_STAGES.map((c) => {
          const arr = by[c];
          const st = stages.find((s) => s.n === c);
          return (
            <section key={c} className="w-56 shrink-0 bg-ct-cream rounded-xl p-2 border border-orange-100">
              <h3 className="flex justify-between text-sm font-semibold text-ct-ink px-1"><span>{c}. {st?.short}</span><span>{arr.length}</span></h3>
              <p className="text-[11px] text-gray-500 px-1 mb-2">{money(arr.reduce((s, d) => s + (d.value || 0), 0))}</p>
              <div className="space-y-2">
                {arr.slice(0, limit).map((d) => <PoCard key={d.po} d={d} onOpen={onOpen} />)}
                {arr.length > limit && <button onClick={() => setLimit(limit + 40)} className="w-full text-xs text-ct-orange py-1">Show more ({arr.length - limit} left)</button>}
                {!arr.length && <p className="text-xs text-gray-400 text-center py-3">Nothing here</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

/** Proportional bar + legend for a {label: {n, v}} breakdown (v3.js seg()). */
export const StackBoard: React.FC<{ data: Record<string, { n: number; v: number }>; order: string[]; tone: Record<string, string> }> = ({ data, order, tone }) => {
  const keys = order.filter((k) => data[k]).concat(Object.keys(data).filter((k) => !order.includes(k)));
  const tot = keys.reduce((a, k) => a + data[k].n, 0) || 1;
  const bar: Record<string, string> = { ok: 'bg-emerald-500', info: 'bg-sky-500', warn: 'bg-amber-400', crit: 'bg-red-500', mute: 'bg-gray-300' };
  if (!keys.length) return <p className="text-sm text-gray-400">No invoices in this period.</p>;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        {keys.map((k) => <i key={k} className={bar[tone[k] || 'mute']} style={{ width: `${(data[k].n / tot) * 100}%` }} title={`${k}: ${data[k].n}`} />)}
      </div>
      <ul className="mt-3 space-y-1">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <i className={`w-2.5 h-2.5 rounded-sm ${bar[tone[k] || 'mute']}`} />
            <span className="flex-1 text-gray-700">{k}</span>
            <b className="tabular-nums">{inr(data[k].n)}</b>
            <span className="text-xs text-gray-500 w-20 text-right">{money(data[k].v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
