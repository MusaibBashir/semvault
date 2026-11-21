import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { loadGas } from './gas.js';
import { uploadErrors } from '../site/js/lib/upload.js';

const gasDir = new URL('../apps-script/', import.meta.url);

test('#1 manifest grants userinfo.email when any file reads the effective user email', () => {
  const src = readdirSync(gasDir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, gasDir), 'utf8')).join('\n');
  const manifest = JSON.parse(readFileSync(new URL('appsscript.json', gasDir), 'utf8'));
  assert.ok(src.includes('Session.getEffectiveUser'));
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/userinfo.email'));
});

test('#2 seedImportAction finishes half-done items instead of losing them', () => {
  const g = loadGas('Seed.js');
  assert.equal(g.seedImportAction({ inCatalog: false, fileInSeed: true }), 'import');
  assert.equal(g.seedImportAction({ inCatalog: true, fileInSeed: true }), 'finish');
  assert.equal(g.seedImportAction({ inCatalog: true, fileInSeed: false }), 'skip');
  assert.equal(g.seedImportAction({ inCatalog: false, fileInSeed: false }), 'missing');
});

test('#3 public catalog does not expose mod emails', () => {
  const g = loadGas('Catalog.js');
  const out = g.publicView([{ id: 'a', status: 'approved', reviewedBy: 'mod@gmail.com', reviewedAt: 'x', title: 't' }]);
  assert.ok(!('reviewedBy' in out[0]));
  assert.equal(out[0].reviewedAt, 'x');
});

test('#4 sheetSafe stops user text from becoming a formula', () => {
  const g = loadGas('Catalog.js');
  assert.equal(g.sheetSafe('=IMAGE("https://x")'), '\'=IMAGE("https://x")');
  assert.equal(g.sheetSafe('+1'), "'+1");
  assert.equal(g.sheetSafe('-cmd'), "'-cmd");
  assert.equal(g.sheetSafe('@x'), "'@x");
  assert.equal(g.sheetSafe('Normal title'), 'Normal title');
  assert.equal(g.sheetSafe(2025), 2025);
  assert.equal(g.sheetSafe(true), true);
});

test('#5 catalog cache chunks stay under 100 KB in bytes and a cache failure is not fatal', () => {
  const stored = {};
  let puts = 0;
  const ctx = vm.createContext({
    CacheService: { getScriptCache: () => ({
      putAll(vals) {
        puts++;
        for (const [k, v] of Object.entries(vals)) {
          if (Buffer.byteLength(v, 'utf8') > 100 * 1024) throw new Error('Argument too large: value');
          stored[k] = v;
        }
      },
    }) },
  });
  for (const f of ['Catalog.js', 'Store.js']) vm.runInContext(readFileSync(new URL(f, gasDir), 'utf8'), ctx);
  const s = '–'.repeat(60000); // en dash: 3 bytes each, 180 KB
  assert.doesNotThrow(() => ctx.cachePutCatalog(s));
  assert.equal(puts, 1);
  const n = Number(stored['catalog:n']);
  let joined = '';
  for (let i = 0; i < n; i++) joined += stored['catalog:' + i];
  assert.equal(joined, s);

  const failing = vm.createContext({ CacheService: { getScriptCache: () => ({ putAll() { throw new Error('boom'); } }) } });
  for (const f of ['Catalog.js', 'Store.js']) vm.runInContext(readFileSync(new URL(f, gasDir), 'utf8'), failing);
  assert.doesNotThrow(() => failing.cachePutCatalog('x'));
});

test('#6 file plus source over 35 MB together is blocked in the browser', () => {
  const MB = 1024 * 1024;
  const e = uploadErrors({ title: 'a', course: 'IM31005', file: { name: 'a.pdf', size: 20 * MB }, source: { name: 'a.zip', size: 20 * MB } });
  assert.equal(e.source, 'File and source together must be under 35 MB');
});

test('#6 server refuses file plus source over 35 MB together', () => {
  const g = loadGas('Catalog.js');
  const b64 = (mb) => 'A'.repeat(Math.ceil(mb * 1024 * 1024 * 4 / 3));
  const r = g.validateUpload({ course: 'IM31005', type: 'notes', title: 't' }, { name: 'a.pdf', base64: b64(20) }, { name: 'a.zip', base64: b64(20) });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => x.includes('35 MB')));
});

test('#4 reading a row back removes the protective apostrophe', () => {
  const g = loadGas('Catalog.js');
  const row = g.itemToRow({ id: 'a', title: "'=1+1", description: "'-dash", status: 'approved' });
  const it = g.rowToItem(row);
  assert.equal(it.title, '=1+1');
  assert.equal(it.description, '-dash');
  assert.equal(g.sheetUnsafe("'@x"), '@x');
  assert.equal(g.sheetUnsafe("it's fine"), "it's fine");
});
