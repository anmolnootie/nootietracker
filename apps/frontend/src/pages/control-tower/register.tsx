import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { controlTowerService } from '@/services/control-tower.service';
import { periodLabel, usePeriodStore } from '@/store/period.store';
import { CtRow, FLAG_TONE, fd, inr, money, PeriodBar, TONE } from '@/components/control-tower/ui';
import { PoJourneyDrawer } from '@/components/control-tower/PoJourneyDrawer';

const PAGE = 100;

/** PO register: every PO in the period with where it stands. Query: platform, gap, stage, flag, q. */
export default function RegisterPage() {
  const router = useRouter();
  const { range, pkey } = usePeriodStore();
  const qp = router.query as Record<string, string>;
  const [data, setData] = useState<{ count: number; value: number; rows: CtRow[] } | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [search, setSearch] = useState(qp.q || '');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { controlTowerService.meta().then(setMeta); }, []);
  useEffect(() => {
    if (!router.isReady) return;
    setPage(0);
    controlTowerService
      .register({ ...(range || {}), platform: qp.platform, gap: qp.gap, stage: qp.stage ? +qp.stage : undefined, flag: qp.flag ? +qp.flag : undefined, q: qp.q })
      .then(setData);
  }, [range, router.isReady, qp.platform, qp.gap, qp.stage, qp.flag, qp.q]);

  const setQuery = (patch: Record<string, string | undefined>) => {
    const next = { ...qp, ...patch };
    Object.keys(next).forEach((k) => !next[k] && delete next[k]);
    router.push({ pathname: router.pathname, query: next });
  };
  const gapLabel = useMemo(() => meta?.gaps?.find((g: any) => g.k === qp.gap)?.label, [meta, qp.gap]);
  const rows = data?.rows || [];

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-ct-orange font-semibold">{qp.platform || 'Overall'} control tower</p>
            <h1 className="text-2xl font-bold text-ct-ink">PO register</h1>
            <p className="text-sm text-gray-500">Every PO in the period, with where it stands. Click a row for its full story.</p>
          </div>
          <PeriodBar />
        </div>

        <div className="flex flex-wrap gap-2 items-center text-sm">
          <select value={qp.platform || ''} onChange={(e) => setQuery({ platform: e.target.value || undefined })} className="border rounded px-2 py-1">
            <option value="">All platforms</option>
            {meta?.platforms?.map((p: string) => <option key={p}>{p}</option>)}
          </select>
          <select value={qp.stage || ''} onChange={(e) => setQuery({ stage: e.target.value || undefined })} className="border rounded px-2 py-1">
            <option value="">Any stage</option>
            {meta?.stages?.map((s: any) => <option key={s.n} value={s.n}>{s.n}. {s.short}</option>)}
          </select>
          <select value={qp.flag || ''} onChange={(e) => setQuery({ flag: e.target.value || undefined })} className="border rounded px-2 py-1">
            <option value="">Any flag</option>
            {meta?.flags?.map((f: any) => <option key={f.n} value={f.n}>{f.name}</option>)}
          </select>
          <form onSubmit={(e) => { e.preventDefault(); setQuery({ q: search || undefined }); }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO or facility" className="border rounded px-2 py-1" />
          </form>
          {qp.gap && (
            <span className="px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-700">
              Gap: {gapLabel || qp.gap} <button onClick={() => setQuery({ gap: undefined })} className="ml-1" aria-label="Clear gap">✕</button>
            </span>
          )}
        </div>

        <p className="text-xs text-gray-500">
          <b>{inr(data?.count)}</b> POs · {money(data?.value)} · {periodLabel(pkey, range).toLowerCase()}
          {rows.length > PAGE ? ` · showing ${page * PAGE + 1}–${Math.min(rows.length, page * PAGE + PAGE)}` : ''}
        </p>

        <div className="bg-white rounded-xl border border-orange-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ct-cream text-left text-xs text-gray-600">
              <tr>{['PO', 'Platform', 'Facility', 'PO date', 'Expiry', 'Value', 'Decision', 'Stage', 'Flag', 'Invoices', 'Owner'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(page * PAGE, page * PAGE + PAGE).map((d) => (
                <tr key={d.po} onClick={() => setOpen(d.po)} className="border-t hover:bg-orange-50 cursor-pointer">
                  <td className="px-3 py-2 font-mono text-xs">{d.po}</td>
                  <td className="px-3 py-2">{d.plat}</td>
                  <td className="px-3 py-2 truncate max-w-[12rem]">{d.loc}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fd(d.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fd(d.exp)}</td>
                  <td className="px-3 py-2 tabular-nums">{money(d.value)}</td>
                  <td className="px-3 py-2">{d.dec}</td>
                  <td className="px-3 py-2">{d.stage}. {d.stageShort}</td>
                  <td className="px-3 py-2">{d.pri > 0 && <span className={`text-[11px] px-1.5 py-0.5 rounded border ${TONE[FLAG_TONE[d.pri]]}`}>{d.flagName}</span>}</td>
                  <td className="px-3 py-2 tabular-nums">{d.invCount || ''}</td>
                  <td className="px-3 py-2">{d.owner}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">{data ? 'No POs match.' : 'Loading...'}</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length > PAGE && (
          <div className="flex justify-center items-center gap-3 text-sm">
            <button disabled={!page} onClick={() => setPage(page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">← Previous</button>
            <span>Page {page + 1} of {Math.ceil(rows.length / PAGE)}</span>
            <button disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>
      <PoJourneyDrawer po={open} onClose={() => setOpen(null)} />
    </MainLayout>
  );
}
