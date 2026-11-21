// Loads Apps Script files (plain global functions, no modules) into one vm context.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../apps-script/', import.meta.url));

export function loadGas(...relPaths) {
  const ctx = vm.createContext({});
  for (const p of relPaths) {
    vm.runInContext(readFileSync(root + p, 'utf8'), ctx, { filename: p });
  }
  return ctx;
}
