import { strict as assert } from 'node:assert';
import { SYSTEM, bodyById } from '../src/core/recipe.js';
import { epochFromViews, solvePhaseTday, viewsAtEpoch } from '../src/core/time.js';
import { ephemeris } from '../src/core/frames.js';
import { recipeHash, sameRunProvenance, systemIdentity } from '../src/core/system.js';
import { resolveSpec, validateSpec } from '../src/scenespec.js';

for (const body of SYSTEM.bodies) {
  const legacy = { season: 0.37, tday: 0.61, dayCount: 2 };
  const expected = legacy.season * body.orbit.periodDays * 86400
    + (legacy.dayCount + legacy.tday) * body.spin.periodH * 3600;
  assert.equal(epochFromViews(body, legacy), expected, `${body.id}: legacy time is exact`);
  assert.equal(epochFromViews(body, { epochS: expected, season: 9, tday: 9 }), expected);
  const v = viewsAtEpoch(body, expected);
  assert(v.season >= 0 && v.season < 1 && v.tday >= 0 && v.tday < 1);
}

assert.equal(resolveSpec({}, { tday: 0.73 }).season, 0.15);
assert.equal(resolveSpec({}, { tday: 0.73 }).tday, 0.73);
assert.equal(resolveSpec({ tday: 0.2 }, { tday: 0.73 }).tday, 0.2);
assert(validateSpec({ body: 'tellus', epochS: 123 }).ok);
assert(!validateSpec({ body: 'tellus', epochS: 'now' }).ok);
assert(!validateSpec({ body: 3 }).ok);

const id = systemIdentity(SYSTEM);
assert.equal(id.id, SYSTEM.id);
assert.equal(id.recipeHash, recipeHash(JSON.parse(JSON.stringify(SYSTEM))));
assert(sameRunProvenance({ backend: 'gpu', fast: true, system: id }, { backend: 'gpu', fast: true, system: id }));
assert(!sameRunProvenance({ backend: 'gpu', fast: true, system: id }, { backend: 'gpu', fast: false, system: id }));
assert(bodyById('tellus'));
const tellus = bodyById('tellus'), dir = [1, 0, 0], season = 0.41;
const solved = solvePhaseTday(tellus, 73, dir, ephemeris, season);
const solverEpoch = epochFromViews(tellus, { season, tday: solved });
assert.equal(solverEpoch, season * tellus.orbit.periodDays * 86400 + solved * tellus.spin.periodH * 3600);
assert.equal(epochFromViews(tellus, { season, tday: 0.6 }), epochFromViews(tellus, { season, tday: 0.6, faceSun: true }));
console.log('phase 0 pure contracts pass');
