import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SYSTEM } from '../src/core/recipe.js';
import { SOL_SYSTEM, SOL_ADDED_BODY_IDS, SOL_REPIN_DELTA } from '../src/core/sol.js';
import { assertMechanicsSystem } from '../src/core/mechanics.js';
import { resolvedOrbit, bodyStateInertial } from '../src/core/frames.js';
import { assertStructuredCloneSafe, assignBodyRepresentations, MAX_BODY_SLOTS } from '../src/core/capacity.js';
import { makeBaker, bakeDiscMap, I } from '../src/core/bakecore.js';

let n = 0;
const ok = (value, message) => { assert.ok(value, message); n++; };
const eq = (a, b, message) => { assert.equal(a, b, message); n++; };
const byId = new Map(SOL_SYSTEM.bodies.map((b) => [b.id, b]));

eq(SOL_SYSTEM.id, 'sol-system', 'stable system id');
eq(SOL_SYSTEM.bodies.length, 32, 'complete Phase-S roster + the Phase B comet');
eq(SOL_ADDED_BODY_IDS.length, 21, 'twenty Phase-S data recipes + cometa');
eq(new Set(SOL_SYSTEM.bodies.map((b) => b.id)).size, 32, 'unique body ids');
ok(assertMechanicsSystem(SOL_SYSTEM), 'mechanics schema');
ok(assertStructuredCloneSafe(SOL_SYSTEM), 'worker structured clone');

const required = ['cinis','venus','tellus','luna','rubra','timor','pavor','iovis','fornax','europa','sulcus','vetus','saturn','candor','rhea','titan','ianus','caelus','ruina','aeria','umbra','titania','oberon','pontus','errans','vesta','ordo','pluto','navita','haumea','arrokoth','cometa'];
for (const id of required) ok(byId.has(id), `roster contains ${id}`);
for (const b of SOL_SYSTEM.bodies) {
  ok(b.parent === 'star' || byId.has(b.parent) || SOL_SYSTEM.nodes.some((x) => x.id === b.parent), `${b.id} parent resolves`);
  ok(!b.skyHidden, `${b.id} participates in the continuous sky`);
  ok(Array.isArray(b.palette?.dust) && Array.isArray(b.discAlbedo), `${b.id} has palette and disc fallback`);
}

// Existing content is a migration, not a rewrite: remove the enumerated orbit,
// pole, visibility and insolation inputs and every remaining datum is identical.
const stripMigration = (value) => {
  const b = structuredClone(value);
  delete b.parent; delete b.orbit; delete b.spin; delete b.skyHidden;
  for (const p of b.processes ?? []) if (p.type === 'context') delete p.insolation;
  return b;
};
for (const old of SYSTEM.bodies) {
  const next = byId.get(old.id);
  ok(next, `existing ${old.id} retained`);
  eq(JSON.stringify(stripMigration(next)), JSON.stringify(stripMigration(old)), `${old.id} surface recipe retained`);
}

const shippedFamilies = new Set(SYSTEM.bodies.flatMap((b) => b.processes.map((p) => p.type)));
for (const id of SOL_ADDED_BODY_IDS) {
  for (const p of byId.get(id).processes) ok(shippedFamilies.has(p.type), `${id} reuses shipped ${p.type} family`);
}

// Real-analog architecture and the two mechanics showcases.
const analogA = { cinis:.387099, venus:.723336, tellus:1.000003, rubra:1.52371, iovis:5.202887, saturn:9.536676, caelus:19.189165, pontus:30.069923 };
for (const [id, au] of Object.entries(analogA)) {
  const o = resolvedOrbit(byId.get(id), SOL_SYSTEM);
  ok(Math.abs(o.a / 1.496e11 - au) < 1e-6, `${id} real-analog semimajor axis`);
  ok(o.e > 0, `${id} eccentric conic`);
}
eq(byId.get('cinis').spin.lockRatio[0] / byId.get('cinis').spin.lockRatio[1], 1.5, 'Cinis 3:2 spin-orbit lock');
const io = resolvedOrbit(byId.get('fornax'), SOL_SYSTEM);
const eu = resolvedOrbit(byId.get('europa'), SOL_SYSTEM);
const ga = resolvedOrbit(byId.get('sulcus'), SOL_SYSTEM);
ok(Math.abs(io.n / eu.n - 2) < 1e-12, 'Laplace inner 2:1 mean-motion ratio');
ok(Math.abs(eu.n / ga.n - 2) < 1e-12, 'Laplace outer 2:1 mean-motion ratio');
eq(SOL_SYSTEM.nodes[0].primary, 'pluto', 'barycenter primary');
eq(SOL_SYSTEM.nodes[0].secondary, 'navita', 'barycenter secondary');

// The Re-Pin expected-delta set is closed and names only the two orbit consumers.
eq(SOL_REPIN_DELTA.changedBodies.length, SYSTEM.bodies.length, 'all re-homed demo bodies classified');
eq(SOL_REPIN_DELTA.orbitBakeConsumers.join(','), 'rubra', 'storm/hood cloud consumer enumerated');
ok(SOL_REPIN_DELTA.insolationBodies.includes('tellus') && SOL_REPIN_DELTA.insolationBodies.includes('cinis'), 'insolation consumers enumerated');

// Every member survives slot pressure at representative epochs: K resolved discs,
// all overflow in the point tier, never membership loss.
for (const epochS of [0, 123456789, 1e10]) {
  const observer = bodyStateInertial(byId.get('tellus'), epochS, SOL_SYSTEM).r;
  const candidates = SOL_SYSTEM.bodies.filter((b) => b.id !== 'tellus').map((b) => {
    const r = bodyStateInertial(b, epochS, SOL_SYSTEM).r;
    const d = Math.hypot(r[0]-observer[0], r[1]-observer[1], r[2]-observer[2]);
    return { body: b, angRadius: Math.asin(Math.min(.999999, b.R / d)) };
  });
  const reps = assignBodyRepresentations(candidates);
  eq(reps.resolved.length, MAX_BODY_SLOTS, `epoch ${epochS} fills K slots`);
  eq(reps.resolved.length + reps.points.length, candidates.length, `epoch ${epochS} preserves membership`);
}

// Default longitude placement is byte-identical; Navita alone exercises polar.
const plutoA = structuredClone(SYSTEM.bodies.find((b) => b.id === 'pluto'));
const plutoB = structuredClone(plutoA);
plutoB.processes.find((p) => p.type === 'tholin').placement = 'longitude';
const ta = makeBaker(plutoA, { cacheMax: 8 }).bakeTile(0, 2, 1, 1).fields.tholinAlb;
const tb = makeBaker(plutoB, { cacheMax: 8 }).bakeTile(0, 2, 1, 1).fields.tholinAlb;
eq(Buffer.compare(Buffer.from(ta.buffer), Buffer.from(tb.buffer)), 0, 'tholin longitude default byte identity');
const navBaker = makeBaker(byId.get('navita'), { cacheMax: 8 });
const polar = navBaker.bakeTile(2, 2, 1, 1).fields.tholinAlb;
const equator = navBaker.bakeTile(0, 2, 1, 1).fields.tholinAlb;
let pm = 0, em = 0, count = 0;
for (let j=0;j<=64;j+=4) for (let i=0;i<=64;i+=4) { pm += polar[I(i,j)]; em += equator[I(i,j)]; count++; }
ok(pm / count > em / count + .2, 'Navita polar tholin cap placement');

// Every new body produces a finite disc from the shared family machinery, and
// palettes are not accidentally all clones of one template.
const hashes = new Set();
for (const id of SOL_ADDED_BODY_IDS) {
  const b = byId.get(id);
  const disc = bakeDiscMap(b, makeBaker(b, { cacheMax: 64 }), 24, 12).rgba;
  ok(disc.length === 24 * 12 * 4 && disc.every(Number.isFinite), `${id} disc bake finite`);
  hashes.add(createHash('sha256').update(disc).digest('hex'));
}
ok(hashes.size >= 16, 'data retuning yields distinct new-body disc looks');

console.log(`sol-test: ${n} assertions passed`);
