import React, { useEffect, useRef, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { sheetTrackerImportService, SheetTrackerBatch } from '@/services/sheet-tracker-import.service';
import { useBatchProgress } from '@/hooks/useBatchProgress';
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
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState<SheetTrackerBatch[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
  const endpoint = `${apiBase}/webhooks/google-sheets/tracker`;
  const poDataEndpoint = `${apiBase}/webhooks/google-sheets/po-data`;
  const lastSync = batches.find((b) => b.fileName === 'Google Sheet sync');
  const script = APPS_SCRIPT.replace('__ENDPOINT__', endpoint);
  const allPoDataScript = APPS_SCRIPT_ALL_PO_DATA.replace('__ENDPOINT_PULL__', endpoint).replace('__ENDPOINT_PUSH__', poDataEndpoint);

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

  const copyAllPoDataScript = async () => {
    if (endpointIsBroken) return;
    try {
      await navigator.clipboard.writeText(allPoDataScript);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      /* clipboard blocked - the script is selectable in the box */
    }
  };

  const loadBatches = async () => setBatches(await sheetTrackerImportService.listBatches());
  useEffect(() => {
    loadBatches();
  }, []);

  // The upload call itself returns almost instantly now (the import runs in
  // the background) - this polls the batch so the page shows live progress
  // instead of a static "Applying..." button with no feedback.
  const liveBatch = useBatchProgress(activeBatchId, sheetTrackerImportService.getBatch, () => loadBatches());
  const isRunning = liveBatch?.status === 'PROCESSING';

  const handleFile = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFile(list[0]);
    setActiveBatchId(null);
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
      const batch = await sheetTrackerImportService.upload(file);
      setActiveBatchId(batch.id);
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
          disabled={uploading || isRunning || !file}
          onClick={upload}
          className="mt-6 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
        >
          {uploading ? 'Starting...' : 'Upload Google Sheet'}
        </button>

        {liveBatch && (
          <div className="mt-8 border rounded-lg p-5 bg-nootie-cream">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-800">{liveBatch.fileName}</p>
                <p className="text-xs text-gray-500">{liveBatch.batchCode}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[liveBatch.status]}`}>
                {isRunning && <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse mr-1.5 align-middle" />}
                {isRunning ? 'Applying' : liveBatch.status}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <Stat label="Rows So Far" value={liveBatch.totalRows} />
              <Stat label="Applied" value={liveBatch.appliedCount} accent="text-green-600" />
              <Stat label="Skipped / Failed" value={liveBatch.skippedCount} accent="text-nootie-orange-dark" />
            </div>
            {liveBatch.errorMessage && <p className="mt-3 text-sm text-red-700">{liveBatch.errorMessage}</p>}
            {isRunning ? (
              <p className="text-xs text-gray-500 mt-4 text-center">Running in the background - this updates automatically, feel free to navigate away.</p>
            ) : (
              <a href={`/sheets-import/${liveBatch.id}`} className="text-sm text-nootie-orange-dark hover:underline mt-4 inline-block">
                View Results →
              </a>
            )}
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

      <div className="bg-white rounded-lg shadow p-8 mb-6">
        <h2 className="text-xl font-bold mb-1 text-gray-800">All PO Data (one sheet, every PO, two-way)</h2>
        <p className="text-gray-500 text-sm mb-4">
          A separate tab that mirrors every PO - not just the ones on the Dispatch &amp; GRN Tracker - with all the same
          fields you can edit there, plus read-only columns (PO Status, PO Value, Fulfilment %, Total
          Quantity, ...) the app itself computes. Its script applies any edits first, then overwrites the tab with the
          fresh result, so it always ends up showing current data.
        </p>
        <ul className="text-sm text-gray-600 list-disc pl-5 mb-4 space-y-1">
          <li><b>Editable from the sheet</b> - the same columns as the Tracker above, same names: Dispatch Date, Invoice Number, Channel, Location / Hub, Invoice Value, Docket / AWB Number, Delivery Partner, Status, Akshay&apos;s Comment, Expriy Date, Appointment Date, GRN Status + its shortage/damage/excess/credit-note fields, and Delivery Date.</li>
          <li><b>Read-only, refreshed every sync</b> - PO Status, Fulfilment %, Fill Rate %, PO Value, Total Quantity, Location Type, Recommended/Planned Dispatch Date, Dispatch Plan Status, GRN Outcome, GRN Recorded Date.</li>
        </ul>
        <p className="text-xs text-gray-500 mb-4">
          Doesn&apos;t include <b>S.No</b> or <b>GRN Alert</b> from the real Tracker sheet - those aren&apos;t backed by any app field (they look like manual/formula columns), so there's nothing to sync for them here.
        </p>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-nootie-orange-dark">Set it up (about 5 minutes)</summary>
          <ol className="list-decimal pl-5 mt-3 space-y-2 text-sm text-gray-700">
            <li>Uses the same <code className="bg-gray-100 px-1 rounded">SHEET_SYNC_KEY</code> as the Tracker sync above - set that up first if you haven&apos;t.</li>
            <li>In the same Google Sheet (or a new one, your choice): add a tab named exactly <code className="bg-gray-100 px-1 rounded">ALL PO DATA</code>. Leave it empty - the first sync fills it in.</li>
            <li>
              <b>Extensions → Apps Script</b>. Paste the script below <i>alongside</i> the Tracker script (don&apos;t delete that one) - they're independent functions in the same project.
              Replace <code className="bg-gray-100 px-1 rounded">PASTE_YOUR_SYNC_KEY_HERE</code> with your secret. Click <b>Run</b> once, with <code className="bg-gray-100 px-1 rounded">syncAllPoData</code> selected, and approve the permissions prompt.
            </li>
            <li>
              <b>Triggers</b> → <b>Add Trigger</b> → function <code className="bg-gray-100 px-1 rounded">syncAllPoData</code> → time-driven → every 15-30 minutes.
            </li>
          </ol>
          <p className="text-xs text-gray-500 mt-3">
            Each sync clears and rewrites the whole tab, so anything typed into it right before a sync runs is sent first and reflected in the same refresh.
            Don&apos;t add other columns or formulas to this tab - they&apos;ll be wiped on the next sync.
          </p>
          <div className="relative mt-4">
            <button
              onClick={copyAllPoDataScript}
              disabled={endpointIsBroken}
              title={endpointIsBroken ? 'Fix NEXT_PUBLIC_API_URL first - see the warning above' : undefined}
              className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              {copiedAll ? 'Copied' : 'Copy script'}
            </button>
            <pre className="bg-gray-50 border rounded-lg p-4 text-xs overflow-x-auto text-gray-800 whitespace-pre">{allPoDataScript}</pre>
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

const APPS_SCRIPT_ALL_PO_DATA = `// Nootie Control Tower - two-way sync for the "ALL PO DATA" tab: sends this
// tab's edits in, then overwrites it with the fresh, full result.
const ENDPOINT_PULL = '__ENDPOINT_PULL__'; // applies edits (same endpoint as the Tracker sync)
const ENDPOINT_PUSH = '__ENDPOINT_PUSH__'; // returns the current full PO dataset
const SYNC_KEY = 'PASTE_YOUR_SYNC_KEY_HERE';
const TAB_NAME = 'ALL PO DATA';

// Row 1 of the tab is a colored category band (PO INFO / DISPATCH &
// LOGISTICS / ...), row 2 is the real column headers, data starts at row 3.
// A category band color per group name - add one here if a new category
// name ever appears in the pushed data. Two of these are the app's own
// brand colors (Tailwind "nootie" orange-dark / gold-dark).
const CATEGORY_COLORS = {
  'PO INFO': '#334155',
  'DISPATCH & LOGISTICS': '#CC5620',
  APPOINTMENT: '#DB8F13',
  'GRN RECONCILIATION': '#047857',
};
// Light tint of each category's color, used on the header row so every
// column visibly belongs to its group without needing to look back up at
// the band row.
const CATEGORY_LIGHT_COLORS = {
  'PO INFO': '#E2E8F0',
  'DISPATCH & LOGISTICS': '#FDE9DC',
  APPOINTMENT: '#FDF0D5',
  'GRN RECONCILIATION': '#D1FAE5',
};

// Columns to force to plain text so Google Sheets never "smart"-converts a
// date-shaped or long numeric string inconsistently across rows (seen live:
// some PO dates rendered as "2026-09-03", others as "14/9/2026" because
// Sheets silently reinterpreted only the ones matching its locale pattern).
// Must be set BEFORE the values are written - formatting a cell that's
// already been auto-converted only changes its display, not its underlying
// type.
const PLAIN_TEXT_COLUMNS = [
  'PO Number', 'Order Date', 'Expriy Date', 'Dispatch Date', 'Recommended Dispatch Date',
  'Planned Dispatch Date', 'Invoice Number', 'Docket / AWB Number', 'Delivery Date',
  'Appointment Date', "Credit Note #", 'GRN Recorded Date',
];
const CURRENCY_COLUMNS = ['PO Value', 'Invoice Value (₹)', 'Shortage Value (₹)', 'Damage Value (₹)', 'Excess Value (₹)', 'Net Discrepancy (₹)', 'Credit Note Value (₹)'];
// Stored as e.g. 76.21 meaning 76.21% (not a 0-1 fraction) - a plain "append
// a %" format, not Sheets' native percentage type, which would divide by 100.
const PERCENT_COLUMNS = ['Fulfilment %', 'Fill Rate %'];
const QTY_COLUMNS = ['Total Quantity', 'Shortage Qty', 'Damage Qty', 'Excess Qty'];
// Status-like columns read better centered than left-aligned.
const CENTER_COLUMNS = ['PO Status', 'GRN Outcome', 'Dispatch Plan Status', 'Location Type', 'GRN Status', 'Status'];
// Dropdowns for the columns ops actually choose a value from when editing
// the sheet (everything else here is free text or a date).
const DROPDOWN_COLUMNS = {
  'GRN Status': ['', 'Pending', 'Completed'],
  Status: ['', 'Dispatched', 'Invoiced', 'In Transit', 'Delivered', 'RTO', 'Returned', 'Cancelled'],
};

// Colored status "badges" for PO Status and GRN Outcome - a simple 4-tier
// scheme (neutral / in-progress-on-brand / done / negative).
const PO_STATUS_BADGES = {
  RECEIVED: { bg: '#F1F5F9', fg: '#475569' },
  APPOINTMENT_REQUESTED: { bg: '#F1F5F9', fg: '#475569' },
  APPOINTMENT_CONFIRMED: { bg: '#F1F5F9', fg: '#475569' },
  READY_FOR_DISPATCH: { bg: '#F1F5F9', fg: '#475569' },
  DISPATCHED: { bg: '#FDE9DC', fg: '#CC5620' },
  IN_TRANSIT: { bg: '#FDE9DC', fg: '#CC5620' },
  DELIVERED: { bg: '#D1FAE5', fg: '#065F46' },
  GRN_PENDING: { bg: '#D1FAE5', fg: '#065F46' },
  RECONCILED: { bg: '#D1FAE5', fg: '#065F46' },
  CLOSED: { bg: '#D1FAE5', fg: '#065F46' },
  RETURNED: { bg: '#FEE2E2', fg: '#991B1B' },
  CANCELLED: { bg: '#FEE2E2', fg: '#991B1B' },
};
const GRN_OUTCOME_BADGES = {
  MATCHED: { bg: '#D1FAE5', fg: '#065F46' },
  SHORTAGE: { bg: '#FEE2E2', fg: '#991B1B' },
  DAMAGE: { bg: '#FEE2E2', fg: '#991B1B' },
  MISMATCHED: { bg: '#FEE2E2', fg: '#991B1B' },
  OTHER: { bg: '#FEF3C7', fg: '#92400E' },
  NO_GRN: { bg: '#F1F5F9', fg: '#475569' },
};

function addBadgeRules(rules, sheet, headers, columnName, badgeMap, lastRow) {
  var col = headers.indexOf(columnName) + 1;
  if (col === 0 || lastRow < 3) return;
  const range = sheet.getRange(3, col, lastRow - 2, 1);
  Object.keys(badgeMap).forEach(function (value) {
    const badge = badgeMap[value];
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(value)
        .setBackground(badge.bg)
        .setFontColor(badge.fg)
        .setBold(true)
        .setRanges([range])
        .build(),
    );
  });
}

function syncAllPoData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) throw new Error('Tab not found: ' + TAB_NAME);
  const tz = ss.getSpreadsheetTimeZone();

  // 1) Send whatever's in the tab right now (including edits since the last
  // sync) so they get applied before the refresh below overwrites anything.
  // The backend finds the real header row on its own even with the band row
  // above it, so the whole sheet (as-is) is sent unchanged.
  if (sheet.getLastRow() > 2) {
    const rows = sheet.getDataRange().getValues().map(function (row) {
      return row.map(function (v) {
        return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
      });
    });
    const applyRes = UrlFetchApp.fetch(ENDPOINT_PULL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-sync-key': SYNC_KEY },
      payload: JSON.stringify({ rows: rows }),
      muteHttpExceptions: true,
    });
    Logger.log('Apply: ' + applyRes.getResponseCode() + ' ' + applyRes.getContentText());
    // Give a small sheet's background apply a moment to finish before pulling
    // the refreshed data below. A very large sheet may still be applying when
    // this runs - any edits still mid-apply land on the NEXT sync instead.
    Utilities.sleep(5000);
  }

  // 2) Pull the full, current dataset and overwrite the tab with it.
  const refreshRes = UrlFetchApp.fetch(ENDPOINT_PUSH, {
    method: 'get',
    headers: { 'x-sync-key': SYNC_KEY },
    muteHttpExceptions: true,
  });
  if (refreshRes.getResponseCode() !== 200) {
    Logger.log('Refresh failed: ' + refreshRes.getResponseCode() + ' ' + refreshRes.getContentText());
    return;
  }
  const data = JSON.parse(refreshRes.getContentText());
  const colCount = data.headers.length;
  const lastRow = data.rows.length ? 2 + data.rows.length : 2;

  sheet.clear();
  sheet.clearConditionalFormatRules();

  // Force plain text on these columns BEFORE any values are written - must
  // happen first, see the comment on PLAIN_TEXT_COLUMNS above.
  PLAIN_TEXT_COLUMNS.forEach(function (name) {
    const c = data.headers.indexOf(name) + 1;
    if (c > 0) sheet.getRange(1, c, sheet.getMaxRows(), 1).setNumberFormat('@');
  });

  // Band row: category name in its first column, blank cells for the rest of
  // its span (about to be merged) - this low non-empty-cell count is exactly
  // what lets the backend's header-row detector skip past it automatically.
  const bandRow = [];
  data.categories.forEach(function (cat) {
    bandRow.push(cat.name);
    for (var i = 1; i < cat.span; i++) bandRow.push('');
  });
  sheet.getRange(1, 1, 1, colCount).setValues([bandRow]);
  sheet.getRange(2, 1, 1, colCount).setValues([data.headers]);
  if (data.rows.length) sheet.getRange(3, 1, data.rows.length, colCount).setValues(data.rows);

  // Number formats for currency / percent / quantity columns.
  CURRENCY_COLUMNS.forEach(function (name) {
    const c = data.headers.indexOf(name) + 1;
    if (c > 0 && data.rows.length) sheet.getRange(3, c, data.rows.length, 1).setNumberFormat('"₹"#,##0.00;[RED]-"₹"#,##0.00');
  });
  PERCENT_COLUMNS.forEach(function (name) {
    const c = data.headers.indexOf(name) + 1;
    if (c > 0 && data.rows.length) sheet.getRange(3, c, data.rows.length, 1).setNumberFormat('0.0"%"');
  });
  QTY_COLUMNS.forEach(function (name) {
    const c = data.headers.indexOf(name) + 1;
    if (c > 0 && data.rows.length) sheet.getRange(3, c, data.rows.length, 1).setNumberFormat('#,##0');
  });

  // Alignment: numbers/money right, statuses centered (everything else -
  // text, dates - stays left, the default).
  if (data.rows.length) {
    CURRENCY_COLUMNS.concat(PERCENT_COLUMNS, QTY_COLUMNS).forEach(function (name) {
      const c = data.headers.indexOf(name) + 1;
      if (c > 0) sheet.getRange(3, c, data.rows.length, 1).setHorizontalAlignment('right');
    });
    CENTER_COLUMNS.forEach(function (name) {
      const c = data.headers.indexOf(name) + 1;
      if (c > 0) sheet.getRange(3, c, data.rows.length, 1).setHorizontalAlignment('center');
    });
  }

  // Dropdowns on the columns ops picks a value from when editing. Delivery
  // Partner's list comes live from the backend (the real transporter
  // master), not a hardcoded array, so it can't go stale.
  if (data.rows.length) {
    Object.keys(DROPDOWN_COLUMNS).forEach(function (name) {
      const c = data.headers.indexOf(name) + 1;
      if (c === 0) return;
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(DROPDOWN_COLUMNS[name], true).setAllowInvalid(true).build();
      sheet.getRange(3, c, data.rows.length, 1).setDataValidation(rule);
    });
    const deliveryPartnerCol = data.headers.indexOf('Delivery Partner') + 1;
    if (deliveryPartnerCol > 0 && data.transporters && data.transporters.length) {
      const partnerRule = SpreadsheetApp.newDataValidation().requireValueInList(data.transporters, true).setAllowInvalid(true).build();
      sheet.getRange(3, deliveryPartnerCol, data.rows.length, 1).setDataValidation(partnerRule);
    }
  }

  // Style the band: merge each category's span, color it, white bold
  // centered text, taller row.
  var col = 1;
  data.categories.forEach(function (cat) {
    const range = sheet.getRange(1, col, 1, cat.span);
    if (cat.span > 1) range.merge();
    range.setBackground(CATEGORY_COLORS[cat.name] || '#374151').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(10).setHorizontalAlignment('center');
    col += cat.span;
  });
  sheet.setRowHeight(1, 30);

  // Header row: each column tinted with a light version of its own
  // category's color, so the grouping reads clearly column-by-column, not
  // just from the band above. Bold dark text, bold orange underline across
  // the whole row ties it back to the brand.
  sheet.getRange(2, 1, 1, colCount).setFontWeight('bold').setFontColor('#334155').setBorder(null, null, true, null, null, null, '#EA6A2D', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  var headerCol = 1;
  data.categories.forEach(function (cat) {
    sheet.getRange(2, headerCol, 1, cat.span).setBackground(CATEGORY_LIGHT_COLORS[cat.name] || '#F3F4F6');
    headerCol += cat.span;
  });

  // Vertical dividers between categories, spanning the band + header + data
  // rows, so the grouping reads clearly even without the top band in view.
  var boundary = 0;
  data.categories.slice(0, -1).forEach(function (cat) {
    boundary += cat.span;
    sheet.getRange(1, boundary, lastRow, 1).setBorder(null, null, null, true, null, null, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });

  // Colored status badges, then a zebra-stripe rule last so it only fills in
  // cells the badge rules above didn't already color - earlier rules in this
  // list win ties, so order matters. Done via a formula rule rather than the
  // Banding API's row-banding, which turned out to silently ignore the
  // custom colors and keep its built-in grey theme.
  sheet.getBandings().forEach(function (b) {
    b.remove();
  });
  const rules = [];
  addBadgeRules(rules, sheet, data.headers, 'PO Status', PO_STATUS_BADGES, lastRow);
  addBadgeRules(rules, sheet, data.headers, 'GRN Outcome', GRN_OUTCOME_BADGES, lastRow);
  if (data.rows.length) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=ISEVEN(ROW())')
        .setBackground('#FFF8EF')
        .setRanges([sheet.getRange(3, 1, data.rows.length, colCount)])
        .build(),
    );
  }
  sheet.setConditionalFormatRules(rules);

  // Freeze the band + header rows, hide gridlines, and size columns to fit
  // (with a floor so a narrow status/qty column isn't squeezed unreadably
  // thin). Can't also freeze a column here - the band row's merged cells
  // span multiple columns, and Sheets refuses to freeze a column that would
  // split a merge.
  sheet.setFrozenRows(2);
  sheet.setHiddenGridlines(true);
  sheet.autoResizeColumns(1, colCount);
  for (var i = 1; i <= colCount; i++) {
    if (sheet.getColumnWidth(i) < 90) sheet.setColumnWidth(i, 90);
  }

  Logger.log('Refreshed ' + data.rows.length + ' POs');
}
`;

const Stat: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
  <div>
    <p className={`text-2xl font-bold ${accent || 'text-gray-800'}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);
