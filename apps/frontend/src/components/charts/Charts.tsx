import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Small SVG chart kit for the dashboard - no chart library.
 * Colours follow the dataviz reference palette (validated categorical order);
 * text always uses ink colours, never the series colour. Every chart has a
 * hover tooltip; ChartCard adds a table view.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const OTHER = '#a8a7a1';
export const CRITICAL = '#d03b3b';
const GRID = '#eceae6';
const AXIS = '#6b6a65';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceMax(v: number, integer = false): { max: number; ticks: number[] } {
  if (!(v > 0)) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = v / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw)!;
  if (integer) step = Math.max(1, step === 2.5 ? 2 : step);
  const max = Math.ceil(v / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t);
  return { max, ticks };
}
export const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return (n / 1e7).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, '') + ' Cr';
  if (a >= 1e5) return (n / 1e5).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, '') + ' L';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n * 10) / 10);
};
/** Indices of x labels to print so they never collide. */
function labelEvery(n: number, width: number, labelPx = 56) {
  const fit = Math.max(1, Math.floor(width / labelPx));
  return Math.max(1, Math.ceil(n / fit));
}

export interface Series { key: string; name: string; color: string; values: (number | null)[] }

const Tip: React.FC<{ x: number; width: number; title: string; rows: { color?: string; name: string; value: string }[] }> = ({ x, width, title, rows }) => (
  <div
    className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg"
    style={x > width / 2 ? { right: width - x + 12 } : { left: x + 12 }}
  >
    <p className="mb-1 font-medium text-slate-900">{title}</p>
    {rows.map((r) => (
      <p key={r.name} className="flex items-center gap-2 text-slate-600">
        {r.color && <i className="inline-block h-2 w-2 rounded-sm" style={{ background: r.color }} />}
        <span className="flex-1">{r.name}</span>
        <b className="tabular-nums text-slate-900">{r.value}</b>
      </p>
    ))}
  </div>
);

export const Legend: React.FC<{ items: { name: string; color: string }[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
    {items.map((i) => (
      <span key={i.name} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.name}</span>
    ))}
  </div>
);

const YAxis: React.FC<{ ticks: number[]; y: (v: number) => number; left: number; right: number; fmt: (n: number) => string }> = ({ ticks, y, left, right, fmt }) => (
  <g>
    {ticks.map((t) => (
      <g key={t}>
        <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
        <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS}>{fmt(t)}</text>
      </g>
    ))}
  </g>
);

/* ---------------- line chart ---------------- */
export const LineChart: React.FC<{
  labels: string[]; titles?: string[]; series: Series[]; height?: number;
  fmt?: (n: number) => string; axisFmt?: (n: number) => string; endLabels?: boolean;
}> = ({ labels, titles, series, height = 240, fmt = (n) => String(n), axisFmt = compact, endLabels = true }) => {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const showEnd = endLabels && series.length > 1 && series.length <= 4;
  const m = { l: 44, r: showEnd ? 26 + 6.2 * Math.max(...series.map((s) => s.name.length)) : 14, t: 10, b: 26 };
  const iw = Math.max(10, w - m.l - m.r), ih = height - m.t - m.b;
  const n = labels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const { max, ticks } = niceMax(Math.max(0, ...all), all.every((v) => Number.isInteger(v)));
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const every = labelEvery(n, iw);

  const pathOf = (vals: (number | null)[]) => {
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  // End labels: last value of each series, pushed apart so they never overlap.
  const ends = showEnd
    ? series
        .map((s) => { let i = s.values.length - 1; while (i >= 0 && s.values[i] == null) i--; return { s, i, yy: i >= 0 ? y(s.values[i] as number) : m.t + ih }; })
        .sort((a, b) => a.yy - b.yy)
    : [];
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 14) ends[k].yy = ends[k - 1].yy + 14;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    setHi(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px / iw) * (n - 1)))));
  };

  return (
    <div ref={ref} className="relative w-full select-none">
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
          <YAxis ticks={ticks} y={y} left={m.l} right={m.l + iw} fmt={axisFmt} />
          {labels.map((l, i) => (i % every === 0 || i === n - 1) && (n - 1 - i >= every || i === n - 1) ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} fontSize={11} fill={AXIS}>{l}</text>
          ) : null)}
          {hi != null && <line x1={x(hi)} x2={x(hi)} y1={m.t} y2={m.t + ih} stroke="#94938d" strokeWidth={1} strokeDasharray="3 3" />}
          {series.map((s) => (
            <g key={s.key}>
              <path d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {(n <= 1 || n <= 12) && s.values.map((v, i) => v != null && (
                <circle key={i} cx={x(i)} cy={y(v)} r={n <= 1 ? 4 : 2.5} fill={s.color} stroke="#fff" strokeWidth={1.5} />
              ))}
              {hi != null && s.values[hi] != null && <circle cx={x(hi)} cy={y(s.values[hi] as number)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />}
            </g>
          ))}
          {ends.map(({ s, i, yy }) => i >= 0 && (
            <g key={s.key}>
              <circle cx={m.l + iw + 10} cy={yy} r={3} fill={s.color} />
              <text x={m.l + iw + 17} y={yy} dy="0.32em" fontSize={11} fill="#3f3e3a">{s.name}</text>
            </g>
          ))}
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHi(null)} />
        </svg>
      )}
      {hi != null && (
        <Tip x={x(hi)} width={w} title={(titles || labels)[hi]} rows={series.map((s) => ({ color: s.color, name: s.name, value: s.values[hi] == null ? '-' : fmt(s.values[hi] as number) }))} />
      )}
    </div>
  );
};

/* ---------------- bars (stacked or single) ---------------- */
const topRounded = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

export const StackedBars: React.FC<{
  labels: string[]; titles?: string[]; series: Series[]; height?: number;
  fmt?: (n: number) => string; axisFmt?: (n: number) => string; showTotal?: boolean;
  /** Print the value above each bar (only for short single-series charts). */
  valueLabels?: boolean;
  /** Per-bar colour override for single-series charts (e.g. an "Expired" bar in critical red). */
  barColor?: (i: number) => string | undefined;
}> = ({ labels, titles, series, height = 240, fmt = (n) => String(n), axisFmt = compact, showTotal = true, valueLabels = false, barColor }) => {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const m = { l: 44, r: 8, t: valueLabels ? 20 : 10, b: 26 };
  const iw = Math.max(10, w - m.l - m.r), ih = height - m.t - m.b;
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((t, s) => t + (s.values[i] || 0), 0));
  const { max, ticks } = niceMax(Math.max(0, ...totals), totals.every((v) => Number.isInteger(v)));
  const band = iw / Math.max(1, n);
  const bw = Math.max(3, Math.min(36, band * 0.68));
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const every = labelEvery(n, iw);
  const GAP = 2;

  return (
    <div ref={ref} className="relative w-full select-none">
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
          <YAxis ticks={ticks} y={y} left={m.l} right={m.l + iw} fmt={axisFmt} />
          {labels.map((l, i) => {
            const cx = m.l + band * i + band / 2;
            let base = 0;
            const segs = series.map((s) => ({ s, v: s.values[i] || 0 })).filter((x) => x.v > 0);
            return (
              <g key={i}>
                {hi === i && <rect x={m.l + band * i} y={m.t} width={band} height={ih} fill="#f4f3f0" />}
                {segs.map(({ s, v }, k) => {
                  const y0 = y(base), y1 = y(base + v);
                  base += v;
                  const top = k === segs.length - 1;
                  const h = Math.max(1, y0 - y1 - (top ? 0 : GAP));
                  const color = (series.length === 1 && barColor?.(i)) || s.color;
                  return top
                    ? <path key={s.key} d={topRounded(cx - bw / 2, y0 - h, bw, h, 4)} fill={color} />
                    : <rect key={s.key} x={cx - bw / 2} y={y0 - h} width={bw} height={h} fill={color} />;
                })}
                {valueLabels && totals[i] > 0 && <text x={cx} y={y(totals[i]) - 6} textAnchor="middle" fontSize={11} fill="#3f3e3a" className="tabular-nums">{fmt(totals[i])}</text>}
                {(i % every === 0) && <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={AXIS}>{l}</text>}
                <rect x={m.l + band * i} y={m.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} />
              </g>
            );
          })}
        </svg>
      )}
      {hi != null && (
        <Tip
          x={m.l + band * hi + band / 2} width={w} title={(titles || labels)[hi]}
          rows={[
            ...series.filter((s) => series.length === 1 || (s.values[hi] || 0) > 0).map((s) => ({ color: (series.length === 1 && barColor?.(hi)) || s.color, name: s.name, value: fmt(s.values[hi] || 0) })),
            ...(showTotal && series.length > 1 ? [{ name: 'Total', value: fmt(totals[hi]) }] : []),
          ]}
        />
      )}
    </div>
  );
};

/* ---------------- sparkline (stat tiles) ---------------- */
export const Sparkline: React.FC<{ values: number[]; color?: string; height?: number }> = ({ values, color = SERIES[0], height = 36 }) => {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = values.length;
  const max = Math.max(1, ...values);
  const x = (i: number) => (n <= 1 ? w / 2 : 2 + (i * (w - 4)) / (n - 1));
  const y = (v: number) => height - 3 - (v / max) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <div ref={ref} className="w-full" aria-hidden>
      {w > 0 && n > 1 && (
        <svg width={w} height={height}>
          <path d={`${d}L${x(n - 1)},${height}L${x(0)},${height}Z`} fill={color} opacity={0.1} />
          <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(n - 1)} cy={y(values[n - 1])} r={3} fill={color} />
        </svg>
      )}
    </div>
  );
};

/* ---------------- card with chart / table toggle ---------------- */
export const ChartCard: React.FC<{
  title: string; sub?: string; legend?: React.ReactNode; action?: React.ReactNode;
  table?: { head: string[]; rows: (string | number)[][] }; children: React.ReactNode; className?: string;
}> = ({ title, sub, legend, action, table, children, className = '' }) => {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <button onClick={() => setAsTable(!asTable)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
              {asTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </div>
      {legend && !asTable && <div className="mb-2">{legend}</div>}
      {asTable && table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500"><tr>{table.head.map((h, i) => <th key={h} className={`py-1.5 pr-3 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {table.rows.map((r, k) => <tr key={k}>{r.map((c, i) => <td key={i} className={`py-1.5 pr-3 ${i ? 'text-right tabular-nums' : 'text-slate-700'}`}>{c}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
};

export const Segmented: React.FC<{ value: string; options: { k: string; label: string }[]; onChange: (k: string) => void }> = ({ value, options, onChange }) => (
  <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-xs">
    {options.map((o) => (
      <button key={o.k} onClick={() => onChange(o.k)} className={`rounded px-2 py-1 ${value === o.k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{o.label}</button>
    ))}
  </div>
);
