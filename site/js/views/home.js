import { semesters } from '../lib/catalog.js';
import { esc } from './item.js';

export function render(el, params, catalog) {
  const counts = {};
  for (const it of catalog.items) counts[it.course] = (counts[it.course] || 0) + 1;
  const sems = semesters(catalog.courses);
  el.innerHTML = `
    <section class="intro">
      <h1>Notes, formula sheets and question papers from IM seniors, sorted by course.</h1>
      <form class="big-search" role="search" data-search>
        <label class="sr-only" for="home-q">Search</label>
        <input id="home-q" name="q" type="search" placeholder="Search a topic, course or code" autocomplete="off">
        <button class="btn" type="submit">Search</button>
      </form>
      <p class="intro-links"><a href="#/pyqs">Browse all question papers</a> or <a href="#/upload">upload something you have</a>.</p>
    </section>
    ${sems.length === 0 ? '<p class="empty">No courses yet. Mods add courses when they approve the first upload.</p>' : ''}
    ${sems.map((s) => `
      <section class="sem" id="sem-${s.semester}">
        <h2 class="sem-num"><span>Semester</span> ${s.semester}</h2>
        <ul class="course-list">
          ${s.courses.map((c) => `
            <li><a class="course-row" href="#/course/${esc(c.code)}">
              <span class="course-name">${esc(c.name)}</span>
              <span class="course-code">${esc(c.code)}</span>
              <span class="course-count">${counts[c.code] || 0} file${counts[c.code] === 1 ? '' : 's'}</span>
            </a></li>`).join('')}
        </ul>
      </section>`).join('')}
  `;
  if (params.sem) document.getElementById(`sem-${params.sem}`)?.scrollIntoView();
}
