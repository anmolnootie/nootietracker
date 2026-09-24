import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { poService, DispatchDashboardData, DispatchDashboardParams, DispatchDashboardList, DispatchKpi } from '@/services/po.service';
import { format } from 'date-fns';

type Filters = Omit<DispatchDashboardParams, 'fy'>;
const FILTER_LABELS: Record<keyof Filters, string> = { channel: 'Channel', month: 'Month', status: 'Status', partner: 'Delivery partner', aging: 'Aging' };
const PALETTE = ['#E8862A', '#1F4E79', '#2E8B57', '#8E44AD', '#C0392B', '#16A085', '#7F8C8D', '#D4AC0D'];
const VALUE_COLOR = '#E8862A';
const COUNT_COLOR = '#1F4E79';

const KPI_TITLES: Record<DispatchKpi, string> = {
  totalPOs: 'All POs this FY, dispatched or not',
  dispatched: 'Dispatched POs',
  notFulfilled: 'Not fulfilled',
  delivered: 'Delivered POs',
  inTransit: 'POs in transit',
  grnDone: 'GRN done',
  grnPending: 'GRN pending - delivered, no GRN recorded yet',
  invoiceValue: 'Invoice value by PO (highest first)',
};

const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
const compact = (n: number) => {
  if (n >= 1e7) return `${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} K`;
  return String(Math.round(n));
};

/** Round a maximum up to a tidy 1/2/5 x 10^n so four even ticks read cleanly. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

export default function DispatchDashboard() {
  const [fy, setFy] = useState<number | undefined>(undefined);
  const [filters, setFilters] = useState<Filters>({});
  const [data, setData] = useState<DispatchDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Bumping this re-fetches with the current filters (Refresh button / timer).
  const [reloadKey, setReloadKey] = useState(0);
  const silentReload = useRef(false);
  // The PO list that opens when a tile is clicked.
  const [listKpi, setListKpi] = useState<DispatchKpi | null>(null);

  // The figures are computed live from the database on every request, but the
  // page only asked once - a tab left open never showed new dispatches/GRNs.
  // Re-check every minute while the tab is visible, without dimming the page.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      silentReload.current = true;
      setReloadKey((k) => k + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!silentReload.current) setLoading(true);
    silentReload.current = false;
    poService
      .getDispatchDashboard({ fy, ...filters })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError('');
        setLastUpdated(new Date());
        if (fy === undefined) setFy(d.fy);
      })
      .catch(() => !cancelled && setError('Could not load the dashboard.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, filters, reloadKey]);

  // Click again to clear - same behaviour as a Power BI slicer/visual.
  const toggle = (key: keyof Filters, value: string) => setFilters((f) => ({ ...f, [key]: f[key] === value ? undefined : value }));
  const activeFilters = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k]);
  const monthLabel = (v: string) => data?.slicers.months.find((m) => m.value === v)?.label ?? data?.byMonth.find((m) => m.value === v)?.label ?? v;

  return (
    <MainLayout>
      {/* Title banner */}
      <div className="bg-nootie-orange-dark text-white rounded-t-lg px-6 py-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Dispatch and GRN Dashboard ({data?.fyLabel ?? '...'})</h2>
        <div className="flex items-center gap-3">
        {lastUpdated && <span className="text-xs text-white/80 whitespace-nowrap">Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={loading}
          className="text-sm px-3 py-1 rounded bg-white/20 hover:bg-white/30 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
        {data && data.fyOptions.length > 1 && (
          <select
            value={fy}
            onChange={(e) => {
              setFy(Number(e.target.value));
              setFilters({});
            }}
            className="text-sm text-gray-800 rounded px-2 py-1"
            aria-label="Financial year"
          >
            {data.fyOptions.map((y) => (
              <option key={y} value={y}>{`FY ${y}-${y + 1}`}</option>
            ))}
          </select>
        )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {!data ? (
        <div className="bg-white rounded-b-lg shadow p-10 text-center text-gray-500">Loading dashboard...</div>
      ) : (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 bg-gray-100 p-3">
            <Kpi
              icon="📋"
              label="Total POs"
              value={data.kpis.totalPOs.toLocaleString('en-IN')}
              hint="Every PO this FY, whether it's shipped yet or not - click to list them"
              onClick={() => setListKpi('totalPOs')}
              active={listKpi === 'totalPOs'}
            />
            <Kpi icon="🚀" label="Dispatched" value={data.kpis.dispatched.toLocaleString('en-IN')} hint="Click to list these POs" onClick={() => setListKpi('dispatched')} active={listKpi === 'dispatched'} />
            <Kpi icon="🚚" label="Delivered" value={data.kpis.delivered.toLocaleString('en-IN')} hint="Click to list these POs" onClick={() => setListKpi('delivered')} active={listKpi === 'delivered'} />
            <Kpi icon="📦" label="In Transit" value={data.kpis.inTransit.toLocaleString('en-IN')} hint="Click to list these POs" onClick={() => setListKpi('inTransit')} active={listKpi === 'inTransit'} />
            <Kpi icon="✅" label="GRN Done" value={data.kpis.grnDone.toLocaleString('en-IN')} hint="Click to list these POs" onClick={() => setListKpi('grnDone')} active={listKpi === 'grnDone'} />
            <Kpi icon="⚠️" label="GRN Pending" value={data.kpis.grnPending.toLocaleString('en-IN')} hint="Delivered, no GRN yet - click to list these POs" onClick={() => setListKpi('grnPending')} active={listKpi === 'grnPending'} />
            <Kpi icon="🛑" label="Not Fulfilled" value={data.kpis.notFulfilled.toLocaleString('en-IN')} hint="Click to list these POs" onClick={() => setListKpi('notFulfilled')} active={listKpi === 'notFulfilled'} />
          </div>

          {/* Active filters */}
          {activeFilters.length > 0 && (
            <div className="bg-gray-100 px-3 pb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">Filtered by</span>
              {activeFilters.map((k) => (
                <button key={k} onClick={() => setFilters((f) => ({ ...f, [k]: undefined }))} className="px-2.5 py-1 rounded-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">
                  {FILTER_LABELS[k]}: <b>{k === 'month' ? monthLabel(filters[k]!) : filters[k]}</b> ✕
                </button>
              ))}
              <button onClick={() => setFilters({})} className="text-nootie-orange-dark hover:underline">
                Clear all
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 bg-gray-100 px-3 pb-3">
            {/* Left: slicers + charts */}
            <div className="xl:col-span-7 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Slicer title="Channel" items={data.slicers.channels.map((c) => ({ key: c.name, label: c.name, count: c.count }))} selected={filters.channel} onPick={(k) => toggle('channel', k)} />
                <Slicer title="Month" items={data.slicers.months.map((m) => ({ key: m.value, label: m.label, count: m.count }))} selected={filters.month} onPick={(k) => toggle('month', k)} />
                <Slicer title="Status" items={data.slicers.statuses.map((s) => ({ key: s.name, label: s.name, count: s.count }))} selected={filters.status} onPick={(k) => toggle('status', k)} />
              </div>

              <Card title="POs by Delivery Partner">
                <PartnerPie data={data.byPartner} selected={filters.partner} onPick={(k) => toggle('partner', k)} />
              </Card>

              <Card title="Invoice Value and PO Count by Month" subtitle="Month of dispatch">
                <MonthLine data={data.byMonth} selected={filters.month} onPick={(k) => toggle('month', k)} />
              </Card>
            </div>

            {/* Right: PO table */}
            <div className="xl:col-span-5">
              <div className="bg-white rounded shadow h-full flex flex-col">
                <div className="px-4 py-3 border-b flex items-baseline justify-between">
                  <h3 className="font-semibold text-gray-800">POs</h3>
                  <span className="text-xs text-gray-500">
                    {data.table.total > data.table.rows.length ? `Latest ${data.table.rows.length} of ${data.table.total.toLocaleString('en-IN')}` : `${data.table.total.toLocaleString('en-IN')} PO${data.table.total === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div className="overflow-auto" style={{ maxHeight: '44rem' }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white shadow-[0_1px_0_#e5e7eb]">
                      <tr className="text-left text-xs text-gray-600">
                        {['PO Number', 'Location/Hub', 'Channel', 'Dispatched', 'Invoice No.', 'Invoice Value', 'Delivery Partner', 'AWB', 'Status', 'Fulfilment', 'GRN'].map((h) => (
                          <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.table.rows.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Link href={`/pos/${r.id}`} className="text-nootie-orange-dark hover:underline">{r.poNumber}</Link>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.location}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.channel}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.dispatchDate ? format(new Date(r.dispatchDate), 'dd MMM yy') : '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.invoiceNumber || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{inr(r.invoiceValue)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.partner}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.awb || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap"><StatusPill status={r.status} /></td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.fulfilment}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.grn}</td>
                        </tr>
                      ))}
                      {data.table.rows.length === 0 && (
                        <tr>
                          <td colSpan={11} className="px-3 py-10 text-center text-gray-500">No dispatched POs match these filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {listKpi && (
        <PoListModal
          kpi={listKpi}
          fy={fy}
          filters={filters}
          fyLabel={data?.fyLabel}
          monthLabel={monthLabel}
          onClose={() => setListKpi(null)}
        />
      )}
    </MainLayout>
  );
}

/* ---------- small pieces ---------- */

/** The full list of POs behind a clicked tile - same filters as the tile, searchable, each PO opens its own page. */
const PoListModal: React.FC<{
  kpi: DispatchKpi;
  fy: number | undefined;
  filters: Filters;
  fyLabel?: string;
  monthLabel: (v: string) => string;
  onClose: () => void;
}> = ({ kpi, fy, filters, fyLabel, monthLabel, onClose }) => {
  const [list, setList] = useState<DispatchDashboardList | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const download = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      await poService.downloadDispatchDashboardList(kpi, { fy, ...filters });
    } catch {
      setDownloadError('Could not download the file.');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setList(null);
    setError('');
    poService
      .getDispatchDashboardList(kpi, { fy, ...filters })
      .then((d) => !cancelled && setList(d))
      .catch(() => !cancelled && setError('Could not load the list.'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpi, fy, filters]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = search.trim().toLowerCase();
  const rows = (list?.rows ?? []).filter(
    (r) => !q || [r.poNumber, r.awb, r.invoiceNumber, r.location, r.partner, r.channel].some((v) => v && String(v).toLowerCase().includes(q)),
  );
  const active = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={KPI_TITLES[kpi]}>
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{KPI_TITLES[kpi]}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {list ? (
                <>
                  <b className="text-gray-800">{list.total.toLocaleString('en-IN')}</b> PO{list.total === 1 ? '' : 's'} · invoice value <b className="text-gray-800">₹{inr(list.invoiceValue)}</b> · {list.fyLabel ?? fyLabel}
                </>
              ) : (
                'Loading...'
              )}
              {active.length > 0 && <> · {active.map((k) => `${FILTER_LABELS[k]}: ${k === 'month' ? monthLabel(filters[k]!) : filters[k]}`).join(' · ')}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO, AWB, invoice, location or partner"
            className="px-3 py-1.5 border border-gray-300 rounded text-sm w-80"
            autoFocus
          />
          {q && list && <span className="text-xs text-gray-500">{rows.length.toLocaleString('en-IN')} of {list.total.toLocaleString('en-IN')} match</span>}
          <button
            onClick={download}
            disabled={!list || downloading}
            className="ml-auto px-3 py-1.5 rounded border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
          >
            {downloading ? 'Downloading...' : '⬇ Download Excel'}
          </button>
        </div>
        {downloadError && <p className="px-6 py-2 text-xs text-red-700 bg-red-50 border-b">{downloadError}</p>}

        {error ? (
          <p className="p-6 text-red-700 text-sm">{error}</p>
        ) : !list ? (
          <p className="p-10 text-center text-gray-500">Loading...</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_#e5e7eb]">
                <tr className="text-left text-xs text-gray-600">
                  {['PO Number', 'Location/Hub', 'Channel', 'Dispatched', 'Invoice No.', 'Invoice Value', 'Delivery Partner', 'AWB', 'Status', 'Fulfilment', 'GRN'].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={`/pos/${r.id}`} className="text-nootie-orange-dark hover:underline">{r.poNumber}</Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.location}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.channel}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.dispatchDate ? format(new Date(r.dispatchDate), 'dd MMM yy') : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.invoiceNumber || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{inr(r.invoiceValue)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.partner}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.awb || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><StatusPill status={r.status} /></td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.fulfilment}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.grn}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-gray-500">{q ? 'No POs match that search.' : 'No POs here.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {list.truncated && <p className="px-6 py-3 text-xs text-gray-500 border-t">Showing the first {list.rows.length.toLocaleString('en-IN')} of {list.total.toLocaleString('en-IN')} - narrow the filters to see the rest.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

const Kpi: React.FC<{ icon: string; label: string; value: string; hint?: string; onClick?: () => void; active?: boolean }> = ({ icon, label, value, hint, onClick, active }) => {
  const Tag = onClick ? 'button' : 'div';
  // Neither the label nor the value may wrap - a wrapped label (e.g. a long
  // "Total Invoice Value") throws off the icon's vertical alignment against
  // its neighbours, and a wrapped value defeats the point of showing it in
  // full. Both shrink instead, only as much as their own length needs.
  const labelSize = label.length > 14 ? 'text-[10px]' : 'text-xs';
  const valueSize = value.length > 12 ? 'text-base' : value.length > 9 ? 'text-lg' : value.length > 6 ? 'text-xl' : 'text-2xl';
  return (
    <Tag
      onClick={onClick}
      title={hint}
      className={`bg-white rounded shadow border-l-4 px-4 py-3 flex items-center gap-3 text-left ${active ? 'border-nootie-orange-dark ring-2 ring-nootie-orange' : 'border-nootie-gold'} ${onClick ? 'hover:shadow-md cursor-pointer' : ''}`}
    >
      <span className="text-3xl" aria-hidden>{icon}</span>
      <span className="min-w-0 ml-auto text-right">
        <span className={`block ${labelSize} font-semibold text-gray-700 whitespace-nowrap`}>{label}</span>
        <span className={`block ${valueSize} font-bold text-gray-900 tabular-nums whitespace-nowrap`}>{value}</span>
      </span>
    </Tag>
  );
};

const Card: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="bg-white rounded shadow p-4">
    <h3 className="font-semibold text-gray-800">{title}</h3>
    {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    <div className="mt-3">{children}</div>
  </div>
);

const Slicer: React.FC<{ title: string; items: { key: string; label: string; count: number }[]; selected?: string; onPick: (key: string) => void }> = ({ title, items, selected, onPick }) => (
  <div className="bg-white rounded shadow p-4">
    <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
    <ul className="max-h-40 overflow-y-auto space-y-1 pr-1">
      {items.map((it) => {
        const on = selected === it.key;
        return (
          <li key={it.key}>
            <button onClick={() => onPick(it.key)} className={`w-full flex items-center gap-2 text-sm rounded px-1 py-0.5 text-left ${on ? 'bg-nootie-orange-light' : 'hover:bg-gray-50'}`}>
              <span className={`inline-block w-3.5 h-3.5 rounded-full border-2 shrink-0 ${on ? 'border-nootie-orange-dark bg-nootie-orange-dark' : 'border-gray-400'}`} />
              <span className="flex-1 truncate text-gray-800">{it.label}</span>
              <span className="text-xs text-gray-500 tabular-nums">{it.count}</span>
            </button>
          </li>
        );
      })}
      {items.length === 0 && <li className="text-sm text-gray-400">No values</li>}
    </ul>
  </div>
);

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const style =
    status === 'Delivered' ? 'bg-green-100 text-green-700' : status === 'In Transit' ? 'bg-blue-100 text-blue-700' : ['RTO', 'Need to Mark RTO', 'Returned', 'Cancelled'].includes(status) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${style}`}>{status}</span>;
};

/* ---------- charts (plain SVG - no chart library in this app) ---------- */

const PartnerPie: React.FC<{ data: { name: string; count: number }[]; selected?: string; onPick: (k: string) => void }> = ({ data, selected, onPick }) => {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <p className="text-sm text-gray-400 py-10 text-center">No data</p>;

  const R = 70;
  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const sweep = (d.count / total) * Math.PI * 2;
    const a0 = angle;
    angle += sweep;
    const p = (a: number) => [100 + R * Math.cos(a), 100 + R * Math.sin(a)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a0 + sweep - 1e-6);
    const path = data.length === 1 ? '' : `M100,100 L${x0},${y0} A${R},${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1},${y1} Z`;
    return { ...d, color: PALETTE[i % PALETTE.length], path, pct: (d.count / total) * 100 };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 200 200" className="w-40 h-40 shrink-0" role="img" aria-label="POs by delivery partner">
        {slices.map((s) => {
          const dim = selected && selected !== s.name;
          return s.path ? (
            <path key={s.name} d={s.path} fill={s.color} opacity={dim ? 0.25 : 1} stroke="#fff" strokeWidth={1.5} className="cursor-pointer" onClick={() => onPick(s.name)}>
              <title>{`${s.name}: ${s.count} (${s.pct.toFixed(1)}%)`}</title>
            </path>
          ) : (
            <circle key={s.name} cx={100} cy={100} r={R} fill={s.color} opacity={dim ? 0.25 : 1} className="cursor-pointer" onClick={() => onPick(s.name)}>
              <title>{`${s.name}: ${s.count} (100%)`}</title>
            </circle>
          );
        })}
      </svg>
      <ul className="text-sm space-y-1 min-w-0">
        {slices.map((s) => (
          <li key={s.name}>
            <button onClick={() => onPick(s.name)} className={`flex items-center gap-2 text-left ${selected && selected !== s.name ? 'opacity-40' : ''}`}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="truncate text-gray-800">{s.name}</span>
              <span className="text-xs text-gray-500 tabular-nums">{s.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const MonthLine: React.FC<{ data: { value: string; label: string; count: number; invoiceValue: number }[]; selected?: string; onPick: (k: string) => void }> = ({ data, selected, onPick }) => {
  // Only the stretch of the year that has dispatches.
  const first = data.findIndex((d) => d.count > 0);
  const last = data.length - 1 - [...data].reverse().findIndex((d) => d.count > 0);
  if (first < 0) return <p className="text-sm text-gray-400 py-10 text-center">No data</p>;
  const pts = data.slice(first, last + 1);

  const W = 560, H = 230, L = 58, Rt = 46, T = 16, B = 34;
  const iw = W - L - Rt, ih = H - T - B;
  const vMax = niceMax(Math.max(...pts.map((p) => p.invoiceValue)));
  const cMax = niceMax(Math.max(...pts.map((p) => p.count)));
  const x = (i: number) => L + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const yV = (v: number) => T + ih - (v / vMax) * ih;
  const yC = (v: number) => T + ih - (v / cMax) * ih;
  const ticks = [0, 1, 2, 3, 4].map((t) => t / 4);
  const line = (fy: (v: number) => number, pick: (p: (typeof pts)[number]) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${fy(pick(p))}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Invoice value and PO count by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - Rt} y1={T + ih - t * ih} y2={T + ih - t * ih} stroke="#e5e7eb" />
            <text x={L - 8} y={T + ih - t * ih + 4} textAnchor="end" fontSize={11} fill={VALUE_COLOR}>{compact(vMax * t)}</text>
            <text x={W - Rt + 8} y={T + ih - t * ih + 4} textAnchor="start" fontSize={11} fill={COUNT_COLOR}>{Math.round(cMax * t)}</text>
          </g>
        ))}
        <path d={line(yV, (p) => p.invoiceValue)} fill="none" stroke={VALUE_COLOR} strokeWidth={2.5} strokeLinejoin="round" />
        <path d={line(yC, (p) => p.count)} fill="none" stroke={COUNT_COLOR} strokeWidth={2.5} strokeLinejoin="round" />
        {pts.map((p, i) => {
          const on = selected === p.value;
          return (
            <g key={p.value} className="cursor-pointer" onClick={() => onPick(p.value)}>
              <rect x={x(i) - 22} y={T} width={44} height={ih + B} fill="transparent" />
              {on && <line x1={x(i)} x2={x(i)} y1={T} y2={T + ih} stroke="#9ca3af" strokeDasharray="3 3" />}
              <circle cx={x(i)} cy={yV(p.invoiceValue)} r={on ? 5 : 3.5} fill={VALUE_COLOR} />
              <circle cx={x(i)} cy={yC(p.count)} r={on ? 5 : 3.5} fill={COUNT_COLOR} />
              <text x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fontWeight={on ? 700 : 400} fill="#4b5563">{p.label}</text>
              <title>{`${p.label}: ₹${inr(p.invoiceValue)} across ${p.count} PO${p.count === 1 ? '' : 's'}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-center gap-5 text-xs text-gray-600 mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 inline-block" style={{ background: VALUE_COLOR, height: 3 }} />Invoice value (₹, left axis)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 inline-block" style={{ background: COUNT_COLOR, height: 3 }} />PO count (right axis)</span>
      </div>
    </div>
  );
};
