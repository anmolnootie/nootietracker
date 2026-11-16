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
    if (tool === 'login') { var who = auth_(r.user, r.pin); return out_(who ? { ok: true, name: who.name, role: who.role } : { ok: false }); }
    if (tool === 'verify_pin') return out_({ ok: !!auth_(r.user, r.pin) });
    if (tool === 'user_list') return out_({ users: listUsers_() });
    if (tool === 'user_set') return out_(setUser_(r.user, r.pin, a));
    var id = a.spreadsheetId || a.spreadsheet_id;
    if (tool === 'get_values') return out_(getValues_(id, a.range));
    if (tool === 'update_values' || tool === 'append_values') {
      if (id !== TRK_ID) return out_({ error: 'writes are only allowed on the tracking sheet' });
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        if (/^'?USERS'?!/i.test(String(a.range || ''))) throw new Error('people are managed from Settings, not by editing the sheet');
        checkPin_(r.user, r.pin, tool, a.range);
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
  if (/^'?USERS'?!/i.test(String(range || ''))) throw new Error('use user_list');
  var vals = readRange_(SpreadsheetApp.openById(id), range);
  // never hand the stored PIN hash to a browser: show only that one is set
  if (id === TRK_ID) vals = vals.map(function (row) {
    return (String(row[0] || '').trim() === 'editor_pin_hash' && row[1]) ? [row[0], '(set)'] : row;
  });
  return { range: range, values: vals };
}

function storedPin_() {
  var sh = SpreadsheetApp.openById(TRK_ID).getSheetByName('SETTINGS');
  var rows = sh.getRange('A2:B30').getValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === 'editor_pin_hash') return String(rows[i][1] || '');
  return '';
}

function checkPin_(user, pin, tool, range) {
  var stored = storedPin_();
  var isPinWrite = tool === 'update_values' && /^SETTINGS!A12/i.test(range || '');
  if (!stored && listUsers_().length === 0) {
    // nobody has a PIN yet: the only write allowed is setting the first PIN
    if (isPinWrite) return;
    throw new Error('no editor PIN set yet: unlock editing in the website to set one');
  }
  var who = auth_(user, pin);
  if (!who) throw new Error('wrong name or PIN');
  if (/^'?SETTINGS'?!/i.test(range || '') && who.role !== 'admin') throw new Error('only an admin can change settings');
}

// Same hash the website computes: SHA-256 of 'potower|' + PIN. The browser sends the PIN, never the hash.
function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function usersSheet_() { return SpreadsheetApp.openById(TRK_ID).getSheetByName('USERS'); }
function readUsers_() {
  var sh = usersSheet_(); if (!sh) return [];
  var v = sh.getRange('A2:E200').getValues(), out = [];
  for (var i = 0; i < v.length; i++) {
    var n = String(v[i][0] || '').trim();
    if (n) out.push({ row: i + 2, name: n, hash: String(v[i][1] || ''), role: String(v[i][2] || 'editor').trim().toLowerCase() || 'editor', active: String(v[i][3] || 'Yes').trim().toLowerCase() !== 'no' });
  }
  return out;
}
function listUsers_() {
  return readUsers_().map(function (u) { return { name: u.name, role: u.role, active: u.active }; });
}

// Returns { name, role } when the name and PIN are right, else null (and slows the guess down).
// The old shared editor PIN still works and counts as admin, so nothing locks you out.
function auth_(user, pin) {
  var h = sha_('potower|' + String(pin || ''));
  var want = String(user || '').trim().toLowerCase();
  var us = readUsers_();
  for (var i = 0; i < us.length; i++) {
    if (us[i].name.toLowerCase() === want && us[i].active && us[i].hash && us[i].hash === h) return { name: us[i].name, role: us[i].role };
  }
  var stored = storedPin_();
  if (stored && stored === h) return { name: String(user || '').trim() || 'Admin', role: 'admin' };
  Utilities.sleep(1500);
  return null;
}

// Admin only: add a person, change their PIN or role, or switch them off. Nothing is ever deleted.
function setUser_(user, pin, a) {
  var who = auth_(user, pin);
  if (!who || who.role !== 'admin') throw new Error('only an admin can manage people');
  var name = String(a.name || '').trim();
  if (!name || name.length > 40) throw new Error('enter a name (up to 40 characters)');
  var role = String(a.role || 'editor').toLowerCase();
  if (role !== 'admin' && role !== 'editor') throw new Error('role must be admin or editor');
  var newPin = a.pin == null ? '' : String(a.pin);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = usersSheet_(); if (!sh) throw new Error('the USERS tab is missing in the tracking sheet');
    var us = readUsers_(), hit = null;
    for (var i = 0; i < us.length; i++) if (us[i].name.toLowerCase() === name.toLowerCase()) hit = us[i];
    var active = a.active === false || String(a.active).toLowerCase() === 'no' ? 'No' : 'Yes';
    if (hit) {
      if (hit.role === 'admin' && hit.active && (active === 'No' || role !== 'admin')) {
        var otherAdmins = us.filter(function (u) { return u.active && u.role === 'admin' && u.row !== hit.row; }).length;
        if (!otherAdmins && !storedPin_()) throw new Error('keep at least one admin');
      }
      var cur = sh.getRange(hit.row, 1, 1, 5).getValues()[0];
      sh.getRange(hit.row, 1, 1, 5).setNumberFormat('@').setValues([[hit.name, newPin ? sha_('potower|' + newPin) : cur[1], role, active, cur[4]]]);
    } else {
      if (newPin.length < 4) throw new Error('the PIN needs at least 4 characters');
      var row = Math.max(2, sh.getLastRow() + 1);
      sh.getRange(row, 1, 1, 5).setNumberFormat('@').setValues([[name, sha_('potower|' + newPin), role, active, Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm')]]);
    }
    return { ok: true, users: listUsers_() };
  } finally { lock.releaseLock(); }
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
