import { strict as assert } from 'node:assert';
import { buildControls, gate, makeClassifier } from '../harness/bench.mjs';
import { SYSTEM } from '../src/core/recipe.js';
import { systemIdentity } from '../src/core/system.js';

const classes = buildControls(20260712, 8);
assert.deepEqual(Object.keys(classes), ['surface', 'disk', 'system', 'travel', 'warp']);
// round 24 (Phase W): the reserved warp class is live — 8 pose draws plus 2
// random epoch x declared-warp draws under the capture law.
assert.equal(Object.values(classes).flat().length, 10);
assert.equal(classes.surface.length + classes.disk.length, 8);
assert.equal(classes.warp.length, 2);
assert(classes.warp.every((s) => s.poseClass === 'warp' && Number.isFinite(s.spec.warp) && Number.isFinite(s.spec.epochS)));
assert(Object.values(classes).flat().every((s) => ['surface', 'disk', 'warp'].includes(s.poseClass)));
assert(Object.values(classes).flat().every((s) => s.expected == null));

const classify = makeClassifier(SYSTEM, { changedBodies: ['tellus'] });
assert.equal(classify(SYSTEM.bodies[0], { body: 'tellus', lat: 0, lon: 0, alt: 1000, tday: 0.5 }), 'body-data');

const p = { backend: 'gpu', fast: true, system: systemIdentity(SYSTEM) };
assert.doesNotThrow(() => gate([], [], { runProvenance: p, baselineProvenance: p }));
assert.throws(() => gate([], [], { runProvenance: p, baselineProvenance: { ...p, fast: false } }), /incomparable/);
console.log('phase 0 harness contracts pass');
