import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semesters, coursePage, filterPyqs, search, driveUrls } from '../site/js/lib/catalog.js';

const courses = [
  { code: 'IM31005', name: 'Quality Design and Control', short: 'QDC', semester: 5 },
  { code: 'IM21203', name: 'Engineering Economy', short: 'EngEco', semester: 4 },
  { code: 'IM31003', name: 'Supply Chain Management', short: 'SCM', semester: 5 },
];
const it = (id, extra) => ({ id, course: 'IM31005', type: 'notes', title: id, description: '', startHere: false, startOrder: '', ...extra });

test('semesters groups courses ascending, courses sorted by code', () => {
  assert.deepEqual(semesters(courses).map((s) => [s.semester, s.courses.map((c) => c.code)]),
    [[4, ['IM21203']], [5, ['IM31003', 'IM31005']]]);
});

test('coursePage orders start-here by startOrder with blanks last', () => {
  const items = [it('c', { startHere: true }), it('b', { startHere: true, startOrder: 2 }), it('a', { startHere: true, startOrder: 1 })];
  assert.deepEqual(coursePage(items, 'IM31005').startHere.map((x) => x.id), ['a', 'b', 'c']);
});

test('coursePage groups the rest by type order and omits empty groups', () => {
  const items = [it('n'), it('p', { type: 'pyq' }), it('f', { type: 'formula' }), it('x', { course: 'IM31003', type: 'lab' })];
  const page = coursePage(items, 'IM31005');
  assert.deepEqual(page.groups.map((g) => g.type), ['formula', 'notes', 'pyq']);
  assert.deepEqual(page.startHere, []);
});

test('coursePage never shows items from other courses', () => {
  assert.equal(coursePage([it('x', { course: 'IM31003' })], 'IM31005').groups.length, 0);
});

const pyq = (id, course, year, term, exam) => it(id, { type: 'pyq', course, year, term, exam });
const pyqs = [pyq('a', 'IM31005', 2024, 'autumn', 'midsem'), pyq('b', 'IM31005', 2025, 'autumn', 'midsem'),
  pyq('c', 'IM31005', 2025, 'autumn', 'endsem'), pyq('d', 'IM21203', 2023, 'spring', 'endsem'), it('n')];

test('filterPyqs with no filter returns all pyqs, newest first, endsem before midsem', () => {
  assert.deepEqual(filterPyqs(pyqs, {}).map((x) => x.id), ['c', 'b', 'a', 'd']);
});

test('filterPyqs narrows by course, year, term and exam', () => {
  assert.deepEqual(filterPyqs(pyqs, { course: 'IM31005', exam: 'midsem' }).map((x) => x.id), ['b', 'a']);
  assert.deepEqual(filterPyqs(pyqs, { year: '2023' }).map((x) => x.id), ['d']);
  assert.deepEqual(filterPyqs(pyqs, { term: 'spring' }).map((x) => x.id), ['d']);
});

test('search matches title, description and course names, case-insensitive', () => {
  const items = [it('Control Charts'), it('z', { description: 'CUSUM and EWMA' }), it('y', { course: 'IM21203' })];
  assert.deepEqual(search(items, courses, 'control').map((x) => x.id), ['Control Charts', 'z']);
  assert.deepEqual(search(items, courses, 'ewma').map((x) => x.id), ['z']);
  assert.deepEqual(search(items, courses, 'engeco').map((x) => x.id), ['y']);
  assert.deepEqual(search(items, courses, '  '), []);
});

test('driveUrls builds view and download links', () => {
  assert.deepEqual(driveUrls('abc'), {
    view: 'https://drive.google.com/file/d/abc/view',
    download: 'https://drive.google.com/uc?export=download&id=abc',
  });
});
