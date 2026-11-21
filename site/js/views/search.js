import { search } from '../lib/catalog.js';
import { esc, itemRow, courseOf } from './item.js';

export function render(el, params, catalog) {
  const q = (params.q || '').trim();
  const needle = q.toLowerCase();
  const hits = search(catalog.items, catalog.courses, q);
  const courseHits = needle
    ? catalog.courses.filter((c) => [c.code, c.name, c.short].some((s) => String(s).toLowerCase().includes(needle)))
    : [];
  el.innerHTML = `
    <h1>Results for “${esc(q)}”</h1>
    ${courseHits.length ? `<p class="section-note">Courses: ${courseHits.map((c) => `<a href="#/course/${esc(c.code)}">${esc(c.name)}</a>`).join(', ')}</p>` : ''}
    ${hits.length
      ? `<ul class="items">${hits.map((i) => itemRow(i, { showCourse: courseOf(catalog, i.course) || { code: i.course, short: i.course } })).join('')}</ul>`
      : `<p class="empty">Nothing matches “${esc(q)}”. Try a course code like IM31005, or <a href="#/pyqs">browse question papers</a>.</p>`}
  `;
}
