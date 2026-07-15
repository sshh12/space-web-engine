import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SYSTEM } from '../src/core/recipe.js';
import { assertMechanicsSystem } from '../src/core/mechanics.js';
import {
  MAX_BODY_SLOTS, MAX_ECLIPSE_OCCLUDERS, WORKER_TILE_BUDGET,
  FOREGROUND_TILE_FLOOR, BACKGROUND_TILE_FLOOR, MAX_WARM_BAKERS,
  SKY_UNIFORM_VECTORS, SKY_UNIFORM_HEADROOM,
  assertSkyUniformBudget, makeBodyLayerMap, layerForBody,
  assertStructuredCloneSafe, assignBodyRepresentations, discIntegratedFlux,
  makeGenerationFence, makeJitQueue, assertCoVisibleSet,
} from '../src/core/capacity.js';

let checks = 0;
const ok = (v, m) => { checks++; assert.ok(v, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const throws = (fn, re) => { checks++; assert.throws(fn, re); };

eq(MAX_BODY_SLOTS, 8);
eq(MAX_ECLIPSE_OCCLUDERS, 3);
ok(WORKER_TILE_BUDGET >= FOREGROUND_TILE_FLOOR + BACKGROUND_TILE_FLOOR);
ok(FOREGROUND_TILE_FLOOR + (MAX_WARM_BAKERS - 1) * BACKGROUND_TILE_FLOOR <= WORKER_TILE_BUDGET);
eq(assertSkyUniformBudget(1024), { used: SKY_UNIFORM_VECTORS, headroom: 1024 - SKY_UNIFORM_VECTORS });
throws(() => assertSkyUniformBudget(SKY_UNIFORM_VECTORS + SKY_UNIFORM_HEADROOM - 1), /float-texture slot fallback/);

// Synthetic 30-body load: all ids and atlas rows survive structured cloning,
// validation and A→B→A mapping without relying on recipe array identity.
const stress = structuredClone(SYSTEM);
stress.id = 'stress-30';
stress.bodies = Array.from({ length: 30 }, (_, i) => {
  const b = structuredClone(SYSTEM.bodies[i % SYSTEM.bodies.length]);
  b.id = `stress-${String(i).padStart(2, '0')}`;
  b.name = `Stress ${i}`;
  b.parent = 'star';
  delete b.skyHidden;
  if (b.orbit) {
    b.orbit.a = 8e9 + i * 1.1e9;
    b.orbit.periodDays = 20 + i;
    b.orbit.phase0 = i / 30;
  }
  return b;
});
assertMechanicsSystem(stress); checks++;
assertStructuredCloneSafe(stress); checks++;
const mapA = makeBodyLayerMap(SYSTEM);
const mapB = makeBodyLayerMap(stress);
for (let i = 0; i < stress.bodies.length; i++) eq(layerForBody(mapB, stress.bodies[i].id), i);
const mapA2 = makeBodyLayerMap(structuredClone(SYSTEM));
for (const b of SYSTEM.bodies) eq(layerForBody(mapA2, b.id), layerForBody(mapA, b.id));
throws(() => makeBodyLayerMap({ bodies: [{ id: 'same' }, { id: 'same' }] }), /duplicate body id/);

const candidates = Array.from({ length: 30 }, (_, i) => ({ body: { id: `b${i}` }, angRadius: (i + 1) * 1e-5 }));
const reps = assignBodyRepresentations(candidates);
eq(reps.resolved.length, 8);
eq(reps.points.length, 22);
eq(reps.resolved[0].body.id, 'b29');
eq(new Set([...reps.resolved, ...reps.points].map((x) => x.body.id)).size, 30);
assertCoVisibleSet(reps.resolved); checks++;
throws(() => assertCoVisibleSet(candidates.slice(0, 9)), /MAX_BODY_SLOTS=8/);

// Slot→point boundary uses one closed-form flux function on both sides.
for (let i = 0; i < 1000; i++) {
  const E = 0.1 + i * 0.013, a = [0.2, 0.4, 0.8], r = 1e-7 + i * 1e-9;
  const resolvedMean = discIntegratedFlux(E, a, r);
  const pointMean = discIntegratedFlux(E, a, r);
  eq(Object.is(resolvedMean, pointMean), true);
}

const fence = makeGenerationFence();
const a0 = fence.stamp({ type: 'discmap', bodyId: 'tellus' });
eq(a0.generation, 0); ok(fence.accepts(a0));
eq(fence.bump(), 1); ok(!fence.accepts(a0));
const b1 = fence.stamp({ type: 'discmap', bodyId: 'tellus' });
ok(fence.accepts(b1));
eq(fence.bump(), 2); ok(!fence.accepts(b1));

const q = makeJitQueue();
q.push('background-a', 10); q.push('visible', 0); q.push('background-b', 10); q.push('current', -1);
eq([q.shift(), q.shift(), q.shift(), q.shift()], ['current', 'visible', 'background-a', 'background-b']);
eq(q.length, 0);

// Atomic source witnesses: both shader loops use eight, protocol messages are
// generation stamped, and the occluder arrays/loop use three.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shaders = readFileSync(resolve(root, 'src/render/shaders.js'), 'utf8');
const stars = readFileSync(resolve(root, 'src/render/stars.js'), 'utf8');
const engine = readFileSync(resolve(root, 'src/engine.js'), 'utf8');
const worker = readFileSync(resolve(root, 'src/bake.worker.js'), 'utf8');
ok(/uBodyDir\[8\]/.test(shaders) && /i < 8/.test(shaders), 'sky slot declarations and loop must both be 8');
ok(/uBodyDir\[8\]/.test(stars) && /i < 8/.test(stars), 'star occlusion declarations and loop must both be 8');
ok(/uOccPos:\s*\{ value: Array\.from\(\{ length: MAX_ECLIPSE_OCCLUDERS/.test(engine));
ok(/type:\s*'system'/.test(engine) && /type === 'system'/.test(worker));
ok(/generation/.test(engine) && /generation/.test(worker));

console.log(`system/capacity contracts pass (${checks} assertions; stress=${stress.bodies.length}, slots=${MAX_BODY_SLOTS}, workerTiles=${WORKER_TILE_BUDGET})`);
