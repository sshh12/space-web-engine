// harness/warp-e2e.mjs — Phase W gates (round 24), composed over the renderShots
// kernel exactly like motion.mjs:
//
//   1. DETENT LADDER — fixed camera, every major detent, a deterministic
//      stepped-epoch sequence (epoch_i = E0 + i·warp/30: the frames a 30 fps
//      free-run would present) captured settled under the declared-warp
//      frozen-epoch law. Live AE (no fixedEV): this is also the AE-under-warp
//      instrument. Budgets are pre-registered per detent (the world LEGITIMATELY
//      changes more per frame at decade/s — the envelope records that honestly).
//   2. BAND-EDGE CROSSINGS — warp-cross-{clouds,detail,lightning}: one pose and
//      ONE pinned epoch, declared warp swept through the edge in both directions
//      (0.6·e → 1.5·e → 0.6·e). Below-band frames at equal warp must agree on
//      the return leg (no retained representation state — the F2 class); the
//      crossing pair is the same-epoch below/above A/B whose mean-luminance
//      agreement is the mean-preservation law as an image gate. fixedEV: these
//      measure the WORLD's representation switch, never the meter.
//
//   node harness/warp-e2e.mjs                  # gate vs harness/baseline/warp.json
//   node harness/warp-e2e.mjs --system sol     # one system (default: both)
//   node harness/warp-e2e.mjs --measure        # write measured budgets (×1.5 + floor)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderShots, ROOT, defaultParallel } from './shots.mjs';
import { sequenceMetrics } from './metrics.mjs';
import { readPNG, luminance } from './png.mjs';
import { WARP_POLICY } from '../src/core/warp.js';
import { epochFromViews } from '../src/core/time.js';
import { ephemeris } from '../src/core/frames.js';
import { SYSTEM } from '../src/core/recipe.js';
import { SOL_SYSTEM } from '../src/core/sol.js';

const BASELINE = resolve(ROOT, 'harness/baseline/warp.json');
const args = process.argv.slice(2);
const MEASURE = args.includes('--measure');
const sysArg = args.includes('--system') ? args[args.indexOf('--system') + 1] : 'both';
const SYSTEMS = sysArg === 'both' ? ['demo', 'sol'] : [sysArg];

// major detents (0 and the near-duplicates trimmed: pause has nothing to
// flicker; 60/month are covered by their neighbours). 5 rates x 5 frames.
const LADDER = [1, 3600, 86400, 31557600, 315576000];
const FRAMES = 5;
// crossing sweep multipliers: below, below, above, above, below, below — the
// return leg proves purity (no retained state), the middle pair is the A/B.
const SWEEP = [0.6, 0.9, 1.15, 1.5, 0.9, 0.6];

function shotsFor(systemName) {
  const system = systemName === 'sol' ? SOL_SYSTEM : SYSTEM;
  const tellus = system.bodies.find((b) => b.id === 'tellus');
  // Solve the epoch for a target sun elevation at the pose (the solvePhase
  // pattern): the sol re-homing moved tellus's subsolar geometry, so a demo
  // tday constant would land the sol gates on the night side.
  const epochAtElev = (lat, lon, target) => {
    const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    const up = [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
    let best = 0, bestErr = Infinity;
    for (let i = 0; i < 1024; i++) {
      const t = epochFromViews(tellus, { season: 0.15, tday: i / 1024 }, system);
      const s = ephemeris(tellus, t, system).sunDirBF;
      const err = Math.abs(up[0] * s[0] + up[1] * s[1] + up[2] * s[2] - target);
      if (err < bestErr) { bestErr = err; best = t; }
    }
    return best;
  };
  const settle = (i) => ({ waitMs: i ? 90000 : 150000 });
  const shots = [];
  const ladderE = epochAtElev(-18, -172, 0.35);
  for (const warp of LADDER) {
    shots.push({
      name: `detent-${systemName}-${warp}`, kind: 'ladder', warp,
      frames: Array.from({ length: FRAMES }, (_, i) => ({
        body: 'tellus', lat: -18, lon: -172, alt: 400000, clean: true,
        epochS: ladderE + i * warp / 30, warp, ...settle(i),
      })),
    });
  }
  const edges = {
    clouds: { edge: WARP_POLICY.clouds.maxRate,
      pose: { body: 'tellus', lat: -49, lon: -110, alt: 3000, pitch: 25, fov: 60, epochS: epochAtElev(-49, -110, 0.55) } },
    detail: { edge: WARP_POLICY['ocean-waves'].maxRate,
      pose: { body: 'tellus', lat: -20, lon: -175, alt: 900, yaw: -103, pitch: 18, epochS: epochAtElev(-20, -175, 0.4) } },
    lightning: { edge: WARP_POLICY.lightning.maxRate,
      // just past dusk over the cumulus deck, epoch pinned just after a
      // flash-bucket boundary so a below-band flash (if this bucket fires)
      // is near peak
      pose: { body: 'tellus', lat: -49, lon: -110, alt: 3000, pitch: 25, fov: 60,
        epochS: Math.floor(epochAtElev(-49, -110, -0.06) / 4) * 4 + 0.2 } },
  };
  for (const [name, { edge, pose }] of Object.entries(edges)) {
    shots.push({
      name: `warp-cross-${name}-${systemName}`, kind: 'cross', edge,
      frames: SWEEP.map((m, i) => ({ ...pose, clean: true, fixedEV: -0.8, warp: Math.round(edge * m), ...settle(i) })),
    });
  }
  return shots;
}

const out = resolve(ROOT, 'harness/out/warp');
mkdirSync(out, { recursive: true });
const results = {};
let broken = 0;
for (const systemName of SYSTEMS) {
  const shots = shotsFor(systemName);
  console.log(`\n== ${systemName}: ${shots.length} sequences (${shots.reduce((n, s) => n + s.frames.length, 0)} captures) ==`);
  const recs = await renderShots(shots, { out, parallel: Math.min(2, defaultParallel()), system: systemName });
  for (const rec of recs) {
    const shot = shots.find((s) => s.name === rec.name);
    if (rec.errors.length || !rec.settled) { broken++; results[rec.name] = { errors: rec.errors, settled: rec.settled }; continue; }
    const lums = rec.pngs.map((f) => luminance(readPNG(f)));
    const seq = sequenceMetrics(lums, { flicker: true });
    const means = lums.map((l) => { let s = 0; for (let i = 0; i < l.lum.length; i += 4) s += l.lum[i]; return s / (l.lum.length / 4); });
    const r = { pop_p99: seq.pop_p99, flicker_energy: seq.flicker_energy };
    if (shot.kind === 'cross') {
      // same-epoch below/above A/B (frames 1|2) + return-leg purity (0|5, 1|4)
      r.abMeanDelta = +Math.abs(means[2] - means[1]).toFixed(5);
      r.returnDelta = +Math.max(Math.abs(means[5] - means[0]), Math.abs(means[4] - means[1])).toFixed(5);
      // STRUCTURAL representation checks (deterministic, budget-free): the
      // declared warp must select the representation set frame by frame —
      // cloud rows carry the right kind, the lightning rate uniform gates off
      // above its band, and no mean row survives the downward crossing (F2).
      const below = [0, 1, 4, 5], aboveIdx = [2, 3];
      const s = rec.streams ?? [];
      const wantMean = shot.edge === WARP_POLICY.clouds.maxRate;
      let structural = 0;
      for (const i of below) {
        if (s[i] && s[i].cloudKind !== null && s[i].cloudKind !== 'live') structural++;
        if (s[i] && rec.name.includes('lightning') && !(s[i].lightRate > 0)) structural++;
      }
      for (const i of aboveIdx) {
        if (s[i] && wantMean && s[i].cloudKind !== 'mean') structural++;
        if (s[i] && rec.name.includes('lightning') && s[i].lightRate !== 0) structural++;
      }
      r.structural = structural;
    }
    results[rec.name] = r;
    console.log(rec.name, JSON.stringify(r));
  }
}
writeFileSync(resolve(out, 'warp-metrics.json'), JSON.stringify(results, null, 1));

if (broken) { console.error(`${broken} sequence(s) broken/unsettled — refusing to gate or measure`); process.exit(1); }
// structural representation checks are absolute (never budgeted): a nonzero
// count is a policy-law violation in ANY mode, including --measure.
const structuralBad = Object.entries(results).filter(([, r]) => r.structural);
if (structuralBad.length) {
  for (const [name, r] of structuralBad) console.error(`  STRUCTURAL ${name}: ${r.structural} representation-selection violation(s)`);
  process.exit(1);
}

if (MEASURE) {
  // pre-registered budgets: measured value × 1.5 safety + an absolute floor
  // (the LAYOUT method — an envelope, never a tuned pass).
  const budgets = {};
  for (const [name, r] of Object.entries(results)) {
    budgets[name] = {
      pop_p99: +(r.pop_p99 * 1.5 + 0.01).toFixed(4),
      flicker_energy: +(r.flicker_energy * 1.5 + 1e-5).toFixed(6),
      ...(r.abMeanDelta != null ? {
        abMeanDelta: +(r.abMeanDelta * 1.5 + 0.004).toFixed(5),
        returnDelta: +(r.returnDelta * 1.5 + 0.004).toFixed(5),
      } : {}),
    };
  }
  writeFileSync(BASELINE, JSON.stringify({ registered: new Date().toISOString().slice(0, 10), method: 'measured x1.5 + floor', budgets }, null, 1));
  console.log(`\nwrote pre-registered budgets to ${BASELINE} — commit to pin the gate.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) { console.error('no harness/baseline/warp.json — run with --measure first (in-round pre-registration)'); process.exit(1); }
const budgets = JSON.parse(readFileSync(BASELINE, 'utf8')).budgets;
let failures = 0;
for (const [name, r] of Object.entries(results)) {
  const b = budgets[name];
  if (!b) { console.error(`  NEW ${name}: no pre-registered budget`); failures++; continue; }
  const over = Object.keys(b).filter((k) => r[k] != null && r[k] > b[k]);
  if (over.length) { failures++; console.error(`  FAIL ${name}: ${over.map((k) => `${k} ${r[k]} > ${b[k]}`).join(', ')}`); }
  else console.log(`  ok  ${name}`);
}
console.log(failures ? `\n${failures} warp gate failure(s)` : '\nall warp gates within pre-registered budgets');
process.exit(failures ? 1 : 0);
