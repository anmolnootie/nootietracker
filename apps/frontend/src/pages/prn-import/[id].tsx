import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { prnImportService, PrnUploadBatch, PrnImportRow } from '@/services/prn-import.service';
import { format } from 'date-fns';

const STATUS_STYLES: Record<string, string> = {
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const money = (v: number | null) => (v != null ? `₹${Number(v).toLocaleString()}` : '-');
const text = (v: string | number | null) => (v !== null && v !== undefined && v !== '' ? v : '-');

export default function PrnImportBatchDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [batch, setBatch] = useState<PrnUploadBatch | null>(null);
  const [rows, setRows] = useState<PrnImportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([prnImportService.getBatch(id as string), prnImportService.getRows(id as string)]).then(([batchData, rowsData]) => {
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
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-left">From Dispatched FC</th>
                <th className="px-3 py-3 text-left">POS Facility</th>
                <th className="px-3 py-3 text-left">STO Invoice</th>
                <th className="px-3 py-3 text-left">WMS Order</th>
                <th className="px-3 py-3 text-left">GST TIN</th>
                <th className="px-3 py-3 text-left">Legal Name</th>
                <th className="px-3 py-3 text-left">Merchant</th>
                <th className="px-3 py-3 text-left">Vendor</th>
                <th className="px-3 py-3 text-left">Invoice ID</th>
                <th className="px-3 py-3 text-left">Invoice Type</th>
                <th className="px-3 py-3 text-left">Invoice Desc</th>
                <th className="px-3 py-3 text-left">POS Timestamp</th>
                <th className="px-3 py-3 text-left">Item ID</th>
                <th className="px-3 py-3 text-left">Manufacturer</th>
                <th className="px-3 py-3 text-left">Inventory Type</th>
                <th className="px-3 py-3 text-left">UPC</th>
                <th className="px-3 py-3 text-left">Product</th>
                <th className="px-3 py-3 text-left">MRP</th>
                <th className="px-3 py-3 text-left">Qty</th>
                <th className="px-3 py-3 text-left">Landing Price</th>
                <th className="px-3 py-3 text-left">Total Tax</th>
                <th className="px-3 py-3 text-left">Total Cost Price</th>
                <th className="px-3 py-3 text-left">PRN Value</th>
                <th className="px-3 py-3 text-left">Merchant Invoice</th>
                <th className="px-3 py-3 text-left">Txn Sign</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-gray-400">{r.rowIndex + 1}</td>
                  <td className="px-3 py-3">{text(r.lookupCategory)}</td>
                  <td className="px-3 py-3">
                    {text(r.fromDispatchedFc)}
                    {r.fromDispatchedFacilityName && <span className="text-xs text-gray-400"> · {r.fromDispatchedFacilityName}</span>}
                  </td>
                  <td className="px-3 py-3">
                    {text(r.posFacilityId)}
                    {r.posFacilityName && <span className="text-xs text-gray-400"> · {r.posFacilityName}</span>}
                  </td>
                  <td className="px-3 py-3">{text(r.stoInvoiceId)}</td>
                  <td className="px-3 py-3">{text(r.wmsOrderId)}</td>
                  <td className="px-3 py-3">{text(r.gstTin)}</td>
                  <td className="px-3 py-3">{text(r.legalName)}</td>
                  <td className="px-3 py-3">{text(r.merchantName)}</td>
                  <td className="px-3 py-3">{text(r.vendorName)}</td>
                  <td className="px-3 py-3 font-medium">{text(r.invoiceId)}</td>
                  <td className="px-3 py-3">{text(r.invoiceTypeId)}</td>
                  <td className="px-3 py-3">{text(r.invoiceDescription)}</td>
                  <td className="px-3 py-3">{r.posTimestamp ? format(new Date(r.posTimestamp), 'dd MMM yyyy HH:mm') : '-'}</td>
                  <td className="px-3 py-3">{text(r.itemId)}</td>
                  <td className="px-3 py-3">{text(r.manufacturer)}</td>
                  <td className="px-3 py-3">{text(r.inventoryType)}</td>
                  <td className="px-3 py-3">{text(r.upcId)}</td>
                  <td className="px-3 py-3">{text(r.productName)}</td>
                  <td className="px-3 py-3">{money(r.mrp)}</td>
                  <td className="px-3 py-3">{text(r.quantity)}</td>
                  <td className="px-3 py-3">{money(r.landingPrice)}</td>
                  <td className="px-3 py-3">{money(r.totalTax)}</td>
                  <td className="px-3 py-3">{money(r.totalCostPrice)}</td>
                  <td className="px-3 py-3 font-medium">{money(r.prnValue)}</td>
                  <td className="px-3 py-3">{text(r.merchantInvoiceId)}</td>
                  <td className="px-3 py-3">{text(r.txnSign)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
