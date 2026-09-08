import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { bulkImportService } from '@/services/bulk-import.service';
import { format } from 'date-fns';

const LOCATION_TYPE_STYLES: Record<string, string> = {
  LOCAL: 'bg-nootie-orange-light text-nootie-orange-dark',
  NON_LOCAL: 'bg-blue-100 text-blue-700',
};

export default function CompilationReports() {
  const router = useRouter();
  const [batches, setBatches] = useState<any[]>([]);
  const [batchId, setBatchId] = useState<string>('');
  const [skuSummary, setSkuSummary] = useState<any>(null);
  const [poSummary, setPoSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [expandedSkuRow, setExpandedSkuRow] = useState<number | null>(null);

  useEffect(() => {
    bulkImportService.listBatches().then((list) => {
      setBatches(list);
      const requested = typeof router.query.batchId === 'string' ? router.query.batchId : undefined;
      if (requested && list.some((b) => b.id === requested)) setBatchId(requested);
      else if (list.length > 0) setBatchId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.batchId]);

  useEffect(() => {
    if (!batchId) return;
    setLoading(true);
    Promise.all([
      bulkImportService.getSkuSummary({ batchId }),
      bulkImportService.getPoSummary({ batchId }),
    ])
      .then(([sku, po]) => {
        setSkuSummary(sku);
        setPoSummary(po);
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  const download = async (report: 'sku-summary' | 'po-summary') => {
    setDownloading(report);
    try {
      await bulkImportService.downloadReport(report, { batchId });
    } finally {
      setDownloading(null);
    }
  };

  const selectedBatch = batches.find((b) => b.id === batchId);

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">PO Compilation Reports</h2>
            <p className="text-sm text-gray-500 mt-1">
              The SKU and PO/facility rollups your team used to build by hand in Excel - generated automatically
              from every bulk upload, ready to download.
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Upload</label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="border rounded px-3 py-2 text-sm min-w-[280px]"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchCode} - {b.fileName} ({format(new Date(b.uploadedAt), 'dd MMM HH:mm')})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !selectedBatch ? (
        <p className="text-gray-500">Upload a bulk PO file first to see reports here.</p>
      ) : (
        <>
          {/* SKU Summary */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">SKU Summary</h3>
              <button
                disabled={downloading === 'sku-summary'}
                onClick={() => download('sku-summary')}
                className="bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm font-medium py-1.5 px-4 rounded-lg disabled:opacity-50"
              >
                {downloading === 'sku-summary' ? 'Downloading...' : '⇩ Download Excel'}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">UPC</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-right">MRP</th>
                  <th className="px-4 py-2 text-right">Sum of Units Ordered</th>
                  <th className="px-4 py-2 text-right">Sum of Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr className="bg-nootie-cream font-semibold">
                  <td className="px-4 py-2" colSpan={3}>Grand Total</td>
                  <td className="px-4 py-2 text-right">{skuSummary?.grandTotal.unitsOrdered.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">₹{skuSummary?.grandTotal.totalAmount.toLocaleString()}</td>
                </tr>
                {skuSummary?.rows.map((r: any, i: number) => (
                  <React.Fragment key={i}>
                    <tr className={r.isDuplicateMrp ? 'bg-yellow-200' : ''}>
                      <td className="px-4 py-2 font-mono text-xs">{r.upc || '-'}</td>
                      <td className="px-4 py-2">
                        {r.name}
                        {r.isDuplicateMrp && (
                          <button
                            type="button"
                            onClick={() => setExpandedSkuRow(expandedSkuRow === i ? null : i)}
                            className="ml-2 text-xs text-yellow-800 underline decoration-dotted"
                          >
                            ⚠ MRP mismatch
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{r.mrp != null ? `₹${r.mrp}` : '-'}</td>
                      <td className="px-4 py-2 text-right">{r.unitsOrdered.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">₹{r.totalAmount.toLocaleString()}</td>
                    </tr>
                    {expandedSkuRow === i && r.mismatchDetail && (
                      <tr className="bg-yellow-50">
                        <td colSpan={5} className="px-4 py-2 text-xs text-yellow-900 border-t border-yellow-200">
                          {r.mismatchDetail}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* PO / Facility Summary */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">PO / Facility Summary</h3>
              <button
                disabled={downloading === 'po-summary'}
                onClick={() => download('po-summary')}
                className="bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm font-medium py-1.5 px-4 rounded-lg disabled:opacity-50"
              >
                {downloading === 'po-summary' ? 'Downloading...' : '⇩ Download Excel'}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">PO Number</th>
                  <th className="px-4 py-2 text-left">Facility</th>
                  <th className="px-4 py-2 text-left">Order Date</th>
                  <th className="px-4 py-2 text-left">Expiry Date</th>
                  <th className="px-4 py-2 text-right">Sum of Total Amount</th>
                  <th className="px-4 py-2 text-left">Dispatch Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {poSummary?.rows.map((r: any) => (
                  <tr key={r.poNumber}>
                    <td className="px-4 py-2 font-medium">{r.poNumber}</td>
                    <td className="px-4 py-2">
                      {r.facilityName}
                      {r.locationType && (
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${LOCATION_TYPE_STYLES[r.locationType]}`}>
                          {r.locationType}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{format(new Date(r.orderDate), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-2">{format(new Date(r.expiryDate), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-2 text-right">₹{r.totalAmount.toLocaleString()}</td>
                    <td className="px-4 py-2">{r.dispatchDate ? format(new Date(r.dispatchDate), 'dd MMM yyyy') : '-'}</td>
                  </tr>
                ))}
                <tr className="bg-nootie-cream font-semibold">
                  <td className="px-4 py-2" colSpan={4}>Grand Total</td>
                  <td className="px-4 py-2 text-right">₹{poSummary?.grandTotal.toLocaleString()}</td>
                  <td className="px-4 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </MainLayout>
  );
}
