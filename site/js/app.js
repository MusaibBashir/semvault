import { getCatalog, previewMode } from './api.js';
import { SITE_NAME } from './config.js';

const routes = [
  [/^\/?$/, 'home'],
  [/^\/sem\/(?<sem>\d+)$/, 'home'],
  [/^\/course\/(?<code>[^/]+)$/, 'course'],
  [/^\/pyqs$/, 'pyqs'],
  [/^\/search$/, 'search'],
  [/^\/upload$/, 'upload'],
  [/^\/mod$/, 'mod'],
];

const main = document.getElementById('main');

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  for (const [re, view] of routes) {
    const m = re.exec(path);
    if (m) {
      const params = Object.fromEntries(new URLSearchParams(query));
      return { view, params: { ...params, ...(m.groups ? { ...m.groups } : {}) } };
    }
  }
  return { view: null, params: {} };
}

let renderId = 0;

async function route() {
  const id = ++renderId;
  const { view, params } = parseHash();
  if (!view) {
    main.innerHTML = '<p class="empty">That page does not exist. <a href="#/">Go to all courses</a>.</p>';
    return;
  }
  main.setAttribute('aria-busy', 'true');
  main.innerHTML = '<p class="loading">Loading the library…</p>';
  try {
    const [mod, catalog] = await Promise.all([import(`./views/${view}.js`), getCatalog()]);
    if (id !== renderId) return; // a newer navigation won
    mod.render(main, params, catalog, { rerender: route });
    document.title = view === 'home' ? SITE_NAME : `${main.querySelector('h1')?.textContent} | ${SITE_NAME}`;
    document.body.dataset.view = view;
    const q = document.getElementById('header-q');
    if (q) q.value = view === 'search' ? params.q || '' : '';
    document.querySelectorAll('.site-nav a').forEach((a) => {
      a.toggleAttribute('aria-current', a.getAttribute('href') === `#/${view === 'home' ? '' : view}`);
    });
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="error"><p>Couldn't load the library. Check your connection and try again.</p>
      <button class="btn" type="button" data-retry>Try again</button></div>`;
    main.querySelector('[data-retry]').addEventListener('click', route);
  } finally {
    main.removeAttribute('aria-busy');
  }
  if (!params.sem) window.scrollTo(0, 0);
}

document.addEventListener('submit', (e) => {
  if (!e.target.matches('[data-search]')) return;
  e.preventDefault();
  const q = String(new FormData(e.target).get('q') || '').trim();
  if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
});

if (previewMode) document.querySelector('[data-preview-banner]').hidden = false;

window.addEventListener('hashchange', route);
route();
