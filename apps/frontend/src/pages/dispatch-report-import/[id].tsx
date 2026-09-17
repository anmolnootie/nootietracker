import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { dispatchReportImportService, DispatchReportUploadBatch, DispatchReportRow } from '@/services/dispatch-report-import.service';
import { format } from 'date-fns';

const STATUS_STYLES: Record<string, string> = {
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const MATCH_STYLES: Record<string, string> = {
  RECONCILED: 'bg-green-100 text-green-700',
  MISMATCH: 'bg-red-100 text-red-700',
  INVALID: 'bg-gray-100 text-gray-600',
};

export default function DispatchReportBatchDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [batch, setBatch] = useState<DispatchReportUploadBatch | null>(null);
  const [rows, setRows] = useState<DispatchReportRow[]>([]);
  const [showOnlyMismatches, setShowOnlyMismatches] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([dispatchReportImportService.getBatch(id as string), dispatchReportImportService.getRows(id as string)]).then(
      ([batchData, rowsData]) => {
        setBatch(batchData);
        setRows(rowsData);
        setLoading(false);
      },
    );
  }, [id]);

  if (loading || !batch) {
    return (
      <MainLayout>
        <p className="text-gray-500">Loading...</p>
      </MainLayout>
    );
  }

  const visibleRows = showOnlyMismatches ? rows.filter((r) => r.matchStatus !== 'RECONCILED') : rows;

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{batch.batchCode}</h2>
            <p className="text-sm text-gray-500">
              {batch.fileName} {batch.platform ? `· ${batch.platform}` : ''}
            </p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[batch.status]}`}>{batch.status}</span>
        </div>
        <p className="text-xs text-gray-400">Uploaded {format(new Date(batch.uploadedAt), 'dd MMM yyyy HH:mm')}</p>
        {batch.errorMessage && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{batch.errorMessage}</div>
        )}
        <div className="grid grid-cols-3 gap-4 text-center mt-4">
          <Stat label="Rows" value={batch.totalRows} />
          <Stat label="Reconciled" value={batch.reconciledCount} accent="text-green-600" />
          <Stat label="Mismatches" value={batch.mismatchCount} accent="text-red-600" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Rows</h3>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={showOnlyMismatches} onChange={(e) => setShowOnlyMismatches(e.target.checked)} />
            Mismatches only
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">PO Number</th>
                <th className="px-4 py-3 text-left">Invoice Number</th>
                <th className="px-4 py-3 text-left">Invoice Value</th>
                <th className="px-4 py-3 text-left">Result</th>
                <th className="px-4 py-3 text-left">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{r.rowIndex + 1}</td>
                  <td className="px-4 py-3 font-medium">
                    {r.matchedPoId ? (
                      <a href={`/pos/${r.matchedPoId}`} className="text-nootie-orange-dark hover:underline">
                        {r.poNumber || r.matchedPoId}
                      </a>
                    ) : (
                      r.poNumber || '-'
                    )}
                  </td>
                  <td className="px-4 py-3">{r.invoiceNumber || '-'}</td>
                  <td className="px-4 py-3">{r.invoiceValue != null ? `₹${Number(r.invoiceValue).toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${MATCH_STYLES[r.matchStatus]}`}>{r.matchStatus}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.errorMessage || '-'}</td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No mismatches - every invoice in this report was found in the system.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}

const Stat: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
  <div>
    <p className={`text-2xl font-bold ${accent || 'text-gray-800'}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);
