import { filterPyqs, driveUrls } from '../lib/catalog.js';
import { esc, courseOf } from './item.js';

const EXAM = { midsem: 'Midsem', endsem: 'Endsem' };

export function render(el, params, catalog) {
  const all = filterPyqs(catalog.items, {});
  const courses = [...new Set(all.map((x) => x.course))]
    .map((c) => courseOf(catalog, c) || { code: c, short: c, name: c });
  const years = [...new Set(all.map((x) => x.year).filter(Boolean))].sort((a, b) => b - a);
  const opt = (v, label, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
  const f = { course: params.course || '', year: params.year || '', term: params.term || '', exam: params.exam || '' };

  el.innerHTML = `
    <h1>Question papers</h1>
    <form class="filters" data-pyq-filters>
      <label>Course<select name="course">${opt('', 'All courses', f.course)}${courses.map((c) => opt(c.code, `${c.short} (${c.code})`, f.course)).join('')}</select></label>
      <label>Year<select name="year">${opt('', 'Any year', f.year)}${years.map((y) => opt(y, y, f.year)).join('')}</select></label>
      <label>Term<select name="term">${opt('', 'Any term', f.term)}${opt('autumn', 'Autumn', f.term)}${opt('spring', 'Spring', f.term)}</select></label>
      <label>Exam<select name="exam">${opt('', 'Mid and end', f.exam)}${opt('midsem', 'Midsem', f.exam)}${opt('endsem', 'Endsem', f.exam)}</select></label>
    </form>
    <div data-pyq-results></div>`;

  const form = el.querySelector('[data-pyq-filters]');
  const out = el.querySelector('[data-pyq-results]');
  const draw = () => {
    const cur = Object.fromEntries(new FormData(form));
    const rows = filterPyqs(catalog.items, cur);
    const qs = new URLSearchParams(Object.entries(cur).filter(([, v]) => v)).toString();
    history.replaceState(null, '', '#/pyqs' + (qs ? '?' + qs : ''));
    if (rows.length === 0) {
      out.innerHTML = '<p class="empty">No papers match. Try clearing a filter.</p>';
      return;
    }
    out.innerHTML = `
      <p class="section-note">${rows.length} paper${rows.length === 1 ? '' : 's'}</p>
      <table class="pyq-table">
        <thead><tr><th>Course</th><th>Year</th><th>Exam</th><th>Paper</th><th><span class="sr-only">Download</span></th></tr></thead>
        <tbody>${rows.map((r) => {
          const c = courseOf(catalog, r.course) || { short: r.course };
          const u = driveUrls(r.fileId);
          return `<tr>
            <td data-label="Course"><a href="#/course/${esc(r.course)}">${esc(c.short)}</a></td>
            <td data-label="Year">${esc(r.year || '?')} ${esc(r.term || '')}</td>
            <td data-label="Exam">${esc(EXAM[r.exam] || '?')}</td>
            <td data-label="Paper"><a href="${u.view}" target="_blank" rel="noopener">${esc(r.title)}</a></td>
            <td class="pyq-dl"><a class="btn btn-small" href="${u.download}">Download</a></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  };
  form.addEventListener('change', draw);
  draw();
}
