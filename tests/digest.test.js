import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas.js';

const g = loadGas('Digest.js');
const courses = [{ code: 'IM31005', name: 'Quality Design and Control', short: 'QDC', semester: 5 }];
const item = (id, title) => ({ id, title, course: 'IM31005', uploadedAt: '2026-11-21T04:30:00.000Z', status: 'pending' });
const url = 'https://example.github.io/semvault/#/mod';

test('buildDigest returns null when nothing is pending', () => {
  assert.equal(g.buildDigest([], courses, url, '2026-11-21T00:00:00Z'), null);
});

test('buildDigest subject counts uploads, plural', () => {
  const d = g.buildDigest([item('a', 'One'), item('b', 'Two')], courses, url, '2026-11-21T00:00:00Z');
  assert.equal(d.subject, 'Sem Vault: 2 uploads waiting for review');
});

test('buildDigest subject singular for one upload', () => {
  const d = g.buildDigest([item('a', 'One')], courses, url, '2026-11-21T00:00:00Z');
  assert.equal(d.subject, 'Sem Vault: 1 upload waiting for review');
});

test('buildDigest body lists titles with course short name and time, and links the panel', () => {
  const d = g.buildDigest([item('a', 'Control charts'), { ...item('b', 'Mystery'), course: 'OTHER:Ergonomics' }], courses, url, '2026-11-21T00:00:00Z');
  assert.match(d.body, /Control charts/);
  assert.match(d.body, /QDC/);
  assert.match(d.body, /Ergonomics/);
  assert.match(d.body, /21 Nov/);
  assert.ok(d.body.includes(url));
});
