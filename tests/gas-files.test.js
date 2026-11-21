import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../apps-script/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));

test('backend has the files the plan names', () => {
  for (const f of ['Catalog.js', 'Roles.js', 'Digest.js', 'Store.js', 'Auth.js', 'Api.js', 'Jobs.js']) {
    assert.ok(files.includes(f), f + ' missing');
  }
});

test('no two Apps Script files define the same global (they share one scope)', () => {
  const seen = {};
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))/gm)) {
      const name = m[1] || m[2];
      assert.ok(!seen[name], `${name} defined in both ${seen[name]} and ${f}`);
      seen[name] = f;
    }
  }
});

test('every Apps Script file parses and loads in one context', () => {
  const ctx = vm.createContext({});
  for (const f of files) vm.runInContext(readFileSync(new URL(f, dir), 'utf8'), ctx, { filename: f });
  for (const fn of ['doGet', 'doPost', 'setup', 'sendDigest', 'importSeed', 'verifyIdToken']) {
    assert.equal(typeof ctx[fn], 'function', fn);
  }
});
