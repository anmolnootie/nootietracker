import React, { useEffect, useState } from 'react';
import { controlTowerService } from '@/services/control-tower.service';

const LABELS: Record<string, string> = {
  sla_decision: 'Decide accept/decline within',
  sla_handover: 'Hand printout to warehouse within',
  sla_ack: 'Warehouse acknowledges within',
  sla_dispatch: 'Dispatch after PO date within',
  expiry_warn: 'Warn "expiring soon" when expiry is within',
  sla_transit: 'In transit overdue after',
  sla_grn: 'GRN overdue after delivery/dispatch',
  legacy_days: 'Treat undecided POs as legacy after',
  cn_days: 'Chase credit notes for shipments within',
};

/** Control Tower SLA days (drive the stage/flag engine). Only ADMIN can save; the API enforces it too. */
export const SlaSettings: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [vals, setVals] = useState<Record<string, number> | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { controlTowerService.getSla().then(setVals); }, []);
  if (!vals) return null;
  const save = async () => {
    setMsg('');
    try { setVals(await controlTowerService.updateSla(vals)); setMsg('Saved. Control Tower pages pick this up within a minute.'); }
    catch (e: any) { setMsg(e?.response?.data?.message || 'Could not save'); }
  };
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-800">Control Tower SLAs (days)</h3>
      <p className="text-xs text-gray-500 mb-4">These numbers decide when a PO is flagged on the Control Tower work lists.</p>
      <div className="grid md:grid-cols-3 gap-3">
        {Object.keys(LABELS).map((k) => (
          <label key={k} className="text-xs text-gray-600">
            {LABELS[k]}
            <input type="number" min={0} step={1} disabled={!isAdmin} value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-50" />
          </label>
        ))}
      </div>
      {isAdmin && <button onClick={save} className="mt-4 px-4 py-1.5 rounded bg-ct-orange text-white text-sm font-medium">Save SLAs</button>}
      {msg && <p className="text-xs text-gray-600 mt-2">{msg}</p>}
    </div>
  );
};
