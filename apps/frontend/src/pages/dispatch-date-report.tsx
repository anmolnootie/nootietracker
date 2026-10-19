import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { bulkImportService } from '@/services/bulk-import.service';
import { format } from 'date-fns';

const LOCATION_TYPE_STYLES: Record<string, string> = {
  LOCAL: 'bg-nootie-orange-light text-nootie-orange-dark',
  NON_LOCAL: 'bg-blue-100 text-blue-700',
};

function todayIst(): string {
  // en-CA gives YYYY-MM-DD directly, which is exactly what the date input
  // and the backend's dispatch-date filter both expect.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export default function DispatchDateReport() {
  const [date, setDate] = useState(todayIst());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [expandedSkuRow, setExpandedSkuRow] = useState<number | null>(null);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    bulkImportService
      .getByDispatchDate(date)
      .then(setData)
      .finally(() => setLoading(false));
  }, [date]);

  const download = async (report: 'sku-summary' | 'po-summary') => {
    setDownloading(report);
    try {
      await bulkImportService.downloadByDispatchDate(report, date);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Day-wise Dispatch Report</h2>
            <p className="text-sm text-gray-500 mt-1">
              Pick a dispatch date to see every PO due to go out that day and a SKU-level quantity summary -
              download either as Excel. POs already dispatched aren&apos;t counted.
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dispatch Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <p className="text-3xl font-bold text-gray-800">{data?.poCount ?? 0}</p>
            <p className="text-sm text-gray-500 mt-1">
              PO{data?.poCount === 1 ? '' : 's'} due to dispatch on {date ? format(new Date(`${date}T00:00:00`), 'dd MMM yyyy') : ''}
            </p>
          </div>

          {!data?.poCount ? (
            <p className="text-gray-500">No POs are due to dispatch on this date.</p>
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
                      <th className="px-4 py-2 text-right">Units To Dispatch</th>
                      <th className="px-4 py-2 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr className="bg-nootie-cream font-semibold">
                      <td className="px-4 py-2" colSpan={3}>Grand Total</td>
                      <td className="px-4 py-2 text-right">{data.skuSummary.grandTotal.unitsOrdered.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">₹{data.skuSummary.grandTotal.totalAmount.toLocaleString()}</td>
                    </tr>
                    {data.skuSummary.rows.map((r: any, i: number) => (
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

              {/* PO Summary */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-800">POs Due This Day</h3>
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
                      <th className="px-4 py-2 text-right">Total Amount</th>
                      <th className="px-4 py-2 text-left">Dispatch Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.poSummary.rows.map((r: any) => (
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
                      <td className="px-4 py-2 text-right">₹{data.poSummary.grandTotal.toLocaleString()}</td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </MainLayout>
  );
}
