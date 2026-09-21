import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { RiskBadge, StatusBadge } from '@/components/Badges';
import { poService, POView, POListFilters } from '@/services/po.service';
import { POMaster, NON_FULFILMENT_REASON_LABELS, NonFulfilmentReason } from '@po-control-tower/shared';
import { format, subDays, startOfMonth } from 'date-fns';

const TABS: { key: POView | 'all'; label: string }[] = [
  { key: 'all', label: 'All POs' },
  { key: 'active', label: 'Active' },
  { key: 'at_risk', label: 'At Risk' },
  { key: 'expiring_soon', label: 'Expiring Soon' },
  { key: 'low_value', label: 'Low PO Value' },
  { key: 'not_fulfilled', label: 'Not Fulfilled' },
];

type FilterState = {
  search: string;
  dateField: string;
  dateFrom: string;
  dateTo: string;
  location: string;
  channelId: string;
  risk: string;
  status: string;
  fulfilmentDecision: string;
  fulfilmentStatus: string;
  invoiced: string;
  sourceType: string;
  valueMin: string;
  valueMax: string;
  reattempt: string;
};

const EMPTY_FILTERS: FilterState = {
  search: '', dateField: 'poDate', dateFrom: '', dateTo: '', location: '', channelId: '', risk: '', status: '',
  fulfilmentDecision: '', fulfilmentStatus: '', invoiced: '', sourceType: '', valueMin: '', valueMax: '', reattempt: '',
};

const DATE_FIELDS = [
  { key: 'poDate', label: 'PO date' },
  { key: 'expiry', label: 'Expiry date' },
  { key: 'dispatch', label: 'Dispatch date' },
  { key: 'appointment', label: 'Appointment date' },
  { key: 'invoice', label: 'Invoice date' },
];

const STATUS_OPTIONS = [
  ['RECEIVED', 'Received'], ['APPOINTMENT_REQUESTED', 'Appointment Requested'], ['APPOINTMENT_CONFIRMED', 'Appointment Confirmed'],
  ['READY_FOR_DISPATCH', 'Ready for Dispatch'], ['DISPATCHED', 'Dispatched'], ['IN_TRANSIT', 'In Transit'], ['DELIVERED', 'Delivered'],
  ['GRN_PENDING', 'GRN Pending'], ['RECONCILED', 'Reconciled'], ['CLOSED', 'Closed'], ['RETURNED', 'Returned'], ['CANCELLED', 'Cancelled'],
].map(([value, label]) => ({ value, label }));

const LABEL = 'block text-xs font-medium text-gray-600 mb-1';
const INPUT = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg';
const CHIP = 'px-2.5 py-2 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50';

export default function POList() {
  const [pos, setPos] = useState<POMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<POView | 'all'>('all');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [options, setOptions] = useState<{ channels: string[]; locations: string[]; customers: string[] }>({ channels: [], locations: [], customers: [] });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState('');

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const params: POListFilters = { view: activeTab === 'all' ? undefined : activeTab };
      (Object.keys(filters) as (keyof FilterState)[]).forEach((k) => {
        const v = filters[k];
        if (v !== '') (params as any)[k] = k === 'valueMin' || k === 'valueMax' ? Number(v) : v;
      });
      // A date range is meaningless without knowing which date it applies to.
      if (!params.dateFrom && !params.dateTo) delete params.dateField;
      setPos(await poService.getAllPOs(params));
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

  useEffect(() => {
    poService.getFilterOptions().then(setOptions).catch(() => {});
  }, []);

  // Typing shouldn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const set = (patch: Partial<FilterState>) => setFilters((f) => ({ ...f, ...patch }));
  const clearAll = () => {
    setSearchInput('');
    setFilters(EMPTY_FILTERS);
  };
  const setPreset = (from: Date, to: Date) => set({ dateFrom: format(from, 'yyyy-MM-dd'), dateTo: format(to, 'yyyy-MM-dd') });

  // "dateField" alone isn't a filter - it only qualifies the range.
  const activeCount = useMemo(
    () => (Object.keys(filters) as (keyof FilterState)[]).filter((k) => k !== 'dateField' && filters[k] !== '').length,
    [filters],
  );

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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-800">Filters</h3>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-nootie-orange-light text-nootie-orange-dark">{activeCount} active</span>
            )}
            {activeCount > 0 && (
              <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-800 underline">
                Clear all
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <Link href="/pos/import" className="text-sm px-4 py-1.5 bg-nootie-orange-light text-nootie-orange-dark border border-nootie-gold font-medium rounded-lg hover:bg-orange-100">
              ⇪ Import PO
            </Link>
            <Link href="/pos/new" className="text-sm px-4 py-1.5 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium rounded-lg">
              + Create PO
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4">
            <label className={LABEL}>Search</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="PO number, location, platform, invoice or AWB"
              className={INPUT}
            />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className={LABEL}>Date type</label>
            <select value={filters.dateField} onChange={(e) => set({ dateField: e.target.value })} className={INPUT}>
              {DATE_FIELDS.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className={LABEL}>From</label>
            <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => set({ dateFrom: e.target.value })} className={INPUT} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className={LABEL}>To</label>
            <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => set({ dateTo: e.target.value })} className={INPUT} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className={LABEL}>Quick range</label>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setPreset(new Date(), new Date())} className={CHIP}>Today</button>
              <button onClick={() => setPreset(subDays(new Date(), 6), new Date())} className={CHIP}>7d</button>
              <button onClick={() => setPreset(subDays(new Date(), 29), new Date())} className={CHIP}>30d</button>
              <button onClick={() => setPreset(startOfMonth(new Date()), new Date())} className={CHIP}>Month</button>
            </div>
          </div>

          <div className="col-span-6 md:col-span-3">
            <label className={LABEL}>Location</label>
            <select value={filters.location} onChange={(e) => set({ location: e.target.value })} className={INPUT}>
              <option value="">All locations ({options.locations.length})</option>
              {options.locations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="col-span-6 md:col-span-3">
            <label className={LABEL}>Platform</label>
            <select value={filters.channelId} onChange={(e) => set({ channelId: e.target.value })} className={INPUT}>
              <option value="">All platforms</option>
              {options.channels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="col-span-6 md:col-span-3">
            <label className={LABEL}>Risk</label>
            <select value={filters.risk} onChange={(e) => set({ risk: e.target.value })} className={INPUT}>
              <option value="">All</option>
              {['BLACK', 'RED', 'ORANGE', 'YELLOW', 'GREEN'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="col-span-6 md:col-span-3">
            <label className={LABEL}>PO status</label>
            <select value={filters.status} onChange={(e) => set({ status: e.target.value })} className={INPUT}>
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <button onClick={() => setShowMore((v) => !v)} className="mt-4 text-sm text-nootie-orange-dark hover:underline">
          {showMore ? '▾ Fewer filters' : '▸ More filters'}
        </button>

        {showMore && (
          <div className="grid grid-cols-12 gap-4 mt-4 pt-4 border-t">
            <div className="col-span-6 md:col-span-3">
              <label className={LABEL}>Fulfilment decision</label>
              <select value={filters.fulfilmentDecision} onChange={(e) => set({ fulfilmentDecision: e.target.value })} className={INPUT}>
                <option value="">All</option>
                <option value="FULFILLED">Fulfilled</option>
                <option value="NOT_FULFILLED">Not fulfilled</option>
              </select>
            </div>
            <div className="col-span-6 md:col-span-3">
              <label className={LABEL}>Fulfilment health</label>
              <select value={filters.fulfilmentStatus} onChange={(e) => set({ fulfilmentStatus: e.target.value })} className={INPUT}>
                <option value="">All</option>
                {['GREEN', 'YELLOW', 'ORANGE', 'RED'].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="col-span-6 md:col-span-3">
              <label className={LABEL}>Invoice</label>
              <select value={filters.invoiced} onChange={(e) => set({ invoiced: e.target.value })} className={INPUT}>
                <option value="">Any</option>
                <option value="yes">Invoiced</option>
                <option value="no">Not invoiced yet</option>
              </select>
            </div>
            <div className="col-span-6 md:col-span-3">
              <label className={LABEL}>Source</label>
              <select value={filters.sourceType} onChange={(e) => set({ sourceType: e.target.value })} className={INPUT}>
                <option value="">Any</option>
                <option value="MANUAL">Created manually</option>
                <option value="BULK_IMPORT">Bulk import</option>
              </select>
            </div>
            <div className="col-span-6 md:col-span-3">
              <label className={LABEL}>PO value from (₹)</label>
              <input type="number" min={0} value={filters.valueMin} onChange={(e) => set({ valueMin: e.target.value })} placeholder="0" className={INPUT} />
            </div>
            <div className="col-span-6 md:col-span-3">
              <label className={LABEL}>PO value to (₹)</label>
              <input type="number" min={0} value={filters.valueMax} onChange={(e) => set({ valueMax: e.target.value })} placeholder="No limit" className={INPUT} />
            </div>
            <div className="col-span-6 md:col-span-3">
              <label className={LABEL}>Reattempt POs</label>
              <select value={filters.reattempt} onChange={(e) => set({ reattempt: e.target.value })} className={INPUT}>
                <option value="">Include</option>
                <option value="yes">Only reattempts</option>
                <option value="no">Exclude reattempts</option>
              </select>
            </div>
          </div>
        )}
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
          <div className="p-8 text-center text-gray-500">
            No POs match{activeCount > 0 ? ' these filters' : ''}.
            {activeCount > 0 && (
              <button onClick={clearAll} className="ml-2 text-nootie-orange-dark hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="px-4 py-2 text-xs text-gray-500 border-b bg-gray-50">
              {pos.length} PO{pos.length === 1 ? '' : 's'}
              {activeCount > 0 ? ' matching your filters' : ''}
            </div>
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
