import React, { useEffect, useState } from 'react';
import { exceptionsService } from '@/services/exceptions.service';
import { bulkImportService } from '@/services/bulk-import.service';
import { locationsService } from '@/services/locations.service';
import { LocationType } from '@po-control-tower/shared';
import { format } from 'date-fns';

interface Props {
  exceptionId: string;
  onChanged: () => void;
}

const toDateInput = (v: any) => (v ? String(v).slice(0, 10) : '');

export const ExceptionDetail: React.FC<Props> = ({ exceptionId, onChanged }) => {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [locationForm, setLocationForm] = useState({
    warehouseCode: '',
    locationType: LocationType.NON_LOCAL,
    localTatHours: '48',
    nonLocalTatMinDays: '10',
    nonLocalTatMaxDays: '8',
  });
  const [notes, setNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const d = await exceptionsService.getDetail(exceptionId);
      setDetail(d);
      if (d.processedRow) {
        setForm({
          poNumber: d.processedRow.poNumber || '',
          skuCode: d.processedRow.skuCode || '',
          warehouse: d.processedRow.warehouse || '',
          orderedQty: d.processedRow.orderedQty ?? '',
          deliveredQty: d.processedRow.deliveredQty ?? '',
          unitPrice: d.processedRow.unitPrice ?? '',
          poValue: d.processedRow.poValue ?? '',
          expiryDate: toDateInput(d.processedRow.expiryDate),
          appointmentDate: toDateInput(d.processedRow.appointmentDate),
          poStatus: d.processedRow.poStatus || '',
        });
      }
      if (d.exception.warehouse) {
        setLocationForm((f) => ({ ...f, warehouseCode: d.exception.warehouse.slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, '-') }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exceptionId]);

  const fixAndRecompile = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const corrections: Record<string, any> = { ...form };
      if (corrections.orderedQty !== '') corrections.orderedQty = Number(corrections.orderedQty);
      else delete corrections.orderedQty;
      if (corrections.deliveredQty !== '') corrections.deliveredQty = Number(corrections.deliveredQty);
      else delete corrections.deliveredQty;
      if (corrections.unitPrice !== '') corrections.unitPrice = Number(corrections.unitPrice);
      else delete corrections.unitPrice;
      if (corrections.poValue !== '') corrections.poValue = Number(corrections.poValue);
      else delete corrections.poValue;

      const result = await bulkImportService.reprocessRow(detail.processedRow.id, corrections);
      setFeedback({ ok: result.success, message: result.message });
      if (result.success) onChanged();
      await load();
    } catch (err: any) {
      setFeedback({ ok: false, message: err.response?.data?.message || 'Failed to reprocess row' });
    } finally {
      setBusy(false);
    }
  };

  const addLocationAndRetry = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await locationsService.create({
        locationName: detail.exception.warehouse,
        warehouseCode: locationForm.warehouseCode,
        locationType: locationForm.locationType,
        localTatHours: Number(locationForm.localTatHours),
        nonLocalTatMinDays: Number(locationForm.nonLocalTatMinDays),
        nonLocalTatMaxDays: Number(locationForm.nonLocalTatMaxDays),
      });
      // Re-run the row with no field changes - just to re-evaluate it against the
      // Location Master now that this warehouse is recognized.
      const result = await bulkImportService.reprocessRow(detail.processedRow.id, {});
      setFeedback({ ok: true, message: `Added "${detail.exception.warehouse}" to Location Master. ${result.message}` });
      onChanged();
      await load();
    } catch (err: any) {
      setFeedback({ ok: false, message: err.response?.data?.message || 'Failed to add location' });
    } finally {
      setBusy(false);
    }
  };

  const manualResolve = async (status: 'RESOLVED' | 'IGNORED') => {
    setBusy(true);
    try {
      await exceptionsService.resolve(exceptionId, notes || undefined, status as any);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading details...</div>;
  if (!detail) return <div className="p-4 text-sm text-red-600">Could not load exception details.</div>;

  const { exception, rawRow, processedRow, po } = detail;
  const isResolved = exception.resolutionStatus !== 'OPEN';

  return (
    <div className="p-4 bg-gray-50 border-t space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{exception.recommendedAction}</p>
        <p className="text-xs text-gray-500 mt-1">
          Detected {format(new Date(exception.detectedAt), 'dd MMM yyyy HH:mm')}
          {exception.resolutionNotes && <span> · resolved: {exception.resolutionNotes}</span>}
        </p>
      </div>

      {po && (
        <a href={`/pos/${po.id}`} className="inline-block text-sm text-nootie-orange-dark hover:underline">
          View compiled PO {po.poNumber} →
        </a>
      )}

      {rawRow && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Exact row from the uploaded file</p>
          <div className="bg-white border rounded p-3 overflow-x-auto">
            <table className="text-xs">
              <tbody>
                {Object.entries(rawRow.rawData).map(([k, v]) => (
                  <tr key={k}>
                    <td className="pr-4 py-0.5 font-medium text-gray-500">{k}</td>
                    <td className="py-0.5">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isResolved && exception.exceptionType === 'UNKNOWN_WAREHOUSE' && (
        <div className="bg-white border rounded p-4">
          <p className="text-sm font-medium text-gray-800 mb-3">Add "{exception.warehouse}" to Location Master</p>
          <div className="grid grid-cols-5 gap-2 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Warehouse Code</label>
              <input className="w-full border rounded px-2 py-1.5 text-sm" value={locationForm.warehouseCode} onChange={(e) => setLocationForm((f) => ({ ...f, warehouseCode: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select className="w-full border rounded px-2 py-1.5 text-sm" value={locationForm.locationType} onChange={(e) => setLocationForm((f) => ({ ...f, locationType: e.target.value as LocationType }))}>
                <option value={LocationType.LOCAL}>LOCAL</option>
                <option value={LocationType.NON_LOCAL}>NON_LOCAL</option>
              </select>
            </div>
            {locationForm.locationType === LocationType.LOCAL ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Local TAT (hrs)</label>
                <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={locationForm.localTatHours} onChange={(e) => setLocationForm((f) => ({ ...f, localTatHours: e.target.value }))} />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">TAT Max (days)</label>
                  <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={locationForm.nonLocalTatMaxDays} onChange={(e) => setLocationForm((f) => ({ ...f, nonLocalTatMaxDays: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">TAT Min (days)</label>
                  <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={locationForm.nonLocalTatMinDays} onChange={(e) => setLocationForm((f) => ({ ...f, nonLocalTatMinDays: e.target.value }))} />
                </div>
              </>
            )}
            <button disabled={busy || !locationForm.warehouseCode} onClick={addLocationAndRetry} className="bg-nootie-orange-dark hover:bg-nootie-orange text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
              Add &amp; Retry
            </button>
          </div>
        </div>
      )}

      {!isResolved && processedRow && (
        <div className="bg-white border rounded p-4">
          <p className="text-sm font-medium text-gray-800 mb-3">Fix the data and recompile this row</p>
          <div className="grid grid-cols-4 gap-3">
            <Field label="PO Number" value={form.poNumber} onChange={(v) => setForm((f) => ({ ...f, poNumber: v }))} />
            <Field label="SKU Code" value={form.skuCode} onChange={(v) => setForm((f) => ({ ...f, skuCode: v }))} />
            <Field label="Warehouse" value={form.warehouse} onChange={(v) => setForm((f) => ({ ...f, warehouse: v }))} />
            <Field label="PO Status" value={form.poStatus} onChange={(v) => setForm((f) => ({ ...f, poStatus: v }))} />
            <Field label="Ordered Qty" type="number" value={form.orderedQty} onChange={(v) => setForm((f) => ({ ...f, orderedQty: v }))} />
            <Field label="Delivered Qty" type="number" value={form.deliveredQty} onChange={(v) => setForm((f) => ({ ...f, deliveredQty: v }))} />
            <Field label="Unit Price" type="number" value={form.unitPrice} onChange={(v) => setForm((f) => ({ ...f, unitPrice: v }))} />
            <Field label="PO Value" type="number" value={form.poValue} onChange={(v) => setForm((f) => ({ ...f, poValue: v }))} />
            <Field label="Expiry Date" type="date" value={form.expiryDate} onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))} />
            <Field label="Appointment Date" type="date" value={form.appointmentDate} onChange={(v) => setForm((f) => ({ ...f, appointmentDate: v }))} />
          </div>
          <button disabled={busy} onClick={fixAndRecompile} className="mt-3 bg-nootie-orange-dark hover:bg-nootie-orange text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
            {busy ? 'Working...' : 'Fix & Recompile'}
          </button>
          {processedRow.validationErrors?.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">Currently flagged: {processedRow.validationErrors.join('; ')}</p>
          )}
        </div>
      )}

      {feedback && (
        <div className={`text-sm px-3 py-2 rounded ${feedback.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{feedback.message}</div>
      )}

      {!isResolved && (
        <div className="flex items-center gap-2">
          <input className="flex-1 border rounded px-2 py-1.5 text-sm" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button disabled={busy} onClick={() => manualResolve('RESOLVED')} className="px-3 py-1.5 bg-green-50 text-green-700 rounded text-sm hover:bg-green-100 disabled:opacity-50">
            Mark Resolved
          </button>
          <button disabled={busy} onClick={() => manualResolve('IGNORED')} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-sm hover:bg-gray-200 disabled:opacity-50">
            Ignore
          </button>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string }> = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="block text-xs text-gray-500 mb-1">{label}</label>
    <input type={type} className="w-full border rounded px-2 py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);
