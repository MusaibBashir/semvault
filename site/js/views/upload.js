import { post, previewMode } from '../api.js';
import { semesters, TYPE_ORDER } from '../lib/catalog.js';
import { parsePyqFilename } from '../lib/pyq.js';
import { uploadErrors, readBase64 } from '../lib/upload.js';
import { esc } from './item.js';

const TYPE_HELP = {
  formula: 'Formula sheet', notes: 'Notes', pyq: 'Question paper', lab: 'Lab (reports, viva guides)',
  assignment: 'Assignment', other: 'Something else',
};

export function render(el, params, catalog) {
  const years = [];
  for (let y = new Date().getFullYear(); y >= 2010; y--) years.push(y);
  el.innerHTML = `
    <h1>Upload</h1>
    <p class="lede">Share notes, formula sheets or question papers. A mod checks every upload before it goes on the site, usually within a day.</p>
    ${previewMode ? '<p class="notice">Preview mode: the site isn\'t connected to the server yet, so uploads are switched off.</p>' : ''}
    <form class="upload-form" novalidate data-upload>
      <div class="field">
        <label for="up-file">File</label>
        <input id="up-file" name="file" type="file" required>
        <p class="hint">Usually a PDF. Max 25 MB. Question papers downloaded from the KGP library site fill in the details below by themselves.</p>
        <p class="form-error" data-err="file"></p>
      </div>
      <div class="field">
        <label for="up-course">Course</label>
        <select id="up-course" name="course" required>
          <option value="">Pick a course</option>
          ${semesters(catalog.courses).map((s) => `
            <optgroup label="Semester ${s.semester}">
              ${s.courses.map((c) => `<option value="${esc(c.code)}"${params.course === c.code ? ' selected' : ''}>${esc(c.name)} (${esc(c.code)})</option>`).join('')}
            </optgroup>`).join('')}
          <option value="OTHER:">Not listed</option>
        </select>
        <div class="field-extra" data-other hidden>
          <label for="up-other">Course name and code</label>
          <input id="up-other" name="other" type="text" placeholder="e.g. Ergonomics, IM31010">
        </div>
        <p class="form-error" data-err="course"></p>
      </div>
      <fieldset class="field">
        <legend>What is it?</legend>
        <div class="chips">
          ${TYPE_ORDER.map((t, i) => `<label class="chip"><input type="radio" name="type" value="${t}"${i === 1 ? ' checked' : ''}><span>${TYPE_HELP[t]}</span></label>`).join('')}
        </div>
      </fieldset>
      <div class="field-row" data-pyq hidden>
        <label>Year<select name="year"><option value="">?</option>${years.map((y) => `<option>${y}</option>`).join('')}</select></label>
        <label>Term<select name="term"><option value="">?</option><option value="autumn">Autumn</option><option value="spring">Spring</option></select></label>
        <label>Exam<select name="exam"><option value="">?</option><option value="midsem">Midsem</option><option value="endsem">Endsem</option></select></label>
      </div>
      <div class="field">
        <label for="up-title">Title</label>
        <input id="up-title" name="title" type="text" required placeholder="e.g. Control charts summary">
        <p class="form-error" data-err="title"></p>
      </div>
      <div class="field">
        <label for="up-desc">What's in it? <span class="optional">optional</span></label>
        <textarea id="up-desc" name="description" rows="2" placeholder="One line on what it covers"></textarea>
      </div>
      <div class="field">
        <label for="up-source">LaTeX source <span class="optional">optional</span></label>
        <input id="up-source" name="source" type="file" accept=".tex,.zip">
        <p class="hint">If the PDF was made from LaTeX (for example by Claude or ChatGPT), add the .tex, or a .zip of the .tex with its figures. Then the next person can ask their AI agent to modify it instead of starting over.</p>
        <p class="form-error" data-err="source"></p>
      </div>
      <div class="field-row">
        <label>Your name <span class="optional">optional</span><input name="uploaderName" type="text" autocomplete="name"></label>
        <label>Email <span class="optional">optional, only mods see it</span><input name="uploaderEmail" type="email" autocomplete="email"></label>
      </div>
      <div class="hp" aria-hidden="true"><label>Leave this empty<input name="hp" type="text" tabindex="-1" autocomplete="off"></label></div>
      <p class="form-error" data-err="server" role="alert"></p>
      <button class="btn btn-big" type="submit">Upload for review</button>
    </form>`;

  const form = el.querySelector('[data-upload]');
  const $ = (s) => form.querySelector(s);
  const showPyq = () => { $('[data-pyq]').hidden = form.type.value !== 'pyq'; };
  const showOther = () => { $('[data-other]').hidden = form.course.value !== 'OTHER:'; };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') showPyq();
    if (e.target.name === 'course') showOther();
    if (e.target.name === 'file') prefill(form, catalog, e.target.files[0]);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = form.file.files[0] || null;
    const source = form.source.files[0] || null;
    const course = form.course.value === 'OTHER:' ? 'OTHER:' + form.other.value.trim() : form.course.value;
    const errors = uploadErrors({ title: form.title.value, course, file, source });
    form.querySelectorAll('[data-err]').forEach((p) => { p.textContent = errors[p.dataset.err] || ''; });
    if (Object.keys(errors).length) {
      form.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      return;
    }
    const btn = $('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Uploading…';
    try {
      const meta = {
        course, type: form.type.value, title: form.title.value.trim(), description: form.description.value.trim(),
        year: form.year.value, term: form.term.value, exam: form.exam.value,
        uploaderName: form.uploaderName.value.trim(), uploaderEmail: form.uploaderEmail.value.trim(),
      };
      const body = {
        meta,
        hp: form.hp.value,
        file: { name: file.name, mimeType: file.type || 'application/pdf', base64: await readBase64(file) },
      };
      if (source) body.source = { name: source.name, mimeType: source.type || 'application/octet-stream', base64: await readBase64(source) };
      await post('upload', body);
      el.innerHTML = `
        <h1>Thanks, it's in the queue</h1>
        <p class="notice success">“${esc(meta.title)}” was uploaded. A mod will review it, usually within a day, and then it shows up on the course page.</p>
        <p><a class="btn" href="#/upload" data-again>Upload another</a> <a class="btn btn-quiet" href="#/">Back to courses</a></p>`;
      el.querySelector('[data-again]').addEventListener('click', (ev) => { ev.preventDefault(); render(el, params, catalog); });
    } catch (err) {
      $('[data-err="server"]').textContent = `Upload failed: ${err.message}`;
      btn.disabled = false;
      btn.textContent = 'Upload for review';
    }
  });

  showPyq();
  showOther();
}

function prefill(form, catalog, file) {
  if (!file) return;
  const p = parsePyqFilename(file.name);
  if (p.course && catalog.courses.some((c) => c.code === p.course)) form.course.value = p.course;
  if (p.exam) {
    form.querySelector('input[name="type"][value="pyq"]').checked = true;
    form.querySelector('[data-pyq]').hidden = false;
  }
  if (p.year && [...form.year.options].some((o) => o.value === String(p.year))) form.year.value = String(p.year);
  if (p.term) form.term.value = p.term;
  if (p.exam) form.exam.value = p.exam;
  if (!form.title.value.trim()) {
    const course = catalog.courses.find((c) => c.code === p.course);
    form.title.value = p.exam && course
      ? `${course.short} ${p.exam} ${p.year || ''}`.trim()
      : file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  }
}

