// frames.js — closed-form frame tree: legacy circles and Phase-K conics.
// Inertial is right-handed/Y-up, ecliptic XZ, longitude +X toward +Z; a
// prograde orbit therefore has angular momentum toward -Y. All math is double.

import { SYSTEM, AU } from './recipe.js';
import { bodyEffR } from './figure.js';
import {
  TAU, DAY_S, JULIAN_CENTURY_S, DEFAULT_VALID_YEARS,
  isLegacyOrbit, isLegacySpin, ratioValue,
} from './mechanics.js';

const DEG = Math.PI / 180;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const wrapPi = (a) => {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
};

// Rotation matrices are row-major and act on column vectors. rotY retains the
// exact legacy expression; rotYL is its orbital-longitude (+X -> +Z) twin.
export function mulMV(m, v, out = [0, 0, 0]) {
  const x = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
  const y = m[3] * v[0] + m[4] * v[1] + m[5] * v[2];
  const z = m[6] * v[0] + m[7] * v[1] + m[8] * v[2];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}
export function mulMM(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
const rotY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotYL = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
const rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
export const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v) => {
  const d = Math.hypot(v[0], v[1], v[2]);
  return d ? [v[0] / d, v[1] / d, v[2] / d] : [0, 0, 0];
};

const bodyIn = (system, id) => system.bodies.find((body) => body.id === id);
const nodeIn = (system, id) => (system.nodes ?? []).find((node) => node.id === id);
const itemIn = (system, id) => id === 'star' ? system.star : bodyIn(system, id) ?? nodeIn(system, id);
const parentGM = (id, system) => {
  if (id === 'star') return system.star.GM;
  const body = bodyIn(system, id);
  if (body) return body.GM;
  const node = nodeIn(system, id);
  if (node?.type === 'barycenter') return bodyIn(system, node.primary).GM + bodyIn(system, node.secondary).GM;
  throw new Error(`frames: missing parent '${id}'`);
};
const rate = (degCy = 0) => degCy * DEG / JULIAN_CENTURY_S;
const orbitRates = (orbit) => ({ OmegaDot: rate(orbit.OmegaDotDegCy), omegaDot: rate(orbit.omegaDotDegCy) });

// Fixed-count Danby-starter Newton solve. Wrapping happens before the solve,
// e=0 is an exact fixed point, and no convergence predicate varies the work.
export function solveKepler(M, e) {
  const m = wrapPi(M);
  if (e === 0) return m;
  let E = m + Math.sign(Math.sin(m)) * 0.85 * e;
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
  return E;
}

// The comet solver class (Phase B; K7's registered trigger). The Danby starter
// lands ~1 rad off in the perihelion corner (e→1, M→0) where f' = 1-e·cosE →
// 1-e, so the 8-step Newton above measurably degrades past e ≈ 0.995. Mikkola's
// (1987) cubic starter is built FOR that corner: it solves the small-E cubic of
// Kepler's equation exactly, then ten fixed Halley steps reach machine epsilon
// over the full e ∈ [0, COMET_E_MAX] × M sweep — pinned by the perihelion-corner
// gate with log-spaced M probes. No convergence predicate varies the work.
export function solveKeplerComet(M, e) {
  const m = wrapPi(M);
  if (e === 0 || m === 0) return m;
  const denom = 4 * e + 0.5;
  const alpha = (1 - e) / denom;
  const beta = 0.5 * m / denom;
  const z = Math.cbrt(beta + Math.sign(beta) * Math.sqrt(beta * beta + alpha * alpha * alpha));
  let s = z - alpha / z;
  s -= 0.078 * s ** 5 / (1 + e);
  let E = m + e * (3 * s - 4 * s ** 3);
  for (let i = 0; i < 10; i++) {
    const se = e * Math.sin(E), ce = e * Math.cos(E);
    const f = E - se - m, f1 = 1 - ce;
    E -= f / (f1 - 0.5 * f * se / f1);
  }
  return E;
}

export function equivalentLegacyGM(body) {
  const n = TAU / (body.orbit.periodDays * DAY_S);
  return n * n * body.orbit.a ** 3;
}

function resonanceResolution(body, system) {
  const membership = body.orbit.resonance;
  const group = (system.resonances ?? []).find((candidate) => candidate.id === membership.group);
  if (!group) throw new Error(`frames: missing resonance group '${membership.group}'`);
  const base = bodyIn(system, group.baseBody);
  const baseRatio = ratioValue(base.orbit.resonance.ratio);
  const baseRates = orbitRates(base.orbit);
  const mu = parentGM(base.parent, system);
  const baseAnomalyRate = Math.sqrt(mu / group.baseA ** 3);
  const lambdaBase = (baseAnomalyRate + baseRates.OmegaDot + baseRates.omegaDot) / baseRatio;
  const rates = orbitRates(body.orbit);
  const lambdaRate = ratioValue(membership.ratio) * lambdaBase;
  const n = lambdaRate - rates.OmegaDot - rates.omegaDot;
  if (!(n > 0)) throw new Error(`frames: resonance member '${body.id}' derived non-positive anomaly rate`);
  const a = (parentGM(body.parent, system) / (n * n)) ** (1 / 3);
  const lambda0 = membership.phaseDeg * DEG;
  return { n, a, M0: lambda0 - body.orbit.OmegaDeg * DEG - body.orbit.omegaDeg * DEG, lambdaRate };
}

export function resolvedOrbit(body, system = SYSTEM) {
  const orbit = body.orbit;
  if (isLegacyOrbit(orbit)) {
    return {
      legacy: true, a: orbit.a, e: 0, i: 0, Omega: 0, omega: 0,
      M0: orbit.phase0, epochS: 0, n: TAU / (orbit.periodDays * DAY_S),
      OmegaDot: 0, omegaDot: 0, frame: 'ecliptic',
    };
  }
  const rr = orbit.resonance ? resonanceResolution(body, system) : null;
  const rates = orbitRates(orbit);
  return {
    legacy: false,
    a: rr?.a ?? orbit.a,
    e: orbit.e,
    i: orbit.iDeg * DEG,
    Omega: orbit.OmegaDeg * DEG,
    omega: orbit.omegaDeg * DEG,
    M0: rr?.M0 ?? orbit.M0Deg * DEG,
    epochS: orbit.epochS,
    n: rr?.n ?? Math.sqrt(parentGM(body.parent, system) / orbit.a ** 3),
    OmegaDot: rates.OmegaDot,
    omegaDot: rates.omegaDot,
    frame: orbit.frame,
    solver: orbit.solver,
    lambdaRate: rr?.lambdaRate,
  };
}

export function meanMotion(body, system = SYSTEM) {
  const bary = nodeIn(system, body.parent);
  if (bary?.type === 'barycenter') return relativeOrbitResolved(bary, system).n;
  return resolvedOrbit(body, system).n;
}

export function orbitalPeriodS(body, system = SYSTEM) {
  if (isLegacyOrbit(body.orbit)) return body.orbit.periodDays * DAY_S;
  return TAU / meanMotion(body, system);
}

export function meanAnomalyAt(body, t, system = SYSTEM) {
  const bary = nodeIn(system, body.parent);
  const o = bary?.type === 'barycenter' ? relativeOrbitResolved(bary, system) : resolvedOrbit(body, system);
  return o.M0 + o.n * (t - o.epochS);
}

export function orbitalPhaseAt(body, t, system = SYSTEM) {
  if (isLegacyOrbit(body.orbit)) return TAU * (t / (body.orbit.periodDays * DAY_S)) + body.orbit.phase0;
  const bary = nodeIn(system, body.parent);
  const o = bary?.type === 'barycenter' ? relativeOrbitResolved(bary, system) : resolvedOrbit(body, system);
  return meanAnomalyAt(body, t, system) + o.Omega + o.OmegaDot * (t - o.epochS)
    + o.omega + o.omegaDot * (t - o.epochS);
}

function bodyPoleMatrix(body) {
  if (isLegacySpin(body.spin)) return rotX(body.spin.tiltDeg * DEG);
  const lon = wrapPi(body.spin.poleLonDeg * DEG), lat = body.spin.poleLatDeg * DEG;
  const pole = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
  let x = cross([0, 1, 0], pole);
  if (Math.hypot(...x) < 1e-14) x = [1, 0, 0];
  else x = normalize(x);
  const z = normalize(cross(x, pole));
  return [x[0], pole[0], z[0], x[1], pole[1], z[1], x[2], pole[2], z[2]];
}

function referenceMatrix(body, frame, system) {
  if (frame === 'ecliptic') return IDENTITY;
  const parent = bodyIn(system, body.parent);
  if (!parent) throw new Error(`frames: parentEq orbit '${body.id}' needs a body parent`);
  return bodyPoleMatrix(parent);
}

function conicState(elements, t, ref = IDENTITY) {
  const dt = t - elements.epochS;
  const Omega = wrapPi(elements.Omega + elements.OmegaDot * dt);
  const omega = wrapPi(elements.omega + elements.omegaDot * dt);
  const E = (elements.solver === 'comet' ? solveKeplerComet : solveKepler)(elements.M0 + elements.n * dt, elements.e);
  const ce = Math.cos(E), se = Math.sin(E), q = Math.sqrt(1 - elements.e * elements.e);
  const dE = elements.n / (1 - elements.e * ce);
  const pq = [elements.a * (ce - elements.e), 0, elements.a * q * se];
  const pqd = [-elements.a * se * dE, 0, elements.a * q * ce * dE];
  const plane = mulMM(mulMM(rotYL(Omega), rotX(elements.i)), rotYL(omega));
  const R = mulMM(ref, plane);
  const r = mulMV(R, pq), v = mulMV(R, pqd);
  const nodePole = mulMV(ref, [0, -1, 0]);
  const orbitPole = mulMV(mulMM(ref, mulMM(rotYL(Omega), rotX(elements.i))), [0, -1, 0]);
  const drift = add(scale(cross(nodePole, r), elements.OmegaDot), scale(cross(orbitPole, r), elements.omegaDot));
  return { r, v: add(v, drift), E };
}

function relativeOrbitResolved(node, system) {
  const orbit = node.relativeOrbit;
  if (isLegacyOrbit(orbit)) {
    return {
      legacy: true, a: orbit.a, e: 0, i: 0, Omega: 0, omega: 0,
      M0: orbit.phase0, epochS: 0, n: TAU / (orbit.periodDays * DAY_S),
      OmegaDot: 0, omegaDot: 0, frame: 'ecliptic',
    };
  }
  const rates = orbitRates(orbit);
  const primary = bodyIn(system, node.primary), secondary = bodyIn(system, node.secondary);
  return {
    legacy: false, a: orbit.a, e: orbit.e, i: orbit.iDeg * DEG,
    Omega: orbit.OmegaDeg * DEG, omega: orbit.omegaDeg * DEG,
    M0: orbit.M0Deg * DEG, epochS: orbit.epochS,
    n: Math.sqrt((primary.GM + secondary.GM) / orbit.a ** 3),
    OmegaDot: rates.OmegaDot, omegaDot: rates.omegaDot, frame: orbit.frame,
    solver: orbit.solver,
  };
}

function nodeState(node, t, system) {
  const parent = stateForId(node.parent, t, system);
  if (!node.orbit) return parent;
  const proxy = { id: node.id, parent: node.parent, orbit: node.orbit };
  const elements = resolvedOrbit(proxy, system);
  const rel = conicState(elements, t, referenceMatrix(proxy, elements.frame, system));
  return { r: add(parent.r, rel.r), v: add(parent.v, rel.v) };
}

function baryMemberState(body, node, t, system) {
  const center = nodeState(node, t, system);
  const primary = bodyIn(system, node.primary), secondary = bodyIn(system, node.secondary);
  const elements = relativeOrbitResolved(node, system);
  const ref = elements.frame === 'parentEq' ? bodyPoleMatrix(primary) : IDENTITY;
  const rel = conicState(elements, t, ref);
  const total = primary.GM + secondary.GM;
  const k = body.id === primary.id ? -secondary.GM / total : primary.GM / total;
  return { r: add(center.r, scale(rel.r, k)), v: add(center.v, scale(rel.v, k)) };
}

function stateForId(id, t, system) {
  if (id === 'star') return { r: [0, 0, 0], v: [0, 0, 0] };
  const body = bodyIn(system, id);
  if (body) return bodyStateInertial(body, t, system);
  const node = nodeIn(system, id);
  if (node) return nodeState(node, t, system);
  throw new Error(`frames: unknown frame node '${id}'`);
}

// Non-rotating frame-tree state for navigation/system hosts. Keeping this
// public avoids rebuilding the tree (and, especially, barycenter mass splits)
// in presentation code. The returned axes are inertial by definition.
export function frameState(node, t, system = SYSTEM) {
  const id = typeof node === 'string' ? node : node.id;
  const state = stateForId(id, t, system);
  return { id, t, origin: state.r.slice(), velocity: state.v.slice(), toInertial: IDENTITY.slice(), fromInertial: IDENTITY.slice() };
}

function osculatingPoint(elements, trueAnomaly, t, ref = IDENTITY) {
  const dt = t - elements.epochS;
  const Omega = wrapPi(elements.Omega + elements.OmegaDot * dt);
  const omega = wrapPi(elements.omega + elements.omegaDot * dt);
  const radius = elements.a * (1 - elements.e * elements.e)
    / (1 + elements.e * Math.cos(trueAnomaly));
  const plane = mulMM(mulMM(rotYL(Omega), rotX(elements.i)), rotYL(omega));
  return mulMV(mulMM(ref, plane), [radius * Math.cos(trueAnomaly), 0, radius * Math.sin(trueAnomaly)]);
}

// One point on the epoch-t osculating orbit, evaluated from the same resolved
// elements and parent-frame law as bodyStateInertial(). Orbit-line renderers
// sample this function; authored element edits therefore redraw immediately.
export function orbitPointAtTrueAnomaly(item, trueAnomaly, t, system = SYSTEM) {
  if (item?.type === 'barycenter') {
    const parent = stateForId(item.parent, t, system).r;
    const proxy = { id: item.id, parent: item.parent, orbit: item.orbit };
    const elements = resolvedOrbit(proxy, system);
    return add(parent, osculatingPoint(elements, trueAnomaly, t,
      referenceMatrix(proxy, elements.frame, system)));
  }
  const bary = nodeIn(system, item.parent);
  if (bary?.type === 'barycenter') {
    const center = nodeState(bary, t, system).r;
    const primary = bodyIn(system, bary.primary), secondary = bodyIn(system, bary.secondary);
    const elements = relativeOrbitResolved(bary, system);
    const ref = elements.frame === 'parentEq' ? bodyPoleMatrix(primary) : IDENTITY;
    const total = primary.GM + secondary.GM;
    const k = item.id === primary.id ? -secondary.GM / total : primary.GM / total;
    return add(center, scale(osculatingPoint(elements, trueAnomaly, t, ref), k));
  }
  const parent = stateForId(item.parent, t, system).r;
  const elements = resolvedOrbit(item, system);
  return add(parent, osculatingPoint(elements, trueAnomaly, t,
    referenceMatrix(item, elements.frame, system)));
}

// Body center in inertial frame. The legacy branch is the verbatim V2
// arithmetic (including operation ordering), which protects the demo corpus.
export function bodyCenterInertial(body, t, out = [0, 0, 0], system = SYSTEM) {
  if (isLegacyOrbit(body.orbit)) {
    const th = TAU * (t / (body.orbit.periodDays * DAY_S)) + body.orbit.phase0;
    const x = body.orbit.a * Math.cos(th), z = body.orbit.a * Math.sin(th);
    if (body.parent === 'star') { out[0] = x; out[1] = 0; out[2] = z; return out; }
    const p = bodyCenterInertial(bodyIn(system, body.parent), t, [0, 0, 0], system);
    out[0] = p[0] + x; out[1] = p[1]; out[2] = p[2] + z;
    return out;
  }
  const r = bodyStateInertial(body, t, system).r;
  out[0] = r[0]; out[1] = r[1]; out[2] = r[2];
  return out;
}

export function bodyStateInertial(body, t, system = SYSTEM) {
  const bary = nodeIn(system, body.parent);
  if (bary?.type === 'barycenter') return baryMemberState(body, bary, t, system);
  if (isLegacyOrbit(body.orbit)) {
    const r = bodyCenterInertial(body, t, [0, 0, 0], system);
    const th = TAU * (t / (body.orbit.periodDays * DAY_S)) + body.orbit.phase0;
    const n = TAU / (body.orbit.periodDays * DAY_S);
    const localV = [-body.orbit.a * Math.sin(th) * n, 0, body.orbit.a * Math.cos(th) * n];
    const pv = body.parent === 'star' ? [0, 0, 0] : stateForId(body.parent, t, system).v;
    return { r, v: add(pv, localV) };
  }
  const parent = stateForId(body.parent, t, system);
  const elements = resolvedOrbit(body, system);
  const rel = conicState(elements, t, referenceMatrix(body, elements.frame, system));
  return { r: add(parent.r, rel.r), v: add(parent.v, rel.v) };
}

export function spinPeriodS(body, system = SYSTEM) {
  if (isLegacySpin(body.spin) || body.spin.periodH != null) return body.spin.periodH * 3600;
  return TAU / (meanMotion(body, system) * ratioValue(body.spin.lockRatio ?? 1));
}

export function spinAngleAt(body, t, system = SYSTEM) {
  if (isLegacySpin(body.spin)) return TAU * (t / (body.spin.periodH * 3600)) + body.spin.phase0;
  const base = body.spin.phase0 + body.spin.meridianDeg * DEG;
  if (body.spin.locked === true || body.spin.lockRatio != null) {
    const ratio = ratioValue(body.spin.lockRatio ?? 1);
    const bary = nodeIn(system, body.parent);
    const orbit = bary?.type === 'barycenter' ? relativeOrbitResolved(bary, system) : resolvedOrbit(body, system);
    return base - ratio * orbit.n * (t - orbit.epochS);
  }
  return TAU * (t / (body.spin.periodH * 3600)) + base;
}

// Body-fixed -> inertial. Legacy remains rotX(tilt)·rotY(spin) byte-for-byte.
export function bodyToInertial(body, t, system = SYSTEM) {
  if (isLegacySpin(body.spin)) {
    const spin = TAU * (t / (body.spin.periodH * 3600)) + body.spin.phase0;
    return mulMM(rotX(body.spin.tiltDeg * DEG), rotY(spin));
  }
  return mulMM(bodyPoleMatrix(body), rotY(wrapPi(spinAngleAt(body, t, system))));
}

export function bodyCenteredFrame(body, t, system = SYSTEM) {
  const state = bodyStateInertial(body, t, system);
  const bary = nodeIn(system, body.parent);
  const orbit = bary?.relativeOrbit ?? body.orbit;
  const parent = bary?.type === 'barycenter' ? bodyIn(system, bary.primary) : bodyIn(system, body.parent);
  const axes = orbit && !isLegacyOrbit(orbit) && orbit.frame === 'parentEq' && parent
    ? bodyPoleMatrix(parent) : IDENTITY.slice();
  return { t, origin: state.r, velocity: state.v, toInertial: axes, fromInertial: transpose(axes) };
}

export function sphereOfInfluence(body, system = SYSTEM) {
  if (body?.type === 'barycenter') {
    if (!body.orbit) throw new Error(`frames: barycenter '${body.id}' has no outer orbit for an SOI`);
    const proxy = { id: body.id, parent: body.parent, orbit: body.orbit };
    const a = resolvedOrbit(proxy, system).a;
    return a * (parentGM(body.id, system) / parentGM(body.parent, system)) ** (2 / 5);
  }
  const bary = nodeIn(system, body.parent);
  if (bary?.type === 'barycenter') {
    const primary = bodyIn(system, bary.primary), secondary = bodyIn(system, bary.secondary);
    const rel = relativeOrbitResolved(bary, system);
    const companion = body.id === primary.id ? secondary : primary;
    const a = rel.a * companion.GM / (primary.GM + secondary.GM);
    return a * (body.GM / companion.GM) ** (2 / 5);
  }
  return resolvedOrbit(body, system).a * (body.GM / parentGM(body.parent, system)) ** (2 / 5);
}

export function isExtrapolated(system, epochS) {
  const years = Math.abs(epochS) / (365.25 * DAY_S);
  return years > (system.validYears ?? DEFAULT_VALID_YEARS);
}

function irradianceAtDistance(system, distance) {
  return system.star.irradianceAt1AU * (AU / distance) * (AU / distance);
}

function ephemerisView(center, b2i, t, system, selfId = null) {
  const i2b = transpose(b2i);
  const sunDirI = [-center[0], -center[1], -center[2]];
  const dSun = Math.hypot(sunDirI[0], sunDirI[1], sunDirI[2]);
  const sunUnit = dSun ? [sunDirI[0] / dSun, sunDirI[1] / dSun, sunDirI[2] / dSun] : [1, 0, 0];
  const sunDirBF = mulMV(i2b, sunUnit);
  const others = [];
  for (const ob of system.bodies) {
    if (ob.id === selfId || ob.skyHidden) continue;
    const oc = bodyCenterInertial(ob, t, [0, 0, 0], system);
    const rel = [oc[0] - center[0], oc[1] - center[1], oc[2] - center[2]];
    const d = Math.hypot(rel[0], rel[1], rel[2]);
    if (!d) continue;
    const dirBF = mulMV(i2b, [rel[0] / d, rel[1] / d, rel[2] / d]);
    const ds = Math.hypot(...oc);
    const sunAtOther = ds ? [-oc[0] / ds, -oc[1] / ds, -oc[2] / ds] : [1, 0, 0];
    others.push({
      body: ob, dirBF, dist: d,
      angRadius: Math.atan(bodyEffR(ob) / d),
      sunDirBF: mulMV(i2b, sunAtOther),
      irradiance: irradianceAtDistance(system, ds || AU),
    });
  }
  return {
    t, center, b2i, i2b, sunDirBF,
    sunAngRadius: Math.atan(system.star.radius / (dSun || system.star.radius)),
    irradiance: irradianceAtDistance(system, dSun || AU),
    others,
  };
}

// Renderer contract retained exactly: body-fixed sun/other-body geometry.
export function ephemeris(body, t, system = SYSTEM) {
  return ephemerisView(bodyCenterInertial(body, t, [0, 0, 0], system), bodyToInertial(body, t, system), t, system, body.id);
}

// Node-hosted variant for root/barycenter/non-rotating viewpoints (Phase N).
export function ephemerisAt(node, t, system = SYSTEM) {
  const id = typeof node === 'string' ? node : node.id;
  const body = bodyIn(system, id);
  if (body) return ephemeris(body, t, system);
  const state = stateForId(id, t, system);
  return { ...ephemerisView(state.r, IDENTITY, t, system), velocity: state.v, node: id };
}
