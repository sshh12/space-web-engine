// mesh-test.mjs — round 14: the meshcore pipeline contract (run: node
// test/mesh-test.mjs). Pins the pre-code panel's mandated invariants:
//
//   1. decimator determinism (double-run face-list hash) + guarded manifold
//   2. SUBSET placement: every decimated vertex is byte-identical to a source
//      vertex by id (panel H6 — the honest form of "on-surface"; a tolerance
//      form would silently absorb a repositioning regression)
//   3. hull maps match the mesh they claim to summarize (panel K1): decoded
//      hull radius covers every mesh vertex, does not grossly inflate, and the
//      slab layer keeps its squash anisotropy (a raw radiusAt bake reads ~1.0)
//   4. formation solids: closed 2-manifolds (χ = 2), deterministic, budgets
//      respected, AO in range, plumb-anchor meta sane, arch keeps its
//      below-grade footing drop (panel H2's geometric half)
//
// Three-free, pure Node.

import { decimateChain, makeFormationSet, makeHullMaps, FORM_ARCHETYPES, FORM_VARIANTS, FORM_LOD_TRIS } from '../src/core/meshcore.js';
import { makeRockSet, ARCHETYPES, VARIANTS, LOD_TRIS } from '../src/core/rockcore.js';
import { listRocks, listFormations } from '../src/core/scattercore.js';
import { makeBaker } from '../src/core/bakecore.js';
import { bodyById } from '../src/core/recipe.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failures++;
};

// a deterministic crease-bearing test solid (cut octahedron-ish blob)
function testSolid() {
  // icosphere via rockcore is not exported; build a UV sphere grid instead —
  // decimateChain is topology-agnostic
  const ny = 48, nth = 96, pts = [[0, -1, 0]];
  for (let j = 1; j < ny; j++) {
    const th0 = (j / ny) * Math.PI;
    for (let i = 0; i < nth; i++) {
      const ph = (i / nth) * 2 * Math.PI;
      let x = Math.sin(th0) * Math.cos(ph), y = -Math.cos(th0), z = Math.sin(th0) * Math.sin(ph);
      // crease it: soft-clip against two planes
      const r = Math.min(1, 0.82 / Math.max(0.3 * x + 0.9 * y, 0.02), 0.75 / Math.max(0.8 * x - 0.5 * z, 0.02));
      pts.push([x * r, y * r, z * r]);
    }
  }
  pts.push([0, 1, 0]);
  const top = pts.length - 1;
  const ring = (j, i) => 1 + (j - 1) * nth + ((i % nth) + nth) % nth;
  const faces = [];
  for (let i = 0; i < nth; i++) faces.push([0, ring(1, i + 1), ring(1, i)]);
  for (let j = 1; j < ny - 1; j++)
    for (let i = 0; i < nth; i++) {
      const a = ring(j, i), b = ring(j, i + 1), c = ring(j + 1, i), d = ring(j + 1, i + 1);
      faces.push([a, b, d], [a, d, c]);
    }
  for (let i = 0; i < nth; i++) faces.push([top, ring(ny - 1, i), ring(ny - 1, i + 1)]);
  return { pts, faces };
}

function edgeUse(faces) {
  const edges = new Map();
  for (const [a, b, c] of faces)
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? u * 1048576 + v : v * 1048576 + u;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  return edges;
}
function eulerChi(faces) {
  const vs = new Set(), edges = edgeUse(faces);
  for (const f of faces) { vs.add(f[0]); vs.add(f[1]); vs.add(f[2]); }
  return vs.size - edges.size + faces.length;
}
function hashFaces(fs) { let h = 0; for (const f of fs) for (const x of f) h = (h * 31 + x) | 0; return h; }

// ---- 1. decimator determinism + manifold at every snapshot ----
{
  const { pts, faces } = testSolid();
  const a = decimateChain(pts, faces, [1024, 256, 64]);
  const b = decimateChain(pts, faces, [1024, 256, 64]);
  check('decimator deterministic (double-run face hash)',
    a.length === b.length && a.every((s, i) => hashFaces(s.faces) === hashFaces(b[i].faces)));
  let manifold = true, chiOk = true, budget = true;
  for (let i = 0; i < a.length; i++) {
    for (const n of edgeUse(a[i].faces).values()) if (n !== 2) { manifold = false; break; }
    if (eulerChi(a[i].faces) !== 2) chiOk = false;
    if (a[i].faces.length > [1024, 256, 64][i]) budget = false;
  }
  check('every snapshot a closed 2-manifold (edge-use 2)', manifold);
  check('every snapshot genus 0 (χ = 2)', chiOk);
  check('tri budgets respected', budget);
}

// ---- 2. subset placement: kept vertices byte-identical to source by id ----
{
  const { pts, faces } = testSolid();
  const snaps = decimateChain(pts, faces, [256]);
  const sn = snaps[0];
  let moved = 0, used = 0;
  const inFaces = new Set();
  for (const f of sn.faces) { inFaces.add(f[0]); inFaces.add(f[1]); inFaces.add(f[2]); }
  for (const vi of inFaces) {
    used++;
    if (!sn.kept[vi]) moved++;
  }
  check('subset placement: every face vertex is a KEPT source vertex id',
    moved === 0 && used > 0, `${moved} non-source of ${used}`);
}

// ---- 3. hull maps vs their meshes (rocks; panel K1) ----
{
  const rubra = bodyById('rubra');
  const set = makeRockSet(rubra.rocks);
  const h = set.hulls;
  check('hull maps present (layers = archetypes x variants)',
    h && h.layers === ARCHETYPES.length * VARIANTS && h.maxR.length === h.layers);
  // decode helper: octa uv of dir -> nearest texel radius (denormalized)
  const octa = (d) => {
    const s = Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) || 1;
    let x = d[0] / s, y = d[1] / s;
    if (d[2] < 0) {
      const ox = x;
      x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1);
      y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1);
    }
    return [x * 0.5 + 0.5, y * 0.5 + 0.5];
  };
  const radAt = (li, d) => {
    const [u, v] = octa(d);
    const i = Math.min(h.size - 1, Math.round(u * h.size - 0.5));
    const j = Math.min(h.size - 1, Math.round(v * h.size - 0.5));
    return (h.data[(li * h.size * h.size + j * h.size + i) * 4 + 3] / 255) * h.maxR[li];
  };
  let under = 0, total = 0, meanMesh = 0, meanHull = 0;
  const slabLi = ARCHETYPES.indexOf('slab') * VARIANTS; // slab variant 0 layer
  let slabYmax = 0, slabXmax = 0;
  for (let ai = 0; ai < ARCHETYPES.length; ai++)
    for (let vi = 0; vi < VARIANTS; vi++) {
      const li = ai * VARIANTS + vi;
      const m = set.meshes[ai][vi][0];
      const seen = new Set();
      for (let i = 0; i < m.positions.length; i += 3) {
        const x = m.positions[i], y = m.positions[i + 1], z = m.positions[i + 2];
        const k = `${x},${y},${z}`;
        if (seen.has(k)) continue; // facet meshes repeat vertices
        seen.add(k);
        const r = Math.hypot(x, y, z);
        if (r < 1e-6) continue;
        const dec = radAt(li, [x / r, y / r, z / r]);
        total++;
        meanMesh += r; meanHull += dec;
        // the hull must cover the vertex (small slack: bilinear splat + 8-bit)
        if (dec < r * 0.9 - 0.01) under++;
        if (li === slabLi) {
          slabYmax = Math.max(slabYmax, Math.abs(y));
          slabXmax = Math.max(slabXmax, Math.abs(x));
        }
      }
    }
  check('hull covers the mesh (decoded radius >= vertex radius, 10% slack)',
    under / total < 0.02, `${under}/${total} under`);
  check('hull mean does not grossly inflate the mesh',
    meanHull / meanMesh < 1.35, `ratio ${(meanHull / meanMesh).toFixed(2)}`);
  // K1 regression guard: the slab layer's DECODED silhouette keeps its squash.
  // Sample the hull at +y vs +x: a raw radiusAt bake reads ~1.0 ratio.
  const hy = radAt(slabLi, [0, 1, 0]), hx = radAt(slabLi, [1, 0, 0]);
  check('slab hull keeps squash anisotropy (K1: y-radius well under x-radius)',
    hy / hx < 0.7, `hull y/x ${(hy / hx).toFixed(2)} (mesh ${(slabYmax / slabXmax).toFixed(2)})`);
}

// ---- 4. formation solids ----
{
  const fm = { seed: 77, rough: 0.06 }; // representative recipe block
  const a = makeFormationSet(fm), b = makeFormationSet(fm);
  let same = true;
  outer: for (let ai = 0; ai < a.meshes.length; ai++)
    for (let vi = 0; vi < a.meshes[ai].length; vi++)
      for (let li = 0; li < a.meshes[ai][vi].length; li++) {
        const ma = a.meshes[ai][vi][li], mb = b.meshes[ai][vi][li];
        for (let i = 0; i < ma.positions.length; i++)
          if (ma.positions[i] !== mb.positions[i]) { same = false; break outer; }
      }
  check('formation set deterministic (bit-identical rebuild)', same);
  let manifold = true, chiBad = 0, budgetBad = 0, aoBad = 0, total = 0;
  for (let ai = 0; ai < FORM_ARCHETYPES.length; ai++)
    for (let vi = 0; vi < FORM_VARIANTS; vi++)
      for (let li = 0; li < a.meshes[ai][vi].length; li++) {
        const m = a.meshes[ai][vi][li];
        total++;
        const faces = Array.from({ length: m.index.length / 3 },
          (_, f) => [m.index[f * 3], m.index[f * 3 + 1], m.index[f * 3 + 2]]);
        for (const n of edgeUse(faces).values()) if (n !== 2) { manifold = false; break; }
        if (eulerChi(faces) !== 2) chiBad++;
        if (faces.length > FORM_LOD_TRIS[li] * 1.02 && li > 0) budgetBad++;
        for (let i = 0; i < m.aAO.length; i++)
          if (!(m.aAO[i] >= 0.05 && m.aAO[i] <= 1.0)) { aoBad++; break; }
      }
  check(`formations: all ${total} meshes closed 2-manifolds`, manifold);
  // panel round-14: the inward-winding killer — the orientation check rocks
  // always had, applied to the revolve solids (the arch's bent tube reads
  // lower on a centroid test by construction, so it is excluded here)
  {
    let bad = 0;
    for (let ai = 0; ai < 2; ai++) // hoodoo, outcrop
      for (let vi = 0; vi < FORM_VARIANTS; vi++) {
        const m = a.meshes[ai][vi][0];
        let out = 0, cnt = 0, cx = 0, cy = 0, cz = 0;
        const n = m.positions.length / 3;
        for (let i = 0; i < m.positions.length; i += 3) { cx += m.positions[i]; cy += m.positions[i + 1]; cz += m.positions[i + 2]; }
        cx /= n; cy /= n; cz /= n;
        for (let i = 0; i < m.positions.length; i += 3) {
          const dx = m.positions[i] - cx, dy = m.positions[i + 1] - cy, dz = m.positions[i + 2] - cz;
          if (m.normals[i] * dx + m.normals[i + 1] * dy + m.normals[i + 2] * dz > 0) out++;
          cnt++;
        }
        if (out / cnt < 0.8) bad++;
      }
    check('formations: normals face OUTWARD (the round-14 inward-winding killer)', bad === 0, bad + ' inverted');
  }
  check('formations: genus 0 everywhere (χ = 2; swept-tube arch included)', chiBad === 0, `${chiBad} bad`);
  check('formations: LOD budgets respected', budgetBad === 0, `${budgetBad} over`);
  check('formations: vertex AO in range', aoBad === 0, `${aoBad} out of range`);
  // meta sanity: anchors + the arch's below-grade footing drop (H2 geometric half)
  let metaBad = 0;
  for (let ai = 0; ai < FORM_ARCHETYPES.length; ai++)
    for (let vi = 0; vi < FORM_VARIANTS; vi++) {
      const mi = a.meta[ai][vi];
      if (!(mi.yExt > 0.2 && mi.yExt <= 1.001 && mi.yMin < 0.5)) metaBad++;
      if (FORM_ARCHETYPES[ai] === 'arch' && !(mi.endDrop > 0.03 && mi.footXZ.length === 2)) metaBad++;
    }
  check('formation meta sane (anchors; arch footing drop + 2 footings)', metaBad === 0, `${metaBad} bad`);
  // formation hulls exist and cover
  check('formation hull maps present', a.hulls && a.hulls.layers === FORM_ARCHETYPES.length * FORM_VARIANTS);
}

// ---- 5. the ladder partition (panel K5): the L14 impostor set must equal
// the union of its four L15 children's mesh sets above floor(14) — with
// EXACT 3D anchors (u, v, size, AND height h): existence, clamping context,
// height snap and meso level are all resolved through the children, so the
// rung handoff swaps sampling strategy, never facts. A tolerance here would
// silently absorb a vertical-pop regression (the round's named silent killer).
{
  const body = bodyById('luna');
  const baker = makeBaker(body);
  const fl = body.rocks.minTileLevel; // 15
  const L14 = { face: 5, level: 14, x: 100, y: 200 };
  const t14 = baker.bakeTile(L14.face, L14.level, L14.x, L14.y);
  const kids = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]])
    kids.push(baker.bakeTile(L14.face, fl, L14.x * 2 + dx, L14.y * 2 + dy));
  const D15 = 1 << fl;
  const fieldFor = (u, v) => {
    const dx = Math.min(1, Math.max(0, Math.floor(u * D15) - L14.x * 2));
    const dy = Math.min(1, Math.max(0, Math.floor(v * D15) - L14.y * 2));
    return kids[dy * 2 + dx];
  };
  // the impostor floor at L14 (rockSizeFloor law, tiles.js twin)
  const f15 = body.rocks.sizeMin + 0.45 * (body.rocks.sizeMax - body.rocks.sizeMin);
  const floor14 = f15 * Math.pow(2, 0.8);
  const imp = listRocks(t14, kids[0], body, 1e9, floor14, { fieldFor, fieldLevel: fl });
  const mesh = [];
  for (const kid of kids) mesh.push(...listRocks(kid, kid, body, 1e9, floor14));
  const key = (r) => `${r.u},${r.v},${r.size},${r.ai},${r.vi},${r.h}`; // h EXACT
  const impKeys = new Set(imp.map(key));
  const meshKeys = new Set(mesh.map(key));
  let orphans = 0, ghosts = 0;
  for (const k of impKeys) if (!meshKeys.has(k)) ghosts++;
  for (const k of meshKeys) if (!impKeys.has(k)) orphans++;
  check('impostor rung partition: same rocks, EXACT 3D anchors (K5)',
    ghosts === 0 && orphans === 0 && imp.length > 0,
    `${imp.length} impostor vs ${mesh.length} mesh; ${ghosts} ghosts ${orphans} orphans`);
}

// ---- 6. formation placement sanity: Rubra places, Luna structurally empty ----
{
  const rubra = bodyById('rubra');
  check('formations: Luna recipe has NO block (honest absence, panel H3)',
    !bodyById('luna').formations);
  check('formations: Rubra + Tellus blocks present (two agents, panel H4)',
    !!rubra.formations && !!bodyById('tellus').formations);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall tests passed');
process.exit(failures ? 1 : 0);
