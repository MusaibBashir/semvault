// Shared rendering helpers for item rows.
import { driveUrls } from '../lib/catalog.js';

const SINGULAR = { formula: 'Formula sheet', notes: 'Notes', lab: 'Lab', assignment: 'Assignment', other: 'Other' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function courseOf(catalog, code) {
  return catalog.courses.find((c) => c.code === code);
}

function meta(item) {
  if (item.type !== 'pyq') return SINGULAR[item.type] || '';
  const exam = { midsem: 'Midsem', endsem: 'Endsem' }[item.exam] || 'Question paper';
  return [exam, item.term, item.year].filter(Boolean).join(' ');
}

export function sourceKind(item) {
  return /\.zip$/i.test(item.sourceName || '') ? '.zip' : '.tex';
}

// Sample data (dev/sample-catalog.json) points at Drive files that don't exist.
export const isSample = (fileId) => String(fileId || '').startsWith('sample-');

export function itemRow(item, { showCourse = null } = {}) {
  if (isSample(item.fileId)) return sampleRow(item, showCourse);
  const f = driveUrls(item.fileId);
  const s = item.sourceFileId ? driveUrls(item.sourceFileId) : null;
  return `
  <li class="item">
    <div class="item-text">
      <a class="item-title" href="${f.view}" target="_blank" rel="noopener">${esc(item.title)}</a>
      <p class="item-meta">${esc(meta(item))}${showCourse ? `, <a href="#/course/${esc(showCourse.code)}">${esc(showCourse.short)}</a>` : ''}</p>
      ${item.description ? `<p class="item-desc">${esc(item.description)}</p>` : ''}
    </div>
    <div class="item-actions">
      <a class="btn" href="${f.download}">Download PDF</a>
      ${s ? `<a class="btn btn-quiet" href="${s.download}" title="Give this to your AI agent to modify the PDF.">Source ${sourceKind(item)}</a>` : ''}
    </div>
    ${s ? '<p class="item-hint">Give this to your AI agent to modify the PDF.</p>' : ''}
  </li>`;
}

function sampleRow(item, showCourse) {
  return `
  <li class="item">
    <div class="item-text">
      <span class="item-title">${esc(item.title)}</span>
      <p class="item-meta">${esc(meta(item))}${showCourse ? `, <a href="#/course/${esc(showCourse.code)}">${esc(showCourse.short)}</a>` : ''}</p>
      ${item.description ? `<p class="item-desc">${esc(item.description)}</p>` : ''}
    </div>
    <div class="item-actions">
      <button class="btn" type="button" disabled title="Sample entry: there is no real file yet">Download PDF</button>
      ${item.sourceFileId ? `<button class="btn btn-quiet" type="button" disabled title="Sample entry: there is no real file yet">Source ${sourceKind(item)}</button>` : ''}
    </div>
    ${item.sourceFileId ? '<p class="item-hint">Give this to your AI agent to modify the PDF.</p>' : ''}
  </li>`;
}
