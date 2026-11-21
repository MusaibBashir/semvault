// Pure helpers for the mod panel.

const orderKey = (x) => (x.startOrder === '' || x.startOrder == null ? Infinity : Number(x.startOrder));

// Applies one Start-here action ('up' | 'down' | 'add' | 'remove') to a course's items and returns
// only the items whose {startHere, startOrder} must change, picks always numbered 1..n.
export function startHereChanges(items, id, action) {
  const picks = items.filter((x) => x.startHere).sort((a, b) => orderKey(a) - orderKey(b)).map((x) => x.id);
  const removed = [];
  const i = picks.indexOf(id);
  if (action === 'up' && i > 0) [picks[i - 1], picks[i]] = [picks[i], picks[i - 1]];
  if (action === 'down' && i !== -1 && i < picks.length - 1) [picks[i + 1], picks[i]] = [picks[i], picks[i + 1]];
  if (action === 'add' && i === -1) picks.push(id);
  if (action === 'remove' && i !== -1) removed.push(...picks.splice(i, 1));

  const byId = new Map(items.map((x) => [x.id, x]));
  const out = removed.map((rid) => ({ id: rid, startHere: false, startOrder: '' }));
  picks.forEach((pid, n) => {
    const cur = byId.get(pid);
    if (!cur.startHere || cur.startOrder !== n + 1) out.push({ id: pid, startHere: true, startOrder: n + 1 });
  });
  return out;
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
