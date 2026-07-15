// test/smallbody-test.mjs — Phase B gates (round 26): the comet solver class
// (K7's registered trigger — own fixed-count policy, own eMax, perihelion-
// corner sweep with log-spaced M probes), belts as orbital-cell scatter
// (existence law, bounds, density field, flux floor), the coma/tail emission
// look, and the editor-taxonomy closure over the new data.

import assert from 'node:assert/strict';
import { SOL_SYSTEM } from '../src/core/sol.js';
import { AU } from '../src/core/recipe.js';
import {
  solveKepler, solveKeplerComet, resolvedOrbit, bodyStateInertial,
  orbitalPeriodS, orbitalPhaseAt,
} from '../src/core/frames.js';
import { assertMechanicsSystem, COMET_E_MAX, KEPLER_E_MAX } from '../src/core/mechanics.js';
import {
  MAX_BELTS, MAX_BELT_CELLS, BELT_E_CEILING, assertBeltSystem, beltMembers,
  beltDensity, beltSolveE, assertComaRecipe, comaActivity, comaApparentFlux,
  tailLengthM,
} from '../src/core/smallbody.js';
import { classifyEdit, preflightEditedSystem, withLambdaContinuity } from '../src/core/editor.js';
import { assignBodyRepresentations, MAX_BODY_SLOTS } from '../src/core/capacity.js';
import { recipeHash } from '../src/core/system.js';
import { validateSpec } from '../src/scenespec.js';

let n = 0;
const ok = (v, m) => { assert.ok(v, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} (${a} vs ${b})`); n++; };
const throwsNamed = (fn, re, m) => { assert.throws(fn, re, m); n++; };
const wrapPi = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

// ---------------------------------------------------------------------------
// 1. The comet solver class — machine epsilon over e × M incl. the corner
// ---------------------------------------------------------------------------
const bisect = (m, e) => {
  let lo = m - e - 1e-9, hi = m + e + 1e-9;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; (mid - e * Math.sin(mid) - m) < 0 ? (lo = mid) : (hi = mid); }
  return (lo + hi) / 2;
};
{
  const es = [0, 0.1, 0.5, 0.9, 0.95, 0.96714, 0.99, 0.995, 0.999, COMET_E_MAX];
  const Ms = [0, Math.PI, -Math.PI, 12345.678, -98765.4321];
  // the perihelion-corner gate: log-spaced M probes straight into E→0, e→1
  for (let k = -12; k <= 0; k++) { Ms.push(Math.PI * 10 ** k, -Math.PI * 10 ** k); }
  for (let i = 1; i < 24; i++) Ms.push(-Math.PI + i * (2 * Math.PI / 24));
  let worst = 0;
  for (const e of es) for (const M of Ms) {
    const E = solveKeplerComet(M, e);
    const m = wrapPi(M);
    worst = Math.max(worst, Math.abs(E - e * Math.sin(E) - m) / Math.max(1, Math.abs(E)));
    ok(Number.isFinite(E), `comet solve finite at e=${e} M=${M}`);
    near(E, bisect(m, e), 1e-13 * Math.max(1, Math.abs(E)) + 1e-13, `comet solve matches reference at e=${e} M=${M}`);
  }
  ok(worst < 5e-15, `comet solver residual is machine epsilon over the sweep (worst ${worst})`);
  eq(solveKeplerComet(0.1234, COMET_E_MAX), solveKeplerComet(0.1234, COMET_E_MAX), 'fixed-count determinism');
  eq(solveKeplerComet(0.5, 0), wrapPi(0.5), 'e=0 exact fixed point');
  // the class is NEEDED: the K1 8-step Newton measurably degrades in the corner
  const e9 = 0.9999, mC = 1e-6;
  const resid = (E) => Math.abs(E - e9 * Math.sin(E) - mC);
  ok(resid(solveKepler(mC, e9)) > 1e-9, 'K1 Newton degrades at the perihelion corner (the reuse ban is real)');
  ok(resid(solveKeplerComet(mC, e9)) < 1e-13, 'comet solver holds the corner');
}

// ---------------------------------------------------------------------------
// 2. The eMax law — high e must OPT IN, and the opt-in has its own ceiling
// ---------------------------------------------------------------------------
{
  const base = structuredClone(SOL_SYSTEM);
  const cometa = base.bodies.find((b) => b.id === 'cometa');
  ok(cometa, 'sol ships the comet');
  ok(cometa.orbit.e > KEPLER_E_MAX, 'the comet exceeds the K1 ceiling by design');
  eq(cometa.orbit.solver, 'comet', 'and opts into the comet solver class');
  ok(assertMechanicsSystem(base), 'sol with comet passes mechanics');

  const mutate = (fn) => { const s = structuredClone(SOL_SYSTEM); fn(s.bodies.find((b) => b.id === 'cometa')); return () => assertMechanicsSystem(s); };
  throwsNamed(mutate((c) => delete c.orbit.solver), /e must be in \[0, 0\.95\]/, 'e=0.967 without the solver class refused');
  throwsNamed(mutate((c) => { c.orbit.e = COMET_E_MAX; }), /must be in \[0, 0\.9999\)/, 'comet ceiling is strict');
  throwsNamed(mutate((c) => { c.orbit.e = 1.2; }), /must be in \[0, 0\.9999\)/, 'hyperbolic refused');
  throwsNamed(mutate((c) => { c.orbit.solver = 'newton99'; }), /solver must be omitted or 'comet'/, 'unknown solver refused by name');
  const resonant = structuredClone(SOL_SYSTEM);
  const eur = resonant.bodies.find((b) => b.id === 'europa');
  eur.orbit.solver = 'comet';
  throwsNamed(() => assertMechanicsSystem(resonant), /resonance members derive their rate/, 'resonance member cannot claim the comet solver');
  const lowE = structuredClone(SOL_SYSTEM);
  lowE.bodies.find((b) => b.id === 'vesta').orbit = { a: 2.36 * AU, e: 0.09, iDeg: 7.1, OmegaDeg: 103.8, omegaDeg: 151.2, M0Deg: 20, epochS: 0, frame: 'ecliptic', solver: 'comet' };
  ok(assertMechanicsSystem(lowE), 'low-e orbits may opt into the comet solver');
}

// ---------------------------------------------------------------------------
// 3. Comet geometry — real-analog Halley on the K1 machinery
// ---------------------------------------------------------------------------
const cometa = SOL_SYSTEM.bodies.find((b) => b.id === 'cometa');
const P = orbitalPeriodS(cometa, SOL_SYSTEM);
{
  near(P / 31557600, 75.32, 0.05, 'Halley-analog period');
  const o = resolvedOrbit(cometa, SOL_SYSTEM);
  ok(o.i > Math.PI / 2, 'retrograde inclination (162°)');
  const nMean = 2 * Math.PI / P;
  const tPeri = -o.M0 / nMean;
  const rAt = (t) => Math.hypot(...bodyStateInertial(cometa, t, SOL_SYSTEM).r) / AU;
  near(rAt(tPeri), o.a / AU * (1 - o.e), 1e-6, 'perihelion radius is a(1-e) — the corner is exact');
  near(rAt(tPeri), 0.586, 0.002, 'Halley-analog perihelion distance');
  near(rAt(tPeri + P / 2), 35.08, 0.05, 'Halley-analog aphelion distance');
  // λ-continuity is solver-independent: an a-edit at running t preserves the
  // resolved mean longitude through the same zero-probe inversion
  const t0 = 86400 * 500;
  const next = structuredClone(SOL_SYSTEM);
  next.bodies.find((b) => b.id === 'cometa').orbit.a *= 1.04;
  const patched = withLambdaContinuity(SOL_SYSTEM, next, t0);
  near(wrapPi(orbitalPhaseAt(patched.bodies.find((b) => b.id === 'cometa'), t0, patched)
    - orbitalPhaseAt(cometa, t0, SOL_SYSTEM)), 0, 1e-9, 'comet λ-continuity under an a edit');
}

// The registered resolved-disc coma gap is UNREACHABLE in shipped data: the
// nucleus never wins a sky slot from any body at any sampled epoch (16 epochs
// across the full period, incl. perihelion).
{
  const nMean = 2 * Math.PI / P;
  const tPeri = -resolvedOrbit(cometa, SOL_SYSTEM).M0 / nMean;
  let everResolved = false;
  for (let k = 0; k < 16; k++) {
    const t = tPeri + (k / 16) * P;
    const centers = new Map(SOL_SYSTEM.bodies.map((b) => [b.id, bodyStateInertial(b, t, SOL_SYSTEM).r]));
    for (const observer of SOL_SYSTEM.bodies) {
      if (observer.id === 'cometa') continue;
      const oc = centers.get(observer.id);
      const others = SOL_SYSTEM.bodies.filter((b) => b.id !== observer.id).map((b) => {
        const r = centers.get(b.id);
        const d = Math.hypot(r[0] - oc[0], r[1] - oc[1], r[2] - oc[2]);
        return { body: b, angRadius: Math.asin(Math.min(0.999999, b.R / d)) };
      });
      const { resolved } = assignBodyRepresentations(others, MAX_BODY_SLOTS);
      if (resolved.some((x) => x.body.id === 'cometa')) everResolved = true;
    }
  }
  ok(!everResolved, 'the comet rides the point tier from every body at every sampled epoch');
}

// ---------------------------------------------------------------------------
// 4. Coma/tail — the emission look's pure laws
// ---------------------------------------------------------------------------
{
  const coma = cometa.coma;
  ok(assertComaRecipe(cometa), 'shipped coma validates');
  eq(comaActivity(coma, coma.rOnAU + 0.5), 0, 'no activity beyond switch-on');
  eq(comaActivity(coma, coma.rOnAU), 0, 'activity is zero AT switch-on (continuous)');
  eq(comaActivity(coma, 1), 1, 'unit activity at 1 AU');
  ok(comaActivity(coma, 0.586) > 1, 'activity keeps growing inside 1 AU');
  ok(comaActivity(coma, 2) > 0 && comaActivity(coma, 2) < 1, 'partial activity mid-band');
  eq(comaApparentFlux(coma, coma.rOnAU + 1, AU, AU), 0, 'no emission when inactive');
  ok(comaApparentFlux(coma, 0.586, 0.05 * AU, AU) > comaApparentFlux(coma, 0.586, 0.5 * AU, AU), 'emission falls with camera distance');
  eq(tailLengthM(coma, 10, AU), 0, 'no tail when inactive');
  ok(tailLengthM(coma, 0.586, AU) > 0.3 * AU, 'perihelion tail at showcase scale');
  const bad = structuredClone(cometa);
  bad.coma.rOnAU = 0.5;
  throwsNamed(() => assertComaRecipe(bad), /rOnAU must be > 1/, 'coma refusal by name');
  const badKey = structuredClone(cometa);
  badKey.coma.glow = 1;
  throwsNamed(() => assertComaRecipe(badKey), /unknown field\(s\): glow/, 'coma schema is closed');
}

// ---------------------------------------------------------------------------
// 5. Belts — the orbital-cell existence law, bounds, density, budgets
// ---------------------------------------------------------------------------
{
  ok(assertBeltSystem(SOL_SYSTEM), 'shipped belts validate');
  eq(SOL_SYSTEM.belts.length, 2, 'main + kuiper');
  ok(SOL_SYSTEM.belts.length <= MAX_BELTS, 'belt count inside budget');

  for (const belt of SOL_SYSTEM.belts) {
    ok(belt.cells <= MAX_BELT_CELLS, `${belt.id} cells inside budget`);
    const m = beltMembers(belt, SOL_SYSTEM.star.GM);
    const m2 = beltMembers(belt, SOL_SYSTEM.star.GM);
    ok(m.count > belt.cells * 0.5, `${belt.id} populates (${m.count}/${belt.cells})`);
    eq(m.count, m2.count, `${belt.id} deterministic count`);
    let identical = true, bounded = true;
    for (let i = 0; i < m.count; i++) {
      identical &&= m.a[i] === m2.a[i] && m.M0[i] === m2.M0[i] && m.R[i] === m2.R[i];
      bounded &&= m.a[i] >= belt.aInner && m.a[i] <= belt.aOuter
        && m.e[i] >= 0 && m.e[i] <= belt.eMax
        && Math.abs(m.inc[i]) <= 2 * belt.iSigmaDeg * Math.PI / 180 + 1e-12
        && m.R[i] >= belt.minR && m.R[i] <= belt.maxR
        && m.n[i] > 0;
    }
    ok(identical, `${belt.id} members are a pure function of the recipe`);
    ok(bounded, `${belt.id} elements inside authored bounds`);
    // existence is hashed on the ORBITAL CELL: element knobs cannot change WHO exists
    const retuned = structuredClone(belt);
    retuned.eMax = Math.min(BELT_E_CEILING, belt.eMax + 0.1); retuned.iSigmaDeg += 3;
    const m3 = beltMembers(retuned, SOL_SYSTEM.star.GM);
    eq(m3.count, m.count, `${belt.id} existence is independent of element knobs`);
    let sameA = true;
    for (let i = 0; i < m.count; i++) sameA &&= m3.a[i] === m.a[i];
    ok(sameA, `${belt.id} cell ownership of a survives element retunes`);
  }

  // the density field carves the Kirkwood gaps: gap windows are much emptier
  const main = SOL_SYSTEM.belts.find((b) => b.id === 'main-belt');
  const m = beltMembers(main, SOL_SYSTEM.star.GM);
  const inWindow = (c, w) => { let k = 0; for (let i = 0; i < m.count; i++) if (Math.abs(m.a[i] - c) < w) k++; return k; };
  for (const gap of main.gaps) {
    const inGap = inWindow(gap.a, gap.w * 0.4);
    const beside = inWindow(gap.a + 2.5 * gap.w * (gap.a < (main.aInner + main.aOuter) / 2 ? 1 : -1), gap.w * 0.4);
    // the triangular kernel averages 0.8·depth over the ±0.4w window; allow a
    // 3σ Poisson margin on top — carved, not tuned-to-pass
    const expected = beside * (1 - 0.8 * gap.depth);
    ok(inGap < expected + 3 * Math.sqrt(Math.max(beside, 1)), `gap at ${(gap.a / AU).toFixed(3)} AU is carved (${inGap} vs ${beside} beside)`);
    ok(beltDensity(main, gap.a) <= 1 - gap.depth + 1e-12, 'density field bottoms in the gap');
  }

  // the in-shader solver twin agrees with the reference solver to fp32 scale
  let worst = 0;
  for (let e = 0; e <= BELT_E_CEILING + 1e-9; e += 0.05) {
    for (let M = -Math.PI; M <= Math.PI; M += 0.1) worst = Math.max(worst, Math.abs(beltSolveE(M, e) - solveKepler(M, e)));
  }
  ok(worst < 1e-9, `belt solver twin matches K1 over its e ceiling (worst ${worst})`);

  // refusals, by name
  const withBelt = (patch) => () => assertBeltSystem({ belts: [{ ...main, ...patch }] });
  throwsNamed(withBelt({ cells: MAX_BELT_CELLS + 1 }), /cells must be an integer/, 'cell budget enforced');
  throwsNamed(withBelt({ eMax: 0.6 }), /eMax must be in \[0, 0\.4\]/, 'belt e ceiling enforced (in-shader solve is only verified to it)');
  throwsNamed(withBelt({ chaos: 1 }), /unknown field\(s\): chaos/, 'belt schema is closed');
  throwsNamed(withBelt({ gaps: [{ a: main.aOuter * 2, w: 0.01 * AU, depth: 0.5 }] }), /gap\.a must lie inside/, 'gap containment');
  throwsNamed(() => assertBeltSystem({ belts: [main, main] }), /duplicate belt id/, 'unique belt ids');
  throwsNamed(() => assertBeltSystem({ belts: Array.from({ length: MAX_BELTS + 1 }, (_, i) => ({ ...main, id: `b${i}` })) }), /exceed MAX_BELTS/, 'belt count budget');

  // never landable, structurally: belts contribute nothing to bodies[], so no
  // marker/travel/menu surface can ever see them
  ok(!SOL_SYSTEM.bodies.some((b) => b.id === 'main-belt' || b.id === 'kuiper-belt'), 'belts are not bodies');
}

// ---------------------------------------------------------------------------
// 6. The sky flux floor — why the radiometric sky pass honestly omits belts
// ---------------------------------------------------------------------------
{
  // faintest catalog star the sky pass renders (stars.mjs magnitude law)
  const starFloor = 0.012 * Math.pow(10, -0.4 * 7.2);
  for (const belt of SOL_SYSTEM.belts) {
    const irr = SOL_SYSTEM.star.irradianceAt1AU * (AU / belt.aInner) ** 2;
    const meanAlb = (belt.albedo[0] + belt.albedo[1] + belt.albedo[2]) / 3;
    // brightest possible member at a genuinely close 0.01 AU flyby
    const angR = belt.maxR / (0.01 * AU);
    const flux = irr * meanAlb * angR * angR * (2 / 3);
    ok(flux < starFloor / 10, `${belt.id} brightest member at 0.01 AU stays an order below the faintest sky star (${flux.toExponential(2)} < ${starFloor.toExponential(2)}/10)`);
  }
}

// ---------------------------------------------------------------------------
// 7. Editor closure — taxonomy rows, classification, preflight, reproducibility
// ---------------------------------------------------------------------------
{
  ok(preflightEditedSystem(SOL_SYSTEM), 'sol (with belts + coma) preflights whole');
  const comaEdit = structuredClone(SOL_SYSTEM);
  comaEdit.bodies.find((b) => b.id === 'cometa').coma.strength *= 2;
  const plan = classifyEdit(SOL_SYSTEM, comaEdit);
  eq(plan.scope, 'bodies', 'coma edit dispatches per-body');
  eq(plan.bodies.size, 1, 'coma edit touches one body');
  ok(plan.bodies.get('cometa').classes.has('look') && plan.bodies.get('cometa').classes.size === 1, 'coma is a pure look edit');

  const beltEdit = structuredClone(SOL_SYSTEM);
  beltEdit.belts[0].gaps[0].depth = 0.5;
  const plan2 = classifyEdit(SOL_SYSTEM, beltEdit);
  eq(plan2.scope, 'system', 'belt edit takes the structural path');
  ok(plan2.systemKeys.includes('belts'), 'belt edit is named');

  const badBelt = structuredClone(SOL_SYSTEM);
  badBelt.belts[0].eMax = 0.6;
  throwsNamed(() => preflightEditedSystem(badBelt), /eMax must be in/, 'preflight refuses a bad belt on the copy');
  const badComa = structuredClone(SOL_SYSTEM);
  badComa.bodies.find((b) => b.id === 'cometa').coma.tailAU = -1;
  throwsNamed(() => preflightEditedSystem(badComa), /tailAU must be > 0/, 'preflight refuses a bad coma on the copy');

  eq(recipeHash(JSON.parse(JSON.stringify(SOL_SYSTEM))), recipeHash(SOL_SYSTEM), 'belts + coma survive the JSON export/import round-trip');
  const spec = validateSpec({ system: JSON.parse(JSON.stringify(SOL_SYSTEM)), body: 'cometa' });
  ok(spec.ok, 'a spec.system payload carries the belts and the comet');
}

console.log(`smallbody-test: ${n} assertions passed`);
