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

function syncMaster() {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { ok: false, skipped: 'a sync is already running' };
  try {
    var a = loadAll_();
    var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm');
    var out = buildMaster_(a.D, a.I, STAGES, stamp);
    var ss = SpreadsheetApp.openById(MASTER_ID);
    writeBlock_(ss.getSheetByName('MASTER'), 3, out.master, MASTER_COLS_, MASTER_TEXT_, MASTER_NUM_);
    var m = ss.getSheetByName('MASTER');
    m.getRange(3, 23, out.master.length, 1).setNumberFormat('0.0%');
    writeBlock_(ss.getSheetByName('INVOICES'), 2, out.invoices, 23, [1,2,3,4,5,7,8,9,10,11,12,13,14,22], [6,15,16,17,18,19,20,21,23]);
    var rm = ss.getSheetByName('READ ME');
    if (rm) rm.getRange('A4').setValue('Auto-refreshed every 10 minutes. Last refresh: ' + stamp + ' IST');
    return { ok: true, pos: out.master.length, invoices: out.invoices.length, at: stamp };
  } finally { lock.releaseLock(); }
}
