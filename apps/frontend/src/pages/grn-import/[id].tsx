import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { grnImportService, GrnUploadBatch, GrnImportRow } from '@/services/grn-import.service';
import { format } from 'date-fns';

const STATUS_STYLES: Record<string, string> = {
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const MATCH_STYLES: Record<string, string> = {
  MATCHED: 'bg-green-100 text-green-700',
  PO_NOT_FOUND: 'bg-red-100 text-red-700',
  INVALID: 'bg-nootie-orange-light text-nootie-orange-dark',
};

export default function GrnImportBatchDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [batch, setBatch] = useState<GrnUploadBatch | null>(null);
  const [rows, setRows] = useState<GrnImportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([grnImportService.getBatch(id as string), grnImportService.getRows(id as string)]).then(
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

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{batch.batchCode}</h2>
            <p className="text-sm text-gray-500">{batch.fileName}</p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[batch.status]}`}>{batch.status}</span>
        </div>
        <p className="text-xs text-gray-400">Uploaded {format(new Date(batch.uploadedAt), 'dd MMM yyyy HH:mm')}</p>
        {batch.errorMessage && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{batch.errorMessage}</div>
        )}
        <div className="grid grid-cols-3 gap-4 text-center mt-4">
          <Stat label="Rows" value={batch.totalRows} />
          <Stat label="Recorded" value={batch.matchedCount} accent="text-green-600" />
          <Stat label="Failed / Unmatched" value={batch.unmatchedCount} accent="text-nootie-orange-dark" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-800">Rows</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">PO Number</th>
                <th className="px-4 py-3 text-left">Invoice Number</th>
                <th className="px-4 py-3 text-left">GRN Number</th>
                <th className="px-4 py-3 text-left">GRN Value</th>
                <th className="px-4 py-3 text-left">GRN Status</th>
                <th className="px-4 py-3 text-left">Result</th>
                <th className="px-4 py-3 text-left">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
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
                  <td className="px-4 py-3">{r.grnNumber || '-'}</td>
                  <td className="px-4 py-3">{r.grnValue != null ? `₹${Number(r.grnValue).toLocaleString()}` : '-'}</td>
                  <td className="px-4 py-3">{r.outcome || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${MATCH_STYLES[r.matchStatus]}`}>
                      {r.matchStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.errorMessage || '-'}</td>
                </tr>
              ))}
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
