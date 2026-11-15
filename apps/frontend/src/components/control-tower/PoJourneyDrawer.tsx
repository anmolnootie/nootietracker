import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { controlTowerService } from '@/services/control-tower.service';
import { FLAG_TONE, fd, inr, money, TONE } from './ui';
import { TeamFieldsForm } from './TeamFieldsForm';
import { PoIssuesPanel } from './PoIssuesPanel';

type StepState = 'done' | 'late' | '';
const uniq = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter(Boolean))) as string[];

/** The artifact's poSteps(): one PO's timeline, each step done, late (its flag is firing) or not yet. */
function steps(x: any): { t: string; v: string; st: StepState; sub?: string }[] {
  const L: any[] = x.invoices || [];
  const p = x.pri;
  const n = L.length;
  const val = L.reduce((s, l) => s + (l.val || 0), 0);
  const delivered = L.filter((l) => l.status === 'Delivered').length;
  const transit = L.filter((l) => ['Dispatched', 'In Transit', 'Arrived'].includes(l.status)).length;
  const rto = L.filter((l) => l.status === 'RTO').length;
  const lastD = L.map((l) => l.deliv).filter(Boolean).sort().pop();
  const grnDone = L.filter((l) => l.grn === 'Done').length;
  const grnP = L.filter((l) => l.grn === 'Pending').length;
  const gno = uniq(L.map((l) => l.gno));
  const gamt = Math.max(0, ...L.map((l) => l.gamt || 0)); // GRN amount is per PO in this app, repeated on each invoice
  const gdate = uniq(L.map((l) => l.gdate))[0];
  const sv = L.reduce((s, l) => s + (l.sv || 0), 0), dv = L.reduce((s, l) => s + (l.dv || 0), 0), ev = L.reduce((s, l) => s + (l.ev || 0), 0);
  const cn = uniq(L.map((l) => l.cn));
  const cnPending = L.some((l) => !l.cn && (l.status === 'RTO' || (l.sv || 0) + (l.dv || 0) > 0));
  const first = x.firstDispatch, last = x.lastDispatch;
  const out: { t: string; v: string; st: StepState; sub?: string }[] = [
    { t: 'PO received', v: fd(x.orderDate), st: x.orderDate ? 'done' : '' },
    { t: 'Decision', v: x.dec + (x.reason ? ` · ${x.reason}` : ''), st: x.dec === 'Pending' ? (p === 7 || p === 10 ? 'late' : '') : 'done' },
    { t: 'Printout received', v: x.printout ? fd(x.printout) : '', st: x.printout ? 'done' : '' },
    { t: 'Handed to warehouse', v: x.handed ? fd(x.handed) + (x.handedTo ? ` → ${x.handedTo}` : '') : '', st: x.handed ? 'done' : p === 3 ? 'late' : '' },
    { t: 'Warehouse acknowledged', v: x.ack ? fd(x.ack) + (x.ackBy ? ` by ${x.ackBy}` : '') : '', st: x.ack ? 'done' : p === 4 ? 'late' : '' },
    { t: 'Invoiced', v: n ? `${n} invoice${n > 1 ? 's' : ''} · ₹${inr(val)}` : '', st: n ? 'done' : p === 5 ? 'late' : '', sub: uniq(L.map((l) => l.inv)).join(', ') },
    { t: 'E-way bill', v: x.ewb || '', st: x.ewb ? 'done' : '', sub: n && !x.ewb ? 'Add the number in the team fields below' : '' },
    {
      t: 'Dispatched', v: n ? fd(first) + (last && last !== first ? ` to ${fd(last)}` : '') : '', st: n ? 'done' : p === 1 || p === 2 ? 'late' : '',
      sub: n ? [uniq(L.map((l) => l.partner)).join(', '), uniq(L.map((l) => l.awb)).length ? `AWB ${uniq(L.map((l) => l.awb)).slice(0, 3).join(', ')}` : ''].filter(Boolean).join(' · ') : '',
    },
    { t: 'Delivered', v: delivered ? (lastD ? fd(lastD) : `${delivered} delivered`) : transit ? 'In transit' : '', st: delivered ? 'done' : p === 6 ? 'late' : '' },
    {
      t: 'GRN', v: grnDone ? `${grnDone} of ${n} done` : grnP ? `${grnP} pending` : '', st: grnDone && !grnP ? 'done' : p === 8 ? 'late' : '',
      sub: [gno.length ? `GRN ${gno.slice(0, 2).join(', ')}` : '', gdate ? fd(gdate) : '', gamt ? `₹${inr(gamt)}` : ''].filter(Boolean).join(' · '),
    },
  ];
  if (sv || dv || ev) out.push({ t: 'Discrepancy', v: `${money(sv)} short · ${money(dv)} damaged · ${money(ev)} excess`, st: 'late' });
  if (rto) out.push({ t: 'Returned (RTO)', v: `${rto} shipment${rto > 1 ? 's' : ''} came back`, st: 'late' });
  if (cn.length || cnPending) out.push({ t: 'Credit note', v: cn.length ? cn.join(', ') : 'Pending', st: cn.length ? 'done' : 'late' });
  return out;
}

const DOT: Record<StepState, string> = { done: 'bg-emerald-500', late: 'bg-red-500', '': 'bg-gray-300' };

export const PoJourneyDrawer: React.FC<{ po: string | null; onClose: () => void }> = ({ po, onClose }) => {
  const [d, setD] = useState<any>(null);
  const load = useCallback(() => {
    if (po) controlTowerService.po(po).then(setD).catch(() => setD({ error: true }));
  }, [po]);
  useEffect(() => { setD(null); load(); }, [load]);
  if (!po) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="w-full max-w-2xl h-full overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-ct-cream border-b border-orange-100 px-6 py-4 flex justify-between items-start">
          <div>
            <h2 className="font-mono text-lg font-bold text-ct-ink">{po}</h2>
            {d && !d.error && <p className="text-xs text-gray-600">{d.plat} · {d.loc || 'no facility'} · {money(d.value)}{d.exp ? ` · expires ${fd(d.exp)}` : ''}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-lg" aria-label="Close">✕</button>
        </div>
        {!d && <p className="text-gray-500 p-6">Loading...</p>}
        {d?.error && <p className="text-red-600 p-6">Could not load this PO.</p>}
        {d && !d.error && (
          <div className="p-6 space-y-6">
            <div className="flex flex-wrap gap-2 items-center text-sm">
              <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800">Stage {d.stage}. {d.stageInfo?.name}</span>
              {d.flagInfo && <span className={`px-2 py-0.5 rounded border ${TONE[FLAG_TONE[d.pri]]}`}>{d.flagInfo.name} · {d.flagInfo.team}</span>}
              {d.id && <Link className="text-ct-orange underline text-xs" href={`/pos/${d.id}`}>Open PO detail</Link>}
            </div>
            {d.flagInfo && <p className="text-sm text-gray-700 -mt-3">Next: {d.flagInfo.act}</p>}

            <ol className="space-y-3">
              {steps(d).map((s) => (
                <li key={s.t} className="flex gap-3">
                  <i className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[s.st]}`} />
                  <div className="text-sm">
                    <b className="text-ct-ink">{s.t}</b>
                    <span className={`ml-2 ${s.st === 'late' ? 'text-red-700' : 'text-gray-700'}`}>{s.v || 'Not yet'}</span>
                    {s.sub && <p className="text-xs text-gray-500">{s.sub}</p>}
                  </div>
                </li>
              ))}
            </ol>

            {d.invoices?.length > 0 && (
              <section>
                <h3 className="font-semibold text-ct-ink mb-2">Invoices ({d.invoices.length})</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>{['Invoice', 'Dispatched', 'Value', 'AWB', 'Partner', 'Status', 'Delivered', 'GRN', 'Short / dmg / excess', 'Credit note'].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {d.invoices.map((l: any, i: number) => (
                        <tr key={`${l.inv}-${i}`} className="border-t">
                          <td className="px-2 py-1.5 font-mono">{l.inv || '-'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{fd(l.disp)}</td>
                          <td className="px-2 py-1.5">{l.val != null ? `₹${inr(l.val)}` : ''}</td>
                          <td className="px-2 py-1.5">{l.awb}</td>
                          <td className="px-2 py-1.5">{l.partner}</td>
                          <td className="px-2 py-1.5">{l.status}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{fd(l.deliv)}</td>
                          <td className="px-2 py-1.5">{l.grn}{l.gno ? ` · ${l.gno}` : ''}{l.gdate ? ` · ${fd(l.gdate)}` : ''}{l.gamt ? ` · ₹${inr(l.gamt)}` : ''}</td>
                          <td className="px-2 py-1.5">{[l.sv, l.dv, l.ev].some((v: number) => v) ? `${inr(l.sv || 0)} / ${inr(l.dv || 0)} / ${inr(l.ev || 0)}` : ''}</td>
                          <td className="px-2 py-1.5">{l.cn}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <h3 className="font-semibold text-ct-ink mb-2">Team fields</h3>
              <TeamFieldsForm poNumber={d.po} onSaved={load} />
            </section>

            <PoIssuesPanel poNumber={d.po} onChange={load} />
          </div>
        )}
      </aside>
    </div>
  );
};
