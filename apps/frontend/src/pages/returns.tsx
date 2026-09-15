import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { returnsService } from '@/services/returns.service';
import { format } from 'date-fns';

export default function Returns() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<Record<string, { rootCause: string; creditNoteNumber: string; lossAmount: string; dncnType: string; dncnValue: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRecords(await returnsService.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const form = (id: string) => forms[id] || { rootCause: '', creditNoteNumber: '', lossAmount: '', dncnType: '', dncnValue: '' };
  const setField = (id: string, field: string, value: string) => setForms((f) => ({ ...f, [id]: { ...form(id), [field]: value } }));

  const close = async (id: string) => {
    const f = form(id);
    if (!f.rootCause) return;
    setBusy(id);
    try {
      await returnsService.close(id, {
        rootCause: f.rootCause,
        creditNoteNumber: f.creditNoteNumber || undefined,
        lossAmount: f.lossAmount ? Number(f.lossAmount) : undefined,
        dncnType: (f.dncnType as 'DEBIT' | 'CREDIT') || undefined,
        dncnValue: f.dncnValue ? Number(f.dncnValue) : undefined,
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Returns &amp; Credit Notes</h2>
          <p className="text-sm text-gray-500 mt-1">
            Auto-created on delivery rejection, GRN "No GRN" outcome, or expiry without delivery. Root cause is required to close.
          </p>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : records.length === 0 ? (
          <p className="p-6 text-gray-500">No returns recorded.</p>
        ) : (
          <div className="divide-y">
            {records.map((r) => {
              const closed = !!r.rootCause;
              const f = form(r.id);
              return (
                <div key={r.id} className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <a href={`/pos/${r.poId}`} className="font-medium text-nootie-orange-dark hover:underline">
                        {r.po?.poNumber || r.poId}
                      </a>
                      <span className="ml-3 px-2 py-1 rounded text-xs bg-red-100 text-red-800">{r.returnType.replace(/_/g, ' ')}</span>
                      <span className="ml-3 text-xs text-gray-500">{format(new Date(r.returnDate), 'dd MMM yyyy')}</span>
                    </div>
                    {closed && <span className="text-green-700 text-xs font-medium">Closed</span>}
                  </div>

                  {closed ? (
                    <div className="text-sm text-gray-700 space-y-1">
                      <p><span className="text-gray-500">Root cause:</span> {r.rootCause}</p>
                      {r.creditNoteNumber && <p><span className="text-gray-500">DNCN number:</span> {r.creditNoteNumber}</p>}
                      {r.dncnType && <p><span className="text-gray-500">DNCN type:</span> {r.dncnType === 'DEBIT' ? 'Debit Note' : 'Credit Note'}</p>}
                      {r.dncnValue != null && <p><span className="text-gray-500">DNCN value:</span> ₹{Number(r.dncnValue).toLocaleString()}</p>}
                      {r.lossAmount != null && <p><span className="text-gray-500">Loss:</span> ₹{Number(r.lossAmount).toLocaleString()}</p>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-6 gap-3 items-start">
                      <input
                        className="border rounded px-2 py-1 text-sm col-span-2"
                        placeholder="Root cause (required)"
                        value={f.rootCause}
                        onChange={(e) => setField(r.id, 'rootCause', e.target.value)}
                      />
                      <input
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="DNCN Number"
                        value={f.creditNoteNumber}
                        onChange={(e) => setField(r.id, 'creditNoteNumber', e.target.value)}
                      />
                      <select
                        className="border rounded px-2 py-1 text-sm"
                        value={f.dncnType}
                        onChange={(e) => setField(r.id, 'dncnType', e.target.value)}
                      >
                        <option value="">DNCN Type</option>
                        <option value="DEBIT">Debit Note</option>
                        <option value="CREDIT">Credit Note</option>
                      </select>
                      <input
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="DNCN value"
                        type="number"
                        value={f.dncnValue}
                        onChange={(e) => setField(r.id, 'dncnValue', e.target.value)}
                      />
                      <input
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="Loss amount"
                        type="number"
                        value={f.lossAmount}
                        onChange={(e) => setField(r.id, 'lossAmount', e.target.value)}
                      />
                      <button
                        disabled={busy === r.id || !f.rootCause}
                        onClick={() => close(r.id)}
                        className="px-3 py-1 bg-nootie-orange-dark text-white rounded text-sm hover:bg-nootie-orange disabled:opacity-50 col-span-1"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
