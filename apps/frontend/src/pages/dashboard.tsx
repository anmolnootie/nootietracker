import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import { controlTowerService } from '@/services/control-tower.service';
import { periodLabel, usePeriodStore } from '@/store/period.store';
import { inr, money, PeriodBar } from '@/components/control-tower/ui';
import { PlatformName, platformSlug } from '@/components/control-tower/brand';

const TEAMS = ['Order desk', 'Warehouse', 'Logistics', 'Accounts'];

/**
 * Home dashboard: a plain-language summary built on the Control Tower engine.
 * Four headline numbers, what needs attention by team, where POs are in the
 * journey, and each platform at a glance. Neutral colours; red only for urgent.
 */
export default function Dashboard() {
  const { range, pkey } = usePeriodStore();
  const [s, setS] = useState<any>(null);
  const [j, setJ] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = { ...(range || {}) };
    setError('');
    Promise.all([controlTowerService.summary(q), controlTowerService.journey(q)])
      .then(([sum, jr]) => { setS(sum); setJ(jr); })
      .catch((e) => setError(e?.response?.data?.message || 'Could not load the dashboard'));
  }, [range]);

  const a = s?.aggregate;
  const byTeam = TEAMS.map((t) => {
    const flags = (s?.flags || []).filter((f: any) => f.team === t && f.count > 0);
    return { team: t, flags, total: flags.reduce((n: number, f: any) => n + f.count, 0) };
  });
  const top = j?.steps?.[0]?.n || 1;

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
        {!a && !error && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-white border border-slate-200" />)}</div>}

        {a && (
          <>
            {/* Headline numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat icon="package" label="Purchase orders" value={inr(a.n)} sub={`${money(a.value)} total value`} href="/control-tower?tab=register" />
              <Stat icon="clock" label="Still open" value={inr(a.undecided + a.accNotDisp)} sub={`${inr(a.undecided)} awaiting a decision · ${inr(a.accNotDisp)} accepted, not dispatched`} href="/control-tower?tab=worklist" />
              <Stat icon="truck" label="Dispatched" value={inr(a.dispatched)} sub={`${money(a.invoiced)} invoiced · ${inr(a.stage[5].n)} in transit`} href="/control-tower?tab=register&stage=5" />
              <Stat icon="delivered" label="Fill rate" value={`${Math.round((a.fill || 0) * 100)}%`} sub="invoiced value ÷ PO value" />
            </div>

            <div className="grid xl:grid-cols-[1.1fr_1fr] gap-6">
              {/* Needs attention */}
              <Panel title="Needs attention" action={<Link href="/control-tower?tab=worklist" className="text-sm text-ct-orange hover:underline">Open worklist</Link>}>
                {a.flags === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">Nothing needs action right now.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {byTeam.filter((t) => t.total).map((t) => (
                      <div key={t.team} className="py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-slate-800">{t.team}</span>
                          <span className="text-sm tabular-nums text-slate-500">{inr(t.total)} POs</span>
                        </div>
                        <ul className="space-y-1">
                          {t.flags.map((f: any) => (
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
                  {j.steps.map((st: any, i: number) => (
                    <li key={st.k} className="grid grid-cols-[150px_1fr_64px] items-center gap-3 text-sm">
                      <span className="text-slate-600 truncate">{st.name}</span>
                      <span className="h-2 rounded-full bg-slate-100 overflow-hidden"><i className="block h-full rounded-full bg-slate-700" style={{ width: `${Math.max(1, (st.n / top) * 100)}%`, opacity: 0.35 + (0.65 * (8 - i)) / 8 }} /></span>
                      <b className="text-right tabular-nums text-slate-900">{inr(st.n)}</b>
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
                    <tr><th className="px-5 py-2 font-medium">Platform</th><th className="px-3 py-2 font-medium text-right">POs</th><th className="px-3 py-2 font-medium text-right">Open</th><th className="px-3 py-2 font-medium text-right">Dispatched value</th><th className="px-3 py-2 font-medium text-right">Fill rate</th><th className="px-5 py-2 font-medium text-right">Urgent</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.platforms.filter((p: any) => p.n > 0).map((p: any) => (
                      <tr key={p.platform} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5"><Link href={`/control-tower/${platformSlug(p.platform)}`} className="hover:text-ct-orange"><PlatformName p={p.platform} size={22} /></Link></td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{inr(p.n)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{inr(p.open)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(p.invoiced)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{Math.round((p.fill || 0) * 100)}%</td>
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

const Stat: React.FC<{ icon: string; label: string; value: string; sub: string; href?: string }> = ({ icon, label, value, sub, href }) => {
  const body = (
    <div className="h-full bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition-colors">
      <div className="flex items-center gap-2 text-slate-500"><Icon name={icon} size={16} /><span className="text-sm">{label}</span></div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500 leading-relaxed">{sub}</p>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
};

const Panel: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <section className="bg-white rounded-xl border border-slate-200 p-5">
    <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-slate-900">{title}</h2>{action}</div>
    {children}
  </section>
);

const Shortcut: React.FC<{ href: string; icon: string; label: string }> = ({ href, icon, label }) => (
  <Link href={href} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:border-ct-orange hover:text-ct-orange transition-colors">
    <Icon name={icon} size={18} />{label}
  </Link>
);
