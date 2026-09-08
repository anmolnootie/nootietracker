import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { stuckStockService, StuckStockByPO } from '@/services/stuck-stock.service';
import { poMappingService } from '@/services/po-mapping.service';
import { poService } from '@/services/po.service';

const MIN_COVERAGE_PERCENT = 70;

interface LineDraft {
  skuCode: string;
  skuName: string;
  available: number;
  rate: number;
  newPoNeed: number | null;
  include: boolean;
  quantityMapped: string;
}

export default function NewPOMapping() {
  const router = useRouter();
  const originalPoId = typeof router.query.originalPoId === 'string' ? router.query.originalPoId : undefined;

  const [groups, setGroups] = useState<StuckStockByPO[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<StuckStockByPO | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(true);

  const [pos, setPos] = useState<any[]>([]);
  const [poSearch, setPoSearch] = useState('');
  const [newPoId, setNewPoId] = useState('');
  const [newPo, setNewPo] = useState<any | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    poService.getAllPOs().then(setPos);
  }, []);

  useEffect(() => {
    setLoadingGroups(true);
    stuckStockService
      .listByPO()
      .then((all) => {
        setGroups(all.filter((g) => g.status !== 'MAPPED'));
        if (originalPoId) {
          const match = all.find((g) => g.poId === originalPoId);
          if (match) setSelectedGroup(match);
        }
      })
      .finally(() => setLoadingGroups(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalPoId]);

  // Build base line drafts (available qty, rate) once a PO is selected - independent of which new PO is chosen.
  useEffect(() => {
    if (!selectedGroup) {
      setLines([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const drafts: LineDraft[] = [];
      for (const l of selectedGroup.lines) {
        const mappings = await poMappingService.listForStuckStock(selectedGroup.poId, l.skuCode);
        const activeMapped = mappings.filter((m) => m.status === 'ACTIVE').reduce((sum, m) => sum + Number(m.quantityMapped), 0);
        const available = Number(l.quantity) - activeMapped;
        drafts.push({
          skuCode: l.skuCode,
          skuName: l.skuName,
          available,
          rate: Number(l.quantity) > 0 ? Number(l.value) / Number(l.quantity) : 0,
          newPoNeed: null,
          include: false,
          quantityMapped: '',
        });
      }
      if (!cancelled) setLines(drafts);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedGroup]);

  // Once a new PO is picked, match its line items against the stuck lines and propose defaults.
  useEffect(() => {
    if (!newPoId || lines.length === 0) {
      setNewPo(pos.find((p) => p.id === newPoId) ?? null);
      return;
    }
    setLoadingLines(true);
    const po = pos.find((p) => p.id === newPoId) ?? null;
    setNewPo(po);
    poService
      .getLineItems(newPoId)
      .then((newLineItems: any[]) => {
        setLines((prev) =>
          prev.map((l) => {
            const match = newLineItems.find((nl) => nl.skuCode === l.skuCode);
            if (!match) return { ...l, newPoNeed: null, include: false, quantityMapped: '' };
            const need = Number(match.quantity) - Number(match.dispatchedQuantity ?? 0);
            const proposed = Math.max(0, Math.min(l.available, need));
            return { ...l, newPoNeed: need, include: need > 0 && proposed > 0, quantityMapped: proposed > 0 ? String(proposed) : '' };
          }),
        );
      })
      .finally(() => setLoadingLines(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPoId]);

  const filteredPos = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    const candidates = pos.filter((p) => p.id !== selectedGroup?.poId);
    if (!q) return candidates.slice(0, 20);
    return candidates.filter((p) => p.poNumber.toLowerCase().includes(q)).slice(0, 20);
  }, [pos, poSearch, selectedGroup]);

  const totals = useMemo(() => {
    const included = lines.filter((l) => l.include && Number(l.quantityMapped) > 0);
    const totalValueMapped = included.reduce((sum, l) => sum + Number(l.quantityMapped) * l.rate, 0);
    const newPoValue = newPo ? Number(newPo.poValue) : 0;
    const coveragePercent = newPoValue > 0 ? (totalValueMapped / newPoValue) * 100 : 0;
    return { totalValueMapped, newPoValue, coveragePercent, included };
  }, [lines, newPo]);

  const updateLine = (skuCode: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.skuCode === skuCode ? { ...l, ...patch } : l)));
  };

  const submit = async () => {
    setError('');
    if (!selectedGroup) {
      setError('Select the stuck PO to map.');
      return;
    }
    if (!newPoId) {
      setError('Select a new PO to map to.');
      return;
    }
    if (totals.included.length === 0) {
      setError('Include at least one SKU line with a quantity to map.');
      return;
    }
    if (totals.coveragePercent < MIN_COVERAGE_PERCENT) {
      setError(
        `This mapping only covers ${totals.coveragePercent.toFixed(1)}% of the new PO's value - at least ${MIN_COVERAGE_PERCENT}% is required.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const result = await poMappingService.mapWholePO({
        originalPoId: selectedGroup.poId,
        newPoId,
        lines: totals.included.map((l) => ({ skuCode: l.skuCode, quantityMapped: Number(l.quantityMapped) })),
        reason: reason || undefined,
        remarks: remarks || undefined,
        newAppointmentDate: appointmentDate ? new Date(appointmentDate).toISOString() : undefined,
      });
      setSuccess(`Mapped ₹${result.totalValueMapped.toLocaleString()} (${(result.coveragePercent * 100).toFixed(1)}%) of the new PO's value across ${result.mappings.length} SKU line(s).`);
      setTimeout(() => router.push('/po-mapping'), 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not create PO mapping');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">New PO Mapping</h2>
        <p className="text-sm text-gray-500 mt-1">
          Map an old, stuck PO onto a new, live PO - every SKU line moves together, and the combined value mapped must cover at least{' '}
          {MIN_COVERAGE_PERCENT}% of the new PO's total value.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-3xl">
        {loadingGroups ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <>
            {!selectedGroup ? (
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Stuck PO to Map</label>
                {groups.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No stuck POs. Run detection on the{' '}
                    <a href="/stuck-stock" className="text-nootie-orange-dark hover:underline">
                      Stuck Stock
                    </a>{' '}
                    page first.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y max-h-72 overflow-y-auto">
                    {groups.map((g) => (
                      <button
                        key={g.poId}
                        onClick={() => setSelectedGroup(g)}
                        className="w-full text-left px-4 py-3 hover:bg-nootie-orange-light text-sm flex items-center justify-between"
                      >
                        <span>
                          <span className="font-medium text-gray-800">PO {g.poNumber}</span>{' '}
                          <span className="text-xs text-gray-400">({g.channelId})</span>
                          <span className="block text-xs text-gray-500">{g.lines.length} SKU line(s)</span>
                        </span>
                        <span className="text-right text-xs text-gray-500">
                          ₹{g.stuckValue.toLocaleString()} stuck
                          <span className="block">{g.stuckQuantity.toLocaleString()} units</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-5 p-4 bg-nootie-cream rounded-lg flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-800">PO {selectedGroup.poNumber}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedGroup.lines.length} SKU line(s) - ₹{selectedGroup.stuckValue.toLocaleString()} stuck ({selectedGroup.stuckQuantity.toLocaleString()} units)
                  </p>
                </div>
                {!originalPoId && (
                  <button onClick={() => setSelectedGroup(null)} className="text-xs text-gray-500 hover:underline">
                    Change
                  </button>
                )}
              </div>
            )}

            {selectedGroup && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">New PO</label>
                  <input
                    placeholder="Search PO number..."
                    value={poSearch}
                    onChange={(e) => setPoSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-1"
                  />
                  <select value={newPoId} onChange={(e) => setNewPoId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">Select a PO...</option>
                    {filteredPos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.poNumber} - {p.channelId} ({p.status}) - ₹{Number(p.poValue).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                {newPoId && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {loadingLines ? (
                      <p className="p-4 text-sm text-gray-500">Matching SKUs...</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left w-8"></th>
                            <th className="px-3 py-2 text-left">SKU</th>
                            <th className="px-3 py-2 text-right">Available</th>
                            <th className="px-3 py-2 text-right">New PO Need</th>
                            <th className="px-3 py-2 text-right">Qty to Map</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {lines.map((l) => (
                            <tr key={l.skuCode} className={l.newPoNeed === null ? 'opacity-50' : ''}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={l.include}
                                  disabled={l.newPoNeed === null}
                                  onChange={(e) => updateLine(l.skuCode, { include: e.target.checked })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <p className="font-medium text-gray-800">{l.skuName}</p>
                                <p className="text-xs text-gray-400 font-mono">
                                  {l.skuCode} {l.newPoNeed === null && '- not on new PO'}
                                </p>
                              </td>
                              <td className="px-3 py-2 text-right">{l.available.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right">{l.newPoNeed != null ? l.newPoNeed.toLocaleString() : '-'}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  disabled={!l.include}
                                  value={l.quantityMapped}
                                  onChange={(e) => updateLine(l.skuCode, { quantityMapped: e.target.value })}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right disabled:bg-gray-100"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {newPo && (
                  <div className={`p-4 rounded-lg ${totals.coveragePercent >= MIN_COVERAGE_PERCENT ? 'bg-green-50' : 'bg-nootie-orange-light'}`}>
                    <p className="text-sm font-medium text-gray-800">
                      Mapping ₹{totals.totalValueMapped.toLocaleString()} of new PO's ₹{totals.newPoValue.toLocaleString()} value
                    </p>
                    <p className={`text-xs mt-1 ${totals.coveragePercent >= MIN_COVERAGE_PERCENT ? 'text-green-700' : 'text-nootie-orange-dark'}`}>
                      {totals.coveragePercent.toFixed(1)}% coverage - minimum {MIN_COVERAGE_PERCENT}% required
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">New Appointment Date (optional)</label>
                  <input
                    type="date"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    rows={2}
                  />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}
                {success && <p className="text-xs text-green-600">{success}</p>}

                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => router.push('/po-mapping')} className="px-4 py-2 text-sm text-gray-600 hover:underline">
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={submitting}
                    className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    {submitting ? 'Mapping...' : 'Map PO'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
