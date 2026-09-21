import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { poService } from '@/services/po.service';
import { format, formatDistanceToNow } from 'date-fns';

export default function Logistics() {
  const [trackers, setTrackers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setTrackers(await poService.listLogisticsTrackers());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (poId: string) => {
    const status = statusDrafts[poId];
    if (!status) return;
    setBusy(poId);
    try {
      await poService.updateLogisticsStatus(poId, status);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const markReceived = async (poId: string) => {
    setBusy(poId);
    try {
      await poService.markAVVReceived(poId);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const isStale = (t: any) => t.lastUpdateTime && Date.now() - new Date(t.lastUpdateTime).getTime() > 24 * 60 * 60 * 1000;

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Logistics Tracking</h2>
            <p className="text-sm text-gray-500 mt-1">
              AVV/docket follow-up nags every 2 days from Dispatch Date + 3 days until "Received &amp; Actioned" is
              ticked. Shipments stale &gt;24h are flagged.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : trackers.length === 0 ? (
          <p className="p-6 text-gray-500">No shipments in transit yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">PO</th>
                <th className="px-4 py-3 text-left">Docket #</th>
                <th className="px-4 py-3 text-left">Last Status</th>
                <th className="px-4 py-3 text-left">Last Update</th>
                <th className="px-4 py-3 text-left">Update Status</th>
                <th className="px-4 py-3 text-left">AVV Received &amp; Actioned</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {trackers.map((t) => (
                <tr key={t.id} className={isStale(t) ? 'bg-yellow-50' : ''}>
                  <td className="px-4 py-3 font-medium">
                    <a href={`/pos/${t.poId}`} className="text-nootie-orange-dark hover:underline">
                      {t.po?.poNumber}
                    </a>
                  </td>
                  <td className="px-4 py-3">{t.docketNumber}</td>
                  <td className="px-4 py-3">
                    {t.lastTrackedStatus}
                    {/* Delivered stays listed until the AVV is actioned, so say where the GRN stands. */}
                    {t.lastTrackedStatus === 'DELIVERED' &&
                      (t.grnRecorded ? (
                        <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">GRN done</span>
                      ) : (
                        <a href="/grn" className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-nootie-orange-light text-nootie-orange-dark hover:underline">
                          GRN pending
                        </a>
                      ))}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {t.lastUpdateTime && formatDistanceToNow(new Date(t.lastUpdateTime), { addSuffix: true })}
                    {isStale(t) && <span className="ml-2 text-yellow-700 font-medium">STALE</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        className="border rounded px-2 py-1 text-xs"
                        value={statusDrafts[t.poId] || ''}
                        onChange={(e) => setStatusDrafts((d) => ({ ...d, [t.poId]: e.target.value }))}
                      >
                        <option value="">Select...</option>
                        <option value="IN_TRANSIT">In Transit</option>
                        <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="DELAYED">Delayed</option>
                      </select>
                      <button
                        disabled={busy === t.poId || !statusDrafts[t.poId]}
                        onClick={() => updateStatus(t.poId)}
                        className="px-2 py-1 bg-nootie-orange-light text-nootie-orange-dark rounded text-xs hover:bg-orange-100 disabled:opacity-50"
                      >
                        Update
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.receivedAndActioned ? (
                      <span className="text-green-700 text-xs font-medium">✓ Confirmed {t.receivedAndActionedAt && format(new Date(t.receivedAndActionedAt), 'dd MMM')}</span>
                    ) : (
                      <button
                        disabled={busy === t.poId}
                        onClick={() => markReceived(t.poId)}
                        className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs hover:bg-green-100 disabled:opacity-50"
                      >
                        Mark Received
                      </button>
                    )}
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
