import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { expiredUndeliveredService, ExpiredUndeliveredDashboard } from '@/services/expired-undelivered.service';
import { format } from 'date-fns';

const inr = (n: number) => Number(n || 0).toLocaleString('en-IN');

const CN_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  ESCALATED: 'Escalated',
  COMPLETED: 'Completed',
};

export default function ExpiredUndeliveredView() {
  const [data, setData] = useState<ExpiredUndeliveredDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setData(await expiredUndeliveredService.get());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const download = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      await expiredUndeliveredService.downloadExcel();
    } catch {
      setDownloadError('Could not download the file.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading...</p>
        </div>
      </MainLayout>
    );
  }

  const rows = data?.rows ?? [];

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-gray-800">⏱ Expired - Dispatched, Not Delivered</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={download}
            disabled={downloading || rows.length === 0}
            className="px-3 py-1.5 rounded border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
          >
            {downloading ? 'Downloading...' : '⬇ Download Excel'}
          </button>
          <button onClick={load} disabled={loading} className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            🔄 Refresh
          </button>
          <Link href="/pos" className="text-nootie-orange-dark hover:underline text-sm font-medium">
            ← Back to All POs
          </Link>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        POs that were dispatched but expired before ever being delivered - auto-flagged by the Recall + CN rule and opened as a Return, distinct
        from <Link href="/pos/not-fulfilled" className="text-nootie-orange-dark hover:underline">Not Fulfilled</Link>, which is POs that never left our hands at all.
      </p>
      {downloadError && <p className="mb-4 px-4 py-2 text-xs text-red-700 bg-red-50 rounded">{downloadError}</p>}

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total</p>
          <p className="text-3xl font-bold text-gray-800">{data?.total ?? 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Invoice Value</p>
          <p className="text-3xl font-bold text-gray-800">₹{inr(data?.totalInvoiceValue ?? 0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5 border border-red-200">
          <p className="text-xs text-red-500 uppercase tracking-wide mb-1">Open Credit Note Tasks</p>
          <p className="text-3xl font-bold text-red-600">{data?.openCreditNoteTasks ?? 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-800">POs</h3>
        </div>
        {rows.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No expired, undelivered dispatches - nothing here to chase.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">PO Number</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Channel</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Location</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Dispatched</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">PO Expiry</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">Days Overdue</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">Invoice Value</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Courier Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Delivery Partner / AWB</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Credit Note Task</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.returnId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-nootie-orange-dark">
                      <Link href={`/pos/${r.poId}`}>{r.poNumber}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.channel}</td>
                    <td className="px-4 py-3 text-gray-700">{r.location}</td>
                    <td className="px-4 py-3 text-gray-600">{r.dispatchDate ? format(new Date(r.dispatchDate), 'dd MMM yy') : '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{format(new Date(r.poExpiryDate), 'dd MMM yy')}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.daysOverdue > 14 ? 'bg-red-100 text-red-700' : r.daysOverdue > 3 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {r.daysOverdue}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">₹{inr(r.invoiceValue)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.courierStatus || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.deliveryPartner || '-'}
                      {r.awb && <span className="block text-xs text-gray-400">{r.awb}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.creditNoteStatus ? (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            r.creditNoteStatus === 'COMPLETED' ? 'bg-green-50 text-green-700' : r.creditNoteStatus === 'ESCALATED' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {CN_STATUS_LABEL[r.creditNoteStatus] || r.creditNoteStatus}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
