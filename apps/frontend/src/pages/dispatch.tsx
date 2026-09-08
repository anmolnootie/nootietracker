import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { RiskBadge } from '@/components/Badges';
import { poService } from '@/services/po.service';
import { mastersService } from '@/services/masters.service';
import { POMaster, POStatus, TransporterMaster } from '@po-control-tower/shared';
import { format } from 'date-fns';

export default function Dispatch() {
  const [pos, setPos] = useState<POMaster[]>([]);
  const [transporters, setTransporters] = useState<TransporterMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<Record<string, { docketNumber: string; transporterId: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [allPos, allTransporters] = await Promise.all([poService.getAllPOs(), mastersService.listTransporters()]);
      // Dispatch queue = POs with a confirmed appointment awaiting dispatch.
      setPos(
        allPos.filter((p: POMaster) => p.status === POStatus.APPOINTMENT_CONFIRMED || p.status === POStatus.READY_FOR_DISPATCH),
      );
      setTransporters(allTransporters);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markDispatched = async (poId: string) => {
    const form = forms[poId];
    if (!form?.docketNumber || !form?.transporterId) return;
    setBusy(poId);
    try {
      await poService.markDispatched(poId, form.docketNumber, form.transporterId);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Dispatch Queue</h2>
          <p className="text-sm text-gray-500 mt-1">Sorted by Latest Safe Dispatch Date. Marking dispatched opens the AVV follow-up clock automatically.</p>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : pos.length === 0 ? (
          <p className="p-6 text-gray-500">No POs currently ready for dispatch.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">PO</th>
                <th className="px-4 py-3 text-left">Risk</th>
                <th className="px-4 py-3 text-left">Expiry</th>
                <th className="px-4 py-3 text-left">Docket #</th>
                <th className="px-4 py-3 text-left">Transporter</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pos.map((po) => (
                <tr key={po.id}>
                  <td className="px-4 py-3 font-medium">
                    <a href={`/pos/${po.id}`} className="text-nootie-orange-dark hover:underline">
                      {po.poNumber}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge risk={po.riskStatus} size="sm" />
                  </td>
                  <td className="px-4 py-3">{format(new Date(po.poExpiryDate), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3">
                    <input
                      className="border rounded px-2 py-1 text-xs w-32"
                      placeholder="DCK-000123"
                      value={forms[po.id]?.docketNumber || ''}
                      onChange={(e) =>
                        setForms((f) => ({ ...f, [po.id]: { ...f[po.id], docketNumber: e.target.value, transporterId: f[po.id]?.transporterId || '' } }))
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="border rounded px-2 py-1 text-xs"
                      value={forms[po.id]?.transporterId || ''}
                      onChange={(e) =>
                        setForms((f) => ({ ...f, [po.id]: { ...f[po.id], transporterId: e.target.value, docketNumber: f[po.id]?.docketNumber || '' } }))
                      }
                    >
                      <option value="">Select...</option>
                      {transporters.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                      {transporters.length === 0 && <option value="MANUAL">Manual entry (no masters yet)</option>}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busy === po.id || !forms[po.id]?.docketNumber || !forms[po.id]?.transporterId}
                      onClick={() => markDispatched(po.id)}
                      className="px-2 py-1 bg-teal-50 text-teal-700 rounded text-xs hover:bg-teal-100 disabled:opacity-50"
                    >
                      Mark Dispatched
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MainLayout>
  );
}
