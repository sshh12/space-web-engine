// test/assets-test.mjs — the determinism proof, promoted from `assets.mjs --check`.
//
// The old --check compared regenerated hashes to a COMMITTED manifest. That coupled
// the proof to a checked-in artifact and a "remember to run it" ritual. The real
// invariant is simpler and stronger: the pure generators are deterministic — build
// twice in-process, get bit-identical bytes. No committed manifest, no fixture, runs
// on every `npm test`. (LAYOUT_ROADMAP §3 disposition: scripts/assets.mjs dissolves;
// its determinism role lands here, its generation role becomes the engine's JIT
// loader.) When cache/ becomes JIT (recipeHash, bodyId) blobs, this is the guard that
// a cache hit is always byte-equal to a fresh miss.
import { createHash } from 'node:crypto';
import { SYSTEM } from '../src/recipe.js';
import { makeRockSet, makeRockMaps } from '../src/rockcore.js';
import { makeFormationSet } from '../src/meshcore.js';
import { makeMaterialMaps } from '../src/matstack.js';
import { buildMsLUT } from '../src/atmolut.js';
import { makeBaker, bakeDiscMap } from '../src/bakecore.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS  ' + m); } else { fail++; console.log('FAIL  ' + m); } };

const u8 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const sha = (...arrs) => { const h = createHash('sha256'); for (const a of arrs) h.update(u8(a)); return h.digest('hex'); };

// Each producer returns a hash over the artifact's raw typed arrays. Mirrors the
// coverage of the old buildAll() without importing its side-effecting module.
const producers = {
  rocks: (b) => { const { meshes, hulls } = makeRockSet(b.rocks); const a = []; for (const av of meshes) for (const l of av) for (const m of l) { a.push(m.positions, m.normals, m.dirs); if (m.index) a.push(m.index); } a.push(hulls.data, hulls.maxR); return sha(...a); },
  rockmaps: (b) => sha(makeRockMaps(b.rocks).data),
  forms: (b) => { const { meshes, hulls } = makeFormationSet(b.formations); const a = []; for (const av of meshes) for (const l of av) for (const m of l) a.push(m.positions, m.normals, m.aAO, m.index); a.push(hulls.data, hulls.maxR); return sha(...a); },
  msLUT: (b) => sha(buildMsLUT(b)),
  disc: (b) => { const baker = makeBaker(b, { cacheMax: 64 }); return sha(bakeDiscMap(b, baker).rgba); },
};

function artifactsOf(body) {
  const out = {};
  if (body.rocks) { out.rocks = () => producers.rocks(body); out.rockmaps = () => producers.rockmaps(body); }
  if (body.formations) out.forms = () => producers.forms(body);
  if (body.atmosphere) out.msLUT = () => producers.msLUT(body);
  out.disc = () => producers.disc(body);
  return out;
}

let n = 0;
for (const body of SYSTEM.bodies) {
  for (const [kind, gen] of Object.entries(artifactsOf(body))) {
    const a = gen(), b = gen();
    ok(a === b, `${body.id}/${kind} deterministic  ${a.slice(0, 12)}`);
    n++;
  }
}
// body-independent shared material stack
{
  const g = () => sha(makeMaterialMaps().data);
  ok(g() === g(), 'shared/matstack deterministic');
  n++;
}

console.log(`\n${pass}/${pass + fail} checks passed across ${n} artifacts`);
if (fail) process.exit(1);
