// reload-test.mjs — hot recipe reload (ROADMAP_V2 Phase T tuning loop).
// The velocity claim is band-selective invalidation: changing a level-8+ process
// must leave levels 0-7 byte-identical, so a tuning edit rebakes only what it can
// change. This proves it in pure Node (run: node test/reload-test.mjs):
//
//   1. invalidationLevel() picks the shallowest changed band (Infinity if none)
//   2. a retained shallow tile is byte-identical to a from-scratch NEW-recipe bake
//      (genuinely unaffected — not merely stale-cached)
//   3. a tile inside the changed band actually rebakes to the new content
//   4. the rebake matches a from-scratch NEW-recipe baker (deterministic)

import { makeBaker, invalidationLevel, TILE_RES, I } from '../src/bakecore.js';
import { bodyById } from '../src/recipe.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failures++;
};
const clone = (o) => JSON.parse(JSON.stringify(o));

function tilesEqual(a, b) {
  for (let c = 0; c < a.height.length; c++) if (a.height[c] !== b.height[c]) return false;
  for (const f of Object.keys(a.fields))
    for (let c = 0; c < a.fields[f].length; c++) if (a.fields[f][c] !== b.fields[f][c]) return false;
  return true;
}
// stable snapshot so a later LRU rebake in the same baker can't mutate it under us
function snap(t) {
  return { height: t.height.slice(), fields: Object.fromEntries(Object.keys(t.fields).map((f) => [f, t.fields[f].slice()])) };
}

// ---- 1. invalidationLevel ----
{
  const base = bodyById('tellus').processes;
  check('identical lists -> Infinity', invalidationLevel(base, clone(base)) === Infinity);

  // the last fbmBand owns [13,19] — a deep tuning edit
  const deepIdx = base.findIndex((p) => p.type === 'fbmBand' && p.levels[0] === 13);
  const deep = clone(base); deep[deepIdx] = { ...deep[deepIdx], amp: deep[deepIdx].amp * 3 };
  check('deep process change -> its first band (13)', invalidationLevel(base, deep) === 13,
    `got ${invalidationLevel(base, deep)}`);

  const shallow = clone(base); shallow[0] = { ...shallow[0], amp: shallow[0].amp + 1 };
  check('shallow process change -> level 0', invalidationLevel(base, shallow) === 0,
    `got ${invalidationLevel(base, shallow)}`);

  const removed = clone(base); const gone = removed.pop();
  check('removed process -> its first band', invalidationLevel(base, removed) === gone.levels[0],
    `got ${invalidationLevel(base, removed)} want ${gone.levels[0]}`);

  const added = clone(base); added.push({ type: 'fbmBand', levels: [10, 19], amp: 9, hurst: 0.8, seed: 999 });
  check('added process -> its first band (10)', invalidationLevel(base, added) === 10,
    `got ${invalidationLevel(base, added)}`);
}

// ---- 2-4. band-selective retention + rebake correctness ----
{
  const body = clone(bodyById('tellus'));
  const oldProcs = clone(body.processes);
  const deepIdx = oldProcs.findIndex((p) => p.type === 'fbmBand' && p.levels[0] === 13);
  const newProcs = clone(oldProcs);
  newProcs[deepIdx] = { ...newProcs[deepIdx], amp: newProcs[deepIdx].amp * 3 };
  const lvl = invalidationLevel(oldProcs, newProcs); // 13

  const baker = makeBaker(clone(body));
  const shallowOld = snap(baker.bakeTile(1, 4, 8, 9));   // level 4 < 13: must be retained
  const deepOld = snap(baker.bakeTile(1, 15, 16000, 16000)); // level 15 in-band: must rebake

  // the hot reload: swap processes, drop only tiles at level >= lvl
  baker.setProcesses(newProcs);
  const dropped = baker.invalidate(lvl);
  check('invalidate dropped some tiles', dropped > 0, `dropped ${dropped}`);

  const shallowKept = baker.bakeTile(1, 4, 8, 9);        // returns retained (cached) tile
  const deepRebaked = baker.bakeTile(1, 15, 16000, 16000); // rebakes under the new recipe

  // ground truth: a fresh baker built from the NEW recipe alone
  const fresh = makeBaker(clone({ ...body, processes: newProcs }));
  const shallowFresh = fresh.bakeTile(1, 4, 8, 9);
  const deepFresh = fresh.bakeTile(1, 15, 16000, 16000);

  check('shallow tile byte-identical after deep reload (retained)', tilesEqual(shallowOld, shallowKept));
  check('shallow tile == fresh NEW-recipe bake (genuinely unaffected)', tilesEqual(shallowOld, shallowFresh));
  check('in-band tile actually rebaked (content changed)', !tilesEqual(deepOld, deepRebaked));
  check('in-band rebake == fresh NEW-recipe bake (deterministic)', tilesEqual(deepRebaked, deepFresh));
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall reload tests passed');
process.exit(failures ? 1 : 0);
