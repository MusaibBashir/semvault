// DEV ONLY. An in-browser stand-in for the Apps Script API so the mod panel can be tried
// before the real server exists. Turn on in the console with:
//   localStorage.setItem('semvault:mock', '1'); location.reload()
// The "token" is just the email you type at sign-in. Nothing here is used by the live site.

const OWNER = 'kgp.indu@gmail.com';
let state = null;

async function load() {
  if (state) return state;
  const saved = sessionStorage.getItem('semvault:mockstate');
  if (saved) return (state = JSON.parse(saved));
  const base = await (await fetch(new URL('./sample-catalog.json', import.meta.url))).json();
  const items = base.items.map((x) => ({ ...x, status: 'approved', uploaderEmail: '', rejectReason: '' }));
  items.push(
    { id: 'p1', course: 'IM31005', type: 'pyq', title: 'QDC midsem 2025', description: '', fileId: 'sample-p1', sourceFileId: '', sourceName: '', year: 2025, term: 'autumn', exam: 'midsem', uploaderName: 'A junior', uploaderEmail: 'junior@example.com', uploadedAt: '2026-11-21T03:00:00.000Z', status: 'pending', startHere: false, startOrder: '', reviewedBy: '', reviewedAt: '', rejectReason: '' },
    { id: 'p2', course: 'OTHER:Ergonomics IM31010', type: 'notes', title: 'Ergonomics crash notes', description: 'Anthropometry and work design', fileId: 'sample-p2', sourceFileId: 'sample-p2s', sourceName: 'ergo.tex', year: '', term: '', exam: '', uploaderName: '', uploaderEmail: '', uploadedAt: '2026-11-21T05:00:00.000Z', status: 'pending', startHere: false, startOrder: '', reviewedBy: '', reviewedAt: '', rejectReason: '' },
  );
  state = { courses: base.courses, items, mods: [{ email: 'mod@example.com', addedBy: OWNER, addedAt: '2026-11-20T00:00:00.000Z' }], requests: [{ email: 'wannabe@example.com', requestedAt: '2026-11-21T02:00:00.000Z' }], log: [] };
  return state;
}

function save() { sessionStorage.setItem('semvault:mockstate', JSON.stringify(state)); }
function fail(error, code = 400) { const e = new Error(error); e.code = code; throw e; }
function role(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return 'none';
  if (e === OWNER) return 'owner';
  return state.mods.some((m) => m.email === e) ? 'mod' : 'none';
}
function need(body, min) {
  const r = role(body.idToken);
  const rank = { none: 0, mod: 1, owner: 2 };
  if (!body.idToken) fail('Please sign in again', 401);
  if (rank[r] < rank[min]) fail('Not authorised', 403);
  return String(body.idToken).toLowerCase();
}
function log(actor, action, target, detail) { state.log.push({ at: new Date().toISOString(), actor, action, target, detail }); }
const find = (id) => state.items.find((x) => x.id === id) || fail('Item not found', 404);

export async function catalog() {
  await load();
  const strip = ({ uploaderEmail, status, rejectReason, reviewedBy, ...rest }) => rest;
  return { ok: true, courses: state.courses, items: state.items.filter((x) => x.status === 'approved').map(strip), updatedAt: new Date().toISOString() };
}

export async function handle(action, body) {
  await load();
  const out = (() => {
    switch (action) {
      case 'me': return { email: String(body.idToken).toLowerCase(), role: role(body.idToken) };
      case 'pending': need(body, 'mod'); return { items: state.items.filter((x) => x.status === 'pending').map((x) => ({ ...x, fileUrl: '#', sourceUrl: x.sourceFileId ? '#' : '' })) };
      case 'review': {
        const me = need(body, 'mod');
        const it = find(body.id);
        if (it.status !== 'pending') fail('Already reviewed by ' + it.reviewedBy, 409);
        Object.assign(it, body.edits || {});
        if (body.decision === 'approve' && String(it.course).startsWith('OTHER:')) fail('Pick an existing course (or add one) before approving');
        if (body.decision === 'reject' && !String(body.reason || '').trim()) fail('A reason is required to reject');
        Object.assign(it, { status: body.decision === 'approve' ? 'approved' : 'rejected', reviewedBy: me, reviewedAt: new Date().toISOString(), rejectReason: body.reason || '' });
        log(me, body.decision, it.id, it.title);
        return { item: it };
      }
      case 'update': {
        const me = need(body, 'mod');
        const it = find(body.id);
        Object.assign(it, body.edits);
        log(me, it.status === 'removed' ? 'remove' : 'edit', it.id, it.title);
        return { item: it };
      }
      case 'saveCourse': {
        const me = need(body, 'mod');
        const c = { ...body.course, code: String(body.course.code).toUpperCase(), semester: Number(body.course.semester) };
        if (!/^[A-Z]{2}\d{5}$/.test(c.code)) fail('Course code looks like IM31005');
        state.courses = state.courses.filter((x) => x.code !== c.code).concat([c]);
        log(me, 'course', c.code, c.name);
        return { courses: state.courses };
      }
      case 'library': need(body, 'mod'); return { items: state.items.filter((x) => x.status === 'approved') };
      case 'activity': need(body, 'mod'); return { rows: state.log.slice(-(body.limit || 200)).reverse() };
      case 'requestMod': {
        const me = String(body.idToken).toLowerCase();
        if (role(me) === 'none' && !state.requests.some((r) => r.email === me)) state.requests.push({ email: me, requestedAt: new Date().toISOString() });
        return {};
      }
      case 'mods': need(body, 'owner'); return { mods: state.mods, requests: state.requests };
      case 'setMod': {
        const me = need(body, 'owner');
        const e = String(body.email).toLowerCase();
        if (body.decision === 'add' && !state.mods.some((m) => m.email === e)) state.mods.push({ email: e, addedBy: me, addedAt: new Date().toISOString() });
        if (body.decision === 'add' || body.decision === 'decline') state.requests = state.requests.filter((r) => r.email !== e);
        if (body.decision === 'remove') state.mods = state.mods.filter((m) => m.email !== e);
        log(me, 'mod-' + body.decision, e, '');
        return { mods: state.mods, requests: state.requests };
      }
      case 'upload': return { id: 'mock' + Date.now() };
      default: fail('Unknown action');
    }
  })();
  save();
  return { ok: true, ...out };
}
