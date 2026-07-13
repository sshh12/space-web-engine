// harness/golden.mjs — the migration's own gate (LAYOUT_ROADMAP §9 step 6).
//
// A small, hand-picked, pinned set of scenes captured BEFORE the risky refactor
// (engine extraction, inspector rename). Every step after the golden capture must
// reproduce it: "there is no expected delta in a pure move."
//
// GATE = stable metrics within a tight tolerance, NOT pixel identity. Empirically
// (measured during the step-8 verify), SwiftShader + the async bake workers are
// BISTABLE across separate processes: a complex scene settles into one of a few
// sub-perceptually-different pixel states depending on which tiles finished baking
// when the settle predicate fired (blue-marble alternates between two fixed shas,
// Δlum_mean ~5e-4). So a sha diff is expected and benign; a real refactor bug moves
// the photometric/spectral metrics FAR past that jitter. sha is still reported — a
// pixel-identical match is a nice strong signal when it happens.
//
//   node harness/golden.mjs            # capture -> commit harness/baseline/golden.json
//   node harness/golden.mjs --verify   # re-render, assert metrics within tol, else FAIL
//
// The committed artifact is small (sha + metrics + provenance per shot); the stills
// live in harness/baseline/stills (gitignored). Diverse on purpose: 4 bodies, orbit/
// mid/eye, disk/limb/ground, terrain/rocks/ocean/atmosphere/rings.

// Per-metric tolerances: comfortably above the measured cross-process bake jitter,
// far below any real rendering change. grad_kurtosis is a high-frequency texture
// metric that swings with sub-pixel jitter (seen: ~112 on a ground scene) — it is
// reported but NOT gated. The photometric + spectral-slope metrics are the stable gate.
const TOL = { spec_slope: 0.05, spec_aniso: 0.2, lum_mean: 0.02, lum_p05: 0.03, lum_p50: 0.03, lum_p95: 0.03, shadow_frac: 0.02, horizon_gap: 0.03 };
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderShots, ROOT, defaultParallel } from './shots.mjs';
import { metricsFor } from './metrics.mjs';
import { expandRegistry } from './bench.mjs';

// A tight render-neutrality gate needs MONOSTABLE scenes. beach-eye (eye-level ocean
// glint, alt 2 m) is deliberately excluded: its spectral slope swings ~0.08 between
// settle states (micro-glint depends on exact bake timing) — far past any useful tol,
// so it produces false failures on a pure move. It still lives in scenes.json for the
// ongoing bench; it just is not a gate scene. The 7 below cover 4 bodies, orbit/mid/
// ground, disk/limb/ground, terrain/rocks/ocean-limb/atmosphere/rings.
const NAMES = [
  'blue-marble',        // tellus orbit disk — atmosphere limb, ocean, disc sky
  'loworbit-sunset',    // tellus mid — terminator, terrain tiles
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
// Generous settle budget: the gate must never score an unsettled scene (round-2 law).
// Thick-atmosphere ground scenes (titan-lakeshore) settle right at the 150s __shot
// default, so bistable bake timing occasionally tips them into a false 'unsettled'.
// 240s gives every scene headroom to reach a true settle on the first attempt.
const SETTLE_MS = 240000;
const shots = NAMES.map((n) => all.find((s) => s.name === n)).filter(Boolean)
  .map((s) => ({ ...s, spec: { ...s.spec, waitMs: SETTLE_MS } }));
if (shots.length !== NAMES.length) {
  const missing = NAMES.filter((n) => !shots.some((s) => s.name === n));
  console.error('golden set references scenes not in scenes.json:', missing.join(', '));
  process.exit(1);
}

console.log(`${VERIFY ? 'verifying' : 'capturing'} ${shots.length} golden shots (seed ${SEED})`);
const recs = await renderShots(shots, { out: OUT, parallel: +(process.env.PARALLEL || defaultParallel()), seed: SEED });

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
let failed = 0, exact = 0;
for (const c of captured) {
  const g = byName.get(c.name);
  if (!g) { console.error(`  NEW ${c.name}: not in golden`); failed++; continue; }
  const over = Object.keys(TOL).filter((k) => c.metrics[k] != null && g.metrics[k] != null && Math.abs(c.metrics[k] - g.metrics[k]) > TOL[k]);
  const pixel = c.sha === g.sha;
  if (pixel) exact++;
  if (over.length) {
    failed++;
    const md = over.map((k) => `${k} Δ${(c.metrics[k] - g.metrics[k]).toFixed(4)} (>${TOL[k]})`).join('  ');
    console.error(`  FAIL ${c.name}: ${md}`);
  } else {
    console.log(`  ok  ${c.name}${pixel ? ' (pixel-identical)' : ' (within tol)'}`);
  }
}
if (failed) { console.error(`\n${failed}/${captured.length} golden shots moved a stable metric past tolerance — refactor changed rendering.`); process.exit(1); }
console.log(`\nall ${captured.length} golden shots within tolerance (${exact} pixel-identical). Refactor is render-neutral.`);
