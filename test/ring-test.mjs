// test:ring — round 18 Phase 6 giant + ring. The ring/giant look lives in GLSL,
// so this pins the ALGORITHM (the precision factoring, the ring-normal choice,
// the mutual-shadow geometry, the HG lobe, the gap profile) in JS against a
// double-precision reference, plus the pure-data §11 consistency + the M5 asserts.
import { SYSTEM, bodyById, assertGiantRecipe, assertRingRecipe, assertGiantSystem } from '../src/recipe.js';

let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; } else { fail++; console.log('FAIL ', name); } };
const near = (a, b, e, name) => ok(Math.abs(a - b) <= e, `${name} (${a} vs ${b}, ε${e})`);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const f = Math.fround;

// ---- 1. giant §11 disc→point mean == discAlbedo (cos-lat integral of bandCol) ----
// replicates the shader giantBandCol band blend; cos-lat mean == uniform mean in sinLat.
const saturn = bodyById('saturn');
function bandCol(s) {
  let acc = [0, 0, 0], w = 0;
  for (const b of saturn.giant.bands) {
    let dd = (s - b.s) / 0.55, ww = Math.max(0, 1 - dd * dd); ww *= ww;
    acc[0] += ww * b.c[0]; acc[1] += ww * b.c[1]; acc[2] += ww * b.c[2]; w += ww;
  }
  return w > 1e-4 ? [acc[0] / w, acc[1] / w, acc[2] / w] : [0.6, 0.6, 0.6];
}
{
  let m = [0, 0, 0], n = 4000;
  for (let i = 0; i < n; i++) { const c = bandCol(-1 + 2 * (i + 0.5) / n); m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; }
  m = m.map((v) => v / n);
  // storm oval + hexagon are localized → net disc contribution < 1% → tolerance 0.01
  near(m[0], saturn.discAlbedo[0], 0.01, 'giant band mean R == discAlbedo');
  near(m[1], saturn.discAlbedo[1], 0.01, 'giant band mean G == discAlbedo');
  near(m[2], saturn.discAlbedo[2], 0.01, 'giant band mean B == discAlbedo');
  ok(saturn.giant.bands.length <= 8 && saturn.giant.bands.length >= 2, 'band count in [2,8]');
}

// ---- 2. ring plane normal: uBodyR1 (row) not the y-column (the 3-lens fix) ----
// M maps our-BF -> target-BF (rows uBodyR0/1/2). target +Y in OUR frame = M^T·(0,1,0)
// = ROW 1 = uBodyR1. The design's original (R0.y,R1.y,R2.y) is COLUMN 1 = wrong.
{
  // a non-symmetric M = rotX(26.7)·rotY(40) (tilt·spin, like Saturn from Titan)
  const dx = 26.7 * Math.PI / 180, sy = 40 * Math.PI / 180;
  const rotX = [1, 0, 0, 0, Math.cos(dx), -Math.sin(dx), 0, Math.sin(dx), Math.cos(dx)];
  const rotY = [Math.cos(sy), 0, Math.sin(sy), 0, 1, 0, -Math.sin(sy), 0, Math.cos(sy)];
  const M = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r * 3 + c] = rotX[r * 3] * rotY[c] + rotX[r * 3 + 1] * rotY[3 + c] + rotX[r * 3 + 2] * rotY[6 + c];
  const R0 = [M[0], M[1], M[2]], R1 = [M[3], M[4], M[5]], R2 = [M[6], M[7], M[8]];
  const nRow = R1;                                   // the fix
  const nCol = [R0[1], R1[1], R2[1]];                // the bug
  // M·nRow should be (0,1,0) (target +Y); M·nCol should NOT be
  const Mv = (v) => [dot(R0, v), dot(R1, v), dot(R2, v)];
  const mr = Mv(nRow);
  near(Math.hypot(mr[0], mr[1] - 1, mr[2]), 0, 1e-12, 'uBodyR1 maps to target +Y (correct normal)');
  const mc = Mv(nCol);
  ok(Math.hypot(mc[0], mc[1] - 1, mc[2]) > 0.3, 'the y-column does NOT map to target +Y (bug caught)');
  ok(Math.abs(dot(nRow, nCol) - 1) > 0.05, 'row and column normals genuinely differ for non-symmetric M');
}

// ---- 3. ring precision: the factored rvec=τ·rd−ĉ beats the naive t·rd−D·ĉ in f32 ----
{
  const D = 1.22e9;                                  // Titan → Saturn (m)
  const cHat = norm([0.0, 0.42, 0.91]);              // body center dir
  const nHat = norm([0.1, 0.90, 0.42]);              // ring normal (a few deg off cHat's plane)
  // a view ray a hair off cHat (a ring pixel)
  const rd = norm([cHat[0] + 0.03, cHat[1] - 0.02, cHat[2] + 0.015]);
  // double reference
  const tRef = D * dot(cHat, nHat) / dot(rd, nHat);
  const relRef = [tRef * rd[0] - D * cHat[0], tRef * rd[1] - D * cHat[1], tRef * rd[2] - D * cHat[2]];
  const rRef = Math.hypot(...relRef) / D;
  // factored, in f32
  const rdnF = f(f(f(rd[0] * nHat[0]) + f(rd[1] * nHat[1])) + f(rd[2] * nHat[2]));
  const cnF = f(f(f(cHat[0] * nHat[0]) + f(cHat[1] * nHat[1])) + f(cHat[2] * nHat[2]));
  const tauF = f(cnF / rdnF);
  const rvF = [f(f(tauF * rd[0]) - cHat[0]), f(f(tauF * rd[1]) - cHat[1]), f(f(tauF * rd[2]) - cHat[2])];
  const rFac = f(Math.hypot(...rvF));
  ok(Math.abs(rFac - rRef) < 1e-6, `factored ring radius matches double ref (err ${Math.abs(rFac - rRef).toExponential(2)})`);
  // scale invariance — the actual guarantee of factoring D out: rNorm is
  // independent of the body distance (never a 1e9 m coordinate in f32). Same
  // ray/plane at D=1e6 and D=1e12 must give the identical ring radius.
  const rAt = (Dv) => { const t = Dv * dot(cHat, nHat) / dot(rd, nHat); return Math.hypot(t * rd[0] / Dv - cHat[0], t * rd[1] / Dv - cHat[1], t * rd[2] / Dv - cHat[2]); };
  ok(Math.abs(rAt(1e6) - rAt(1e12)) < 1e-12, 'ring radius (D factored) is distance-invariant');
}

// ---- 4. gap notch profile: opacity dips at declared gap radii, full between ----
{
  const R = saturn.R, D = 1.22e9, r = saturn.rings;
  const inner = R * r.inner / D, outer = R * r.outer / D;
  const gaps = r.gaps.map((g) => [R * g.r / D, R * g.w / D, g.depth]);
  const opac = (rn) => {
    let op = r.tau;
    for (const [gr, gw, gd] of gaps) { const nt = smooth(gw, 0, Math.abs(rn - gr)); op *= 1 - gd * nt; }
    return op;
  };
  function smooth(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  const gCassini = R * r.gaps[0].r / D;
  const mid = (inner + gCassini) / 2;
  ok(opac(gCassini) < 0.5 * opac(mid), 'Cassini gap notch dips opacity');
  ok(opac(mid) > 0.9 * r.tau, 'full ring away from gaps');
}

// ---- 5. mutual shadow geometry (planet shadow on ring; ring shadow on disc) ----
{
  // planet shadow on ring (target frame, units of D; planet ang radius = angR)
  const angR = saturn.R / 1.22e9;                    // ~0.048
  const sT = norm([0.2, 0.3, 0.93]);                 // sun in target frame
  // a ring point directly anti-sunward, radius 1.5·angR (inside the shadow cylinder radially? no — projected)
  const behind = [-sT[0] * 1.6 * angR, -sT[1] * 1.6 * angR, -sT[2] * 1.6 * angR]; // on the plane-ish, anti-sun
  const qs = dot(behind, sT);
  const qp = [behind[0] - qs * sT[0], behind[1] - qs * sT[1], behind[2] - qs * sT[2]];
  ok(qs < 0, 'anti-sun ring point flagged (qs<0)');
  ok(Math.hypot(...qp) < angR, 'anti-sun point within planet radius → shadowed');
  // a sunward point is never shadowed
  const front = [sT[0] * 1.6 * angR, sT[1] * 1.6 * angR, sT[2] * 1.6 * angR];
  ok(dot(front, sT) > 0, 'sunward ring point never shadowed (qs>0)');

  // ring shadow on disc (unit-R): cast a disc point toward the sun, hit y=0 plane
  const nB = norm([0.1, 0.6, 0.78]);                 // a disc surface point (target frame)
  const sTd = norm([0.0, 0.5, 0.87]);                // sun above the ring plane (sT.y>0)
  const t = -nB[1] / sTd[1];
  ok(Number.isFinite(t), 'shadow cast t is finite (sT.y floored ⇒ no divide-by-zero)');
  // at equinox (sT.y→0) the cast lands off the disc → no NaN
  const sEq = norm([0.9, 0.001, 0.44]);
  const syC = Math.abs(sEq[1]) < 0.03 ? (sEq[1] < 0 ? -0.03 : 0.03) : sEq[1];
  const tEq = -nB[1] / syC;
  ok(Number.isFinite(tEq), 'equinox shadow cast is finite (no NaN)');
}

// ---- 6. forward-scatter HG monotonic toward the forward (backlit) direction ----
{
  const g = saturn.rings.fscatterG;
  const hg = (ph) => { const gd = 1 + g * g - 2 * g * ph; return (1 - g * g) / (gd * Math.sqrt(Math.max(gd, 1e-4))); };
  ok(hg(1) > hg(0) && hg(0) > hg(-1), 'HG lobe increases toward forward (backlit flare)');
  ok(Number.isFinite(hg(-1)) && hg(-1) > 0, 'HG finite & positive at backscatter (base 1+g²−2g·c ≥ 0)');
}

// ---- 7. edge-on non-divergence: τ stays finite as rd·n̂ → 0 (the floor) ----
{
  const cHat = norm([0, 0.45, 0.89]), nHat = norm([0, 0.9, 0.44]);
  const rd = norm([0.02, 0.44, 0.90]);               // nearly in the ring plane
  const rdn = dot(rd, nHat);
  const rdnC = Math.abs(rdn) < 0.02 ? (rdn < 0 ? -0.02 : 0.02) : rdn;
  const tau = dot(cHat, nHat) / rdnC;
  ok(Number.isFinite(tau), 'τ finite at near-edge-on (floor applied)');
}

// ---- 8. M5 no silent caps: negative asserts throw by name ----
const throws = (fn, name) => { try { fn(); fail++; console.log('FAIL  (no throw) ', name); } catch { pass++; } };
throws(() => assertRingRecipe({ id: 'x', rings: { inner: 1.2, outer: 2.2, gaps: [1, 2, 3, 4, 5].map(() => ({ r: 1.9, w: 0.01, depth: 0.5 })) } }), '>4 ring gaps throws');
throws(() => assertRingRecipe({ id: 'x', rings: { inner: 0.9, outer: 2.2 } }), 'ring inner ≤ 1 throws');
throws(() => assertRingRecipe({ id: 'x', rings: { inner: 1.2, outer: 2.2, fscatterG: 1.2 } }), '|fscatterG| ≥ 1 throws');
throws(() => assertGiantRecipe({ id: 'x', giant: { bands: [{ s: 0, c: [1, 1, 1] }], limbExp: 1 } }), '<2 giant bands throws');
throws(() => assertGiantRecipe({ id: 'x', giant: { bands: [{ s: 0, c: [1, 1, 1] }, { s: 1, c: [1, 1, 1] }], limbExp: 0 } }), 'limbExp ≤ 0 throws');
ok(assertGiantSystem() === true, 'assertGiantSystem passes (exactly one giant)');
ok(SYSTEM.bodies.filter((b) => b.giant).length === 1, 'SYSTEM has exactly one giant (Saturn)');
ok(SYSTEM.bodies.filter((b) => b.rings).length === 1, 'SYSTEM has exactly one ringed body');

console.log(`\nring-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
