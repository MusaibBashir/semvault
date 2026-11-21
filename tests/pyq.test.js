import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePyqFilename } from '../site/js/lib/pyq.js';

test('parses the standard KGP question paper name', () => {
  assert.deepEqual(parsePyqFilename('12834_IM31005_QUALITY-DESIGN-AND-CONTROL_2025_autumn_endsem.pdf'),
    { course: 'IM31005', year: 2025, term: 'autumn', exam: 'endsem' });
});

test('parses End_Autumn style with a (1) duplicate suffix, first year wins', () => {
  assert.deepEqual(parsePyqFilename('2023_End_Autumn_Industrial_and_System_IM31005_Quality_Design_and_Control_EA_2022 (1).pdf'),
    { course: 'IM31005', year: 2023, term: 'autumn', exam: 'endsem' });
});

test('ignores a leading numeric id, handles & and End-Autumn', () => {
  const r = parsePyqFilename('11311_2024_End-Autumn_Industrial_&_Systems_Engineering_IM31005_Quality_Design_and_Control_2024.pdf');
  assert.equal(r.year, 2024);
  assert.equal(r.exam, 'endsem');
  assert.equal(r.course, 'IM31005');
});

test('parses MidSem with no term', () => {
  assert.deepEqual(parsePyqFilename('IM21203_EngEco_MidSem_2024_Solutions.pdf'),
    { course: 'IM21203', year: 2024, term: null, exam: 'midsem' });
});

test('returns all nulls for an ordinary name and never throws', () => {
  assert.deepEqual(parsePyqFilename('notes.pdf'), { course: null, year: null, term: null, exam: null });
  assert.deepEqual(parsePyqFilename(''), { course: null, year: null, term: null, exam: null });
  assert.deepEqual(parsePyqFilename(undefined), { course: null, year: null, term: null, exam: null });
});
