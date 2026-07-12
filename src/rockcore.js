// rockcore.js — ground plan layer 4b: the rock asset pipeline. Rocks are recipe
// data: every mesh is a pure deterministic function of (archetype, variant, lod,
// body.rocks) — seeded cut-plane/noise sculpts evaluated on a WELDED icosphere.
// v0 deformed three.js's non-indexed IcosahedronGeometry per vertex INDEX, so
// shared vertices split and the mesh literally cracked open (register row).
// Here displacement is a function of vertex DIRECTION computed once per unique
// vertex before any unwelding, so output is watertight by construction.
//
// Archetypes follow ground law G3 (clast populations have provenance): angular
// clast (fracture fragment), rounded cobble (transported float), slab (bedding
// plate), jointed block (ledge-calved). What varies per body is recipe data:
// `mix` weights, `rounding` (Huygens cobbles vs lunar breccia), `meshSeed`.
// Three-free and Node-testable.

import { rand01, fbm3, clamp, lerp } from './mathx.js';
import { decimateChain, makeHullMaps } from './meshcore.js';

export const ARCHETYPES = ['clast', 'cobble', 'slab', 'block'];
export const VARIANTS = 2;             // seeded shape variants per archetype
// Round 14 (displacement-decimated sculpts): the sculpt is sampled at
// icosphere subdiv 5 (20480 tris) and quadric-decimated to the SAME tri
// budgets the uniform icospheres carried — the vertex cost is unchanged, but
// the triangles sit at the smin creases and silhouette curvature (measured:
// max support-function error 2.8x lower at the 320-tri tier). Subset
// placement keeps every kept vertex an exact sample of the closed form, so
// `dirs` and the limit-surface octa maps work unchanged.
export const SRC_SUBDIV = 5;
export const LOD_TRIS = [5120, 320, 80];
// (LOD 0 serves only tiles >= L18 — the few dozen rocks within ~40 m of the
// camera; user-reported facet read at macro range drove 1280 -> 5120)
// tile level -> LOD index: deeper tiles are nearer the camera (draw-best-available
// puts the deepest bakes underfoot), so tile level is the honest distance proxy
export const lodForLevel = (l) => (l >= 18 ? 0 : l >= 16 ? 1 : 2);

// ---------------------------------------------------------------------------
// welded icosphere: midpoint-cached subdivision — every position appears once
function icosphere(subdiv) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(nrm);
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < subdiv; s++) {
    const mid = new Map();
    const midpoint = (a, b) => {
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      let m = mid.get(k);
      if (m === undefined) {
        m = verts.length;
        const va = verts[a], vb = verts[b];
        verts.push(nrm([va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]]));
        mid.set(k, m);
      }
      return m;
    };
    const nf = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nf;
  }
  return { verts, faces };
}

function nrm(v) {
  const il = 1 / Math.hypot(v[0], v[1], v[2]);
  return [v[0] * il, v[1] * il, v[2] * il];
}

// polynomial soft-min: rounds the intersection edge between two cuts
function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}

// ---------------------------------------------------------------------------
// the sculpt: radius as a pure function of unit direction. Cut planes carve the
// facets, a box morph squares the blocky archetypes, fBm roughens the faces;
// `rounding` (recipe) pushes cuts shallow and softens every edge.
function shapeFn(ai, vi, rk) {
  const ms = (rk.meshSeed ?? 0) | 0;
  const R = clamp(rk.rounding ?? 0.4, 0, 1);
  let uk = 0;
  const u = () => rand01(ai, vi, uk++, ms ^ 0x5bd1);

  const arch = ARCHETYPES[ai];
  const conf = {
    clast:  { cuts: 8, oLo: 0.30, oHi: 0.42, boxK: 0.0,  nAmp: 0.07, squash: 1 },
    cobble: { cuts: 3, oLo: 0.43, oHi: 0.48, boxK: 0.0,  nAmp: 0.13, squash: 1 },
    slab:   { cuts: 5, oLo: 0.36, oHi: 0.46, boxK: 0.5,  nAmp: 0.05, squash: 0.32 + 0.10 * u() },
    block:  { cuts: 4, oLo: 0.36, oHi: 0.47, boxK: 0.75, nAmp: 0.05, squash: 1 },
  }[arch];

  const planes = [];
  for (let i = 0; i < conf.cuts; i++) {
    const z = 2 * u() - 1, ph = 2 * Math.PI * u();
    let n = [Math.sqrt(Math.max(1 - z * z, 0)) * Math.cos(ph), z, Math.sqrt(Math.max(1 - z * z, 0)) * Math.sin(ph)];
    if (arch === 'slab') { n[1] *= 0.25; n = nrm(n); } // slabs cut their sides, not their faces
    let o = conf.oLo + (conf.oHi - conf.oLo) * u();
    o += (0.49 - o) * 0.75 * R; // rounded bodies keep only shallow cuts
    planes.push([n[0], n[1], n[2], o]);
  }
  const softK = Math.max(0.015 + 0.11 * R, arch === 'cobble' ? 0.06 : 0);
  const boxK = conf.boxK * (1 - 0.5 * R);
  const nFreq = 2.4 + 0.8 * u();
  const nOff = [37.7 * u(), 37.7 * u(), 37.7 * u()];
  const nAmp = conf.nAmp * (1 - 0.35 * R);
  const nSeed = (ms * 8 + ai * 2 + vi) | 0;

  return {
    squash: conf.squash,
    radiusAt(d) {
      let r = 0.5;
      if (boxK > 0) {
        // sphere -> cube morph via the max-norm radius (fit rescales extents)
        const m = Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2]));
        r = lerp(0.5, 0.5 / m, boxK);
      }
      for (const [nx, ny, nz, o] of planes) {
        const dn = d[0] * nx + d[1] * ny + d[2] * nz;
        if (dn > 0.02) r = smin(r, o / dn, softK);
      }
      r *= 1 + nAmp * fbm3(d[0] * nFreq + nOff[0], d[1] * nFreq + nOff[1], d[2] * nFreq + nOff[2], nSeed, 3);
      return clamp(r, 0.16, 0.62);
    },
  };
}

// ---------------------------------------------------------------------------
// mesh assembly. Facet archetypes unweld AFTER displacement (positions bit-exact
// across shared vertices — crack-free); cobbles/rounded bodies keep the welded
// index with accumulated smooth normals.
export function makeRockSet(rk = {}) {
  const R = clamp(rk.rounding ?? 0.4, 0, 1);
  const meshes = [], meta = [], hullSrc = [];
  const src = icosphere(SRC_SUBDIV); // one topology, shared by every sculpt
  for (let ai = 0; ai < ARCHETYPES.length; ai++) {
    const av = [], am = [];
    for (let vi = 0; vi < VARIANTS; vi++) {
      const shape = shapeFn(ai, vi, rk);
      const smooth = ARCHETYPES[ai] === 'cobble' || R >= 0.55;
      const pts = src.verts.map((d) => {
        const r = shape.radiusAt(d);
        return [d[0] * r, d[1] * r * shape.squash, d[2] * r];
      });
      // one fit transform per (archetype, variant), derived from the SOURCE
      // sculpt (a superset of every decimated LOD's vertices — subset
      // placement), applied to every LOD: a LOD swap never shifts a rock's
      // footprint, and the hull map shares the exact space
      const fit = fitTransform(pts);
      for (const p of pts) {
        p[0] = (p[0] - fit.c[0]) * fit.s;
        p[1] = (p[1] - fit.c[1]) * fit.s;
        p[2] = (p[2] - fit.c[2]) * fit.s;
      }
      const snaps = decimateChain(pts, src.faces, LOD_TRIS);
      const lods = snaps.map((sn) => {
        // compact: remap kept source vertices (positions AND their sculpt
        // directions — the limit-map domain) to a standalone index space
        const remap = new Int32Array(pts.length).fill(-1);
        const cPts = [], cDirs = [];
        for (let i = 0; i < pts.length; i++) if (sn.kept[i]) {
          remap[i] = cPts.length;
          cPts.push(pts[i]);
          cDirs.push(src.verts[i]);
        }
        const cFaces = sn.faces.map((f) => [remap[f[0]], remap[f[1]], remap[f[2]]]);
        return smooth ? smoothMesh(cPts, cFaces, cDirs) : facetMesh(cPts, cFaces, cDirs);
      });
      av.push(lods);
      // impostor hull source: the finest LOD, WELDED with smooth accumulated
      // normals regardless of the display mesh's facet/smooth choice (the
      // hull map wants the surface, not the shading style)
      {
        const remap = new Int32Array(pts.length).fill(-1);
        const cPts = [], cDirs = [];
        for (let i = 0; i < pts.length; i++) if (snaps[0].kept[i]) {
          remap[i] = cPts.length; cPts.push(pts[i]); cDirs.push(src.verts[i]);
        }
        const cFaces = snaps[0].faces.map((f) => [remap[f[0]], remap[f[1]], remap[f[2]]]);
        const w = smoothMesh(cPts, cFaces, cDirs);
        hullSrc.push({ positions: w.positions, normals: w.normals });
      }
      // placement anchor: vertical bounds in final unit space (from the finest LOD)
      let yMin = Infinity, yMax = -Infinity;
      const pos0 = lods[0].positions;
      for (let i = 1; i < pos0.length; i += 3) {
        if (pos0[i] < yMin) yMin = pos0[i];
        if (pos0[i] > yMax) yMax = pos0[i];
      }
      am.push({ yMin, yExt: yMax - yMin, fit });
    }
    meshes.push(av);
    meta.push(am);
  }
  // octahedral hull maps (impostor rung): baked from the finest-LOD meshes in
  // fit space — squash, fit and displacement carried by construction (K1)
  const hulls = makeHullMaps(hullSrc);
  return { meshes, meta, hulls };
}

function fitTransform(pts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let k = 0; k < 3; k++) {
      if (p[k] < lo[k]) lo[k] = p[k];
      if (p[k] > hi[k]) hi[k] = p[k];
    }
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  return { c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], s: 1 / ext };
}

// both mesh forms carry `dirs` — the vertex's ORIGINAL sculpt direction (the
// radiusAt domain). The fragment shader looks the baked limit-surface normal
// map up by this direction (octahedral), so facet interiors shade with the
// true high-res sculpt detail regardless of the mesh LOD drawn.
function facetMesh(pts, faces, verts) {
  const positions = new Float32Array(faces.length * 9);
  const normals = new Float32Array(faces.length * 9);
  const dirs = new Float32Array(faces.length * 9);
  for (let f = 0; f < faces.length; f++) {
    const [a, b, c] = faces[f];
    const pa = pts[a], pb = pts[b], pc = pts[c];
    const n = nrm(cross(sub(pb, pa), sub(pc, pa)));
    for (let k = 0; k < 3; k++) {
      const vi = faces[f][k];
      const p = [pa, pb, pc][k], o = f * 9 + k * 3;
      positions[o] = p[0]; positions[o + 1] = p[1]; positions[o + 2] = p[2];
      normals[o] = n[0]; normals[o + 1] = n[1]; normals[o + 2] = n[2];
      dirs[o] = verts[vi][0]; dirs[o + 1] = verts[vi][1]; dirs[o + 2] = verts[vi][2];
    }
  }
  return { positions, normals, dirs, index: null };
}

function smoothMesh(pts, faces, verts) {
  const positions = new Float32Array(pts.length * 3);
  const dirs = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    positions[i * 3] = pts[i][0]; positions[i * 3 + 1] = pts[i][1]; positions[i * 3 + 2] = pts[i][2];
    dirs[i * 3] = verts[i][0]; dirs[i * 3 + 1] = verts[i][1]; dirs[i * 3 + 2] = verts[i][2];
  }
  const acc = new Float64Array(pts.length * 3); // area-weighted (unnormalized cross)
  const index = new Uint16Array(faces.length * 3);
  for (let f = 0; f < faces.length; f++) {
    const [a, b, c] = faces[f];
    index[f * 3] = a; index[f * 3 + 1] = b; index[f * 3 + 2] = c;
    const n = cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]));
    for (const vi of [a, b, c]) {
      acc[vi * 3] += n[0]; acc[vi * 3 + 1] += n[1]; acc[vi * 3 + 2] += n[2];
    }
  }
  const normals = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    const n = nrm([acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]]);
    normals[i * 3] = n[0]; normals[i * 3 + 1] = n[1]; normals[i * 3 + 2] = n[2];
  }
  return { positions, normals, dirs, index };
}

// ---------------------------------------------------------------------------
// limit-surface normal + cavity maps (4b residue: "offline hi-res sculpt →
// baked normal maps", done honestly at startup). The sculpt IS a closed-form
// radius function of direction, so its infinitely-subdivided surface normal is
// computable at any direction — the mesh LODs are just piecewise samples of the
// same function. One octahedral RGBA8 map per (archetype, variant): xyz = the
// exact surface normal in mesh object space (fit = translate + uniform scale,
// which leaves normals untouched; the squash is folded in analytically),
// w = cavity (radius deficit vs the local ring mean — crevice/AO term, and the
// dust-settles-in-cracks weight). Deterministic, three-free, Node-testable.
export const MAP_SIZE = 128;

// octahedral uv (texel center) -> unit direction; GLSL twin: octaUv in ROCK_FRAG
function octaDir(u, v) {
  const fx = u * 2 - 1, fy = v * 2 - 1;
  let nx = fx, ny = fy;
  const nz = 1 - Math.abs(fx) - Math.abs(fy);
  if (nz < 0) {
    nx = (1 - Math.abs(fy)) * (fx >= 0 ? 1 : -1);
    ny = (1 - Math.abs(fx)) * (fy >= 0 ? 1 : -1);
  }
  return nrm([nx, ny, nz]);
}

export function makeRockMaps(rk = {}, size = MAP_SIZE) {
  const data = new Uint8Array(size * size * ARCHETYPES.length * VARIANTS * 4);
  for (let ai = 0; ai < ARCHETYPES.length; ai++)
    for (let vi = 0; vi < VARIANTS; vi++) {
      const shape = shapeFn(ai, vi, rk);
      const sq = shape.squash;
      const S = (d) => {
        const r = shape.radiusAt(d);
        return [d[0] * r, d[1] * r * sq, d[2] * r];
      };
      const base = (ai * VARIANTS + vi) * size * size * 4;
      const eps = 1.2 / size;
      for (let j = 0; j < size; j++)
        for (let i = 0; i < size; i++) {
          const d = octaDir((i + 0.5) / size, (j + 0.5) / size);
          const ax = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
          const ta = nrm(cross(ax, d));
          const tb = cross(d, ta);
          const da = sub(S(nrm([d[0] + ta[0] * eps, d[1] + ta[1] * eps, d[2] + ta[2] * eps])),
            S(nrm([d[0] - ta[0] * eps, d[1] - ta[1] * eps, d[2] - ta[2] * eps])));
          const db = sub(S(nrm([d[0] + tb[0] * eps, d[1] + tb[1] * eps, d[2] + tb[2] * eps])),
            S(nrm([d[0] - tb[0] * eps, d[1] - tb[1] * eps, d[2] - tb[2] * eps])));
          let n = nrm(cross(da, db));
          if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
          // cavity: radius deficit vs an 8-sample ring at ~5x the normal probe
          const r0 = shape.radiusAt(d);
          let rAvg = 0;
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI) / 4;
            const ca = Math.cos(a) * 0.06, sa = Math.sin(a) * 0.06;
            rAvg += shape.radiusAt(nrm([
              d[0] + ta[0] * ca + tb[0] * sa,
              d[1] + ta[1] * ca + tb[1] * sa,
              d[2] + ta[2] * ca + tb[2] * sa,
            ]));
          }
          const cav = clamp(((rAvg / 8) / r0 - 1) * 12, 0, 1);
          const o = base + (j * size + i) * 4;
          data[o] = Math.round((n[0] * 0.5 + 0.5) * 255);
          data[o + 1] = Math.round((n[1] * 0.5 + 0.5) * 255);
          data[o + 2] = Math.round((n[2] * 0.5 + 0.5) * 255);
          data[o + 3] = Math.round(cav * 255);
        }
    }
  return { data, size, layers: ARCHETYPES.length * VARIANTS };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
