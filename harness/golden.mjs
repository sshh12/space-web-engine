// harness/golden.mjs — the migration's own gate (LAYOUT_ROADMAP §9 step 6).
//
// A small, hand-picked, pinned set of scenes captured BEFORE the risky refactor
// (engine extraction, inspector rename). SwiftShader is byte-deterministic on this
// backend, so the gate is pixel identity: every step after the golden capture must
// reproduce the exact PNG bytes. "There is no expected delta in a pure move" — any
// sha mismatch is a refactor bug by definition.
//
//   node harness/golden.mjs            # capture -> commit harness/baseline/golden.json
//   node harness/golden.mjs --verify   # re-render, assert pixel-identical, else FAIL
//
// The committed artifact is small (sha + metrics + provenance per shot); the stills
// live in harness/baseline/stills (gitignored). Diverse on purpose: 4 bodies, orbit/
// mid/eye, disk/limb/ground, terrain/rocks/ocean/atmosphere/rings.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderShots, ROOT } from './shots.mjs';
import { metricsFor } from './metrics.mjs';
import { expandRegistry } from './bench.mjs';

const NAMES = [
  'blue-marble',        // tellus orbit disk — atmosphere limb, ocean, disc sky
  'loworbit-sunset',    // tellus mid — terminator, terrain tiles
  'beach-eye',          // tellus eye-level — ocean shore, debris scatter
  'earthrise',          // luna disk — companion body in sky
  'luna-boulderfield',  // luna ground — rock impostor/mesh handoff
  'rubra-canyon-dawn',  // rubra 3 km — strata/tectonics relief
  'titan-lakeshore',    // titan ground — thick-atmosphere scattering
  'rubra-disk',         // rubra orbit disk — dust limb, §11 disc
];
const GOLDEN = resolve(ROOT, 'harness/baseline/golden.json');
const OUT = resolve(ROOT, 'harness/baseline');
const SEED = 20260712;   // pinned; icons carry no controls, seed rides provenance only

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const VERIFY = process.argv.includes('--verify');

const all = expandRegistry(null);
const shots = NAMES.map((n) => all.find((s) => s.name === n)).filter(Boolean);
if (shots.length !== NAMES.length) {
  const missing = NAMES.filter((n) => !shots.some((s) => s.name === n));
  console.error('golden set references scenes not in scenes.json:', missing.join(', '));
  process.exit(1);
}

console.log(`${VERIFY ? 'verifying' : 'capturing'} ${shots.length} golden shots (seed ${SEED})`);
const recs = await renderShots(shots, { out: OUT, parallel: +(process.env.PARALLEL || 2), seed: SEED });

const broken = recs.filter((r) => r.errors.length || !r.settled);
if (broken.length) {
  console.error(`\n${broken.length} shot(s) broken/unsettled — cannot ${VERIFY ? 'verify' : 'capture'}:`);
  for (const r of broken) console.error(`  ${r.name}: ${r.errors.join(' | ') || 'unsettled'}`);
  process.exit(1);
}

const captured = recs.map((r) => {
  const shot = shots.find((s) => s.name === r.name);
  return { name: r.name, sha: sha(r.png), metrics: metricsFor(r.png, { disk: shot.disk, limb: shot.disk && !shot.noLimb }) };
});

if (!VERIFY) {
  mkdirSync(OUT, { recursive: true });
  const provenance = { ...recs[0].provenance, seed: SEED, capturedFor: 'migration golden (pixel-identity gate)' };
  writeFileSync(GOLDEN, JSON.stringify({ provenance, shots: captured }, null, 1));
  console.log(`\nwrote ${GOLDEN} (${captured.length} shots)`);
  console.log('commit it — steps 7 & 8 must reproduce these exact bytes.');
  process.exit(0);
}

// --verify: compare against the committed golden, byte for byte.
if (!existsSync(GOLDEN)) { console.error('no golden.json — run without --verify first'); process.exit(1); }
const gold = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const byName = new Map(gold.shots.map((s) => [s.name, s]));
let diffs = 0;
for (const c of captured) {
  const g = byName.get(c.name);
  if (!g) { console.error(`  NEW ${c.name}: not in golden`); diffs++; continue; }
  if (c.sha !== g.sha) {
    diffs++;
    const mk = ['spec_slope', 'grad_kurtosis', 'shadow_frac', 'lum_mean'];
    const md = mk.map((k) => `${k} ${(c.metrics[k] - g.metrics[k]).toFixed(4)}`).join('  ');
    console.error(`  DIFF ${c.name}: pixels changed (${g.sha.slice(0, 12)} -> ${c.sha.slice(0, 12)})  Δ[${md}]`);
  } else {
    console.log(`  ok  ${c.name}`);
  }
}
if (diffs) { console.error(`\n${diffs}/${captured.length} golden shots CHANGED — refactor is not byte-identical.`); process.exit(1); }
console.log(`\nall ${captured.length} golden shots pixel-identical to baseline.`);
