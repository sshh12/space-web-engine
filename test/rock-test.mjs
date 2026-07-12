// rock-test.mjs — pure-Node verification of the rock asset pipeline (ground plan
// 4b) and the clustered scatter's §7 contract (run: node test/rock-test.mjs).
//
//   1. determinism: two mesh sets are bit-identical
//   2. watertight: every facet mesh is a closed 2-manifold on quantized positions
//      (the v0 crack bug — per-index deforms on unwelded soup — cannot recur)
//   3. geometry sanity: unit fit, non-degenerate extents, unit outward normals,
//      LODs of one variant share the placement anchor (no footprint shift on swap)
//   4. clustered scatter partition (§7): the union of rocks owned by the four
//      child tiles equals the parent tile's rocks — children of a boulder whose
//      parent cell sits in a NEIGHBOURING tile still land exactly once
//   5. archetype mix converges to the recipe's G3 population weights

import { makeRockSet, makeRockMaps, ARCHETYPES, VARIANTS, LOD_TRIS } from '../src/core/rockcore.js';
import { listRocks, mesoDisp } from '../src/core/scattercore.js';
import { makeBaker } from '../src/core/bakecore.js';
import { bodyById } from '../src/core/recipe.js';
import { vnoise3 } from '../src/core/mathx.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failures++;
};

const luna = bodyById('luna');
const tellus = bodyById('tellus');

// ---- 1. determinism ----
{
  const a = makeRockSet(luna.rocks), b = makeRockSet(luna.rocks);
  let same = true;
  outer: for (let ai = 0; ai < a.meshes.length; ai++)
    for (let vi = 0; vi < a.meshes[ai].length; vi++)
      for (let li = 0; li < a.meshes[ai][vi].length; li++) {
        const ma = a.meshes[ai][vi][li], mb = b.meshes[ai][vi][li];
        for (let i = 0; i < ma.positions.length; i++)
          if (ma.positions[i] !== mb.positions[i]) { same = false; break outer; }
      }
  check('mesh set deterministic (bit-identical rebuild)', same);
}

// ---- 2 + 3. per-mesh structural checks over every body / archetype / variant / LOD ----
{
  let cracks = 0, degens = 0, badNorm = 0, inward = 0, total = 0;
  let anchorDrift = 0;
  for (const body of [tellus, bodyById('rubra'), luna]) {
    const set = makeRockSet(body.rocks);
    for (let ai = 0; ai < ARCHETYPES.length; ai++)
      for (let vi = 0; vi < VARIANTS; vi++) {
        const meta = set.meta[ai][vi];
        for (let li = 0; li < LOD_TRIS.length; li++) {
          const m = set.meshes[ai][vi][li];
          total++;
          // manifold check on the triangle soup: quantized edge -> triangle count.
          // Welded-then-displaced positions are bit-exact across shared vertices,
          // so every edge must appear exactly twice or the mesh has a crack.
          const tris = m.index
            ? Array.from({ length: m.index.length / 3 }, (_, f) => [m.index[f * 3], m.index[f * 3 + 1], m.index[f * 3 + 2]]
                .map((v) => key(m.positions, v)))
            : Array.from({ length: m.positions.length / 9 }, (_, f) => [0, 1, 2]
                .map((k) => key(m.positions, f * 3 + k)));
          const edges = new Map();
          for (const [a, b, c] of tris)
            for (const e of [[a, b], [b, c], [c, a]]) {
              const k = e[0] < e[1] ? e[0] + '|' + e[1] : e[1] + '|' + e[0];
              edges.set(k, (edges.get(k) ?? 0) + 1);
            }
          for (const n of edges.values()) if (n !== 2) { cracks++; break; }
          // extents: fit to unit max dimension, nothing pancaked to a sliver
          const ext = extents(m.positions);
          if (Math.max(...ext) > 1.001 || Math.min(...ext) < 0.12) degens++;
          // normals: unit length, and on average outward (star-shaped sculpt)
          let out = 0, cnt = 0;
          for (let i = 0; i < m.normals.length; i += 3) {
            const nl = Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]);
            if (Math.abs(nl - 1) > 1e-3) { badNorm++; break; }
            const px = m.positions[i], py = m.positions[i + 1], pz = m.positions[i + 2];
            if (m.normals[i] * px + m.normals[i + 1] * py + m.normals[i + 2] * pz > 0) out++;
            cnt++;
          }
          if (out / cnt < 0.9) inward++;
          // LOD bounds stay inside the variant's placement anchor (shared fit)
          let yMin = Infinity;
          for (let i = 1; i < m.positions.length; i += 3) if (m.positions[i] < yMin) yMin = m.positions[i];
          if (yMin < meta.yMin - 1e-4) anchorDrift++;
        }
      }
  }
  check(`watertight: all ${total} meshes closed 2-manifolds`, cracks === 0, `${cracks} cracked`);
  check('extents sane (unit fit, no slivers)', degens === 0, `${degens} degenerate`);
  check('normals unit + outward', badNorm === 0 && inward === 0, `${badNorm} non-unit, ${inward} inward`);
  check('LOD swap cannot drop a rock below its anchor', anchorDrift === 0, `${anchorDrift} drifted`);
}

function key(pos, v) {
  return `${pos[v * 3].toFixed(5)},${pos[v * 3 + 1].toFixed(5)},${pos[v * 3 + 2].toFixed(5)}`;
}
function extents(pos) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (pos[i + k] < lo[k]) lo[k] = pos[i + k];
      if (pos[i + k] > hi[k]) hi[k] = pos[i + k];
    }
  return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
}

// ---- 4. clustered scatter partition (§7) ----
{
  const body = luna; // highest clusterK — the hardest case for ownership
  const baker = makeBaker(body);
  const lo = body.rocks.minTileLevel, hi = lo + 1;
  const coarse = baker.bakeTile(5, lo, 100, 200); // also the declared field tile
  const coarseSet = listRocks(coarse, coarse, body, 1e9);
  const fine = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const t = baker.bakeTile(5, hi, 200 + dx, 400 + dy);
    fine.push(...listRocks(t, coarse, body, 1e9));
  }
  const rkey = (r) => `${r.u},${r.v},${r.size},${r.ai},${r.vi}`;
  const fineKeys = new Set(fine.map(rkey));
  let missing = 0;
  for (const r of coarseSet) if (!fineKeys.has(rkey(r))) missing++;
  check('clustered scatter LOD-independent (same rocks at both levels)',
    missing === 0 && coarseSet.length === fine.length,
    `coarse ${coarseSet.length} fine ${fine.length} missing ${missing}`);
  // children are exactly the rocks a clusterK=0 clone does not place
  const solo = { ...body, rocks: { ...body.rocks, clusterK: 0 } };
  const soloSet = listRocks(coarse, coarse, solo, 1e9);
  check('clusters produced fragments (boulders shed children)',
    coarseSet.length > soloSet.length,
    `clustered ${coarseSet.length} vs solo ${soloSet.length}`);
}

// ---- 5. archetype mix converges to the recipe weights (parents only —
// cluster children are all fragment-class by G3 provenance, by design) ----
{
  const body = { ...luna, rocks: { ...luna.rocks, clusterK: 0 } };
  const baker = makeBaker(luna);
  const t = baker.bakeTile(5, body.rocks.minTileLevel, 100, 200);
  const rocks = listRocks(t, t, body, 1e9);
  const counts = new Array(ARCHETYPES.length).fill(0);
  for (const r of rocks) counts[r.ai]++;
  const tot = rocks.length || 1;
  const mix = body.rocks.mix;
  const wtot = Object.values(mix).reduce((a, b) => a + b, 0);
  let worst = 0;
  for (let ai = 0; ai < ARCHETYPES.length; ai++) {
    const want = (mix[ARCHETYPES[ai]] ?? 0) / wtot;
    worst = Math.max(worst, Math.abs(counts[ai] / tot - want));
  }
  check('G3 population mix within 6% of recipe weights', worst < 0.06,
    `worst deviation ${(worst * 100).toFixed(1)}% over ${tot} rocks`);
}

// ---- 6. limit-surface maps (round 6): deterministic, unit normals ----
{
  const a = makeRockMaps(luna.rocks, 32), b = makeRockMaps(luna.rocks, 32);
  let same = true;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) { same = false; break; }
  check('rock maps deterministic (bit-identical rebuild)', same);
  let badLen = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const nx = a.data[i] / 127.5 - 1, ny = a.data[i + 1] / 127.5 - 1, nz = a.data[i + 2] / 127.5 - 1;
    if (Math.abs(Math.hypot(nx, ny, nz) - 1) > 0.05) badLen++;
  }
  check('rock map normals unit within quantization', badLen === 0, `${badLen} texels off`);
}

// ---- 7. meso-displacement (ground plan L2): the JS twin's lattice wraps at
// the 4096 m detail-domain snap, so two tiles evaluating the same world point
// under different snap origins agree bit-exact (the frag's vnoise contract) ----
{
  let wrapOk = true, rangeOk = true;
  for (let k = 0; k < 200; k++) {
    // dyadic coords (1/1024 grid): the +-4096 m shift must stay EXACT in the
    // mantissa or the comparison tests double rounding, not the lattice wrap
    const q = (x) => Math.round(x * 1024) / 1024;
    const x = q((k * 37.7) % 900), y = q((k * 91.3) % 700), z = q((k * 53.9) % 800);
    const v = vnoise3(x * 0.25, y * 0.25, z * 0.25, 1024, 501);
    // one snap quantum over: 4096 m * 0.25 scale = 1024 lattice cells = period
    const w = vnoise3((x + 4096) * 0.25, (y - 8192) * 0.25, (z + 4096) * 0.25, 1024, 501);
    if (v !== w) wrapOk = false;
    if (Math.abs(v) > 1) rangeOk = false;
  }
  check('vnoise3 periodic across the 4096 m snap (tile-edge bit-exactness)', wrapOk);
  check('vnoise3 in [-1,1]', rangeOk);
  const d0 = mesoDisp(1000, 2000, 3000, 1, 14);
  const dRamp = [15, 16, 17].map((l) => Math.abs(mesoDisp(1000, 2000, 3000, 1, l)));
  check('meso band blends in over levels 15-17 (§4), silent at 14',
    d0 === 0 && dRamp[0] < dRamp[1] && dRamp[1] < dRamp[2],
    `L14 ${d0} ramp ${dRamp.map((v) => v.toFixed(3)).join(' ')}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall tests passed');
process.exit(failures ? 1 : 0);
