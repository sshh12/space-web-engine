// scripts/assets.mjs — the asset build step (ROADMAP_V2 Phase T).
//
//   npm run assets          # (re)generate assets/*.bin + assets/manifest.json
//   npm run assets:check    # regenerate in memory, verify hashes match the manifest
//
// v2 introduces generated artifacts for the first time (rock mesh packs, material
// stacks, LUTs). CONCEPT's "no build step" is amended: ONE deterministic, seeded
// pass produces them with a hashed manifest; the *runtime* stays build-free and
// the artifacts are data. Today the engine regenerates these at load from the same
// pure functions — this step proves they are reproducible byte-for-byte and gives
// future rounds (imagegen texture stacks, offline-decimated rock sculpts) a place
// to land. The committed manifest (hashes only) is the determinism contract; the
// .bin blobs are gitignored (large, and re-derivable from the recipe).
//
// Covered here: everything a Node process can build without the GPU/three —
// rock mesh packs, limit-surface rock maps, multiple-scattering LUTs, §11 disc
// maps. The star catalog is generated in stars.js (three-coupled vector math);
// its extraction is a one-line loader swap (see stars.js) and rides a later round.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM } from '../src/recipe.js';
import { makeRockSet, makeRockMaps } from '../src/rockcore.js';
import { makeFormationSet } from '../src/meshcore.js';
import { makeMaterialMaps } from '../src/matstack.js';
import { buildMsLUT } from '../src/atmolut.js';
import { makeBaker, bakeDiscMap } from '../src/bakecore.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const OUT = resolve(ROOT, 'assets');
const CHECK = process.argv.includes('--check');

const u8 = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
const sha = (bufs) => { const h = createHash('sha256'); for (const b of bufs) h.update(b); return h.digest('hex'); };

// each builder returns { buf, sha, meta } — meta is small human-readable shape info
function buildRockPack(rk) {
  const { meshes, hulls } = makeRockSet(rk);
  const bufs = [];
  let tris = 0;
  for (const av of meshes) for (const lods of av) for (const m of lods) {
    bufs.push(u8(m.positions), u8(m.normals), u8(m.dirs));
    if (m.index) { bufs.push(u8(m.index)); tris += m.index.length / 3; }
  }
  // round 14: the impostor hull maps ride the same artifact (normal+radius
  // octahedra in fit space + the per-layer radius denormalizers)
  bufs.push(u8(hulls.data), u8(hulls.maxR));
  const buf = Buffer.concat(bufs);
  return { buf, sha: sha(bufs), meta: { archetypes: meshes.length, variants: meshes[0].length, lods: meshes[0][0].length, tris, hullLayers: hulls.layers } };
}
// round 14 — formation solids (ground plan L5): positions/normals/aAO/index
// per LOD + the hull maps, one deterministic pack per formation-bearing body
function buildFormPack(fm) {
  const { meshes, hulls } = makeFormationSet(fm);
  const bufs = [];
  let tris = 0;
  for (const av of meshes) for (const lods of av) for (const m of lods) {
    bufs.push(u8(m.positions), u8(m.normals), u8(m.aAO), u8(m.index));
    tris += m.index.length / 3;
  }
  bufs.push(u8(hulls.data), u8(hulls.maxR));
  const buf = Buffer.concat(bufs);
  return { buf, sha: sha(bufs), meta: { archetypes: meshes.length, variants: meshes[0].length, lods: meshes[0][0].length, tris, hullLayers: hulls.layers } };
}
function buildRockMaps(rk) {
  const m = makeRockMaps(rk);
  const b = u8(m.data);
  return { buf: b, sha: sha([b]), meta: { size: m.size, layers: m.layers } };
}
function buildMsLut(body) {
  const d = buildMsLUT(body);
  const b = u8(d);
  return { buf: b, sha: sha([b]), meta: { floats: d.length } };
}
function buildDisc(body) {
  const baker = makeBaker(body, { cacheMax: 64 });
  const m = bakeDiscMap(body, baker);
  const b = u8(m.rgba);
  return { buf: b, sha: sha([b]), meta: { w: m.w, h: m.h } };
}
function buildMatStack() {
  const m = makeMaterialMaps();
  const b = u8(m.data);
  return { buf: b, sha: sha([b]), meta: { size: m.size, layers: m.layers } };
}

function buildAll() {
  const artifacts = {};
  for (const body of SYSTEM.bodies) {
    const entry = {};
    if (body.rocks) {
      entry.rocks = buildRockPack(body.rocks);
      entry.rockmaps = buildRockMaps(body.rocks);
    }
    if (body.formations) entry.forms = buildFormPack(body.formations);
    if (body.atmosphere) entry.msLUT = buildMsLut(body);
    entry.disc = buildDisc(body);
    artifacts[body.id] = entry;
  }
  // material texture stacks are body-independent (fixed archetype set) — one
  // shared artifact, not per-body (round 10, ground plan L3)
  artifacts.shared = { matstack: buildMatStack() };
  return artifacts;
}

const artifacts = buildAll();

// ---- --check: compare regenerated hashes to the committed manifest ----
if (CHECK) {
  const mfPath = resolve(OUT, 'manifest.json');
  if (!existsSync(mfPath)) { console.error('no assets/manifest.json — run `npm run assets` first'); process.exit(1); }
  const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
  let bad = 0, n = 0;
  for (const [bodyId, entry] of Object.entries(artifacts)) {
    for (const [kind, a] of Object.entries(entry)) {
      n++;
      const want = mf.artifacts?.[bodyId]?.[kind]?.sha256;
      const ok = want === a.sha;
      if (!ok) { bad++; console.error(`MISMATCH ${bodyId}/${kind}: ${a.sha.slice(0, 12)} != ${String(want).slice(0, 12)}`); }
      else console.log(`ok ${bodyId}/${kind}  ${a.sha.slice(0, 12)}`);
    }
  }
  // round 14 (panel M8): the check is now SYMMETRIC — a manifest entry with no
  // regenerated artifact (a silently-removed generator, e.g. a recipe losing
  // its formations block) fails instead of passing by omission
  for (const [bodyId, entry] of Object.entries(mf.artifacts ?? {})) {
    for (const kind of Object.keys(entry)) {
      if (!artifacts?.[bodyId]?.[kind]) {
        bad++; n++;
        console.error(`STALE MANIFEST ENTRY ${bodyId}/${kind}: no generator produced it this run`);
      }
    }
  }
  console.log(bad ? `\n${bad}/${n} artifact(s) DRIFTED — generators are non-deterministic or the manifest is stale`
    : `\nall ${n} assets reproduce the manifest (deterministic)`);
  process.exit(bad ? 1 : 0);
}

// ---- build mode: write blobs + manifest ----
mkdirSync(OUT, { recursive: true });
const manifest = { generator: 'scripts/assets.mjs', runtime: 'engine regenerates these from the same pure fns; this is the determinism contract', artifacts: {} };
let total = 0;
for (const [bodyId, entry] of Object.entries(artifacts)) {
  manifest.artifacts[bodyId] = {};
  for (const [kind, a] of Object.entries(entry)) {
    const file = `${bodyId}-${kind}.bin`;
    writeFileSync(resolve(OUT, file), a.buf);
    manifest.artifacts[bodyId][kind] = { file, bytes: a.buf.length, sha256: a.sha, ...a.meta };
    total += a.buf.length;
    console.log(`${bodyId}/${kind}  ${(a.buf.length / 1024).toFixed(1)} KB  ${a.sha.slice(0, 12)}`);
  }
}
writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`\nwrote ${(total / 1024 / 1024).toFixed(1)} MB of assets + manifest.json`);
