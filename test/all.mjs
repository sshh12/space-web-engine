// test/all.mjs — runs every pure-Node test (test/*-test.mjs) in its own process and
// aggregates. This is what `npm test` runs. Isolation-per-file keeps a crash in one
// suite from masking the others; a nonzero exit on ANY failure is the gate (round-4
// "fail loud, never score a corpse", applied to the unit layer).
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, '..');
const files = readdirSync(DIR).filter((f) => f.endsWith('-test.mjs')).sort();

let failed = 0;

// Typecheck FIRST (LAYOUT_ROADMAP §8): checkJs on the typed seams via tsc --noEmit.
// There is no CI — `npm test` is the only enforcement point, so a decaying tsconfig
// is caught here. Skips gracefully if typescript isn't installed yet.
const tsc = resolve(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
if (existsSync(tsc)) {
  process.stdout.write('\n=== typecheck (tsc --noEmit) ===\n');
  const r = spawnSync(tsc, ['--noEmit'], { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' });
  if (r.status !== 0) { failed++; process.stdout.write('FAIL  typecheck (exit ' + r.status + ')\n'); }
} else {
  process.stdout.write('\n(typecheck skipped: run `npm i` to install typescript)\n');
}
for (const f of files) {
  process.stdout.write(`\n=== ${f} ===\n`);
  const r = spawnSync(process.execPath, [resolve(DIR, f)], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; process.stdout.write(`FAIL  ${f} (exit ${r.status})\n`); }
}

process.stdout.write(`\n${failed ? `${failed} check(s) FAILED` : 'all checks passed'} (${files.length} suites + typecheck)\n`);
process.exit(failed ? 1 : 0);
