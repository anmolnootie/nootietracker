import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { dnImportService, DnUploadBatch, DnImportRow } from '@/services/dn-import.service';
import { format } from 'date-fns';

const STATUS_STYLES: Record<string, string> = {
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const money = (v: number | null) => (v != null ? `₹${Number(v).toLocaleString()}` : '-');
const text = (v: string | number | null) => (v !== null && v !== undefined && v !== '' ? v : '-');

export default function DnImportBatchDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [batch, setBatch] = useState<DnUploadBatch | null>(null);
  const [rows, setRows] = useState<DnImportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([dnImportService.getBatch(id as string), dnImportService.getRows(id as string)]).then(([batchData, rowsData]) => {
      setBatch(batchData);
      setRows(rowsData);
      setLoading(false);
    });
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
        <div className="mt-4">
          <p className="text-2xl font-bold text-gray-800">{batch.totalRows}</p>
          <p className="text-xs text-gray-500 mt-1">Rows</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-800">Rows</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-3 text-left">#</th>
                <th className="px-3 py-3 text-left">Facility</th>
                <th className="px-3 py-3 text-left">DN ID</th>
                <th className="px-3 py-3 text-left">DN Date</th>
                <th className="px-3 py-3 text-left">Vendor</th>
                <th className="px-3 py-3 text-left">Vendor GSTIN</th>
                <th className="px-3 py-3 text-left">Purchase Number</th>
                <th className="px-3 py-3 text-left">Manufacturer</th>
                <th className="px-3 py-3 text-left">Invoice ID</th>
                <th className="px-3 py-3 text-left">Item ID</th>
                <th className="px-3 py-3 text-left">Product</th>
                <th className="px-3 py-3 text-left">UPC</th>
                <th className="px-3 py-3 text-left">Qty</th>
                <th className="px-3 py-3 text-left">Unit Landing Price</th>
                <th className="px-3 py-3 text-left">Item DN Amount</th>
                <th className="px-3 py-3 text-left">DN Net Amount</th>
                <th className="px-3 py-3 text-left">Remark</th>
                <th className="px-3 py-3 text-left">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-gray-400">{r.rowIndex + 1}</td>
                  <td className="px-3 py-3">{text(r.facilityName)}</td>
                  <td className="px-3 py-3 font-medium">{text(r.dnId)}</td>
                  <td className="px-3 py-3">{r.dnDate ? format(new Date(r.dnDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                  <td className="px-3 py-3">{text(r.vendorName)}</td>
                  <td className="px-3 py-3">{text(r.vendorGstin)}</td>
                  <td className="px-3 py-3">{text(r.purchaseNumber)}</td>
                  <td className="px-3 py-3">{text(r.manufacturer)}</td>
                  <td className="px-3 py-3">{text(r.invoiceId)}</td>
                  <td className="px-3 py-3">{text(r.itemId)}</td>
                  <td className="px-3 py-3">{text(r.productName)}</td>
                  <td className="px-3 py-3">{text(r.upcId)}</td>
                  <td className="px-3 py-3">{text(r.dnQuantity)}</td>
                  <td className="px-3 py-3">{money(r.unitLandingPrice)}</td>
                  <td className="px-3 py-3">{money(r.itemDnAmount)}</td>
                  <td className="px-3 py-3 font-medium">{money(r.dnNetAmount)}</td>
                  <td className="px-3 py-3">{text(r.remark)}</td>
                  <td className="px-3 py-3">{text(r.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
