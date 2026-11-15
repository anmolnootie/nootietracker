import React, { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

/** The Apps Script that keeps the app in sync with the Warehouse Master automatically. Paste once; setup() installs a 15-minute timer. */
export function warehouseMasterScript(endpoint: string) {
  return `// Nootie PO Control Tower - automatic Warehouse Master sync.
// Paste into the Warehouse Master: Extensions > Apps Script. Put the sync key below, then run "setup" once.
const ENDPOINT = '${endpoint}';
const SYNC_KEY = 'PASTE_THE_SYNC_KEY_HERE';
const TABS = ['ORDER BOOK', 'DISPATCH + GRN', 'GRN', 'BLINKIT', 'FLIPKART', 'ZEPTO', 'SWIGGY'];

function syncWarehouseMaster() {
  const tabs = {};
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (TABS.indexOf(name.trim().toUpperCase()) >= 0) tabs[name] = sheet.getDataRange().getDisplayValues();
  });
  const res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post', contentType: 'application/json', headers: { 'x-sync-key': SYNC_KEY },
    payload: JSON.stringify({ tabs: tabs }), muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}

// Run this ONE time: it creates a timer that syncs every 15 minutes, then syncs right away.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncWarehouseMaster') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncWarehouseMaster').timeBased().everyMinutes(15).create();
  syncWarehouseMaster();
}
`;
}

export const WarehouseMasterScript: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const endpoint = `${API.replace(/\/$/, '')}/webhooks/google-sheets/warehouse-master`;
  const code = warehouseMasterScript(endpoint);
  const broken = /localhost/.test(endpoint);
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">Automatic sync (set up once)</h2>
        <p className="text-sm text-slate-500 mt-1">After this, the Warehouse Master sends itself to the app every 15 minutes. New PO numbers, cancellations, dispatches and GRNs appear without anyone uploading anything.</p>
      </div>
      <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
        <li>Open the <b>Warehouse Master</b> in Google Sheets.</li>
        <li>Click <b>Extensions &gt; Apps Script</b>. A new tab opens with a code editor.</li>
        <li>Delete everything in the editor, click <b>Copy script</b> below, and paste it in.</li>
        <li>On the line <code className="bg-slate-100 px-1 rounded">SYNC_KEY = &apos;PASTE_THE_SYNC_KEY_HERE&apos;</code>, replace the placeholder with the sync key (ask your admin; it is the same key the tracker sync uses).</li>
        <li>Click the <b>Save</b> icon. In the function list at the top choose <b>setup</b>, then click <b>Run</b>.</li>
        <li>Google asks for permission: choose your account, click <b>Advanced &gt; Go to project (unsafe)</b>, then <b>Allow</b>. This only lets the script read this sheet and send it to the app.</li>
        <li>Done. The first sync runs immediately; check the result below in a minute.</li>
      </ol>
      {broken && <p className="text-sm text-red-600">This page doesn&apos;t know the live server address (NEXT_PUBLIC_API_URL), so the script would point at localhost. Fix that before copying.</p>}
      <div className="relative">
        <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-4 max-h-72 overflow-auto whitespace-pre">{code}</pre>
        <button onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })} className="absolute top-2 right-2 px-3 py-1.5 rounded-md bg-white text-slate-900 text-xs font-medium">{copied ? 'Copied' : 'Copy script'}</button>
      </div>
    </section>
  );
};
