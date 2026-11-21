import { post, getCatalog, clearCatalogCache, previewMode, mockMode } from '../api.js';
import { GOOGLE_CLIENT_ID } from '../config.js';
import { semesters, coursePage, search, TYPE_ORDER, TYPE_LABELS } from '../lib/catalog.js';
import { startHereChanges, fmtTime } from '../lib/mod.js';
import { esc, courseOf } from './item.js';

// Kept in memory only (never storage). Survives hash navigation, not a reload.
let session = null; // { token, email, role }

const TABS = [
  ['queue', 'Queue'], ['start', 'Start here'], ['library', 'Library'], ['activity', 'Activity'], ['owner', 'Mods'],
];

export function render(el, params) {
  if (!session) return renderSignIn(el, params);
  if (session.role === 'none') return renderNotMod(el, params);
  const tabs = TABS.filter(([id]) => id !== 'owner' || session.role === 'owner');
  const tab = tabs.some(([id]) => id === params.tab) ? params.tab : 'queue';
  el.innerHTML = `
    <div class="mod-head">
      <h1>Mod panel</h1>
      <p class="section-note">Signed in as ${esc(session.email)}${session.role === 'owner' ? ' (owner)' : ''}. <button class="link-btn" type="button" data-signout>Sign out</button></p>
    </div>
    <nav class="tabs" aria-label="Mod panel">
      ${tabs.map(([id, label]) => `<a href="#/mod?tab=${id}"${id === tab ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
    <div data-tab class="tab-body"><p class="loading">Loading…</p></div>`;
  el.querySelector('[data-signout]').addEventListener('click', () => {
    session = null;
    window.google?.accounts?.id?.disableAutoSelect();
    render(el, params);
  });
  const body = el.querySelector('[data-tab]');
  const views = { queue: tabQueue, start: tabStart, library: tabLibrary, activity: tabActivity, owner: tabOwner };
  views[tab](body, params).catch((err) => handleError(el, params, body, err));
}

function handleError(el, params, body, err) {
  if (err.code === 401 || err.code === 403) {
    session = null;
    render(el, params);
    el.querySelector('[data-signin-msg]').textContent = err.code === 401
      ? 'Your sign-in expired. Please sign in again.'
      : 'This account is no longer a mod.';
    return;
  }
  body.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
}

const call = (action, body = {}) => post(action, { idToken: session.token, ...body });

async function refreshCatalog() {
  clearCatalogCache();
  return getCatalog({ fresh: true });
}

// ---------------- Sign in ----------------

function renderSignIn(el, params) {
  el.innerHTML = `
    <h1>Mod panel</h1>
    <p class="lede">Mods review uploads and choose what goes under “Start here” on each course. Sign in with your Google account.</p>
    <p class="form-error" data-signin-msg role="alert"></p>
    <div data-signin></div>`;
  const slot = el.querySelector('[data-signin]');
  const onToken = async (token) => {
    try {
      session = { token, ...(await post('me', { idToken: token })) };
      render(el, params);
    } catch (err) {
      el.querySelector('[data-signin-msg]').textContent = err.message;
    }
  };

  if (mockMode) {
    slot.innerHTML = `<form class="inline-form" data-mock><label>Pretend to sign in as
      <input name="email" type="email" value="kgp.indu@gmail.com"></label><button class="btn">Sign in (mock)</button></form>
      <p class="hint">Mock mode: try kgp.indu@gmail.com (owner), mod@example.com (mod) or any other email (not a mod).</p>`;
    slot.querySelector('[data-mock]').addEventListener('submit', (e) => { e.preventDefault(); onToken(e.target.email.value); });
    return;
  }
  if (previewMode || !GOOGLE_CLIENT_ID) {
    slot.innerHTML = '<p class="notice">The site isn\'t connected to the server yet, so signing in is switched off.</p>';
    return;
  }
  loadGis().then(() => {
    window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onToken(r.credential) });
    window.google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'signin_with' });
  }).catch(() => {
    slot.innerHTML = '<p class="form-error">Couldn\'t load Google sign-in. Check your connection or ad blocker and reload.</p>';
  });
}

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}

function renderNotMod(el, params) {
  el.innerHTML = `
    <h1>Mod panel</h1>
    <p>You're signed in as ${esc(session.email)}, which isn't a mod account.</p>
    <p>Mods review uploads before they go live. If you'd like to help, ask to become one and the owner will see your request.</p>
    <p><button class="btn" type="button" data-request>Request to be a mod</button>
    <button class="btn btn-quiet" type="button" data-signout>Use a different account</button></p>
    <p class="notice success" data-done hidden>Request sent to the owner.</p>
    <p class="form-error" data-err></p>`;
  el.querySelector('[data-signout]').addEventListener('click', () => { session = null; render(el, params); });
  el.querySelector('[data-request]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await call('requestMod');
      el.querySelector('[data-done]').hidden = false;
    } catch (err) {
      el.querySelector('[data-err]').textContent = err.message;
      e.target.disabled = false;
    }
  });
}

// ---------------- Queue ----------------

function courseOptions(courses, selected) {
  return semesters(courses).map((s) => `<optgroup label="Semester ${s.semester}">${s.courses.map((c) =>
    `<option value="${esc(c.code)}"${c.code === selected ? ' selected' : ''}>${esc(c.short)} (${esc(c.code)})</option>`).join('')}</optgroup>`).join('');
}

async function tabQueue(body, params) {
  const [{ items }, catalog] = await Promise.all([call('pending'), getCatalog()]);
  if (!items.length) {
    body.innerHTML = '<p class="empty">Nothing waiting. New uploads show up here, and mods get an email at 8 am and 9 pm when something is waiting.</p>';
    return;
  }
  body.innerHTML = `<p class="section-note">${items.length} waiting, oldest first.</p>` +
    items.sort((a, b) => String(a.uploadedAt).localeCompare(String(b.uploadedAt))).map((it) => queueCard(it, catalog.courses)).join('');
  body.querySelectorAll('[data-card]').forEach((card) => wireQueueCard(card, items.find((x) => x.id === card.dataset.card), catalog, body, params));
}

function queueCard(it, courses) {
  const isOther = String(it.course).startsWith('OTHER:');
  const by = it.uploaderName || it.uploaderEmail ? `${esc(it.uploaderName || '')} ${it.uploaderEmail ? `&lt;${esc(it.uploaderEmail)}&gt;` : ''}`.trim() : 'anonymous';
  return `
  <article class="q-card" data-card="${esc(it.id)}">
    <header>
      <h3>${esc(it.title)}</h3>
      <p class="section-note">Uploaded by ${by}, ${esc(fmtTime(it.uploadedAt))}</p>
      <p><a href="${esc(it.fileUrl)}" target="_blank" rel="noopener">Open the file</a>${it.sourceUrl ? ` and <a href="${esc(it.sourceUrl)}" target="_blank" rel="noopener">its source (${esc(it.sourceName)})</a>` : ''}</p>
    </header>
    <form class="q-form" data-form>
      <label>Title<input name="title" type="text" value="${esc(it.title)}"></label>
      <label>Course<select name="course">
        ${isOther ? `<option value="${esc(it.course)}" selected>Not listed: ${esc(it.course.slice(6))}</option>` : ''}
        ${courseOptions(courses, it.course)}
        <option value="__new">Add a new course…</option>
      </select></label>
      <div class="new-course" data-newcourse hidden>
        <label>Code<input name="ncode" type="text" placeholder="IM31010"></label>
        <label>Name<input name="nname" type="text" value="${isOther ? esc(it.course.slice(6)) : ''}"></label>
        <label>Short name<input name="nshort" type="text" placeholder="Ergo"></label>
        <label>Semester<input name="nsem" type="number" min="1" max="10"></label>
        <button class="btn btn-small" type="button" data-savecourse>Add course</button>
      </div>
      <label>Type<select name="type">${TYPE_ORDER.map((t) => `<option value="${t}"${t === it.type ? ' selected' : ''}>${TYPE_LABELS[t]}</option>`).join('')}</select></label>
      <div class="field-row" data-pyq${it.type === 'pyq' ? '' : ' hidden'}>
        <label>Year<input name="year" type="number" value="${esc(it.year)}"></label>
        <label>Term<select name="term">${['', 'autumn', 'spring'].map((v) => `<option value="${v}"${v === it.term ? ' selected' : ''}>${v || '?'}</option>`).join('')}</select></label>
        <label>Exam<select name="exam">${['', 'midsem', 'endsem'].map((v) => `<option value="${v}"${v === it.exam ? ' selected' : ''}>${v || '?'}</option>`).join('')}</select></label>
      </div>
      <label class="span">Description<input name="description" type="text" value="${esc(it.description)}"></label>
      <div class="q-actions span">
        <button class="btn" type="button" data-approve>Approve</button>
        <input name="reason" type="text" placeholder="Reason, if rejecting" aria-label="Reason for rejecting">
        <button class="btn btn-danger" type="button" data-reject>Reject</button>
      </div>
      <p class="form-error span" data-err role="alert"></p>
    </form>
  </article>`;
}

function wireQueueCard(card, item, catalog, body, params) {
  const f = card.querySelector('[data-form]');
  const err = card.querySelector('[data-err]');
  const approve = card.querySelector('[data-approve]');
  const sync = () => {
    card.querySelector('[data-pyq]').hidden = f.type.value !== 'pyq';
    card.querySelector('[data-newcourse]').hidden = f.course.value !== '__new';
    const bad = f.course.value.startsWith('OTHER:') || f.course.value === '__new';
    approve.disabled = bad;
    approve.title = bad ? 'Pick an existing course or add one first' : '';
  };
  f.addEventListener('change', sync);
  sync();

  card.querySelector('[data-savecourse]').addEventListener('click', async () => {
    err.textContent = '';
    try {
      const { courses } = await call('saveCourse', { course: { code: f.ncode.value, name: f.nname.value, short: f.nshort.value, semester: f.nsem.value } });
      catalog.courses = courses;
      const code = f.ncode.value.trim().toUpperCase();
      f.course.innerHTML = courseOptions(courses, code) + '<option value="__new">Add a new course…</option>';
      f.course.value = code;
      clearCatalogCache();
      sync();
    } catch (e) { err.textContent = e.message; }
  });

  const decide = async (decision) => {
    err.textContent = '';
    if (decision === 'reject' && !f.reason.value.trim()) {
      err.textContent = 'Write a short reason so the next mod knows why.';
      f.reason.focus();
      return;
    }
    const edits = { title: f.title.value.trim(), course: f.course.value, type: f.type.value, description: f.description.value.trim() };
    if (f.type.value === 'pyq') Object.assign(edits, { year: Number(f.year.value) || '', term: f.term.value, exam: f.exam.value });
    card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await call('review', { id: item.id, decision, reason: f.reason.value.trim(), edits });
      clearCatalogCache();
      card.outerHTML = `<p class="notice success">${decision === 'approve' ? 'Approved' : 'Rejected'}: ${esc(edits.title)}</p>`;
    } catch (e) {
      if (e.code === 401 || e.code === 403) throw e;
      err.textContent = e.message;
      if (e.code === 409) setTimeout(() => tabQueue(body, params), 1500); // someone else got there first
      else { card.querySelectorAll('button').forEach((b) => { b.disabled = false; }); sync(); }
    }
  };
  approve.addEventListener('click', () => decide('approve').catch((e) => handleError(body.closest('main'), params, body, e)));
  card.querySelector('[data-reject]').addEventListener('click', () => decide('reject').catch((e) => handleError(body.closest('main'), params, body, e)));
}

// ---------------- Start here ----------------

async function tabStart(body, params) {
  const catalog = await refreshCatalog();
  const code = params.course && courseOf(catalog, params.course) ? params.course : catalog.courses[0]?.code;
  if (!code) { body.innerHTML = '<p class="empty">No courses yet.</p>'; return; }
  const items = catalog.items.filter((x) => x.course === code);
  const page = coursePage(catalog.items, code);
  const others = page.groups.flatMap((g) => g.items);
  body.innerHTML = `
    <label class="inline-label">Course <select data-course>${courseOptions(catalog.courses, code)}</select></label>
    <h2><mark>Start here</mark></h2>
    <p class="section-note">These show first on the course page, in this order. Keep it short: three to five things a junior should read first.</p>
    ${page.startHere.length ? `<ol class="pick-list">${page.startHere.map((it, i) => `
      <li><span>${esc(it.title)}</span>
        <span class="pick-actions">
          <button class="btn btn-small btn-quiet" data-act="up" data-id="${esc(it.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(it.title)} up">↑</button>
          <button class="btn btn-small btn-quiet" data-act="down" data-id="${esc(it.id)}" ${i === page.startHere.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(it.title)} down">↓</button>
          <button class="btn btn-small btn-quiet" data-act="remove" data-id="${esc(it.id)}">Remove</button>
        </span></li>`).join('')}</ol>` : '<p class="empty">No picks yet. Add a few from the list below.</p>'}
    <h2>Everything else</h2>
    <ul class="pick-list">${others.map((it) => `
      <li><span>${esc(it.title)} <span class="section-note">${esc(TYPE_LABELS[it.type])}</span></span>
        <button class="btn btn-small" data-act="add" data-id="${esc(it.id)}">Add to Start here</button></li>`).join('')}</ul>
    <p class="form-error" data-err role="alert"></p>`;
  body.querySelector('[data-course]').addEventListener('change', (e) => { location.hash = `#/mod?tab=start&course=${e.target.value}`; });
  body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    body.querySelectorAll('[data-act]').forEach((x) => { x.disabled = true; });
    try {
      for (const ch of startHereChanges(items, b.dataset.id, b.dataset.act)) {
        await call('update', { id: ch.id, edits: { startHere: ch.startHere, startOrder: ch.startOrder } });
      }
      await tabStart(body, { ...params, course: code });
    } catch (e) {
      if (e.code === 401 || e.code === 403) handleError(body.closest('main'), params, body, e);
      else body.querySelector('[data-err]').textContent = e.message;
    }
  }));
}

// ---------------- Library ----------------

async function tabLibrary(body, params) {
  const catalog = await refreshCatalog();
  const q = params.q || '';
  const list = q ? search(catalog.items, catalog.courses, q) : [...catalog.items].sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)));
  body.innerHTML = `
    <form class="inline-form" data-libsearch><label class="sr-only" for="lib-q">Search the library</label>
      <input id="lib-q" name="q" type="search" value="${esc(q)}" placeholder="Search live files"><button class="btn btn-quiet">Search</button></form>
    <p class="section-note">${list.length} live file${list.length === 1 ? '' : 's'}${q ? ' matching' : ', newest first'}.</p>
    <ul class="items">${list.slice(0, 100).map((it) => {
      const c = courseOf(catalog, it.course);
      return `<li class="lib-item" data-id="${esc(it.id)}">
        <div><strong>${esc(it.title)}</strong>
          <p class="item-meta">${esc(c?.short || it.course)}, ${esc(TYPE_LABELS[it.type])}. Approved by ${esc(it.reviewedBy || '?')}${it.reviewedAt ? `, ${esc(fmtTime(it.reviewedAt))}` : ''}</p></div>
        <div class="item-actions"><button class="btn btn-small btn-quiet" data-edit>Edit</button><button class="btn btn-small btn-danger" data-remove>Remove</button></div>
      </li>`;
    }).join('')}</ul>
    ${list.length > 100 ? '<p class="section-note">Showing the first 100. Search to narrow it down.</p>' : ''}`;
  body.querySelector('[data-libsearch]').addEventListener('submit', (e) => {
    e.preventDefault();
    location.hash = '#/mod?tab=library&q=' + encodeURIComponent(e.target.q.value.trim());
  });
  body.querySelectorAll('.lib-item').forEach((li) => {
    const it = list.find((x) => x.id === li.dataset.id);
    li.querySelector('[data-remove]').addEventListener('click', async () => {
      if (!confirm(`Remove “${it.title}” from the site? It moves to the Rejected folder in Drive, so it can be recovered.`)) return;
      await call('update', { id: it.id, edits: { status: 'removed' } }).catch((e) => alert(e.message));
      tabLibrary(body, params);
    });
    li.querySelector('[data-edit]').addEventListener('click', () => {
      li.innerHTML = `<form class="q-form" data-form>
        <label>Title<input name="title" value="${esc(it.title)}"></label>
        <label>Course<select name="course">${courseOptions(catalog.courses, it.course)}</select></label>
        <label>Type<select name="type">${TYPE_ORDER.map((t) => `<option value="${t}"${t === it.type ? ' selected' : ''}>${TYPE_LABELS[t]}</option>`).join('')}</select></label>
        <label class="span">Description<input name="description" value="${esc(it.description)}"></label>
        <div class="q-actions span"><button class="btn btn-small">Save</button><button class="btn btn-small btn-quiet" type="button" data-cancel>Cancel</button></div>
        <p class="form-error span" data-err></p></form>`;
      li.querySelector('[data-cancel]').addEventListener('click', () => tabLibrary(body, params));
      li.querySelector('[data-form]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await call('update', { id: it.id, edits: { title: f.title.value.trim(), course: f.course.value, type: f.type.value, description: f.description.value.trim() } });
          tabLibrary(body, params);
        } catch (err) { li.querySelector('[data-err]').textContent = err.message; }
      });
    });
  });
}

// ---------------- Activity ----------------

const ACTION_LABELS = {
  upload: 'uploaded', approve: 'approved', reject: 'rejected', edit: 'edited', remove: 'removed',
  'start-here': 'changed Start here for', course: 'saved course', 'request-mod': 'asked to be a mod',
  'mod-add': 'made a mod:', 'mod-remove': 'removed mod', 'mod-decline': 'declined mod request from', 'seed-import': 'imported',
};

async function tabActivity(body) {
  const { rows } = await call('activity', { limit: 200 });
  body.innerHTML = rows.length ? `
    <p class="section-note">Everything mods and the owner have done, newest first. This log can't be edited.</p>
    <table class="log-table"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(fmtTime(r.at))}</td><td>${esc(r.actor)}</td>
      <td>${esc(ACTION_LABELS[r.action] || r.action)} ${esc(r.detail || r.target)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="empty">No activity yet.</p>';
}

// ---------------- Owner ----------------

async function tabOwner(body, params) {
  const { mods, requests } = await call('mods');
  body.innerHTML = `
    <h2>Requests</h2>
    ${requests.length ? `<ul class="pick-list">${requests.map((r) => `
      <li><span>${esc(r.email)} <span class="section-note">${esc(fmtTime(r.requestedAt))}</span></span>
        <span class="pick-actions"><button class="btn btn-small" data-mod="add" data-email="${esc(r.email)}">Make mod</button>
        <button class="btn btn-small btn-quiet" data-mod="decline" data-email="${esc(r.email)}">Decline</button></span></li>`).join('')}</ul>`
      : '<p class="empty">No requests right now.</p>'}
    <h2>Mods</h2>
    ${mods.length ? `<ul class="pick-list">${mods.map((m) => `
      <li><span>${esc(m.email)} <span class="section-note">added by ${esc(m.addedBy)}</span></span>
        <button class="btn btn-small btn-danger" data-mod="remove" data-email="${esc(m.email)}">Remove</button></li>`).join('')}</ul>`
      : '<p class="empty">No mods yet. Add your team below.</p>'}
    <form class="inline-form" data-addmod><label class="sr-only" for="add-mod">Email</label>
      <input id="add-mod" name="email" type="email" placeholder="someone@gmail.com" required><button class="btn">Add mod</button></form>
    <p class="form-error" data-err role="alert"></p>`;
  const act = async (decision, email) => {
    if (decision === 'remove' && !confirm(`Remove ${email} as a mod? They lose access right away.`)) return;
    try {
      await call('setMod', { decision, email });
      tabOwner(body, params);
    } catch (e) { body.querySelector('[data-err]').textContent = e.message; }
  };
  body.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => act(b.dataset.mod, b.dataset.email)));
  body.querySelector('[data-addmod]').addEventListener('submit', (e) => { e.preventDefault(); act('add', e.target.email.value.trim()); });
}
