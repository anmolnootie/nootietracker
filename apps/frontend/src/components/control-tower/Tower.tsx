import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { controlTowerService } from '@/services/control-tower.service';
import { periodLabel, usePeriodStore } from '@/store/period.store';
import { Card, CtRow, FLAG_TONE, fd, inr, money, PeriodBar, StageKanban, TONE } from './ui';
import { PoJourneyDrawer } from './PoJourneyDrawer';

/**
 * Platform marks. The artifact's logo images aren't in the reference source, so
 * these are brand-coloured monograms; drop real files into public/logos/<slug>.png
 * and set `img` to switch.
 */
const MARK: Record<string, { bg: string; fg: string; t: string; img?: string }> = {
  Blinkit: { bg: '#F8CB46', fg: '#0C831F', t: 'b' },
  Zepto: { bg: '#5A1E96', fg: '#FFFFFF', t: 'Z' },
  'Swiggy Instamart': { bg: '#FC8019', fg: '#FFFFFF', t: 'SI' },
  BigBasket: { bg: '#84C225', fg: '#FFFFFF', t: 'bb' },
  Flipkart: { bg: '#2874F0', fg: '#FFE500', t: 'F' },
  Amazon: { bg: '#232F3E', fg: '#FF9900', t: 'a' },
  Supertails: { bg: '#1E3A8A', fg: '#FFFFFF', t: 'St' },
  FirstClub: { bg: '#111827', fg: '#F6A21E', t: 'FC' },
  'Tata 1mg': { bg: '#FF6F61', fg: '#FFFFFF', t: '1mg' },
  Other: { bg: '#E5E7EB', fg: '#4B5563', t: '•' },
};
export const PlatformLogo: React.FC<{ p: string; size?: number }> = ({ p, size = 36 }) => {
  const m = MARK[p] || MARK.Other;
  if (m.img) return <img src={m.img} alt={p} width={size} height={size} className="rounded-lg object-contain" />;
  return (
    <span aria-label={p} className="inline-flex items-center justify-center rounded-lg font-bold shrink-0" style={{ width: size, height: size, background: m.bg, color: m.fg, fontSize: size * (m.t.length > 2 ? 0.3 : 0.42) }}>
      {m.t}
    </span>
  );
};
export const platformSlug = (p: string) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const TEAMS = ['Order desk', 'Warehouse', 'Logistics', 'Accounts'];

/** One control tower: Overall (platform 'ALL') or a single platform. Tiles, work list, kanban, links to pipeline and register. */
export const Tower: React.FC<{ platform: string }> = ({ platform }) => {
  const { range, pkey } = usePeriodStore();
  const [sum, setSum] = useState<any>(null);
  const [rows, setRows] = useState<CtRow[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [flag, setFlag] = useState('');
  const [team, setTeam] = useState('');
  const [limit, setLimit] = useState(50);
  const [open, setOpen] = useState<string | null>(null);
  const isAll = platform === 'ALL';

  useEffect(() => {
    const q = { ...(range || {}), platform };
    Promise.all([controlTowerService.summary(q), controlTowerService.register(q), controlTowerService.meta()]).then(([s, r, m]) => {
      setSum(s); setRows(r.rows); setMeta(m);
    });
  }, [range, platform]);

  const flagInfo = (n: number) => meta?.flags?.find((f: any) => f.n === n);
  const work = useMemo(() => rows
    .filter((d) => d.pri > 0 && (!flag || d.pri === +flag) && (!team || flagInfo(d.pri)?.team === team))
    .sort((a, b) => a.pri - b.pri || (a.dte ?? 999) - (b.dte ?? 999)), [rows, flag, team, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = sum?.aggregate;
  const regLink = (extra: Record<string, string> = {}) => ({ pathname: '/control-tower/register', query: { ...(isAll ? {} : { platform }), ...extra } });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          {isAll ? <span className="w-11 h-11 rounded-lg bg-ct-orange text-white flex items-center justify-center text-xl">🛰</span> : <PlatformLogo p={platform} size={44} />}
          <div>
            <h1 className="text-2xl font-bold text-ct-ink">{isAll ? 'Overall' : platform} control tower</h1>
            <p className="text-sm text-gray-500">{isAll ? 'Every platform together.' : `Everything below is only ${platform}.`} {periodLabel(pkey, range)}.</p>
          </div>
        </div>
        <PeriodBar />
      </div>

      {!a && <p className="text-gray-500">Loading...</p>}
      {a && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Tile label="POs" value={inr(a.n)} sub={money(a.value)} />
            <Tile label="Decision pending" value={inr(a.undecided)} sub={money(a.undecidedValue)} tone={a.undecided ? 'info' : ''} href={regLink({ stage: '1' })} />
            <Tile label="Accepted, not dispatched" value={inr(a.accNotDisp)} sub={money(a.notDispValue)} tone={a.accNotDisp ? 'warn' : ''} />
            <Tile label="Action items" value={inr(a.flags)} sub={`${inr(a.expiring)} expired or expiring`} tone={a.expiring ? 'crit' : a.flags ? 'warn' : ''} />
            <Tile label="Dispatched" value={inr(a.dispatched)} sub={`${money(a.invoiced)} invoiced`} />
            <Tile label="Fill rate" value={`${Math.round(a.fill * 100)}%`} sub="invoiced ÷ PO value" />
          </div>

          <div className="flex gap-3 text-sm">
            <Link href={{ pathname: '/control-tower/pipeline', query: isAll ? {} : { platform } }} className="px-3 py-1.5 rounded border border-ct-orange text-ct-orange hover:bg-orange-50">Pipeline →</Link>
            <Link href={regLink()} className="px-3 py-1.5 rounded border border-ct-orange text-ct-orange hover:bg-orange-50">PO register →</Link>
          </div>

          {isAll && sum.platforms.length > 0 && (
            <Card title="Platforms" sub="One control tower per platform">
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {sum.platforms.map((p: any) => (
                  <Link key={p.platform} href={`/control-tower/${platformSlug(p.platform)}`} className={`flex items-center gap-3 p-3 rounded-lg border hover:shadow-sm ${p.expiring ? 'border-red-200' : p.flags ? 'border-amber-200' : 'border-gray-200'}`}>
                    <PlatformLogo p={p.platform} size={44} />
                    <div className="min-w-0">
                      <b className="text-ct-ink">{p.platform}</b>
                      <p className="text-xs text-gray-500">{inr(p.n)} POs · {money(p.value)}</p>
                      <p className="text-xs text-gray-500">{inr(p.open)} open · {inr(p.flags)} need action</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <Card title="Work list" sub="POs that need action, most urgent first">
            <div className="flex flex-wrap gap-2 mb-3 text-sm">
              <select value={flag} onChange={(e) => setFlag(e.target.value)} className="border rounded px-2 py-1">
                <option value="">All flags</option>
                {meta?.flags?.map((f: any) => <option key={f.n} value={f.n}>{f.name} ({inr(a.flag[f.n])})</option>)}
              </select>
              <select value={team} onChange={(e) => setTeam(e.target.value)} className="border rounded px-2 py-1">
                <option value="">All teams</option>
                {TEAMS.map((t) => <option key={t}>{t}</option>)}
              </select>
              <span className="text-xs text-gray-500 self-center">{inr(work.length)} POs · {money(work.reduce((s, d) => s + (d.value || 0), 0))}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500 bg-ct-cream">
                  <tr>{['Flag', 'PO', ...(isAll ? ['Platform'] : []), 'Facility', 'Expiry', 'Value', 'Age', 'Team', 'Next action'].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {work.slice(0, limit).map((d) => {
                    const f = flagInfo(d.pri);
                    return (
                      <tr key={d.po} onClick={() => setOpen(d.po)} className="border-t hover:bg-orange-50 cursor-pointer">
                        <td className="px-2 py-1.5"><span className={`text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${TONE[FLAG_TONE[d.pri]]}`}>{d.flagName}</span></td>
                        <td className="px-2 py-1.5 font-mono text-xs">{d.po}</td>
                        {isAll && <td className="px-2 py-1.5">{d.plat}</td>}
                        <td className="px-2 py-1.5 truncate max-w-[10rem]">{d.loc}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{d.exp ? `${fd(d.exp)} (${d.dte! < 0 ? d.dte : `+${d.dte}`}d)` : ''}</td>
                        <td className="px-2 py-1.5 tabular-nums">{money(d.value)}</td>
                        <td className="px-2 py-1.5 tabular-nums">{d.age ?? ''}</td>
                        <td className="px-2 py-1.5">{f?.team}</td>
                        <td className="px-2 py-1.5 text-xs text-gray-600">{f?.act}</td>
                      </tr>
                    );
                  })}
                  {!work.length && <tr><td colSpan={9} className="px-2 py-6 text-center text-gray-400">No POs need action with these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            {work.length > limit && <button onClick={() => setLimit(limit + 100)} className="mt-2 text-sm text-ct-orange">Show {Math.min(100, work.length - limit)} more</button>}
          </Card>

          <Card title="Open POs by stage" sub="Kanban of every PO still moving">
            <StageKanban rows={rows} stages={meta?.stages || []} onOpen={setOpen} />
          </Card>
        </>
      )}
      <PoJourneyDrawer po={open} onClose={() => setOpen(null)} />
    </div>
  );
};

const Tile: React.FC<{ label: string; value: string; sub?: string; tone?: string; href?: any }> = ({ label, value, sub, tone, href }) => {
  const body = (
    <div className={`rounded-xl border p-4 bg-white h-full ${tone ? TONE[tone] : 'border-orange-100'}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs opacity-80 mt-0.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
};
