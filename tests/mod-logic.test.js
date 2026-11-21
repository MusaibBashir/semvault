import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHereChanges } from '../site/js/lib/mod.js';

const it = (id, startHere, startOrder = '') => ({ id, startHere, startOrder });
const items = [it('a', true, 1), it('b', true, 2), it('c', true, 3), it('d', false)];

test('moving a pick up swaps it with the one above and renumbers', () => {
  assert.deepEqual(startHereChanges(items, 'b', 'up'), [
    { id: 'b', startHere: true, startOrder: 1 },
    { id: 'a', startHere: true, startOrder: 2 },
  ]);
});

test('moving the top pick up changes nothing', () => {
  assert.deepEqual(startHereChanges(items, 'a', 'up'), []);
});

test('adding a pick puts it last', () => {
  assert.deepEqual(startHereChanges(items, 'd', 'add'), [{ id: 'd', startHere: true, startOrder: 4 }]);
});

test('removing a pick closes the gap in the order', () => {
  assert.deepEqual(startHereChanges(items, 'a', 'remove'), [
    { id: 'a', startHere: false, startOrder: '' },
    { id: 'b', startHere: true, startOrder: 1 },
    { id: 'c', startHere: true, startOrder: 2 },
  ]);
});

test('picks with blank or messy order are renumbered 1..n, blanks last', () => {
  const messy = [it('x', true, ''), it('y', true, 5), it('z', true, 2)];
  assert.deepEqual(startHereChanges(messy, 'x', 'down'), [
    { id: 'z', startHere: true, startOrder: 1 },
    { id: 'y', startHere: true, startOrder: 2 },
    { id: 'x', startHere: true, startOrder: 3 },
  ]);
});
