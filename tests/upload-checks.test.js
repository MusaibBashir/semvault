import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadErrors, MAX_BYTES } from '../site/js/lib/upload.js';

const ok = { title: 'Notes', course: 'IM31005', type: 'notes', file: { name: 'a.pdf', size: 1000 }, source: null };

test('a valid upload has no errors', () => {
  assert.deepEqual(uploadErrors(ok), {});
});

test('a file over 25 MB is blocked with a clear message', () => {
  assert.equal(uploadErrors({ ...ok, file: { name: 'a.pdf', size: 30 * 1024 * 1024 } }).file, 'Max 25 MB per file');
});

test('a missing file, title or course is flagged', () => {
  const e = uploadErrors({ ...ok, title: ' ', course: '', file: null });
  assert.equal(e.title, 'Give it a title');
  assert.equal(e.course, 'Pick a course');
  assert.equal(e.file, 'Choose a file');
});

test('a not-listed course needs a name', () => {
  assert.equal(uploadErrors({ ...ok, course: 'OTHER:' }).course, 'Type the course name');
  assert.deepEqual(uploadErrors({ ...ok, course: 'OTHER:Ergonomics' }), {});
});

test('the source must be .tex or .zip and under 25 MB', () => {
  assert.equal(uploadErrors({ ...ok, source: { name: 'a.docx', size: 10 } }).source, 'Source must be a .tex or .zip file');
  assert.equal(uploadErrors({ ...ok, source: { name: 'a.zip', size: MAX_BYTES + 1 } }).source, 'Max 25 MB per file');
  assert.deepEqual(uploadErrors({ ...ok, source: { name: 'Sheet.TEX', size: 10 } }), {});
});
