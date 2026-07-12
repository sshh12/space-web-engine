// meshcore.js — round 14: the deterministic mesh pipeline under "beyond the
// heightfield". One primitive, three clients: (a) displacement-DECIMATED rock
// sculpt LOD chains (closes the registered "silhouettes are mesh-bound"
// residue — same tri budgets as the uniform icospheres, triangles spent where
// quadric error says the silhouette needs them), (b) formation archetype
// solids with REAL overhang (hoodoo / outcrop / arch — closed-form grid
// triangulations, no marching cubes), (c) the octahedral HULL maps the
// impostor rung samples (baked FROM the finest-LOD mesh in fit space, so
// squash, fit transform and displacement are carried by construction — the
// pre-code panel's K1: a raw radiusAt bake renders slabs as round blobs).
//
// Decimation is SUBSET-PLACEMENT quadric edge collapse: a collapse keeps one
// of the two endpoint VERTICES, never a new position — every output vertex is
// bit-identical to a source vertex (panel H6: the on-surface invariant is
// byte-equality by vertex id, testable with zero tolerance). Collapses are
// guarded (edge-link condition + normal-flip rejection) so every LOD stays a
// closed 2-manifold, and ordered deterministically (cost, then integer vertex
// ids) so double runs hash identically. Three-free, Node-testable.

import { fbm3, rand01, clamp, lerp } from './mathx.js';

// ---------------------------------------------------------------------------
// subset-placement quadric decimation. pts: [[x,y,z]...] (welded), faces:
// [[a,b,c]...]. targets: DESCENDING tri counts; returns one snapshot per
// target: { faces, kept } where faces index the ORIGINAL vertex array and
// kept marks surviving vertices. Cascaded: each target continues from the
// previous state (nested simplifications — one pass, three snapshots).
export function decimateChain(pts, faces, targets) {
  const nv = pts.length;
  const pos = new Float64Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    pos[i * 3] = pts[i][0]; pos[i * 3 + 1] = pts[i][1]; pos[i * 3 + 2] = pts[i][2];
  }
  const Q = new Float64Array(nv * 10);
  const addPlaneQ = (vi, a, b, c, d) => {
    const o = vi * 10;
    Q[o] += a * a; Q[o + 1] += a * b; Q[o + 2] += a * c; Q[o + 3] += a * d;
    Q[o + 4] += b * b; Q[o + 5] += b * c; Q[o + 6] += b * d;
    Q[o + 7] += c * c; Q[o + 8] += c * d; Q[o + 9] += d * d;
  };
  const F = faces.map((f) => [f[0], f[1], f[2]]);
  for (const [a, b, c] of F) {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    let nx = (pos[b * 3 + 1] - ay) * (pos[c * 3 + 2] - az) - (pos[b * 3 + 2] - az) * (pos[c * 3 + 1] - ay);
    let ny = (pos[b * 3 + 2] - az) * (pos[c * 3] - ax) - (pos[b * 3] - ax) * (pos[c * 3 + 2] - az);
    let nz = (pos[b * 3] - ax) * (pos[c * 3 + 1] - ay) - (pos[b * 3 + 1] - ay) * (pos[c * 3] - ax);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const d = -(nx * ax + ny * ay + nz * az);
    addPlaneQ(a, nx, ny, nz, d); addPlaneQ(b, nx, ny, nz, d); addPlaneQ(c, nx, ny, nz, d);
  }
  const qErr = (vi, x, y, z) => {
    const o = vi * 10;
    return Q[o] * x * x + 2 * Q[o + 1] * x * y + 2 * Q[o + 2] * x * z + 2 * Q[o + 3] * x
      + Q[o + 4] * y * y + 2 * Q[o + 5] * y * z + 2 * Q[o + 6] * y
      + Q[o + 7] * z * z + 2 * Q[o + 8] * z + Q[o + 9];
  };
  const vFaces = Array.from({ length: nv }, () => new Set());
  const vAdj = Array.from({ length: nv }, () => new Set());
  F.forEach((f, fi) => {
    for (let k = 0; k < 3; k++) {
      vFaces[f[k]].add(fi);
      vAdj[f[k]].add(f[(k + 1) % 3]); vAdj[f[k]].add(f[(k + 2) % 3]);
    }
  });
  const alive = new Uint8Array(nv).fill(1);
  const fAlive = new Uint8Array(F.length).fill(1);
  let tris = F.length;

  // binary heap ordered by (cost, u, v, keep) — a total order with integer
  // tie-breaks, so the collapse sequence is machine-independent
  const H = [];
  const less = (a, b) => a.c < b.c
    || (a.c === b.c && (a.u < b.u || (a.u === b.u && (a.v < b.v || (a.v === b.v && a.keep < b.keep)))));
  const hPush = (e) => {
    H.push(e);
    let i = H.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(H[i], H[p])) { const t = H[i]; H[i] = H[p]; H[p] = t; i = p; } else break;
    }
  };
  const hPop = () => {
    const top = H[0], last = H.pop();
    if (H.length) {
      H[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < H.length && less(H[l], H[m])) m = l;
        if (r < H.length && less(H[r], H[m])) m = r;
        if (m === i) break;
        const t = H[i]; H[i] = H[m]; H[m] = t; i = m;
      }
    }
    return top;
  };
  const ver = new Uint32Array(nv); // lazy invalidation
  const pushEdge = (u, v) => {
    // subset placement: the collapse keeps u OR v, cost = combined quadric at
    // the KEPT position — both directed forms enter the queue
    const cu = qErr(u, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) + qErr(v, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    const cv = qErr(u, pos[u * 3], pos[u * 3 + 1], pos[u * 3 + 2]) + qErr(v, pos[u * 3], pos[u * 3 + 1], pos[u * 3 + 2]);
    hPush({ c: cu, u, v, keep: v, vu: ver[u], vv: ver[v] });
    hPush({ c: cv, u, v, keep: u, vu: ver[u], vv: ver[v] });
  };
  {
    const seen = new Set();
    for (const f of F)
      for (let k = 0; k < 3; k++) {
        const u = f[k], v = f[(k + 1) % 3];
        const key = u < v ? u * 65536 + v : v * 65536 + u;
        if (!seen.has(key)) { seen.add(key); pushEdge(Math.min(u, v), Math.max(u, v)); }
      }
  }

  const snapshot = () => {
    const out = [];
    for (let fi = 0; fi < F.length; fi++) if (fAlive[fi]) out.push([F[fi][0], F[fi][1], F[fi][2]]);
    return { faces: out, kept: alive.slice() };
  };
  const snaps = [];
  let ti = 0;
  const nrmOf = (pa, qa, ra, pb, qb, rb, pc, qc, rc) => [
    (qb - pb) * (rc - pc) - (rb - pb) * (qc - pc),
    (rb - pb) * (qa - pa) - (qb - pb) * (ra - pa),
    (qb - pb) * (ra - pa) - (rb - pb) * (qa - pa),
  ];
  while (ti < targets.length) {
    if (tris <= targets[ti]) { snaps.push(snapshot()); ti++; continue; }
    if (!H.length) break; // guards exhausted the queue — snapshot what stands
    const e = hPop();
    const { u, v, keep } = e;
    if (!alive[u] || !alive[v] || ver[u] !== e.vu || ver[v] !== e.vv) continue;
    if (!vAdj[u].has(v)) continue;
    const gone = keep === u ? v : u;
    // edge-link condition: a manifold interior edge shares exactly 2 vertices
    let shared = 0;
    for (const w of vAdj[u]) if (vAdj[v].has(w)) shared++;
    if (shared !== 2) continue;
    // normal-flip guard on the faces of `gone` that survive the collapse
    let flip = false;
    for (const fi of vFaces[gone]) {
      if (!fAlive[fi]) continue;
      const f = F[fi];
      if (f[0] === keep || f[1] === keep || f[2] === keep) continue;
      const P = (i2) => [pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2]];
      const [a, b, c] = f;
      const pa = P(a), pb = P(b), pc = P(c);
      const before = [
        (pb[1] - pa[1]) * (pc[2] - pa[2]) - (pb[2] - pa[2]) * (pc[1] - pa[1]),
        (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]),
        (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]),
      ];
      const g = [pa, pb, pc];
      g[f.indexOf(gone)] = P(keep);
      const after = [
        (g[1][1] - g[0][1]) * (g[2][2] - g[0][2]) - (g[1][2] - g[0][2]) * (g[2][1] - g[0][1]),
        (g[1][2] - g[0][2]) * (g[2][0] - g[0][0]) - (g[1][0] - g[0][0]) * (g[2][2] - g[0][2]),
        (g[1][0] - g[0][0]) * (g[2][1] - g[0][1]) - (g[1][1] - g[0][1]) * (g[2][0] - g[0][0]),
      ];
      if (before[0] * after[0] + before[1] * after[1] + before[2] * after[2] <= 1e-12) { flip = true; break; }
    }
    if (flip) continue;
    // collapse gone -> keep
    const ok = keep * 10, og = gone * 10;
    for (let k = 0; k < 10; k++) Q[ok + k] += Q[og + k];
    alive[gone] = 0;
    for (const fi of vFaces[gone]) {
      if (!fAlive[fi]) continue;
      const f = F[fi];
      if (f[0] === keep || f[1] === keep || f[2] === keep) { fAlive[fi] = 0; tris--; continue; }
      f[f.indexOf(gone)] = keep;
      vFaces[keep].add(fi);
    }
    for (const w of vAdj[gone]) {
      if (w === keep) continue;
      vAdj[w].delete(gone);
      if (alive[w]) { vAdj[w].add(keep); vAdj[keep].add(w); }
    }
    vAdj[keep].delete(gone);
    ver[keep]++;
    const nbrs = [];
    for (const w of vAdj[keep]) nbrs.push(w);
    nbrs.sort((a, b) => a - b); // deterministic re-queue order
    for (const w of nbrs) pushEdge(Math.min(w, keep), Math.max(w, keep));
  }
  while (ti < targets.length) { snaps.push(snapshot()); ti++; } // queue exhausted
  return snaps;
}

// compact a snapshot into standalone arrays: positions/dirs/extras remapped to
// surviving vertices only. extras: {name: FlatArray-of-stride} carried through
// by vertex id (subset placement — values survive verbatim).
export function compactMesh(pts, snapshot, extras = {}) {
  const { faces, kept } = snapshot;
  const nv = pts.length;
  const remap = new Int32Array(nv).fill(-1);
  const outPts = [];
  for (let i = 0; i < nv; i++) if (kept[i]) { remap[i] = outPts.length; outPts.push(pts[i]); }
  const outFaces = faces.map((f) => [remap[f[0]], remap[f[1]], remap[f[2]]]);
  const outExtras = {};
  for (const [name, { data, stride }] of Object.entries(extras)) {
    const out = new Float64Array(outPts.length * stride);
    let n = 0;
    for (let i = 0; i < nv; i++) if (kept[i]) {
      for (let k = 0; k < stride; k++) out[n * stride + k] = data[i * stride + k];
      n++;
    }
    outExtras[name] = out;
  }
  return { pts: outPts, faces: outFaces, extras: outExtras };
}

// ---------------------------------------------------------------------------
// formation archetype solids. Every mesh is a pure fn of (archetype, variant,
// recipe formations block). All are closed 2-manifolds (χ = 2): generalized
// cylinders r(y, θ) with pole-capped ends, or a swept tube with capped,
// below-grade ends (the arch — genus 0; the ground closes the visual loop).
// Displacement lives INSIDE the radius fns (per unique vertex by
// construction), seeded per (archetype, variant, recipe seed).

export const FORM_ARCHETYPES = ['hoodoo', 'outcrop', 'arch'];
export const FORM_VARIANTS = 2;
export const FORM_LOD_TRIS = [4096, 1024, 256];

// generalized cylinder: profile r(y01) x azimuthal modulation, y in [0,1]
// object units (placement scales by size). ny rings x nth sectors + 2 poles.
function revolve(radiusFn, ny, nth) {
  const pts = [], dirsY = [];
  pts.push([0, 0, 0]); // bottom pole
  for (let j = 1; j < ny; j++) {
    const y01 = j / ny;
    for (let i = 0; i < nth; i++) {
      const th = (i / nth) * 2 * Math.PI;
      const r = radiusFn(y01, th);
      pts.push([r * Math.cos(th), y01, r * Math.sin(th)]);
    }
  }
  pts.push([0, 1, 0]); // top pole
  const top = pts.length - 1;
  const ring = (j, i) => 1 + (j - 1) * nth + ((i % nth) + nth) % nth;
  const faces = [];
  for (let i = 0; i < nth; i++) faces.push([0, ring(1, i + 1), ring(1, i)]);
  for (let j = 1; j < ny - 1; j++)
    for (let i = 0; i < nth; i++) {
      const a = ring(j, i), b = ring(j, i + 1), c = ring(j + 1, i), d = ring(j + 1, i + 1);
      faces.push([a, d, b], [a, c, d]);
    }
  for (let i = 0; i < nth; i++) faces.push([top, ring(ny - 1, i), ring(ny - 1, i + 1)]);
  return { pts, faces };
}

// swept tube along a semicircular spine in the XZ...Y plane: t in [0,1] maps
// to angle pi..0 (footing to footing), tube cross-section radius rt(t, phi).
// Ends extend BELOW y=0 (both footings; the placement law buries them under
// local grade at BOTH ends — panel H2) and close with pole caps.
function sweptTube(spanR, endDrop, rtFn, nt, nph) {
  const pts = [], faces = [];
  const spine = (t) => {
    const a = Math.PI * (1 - t);
    return [Math.cos(a) * spanR, Math.sin(a) * spanR - (t <= 0 || t >= 1 ? endDrop : 0), 0];
  };
  // frames: tangent along the spine, normal = radial in the arc plane, binormal = z
  pts.push(spine(-0.0001)); // bottom cap pole (footing A, below grade)
  pts[0][1] -= endDrop;
  for (let j = 0; j <= nt; j++) {
    const t = j / nt;
    const a = Math.PI * (1 - t);
    const cx = Math.cos(a) * spanR, cy = Math.sin(a) * spanR;
    const drop = lerp(1, 0, clamp(Math.min(t, 1 - t) * 6, 0, 1)) * endDrop; // ends sink
    const nx = Math.cos(a), ny2 = Math.sin(a); // radial in-plane normal
    for (let i = 0; i < nph; i++) {
      const ph = (i / nph) * 2 * Math.PI;
      const r = rtFn(t, ph);
      const ca = Math.cos(ph) * r, sa = Math.sin(ph) * r;
      pts.push([cx + nx * ca, cy + ny2 * ca - drop, sa]);
    }
  }
  pts.push(spine(1.0001));
  pts[pts.length - 1][1] -= endDrop;
  const bot = 0, top = pts.length - 1;
  const ring = (j, i) => 1 + j * nph + ((i % nph) + nph) % nph;
  for (let i = 0; i < nph; i++) faces.push([bot, ring(0, i), ring(0, i + 1)]);
  for (let j = 0; j < nt; j++)
    for (let i = 0; i < nph; i++) {
      const a = ring(j, i), b = ring(j, i + 1), c = ring(j + 1, i), d = ring(j + 1, i + 1);
      faces.push([a, b, d], [a, d, c]);
    }
  for (let i = 0; i < nph; i++) faces.push([top, ring(nt, i + 1), ring(nt, i)]);
  return { pts, faces };
}

// archetype shape functions — recipe fm: { seed, bedT (object-relative bed
// spacing in y01 units for LEDGE steps; FORM_FRAG re-derives tone from the
// country-rock octave family — panel K2 keeps the two independent), ... }
function formShape(ai, vi, fm) {
  const seed = ((fm.seed ?? 0) | 0) ^ (ai * 131 + vi * 17);
  const rough = fm.rough ?? 0.06;
  const arch = FORM_ARCHETYPES[ai];
  const nz = (x, y, z, f, s2) => fbm3(x * f + 37.7, y * f, z * f - 11.3, seed + s2, 3);
  if (arch === 'hoodoo') {
    // caprock disc over an eroding neck; per-bed radius steps at ledge scale
    const capY = 0.78 + 0.08 * rand01(1, ai, vi, seed);
    const bedY = fm.bedY ?? 0.16; // ledge spacing in y01 (a ~25 m hoodoo -> ~4 m beds)
    return {
      build: () => revolve((y, th) => {
        const cap = y > capY;
        const bed = Math.floor(y / bedY);
        const bedR = 0.82 + 0.18 * rand01(bed, ai, vi, seed + 5); // per-bed resistance
        let r = cap ? 0.46 + 0.10 * (1 - (y - capY) / (1 - capY)) // caprock overhang lip
          : 0.16 + 0.16 * (1 - y) * bedR + 0.06 * Math.pow(1 - y, 3); // tapering neck
        const c = Math.cos(th), s = Math.sin(th);
        r *= 1 + rough * nz(c * 2, y * 3, s * 2, 2.6, 9);
        return Math.max(r, 0.05);
      }, 48, 96),
      aspect: fm.hoodooAspect ?? 2.6, // height : width
    };
  }
  if (arch === 'outcrop') {
    // low ledge with an undercut basal notch — the overhang workhorse
    const notchY = 0.16 + 0.10 * rand01(2, ai, vi, seed);
    return {
      build: () => revolve((y, th) => {
        const c = Math.cos(th), s = Math.sin(th);
        const el = 1 + 0.35 * Math.cos(2 * th + vi); // elongated plan
        let r = 0.5 * el * (1 - 0.35 * Math.pow(Math.max(y - 0.55, 0) / 0.45, 1.6)); // rounded crown
        const notch = Math.exp(-Math.pow((y - notchY) / 0.10, 2));
        r *= 1 - (fm.notchK ?? 0.22) * notch; // the undercut
        r *= 1 + rough * 1.4 * nz(c * 2, y * 2, s * 2, 3.1, 21);
        return Math.max(r, 0.05);
      }, 40, 80),
      aspect: fm.outcropAspect ?? 0.75,
    };
  }
  // arch: swept tube, footings dropped WELL below the object floor so the
  // placement burial law can absorb footing-to-footing grade differences
  const spanR = 0.5;
  const endDrop = fm.archDrop ?? 0.35;
  return {
    build: () => {
      const m = sweptTube(spanR, endDrop, (t, ph) => {
        const base = 0.13 + 0.10 * Math.pow(Math.abs(t - 0.5) * 2, 2); // thick footings, slim lintel
        return base * (1 + rough * 1.2 * nz(Math.cos(ph), t * 4, Math.sin(ph), 3.0, 33));
      }, 64, 24);
      // lift so the object floor (y=0) sits at the lintel footprint base:
      // footing tips remain BELOW 0 by ~endDrop (buried by construction)
      return m;
    },
    aspect: fm.archAspect ?? 1.0,
    footings: [[-spanR, 0], [spanR, 0]], // object-space xz of the two footings
    endDrop,
  };
}

// analytic per-vertex AO for formation solids: the overhang horizon — scan up
// the local profile; a point under a wider body above it loses sky. Plus a
// floor term for the arch underside. Deterministic, closed-form-only.
function bakeVertexAO(pts, shapeKind) {
  const n = pts.length;
  const ao = new Float64Array(n).fill(1);
  // radial profile approximation: for each vertex, compare its horizontal
  // radius to the max radius in a band above it — wider-above ⇒ occluded
  let maxY = -Infinity, minY = Infinity;
  for (const p of pts) { if (p[1] > maxY) maxY = p[1]; if (p[1] < minY) minY = p[1]; }
  const H = Math.max(maxY - minY, 1e-6);
  const bands = 24;
  const bandMaxR = new Float64Array(bands).fill(0);
  for (const p of pts) {
    const b = clamp(Math.floor(((p[1] - minY) / H) * bands), 0, bands - 1);
    const r = Math.hypot(p[0], p[2]);
    if (r > bandMaxR[b]) bandMaxR[b] = r;
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const b = clamp(Math.floor(((p[1] - minY) / H) * bands), 0, bands - 1);
    const r = Math.hypot(p[0], p[2]);
    let occ = 0;
    for (let b2 = b + 1; b2 < bands; b2++) {
      const dy = ((b2 - b) / bands) * H;
      const dr = bandMaxR[b2] - r;
      if (dr > 0) occ = Math.max(occ, clamp((dr / (dy + 0.02)) * 0.5, 0, 1));
    }
    // underside term: downward-facing skin near the object floor of a wide
    // body above it (arch lintel underside, caprock lip)
    ao[i] = clamp(1 - 0.75 * occ, 0.15, 1);
  }
  if (shapeKind === 'arch') {
    // the lintel underside sees ground, not sky: darken by height under the arc
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const under = clamp((0.45 - Math.hypot(p[0], p[1] - 0.0)) * 2.2, 0, 1) * clamp(p[1] * 3, 0, 1);
      ao[i] = Math.min(ao[i], clamp(1 - 0.55 * under, 0.15, 1));
    }
  }
  return ao;
}

// fit transform (rockcore convention): center + uniform scale from extents.
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

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm3 = (v) => { const il = 1 / (Math.hypot(v[0], v[1], v[2]) || 1); return [v[0] * il, v[1] * il, v[2] * il]; };

// indexed smooth mesh with accumulated area-weighted normals + optional extras
function smoothMeshOf(pts, faces, extras = {}) {
  const positions = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    positions[i * 3] = pts[i][0]; positions[i * 3 + 1] = pts[i][1]; positions[i * 3 + 2] = pts[i][2];
  }
  const acc = new Float64Array(pts.length * 3);
  const index = new Uint16Array(faces.length * 3);
  for (let f = 0; f < faces.length; f++) {
    const [a, b, c] = faces[f];
    index[f * 3] = a; index[f * 3 + 1] = b; index[f * 3 + 2] = c;
    const n = cross3(sub3(pts[b], pts[a]), sub3(pts[c], pts[a]));
    for (const vi of [a, b, c]) { acc[vi * 3] += n[0]; acc[vi * 3 + 1] += n[1]; acc[vi * 3 + 2] += n[2]; }
  }
  const normals = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    const n = nrm3([acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]]);
    normals[i * 3] = n[0]; normals[i * 3 + 1] = n[1]; normals[i * 3 + 2] = n[2];
  }
  const out = { positions, normals, index };
  for (const [name, arr] of Object.entries(extras)) {
    const f32 = new Float32Array(arr.length);
    f32.set(arr);
    out[name] = f32;
  }
  return out;
}

// build the formation mesh set: archetype x variant x LOD chain + meta.
// fm = body.formations (recipe). Mirrors makeRockSet's contract:
// { meshes[ai][vi][lod] = {positions, normals, index, ao}, meta[ai][vi] =
//   {yMin, yExt, footXZ, endDrop} } — everything in FIT space.
export function makeFormationSet(fm = {}) {
  const meshes = [], meta = [], hullSrc = [];
  for (let ai = 0; ai < FORM_ARCHETYPES.length; ai++) {
    const av = [], am = [];
    for (let vi = 0; vi < FORM_VARIANTS; vi++) {
      const shape = formShape(ai, vi, fm);
      const { pts, faces } = shape.build();
      // aspect: scale y so height/width matches the archetype before fitting
      for (const p of pts) p[1] *= shape.aspect;
      const fit = fitTransform(pts);
      for (const p of pts) {
        p[0] = (p[0] - fit.c[0]) * fit.s;
        p[1] = (p[1] - fit.c[1]) * fit.s;
        p[2] = (p[2] - fit.c[2]) * fit.s;
      }
      const ao = bakeVertexAO(pts, FORM_ARCHETYPES[ai]);
      const snaps = decimateChain(pts, faces, FORM_LOD_TRIS);
      const lods = snaps.map((sn) => {
        const cm = compactMesh(pts, sn, { ao: { data: ao, stride: 1 } });
        return smoothMeshOf(cm.pts, cm.faces, { aAO: cm.extras.ao });
      });
      av.push(lods);
      let yMin = Infinity, yMax = -Infinity;
      const pos0 = lods[0].positions;
      for (let i = 1; i < pos0.length; i += 3) {
        if (pos0[i] < yMin) yMin = pos0[i];
        if (pos0[i] > yMax) yMax = pos0[i];
      }
      const footXZ = (shape.footings ?? []).map(([x, z]) => [
        (x - fit.c[0]) * fit.s, (z - fit.c[2]) * fit.s,
      ]);
      am.push({ yMin, yExt: yMax - yMin, fit, footXZ, endDrop: (shape.endDrop ?? 0) * fit.s * shape.aspect });
      hullSrc.push({ positions: lods[0].positions, normals: lods[0].normals });
    }
    meshes.push(av);
    meta.push(am);
  }
  // impostor hull maps (K1 discipline shared with rocks): baked from the
  // finest-LOD meshes in fit space — a formation's far rung summarizes the
  // same surface its mesh rung draws
  const hulls = makeHullMaps(hullSrc);
  return { meshes, meta, hulls };
}

// ---------------------------------------------------------------------------
// octahedral HULL maps for the impostor rung — baked FROM the finest-LOD mesh
// in fit space (panel K1: this carries squash, fit and displacement by
// construction, and the SAME code path serves rocks and formations).
// Per texel: rgb = mean surface normal, a = max radius along the texel's
// direction cone, normalized by maxR (stored in the returned meta).
export const HULL_SIZE = 64;

function octaUvOf(d) {
  const s = Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) || 1;
  let x = d[0] / s, y = d[1] / s;
  if (d[2] < 0) {
    const ox = x;
    x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1);
    y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1);
  }
  return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}

// meshes: array of {positions, normals} (finest LOD per variant slot, in fit
// space); returns { data: Uint8Array(size*size*layers*4), size, layers,
// maxR: Float32Array(layers) }.
export function makeHullMaps(meshList, size = HULL_SIZE) {
  const layers = meshList.length;
  const data = new Uint8Array(size * size * layers * 4);
  const maxRs = new Float32Array(layers);
  for (let li = 0; li < layers; li++) {
    const { positions, normals } = meshList[li];
    const nv = positions.length / 3;
    const rad = new Float64Array(size * size).fill(0);
    const nx = new Float64Array(size * size), ny = new Float64Array(size * size), nz2 = new Float64Array(size * size);
    const wsum = new Float64Array(size * size);
    let maxR = 0;
    for (let i = 0; i < nv; i++) {
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      const r = Math.hypot(x, y, z);
      if (r > maxR) maxR = r;
      if (r < 1e-9) continue;
      const [u, v] = octaUvOf([x / r, y / r, z / r]);
      // splat into the 2x2 bilinear texel neighbourhood
      const fx = clamp(u * size - 0.5, 0, size - 1), fy = clamp(v * size - 0.5, 0, size - 1);
      const i0 = Math.floor(fx), j0 = Math.floor(fy);
      for (let dj = 0; dj <= 1; dj++)
        for (let di = 0; di <= 1; di++) {
          const ii = Math.min(i0 + di, size - 1), jj = Math.min(j0 + dj, size - 1);
          const w = (1 - Math.abs(fx - (i0 + di))) * (1 - Math.abs(fy - (j0 + dj)));
          if (w <= 0) continue;
          const t = jj * size + ii;
          if (r > rad[t]) rad[t] = r;
          nx[t] += normals[i * 3] * w; ny[t] += normals[i * 3 + 1] * w; nz2[t] += normals[i * 3 + 2] * w;
          wsum[t] += w;
        }
    }
    maxRs[li] = maxR;
    // hole fill: texels no vertex touched inherit the neighbourhood max/mean
    // (a few passes close all gaps at 64^2 vs ~2.5k-10k verts)
    for (let pass = 0; pass < 4; pass++) {
      let holes = 0;
      for (let j = 0; j < size; j++)
        for (let i = 0; i < size; i++) {
          const t = j * size + i;
          if (wsum[t] > 0) continue;
          holes++;
          let rMax = 0, sx = 0, sy = 0, sz = 0, sw = 0;
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              const ii = i + di, jj = j + dj;
              if (ii < 0 || jj < 0 || ii >= size || jj >= size) continue;
              const t2 = jj * size + ii;
              if (wsum[t2] <= 0) continue;
              if (rad[t2] > rMax) rMax = rad[t2];
              sx += nx[t2]; sy += ny[t2]; sz += nz2[t2]; sw += wsum[t2];
            }
          if (sw > 0) {
            rad[t] = rMax; nx[t] = sx; ny[t] = sy; nz2[t] = sz; wsum[t] = -sw; // mark filled this pass
          }
        }
      for (let t = 0; t < size * size; t++) if (wsum[t] < 0) wsum[t] = -wsum[t];
      if (!holes) break;
    }
    const base = li * size * size * 4;
    for (let t = 0; t < size * size; t++) {
      const n = nrm3([nx[t], ny[t], nz2[t] || 1e-9]);
      const o = base + t * 4;
      data[o] = Math.round((n[0] * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((n[1] * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((n[2] * 0.5 + 0.5) * 255);
      data[o + 3] = Math.round(clamp(maxR > 0 ? rad[t] / maxR : 0, 0, 1) * 255);
    }
  }
  return { data, size, layers, maxR: maxRs };
}
