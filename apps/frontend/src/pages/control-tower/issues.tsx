import React, { useCallback, useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { controlTowerService } from '@/services/control-tower.service';
import { Card, fd } from '@/components/control-tower/ui';
import { PoJourneyDrawer } from '@/components/control-tower/PoJourneyDrawer';
import { useCanEditCt } from '@/components/control-tower/TeamFieldsForm';
import { ISSUE_STATUS, PRI_TONE } from '@/components/control-tower/PoIssuesPanel';

const PLATS = ['Blinkit', 'Zepto', 'Swiggy Instamart', 'BigBasket', 'Flipkart', 'Amazon', 'Supertails', 'FirstClub', 'Tata 1mg', 'Other'];
const PRI_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

/** Issues CRM: every issue raised against a PO, plus the latest Control Tower changes (audit trail). */
export default function IssuesPage() {
  const canEdit = useCanEditCt();
  const [status, setStatus] = useState('open');
  const [platform, setPlatform] = useState('');
  const [assignee, setAssignee] = useState('');
  const [issues, setIssues] = useState<any[] | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    controlTowerService
      .issues({ open: status === 'open', status: status !== 'open' && status !== 'all' ? status : undefined, platform: platform || undefined, assignee: assignee || undefined })
      .then((rows) => setIssues(rows.sort((a: any, b: any) => (PRI_ORDER[a.priority] ?? 9) - (PRI_ORDER[b.priority] ?? 9) || String(a.nextActionDate || '9').localeCompare(String(b.nextActionDate || '9')))));
    controlTowerService.audit({ limit: 50 }).then(setAudit);
  }, [status, platform, assignee]);
  useEffect(load, [load]);

  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const setIssueStatus = async (id: string, s: string) => { await controlTowerService.updateIssue(id, { status: s }); load(); };

  return (
    <MainLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-ct-ink">Issues</h1>
          <p className="text-sm text-gray-500">Problems raised against POs: who owns each, what happens next, and when. Raise a new one from any PO&apos;s journey drawer.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded px-2 py-1">
            <option value="open">Open (not resolved)</option>
            <option value="all">All</option>
            {ISSUE_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="border rounded px-2 py-1">
            <option value="">All platforms</option>
            {PLATS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Assignee (exact)" className="border rounded px-2 py-1" />
          <span className="text-xs text-gray-500 self-center">{issues ? `${issues.length} issues` : 'Loading...'}</span>
        </div>

        <div className="bg-white rounded-xl border border-orange-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ct-cream text-left text-xs text-gray-600">
              <tr>{['Priority', 'Type', 'PO', 'Platform', 'Assignee', 'Next action', 'Raised', 'Status'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {issues?.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2"><span className={`text-[11px] px-1.5 py-0.5 rounded ${PRI_TONE[i.priority]}`}>{i.priority}</span></td>
                  <td className="px-3 py-2">{i.issueType}{i.description && <p className="text-xs text-gray-500">{i.description}</p>}</td>
                  <td className="px-3 py-2"><button onClick={() => setOpen(i.poNumber)} className="font-mono text-xs text-ct-orange underline">{i.poNumber}</button></td>
                  <td className="px-3 py-2">{i.platform}</td>
                  <td className="px-3 py-2">{i.assignee || <span className="text-gray-400">unassigned</span>}</td>
                  <td className={`px-3 py-2 whitespace-nowrap ${i.status !== 'Resolved' && i.nextActionDate && i.nextActionDate < today ? 'text-red-700 font-medium' : ''}`}>{fd(i.nextActionDate)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{new Date(i.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select value={i.status} onChange={(e) => setIssueStatus(i.id, e.target.value)} className="border rounded px-1 py-0.5 text-xs">
                        {ISSUE_STATUS.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    ) : i.status}
                  </td>
                </tr>
              ))}
              {issues && !issues.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No issues match.</td></tr>}
            </tbody>
          </table>
        </div>

        <Card title="Recent changes" sub="Audit trail of team fields and issues across all POs (newest first)">
          <ul className="text-xs space-y-1">
            {audit.map((a) => (
              <li key={a.id}>
                <span className="text-gray-400">{new Date(a.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>{' '}
                <b>{a.by}</b> · <button onClick={() => a.poNumber && setOpen(a.poNumber)} className="font-mono text-ct-orange">{a.poNumber}</button> · {a.field}
                {a.oldValue || a.newValue ? `: ${a.oldValue || '(empty)'} → ${a.newValue || '(empty)'}` : ''}
              </li>
            ))}
            {!audit.length && <li className="text-gray-400">No changes yet.</li>}
          </ul>
        </Card>
      </div>
      <PoJourneyDrawer po={open} onClose={() => { setOpen(null); load(); }} />
    </MainLayout>
  );
}
