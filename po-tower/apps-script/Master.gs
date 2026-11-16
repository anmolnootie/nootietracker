/**
 * PO Control Tower: the MASTER sheet is the only record.
 * The website and the team both read and write this sheet directly. This file keeps its calculated columns
 * (Stage, Age, invoice totals, GRN and claim columns) up to date every 10 minutes using the same logic as the
 * website (Core.gs is the website's core.js). Nothing is read from the Warehouse Master any more.
 * Run setupOneSheet() once from the editor: it moves the old Tracking sheet's data in and installs the timer.
 */
var OLD_TRACKING_ID_ = '1XkWpydTQPviypiN2-xmhfYzPyc_hTRHRFLKQDVLMT98';   // used once, by setupOneSheet, then retired
var MASTER_COLS_ = 53;
var MASTER_TEXT_ = [1,2,3,4,5,8,9,10,11,12,13,14,15,16,17,19,20,21,24,25,26,27,28,29,35,37,38,41,42,45,46,47,48];
var MASTER_NUM_ = [6,7,18,22,30,31,32,33,34,36,39,40,43,44,49,50,51,52,53];
var MASTER_HEADERS_ = ['PO Number','Platform','PO Date','PO Expiry','Facility','PO Qty','PO Value','Source','Decision','Decision Reason','Accepted On','Handed To (Person)','WH Ack On','WH Ack By','Owner','E-way Bill No','Remarks','Invoices','Invoice Nos','First Dispatch','Last Dispatch','Invoiced Value','Fill %','AWB / Vehicle','Delivery Partner','Dispatch Status','Delivered On','GRN Status','GRN Nos','GRN Amount','Short Qty','Short Value','Damaged Amount (Inv - GRN)','Excess Value','Credit Note','CN Value','RTO','Stage','Age (days)','Days to Expiry','Last Refreshed','Appointment Date','Damage Qty','Excess Qty','Damage Reason','Shortage Reason','GRN Remarks','Warehouse Comment','Open Issues','Claim Left (Inv - GRN - RTO)','Claim Raised','Claim Settled','RTO Goods Received'];
var INV_HEADERS_ = ['Dispatch Date','PO Number','Invoice No','Platform','Facility','Invoice Value','AWB / Vehicle','Delivery Partner','Dispatch Status','Delivered On','Appointment Date','GRN Status','GRN No','GRN Date','GRN Amount','Short Qty','Short Value','Damage Qty','Damaged Amount (Inv - GRN)','Excess Qty','Excess Value','Credit Note','CN Value','GRN Remarks','Warehouse Comment','RTO Goods Received','ASN No','ASN Date'];


// Columns people type in (yellow header). Everything else is calculated and rewritten on each refresh.
var EDIT_MAP_ = { 'Platform': 1, 'PO Date': 1, 'PO Expiry': 1, 'Facility': 1, 'PO Qty': 1, 'PO Value': 1, 'Decision': 1, 'Decision Reason': 1, 'Accepted On': 1, 'Owner': 1, 'E-way Bill No': 1, 'Remarks': 1, 'Appointment Date': 1, 'Damage Reason': 1, 'Shortage Reason': 1 };
var CALC_BLOCKS_ = [[18, 41], [43, 44], [47, 53]];   // 1-based MASTER columns written by the refresh
var DATE_COLS_ = [3, 4, 11, 13, 42];                 // MASTER columns that hold dates as text
var INV_DATE_COLS_ = [1, 10, 11, 14];
var PLAT_TABS_ = ['Blinkit', 'Swiggy Instamart', 'Zepto', 'BigBasket', 'Flipkart', 'Other platforms'];
var PLAT_ORDER_ = [1,2,3,4,42,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,43,44,45,46,47,48,49,50,51,52,53];   // MASTER column shown in each platform-tab column

function platTab_(p) { return PLAT_TABS_.slice(0, 5).indexOf(p) >= 0 ? p : 'Other platforms'; }
function permute_(row) { return PLAT_ORDER_.map(function (c) { return row[c - 1]; }); }
function permIdx_(cols) { var out = []; PLAT_ORDER_.forEach(function (c, i) { if (cols.indexOf(c) >= 0) out.push(i + 1); }); return out; }

function ensureCols_(sh, n) { var c = sh.getMaxColumns(); if (c < n) sh.insertColumnsAfter(c, n - c); }

var TAB_ORDER_ = ['MASTER', 'BY PLATFORM', 'Blinkit', 'Swiggy Instamart', 'Zepto', 'BigBasket', 'Flipkart', 'Other platforms', 'INVOICES', 'CLAIMS', 'CLAIM DATA', 'ISSUES', 'ACTIVITY', 'SETTINGS', 'READ ME', 'USERS'];
var TAB_COLORS_ = { 'MASTER': '#1f2937', 'BY PLATFORM': '#475569', 'Blinkit': '#b45309', 'Swiggy Instamart': '#c2410c', 'Zepto': '#6d28d9', 'BigBasket': '#15803d', 'Flipkart': '#1d4ed8', 'Other platforms': '#64748b', 'INVOICES': '#0f766e', 'CLAIMS': '#b91c1c', 'CLAIM DATA': '#dc2626', 'ISSUES': '#a16207', 'ACTIVITY': '#4b5563', 'SETTINGS': '#334155', 'READ ME': '#94a3b8' };
var HIDE_COLS_ = [8, 12, 13, 14, 41];   // Source, the old handover columns, Last Refreshed: kept for history, not shown

// readable colours: dark header with white text, soft yellow with dark text for the columns people type in
function styleTab_(sh, hdrRow, hdr, hideMasterCols, editable) {
  var n = hdr.length;
  if (hdrRow === 2) {
    sh.getRange(1, 1, 1, n).setBackground('#e5e7eb').setFontColor('#111827').setFontWeight('bold');
  }
  sh.getRange(hdrRow, 1, 1, n).setBackground('#1f2937').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
  hdr.forEach(function (h, i) { if (editable && EDIT_MAP_[h]) sh.getRange(hdrRow, i + 1).setBackground('#fde68a').setFontColor('#111827'); });
  sh.setFrozenRows(hdrRow);
  if (sh.getLastRow() > hdrRow) sh.getRange(hdrRow + 1, 1, sh.getLastRow() - hdrRow, n).setBackground(null).setFontColor('#111827');
  hideMasterCols.forEach(function (c) { try { sh.hideColumns(c); } catch (e) {} });
}

function organiseTabs_(ss) {
  var first = ss.getSheetByName('MASTER');
  if (first) ss.setActiveSheet(first);
  TAB_ORDER_.forEach(function (name, i) {
    var sh = ss.getSheetByName(name); if (!sh) return;
    ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1);
    if (TAB_COLORS_[name]) sh.setTabColor(TAB_COLORS_[name]);
  });
  ['USERS', '_SYNC'].forEach(function (name) { var sh = ss.getSheetByName(name); if (sh && !sh.isSheetHidden()) { try { sh.hideSheet(); } catch (e) {} } });
  if (first) ss.setActiveSheet(first);
}


var CLAIM_HEADERS_ = ['PO Number', 'Platform', 'Invoice No', 'Claim Type', 'Delivered / Dispatched', 'Invoice Value', 'GRN Amount', 'Missing (Inv - GRN)', 'RTO Received', 'Claim Left', 'Claim Status', 'Claim Raised', 'Settled', 'Still To Raise', 'Waiting For Payout', 'Reference', 'Raised On', 'Settled On', 'Remarks'];

// A read-only list of every claimable invoice with what has been raised and settled. Claims are entered in the app.
function claimsTab_(ss, a) {
  var sh = ss.getSheetByName('CLAIMS') || ss.insertSheet('CLAIMS');
  var platOf = {}; a.D.forEach(function (d) { platOf[d.po] = d.plat; });
  var rows = [];
  a.I.forEach(function (l) {
    var rec = a.claims[claimKey_(l.po, l.inv)] || {}, c = claimOf(l, rec); if (!c) return;
    var m = claimMath(c.amt, rec);
    rows.push([l.po, platOf[l.po] || l.chan || '', l.inv, c.type, l.deliv || l.disp || '', l.val, l.gamt || '', c.gap, c.back || '', c.amt, rec.status || 'Not raised', m.claimed || '', m.settled || '', m.toRaise || '', m.waiting || '',
      rec.ref || '', rec.raisedOn || '', rec.settledOn || '', rec.note || '']);
  });
  rows.sort(function (x, y) { return y[9] - x[9]; });
  ensureCols_(sh, CLAIM_HEADERS_.length);
  sh.getRange(1, 1, 1, CLAIM_HEADERS_.length).setValues([CLAIM_HEADERS_]);
  writeBlock_(sh, 2, rows, CLAIM_HEADERS_.length, [1, 2, 3, 4, 5, 11, 16, 17, 18, 19], [6, 7, 8, 9, 10, 12, 13, 14, 15]);
  styleTab_(sh, 1, CLAIM_HEADERS_, []);
  return rows.length;
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

function claimKey_(po, inv) { return po + '|' + String(inv || '').trim().toUpperCase(); }

function buildMaster_(D, I, stages, stamp, claims) {
  var st = {};
  stages.forEach(function (s) { st[s.n] = s.short; });
  var by = {};
  I.forEach(function (l) { (by[l.po] = by[l.po] || []).push(l); });
  var rows = D.map(function (d) {
    var ls = by[d.po] || [];
    var cl = { amt: 0, claimed: 0, settled: 0, back: 0 };
    ls.forEach(function (l) { var rec = claims[claimKey_(d.po, l.inv)], c = claimOf(l, rec); if (!c) return; var m = claimMath(c.amt, rec); cl.amt += c.amt; cl.claimed += m.claimed; cl.settled += m.settled; cl.back += c.back; });
    var ds = ls.map(function (l) { return l.disp; }).filter(Boolean).sort();
    var dl = ls.map(function (l) { return l.deliv; }).filter(Boolean).sort();
    var r = [d.po, d.plat, d.orderDate, d.exp, d.loc, d.qty, d.amt, d.src,
      d.dec, d.reason, d.handed, d.handedTo, d.ack, d.ackBy, d.owner, d.ewb, d.rem,
      ls.length || '', jn_(ls, 'inv'), ds[0], ds[ds.length - 1], sm_(ls, 'val'),
      d.fill !== null && d.fill !== undefined ? Math.round(d.fill * 1e4) / 1e4 : '',
      jn_(ls, 'awb'), jn_(ls, 'partner'), jn_(ls, 'status'), dl[dl.length - 1],
      jn_(ls, 'grn'), jn_(ls, 'gno'), sm_(ls, 'gamt'), sm_(ls, 'sq'), sm_(ls, 'sv'), sm_(ls, 'dv'), sm_(ls, 'ev'),
      jn_(ls, 'cn'), sm_(ls, 'cnv'), d.inv.rto ? 'Yes' : '',
      st[d.stage], d.age, d.dte, stamp, d.appt,
      sm_(ls, 'dq'), sm_(ls, 'eq'), d.dmgReason, d.shortReason, jn_(ls, 'gnote'), jn_(ls, 'comment'), d.openIssues || '',
      cl.amt || '', cl.claimed || '', cl.settled || '', cl.back || ''];
    return r.map(nz_);
  });
  var inv = I.slice().sort(function (a, b) { var x = a.disp || '', y = b.disp || ''; return x < y ? -1 : x > y ? 1 : 0; }).map(function (l) {
    return [l.disp, l.po, l.inv, l.chan, l.loc, l.val, l.awb, l.partner, l.status, l.deliv, l.appt, l.grn, l.gno, l.gdate, l.gamt,
      l.sq, l.sv, l.dq, l.dv, l.eq, l.ev, l.cn, l.cnv, l.gnote, l.comment].map(nz_);
  });
  return { master: rows, invoices: inv };
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


function readSettings_(ss) {
  var cfg = Object.assign({}, DEFAULT_CFG);
  readRange_(ss, 'SETTINGS!A2:B20').forEach(function (r) { var v = num(r[1]); if (r[0] && v != null) cfg[String(r[0]).trim()] = v; });
  return cfg;
}

// Reads everything from the MASTER sheet itself.
function loadAll_(ss) {
  var asof = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  var raw = readRange_(ss, 'MASTER!A3:BA14000');
  var pm = parseMasterRows(raw), pv = parseInvoiceRows(readRange_(ss, 'INVOICES!A2:AB14000'));
  var cfg = readSettings_(ss);
  var issues = [];
  try { readRange_(ss, 'ISSUES!A2:O3000').forEach(function (r) { if (r[0]) issues.push({ id: String(r[0]), po: normPo(r[2]), status: String(r[9] == null ? '' : r[9]).trim() }); }); } catch (e) { /* no ISSUES tab yet */ }
  var claims = {};
  try {
    readRange_(ss, "'CLAIM DATA'!A2:N14000").forEach(function (r) {
      if (!r[0] || !r[1]) return;
      var po = normPo(r[0]);
      claims[claimKey_(po, r[1])] = { po: po, inv: String(r[1]), status: String(r[4] || 'Not raised'), claimed: num(r[5]), raisedOn: r[6], ref: r[7], settled: num(r[8]), settledOn: r[9], note: r[10], rtoValue: (r[13] === '' || r[13] == null) ? null : num(r[13]) };
    });
  } catch (e) { /* no CLAIM DATA tab yet */ }
  var D = deriveAll(pm.P, pv.I, pm.T, issues, cfg, asof);
  return { D: D, I: pv.I, asof: asof, claims: claims, raw: raw };
}

// Dates typed or pasted into a date column can turn into real dates; turn them back into plain yyyy-mm-dd text so the app reads them.
function normDates_(sh, firstRow, n, cols) {
  if (n < 1) return;
  cols.forEach(function (c) {
    var rg = sh.getRange(firstRow, c, n, 1), vs = rg.getValues(), ch = false;
    vs.forEach(function (r) { if (r[0] instanceof Date) { r[0] = Utilities.formatDate(r[0], 'Asia/Kolkata', 'yyyy-MM-dd'); ch = true; } });
    if (ch) rg.setNumberFormat('@').setValues(vs);
  });
}

// ---------- two-way sync ----------
// Every tab can be typed in. Nothing depends on catching a keystroke: each pass compares what is on a tab now with what the
// last pass wrote there (kept on the hidden _SYNC tab). A cell that differs was typed by a person, so it is carried to where
// the data lives (MASTER for PO details, INVOICES for dispatch and GRN) before anything is redrawn.
var SYNC_TAB_ = '_SYNC';
var PENDING_ = '§typed';
var INV_NUM_ = [15, 16, 17, 18, 20, 21, 23, 26];
var MAX_CLEARS_ = 25;   // more blanked cells than this on one tab in one pass is treated as an accident and put back

function pad_(r, n) { r = r.slice(0, n); while (r.length < n) r.push(''); return r; }
function inputCols_(name) {
  var out = [];
  for (var mc = 1; mc <= MASTER_COLS_; mc++) {
    var h = MASTER_HEADERS_[mc - 1], isInv = !!INV_MAP_[mc];
    if (name === 'MASTER') { if (isInv) out.push({ tc: mc - 1, mc: mc, h: h }); }
    else if (EDIT_MAP_[h] || isInv) out.push({ tc: PLAT_ORDER_.indexOf(mc), mc: mc, h: h });
  }
  return out;
}
// the ways a calculated value can look on screen
function sameShown_(t, v) {
  t = String(t == null ? '' : t).trim();
  if (v === null || v === undefined || v === '') return t === '';
  if (typeof v === 'number') { var r = Math.round(v); return t === String(v) || t === String(r) || t === String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  return t === String(v).trim();
}
function readSnap_(ss) {
  if (!ss.getSheetByName(SYNC_TAB_)) return null;
  var snap = {};
  readRange_(ss, SYNC_TAB_ + '!A1:BB40000').forEach(function (r) {
    var t = r[0], po = normPo(r[1]); if (!t || !po) return;
    var m = snap[t] = snap[t] || {}; if (!m[po]) m[po] = pad_(r.slice(1), MASTER_COLS_);
  });
  return snap;
}
function writeSnap_(ss, rows) {
  var sh = ss.getSheetByName(SYNC_TAB_) || ss.insertSheet(SYNC_TAB_), w = MASTER_COLS_ + 1;
  ensureCols_(sh, w);
  if (sh.getMaxRows() < rows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
  sh.getRange(1, 1, sh.getMaxRows(), w).clearContent().setNumberFormat('@');
  for (var i = 0; i < rows.length; i += 2000) { var ch = rows.slice(i, i + 2000); sh.getRange(1 + i, 1, ch.length, w).setValues(ch); }
  try { if (!sh.isSheetHidden()) sh.hideSheet(); } catch (e) {}
}
function writeRows_(sh, startRow, rows, ncols, textCols, numCols) {   // in place: the tab is never blanked while people are typing in it
  var need = startRow + Math.max(rows.length, 1) - 1;
  if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  var oldLast = sh.getLastRow(), n = rows.length;
  if (n) {
    textCols.forEach(function (c) { sh.getRange(startRow, c, n, 1).setNumberFormat('@'); });
    numCols.forEach(function (c) { sh.getRange(startRow, c, n, 1).setNumberFormat('#,##0'); });
    for (var i = 0; i < n; i += 1000) { var chunk = rows.slice(i, i + 1000); sh.getRange(startRow + i, 1, chunk.length, ncols).setValues(chunk); }
  }
  if (oldLast >= startRow + n) sh.getRange(startRow + n, 1, oldLast - startRow - n + 1, ncols).clearContent();
}

// Finds what people typed since the last pass and saves it. Returns how many cells were saved.
function reconcile_(ss, snap, T0, byPo, mRow) {
  var master = ss.getSheetByName('MASTER'), inv = ss.getSheetByName('INVOICES');
  var iData = readRange_(ss, 'INVOICES!A2:AB14000').map(function (r) { return pad_(r, 28); }), iRows = {};
  iData.forEach(function (x, i) { var p = normPo(x[1]); if (p) (iRows[p] = iRows[p] || []).push(i + 2); });
  var nextRow = Math.max(T0.MASTER.length, master.getLastRow() - 2) + 3, applied = 0, logged = 0;
  var note = function (po, text) { if (logged++ < 300) actNote_(po, text, 'sheet', ''); };
  var show = function (v) { return v === '' ? '(blank)' : String(v).slice(0, 60); };
  ['MASTER'].concat(PLAT_TABS_).forEach(function (name) {
    var b = snap[name]; if (!b || !T0[name]) return;
    var cols = inputCols_(name), seen = {}, edits = [], clears = 0, tabSh = ss.getSheetByName(name);
    // what was really typed (the screen rounds amounts and reformats dates)
    var typed = function (r, tc, shown, numeric) { var raw = tabSh.getRange(r, tc + 1).getValue(); return raw instanceof Date ? cleanVal_(raw, false) : (numeric && typeof raw === 'number' ? raw : cleanVal_(shown, numeric)); };
    T0[name].forEach(function (row, ri) {
      var rawPo = String(row[0] || '').trim(), po = normPo(rawPo); if (!po) return;
      var first = !seen[po]; seen[po] = 1;
      if (name === 'MASTER' && !first) return;
      if (!mRow[po]) {                                             // a PO number MASTER has never seen: add it with everything typed beside it
        if (name === 'MASTER') return;
        var r = nextRow++; mRow[po] = r;
        ensureCols_(master, MASTER_COLS_);
        if (master.getMaxRows() < r) master.insertRowsAfter(master.getMaxRows(), r - master.getMaxRows());
        var base = []; for (var k = 0; k < MASTER_COLS_; k++) base.push('');
        cols.forEach(function (c) { var v = String(row[c.tc] || '').trim(); if (v === '') return; if (EDIT_MAP_[c.h]) base[c.mc - 1] = typed(ri + 3, c.tc, v, MASTER_NUM_.indexOf(c.mc) >= 0); else note(rawPo, name + ': ' + c.h + ' = ' + show(v) + ' NOT SAVED (new PO has no invoice yet: add the invoice on INVOICES first)'); });
        base[0] = rawPo; if (!base[1]) base[1] = name === 'Other platforms' ? 'Other' : name; base[7] = 'Typed on ' + name + ' tab';
        MASTER_TEXT_.forEach(function (c) { master.getRange(r, c).setNumberFormat('@'); });
        master.getRange(r, 1, 1, MASTER_COLS_).setValues([base]);
        note(rawPo, name + ': new PO added to MASTER'); applied++;
        return;
      }
      var was = first ? b[po] : null, calc = byPo[po];
      cols.forEach(function (c) {
        var t = row[c.tc] || '', old = was ? (was[c.tc] || '') : '';
        if (t === old) return;
        if (calc && sameShown_(t, calc[c.mc - 1])) return;         // already what the data says
        if (String(t).trim() === '') clears++;
        edits.push({ po: po, rawPo: rawPo, mc: c.mc, h: c.h, val: String(t).trim(), r: ri + 3, tc: c.tc });
      });
    });
    if (clears > MAX_CLEARS_) {
      edits = edits.filter(function (ed) { return ed.val !== ''; });
      note('', name + ': ' + clears + ' cells were blanked at once. Treated as an accident: nothing was deleted and the values were put back.');
    }
    edits.forEach(function (ed) {
      var what = name + ': ' + ed.h + ' = ' + show(ed.val);
      if (EDIT_MAP_[ed.h]) {
        master.getRange(mRow[ed.po], ed.mc).setValue(ed.val === '' ? '' : typed(ed.r, ed.tc, ed.val, MASTER_NUM_.indexOf(ed.mc) >= 0));
        note(ed.rawPo, what + ' (saved to MASTER)'); applied++; return;
      }
      var list = iRows[ed.po] || [], ic = INV_MAP_[ed.mc], targets = [];
      if (list.length === 1) targets = list;
      else if (list.length > 1) {
        if (INV_ALL_.indexOf(ed.mc) >= 0) {                        // describes the whole PO: only when its invoices agree today
          var kinds = {}; list.forEach(function (x) { kinds[iData[x - 2][ic - 1]] = 1; });
          if (Object.keys(kinds).length <= 1) targets = list;
        } else {                                                   // a number or amount: the one invoice that has none yet
          targets = list.filter(function (x) { return iData[x - 2][ic - 1] === ''; });
          if (targets.length !== 1) targets = [];
        }
      }
      if (!targets.length) { note(ed.rawPo, what + ' NOT SAVED (' + (list.length ? 'this PO has ' + list.length + ' invoices: enter it against the right invoice on INVOICES' : 'this PO has no invoice yet: add it on INVOICES first') + ')'); return; }
      var put = ed.val === '' ? '' : typed(ed.r, ed.tc, ed.val, INV_NUM_.indexOf(ic) >= 0);
      targets.forEach(function (x) { inv.getRange(x, ic).setValue(put); iData[x - 2][ic - 1] = String(put); });
      note(ed.rawPo, what + ' (saved to ' + targets.length + ' invoice' + (targets.length > 1 ? 's' : '') + ')'); applied++;
    });
  });
  if (logged > 300) actNote_('', (logged - 300) + ' more sheet edits in this pass are not listed', 'sheet', '');
  actFlush_(ss);
  return applied;
}

function syncPass_(props) {
  var ss = SpreadsheetApp.openById(MASTER_ID);
  var m = ss.getSheetByName('MASTER'), isx = ss.getSheetByName('INVOICES');
  normDates_(m, 3, Math.max(m.getLastRow() - 2, 0), DATE_COLS_);
  normDates_(isx, 2, Math.max(isx.getLastRow() - 1, 0), INV_DATE_COLS_);
  // the record of the last pass is trusted only if that pass finished
  var snap = props.getProperty('SYNC_STATE') === 'ok' ? readSnap_(ss) : null;
  var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm');
  var a = loadAll_(ss), out = buildMaster_(a.D, a.I, STAGES, stamp, a.claims);
  var byPo = {}; out.master.forEach(function (r) { byPo[normPo(r[0])] = r; });
  var T0 = { MASTER: a.raw.map(function (r) { return pad_(r, MASTER_COLS_); }) };
  PLAT_TABS_.forEach(function (t) { if (ss.getSheetByName(t)) T0[t] = readRange_(ss, "'" + t + "'!A3:BA14000").map(function (r) { return pad_(r, MASTER_COLS_); }); });
  var mRow = {}; a.raw.forEach(function (r, i) { var p = normPo(r[0]); if (p && !mRow[p]) mRow[p] = i + 3; });
  var applied = snap ? reconcile_(ss, snap, T0, byPo, mRow) : 0;
  if (applied) {                                                   // recalculate with what was just saved
    SpreadsheetApp.flush();
    a = loadAll_(ss); out = buildMaster_(a.D, a.I, STAGES, stamp, a.claims);
    byPo = {}; out.master.forEach(function (r) { byPo[normPo(r[0])] = r; });
  }
  var n = a.raw.length, pos = a.raw.map(function (r) { return normPo(r[0]); });
  // somebody added or moved rows while this was calculating: skip this round rather than write onto the wrong PO
  var again = readRange_(ss, 'MASTER!A3:BA14000');
  if (again.length !== pos.length || again.map(function (r) { return normPo(r[0]); }).join('|') !== pos.join('|')) return { ok: false, skipped: 'the sheet changed during the refresh', applied: applied };
  props.setProperty('SYNC_STATE', 'writing');
  var pending = {}, nPending = 0;
  var mark = function (name, po, tc) { ((pending[name] = pending[name] || {})[po] = pending[name][po] || {})[tc] = 1; nPending++; };
  // a cell typed in MASTER while this pass was calculating is left exactly as typed; the next pass saves it
  var m0 = {}; T0.MASTER.forEach(function (r) { var p = normPo(r[0]); if (p && !m0[p]) m0[p] = r; });
  var mIn = inputCols_('MASTER'), seenM = {};
  again.forEach(function (r, i) {
    var po = pos[i]; if (!po || seenM[po] || !byPo[po]) return; seenM[po] = 1;
    var o = m0[po];
    mIn.forEach(function (c) { var t1 = r[c.tc] || '', t0 = o ? (o[c.tc] || '') : ''; if (t1 !== t0) { byPo[po][c.tc] = t1; mark('MASTER', po, c.tc); } });
  });
  var used = {};
  var aligned = pos.map(function (po) { if (po && byPo[po] && !used[po]) { used[po] = 1; return byPo[po]; } return null; });
  if (n) {
    ensureCols_(m, MASTER_COLS_);
    m.getRange(2, 1, 1, MASTER_COLS_).setValues([MASTER_HEADERS_]);
    CALC_BLOCKS_.forEach(function (b) {
      var w = b[1] - b[0] + 1;
      var block = aligned.map(function (r) { var x = []; for (var j = 0; j < w; j++) x.push(r ? r[b[0] - 1 + j] : ''); return x; });
      for (var c = b[0]; c <= b[1]; c++) {
        m.getRange(3, c, n, 1).setNumberFormat(MASTER_TEXT_.indexOf(c) >= 0 ? '@' : (c === 23 ? '0.0%' : '#,##0'));
      }
      for (var i = 0; i < n; i += 1000) { var ch = block.slice(i, i + 1000); m.getRange(3 + i, b[0], ch.length, w).setValues(ch); }
    });
    MASTER_TEXT_.forEach(function (c) { if (CALC_BLOCKS_.every(function (b) { return c < b[0] || c > b[1]; })) m.getRange(3, c, n, 1).setNumberFormat('@'); });
    [6, 7].forEach(function (c) { m.getRange(3, c, n, 1).setNumberFormat('#,##0'); });
  }
  // platform tabs: the same POs as MASTER, one tab per platform. Typing here is carried back by the next pass.
  var hdr = MASTER_HEADERS_, byTab = {}, wrote = {};
  PLAT_TABS_.forEach(function (t) { byTab[t] = []; });
  aligned.forEach(function (r) { if (r) byTab[platTab_(r[1])].push(permute_(r)); });
  var pText = permIdx_(MASTER_TEXT_), pNum = permIdx_(MASTER_NUM_), pPct = permIdx_([23]);
  PLAT_TABS_.forEach(function (t) {
    var sh = ss.getSheetByName(t); if (!sh) return;
    var rows = byTab[t], idx = {}, cols = inputCols_(t);
    rows.forEach(function (r, i) { var p = normPo(r[0]); if (p && idx[p] === undefined) idx[p] = i; });
    var t0 = {}, sig0 = {};
    (T0[t] || []).forEach(function (r) { var p = normPo(r[0]); if (p && !t0[p]) t0[p] = r; sig0[r.join('\u0001')] = 1; });
    var seen = {}, keep = [];
    readRange_(ss, "'" + t + "'!A3:BA14000").forEach(function (r) {
      r = pad_(r, MASTER_COLS_);
      var p = normPo(r[0]);
      if (!p) { if (r.some(function (v) { return v !== ''; })) keep.push(r); return; }     // typed before the PO number: wait for it
      if (idx[p] !== undefined && !seen[p]) {
        seen[p] = 1;
        var o = t0[p], w = rows[idx[p]];
        cols.forEach(function (c) { var a1 = r[c.tc] || '', a0 = o ? (o[c.tc] || '') : ''; if (a1 !== a0) { w[c.tc] = a1; mark(t, p, c.tc); } });   // typed during this pass
        return;
      }
      if (!sig0[r.join('\u0001')]) keep.push(r);                   // a row typed during this pass: keep it for the next one
    });
    sh.getRange(1, 1).setValue(t + '  |  ' + rows.length + ' POs  |  TWO-WAY: whatever you type here is saved to MASTER / INVOICES and shown on the website. Add a new PO in the first empty row. Calculated columns (Stage, Fill %, Age and the like) cannot be typed.');
    ensureCols_(sh, MASTER_COLS_);
    sh.getRange(2, 1, 1, MASTER_COLS_).setValues([permute_(hdr)]);
    writeRows_(sh, 3, rows.concat(keep), MASTER_COLS_, pText, pNum);
    if (rows.length) sh.getRange(3, pPct[0], rows.length, 1).setNumberFormat('0.0%');
    wrote[t] = rows.length;
  });
  var nClaims = claimsTab_(ss, a);
  styleTab_(m, 2, MASTER_HEADERS_, HIDE_COLS_, true);
  PLAT_TABS_.forEach(function (t) { var sh = ss.getSheetByName(t); if (sh) styleTab_(sh, 2, permute_(MASTER_HEADERS_), permIdx_(HIDE_COLS_), true); });
  ensureCols_(isx, INV_HEADERS_.length);
  isx.getRange(1, 1, 1, INV_HEADERS_.length).setValues([INV_HEADERS_]);
  styleTab_(isx, 1, INV_HEADERS_, [], false);
  organiseTabs_(ss);
  var rm = ss.getSheetByName('READ ME');
  if (rm) rm.getRange('A4').setValue('Calculated columns refresh every 10 minutes. Last refresh: ' + stamp + ' IST. This sheet is the only record: the website and the team both read and write it.');
  // remember exactly what each tab shows now, so the next pass can tell what a person changed
  SpreadsheetApp.flush();
  var snapRows = [];
  var remember = function (name, shown, count) {
    var seen = {}, pend = pending[name] || {};
    for (var i = 0; i < count; i++) {
      var r = pad_(shown[i] || [], MASTER_COLS_), p = normPo(r[0]);
      if (!p || seen[p]) continue; seen[p] = 1;
      if (pend[p]) Object.keys(pend[p]).forEach(function (tc) { r[+tc] = PENDING_; });
      snapRows.push([name].concat(r));
    }
  };
  remember('MASTER', readRange_(ss, 'MASTER!A3:BA14000'), n);
  PLAT_TABS_.forEach(function (t) { if (wrote[t] !== undefined) remember(t, readRange_(ss, "'" + t + "'!A3:BA14000"), wrote[t]); });
  writeSnap_(ss, snapRows);
  SpreadsheetApp.flush();
  props.setProperty('SYNC_STATE', 'ok');
  return { ok: true, claims: nClaims, pos: a.D.length, invoices: a.I.length, at: stamp, saved: applied, pending: nPending };
}

// One pass at a time. wait = how long to queue behind a pass that is already running (0 = do not queue).
function runSync_(wait, since) {
  var props = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  if (!lock.tryLock(wait || 1000)) return { ok: false, skipped: 'a refresh is already running' };
  try {
    if (since && Number(props.getProperty('LAST_START') || 0) > since) return { ok: true, skipped: 'a later pass already covered this edit' };
    var res = null;
    for (var pass = 0; pass < 3; pass++) {
      props.setProperty('LAST_START', String(Date.now()));
      res = syncPass_(props);
      if (res.skipped) { Utilities.sleep(1500); continue; }       // rows moved while it was calculating: go round again
      if (!res.pending) break;                                     // something was typed during the pass: save it now
    }
    return res;
  } catch (err) {
    try { actNote_('', 'SYNC FAILED: ' + err, 'system', ''); actFlush_(SpreadsheetApp.openById(MASTER_ID)); } catch (x) {}
    throw err;
  } finally { lock.releaseLock(); }
}
function refreshMaster() { return runSync_(0, 0); }
function syncMaster() { return refreshMaster(); }

function setupMasterSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) { var f = t.getHandlerFunction(); if (f === 'syncMaster' || f === 'refreshMaster') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshMaster').timeBased().everyMinutes(10).create();
  return refreshMaster();
}

// ---------- instant refresh ----------
// An installable edit trigger: when someone types in MASTER, INVOICES, CLAIM DATA or ISSUES, the calculated columns are
// rebuilt straight away (about 20 to 40 seconds) instead of waiting for the 10-minute timer. Edits made while a refresh is
// running are picked up by one extra pass. Typing in the view-only tabs is ignored (they are rebuilt anyway).
var LIVE_TABS_ = { 'MASTER': 1, 'INVOICES': 1, 'CLAIM DATA': 1, 'ISSUES': 1, 'SETTINGS': 1, 'Blinkit': 1, 'Swiggy Instamart': 1, 'Zepto': 1, 'BigBasket': 1, 'Flipkart': 1, 'Other platforms': 1 };
// MASTER column -> INVOICES column (1-based) for the invoice-level fields that can be typed on a platform tab
var INV_MAP_ = { 24: 7, 25: 8, 26: 9, 27: 10, 28: 12, 29: 13, 30: 15, 31: 16, 32: 17, 34: 21, 35: 22, 36: 23, 43: 18, 44: 20, 47: 24, 48: 25, 53: 26 };

function cleanVal_(v, numeric) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Kolkata', 'yyyy-MM-dd');
  var t = String(v).trim();
  if (numeric && /^-?[\d,]+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  return t;
}


// Every typed change that is carried across (or refused) is noted on ACTIVITY, so "my entry disappeared" can be traced.
var ACT_BUF_ = [];
function actNote_(po, detail, who, plat) { ACT_BUF_.push([Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm'), po, 'Sheet edit', detail, who || '', plat || '']); }
function actFlush_(ss) {
  if (!ACT_BUF_.length) return;
  try { var sh = ss.getSheetByName('ACTIVITY'); if (sh) { var rows = ACT_BUF_.splice(0, 200); sh.getRange(sh.getLastRow() + 1, 1, rows.length, 6).setValues(rows); } } catch (x) { console.error('activity: ' + x); }
  ACT_BUF_ = [];
}

var INV_ALL_ = [24, 25, 26, 27, 28, 47, 48];   // MASTER columns that describe the whole PO: copied onto every invoice of it

function onSheetEdit(e) {
  try {
    var name = e && e.range ? e.range.getSheet().getName() : '';
    if (!LIVE_TABS_[name]) return;
    runSync_(150000, Date.now());
  } catch (err) { console.error('onSheetEdit: ' + err); }
}
function setupInstantRefresh() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'onSheetEdit') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.openById(MASTER_ID)).onEdit().create();
  return 'Instant refresh is on: edits in any tab are saved and the calculated columns refresh right away.';
}

// ---------- one-time move to a single sheet ----------
function copyTab_(from, to, name, rng) {
  var src = from.getSheetByName(name); if (!src) return 0;
  var vals = readRange_(from, name + '!' + rng);
  if (!vals.length) return 0;
  var dst = to.getSheetByName(name === 'CLAIMS' ? 'CLAIM DATA' : name) || to.insertSheet(name === 'CLAIMS' ? 'CLAIM DATA' : name);
  if (dst.getLastRow() > 1) return -1;   // already has data: never overwrite
  var w = 0; vals.forEach(function (r) { if (r.length > w) w = r.length; });
  var rows = vals.map(function (r) { var x = r.slice(); while (x.length < w) x.push(''); return x; });
  dst.getRange(1, 1, rows.length, w).setNumberFormat('@').setValues(rows);
  return rows.length - 1;
}

function setupOneSheet() {
  var ss = SpreadsheetApp.openById(MASTER_ID), report = {};
  var old = null; try { old = SpreadsheetApp.openById(OLD_TRACKING_ID_); } catch (e) { report.oldSheet = 'not readable: ' + String(e && e.message || e).slice(0, 80); }
  if (old) {
    report.settings = copyTab_(old, ss, 'SETTINGS', 'A1:B30');
    report.users = copyTab_(old, ss, 'USERS', 'A1:E200');
    report.issues = copyTab_(old, ss, 'ISSUES', 'A1:O3000');
    report.activity = copyTab_(old, ss, 'ACTIVITY', 'A1:F6000');
    report.claims = copyTab_(old, ss, 'CLAIMS', 'A1:N5000');
    report.tracking = applyOldTracking_(old, ss);
  }
  // make sure every data tab exists with its header
  var need = { 'SETTINGS': [['Key', 'Value']], 'USERS': [['Name', 'PIN hash', 'Role', 'Active']],
    'ISSUES': [['ID', 'Raised', 'PO Number', 'Platform', 'Type', 'Description', 'Raised By', 'Owner', 'Priority', 'Status', 'Next Follow-up', 'Updated', 'Latest Note', 'Resolution', 'Resolved On']],
    'ACTIVITY': [['Timestamp', 'PO Number', 'Action', 'Detail', 'By', 'Platform']],
    'CLAIM DATA': [['PO Number', 'Invoice No', 'Platform', 'Claim Type', 'Status', 'Claim Raised', 'Raised On', 'Reference', 'Settled', 'Settled On', 'Note', 'Updated', 'By', 'RTO Goods Received']] };
  Object.keys(need).forEach(function (k) {
    var sh = ss.getSheetByName(k) || ss.insertSheet(k);
    if (sh.getLastRow() < 1) sh.getRange(1, 1, 1, need[k][0].length).setValues(need[k]);
  });
  ['ISSUES (app)', 'ACTIVITY (app)', 'APP DATA', '_SNAPSHOT'].forEach(function (n) { var sh = ss.getSheetByName(n); if (sh) { try { ss.deleteSheet(sh); } catch (e) {} } });
  var isx = ss.getSheetByName('INVOICES'); ensureCols_(isx, INV_HEADERS_.length);
  isx.getRange(1, 1, 1, INV_HEADERS_.length).setValues([INV_HEADERS_]);
  try { ss.getSheetByName('MASTER').showColumns(11); } catch (e) {}
  report.refresh = setupMasterSync();
  report.instant = setupInstantRefresh();
  return report;
}

// Anything the team already entered in the old Tracking sheet is moved into the matching MASTER cells.
function applyOldTracking_(old, ss) {
  var rows = []; try { rows = readRange_(old, 'TRACKING!A2:AG5000'); } catch (e) { return 0; }
  if (!rows.length) return 0;
  var m = ss.getSheetByName('MASTER'), raw = readRange_(ss, 'MASTER!A3:A14000'), rowOf = {};
  raw.forEach(function (r, i) { var p = normPo(r[0]); if (p && !rowOf[p]) rowOf[p] = i + 3; });
  var next = raw.length + 3, done = 0;
  rows.forEach(function (r) {
    var po = normPo(r[0]); if (!po) return;
    var row = rowOf[po];
    if (!row) { row = next++; rowOf[po] = row; m.getRange(row, 1, 1, 8).setNumberFormat('@').setValues([[po, r[11] || 'Other', r[12] || '', r[13] || '', r[14] || '', r[15] || '', r[16] || '', 'Created in app']]); }
    var set = function (col, v) { if (v !== '' && v != null) m.getRange(row, col).setNumberFormat('@').setValue(String(v)); };
    set(9, r[1]); set(10, r[2]); set(11, r[3]); set(15, r[7]); set(16, r[19]);
    if (r[8]) { var cur = String(m.getRange(row, 17).getValues()[0][0] || ''); if (cur.indexOf(String(r[8])) < 0) m.getRange(row, 17).setNumberFormat('@').setValue(cur ? cur + ' | ' + r[8] : String(r[8])); }
    set(42, r[30]); set(45, r[31]); set(46, r[32]);
    done++;
  });
  return done;
}
