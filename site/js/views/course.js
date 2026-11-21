import { coursePage, TYPE_LABELS } from '../lib/catalog.js';
import { esc, itemRow, courseOf } from './item.js';

export function render(el, params, catalog) {
  const course = courseOf(catalog, params.code);
  if (!course) {
    el.innerHTML = `<p class="empty">There's no course with code ${esc(params.code)}. <a href="#/">See all courses</a>.</p>`;
    return;
  }
  const page = coursePage(catalog.items, course.code);
  const total = page.startHere.length + page.groups.reduce((n, g) => n + g.items.length, 0);
  el.innerHTML = `
    <nav class="crumbs"><a href="#/sem/${course.semester}">Semester ${course.semester}</a></nav>
    <h1 class="course-title">${esc(course.name)}</h1>
    <p class="course-sub">${esc(course.code)}, ${total} file${total === 1 ? '' : 's'}</p>
    ${total === 0 ? `<p class="empty">Nothing here yet. If you have notes or papers for this course, <a href="#/upload?course=${esc(course.code)}">upload them</a>.</p>` : ''}
    ${page.startHere.length ? `
      <section class="start-here">
        <h2><mark>Start here</mark></h2>
        <p class="section-note">Picked by mods. Read these first.</p>
        <ul class="items">${page.startHere.map((i) => itemRow(i)).join('')}</ul>
      </section>` : ''}
    ${page.groups.map((g) => `
      <details class="group">
        <summary><span>${TYPE_LABELS[g.type]}</span><span class="group-count">${g.items.length}</span></summary>
        <ul class="items">${g.items.map((i) => itemRow(i)).join('')}</ul>
      </details>`).join('')}
  `;
  // With no picks, open the first group so the page isn't a wall of closed boxes.
  if (!page.startHere.length) el.querySelector('details.group')?.setAttribute('open', '');
}
