// Pure role and log helpers.

function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function roleOf(email, ownerEmail, modEmails) {
  var e = normEmail(email);
  if (!e) return 'none';
  if (e === normEmail(ownerEmail)) return 'owner';
  var mods = (modEmails || []).map(normEmail);
  return mods.indexOf(e) === -1 ? 'none' : 'mod';
}

function logRow(actor, action, targetId, detail, atIso) {
  return [atIso, actor, action, targetId || '', detail || ''];
}
