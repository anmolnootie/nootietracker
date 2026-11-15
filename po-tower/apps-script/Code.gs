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

function getValues_(id, range) {
  if (id !== SRC_ID && id !== TRK_ID) throw new Error('sheet not allowed');
  var v = SpreadsheetApp.openById(id).getRange(range).getDisplayValues();
  // drop trailing empty rows and cells, like the Sheets API does
  var last = v.length;
  while (last > 0 && v[last - 1].every(function (c) { return c === ''; })) last--;
  v = v.slice(0, last).map(function (row) {
    var n = row.length;
    while (n > 0 && row[n - 1] === '') n--;
    return row.slice(0, n);
  });
  return { range: range, values: v };
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
