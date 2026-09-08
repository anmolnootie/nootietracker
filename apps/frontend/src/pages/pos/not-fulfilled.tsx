import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { RiskBadge } from '@/components/Badges';
import { poService } from '@/services/po.service';
import { POMaster, NON_FULFILMENT_REASON_LABELS, NonFulfilmentReason } from '@po-control-tower/shared';
import { format } from 'date-fns';

interface Dashboard {
  totalPOs: number;
  totalValue: number;
  potentiallyLostValue: number;
  breakdown: { reason: string; count: number; value: number }[];
}

export default function NotFulfilledView() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [pos, setPos] = useState<POMaster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [dashboardData, poData] = await Promise.all([
          poService.getNotFulfilledDashboard(),
          poService.getAllPOs({ view: 'not_fulfilled' }),
        ]);
        setDashboard(dashboardData);
        setPos(poData);
      } catch (err) {
        console.error('Failed to load Not Fulfilled view', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">🔴 Not Fulfilled</h2>
        <Link href="/pos" className="text-nootie-orange-dark hover:underline text-sm font-medium">
          ← Back to All POs
        </Link>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Not Fulfilled</p>
          <p className="text-3xl font-bold text-gray-800">{dashboard?.totalPOs ?? 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total PO Value</p>
          <p className="text-3xl font-bold text-gray-800">₹{(dashboard?.totalValue ?? 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5 border border-red-200">
          <p className="text-xs text-red-500 uppercase tracking-wide mb-1">Potentially Lost Value</p>
          <p className="text-3xl font-bold text-red-600">₹{(dashboard?.potentiallyLostValue ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Breakdown by reason */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Breakdown by Reason</h3>
        </div>
        {!dashboard || dashboard.breakdown.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No not-fulfilled POs recorded.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-2 text-left text-sm font-medium text-gray-700">Reason</th>
                <th className="px-6 py-2 text-right text-sm font-medium text-gray-700">POs</th>
                <th className="px-6 py-2 text-right text-sm font-medium text-gray-700">PO Value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dashboard.breakdown.map((row) => (
                <tr key={row.reason}>
                  <td className="px-6 py-3 text-sm text-gray-800">
                    {NON_FULFILMENT_REASON_LABELS[row.reason as NonFulfilmentReason] || row.reason}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700 text-right">{row.count}</td>
                  <td className="px-6 py-3 text-sm text-gray-700 text-right">₹{row.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Underlying PO list */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Not Fulfilled POs</h3>
        </div>
        {pos.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No not-fulfilled POs recorded.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">PO Number</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Platform</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Location</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-700">PO Value</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Risk</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Reason</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Remarks</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Marked At</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pos.map((po) => (
                <tr key={po.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-nootie-orange-dark">
                    <Link href={`/pos/${po.id}`}>{po.poNumber}</Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{po.channelId}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{po.location}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 text-right">₹{Number(po.poValue).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <RiskBadge risk={po.riskStatus} size="sm" />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {po.nonFulfilmentReason
                      ? NON_FULFILMENT_REASON_LABELS[po.nonFulfilmentReason as NonFulfilmentReason]
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{po.nonFulfilmentRemarks || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {po.nonFulfilmentAt ? format(new Date(po.nonFulfilmentAt), 'dd MMM yyyy HH:mm') : '-'}
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
