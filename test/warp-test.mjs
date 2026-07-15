// test/warp-test.mjs — Phase W (round 24): the [time-field] warp policy.
//  - policy-table completeness against the canonical subsystem list (M5);
//  - band edges strictly between detents; the signed detent ladder shape;
//  - pure selection vs the live hysteresis machine (no oscillation at a held
//    boundary rate; reset == pure selection — the capture law's determinism);
//  - the Jensen twin: the analytic cloud time-mean (equivalent coverage through
//    the alpha law) equals the keyframe-law mean to a pinned tolerance, and the
//    naive alpha(mean cov) provably overshoots on a saturating deck;
//  - frozen-phase purity: two evaluations at the same (epochS, warp) are
//    identical; canonical above-band values are constants per band;
//  - mean-raster packing law (R=B, G=A ⇒ the frac lerp is the identity);
//  - SceneSpec carries warp; the warp control class is closed-form from seed.
import assert from 'node:assert/strict';
import {
  WARP_POLICY, TIME_FIELD_SUBSYSTEMS, WARP_DETENTS, WARP_CAP, YEAR_S,
  STARTER_SYSTEM_WARP, assertWarpPolicyComplete, warpRepresentation,
  makeWarpBandMachine, detentWarp, detentIndexOf, warpLabel, calendarOf,
  isExtrapolated, oceanTimeS, CANONICAL_OCEAN_TIME_S, AURORA_MEAN_PULSE,
  WARP_INTERNALS,
} from '../src/core/warp.js';
import {
  makeCloudKeyframes, makeCloudMeanRaster, equivalentMeanCov, meanBlockOf,
  MEAN_BLOCK_K, sampleCloud, discAlpha, driftPhase, driftDir, cloudKeyOf,
  keyframeSec, texelDir, CLOUD_W, CLOUD_H, stormEnvelope,
} from '../src/core/cloudcore.js';
import { SYSTEM } from '../src/core/recipe.js';
import { SOL_SYSTEM } from '../src/core/sol.js';
import { validateSpec, withDefaults } from '../src/scenespec.js';
import { buildWarpControls } from '../harness/bench.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const near = (a, b, e, m) => ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b} (tol ${e})`);

// ---------------------------------------------------------------------------
// 1. table completeness (M5) + edge placement + ladder shape
ok(assertWarpPolicyComplete(), 'policy table asserts complete');
ok(new Set(Object.keys(WARP_POLICY)).size === TIME_FIELD_SUBSYSTEMS.length, 'no undeclared rows');
for (const name of TIME_FIELD_SUBSYSTEMS) {
  const row = WARP_POLICY[name];
  ok(row && typeof row.above === 'string' && row.above.length > 0, `${name} declares an above-band representation`);
  if (Number.isFinite(row.maxRate)) {
    ok(!WARP_DETENTS.some((d) => d.warp === row.maxRate), `${name} edge ${row.maxRate} is strictly between detents`);
  }
}
ok(WARP_POLICY.clouds.maxRate >= 43200, 'the proven Phase N ceiling (43,200x) stays below-band for clouds');
ok(WARP_POLICY.clouds.maxRate < 86400, 'the day/s starter detent renders above-band clouds');
ok(WARP_CAP > 3.1e8 && WARP_CAP < 3.2e8, 'cap is decade/s ~3.16e8');
ok(STARTER_SYSTEM_WARP === 86400, 'starter default is the day/s detent (the Phase N target)');
for (let i = 1; i < WARP_DETENTS.length; i++) ok(WARP_DETENTS[i].warp > WARP_DETENTS[i - 1].warp, `detents ascend at ${i}`);
for (let i = -(WARP_DETENTS.length - 1); i <= WARP_DETENTS.length - 1; i++) {
  const w = detentWarp(i);
  ok(Math.sign(w) === Math.sign(i) || w === 0, `detent ${i} sign`);
  ok(detentIndexOf(w) === i || w === 0, `detent roundtrip ${i}`);
}
ok(warpLabel(0) === 'Paused' && warpLabel(-86400).startsWith('−'), 'signed labels');

// ---------------------------------------------------------------------------
// 2. pure selection: a pure function of the declared warp, sign-independent
for (const w of [0, 1, 43200, -43200, 46001, 86400, -86400, 3.15e8]) {
  const a = warpRepresentation(w), b = warpRepresentation(w);
  ok(JSON.stringify(a) === JSON.stringify(b), `selection pure at ${w}`);
  ok(JSON.stringify(warpRepresentation(-w)) === JSON.stringify({ ...warpRepresentation(w), rate: Math.abs(-w || 0) })
    || warpRepresentation(-w).clouds === warpRepresentation(w).clouds, `sign-independent bands at ${w}`);
}
ok(warpRepresentation(0).clouds === 'live' && warpRepresentation(0).lightningOn
  && warpRepresentation(0).ocean === 'live' && warpRepresentation(0).aurora === 'live'
  && warpRepresentation(0).aeGain === 1, 'warp 0 selects every live representation (demo byte-identity)');
ok(warpRepresentation(43200).clouds === 'live', '43,200x stays live (the shipped N ceiling)');
const above = warpRepresentation(86400);
ok(above.clouds === 'mean' && !above.lightningOn && above.ocean === 'canonical', 'day/s is above clouds/lightning/ocean bands');
ok(above.aurora === 'mean', 'day/s is above the aurora band');
ok(warpRepresentation(100).lightningOn && !warpRepresentation(300).lightningOn, 'lightning edge at 240');
ok(warpRepresentation(500).ocean === 'live' && warpRepresentation(700).ocean === 'canonical', 'ocean edge at 600');
ok(warpRepresentation(9000).aurora === 'live' && warpRepresentation(11000).aurora === 'mean', 'aurora edge at 10,000');
ok(warpRepresentation(1e6).aeGain < warpRepresentation(1e5).aeGain && warpRepresentation(1e5).aeGain < 1,
  'AE time constant stretches monotonically above its band');

// canonical values are constants per band, never band-entry values
ok(CANONICAL_OCEAN_TIME_S === 0 && AURORA_MEAN_PULSE === 0.55, 'canonical constants');
ok(oceanTimeS(123456, warpRepresentation(0)) === 123456, 'below-band ocean time = live epoch (byte-identity)');
ok(oceanTimeS(123456, warpRepresentation(1e6)) === 0 && oceanTimeS(9.9e9, warpRepresentation(1e6)) === 0,
  'above-band ocean time is the canonical constant regardless of entry epoch');

// ---------------------------------------------------------------------------
// 3. the hysteresis machine: up/down switch rates differ; a held boundary rate
// never oscillates; reset() collapses to the pure selection.
{
  const m = makeWarpBandMachine();
  const edge = WARP_POLICY.clouds.maxRate, H = WARP_INTERNALS.HYSTERESIS;
  ok(H > 1.05 && H < 1.5, 'hysteresis ratio is a real bracket');
  m.reset(0);
  ok(m.step(edge * 1.05).clouds === 'live', 'no up-switch below edge x hysteresis');
  ok(m.step(edge * 1.2).clouds === 'mean', 'up-switch past edge x hysteresis');
  ok(m.step(edge * 1.05).clouds === 'mean', 'held above: down needs edge / hysteresis');
  ok(m.step(edge).clouds === 'mean', 'held AT the edge from above: no flip');
  for (let i = 0; i < 50; i++) ok(m.step(edge).clouds === 'mean', `no oscillation at held edge (${i})`);
  ok(m.step(edge / 1.2).clouds === 'live', 'down-switch past edge / hysteresis');
  for (let i = 0; i < 50; i++) ok(m.step(edge).clouds === 'live', `no oscillation from below (${i})`);
  // reset == pure selection at any declared warp (the capture law)
  let seed = 0xC0FFEE;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0xffffffff; };
  for (let i = 0; i < 200; i++) {
    const w = (rnd() < 0.5 ? -1 : 1) * Math.exp(rnd() * Math.log(3.15e8));
    const r = m.reset(w), p = warpRepresentation(w);
    ok(r.clouds === p.clouds && r.lightningOn === p.lightningOn && r.aurora === p.aurora && r.ocean === p.ocean,
      `reset == pure selection at ${w.toExponential(2)}`);
  }
}

// ---------------------------------------------------------------------------
// 4. the Jensen twin. Empirical time-mean of alpha through the LIVE keyframe
// law (quantized bytes, drift, frac lerp — the GPU-modeled twin) vs the mean
// raster's alpha at the same latitude ring. Zonal comparison: the analytic
// raster ring-averages drifting decks, and the empirical mean over a block's
// keyframes x fracs x the ring is the same integral by construction.
{
  const tellus = SYSTEM.bodies.find((b) => b.id === 'tellus');
  const block = 0, kA = block * MEAN_BLOCK_K;
  const kfs = [];
  for (let k = kA; k < kA + MEAN_BLOCK_K; k++) kfs.push(makeCloudKeyframes(tellus, k, null, null));
  const mean = makeCloudMeanRaster(tellus, block, null, null);
  ok(mean.decks === 2 && mean.block === block, 'mean raster covers both decks');
  // packing law: R===B and G===A everywhere => sampleCloud is frac-invariant
  for (let i = 0; i < mean.rgba.length; i += 4) {
    if (mean.rgba[i] !== mean.rgba[i + 2] || mean.rgba[i + 1] !== mean.rgba[i + 3]) assert.fail('mean packing R=B,G=A violated');
  }
  checks++;
  const d0 = [0, 0, 0];
  texelDir(31, 60, d0);
  ok(sampleCloud(mean.rgba, 0, d0, 0).cov === sampleCloud(mean.rgba, 0, d0, 1).cov, 'frac lerp is the identity on mean rows');
  for (const L of [0, 1]) {
    const deck = tellus.clouds.decks[L];
    const tau = keyframeSec(tellus);
    for (const j of [40, 64, 96, 128, 176, 216]) {
      // empirical: E over the block's keyframes, fracs and the lon ring of
      // alpha(sampled live cov) — the exact quantity a fixed drifting ground
      // point time-averages.
      let eSum = 0, eN = 0, covSum = 0;
      const dir = [0, 0, 0], dd = [0, 0, 0];
      for (let i = 4; i < CLOUD_W; i += 16) {
        texelDir(i, j, dir);
        for (let k = 0; k < MEAN_BLOCK_K; k++) {
          for (const f of [0.25, 0.75]) {
            const t = (kA + k + f) * tau;
            driftDir(dir, driftPhase(deck, t), dd);
            const cov = sampleCloud(kfs[k].rgba, L, dd, f).cov;
            eSum += discAlpha(deck, cov); covSum += cov; eN++;
          }
        }
      }
      const empirical = eSum / eN;
      // analytic: the mean raster's ring value (row-constant for drifting decks)
      texelDir(64, j, dir);
      const analytic = discAlpha(deck, sampleCloud(mean.rgba, L, dir, 0.5).cov);
      near(analytic, empirical, 0.035, `Jensen twin deck ${L} row ${j}`);
      // the naive form: alpha of the mean coverage — must overshoot the true
      // mean on the saturating cumulus deck wherever coverage actually varies
      if (L === 0 && empirical > 0.1 && empirical < 0.9) {
        const naive = discAlpha(deck, covSum / eN);
        ok(naive >= empirical - 1e-9, `alpha is concave: naive >= mean (row ${j})`);
        ok(naive - empirical > 0.01, `Jensen gap is material on the saturating deck (row ${j}: ${(naive - empirical).toFixed(3)})`);
      }
    }
  }
  // equivalent-coverage inversion is exact up to quantization
  for (const a of [0.05, 0.3, 0.7, 0.97]) {
    const deck = tellus.clouds.decks[0];
    near(discAlpha(deck, equivalentMeanCov(deck, a)), a, 1e-9, `alpha inversion at ${a}`);
  }
  // frozen purity: two generations at the same (body, block) are byte-identical
  const again = makeCloudMeanRaster(tellus, block, null, null);
  ok(Buffer.compare(Buffer.from(mean.rgba), Buffer.from(again.rgba)) === 0, 'mean raster is a pure function of (recipe, block)');
  ok(meanBlockOf(tellus, 0) === 0 && meanBlockOf(tellus, MEAN_BLOCK_K * keyframeSec(tellus)) === 1
    && meanBlockOf(tellus, -1) === -1, 'block indexing is floor-consistent');
}

// 4b. seasonal decks keep their epoch-local season in the mean (the
// perihelion-seasons showcase law): the rubra storm deck's mean coverage at a
// storm-season block dominates an off-season block.
{
  const rubra = SOL_SYSTEM.bodies.find((b) => b.id === 'rubra');
  const stormy = makeCloudMeanRaster(rubra, 0, null, () => ({ th: 4.71, sinDecl: 0 }));
  const calm = makeCloudMeanRaster(rubra, 0, null, () => ({ th: 4.71 + Math.PI, sinDecl: 0 }));
  ok(stormEnvelope(4.71, 4.71, 0.7) > 0.99 && stormEnvelope(4.71 + Math.PI, 4.71, 0.7) < 0.01, 'storm envelope poles');
  const meanCov = (r, L) => { let s = 0, n = 0; const base = L * CLOUD_W * CLOUD_H * 4; for (let i = base; i < base + CLOUD_W * CLOUD_H * 4; i += 4) { s += r.rgba[i]; n++; } return s / n / 255; };
  ok(meanCov(stormy, 1) > meanCov(calm, 1) + 0.2,
    `storm-season mean dominates: ${meanCov(stormy, 1).toFixed(3)} vs ${meanCov(calm, 1).toFixed(3)}`);
}

// 4c. per-texel (non-drifting) means keep geography: a synthetic still deck's
// mean raster is NOT row-constant (the drift ring average applies only to
// drifting decks).
{
  const still = { id: 'still', R: 6e6, clouds: { keyframeH: 6, seed: 71, decks: [
    { baseM: 1500, thickM: 1800, sigmaK: 0.0022, freq: 6.5, oct: 4, evolve: 0.24, driftDegPerDay: 0, covLo: 0.4, covHi: 0.62 },
  ] } };
  const m = makeCloudMeanRaster(still, 0, null, null);
  let varies = false;
  const j = CLOUD_H >> 1;
  for (let i = 4; i < CLOUD_W && !varies; i += 8) varies = m.rgba[(j * CLOUD_W + i) * 4] !== m.rgba[(j * CLOUD_W + 4) * 4];
  ok(varies, 'non-drifting mean keeps longitudinal geography');
}

// ---------------------------------------------------------------------------
// 5. SceneSpec: warp is schema-legal, defaulted, validated
ok(withDefaults({}).warp === 0, 'warp defaults to 0 (below every band — byte-identity)');
ok(validateSpec({ warp: 1e6, epochS: 12345 }).ok, 'declared-warp spec validates');
ok(validateSpec({ warp: -315576000 }).ok, 'signed warp validates');
ok(!validateSpec({ warp: 'fast' }).ok, 'non-numeric warp rejected');

// 6. the warp control class: closed-form from (system, seed), schema-valid,
// deterministic, and epoch x warp actually vary.
for (const [name, system] of [['demo', SYSTEM], ['sol', SOL_SYSTEM]]) {
  const a = buildWarpControls(20260713, 3, { system });
  const b = buildWarpControls(20260713, 3, { system });
  ok(JSON.stringify(a) === JSON.stringify(b), `${name} warp controls deterministic`);
  ok(a.length === 3 && a.every((c) => c.poseClass === 'warp' && validateSpec(c.spec).ok), `${name} warp controls schema-valid`);
  ok(new Set(a.map((c) => c.spec.warp)).size > 1 && new Set(a.map((c) => c.spec.epochS)).size > 1, `${name} draws vary`);
  ok(a.every((c) => Math.abs(c.spec.warp) >= 10 && Math.abs(c.spec.warp) <= 3.16e8), `${name} warp range inside the ladder`);
}

// 7. calendar + validity tag
ok(calendarOf(0).text.includes('Y+0'), 'epoch zero calendar');
ok(calendarOf(YEAR_S * 3 + 86400 * 10 + 3660).text.includes('Y+3') && calendarOf(YEAR_S * 3 + 86400 * 10 + 3660).text.includes('D010'), 'calendar decomposition');
ok(calendarOf(-YEAR_S).year === -1, 'signed calendar');
ok(!isExtrapolated(YEAR_S * 4999, SOL_SYSTEM) && isExtrapolated(YEAR_S * 5001, SOL_SYSTEM), 'validYears tag at the declared window');
ok(isExtrapolated(-YEAR_S * 5001, SOL_SYSTEM), 'tag is two-sided');

console.log(`warp-test: ${checks} checks passed`);
