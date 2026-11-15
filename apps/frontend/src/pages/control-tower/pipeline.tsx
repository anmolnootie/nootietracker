import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { controlTowerService } from '@/services/control-tower.service';
import { periodLabel, usePeriodStore } from '@/store/period.store';
import { Card, CtRow, inr, money, PeriodBar, StackBoard, StageKanban } from '@/components/control-tower/ui';
import { PoJourneyDrawer } from '@/components/control-tower/PoJourneyDrawer';

const STEP_BAR = ['bg-orange-300', 'bg-orange-400', 'bg-orange-500', 'bg-ct-orange', 'bg-amber-500', 'bg-ct-yellow', 'bg-emerald-500', 'bg-emerald-600'];
const D_TONE = { Delivered: 'ok', 'In Transit': 'info', Dispatched: 'info', Arrived: 'info', RTO: 'crit' };
const G_TONE = { Done: 'ok', Pending: 'warn', NA: 'mute' };

/** End-to-end pipeline (artifact v3.js v_pipeline). Optional ?platform= scopes it to one control tower. */
export default function PipelinePage() {
  const router = useRouter();
  const platform = (router.query.platform as string) || 'ALL';
  const { range, pkey } = usePeriodStore();
  const [j, setJ] = useState<any>(null);
  const [rows, setRows] = useState<CtRow[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const q = { ...(range || {}), platform };
    setError('');
    Promise.all([controlTowerService.journey(q), controlTowerService.register(q), controlTowerService.meta()])
      .then(([jr, reg, meta]) => { setJ(jr); setRows(reg.rows); setStages(meta.stages); })
      .catch((e) => setError(e?.response?.data?.message || 'Could not load the pipeline'));
  }, [range, platform, router.isReady]);

  const gapLink = (k: string) => router.push({ pathname: '/control-tower/register', query: { gap: k, ...(platform !== 'ALL' ? { platform } : {}) } });
  const top = j?.steps?.[0]?.n || 1;
  const sd = j?.side;

  return (
    <MainLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-ct-orange font-semibold">{platform === 'ALL' ? 'Overall' : platform} control tower</p>
            <h1 className="text-2xl font-bold text-ct-ink">Pipeline</h1>
            <p className="text-sm text-gray-500 max-w-2xl">Every PO from the moment it arrives to GRN. A PO that reaches a later step counts as having passed the earlier ones, so the red boxes show exactly where POs stopped.</p>
          </div>
          <PeriodBar />
        </div>
        {error && <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>}
        {!j && !error && <p className="text-gray-500">Loading...</p>}

        {j && (
          <>
            <Card title="End-to-end journey" sub={`${inr(j.count)} POs · ${periodLabel(pkey, range)}`}>
              <div className="space-y-1">
                {j.steps.map((s: any, i: number) => {
                  const w = Math.max(2, Math.round((s.n / top) * 100));
                  const gap = i < j.steps.length - 1 ? j.gaps[i] : null;
                  return (
                    <React.Fragment key={s.k}>
                      <div className="grid grid-cols-[240px_1fr_150px] items-center gap-3 py-1">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-ct-cream text-ct-orange text-xs font-bold flex items-center justify-center">{i + 1}</span>
                          <div><b className="text-sm text-ct-ink">{s.name}</b><p className="text-[11px] text-gray-500">{s.hint}</p></div>
                        </div>
                        <div className="h-5 bg-gray-100 rounded"><i className={`block h-5 rounded ${STEP_BAR[i]}`} style={{ width: `${w}%` }} /></div>
                        <div className="text-right"><b className="tabular-nums">{inr(s.n)}</b><p className="text-[11px] text-gray-500">{money(s.v)} · {Math.round((s.n / top) * 100)}%</p></div>
                      </div>
                      {gap && (
                        <div className="pl-8">
                          {gap.n > 0 ? (
                            <button onClick={() => gapLink(gap.k)} className="text-xs px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 hover:bg-red-100">
                              <b>{inr(gap.n)} POs</b> reached &ldquo;{s.name}&rdquo; but not &ldquo;{j.steps[i + 1].name}&rdquo; · {money(gap.v)} · <u>see which</u>
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">Nothing lost between these two steps</span>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </Card>

            <h2 className="text-lg font-semibold text-ct-ink">Status boards</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              <Card title="Dispatch and delivery" sub="Every invoice, by delivery status"><StackBoard data={sd.ds} order={['Delivered', 'In Transit', 'Dispatched', 'Arrived', 'RTO']} tone={D_TONE} /></Card>
              <Card title="GRN (platform receipt)" sub="Every invoice, by GRN status"><StackBoard data={sd.gs} order={['Done', 'Pending', 'NA']} tone={G_TONE} /></Card>
              <Card title="Returns and credit notes" sub="Returned shipments and the credit notes raised for them">
                <Legend items={[
                  ['bg-red-500', 'Returned to us (RTO)', inr(sd.rto.n), money(sd.rto.v)],
                  ['bg-emerald-500', 'Credit notes raised', inr(sd.cnRaised.n), money(sd.cnRaised.v)],
                  ['bg-amber-400', 'POs still waiting for a credit note', inr(sd.cnPending.n), `${money(sd.cnPending.v)} short or damaged`],
                ]} />
              </Card>
              <Card title="Short, damaged and excess goods" sub="Value the platforms reported on GRN">
                <Legend items={[
                  ['bg-amber-400', 'Shortage', sd.short.q ? `${inr(sd.short.q)} units` : '', money(sd.short.v)],
                  ['bg-amber-400', 'Damage', sd.dmg.q ? `${inr(sd.dmg.q)} units` : '', money(sd.dmg.v)],
                  ['bg-sky-500', 'Excess', sd.exc.q ? `${inr(sd.exc.q)} units` : '', money(sd.exc.v)],
                ]} />
                <p className="text-[11px] text-gray-400 mt-2">The tracker sync stores values, not quantities, so unit counts show only when known.</p>
              </Card>
              <Card title="E-way bills" sub="Recorded by the team on each dispatched PO">
                <p className="text-2xl font-bold tabular-nums">{inr(sd.ewbHave)} <span className="text-sm font-normal text-gray-500">of {inr(sd.ewbNeed)} dispatched POs have an E-way bill number</span></p>
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mt-2"><i className="bg-emerald-500" style={{ width: `${sd.ewbNeed ? (sd.ewbHave / sd.ewbNeed) * 100 : 0}%` }} /></div>
                <p className="text-[11px] text-gray-400 mt-2">The Warehouse Master has no E-way column, so numbers are entered on each PO.</p>
              </Card>
              <Card title="Printouts and handover" sub="How many printouts have a named person">
                <Legend items={[
                  ['bg-emerald-500', 'Printout received (date logged)', inr(sd.printoutHave), ''],
                  ['bg-emerald-500', 'Handed with a recorded person', inr(sd.handExplicit), ''],
                  ['bg-gray-300', 'Declined, cancelled or expired', inr(sd.declined), ''],
                ]} />
                <p className="text-[11px] text-gray-400 mt-2">Dispatched POs count as handed and acknowledged because they reached an invoice.</p>
              </Card>
            </div>

            <h2 className="text-lg font-semibold text-ct-ink">Open POs by stage</h2>
            <StageKanban rows={rows} stages={stages} onOpen={setOpen} />
          </>
        )}
      </div>
      <PoJourneyDrawer po={open} onClose={() => setOpen(null)} />
    </MainLayout>
  );
}

const Legend: React.FC<{ items: [string, string, string, string][] }> = ({ items }) => (
  <ul className="space-y-2">
    {items.map(([c, label, n, sub]) => (
      <li key={label} className="flex items-center gap-2 text-sm">
        <i className={`w-2.5 h-2.5 rounded-sm ${c}`} />
        <span className="flex-1 text-gray-700">{label}</span>
        <b className="tabular-nums">{n}</b>
        <span className="text-xs text-gray-500 min-w-[5rem] text-right">{sub}</span>
      </li>
    ))}
  </ul>
);
