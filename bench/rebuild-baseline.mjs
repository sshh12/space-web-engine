// Promote the current sweep to the baseline: copy metrics.json + exactly the
// stills it references (no orphan/scratch/_crop files). Mirrors the round-9
// rebuild discipline. node bench/rebuild-baseline.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, copyFileSync, existsSync } from 'fs';
import { resolve } from 'path';
const OUT = 'bench/out', BASE = 'bench/baseline';
const metrics = JSON.parse(readFileSync(resolve(OUT, 'metrics.json'), 'utf8'));
const want = new Set(metrics.map((m) => m.file)); // m.file is the still basename
mkdirSync(resolve(BASE, 'stills'), { recursive: true });
// clear the old baseline stills (drop orphans)
for (const f of readdirSync(resolve(BASE, 'stills'))) rmSync(resolve(BASE, 'stills', f));
let copied = 0, missing = 0;
for (const name of want) {
  const src = resolve(OUT, 'stills', name);
  if (existsSync(src)) { copyFileSync(src, resolve(BASE, 'stills', name)); copied++; }
  else { console.error('MISSING still for metric:', name); missing++; }
}
copyFileSync(resolve(OUT, 'metrics.json'), resolve(BASE, 'metrics.json'));
console.log(`baseline rebuilt: ${copied} stills copied, ${missing} missing, ${want.size} metrics`);
