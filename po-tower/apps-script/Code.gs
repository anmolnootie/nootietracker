/**
 * PO Control Tower: backend for the website.
 *
 * What it does
 *  - READS the Warehouse Master and the tracking sheet (nothing is ever written to the Warehouse Master).
 *  - WRITES only to the tracking sheet, and only when the editor PIN (its SHA-256 hash) matches.
 *
 * Setup is in the README: paste this file into Apps Script, set the VIEW_KEY script property,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 */
var SRC_ID = '10vLMqODDWeo8g4wFCmYATH59hhg2s4W7VTWp1e8euQo';   // Warehouse Master (read only)
var TRK_ID = '1XkWpydTQPviypiN2-xmhfYzPyc_hTRHRFLKQDVLMT98';   // PO Control Tower - Tracking (app data)
var MASTER_ID = '1NMr0ObBSNndhMpFMxmQQJM4rX3lCwm4Prbo9rMppx2E'; // PO Control Tower - MASTER (all data), rewritten automatically

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return out_({ ok: true, service: 'PO Control Tower backend', note: 'Use POST. Open the website to use the tower.' });
}

function doPost(e) {
  try {
    var r = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty('VIEW_KEY') || '';
    if (!key) return out_({ error: 'setup: set the VIEW_KEY script property first' });
    if (r.key !== key) return out_({ error: 'unauthorized' });
    var tool = r.tool, a = r.args || {};
    if (tool === 'sync_master') return out_(syncMaster());
    var id = a.spreadsheetId || a.spreadsheet_id;
    if (tool === 'get_values') return out_(getValues_(id, a.range));
    if (tool === 'update_values' || tool === 'append_values') {
      if (id !== TRK_ID) return out_({ error: 'writes are only allowed on the tracking sheet' });
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        checkPin_(r.pin, tool, a.range);
        return out_(tool === 'update_values' ? update_(a.range, a.values) : append_(a.range, a.values));
      } finally { lock.releaseLock(); }
    }
    return out_({ error: 'unknown tool ' + tool });
  } catch (err) {
    return out_({ error: String(err && err.message || err) });
  }
}

// Reads a range like 'Sheet'!A4:N5500 as display strings, clamped to the real grid (like the Sheets API does).
function readRange_(ss, a1) {
  var i = a1.lastIndexOf('!');
  var name = a1.slice(0, i).replace(/^'|'$/g, ''), ref = a1.slice(i + 1);
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('tab not found: ' + name);
  var m = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  var col = function (s) { var n = 0; for (var k = 0; k < s.length; k++) n = n * 26 + s.charCodeAt(k) - 64; return n; };
  var r1 = +m[2], c1 = col(m[1]), r2 = Math.min(+m[4], sh.getMaxRows()), c2 = Math.min(col(m[3]), sh.getMaxColumns());
  if (r2 < r1 || c2 < c1) return [];
  var v = sh.getRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1).getDisplayValues();
  var last = v.length;
  while (last > 0 && v[last - 1].every(function (c) { return c === ''; })) last--;
  return v.slice(0, last).map(function (row) {
    var n = row.length;
    while (n > 0 && row[n - 1] === '') n--;
    return row.slice(0, n);
  });
}

function getValues_(id, range) {
  if (id !== SRC_ID && id !== TRK_ID) throw new Error('sheet not allowed');
  return { range: range, values: readRange_(SpreadsheetApp.openById(id), range) };
}

function storedPin_() {
  var sh = SpreadsheetApp.openById(TRK_ID).getSheetByName('SETTINGS');
  var rows = sh.getRange('A2:B30').getValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === 'editor_pin_hash') return String(rows[i][1] || '');
  return '';
}

function checkPin_(pin, tool, range) {
  var stored = storedPin_();
  if (!stored) {
    // no PIN yet: the only write allowed is setting the first PIN
    if (tool === 'update_values' && /^SETTINGS!A12/i.test(range || '')) return;
    throw new Error('no editor PIN set yet: unlock editing in the website to set one');
  }
  if (String(pin || '') !== stored) throw new Error('wrong editor PIN');
}

function sheetAndRange_(a1) {
  var ss = SpreadsheetApp.openById(TRK_ID);
  var name = String(a1).split('!')[0].replace(/^'|'$/g, '');
  return { sh: ss.getSheetByName(name), name: name, ref: String(a1).split('!')[1] };
}

function update_(a1, values) {
  var t = sheetAndRange_(a1);
  var rng = t.sh.getRange(t.ref);
  rng.setNumberFormat('@');            // keep dates and PO numbers as plain text
  rng.setValues(values);
  return { updatedRange: a1, updatedRows: values.length };
}

function append_(a1, values) {
  var t = sheetAndRange_(a1);
  var row = t.sh.getLastRow() + 1;
  var rng = t.sh.getRange(row, 1, values.length, values[0].length);
  rng.setNumberFormat('@');
  rng.setValues(values);
  var colLetter = function (n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  var endRow = row + values.length - 1;
  return { updates: { updatedRange: t.name + '!A' + row + ':' + colLetter(values[0].length) + endRow } };
}
