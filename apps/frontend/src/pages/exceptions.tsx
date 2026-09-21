import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { ExceptionDetail } from '@/components/ExceptionDetail';
import { exceptionsService } from '@/services/exceptions.service';
import { ExceptionResolutionStatus } from '@po-control-tower/shared';
import { format } from 'date-fns';

const STATUS_TABS: ExceptionResolutionStatus[] = [
  ExceptionResolutionStatus.OPEN,
  ExceptionResolutionStatus.IN_PROGRESS,
  ExceptionResolutionStatus.RESOLVED,
  ExceptionResolutionStatus.IGNORED,
];

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-nootie-orange-light text-nootie-orange-dark',
  LOW: 'bg-gray-100 text-gray-600',
};

export default function Exceptions() {
  const [all, setAll] = useState<any[]>([]);
  const [tab, setTab] = useState<ExceptionResolutionStatus>(ExceptionResolutionStatus.OPEN);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setAll(await exceptionsService.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Only offer the types that actually occur, so no option ever returns nothing.
  const typeOptions = Array.from(new Set(all.map((e) => e.exceptionType as string))).sort();
  const query = search.trim().toLowerCase();
  const filtersActive = !!(typeFilter || severityFilter || query);
  const visible = all.filter(
    (e) =>
      (!typeFilter || e.exceptionType === typeFilter) &&
      (!severityFilter || e.severity === severityFilter) &&
      (!query || [e.poNumber, e.skuCode, e.warehouse].some((v) => v && String(v).toLowerCase().includes(query))),
  );
  const filtered = visible.filter((e) => e.resolutionStatus === tab);

  const clearFilters = () => {
    setTypeFilter('');
    setSeverityFilter('');
    setSearch('');
    setExpandedId(null);
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Exception Queue</h2>
            <p className="text-sm text-gray-500 mt-1">Click any row to see exactly what it's about and fix it - the source data, and an action that actually resolves it.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {STATUS_TABS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setTab(s);
                    setExpandedId(null);
                  }}
                  className={`px-3 py-1.5 rounded text-sm ${tab === s ? 'bg-nootie-orange-dark text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {s} ({visible.filter((e) => e.resolutionStatus === s).length})
                </button>
              ))}
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? 'Refreshing...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setExpandedId(null);
            }}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setExpandedId(null);
            }}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white"
            aria-label="Filter by severity"
          >
            <option value="">All severities</option>
            {SEVERITIES.map((sev) => (
              <option key={sev} value={sev}>
                {sev}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setExpandedId(null);
            }}
            placeholder="Search PO, SKU or warehouse"
            className="px-3 py-1.5 border border-gray-300 rounded text-sm w-64"
            aria-label="Search exceptions"
          />
          {filtersActive && (
            <>
              <button onClick={clearFilters} className="text-sm text-nootie-orange-dark hover:underline">
                Clear filters
              </button>
              <span className="text-xs text-gray-500">{visible.length} of {all.length} exceptions match</span>
            </>
          )}
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-gray-500">{filtersActive ? 'No exceptions in this tab match the filters.' : 'Nothing here.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">PO / SKU</th>
                <th className="px-4 py-3 text-left">Warehouse</th>
                <th className="px-4 py-3 text-right">Financial Impact</th>
                <th className="px-4 py-3 text-left">Recommended Action</th>
                <th className="px-4 py-3 text-left">Detected</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((e) => (
                <React.Fragment key={e.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                    className={`cursor-pointer hover:bg-nootie-orange-light/40 ${expandedId === e.id ? 'bg-nootie-orange-light/40' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium">
                      <span className="mr-1">{expandedId === e.id ? '▾' : '▸'}</span>
                      {e.exceptionType.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_STYLES[e.severity]}`}>{e.severity}</span>
                    </td>
                    <td className="px-4 py-3">
                      {e.poNumber || '-'}
                      {e.skuCode && <span className="text-gray-400"> / {e.skuCode}</span>}
                    </td>
                    <td className="px-4 py-3">{e.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-right">{e.financialImpact != null ? `₹${Number(e.financialImpact).toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">{e.recommendedAction}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{format(new Date(e.detectedAt), 'dd MMM HH:mm')}</td>
                  </tr>
                  {expandedId === e.id && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <ExceptionDetail exceptionId={e.id} onChanged={load} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MainLayout>
  );
}
