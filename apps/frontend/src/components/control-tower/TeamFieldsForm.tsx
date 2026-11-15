import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { controlTowerService } from '@/services/control-tower.service';

/** Matches CT_EDITOR_ROLES on the backend (control-tower.controller.ts): these roles edit, everyone else views. */
export const CT_EDITOR_ROLES = ['ADMIN', 'SCM', 'OPS_EXECUTIVE'];
export function useCanEditCt(): boolean {
  const { user } = useAuthStore();
  return !!user?.roles?.some((r: string) => CT_EDITOR_ROLES.includes(r));
}

const DECISIONS = ['', 'Pending', 'Accepted', 'Declined', 'Cancelled', 'Expired'];
const REASONS = ['', 'Low value', 'Expiry too close', 'Stock not available', 'Out of service area', 'Price mismatch', 'PO mapped / merged', 'Auto-cancelled by platform', 'Cancelled (reason not recorded)', 'Other'];
const FIELDS: { k: string; label: string; type: 'date' | 'text' | 'decision' | 'reason' | 'area' }[] = [
  { k: 'decision', label: 'Decision', type: 'decision' },
  { k: 'decisionReason', label: 'Reason', type: 'reason' },
  { k: 'printoutReceivedOn', label: 'Printout received on', type: 'date' },
  { k: 'handedOn', label: 'Handed to warehouse on', type: 'date' },
  { k: 'handedTo', label: 'Handed to (person)', type: 'text' },
  { k: 'ackOn', label: 'Warehouse ack on', type: 'date' },
  { k: 'ackBy', label: 'Warehouse ack by', type: 'text' },
  { k: 'owner', label: 'Owner', type: 'text' },
  { k: 'ewayBillNo', label: 'E-way bill no.', type: 'text' },
  { k: 'remarks', label: 'Remarks', type: 'area' },
];

/**
 * Team entry fields for one PO (po_tracking). Editors save; viewers see
 * read-only values. Leave Decision blank to use the decision the system infers.
 */
export const TeamFieldsForm: React.FC<{ poNumber: string; onSaved?: () => void }> = ({ poNumber, onSaved }) => {
  const canEdit = useCanEditCt();
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!poNumber) return;
    controlTowerService.getTracking(poNumber).then((t) => {
      const v: Record<string, string> = {};
      FIELDS.forEach((f) => (v[f.k] = t?.[f.k] ?? ''));
      setInitial(v);
      setVals(v);
    });
  }, [poNumber]);

  const changed = FIELDS.filter((f) => (vals[f.k] || '') !== (initial[f.k] || ''));
  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const body: Record<string, string | null> = {};
      changed.forEach((f) => (body[f.k] = vals[f.k] || null));
      await controlTowerService.updateTracking(poNumber, body);
      setInitial(vals);
      setMsg(`Saved ${changed.length} change${changed.length > 1 ? 's' : ''}`);
      onSaved?.();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const input = (f: (typeof FIELDS)[number]) => {
    const common = { disabled: !canEdit, value: vals[f.k] || '', className: 'w-full border rounded px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-600' };
    const set = (v: string) => setVals({ ...vals, [f.k]: v });
    if (f.type === 'decision' || f.type === 'reason') {
      const opts = f.type === 'decision' ? DECISIONS : REASONS;
      return <select {...common} onChange={(e) => set(e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o || (f.type === 'decision' ? '(inferred)' : '-')}</option>)}</select>;
    }
    if (f.type === 'area') return <textarea {...common} rows={2} onChange={(e) => set(e.target.value)} />;
    return <input {...common} type={f.type === 'date' ? 'date' : 'text'} onChange={(e) => set(e.target.value)} />;
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.k} className={`text-xs text-gray-600 ${f.type === 'area' ? 'col-span-2' : ''}`}>
            {f.label}
            {input(f)}
          </label>
        ))}
      </div>
      {canEdit ? (
        <div className="flex items-center gap-3 mt-3">
          <button disabled={!changed.length || busy} onClick={save} className="px-4 py-1.5 rounded bg-ct-orange text-white text-sm font-medium disabled:opacity-40">
            {busy ? 'Saving...' : 'Save team fields'}
          </button>
          {msg && <span className="text-xs text-gray-600">{msg}</span>}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mt-2">View only. Ask an Admin, SCM or Ops Executive to change these.</p>
      )}
    </div>
  );
};
