// figure-test.mjs — round 17: the irregular-domain seam fixture (exec row) plus
// the figure battery: star-shape/injectivity asserts (positive AND negative),
// per-cell metric sanity, the relief-budget measurement, and determinism.
// Pure Node, no mocks — imports the same modules the worker and main thread run.

import { makeBaker, TILE_RES, HALO, I } from '../src/bakecore.js';
import { SYSTEM, bodyById, assertFigureRecipe } from '../src/recipe.js';
import {
  figOf, figS, figAlt, figUp, figRadial, figMapDir, figNormalDir,
  assertStarShaped, figPreflight, figInjectivity, bodyBoundR, bodyEffR,
} from '../src/figure.js';
import { faceUvToDir, dirToFaceUv } from '../src/mathx.js';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.error(`FAIL  ${name}`); }
}
function throws(fn, match, name) {
  try { fn(); failed++; console.error(`FAIL  ${name} (no throw)`); }
  catch (e) {
    if (String(e.message).includes(match)) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.error(`FAIL  ${name} (wrong error: ${e.message.slice(0, 90)})`); }
  }
}

// ---- 1. schema + preflight on the three shipped recipes -------------------
for (const id of ['vesta', 'haumea', 'arrokoth']) {
  const b = bodyById(id);
  ok(assertFigureRecipe(b) === true, `schema: ${id} passes assertFigureRecipe`);
  const fig = figOf(b);
  const bound = figPreflight(fig, id, b.figure.reliefBudget, 600);
  ok(bound >= 2 * b.figure.reliefBudget, `preflight: ${id} injectivity ${bound.toFixed(0)} m ≥ 2x budget ${b.figure.reliefBudget}`);
}
// legacy bodies carry no figure and the wrappers fall back to R exactly
ok(figOf(bodyById('tellus')) === null, 'legacy: tellus has no figure');
ok(bodyBoundR(bodyById('luna')) === bodyById('luna').R, 'legacy: bodyBoundR falls back to R');
ok(bodyEffR(bodyById('titan')) === bodyById('titan').R, 'legacy: bodyEffR falls back to R');

// ---- 2. negative tests: invalid figures fail LOUDLY -----------------------
// barely-touching lobes (open gap): origin outside the body
throws(() => assertStarShaped(figOf({ figure: {
  type: 'lobes',
  lobes: [{ c: [-7000, 0, 0], axes: [6200, 5300, 3200] }, { c: [7400, 0, 0], axes: [4700, 4200, 2800] }],
  neckK: 600, reliefBudget: 100,
} }), 'bad-gap', 400), 'origin is not inside', 'negative: open-gap lobes fail the star-shape assert');
// an over-amplitude recipe: budget above the neck's injectivity bound
throws(() => figPreflight(figOf(bodyById('arrokoth')), 'arrokoth-over', 5000, 400),
  'exceeds half the injectivity bound', 'negative: 5 km budget on arrokoth fails the injectivity preflight');
// scope law: figure + ocean / bad process / 3 lobes are named errors
throws(() => assertFigureRecipe({ id: 'x', figure: { type: 'ellipsoid', axes: [1000, 1000, 900], reliefBudget: 10 }, seaLevel: 0, processes: [] }),
  'seaLevel', 'negative: figure+ocean rejected by name');
throws(() => assertFigureRecipe({ id: 'x', figure: { type: 'ellipsoid', axes: [1000, 1000, 900], reliefBudget: 10 }, processes: [{ type: 'bedforms' }] }),
  'not figure-generalized', 'negative: non-whitelisted process rejected by name');
throws(() => assertFigureRecipe({ id: 'x', figure: { type: 'lobes', lobes: [{}, {}, {}], neckK: 1, reliefBudget: 10 }, processes: [] }),
  'exactly 2', 'negative: 3 lobes rejected (GLSL twin cap — M5 no silent caps)');

// ---- 3. the geometry law: q on the surface, m̂ = unit gradient, alt honest --
{
  const fig = figOf(bodyById('arrokoth'));
  let worstS = 0, worstAlt = 0;
  for (let i = 0; i < 500; i++) {
    const y = 1 - (2 * i + 1) / 500, r = Math.sqrt(Math.max(1 - y * y, 0)), ph = i * 2.399963;
    const d = [r * Math.cos(ph), y, r * Math.sin(ph)];
    const q = figMapDir(fig, d);
    worstS = Math.max(worstS, Math.abs(figS(fig, q)));
    const m = figNormalDir(fig, d);
    const p = [q[0] + 50 * m[0], q[1] + 50 * m[1], q[2] + 50 * m[2]];
    worstAlt = Math.max(worstAlt, Math.abs(figAlt(fig, p) - 50));
  }
  ok(worstS < 0.05, `law: q lands on S=0 (worst residual ${worstS.toExponential(1)} m)`);
  ok(worstAlt < 15, `law: figAlt(q+50·m̂) ≈ 50 m (worst err ${worstAlt.toFixed(1)} m — first-order at the neck)`);
  // m̂ must BE the geometric normal of the q-sheet (self-consistency: the
  // displacement direction is perpendicular to the undisplaced surface, so an
  // h=const shell is locally 'flat' under up=∇S). Tested at the waist where
  // the unequal lobes tilt m̂ hardest.
  {
    const d0 = [0, 1, 0];
    const e = 1e-4;
    const q0 = figMapDir(fig, d0);
    const qU = figMapDir(fig, [e, Math.sqrt(1 - e * e), 0]);
    const qV = figMapDir(fig, [0, Math.sqrt(1 - e * e), e]);
    const tu = [qU[0] - q0[0], qU[1] - q0[1], qU[2] - q0[2]];
    const tv = [qV[0] - q0[0], qV[1] - q0[1], qV[2] - q0[2]];
    let n = [tu[1] * tv[2] - tu[2] * tv[1], tu[2] * tv[0] - tu[0] * tv[2], tu[0] * tv[1] - tu[1] * tv[0]];
    const nl = Math.hypot(...n); n = n.map((x) => x / nl);
    const m = figNormalDir(fig, d0);
    const agree = Math.abs(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]);
    ok(agree > 0.999, `law: m̂ equals the q-sheet geometric normal at the waist (dot ${agree.toFixed(5)})`);
  }
  const mF = figNormalDir(fig, [Math.SQRT1_2, Math.SQRT1_2, 0]);
  const leanF = Math.acos(Math.min(Math.abs(mF[0] * Math.SQRT1_2 + mF[1] * Math.SQRT1_2), 1)) * 180 / Math.PI;
  ok(leanF > 10, `law: neck-flank m̂ leans ${leanF.toFixed(1)}° off radial (the non-radial character is real)`);
}

// ---- 4. the irregular-domain SEAM fixture (exec row) -----------------------
// shared cube-edge cells on arrokoth: heights bit-identical across the two
// faces (the direction key survives the figure), and the RECONSTRUCTED 3-D
// surface points q+h·m̂ agree to sub-micron — the render-side law is seam-free.
{
  const body = bodyById('arrokoth');
  const baker = makeBaker(body);
  const L = 3, D = TILE_RES << L;
  const fig = figOf(body);
  // face 0 right edge (u=1) meets face 5 (check the actual neighbour via dirToFaceUv)
  const edgeDir = faceUvToDir(0, 1, 0.4321);
  const nb = dirToFaceUv([edgeDir[0] * (1 - 1e-12), edgeDir[1], edgeDir[2]]);
  const tA = baker.bakeTile(0, L, (1 << L) - 1, Math.floor(0.4321 * (1 << L)));
  const tB = baker.bakeTile(nb.face, L, Math.floor(nb.u * (1 << L)) === (1 << L) ? (1 << L) - 1 : Math.floor(nb.u * (1 << L)), Math.floor(nb.v * (1 << L)));
  let same = 0, total = 0, worstPos = 0;
  for (let j = 0; j <= TILE_RES; j++) {
    // face-0 edge cell (i = TILE_RES on tile A's grid)
    const vA = (tA.y * TILE_RES + j) / D;
    const dA = faceUvToDir(0, 1, vA);
    const fuB = dirToFaceUv([dA[0] * (1 - 1e-12), dA[1], dA[2]]);
    if (fuB.face !== tB.face) continue;
    const gj = Math.round(fuB.v * D) - tB.y * TILE_RES;
    const gi = Math.round(fuB.u * D) - tB.x * TILE_RES;
    if (gj < -HALO || gj > TILE_RES + HALO || gi < -HALO || gi > TILE_RES + HALO) continue;
    const hA = tA.height[I(TILE_RES, j)], hB = tB.height[I(gi, gj)];
    total++;
    if (Object.is(hA, hB)) same++;
    // reconstructed render positions from BOTH faces' own uv chains
    const qA = figMapDir(fig, dA);
    const mA = figUp(fig, qA);
    const dB = faceUvToDir(fuB.face, (tB.x * TILE_RES + gi) / D, (tB.y * TILE_RES + gj) / D);
    const qB = figMapDir(fig, dB);
    const mB = figUp(fig, qB);
    const pA = [qA[0] + hA * mA[0], qA[1] + hA * mA[1], qA[2] + hA * mA[2]];
    const pB = [qB[0] + hB * mB[0], qB[1] + hB * mB[1], qB[2] + hB * mB[2]];
    worstPos = Math.max(worstPos, Math.hypot(pA[0] - pB[0], pA[1] - pB[1], pA[2] - pB[2]));
  }
  ok(total > 30, `seam: fixture found ${total} shared-edge cells`);
  ok(same === total, `seam: heights bit-identical across the cube edge (${same}/${total})`);
  ok(worstPos < 1e-6 * bodyBoundR(body), `seam: reconstructed q+h·m̂ agree across faces (worst ${worstPos.toExponential(1)} m)`);

  // ---- 5. per-cell metric: sanity + the neck actually necks ----------------
  // a waist-crossing tile on face 2 (+y points at the waist)
  const tN = baker.bakeTile(2, 3, 4, 4);
  ok(!!tN, 'metric: waist tile bakes');
  // bake a fresh baker to reach ctx internals via a probe tile: metric is not
  // shipped on the tile record, so re-derive lu/lv from figMapDir differences
  let luMin = Infinity, luMax = 0, aniMax = 0;
  const Dn = TILE_RES << 3;
  for (let j = 8; j <= TILE_RES - 8; j += 4) {
    for (let i = 8; i <= TILE_RES - 8; i += 4) {
      const u0 = (4 * TILE_RES + i) / Dn, v0 = (4 * TILE_RES + j) / Dn;
      const q0 = figMapDir(fig, faceUvToDir(2, u0, v0));
      const qU = figMapDir(fig, faceUvToDir(2, u0 + 1 / Dn, v0));
      const qV = figMapDir(fig, faceUvToDir(2, u0, v0 + 1 / Dn));
      const lu = Math.hypot(qU[0] - q0[0], qU[1] - q0[1], qU[2] - q0[2]);
      const lv = Math.hypot(qV[0] - q0[0], qV[1] - q0[1], qV[2] - q0[2]);
      luMin = Math.min(luMin, lu, lv); luMax = Math.max(luMax, lu, lv);
      aniMax = Math.max(aniMax, Math.max(lu / lv, lv / lu));
    }
  }
  ok(luMin > 0, `metric: all cell lengths positive (min ${luMin.toFixed(1)} m)`);
  ok(aniMax > 1.15, `metric: the neck ANISOTROPY is real (max lu/lv ${aniMax.toFixed(2)} — the fixture fails if the neck stops necking)`);
  ok(luMax / luMin < 50, `metric: stretch bounded (${(luMax / luMin).toFixed(1)}x)`);

  // ---- 6. relief budget: the bake honours the declaration ------------------
  let minH = Infinity, maxH = -Infinity;
  for (const [f, l, x, y] of [[2, 3, 4, 4], [0, 2, 1, 1], [3, 2, 2, 1], [5, 3, 3, 3]]) {
    const t = baker.bakeTile(f, l, x, y);
    minH = Math.min(minH, t.minH); maxH = Math.max(maxH, t.maxH);
  }
  const budget = body.figure.reliefBudget;
  ok(Math.max(Math.abs(minH), Math.abs(maxH)) <= budget,
    `budget: baked relief [${minH.toFixed(0)}, ${maxH.toFixed(0)}] m within the declared ${budget} m`);
}

// ---- 6b. the SHIPPED metric tensor (post-impl panel: it drove five stateful
// ops but was itself untested): tile.met must equal independent q-differences
{
  const body = bodyById('arrokoth');
  const fig = figOf(body);
  const t = makeBaker(body).bakeTile(2, 3, 4, 4);
  ok(!!t.met, 'metric: figure tiles ship their met arrays');
  const Dn = TILE_RES << 3;
  let worst = 0;
  for (const [i, j] of [[10, 10], [32, 32], [50, 20], [5, 60]]) {
    const u0 = (4 * TILE_RES + i) / Dn, v0 = (4 * TILE_RES + j) / Dn;
    const qA = figMapDir(fig, faceUvToDir(2, u0 - 1 / Dn, v0));
    const qB = figMapDir(fig, faceUvToDir(2, u0 + 1 / Dn, v0));
    const lu = Math.hypot(qB[0] - qA[0], qB[1] - qA[1], qB[2] - qA[2]) * 0.5;
    worst = Math.max(worst, Math.abs(t.met.lu[I(i, j)] / lu - 1));
  }
  ok(worst < 1e-5, `metric: shipped tile.met.lu equals independent q-differences (worst ${worst.toExponential(1)})`);
}

// ---- 6c. the GLSL twin's figUpDir (analytic smin gradient) must agree with
// the CPU figUp the bake displaces along (post-impl panel: the raw-gradient
// mix was 21° off at the neck — the fragment vertical vs the baked normal)
{
  const body = bodyById('arrokoth');
  const fig = figOf(body);
  const L0 = fig.lobes[0], L1 = fig.lobes[1];
  // replicate the GLSL FD form: central differences of figS at e = neckK*2.5e-4
  const glslUp = (p) => {
    const e = fig.neckK * 2.5e-4;
    const g = [0, 1, 2].map((i) => {
      const pa = p.slice(), pb = p.slice();
      pa[i] += e; pb[i] -= e;
      return figS(fig, pa) - figS(fig, pb);
    });
    const l = Math.hypot(...g);
    return g.map((x) => x / l);
  };
  let worstDeg = 0;
  for (let i = 0; i < 200; i++) {
    const y = 1 - (2 * i + 1) / 200, r = Math.sqrt(Math.max(1 - y * y, 0)), ph = i * 2.399963;
    const d = [r * Math.cos(ph), y, r * Math.sin(ph)];
    const q = figMapDir(fig, d);
    const mJ = figUp(fig, q);
    const mG = glslUp(q);
    const dot = Math.min(Math.abs(mJ[0] * mG[0] + mJ[1] * mG[1] + mJ[2] * mG[2]), 1);
    worstDeg = Math.max(worstDeg, Math.acos(dot) * 180 / Math.PI);
  }
  ok(worstDeg < 0.2, `GLSL twin: FD figUpDir agrees with the CPU figUp everywhere (worst ${worstDeg.toFixed(3)}°)`);
}

// ---- 7. sphere-mode equivalence: the metric IS the scalar cell on a sphere --
{
  // a synthetic sphere expressed as an ellipsoid: per-cell metric must equal
  // the legacy faceArc/D scalar to float precision (the legacy-equivalence law)
  const R = 1_737_000;
  const figSph = figOf({ figure: { type: 'ellipsoid', axes: [R, R, R], reliefBudget: 100 } });
  const L = 4, D = TILE_RES << L;
  const cellRef = (Math.PI / 2) * R / D;
  let worst = 0;
  for (let k = 0; k < 40; k++) {
    const u0 = 0.2 + 0.6 * (k / 40), v0 = 0.4;
    const q0 = figMapDir(figSph, faceUvToDir(1, u0, v0));
    const qU = figMapDir(figSph, faceUvToDir(1, u0 + 1 / D, v0));
    const lu = Math.hypot(qU[0] - q0[0], qU[1] - q0[1], qU[2] - q0[2]);
    // gnomonic cells vary ±~30% across a face — compare against the LOCAL
    // analytic gnomonic cell, not the mean: ratio to R·Δangle
    const dot = (q0[0] * qU[0] + q0[1] * qU[1] + q0[2] * qU[2]) / (R * R);
    const arc = R * Math.acos(Math.min(dot, 1));
    worst = Math.max(worst, Math.abs(lu / arc - 1));
  }
  ok(worst < 1e-6, `sphere-mode: ellipsoid(R,R,R) metric equals the great-circle arc (worst ${worst.toExponential(1)})`);
  ok(Math.abs(figRadial(figSph, [0, 1, 0]) - R) < 1e-6 * R, 'sphere-mode: figRadial equals R');
  ok(Math.abs(figS(figSph, [0, R + 123, 0]) - 123) < 0.01, 'sphere-mode: figS(R+123) = 123 m (first-order exact)');
}

// ---- 8. the haloReachM conversion asserts (physical reach → cells) ---------
{
  const body = bodyById('arrokoth');
  // a doctored clone whose horizon proc demands more physical reach than the
  // fixed halo can grant on a compressed neck tile — must throw by NAME
  const clone = { ...body, processes: body.processes.map((p) => p.type === 'horizon' ? { ...p, haloReachM: 1e9 } : p) };
  const baker = makeBaker(clone);
  throws(() => baker.bakeTile(2, 2, 2, 2), 'halo', 'negative: an impossible haloReachM fails the per-tile conversion assert by name');
}

// ---- 9. determinism: two independent bakers agree byte-for-byte -------------
{
  const b1 = makeBaker(bodyById('vesta')).bakeTile(3, 2, 1, 2);
  const b2 = makeBaker(bodyById('vesta')).bakeTile(3, 2, 1, 2);
  let identical = b1.height.length === b2.height.length;
  for (let i = 0; identical && i < b1.height.length; i++) identical = Object.is(b1.height[i], b2.height[i]);
  ok(identical, 'determinism: two fresh vesta bakes are byte-identical (Rheasilvia included)');
}

console.log(`\nfigure-test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
