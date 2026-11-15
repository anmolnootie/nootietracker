import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import { controlTowerService } from '@/services/control-tower.service';
import { periodLabel, usePeriodStore } from '@/store/period.store';
import { inr, money, PeriodBar } from '@/components/control-tower/ui';
import { CT_PLATFORMS, PlatformName, platformSlug } from '@/components/control-tower/brand';
import { ChartCard, compact, CRITICAL, Legend, LineChart, OTHER, Segmented, SERIES, Series, Sparkline, StackedBars } from '@/components/charts/Charts';

const TEAMS = ['Order desk', 'Warehouse', 'Logistics', 'Accounts'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
/** Platforms keep one colour everywhere: the first seven in the fixed platform order, the rest fold into "Other". */
const COLOURED = CT_PLATFORMS.filter((p) => p !== 'Other').slice(0, 7);
const platColour = (p: string) => { const i = COLOURED.indexOf(p); return i >= 0 ? SERIES[i] : OTHER; };

function bucketLabel(b: { key: string; start: string; end: string }, unit: string) {
  if (unit === 'day') return dm(b.key);
  if (unit === 'week') return dm(b.start);
  return `${MON[Number(b.key.slice(5, 7)) - 1]} ${b.key.slice(2, 4)}`;
}
function bucketTitle(b: { key: string; start: string; end: string }, unit: string) {
  if (unit === 'day') return dm(b.key) + ' ' + b.key.slice(0, 4);
  if (unit === 'week') return `Week of ${dm(b.start)} – ${dm(b.end)}`;
  return `${MON[Number(b.key.slice(5, 7)) - 1]} ${b.key.slice(0, 4)}`;
}

/**
 * Home dashboard on the Control Tower engine: headline numbers with trend
 * lines, activity over time, platform mix, lead time, ageing, an expiry
 * timeline, what needs attention, the journey, and each platform.
 */
export default function Dashboard() {
  const { range, pkey } = usePeriodStore();
  const [s, setS] = useState<any>(null);
  const [j, setJ] = useState<any>(null);
  const [t, setT] = useState<any>(null);
  const [error, setError] = useState('');
  const [measure, setMeasure] = useState<'count' | 'value'>('count');

  useEffect(() => {
    const q = { ...(range || {}) };
    setError('');
    Promise.all([controlTowerService.summary(q), controlTowerService.journey(q), controlTowerService.trends(q)])
      .then(([sum, jr, tr]) => { setS(sum); setJ(jr); setT(tr); })
      .catch((e) => setError(e?.response?.data?.message || 'Could not load the dashboard'));
  }, [range]);

  const a = s?.aggregate;
  const byTeam = TEAMS.map((tm) => {
    const flags = (s?.flags || []).filter((f: any) => f.team === tm && f.count > 0);
    return { team: tm, flags, total: flags.reduce((n: number, f: any) => n + f.count, 0) };
  });
  const top = j?.steps?.[0]?.n || 1;

  const view = useMemo(() => {
    if (!t) return null;
    const B: any[] = t.buckets;
    const labels = B.map((b) => bucketLabel(b, t.unit));
    const titles = B.map((b) => bucketTitle(b, t.unit));
    const activity: Series[] = measure === 'count'
      ? [
          { key: 'r', name: 'POs received', color: SERIES[0], values: B.map((b) => b.received) },
          { key: 'd', name: 'Invoices dispatched', color: SERIES[1], values: B.map((b) => b.dispatched) },
          { key: 'g', name: 'GRNs done', color: SERIES[2], values: B.map((b) => b.grnDone) },
        ]
      : [
          { key: 'r', name: 'PO value received', color: SERIES[0], values: B.map((b) => b.receivedValue) },
          { key: 'd', name: 'Value dispatched', color: SERIES[1], values: B.map((b) => b.dispatchedValue) },
        ];
    const present = new Set<string>();
    B.forEach((b) => Object.keys(b.byPlatform).forEach((p) => present.add(p)));
    const platSeries: Series[] = COLOURED.filter((p) => present.has(p)).map((p) => ({ key: p, name: p, color: platColour(p), values: B.map((b) => b.byPlatform[p] || 0) }));
    const others = [...present].filter((p) => !COLOURED.includes(p));
    if (others.length) platSeries.push({ key: 'Other', name: 'Other', color: OTHER, values: B.map((b) => others.reduce((n, p) => n + (b.byPlatform[p] || 0), 0)) });
    const lead: Series[] = [{ key: 'lead', name: 'Median days to dispatch', color: SERIES[0], values: B.map((b) => b.leadDays) }];
    const unitWord = t.unit === 'day' ? 'Daily' : t.unit === 'week' ? 'Weekly' : 'Monthly';
    return { B, labels, titles, activity, platSeries, lead, unitWord };
  }, [t, measure]);

  const expiryBars = t ? [{ label: 'Expired', n: t.expired.n, v: t.expired.v }, ...t.expiry.map((e: any, i: number) => ({ label: i === 0 ? 'Today' : dm(e.day), n: e.n, v: e.v }))] : [];
  const fmtM = measure === 'count' ? inr : money;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500">Every purchase order from receipt to GRN · {periodLabel(pkey, range)}</p>
          </div>
          <PeriodBar />
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        {!a && !error && (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-white border border-slate-200" />)}</div>
            <div className="h-80 rounded-xl bg-white border border-slate-200" />
          </div>
        )}

        {a && view && (
          <>
            {/* Headline numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat icon="package" label="Purchase orders" value={inr(a.n)} sub={`${money(a.value)} total value`} href="/control-tower?tab=register"
                spark={view.B.map((b: any) => b.received)} sparkColor={SERIES[0]} />
              <Stat icon="clock" label="Still open" value={inr(a.undecided + a.accNotDisp)} sub={`${inr(a.undecided)} awaiting a decision · ${inr(a.accNotDisp)} accepted, not dispatched`} href="/control-tower?tab=worklist" />
              <Stat icon="truck" label="Dispatched" value={inr(a.dispatched)} sub={`${money(a.invoiced)} invoiced · ${inr(a.stage[5].n)} in transit`} href="/control-tower?tab=register&stage=5"
                spark={view.B.map((b: any) => b.dispatched)} sparkColor={SERIES[1]} />
              <Stat icon="delivered" label="Fill rate" value={`${Math.round((a.fill || 0) * 100)}%`} sub="invoiced value ÷ PO value" meter={a.fill || 0} />
            </div>

            {/* Activity over time */}
            <ChartCard
              title="Activity over time"
              sub={`${view.unitWord} · POs by PO date, invoices by dispatch date, GRNs by GRN date`}
              action={<Segmented value={measure} onChange={(k) => setMeasure(k as any)} options={[{ k: 'count', label: 'Count' }, { k: 'value', label: 'Value (₹)' }]} />}
              legend={<Legend items={view.activity.map((x) => ({ name: x.name, color: x.color }))} />}
              table={{ head: ['Period', ...view.activity.map((x) => x.name)], rows: view.B.map((_: any, i: number) => [view.titles[i], ...view.activity.map((x) => fmtM(x.values[i] || 0))]) }}
            >
              <LineChart labels={view.labels} titles={view.titles} series={view.activity} height={280} fmt={fmtM} />
            </ChartCard>

            <div className="grid xl:grid-cols-2 gap-6">
              <ChartCard
                title="POs received by platform"
                sub={`${view.unitWord} count, by PO date`}
                legend={<Legend items={view.platSeries.map((x) => ({ name: x.name, color: x.color }))} />}
                table={{ head: ['Period', ...view.platSeries.map((x) => x.name), 'Total'], rows: view.B.map((b: any, i: number) => [view.titles[i], ...view.platSeries.map((x) => inr(x.values[i] || 0)), inr(b.received)]) }}
              >
                {view.platSeries.length ? <StackedBars labels={view.labels} titles={view.titles} series={view.platSeries} fmt={inr} /> : <Empty />}
              </ChartCard>
              <ChartCard
                title="Days from PO to first dispatch"
                sub="Median, for POs received in each period. Lower is faster."
                table={{ head: ['Period', 'Median days'], rows: view.B.map((b: any, i: number) => [view.titles[i], b.leadDays == null ? '-' : b.leadDays]) }}
              >
                {view.lead[0].values.some((v) => v != null) ? <LineChart labels={view.labels} titles={view.titles} series={view.lead} fmt={(n) => `${Math.round(n * 10) / 10} days`} axisFmt={(n) => compact(n)} /> : <Empty text="No dispatches yet for POs in this period." />}
              </ChartCard>
            </div>

            <div className="grid xl:grid-cols-2 gap-6">
              <ChartCard
                title="Open POs by age"
                sub={`${inr(t.openCount)} open POs (not yet dispatched), by days since the PO date${t.undated ? ` · ${inr(t.undated)} have no PO date` : ''}`}
                table={{ head: ['Age', 'POs', 'Value'], rows: t.age.map((x: any) => [x.label, inr(x.n), money(x.v)]) }}
              >
                <StackedBars labels={t.age.map((x: any) => x.label)} series={[{ key: 'age', name: 'Open POs', color: SERIES[0], values: t.age.map((x: any) => x.n) }]} fmt={inr} valueLabels height={230} />
              </ChartCard>
              <ChartCard
                title="Expiry timeline"
                sub="Open POs by expiry date: already expired, then the next 14 days"
                action={<Link href="/control-tower?tab=worklist&flag=2" className="text-sm text-ct-orange hover:underline">Expiring soon</Link>}
                table={{ head: ['Expiry', 'POs', 'Value'], rows: expiryBars.map((x: any) => [x.label, inr(x.n), money(x.v)]) }}
              >
                <StackedBars
                  labels={expiryBars.map((x: any) => x.label)}
                  series={[{ key: 'exp', name: 'Open POs', color: SERIES[0], values: expiryBars.map((x: any) => x.n) }]}
                  barColor={(i) => (i === 0 ? CRITICAL : undefined)} fmt={inr} height={230}
                />
                {t.expired.n > 0 && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-600"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CRITICAL }} /><b className="text-red-700">{inr(t.expired.n)} open {t.expired.n === 1 ? 'PO has' : 'POs have'} already expired</b> ({money(t.expired.v)}).</p>
                )}
              </ChartCard>
            </div>

            <div className="grid xl:grid-cols-[1.1fr_1fr] gap-6">
              {/* Needs attention */}
              <Panel title="Needs attention" action={<Link href="/control-tower?tab=worklist" className="text-sm text-ct-orange hover:underline">Open worklist</Link>}>
                {a.flags === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">Nothing needs action right now.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {byTeam.filter((x) => x.total).map((x) => (
                      <div key={x.team} className="py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-slate-800">{x.team}</span>
                          <span className="text-sm tabular-nums text-slate-500">{inr(x.total)} POs</span>
                        </div>
                        <ul className="space-y-1">
                          {x.flags.map((f: any) => (
                            <li key={f.n}>
                              <Link href={`/control-tower?tab=worklist&flag=${f.n}`} className="flex items-center gap-2 text-sm rounded-md px-2 py-1 -mx-2 hover:bg-slate-50">
                                <span className={`w-1.5 h-1.5 rounded-full ${f.n <= 2 ? 'bg-red-500' : f.n <= 6 ? 'bg-amber-500' : 'bg-slate-400'}`} />
                                <span className="flex-1 text-slate-700">{f.name}</span>
                                <b className={`tabular-nums ${f.n <= 2 ? 'text-red-600' : 'text-slate-900'}`}>{inr(f.count)}</b>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Journey */}
              <Panel title="Where the POs are" action={<Link href="/control-tower?tab=pipeline" className="text-sm text-ct-orange hover:underline">Full pipeline</Link>}>
                <ol className="space-y-2.5">
                  {j.steps.map((st: any) => (
                    <li key={st.k} className="grid grid-cols-[150px_1fr_88px] items-center gap-3 text-sm">
                      <span className="text-slate-600 truncate">{st.name}</span>
                      <span className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><i className="block h-full rounded-full" style={{ width: `${Math.max(1, (st.n / top) * 100)}%`, background: SERIES[0] }} /></span>
                      <span className="text-right tabular-nums"><b className="text-slate-900">{inr(st.n)}</b> <span className="text-xs text-slate-400">{Math.round((st.n / top) * 100)}%</span></span>
                    </li>
                  ))}
                </ol>
                {j.gaps.some((g: any) => g.n) && (
                  <p className="mt-4 text-xs text-slate-500">
                    Biggest drop: {(() => { const g = [...j.gaps].sort((x: any, y: any) => y.n - x.n)[0]; return <Link href={`/control-tower?tab=register&gap=${g.k}`} className="text-ct-orange hover:underline">{inr(g.n)} POs {g.label}</Link>; })()}
                  </p>
                )}
              </Panel>
            </div>

            {/* Platforms */}
            <Panel title="Platforms" action={<Link href="/control-tower?tab=compare" className="text-sm text-ct-orange hover:underline">Compare</Link>}>
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <tr><th className="px-5 py-2 font-medium">Platform</th><th className="px-3 py-2 font-medium text-right">POs</th><th className="px-3 py-2 font-medium text-right">Open</th><th className="px-3 py-2 font-medium text-right">Dispatched value</th><th className="px-3 py-2 font-medium">Fill rate</th><th className="px-5 py-2 font-medium text-right">Urgent</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.platforms.filter((p: any) => p.n > 0).map((p: any) => (
                      <tr key={p.platform} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5"><Link href={`/control-tower/${platformSlug(p.platform)}`} className="hover:text-ct-orange"><PlatformName p={p.platform} size={22} /></Link></td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{inr(p.n)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{inr(p.open)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(p.invoiced)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2 min-w-[140px]">
                            <span className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden"><i className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.round((p.fill || 0) * 100))}%`, background: platColour(p.platform) }} /></span>
                            <span className="w-10 text-right tabular-nums">{Math.round((p.fill || 0) * 100)}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{p.urgent ? <b className="text-red-600">{p.urgent}</b> : <span className="text-slate-400">0</span>}</td>
                      </tr>
                    ))}
                    {!s.platforms.some((p: any) => p.n > 0) && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No POs in this period yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Shortcuts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Shortcut href="/bulk-import" icon="upload" label="Upload POs" />
              <Shortcut href="/pos/new" icon="plus" label="Add a PO" />
              <Shortcut href="/control-tower?tab=handover" icon="clipboard" label="Record a handover" />
              <Shortcut href="/control-tower?tab=recon" icon="calendar" label="Daily reconciliation" />
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}

const Stat: React.FC<{ icon: string; label: string; value: string; sub: string; href?: string; spark?: number[]; sparkColor?: string; meter?: number }> = ({ icon, label, value, sub, href, spark, sparkColor, meter }) => {
  const body = (
    <div className="h-full bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition-colors flex flex-col">
      <div className="flex items-center gap-2 text-slate-500"><Icon name={icon} size={16} /><span className="text-sm">{label}</span></div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500 leading-relaxed">{sub}</p>
      <div className="mt-auto pt-3">
        {spark && spark.length > 1 && <Sparkline values={spark} color={sparkColor} />}
        {meter != null && <span className="block h-2 rounded-full bg-slate-100 overflow-hidden"><i className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.round(meter * 100))}%`, background: SERIES[2] }} /></span>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
};

const Panel: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <section className="min-w-0 bg-white rounded-xl border border-slate-200 p-5">
    <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-slate-900">{title}</h2>{action}</div>
    {children}
  </section>
);

const Empty: React.FC<{ text?: string }> = ({ text = 'No POs in this period yet.' }) => <p className="py-16 text-center text-sm text-slate-400">{text}</p>;

const Shortcut: React.FC<{ href: string; icon: string; label: string }> = ({ href, icon, label }) => (
  <Link href={href} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:border-ct-orange hover:text-ct-orange transition-colors">
    <Icon name={icon} size={18} />{label}
  </Link>
);
