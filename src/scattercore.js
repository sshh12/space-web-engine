// scattercore.js — CONCEPT §7: "a rock is a fact of the planet". Debris placement is
// a pure function of (body, global lattice cell, baked rock-density field) — keyed on
// a fixed lattice at a *declared* level, never on the tile that happens to render it.
// Existence/size/orientation/burial come from the lattice hash thresholded against
// the density field read at the declared field level (so they are LOD-independent);
// only the final height snap uses the rendering tile's raster (best available).
//
// Round 5 (ground plan layer 4): each rock carries an archetype drawn from the
// recipe's G3 population mix, a shape variant, a settle tilt, and big rocks shed a
// deterministic cluster of fragments (boulder trains / cobble fans keyed off the
// parent's hash — real debris is hierarchical and social). Three-free, Node-testable.

import { TILE_RES, RASTER, I, sampleTileHeight } from './bakecore.js';
import { faceUvToDir, rand01, hashi, clamp, smoothstep, halfToFloat, vnoise3 } from './mathx.js';
import { ARCHETYPES, VARIANTS } from './rockcore.js';
import { FORM_ARCHETYPES, FORM_VARIANTS } from './meshcore.js';

// fields live in the half-float field atlas (per the bakecore ATLAS manifest)
// on the main thread; in the worker/tests they are full float fields — sample
// whichever the tile carries. name/(layer,ch) address the same channel twice.
// layer defaults to 0 (round 14: formations key on mare/uplift etc — the
// atlas is layer-major, element = layer*N*4 + cell*4 + ch).
export function sampleField(tile, fu, fv, name, ch, layer = 0) {
  const gx = clamp(fu, 0, 1) * TILE_RES, gy = clamp(fv, 0, 1) * TILE_RES;
  const i = Math.min(Math.floor(gx), TILE_RES - 1), j = Math.min(Math.floor(gy), TILE_RES - 1);
  const fx = gx - i, fy = gy - j;
  const N4 = RASTER * RASTER * 4 * layer;
  const g = tile.fields
    ? (ii, jj) => tile.fields[name][I(ii, jj)]
    : (ii, jj) => halfToFloat(tile.atlas[N4 + I(ii, jj) * 4 + ch]);
  const a = g(i, j) * (1 - fx) + g(i + 1, j) * fx;
  const b = g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx;
  return a * (1 - fy) + b * fy;
}
const sampleDensity = (tile, fu, fv) => sampleField(tile, fu, fv, 'rockDensity', 3);

// ground plan L2 (meso-displacement): the height recurrence continued below the
// deepest raster as two position-pure octaves (~4 m and ~1 m value noise),
// amplitude driven by the material fields (rock exposure / debris density —
// rubble mounds and bedrock undulation where the ground is rocky, near-flat
// fines elsewhere). CPU-evaluated into deep tile MESHES (tiles.js) so every
// consumer — shadow depth pass, skirts, geomorph — inherits one geometry; the
// fragment shader re-evaluates the same function (COMMON vnoise, same lattice)
// for the L3 dust-fill and crevice looks, and rock placement adds it to the
// height snap here so rocks sit ON the displaced ground, not the raster.
// Onset ramps in over levels 15-17 (§4: a band blends in, never switches on).
export function mesoRamp(level) {
  return clamp((level - 14) / 3, 0, 1);
}
export function mesoDisp(wx, wy, wz, rockAmp, level) {
  return mesoDispRamped(wx, wy, wz, rockAmp, mesoRamp(level));
}
// round 17: figure bodies key the onset ramp on PHYSICAL cell size (a 10 km
// body never reaches absolute level 14), so the ramp arrives precomputed;
// legacy callers go through mesoDisp(level) — identical arithmetic.
export function mesoDispRamped(wx, wy, wz, rockAmp, ramp) {
  if (ramp <= 0) return 0;
  return ramp * ((0.05 + 0.3 * rockAmp) * vnoise3(wx * 0.25, wy * 0.25, wz * 0.25, 1024, 501)
    + (0.02 + 0.12 * rockAmp) * vnoise3(wx, wy, wz, 4096, 503));
}

// archetype from the recipe's population mix (G3: populations have provenance) —
// cumulative thresholds precomputed once per call site
function mixTable(rk) {
  const mix = rk.mix ?? { clast: 1 };
  const w = ARCHETYPES.map((n) => mix[n] ?? 0);
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return w.map((x) => (acc += x / tot));
}

// enumerate the rocks owned by `tile`, reading density from `fieldTile` (the tile at
// the recipe's declared field level containing this tile — may equal `tile`).
// sizeFloor: a REPRESENTATION choice by the rendering tile (§7 — distance
// chooses representation, never membership): coarse tiles instance only their
// large rocks. Pure per rock (size is hash-derived before the cut), so any
// two tiles agree on which rocks exist; they differ only in which they draw.
export function listRocks(tile, fieldTile, body, cap = 6000, sizeFloor = 0, opts = {}) {
  const rk = body.rocks;
  if (!rk) return [];
  const { face, level, x, y } = tile;
  const L = rk.latticeLevel, seed = rk.seed | 0;
  const DL = TILE_RES << L;              // global lattice resolution on this face
  const D = 1 << level;
  // round 14 (impostor rung, panel K5/H1): a tile BELOW the declared field
  // level (the L14 band) resolves fields + height per EMITTED ROCK from the
  // L15 child that will own that rock when it splits — existence decisions,
  // clamping, height snap and meso level are then BIT-EXACT with the mesh
  // successor's own build: the rung handoff swaps sampling strategy, never
  // facts, and the vertical anchor cannot step. opts.fieldFor(u,v) -> child.
  const fieldFor = opts.fieldFor ?? null;
  const fLevel = fieldFor ? opts.fieldLevel : fieldTile.level;
  const DF = 1 << fLevel;
  const ftOf = fieldFor ?? (() => fieldTile);
  const u0 = x / D, v0 = y / D, span = 1 / D;
  const faceArc = (Math.PI / 2) * body.R; // nominal metres per face-uv unit
  // cluster children land up to ~2.4 parent-sizes from their parent's cell, so the
  // candidate scan needs that reach in lattice cells (a child is owned by the tile
  // whose uv box contains the CHILD; its parent may sit in a neighbouring tile)
  const childReach = rk.clusterK ? (2.4 * rk.sizeMax * DL) / faceArc : 0; // uv cells
  const margin = 1 + Math.ceil(childReach);
  const g0 = Math.floor(u0 * DL) - margin, g1 = Math.ceil((u0 + span) * DL) + margin;
  const h0 = Math.floor(v0 * DL) - margin, h1 = Math.ceil((v0 + span) * DL) + margin;
  const cum = mixTable(rk);
  const clusterMin = rk.sizeMin + 0.55 * (rk.sizeMax - rk.sizeMin);
  const own = (u, v) => u >= u0 && u < u0 + span && v >= v0 && v < v0 + span;
  const out = [];
  const dirT = [0, 0, 0];
  const push = (u, v, r) => {
    r.u = u; r.v = v; r.face = face;
    const ft = ftOf(u, v);
    const hostTile = fieldFor ? ft : tile;
    const hD = 1 << hostTile.level;
    r.h = sampleTileHeight(hostTile, u * hD - hostTile.x, v * hD - hostTile.y); // best-available snap
    // ground plan L2: the rendering tile's mesh carries the meso-displacement
    // band — anchor the rock to the DISPLACED ground or it floats on the raster
    // (same "best available" role as the height snap; existence stays lattice-pure)
    const fu = u * DF - ft.x, fv = v * DF - ft.y;
    const rAmp = Math.max(sampleField(ft, fu, fv, 'rock', 0), sampleDensity(ft, fu, fv));
    faceUvToDir(face, u, v, dirT);
    const rr = body.R + r.h;
    r.h += mesoDisp(dirT[0] * rr, dirT[1] * rr, dirT[2] * rr, rAmp, fieldFor ? fLevel : level);
    out.push(r);
  };
  for (let gj = h0; gj <= h1 && out.length < cap; gj++)
    for (let gi = g0; gi <= g1 && out.length < cap; gi++) {
      // tail fast path: with a size floor, the (keyed, order-free) size draw
      // culls ~95% of cells before the 4-tap density sample — decisions are
      // identical (independent keyed hashes), only the evaluation order moves
      let size = 0;
      if (sizeFloor > 0) {
        size = rk.sizeMin + (rk.sizeMax - rk.sizeMin) * Math.pow(rand01(gi, gj, face, seed + 3), 3);
        if (size < sizeFloor) continue;
      }
      const r0 = rand01(gi, gj, face, seed);
      const u = (gi + 0.2 + 0.6 * rand01(gi, gj, face, seed + 1)) / DL;
      const v = (gj + 0.2 + 0.6 * rand01(gi, gj, face, seed + 2)) / DL;
      // density at the DECLARED level: same answer whichever tile renders (§7).
      // Margin cells outside the fieldTile clamp to its edge — the shared edge
      // columns are bit-exact across neighbours, so the decision stays stable.
      // With fieldFor, the context is the child owning the PARENT's uv — the
      // same clamp that child's own mesh build applies to this margin cell.
      // denFloor (G3): the ambient lag population — impact gardening litters
      // every airless plain with clasts (Apollo pans), deflation lag armors
      // aeolian surfaces; a pure per-body constant, so §7 holds trivially
      const ftc = ftOf(u, v);
      const density = Math.max(sampleDensity(ftc, u * DF - ftc.x, v * DF - ftc.y), rk.denFloor ?? 0);
      if (r0 >= density * rk.perCell) continue;
      if (!(sizeFloor > 0)) size = rk.sizeMin + (rk.sizeMax - rk.sizeMin) * Math.pow(rand01(gi, gj, face, seed + 3), 3);
      if (size < sizeFloor) continue;
      const rA = rand01(gi, gj, face, seed + 9);
      let ai = 0;
      while (ai < cum.length - 1 && rA >= cum[ai]) ai++;
      // settle tilt (G5-ish packing): plates and blocks come to rest flatter
      const tiltMax = ai >= 2 ? 0.18 : 0.35;
      const parent = {
        size, ai, vi: hashi(gi, gj, face, seed + 10) % VARIANTS,
        aSeed: rand01(gi, gj, face, seed + 11),
        tiltA: rand01(gi, gj, face, seed + 12) * Math.PI * 2,
        tiltM: tiltMax * Math.pow(rand01(gi, gj, face, seed + 13), 2),
        burial: 0.15 + 0.35 * rand01(gi, gj, face, seed + 4),
        sx: 0.7 + 0.6 * rand01(gi, gj, face, seed + 5),
        // sy floor 0.75 (round-6 panel: floor 0.6 vs sx/sz ~1.3 made 2:1 oblate
        // "pancake" clasts that settle as discs — flat profiles are the SLAB
        // archetype's job, via its squash, not a placement scale)
        sy: 0.75 + 0.45 * rand01(gi, gj, face, seed + 6),
        sz: 0.7 + 0.6 * rand01(gi, gj, face, seed + 7),
        spin: rand01(gi, gj, face, seed + 8) * Math.PI * 2,
      };
      if (own(u, v)) push(u, v, parent);
      // cluster: big rocks shed 2-4 fragments (angular by provenance — calved
      // debris; rounded bodies shed cobbles), each a pure fn of the parent cell
      if (rk.clusterK && size > clusterMin && rand01(gi, gj, face, seed + 14) < rk.clusterK) {
        const nc = 2 + (hashi(gi, gj, face, seed + 15) % 3);
        const fragAi = (rk.rounding ?? 0.4) >= 0.55 ? 1 : 0; // cobble : clast
        for (let ci = 0; ci < nc && out.length < cap; ci++) {
          const cs = seed + 20 + ci * 8;
          const ca = rand01(gi, gj, face, cs) * Math.PI * 2;
          const cd = (size * (0.9 + 1.5 * rand01(gi, gj, face, cs + 1))) / faceArc; // uv offset
          const cu = u + cd * Math.cos(ca), cv = v + cd * Math.sin(ca);
          const csz = size * (0.16 + 0.22 * rand01(gi, gj, face, cs + 2));
          if (!own(cu, cv) || csz < sizeFloor) continue;
          // resolver path: the child's OWNER decides its existence — re-run
          // the parent test in the owner's clamp context when it differs (the
          // owner's own mesh build reads the parent's density clamped to ITS
          // box; anything else pops a boundary cluster child at the handoff)
          if (fieldFor) {
            const fo = ftOf(cu, cv);
            if (fo !== ftc) {
              const d2 = Math.max(sampleDensity(fo, u * DF - fo.x, v * DF - fo.y), rk.denFloor ?? 0);
              if (r0 >= d2 * rk.perCell) continue;
            }
          }
          push(cu, cv, {
            size: csz,
            ai: fragAi, vi: hashi(gi, gj, face, cs + 3) % VARIANTS,
            aSeed: rand01(gi, gj, face, cs + 4),
            tiltA: rand01(gi, gj, face, cs + 5) * Math.PI * 2,
            tiltM: 0.5 * rand01(gi, gj, face, cs + 6),
            burial: 0.25 + 0.35 * rand01(gi, gj, face, cs + 7),
            sx: 0.75 + 0.5 * rand01(gi, gj, face, cs + 8),
            sy: 0.7 + 0.4 * rand01(gi, gj, face, cs + 9),
            sz: 0.75 + 0.5 * rand01(gi, gj, face, cs + 10),
            spin: rand01(gi, gj, face, cs + 11) * Math.PI * 2,
          });
        }
      }
    }
  return out;
}

// -> { count, buckets: [{ ai, vi, count, matrices }] } — column-major 4x4s grouped
// by (archetype, variant) so each bucket instances one shared geometry; positions
// relative to tile.center (which the caller manages in doubles). Per-instance seed
// and burial ride the matrix bottom row (m[3], m[7]) — those elements never enter
// (M·v).xyz or mat3(M) in the shaders, so the affine transform is untouched.
// meshMeta = rockcore's meta[ai][vi] = {yMin, yExt}; placement anchors the mesh
// BOTTOM to the terrain (v0 assumed a centred sphere, which floated the slabs).
export function placeRocks(tile, fieldTile, body, meshMeta = null, cap = 6000, sizeFloor = 0, opts = {}) {
  const rocks = listRocks(tile, fieldTile, body, cap, sizeFloor, opts);
  const { face, level, x, y } = tile;
  const D = 1 << level;
  const dir = [0, 0, 0];
  const center = tile.center ?? (() => {
    const cd = faceUvToDir(face, (x + 0.5) / D, (y + 0.5) / D);
    return [cd[0] * body.R, cd[1] * body.R, cd[2] * body.R];
  })();

  const groups = new Map(); // ai*VARIANTS+vi -> rock list
  for (const o of rocks) {
    const k = o.ai * VARIANTS + o.vi;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(o);
  }
  const buckets = [];
  for (const [k, list] of groups) {
    const ai = Math.floor(k / VARIANTS), vi = k % VARIANTS;
    const mi = meshMeta?.[ai]?.[vi];
    const yMin = mi ? mi.yMin : -0.5, yExt = mi ? mi.yExt : 1;
    const matrices = new Float32Array(list.length * 16);
    // instances sorted LARGEST-FIRST: the display loop shrinks the draw range
    // (im.count) to the prefix that can still resolve at the tile's distance —
    // an InstancedMesh vertex-shades every submitted instance whether or not
    // the fold later degenerates it, and that vertex work was the measured
    // software-GL cost (Phase M scatter hand-down, first-probe A/B). The
    // per-instance jittered fold still owns everything the prefix admits.
    list.sort((a, b) => (b.size * b.sx) - (a.size * a.sx));
    const sizes = new Float32Array(list.length);
    for (let n = 0; n < list.length; n++) sizes[n] = list[n].size * list[n].sx;
    for (let n = 0; n < list.length; n++) {
      const o = list[n];
      faceUvToDir(o.face, o.u, o.v, dir);
      const up = [dir[0], dir[1], dir[2]];
      const ax = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const b0 = norm(cross(ax, up));
      const b1 = cross(up, b0);
      // settle tilt: lean the local up by tiltM toward azimuth tiltA
      const st = Math.sin(o.tiltM), ct = Math.cos(o.tiltM);
      const ca = Math.cos(o.tiltA), sa = Math.sin(o.tiltA);
      const upT = norm([
        up[0] * ct + (b0[0] * ca + b1[0] * sa) * st,
        up[1] * ct + (b0[1] * ca + b1[1] * sa) * st,
        up[2] * ct + (b0[2] * ca + b1[2] * sa) * st,
      ]);
      const t0 = norm(cross(b1, upT));
      const t1 = cross(upT, t0);
      const c = Math.cos(o.spin), s = Math.sin(o.spin);
      const e0 = [t0[0] * c + t1[0] * s, t0[1] * c + t1[1] * s, t0[2] * c + t1[2] * s];
      const e1 = [t1[0] * c - t0[0] * s, t1[1] * c - t0[1] * s, t1[2] * c - t0[2] * s];
      const S = o.size;
      const hS = S * o.sy; // vertical scale in metres
      // anchor: rock bottom sits at ground minus the buried fraction of its height
      const r = body.R + o.h - yMin * hS - o.burial * yExt * hS;
      const m = matrices, b = n * 16;
      // column order (e0, upT, -e1) keeps det > 0: a left-handed basis would flip
      // triangle winding and render the rocks inside-out (review finding)
      m[b + 0] = e0[0] * S * o.sx; m[b + 1] = e0[1] * S * o.sx; m[b + 2] = e0[2] * S * o.sx;
      m[b + 3] = o.aSeed;   // per-instance seed (shade/mottle/fade jitter)
      m[b + 4] = upT[0] * hS; m[b + 5] = upT[1] * hS; m[b + 6] = upT[2] * hS;
      m[b + 7] = o.burial;  // per-instance burial (dust patina weight)
      m[b + 8] = -e1[0] * S * o.sz; m[b + 9] = -e1[1] * S * o.sz; m[b + 10] = -e1[2] * S * o.sz;
      // tile-local uv packed into the third spare bottom-row slot (11 bits each,
      // exact in the f32 mantissa): the rock fragment shader samples its OWNER
      // tile's field atlas — horizon-field shadows and view factor — at this uv,
      // so rocks and the ground they sit on read ONE shadow answer (register row:
      // boulders stayed lit inside baked terrain shadows)
      const tu = Math.floor(clamp((o.u - x / D) * D, 0, 1) * 2047);
      const tv = Math.floor(clamp((o.v - y / D) * D, 0, 1) * 2047);
      m[b + 11] = tu * 2048 + tv;
      m[b + 12] = dir[0] * r - center[0]; m[b + 13] = dir[1] * r - center[1]; m[b + 14] = dir[2] * r - center[2]; m[b + 15] = 1;
    }
    buckets.push({ ai, vi, count: list.length, matrices, sizes });
  }
  return { count: rocks.length, buckets };
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a) {
  const il = 1 / Math.hypot(a[0], a[1], a[2]);
  a[0] *= il; a[1] *= il; a[2] *= il;
  return a;
}

// ---------------------------------------------------------------------------
// round 14 — formation placement (ground plan layer 5, "beyond the
// heightfield"). Same §7 discipline as rocks, one scale up: existence from
// the lattice hash at formations.latticeLevel, thresholded against BAKED
// fields at the declared formations.fieldLevel (an ancestor-chain level —
// always resident). The caprock gate is the baked `rock` riser-exposure
// procStrata writes at cap time (panel K3: attached to the shipped height by
// construction — never a re-derived bed predicate). Orientation is PLUMB
// (hash spin only): bedding stays horizontal, and the axis is frozen at the
// anchor by construction (the ê⊥dir class cannot occur).

// field-name -> [layer, channel] in the packed atlas (bakecore ATLAS manifest)
const FIELD_ADDR = {
  rock: [0, 0], ice: [0, 1], ao: [0, 2], rockDensity: [0, 3],
  mare: [3, 0], veg: [3, 1], hgt: [3, 2], flow: [3, 3],
  fresh: [4, 0], moist: [4, 1], uplift: [4, 2], fines: [4, 3],
};
function sampleNamed(tile, fu, fv, name) {
  const [layer, ch] = FIELD_ADDR[name];
  return sampleField(tile, fu, fv, name, ch, layer);
}

// round 15 (residue: formation build-wave prefilter): the closed-form
// EXISTENCE half of listFormations — does ANY lattice cell within this
// tile's reach (incl. the calve margin) pass the r0 < perCell hash test?
// Pure fn of (tile key, recipe): no fields, no heights — so the display
// loop can run it at ENQUEUE time and the formation wave skips the vast
// majority of tiles whose lattice scan would be empty. Scheduling only:
// the test is exactly listFormations' first-line reject, so a skipped tile
// builds to the identical "built, empty" state.
export function anyFormationCandidate(tile, body) {
  const fm = body.formations;
  if (!fm) return false;
  const { face, level, x, y } = tile;
  const L = fm.latticeLevel ?? 12, seed = fm.seed | 0;
  const DL = TILE_RES << L, D = 1 << level;
  const u0 = x / D, v0 = y / D, span = 1 / D;
  const faceArc = (Math.PI / 2) * body.R;
  const calveReach = fm.calveK ? (1.6 * fm.sizeMax * DL) / faceArc : 0;
  const margin = 1 + Math.ceil(calveReach);
  const g0 = Math.floor(u0 * DL) - margin, g1 = Math.ceil((u0 + span) * DL) + margin;
  const h0 = Math.floor(v0 * DL) - margin, h1 = Math.ceil((v0 + span) * DL) + margin;
  const pc = fm.perCell ?? 0.05;
  for (let gj = h0; gj <= h1; gj++)
    for (let gi = g0; gi <= g1; gi++)
      if (rand01(gi, gj, face, seed) < pc) return true;
  return false;
}

// enumerate the formations owned by `tile` + the calved blocks they shed
// (G3-iv: ledge-calved debris traces to its source formation). fmMeta =
// meshcore's makeFormationSet().meta (footings + endDrop drive the arch's
// two-footing burial law — panel H2 — evaluated on the DECLARED field tile so
// every level agrees). Returns { forms, blocks }.
export function listFormations(tile, fieldTile, body, fmMeta, cap = 512, sizeFloor = 0, opts = {}) {
  const fm = body.formations;
  if (!fm) return { forms: [], blocks: [] };
  const { face, level, x, y } = tile;
  const L = fm.latticeLevel ?? 12, seed = fm.seed | 0;
  const DL = TILE_RES << L;
  const D = 1 << level;
  // fields ALWAYS at the declared level (every rung reads the same ancestor —
  // formations' fieldLevel sits ABOVE the impostor band, unlike rocks');
  // opts.snapFor/snapLevel redirect only the HEIGHT SNAP to the mesh rung's
  // raster so the impostor->mesh swap is positionally exact (K5)
  const DF = 1 << fieldTile.level;
  const snapFor = opts.snapFor ?? null;
  const u0 = x / D, v0 = y / D, span = 1 / D;
  const faceArc = (Math.PI / 2) * body.R;
  const calveReach = fm.calveK ? (1.6 * fm.sizeMax * DL) / faceArc : 0;
  const margin = 1 + Math.ceil(calveReach);
  const g0 = Math.floor(u0 * DL) - margin, g1 = Math.ceil((u0 + span) * DL) + margin;
  const h0 = Math.floor(v0 * DL) - margin, h1 = Math.ceil((v0 + span) * DL) + margin;
  // archetype cumulative mix over FORM_ARCHETYPES
  const mixW = FORM_ARCHETYPES.map((n) => (fm.mix ?? { hoodoo: 1 })[n] ?? 0);
  const mtot = mixW.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const cum = mixW.map((w) => (acc += w / mtot));
  const own = (u, v) => u >= u0 && u < u0 + span && v >= v0 && v < v0 + span;
  const forms = [], blocks = [];
  const dirT = [0, 0, 0];
  const snapH = (u, v) => {
    const host = snapFor ? snapFor(u, v) : tile;
    const hD = 1 << host.level;
    return sampleTileHeight(host, u * hD - host.x, v * hD - host.y);
  };
  const eCell = 1 / TILE_RES; // one field-raster cell in tile-local uv
  const cellM = (faceArc / DF) * eCell; // metres per field cell
  for (let gj = h0; gj <= h1 && forms.length < cap; gj++)
    for (let gi = g0; gi <= g1 && forms.length < cap; gi++) {
      const r0 = rand01(gi, gj, face, seed);
      if (r0 >= (fm.perCell ?? 0.05)) continue; // cheap upper bound (w <= 1)
      const u = (gi + 0.25 + 0.5 * rand01(gi, gj, face, seed + 1)) / DL;
      const v = (gj + 0.25 + 0.5 * rand01(gi, gj, face, seed + 2)) / DL;
      const ft = fieldTile;
      const fu = u * DF - ft.x, fv = v * DF - ft.y;
      // the placement weight: baked riser exposure (the strata cap's shipped
      // signature) x recipe gate field x slope window x not-ice
      const riser = smoothstep(fm.rockLo ?? 0.18, fm.rockHi ?? 0.45, sampleNamed(ft, fu, fv, 'rock'));
      const gateV = fm.gate ? smoothstep(fm.gate.lo, fm.gate.hi, sampleNamed(ft, fu, fv, fm.gate.field)) : 1;
      const hC = sampleTileHeight(ft, clamp(fu, 0, 1), clamp(fv, 0, 1));
      const hU = sampleTileHeight(ft, clamp(fu + eCell, 0, 1), clamp(fv, 0, 1));
      const hV = sampleTileHeight(ft, clamp(fu, 0, 1), clamp(fv + eCell, 0, 1));
      const slope = Math.hypot(hU - hC, hV - hC) / cellM;
      const sW = smoothstep(fm.slopeLo ?? 0.03, (fm.slopeLo ?? 0.03) * 2 + 0.02, slope)
        * (1 - smoothstep(fm.slopeHi ?? 0.45, (fm.slopeHi ?? 0.45) * 1.5, slope));
      const ice = sampleNamed(ft, fu, fv, 'ice');
      const w = riser * gateV * sW * clamp(1 - 2 * ice, 0, 1);
      if (r0 >= w * (fm.perCell ?? 0.05)) continue;
      const size = fm.sizeMin + (fm.sizeMax - fm.sizeMin) * Math.pow(rand01(gi, gj, face, seed + 3), 2);
      const rA = rand01(gi, gj, face, seed + 4);
      let ai = 0;
      while (ai < cum.length - 1 && rA >= cum[ai]) ai++;
      const vi = hashi(gi, gj, face, seed + 5) % FORM_VARIANTS;
      const spin = rand01(gi, gj, face, seed + 6) * Math.PI * 2;
      if (size < sizeFloor) continue;
      // arch two-footing law (H2): both footings must sit under local grade —
      // sampled at the DECLARED field level so every renderer agrees
      if (FORM_ARCHETYPES[ai] === 'arch' && fmMeta) {
        const mi = fmMeta[ai][vi];
        const cs2 = Math.cos(spin), sn2 = Math.sin(spin);
        let dhMax = 0;
        for (const [fx, fz] of mi.footXZ) {
          const ox = (fx * cs2 - fz * sn2) * size, oz = (fx * sn2 + fz * cs2) * size;
          const fu2 = clamp(fu + (ox / faceArc) * DF, 0, 1), fv2 = clamp(fv + (oz / faceArc) * DF, 0, 1);
          dhMax = Math.max(dhMax, Math.abs(sampleTileHeight(ft, fu2, fv2) - hC));
        }
        if (dhMax > 0.6 * mi.endDrop * size) continue; // slope exceeds the burial budget
      }
      const f = {
        size, ai, vi, spin,
        aSeed: rand01(gi, gj, face, seed + 7),
        // slope-aware burial (panel: on a slope the downhill base pedestal
        // surfaces as a straight-sided bar — bury the grade differential too)
        burial: 0.06 + 0.08 * rand01(gi, gj, face, seed + 8) + Math.min(0.3, slope * 0.5),
        sx: 0.9 + 0.2 * rand01(gi, gj, face, seed + 9),
        sz: 0.9 + 0.2 * rand01(gi, gj, face, seed + 10),
      };
      if (own(u, v)) {
        f.u = u; f.v = v; f.face = face;
        f.h = snapH(u, v);
        faceUvToDir(face, u, v, dirT);
        const rr = body.R + f.h;
        f.h += mesoDisp(dirT[0] * rr, dirT[1] * rr, dirT[2] * rr, 1, opts.snapLevel ?? level);
        forms.push(f);
      }
      // calved blocks (G3-iv): the formation sheds large rock-archetype blocks
      // around its base — drawn by the ROCK path (they ARE rocks), placed by
      // the formation lattice so the debris traces to its source
      if (fm.calveK && rand01(gi, gj, face, seed + 11) < fm.calveK) {
        const nc = 2 + (hashi(gi, gj, face, seed + 12) % 3);
        for (let ci = 0; ci < nc; ci++) {
          const cs = seed + 16 + ci * 8;
          const caA = rand01(gi, gj, face, cs) * Math.PI * 2;
          const cd = (size * (0.7 + 0.9 * rand01(gi, gj, face, cs + 1))) / faceArc;
          const cu = u + cd * Math.cos(caA), cv = v + cd * Math.sin(caA);
          const csz = size * (0.08 + 0.08 * rand01(gi, gj, face, cs + 2));
          if (!own(cu, cv)) continue;
          const bf = {
            size: csz,
            ai: 3, vi: hashi(gi, gj, face, cs + 3) % VARIANTS, // 'block'
            aSeed: rand01(gi, gj, face, cs + 4),
            tiltA: rand01(gi, gj, face, cs + 5) * Math.PI * 2,
            tiltM: 0.22 * rand01(gi, gj, face, cs + 6),
            burial: 0.2 + 0.3 * rand01(gi, gj, face, cs + 7),
            sx: 0.8 + 0.4 * rand01(gi, gj, face, cs + 8),
            sy: 0.75 + 0.4 * rand01(gi, gj, face, cs + 9),
            sz: 0.8 + 0.4 * rand01(gi, gj, face, cs + 10),
            spin: rand01(gi, gj, face, cs + 11) * Math.PI * 2,
            u: cu, v: cv, face,
          };
          bf.h = snapH(cu, cv);
          faceUvToDir(face, cu, cv, dirT);
          const rr2 = body.R + bf.h;
          bf.h += mesoDisp(dirT[0] * rr2, dirT[1] * rr2, dirT[2] * rr2, 1, opts.snapLevel ?? level);
          blocks.push(bf);
        }
      }
    }
  return { forms, blocks };
}

// formation instance matrices: PLUMB basis (local up, spin only), bottom-
// anchored with burial, same bottom-row smuggling as rocks (seed, burial,
// packed owner-tile uv). Returns { count, buckets, rockBuckets } — the
// rockBuckets carry the calved blocks in placeRocks' bucket format.
export function placeFormations(tile, fieldTile, body, fmMeta, rockMeta, cap = 512, sizeFloor = 0, opts = {}) {
  const { forms, blocks } = listFormations(tile, fieldTile, body, fmMeta, cap, sizeFloor, opts);
  const { face, level, x, y } = tile;
  const D = 1 << level;
  const dir = [0, 0, 0];
  const center = tile.center ?? (() => {
    const cd = faceUvToDir(face, (x + 0.5) / D, (y + 0.5) / D);
    return [cd[0] * body.R, cd[1] * body.R, cd[2] * body.R];
  })();
  const buildBuckets = (list, meta, plumb) => {
    const groups = new Map();
    const NV = plumb ? FORM_VARIANTS : VARIANTS;
    for (const o of list) {
      const k = o.ai * NV + o.vi;
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(o);
    }
    const buckets = [];
    for (const [k, ls] of groups) {
      const ai = Math.floor(k / NV), vi = k % NV;
      const mi = meta?.[ai]?.[vi];
      const yMin = mi ? mi.yMin : -0.5, yExt = mi ? mi.yExt : 1;
      ls.sort((a, b) => (b.size * b.sx) - (a.size * a.sx));
      const sizes = new Float32Array(ls.length);
      for (let n = 0; n < ls.length; n++) sizes[n] = ls[n].size * ls[n].sx;
      const matrices = new Float32Array(ls.length * 16);
      for (let n = 0; n < ls.length; n++) {
        const o = ls[n];
        faceUvToDir(o.face, o.u, o.v, dir);
        const up = [dir[0], dir[1], dir[2]];
        const ax = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const b0 = norm(cross(ax, up));
        const b1 = cross(up, b0);
        let upT = up, t0 = b0, t1 = b1;
        if (!plumb) {
          const st = Math.sin(o.tiltM), ct = Math.cos(o.tiltM);
          const ca = Math.cos(o.tiltA), sa = Math.sin(o.tiltA);
          upT = norm([
            up[0] * ct + (b0[0] * ca + b1[0] * sa) * st,
            up[1] * ct + (b0[1] * ca + b1[1] * sa) * st,
            up[2] * ct + (b0[2] * ca + b1[2] * sa) * st,
          ]);
          t0 = norm(cross(b1, upT));
          t1 = cross(upT, t0);
        }
        const c = Math.cos(o.spin), s = Math.sin(o.spin);
        const e0 = [t0[0] * c + t1[0] * s, t0[1] * c + t1[1] * s, t0[2] * c + t1[2] * s];
        const e1 = [t1[0] * c - t0[0] * s, t1[1] * c - t0[1] * s, t1[2] * c - t0[2] * s];
        const S = o.size;
        const hS = S * (o.sy ?? 1);
        const r = body.R + o.h - yMin * hS - o.burial * yExt * hS;
        const m = matrices, b = n * 16;
        m[b + 0] = e0[0] * S * o.sx; m[b + 1] = e0[1] * S * o.sx; m[b + 2] = e0[2] * S * o.sx;
        m[b + 3] = o.aSeed;
        m[b + 4] = upT[0] * hS; m[b + 5] = upT[1] * hS; m[b + 6] = upT[2] * hS;
        m[b + 7] = o.burial;
        m[b + 8] = -e1[0] * S * o.sz; m[b + 9] = -e1[1] * S * o.sz; m[b + 10] = -e1[2] * S * o.sz;
        const tu = Math.floor(clamp((o.u - x / D) * D, 0, 1) * 2047);
        const tv = Math.floor(clamp((o.v - y / D) * D, 0, 1) * 2047);
        m[b + 11] = tu * 2048 + tv;
        m[b + 12] = dir[0] * r - center[0]; m[b + 13] = dir[1] * r - center[1]; m[b + 14] = dir[2] * r - center[2]; m[b + 15] = 1;
      }
      buckets.push({ ai, vi, count: ls.length, matrices, sizes });
    }
    return buckets;
  };
  return {
    count: forms.length + blocks.length,
    buckets: buildBuckets(forms, fmMeta, true),
    rockBuckets: buildBuckets(blocks, rockMeta, false),
  };
}
