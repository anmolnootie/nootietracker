/**
 * Automatic backup of the Tracking sheet (everything the team enters in the app).
 * Run setupBackup() once from the editor. It copies the sheet into a Drive folder every 2 days
 * and keeps the newest 15 copies (about a month); older copies go to the Drive trash, not deleted for good.
 * The MASTER sheet is not copied because it is rebuilt from the Warehouse Master and the Tracking sheet.
 */
var BACKUP_FOLDER_ = 'PO Control Tower Backups';
var BACKUP_PREFIX_ = 'PO Control Tower - Tracking backup ';
var BACKUP_KEEP_ = 15;

function setupBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runBackup').timeBased().everyDays(2).atHour(2).create();
  return runBackup();
}

function backupFolder_() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER_);
  return it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER_);
}

function logBackup_(what, detail) {
  try {
    var act = SpreadsheetApp.openById(TRK_ID).getSheetByName('ACTIVITY');
    var ts = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm');
    act.getRange(Math.max(act.getLastRow() + 1, 2), 1, 1, 6).setNumberFormat('@').setValues([[ts, '', what, detail, 'system', '']]);
  } catch (e) { /* logging must never stop a backup */ }
}

function runBackup() {
  try {
    var folder = backupFolder_();
    var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH-mm');
    var copy = DriveApp.getFileById(TRK_ID).makeCopy(BACKUP_PREFIX_ + stamp, folder);
    var files = [], it = folder.getFiles();
    while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf(BACKUP_PREFIX_) === 0) files.push(f); }
    files.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
    var removed = 0;
    for (var i = BACKUP_KEEP_; i < files.length; i++) { files[i].setTrashed(true); removed++; }
    logBackup_('Backup saved', 'copy "' + copy.getName() + '" in the Drive folder "' + BACKUP_FOLDER_ + '"; ' + Math.min(files.length, BACKUP_KEEP_) + ' kept, ' + removed + ' old moved to trash');
    return { ok: true, name: copy.getName(), url: copy.getUrl(), kept: Math.min(files.length, BACKUP_KEEP_), trashed: removed };
  } catch (e) {
    logBackup_('Backup FAILED', String(e && e.message || e).slice(0, 200));
    throw e;
  }
}
