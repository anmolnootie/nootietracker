/**
 * Automatic MASTER sheet sync.
 * Every few minutes this rebuilds "PO Control Tower - MASTER (all data)" from
 *   - the Warehouse Master (read only), and
 *   - the app's tracking sheet (team entries),
 * using the exact same logic as the website (Core.gs is the website's core.js).
 * Run setupMasterSync() once from the editor to install the timer.
 */
var MASTER_COLS_ = 42;
var MASTER_TEXT_ = [1,2,3,4,5,8,9,10,11,12,13,14,15,16,17,19,20,21,24,25,26,27,28,29,35,37,38,41,42];
var MASTER_NUM_ = [6,7,18,22,30,31,32,33,34,36,39,40];


// ---------- two-way sync: edits typed in MASTER or a platform tab flow back to the tracking sheet ----------
var EDIT_MAP_ = { 'Decision': 'dec', 'Decision Reason': 'reason', 'Handed to WH On': 'handed', 'Handed To (Person)': 'handedTo',
  'WH Ack On': 'ack', 'WH Ack By': 'ackBy', 'Owner': 'owner', 'E-way Bill No': 'ewb', 'Remarks': 'rem', 'Appointment Date': 'mAppt' };
var EDIT_KEYS_ = ['dec', 'reason', 'handed', 'handedTo', 'ack', 'ackBy', 'owner', 'ewb', 'rem', 'mAppt'];
var EDIT_DATES_ = { handed: 1, ack: 1, mAppt: 1 };
var EDIT_MASTER_IDX_ = { dec: 8, reason: 9, handed: 10, handedTo: 11, ack: 12, ackBy: 13, owner: 14, ewb: 15, rem: 16, mAppt: 41 };   // 0-based in a MASTER row
var TRK_COLS_ = ['po','dec','reason','printout','handed','ack','ackBy','owner','rem','updated','by','plat','date','exp','loc','qty','amt','created','handedTo','ewb','mInv','mInvVal','mDisp','mStatus','mPartner','mAwb','mDeliv','mGrnNo','mGrnDate','mGrnAmt','mAppt'];
var PLAT_TABS_ = ['Blinkit', 'Swiggy Instamart', 'Zepto', 'BigBasket', 'Flipkart', 'Other platforms'];
var PLAT_ORDER_ = [1,2,3,4,42,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41];   // MASTER column shown in each platform-tab column
var MAX_EDITS_AT_ONCE_ = 300;

function platTab_(p) { return PLAT_TABS_.slice(0, 5).indexOf(p) >= 0 ? p : 'Other platforms'; }
function permute_(row) { return PLAT_ORDER_.map(function (c) { return row[c - 1]; }); }
function permIdx_(cols) { var out = []; PLAT_ORDER_.forEach(function (c, i) { if (cols.indexOf(c) >= 0) out.push(i + 1); }); return out; }

function snapshotSheet_(ss) {
  var sh = ss.getSheetByName('_SNAPSHOT');
  if (!sh) { sh = ss.insertSheet('_SNAPSHOT'); try { sh.hideSheet(); } catch (e) {} }
  return sh;
}
function writeSnapshot_(ss, rows, stamp) {
  var sh = snapshotSheet_(ss);
  sh.clearContents();
  var out = [[stamp].concat(EDIT_KEYS_.map(function () { return ''; })), ['PO'].concat(EDIT_KEYS_)];
  rows.forEach(function (r) { out.push([r[0]].concat(EDIT_KEYS_.map(function (k) { return String(r[EDIT_MASTER_IDX_[k]] == null ? '' : r[EDIT_MASTER_IDX_[k]]); }))); });
  sh.getRange(1, 1, out.length, EDIT_KEYS_.length + 1).setNumberFormat('@').setValues(out);
}

// Reads what people typed in MASTER and the platform tabs, compares with what the last sync wrote, and
// writes only the real differences into the tracking sheet. Every change is logged in ACTIVITY with the old value.
function mergeSheetEdits_(force) {
  var ss = SpreadsheetApp.openById(MASTER_ID), trk = SpreadsheetApp.openById(TRK_ID);
  var snapSh = ss.getSheetByName('_SNAPSHOT');
  if (!snapSh || snapSh.getLastRow() < 3) return { applied: 0, note: 'first run' };
  var sv = snapSh.getDataRange().getDisplayValues();
  var snapStamp = sv[0][0], keys = sv[1].slice(1), snap = {};
  sv.slice(2).forEach(function (r) { snap[r[0]] = r.slice(1); });
  var edits = {}, plats = {};
  ['MASTER'].concat(PLAT_TABS_).forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh) return;
    var last = sh.getLastRow(), lc = sh.getLastColumn(); if (last < 3 || lc < 1) return;
    var hdr = sh.getRange(2, 1, 1, lc).getDisplayValues()[0], colOf = {}, poCol = hdr.indexOf('PO Number'), pCol = hdr.indexOf('Platform');
    if (poCol < 0) return;
    hdr.forEach(function (h, i) { if (EDIT_MAP_[h]) colOf[EDIT_MAP_[h]] = i; });
    sh.getRange(3, 1, last - 2, lc).getDisplayValues().forEach(function (r) {
      var po = String(r[poCol] || '').trim(), sn = snap[po]; if (!po || !sn) return;
      keys.forEach(function (k, j) {
        if (colOf[k] == null) return;
        var nv = String(r[colOf[k]] == null ? '' : r[colOf[k]]).trim();
        if (nv !== String(sn[j]).trim()) { (edits[po] = edits[po] || {})[k] = { nv: nv, old: String(sn[j]) }; plats[po] = pCol >= 0 ? r[pCol] : ''; }
      });
    });
  });
  var pos = Object.keys(edits);
  if (!pos.length) return { applied: 0 };
  if (pos.length > MAX_EDITS_AT_ONCE_ && !force) return { paused: pos.length };
  var tsh = trk.getSheetByName('TRACKING'), act = trk.getSheetByName('ACTIVITY');
  var rows = readRange_(trk, 'TRACKING!A2:AE5000'), rowOf = {};
  rows.forEach(function (r, i) { var p = normPo(r[0]); if (p) rowOf[p] = i; });
  var now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm');
  var logs = [], applied = 0, skipped = 0, rejected = 0, nextRow = rows.length + 2;
  pos.forEach(function (po) {
    var cur = rowOf[po] != null ? rows[rowOf[po]] : null, arr = [];
    for (var i = 0; i < TRK_COLS_.length; i++) arr.push(cur && cur[i] != null ? String(cur[i]) : '');
    if (cur && arr[9] && arr[9] > snapStamp) { skipped++; logs.push([now, po, 'Sheet edit skipped', 'the app changed this PO after the last sync, so the app value was kept', 'MASTER sheet', plats[po]]); return; }
    var changed = [];
    EDIT_KEYS_.forEach(function (k) {
      var e = edits[po][k]; if (!e) return;
      var idx = TRK_COLS_.indexOf(k), nv = e.nv;
      if (k === 'dec' && DECISIONS.indexOf(nv) < 0) { rejected++; logs.push([now, po, 'Sheet edit rejected', 'Decision must be one of ' + DECISIONS.join(', ') + ' (typed: ' + nv + ')', 'MASTER sheet', plats[po]]); return; }
      if (EDIT_DATES_[k] && nv) { var iso = pdate(nv); if (!iso) { rejected++; logs.push([now, po, 'Sheet edit rejected', k + ': not a date (' + nv + ')', 'MASTER sheet', plats[po]]); return; } nv = iso; }
      if (k === 'rem') {
        var trkOld = arr[idx], shown = e.old, wh = trkOld ? (shown.slice(-(trkOld.length + 3)) === ' | ' + trkOld ? shown.slice(0, -(trkOld.length + 3)) : (shown === trkOld ? '' : shown)) : shown;
        if (wh && nv.indexOf(wh) === 0) nv = nv.slice(wh.length).replace(/^ \| /, '');
      }
      if (arr[idx] === nv) return;
      changed.push(k + ': ' + (arr[idx] || '(blank)') + ' -> ' + (nv || '(blank)'));
      arr[idx] = nv;
    });
    if (!changed.length) return;
    arr[0] = po; arr[9] = now; arr[10] = 'MASTER sheet'; if (!cur) arr[11] = plats[po] || '';
    var r0 = cur ? rowOf[po] + 2 : nextRow++;
    tsh.getRange(r0, 1, 1, arr.length).setNumberFormat('@').setValues([arr]);
    applied++;
    logs.push([now, po, 'Sheet edit', changed.join('; '), 'MASTER sheet', plats[po]]);
  });
  if (logs.length && act) {
    var ar = Math.max(act.getLastRow() + 1, 2);
    act.getRange(ar, 1, logs.length, 6).setNumberFormat('@').setValues(logs);
  }
  return { applied: applied, skipped: skipped, rejected: rejected };
}

function forceSyncEdits() { return syncMaster(true); }

function setupMasterSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncMaster') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncMaster').timeBased().everyMinutes(10).create();
  return syncMaster();
}

function jn_(ls, k) {
  var seen = {};
  ls.forEach(function (l) { if (l[k]) seen[String(l[k])] = 1; });
  return Object.keys(seen).sort().join(', ');
}
function sm_(ls, k) {
  var s = 0;
  ls.forEach(function (l) { s += (l[k] || 0); });
  return s || '';
}
function nz_(v) { return (v === null || v === undefined) ? '' : v; }

function buildMaster_(D, I, stages, stamp) {
  var st = {};
  stages.forEach(function (s) { st[s.n] = s.short; });
  var by = {};
  I.forEach(function (l) { (by[l.po] = by[l.po] || []).push(l); });
  var rows = D.map(function (d) {
    var ls = by[d.po] || [];
    var ds = ls.map(function (l) { return l.disp; }).filter(Boolean).sort();
    var dl = ls.map(function (l) { return l.deliv; }).filter(Boolean).sort();
    var r = [d.po, d.plat, d.orderDate, d.exp, d.loc, d.qty, d.amt, d.src,
      d.dec, d.reason, d.handed, d.handedTo, d.ack, d.ackBy, d.owner, d.ewb, d.rem,
      ls.length || '', jn_(ls, 'inv'), ds[0], ds[ds.length - 1], sm_(ls, 'val'),
      d.fill !== null && d.fill !== undefined ? Math.round(d.fill * 1e4) / 1e4 : '',
      jn_(ls, 'awb'), jn_(ls, 'partner'), jn_(ls, 'status'), dl[dl.length - 1],
      jn_(ls, 'grn'), jn_(ls, 'gno'), sm_(ls, 'gamt'), sm_(ls, 'sq'), sm_(ls, 'sv'), sm_(ls, 'dv'), sm_(ls, 'ev'),
      jn_(ls, 'cn'), sm_(ls, 'cnv'), d.inv.rto ? 'Yes' : '',
      st[d.stage], d.age, d.dte, stamp, d.appt];
    return r.map(nz_);
  });
  var inv = I.slice().sort(function (a, b) { var x = a.disp || '', y = b.disp || ''; return x < y ? -1 : x > y ? 1 : 0; }).map(function (l) {
    return [l.disp, l.po, l.inv, l.chan, l.loc, l.val, l.awb, l.partner, l.status, l.deliv, l.appt, l.grn, l.gno, l.gdate, l.gamt,
      l.sq, l.sv, l.dq, l.dv, l.eq, l.ev, l.cn, l.cnv].map(nz_);
  });
  return { master: rows, invoices: inv };
}

function loadAll_() {
  var src = SpreadsheetApp.openById(SRC_ID), trk = SpreadsheetApp.openById(TRK_ID);
  var asof = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  var obR = readRange_(src, "'ORDER BOOK'!A4:N5500"), dgR = readRange_(src, "'DISPATCH + GRN'!A4:Y5000"), grnR = readRange_(src, 'GRN!A2:Q5000');
  var tabs = parseTabs({
    blinkit: readRange_(src, 'Blinkit!A2:H400'), flipkart: readRange_(src, "'Flipkart '!A2:G120"),
    zepto: readRange_(src, 'Zepto!A2:G400'), swiggy: readRange_(src, 'Swiggy!A2:E200')
  });
  var ob = parseOrderBook(obR, asof), gm = parseGrnTab(grnR), gi = parseGrnInfo(grnR);
  var I = parseDispatch(dgR, gm, gi), P = buildPOs(ob, I, tabs);
  if (P.length < 200) throw new Error('Warehouse Master looked too small (' + P.length + ' POs): not syncing');
  var TC = ['po','dec','reason','printout','handed','ack','ackBy','owner','rem','updated','by','plat','date','exp','loc','qty','amt','created','handedTo','ewb','mInv','mInvVal','mDisp','mStatus','mPartner','mAwb','mDeliv','mGrnNo','mGrnDate','mGrnAmt','mAppt'];
  var trkMap = {};
  readRange_(trk, 'TRACKING!A2:AE5000').forEach(function (r) {
    var po = normPo(r[0]); if (!po) return;
    var o = { po: po };
    TC.forEach(function (k, j) { o[k] = (r[j] == null ? '' : String(r[j])); });
    ['printout', 'handed', 'ack', 'date', 'exp', 'mDisp', 'mDeliv', 'mGrnDate', 'mAppt'].forEach(function (k) { o[k] = pdate(o[k]) || ''; });
    o.qty = num(o.qty); o.amt = num(o.amt); o.po = po;
    trkMap[po] = o;
  });
  var cfg = Object.assign({}, DEFAULT_CFG);
  readRange_(trk, 'SETTINGS!A2:B20').forEach(function (r) { var v = num(r[1]); if (r[0] && v != null) cfg[String(r[0]).trim()] = v; });
  var have = {}; P.forEach(function (p) { have[p.po] = 1; });
  Object.keys(trkMap).forEach(function (k) {
    var t = trkMap[k];
    if (t.created === 'Y' && !have[t.po]) { have[t.po] = 1; P.push({ po: t.po, plat: t.plat || 'Other', date: t.date || null, exp: t.exp || null, loc: t.loc || '', qty: t.qty, amt: t.amt, dec: 'Pending', reason: '', rem: '', src: 'Created in app' }); }
  });
  var D = deriveAll(P, I, trkMap, [], cfg, asof);
  return { D: D, I: I.concat(manualLines(I, trkMap)), asof: asof };
}

function writeBlock_(sh, startRow, rows, ncols, textCols, numCols) {
  var last = sh.getMaxRows();
  var need = startRow + Math.max(rows.length, 1) - 1;
  if (need > last) sh.insertRowsAfter(last, need - last);
  var old = Math.max(sh.getLastRow() - startRow + 1, 0);
  if (old > 0) sh.getRange(startRow, 1, old, ncols).clearContent();
  if (!rows.length) return;
  var n = rows.length;
  textCols.forEach(function (c) { sh.getRange(startRow, c, n, 1).setNumberFormat('@'); });
  numCols.forEach(function (c) { sh.getRange(startRow, c, n, 1).setNumberFormat('#,##0'); });
  for (var i = 0; i < n; i += 1000) {
    var chunk = rows.slice(i, i + 1000);
    sh.getRange(startRow + i, 1, chunk.length, ncols).setValues(chunk);
  }
}

function syncMaster(force) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { ok: false, skipped: 'a sync is already running' };
  try {
    var ss = SpreadsheetApp.openById(MASTER_ID);
    var merged = mergeSheetEdits_(force === true);
    if (merged.paused) {
      var rp = ss.getSheetByName('READ ME');
      if (rp) rp.getRange('A4').setValue('SYNC PAUSED: ' + merged.paused + ' POs were edited at once. Nothing was lost. Check the edits, then run forceSyncEdits in Apps Script to accept them.');
      return { ok: false, paused: merged.paused };
    }
    var a = loadAll_();
    var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm');
    var out = buildMaster_(a.D, a.I, STAGES, stamp);
    var m = ss.getSheetByName('MASTER');
    writeBlock_(m, 3, out.master, MASTER_COLS_, MASTER_TEXT_, MASTER_NUM_);
    m.getRange(3, 23, out.master.length, 1).setNumberFormat('0.0%');
    // platform tabs: real values (not formulas) so they can be edited; same columns as MASTER with Appointment Date after PO Expiry
    var hdr = m.getRange(2, 1, 1, MASTER_COLS_).getDisplayValues()[0], byTab = {};
    PLAT_TABS_.forEach(function (t) { byTab[t] = []; });
    out.master.forEach(function (r) { byTab[platTab_(r[1])].push(permute_(r)); });
    var pText = permIdx_(MASTER_TEXT_), pNum = permIdx_(MASTER_NUM_), pPct = permIdx_([23]);
    PLAT_TABS_.forEach(function (t) {
      var sh = ss.getSheetByName(t); if (!sh) return;
      sh.getRange(1, 1).setValue(t + '  |  ' + byTab[t].length + ' POs  |  filtered view of MASTER. Edit the yellow columns: changes sync both ways with the website');
      sh.getRange(2, 1, 1, MASTER_COLS_).setValues([permute_(hdr)]);
      writeBlock_(sh, 3, byTab[t], MASTER_COLS_, pText, pNum);
      if (byTab[t].length) sh.getRange(3, pPct[0], byTab[t].length, 1).setNumberFormat('0.0%');
    });
    writeBlock_(ss.getSheetByName('INVOICES'), 2, out.invoices, 23, [1,2,3,4,5,7,8,9,10,11,12,13,14,22], [6,15,16,17,18,19,20,21,23]);
    writeSnapshot_(ss, out.master, stamp);
    var rm = ss.getSheetByName('READ ME');
    if (rm) rm.getRange('A4').setValue('Auto-refreshed every 10 minutes. Last refresh: ' + stamp + ' IST' + (merged.applied ? '. Sheet edits applied: ' + merged.applied : ''));
    return { ok: true, pos: out.master.length, invoices: out.invoices.length, at: stamp, edits: merged };
  } finally { lock.releaseLock(); }
}
