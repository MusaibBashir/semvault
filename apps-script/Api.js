// Web app entry points. The site POSTs JSON as text/plain (no CORS preflight).

var UPLOADS_PER_HOUR = 30;
var ROLE_RANK = { none: 0, mod: 1, owner: 2 };

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  return respond(function () {
    if (action === 'catalog') return handleCatalog();
    fail('Unknown action');
  });
}

function doPost(e) {
  return respond(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var handler = {
      upload: handleUpload,
      me: handleMe,
      pending: handlePending,
      library: handleLibrary,
      review: handleReview,
      update: handleUpdate,
      saveCourse: handleSaveCourse,
      activity: handleActivity,
      requestMod: handleRequestMod,
      mods: handleMods,
      setMod: handleSetMod,
    }[body.action];
    if (!handler) fail('Unknown action');
    return handler(body);
  });
}

function respond(fn) {
  var out;
  try {
    out = fn();
    if (typeof out === 'string') {
      return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
    }
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: err && err.message ? err.message : String(err), code: (err && err.code) || 400 };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function fail(message, code) {
  var err = new Error(message);
  err.code = code || 400;
  throw err;
}

function nowIso() {
  return new Date().toISOString();
}

// Verifies the token and re-reads the mod list on every call, so removing a mod takes effect at once.
function requireRole(body, minRole) {
  var email = verifyIdToken(body.idToken);
  if (!email) fail('Please sign in again', 401);
  var role = roleOf(email, props().OWNER_EMAIL, modEmails());
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) fail('Not authorised', 403);
  return { email: email, role: role };
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function log(actor, action, target, detail) {
  appendLog(logRow(actor, action, target, detail, nowIso()));
}

// ---- Public ----

function handleCatalog() {
  var cached = cacheGetCatalog();
  if (cached) return cached;
  var s = JSON.stringify({ ok: true, courses: readCourses(), items: publicView(readItems()), updatedAt: nowIso() });
  cachePutCatalog(s);
  return s;
}

function extOf(name, fallback) {
  var m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : fallback;
}

function handleUpload(body) {
  if (body.hp) fail('Rejected');
  var cache = CacheService.getScriptCache();
  var hourKey = 'uploads:' + new Date().toISOString().slice(0, 13);
  var count = Number(cache.get(hourKey) || 0);
  if (count >= UPLOADS_PER_HOUR) fail('Too many uploads right now. Please try again in an hour.', 429);

  var meta = body.meta || {};
  var check = validateUpload(meta, body.file, body.source);
  if (!check.ok) fail(check.errors.join('. '));
  cache.put(hourKey, String(count + 1), 3700);

  var id = 'it_' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  var folder = pendingFolder();
  var fileId = saveBase64(folder, id + '.' + extOf(body.file.name, 'pdf'), body.file.mimeType, body.file.base64);
  var sourceFileId = '';
  var sourceName = '';
  if (body.source) {
    sourceName = String(body.source.name);
    sourceFileId = saveBase64(folder, id + '.src.' + extOf(sourceName, 'tex'), body.source.mimeType, body.source.base64);
  }
  var isPyq = meta.type === 'pyq';
  var item = {
    id: id, course: String(meta.course).trim(), type: meta.type, title: String(meta.title).trim(),
    description: String(meta.description || '').trim(), fileId: fileId, sourceFileId: sourceFileId,
    sourceName: sourceName, year: isPyq ? (Number(meta.year) || '') : '', term: isPyq ? (meta.term || '') : '',
    exam: isPyq ? (meta.exam || '') : '', uploaderName: String(meta.uploaderName || '').trim(),
    uploaderEmail: String(meta.uploaderEmail || '').trim(), uploadedAt: nowIso(), status: 'pending',
    startHere: false, startOrder: '', reviewedBy: '', reviewedAt: '', rejectReason: '',
  };
  writeItem(item);
  log(item.uploaderEmail || item.uploaderName || 'anonymous', 'upload', id, item.title);
  return { id: id };
}

// ---- Signed in ----

function handleMe(body) {
  var email = verifyIdToken(body.idToken);
  if (!email) fail('Please sign in again', 401);
  return { email: email, role: roleOf(email, props().OWNER_EMAIL, modEmails()) };
}

function handleRequestMod(body) {
  var me = requireRole(body, 'none');
  if (me.role !== 'none') return {};
  if (findRow('Requests', me.email) === -1) {
    appendSafe('Requests', [me.email, nowIso()]);
    log(me.email, 'request-mod', '', '');
  }
  return {};
}

// ---- Mods ----

function driveView(id) {
  return id ? 'https://drive.google.com/file/d/' + id + '/view' : '';
}

function handlePending(body) {
  requireRole(body, 'mod');
  var items = readItems().filter(function (it) { return it.status === 'pending'; });
  items.forEach(function (it) { it.fileUrl = driveView(it.fileId); it.sourceUrl = driveView(it.sourceFileId); });
  return { items: items };
}

// Live items with who approved them. Not public: reviewer emails stay inside the mod panel.
function handleLibrary(body) {
  requireRole(body, 'mod');
  return { items: readItems().filter(function (it) { return it.status === 'approved'; }) };
}

function handleReview(body) {
  var me = requireRole(body, 'mod');
  return withLock(function () {
    var item = findItem(body.id);
    if (!item) fail('Item not found', 404);
    if (item.status !== 'pending') fail('Already reviewed by ' + (item.reviewedBy || 'someone'), 409);
    if (body.edits) item = applyEdits(item, body.edits);
    if (body.decision === 'approve' && String(item.course).indexOf('OTHER:') === 0) {
      fail('Pick an existing course (or add one) before approving');
    }
    var r = applyReview(item, { decision: body.decision, reviewer: me.email, at: nowIso(), reason: body.reason });
    if (!r.ok) fail(r.error, 409);
    if (r.item.status === 'approved') moveFiles(r.item, liveFolder(r.item.course), true);
    else moveFiles(r.item, rejectedFolder(), false);
    writeItem(r.item);
    log(me.email, body.decision, r.item.id, r.item.title + (body.reason ? ' — ' + body.reason : ''));
    bustCache();
    return { item: r.item };
  });
}

function handleUpdate(body) {
  var me = requireRole(body, 'mod');
  return withLock(function () {
    var item = findItem(body.id);
    if (!item) fail('Item not found', 404);
    if (item.status !== 'approved') fail('Only live items can be edited here');
    var out = applyEdits(item, body.edits);
    if (out.course !== item.course) {
      if (String(out.course).indexOf('OTHER:') === 0) fail('Pick an existing course');
      moveFiles(out, liveFolder(out.course), true);
    }
    if (out.status === 'removed') moveFiles(out, rejectedFolder(), false);
    writeItem(out);
    var keys = Object.keys(body.edits || {});
    var action = out.status === 'removed' ? 'remove'
      : (keys.length && keys.every(function (k) { return k === 'startHere' || k === 'startOrder'; }) ? 'start-here' : 'edit');
    log(me.email, action, out.id, out.title + (action === 'edit' ? ' (' + keys.join(', ') + ')' : ''));
    bustCache();
    return { item: out };
  });
}

function handleSaveCourse(body) {
  var me = requireRole(body, 'mod');
  var c = body.course || {};
  var code = String(c.code || '').trim().toUpperCase();
  var semester = Number(c.semester);
  if (!/^[A-Z]{2}\d{5}$/.test(code)) fail('Course code looks like IM31005');
  if (!String(c.name || '').trim()) fail('Course name is required');
  if (!(semester >= 1 && semester <= 10 && Math.floor(semester) === semester)) fail('Semester must be 1 to 10');
  var course = { code: code, name: String(c.name).trim(), short: String(c.short || '').trim() || code, semester: semester };
  saveCourse(course);
  log(me.email, 'course', code, course.name);
  bustCache();
  return { courses: readCourses() };
}

function handleActivity(body) {
  requireRole(body, 'mod');
  return { rows: readLog(Math.min(Number(body.limit) || 200, 1000)) };
}

// ---- Owner ----

function handleMods(body) {
  requireRole(body, 'owner');
  return { mods: readMods(), requests: readRequests() };
}

function handleSetMod(body) {
  var me = requireRole(body, 'owner');
  var email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('That does not look like an email');
  if (body.decision === 'add') {
    if (findRow('Mods', email) === -1) appendSafe('Mods', [email, me.email, nowIso()]);
    deleteRowByKey('Requests', email);
  } else if (body.decision === 'remove') {
    deleteRowByKey('Mods', email);
  } else if (body.decision === 'decline') {
    deleteRowByKey('Requests', email);
  } else {
    fail('Unknown decision');
  }
  log(me.email, 'mod-' + body.decision, email, '');
  return { mods: readMods(), requests: readRequests() };
}
