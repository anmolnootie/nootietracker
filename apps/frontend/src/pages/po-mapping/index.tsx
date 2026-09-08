import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { poMappingService, POMappingRow, POMappingStatus } from '@/services/po-mapping.service';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
  Mixed: 'bg-yellow-50 text-yellow-700',
};

const EXECUTION_LABELS: Record<string, string> = {
  APPOINTMENT_PENDING: 'Appointment Pending',
  APPOINTMENT_BOOKED: 'Appointment Booked',
  DISPATCHED: 'Dispatched',
  RECEIVED: 'Received',
  Mixed: 'Mixed',
};

const EXECUTION_STYLES: Record<string, string> = {
  APPOINTMENT_PENDING: 'bg-gray-100 text-gray-600',
  APPOINTMENT_BOOKED: 'bg-blue-50 text-blue-700',
  DISPATCHED: 'bg-yellow-50 text-yellow-700',
  RECEIVED: 'bg-green-50 text-green-700',
  Mixed: 'bg-yellow-50 text-yellow-700',
};

interface MappingBatch {
  key: string;
  originalPoId: string;
  originalPoNumber: string;
  newPoId: string;
  newPoNumber: string;
  mappingDate: string;
  reason: string | null;
  status: string;
  executionStatus: string;
  totalQuantityMapped: number;
  totalValueMapped: number;
  lines: POMappingRow[];
}

function groupByBatch(rows: POMappingRow[]): MappingBatch[] {
  const byKey = new Map<string, POMappingRow[]>();
  for (const r of rows) {
    const key = `${r.originalPoId}|${r.newPoId}|${r.mappingDate}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }

  return [...byKey.entries()]
    .map(([key, lines]) => {
      const statuses = new Set(lines.map((l) => l.status));
      const status = statuses.size === 1 ? [...statuses][0] : 'Mixed';
      const executionStatuses = new Set(lines.map((l) => l.executionStatus));
      const executionStatus = executionStatuses.size === 1 ? [...executionStatuses][0] : 'Mixed';
      return {
        key,
        originalPoId: lines[0].originalPoId,
        originalPoNumber: lines[0].originalPoNumber,
        newPoId: lines[0].newPoId,
        newPoNumber: lines[0].newPoNumber,
        mappingDate: lines[0].mappingDate,
        reason: lines[0].reason,
        status,
        executionStatus,
        totalQuantityMapped: lines.reduce((sum, l) => sum + Number(l.quantityMapped), 0),
        totalValueMapped: lines.reduce((sum, l) => sum + Number(l.valueMapped), 0),
        lines,
      };
    })
    .sort((a, b) => new Date(b.mappingDate).getTime() - new Date(a.mappingDate).getTime());
}

export default function POMappingPage() {
  const [rows, setRows] = useState<POMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<POMappingStatus | ''>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = () => {
    setLoading(true);
    poMappingService
      .list(statusFilter ? { status: statusFilter } : undefined)
      .then(setRows)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const batches = useMemo(() => groupByBatch(rows), [rows]);

  const totals = rows
    .filter((r) => r.status === 'ACTIVE')
    .reduce(
      (acc, r) => ({
        quantity: acc.quantity + Number(r.quantityMapped),
        value: acc.value + Number(r.valueMapped),
      }),
      { quantity: 0, value: 0 },
    );

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const changeBatchStatus = async (batch: MappingBatch, status: POMappingStatus) => {
    await poMappingService.updateBatch(batch.originalPoId, batch.newPoId, batch.mappingDate, { status });
    load();
  };

  return (
    <MainLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">PO Mapping</h2>
          <p className="text-sm text-gray-500 mt-1">Every old PO mapped onto a new, live PO - each mapping moves the whole PO's SKU lines together.</p>
        </div>
        <Link
          href="/po-mapping/new"
          className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm rounded-lg whitespace-nowrap"
        >
          + New Mapping
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="border-l-4 border-nootie-gold bg-nootie-orange-light p-6 rounded bg-white shadow">
          <p className="text-gray-600 text-sm">Active Mapped Quantity</p>
          <p className="text-3xl font-bold mt-2 text-nootie-orange-dark">{totals.quantity.toLocaleString()}</p>
        </div>
        <div className="border-l-4 border-nootie-gold bg-nootie-orange-light p-6 rounded bg-white shadow">
          <p className="text-gray-600 text-sm">Active Mapped Value</p>
          <p className="text-3xl font-bold mt-2 text-nootie-orange-dark">₹{totals.value.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-800">PO Mappings ({batches.length})</h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as POMappingStatus | '')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : batches.length === 0 ? (
          <p className="p-6 text-gray-500">
            No mappings yet. <Link href="/po-mapping/new" className="text-nootie-orange-dark hover:underline">Create one</Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left"></th>
                  <th className="px-4 py-3 text-left">Original PO</th>
                  <th className="px-4 py-3 text-left">New PO</th>
                  <th className="px-4 py-3 text-center">SKUs</th>
                  <th className="px-4 py-3 text-right">Qty Mapped</th>
                  <th className="px-4 py-3 text-right">Value Mapped</th>
                  <th className="px-4 py-3 text-left">Mapping Date</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Execution</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {batches.map((b) => (
                  <React.Fragment key={b.key}>
                    <tr>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleExpanded(b.key)} className="text-gray-400 hover:text-gray-600 text-xs">
                          {expanded.has(b.key) ? '▼' : '▶'}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{b.originalPoNumber}</td>
                      <td className="px-4 py-3 font-mono text-xs">{b.newPoNumber}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{b.lines.length}</td>
                      <td className="px-4 py-3 text-right">{b.totalQuantityMapped.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">₹{b.totalValueMapped.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(b.mappingDate).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate" title={b.reason ?? ''}>
                        {b.reason || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[b.status]}`}>{b.status}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${EXECUTION_STYLES[b.executionStatus]}`}>
                          {EXECUTION_LABELS[b.executionStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {b.status === 'ACTIVE' && (
                          <>
                            <button onClick={() => changeBatchStatus(b, 'REJECTED')} className="text-xs text-red-600 hover:underline mr-3">
                              Reject
                            </button>
                            <button onClick={() => changeBatchStatus(b, 'CANCELLED')} className="text-xs text-gray-500 hover:underline">
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {expanded.has(b.key) && (
                      <tr>
                        <td colSpan={11} className="bg-gray-50 px-8 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left py-1">SKU</th>
                                <th className="text-right py-1">Qty Mapped</th>
                                <th className="text-right py-1">Value Mapped</th>
                                <th className="text-right py-1">Qty Remaining</th>
                                <th className="text-center py-1">Status</th>
                                <th className="text-center py-1">Execution</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {b.lines.map((l) => (
                                <tr key={l.id}>
                                  <td className="py-1.5">
                                    {l.skuName} <span className="font-mono text-gray-400">({l.skuCode})</span>
                                  </td>
                                  <td className="py-1.5 text-right">{Number(l.quantityMapped).toLocaleString()}</td>
                                  <td className="py-1.5 text-right">₹{Number(l.valueMapped).toLocaleString()}</td>
                                  <td className="py-1.5 text-right">{Number(l.quantityRemaining).toLocaleString()}</td>
                                  <td className="py-1.5 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[l.status]}`}>{l.status}</span>
                                  </td>
                                  <td className="py-1.5 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${EXECUTION_STYLES[l.executionStatus]}`}>
                                      {EXECUTION_LABELS[l.executionStatus]}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
