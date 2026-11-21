// Pure catalog logic. No Google services here, so it can be tested in Node.
// Apps Script shares one global scope across files: plain declarations only.

var CATALOG_COLUMNS = [
  'id', 'course', 'type', 'title', 'description', 'fileId', 'sourceFileId', 'sourceName',
  'year', 'term', 'exam', 'uploaderName', 'uploaderEmail', 'uploadedAt', 'status',
  'startHere', 'startOrder', 'reviewedBy', 'reviewedAt', 'rejectReason',
];

var ITEM_TYPES = ['notes', 'formula', 'pyq', 'lab', 'assignment', 'other'];
var MAX_BYTES = 25 * 1024 * 1024;
var EDITABLE_FIELDS = ['title', 'description', 'course', 'type', 'year', 'term', 'exam', 'startHere', 'startOrder', 'status'];
var PRIVATE_FIELDS = ['uploaderEmail', 'status', 'rejectReason'];

function rowToItem(row) {
  var item = {};
  CATALOG_COLUMNS.forEach(function (col, i) {
    var v = row[i];
    item[col] = v === undefined || v === null ? '' : v;
  });
  item.startHere = item.startHere === true || String(item.startHere).toUpperCase() === 'TRUE';
  item.year = toNumberOrBlank(item.year);
  item.startOrder = toNumberOrBlank(item.startOrder);
  ['uploadedAt', 'reviewedAt'].forEach(function (k) {
    if (item[k] instanceof Date) item[k] = item[k].toISOString();
  });
  return item;
}

function itemToRow(item) {
  return CATALOG_COLUMNS.map(function (col) {
    var v = item[col];
    return v === undefined || v === null ? '' : v;
  });
}

function toNumberOrBlank(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}

function publicView(items) {
  return items
    .filter(function (it) { return it.status === 'approved'; })
    .map(function (it) {
      var out = {};
      Object.keys(it).forEach(function (k) {
        if (PRIVATE_FIELDS.indexOf(k) === -1) out[k] = it[k];
      });
      return out;
    });
}

function base64Bytes(b64) {
  return Math.floor(String(b64 || '').length * 3 / 4);
}

function validateUpload(meta, file, source) {
  var errors = [];
  meta = meta || {};
  if (!String(meta.title || '').trim()) errors.push('Title is required');
  if (!String(meta.course || '').trim()) errors.push('Course is required');
  if (ITEM_TYPES.indexOf(meta.type) === -1) errors.push('Unknown type');
  if (!file || !file.base64) {
    errors.push('File is required');
  } else if (base64Bytes(file.base64) > MAX_BYTES) {
    errors.push('File is too big (max 25 MB)');
  }
  if (source) {
    if (!/\.(tex|zip)$/i.test(String(source.name || ''))) errors.push('Source must be a .tex or .zip file');
    else if (base64Bytes(source.base64) > MAX_BYTES) errors.push('Source is too big (max 25 MB)');
  }
  return { ok: errors.length === 0, errors: errors };
}

function applyReview(item, opts) {
  if (item.status !== 'pending') {
    return { ok: false, error: 'Already reviewed by ' + (item.reviewedBy || 'someone') };
  }
  if (opts.decision !== 'approve' && opts.decision !== 'reject') {
    return { ok: false, error: 'Unknown decision' };
  }
  if (opts.decision === 'reject' && !String(opts.reason || '').trim()) {
    return { ok: false, error: 'A reason is required to reject' };
  }
  var out = copy(item);
  out.status = opts.decision === 'approve' ? 'approved' : 'rejected';
  out.reviewedBy = opts.reviewer;
  out.reviewedAt = opts.at;
  out.rejectReason = opts.decision === 'reject' ? String(opts.reason).trim() : '';
  return { ok: true, item: out };
}

function applyEdits(item, edits) {
  var out = copy(item);
  Object.keys(edits || {}).forEach(function (k) {
    if (EDITABLE_FIELDS.indexOf(k) === -1) return;
    if (k === 'status') {
      if (edits.status === 'removed') out.status = 'removed';
      return;
    }
    out[k] = edits[k];
  });
  return out;
}

function copy(o) {
  var out = {};
  Object.keys(o).forEach(function (k) { out[k] = o[k]; });
  return out;
}
