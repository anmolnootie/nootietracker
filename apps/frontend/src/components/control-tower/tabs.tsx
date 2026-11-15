import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { controlTowerService } from '@/services/control-tower.service';
import { istToday } from '@/store/period.store';
import { Card, CtRow, FLAG_TONE, fd, inr, money, StackBoard, StageKanban, TONE } from './ui';
import { CT_PLATFORMS, PlatformLogo, PlatformName, platformSlug } from './brand';
import { useCanEditCt } from './TeamFieldsForm';
import { ISSUE_STATUS, PRI_TONE } from './PoIssuesPanel';
import { useCt } from './Shell';

const TEAMS = ['Order desk', 'Warehouse', 'Logistics', 'Accounts'];
const pct = (x: number | null | undefined) => (x == null ? '-' : `${Math.round(x * 100)}%`);

/* ---------------- shared bits ---------------- */

const Tile: React.FC<{ label: string; value: string; sub?: string; tone?: 'crit' | 'warn' | 'info' | 'ok' | ''; href?: any; accent?: string }> = ({ label, value, sub, tone = '', href, accent }) => {
  const ring = tone === 'crit' ? 'ring-red-200 bg-red-50/60' : tone === 'warn' ? 'ring-amber-200 bg-amber-50/60' : tone === 'info' ? 'ring-sky-200 bg-sky-50/60' : tone === 'ok' ? 'ring-emerald-200 bg-emerald-50/60' : 'ring-[#efe3d6] bg-white';
  const body = (
    <div className={`relative h-full rounded-2xl ring-1 ${ring} p-4 shadow-[0_1px_2px_rgba(43,33,24,0.05)] hover:shadow-md transition-shadow overflow-hidden`}>
      <i className="absolute left-0 top-0 h-full w-1" style={{ background: accent || (tone === 'crit' ? '#dc2626' : tone === 'warn' ? '#f59e0b' : tone === 'info' ? '#0ea5e9' : tone === 'ok' ? '#10b981' : '#e8591a') }} />
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-[26px] leading-none font-bold tabular-nums text-ct-ink">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-gray-500 truncate">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
};

const Table: React.FC<{ head: string[]; children: React.ReactNode; empty?: boolean; emptyText?: string; right?: number[] }> = ({ head, children, empty, emptyText, right = [] }) => (
  <div className="overflow-x-auto rounded-xl ring-1 ring-[#efe3d6] bg-white">
    <table className="w-full text-sm">
      <thead className="bg-[#fbf4ec] text-left text-[11px] uppercase tracking-wider text-gray-500">
        <tr>{head.map((h, i) => <th key={h} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${right.includes(i) ? 'text-right' : ''}`}>{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-[#f3ebe2]">
        {children}
        {empty && <tr><td colSpan={head.length} className="px-3 py-10 text-center text-gray-400">{emptyText || 'Nothing here.'}</td></tr>}
      </tbody>
    </table>
  </div>
);

const FlagChip: React.FC<{ d: CtRow }> = ({ d }) => (d.pri > 0 ? <span className={`text-[11px] px-1.5 py-0.5 rounded-md border whitespace-nowrap ${TONE[FLAG_TONE[d.pri]]}`}>{d.pri}. {d.flagName}</span> : null);

/** Quick handover / ack prompt for one PO (the artifact's Hand-one drawer). */
const QuickHand: React.FC<{ po: string; mode: 'handed' | 'ack'; onDone: () => void; onClose: () => void }> = ({ po, mode, onDone, onClose }) => {
  const [person, setPerson] = useState('');
  const [date, setDate] = useState(istToday());
  const [err, setErr] = useState('');
  const save = async () => {
    try { await controlTowerService.handover({ mode, date, person, poNumbers: [po] }); onDone(); onClose(); } catch (e: any) { setErr(e?.response?.data?.message || 'Could not save'); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-5 w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-ct-ink">{mode === 'handed' ? 'Printout handed to warehouse' : 'Warehouse acknowledged'} · <span className="font-mono text-sm">{po}</span></h3>
        <label className="block text-xs text-gray-600">{mode === 'handed' ? 'Handed to (person)' : 'Acknowledged by'}<input autoFocus value={person} onChange={(e) => setPerson(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" /></label>
        <label className="block text-xs text-gray-600">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" /></label>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end"><button onClick={onClose} className="px-3 py-1.5 rounded-lg border text-sm">Cancel</button><button onClick={save} className="px-3 py-1.5 rounded-lg bg-ct-orange text-white text-sm">Save</button></div>
      </div>
    </div>
  );
};

/* ---------------- Overview ---------------- */

export const OverviewTab: React.FC = () => {
  const { summary, rows, isAll, platform, tabHref, openPo } = useCt();
  const a = summary.aggregate;
  const facilities = useMemo(() => {
    const m = new Map<string, { n: number; v: number; inv: number; flagged: number; open: number }>();
    rows.forEach((d) => {
      const k = d.loc || '(no facility)';
      const o = m.get(k) || { n: 0, v: 0, inv: 0, flagged: 0, open: 0 };
      o.n++; o.v += d.value || 0; o.inv += (d as any).invoiced || 0; if (d.pri) o.flagged++; if (d.stage <= 4) o.open++;
      m.set(k, o);
    });
    return [...m.entries()].sort((x, y) => y[1].n - x[1].n);
  }, [rows]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Tile label="POs" value={inr(a.n)} sub="in this period" href={tabHref('register')} />
        <Tile label="PO value" value={money(a.value)} sub="amount, else invoiced" />
        <Tile label="Invoiced" value={money(a.invoiced)} sub={`${inr(a.dispatched)} POs dispatched`} tone="ok" />
        <Tile label="Fill rate" value={pct(a.fill)} sub="invoiced ÷ PO value" accent="#f6a21e" />
        <Tile label="Awaiting decision" value={inr(a.undecided)} sub={money(a.undecidedValue)} tone={a.undecided ? 'info' : ''} href={tabHref('register', { stage: '1' })} />
        <Tile label="Accepted, not dispatched" value={inr(a.accNotDisp)} sub={money(a.notDispValue)} tone={a.accNotDisp ? 'warn' : ''} href={tabHref('handover')} />
        <Tile label="In transit" value={inr(a.stage[5].n)} sub={money(a.stage[5].v)} href={tabHref('register', { stage: '5' })} />
        <Tile label="GRN pending" value={inr(a.stage[6].n)} sub={money(a.stage[6].v)} tone={a.stage[6].n ? 'warn' : ''} href={tabHref('register', { stage: '6' })} />
        <Tile label="RTO" value={inr(a.stage[7].n)} sub={money(a.stage[7].v)} tone={a.stage[7].n ? 'crit' : ''} href={tabHref('register', { stage: '7' })} />
        <Tile label="Urgent" value={inr(a.urgent)} sub={`${inr(a.flags)} flagged in total`} tone={a.urgent ? 'crit' : 'ok'} href={tabHref('worklist')} />
      </div>

      {isAll ? (
        <Card title="Platforms at a glance" sub="Every platform has its own control tower. Urgent counts are across all time.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {summary.platforms.map((p: any) => (
              <Link key={p.platform} href={`/control-tower/${platformSlug(p.platform)}`} className={`group rounded-2xl ring-1 p-4 bg-white hover:shadow-md transition ${p.urgentAllTime ? 'ring-red-200' : 'ring-[#efe3d6]'}`}>
                <div className="flex items-center gap-3">
                  <PlatformLogo p={p.platform} size={44} />
                  <div className="min-w-0">
                    <b className="block text-ct-ink truncate group-hover:text-ct-orange">{p.platform}</b>
                    <span className="text-xs text-gray-500">{p.n ? `${inr(p.n)} POs · ${money(p.value)}` : 'No POs yet'}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Fill {pct(p.n ? p.fill : null)}</span>
                  {p.urgentAllTime > 0 ? <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-semibold">{p.urgentAllTime} urgent</span> : <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">clear</span>}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      ) : (
        <Card title={`${platform} by facility`} sub="POs, value, invoiced and flagged, by the platform's warehouse or hub">
          <Table head={['Facility', 'POs', 'Open', 'PO value', 'Invoiced', 'Flagged']} right={[1, 2, 3, 4, 5]} empty={!facilities.length} emptyText={`No ${platform} POs in this period. Upload them on Upload / Bulk Import.`}>
            {facilities.map(([k, o]) => (
              <tr key={k} className="hover:bg-orange-50/40">
                <td className="px-3 py-2">{k}</td><td className="px-3 py-2 text-right tabular-nums">{inr(o.n)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(o.open)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(o.v)}</td><td className="px-3 py-2 text-right tabular-nums">{money(o.inv)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{o.flagged ? <b className="text-red-700">{o.flagged}</b> : 0}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title="Problem flags" sub="Each flag has one owner team and one next action. Click to open the worklist.">
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-2">
          {summary.flags.map((f: any) => (
            <Link key={f.n} href={tabHref('worklist', { flag: String(f.n) })} className={`rounded-xl border px-3 py-2 hover:shadow-sm ${f.count ? TONE[f.tone] : 'bg-white border-gray-100 text-gray-400'}`}>
              <div className="flex justify-between items-baseline gap-2"><span className="text-xs font-medium truncate">{f.n}. {f.name}</span><b className="tabular-nums">{inr(f.count)}</b></div>
              <p className="text-[11px] opacity-80">{f.team} · {money(f.value)}</p>
            </Link>
          ))}
        </div>
      </Card>

      <Card title="Open POs by stage" sub="Flagged POs first, then the oldest">
        <StageKanbanWithMeta onOpen={openPo} />
      </Card>
    </>
  );
};

const StageKanbanWithMeta: React.FC<{ onOpen: (po: string) => void }> = ({ onOpen }) => {
  const { rows, meta } = useCt();
  return <StageKanban rows={rows} stages={meta?.stages || []} onOpen={onOpen} />;
};

/* ---------------- Pipeline ---------------- */

const STEP_BAR = ['#f9c79f', '#f6ad79', '#f19455', '#e8591a', '#f39a1e', '#f6a21e', '#34c18a', '#109e6c'];
const D_TONE = { Delivered: 'ok', 'In Transit': 'info', Dispatched: 'info', Arrived: 'info', RTO: 'crit' };
const G_TONE = { Done: 'ok', Pending: 'warn', NA: 'mute' };

export const PipelineTab: React.FC = () => {
  const { range, platform, tabHref, openPo } = useCt();
  const [j, setJ] = useState<any>(null);
  useEffect(() => { controlTowerService.journey({ ...(range || {}), platform }).then(setJ); }, [range, platform]);
  if (!j) return <p className="text-gray-500">Loading the pipeline...</p>;
  const top = j.steps[0].n || 1;
  const sd = j.side;
  return (
    <>
      <Card title="End-to-end journey" sub={`${inr(j.count)} POs. A PO that reaches a later step counts as having passed the earlier ones, so the red pills show exactly where POs stopped.`}>
        <ol className="space-y-1.5">
          {j.steps.map((s: any, i: number) => {
            const w = Math.max(1.5, (s.n / top) * 100);
            const gap = i < j.steps.length - 1 ? j.gaps[i] : null;
            return (
              <li key={s.k}>
                <div className="grid grid-cols-[minmax(180px,240px)_1fr_120px] items-center gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0" style={{ background: STEP_BAR[i] }}>{i + 1}</span>
                    <div className="min-w-0"><b className="block text-sm text-ct-ink truncate">{s.name}</b><span className="text-[11px] text-gray-500">{s.hint}</span></div>
                  </div>
                  <div className="h-7 rounded-lg bg-[#f6eee5] overflow-hidden"><i className="block h-full rounded-lg transition-all" style={{ width: `${w}%`, background: STEP_BAR[i] }} /></div>
                  <div className="text-right"><b className="text-lg tabular-nums text-ct-ink">{inr(s.n)}</b><p className="text-[11px] text-gray-500">{money(s.v)} · {Math.round((s.n / top) * 100)}%</p></div>
                </div>
                {gap && (
                  <div className="pl-10 py-1">
                    {gap.n > 0 ? (
                      <Link href={tabHref('register', { gap: gap.k })} className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-red-50 ring-1 ring-red-200 text-red-700 hover:bg-red-100">
                        <span aria-hidden>↓</span><b>{inr(gap.n)} POs</b> {gap.label} · {money(gap.v)} · <u>see which</u>
                      </Link>
                    ) : <span className="text-[11px] text-gray-400 pl-1">Nothing lost between these two steps</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card title="Dispatch and delivery" sub="Every invoice, by delivery status"><StackBoard data={sd.ds} order={['Delivered', 'In Transit', 'Dispatched', 'Arrived', 'RTO']} tone={D_TONE} /></Card>
        <Card title="GRN (platform receipt)" sub="Every invoice, by GRN status"><StackBoard data={sd.gs} order={['Done', 'Pending', 'NA']} tone={G_TONE} /></Card>
        <Card title="Returns and credit notes" sub="Returned shipments and their credit notes">
          <Legend items={[['bg-red-500', 'Returned to us (RTO)', inr(sd.rto.n), money(sd.rto.v)], ['bg-emerald-500', 'Credit notes raised', inr(sd.cnRaised.n), money(sd.cnRaised.v)], ['bg-amber-400', 'Waiting for a credit note', inr(sd.cnPending.n), money(sd.cnPending.v)]]} />
        </Card>
        <Card title="Short, damaged and excess" sub="Value reported on GRN">
          <Legend items={[['bg-amber-400', 'Shortage', '', money(sd.short.v)], ['bg-orange-500', 'Damage', '', money(sd.dmg.v)], ['bg-sky-500', 'Excess', '', money(sd.exc.v)]]} />
        </Card>
        <Card title="E-way bills" sub="Entered by the team on each dispatched PO">
          <p className="text-3xl font-bold tabular-nums text-ct-ink">{inr(sd.ewbHave)}<span className="text-sm font-normal text-gray-500"> of {inr(sd.ewbNeed)} dispatched POs</span></p>
          <div className="h-2.5 rounded-full bg-[#f6eee5] mt-3 overflow-hidden"><i className="block h-full bg-emerald-500" style={{ width: `${sd.ewbNeed ? (sd.ewbHave / sd.ewbNeed) * 100 : 0}%` }} /></div>
        </Card>
        <Card title="Printouts and handover" sub="Printouts logged and handed to a named person">
          <Legend items={[['bg-emerald-500', 'Printout received (logged)', inr(sd.printoutHave), ''], ['bg-emerald-600', 'Handed to a named person', inr(sd.handExplicit), ''], ['bg-gray-300', 'Declined, cancelled or expired', inr(sd.declined), '']]} />
        </Card>
      </div>

      <Card title="Open POs by stage" sub="Flagged POs first"><StageKanbanWithMeta onOpen={openPo} /></Card>
    </>
  );
};

const Legend: React.FC<{ items: [string, string, string, string][] }> = ({ items }) => (
  <ul className="space-y-2.5">
    {items.map(([c, label, n, sub]) => (
      <li key={label} className="flex items-center gap-2 text-sm"><i className={`w-2.5 h-2.5 rounded-sm ${c}`} /><span className="flex-1 text-gray-700">{label}</span><b className="tabular-nums">{n}</b><span className="text-xs text-gray-500 w-20 text-right">{sub}</span></li>
    ))}
  </ul>
);

/* ---------------- All POs (register) ---------------- */

const PAGE = 50;
export const RegisterTab: React.FC = () => {
  const router = useRouter();
  const { rows: allRows, isAll, meta, openPo, range, platform } = useCt();
  const q = router.query as Record<string, string>;
  const [gapRows, setGapRows] = useState<CtRow[] | null>(null);
  const [decision, setDecision] = useState('');
  const [owner, setOwner] = useState('');
  const [text, setText] = useState(q.q || '');
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!q.gap) { setGapRows(null); return; }
    controlTowerService.register({ ...(range || {}), platform, gap: q.gap }).then((r) => setGapRows(r.rows));
  }, [q.gap, range, platform]);
  useEffect(() => { setText(q.q || ''); setPage(0); }, [q.q]);

  const owners = useMemo(() => [...new Set(allRows.map((d) => d.owner).filter(Boolean))].sort(), [allRows]);
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (gapRows || allRows).filter((d) =>
      (!q.stage || d.stage === +q.stage) && (!q.flag || d.pri === +q.flag) && (!decision || d.dec === decision) && (!owner || d.owner === owner) &&
      (!t || d.po.toLowerCase().includes(t) || (d.loc || '').toLowerCase().includes(t)));
  }, [gapRows, allRows, q.stage, q.flag, decision, owner, text]);
  const setQ = (patch: Record<string, string | undefined>) => {
    const next: Record<string, string> = { ...q };
    Object.entries(patch).forEach(([k, v]) => (v ? (next[k] = v) : delete next[k]));
    setPage(0);
    router.push({ pathname: router.pathname, query: next });
  };
  const copy = () => {
    const head = ['PO', 'Platform', 'PO date', 'Expiry', 'Facility', 'Value', 'Invoiced', 'Decision', 'Stage', 'Flag', 'Owner'];
    const lines = rows.map((d: any) => [d.po, d.plat, d.date || '', d.exp || '', d.loc || '', d.value || 0, d.invoiced || 0, d.dec, `${d.stage}. ${d.stageShort}`, d.flagName || '', d.owner || ''].join('\t'));
    navigator.clipboard.writeText([head.join('\t'), ...lines].join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const gapLabel = meta?.gaps?.find((g: any) => g.k === q.gap)?.label;
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const sel = 'border border-[#e6d9cb] rounded-lg px-2 py-1.5 text-sm bg-white';

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={q.stage || ''} onChange={(e) => setQ({ stage: e.target.value })} className={sel}><option value="">Any stage</option>{meta?.stages?.map((s: any) => <option key={s.n} value={s.n}>{s.n}. {s.short}</option>)}</select>
        <select value={q.flag || ''} onChange={(e) => setQ({ flag: e.target.value })} className={sel}><option value="">Any flag</option>{meta?.flags?.map((f: any) => <option key={f.n} value={f.n}>{f.n}. {f.name}</option>)}</select>
        <select value={decision} onChange={(e) => { setDecision(e.target.value); setPage(0); }} className={sel}><option value="">Any decision</option>{meta?.decisions?.map((x: string) => <option key={x}>{x}</option>)}</select>
        <select value={owner} onChange={(e) => { setOwner(e.target.value); setPage(0); }} className={sel}><option value="">Any owner</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
        <input value={text} onChange={(e) => { setText(e.target.value); setPage(0); }} placeholder="Filter by PO or facility" className={`${sel} w-56`} />
        {q.gap && <span className="text-xs px-3 py-1.5 rounded-full bg-red-50 ring-1 ring-red-200 text-red-700">Gap: {gapLabel || q.gap} <button onClick={() => setQ({ gap: undefined })} aria-label="Clear gap" className="ml-1">✕</button></span>}
        <span className="flex-1" />
        <button onClick={() => { setDecision(''); setOwner(''); setText(''); setQ({ stage: undefined, flag: undefined, gap: undefined, q: undefined }); }} className="text-sm px-3 py-1.5 rounded-lg border border-[#e6d9cb] bg-white">Reset</button>
        <button onClick={copy} className="text-sm px-3 py-1.5 rounded-lg bg-ct-ink text-white">{copied ? 'Copied ✓' : 'Copy for Excel'}</button>
      </div>
      <p className="text-xs text-gray-500"><b className="text-ct-ink">{inr(rows.length)}</b> POs · {money(rows.reduce((t, d) => t + (d.value || 0), 0))}{rows.length > PAGE ? ` · showing ${page * PAGE + 1}–${Math.min(rows.length, page * PAGE + PAGE)}` : ''}</p>
      <Table head={['PO', ...(isAll ? ['Platform'] : []), 'PO date', 'Expiry', 'Facility', 'Value', 'Invoiced', 'Stage', 'Top flag', 'Owner']} right={isAll ? [5, 6] : [4, 5]} empty={!shown.length} emptyText="No POs match these filters.">
        {shown.map((d: any) => (
          <tr key={d.po} onClick={() => openPo(d.po)} className="cursor-pointer hover:bg-orange-50/50">
            <td className="px-3 py-2 font-mono text-xs font-semibold text-ct-ink">{d.po}</td>
            {isAll && <td className="px-3 py-2"><PlatformName p={d.plat} size={18} /></td>}
            <td className="px-3 py-2 whitespace-nowrap">{fd(d.date)}</td>
            <td className="px-3 py-2 whitespace-nowrap">{fd(d.exp)}</td>
            <td className="px-3 py-2 max-w-[14rem] truncate">{d.loc}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(d.value)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{d.invoiced ? money(d.invoiced) : ''}</td>
            <td className="px-3 py-2 whitespace-nowrap"><span className="text-xs px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-800">{d.stage}. {d.stageShort}</span></td>
            <td className="px-3 py-2"><FlagChip d={d} /></td>
            <td className="px-3 py-2">{d.owner}</td>
          </tr>
        ))}
      </Table>
      {rows.length > PAGE && (
        <div className="flex justify-center items-center gap-3 text-sm">
          <button disabled={!page} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg border bg-white disabled:opacity-40">← Previous</button>
          <span className="text-gray-600">Page {page + 1} of {Math.ceil(rows.length / PAGE)}</span>
          <button disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg border bg-white disabled:opacity-40">Next →</button>
        </div>
      )}
    </>
  );
};

/* ---------------- Worklist ---------------- */

export const WorklistTab: React.FC = () => {
  const router = useRouter();
  const { rows, isAll, meta, openPo, reload } = useCt();
  const canEdit = useCanEditCt();
  const [flag, setFlag] = useState((router.query.flag as string) || '');
  const [team, setTeam] = useState('');
  const [limit, setLimit] = useState(100);
  const [hand, setHand] = useState<{ po: string; mode: 'handed' | 'ack' } | null>(null);
  useEffect(() => { setFlag((router.query.flag as string) || ''); }, [router.query.flag]);
  const fi = (n: number) => meta?.flags?.find((f: any) => f.n === n);
  const work = useMemo(() => rows.filter((d) => d.pri > 0 && (!flag || d.pri === +flag) && (!team || fi(d.pri)?.team === team))
    .sort((a, b) => a.pri - b.pri || (b.age ?? 0) - (a.age ?? 0)), [rows, flag, team, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const accept = async (po: string) => { await controlTowerService.updateTracking(po, { decision: 'Accepted' }); reload(); };
  const sel = 'border border-[#e6d9cb] rounded-lg px-2 py-1.5 text-sm bg-white';

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={flag} onChange={(e) => setFlag(e.target.value)} className={sel}><option value="">All flags</option>{meta?.flags?.map((f: any) => <option key={f.n} value={f.n}>{f.n}. {f.name}</option>)}</select>
        <select value={team} onChange={(e) => setTeam(e.target.value)} className={sel}><option value="">All teams</option>{TEAMS.map((t) => <option key={t}>{t}</option>)}</select>
        <span className="text-xs text-gray-500">{inr(work.length)} POs need action · {money(work.reduce((t, d) => t + (d.value || 0), 0))}</span>
      </div>
      <Table head={['Flag', 'PO', ...(isAll ? ['Platform'] : []), 'Age', 'Expiry', 'Value', 'Team', 'Next action', '']} empty={!work.length} emptyText="No POs need action with these filters.">
        {work.slice(0, limit).map((d) => {
          const f = fi(d.pri);
          return (
            <tr key={d.po} className="hover:bg-orange-50/40">
              <td className="px-3 py-2"><FlagChip d={d} /></td>
              <td className="px-3 py-2 font-mono text-xs font-semibold">{d.po}</td>
              {isAll && <td className="px-3 py-2"><PlatformName p={d.plat} size={18} /></td>}
              <td className="px-3 py-2 tabular-nums">{d.age ?? ''}{d.age != null ? 'd' : ''}</td>
              <td className="px-3 py-2 whitespace-nowrap">{d.exp ? <>{fd(d.exp)} <span className={`text-xs ${d.dte! < 0 ? 'text-red-700' : 'text-gray-500'}`}>({d.dte! < 0 ? d.dte : `+${d.dte}`}d)</span></> : ''}</td>
              <td className="px-3 py-2 tabular-nums">{money(d.value)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{f?.team}</td>
              <td className="px-3 py-2 text-xs text-gray-600 max-w-[18rem]">{f?.act}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right space-x-1">
                {canEdit && d.dec === 'Pending' && d.invCount === 0 && <button onClick={() => accept(d.po)} className="text-xs px-2 py-1 rounded-md bg-emerald-600 text-white">Accept</button>}
                {canEdit && d.stage === 2 && <button onClick={() => setHand({ po: d.po, mode: 'handed' })} className="text-xs px-2 py-1 rounded-md bg-ct-orange text-white">Handed</button>}
                {canEdit && d.stage === 3 && <button onClick={() => setHand({ po: d.po, mode: 'ack' })} className="text-xs px-2 py-1 rounded-md bg-ct-orange text-white">Ack</button>}
                <button onClick={() => openPo(d.po)} className="text-xs px-2 py-1 rounded-md border">Open</button>
              </td>
            </tr>
          );
        })}
      </Table>
      {work.length > limit && <button onClick={() => setLimit(limit + 200)} className="text-sm text-ct-orange">Show {Math.min(200, work.length - limit)} more</button>}
      {hand && <QuickHand po={hand.po} mode={hand.mode} onDone={reload} onClose={() => setHand(null)} />}
    </>
  );
};

/* ---------------- Handover check ---------------- */

export const HandoverTab: React.FC = () => {
  const { platform, isAll, openPo, reload } = useCt();
  const canEdit = useCanEditCt();
  const [all, setAll] = useState<CtRow[] | null>(null);
  const [mode, setMode] = useState<'handed' | 'ack'>('handed');
  const [date, setDate] = useState(istToday());
  const [person, setPerson] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState<string>('');
  const [nonce, setNonce] = useState(0);
  useEffect(() => { controlTowerService.register({ platform }).then((r) => setAll(r.rows)); }, [platform, nonce]);
  const today = istToday();
  const rows = (all || []) as any[];
  const people = useMemo(() => {
    const m = new Map<string, { held: number; today: number; acked: number; notAcked: number; oldest: string | null; value: number }>();
    rows.filter((d) => d.handedTo).forEach((d) => {
      const o = m.get(d.handedTo) || { held: 0, today: 0, acked: 0, notAcked: 0, oldest: null, value: 0 };
      const notDispatched = d.invCount === 0 && d.stage !== 9;
      if (notDispatched) { o.held++; o.value += d.value || 0; if (!o.oldest || d.handed < o.oldest) o.oldest = d.handed; }
      if (d.handed === today) o.today++;
      if (d.ack) o.acked++; else if (notDispatched) o.notAcked++;
      m.set(d.handedTo, o);
    });
    return [...m.entries()].sort((a, b) => b[1].held - a[1].held);
  }, [rows, today]);
  const notAcked = rows.filter((d) => (d.printout || d.handed) && !d.ack && d.invCount === 0 && d.stage !== 9);
  const accepted = rows.filter((d) => d.stage === 2);
  const names = [...new Set(rows.flatMap((d) => [d.handedTo, d.ackBy]).filter(Boolean))].sort();

  const save = async () => {
    setResult('');
    try {
      const r = await controlTowerService.handover({ mode, date, person, poNumbers: text });
      setResult(`Saved ${r.updated} PO${r.updated === 1 ? '' : 's'}${r.notFound.length ? `. Not found: ${r.notFound.join(', ')}` : ''}`);
      setText(''); setNonce((n) => n + 1); reload();
    } catch (e: any) { setResult(e?.response?.data?.message || 'Could not save'); }
  };
  const inp = 'border border-[#e6d9cb] rounded-lg px-2 py-1.5 text-sm bg-white';

  return (
    <>
      <div className="grid xl:grid-cols-[minmax(320px,420px)_1fr] gap-4 items-start">
        <Card title="Record a handover" sub="Paste or type PO numbers (one per line, or separated by commas). One save updates every PO and writes the audit trail.">
          {canEdit ? (
            <div className="space-y-3">
              <div className="inline-flex rounded-lg ring-1 ring-[#e6d9cb] overflow-hidden text-sm">
                {(['handed', 'ack'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? 'bg-ct-orange text-white' : 'bg-white text-gray-700'}`}>{m === 'handed' ? 'Handed to warehouse' : 'Acknowledged'}</button>)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-600">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inp} w-full mt-1`} /></label>
                <label className="text-xs text-gray-600">{mode === 'handed' ? 'Handed to (required)' : 'Acknowledged by'}<input list="ct-people" value={person} onChange={(e) => setPerson(e.target.value)} className={`${inp} w-full mt-1`} /></label>
              </div>
              <datalist id="ct-people">{names.map((n) => <option key={n} value={n} />)}</datalist>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="PO numbers" className={`${inp} w-full font-mono text-xs`} />
              {mode === 'handed' && accepted.length > 0 && (
                <button onClick={() => setText(accepted.map((d) => d.po).join('\n'))} className="text-xs text-ct-orange">Fill with the {accepted.length} accepted POs not yet handed{isAll ? '' : ` (${platform})`}</button>
              )}
              <div className="flex items-center gap-3"><button onClick={save} disabled={!text.trim()} className="px-4 py-1.5 rounded-lg bg-ct-orange text-white text-sm font-medium disabled:opacity-40">Save batch</button>{result && <span className="text-xs text-gray-600">{result}</span>}</div>
            </div>
          ) : <p className="text-sm text-gray-500">View only. An Admin, SCM or Ops Executive records handovers.</p>}
        </Card>

        <Card title="Who is holding the printouts" sub="Per warehouse person: printouts handed but not yet dispatched (all time)">
          <Table head={['Person', 'Holding', 'Handed today', 'Acknowledged', 'Not acknowledged', 'Oldest handover', 'Value held']} right={[1, 2, 3, 4, 6]} empty={!people.length} emptyText="No handovers recorded yet.">
            {people.map(([name, o]) => (
              <tr key={name} className="hover:bg-orange-50/40">
                <td className="px-3 py-2 font-medium">{name}</td><td className="px-3 py-2 text-right tabular-nums"><b>{o.held}</b></td><td className="px-3 py-2 text-right tabular-nums">{o.today}</td>
                <td className="px-3 py-2 text-right tabular-nums">{o.acked}</td><td className={`px-3 py-2 text-right tabular-nums ${o.notAcked ? 'text-red-700 font-semibold' : ''}`}>{o.notAcked}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fd(o.oldest)}</td><td className="px-3 py-2 text-right tabular-nums">{money(o.value)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card title="Printouts received but not acknowledged" sub="Logged or handed, the warehouse hasn't confirmed, and nothing is dispatched yet">
        <Table head={['PO', ...(isAll ? ['Platform'] : []), 'Printout received', 'Handed', 'Handed to', 'Value', '']} empty={!notAcked.length} emptyText="Every handed printout has been acknowledged.">
          {notAcked.map((d) => (
            <tr key={d.po} className="hover:bg-orange-50/40">
              <td className="px-3 py-2 font-mono text-xs font-semibold">{d.po}</td>{isAll && <td className="px-3 py-2"><PlatformName p={d.plat} size={18} /></td>}
              <td className="px-3 py-2">{fd(d.printout)}</td><td className="px-3 py-2">{fd(d.handed)}</td><td className="px-3 py-2">{d.handedTo}</td>
              <td className="px-3 py-2 tabular-nums">{money(d.value)}</td><td className="px-3 py-2 text-right"><button onClick={() => openPo(d.po)} className="text-xs px-2 py-1 rounded-md border">Open</button></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
};

/* ---------------- Daily recon ---------------- */

export const ReconTab: React.FC = () => {
  const { platform, isAll, openPo } = useCt();
  const [day, setDay] = useState(istToday());
  const [all, setAll] = useState<any[] | null>(null);
  useEffect(() => { controlTowerService.register({ platform }).then((r) => setAll(r.rows)); }, [platform]);
  if (!all) return <p className="text-gray-500">Loading...</p>;
  const logged = all.filter((d) => d.orderDate === day);
  const accepted = logged.filter((d) => d.dec === 'Accepted' || d.invCount > 0 || d.handed || d.ack);
  const handed = all.filter((d) => d.handed === day);
  const dispatched = all.filter((d) => d.firstDispatch === day);
  const missing = accepted.filter((d) => d.invCount === 0);
  return (
    <>
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-700">Day <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="ml-2 border border-[#e6d9cb] rounded-lg px-2 py-1.5 text-sm bg-white" /></label>
        <span className="text-xs text-gray-500">Every accepted PO must be dispatched or visible on the worklist with an owner.</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="POs logged" value={inr(logged.length)} sub={`PO date ${fd(day)}`} />
        <Tile label="Accepted (of those)" value={inr(accepted.length)} tone="info" />
        <Tile label="Handed to warehouse" value={inr(handed.length)} sub="handover dated this day" />
        <Tile label="Dispatched" value={inr(dispatched.length)} sub="first dispatch this day" tone="ok" />
      </div>
      <Card title={`Accepted on ${fd(day)} but not dispatched: ${missing.length}`} sub="This is the gap that used to go missing. Each PO is named, with where it is stuck.">
        <Table head={['PO', ...(isAll ? ['Platform'] : []), 'Stage', 'Top flag', 'Handed to', 'Value', '']} empty={!missing.length} emptyText="No gap: everything accepted that day has been dispatched.">
          {missing.map((d) => (
            <tr key={d.po} className="hover:bg-orange-50/40">
              <td className="px-3 py-2 font-mono text-xs font-semibold">{d.po}</td>{isAll && <td className="px-3 py-2"><PlatformName p={d.plat} size={18} /></td>}
              <td className="px-3 py-2">{d.stage}. {d.stageShort}</td><td className="px-3 py-2"><FlagChip d={d} />{!d.pri && <span className="text-xs text-red-700">no flag: raise an issue</span>}</td>
              <td className="px-3 py-2">{d.handedTo}</td><td className="px-3 py-2 tabular-nums">{money(d.value)}</td>
              <td className="px-3 py-2 text-right"><button onClick={() => openPo(d.po)} className="text-xs px-2 py-1 rounded-md border">Open</button></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
};

/* ---------------- Issues ---------------- */

export const IssuesTab: React.FC = () => {
  const { platform, isAll, openPo } = useCt();
  const canEdit = useCanEditCt();
  const [status, setStatus] = useState('open');
  const [issues, setIssues] = useState<any[] | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    controlTowerService.issues({ open: status === 'open', status: !['open', 'all'].includes(status) ? status : undefined, platform: isAll ? undefined : platform }).then(setIssues);
    controlTowerService.audit({ limit: 40 }).then(setAudit);
  }, [status, platform, isAll, nonce]);
  const today = istToday();
  const setIssueStatus = async (id: string, s: string) => { await controlTowerService.updateIssue(id, { status: s }); setNonce((n) => n + 1); };
  return (
    <>
      <div className="flex items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-[#e6d9cb] rounded-lg px-2 py-1.5 text-sm bg-white">
          <option value="open">Open (not resolved)</option><option value="all">All</option>{ISSUE_STATUS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-xs text-gray-500">{issues ? `${issues.length} issues` : 'Loading...'} · raise a new one from any PO&apos;s drawer</span>
      </div>
      <Table head={['Priority', 'Type', 'PO', ...(isAll ? ['Platform'] : []), 'Owner', 'Next follow-up', 'Status']} empty={!!issues && !issues.length} emptyText="No issues match.">
        {issues?.map((i) => (
          <tr key={i.id} className="hover:bg-orange-50/40">
            <td className="px-3 py-2"><span className={`text-[11px] px-1.5 py-0.5 rounded-md ${PRI_TONE[i.priority]}`}>{i.priority}</span></td>
            <td className="px-3 py-2">{i.issueType}{i.description && <p className="text-xs text-gray-500">{i.description}</p>}</td>
            <td className="px-3 py-2"><button onClick={() => openPo(i.poNumber)} className="font-mono text-xs text-ct-orange underline">{i.poNumber}</button></td>
            {isAll && <td className="px-3 py-2"><PlatformName p={i.platform} size={18} /></td>}
            <td className="px-3 py-2">{i.assignee || <span className="text-gray-400">unassigned</span>}</td>
            <td className={`px-3 py-2 whitespace-nowrap ${i.status !== 'Resolved' && i.nextActionDate && i.nextActionDate < today ? 'text-red-700 font-semibold' : ''}`}>{fd(i.nextActionDate)}</td>
            <td className="px-3 py-2">{canEdit ? <select value={i.status} onChange={(e) => setIssueStatus(i.id, e.target.value)} className="border rounded-md px-1 py-0.5 text-xs">{ISSUE_STATUS.map((s) => <option key={s}>{s}</option>)}</select> : i.status}</td>
          </tr>
        ))}
      </Table>
      <Card title="Activity (audit trail)" sub="Every team-field and issue change, newest first">
        <ul className="text-xs divide-y divide-[#f3ebe2]">
          {audit.map((a) => (
            <li key={a.id} className="py-1.5 flex gap-3">
              <span className="text-gray-400 w-36 shrink-0">{new Date(a.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span><b>{a.by}</b> · <button onClick={() => a.poNumber && openPo(a.poNumber)} className="font-mono text-ct-orange">{a.poNumber}</button> · {a.field}{a.oldValue || a.newValue ? `: ${a.oldValue || '(empty)'} → ${a.newValue || '(empty)'}` : ''}</span>
            </li>
          ))}
          {!audit.length && <li className="py-2 text-gray-400">No changes yet.</li>}
        </ul>
      </Card>
    </>
  );
};

/* ---------------- Compare platforms ---------------- */

export const CompareTab: React.FC = () => {
  const { summary } = useCt();
  const list = [...summary.platforms].sort((a: any, b: any) => b.urgent - a.urgent || b.n - a.n);
  return (
    <Card title="Compare platforms" sub="One row per platform for the chosen period, sorted by urgent count">
      <Table head={['Platform', 'POs', 'PO value', 'Invoiced', 'Fill rate', 'Awaiting decision', 'In transit', 'GRN pending', 'RTO', 'Urgent']} right={[1, 2, 3, 4, 5, 6, 7, 8, 9]}>
        {list.map((p: any) => (
          <tr key={p.platform} className="hover:bg-orange-50/40">
            <td className="px-3 py-2"><Link href={`/control-tower/${platformSlug(p.platform)}`} className="hover:text-ct-orange"><PlatformName p={p.platform} size={22} /></Link></td>
            <td className="px-3 py-2 text-right tabular-nums">{inr(p.n)}</td><td className="px-3 py-2 text-right tabular-nums">{money(p.value)}</td><td className="px-3 py-2 text-right tabular-nums">{money(p.invoiced)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{p.n ? pct(p.fill) : '-'}</td><td className="px-3 py-2 text-right tabular-nums">{inr(p.undecided)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(p.transit)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{inr(p.grnP)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(p.rto)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{p.urgent ? <b className="text-red-700">{p.urgent}</b> : 0}</td>
          </tr>
        ))}
      </Table>
      <p className="text-[11px] text-gray-400 mt-2">Platforms with no POs yet still appear so every platform is tracked: {CT_PLATFORMS.filter((p) => !summary.platforms.find((x: any) => x.platform === p && x.n)).join(', ') || 'none'}.</p>
    </Card>
  );
};
