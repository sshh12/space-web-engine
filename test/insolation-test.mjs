import assert from 'node:assert/strict';
import { SOL_SYSTEM } from '../src/core/sol.js';
import { makeInsolationContext, insolationTemperatureOffset, annualMeanInsolation, obliquityRad } from '../src/core/insolation.js';
import { makeBaker, I } from '../src/core/bakecore.js';

let n = 0;
const ok = (value, message) => { assert.ok(value, message); n++; };
const eq = (a, b, message) => { assert.equal(a, b, message); n++; };
const body = structuredClone(SOL_SYSTEM.bodies.find((b) => b.id === 'tellus'));
const context = body.processes.find((p) => p.type === 'context');

// insolation-contract: fixed quadrature is deterministic and symmetric in latitude.
const eps = obliquityRad(body);
const q1 = annualMeanInsolation(.4, body.orbit, eps, context.insolation.referenceA);
const q2 = annualMeanInsolation(.4, body.orbit, eps, context.insolation.referenceA);
eq(q1, q2, 'insolation-contract deterministic fixed quadrature');
ok(Number.isFinite(q1) && q1 > 0, 'insolation-contract finite positive flux');

// insolation-contract: moving the recipe outward cools the baked context without
// introducing time or camera input.
const outward = structuredClone(body);
outward.orbit.a *= 2;
const ctx0 = makeInsolationContext(body, context);
const ctx1 = makeInsolationContext(outward, outward.processes.find((p) => p.type === 'context'));
ok(Math.abs(insolationTemperatureOffset(ctx0, 0)) < 2, 'reference orbit stays near authored climate');
ok(insolationTemperatureOffset(ctx1, 0) < -12, 'outward orbit produces material cooling');

const onlyContext = (source) => {
  const b = structuredClone(source);
  b.id += '-insolation-probe';
  b.processes = [b.processes.find((p) => p.type === 'context')];
  return b;
};
const warmTile = makeBaker(onlyContext(body), { cacheMax: 8 }).bakeTile(0, 0, 0, 0);
const coldTile = makeBaker(onlyContext(outward), { cacheMax: 8 }).bakeTile(0, 0, 0, 0);
let warmIce = 0, coldIce = 0, count = 0;
for (let j = 0; j <= 64; j += 4) for (let i = 0; i <= 64; i += 4) {
  warmIce += warmTile.fields.ice[I(i, j)]; coldIce += coldTile.fields.ice[I(i, j)]; count++;
}
ok(coldIce / count > warmIce / count + .05, 'insolation-contract cooling increases the baked ice field');

console.log(`insolation-test: ${n} assertions passed`);
