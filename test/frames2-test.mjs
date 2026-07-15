import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SYSTEM } from '../src/core/recipe.js';
import { assertMechanicsSystem, JULIAN_CENTURY_S, TAU } from '../src/core/mechanics.js';
import {
  bodyCenterInertial, bodyStateInertial, bodyToInertial, ephemeris, ephemerisAt,
  equivalentLegacyGM, meanAnomalyAt, meanMotion, mulMV, orbitalPeriodS,
  resolvedOrbit, solveKepler, sphereOfInfluence, spinAngleAt, spinPeriodS,
  transpose,
} from '../src/core/frames.js';
import { legacyViewsAtEpoch } from '../src/core/time.js';

const DEG = Math.PI / 180;
const orbit = (overrides = {}) => ({
  a: 1.2e10, e: 0.13, iDeg: 17, OmegaDeg: 31, omegaDeg: 47,
  M0Deg: 23, epochS: 12345, OmegaDotDegCy: -80, omegaDotDegCy: 130,
  frame: 'ecliptic', ...overrides,
});
const spin = (overrides = {}) => ({
  poleLonDeg: 90, poleLatDeg: 66.6, periodH: 19, phase0: 0.3,
  meridianDeg: 12, poleDotDegCy: 0, ...overrides,
});

function fixture() {
  const star = { name: 'Test star', GM: 1.32712440018e20, radius: 6.96e8, irradianceAt1AU: 25 };
  const planet = { id: 'planet', parent: 'star', GM: 4e14, R: 6e6, orbit: orbit(), spin: spin() };
  const moon = {
    id: 'moon', parent: 'planet', GM: 5e12, R: 1e6,
    orbit: orbit({ a: 4e8, e: 0.04, iDeg: 8, OmegaDeg: 11, omegaDeg: 19, M0Deg: 4, frame: 'parentEq' }),
    spin: spin({ periodH: undefined, locked: true, phase0: 0.1, meridianDeg: 0 }),
  };
  delete moon.spin.periodH;

  const resonanceBodies = [
    ['r1', 4, 180, -20, 30],
    ['r2', 2, 0, 15, -10],
    ['r3', 1, 0, -5, 12],
  ].map(([id, ratio, phaseDeg, OmegaDotDegCy, omegaDotDegCy]) => ({
    id, parent: 'planet', GM: 1e10, R: 3e5,
    orbit: orbit({
      a: undefined, e: 0.01, iDeg: 1, OmegaDeg: 2, omegaDeg: 3,
      M0Deg: undefined, epochS: 0, OmegaDotDegCy, omegaDotDegCy,
      frame: 'parentEq', resonance: { group: 'laplace', ratio, phaseDeg },
    }),
    spin: spin({ periodH: undefined, locked: true, phase0: 0, meridianDeg: 0 }),
  }));
  for (const body of resonanceBodies) {
    delete body.orbit.a; delete body.orbit.M0Deg; delete body.spin.periodH;
  }

  const primary = { id: 'primary', parent: 'pair', GM: 9e11, R: 1e6, spin: spin() };
  const secondary = { id: 'secondary', parent: 'pair', GM: 1e11, R: 5e5, spin: spin({ locked: true, periodH: undefined }) };
  delete secondary.spin.periodH;
  const pair = {
    id: 'pair', type: 'barycenter', parent: 'star', primary: 'primary', secondary: 'secondary',
    orbit: orbit({ a: 5e11, e: 0.2, iDeg: 4, OmegaDeg: 9, omegaDeg: 2, M0Deg: 8 }),
    relativeOrbit: orbit({ a: 2e7, e: 0.1, iDeg: 12, OmegaDeg: 7, omegaDeg: 5, M0Deg: 3 }),
  };
  const system = {
    id: 'mechanics-fixture', validYears: 5000, star,
    resonances: [{ id: 'laplace', baseBody: 'r3', baseA: 1.1e9 }],
    nodes: [pair], bodies: [planet, moon, ...resonanceBodies, primary, secondary],
  };
  assertMechanicsSystem(system);
  return { system, planet, moon, resonanceBodies, primary, secondary, pair };
}

function deterministicVector() {
  const { system } = fixture();
  return system.bodies.flatMap((body) => {
    const s = bodyStateInertial(body, 8.7654321e8, system);
    return [...s.r, ...s.v, spinAngleAt(body, 8.7654321e8, system)];
  });
}

if (process.argv.includes('--determinism-dump')) {
  process.stdout.write(JSON.stringify(deterministicVector()));
  process.exit(0);
}

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, tolerance, message) => ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

// Solver corner/sweep: fixed work and residual well inside the declared 1e-12 gate.
for (let ie = 0; ie <= 95; ie++) for (let im = -128; im <= 128; im++) {
  const e = ie / 100, M = im * Math.PI / 37;
  const E = solveKepler(M, e);
  const wrappedM = ((M + Math.PI) % TAU + TAU) % TAU - Math.PI;
  near(E - e * Math.sin(E), wrappedM, 1e-12, `Kepler residual e=${e} M=${M}`);
  if (e === 0) assert.equal(E, wrappedM, 'e=0 is the exact fixed point');
}

const here = fileURLToPath(import.meta.url);
const a = spawnSync(process.execPath, [here, '--determinism-dump'], { encoding: 'utf8' });
const b = spawnSync(process.execPath, [here, '--determinism-dump'], { encoding: 'utf8' });
assert.equal(a.status, 0); assert.equal(b.status, 0); assert.equal(a.stdout, b.stdout, 'two fresh processes are byte-deterministic'); checks++;

const { system, planet, moon, resonanceBodies, primary, secondary, pair } = fixture();
ok(resolvedOrbit(planet, system).OmegaDot < 0 && resolvedOrbit(planet, system).omegaDot > 0,
  'published secular-rate signs transcribe unchanged into the +X toward +Z convention');

// Sign convention pin: at the reference direction, prograde h points -Y.
const circular = structuredClone(system);
const cp = circular.bodies.find((body) => body.id === 'planet');
cp.orbit = orbit({ a: 1e10, e: 0, iDeg: 0, OmegaDeg: 0, omegaDeg: 0, M0Deg: 0, epochS: 0, OmegaDotDegCy: 0, omegaDotDegCy: 0 });
assertMechanicsSystem(circular);
const cs = bodyStateInertial(cp, 0, circular);
near(cs.r[0], 1e10, 0, 'circular reference position +X');
ok(cs.v[2] > 0 && (cs.r[2] * cs.v[0] - cs.r[0] * cs.v[2]) < 0, 'prograde angular momentum points -Y');

// μ law and analytic velocity, including parentEq and nonzero secular drift.
for (const body of [planet, moon, ...resonanceBodies]) {
  const n = meanMotion(body, system), aa = resolvedOrbit(body, system).a;
  near(n * n * aa ** 3, body.parent === 'planet' ? planet.GM : system.star.GM,
    (body.parent === 'planet' ? planet.GM : system.star.GM) * 3e-14, `${body.id} mu law`);
  const t = 4.321e8, h = orbitalPeriodS(body, system) / 30000;
  const state = bodyStateInertial(body, t, system);
  const mm = bodyStateInertial(body, t - 2 * h, system).r, before = bodyStateInertial(body, t - h, system).r;
  const after = bodyStateInertial(body, t + h, system).r, pp = bodyStateInertial(body, t + 2 * h, system).r;
  const fd = after.map((value, i) => (mm[i] - 8 * before[i] + 8 * value - pp[i]) / (12 * h));
  const err = Math.hypot(...state.v.map((value, i) => value - fd[i]));
  const mag = Math.hypot(...state.v);
  ok(err / mag < 1e-9, `${body.id} velocity incl. frame drift (${err / mag})`);
}

// Resonance uses λ-dot, so the Laplace argument is stationary despite rates.
const lambda = (body, t) => {
  const o = resolvedOrbit(body, system), dt = t - o.epochS;
  return meanAnomalyAt(body, t, system) + o.Omega + o.OmegaDot * dt + o.omega + o.omegaDot * dt;
};
for (let i = 0; i < 1000; i++) {
  const t = -2e11 + i * 4e8;
  const arg = lambda(resonanceBodies[0], t) - 3 * lambda(resonanceBodies[1], t) + 2 * lambda(resonanceBodies[2], t);
  const wrapped = ((arg % TAU) + TAU) % TAU;
  near(wrapped, Math.PI, 3e-10, `Laplace argument epoch ${i}`);
}
ok(resonanceBodies.every((body) => !('a' in body.orbit) && resolvedOrbit(body, system).a > 0), 'resonance members derive a');

// Locked and 3:2 spin laws derive their period/rate from the orbit.
near(spinPeriodS(moon, system), orbitalPeriodS(moon, system), 1e-9, 'synchronous period');
const ratioBody = structuredClone(moon); ratioBody.spin.lockRatio = [3, 2]; delete ratioBody.spin.locked;
near(spinPeriodS(ratioBody, system), orbitalPeriodS(ratioBody, system) / 1.5, 1e-9, '3:2 period');
near(spinAngleAt(moon, 99, system) - spinAngleAt(moon, 98, system), -meanMotion(moon, system), 1e-12, 'locked phase rate');

// One relative conic: member amplitudes/momenta and relative μ law.
const bt = 7.7e7, ps = bodyStateInertial(primary, bt, system), ss = bodyStateInertial(secondary, bt, system);
const bs = ephemerisAt(pair, bt, system);
const pr = ps.r.map((value, i) => value - bs.center[i]), sr = ss.r.map((value, i) => value - bs.center[i]);
for (let i = 0; i < 3; i++) near(primary.GM * pr[i] + secondary.GM * sr[i], 0, 1e8, `barycenter moment axis ${i}`);
const relA = pair.relativeOrbit.a, relN = meanMotion(primary, system);
near(relN * relN * relA ** 3, primary.GM + secondary.GM, 0.05, 'relative orbit mu law');
near(Math.hypot(...sr) / Math.hypot(...pr), primary.GM / secondary.GM, 1e-8, 'mass split amplitudes');
ok(sphereOfInfluence(primary, system) > 0 && sphereOfInfluence(planet, system) > 0 && sphereOfInfluence(pair, system) > 0,
  'SOI helpers cover pair member, pair node, and plain bodies');

// parentEq/ecliptic matrices remain orthonormal and round-trip vectors.
for (const body of [planet, moon]) {
  const m = bodyToInertial(body, 1234567, system), mt = transpose(m), v = [0.2, -0.7, 0.5];
  const rt = mulMV(mt, mulMV(m, v));
  for (let i = 0; i < 3; i++) near(rt[i], v[i], 5e-16, `${body.id} frame roundtrip ${i}`);
}

// Exact demo branch selection plus a tolerance overlap twin under GM_equiv.
const legacyCenter = (body, t, out = [0, 0, 0]) => {
  const th = TAU * (t / (body.orbit.periodDays * 86400)) + body.orbit.phase0;
  const x = body.orbit.a * Math.cos(th), z = body.orbit.a * Math.sin(th);
  if (body.parent === 'star') { out[0] = x; out[1] = 0; out[2] = z; return out; }
  const p = legacyCenter(SYSTEM.bodies.find((candidate) => candidate.id === body.parent), t);
  out[0] = p[0] + x; out[1] = p[1]; out[2] = p[2] + z; return out;
};
const legacySpin = (body, t) => {
  const tilt = body.spin.tiltDeg * DEG, angle = TAU * (t / (body.spin.periodH * 3600)) + body.spin.phase0;
  const rx = [1, 0, 0, 0, Math.cos(tilt), -Math.sin(tilt), 0, Math.sin(tilt), Math.cos(tilt)];
  const ry = [Math.cos(angle), 0, Math.sin(angle), 0, 1, 0, -Math.sin(angle), 0, Math.cos(angle)];
  const out = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    out[r * 3 + c] = rx[r * 3] * ry[c] + rx[r * 3 + 1] * ry[3 + c] + rx[r * 3 + 2] * ry[6 + c];
  return out;
};
for (const body of SYSTEM.bodies) for (const t of [-9.1e10, 0, 123456789]) {
  assert.deepEqual(bodyCenterInertial(body, t), legacyCenter(body, t), `${body.id} orbit chose exact compat branch`);
  assert.deepEqual(bodyToInertial(body, t), legacySpin(body, t), `${body.id} spin chose exact compat branch`);

  const mapped = {
    id: 'mapped', validYears: 5000,
    star: { ...SYSTEM.star, GM: equivalentLegacyGM(body) },
    bodies: [{
      ...body, id: 'mapped', parent: 'star',
      orbit: orbit({ a: body.orbit.a, e: 0, iDeg: 0, OmegaDeg: 0, omegaDeg: 0,
        M0Deg: body.orbit.phase0 / DEG, epochS: 0, OmegaDotDegCy: 0, omegaDotDegCy: 0 }),
      spin: spin({ poleLonDeg: 90, poleLatDeg: 90 - body.spin.tiltDeg,
        periodH: body.spin.periodH, phase0: body.spin.phase0, meridianDeg: 0 }),
    }],
  };
  assertMechanicsSystem(mapped);
  const oldLocal = [body.orbit.a * Math.cos(TAU * t / (body.orbit.periodDays * 86400) + body.orbit.phase0), 0,
    body.orbit.a * Math.sin(TAU * t / (body.orbit.periodDays * 86400) + body.orbit.phase0)];
  const next = bodyCenterInertial(mapped.bodies[0], t, [0, 0, 0], mapped);
  const overlapError = Math.hypot(...next.map((value, i) => value - oldLocal[i])) / body.orbit.a;
  ok(overlapError < 2e-9, `${body.id} overlap orbit (${overlapError})`);
  const om = bodyToInertial(mapped.bodies[0], t, mapped);
  const poleError = Math.max(...om.map((value, i) => Math.abs(value - legacySpin(body, t)[i])));
  ok(poleError < 1e-8, `${body.id} pole/tilt documentation twin (${poleError})`);
}

// The compat path reproduces all three pinned eclipse scenes (12.5 and the
// two 12.6/12.7 views of the same totality) at their solver epochs.
for (const [bodyId, occId, t, expected] of [
  ['tellus', 'luna', 28870200, { season: 0.914442, tday: 0.145833 }],
  ['luna', 'tellus', 12300000, { season: 5, tday: 0.214693 }],
]) {
  const body = SYSTEM.bodies.find((candidate) => candidate.id === bodyId);
  const eph = ephemeris(body, t), occ = eph.others.find((item) => item.body.id === occId);
  const sep = Math.acos(Math.max(-1, Math.min(1, occ.dirBF.reduce((sum, value, i) => sum + value * eph.sunDirBF[i], 0))));
  ok(sep < occ.angRadius + eph.sunAngRadius, `${bodyId} pinned eclipse remains aligned`);
  const views = legacyViewsAtEpoch(body, t);
  assert.equal(+views.season.toFixed(6), expected.season); assert.equal(+views.tday.toFixed(6), expected.tday); checks += 2;
}

// Named schema failures: mixed schemas, unit suffixes, resonance a, and μ.
const bad = structuredClone(system); bad.bodies[0].orbit.periodDays = 1;
assert.throws(() => assertMechanicsSystem(bad), /mixes legacy orbit fields/); checks++;
const badUnit = structuredClone(system); badUnit.bodies[0].orbit.Omega = 1;
assert.throws(() => assertMechanicsSystem(badUnit), /unitless orbit field|Deg/); checks++;
const badRes = structuredClone(system); badRes.bodies.find((body) => body.id === 'r1').orbit.a = 1;
assert.throws(() => assertMechanicsSystem(badRes), /may not author a/); checks++;
const badMu = structuredClone(system); badMu.bodies[0].GM = 0;
assert.throws(() => assertMechanicsSystem(badMu), /GM must be > 0/); checks++;

console.log(`frames2 contracts pass (${checks} assertions; century=${JULIAN_CENTURY_S}s)`);
