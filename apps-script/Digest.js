// Pure: builds the twice-daily mod digest email, or null when nothing is pending.

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatIst(iso) {
  var d = new Date(new Date(iso).getTime() + 330 * 60000); // UTC+5:30
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
}

function courseLabel(code, courses) {
  if (String(code).indexOf('OTHER:') === 0) return String(code).slice(6) + ' (new course)';
  for (var i = 0; i < courses.length; i++) {
    if (courses[i].code === code) return courses[i].short || courses[i].name || code;
  }
  return code;
}

function buildDigest(pending, courses, modUrl, nowIso) {
  if (!pending || pending.length === 0) return null;
  var n = pending.length;
  var subject = 'Sem Vault: ' + n + ' upload' + (n === 1 ? '' : 's') + ' waiting for review';
  var lines = pending.map(function (it) {
    return '- ' + it.title + ' [' + courseLabel(it.course, courses || []) + '], uploaded ' + formatIst(it.uploadedAt);
  });
  var body = 'Hi mods,\n\n' + n + ' upload' + (n === 1 ? ' is' : 's are') + ' waiting for review:\n\n' +
    lines.join('\n') + '\n\nReview them here: ' + modUrl + '\n\n(Sent automatically at ' + formatIst(nowIso) + ' IST.)';
  return { subject: subject, body: body };
}
