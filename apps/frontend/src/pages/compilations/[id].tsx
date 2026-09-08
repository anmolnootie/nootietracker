import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { RiskBadge, StatusBadge } from '@/components/Badges';
import { compilationsService } from '@/services/compilations.service';
import { format } from 'date-fns';

export default function CompilationDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState<any>(null);
  const [skuSummary, setSkuSummary] = useState<any>(null);
  const [poSummary, setPoSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSkuRow, setExpandedSkuRow] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [detail, sku, po] = await Promise.all([
        compilationsService.getById(id as string),
        compilationsService.getSkuSummary(id as string),
        compilationsService.getPoSummary(id as string),
      ]);
      setData(detail);
      setSkuSummary(sku);
      setPoSummary(po);
      setLoading(false);
    })();
  }, [id]);

  const download = async (report: 'sku-summary' | 'po-summary') => {
    setDownloading(report);
    try {
      await compilationsService.downloadReport(id as string, report, data.compilation.compilationCode);
    } finally {
      setDownloading(null);
    }
  };

  if (loading || !data) {
    return (
      <MainLayout>
        <p className="text-gray-500">Loading...</p>
      </MainLayout>
    );
  }

  const { compilation, pos } = data;

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{compilation.compilationCode}</h2>
            {compilation.name && <p className="text-sm text-gray-500">{compilation.name}</p>}
            <p className="text-xs text-gray-400 mt-1">Created {format(new Date(compilation.createdAt), 'dd MMM yyyy HH:mm')} · {pos.length} PO(s)</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-800">POs in this Compilation</h3>
          <p className="text-xs text-gray-400 mt-1">Live data - if a PO changes later, it shows here immediately.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2 text-left">PO</th>
              <th className="px-4 py-2 text-left">Platform</th>
              <th className="px-4 py-2 text-left">Location</th>
              <th className="px-4 py-2 text-left">Expiry</th>
              <th className="px-4 py-2 text-right">Value</th>
              <th className="px-4 py-2 text-left">Risk</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pos.map((po: any) => (
              <tr key={po.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium"><a href={`/pos/${po.id}`} className="text-nootie-orange-dark hover:underline">{po.poNumber}</a></td>
                <td className="px-4 py-2">{po.channelId}</td>
                <td className="px-4 py-2">{po.location}</td>
                <td className="px-4 py-2">{format(new Date(po.poExpiryDate), 'dd MMM yyyy')}</td>
                <td className="px-4 py-2 text-right">₹{Number(po.poValue).toLocaleString()}</td>
                <td className="px-4 py-2"><RiskBadge risk={po.riskStatus} size="sm" /></td>
                <td className="px-4 py-2"><StatusBadge status={po.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">SKU Summary</h3>
          <button disabled={downloading === 'sku-summary'} onClick={() => download('sku-summary')} className="bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm font-medium py-1.5 px-4 rounded-lg disabled:opacity-50">
            {downloading === 'sku-summary' ? 'Downloading...' : '⇩ Download Excel'}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2 text-left">UPC</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-right">MRP</th>
              <th className="px-4 py-2 text-right">Units Ordered</th>
              <th className="px-4 py-2 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="bg-nootie-cream font-semibold">
              <td className="px-4 py-2" colSpan={3}>Grand Total</td>
              <td className="px-4 py-2 text-right">{skuSummary.grandTotal.unitsOrdered.toLocaleString()}</td>
              <td className="px-4 py-2 text-right">₹{skuSummary.grandTotal.totalAmount.toLocaleString()}</td>
            </tr>
            {skuSummary.rows.map((r: any, i: number) => (
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

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">PO / Facility Summary</h3>
          <button disabled={downloading === 'po-summary'} onClick={() => download('po-summary')} className="bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm font-medium py-1.5 px-4 rounded-lg disabled:opacity-50">
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
            {poSummary.rows.map((r: any) => (
              <tr key={r.poNumber}>
                <td className="px-4 py-2 font-medium">{r.poNumber}</td>
                <td className="px-4 py-2">{r.facilityName}</td>
                <td className="px-4 py-2">{format(new Date(r.orderDate), 'dd MMM yyyy')}</td>
                <td className="px-4 py-2">{format(new Date(r.expiryDate), 'dd MMM yyyy')}</td>
                <td className="px-4 py-2 text-right">₹{r.totalAmount.toLocaleString()}</td>
                <td className="px-4 py-2">{r.dispatchDate ? format(new Date(r.dispatchDate), 'dd MMM yyyy') : '-'}</td>
              </tr>
            ))}
            <tr className="bg-nootie-cream font-semibold">
              <td className="px-4 py-2" colSpan={4}>Grand Total</td>
              <td className="px-4 py-2 text-right">₹{poSummary.grandTotal.toLocaleString()}</td>
              <td className="px-4 py-2"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}
