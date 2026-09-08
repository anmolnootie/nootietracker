import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { RiskBadge, StatusBadge } from '@/components/Badges';
import { compilationsService, CompilationFilters } from '@/services/compilations.service';
import { format } from 'date-fns';

export default function NewCompilation() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [filters, setFilters] = useState<CompilationFilters>({});
  const [results, setResults] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setFilter = (key: keyof CompilationFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  };

  const runPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await compilationsService.preview(filters);
      setResults(rows);
      setSelected(new Set(rows.map((r) => r.id)));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to preview');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const create = async () => {
    if (selected.size === 0) {
      setError('Select at least one PO.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const comp = await compilationsService.create({ name: name || undefined, filters, poIds: [...selected] });
      router.push(`/compilations/${comp.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create compilation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Create Compilation</h2>
        <p className="text-sm text-gray-500 mb-6">Filter the PO Master, pick the POs you want, and save the selection - only references are stored, never copies.</p>

        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Name (optional)</label>
          <input className="w-full max-w-md border rounded px-3 py-2 text-sm" placeholder="e.g. Delhi Blinkit - Sept 1-2" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Platform</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => setFilter('platform', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Location</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => setFilter('location', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Vendor / Customer</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => setFilter('vendor', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PO Status</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" placeholder="e.g. RECEIVED" onChange={(e) => setFilter('status', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PO Date From</label>
            <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => setFilter('poDateFrom', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PO Date To</label>
            <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => setFilter('poDateTo', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Expiry From</label>
            <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => setFilter('expiryDateFrom', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Expiry To</label>
            <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => setFilter('expiryDateTo', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">SKU Code</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => setFilter('skuCode', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dispatch Status</label>
            <select className="w-full border rounded px-2 py-1.5 text-sm" onChange={(e) => setFilter('dispatchStatus', e.target.value)}>
              <option value="">Any</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="NOT_DISPATCHED">Not Dispatched</option>
            </select>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

        <button disabled={loading} onClick={runPreview} className="bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-6 rounded-lg disabled:opacity-50">
          {loading ? 'Searching...' : 'Preview Matching POs'}
        </button>
      </div>

      {results && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">{results.length} PO(s) matched - {selected.size} selected</h3>
            <button disabled={saving} onClick={create} className="bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-6 rounded-lg text-sm disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Compilation'}
            </button>
          </div>
          {results.length === 0 ? (
            <p className="p-6 text-gray-500">No POs matched these filters.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">
                    <input type="checkbox" checked={selected.size === results.length} onChange={(e) => setSelected(e.target.checked ? new Set(results.map((r) => r.id)) : new Set())} />
                  </th>
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
                {results.map((po) => (
                  <tr key={po.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2"><input type="checkbox" checked={selected.has(po.id)} onChange={() => toggle(po.id)} /></td>
                    <td className="px-4 py-2 font-medium">{po.poNumber}</td>
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
          )}
        </div>
      )}
    </MainLayout>
  );
}
