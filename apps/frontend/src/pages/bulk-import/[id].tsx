import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { bulkImportService } from '@/services/bulk-import.service';
import { exceptionsService } from '@/services/exceptions.service';
import { format } from 'date-fns';

const DEDUP_COLORS: Record<string, string> = {
  NEW: 'bg-green-100 text-green-700',
  UPDATED: 'bg-blue-100 text-blue-700',
  EXACT_DUPLICATE: 'bg-gray-100 text-gray-600',
  POSSIBLE_DUPLICATE: 'bg-nootie-orange-light text-nootie-orange-dark',
};

export default function BatchDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [tab, setTab] = useState<'processed' | 'exceptions'>('processed');
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (showSpinner = true) => {
    if (!id) return;
    if (showSpinner) setLoading(true);
    const [batchData, processedRows, batchExceptions] = await Promise.all([
      bulkImportService.getBatch(id as string),
      bulkImportService.getProcessedRows(id as string),
      exceptionsService.list({ batchId: id as string }),
    ]);
    setData(batchData);
    setRows(processedRows);
    setExceptions(batchExceptions);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (router.query.tab === 'exceptions') setTab('exceptions');
  }, [router.query.tab]);

  if (loading || !data) {
    return (
      <MainLayout>
        <p className="text-gray-500">Loading...</p>
      </MainLayout>
    );
  }

  const { batch, reconciliation } = data;

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{batch.batchCode}</h2>
            <p className="text-sm text-gray-500">{batch.fileName} · {batch.platform} · uploaded {format(new Date(batch.uploadedAt), 'dd MMM yyyy HH:mm')}</p>
          </div>
          <span className="px-3 py-1 rounded text-sm font-medium bg-nootie-orange-light text-nootie-orange-dark">
            {batch.status.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center border-t pt-4">
          <Stat label="Total Rows" value={batch.totalRows} />
          <Stat label="POs" value={batch.poCount} />
          <Stat label="New" value={batch.newRecords} accent="text-green-600" />
          <Stat label="Updated" value={batch.updatedRecords} accent="text-blue-600" />
          <Stat label="Duplicates" value={batch.duplicateRecords} />
          <Stat label="Exceptions" value={batch.exceptionRecords} accent="text-nootie-orange-dark" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Reconciliation Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="Total PO Value" value={`₹${Number(reconciliation.totalPoValue).toLocaleString()}`} />
          <Stat label="Ordered Qty" value={reconciliation.totalOrderedQty} />
          <Stat label="Delivered Qty" value={reconciliation.totalDeliveredQty} />
          <Stat label="Pending Qty" value={reconciliation.totalPendingQty} />
          <Stat label="Pending Value" value={`₹${Number(reconciliation.totalPendingValue).toLocaleString()}`} />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button onClick={() => setTab('processed')} className={`px-3 py-1.5 rounded text-sm ${tab === 'processed' ? 'bg-nootie-orange-dark text-white' : 'bg-gray-100 text-gray-600'}`}>
              Processed Rows ({rows.length})
            </button>
            <button onClick={() => setTab('exceptions')} className={`px-3 py-1.5 rounded text-sm ${tab === 'exceptions' ? 'bg-nootie-orange-dark text-white' : 'bg-gray-100 text-gray-600'}`}>
              Exceptions ({exceptions.length})
            </button>
          </div>
          <button
            onClick={() => load(false)}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
          >
            🔄 Refresh
          </button>
        </div>

        {tab === 'processed' && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left">PO</th>
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-left">Warehouse</th>
                <th className="px-4 py-2 text-right">Ordered</th>
                <th className="px-4 py-2 text-right">Delivered</th>
                <th className="px-4 py-2 text-right">Pending</th>
                <th className="px-4 py-2 text-left">Classification</th>
                <th className="px-4 py-2 text-left">Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className={r.validationStatus === 'INVALID' ? 'bg-red-50' : ''}>
                  <td className="px-4 py-2 font-medium">
                    {r.matchedPoId ? (
                      <a href={`/pos/${r.matchedPoId}`} className="text-nootie-orange-dark hover:underline">{r.poNumber || '-'}</a>
                    ) : (
                      r.poNumber || <span className="text-gray-400">missing</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{r.skuCode || <span className="text-gray-400">missing</span>}</td>
                  <td className="px-4 py-2">{r.warehouse || '-'}</td>
                  <td className="px-4 py-2 text-right">{r.orderedQty ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{r.deliveredQty ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{r.pendingQty ?? '-'}</td>
                  <td className="px-4 py-2">
                    {r.dedupClassification && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${DEDUP_COLORS[r.dedupClassification]}`}>
                        {r.dedupClassification.replace(/_/g, ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.validationStatus === 'VALID' ? (
                      <span className="text-green-600">Valid</span>
                    ) : (
                      <span className="text-red-600" title={(r.validationErrors || []).join('; ')}>
                        {r.validationStatus} ({(r.validationErrors || []).length})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'exceptions' && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Severity</th>
                <th className="px-4 py-2 text-left">PO</th>
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-left">Recommended Action</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {exceptions.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 font-medium">{e.exceptionType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        e.severity === 'CRITICAL' || e.severity === 'HIGH' ? 'bg-red-100 text-red-700' : e.severity === 'MEDIUM' ? 'bg-nootie-orange-light text-nootie-orange-dark' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {e.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2">{e.poNumber || '-'}</td>
                  <td className="px-4 py-2">{e.skuCode || '-'}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">{e.recommendedAction}</td>
                  <td className="px-4 py-2 text-xs">{e.resolutionStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MainLayout>
  );
}

const Stat: React.FC<{ label: string; value: any; accent?: string }> = ({ label, value, accent }) => (
  <div>
    <p className={`text-xl font-bold ${accent || 'text-gray-800'}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);
