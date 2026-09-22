import React, { useEffect, useRef, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { sheetTrackerImportService, SheetTrackerBatch } from '@/services/sheet-tracker-import.service';
import { format } from 'date-fns';

const STATUS_STYLES: Record<string, string> = {
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

export default function GoogleSheetsUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<SheetTrackerBatch | null>(null);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState<SheetTrackerBatch[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const endpoint = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/webhooks/google-sheets/tracker`;
  const lastSync = batches.find((b) => b.fileName === 'Google Sheet sync');
  const script = APPS_SCRIPT.replace('__ENDPOINT__', endpoint);

  const endpointIsBroken = endpoint.includes('localhost');

  const copyScript = async () => {
    if (endpointIsBroken) return; // never let a broken (localhost) endpoint get copied into the sheet
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked - the script is selectable in the box */
    }
  };

  const loadBatches = async () => setBatches(await sheetTrackerImportService.listBatches());
  useEffect(() => {
    loadBatches();
  }, []);

  const handleFile = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFile(list[0]);
    setResult(null);
    setError('');
  };

  const upload = async () => {
    if (!file) {
      setError('Choose or drop the tracker sheet first.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      setResult(await sheetTrackerImportService.upload(file));
      setFile(null);
      await loadBatches();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (b: SheetTrackerBatch) => {
    if (!window.confirm(`Delete upload history for ${b.batchCode}? This only removes the upload record - it does not undo anything already applied to POs.`)) return;
    setDeletingId(b.id);
    try {
      await sheetTrackerImportService.deleteBatch(b.id);
      await loadBatches();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow p-8 mb-6">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Google Sheets Upload</h2>
        <p className="text-gray-500 text-sm mb-4">
          Upload the <b>Master Dispatch &amp; GRN Tracker</b> - in Google Sheets use File → Download → Microsoft Excel (.xlsx) or CSV, then drop it here.
          Each row is matched to its PO by PO Number and applied in one go:
        </p>
        <ul className="text-sm text-gray-600 list-disc pl-5 mb-6 space-y-1">
          <li><b>Dispatch</b> - dispatch date, invoice number/value, docket/AWB, delivery partner, status, comment</li>
          <li><b>Delivery</b> - appointment date and PO expiry date</li>
          <li><b>GRN</b> - when GRN Status is Completed: outcome from shortage/damage/excess, discrepancy amount, credit note number. GRN number = invoice number; received value = invoice value less net discrepancy</li>
        </ul>
        <p className="text-gray-500 text-xs mb-6">Blank cells never overwrite existing data. Re-uploading the same sheet is safe.</p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            dragging ? 'border-nootie-orange bg-nootie-orange-light' : 'border-gray-300 hover:border-nootie-orange'
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFile(e.target.files)} />
          <p className="text-gray-600 font-medium">Drag &amp; drop the exported Excel/CSV file here, or click to browse</p>
          {file && <p className="mt-4 text-sm text-gray-700">📄 {file.name}</p>}
        </div>

        {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

        <button
          disabled={uploading || !file}
          onClick={upload}
          className="mt-6 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
        >
          {uploading ? 'Applying...' : 'Upload Google Sheet'}
        </button>

        {result && (
          <div className="mt-8 border rounded-lg p-5 bg-nootie-cream">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-800">{result.fileName}</p>
                <p className="text-xs text-gray-500">{result.batchCode}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[result.status]}`}>{result.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <Stat label="Rows" value={result.totalRows} />
              <Stat label="Applied" value={result.appliedCount} accent="text-green-600" />
              <Stat label="Skipped / Failed" value={result.skippedCount} accent="text-nootie-orange-dark" />
            </div>
            {result.errorMessage && <p className="mt-3 text-sm text-red-700">{result.errorMessage}</p>}
            <a href={`/sheets-import/${result.id}`} className="text-sm text-nootie-orange-dark hover:underline mt-4 inline-block">
              View Results →
            </a>
          </div>
        )}
      </div>


      <div className="bg-white rounded-lg shadow p-8 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold mb-1 text-gray-800">Automatic sync from Google Sheets</h2>
            <p className="text-gray-500 text-sm">
              Free, and no Google Cloud account or payment details needed. A small script inside your sheet sends its rows here
              every 15 minutes - unchanged sheets are skipped, and a sheet that isn&apos;t the tracker is refused.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Last automatic sync</p>
            {lastSync ? (
              <a href={`/sheets-import/${lastSync.id}`} className="text-sm text-nootie-orange-dark hover:underline">
                {format(new Date(lastSync.uploadedAt), 'dd MMM yyyy HH:mm')} · {lastSync.appliedCount} applied
              </a>
            ) : (
              <p className="text-sm text-gray-500">Not connected yet</p>
            )}
          </div>
        </div>

        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium text-nootie-orange-dark">Set it up (about 5 minutes)</summary>
          <ol className="list-decimal pl-5 mt-3 space-y-2 text-sm text-gray-700">
            <li>
              Ask whoever runs the server to set an environment variable <code className="bg-gray-100 px-1 rounded">SHEET_SYNC_KEY</code> to a long random
              secret (Railway → backend service → Variables). Sync stays switched off until it exists.
            </li>
            <li>In your Google Sheet: <b>Extensions → Apps Script</b>. Delete any code there and paste the script below.</li>
            <li>
              In the script, replace <code className="bg-gray-100 px-1 rounded">PASTE_YOUR_SYNC_KEY_HERE</code> with that same secret, and set{' '}
              <code className="bg-gray-100 px-1 rounded">TAB_NAME</code> to the tab that holds the tracker. Click <b>Run</b> once and approve the permissions prompt.
            </li>
            <li>
              Click the clock icon (<b>Triggers</b>) → <b>Add Trigger</b> → function <code className="bg-gray-100 px-1 rounded">syncTracker</code> → time-driven →
              every 15 minutes.
            </li>
          </ol>
          <p className="text-xs text-gray-500 mt-3">
            Tip: format the PO Number and Invoice Number columns as <b>Plain text</b> in the sheet - numbers over 15 digits lose their last digits in any spreadsheet.
          </p>
          {endpointIsBroken && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-2 font-medium">
              ⚠️ This page doesn&apos;t know its own server address (the <code className="bg-white px-1 rounded">NEXT_PUBLIC_API_URL</code> environment
              variable isn&apos;t set for this deployment, or it was set after the last build - Next.js only reads it at build time). The script below would
              point Google at "localhost", which fails silently. Copying is disabled until this is fixed: set{' '}
              <code className="bg-white px-1 rounded">NEXT_PUBLIC_API_URL</code> to the backend&apos;s public URL on the <b>frontend</b> Railway service, then
              redeploy the frontend.
            </p>
          )}
          <div className="relative mt-4">
            <button
              onClick={copyScript}
              disabled={endpointIsBroken}
              title={endpointIsBroken ? 'Fix NEXT_PUBLIC_API_URL first - see the warning above' : undefined}
              className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              {copied ? 'Copied' : 'Copy script'}
            </button>
            <pre className="bg-gray-50 border rounded-lg p-4 text-xs overflow-x-auto text-gray-800 whitespace-pre">{script}</pre>
          </div>
        </details>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-800">Upload History</h3>
        </div>
        {batches.length === 0 ? (
          <p className="p-6 text-gray-500">No uploads yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Batch</th>
                <th className="px-4 py-3 text-left">Uploaded</th>
                <th className="px-4 py-3 text-left">Rows</th>
                <th className="px-4 py-3 text-left">Applied</th>
                <th className="px-4 py-3 text-left">Skipped / Failed</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <a href={`/sheets-import/${b.id}`} className="text-nootie-orange-dark hover:underline">{b.batchCode}</a>
                    <p className="text-xs text-gray-400">{b.fileName}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{format(new Date(b.uploadedAt), 'dd MMM yyyy HH:mm')}</td>
                  <td className="px-4 py-3">{b.totalRows}</td>
                  <td className="px-4 py-3 text-green-700">{b.appliedCount}</td>
                  <td className="px-4 py-3 text-nootie-orange-dark">{b.skippedCount}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[b.status]}`}>{b.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button disabled={deletingId === b.id} onClick={() => handleDelete(b)} className="text-xs text-red-600 hover:underline disabled:opacity-50">
                      {deletingId === b.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MainLayout>
  );
}

const APPS_SCRIPT = `// Nootie Control Tower - sends this sheet's tracker rows to the app.
const ENDPOINT = '__ENDPOINT__';
const SYNC_KEY = 'PASTE_YOUR_SYNC_KEY_HERE';
const TAB_NAME = 'DISPATCH + GRN'; // the tab that holds the tracker

function syncTracker() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) throw new Error('Tab not found: ' + TAB_NAME);
  const tz = ss.getSpreadsheetTimeZone();

  // getValues() returns the real cell values (not the displayed text), so long
  // numbers arrive exactly. Dates are sent as yyyy-MM-dd so no timezone can
  // shift them by a day.
  const rows = sheet.getDataRange().getValues().map(function (row) {
    return row.map(function (v) {
      return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
    });
  });

  const res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-key': SYNC_KEY },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
`;

const Stat: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
  <div>
    <p className={`text-2xl font-bold ${accent || 'text-gray-800'}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);
