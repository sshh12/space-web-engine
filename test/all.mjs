// test/all.mjs — runs every pure-Node test (test/*-test.mjs) in its own process and
// aggregates. This is what `npm test` runs. Isolation-per-file keeps a crash in one
// suite from masking the others; a nonzero exit on ANY failure is the gate (round-4
// "fail loud, never score a corpse", applied to the unit layer).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith('-test.mjs')).sort();

let failed = 0;
for (const f of files) {
  process.stdout.write(`\n=== ${f} ===\n`);
  const r = spawnSync(process.execPath, [resolve(DIR, f)], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; process.stdout.write(`FAIL  ${f} (exit ${r.status})\n`); }
}

process.stdout.write(`\n${files.length - failed}/${files.length} suites passed\n`);
process.exit(failed ? 1 : 0);
