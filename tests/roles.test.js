import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas.js';

const g = loadGas('Roles.js');

test('roleOf matches the owner ignoring case and spaces', () => {
  assert.equal(g.roleOf(' A@x.com ', 'a@x.com', []), 'owner');
});

test('roleOf finds a mod case-insensitively', () => {
  assert.equal(g.roleOf('b@x.com', 'a@x.com', ['B@x.com']), 'mod');
});

test('roleOf gives none to empty or unknown emails', () => {
  assert.equal(g.roleOf('', 'a@x.com', ['b@x.com']), 'none');
  assert.equal(g.roleOf(undefined, 'a@x.com', ['b@x.com']), 'none');
  assert.equal(g.roleOf('c@x.com', 'a@x.com', ['b@x.com']), 'none');
});

test('roleOf gives none once a mod is removed from the list', () => {
  assert.equal(g.roleOf('b@x.com', 'a@x.com', []), 'none');
});

test('logRow puts time, actor, action, target, detail in order', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(g.logRow('m@x.com', 'approve', 'it_1', 'QDC notes', '2026-11-21T00:00:00Z'))),
    ['2026-11-21T00:00:00Z', 'm@x.com', 'approve', 'it_1', 'QDC notes'],
  );
});
