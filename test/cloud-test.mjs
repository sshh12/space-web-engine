// cloud-test.mjs — round 15 Phase 4 clouds core. Pins the laws the pre-code
// panel made load-bearing:
//   - keyframe determinism + the k/k+1 byte-continuity of the packed pair
//   - correlated keyframe evolution (F1/H3: the mid-frac spatial-variance
//     ratio >= 0.9 — independent per-k draws crossfade into gray mush)
//   - the exactly-mean-1 vertical profile + column law (F2: the seen cloud
//     must carry the same column optical depth as the shadow it casts)
//   - quadrature convergence (K1/M1-alt: a 3-tap LOD fold vs a dense march)
//   - the moisture ANOMALY law (F3: open ocean contributes exactly zero)
//   - schema: deck list, detailAmp <= 1 enforced, Luna structural null
//   - the drift/lon-wrap/rollover continuity of the JS twin samplers
// Run: npm run test:cloud
import { bodyById } from '../src/recipe.js';
import {
  makeCloudKeyframes, covAt, typeAt, texelDir, sampleCloud, cloudCovJS,
  cloudShadeJS, alphaMeanLit, discAlpha, assertCloudRecipe, cloudKeyOf,
  driftPhase, driftDir, profileh, profileH, columnMean, zonalCloud,
  moistPrior, keyframeSec, stormEnvelope, CLOUD_W, CLOUD_H, MAX_DECKS,
} from '../src/cloudcore.js';
import { globalFor } from '../src/globalgrid.js';
import { ephemeris } from '../src/frames.js';
import { latOf } from '../src/mathx.js';

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};
const hash = (u8) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
};

const tellus = bodyById('tellus');
const rubra = bodyById('rubra');
const luna = bodyById('luna');

// the worker's moisture sampler, reproduced for the test realm
function moistSamplerFor(body) {
  const p = (body.processes ?? []).find((q) => q.type === 'global');
  if (!p || !p.moisture) return null;
  const g = globalFor(body, p);
  return (dir) => g.sample('moist', dir);
}
const tellusMoist = moistSamplerFor(tellus);

// ---- schema ----
ok(assertCloudRecipe(tellus) === 2, 'schema: Tellus carries 2 decks (multi-deck list proven)');
ok(assertCloudRecipe(rubra) === 2, 'schema: Rubra carries 2 decks (round 16: cirrus + dust-storm)');
ok(!luna.clouds, 'schema: Luna has NO clouds key (structural negative control)');
ok(assertCloudRecipe(bodyById('venus')) === 1, 'schema: Venus carries 1 near-total deck');
{
  let threw = false;
  try { assertCloudRecipe({ id: 'x', clouds: { decks: [{ baseM: 1, thickM: 1, detailAmp: 1.4 }] } }); }
  catch { threw = true; }
  ok(threw, 'schema: detailAmp > 1 REJECTED (the mean-1 detail bound is a law)');
}

// ---- profile / column law (panel F2) ----
{
  // exact analytic checks of the one column law every rung + shadow shares
  let mean = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) mean += profileh((i + 0.5) / N);
  mean /= N;
  ok(Math.abs(mean - 1) < 1e-9, `profile: (1/thick)∫h dz == 1 exactly (got ${mean.toFixed(10)})`);
  ok(profileH(1) === 1 && profileH(0) === 0, 'profile: H(0)=0, H(1)=1');
  ok(Math.abs(columnMean(0, 1) - 1) < 1e-12, 'column law: full crossing mean == 1');
  // H' == h (the same law one scale down: degenerate spans stay consistent)
  const x = 0.37, e = 1e-5;
  ok(Math.abs((profileH(x + e) - profileH(x - e)) / (2 * e) - profileh(x)) < 1e-4, 'column law: dH/dx == h');
}

// ---- keyframe determinism + rollover byte-continuity ----
{
  const a = makeCloudKeyframes(tellus, 41, tellusMoist);
  const b = makeCloudKeyframes(tellus, 41, tellusMoist);
  ok(hash(a.rgba) === hash(b.rgba), 'determinism: double-build hash-equal (Tellus, k=41)');
  const c = makeCloudKeyframes(tellus, 42, tellusMoist);
  // pair packing: (B,A) of k must equal (R,G) of k+1 byte-exactly, so the
  // lerp is CONTINUOUS across a rollover (frac 1 -> 0 swaps to the same field)
  let match = true;
  for (let i = 0; i < a.rgba.length && match; i += 4) {
    if (a.rgba[i + 2] !== c.rgba[i] || a.rgba[i + 3] !== c.rgba[i + 1]) match = false;
  }
  ok(match, 'rollover: keyframe pair (B,A at k) == (R,G at k+1) byte-exact');
  const r1 = makeCloudKeyframes(rubra, 7, null);
  const r2 = makeCloudKeyframes(rubra, 7, null);
  ok(hash(r1.rgba) === hash(r2.rgba), 'determinism: double-build hash-equal (Rubra, no moisture grid)');
  const l = makeCloudKeyframes(luna, 0, null);
  ok(l.decks === 0 && l.rgba.length === 0, 'Luna: zero decks, zero bytes');
}

// ---- correlated evolution: the mid-frac variance ratio (panel F1/H3) ----
{
  for (const [body, moist, name] of [[tellus, tellusMoist, 'tellus'], [rubra, null, 'rubra']]) {
    const kf = makeCloudKeyframes(body, 100, moist);
    for (let L = 0; L < kf.decks; L++) {
      // spatial std of cov over the mid-lat band at frac 0 vs frac 0.5
      const stats = (frac) => {
        let s = 0, s2 = 0, n = 0, hiN = 0;
        for (let j = 24; j < CLOUD_H - 24; j += 2) {
          for (let i = 0; i < CLOUD_W; i += 2) {
            const base = L * CLOUD_W * CLOUD_H * 4 + (j * CLOUD_W + i) * 4;
            const cov = (kf.rgba[base] / 255) * (1 - frac) + (kf.rgba[base + 2] / 255) * frac;
            s += cov; s2 += cov * cov; n++;
            if (cov > 0.75) hiN++;
          }
        }
        const m = s / n;
        return { std: Math.sqrt(Math.max(s2 / n - m * m, 0)), mean: m, hiFrac: hiN / n };
      };
      const a = stats(0), b = stats(0.5);
      // round 16 (panel B1): the variance-ratio law applies to VARIANCE-carrying
      // decks. A near-uniform deck — Venus's permanent overcast, or Rubra's storm/
      // hood deck sampled with no season (all clear) — has std≈0, so the ratio is
      // ill-conditioned (0/0). Skip it here; its correctness is pinned by the storm
      // envelope on/off + rollover tests below, not by an evolution ratio.
      if (a.std < 0.02) { ok(true, `evolution: ${name} deck ${L} near-uniform (std ${a.std.toFixed(3)}) — DC/storm deck, ratio N/A`); continue; }
      const ratio = b.std / Math.max(a.std, 1e-9);
      ok(ratio >= 0.9, `evolution: ${name} deck ${L} mid-frac std ratio ${ratio.toFixed(3)} >= 0.9 (no keyframe breathing)`);
      ok(Math.abs(b.mean - a.mean) < 0.05, `evolution: ${name} deck ${L} mid-frac mean drift ${(b.mean - a.mean).toFixed(3)} < 0.05`);
      ok(b.hiFrac >= a.hiFrac * 0.7, `evolution: ${name} deck ${L} dense-cloud fraction holds at mid-frac (${a.hiFrac.toFixed(3)} -> ${b.hiFrac.toFixed(3)})`);
    }
  }
}

// ---- round 16: seasonal weather modes — dust storm envelope + rollover (panel B1) ----
{
  // reconstruct the worker's per-keyframe season sampler (bake.worker seasonSamplerFor)
  const TAU = Math.PI * 2, tau = keyframeSec(rubra), per = rubra.orbit.periodDays * 86400;
  const seasonAt = (kk) => {
    const t = kk * tau;
    return { th: TAU * (t / per) + rubra.orbit.phase0, sinDecl: ephemeris(rubra, t).sunDirBF[1] };
  };
  const storm = rubra.clouds.decks[1];
  const kFor = (targetTh) => Math.round(((targetTh - rubra.orbit.phase0) / TAU) * (per / tau));
  const stormDeckMeanCov = (k) => {
    const kf = makeCloudKeyframes(rubra, k, null, seasonAt);
    const base = 1 * CLOUD_W * CLOUD_H * 4; // deck 1
    let s = 0; const n = CLOUD_W * CLOUD_H;
    for (let p = 0; p < n; p++) s += kf.rgba[base + p * 4];
    return s / n / 255;
  };
  // the envelope itself: 1 at the centre, ~0 half a turn away
  ok(Math.abs(stormEnvelope(storm.stormLs, storm.stormLs, storm.stormWidth) - 1) < 1e-9, 'storm: envelope == 1 at the centre Ls');
  ok(stormEnvelope(storm.stormLs + Math.PI, storm.stormLs, storm.stormWidth) < 0.02, 'storm: envelope ~0 half an orbit from the centre');
  // the FIELD: off-season EXACTLY clear (the body's normal look), in-season a pall
  const covOff = stormDeckMeanCov(kFor(storm.stormLs + Math.PI));
  const covIn = stormDeckMeanCov(kFor(storm.stormLs));
  ok(covOff < 0.02, `storm: off-season deck EXACTLY clear (mean cov ${covOff.toFixed(3)} < 0.02 — Rubra's normal look intact)`);
  ok(covIn > 0.7, `storm: in-season deck near-total pall (mean cov ${covIn.toFixed(3)} > 0.7)`);
  // rollover byte-continuity WITH the season term, on the ENVELOPE SLOPE (where a
  // single shared k/k+1 scalar would break it — panel storm-season-rollover)
  const kEdge = kFor(storm.stormLs - storm.stormWidth);
  const e0 = makeCloudKeyframes(rubra, kEdge, null, seasonAt);
  const e1 = makeCloudKeyframes(rubra, kEdge + 1, null, seasonAt);
  let cont = true;
  for (let i = 0; i < e0.rgba.length && cont; i += 4) {
    if (e0.rgba[i + 2] !== e1.rgba[i] || e0.rgba[i + 3] !== e1.rgba[i + 1]) cont = false;
  }
  ok(cont, 'storm: rollover byte-continuity holds on the rising edge (k and k+1 season scalars evaluated separately)');
}

// ---- moisture anomaly (panel F3) ----
{
  const deck = tellus.clouds.decks[0];
  const d = [0.3, -0.2, 0.933];
  const dl = Math.hypot(...d); d[0] /= dl; d[1] /= dl; d[2] /= dl;
  // a sampler pinned AT the mid-scale: moist == moistMid·prior -> exactly zero
  const mid = (dir) => (deck.moistMid ?? 0.4) * moistPrior(latOf(dir));
  const atMid = covAt(d, deck, 71, 5, mid);
  const withNull = covAt(d, deck, 71, 5, null);
  ok(Math.abs(atMid - withNull) < 1e-12, 'moisture: the mid-scale anomaly is EXACTLY zero at moist == moistMid·prior');
  // the REAL field: the term must be near-zero-mean globally (a DC moisture
  // term is a duplicate of cov0 — panel F3's actual content)
  {
    let s = 0, n = 0;
    const dd = [0, 0, 0];
    for (let j = 4; j < CLOUD_H - 4; j += 3) for (let i = 0; i < CLOUD_W; i += 3) {
      texelDir(i, j, dd);
      const w = Math.cos(((j + 0.5) / CLOUD_H - 0.5) * Math.PI);
      s += (tellusMoist(dd) - (deck.moistMid ?? 0.4) * moistPrior(latOf(dd))) * w;
      n += w;
    }
    const meanTerm = s / n;
    ok(Math.abs(meanTerm) < 0.08, `moisture: global mean anomaly ${meanTerm.toFixed(3)} within ±0.08 (geography, not DC)`);
  }
  // real Tellus keyframe: no latitude band saturates, and an ocean patch has structure
  const kf = makeCloudKeyframes(tellus, 33, tellusMoist);
  let worstBand = 0;
  for (let j = 8; j < CLOUD_H - 8; j++) {
    let hi = 0;
    for (let i = 0; i < CLOUD_W; i++) {
      if (kf.rgba[(j * CLOUD_W + i) * 4] > 250) hi++;
    }
    worstBand = Math.max(worstBand, hi / CLOUD_W);
  }
  ok(worstBand < 0.9, `moisture: no full latitude band saturates (worst ${worstBand.toFixed(2)})`);
  // 30x30 deg equatorial mid-Pacific-ish patch: coverage variance is real
  let s = 0, s2 = 0, n = 0;
  const j0 = Math.round(CLOUD_H * 0.4375), j1 = Math.round(CLOUD_H * 0.5625);
  const i0 = Math.round(CLOUD_W * 0.625), i1 = Math.round(CLOUD_W * 0.711);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const c = kf.rgba[(j * CLOUD_W + i) * 4] / 255;
    s += c; s2 += c * c; n++;
  }
  const std = Math.sqrt(Math.max(s2 / n - (s / n) ** 2, 0));
  ok(std > 0.05, `moisture: open-ocean patch coverage std ${std.toFixed(3)} > 0.05 (structure, not DC)`);
}

// ---- quadrature convergence (panel K1 / M1-alt): fold vs dense march ----
{
  // synthetic broken-lane coverage along a horizontal remainder: compare the
  // deck integrator's 3-tap fold against a 300-tap march of the SAME
  // integrand (transmittance only — the load-bearing half of the §8 claim)
  // sigma scaled so the 140 km slant column sits at tau ~ O(1) — the regime
  // where the fold's accuracy matters (fully-saturated paths agree trivially)
  const sig = 1.6e-5, thick = 1800;
  const lane = (s) => (Math.sin(s / 30000) > 0.2 ? 0.9 : 0.05); // ~90 km lanes
  const L = 140000; // a 140 km remainder
  const tau = (taps) => {
    let T = 1;
    const ds = L / taps;
    for (let i = 0; i < taps; i++) {
      const s = (i + 0.5) * ds;
      // mid-deck altitude x=0.5 -> h = 1.5; LOD folding is modeled by
      // averaging the lane over the tap's footprint (what the coarse mip does)
      let covM = 0;
      const sub = 16;
      for (let q = 0; q < sub; q++) covM += lane(s - ds / 2 + (q + 0.5) * (ds / sub));
      covM /= sub;
      T *= Math.exp(-sig * covM * profileh(0.5) * ds);
    }
    return T;
  };
  const t3 = tau(3), t300 = tau(300);
  ok(Math.abs(t3 - t300) / t300 < 0.05,
    `quadrature: 3-tap LOD fold vs 300-tap march transmittance (${t3.toFixed(4)} vs ${t300.toFixed(4)}) within 5%`);
  // and the SINGLE-midpoint-sample form the panel killed, for the record:
  const covMid = lane(L / 2);
  const t1 = Math.exp(-sig * covMid * profileh(0.5) * L);
  ok(Math.abs(t1 - t300) / t300 > 0.05,
    'quadrature: the killed single-midpoint slab DOES diverge (>5%) — the fold is load-bearing');
}

// ---- shadow twin self-consistency (the alignment pair's JS half) ----
{
  const kf = makeCloudKeyframes(tellus, 20, tellusMoist);
  const R = tellus.R;
  const deck = tellus.clouds.decks[0];
  const t = 20.5 * (tellus.clouds.keyframeH * 3600);
  // ground point under a straight-up sun: T must equal exp(-sigma*cov*thick)
  // with cov read at the zenith tap — the full-column case, exact by the law
  const dir = [0.2, 0.5, 0.84];
  const dl = Math.hypot(...dir); dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
  const p = dir.map((v) => v * (R + 2));
  const T = cloudShadeJS(tellus, kf.rgba, p, dir, t);
  // the zenith tap point is the same direction (radial sun): reproduce it
  const cov0 = cloudCovJS(tellus, kf.rgba, 0, dir, t);
  const cov1 = cloudCovJS(tellus, kf.rgba, 1, dir, t);
  const d1 = tellus.clouds.decks[1];
  const expT = Math.exp(-(deck.sigmaK * cov0 * deck.thickM)) * Math.exp(-(d1.sigmaK * cov1 * d1.thickM));
  ok(Math.abs(T - expT) < 1e-9, `shadow: radial-sun full column == exp(-sigma*cov*thick) per deck (${T.toFixed(6)} vs ${expT.toFixed(6)})`);
  // above every deck -> exactly 1
  const pHi = dir.map((v) => v * (R + 20000));
  ok(cloudShadeJS(tellus, kf.rgba, pHi, dir, t) === 1, 'shadow: point above all decks is untouched (T == 1)');
  // inside the deck: the remaining column is (1 - H(x0)) of the full one
  const xin = 0.5;
  const pIn = dir.map((v) => v * (R + deck.baseM + xin * deck.thickM));
  const Tin = cloudShadeJS(tellus, kf.rgba, pIn, dir, t);
  const expIn = Math.exp(-(deck.sigmaK * cov0 * (1 - profileH(xin)) * deck.thickM))
    * Math.exp(-(d1.sigmaK * cov1 * d1.thickM));
  ok(Math.abs(Tin - expIn) < 1e-9, 'shadow: mid-deck point carries (1-H(x)) of the column (self-shadow law)');
}

// ---- drift + wrap + time plumbing ----
{
  const kf = makeCloudKeyframes(tellus, 9, tellusMoist);
  // lon-wrap bilinear continuity of the twin sampler
  const e = 1e-5;
  const dA = [Math.cos(Math.PI - e), 0, Math.sin(Math.PI - e)];
  const dB = [Math.cos(-Math.PI + e), 0, Math.sin(-Math.PI + e)];
  const a = sampleCloud(kf.rgba, 0, dA, 0.3).cov;
  const b = sampleCloud(kf.rgba, 0, dB, 0.3).cov;
  ok(Math.abs(a - b) < 0.02, `wrap: coverage continuous across the lon seam (${a.toFixed(4)} vs ${b.toFixed(4)})`);
  // drift phase math: closed form, wraps in [0,1)
  const deck = tellus.clouds.decks[0];
  const ph = driftPhase(deck, 86400);
  ok(Math.abs(ph - (((deck.driftDegPerDay / 360) % 1) + 1) % 1) < 1e-12, 'drift: one day advances exactly driftDegPerDay/360');
  // driftDir is a rigid rotation (norm preserved, y untouched)
  const dd = driftDir([0.6, 0.5, 0.6245], 0.37);
  ok(Math.abs(Math.hypot(...dd) - Math.hypot(0.6, 0.5, 0.6245)) < 1e-12 && dd[1] === 0.5, 'drift: rigid rotation about the spin axis');
  // keyframe indexing continuity
  const tau = tellus.clouds.keyframeH * 3600;
  const k1 = cloudKeyOf(tellus, 5 * tau - 1e-3), k2 = cloudKeyOf(tellus, 5 * tau + 1e-3);
  ok(k1.k === 4 && k2.k === 5 && k1.frac > 0.999 && k2.frac < 0.001, 'time: keyframe index/frac continuous at the boundary');
}

// ---- planetshine reduction: calibration vs the disc integral (M3 check) ----
{
  const kf = makeCloudKeyframes(tellus, 15, tellusMoist);
  const t = 15.2 * tellus.clouds.keyframeH * 3600;
  const toR = [1, 0, 0], toS = [1, 0, 0]; // full phase, receiver at the sun
  const aApx = alphaMeanLit(tellus, kf.rgba, 0, t, toR, toS);
  ok(aApx >= 0 && aApx <= 1, `planetshine: alphaMeanLit in [0,1] (${aApx.toFixed(3)})`);
  // numerically integrate the DISC alpha over the lit hemisphere at a FINER
  // stride and compare: the reduction must track the disc integral (the M3
  // calibration — averaging ALPHA, never alpha of the mean coverage)
  const deck = tellus.clouds.decks[0];
  const { frac } = cloudKeyOf(tellus, t);
  const phase = driftPhase(deck, t);
  let aInt = 0, w = 0;
  const d = [0, 0, 0], dd2 = [0, 0, 0];
  for (let j = 1; j < CLOUD_H; j += 2) for (let i = 1; i < CLOUD_W; i += 2) {
    texelDir(i, j, d);
    const wr = Math.max(0, d[0]);
    const ww = wr * wr * Math.cos(((j + 0.5) / CLOUD_H - 0.5) * Math.PI);
    if (ww <= 0) continue;
    driftDir(d, phase, dd2);
    aInt += discAlpha(deck, sampleCloud(kf.rgba, 0, dd2, frac).cov) * ww;
    w += ww;
  }
  aInt /= w;
  ok(Math.abs(aApx - aInt) < 0.1, `planetshine: alphaMeanLit ${aApx.toFixed(3)} vs disc-integrated alpha ${aInt.toFixed(3)} within 0.1`);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nall tests passed (${pass})`);
process.exit(fail ? 1 : 0);
