// mechanics.js — Phase K recipe contracts and unit-safe orbital constants.
// This module deliberately imports no recipe data: recipes can validate at load
// time, while frames.js consumes the same predicates without a circular import.

export const TAU = Math.PI * 2;
export const DAY_S = 86400;
export const JULIAN_CENTURY_S = 36525 * DAY_S;
export const KEPLER_E_MAX = 0.95;
// Phase B: the comet solver class (K7's registered trigger). Its own ceiling is
// STRICT — the corner-starter solve is test-pinned to machine epsilon at
// e = 0.9999 and nothing above that is verified. The default 8-step Newton
// measurably degrades past e ≈ 0.995 and must never be silently reused, so an
// orbit above KEPLER_E_MAX must OPT IN via orbit.solver = 'comet'.
export const COMET_E_MAX = 0.9999;
export const DEFAULT_VALID_YEARS = 5000;

const LEGACY_ORBIT_KEYS = new Set(['a', 'periodDays', 'phase0']);
const LEGACY_SPIN_KEYS = new Set(['tiltDeg', 'periodH', 'phase0']);
const NEW_ORBIT_KEYS = new Set([
  'a', 'e', 'iDeg', 'OmegaDeg', 'omegaDeg', 'M0Deg', 'epochS',
  'OmegaDotDegCy', 'omegaDotDegCy', 'frame', 'resonance', 'solver',
]);
const NEW_SPIN_KEYS = new Set([
  'poleLonDeg', 'poleLatDeg', 'periodH', 'locked', 'lockRatio',
  'phase0', 'meridianDeg', 'poleDotDegCy',
]);

const ownKeysAre = (value, allowed) => Object.keys(value ?? {}).every((key) => allowed.has(key));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function isLegacyOrbit(orbit) {
  return !!orbit && ownKeysAre(orbit, LEGACY_ORBIT_KEYS)
    && LEGACY_ORBIT_KEYS.size === Object.keys(orbit).length;
}

export function isLegacySpin(spin) {
  return !!spin && ownKeysAre(spin, LEGACY_SPIN_KEYS)
    && LEGACY_SPIN_KEYS.size === Object.keys(spin).length;
}

export function ratioValue(ratio, label = 'ratio') {
  if (finite(ratio) && ratio > 0) return ratio;
  if (Array.isArray(ratio) && ratio.length === 2
      && finite(ratio[0]) && finite(ratio[1]) && ratio[0] > 0 && ratio[1] > 0) {
    return ratio[0] / ratio[1];
  }
  throw new Error(`mechanics: ${label} must be a positive number or [positive, positive]`);
}

function assertFinite(value, label) {
  if (!finite(value)) throw new Error(`mechanics: ${label} must be finite`);
}

function assertNewOrbit(orbit, label, resonances) {
  if (!ownKeysAre(orbit, NEW_ORBIT_KEYS)) {
    const bad = Object.keys(orbit).filter((key) => !NEW_ORBIT_KEYS.has(key));
    throw new Error(`mechanics: ${label} has unknown or unitless orbit field(s): ${bad.join(', ')}`);
  }
  for (const unitless of ['i', 'Omega', 'omega', 'M0', 'OmegaDot', 'omegaDot']) {
    if (unitless in orbit) throw new Error(`mechanics: ${label}.${unitless} needs an explicit Deg or DegCy suffix`);
  }
  assertFinite(orbit.e, `${label}.e`);
  if (orbit.solver != null && orbit.solver !== 'comet') {
    throw new Error(`mechanics: ${label}.solver must be omitted or 'comet'`);
  }
  if (orbit.solver === 'comet') {
    if (orbit.resonance) throw new Error(`mechanics: ${label} resonance members derive their rate and cannot use the comet solver`);
    if (orbit.e < 0 || !(orbit.e < COMET_E_MAX)) {
      throw new Error(`mechanics: ${label}.e must be in [0, ${COMET_E_MAX}) under the comet solver`);
    }
  } else if (orbit.e < 0 || orbit.e > KEPLER_E_MAX) {
    throw new Error(`mechanics: ${label}.e must be in [0, ${KEPLER_E_MAX}] (orbits above this opt into orbit.solver = 'comet')`);
  }
  for (const key of ['iDeg', 'OmegaDeg', 'omegaDeg', 'epochS']) assertFinite(orbit[key], `${label}.${key}`);
  for (const key of ['OmegaDotDegCy', 'omegaDotDegCy']) {
    if (orbit[key] != null) assertFinite(orbit[key], `${label}.${key}`);
  }
  if (orbit.frame !== 'ecliptic' && orbit.frame !== 'parentEq') {
    throw new Error(`mechanics: ${label}.frame must be 'ecliptic' or 'parentEq'`);
  }
  if (orbit.resonance) {
    if ('a' in orbit) throw new Error(`mechanics: ${label} is a resonance member and may not author a`);
    const r = orbit.resonance;
    const bad = Object.keys(r).filter((key) => !['group', 'ratio', 'phaseDeg'].includes(key));
    if (bad.length) throw new Error(`mechanics: ${label}.resonance has unknown field(s): ${bad.join(', ')}`);
    if (!r || typeof r.group !== 'string') throw new Error(`mechanics: ${label}.resonance needs group`);
    ratioValue(r.ratio, `${label}.resonance.ratio`);
    assertFinite(r.phaseDeg, `${label}.resonance.phaseDeg`);
    if (!resonances.has(r.group)) throw new Error(`mechanics: ${label} references missing resonance group '${r.group}'`);
    if ('M0Deg' in orbit) throw new Error(`mechanics: ${label} resonance phase derives M0Deg; do not author both`);
  } else {
    if (!(orbit.a > 0)) throw new Error(`mechanics: ${label}.a must be > 0`);
    assertFinite(orbit.M0Deg, `${label}.M0Deg`);
  }
}

function assertOrbit(orbit, label, resonances) {
  if (isLegacyOrbit(orbit)) {
    if (!(orbit.a > 0) || !(orbit.periodDays > 0) || !finite(orbit.phase0)) {
      throw new Error(`mechanics: ${label} legacy orbit needs a>0, periodDays>0, finite phase0`);
    }
    return;
  }
  if (orbit?.periodDays != null || orbit?.phase0 != null) {
    throw new Error(`mechanics: ${label} mixes legacy orbit fields with conic elements`);
  }
  assertNewOrbit(orbit, label, resonances);
}

function assertSpin(spin, label) {
  if (isLegacySpin(spin)) {
    if (!finite(spin.tiltDeg) || !(spin.periodH > 0) || !finite(spin.phase0)) {
      throw new Error(`mechanics: ${label} legacy spin needs finite tiltDeg/phase0 and periodH>0`);
    }
    return;
  }
  if (!ownKeysAre(spin, NEW_SPIN_KEYS)) {
    const bad = Object.keys(spin ?? {}).filter((key) => !NEW_SPIN_KEYS.has(key));
    throw new Error(`mechanics: ${label} has unknown or unitless spin field(s): ${bad.join(', ')}`);
  }
  if (spin?.tiltDeg != null) throw new Error(`mechanics: ${label} mixes legacy tiltDeg with pole spin fields`);
  if (spin?.locked != null && typeof spin.locked !== 'boolean') throw new Error(`mechanics: ${label}.locked must be boolean`);
  for (const key of ['poleLonDeg', 'poleLatDeg', 'phase0', 'meridianDeg']) assertFinite(spin?.[key], `${label}.${key}`);
  if (spin.poleLatDeg < -90 || spin.poleLatDeg > 90) throw new Error(`mechanics: ${label}.poleLatDeg must be in [-90, 90]`);
  const locked = spin.locked === true || spin.lockRatio != null;
  if (locked === (spin.periodH != null)) {
    throw new Error(`mechanics: ${label} needs exactly one of periodH or locked/lockRatio`);
  }
  if (spin.periodH != null && !(spin.periodH > 0)) throw new Error(`mechanics: ${label}.periodH must be > 0`);
  if (spin.lockRatio != null) ratioValue(spin.lockRatio, `${label}.lockRatio`);
  if (spin.poleDotDegCy != null) {
    assertFinite(spin.poleDotDegCy, `${label}.poleDotDegCy`);
    if (spin.poleDotDegCy !== 0) {
      throw new Error(`mechanics: ${label}.poleDotDegCy is registered but nonzero axial precession is not implemented`);
    }
  }
}

export function assertMechanicsSystem(system) {
  if (!system || !system.star || !Array.isArray(system.bodies)) throw new Error('mechanics: system needs star and bodies[]');
  if (!(system.star.GM > 0)) throw new Error('mechanics: star.GM must be > 0');
  const validYears = system.validYears ?? DEFAULT_VALID_YEARS;
  if (!(finite(validYears) && validYears > 0)) throw new Error('mechanics: system.validYears must be > 0');

  const ids = new Set(['star']);
  for (const node of system.nodes ?? []) {
    if (!node?.id || ids.has(node.id)) throw new Error(`mechanics: duplicate or missing node id '${node?.id}'`);
    ids.add(node.id);
  }
  for (const body of system.bodies) {
    if (!body?.id || ids.has(body.id)) throw new Error(`mechanics: duplicate or missing body id '${body?.id}'`);
    ids.add(body.id);
  }

  const resonanceGroups = new Map();
  for (const group of system.resonances ?? []) {
    if (!group?.id || resonanceGroups.has(group.id)) throw new Error(`mechanics: duplicate or missing resonance id '${group?.id}'`);
    if (!group.baseBody || !(group.baseA > 0)) throw new Error(`mechanics: resonance '${group.id}' needs baseBody and baseA>0`);
    resonanceGroups.set(group.id, group);
  }

  const bodies = new Map(system.bodies.map((body) => [body.id, body]));
  for (const body of system.bodies) {
    if (!(body.GM > 0)) throw new Error(`mechanics: body '${body.id}'.GM must be > 0`);
    if (!ids.has(body.parent)) throw new Error(`mechanics: body '${body.id}' has missing parent '${body.parent}'`);
    assertSpin(body.spin, `body '${body.id}'.spin`);
  }

  for (const node of system.nodes ?? []) {
    if (node.type !== 'barycenter') throw new Error(`mechanics: node '${node.id}' type must be 'barycenter'`);
    if (!ids.has(node.parent)) throw new Error(`mechanics: node '${node.id}' has missing parent '${node.parent}'`);
    const primary = bodies.get(node.primary), secondary = bodies.get(node.secondary);
    if (!primary || !secondary || primary === secondary) throw new Error(`mechanics: barycenter '${node.id}' needs two body members`);
    if (primary.parent !== node.id || secondary.parent !== node.id) throw new Error(`mechanics: barycenter '${node.id}' members must name it as parent`);
    assertOrbit(node.relativeOrbit, `node '${node.id}'.relativeOrbit`, resonanceGroups);
    if (node.relativeOrbit.resonance) throw new Error(`mechanics: barycenter '${node.id}' relativeOrbit cannot be a resonance member`);
    if (node.orbit) {
      assertOrbit(node.orbit, `node '${node.id}'.orbit`, resonanceGroups);
      if (node.orbit.resonance) throw new Error(`mechanics: barycenter '${node.id}' outer orbit cannot be a resonance member`);
    }
  }

  for (const body of system.bodies) {
    const bary = (system.nodes ?? []).find((node) => node.id === body.parent && node.type === 'barycenter');
    if (bary) {
      if (body.orbit) throw new Error(`mechanics: barycenter member '${body.id}' must not author its own orbit`);
    } else {
      assertOrbit(body.orbit, `body '${body.id}'.orbit`, resonanceGroups);
    }
  }

  for (const group of resonanceGroups.values()) {
    const base = bodies.get(group.baseBody);
    if (!base?.orbit?.resonance || base.orbit.resonance.group !== group.id) {
      throw new Error(`mechanics: resonance '${group.id}' baseBody '${group.baseBody}' is not a member`);
    }
    const members = system.bodies.filter((body) => body.orbit?.resonance?.group === group.id);
    if (members.some((body) => body.parent !== base.parent)) throw new Error(`mechanics: resonance '${group.id}' members need one parent`);
  }

  // Parent cycles fail here rather than overflowing later in ephemeris recursion.
  const parentOf = new Map(system.bodies.map((body) => [body.id, body.parent]));
  for (const node of system.nodes ?? []) parentOf.set(node.id, node.parent);
  for (const id of parentOf.keys()) {
    const seen = new Set();
    let cursor = id;
    while (cursor !== 'star') {
      if (seen.has(cursor)) throw new Error(`mechanics: parent cycle at '${cursor}'`);
      seen.add(cursor);
      cursor = parentOf.get(cursor);
      if (!cursor) throw new Error(`mechanics: '${id}' parent chain does not reach star`);
    }
  }
  return true;
}
