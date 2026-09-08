import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { RiskBadge, StatusBadge } from '@/components/Badges';
import { poService, POView } from '@/services/po.service';
import { POMaster, NON_FULFILMENT_REASON_LABELS, NonFulfilmentReason } from '@po-control-tower/shared';
import { format } from 'date-fns';

const TABS: { key: POView | 'all'; label: string }[] = [
  { key: 'all', label: 'All POs' },
  { key: 'active', label: 'Active' },
  { key: 'at_risk', label: 'At Risk' },
  { key: 'expiring_soon', label: 'Expiring Soon' },
  { key: 'low_value', label: 'Low PO Value' },
  { key: 'not_fulfilled', label: 'Not Fulfilled' },
];

export default function POList() {
  const [pos, setPos] = useState<POMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<POView | 'all'>('all');
  const [filters, setFilters] = useState({
    risk: '',
    status: '',
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState('');

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const data = await poService.getAllPOs({
        risk: filters.risk || undefined,
        status: filters.status || undefined,
        view: activeTab === 'all' ? undefined : activeTab,
      });
      setPos(data);
      setSelected(new Set());
    } catch (error) {
      console.error('Failed to fetch POs', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPOs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab]);

  const handleDelete = async (poId: string) => {
    await poService.softDeletePO(poId);
    setDeletingId(null);
    fetchPOs();
  };

  const toggleSelect = (poId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId);
      else next.add(poId);
      return next;
    });
  };

  const allVisibleSelected = pos.length > 0 && pos.every((po) => selected.has(po.id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) return new Set();
      return new Set(pos.map((po) => po.id));
    });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    setBulkError('');
    try {
      const result = await poService.bulkSoftDeletePO([...selected]);
      setBulkDeleteOpen(false);
      if (result.failed.length > 0) {
        setBulkError(`${result.deleted.length} moved to Bin, ${result.failed.length} failed: ${result.failed.map((f) => f.reason).join('; ')}`);
      }
      fetchPOs();
    } catch (err: any) {
      setBulkError(err.response?.data?.message || 'Failed to delete selected POs');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <MainLayout>
      {/* View Tabs */}
      <div className="bg-white rounded-lg shadow mb-6 flex items-center overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'text-nootie-orange-dark border-b-2 border-nootie-orange'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <Link
          href="/pos/bin"
          className="px-5 py-3 text-sm font-medium text-gray-600 hover:text-gray-800 whitespace-nowrap ml-auto"
        >
          🗑 Deleted / Bin
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-4 gap-4">
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
              href="/pos/import"
              className="w-full block text-center bg-nootie-orange-light text-nootie-orange-dark border border-nootie-gold font-medium py-2 rounded-lg hover:bg-orange-100"
            >
              ⇪ Import PO
            </Link>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">&nbsp;</label>
            <Link
              href="/pos/new"
              className="w-full block text-center bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 rounded-lg"
            >
              + Create PO
            </Link>
          </div>
        </div>
      </div>

      {bulkError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6 flex justify-between items-center">
          <span>{bulkError}</span>
          <button onClick={() => setBulkError('')} className="text-red-400 hover:text-red-600">
            &times;
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="bg-nootie-orange-light border border-nootie-gold rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
          <span className="text-sm font-medium text-nootie-orange-dark">{selected.size} PO{selected.size > 1 ? 's' : ''} selected</span>
          <div className="flex gap-3">
            <button onClick={() => setSelected(new Set())} className="text-sm text-gray-600 hover:text-gray-800 font-medium">
              Clear
            </button>
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg"
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* PO Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading POs...</div>
        ) : pos.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No POs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="h-4 w-4 accent-nootie-orange-dark cursor-pointer" />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">PO Number</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Platform</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Location</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">PO Value</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Available Value</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Fulfilment %</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Expiry</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Risk</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">PO Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Fulfilment Decision</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Reason</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pos.map((po) => (
                  <tr key={po.id} className={`hover:bg-gray-50 ${selected.has(po.id) ? 'bg-nootie-orange-light/40' : ''}`}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selected.has(po.id)}
                        onChange={() => toggleSelect(po.id)}
                        className="h-4 w-4 accent-nootie-orange-dark cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-nootie-orange-dark whitespace-nowrap">
                      <Link href={`/pos/${po.id}`}>{po.poNumber}</Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{po.channelId}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{po.location}</td>
                    <td className="px-4 py-4 text-sm text-gray-700 whitespace-nowrap">
                      ₹{Number(po.poValue).toLocaleString()}
                      {po.isLowPoValue && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">
                          LOW
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700 whitespace-nowrap">
                      {po.availableStockValue != null ? `₹${Number(po.availableStockValue).toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {po.fulfilmentPercent != null ? `${Number(po.fulfilmentPercent).toFixed(0)}%` : '-'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700 whitespace-nowrap">
                      {format(new Date(po.poExpiryDate), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-4">
                      <RiskBadge risk={po.riskStatus} size="sm" />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={po.status} />
                    </td>
                    <td className="px-4 py-4">
                      {po.fulfilmentDecision === 'NOT_FULFILLED' ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Not Fulfilled</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Fulfilled</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {po.nonFulfilmentReason
                        ? NON_FULFILMENT_REASON_LABELS[po.nonFulfilmentReason as NonFulfilmentReason]
                        : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/pos/${po.id}`}
                          className="text-nootie-orange-dark hover:text-nootie-orange text-sm font-medium whitespace-nowrap"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => setDeletingId(po.id)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium whitespace-nowrap"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deletingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <p className="font-medium text-gray-800 mb-2">Move PO to Bin?</p>
            <p className="text-sm text-gray-600 mb-6">
              This PO will be removed from active PO views but will remain recoverable in the Bin.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
              >
                Move to Bin
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <p className="font-medium text-gray-800 mb-2">
              Move {selected.size} PO{selected.size > 1 ? 's' : ''} to Bin?
            </p>
            <p className="text-sm text-gray-600 mb-6">
              These POs will be removed from active PO views but will remain recoverable in the Bin.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setBulkDeleteOpen(false)}
                disabled={bulkDeleting}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {bulkDeleting ? 'Moving...' : `Move ${selected.size} to Bin`}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
