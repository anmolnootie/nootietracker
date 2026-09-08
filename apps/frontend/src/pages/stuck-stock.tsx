import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { stuckStockService, StuckStockRow, StuckStockSummary, StuckStockStatus, StuckStockReason, StuckStockByPO } from '@/services/stuck-stock.service';
import { poMappingService } from '@/services/po-mapping.service';

const PO_STATUS_STYLES: Record<StuckStockByPO['status'], string> = {
  OPEN: 'bg-red-50 text-red-600',
  PARTIALLY_MAPPED: 'bg-yellow-50 text-yellow-700',
  MAPPED: 'bg-blue-50 text-blue-700',
};

const REASON_LABELS: Record<StuckStockReason, string> = {
  EXPIRED_PO: 'Expired PO',
  APPOINTMENT_EXPIRED: 'Appointment Expired',
  PO_CANCELLED: 'PO Cancelled',
  APPOINTMENT_MISSED: 'Appointment Missed',
  DELIVERY_REJECTED: 'Delivery Rejected',
  RTO: 'RTO',
  WAREHOUSE_REJECTION: 'Warehouse Rejection',
  CHANNEL_ISSUE: 'Channel Issue',
  OTHER: 'Other',
};

const STATUS_STYLES: Record<StuckStockStatus, string> = {
  OPEN: 'bg-red-50 text-red-600',
  PARTIALLY_MAPPED: 'bg-yellow-50 text-yellow-700',
  MAPPED: 'bg-blue-50 text-blue-700',
  RESOLVED: 'bg-green-50 text-green-700',
  WRITTEN_OFF: 'bg-gray-100 text-gray-500',
};

export default function StuckStockPage() {
  const [rows, setRows] = useState<StuckStockRow[]>([]);
  const [summary, setSummary] = useState<StuckStockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StuckStockStatus | ''>('OPEN');
  const [view, setView] = useState<'sku' | 'po'>('po');
  const [poGroups, setPoGroups] = useState<StuckStockByPO[]>([]);
  const [poGroupsLoading, setPoGroupsLoading] = useState(true);
  const [autoMappingId, setAutoMappingId] = useState<string | null>(null);
  const [autoMapMessage, setAutoMapMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, summaryData] = await Promise.all([
        stuckStockService.list(statusFilter ? { status: statusFilter } : undefined),
        stuckStockService.getSummary(),
      ]);
      setRows(list);
      setSummary(summaryData);
    } finally {
      setLoading(false);
    }
  };

  const loadPoGroups = async () => {
    setPoGroupsLoading(true);
    try {
      setPoGroups(await stuckStockService.listByPO());
    } finally {
      setPoGroupsLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadPoGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const runDetection = async () => {
    setDetecting(true);
    try {
      await stuckStockService.detect();
      await Promise.all([load(), loadPoGroups()]);
    } finally {
      setDetecting(false);
    }
  };

  const writeOff = async (id: string) => {
    await stuckStockService.update(id, { status: 'WRITTEN_OFF' });
    setRows((rs) => rs.filter((r) => r.id !== id || statusFilter === ''));
    load();
    loadPoGroups();
  };

  const resolve = async (id: string) => {
    await stuckStockService.update(id, { status: 'RESOLVED' });
    load();
    loadPoGroups();
  };

  const autoMapWhole = async (group: StuckStockByPO) => {
    setAutoMappingId(group.poId);
    setAutoMapMessage(null);
    try {
      const result = await poMappingService.autoMapWholePO({ originalPoId: group.poId });
      setAutoMapMessage({
        type: 'success',
        text: `Mapped ₹${result.totalValueMapped.toLocaleString()} (${(result.coveragePercent * 100).toFixed(1)}%) across ${result.mappings.length} SKU line(s) to PO ${result.mappings[0]?.newPoNumber}.`,
      });
      await Promise.all([load(), loadPoGroups()]);
    } catch (err: any) {
      setAutoMapMessage({ type: 'error', text: err.response?.data?.message || 'Auto-map failed' });
    } finally {
      setAutoMappingId(null);
    }
  };

  const agingOrder: (keyof StuckStockSummary['byAgingBucket'])[] = ['0-7', '8-15', '16-30', '31-60', '60+'];

  return (
    <MainLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Stuck Stock</h2>
          <p className="text-sm text-gray-500 mt-1">
            Stock sitting undispatched because of an expired/cancelled PO, a missed appointment, RTO, or a rejection - detected automatically from live PO data.
          </p>
        </div>
        <button
          onClick={runDetection}
          disabled={detecting}
          className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm rounded-lg disabled:opacity-50 whitespace-nowrap"
        >
          {detecting ? 'Scanning...' : '🔄 Run Detection'}
        </button>
      </div>

      {autoMapMessage && (
        <div
          className={`mb-6 border px-4 py-3 rounded-lg text-sm font-medium ${
            autoMapMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {autoMapMessage.type === 'success' ? '✅ ' : '⚠️ '}
          {autoMapMessage.text}
        </div>
      )}

      {summary && summary.valueStuckOver30Days > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg font-medium">
          🔴 ₹{summary.valueStuckOver30Days.toLocaleString()} stuck &gt;30 days
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <StatTile label="Total Stuck Value" value={`₹${summary.totalValue.toLocaleString()}`} color="orange" />
            <StatTile label="Total Stuck Units" value={summary.totalQuantity.toLocaleString()} color="blue" />
            <StatTile label="Records" value={summary.totalRecords.toLocaleString()} color="blue" />
          </div>

          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Aging Breakdown</h4>
            <div className="grid grid-cols-5 gap-3">
              {agingOrder.map((bucket) => (
                <div key={bucket} className="text-center p-3 rounded border border-gray-200">
                  <p className="text-xs text-gray-500">{bucket} days</p>
                  <p className="text-lg font-bold text-gray-800">{summary.byAgingBucket[bucket].count}</p>
                  <p className="text-xs text-nootie-orange-dark">₹{summary.byAgingBucket[bucket].value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['po', 'sku'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              view === v ? 'bg-white text-nootie-orange-dark border border-b-0 border-gray-200 -mb-px' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v === 'po' ? '📦 By PO' : '🏷 By SKU'}
          </button>
        ))}
      </div>

      {view === 'po' && (
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-800">Stuck POs ({poGroups.length})</h3>
            <p className="text-xs text-gray-500 mt-1">Every currently-stuck PO, rolled up across its SKU lines - map the whole PO to a new one in a single action.</p>
          </div>

          {poGroupsLoading ? (
            <p className="p-6 text-gray-500">Loading...</p>
          ) : poGroups.length === 0 ? (
            <p className="p-6 text-gray-500">No stuck POs. Run detection to scan for new ones.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">PO</th>
                    <th className="px-4 py-3 text-left">Channel</th>
                    <th className="px-4 py-3 text-right">PO Value</th>
                    <th className="px-4 py-3 text-right">Stock Value</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Recovered</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3 text-center">Age</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {poGroups.map((g) => {
                    const recoveredQty = g.lines.reduce((sum, l) => sum + Number(l.recoveredQuantity), 0);
                    return (
                    <tr key={g.poId}>
                      <td className="px-4 py-3 font-mono text-xs">{g.poNumber}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{g.channelId}</td>
                      <td className="px-4 py-3 text-right">₹{g.poValue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium text-nootie-orange-dark">₹{g.stuckValue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{g.stuckQuantity.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {recoveredQty > 0 ? `${recoveredQty.toLocaleString()} / ${g.stuckQuantity.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {g.reasons.map((r) => REASON_LABELS[r]).join(', ')}
                        <span className="block text-gray-400">{g.lines.length} SKU{g.lines.length !== 1 ? 's' : ''}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">{g.maxDaysStuck}d</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${PO_STATUS_STYLES[g.status]}`}>{g.status.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {g.status !== 'MAPPED' && (
                          <>
                            <button
                              onClick={() => autoMapWhole(g)}
                              disabled={autoMappingId === g.poId}
                              className="text-xs text-white bg-nootie-orange-dark hover:bg-nootie-orange px-2 py-1 rounded mr-2 disabled:opacity-50"
                            >
                              {autoMappingId === g.poId ? 'Mapping...' : '🤖 Auto Map'}
                            </button>
                            <Link href={`/po-mapping/new?originalPoId=${g.poId}`} className="text-xs text-nootie-orange-dark hover:underline">
                              Manual
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'sku' && (
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-800">Stuck Stock Records ({rows.length})</h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StuckStockStatus | '')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="PARTIALLY_MAPPED">Partially Mapped</option>
            <option value="MAPPED">Mapped</option>
            <option value="RESOLVED">Resolved</option>
            <option value="WRITTEN_OFF">Written Off</option>
          </select>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-gray-500">No stuck stock records. Run detection to scan for new ones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">PO</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Recovered</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-left">Warehouse</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-center">Days Stuck</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-mono text-xs">{r.poNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{r.skuName}</p>
                      <p className="text-xs text-gray-400 font-mono">{r.skuCode}</p>
                    </td>
                    <td className="px-4 py-3 text-right">{Number(r.quantity).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-600">
                      {Number(r.recoveredQuantity) > 0 ? Number(r.recoveredQuantity).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">₹{Number(r.value).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-xs">{REASON_LABELS[r.reason]}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-500">{r.daysStuck}d</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[r.status]}`}>{r.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {(r.status === 'OPEN' || r.status === 'PARTIALLY_MAPPED') && (
                        <Link href={`/po-mapping/new?originalPoId=${r.poId}`} className="text-xs text-nootie-orange-dark hover:underline mr-3">
                          Map PO
                        </Link>
                      )}
                      {r.status !== 'RESOLVED' && r.status !== 'WRITTEN_OFF' && (
                        <>
                          <button onClick={() => resolve(r.id)} className="text-xs text-green-600 hover:underline mr-3">
                            Resolve
                          </button>
                          <button onClick={() => writeOff(r.id)} className="text-xs text-red-600 hover:underline">
                            Write Off
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

    </MainLayout>
  );
}

const StatTile: React.FC<{ label: string; value: string; color: 'blue' | 'green' | 'orange' }> = ({ label, value, color }) => {
  const colorClasses = {
    blue: 'bg-nootie-orange-light border-nootie-gold text-nootie-orange-dark',
    green: 'bg-green-50 border-green-200 text-green-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
  };
  return (
    <div className={`border-l-4 p-6 rounded bg-white shadow ${colorClasses[color].split(' ').slice(0, 2).join(' ')}`}>
      <p className="text-gray-600 text-sm">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${colorClasses[color].split(' ')[2]}`}>{value}</p>
    </div>
  );
};
