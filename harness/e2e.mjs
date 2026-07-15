// Phase 0 browser smoke: every body, SceneSpec round-trip, deterministic input,
// no page errors, and A -> B -> A metric equivalence on one live engine.
import { resolve } from 'node:path';
import { SYSTEM } from '../src/core/recipe.js';
import { renderShots, ROOT } from './shots.mjs';
import { metricsFor } from './metrics.mjs';

const epochS = 12_345_678;
const baseSpec = (body) => ({
  clean: true, body: body.id, epochS,
  lat: 0, lon: 0, alt: Math.max(body.R * 1.5, 100_000),
  yaw: 0, pitch: 0, mode: 'albedo', debris: false, clouds: false,
  waitMs: 180000,
});
const bodyShots = SYSTEM.bodies.map((body, i) => ({
  name: `e2e-body-${body.id}`,
  spec: baseSpec(body),
  input: i === 0 ? [
    { frame: 0, type: 'keydown', target: 'window', key: 'p' },
    { frame: 2, type: 'keydown', target: 'window', key: 'p' },
  ] : undefined,
  disk: true,
}));
const A = { ...baseSpec(SYSTEM.bodies[0]), lat: 11, lon: 22, alt: 8_000_000, mode: 'lit' };
const B = { ...baseSpec(SYSTEM.bodies[1]), lat: -17, lon: 91, alt: 5_000_000, mode: 'lit' };
const STRESS = structuredClone(SYSTEM);
STRESS.id = 'stress-30';
STRESS.bodies = Array.from({ length: 30 }, (_, i) => {
  const b = structuredClone(SYSTEM.bodies[i % SYSTEM.bodies.length]);
  b.id = `stress-${String(i).padStart(2, '0')}`;
  b.name = `Stress ${i}`; b.parent = 'star';
  delete b.skyHidden;
  if (b.orbit) { b.orbit.a = 8e9 + i * 1.1e9; b.orbit.periodDays = 20 + i; b.orbit.phase0 = i / 30; }
  return b;
});
const stressSpec = { ...baseSpec(STRESS.bodies[0]), body: STRESS.bodies[0].id };
const shots = [...bodyShots,
  { name: 'e2e-aba-a1', spec: A, disk: true },
  { name: 'e2e-aba-b', spec: B, disk: true },
  { name: 'e2e-aba-a2', spec: A, disk: true },
  { name: 'e2e-system-stress30', system: STRESS, spec: stressSpec, disk: true, waitAllDiscs: true },
  { name: 'e2e-system-demo-return', system: SYSTEM, spec: A, disk: true },
];

const recs = await renderShots(shots, {
  out: resolve(ROOT, 'harness/e2e-out'), parallel: 1, fast: true,
  seed: 20260712, recycle: shots.length + 1,
});
let failed = 0;
for (let i = 0; i < bodyShots.length; i++) {
  const r = recs[i], want = bodyShots[i].spec, got = r.captureSpec;
  if (!r.settled || r.errors.length) { console.error(`FAIL ${r.name}: ${r.errors.join(' | ') || 'unsettled'}`); failed++; continue; }
  for (const k of ['body', 'epochS', 'lat', 'lon', 'alt', 'yaw', 'pitch']) {
    if (got?.[k] !== want[k]) { console.error(`FAIL ${r.name}: round-trip ${k} ${got?.[k]} != ${want[k]}`); failed++; }
  }
}
const a1 = recs.find((r) => r.name === 'e2e-aba-a1');
const a2 = recs.find((r) => r.name === 'e2e-aba-a2');
if (!a1?.settled || !a2?.settled || a1.errors.length || a2.errors.length) failed++;
else {
  const x = metricsFor(a1.png, { disk: true, limb: true });
  const y = metricsFor(a2.png, { disk: true, limb: true });
  const tol = { spec_slope: 0.15, lum_mean: 0.03, shadow_frac: 0.03 };
  for (const [k, limit] of Object.entries(tol)) {
    const d = Math.abs(x[k] - y[k]);
    if (d > limit) { console.error(`FAIL A->B->A ${k}: ${d} > ${limit}`); failed++; }
  }
}
const stressRec = recs.find((r) => r.name === 'e2e-system-stress30');
const returnRec = recs.find((r) => r.name === 'e2e-system-demo-return');
if (!stressRec?.settled || stressRec.errors.length || stressRec.system?.id !== STRESS.id || stressRec.captureSpec?.body !== STRESS.bodies[0].id
  || stressRec.stream?.workerTiles > stressRec.stream?.workerBudget || stressRec.stream?.systemGeneration !== 1
  || !(stressRec.stream?.interactiveMs < 5000) || stressRec.stream?.disc !== 0 || !(stressRec.allDiscsMs < 60000)) failed++;
if (!returnRec?.settled || returnRec.errors.length || returnRec.system?.id !== SYSTEM.id || returnRec.captureSpec?.body !== A.body
  || returnRec.stream?.workerTiles > returnRec.stream?.workerBudget || returnRec.stream?.systemGeneration !== 2) failed++;
console.log(failed ? `${failed} e2e failure(s)` : `e2e passed: ${SYSTEM.bodies.length} bodies + six-body tour + deterministic input + A->B->A + setSystem demo->30->demo`);
process.exit(failed ? 1 : 0);
