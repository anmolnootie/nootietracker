import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { RiskBadge, StatusBadge } from '@/components/Badges';
import { poService } from '@/services/po.service';
import { POMaster } from '@po-control-tower/shared';
import { format } from 'date-fns';

export default function POList() {
  const [pos, setPos] = useState<POMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    risk: '',
    status: '',
  });

  useEffect(() => {
    const fetchPOs = async () => {
      try {
        const data = await poService.getAllPOs({
          risk: filters.risk || undefined,
          status: filters.status || undefined,
        });
        setPos(data);
      } catch (error) {
        console.error('Failed to fetch POs', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPOs();
  }, [filters]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading POs...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Risk Status</label>
            <select
              value={filters.risk}
              onChange={(e) => setFilters({ ...filters, risk: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              <option value="BLACK">BLACK</option>
              <option value="RED">RED</option>
              <option value="ORANGE">ORANGE</option>
              <option value="YELLOW">YELLOW</option>
              <option value="GREEN">GREEN</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              <option value="RECEIVED">Received</option>
              <option value="APPOINTMENT_REQUESTED">Appointment Requested</option>
              <option value="APPOINTMENT_CONFIRMED">Appointment Confirmed</option>
              <option value="READY_FOR_DISPATCH">Ready for Dispatch</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="DELIVERED">Delivered</option>
              <option value="GRN_PENDING">GRN Pending</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">&nbsp;</label>
            <Link
              href="/pos/new"
              className="w-full block text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg"
            >
              + Create PO
            </Link>
          </div>
        </div>
      </div>

      {/* PO Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {pos.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No POs found</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">PO Number</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Channel</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Value</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Expiry</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Risk</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Priority</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pos.map((po) => (
                <tr key={po.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-blue-600">
                    <Link href={`/pos/${po.id}`}>{po.poNumber}</Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{po.channelId}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">₹{po.poValue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {format(new Date(po.poExpiryDate), 'dd MMM yyyy')}
                  </td>
                  <td className="px-6 py-4">
                    <RiskBadge risk={po.riskStatus} size="sm" />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={po.status} />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">{po.priorityScore.toFixed(1)}</td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/pos/${po.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View
                    </Link>
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
