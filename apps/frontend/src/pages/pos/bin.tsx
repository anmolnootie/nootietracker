import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { poService } from '@/services/po.service';
import { useAuthStore } from '@/store/auth.store';
import { POMaster } from '@po-control-tower/shared';
import { format, differenceInCalendarDays } from 'date-fns';

export default function POBin() {
  const { user } = useAuthStore();
  const [pos, setPos] = useState<POMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [permanentTarget, setPermanentTarget] = useState<POMaster | null>(null);
  const [permanentReason, setPermanentReason] = useState('');
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRestoreOpen, setBulkRestoreOpen] = useState(false);
  const [bulkPermanentOpen, setBulkPermanentOpen] = useState(false);
  const [bulkPermanentReason, setBulkPermanentReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const isAdmin = user?.roles?.includes('ADMIN' as any) || user?.roles?.includes('SCM' as any);

  const fetchBin = async () => {
    setLoading(true);
    try {
      const data = await poService.getBin();
      setPos(data);
      setSelected(new Set());
    } catch (err) {
      console.error('Failed to fetch PO Bin', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBin();
  }, []);

  const handleRestore = async (poId: string) => {
    setError('');
    try {
      await poService.restorePO(poId);
      setRestoringId(null);
      fetchBin();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to restore PO');
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentTarget) return;
    setError('');
    try {
      await poService.permanentlyDeletePO(permanentTarget.id, permanentReason || undefined);
      setPermanentTarget(null);
      setPermanentReason('');
      fetchBin();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to permanently delete PO');
    }
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
    setSelected(allVisibleSelected ? new Set() : new Set(pos.map((po) => po.id)));
  };

  const handleBulkRestore = async () => {
    setBulkBusy(true);
    setError('');
    try {
      const result = await poService.bulkRestorePO([...selected]);
      setBulkRestoreOpen(false);
      if (result.failed.length > 0) {
        setError(`${result.restored.length} restored, ${result.failed.length} failed: ${result.failed.map((f) => f.reason).join('; ')}`);
      }
      fetchBin();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to restore selected POs');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkPermanentDelete = async () => {
    setBulkBusy(true);
    setError('');
    try {
      const result = await poService.bulkPermanentlyDeletePO([...selected], bulkPermanentReason || undefined);
      setBulkPermanentOpen(false);
      setBulkPermanentReason('');
      if (result.failed.length > 0) {
        setError(`${result.deleted.length} permanently deleted, ${result.failed.length} failed: ${result.failed.map((f) => f.reason).join('; ')}`);
      }
      fetchBin();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to permanently delete selected POs');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <MainLayout>
      {error && !restoringId && !permanentTarget && !bulkRestoreOpen && !bulkPermanentOpen && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            &times;
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">🗑️ PO Bin</h2>
          <p className="text-sm text-gray-500 mt-1">
            POs here are removed from active views but can be restored at any time until permanently deleted.
          </p>
        </div>
        <Link href="/pos" className="text-nootie-orange-dark hover:underline text-sm font-medium">
          ← Back to All POs
        </Link>
      </div>

      {selected.size > 0 && (
        <div className="bg-nootie-orange-light border border-nootie-gold rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
          <span className="text-sm font-medium text-nootie-orange-dark">{selected.size} PO{selected.size > 1 ? 's' : ''} selected</span>
          <div className="flex gap-3">
            <button onClick={() => setSelected(new Set())} className="text-sm text-gray-600 hover:text-gray-800 font-medium">
              Clear
            </button>
            <button
              onClick={() => setBulkRestoreOpen(true)}
              className="px-4 py-1.5 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm font-medium rounded-lg"
            >
              Restore Selected
            </button>
            {isAdmin && (
              <button
                onClick={() => setBulkPermanentOpen(true)}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg"
              >
                Permanently Delete Selected
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : pos.length === 0 ? (
          <div className="p-8 text-center text-gray-500">The Bin is empty.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 w-10">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="h-4 w-4 accent-nootie-orange-dark cursor-pointer" />
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">PO</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Location</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-700">PO Value</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Deleted By</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Deleted At</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-700">Days in Bin</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pos.map((po) => (
                <tr key={po.id} className={`hover:bg-gray-50 ${selected.has(po.id) ? 'bg-nootie-orange-light/40' : ''}`}>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selected.has(po.id)}
                      onChange={() => toggleSelect(po.id)}
                      className="h-4 w-4 accent-nootie-orange-dark cursor-pointer"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{po.poNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{po.location}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 text-right">₹{Number(po.poValue).toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{po.deletedByUserId || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {po.deletedAt ? format(new Date(po.deletedAt), 'dd MMM yyyy') : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 text-right">
                    {po.deletedAt ? differenceInCalendarDays(new Date(), new Date(po.deletedAt)) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setRestoringId(po.id);
                          setError('');
                        }}
                        className="text-nootie-orange-dark hover:text-nootie-orange text-sm font-medium"
                      >
                        Restore PO
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setPermanentTarget(po);
                            setPermanentReason('');
                            setError('');
                          }}
                          className="text-red-500 hover:text-red-700 text-sm font-medium"
                        >
                          Permanently Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {restoringId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <p className="font-medium text-gray-800 mb-2">Restore this PO?</p>
            <p className="text-sm text-gray-600 mb-4">It will reappear in all active PO views.</p>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">{error}</div>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRestoringId(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestore(restoringId)}
                className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium rounded-lg"
              >
                Restore PO
              </button>
            </div>
          </div>
        </div>
      )}

      {permanentTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <p className="font-medium text-gray-800 mb-2">
              ⚠️ Permanently delete {permanentTarget.poNumber}?
            </p>
            <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">{error}</div>}
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea
              value={permanentReason}
              onChange={(e) => setPermanentReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-6"
              placeholder="Why is this being permanently deleted?"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPermanentTarget(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkRestoreOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <p className="font-medium text-gray-800 mb-2">
              Restore {selected.size} PO{selected.size > 1 ? 's' : ''}?
            </p>
            <p className="text-sm text-gray-600 mb-6">They will reappear in all active PO views.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setBulkRestoreOpen(false)}
                disabled={bulkBusy}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkRestore}
                disabled={bulkBusy}
                className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium rounded-lg disabled:opacity-50"
              >
                {bulkBusy ? 'Restoring...' : `Restore ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkPermanentOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <p className="font-medium text-gray-800 mb-2">
              ⚠️ Permanently delete {selected.size} PO{selected.size > 1 ? 's' : ''}?
            </p>
            <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea
              value={bulkPermanentReason}
              onChange={(e) => setBulkPermanentReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-6"
              placeholder="Why are these being permanently deleted?"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setBulkPermanentOpen(false)}
                disabled={bulkBusy}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkPermanentDelete}
                disabled={bulkBusy}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {bulkBusy ? 'Deleting...' : `Permanently Delete ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
