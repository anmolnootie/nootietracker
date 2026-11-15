import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { inr } from '@/components/control-tower/ui';

/**
 * Warehouse Master import - the starting point for PO numbers. Creates one PO
 * per PO number in the Order Book, Dispatch + GRN and platform tabs, then
 * applies dispatch and GRN through the sheet sync. Bulk PO uploads add SKU
 * lines to the same PO numbers later.
 */
export default function WarehouseMasterPage() {
  const { user } = useAuthStore();
  const canUpload = !!user?.roles?.some((r: string) => r === 'ADMIN' || r === 'SCM');
  const [status, setStatus] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => api.get('/warehouse-master/status').then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => { load(); return () => { if (timer.current) clearInterval(timer.current); }; }, []);
  useEffect(() => {
    if (status?.status === 'RUNNING' && !timer.current) timer.current = setInterval(load, 2000);
    if (status?.status !== 'RUNNING' && timer.current) { clearInterval(timer.current); timer.current = null; }
  }, [status?.status]);

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/warehouse-master/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setStatus(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Upload failed');
    } finally { setBusy(false); }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Warehouse Master</h1>
          <p className="text-sm text-slate-500 mt-1">The starting point for PO numbers. Upload the Warehouse Master and every PO in it is created in the app, with its dispatch and GRN status. Platform PO files uploaded later add the SKU lines to the same PO numbers.</p>
        </div>

        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <ol className="text-sm text-slate-600 space-y-1.5 list-decimal pl-5">
            <li>Open the Warehouse Master in Google Sheets and choose <b>File &gt; Download &gt; Microsoft Excel (.xlsx)</b>.</li>
            <li>Upload that file here. The app reads the <b>ORDER BOOK</b>, <b>DISPATCH + GRN</b>, <b>GRN</b>, <b>Blinkit</b>, <b>Flipkart</b>, <b>Zepto</b> and <b>Swiggy</b> tabs.</li>
            <li>POs that already exist are left as they are, so uploading again only adds new PO numbers.</li>
          </ol>
          {canUpload ? (
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
              <button onClick={upload} disabled={!file || busy || status?.status === 'RUNNING'} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-ct-orange text-white text-sm font-medium disabled:opacity-40">
                <Icon name="upload" size={16} />{busy ? 'Uploading...' : 'Import Warehouse Master'}
              </button>
            </div>
          ) : <p className="text-sm text-slate-500">Only Admin or SCM can run this import.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>

        {status && (
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Last import</h2>
              <span className={`text-xs px-2 py-1 rounded-full ${status.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : status.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{status.status === 'RUNNING' ? 'Running...' : status.status.toLowerCase()}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{status.fileName} · started {new Date(status.startedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · tabs read: {status.tabsFound?.join(', ')}</p>
            {status.error && <p className="mt-3 text-sm text-red-600">{status.error}</p>}
            {status.status === 'COMPLETED' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Num label="PO numbers in the sheet" value={status.posInSheet} />
                  <Num label="Created now" value={status.created} />
                  <Num label="Already in the app" value={status.alreadyExisted} />
                  <Num label="Invoice rows" value={status.dispatchRows} />
                </div>
                <Breakdown title="By platform" data={status.byPlatform} />
                <Breakdown title="Decision (from the sheet's status and remarks)" data={status.decisions} />
                {status.notes && Object.keys(status.notes).length > 0 && <Breakdown title="Gaps found" data={status.notes} />}
                <p className="text-sm text-slate-600">Dispatch and GRN: {status.sheetSync} · <Link href="/sheets-import" className="text-ct-orange hover:underline">Google Sheets sync</Link> · <Link href="/control-tower" className="text-ct-orange hover:underline">Open the control tower</Link></p>
              </div>
            )}
          </section>
        )}
      </div>
    </MainLayout>
  );
}

const Num: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-semibold tabular-nums text-slate-900">{inr(value ?? 0)}</p></div>
);
const Breakdown: React.FC<{ title: string; data: Record<string, number> }> = ({ title, data }) => (
  <div>
    <p className="text-xs font-medium text-slate-500 mb-1.5">{title}</p>
    <div className="flex flex-wrap gap-2">{Object.entries(data || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700">{k}: <b className="tabular-nums">{inr(v)}</b></span>)}</div>
  </div>
);
