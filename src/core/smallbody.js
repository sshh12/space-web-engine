// smallbody.js — Phase B pure laws: belts as §7 scatter over an orbital
// density field, and the comet coma/tail emission look.
//
// CONCEPT §11: "an asteroid is a fact of the system" — a belt member's
// existence is hashed on its ORBITAL CELL (each cell owns one a-range of the
// belt annulus and one Bernoulli draw against the authored density field), so
// membership is a deterministic property of the recipe, never of the camera,
// the frame rate, or the epoch. Members get closed-form conic elements from
// the same cell hash and ride the ephemeris like everything else; they render
// through the Phase C point tier and are NEVER landable (no markers, no
// picking, no travel, no bodies[] entry — structurally, not by a flag).
//
// PURE module (no THREE/DOM/Date/random): Node suites, the renderer and the
// editor preflight consume identical laws.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// Capacity rows (M5: counts are data). A belt is a bounded instanced draw —
// 8192 cells ≈ one small vertex buffer; four belts keep the whole class under
// 32k verts, orders below any GPU budget that matters.
export const MAX_BELTS = 4;
export const MAX_BELT_CELLS = 8192;
export const BELT_E_CEILING = 0.4;   // the in-shader fixed-count solve is
                                     // verified to this bound, not beyond
export const BELT_SOLVER_ITERS = 6;  // shared by the GLSL twin (belt-test pins
                                     // the JS/GLSL algorithm to this count)

const BELT_KEYS = new Set([
  'id', 'name', 'cells', 'aInner', 'aOuter', 'eMax', 'iSigmaDeg',
  'seed', 'albedo', 'minR', 'maxR', 'gaps',
]);

export function assertBeltSystem(system) {
  const belts = system?.belts;
  if (belts == null) return true;
  if (!Array.isArray(belts)) throw new Error('smallbody: system.belts must be an array');
  if (belts.length > MAX_BELTS) throw new Error(`smallbody: ${belts.length} belts exceed MAX_BELTS=${MAX_BELTS}`);
  const ids = new Set();
  for (const belt of belts) {
    const label = `belt '${belt?.id}'`;
    if (typeof belt?.id !== 'string' || !belt.id) throw new Error('smallbody: every belt needs an id');
    if (ids.has(belt.id)) throw new Error(`smallbody: duplicate belt id '${belt.id}'`);
    ids.add(belt.id);
    const bad = Object.keys(belt).filter((k) => !BELT_KEYS.has(k));
    if (bad.length) throw new Error(`smallbody: ${label} has unknown field(s): ${bad.join(', ')}`);
    if (!Number.isInteger(belt.cells) || belt.cells < 1 || belt.cells > MAX_BELT_CELLS) {
      throw new Error(`smallbody: ${label}.cells must be an integer in [1, ${MAX_BELT_CELLS}]`);
    }
    if (!(belt.aInner > 0) || !(belt.aOuter > belt.aInner)) throw new Error(`smallbody: ${label} needs 0 < aInner < aOuter (metres)`);
    if (!finite(belt.eMax) || belt.eMax < 0 || belt.eMax > BELT_E_CEILING) {
      throw new Error(`smallbody: ${label}.eMax must be in [0, ${BELT_E_CEILING}] (the in-shader solve is verified to that bound)`);
    }
    if (!finite(belt.iSigmaDeg) || belt.iSigmaDeg < 0 || belt.iSigmaDeg > 30) throw new Error(`smallbody: ${label}.iSigmaDeg must be in [0, 30]`);
    if (!Number.isInteger(belt.seed)) throw new Error(`smallbody: ${label}.seed must be an integer`);
    if (!Array.isArray(belt.albedo) || belt.albedo.length !== 3 || !belt.albedo.every((v) => finite(v) && v >= 0 && v <= 1)) {
      throw new Error(`smallbody: ${label}.albedo must be [r,g,b] in [0,1]`);
    }
    if (!(belt.minR > 0) || !(belt.maxR >= belt.minR)) throw new Error(`smallbody: ${label} needs 0 < minR <= maxR (metres)`);
    for (const gap of belt.gaps ?? []) {
      const gk = Object.keys(gap).filter((k) => !['a', 'w', 'depth'].includes(k));
      if (gk.length) throw new Error(`smallbody: ${label} gap has unknown field(s): ${gk.join(', ')}`);
      if (!(gap.a > belt.aInner && gap.a < belt.aOuter)) throw new Error(`smallbody: ${label} gap.a must lie inside the annulus`);
      if (!(gap.w > 0)) throw new Error(`smallbody: ${label} gap.w must be > 0`);
      if (!(gap.depth > 0 && gap.depth <= 1)) throw new Error(`smallbody: ${label} gap.depth must be in (0, 1]`);
    }
  }
  return true;
}

// Deterministic cell hash — the FNV mix every other identity in the codebase
// uses, salted per draw so one cell yields independent element coordinates.
export function beltHash01(seed, cell, salt) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  h = Math.imul(h ^ cell, 0x01000193);
  h = Math.imul(h ^ salt, 0x01000193);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// The orbital density field: 1 minus triangular gap kernels (the ring-gap
// datum shape reused as data). Doubles as the existence probability.
export function beltDensity(belt, a) {
  let d = 1;
  for (const gap of belt.gaps ?? []) {
    d -= gap.depth * Math.max(0, 1 - Math.abs(a - gap.a) / gap.w);
  }
  return Math.max(0, Math.min(1, d));
}

/**
 * Materialize a belt's members: existence hashed per orbital cell against the
 * density field, elements drawn from the same hash. Returns parallel arrays
 * (Float64) — count is the number of EXISTING members. Closed-form in time by
 * construction: position at t is (elements, t) through Kepler, nothing else.
 */
export function beltMembers(belt, starGM) {
  if (!(starGM > 0)) throw new Error('smallbody: beltMembers needs starGM > 0');
  const cap = belt.cells;
  const a = new Float64Array(cap), e = new Float64Array(cap), inc = new Float64Array(cap);
  const Omega = new Float64Array(cap), omega = new Float64Array(cap), M0 = new Float64Array(cap);
  const n = new Float64Array(cap), R = new Float64Array(cap);
  let count = 0;
  const span = belt.aOuter - belt.aInner;
  for (let k = 0; k < cap; k++) {
    // the cell OWNS this a-range; its centre is the member's semi-major axis,
    // jittered within the cell so the annulus has no ring artifacts
    const ak = belt.aInner + span * (k + beltHash01(belt.seed, k, 1)) / cap;
    if (beltHash01(belt.seed, k, 0) >= beltDensity(belt, ak)) continue;
    a[count] = ak;
    e[count] = belt.eMax * Math.sqrt(beltHash01(belt.seed, k, 2));            // Rayleigh-ish
    inc[count] = belt.iSigmaDeg * DEG * 2                                     // ~gaussian via
      * (beltHash01(belt.seed, k, 3) + beltHash01(belt.seed, k, 4) - 1);      // sum of uniforms
    Omega[count] = TAU * beltHash01(belt.seed, k, 5);
    omega[count] = TAU * beltHash01(belt.seed, k, 6);
    M0[count] = TAU * beltHash01(belt.seed, k, 7);
    n[count] = Math.sqrt(starGM / (ak * ak * ak));
    // power-law sizes: many small, few large
    R[count] = belt.minR * (belt.maxR / belt.minR) ** (beltHash01(belt.seed, k, 8) ** 3);
    count++;
  }
  const cut = (arr) => arr.subarray(0, count);
  return { count, a: cut(a), e: cut(e), inc: cut(inc), Omega: cut(Omega), omega: cut(omega), M0: cut(M0), n: cut(n), R: cut(R) };
}

// The JS twin of the in-shader fixed-count Newton solve (belt e <= 0.4 keeps
// the Danby-free starter safe). belt-test pins JS-vs-reference to float error.
export function beltSolveE(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < BELT_SOLVER_ITERS; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

// ---------------------------------------------------------------------------
// Comet coma/tail — an EMISSION look (registered since round 18, shipped here).
// Consumed by the point-tier flux hand-down and the system view; the resolved-
// disc rung's coma halo stays registered (unreachable for the shipped nucleus:
// smallbody-test proves it never wins a sky slot from any body at any epoch).
// ---------------------------------------------------------------------------

const COMA_KEYS = new Set(['rOnAU', 'strength', 'tailAU', 'color']);

export function assertComaRecipe(body) {
  const coma = body?.coma;
  if (coma == null) return true;
  const label = `body '${body.id}'.coma`;
  const bad = Object.keys(coma).filter((k) => !COMA_KEYS.has(k));
  if (bad.length) throw new Error(`smallbody: ${label} has unknown field(s): ${bad.join(', ')}`);
  if (!(coma.rOnAU > 1)) throw new Error(`smallbody: ${label}.rOnAU must be > 1 (activity references 1 AU)`);
  if (!(coma.strength > 0)) throw new Error(`smallbody: ${label}.strength must be > 0`);
  if (!(coma.tailAU > 0)) throw new Error(`smallbody: ${label}.tailAU must be > 0`);
  if (!Array.isArray(coma.color) || coma.color.length !== 3 || !coma.color.every((v) => finite(v) && v >= 0)) {
    throw new Error(`smallbody: ${label}.color must be [r,g,b] >= 0`);
  }
  return true;
}

/** Sublimation activity: 0 outside rOnAU, 1 at 1 AU, quadratic growth inside.
 * Closed-form in heliocentric distance only — camera- and history-free. */
export function comaActivity(coma, rAU) {
  const x = (coma.rOnAU - rAU) / (coma.rOnAU - 1);
  return x <= 0 ? 0 : x * x;
}

/** Apparent coma flux in the discIntegratedFlux hand-down's units: strength is
 * the flux seen from 1 AU away when the comet sits 1 AU from the star. */
export function comaApparentFlux(coma, rAU, distM, AU) {
  const act = comaActivity(coma, rAU);
  if (act === 0) return 0;
  return coma.strength * act * (1 / (rAU * rAU)) * (AU / distM) * (AU / distM);
}

/** Anti-sunward tail length in metres (ion tail: straight, insolation-fed). */
export function tailLengthM(coma, rAU, AU) {
  return coma.tailAU * comaActivity(coma, rAU) * AU;
}
