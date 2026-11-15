import React, { useCallback, useEffect, useState } from 'react';
import { controlTowerService } from '@/services/control-tower.service';
import { useCanEditCt } from './TeamFieldsForm';
import { fd } from './ui';

export const ISSUE_TYPES = ['Missing in warehouse', 'PO printout missing', 'Expiry risk', 'Shortage / damage claim', 'RTO / credit note', 'GRN delay', 'Appointment / reschedule', 'Platform cancellation', 'Price / data mismatch', 'Other'];
export const ISSUE_STATUS = ['Open', 'In progress', 'Waiting on platform', 'Resolved'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const PRI_TONE: Record<string, string> = { High: 'bg-red-100 text-red-800', Medium: 'bg-amber-100 text-amber-800', Low: 'bg-gray-100 text-gray-700' };

const blank = { issueType: ISSUE_TYPES[0], priority: 'Medium', assignee: '', nextActionDate: '', description: '' };

/** Issues raised against one PO (raise, change status, resolve) and the PO's audit trail. */
export const PoIssuesPanel: React.FC<{ poNumber: string; onChange?: () => void }> = ({ poNumber, onChange }) => {
  const canEdit = useCanEditCt();
  const [issues, setIssues] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [form, setForm] = useState<typeof blank | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    controlTowerService.issues({ po: poNumber }).then(setIssues);
    controlTowerService.audit({ po: poNumber }).then(setAudit);
  }, [poNumber]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); load(); onChange?.(); } catch (e: any) { setErr(e?.response?.data?.message || 'Could not save'); }
  };

  return (
    <>
      <section>
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-ct-ink">Issues ({issues.filter((i) => i.status !== 'Resolved').length} open)</h3>
          {canEdit && !form && <button onClick={() => setForm({ ...blank })} className="text-sm text-ct-orange">+ Raise issue</button>}
        </div>
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
        {form && (
          <div className="border rounded-lg p-3 mb-3 grid grid-cols-2 gap-2 text-sm bg-ct-cream">
            <label className="text-xs">Type<select value={form.issueType} onChange={(e) => setForm({ ...form, issueType: e.target.value })} className="w-full border rounded px-2 py-1">{ISSUE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="text-xs">Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border rounded px-2 py-1">{PRIORITIES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="text-xs">Assignee<input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className="w-full border rounded px-2 py-1" /></label>
            <label className="text-xs">Next action date<input type="date" value={form.nextActionDate} onChange={(e) => setForm({ ...form, nextActionDate: e.target.value })} className="w-full border rounded px-2 py-1" /></label>
            <label className="text-xs col-span-2">What happened<textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded px-2 py-1" /></label>
            <div className="col-span-2 flex gap-2">
              <button onClick={() => act(async () => { await controlTowerService.createIssue({ poNumber, ...form }); setForm(null); })} className="px-3 py-1 rounded bg-ct-orange text-white">Save issue</button>
              <button onClick={() => setForm(null)} className="px-3 py-1 rounded border">Cancel</button>
            </div>
          </div>
        )}
        <ul className="space-y-2">
          {issues.map((i) => (
            <li key={i.id} className={`border rounded-lg p-2.5 text-sm ${i.status === 'Resolved' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${PRI_TONE[i.priority]}`}>{i.priority}</span>
                <b>{i.issueType}</b>
                <span className="text-xs text-gray-500">{i.assignee ? `→ ${i.assignee}` : 'unassigned'}{i.nextActionDate ? ` · next ${fd(i.nextActionDate)}` : ''}</span>
                <span className="flex-1" />
                {canEdit ? (
                  <select value={i.status} onChange={(e) => act(() => controlTowerService.updateIssue(i.id, { status: e.target.value }))} className="border rounded px-1 py-0.5 text-xs">
                    {ISSUE_STATUS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                ) : <span className="text-xs">{i.status}</span>}
              </div>
              {i.description && <p className="text-xs text-gray-600 mt-1">{i.description}</p>}
              {i.resolution && <p className="text-xs text-emerald-700 mt-1">Resolution: {i.resolution}</p>}
            </li>
          ))}
          {!issues.length && <li className="text-xs text-gray-400">No issues raised on this PO.</li>}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold text-ct-ink mb-2">Audit trail</h3>
        <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
          {audit.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="text-gray-400 whitespace-nowrap">{new Date(a.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span><b>{a.by}</b> · {a.field}{a.oldValue || a.newValue ? `: ${a.oldValue || '(empty)'} → ${a.newValue || '(empty)'}` : ''}</span>
            </li>
          ))}
          {!audit.length && <li className="text-gray-400">No changes recorded yet.</li>}
        </ul>
      </section>
    </>
  );
};
