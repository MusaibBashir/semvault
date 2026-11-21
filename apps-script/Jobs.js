// Things run from the Apps Script editor or by time triggers.

// Run once as the owner (safe to re-run): creates folders, the Sheet, tabs and digest triggers.
function setup() {
  var store = PropertiesService.getScriptProperties();
  var p = props();

  var root = p.ROOT_FOLDER_ID ? DriveApp.getFolderById(p.ROOT_FOLDER_ID) : DriveApp.createFolder('Sem Vault');
  store.setProperty('ROOT_FOLDER_ID', root.getId());
  ['Pending', 'Live', 'Rejected', 'Seed'].forEach(function (n) { subfolder(root, n); });

  var ss;
  if (p.SHEET_ID) {
    ss = SpreadsheetApp.openById(p.SHEET_ID);
  } else {
    ss = SpreadsheetApp.create('Sem Vault catalog');
    DriveApp.getFileById(ss.getId()).moveTo(root);
    store.setProperty('SHEET_ID', ss.getId());
  }
  ['Catalog', 'Courses', 'Mods', 'Requests', 'Log'].forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var cols = tabColumns(name);
    // Plain text everywhere so Sheets never reformats ids, dates or codes.
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);

  if (!p.OWNER_EMAIL) store.setProperty('OWNER_EMAIL', Session.getEffectiveUser().getEmail().toLowerCase());

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDigest') ScriptApp.deleteTrigger(t);
  });
  [8, 21].forEach(function (h) {
    ScriptApp.newTrigger('sendDigest').timeBased().atHour(h).everyDays(1).inTimezone('Asia/Kolkata').create();
  });

  Logger.log('Setup done. Folder: %s  Sheet: %s', root.getUrl(), ss.getUrl());
}

// Time trigger, 8 am and 9 pm IST. Mails only when something is still pending.
function sendDigest() {
  var pending = readItems().filter(function (it) { return it.status === 'pending'; });
  var d = buildDigest(pending, readCourses(), props().SITE_URL + '#/mod', new Date().toISOString());
  if (!d) return;
  var to = modEmails().concat([props().OWNER_EMAIL]).filter(function (e, i, all) {
    return e && all.indexOf(e) === i;
  });
  MailApp.sendEmail({ to: to.join(','), subject: d.subject, body: d.body });
}

function csvObjects(file) {
  var rows = Utilities.parseCsv(file.getBlob().getDataAsString('UTF-8'));
  var head = rows.shift() || [];
  return rows.filter(function (r) { return r.join('').trim(); }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h.trim()] = (r[i] || '').trim(); });
    return o;
  });
}

function fileInFolder(folder, name) {
  var it = folder.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

// Imports seed/staging (dragged into Drive's Sem Vault/Seed folder) as approved items.
// Safe to re-run: items already in the Catalog are skipped, so a timed-out run can just be run again.
function importSeed() {
  var seed = seedFolder();
  var manifest = fileInFolder(seed, 'manifest.csv');
  if (!manifest) throw new Error('manifest.csv not found in the Seed folder');

  var coursesFile = fileInFolder(seed, 'courses.csv');
  if (coursesFile) {
    csvObjects(coursesFile).forEach(function (c) {
      if (c.code) saveCourse({ code: c.code, name: c.name, short: c.short || c.code, semester: Number(c.semester) || 0 });
    });
  }

  var existing = {};
  readItems().forEach(function (it) { existing[it.id] = true; });
  var added = 0;
  var missing = [];
  csvObjects(manifest).forEach(function (r) {
    if (existing[r.id]) return;
    var f = fileInFolder(seed, r.file);
    if (!f) { missing.push(r.file); return; }
    var src = r.source_file ? fileInFolder(seed, r.source_file) : null;
    var item = {
      id: r.id, course: r.course, type: r.type, title: r.title, description: '',
      fileId: f.getId(), sourceFileId: src ? src.getId() : '', sourceName: src ? (r.source_name || r.source_file) : '',
      year: Number(r.year) || '', term: r.term, exam: r.exam, uploaderName: 'seed', uploaderEmail: '',
      uploadedAt: new Date().toISOString(), status: 'approved',
      startHere: String(r.start_here).toLowerCase() === 'y', startOrder: Number(r.start_order) || '',
      reviewedBy: 'seed', reviewedAt: new Date().toISOString(), rejectReason: '',
    };
    moveFiles(item, liveFolder(item.course), true);
    writeItem(item);
    added++;
  });
  appendLog(logRow(props().OWNER_EMAIL, 'seed-import', '', added + ' items', new Date().toISOString()));
  bustCache();
  Logger.log('Imported %s items. Missing files: %s', added, missing.join(', ') || 'none');
}
