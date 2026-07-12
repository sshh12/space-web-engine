// climate-test.mjs — round-13 (Phase 2 mechanical residue) mechanism contracts
// the generalized process harness cannot see: inverted relief prints & is
// additive & gated; the resurfacing-age crater SFD subdues craters on the maria
// and is byte-identical off-mare; deflected-wind moisture is genuinely wired
// (the terrain deflection moves the rain field) yet stays deterministic.
// Run: npm run test:climate

import { makeBaker, TILE_RES, I } from '../src/bakecore.js';
import { buildGlobal, clearGlobalCache } from '../src/globalgrid.js';
import { bodyById } from '../src/recipe.js';
import { dirToFaceUv } from '../src/mathx.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const clone = (b) => ({ ...b, processes: b.processes.map((p) => ({ ...p })) });
const without = (b, type) => ({ ...b, processes: b.processes.filter((p) => p.type !== type) });
const rubra = bodyById('rubra'), luna = bodyById('luna'), tellus = bodyById('tellus');

const tileAt = (body, dir, level) => {
  const f = dirToFaceUv(dir); const D = 1 << level;
  return { face: f.face, level, x: Math.min(Math.floor(f.u * D), D - 1), y: Math.min(Math.floor(f.v * D), D - 1) };
};
const maxAbsDelta = (A, B) => {
  let m = 0;
  for (let j = 0; j <= TILE_RES; j++) for (let i = 0; i <= TILE_RES; i++) {
    const d = Math.abs(A.height[I(i, j)] - B.height[I(i, j)]); if (d > m) m = d;
  }
  return m;
};
const minSignedDelta = (A, B) => {
  let m = Infinity;
  for (let j = 0; j <= TILE_RES; j++) for (let i = 0; i <= TILE_RES; i++) {
    const d = A.height[I(i, j)] - B.height[I(i, j)]; if (d < m) m = d;
  }
  return m;
};
// golden-ratio lat/lon walk (deterministic tile finder)
const walkDir = (k) => {
  const lat = Math.asin(2 * ((k * 0.6180339887) % 1) - 1);
  const lon = 2 * Math.PI * ((k * 0.7548776662) % 1);
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
};

// ---- 1. inverted relief (Rubra): additive raise of ancient dry paleochannels ----
{
  const invP = rubra.processes.find((q) => q.type === 'invert');
  check('rubra carries an invert process', !!invP);
  const bakerA = makeBaker(clone(rubra), { cacheMax: 160 });
  const bakerB = makeBaker(without(clone(rubra), 'invert'), { cacheMax: 160 });
  let printed = null, bare = null;
  for (let k = 1; k < 500 && (!printed || !bare); k++) {
    const loc = tileAt(rubra, walkDir(k), 6);
    const A = bakerA.bakeTile(loc.face, loc.level, loc.x, loc.y);
    const B = bakerB.bakeTile(loc.face, loc.level, loc.x, loc.y);
    const dm = maxAbsDelta(A, B);
    if (dm > invP.amp * 0.3 && !printed) printed = { loc, dm };
    if (dm < 1e-4 && !bare) bare = true;
  }
  check('inverted relief prints where the mid-flow x dry x old gate opens',
    printed !== null, printed ? `Δ=${printed.dm.toFixed(0)}m (amp=${invP.amp})` : 'no printing tile in 500');
  // additive check on the DIRECT effect: bake truncated to end at `invert`
  // (before thermal/strata react to the new ridge) with/without invert — invert
  // itself only raises (`height += ...`); the full-pipeline delta later
  // redistributes via thermal, which is the world legitimately responding.
  if (printed) {
    const invIdx = rubra.processes.findIndex((q) => q.type === 'invert');
    const trunc = (withInv) => ({
      ...rubra,
      processes: rubra.processes.slice(0, invIdx + 1)
        .filter((p) => withInv || p.type !== 'invert').map((p) => ({ ...p })),
    });
    const { face, level, x, y } = printed.loc;
    const Td = makeBaker(trunc(true), { cacheMax: 24 }).bakeTile(face, level, x, y);
    const Tn = makeBaker(trunc(false), { cacheMax: 24 }).bakeTile(face, level, x, y);
    // invert's per-level stamp is strictly additive (`height += ...`); the only
    // lowering is bounded catmull-rom upsampling undershoot on the ridge flanks
    // (the same non-monotone kernel used everywhere), << the raise it makes.
    const lo = minSignedDelta(Td, Tn), hi = maxAbsDelta(Td, Tn);
    check('inverted relief is a RAISE — additive-dominant, only bounded flank undershoot (D4)',
      lo > -0.05 * invP.amp && hi > 10 * Math.abs(lo),
      `raise=${hi.toFixed(0)}m worst undershoot=${lo.toFixed(1)}m`);
  }
  check('inverted relief byte-identical where the gate is closed (off the paleochannels)',
    bare === true, bare ? 'found a byte-identical tile' : 'none in 500');
}

// ---- 2. resurfacing-age crater SFD (Luna): craters subdued on the maria ----
{
  const crP = luna.processes.find((q) => q.type === 'craters');
  check('luna craters carry resurfK', (crP.resurfK ?? 0) > 0);
  const bakerR = makeBaker(clone(luna), { cacheMax: 160 });
  const lunaNo = clone(luna); lunaNo.processes.find((q) => q.type === 'craters').resurfK = 0;
  const bakerN = makeBaker(lunaNo, { cacheMax: 160 });
  const meanMare = (t) => {
    let s = 0, n = 0;
    for (let j = 0; j <= TILE_RES; j++) for (let i = 0; i <= TILE_RES; i++) { s += t.fields.mare[I(i, j)]; n++; }
    return s / n;
  };
  let mareHit = null, dryHit = null;
  for (let k = 1; k < 600 && (!mareHit || !dryHit); k++) {
    const loc = tileAt(luna, walkDir(k), 12);
    const R = bakerR.bakeTile(loc.face, loc.level, loc.x, loc.y);
    const mm = meanMare(R);
    if (mm > 0.5 && !mareHit) mareHit = loc;
    if (mm < 1e-3 && !dryHit) dryHit = loc;
  }
  check('found a flooded (mare) and a highland (dry) Luna tile', !!mareHit && !!dryHit);
  if (mareHit) {
    const Rm = bakerR.bakeTile(mareHit.face, mareHit.level, mareHit.x, mareHit.y);
    const Nm = bakerN.bakeTile(mareHit.face, mareHit.level, mareHit.x, mareHit.y);
    check('resurfacing subdues crater relief on the maria (resurfK vs 0 differs)',
      maxAbsDelta(Rm, Nm) > 5, `Δ=${maxAbsDelta(Rm, Nm).toFixed(1)}m`);
  }
  if (dryHit) {
    const Rd = bakerR.bakeTile(dryHit.face, dryHit.level, dryHit.x, dryHit.y);
    const Nd = bakerN.bakeTile(dryHit.face, dryHit.level, dryHit.x, dryHit.y);
    check('resurfacing byte-identical off the maria (mare=0 highlands)',
      maxAbsDelta(Rd, Nd) < 1e-4, `Δ=${maxAbsDelta(Rd, Nd).toExponential(1)}m`);
  }
}

// ---- 3. deflected-wind moisture (Tellus): R1 wired + deterministic ----
{
  clearGlobalCache();
  const gp = tellus.processes.find((q) => q.type === 'global');
  const g1 = buildGlobal(tellus, gp);                                   // deflected (kDef 60)
  const g0 = buildGlobal(tellus, { ...gp, wind: { ...gp.wind, kDef: 0 } }); // undeflected prior
  let maxDiff = 0;
  for (let k = 1; k < 3000; k++) {
    const dir = walkDir(k);
    maxDiff = Math.max(maxDiff, Math.abs(g1.sample('moist', dir) - g0.sample('moist', dir)));
  }
  check('deflected-wind moisture: terrain deflection moves the rain field (R1 wired)',
    maxDiff > 0.01, `maxΔ=${maxDiff.toFixed(3)}`);
  const g1b = buildGlobal(tellus, gp);
  let same = true;
  for (let k = 1; k < 800 && same; k++) {
    const dir = walkDir(k);
    if (g1.sample('moist', dir) !== g1b.sample('moist', dir)) same = false;
  }
  check('deflected-wind moisture deterministic (fresh rebuild bit-identical)', same);
}

if (failures) { console.error(`${failures} climate/residue contract(s) FAILED`); process.exit(1); }
console.log('all round-13 climate/residue contracts hold');
