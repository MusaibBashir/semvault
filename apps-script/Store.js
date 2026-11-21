// Sheet and Drive I/O. Everything here talks to Google services.

// A function, not a var: Apps Script file load order is not guaranteed.
function tabColumns(name) {
  return {
  Catalog: CATALOG_COLUMNS,
  Courses: ['code', 'name', 'short', 'semester'],
  Mods: ['email', 'addedBy', 'addedAt'],
  Requests: ['email', 'requestedAt'],
  Log: ['at', 'actor', 'action', 'target', 'detail'],
  }[name];
}

function props() {
  var p = PropertiesService.getScriptProperties().getProperties();
  return {
    OWNER_EMAIL: p.OWNER_EMAIL || '',
    SHEET_ID: p.SHEET_ID || '',
    ROOT_FOLDER_ID: p.ROOT_FOLDER_ID || '',
    GOOGLE_CLIENT_ID: p.GOOGLE_CLIENT_ID || '',
    SITE_URL: p.SITE_URL || '',
  };
}

function tab(name) {
  var sh = SpreadsheetApp.openById(props().SHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('Missing sheet tab "' + name + '". Run setup().');
  return sh;
}

function readRows(name) {
  var sh = tab(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, tabColumns(name).length).getValues();
}

function rowsAsObjects(name) {
  var cols = tabColumns(name);
  return readRows(name).map(function (r) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
    return o;
  });
}

// Finds the 1-based sheet row whose first column equals key (case-insensitive), or -1.
function findRow(name, key) {
  var rows = readRows(name);
  var k = String(key).trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === k) return i + 2;
  }
  return -1;
}

function upsertRow(name, key, row) {
  var sh = tab(name);
  var r = findRow(name, key);
  if (r === -1) sh.appendRow(row);
  else sh.getRange(r, 1, 1, row.length).setValues([row]);
}

function deleteRowByKey(name, key) {
  var r = findRow(name, key);
  if (r !== -1) tab(name).deleteRow(r);
}

// ---- Catalog ----

function readItems() {
  return readRows('Catalog').map(rowToItem);
}

function findItem(id) {
  var items = readItems();
  for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
  return null;
}

function writeItem(item) {
  upsertRow('Catalog', item.id, itemToRow(item).map(String));
}

// ---- Courses, mods, requests, log ----

function readCourses() {
  return rowsAsObjects('Courses').map(function (c) {
    return { code: String(c.code), name: String(c.name), short: String(c.short), semester: Number(c.semester) || 0 };
  });
}

function saveCourse(c) {
  upsertRow('Courses', c.code, [c.code, c.name, c.short, c.semester]);
}

function readMods() {
  return rowsAsObjects('Mods');
}

function modEmails() {
  return readMods().map(function (m) { return String(m.email); });
}

function readRequests() {
  return rowsAsObjects('Requests');
}

function appendLog(row) {
  tab('Log').appendRow(row);
}

function readLog(limit) {
  var rows = rowsAsObjects('Log');
  return rows.slice(Math.max(0, rows.length - limit)).reverse();
}

// ---- Drive ----

function rootFolder() {
  return DriveApp.getFolderById(props().ROOT_FOLDER_ID);
}

function subfolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function pendingFolder() { return subfolder(rootFolder(), 'Pending'); }
function rejectedFolder() { return subfolder(rootFolder(), 'Rejected'); }
function seedFolder() { return subfolder(rootFolder(), 'Seed'); }
function liveFolder(code) { return subfolder(subfolder(rootFolder(), 'Live'), code); }

function saveBase64(folder, name, mimeType, base64) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'application/octet-stream', name);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

function moveFiles(item, folder, shareWithLink) {
  [item.fileId, item.sourceFileId].forEach(function (id) {
    if (!id) return;
    var f = DriveApp.getFileById(id);
    f.moveTo(folder);
    if (shareWithLink) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    else f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  });
}

// ---- Public catalog cache (CacheService values max 100 KB, so chunk) ----

var CACHE_CHUNK = 90000;
var CACHE_TTL = 600;

function cacheGetCatalog() {
  var cache = CacheService.getScriptCache();
  var n = cache.get('catalog:n');
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < Number(n); i++) keys.push('catalog:' + i);
  var parts = cache.getAll(keys);
  var s = '';
  for (var j = 0; j < keys.length; j++) {
    if (parts[keys[j]] == null) return null;
    s += parts[keys[j]];
  }
  return s;
}

function cachePutCatalog(s) {
  var cache = CacheService.getScriptCache();
  var vals = {};
  var n = 0;
  for (var i = 0; i < s.length; i += CACHE_CHUNK) vals['catalog:' + n++] = s.slice(i, i + CACHE_CHUNK);
  vals['catalog:n'] = String(n);
  cache.putAll(vals, CACHE_TTL);
}

function bustCache() {
  CacheService.getScriptCache().remove('catalog:n');
}
