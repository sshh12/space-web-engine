// bakecore.js — CONCEPT §2–§5: every quadtree node owns a fixed-resolution raster of
// surface state (height + field weights) covering its uv box plus a ghost-cell halo.
//   tile(level n) = upsample(parent) + processes whose band first resolves at n
// A tile is a pure deterministic function of (body, face, level, x, y): no camera, no
// clock, no Math.random. Runs identically in the Web Worker and in Node tests.
//
// Raster layout: 65x65 interior corner samples + HALO=6 ghost cells per side = 77x77.
// Index (i,j) with i,j in [-6..70]; I(i,j) = (j+HALO)*RASTER + (i+HALO).
// Validity budget (see DESIGN.md): height stays valid to halo 4 (cubic upsample support
// + 2 thermal iterations), derived fields to halo 3 (bilinear upsample support).

import {
  faceUvToDir, dirToFaceUv, edgeMask, rand01, noise3, fbm3, catmullRom,
  clamp, smoothstep, lerp, latOf,
} from './mathx.js';
// round 17 (Phase 5 figure generality, CONCEPT §11): the recipe may declare the
// reference shape the rasters displace; the sphere is merely the common case.
// Legacy bodies carry no `figure` datum and take every pre-round-17 code path
// verbatim (the byte-identity gate) — the fig branches below are strictly
// additive and keyed on ctx.fig.
import { figOf, figS, figUp, figAlt, figRadial, figMapDir } from './figure.js';

export const TILE_RES = 64;      // quads per tile side
export const CORNERS = 65;       // corner samples per side
export const HALO = 6;           // ghost cells per side
export const RASTER = CORNERS + 2 * HALO; // 77
export const I = (i, j) => (j + HALO) * RASTER + (i + HALO);

const N = RASTER * RASTER;
// hor0..7: sin(max elevation angle to terrain) per 45° azimuth octant, in the face
// grid frame — the §4/§10 horizon field (cast shadows + terrain-bounce view factor)
// veg/moist/flow: Phase 2 [global]-derived fields (biome geography, flow routing)
// fresh: G6 freshness veneer (Phase 2 crater overhaul) — young-surface immaturity
// (ejecta rays, fresh interiors); the SIGN of its albedo consequence lives in the
// recipe palette (Luna fresh=brighter rays, Rubra fresh=darker dust-free rock)
// fines: G5 catena (round 8) — curvature-accreted fine-material supply (hollows
// accumulate, crests shed); the G4 sand-routing look's macro supply input
// windX/Y/Z: the [global] wind vector in body-fixed CARTESIAN components
// (round 12) — an (east,north) encoding would inherit the tangent-frame pole
// flip at |lat|~82°, where Tellus sastrugi live; Cartesian channels bilinear-
// interpolate cleanly and consumers tangentialize + gate on magnitude (the
// hairy-ball calm points are physical). windExpo: signed windward(+)/lee(−)
// exposure — the directional slope of the coarse surface along the wind;
// province-scale scour/mantling and crater streaks derive from it.
// stress: the dominant principal value of the closed-form tectonic stress
// (round 12; + extension, − compression). Magnitude+sign only — orientation
// is π-periodic and is re-derived closed-form by its consumers.
// youth: the §4 age/maturity context field, ZERO-DEFAULT = ancient
// (0 = ancient, 1 = just resurfaced) so writers are sparse resurfacing
// events; G6/space-weathering and the consequence-chain albedo read it.
const FIELDS = ['uplift', 'rock', 'ice', 'ao', 'rockDensity', 'mare',
  'veg', 'moist', 'flow', 'fresh', 'fines',
  'windX', 'windY', 'windZ', 'windExpo', 'stress', 'youth',
  'hor0', 'hor1', 'hor2', 'hor3', 'hor4', 'hor5', 'hor6', 'hor7',
  // round 18 (Phase 5 cryo pack): two bright/dark cryo albedo fields riding the
  // ATLAS L6 spares. Zero for every legacy body ⇒ their packed atlas bytes are
  // unchanged (floatToHalf(+0)=0x0000 = the old null-pad) and F6.zw read exactly
  // 0.0 ⇒ the shader's mix(albedo, uColLinea/Tholin, 0)=albedo byte-identical.
  'lineaAlb', 'tholinAlb'];

// GPU field atlas manifest (ROADMAP_V2 Phase 2 entry checkpoint): the ONE
// declaration of which field lands in which (layer, channel) of the RGBA16F
// array texture. The worker packs by it, the shaders index by it, and JS-side
// samplers (scattercore) decode by it. 'hgt' is the height raster itself
// (per-pixel bathymetry for the ocean — the checkerboard defect's fix).
export const ATLAS = [
  ['rock', 'ice', 'ao', 'rockDensity'],
  ['hor0', 'hor1', 'hor2', 'hor3'],
  ['hor4', 'hor5', 'hor6', 'hor7'],
  ['mare', 'veg', 'hgt', 'flow'],
  // L4: fresh (G6 freshness — crater rays / young surfaces); moist + uplift for
  // ground-law consumers; fines = G5 catena supply (G4 sand routing, round 8)
  ['fresh', 'moist', 'uplift', 'fines'],
  // L5/L6 (round 12, Phase 2 oriented structure): the wind context vector +
  // exposure for the shader's ripple orientation and consequence-chain albedo;
  // stress magnitude for the G1 joint alignment + strata coupling; youth for
  // G6/space weathering. Two null spares are round 13's (seasonal-volatile
  // susceptibility, space-weathering) — null slots pack as zero.
  ['windX', 'windY', 'windZ', 'windExpo'],
  // round 18: the two L6 spares now carry the cryo albedo fields (Europa bright
  // fracture network, Pluto dark tholin province). Legacy bodies never write
  // them ⇒ zero ⇒ their packed bytes and rendered pixels are unchanged.
  ['stress', 'youth', 'lineaAlb', 'tholinAlb'],
];
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// process registry (CONCEPT §4). Each process: (ctx, p) -> mutates ctx fields.
// "position stamps" read only ctx.dirs (pure in body-fixed position);
// "stateful neighbourhood ops" iterate the raster and are edge-masked.
// ---------------------------------------------------------------------------

// band amplitude: amp declared at the band's first level, halves by 2^-hurst per level
const ampAt = (p, level) => p.amp * Math.pow(2, -(level - p.levels[0]) * (p.hurst ?? 0.9));
// noise frequency such that features span ~6 raster cells at this level
const freqAt = (level) => 6 * Math.pow(2, level);

// degree-1..3 axes (round 4's cascade top), factored out in round 12: the
// dichotomy/swell axes are the closed-form frame every oriented-structure
// consumer re-derives — procTect's Source A, procEdifice's winner-take-all
// weights, procAge's terms, and the shader's joint-orientation prior (via
// tiles.js). ONE derivation, seeded by the continents entry.
export function lowDegreeAxes(seed) {
  const s = seed | 0;
  const mk = (o) => {
    const v = [rand01(1, o, 0, s) - 0.5, rand01(2, o, 0, s) - 0.5, rand01(3, o, 0, s) - 0.5];
    const il = 1 / Math.hypot(...v);
    return [v[0] * il, v[1] * il, v[2] * il];
  };
  return { a1: mk(60), a2: mk(61) };
}

function procContinents(ctx, p) {
  const { dirs, height, uplift, level } = ctx;
  const s = p.seed | 0;
  if (level === p.levels[0]) {
    // degree-1..3 cascade top (Phase 2 "singularity from first principles"): the
    // longest convection wavelengths dominate real planets, so the cascade START
    // is explicit low-degree structure — a crustal dichotomy axis and a mantle
    // swell pair — seeded by the body id. Still pure position stamps; a Tharsis
    // or a hemispheric split EMERGES instead of being painted.
    const dw = p.dichotomy ?? 0, sw = p.swell ?? 0;
    const { a1, a2 } = lowDegreeAxes(s);
    // base shape: warped low-frequency fBm, biased so ~oceanBias of area sits below 0
    for (let c = 0; c < N; c++) {
      const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
      const wx = x + p.warp * fbm3(x * 1.7, y * 1.7, z * 1.7, s + 900, 3);
      const wy = y + p.warp * fbm3(x * 1.7 + 5.2, y * 1.7, z * 1.7, s + 901, 3);
      const wz = z + p.warp * fbm3(x * 1.7, y * 1.7 + 7.7, z * 1.7, s + 902, 3);
      let n = fbm3(wx * p.freq, wy * p.freq, wz * p.freq, s, 5, 2.1, 0.55);
      const d1 = x * a1[0] + y * a1[1] + z * a1[2];
      const q2 = x * a2[0] + y * a2[1] + z * a2[2];
      n += dw * 0.9 * d1 + sw * (1.5 * q2 * q2 - 0.5);
      n = n + (0.5 - p.oceanBias) * 1.2;
      // plateau shaping: flatten shelves, steepen coasts
      const shaped = Math.tanh(n * 2.2) * 0.75 + n * 0.25;
      height[c] += p.amp * shaped;
      uplift[c] = smoothstep(0.02, 0.45, n);
    }
  } else {
    // correction octaves for the remaining coarse bands, damped over ocean floor
    const amp = ampAt(p, level), f = freqAt(level) * 0.12 * p.freq;
    for (let c = 0; c < N; c++) {
      const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
      const n = noise3(x * f, y * f, z * f, s + level);
      height[c] += amp * n * (0.35 + 0.65 * uplift[c]);
    }
  }
}

function procFbmBand(ctx, p) {
  const { dirs, height, uplift, rockDensity, level } = ctx;
  const amp = ampAt(p, level), f = freqAt(level), s = (p.seed | 0) + level * 7;
  for (let c = 0; c < N; c++) {
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    let n = noise3(x * f, y * f, z * f, s);
    if (p.ridged) {
      n = 1 - 2 * Math.abs(n);          // ridge transform
      n = n * n * n * 0.9 + n * 0.1;    // sharpen crests
    }
    const m = p.upliftMask ? smoothstep(0.15, 0.55, uplift[c]) : 1;
    height[c] += amp * n * m;
    if (p.rockBoost && n > 0.25) rockDensity[c] = clamp(rockDensity[c] + 0.25 * (n - 0.25), 0, 1);
  }
}

// craters: position stamps on a 3D body-fixed lattice (CONCEPT §7 "a rock is a fact
// of the planet" applies to craters too) — pure across cube faces, no halo needed.
// Band-onset ramp (§4 "blend in", Phase M): a band's craters stamp at partial depth
// at their own level and are COMPLETED by the next level re-deriving the same
// lattice (same seeds, same craters — pure functions make the two passes agree
// bit-for-bit in shape). New craters arrive blended in, never switched on.
//
// Phase 2 crater overhaul (round 4) — the register's "identical stamped rings"
// tell, burned down at the stamp itself:
//  - SFD: a truncated power law N(>r) ∝ r^-sfd WITHIN each band (several tries
//    per lattice cell) — a size hierarchy instead of one same-scale ring per box
//  - morphology by size class: simple bowl -> complex (Pike depth law d ∝ r^0.3,
//    flat floor, central peak, terraced walls) -> peak-ring/multi-ring basin.
//    complexR (the simple->complex transition radius) is recipe data.
//  - degradation: deg ∈ [0,1] subdues depth, lowers + widens the rim, erases
//    peaks/terraces/ejecta — old craters read as ghosts, not faded stamps
//  - ejecta: continuous hummocky blanket (r^-3 falloff) in height; young large
//    craters write radial ray spokes into the 'fresh' field (ALBEDO only — the
//    G6 freshness veneer; its sign/color lives in the recipe palette)
const CRATER_ONSET = 0.55;
const TRY_W = [0.6, 0.28, 0.12]; // per-cell tries: expected count stays = density
function stampCraters(ctx, p, bandLevel, weight, opts = {}) {
  const { dirs, height, rockDensity, level, cell, R, x, y, rockCell, fig, pos } = ctx;
  const fresh = ctx.fields.fresh;
  // resurfacing-age SFD (round 13, R3/D3): young resurfaced plains (maria) carry
  // FEWER superposed small craters. The accept decision stays a pure fn of
  // (anchor, seed) — reading a field at the out-of-halo anchor would seam
  // (D3) — so instead each small crater's EXPRESSION is faded per OUTPUT cell
  // (halo-valid) by the local resurfacing age `mare`. Basins (the mare-forming
  // events themselves) are exempt. Byte-identical where mare=0 (highlands).
  const mare = ctx.fields.mare, resurfK = opts.basin ? 0 : (p.resurfK ?? 0);
  const s = (p.seed | 0) + bandLevel * 131;
  const boxM = 14 * cell * (1 << (level - bandLevel)); // lattice box edge, meters
  const RL = R / boxM;                    // sphere radius in lattice units
  const rMin = opts.basin ? 0.16 : 0.085, rMax = opts.basin ? 0.38 : 0.34; // of boxM
  const bPow = p.sfd ?? 2.0;              // cumulative SFD slope
  const sfdK = 1 - Math.pow(rMin / rMax, bPow);
  const cR = p.complexR ?? 8000;          // simple->complex transition radius, m
  const rayK = opts.basin ? 0 : (p.rayK ?? 0);
  const rayAge = p.rayAge ?? 0.18;
  const rayReach = p.rayReach ?? 6;       // ray extent in crater radii
  // lattice bbox over the tile: corners + edge midpoints + center (midpoints tame
  // the face-curvature sag at coarse levels), margin covers the widest stamp
  // reach — ejecta 2.4 r, rays rayReach·r — plus the 1-cell center jitter
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const [ci, cj] of [[-HALO, -HALO], [70, -HALO], [-HALO, 70], [70, 70], [32, 32],
    [32, -HALO], [32, 70], [-HALO, 32], [70, 32]]) {
    const c = I(ci, cj);
    for (let k = 0; k < 3; k++) {
      // figure (round 17): the lattice bbox spans the ACTUAL surface points —
      // dirs·RL is the mean sphere, and a figure bulge (Haumea's long axis is
      // 1.45x the mean) would fall outside the swept box and lose its craters
      const q = fig ? pos[c * 3 + k] / boxM : dirs[c * 3 + k] * RL;
      if (q < mn[k]) mn[k] = q;
      if (q > mx[k]) mx[k] = q;
    }
  }
  const margin = Math.ceil(rMax * (rayK > 0 ? Math.max(rayReach, 2.4) : 2.4) + 1);
  const density = opts.basin ? p.basinTail : p.density * (bandLevel >= 12 ? 0.6 : 1);
  const tries = opts.basin ? 1 : 3;
  for (let bx = Math.floor(mn[0]) - margin; bx <= Math.floor(mx[0]) + margin; bx++)
    for (let by = Math.floor(mn[1]) - margin; by <= Math.floor(mx[1]) + margin; by++)
      for (let bz = Math.floor(mn[2]) - margin; bz <= Math.floor(mx[2]) + margin; bz++)
        for (let ki = 0; ki < tries; ki++) {
          const sk = s + ki * 7;
          if (rand01(bx, by, bz, sk) > density * (opts.basin ? 1 : TRY_W[ki])) continue;
          const cx = bx + rand01(bx, by, bz, sk + 1), cy = by + rand01(bx, by, bz, sk + 2), cz = bz + rand01(bx, by, bz, sk + 3);
          const rl = Math.hypot(cx, cy, cz);
          // one shell only — on a figure the shell is |S|<0.75·boxM about the
          // ACTUAL surface (the |p|-RL test is the sphere's special case); the
          // acceptance thickness is the same 1.5 lattice cells either way
          let qc = null; // crater-center surface point, metres (figure only)
          if (fig) {
            const pm = [cx * boxM, cy * boxM, cz * boxM];
            if (Math.abs(figS(fig, pm)) > 0.75 * boxM) continue;
            // project the accepted lattice point to the surface along ∇S (a
            // pure fn of the lattice point — bit-identical on every tile);
            // NEVER normalize(p)→radial here: at a lobes neck the radial
            // inversion lands on the wrong sheet (panel dirToFaceUv finding)
            qc = pm;
            for (let np = 0; np < 3; np++) {
              // figAlt, not figS: the Newton step must be the TRUE distance —
              // the neck compresses |∇S| to ~0.5, so a raw-figS step leaves the
              // center 8-45 m off-surface after 3 iterations (post-impl panel)
              const sv = figAlt(fig, qc);
              const g = figUp(fig, qc);
              qc = [qc[0] - sv * g[0], qc[1] - sv * g[1], qc[2] - sv * g[2]];
            }
          } else if (Math.abs(rl - RL) > 0.75) continue;
          // crater center dir: on a figure, the surface point's own direction
          // (exact under the ray-crossing map: normalize(q)=d̂ by construction)
          const rq = fig ? Math.hypot(qc[0], qc[1], qc[2]) : rl;
          const ux = fig ? qc[0] / rq : cx / rl, uy = fig ? qc[1] / rq : cy / rl, uz = fig ? qc[2] / rq : cz / rl;
          // truncated power-law radius (inverse CDF): small craters common,
          // giants rare — the size hierarchy the stamped-ring tell was missing
          const r = boxM * rMin * Math.pow(1 - rand01(bx, by, bz, sk + 4) * sfdK, -1 / bPow);
          // degradation state, biased fresh (u^degBias): most craters are
          // subdued but every band keeps a crisp population — a uniform deg
          // flattened the WHOLE population into custard (round-4 probe). The
          // bias is recipe data: a preserving surface (Rubra) keeps more crisp
          // craters than a gardened one
          const deg = Math.pow(rand01(bx, by, bz, sk + 5), p.degBias ?? 1.6);
          // depth: linear below the transition, Pike's shallowing law above;
          // basins additionally relax isostatically
          const dScale = r < cR ? 1 : Math.pow(cR / r, opts.basin ? 0.5 : 0.6);
          const depth = p.depthK * r * dScale * weight
            * (opts.basin ? 0.6 * (1 - 0.6 * deg) : 1 - 0.62 * deg);
          const cw = opts.basin ? 1 : clamp((r / cR - 1) / 3, 0, 1); // complexity
          const floorT = opts.basin ? 0.55 : 0.62 * cw;    // flat-floor edge (t)
          const floorD = depth * (1 - floorT * floorT);    // rim-to-floor depth
          const rimW = 0.28 * (1 + 0.9 * deg);             // old rims widen...
          const rimH = 0.32 * (1 - 0.6 * deg);             // ...and subside
          // block-field gate: a rim/blanket annulus only a couple of debris
          // LATTICE cells wide strings its rocks into evenly spaced beads
          // ("tire tracks" — round-5 panel); craters near the rock scale
          // shed no resolvable block field at all
          const rockG = smoothstep(6, 14, r);
          // fresh (albedo) writes at FULL weight on the band's own pass and
          // never on the completion pass: the height onset ramp's 0.55/0.45
          // split across two levels printed a 45% ray-albedo STEP wherever
          // draw-best-available put a LOD boundary through a ray system (the
          // round-4 gibbous square notch). Height blends in; albedo arrives whole.
          const freshW = opts.freshW ?? 1;
          const rayed = freshW > 0 && rayK > 0 && deg < rayAge && r > 0.16 * boxM;
          const reachT = rayed ? rayReach : 2.4;
          // ray tangent frame + seed (only built for rayed craters)
          let e0 = 0, e1 = 0, e2 = 0, n0 = 0, n1 = 0, n2 = 0, sRay = 0, rayA = 0;
          if (rayed) {
            // tangent frame about the local UP — the figure normal m̂ when a
            // figure is declared (rays fan across the SURFACE; at a lobes neck
            // the radial frame would tilt them into the ground), û otherwise
            let f0 = ux, f1 = uy, f2 = uz;
            if (fig) { const m = figUp(fig, qc); f0 = m[0]; f1 = m[1]; f2 = m[2]; }
            const pole = Math.abs(f1) < 0.9;
            let ax = pole ? 0 : 1, ay = pole ? 1 : 0;
            e0 = ay * f2 - 0 * f1; e1 = 0 * f0 - ax * f2; e2 = ax * f1 - ay * f0;
            const il = 1 / Math.hypot(e0, e1, e2);
            e0 *= il; e1 *= il; e2 *= il;
            n0 = f1 * e2 - f2 * e1; n1 = f2 * e0 - f0 * e2; n2 = f0 * e1 - f1 * e0;
            sRay = sk + 11 + ((bx * 73 + by * 179 + bz * 283) | 0);
            rayA = rayK * (1 - deg / rayAge);
          }
          // rasterize footprint. Two regimes:
          //  - ordinary craters: project the center to THIS face's (possibly
          //    extended) uv and window the scan (gnomonic cells grow ~2.6x
          //    toward face corners — over-scan; exact distance test below)
          //  - GIANTS (reach beyond ~0.12 R — band 0/1 ray systems, basin
          //    ejecta): the gnomonic window is unsafe (a center past the face
          //    horizon projects to k<=0 and the stretch outruns any fixed
          //    over-scan), which printed square-truncated ray fields at face
          //    edges (round-4 gibbous notch). They scan the WHOLE raster with
          //    the exact 3D distance test — identical math on every face, so
          //    the stamp is seam-proof by construction; only a handful of
          //    giants exist, so the full pass is cheap.
          let i0 = -HALO, i1 = 70, j0 = -HALO, j1 = 70;
          // figure bodies always take the giants' full-raster exact-distance
          // path: the gnomonic cell window is sized by the MEAN cell, and a
          // metric-compressed neck tile needs more cells than it grants (a
          // truncated stamp = a seam). Small bodies, few tiles — cheap.
          if (!fig && reachT * r <= 0.12 * R) {
            const fb = ctx.faceBasis;
            const k = 1 / (ux * fb.n[0] + uy * fb.n[1] + uz * fb.n[2]);
            if (k <= 0) continue;
            const a = (ux * k * fb.u[0] + uy * k * fb.u[1] + uz * k * fb.u[2] + 1) * 0.5;
            const b = (ux * k * fb.v[0] + uy * k * fb.v[1] + uz * k * fb.v[2] + 1) * 0.5;
            const D = TILE_RES << level;
            const gi = a * D - x * TILE_RES, gj = b * D - y * TILE_RES; // tile-grid coords
            const rc = ((reachT * r) / cell) * 2.6 + 2;    // footprint radius in cells
            i0 = Math.max(-HALO, Math.ceil(gi - rc)); i1 = Math.min(70, Math.floor(gi + rc));
            j0 = Math.max(-HALO, Math.ceil(gj - rc)); j1 = Math.min(70, Math.floor(gj + rc));
          }
          const rInv = 1 / r;
          for (let j = j0; j <= j1; j++)
            for (let i = i0; i <= i1; i++) {
              const c = I(i, j);
              // resurfacing-age fade (R3): fewer/subdued small craters on maria
              const resurf = resurfK > 0 ? 1 - resurfK * mare[c] : 1;
              const dx = dirs[c * 3] - ux, dy = dirs[c * 3 + 1] - uy, dz = dirs[c * 3 + 2] - uz;
              // footprint distance: on a figure, TRUE 3-D metres between the
              // cell's surface point and the crater center (the mean-R·chord
              // stretches a circular crater into an ellipse wherever the local
              // radius ≠ R — 1.45x at Haumea's long axis; panel KILLER)
              const d = fig
                ? Math.hypot(pos[c * 3] - qc[0], pos[c * 3 + 1] - qc[1], pos[c * 3 + 2] - qc[2])
                : R * Math.sqrt(dx * dx + dy * dy + dz * dz); // chord ~ arc here
              const t = d * rInv;
              if (t >= reachT) continue;
              let dh = 0;
              if (t < 1) {
                const tf = Math.max(t, floorT);            // flat floor (complex/basin)
                dh = depth * (tf * tf - 1);
                if (cw > 0) {
                  // central peak (peak RING for basins): rises from the floor,
                  // never above the rim; degradation erases it
                  const pT = opts.basin ? Math.abs(t - 0.5) * 2.5 : t / 0.2;
                  dh += floorD * (opts.basin ? 0.35 : 0.55) * cw * (1 - 0.6 * deg)
                    * Math.exp(-pT * pT);
                  // wall terraces: gentle benches carved into the wall zone
                  if (t > floorT && !opts.basin) {
                    const tw = (t - floorT) / (1 - floorT);
                    dh += depth * 0.08 * cw * (1 - 0.8 * deg) * Math.sin(tw * 15.7);
                  }
                }
              }
              const rim = Math.exp(-(((t - 1.05) / rimW) ** 2));
              dh += depth * rimH * rim;                                  // rim
              if (t > 1.05) {
                // continuous ejecta blanket: r^-3 decay off the rim, hummocky,
                // windowed out by 2.4 r; degradation buries it
                const ej = Math.pow(1.15 / (t + 0.1), 3) * (1 - smoothstep(2.0, 2.4, t));
                dh += depth * 0.09 * ej * (1 - 0.8 * deg)
                  * (0.8 + 0.4 * noise3(dx * 4 * RL, dy * 4 * RL, dz * 4 * RL, sk + 9));
                // G3: ejecta BLOCKS are traceable to their crater — young blankets
                // read blocky (drives the debris scatter), old ones lie buried
                rockDensity[c] = clamp(rockDensity[c] + 0.65 * ej * rockG * (1 - 0.85 * deg) * weight * resurf, 0, 1);
              }
              if (opts.basin) dh += depth * 0.12 * Math.exp(-(((t - 1.55) / 0.14) ** 2)); // outer ring
              height[c] += dh * resurf;
              // bead-chain guard (register): the rim's DENSITY write is an
              // APRON with a width floor of ~4 scatter-lattice cells, shifted
              // downslope — talus sheds OFF a crest, it doesn't sit on it; a
              // crest-peak density line strings rocks into single-file queues.
              // Amplitude scales by rimW/rw so the shed mass is conserved;
              // craters whose rims already resolve are bit-identical.
              const rw = Math.max(rimW, rockCell ? (4 * rockCell) * rInv : 0);
              const apron = Math.exp(-(((t - 1.05 - 0.5 * (rw - rimW)) / rw) ** 2)) * (rimW / rw);
              rockDensity[c] = clamp(rockDensity[c] + 0.5 * apron * rockG * (1 - deg) * weight * resurf, 0, 1);
              if (rayed) {
                // radial ray spokes: azimuthal value noise on the crater's local
                // circle (deterministic per crater), radial fade, patchy along
                // their length — ALBEDO only, no height
                const aE = dx * e0 + dy * e1 + dz * e2, aN = dx * n0 + dy * n1 + dz * n2;
                const az = Math.atan2(aN, aE);
                const spoke = smoothstep(0.05, 0.55, noise3(Math.cos(az) * 5.0, Math.sin(az) * 5.0, 0.31, sRay));
                const rad = Math.max(0, 1 - Math.max(t - 1.4, 0) / (rayReach - 1.4));
                // bright interior/proximal ejecta hands off to the spokes smoothly
                const inner = (1 - smoothstep(1.15, 1.7, t)) * 0.85;
                const ray = Math.max(inner, spoke * Math.pow(rad, 1.6)
                  * (0.55 + 0.6 * noise3(dx * 2.5 * RL, dy * 2.5 * RL, dz * 2.5 * RL, sRay + 1)));
                fresh[c] = clamp(fresh[c] + rayA * ray * resurf, 0, 1);
              }
            }
        }
}
function procCraters(ctx, p) {
  const { level } = ctx;
  // authored basins (round 17): a DISCRETE placement datum — Rheasilvia is a
  // fact of Vesta, not a lattice draw (the stochastic SFD cannot aim a basin
  // at the south pole, and its peak term is a RING; a 500 km basin on a 570 km
  // body needs a central peak and an authored direction). Stamped before the
  // lattice bands so every later band craters/erodes the basin, which is the
  // real stratigraphy. Full-raster exact-distance scan: seam-free like giants.
  if (p.basins && level === p.levels[0]) {
    for (const b of p.basins) stampAuthoredBasin(ctx, p, b);
  }
  // own band at onset weight (full at the last band — no completion follows it),
  // plus the completion pass for the previous band's lattice (§4 onset ramp)
  stampCraters(ctx, p, level, level === p.levels[1] ? 1 : CRATER_ONSET);
  if (level > p.levels[0]) stampCraters(ctx, p, level - 1, 1 - CRATER_ONSET, { freshW: 0 });
  // heavy-tailed SFD (Phase 2 singularity): a rare giant-basin population from a
  // 4x-coarser lattice, stamped once at the first band — with the correct tail a
  // Hellas-class basin is statistically POSSIBLE, and every later band (craters,
  // erosion, provinces) reacts to it because it sits under their accretion
  if (level === p.levels[0] && p.basinTail) stampCraters(ctx, p, level - 2, 1, { basin: true });
}
// the authored-basin stamp: bowl + flat floor + CENTRAL peak (t=0 — the lattice
// basin's exp(-((t-0.5)*2.5)^2) is a peak RING and stays that way) + rim + a
// distal apron. Distance is figure-true 3-D metres (fig) or great-circle arc
// (sphere — R·acos, never the chord: at r comparable to R the chord shrinks a
// giant basin's footprint by up to 36%, the panel's Rheasilvia KILLER).
function stampAuthoredBasin(ctx, p, b) {
  const { dirs, height, rockDensity, R, fig, pos } = ctx;
  const il = 1 / Math.hypot(b.dir[0], b.dir[1], b.dir[2]);
  const u = [b.dir[0] * il, b.dir[1] * il, b.dir[2] * il];
  let qc = null;
  if (fig) qc = figMapDir(fig, u, [0, 0, 0]);
  const depth = b.depth, rimH = b.rimH ?? 0.15 * depth, peakH = b.peakH ?? 0;
  const peakR = b.peakR ?? 0.15, floorT = b.floorT ?? 0.55, rInv = 1 / b.r;
  const s = (b.seed ?? p.seed) | 0;
  for (let c = 0; c < N; c++) {
    const d0 = dirs[c * 3], d1 = dirs[c * 3 + 1], d2 = dirs[c * 3 + 2];
    // figure: ARC, not chord — angle x mean local radius. At Rheasilvia's
    // r≈R scale a 3-D chord under-reads ~4% asymmetrically (post-impl panel:
    // the exact metric the sphere branch's R·acos was written to reject)
    let d;
    if (fig) {
      const rc = Math.hypot(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]);
      const rq = Math.hypot(qc[0], qc[1], qc[2]);
      const cosA = clamp((pos[c * 3] * qc[0] + pos[c * 3 + 1] * qc[1] + pos[c * 3 + 2] * qc[2]) / (rc * rq), -1, 1);
      d = Math.acos(cosA) * 0.5 * (rc + rq);
    } else {
      d = R * Math.acos(clamp(d0 * u[0] + d1 * u[1] + d2 * u[2], -1, 1));
    }
    const t = d * rInv;
    if (t >= 1.9) continue;
    let dh = 0;
    if (t < 1) {
      const tf = Math.max(t, floorT);
      dh = depth * ((tf * tf - floorT * floorT) / (1 - floorT * floorT) - 1); // floor −depth, rim-edge 0
      dh += peakH * Math.exp(-((t / peakR) * (t / peakR)));                   // the CENTRAL peak
      // hummocky floor texture keyed on body-fixed direction (§9)
      dh += depth * 0.02 * noise3(d0 * 40, d1 * 40, d2 * 40, s + 3);
    }
    const rim = Math.exp(-(((t - 1.04) / 0.20) ** 2));
    dh += rimH * rim;
    if (t > 1.04) dh += rimH * 0.5 * Math.pow(1.1 / (t + 0.06), 3) * (1 - smoothstep(1.6, 1.9, t));
    height[c] += dh;
    rockDensity[c] = clamp(rockDensity[c] + 0.3 * rim, 0, 1);
  }
}

// context (CONCEPT §4): the geologic climate — closed-form in latitude/altitude.
// Overwrites derived weights each level (same pure function -> LOD-consistent).
function procContext(ctx, p) {
  const { dirs, height, ice, level } = ctx;
  const s = p.seed | 0;
  for (let c = 0; c < N; c++) {
    const lat = latOf([dirs[c * 3], dirs[c * 3 + 1], dirs[c * 3 + 2]]);
    const sl = Math.sin(lat);
    const wobble = 2.5 * noise3(dirs[c * 3] * 3, dirs[c * 3 + 1] * 3, dirs[c * 3 + 2] * 3, s);
    const insol = insolationTemperatureOffset(ctx.insolation?.get(p), lat);
    const temp = p.tempEq + (p.tempPole - p.tempEq) * sl * sl - Math.max(height[c], 0) * p.lapse + wobble + insol;
    ice[c] = smoothstep(p.iceTemp + 12, p.iceTemp - 12, temp);
  }
}

// thermal erosion — THE stateful neighbourhood op the halo exists for (CONCEPT §3).
// Gather form, mass-conserving, antisymmetric per cell pair; rate is faded by the
// body-fixed edge mask so both cube faces agree exactly on their shared edge.
function procThermal(ctx, p) {
  const { height, rock, rockDensity, edge, cell, level, met } = ctx;
  const tanT = Math.tan(p.talusDeg * DEG);
  const talus = tanT * cell;
  const onset = clamp((level - p.levels[0] + 1) / 2, 0, 1); // band blends in (§4)
  const k = p.rate * onset;
  const ero = new Float32Array(N), dep = new Float32Array(N);
  let src = height, dst = new Float32Array(height);
  for (let it = 0; it < p.iters; it++) {
    const w = HALO - 1 - it; // shrinking write window keeps halo cells bit-consistent
    for (let j = -w; j <= TILE_RES + w; j++)
      for (let i = -w; i <= TILE_RES + w; i++) {
        const c = I(i, j);
        const hc = src[c];
        let dh = 0;
        // 4-neighbourhood; pair factor min(edge) is symmetric so mass is conserved
        for (const [ni, nj] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
          const n = I(ni, nj);
          const d = hc - src[n];
          const m = Math.min(edge[c], edge[n]);
          // figure metric (round 17): the angle-of-repose run is the PAIR's
          // physical length — edge-shared min(len[c],len[n]) keeps the exchange
          // antisymmetric, so the HEIGHT SUM is conserved exactly (volume only
          // to first order where cell areas vary — a documented approximation)
          const tl = met
            ? tanT * (ni === i ? Math.min(met.lv[c], met.lv[n]) : Math.min(met.lu[c], met.lu[n]))
            : talus;
          if (d > tl) { const q = k * (d - tl) * 0.25 * m; dh -= q; ero[c] += q; }
          else if (d < -tl) { const q = k * (-d - tl) * 0.25 * m; dh += q; dep[c] += q; }
        }
        dst[c] = hc + dh;
      }
    const tmp = src === height ? new Float32Array(dst) : src;
    // ping-pong: copy dst into place for next iteration / final result
    if (it + 1 < p.iters) { tmp.set(dst); src = tmp; }
    else height.set(dst);
  }
  const inv = 1 / Math.max(cell * 0.02, 1e-6);
  for (let c = 0; c < N; c++) {
    rock[c] = clamp(rock[c] + ero[c] * inv * 0.5 - dep[c] * inv * 0.25, 0, 1);
    rockDensity[c] = clamp(rockDensity[c] + ero[c] * inv * 0.3 - dep[c] * inv * 0.4, 0, 1);
  }
}

// materials: slope-derived rock exposure accreted into the rock weight (§5)
function procMaterials(ctx, p) {
  const { height, rock, ice, cell, level, met } = ctx;
  const slopeRef = Math.tan(p.rockSlopeDeg * DEG);
  const lim = HALO - 3; // write fields to halo 3, reading height +-1 (valid to 4)
  for (let j = -lim; j <= TILE_RES + lim; j++)
    for (let i = -lim; i <= TILE_RES + lim; i++) {
      const c = I(i, j);
      // figure metric (round 17): FD normals read the per-cell metric lengths
      const gx = (height[I(i + 1, j)] - height[I(i - 1, j)]) / (2 * (met ? met.lu[c] : cell));
      const gy = (height[I(i, j + 1)] - height[I(i, j - 1)]) / (2 * (met ? met.lv[c] : cell));
      const slope = Math.sqrt(gx * gx + gy * gy);
      const exposed = smoothstep(slopeRef * 0.8, slopeRef * 1.4, slope);
      rock[c] = clamp(Math.max(rock[c], exposed), 0, 1);
      if (slope > slopeRef * 1.2) ice[c] *= 0.3; // ice can't cling to cliffs
    }
}

// accreted ambient occlusion: each band multiplies in its own concavity (§4)
function procAo(ctx, p) {
  const { height, ao, edge, cell, met } = ctx;
  const lim = HALO - 3;
  const inv = 1 / (cell * 0.9);
  for (let j = -lim; j <= TILE_RES + lim; j++)
    for (let i = -lim; i <= TILE_RES + lim; i++) {
      const c = I(i, j);
      const avg = (height[I(i - 1, j)] + height[I(i + 1, j)] + height[I(i, j - 1)] + height[I(i, j + 1)]) * 0.25;
      // figure metric (round 17): concavity normalizes by the cell's own span
      const cav = clamp((avg - height[c]) * (met ? 1 / (0.9 * 0.5 * (met.lu[c] + met.lv[c])) : inv), 0, 1);
      ao[c] *= 1 - p.k * cav * edge[c];
    }
}

// horizon field (§4/§10 — ROADMAP_V2 Phase 1a). NOT additive accretion: each level
// re-derives its octants from its own height raster with a bounded scan reach, then
// takes the MAX against the inherited coarse value — far ridges arrive via the
// parent chain (each ancestor level scanned at 2x the spacing), near ridges via the
// local scan; reach 2 makes the ladder gap-free and max is order-independent, so
// determinism and LOD-consistency hold. Values clamp to >= 0 (a horizon below the
// local horizontal reads as flat — halves the 8-bit quantization step; the negative
// branch only delays sunset by its own magnitude). The scan is grid-stateful, so
// the local term is edge-masked like erosion/AO. Validity: written to halo 2
// (reach 2 reads height to halo 4, the height validity limit); halo cells beyond 2
// carry inherited-only values, which never reach any tile interior.
// Recipes stop this band at landform scale (~level 14, 75 m cells): below that,
// self-shadowing is statistical surface roughness and belongs to the BRDF, not a
// binary horizon test — the same §7 ladder logic as normals folding into roughness.
const OCT = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
function procHorizon(ctx, p) {
  const { height, edge, cell, fields, met } = ctx;
  const reach = Math.min(p.reach ?? 2, HALO - 4 + 2); // never read past halo 4
  const w = HALO - 4; // write window: halo 2
  for (let o = 0; o < 8; o++) {
    const [di, dj] = OCT[o];
    const step = cell * Math.hypot(di, dj);
    const F = fields['hor' + o];
    for (let j = -w; j <= TILE_RES + w; j++)
      for (let i = -w; i <= TILE_RES + w; i++) {
        const c = I(i, j);
        const h0 = height[c];
        // figure metric (round 17): the scan step is the cell's own physical
        // run along this octant, not the mean-sphere arc
        const st = met ? Math.hypot(di * met.lu[c], dj * met.lv[c]) : step;
        let best = 0;
        for (let k = 1; k <= reach; k++) {
          const s = (height[I(i + di * k, j + dj * k)] - h0) / (k * st);
          if (s > best) best = s;
        }
        const sin = (best / Math.sqrt(1 + best * best)) * edge[c];
        if (sin > F[c]) F[c] = sin;
      }
  }
}

// albedo provinces (taxonomy D — pulled forward to Phase 1c for disc identity).
// Flood-basalt maria: lava fills topographic lows up to a recipe level, writing a
// 'mare' material weight AND flattening the flooded floor (resurfacing — craters
// stamped by earlier bands are erased, later bands crater the fresh surface, which
// is exactly the real stratigraphy). A degree-low noise mask gives the hemispheric
// asymmetry. Runs at ONE coarse level; finer levels inherit bilinearly.
function procProvinces(ctx, p) {
  const { dirs, height, level, fields } = ctx;
  if (level !== p.levels[0]) return;
  const mare = fields.mare;
  const s = p.seed | 0;
  const flatten = p.flatten ?? 0.7;
  const fillLevel = p.fillLevel ?? (p.fillLo + p.fillHi) * 0.5;
  // fill keyed on REGIONAL height (5x5 box mean, ~100 km at the province
  // level): lava floods broad lows — basins, lowland plains — never every
  // sub-resolution crater pit (the round-4 SFD's small deep bowls printed as
  // square mare dots + square flattening dents, one of them the gibbous-disc
  // notch). Contract note: the kernel is legal HERE because every process
  // before 'provinces' is a position stamp, so height is pure across the full
  // raster; provinces must keep running before any stateful neighbourhood op
  // (recipes do — thermal starts many bands later). Writes clamp to the
  // height-validity window (halo 4 = HALO-2) so neighbours agree bit-exactly.
  const R2 = 2, lim = HALO - R2;
  const hs = new Float32Array(N);
  for (let j = -lim; j <= TILE_RES + lim; j++)
    for (let i = -lim; i <= TILE_RES + lim; i++) {
      let sum = 0;
      for (let dj = -R2; dj <= R2; dj++)
        for (let di = -R2; di <= R2; di++) sum += height[I(i + di, j + dj)];
      hs[I(i, j)] = sum / 25;
    }
  // round 14 (R6): basin-centred flood term. The mascon basins forEachBasin
  // enumerates (closed-form, EXACTLY the stamped population) flood by their
  // own per-basin `fill` law, bypassing the hemispheric NOISE mask only —
  // the regional-low height gate still applies (lava fills the basin FLOOR;
  // rims stay dry), so co-location with the stress law's mascon loads holds
  // where the ridge consumers need it. Gated on a per-body recipe scalar
  // (basinFill, default 0): Luna's mare-flood agent runs it; Rubra's aeolian
  // albedo provinces do NOT (its basins also stamp LATER in the same level,
  // so a basin term there would flood ground that does not yet exist).
  const basins = [];
  if ((p.basinFill ?? 0) > 0) forEachBasin(ctx.body, (b) => { if (b.fill > 1e-3) basins.push(b); });
  const R = ctx.body.R;
  for (let j = -lim; j <= TILE_RES + lim; j++)
    for (let i = -lim; i <= TILE_RES + lim; i++) {
      const c = I(i, j);
      const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
      const n = fbm3(x * 1.4, y * 1.4, z * 1.4, s, 3, 2.2, 0.55);
      let w = smoothstep(p.fillHi, p.fillLo, hs[c]);
      w *= smoothstep(-0.28, 0.12, n + (p.bias ?? 0));
      if (basins.length) {
        const hGate = smoothstep(p.fillHi, p.fillLo, hs[c]);
        for (const b of basins) {
          // arc distance in METRES (panel M2: the raw radian/metre mismatch
          // saturates the window identically everywhere)
          const dot = x * b.v[0] + y * b.v[1] + z * b.v[2];
          const arc = Math.acos(Math.max(-1, Math.min(1, dot))) * R;
          const wB = p.basinFill * b.fill * smoothstep(b.r * 1.05, b.r * 0.55, arc) * hGate;
          if (wB > w) w = wB;
        }
      }
      if (w > 1e-3) {
        height[c] = lerp(height[c], Math.min(height[c], fillLevel), flatten * w);
        if (w > mare[c]) mare[c] = w;
      }
    }
}

// ---------------------------------------------------------------------------
// Phase 2 [global] consumers. The 'global' entry itself assembles the one
// planet-wide coarse pass (globalgrid.js) and writes its rasters into every
// tile as position stamps — bilinear samples by body-fixed direction, so halo
// cells agree bit-exactly across neighbours and levels (§3 for free). The
// rasters OVERWRITE each level (the procContext pattern): same pure function,
// sharper sampling, LOD-consistent.
function procGlobal(ctx, p) {
  const g = globalFor(ctx.body, p);
  const { dirs, fields } = ctx;
  const flow = fields.flow, moist = fields.moist;
  const d = [0, 0, 0];
  // meander warp: D8 channels are 8-direction polylines on the coarse grid and
  // print as circuit-board staircases (round-3 probe). Warping the SAMPLING
  // position by ~a cell at ~3-cell wavelength turns them into meanders — a
  // position-pure deformation, identical at every tile and level, so the §3
  // halo contract and LOD-consistency hold untouched.
  const W = TILE_RES << (p.level ?? 3);
  const wAmp = (p.warpCells ?? 1.2) * (Math.PI / 2) / W;
  const wf = W * 0.36;
  const s = (p.seed | 0) + 7;
  for (let c = 0; c < N; c++) {
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    // dirToFaceUv is projective: the warped vector needs no renormalization
    d[0] = x + wAmp * noise3(x * wf, y * wf, z * wf, s);
    d[1] = y + wAmp * noise3(x * wf + 11.3, y * wf, z * wf, s + 1);
    d[2] = z + wAmp * noise3(x * wf, y * wf + 7.9, z * wf, s + 2);
    flow[c] = g.sample('flow', d);
    moist[c] = g.sample('moist', d);
  }
  // round 12: the wind context (Cartesian vector + windward/lee exposure),
  // overwritten per level like flow/moist. Sampled UNWARPED — the meander
  // warp exists for flow channels, not circulation — and FOOTPRINT-MATCHED:
  // the texel radius picks the wind mip, so coarse tiles carry the MEAN wind
  // over their texel (§7 fold), not an aliasing point sample (which printed
  // a reticulate mottle on the disc and was level-dependent, violating §5).
  if (g.hasWind) {
    const wx = fields.windX, wy = fields.windY, wz = fields.windZ, we = fields.windExpo;
    const footRad = ctx.cell / ctx.R;
    const d0 = [0, 0, 0];
    for (let c = 0; c < N; c++) {
      d0[0] = dirs[c * 3]; d0[1] = dirs[c * 3 + 1]; d0[2] = dirs[c * 3 + 2];
      wx[c] = g.sample('windX', d0, footRad);
      wy[c] = g.sample('windY', d0, footRad);
      wz[c] = g.sample('windZ', d0, footRad);
      we[c] = g.sample('windExpo', d0, footRad);
    }
  }
}

// biome geography v2 (Phase 2): vegetation = temperature window x moisture
// curve with WIDE ecotones — macro placement is baked geography (rain shadows
// and river corridors arrive through the advected moisture field), while the
// per-pixel breakup/suppression stays in the shader (§7 ladder). Replicates
// procContext's temperature closed form exactly (same seed, same wobble) so
// the two climate consumers cannot disagree.
function procBiomes(ctx, p) {
  const { dirs, height, fields, body, cell, R } = ctx;
  const cl = body.processes.find((q) => q.type === 'context');
  if (!cl) return;
  const veg = fields.veg, moist = fields.moist, flow = fields.flow, ice = fields.ice;
  const sea = body.seaLevel ?? -1e9;
  const s = cl.seed | 0, sv = (p.seed | 0) + 3;
  const lo = p.moistLo ?? 0.14, hi = p.moistHi ?? 0.5;
  // meso patchiness octaves (round-3 panel: pure-smooth moisture vegetation
  // collapsed the land's mid-frequency albedo structure into flat cream from
  // orbit). Real vegetation is patchy from province scale (~1500 km) down to
  // stand scale — a small octave ladder modulates the moisture macro. Each
  // octave is gated by THIS level's Nyquist (the field is overwritten per
  // level, the procContext pattern, so finer levels legally sharpen): an
  // ungated high octave would alias into level-dependent white noise.
  const cellRad = cell / R;
  const OCT_F = [23, 90, 360, 1440];
  const OCT_A = [0.5, 0.34, 0.24, 0.18];
  const octW = OCT_F.map((f) => 1 - smoothstep(0.2, 0.45, f * cellRad));
  for (let c = 0; c < N; c++) {
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    const lat = latOf([x, y, z]);
    const sl = Math.sin(lat);
    const wobble = 2.5 * noise3(x * 3, y * 3, z * 3, s);
    const temp = cl.tempEq + (cl.tempPole - cl.tempEq) * sl * sl
      - Math.max(height[c], 0) * cl.lapse + wobble;
    const tW = smoothstep(-2, 9, temp) * (1 - smoothstep(23, 33, temp));
    let v = tW * smoothstep(lo, hi, moist[c]);
    let patch = 0.62;
    for (let k = 0; k < 4; k++) {
      if (octW[k] <= 0) break;
      patch += OCT_A[k] * octW[k] * noise3(x * OCT_F[k], y * OCT_F[k], z * OCT_F[k], sv + k);
    }
    v *= clamp(patch, 0, 1.35);
    // riparian corridors: trunk rivers stay green through dry basins (a Nile
    // is temperature-gated but not rainfall-gated)
    v = Math.max(v, tW * 0.8 * smoothstep(0.35, 0.7, flow[c]));
    if (height[c] < sea + 2) v = 0;
    veg[c] = clamp(v, 0, 1) * (1 - ice[c]);
  }
}

// band-limited incision (Phase 2 [global] flow consumer): valleys carve where
// accumulation is high, graded to the outlet level — routing was established
// on the pre-incision surface (the global pass's prefix), then carved sharper,
// which is also how the circularity is broken. Crater-style two-level onset
// (§4 "blend in"): the same smooth profile stamps 55% at its first level and
// completes at the next, so valleys never switch on.
const INCISE_ONSET = 0.55;
function procIncision(ctx, p) {
  const { height, fields, level, body } = ctx;
  const w = level === p.levels[0] ? (p.levels[1] > p.levels[0] ? INCISE_ONSET : 1)
    : level === p.levels[0] + 1 ? 1 - INCISE_ONSET : 0;
  if (w === 0) return;
  const flow = fields.flow;
  const base = p.base ?? body.seaLevel ?? 0;
  const grade = p.grade ?? 500, power = p.power ?? 1.6;
  for (let c = 0; c < N; c++) {
    const fl = flow[c];
    if (fl <= 0.02) continue;
    const above = height[c] - base;
    if (above <= 0) continue;
    const carve = p.depth * Math.pow(fl, power) * smoothstep(0, grade, above);
    height[c] -= w * Math.min(carve, above * 0.85); // rivers grade to base level
  }
}

// inverted relief (round 13): ancient dry channel fill indurates (cements) and
// resists the band-limited deflation that lowers the softer surroundings, so
// former channels stand UP as sinuous ridges (Aeolis Mensae, Medusae Fossae).
// Implemented position-pure and ADDITIVE — raise the resistant paleochannel
// network (equivalent to deflating the plains, but full-raster legal: reads
// only position-pure fields flow/moist/youth + local height, no neighbour read,
// LOD-consistent). The selector uses a MID flow band (D4: the peak-incised
// thalweg is EXCLUDED so it does not cancel incision), gated dry (arid — needs
// wind deflation) and OLD (abandoned). Crater-style two-level §4 onset. Byte-
// identical where the gate closes (humid, young, or off the paleochannel).
const INVERT_ONSET = 0.55;
function procInvert(ctx, p) {
  const { height, fields, level } = ctx;
  const w = level === p.levels[0] ? (p.levels[1] > p.levels[0] ? INVERT_ONSET : 1)
    : level === p.levels[0] + 1 ? 1 - INVERT_ONSET : 0;
  if (w === 0) return;
  const flow = fields.flow, moist = fields.moist, youth = fields.youth;
  const amp = p.amp ?? 250;
  const fLo = p.flowLo ?? 0.25, fMid = p.flowMid ?? 0.55, fHi = p.flowHi ?? 0.9;
  const mLo = p.dryLo ?? 0.1, mHi = p.dryHi ?? 0.4;
  const yLo = p.ageLo ?? 0.15, yHi = p.ageHi ?? 0.55;
  for (let c = 0; c < N; c++) {
    const fl = flow[c];
    if (fl <= 0.02) continue;
    // MID flow band: paleo-distributaries, NOT the deepest incised trunk
    const band = smoothstep(fLo, fMid, fl) * (1 - smoothstep(fMid, fHi, fl));
    if (band <= 0.003) continue;
    const dry = 1 - smoothstep(mLo, mHi, moist[c]);    // arid (Rubra moist≡0 → 1)
    const age = 1 - smoothstep(yLo, yHi, youth[c]);    // OLD = low youth
    const indur = band * dry * age;
    if (indur <= 0.003) continue;
    height[c] += w * amp * indur;
  }
}

// ---------------------------------------------------------------------------
// ground plan L1 (round 8): the CLIFF-AND-BENCH FORMER. The band spectrum is
// fBm everywhere — it cannot produce a ledge, and no texture rescues a world
// with no vertical anywhere. Real escarpments are differential erosion of a
// layered crust: resistant beds cap near-vertical risers, soft beds erode back
// into treads, debris collects below. Implemented as a per-cell PURE remap of
// height in a strata frame (position + current height only — NO stencil reads:
// the process shares levels with thermal, where a stencil would break the §3
// bit-exact halo contract):
//   zs   = (h - fold(pos)) / T     bed coordinate. fold() is a low-degree
//          structural surface — beds dip and roll regionally, so bench edges
//          cross hillsides at the dip instead of ringing constant altitudes
//          (the naive-terracing tell), and knickpoints emerge wherever an
//          incision channel crosses a resistant bed.
//   f    = zs - floor(zs)          position within the bed
//   r(f) = (1-q)·f + q·S(f)        monotone remap: S compresses the bed's rise
//          into a riser window under the cap — treads emerge at bed tops and
//          bases, the riser steepens toward vertical as q→1. Monotone for any
//          q in [0,1] (both terms nondecreasing) ⇒ no height inversions.
//   dh   = q·(S(f) - f)·T
// q gates stack: a sparse per-bed cap hash (most beds are soft — escarpments
// are events, not wallpaper), a strike-variation noise (scarps fade along
// strike), and a recipe FIELD gate (uplift highlands / mare flows) so lowlands
// never terrace. r(0)=0 and r(1)=1 pin dh→0 at bed boundaries, so a cap-hash
// flip across the boundary stays continuous. Each bed octave stamps ONCE, at
// the level whose cells first resolve its riser, with the crater/incision
// §4 two-level onset (55% at its level, completed next level — the completion
// re-derives f from slightly evolved height, so the pair is a smooth blend
// rather than exact algebra; geomorph carries the LOD transition).
// Consequences ride the same weight: risers expose bedrock (rock — G1's
// jointing substrate in the shader), ledge-calved blocks collect below the
// riser (rockDensity — G3 population iv), and thermal (later in the list)
// relaxes oversteepened risers into angle-of-repose talus aprons.
const STRATA_ONSET = 0.55;
function procStrata(ctx, p) {
  const { dirs, height, level, R, fields } = ctx;
  const s = p.seed | 0;
  const rock = fields.rock, rockDensity = fields.rockDensity;
  const gate = p.gate ? fields[p.gate.field] : null;
  const faceArc = (Math.PI / 2) * R;
  const rzLo = p.riserLo ?? 0.55, rzHi = p.riserHi ?? 0.85;
  const wMax = p.amp ?? 0.85, hardBias = p.hardBias ?? 0.55;
  // bed octaves active at this level: T_k resolves where cell ≈ T_k/resolveK
  const acts = [];
  for (let k = 0, nOct = p.octaves ?? 4; k < nOct; k++) {
    const T = (p.bedT0 ?? 700) * Math.pow(p.bedLac ?? 0.45, k);
    const Lk = clamp(Math.ceil(Math.log2((faceArc * (p.resolveK ?? 4)) / (TILE_RES * T))),
      p.levels[0], p.levels[1]);
    const w = level === Lk ? (Lk < p.levels[1] ? STRATA_ONSET : 1)
      : level === Lk + 1 ? 1 - STRATA_ONSET : 0;
    // strike-variation frequency: scarp segments ~45 bed-thicknesses long
    if (w > 0) acts.push({ k, T, w, stF: R / (45 * T) });
  }
  if (!acts.length) return;
  const foldAmp = p.foldAmp ?? 0.004 * R, foldF = p.foldF ?? 5;
  // round-12 stress coupling (register row: riser steepness scales with
  // pre-existing slope — true near-vertical walls want the stress field):
  // tectonized zones (rift walls, ridge belts) push q toward 1, clamped
  // below it — monotonicity of the remap requires q < 1.
  const stress = (p.stressK ?? 0) > 0 ? fields.stress : null;
  const sK = p.stressK ?? 0;
  for (let c = 0; c < N; c++) {
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    const gw = gate ? smoothstep(p.gate.lo, p.gate.hi, gate[c]) : 1;
    if (gw <= 0.002) continue;
    const g = foldAmp * fbm3(x * foldF, y * foldF, z * foldF, s + 500, 3);
    for (const a of acts) {
      const h = height[c];
      const zs = (h - g) / a.T;
      const bed = Math.floor(zs), f = zs - bed;
      // does the bed ABOVE carry a resistant cap? sparse by hardBias
      const cap = smoothstep(hardBias, hardBias + 0.22, rand01(bed + 1, 811 + a.k * 7, 0, s));
      if (cap <= 0.003) continue;
      const st = 0.5 + 0.5 * noise3(x * a.stF, y * a.stF, z * a.stF, s + 29 + a.k);
      let q = wMax * cap * st * gw * a.w;
      if (stress) q = Math.min(q * (1 + sK * Math.min(Math.abs(stress[c]), 1)), 0.98);
      if (q <= 0.004) continue;
      const S = smoothstep(rzLo, rzHi, f);
      height[c] = h + q * (S - f) * a.T;
      const riz = smoothstep(rzLo - 0.06, rzLo + 0.06, f) * (1 - smoothstep(rzHi, rzHi + 0.1, f));
      if (riz > 0) rock[c] = clamp(Math.max(rock[c], 0.85 * riz * q), 0, 1);
      const tal = smoothstep(rzLo, rzLo - 0.2, f) * smoothstep(0.08, 0.28, f);
      if (tal > 0) rockDensity[c] = clamp(rockDensity[c] + 0.3 * tal * q * cap, 0, 1);
    }
  }
}

// G5 catena (round 8, ground law): material sorts by hillslope position —
// rocky crests and convexities (erosion wins), mixed midslopes, fine-filled
// hollows (deposition wins). Accretes a 'fines' field from signed curvature
// per band (the ao pattern), boosts bedrock exposure on convexities, sheds a
// few clasts off crests, and buries a fraction of the clast field under fines
// ponds — which is ALSO ground law G4's no-wind agent (a lunar crater-floor
// fines pond and a Rubra swale fill come from this one mechanism; the recipe
// supplies the rates, per the generalization contract). Stencil op: reads
// height ±1 (valid to halo 4 post-thermal), writes fields to halo 3 (their
// declared validity), edge-masked like ao/materials.
function procCatena(ctx, p) {
  const { height, edge, cell, fields, met } = ctx;
  const fines = fields.fines, rock = fields.rock, rockDensity = fields.rockDensity;
  const inv = 1 / (cell * (p.curvRef ?? 0.9));
  const kF = p.kFines ?? 0.4, kX = p.kShed ?? 0.3, kR = p.kRock ?? 0.35;
  const kD = p.kDen ?? 0.08, kB = p.kBury ?? 0.1;
  const lim = HALO - 3;
  for (let j = -lim; j <= TILE_RES + lim; j++)
    for (let i = -lim; i <= TILE_RES + lim; i++) {
      const c = I(i, j);
      const avg = (height[I(i - 1, j)] + height[I(i + 1, j)]
        + height[I(i, j - 1)] + height[I(i, j + 1)]) * 0.25;
      // figure metric (round 17): curvature normalizes by the cell's own span
      const cv = (avg - height[c]) * (met
        ? 1 / (0.5 * (met.lu[c] + met.lv[c]) * (p.curvRef ?? 0.9))
        : inv); // >0 hollow, <0 crest
      const e = edge[c];
      if (cv > 0) {
        fines[c] = clamp(fines[c] + kF * Math.min(cv, 1) * e, 0, 1);
      } else {
        const cx = Math.min(-cv, 1) * e;
        fines[c] = clamp(fines[c] - kX * cx, 0, 1);
        rock[c] = clamp(Math.max(rock[c], kR * cx), 0, 1);
        rockDensity[c] = clamp(rockDensity[c] + kD * cx, 0, 1);
      }
      if (kB > 0) rockDensity[c] *= 1 - kB * fines[c];
    }
}

// ---------------------------------------------------------------------------
// Round 12 — Phase 2 oriented structure. Everything below is CLOSED-FORM in
// body-fixed position (position-stamp class, full-raster legal, seam-free by
// construction): the stress law, the winner-take-all edifices, the rift, the
// age/youth context, and the anchored-wave-packet oriented stamps. The one
// non-closed-form input (the wind field) is the [global] grid, which anchors
// sample DIRECTLY by direction — planet-wide and level-independent, so it is
// available at anchors OUTSIDE the tile raster, which no baked field is.
// ---------------------------------------------------------------------------
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a) => { const il = 1 / (Math.hypot(a[0], a[1], a[2]) || 1); return [a[0] * il, a[1] * il, a[2] * il]; };

// winner-take-all edifice sites (Phase 2 singularity (c)): volcanism
// concentrates on the swell peak. Exactly K = 24 points of a seed-rotated
// Fibonacci spiral over the WHOLE sphere (a truncated larger set would
// cluster in a cap), weighted by swell^1.5 × hash, greedy min-separation in
// weight-descending order with index tie-break — a total, deterministic
// order. A Tharsis trio EMERGES from the selection; nothing is named.
const SITE_CACHE = new Map();
export function edificeSites(body, p) {
  const key = body.id + '|' + (p.seed | 0) + '|' + (p.volN ?? 3) + '|' + (p.height ?? 0) + '|' + (p.radius ?? 0) + '|' + (p.sepDeg ?? 16);
  const hit = SITE_CACHE.get(key);
  if (hit) return hit;
  const cont = body.processes.find((q) => q.type === 'continents');
  const { a2 } = lowDegreeAxes(cont ? cont.seed : 0);
  const s = p.seed | 0;
  const K = 24, GA = Math.PI * (3 - Math.sqrt(5));
  // seed rotation: spin about Y then tilt about X — pure trig, no branches
  const ry = rand01(5, 71, 0, s) * 2 * Math.PI;
  const rx = (rand01(6, 72, 0, s) - 0.5) * Math.PI;
  const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
  const cand = [];
  for (let i = 0; i < K; i++) {
    const z0 = 1 - (2 * i + 1) / K, r0 = Math.sqrt(Math.max(1 - z0 * z0, 0)), th = GA * i;
    let v = [r0 * Math.cos(th), z0, r0 * Math.sin(th)];
    v = [v[0] * cy + v[2] * sy, v[1], -v[0] * sy + v[2] * cy];
    v = [v[0], v[1] * cx - v[2] * sx, v[1] * sx + v[2] * cx];
    const q2 = vdot(v, a2);
    const S = 1.5 * q2 * q2 - 0.5;
    cand.push({ v, i, w: Math.pow(Math.max(S, 0), 1.5) * (0.6 + 0.4 * rand01(7, i, 0, s)) });
  }
  cand.sort((a, b) => (b.w - a.w) || (a.i - b.i));
  const sep = Math.cos((p.sepDeg ?? 16) * DEG);
  const sites = [];
  for (const c of cand) {
    if (sites.length >= (p.volN ?? 3) || c.w <= 0) break;
    if (sites.some((t) => vdot(t.v, c.v) > sep)) continue;
    sites.push({
      v: c.v,
      H: (p.height ?? 12000) * (0.7 + 0.6 * rand01(8, c.i, 0, s)),
      Re: (p.radius ?? 500000) * (0.75 + 0.5 * rand01(9, c.i, 0, s)),
    });
  }
  SITE_CACHE.set(key, sites);
  return sites;
}

// the heavy-tail basin population, re-derived: EXACTLY the lattice draw
// stampCraters' basin path makes (same seeds, same jitter, same SFD), so the
// stress law's mascon sources ARE the stamped basins. ~500 lattice cells
// scanned once per call; a handful survive the density + shell filters.
export function forEachBasin(body, cb) {
  const p = body.processes.find((q) => q.type === 'craters');
  if (!p || !p.basinTail) return;
  const bandLevel = p.levels[0] - 2;
  const faceArc = (Math.PI / 2) * body.R;
  const boxM = 14 * (faceArc / (TILE_RES * Math.pow(2, bandLevel)));
  const RL = body.R / boxM;
  const s = (p.seed | 0) + bandLevel * 131;
  const bPow = p.sfd ?? 2.0;
  const rMin = 0.16, rMax = 0.38;
  const sfdK = 1 - Math.pow(rMin / rMax, bPow);
  const M = Math.ceil(RL + 1);
  for (let bx = -M; bx <= M; bx++)
    for (let by = -M; by <= M; by++)
      for (let bz = -M; bz <= M; bz++) {
        if (rand01(bx, by, bz, s) > p.basinTail) continue;
        const cx = bx + rand01(bx, by, bz, s + 1), cy = by + rand01(bx, by, bz, s + 2), cz = bz + rand01(bx, by, bz, s + 3);
        const rl = Math.hypot(cx, cy, cz);
        if (Math.abs(rl - RL) > 0.75) continue;
        const deg = Math.pow(rand01(bx, by, bz, s + 5), p.degBias ?? 1.6);
        const r = boxM * rMin * Math.pow(1 - rand01(bx, by, bz, s + 4) * sfdK, -1 / bPow);
        // per-basin flood-fill susceptibility (round 14, R6): a LAW, not a pin —
        // big fresh basins flood (deep penetration, strong mascon), degraded
        // ones don't. The SAME (1 − 0.7·deg) shape the stress law weights its
        // mascon loads by, so flooded ⇔ mascon-loaded by construction: the
        // populations procProvinces floods and stressTensor stresses UNIFY here.
        const fill = (1 - 0.7 * deg)
          * smoothstep(boxM * 0.155, boxM * 0.19, r)
          * (0.7 + 0.3 * rand01(bx, by, bz, s + 6));
        cb({
          v: [cx / rl, cy / rl, cz / rl],
          r,
          deg,
          fill,
        });
      }
}

// the closed-form stress law — two sources, one mechanism (the anti-overfit
// gate's shape): a thin shell over an uplifting SWELL (hoop extension on the
// dome -> radial grabens/rift; radial compression at the flexural periphery
// -> concentric wrinkle ridges) and MASCON BASIN loads (interior compression
// -> concentric ridges; margin extension -> arcuate rilles). Rubra runs the
// swell agent, Luna the basin agent, from the same eigen-rule. Returns the
// 2x2 tangent-plane tensor at dir d; the baked field keeps the dominant
// signed principal value, stamps take the eigen-direction too.
export function stressSources(body, p) {
  const cont = body.processes.find((q) => q.type === 'continents');
  const { a2 } = lowDegreeAxes(cont ? cont.seed : 0);
  const basins = [];
  if ((p.kBasin ?? 0) > 0) forEachBasin(body, (b) => basins.push(b));
  return { a2, kSw: p.kSw ?? 0, kBasin: p.kBasin ?? 0, basins, R: body.R };
}
export function stressTensor(d, src, out) {
  // tangent basis (pole-guarded; the eigenvalues are basis-independent)
  const pole = Math.abs(d[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  const e = vnorm(vcross(pole, d));
  const n = vnorm(vcross(d, e));
  let txx = 0, txy = 0, tyy = 0;
  const add = (er, sr, st) => {
    // er = radial unit axis in the tangent plane; hoop axis = er rotated 90°
    const c = vdot(er, e), s2 = vdot(er, n);
    txx += sr * c * c + st * s2 * s2;
    tyy += sr * s2 * s2 + st * c * c;
    txy += (sr - st) * c * s2;
  };
  if (src.kSw > 0) {
    const q2 = vdot(d, src.a2);
    const S = 1.5 * q2 * q2 - 0.5;
    const ring = Math.exp(-(((Math.abs(q2) - 0.45) / 0.2) ** 2));
    // radial-from-the-nearer-swell-pole tangent axis; degenerates AT the pole
    // (summit fabric is omnidirectional there — physical), guard by weight
    const sg = q2 >= 0 ? 1 : -1;
    const t = [src.a2[0] * sg - q2 * sg * d[0], src.a2[1] * sg - q2 * sg * d[1], src.a2[2] * sg - q2 * sg * d[2]];
    const tl = Math.hypot(t[0], t[1], t[2]);
    if (tl > 0.08) {
      const er = [-t[0] / tl, -t[1] / tl, -t[2] / tl];
      add(er, -src.kSw * 0.65 * ring, src.kSw * Math.max(S, 0));
    }
  }
  for (const b of src.basins) {
    const dx = d[0] - b.v[0], dy = d[1] - b.v[1], dz = d[2] - b.v[2];
    const arc = src.R * Math.sqrt(dx * dx + dy * dy + dz * dz); // chord ~ arc
    const x = arc / b.r;
    if (x > 1.6) continue;
    const t = [b.v[0] - vdot(d, b.v) * d[0], b.v[1] - vdot(d, b.v) * d[1], b.v[2] - vdot(d, b.v) * d[2]];
    const tl = Math.hypot(t[0], t[1], t[2]);
    if (tl < 0.02) continue; // basin center: omnidirectional
    const er = [-t[0] / tl, -t[1] / tl, -t[2] / tl];
    const w = src.kBasin * (1 - 0.7 * b.deg);
    const inner = 1 - smoothstep(0.6, 0.95, x);
    const ring = smoothstep(0.85, 1.0, x) * (1 - smoothstep(1.25, 1.55, x));
    add(er, -w * inner + w * 0.8 * ring, -w * 0.9 * inner);
  }
  out.txx = txx; out.txy = txy; out.tyy = tyy; out.e = e; out.n = n;
  return out;
}
const eigDominant = (t) => {
  const m = (t.txx + t.tyy) * 0.5;
  const q = Math.sqrt(((t.txx - t.tyy) * 0.5) ** 2 + t.txy * t.txy);
  return Math.abs(m + q) >= Math.abs(m - q) ? m + q : m - q;
};

// winner-take-all edifices (Phase 2 singularity (c)): stamped ONCE at the
// coarse level, inherited down; craters/strata/thermal react because they run
// after or deeper. The height param is deliberately NOT 'amp' — tiles.js
// derives the planet-wide split-metric relief from max(p.amp) and must not
// rescale to one mountain.
function procEdifice(ctx, p) {
  const { dirs, height, uplift, level, R } = ctx;
  if (level !== p.levels[0]) return;
  for (const site of edificeSites(ctx.body, p)) {
    const calW = 0.07 * site.Re, calD = 0.14 * site.H;
    for (let c = 0; c < N; c++) {
      const dx = dirs[c * 3] - site.v[0], dy = dirs[c * 3 + 1] - site.v[1], dz = dirs[c * 3 + 2] - site.v[2];
      const r = R * Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r >= site.Re) continue;
      // clamped quartic shield dome + summit caldera pit (the clamp is on the
      // BASE, before squaring: the raw quartic RISES again past Re)
      const rr = r / site.Re;
      const b = Math.max(1 - rr * rr, 0);
      height[c] += site.H * b * b - calD * Math.exp(-((r / calW) ** 2));
      uplift[c] = Math.max(uplift[c], 0.75 * b);
    }
  }
}

// the rift (Phase 2 singularity (c), second winner): ONE great canyon system
// where the swell's hoop extension peaks — the arc runs radially off the
// dome (Valles-from-Tharsis geometry, emergent, never named). The azimuth is
// an 8-candidate winner-take-all hash; en-echelon side troughs and uplifted
// shoulders ride the same frame. Param is 'depth', not 'amp' (split metric).
const RIFT_CACHE = new Map();
export function riftFrame(body, p) {
  const key = body.id + '|' + (p.seed | 0);
  const hit = RIFT_CACHE.get(key);
  if (hit) return hit;
  const cont = body.processes.find((q) => q.type === 'continents');
  const { a2 } = lowDegreeAxes(cont ? cont.seed : 0);
  const s = p.seed | 0;
  const pole = rand01(1, 91, 0, s) < 0.5 ? a2 : [-a2[0], -a2[1], -a2[2]];
  const g = Math.abs(pole[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t1 = vnorm(vcross(g, pole));
  const t2 = vcross(pole, t1);
  let best = -1, bk = 0;
  for (let k = 0; k < 8; k++) {
    const w = rand01(2, 92 + k, 0, s);
    if (w > best) { best = w; bk = k; }
  }
  const az = bk * (Math.PI / 4) + (rand01(3, 93, 0, s) - 0.5) * 0.3;
  const u = [
    t1[0] * Math.cos(az) + t2[0] * Math.sin(az),
    t1[1] * Math.cos(az) + t2[1] * Math.sin(az),
    t1[2] * Math.cos(az) + t2[2] * Math.sin(az),
  ];
  const f = { pole, u, n: vcross(pole, u), th0: p.arc?.[0] ?? 0.16, th1: p.arc?.[1] ?? 0.8 };
  RIFT_CACHE.set(key, f);
  return f;
}
export function riftDepthAt(d, f, p, R, seed, wallRad = 0) {
  const th = Math.atan2(vdot(d, f.u), vdot(d, f.pole));
  if (th < f.th0 - 0.05 || th > f.th1 + 0.05) return 0;
  const sv = Math.abs(vdot(d, f.n));
  const halfW0 = (p.width ?? 120000) / R;
  if (sv > 3.4 * halfW0) return 0;
  const taper = smoothstep(f.th0, f.th0 + 0.12, th) * (1 - smoothstep(f.th1 - 0.18, f.th1, th));
  if (taper <= 0.001) return 0;
  const halfW = halfW0 * (0.45 + 0.55 * taper) * 0.5;
  // broad flat floor + NARROW wall zone (~28% of the half-width ⇒ ~20°+ mean
  // wall slopes): a 42 km wall ramp (~9°) read as a sag, not a canyon —
  // Valles-class walls are steep and the strata/thermal bands terrace them.
  // wallRad widens the wall to the CALLER's Nyquist (procRift's band-limited
  // ladder): a level-2 cell is the wall's own width, so a single coarse stamp
  // upsampled to a 40-60 km smear; each level re-stamps the difference toward
  // the true width instead (the crater-onset logic applied to a profile).
  const w = Math.max(wallRad, 0.28 * halfW);
  const main = 1 - smoothstep(halfW - w, halfW, sv);
  // en-echelon side grabens, noise-segmented along the arc; uplifted shoulders
  const seg = smoothstep(0.35, 0.65, 0.5 + 0.5 * noise3(d[0] * 9, d[1] * 9, d[2] * 9, seed + 5));
  const side = Math.exp(-(((sv - 2.3 * halfW) / (0.5 * halfW)) ** 2)) * 0.28 * seg;
  const shoulder = -0.08 * Math.exp(-(((sv - 1.35 * halfW) / (0.4 * halfW)) ** 2));
  return (p.depth ?? 6000) * taper * (main + side + shoulder);
}
function procRift(ctx, p) {
  const { dirs, height, level, R, cell } = ctx;
  if (level < p.levels[0] || level > p.levels[1]) return;
  const f = riftFrame(ctx.body, p);
  const s = p.seed | 0;
  // band-limited wall ladder: level ℓ stamps profile(wall widened to 2.5
  // cells) minus the previous level's version — a telescoping sum that
  // converges to the true 28%-halfW wall once cells resolve it. The side
  // troughs/shoulders are identical in both terms, so the differences carry
  // only the wall sharpening (they stamp once, at the first level).
  const wl = 2.5 * (cell / R);
  const first = level === p.levels[0];
  const d = [0, 0, 0];
  for (let c = 0; c < N; c++) {
    d[0] = dirs[c * 3]; d[1] = dirs[c * 3 + 1]; d[2] = dirs[c * 3 + 2];
    const cur = riftDepthAt(d, f, p, R, s, wl);
    height[c] -= first ? cur : cur - riftDepthAt(d, f, p, R, s, wl * 2);
  }
}

// tectonism (round 12): the stress CONTEXT write (overwrite per level — the
// procContext pattern, LOD-consistent) + ANCHORED-WAVE-PACKET stamps. The
// oriented-pattern primitive: a phase dotted with an axis tangentialized at
// the evaluated cell is IDENTICALLY ZERO (ê ⊥ dir — the round-9 diamond-
// cross-hatch trap, shaders.js ripple comment); the axis must be FROZEN over
// a neighbourhood. Anchors live on the body-fixed 3D lattice (the crater
// discipline): each evaluates its eigen-axis once, AT the anchor, and stamps
// a windowed plane wave s = (R·dir)·ê_a/λ. Anchors with equal axes produce
// the identical phase field — crests run continuously across packets; where
// the stress frame turns, packets disagree and defects/en-echelon stepping
// EMERGE. Wrinkle ridges where compression exceeds τc (asymmetric vergent
// ribbons ⊥ the compression eigendirection — concentric around basins and
// the swell periphery); grabens where extension exceeds τe (sparse paired-
// scarp troughs ⊥ extension — radial fans on the dome, arcuate rilles at
// basin margins). Fully closed-form: no field reads, valid to the full
// raster, no halo caveat anywhere.
const TECT_ONSET = 0.55;
function procTect(ctx, p) {
  const { dirs, height, level, R, cell, fields } = ctx;
  const src = stressSources(ctx.body, p);
  const stress = fields.stress;
  const t = {};
  const d = [0, 0, 0];
  for (let c = 0; c < N; c++) {
    d[0] = dirs[c * 3]; d[1] = dirs[c * 3 + 1]; d[2] = dirs[c * 3 + 2];
    stress[c] = eigDominant(stressTensor(d, src, t));
  }
  // ---- anchored stamps at the recipe's stamp bands ----
  const sl = p.stampLevels ?? [8, 12];
  const faceArc = (Math.PI / 2) * R;
  const s = (p.seed | 0);
  const tauC = p.tauC ?? 0.25, tauE = p.tauE ?? 0.3;
  const rAmp = p.ridgeAmp ?? 0, gAmp = p.grabenAmp ?? 0;
  if (rAmp <= 0 && gAmp <= 0) return;
  for (let band = sl[0]; band <= sl[1]; band++) {
    const w = level === band ? (band < sl[1] ? TECT_ONSET : 1)
      : level === band + 1 ? 1 - TECT_ONSET : 0;
    if (w === 0) continue;
    const bandCell = faceArc / (TILE_RES << band);
    const lam = 18 * bandCell;              // ridge/graben SPACING at this band
    const decay = Math.pow(2, -0.7 * (band - sl[0]));
    stampTectPackets(ctx, src, {
      lam, w, decay, s: s + band * 97, tauC, tauE, rAmp, gAmp,
      sinF: R / (7 * lam), segF: R / (5 * lam),
    });
  }
}
function stampTectPackets(ctx, src, o) {
  const { dirs, height, R, fields } = ctx;
  const stress = fields.stress;
  const boxM = 6 * o.lam;                    // anchor lattice box edge, meters
  const RL = R / boxM;
  const reach = 1.6;                         // envelope reach, boxes
  // lattice bbox over the tile (crater pattern: corners + midpoints + center)
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const [ci, cj] of [[-HALO, -HALO], [70, -HALO], [-HALO, 70], [70, 70], [32, 32],
    [32, -HALO], [32, 70], [-HALO, 32], [70, 32]]) {
    const c = I(ci, cj);
    for (let k = 0; k < 3; k++) {
      const q = dirs[c * 3 + k] * RL;
      if (q < mn[k]) mn[k] = q;
      if (q > mx[k]) mx[k] = q;
    }
  }
  const m = Math.ceil(reach) + 1;
  const num = new Float32Array(N), den = new Float32Array(N);
  const numG = new Float32Array(N), denG = new Float32Array(N);
  const t = {};
  let any = false;
  for (let bx = Math.floor(mn[0]) - m; bx <= Math.floor(mx[0]) + m; bx++)
    for (let by = Math.floor(mn[1]) - m; by <= Math.floor(mx[1]) + m; by++)
      for (let bz = Math.floor(mn[2]) - m; bz <= Math.floor(mx[2]) + m; bz++) {
        const ax = bx + 0.2 + 0.6 * rand01(bx, by, bz, o.s + 1);
        const ay = by + 0.2 + 0.6 * rand01(bx, by, bz, o.s + 2);
        const az = bz + 0.2 + 0.6 * rand01(bx, by, bz, o.s + 3);
        const rl = Math.hypot(ax, ay, az);
        if (Math.abs(rl - RL) > 0.75) continue;
        const a = [ax / rl, ay / rl, az / rl];
        stressTensor(a, src, t);
        const mid = (t.txx + t.tyy) * 0.5;
        const q = Math.sqrt(((t.txx - t.tyy) * 0.5) ** 2 + t.txy * t.txy);
        const lo = mid - q, hi = mid + q;
        const phiHi = 0.5 * Math.atan2(2 * t.txy, t.txx - t.tyy);
        // modes at this anchor: ridge if compression beats τc (across-axis =
        // the compression eigendirection), graben if extension beats τe
        const modes = [];
        if (lo < -o.tauC && o.rAmp > 0) modes.push({ g: false, phi: phiHi + Math.PI / 2 });
        if (hi > o.tauE && o.gAmp > 0 && rand01(bx, by, bz, o.s + 4) < 0.4) modes.push({ g: true, phi: phiHi });
        if (!modes.length) continue;
        any = true;
        for (const md of modes) {
          const ex = [
            t.e[0] * Math.cos(md.phi) + t.n[0] * Math.sin(md.phi),
            t.e[1] * Math.cos(md.phi) + t.n[1] * Math.sin(md.phi),
            t.e[2] * Math.cos(md.phi) + t.n[2] * Math.sin(md.phi),
          ];
          // rasterize the packet: every raster cell within envelope reach
          // (giant-safe: exact 3D distance test, no gnomonic windowing needed
          // at these packet sizes relative to the tile scan)
          const phA = rand01(bx, by, bz, o.s + 6); // per-anchor phase (cycles)
          for (let c = 0; c < N; c++) {
            const dx = dirs[c * 3] - a[0], dy = dirs[c * 3 + 1] - a[1], dz = dirs[c * 3 + 2] - a[2];
            const dist = R * Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > reach * boxM) continue;
            const env = (1 - (dist / (reach * boxM)) ** 2) ** 2;
            // frozen-axis plane wave in ANCHOR-RELATIVE coordinates + a hash
            // phase (Gabor form). An absolute-position projection is
            // hypersensitive — R/λ ~ 1e4 turns a 0.006° axis difference into
            // a full cycle, so packets NEVER cohere and the blend averages
            // random phases (measured ×0.42 amplitude residual). Relative
            // phase keeps trains coherent within packets; defects land at
            // packet boundaries — which is where real en-echelon segmentation
            // lives anyway.
            const ph = (R * (dx * ex[0] + dy * ex[1] + dz * ex[2])) / o.lam + phA
              + 0.45 * noise3(dirs[c * 3] * o.sinF, dirs[c * 3 + 1] * o.sinF, dirs[c * 3 + 2] * o.sinF, o.s + 7);
            const u = ph - Math.floor(ph);
            let prof;
            if (md.g) {
              // paired-scarp trough: flat floor, smooth walls, slight rims
              const x = Math.abs(u - 0.5) / 0.16;
              prof = x < 1 ? -(1 - x * x) * (1 - x * x) : 0;
              prof += 0.15 * Math.exp(-(((Math.abs(u - 0.5) - 0.2) / 0.05) ** 2));
            } else {
              // asymmetric vergent ridge (one flank steeper — thrust side)
              const dt = u - 0.5;
              const x = dt < 0 ? -dt / 0.17 : dt / 0.09;
              prof = x < 1 ? (1 - x * x) * (1 - x * x) : 0;
            }
            const seg = 0.5 + 0.5 * noise3(dirs[c * 3] * o.segF, dirs[c * 3 + 1] * o.segF, dirs[c * 3 + 2] * o.segF, o.s + 9);
            prof *= smoothstep(0.25, 0.6, seg);
            if (md.g) { numG[c] += env * prof; denG[c] += env; }
            else { num[c] += env * prof; den[c] += env; }
          }
        }
      }
  if (!any) return;
  // partition-of-unity blend; the CELL's own stress gates amplitude smoothly
  // (round-13 R6 flooded-basin ridge gate was investigated and REGISTERED
  // FORWARD: Luna's stress-source basins and its provinces-maria are distinct
  // populations — mare≡0 across the largest ridge-bearing basin — so a
  // mare-keyed ridge boost/suppression has no co-located features to act on;
  // unifying the two populations is structural, not a residue tune.)
  for (let c = 0; c < N; c++) {
    const sg = stress[c];
    if (den[c] > 1e-4 && sg < -o.tauC * 0.7) {
      const g = smoothstep(o.tauC * 0.7, o.tauC * 1.6, -sg);
      height[c] += o.w * o.rAmp * o.decay * g * (num[c] / den[c]);
    }
    if (denG[c] > 1e-4 && sg > o.tauE * 0.7) {
      const g = smoothstep(o.tauE * 0.7, o.tauE * 1.6, sg);
      height[c] += o.w * o.gAmp * o.decay * g * (numG[c] / denG[c]);
    }
  }
}

// age/youth context (round 12; CONCEPT §4 names age a context field). An
// OVERWRITE per level — the procContext pattern — never accretive-max: max
// over level-drifting inputs accumulates monotonically and the albedo
// consumers would violate §5 (design review). Every term re-derives from
// closed forms (shared edifice/rift helpers) or per-cell field VALUES; the
// regional noise is FIXED-frequency (never freqAt-scaled). 0 = ancient.
function procAge(ctx, p) {
  const { dirs, level, R, fields } = ctx;
  const youth = fields.youth, mare = fields.mare;
  const kMare = p.kMare ?? 0;
  const s = p.seed | 0;
  const ed = ctx.body.processes.find((q) => q.type === 'edifice');
  const sites = ed ? edificeSites(ctx.body, ed) : [];
  const rp = ctx.body.processes.find((q) => q.type === 'rift');
  const rf = rp ? riftFrame(ctx.body, rp) : null;
  const d = [0, 0, 0];
  for (let c = 0; c < N; c++) {
    d[0] = dirs[c * 3]; d[1] = dirs[c * 3 + 1]; d[2] = dirs[c * 3 + 2];
    const nse = 0.5 + 0.5 * noise3(d[0] * 2.6, d[1] * 2.6, d[2] * 2.6, s);
    let y = kMare * mare[c] * (0.55 + 0.45 * nse);
    for (const site of sites) {
      const dx = d[0] - site.v[0], dy = d[1] - site.v[1], dz = d[2] - site.v[2];
      const r = R * Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r < site.Re) {
        const b = 1 - (r / site.Re) * (r / site.Re);
        y = Math.max(y, 0.85 * Math.pow(b, 1.5));
      }
    }
    if (rf) {
      const rd = riftDepthAt(d, rf, rp, R, rp.seed | 0);
      if (rd > 0) y = Math.max(y, 0.35 * smoothstep(0.15, 0.7, rd / (rp.depth ?? 6000)));
    }
    youth[c] = clamp(y, 0, 1);
  }
}

// coherent bedforms (round 12): dune SYSTEMS, not bumps — anchored wave
// packets (see procTect) whose axis is the [global] WIND sampled at each
// anchor (planet-wide, level-independent, available outside the raster).
// Crest spacing is the band's λ; defect merging emerges where the wind field
// turns; slip-face asymmetry rides the phase direction (ŵ is a true vector,
// not an orientation). Amplitude keys on the SAND-SUPPLY field (fines — the
// catena already drains fines off slopes, so confinement to basins is free),
// the wind magnitude, and windward scour — dunes live where sand CAN
// accumulate. The same mechanism with an 'ice' gate is Tellus's polar
// megadune agent (the anti-overfit gate's second body). Windless Luna has no
// global entry and no bedforms — the negative control is structural.
const BED_ONSET = 0.55;
function procBedforms(ctx, p) {
  const { dirs, height, level, R, fields } = ctx;
  const ge = ctx.body.processes.find((q) => q.type === 'global');
  if (!ge || !ge.wind) return;
  const g = globalFor(ctx.body, ge);
  if (!g.hasWind) return;
  const faceArc = (Math.PI / 2) * R;
  const gate = fields[p.gate?.field ?? 'fines'];
  const gLo = p.gate?.lo ?? 0.06, gHi = p.gate?.hi ?? 0.3;
  const moist = fields.moist, expo = fields.windExpo, uplift = fields.uplift;
  const wX = fields.windX, wY = fields.windY, wZ = fields.windZ;
  // regional sand supply (instrumented finding: catena fines are hollow-
  // confined — real ERGS need a province-scale term): sand accumulates in
  // LEE LOWLAND basins — (1−uplift)·lee(windExpo), the G4 routing law at
  // region scale. Value reads only; regK is recipe data (0 = local-only).
  const regK = p.regK ?? 0;
  // round 16 — dune AXIS (recipe data, §6 generalisation): 'transverse' (default,
  // barchanoid) has crests ⊥ wind; 'longitudinal' (Titan's E-W belt) has crests ∥
  // wind. slipK is overridden AT ITS BINDING here so profMean (below) AND prof (in
  // the loop) both track it — desync-proof (panel bedforms-axis-profMean); slipK→0
  // is the symmetric profile a longitudinal (seif) dune wants. Existing entries have
  // no p.axis ⇒ byte-identical.
  const longitud = p.axis === 'longitudinal';
  const slipK = longitud ? 0 : (p.slipK ?? 0.7), sharp = p.sharp ?? 2.2;
  // deterministic profile mean (64-sample midpoint rule) so the band adds
  // relief, not bias — mean-preserving under the §7 hand-down
  let profMean = 0;
  for (let i = 0; i < 64; i++) {
    const u = (i + 0.5) / 64;
    profMean += Math.pow(Math.sin(Math.PI * Math.pow(u, 1 + slipK)), sharp);
  }
  profMean /= 64;
  for (let band = p.levels[0]; band <= p.levels[1]; band++) {
    const w = level === band ? (band < p.levels[1] ? BED_ONSET : 1)
      : level === band + 1 ? 1 - BED_ONSET : 0;
    if (w === 0) continue;
    const lam = (p.lamK ?? 9) * (faceArc / (TILE_RES << band));
    const amp = (p.aspect ?? 0.05) * lam;
    const boxM = 5 * lam, RL = R / boxM, reach = 1.6;
    const s = (p.seed | 0) + band * 89;
    const defF = R / ((p.defLam ?? 7) * lam), segF = R / (8 * lam);
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const [ci, cj] of [[-HALO, -HALO], [70, -HALO], [-HALO, 70], [70, 70], [32, 32],
      [32, -HALO], [32, 70], [-HALO, 32], [70, 32]]) {
      const c = I(ci, cj);
      for (let k = 0; k < 3; k++) {
        const q = dirs[c * 3 + k] * RL;
        if (q < mn[k]) mn[k] = q;
        if (q > mx[k]) mx[k] = q;
      }
    }
    const m = Math.ceil(reach) + 1;
    const num = new Float32Array(N), den = new Float32Array(N);
    let any = false;
    for (let bx = Math.floor(mn[0]) - m; bx <= Math.floor(mx[0]) + m; bx++)
      for (let by = Math.floor(mn[1]) - m; by <= Math.floor(mx[1]) + m; by++)
        for (let bz = Math.floor(mn[2]) - m; bz <= Math.floor(mx[2]) + m; bz++) {
          const ax = bx + 0.2 + 0.6 * rand01(bx, by, bz, s + 1);
          const ay = by + 0.2 + 0.6 * rand01(bx, by, bz, s + 2);
          const az = bz + 0.2 + 0.6 * rand01(bx, by, bz, s + 3);
          const rl = Math.hypot(ax, ay, az);
          if (Math.abs(rl - RL) > 0.75) continue;
          const a = [ax / rl, ay / rl, az / rl];
          // the wind at the ANCHOR, frozen — tangentialized against â (legal:
          // it is dotted with positions NEAR the anchor, never with â itself)
          const wv = [g.sample('windX', a), g.sample('windY', a), g.sample('windZ', a)];
          const wm = Math.hypot(wv[0], wv[1], wv[2]);
          if (wm < 0.12) continue;
          const wd = vdot(wv, a);
          const wt = [wv[0] - wd * a[0], wv[1] - wd * a[1], wv[2] - wd * a[2]];
          const wtl = Math.hypot(wt[0], wt[1], wt[2]);
          if (wtl < 0.05) continue;
          const ex = [wt[0] / wtl, wt[1] / wtl, wt[2] / wtl];
          any = true;
          // longitudinal: project the Gabor phase on the CROSS-wind tangent
          // (cross(â, ex), unit since â⊥ex) so crests run PARALLEL to the wind; AND
          // share ONE phase origin (phA=0) so adjacent along-crest packets stay in
          // phase — the panel proved random phA + segment noise chops longitudinal
          // ridges into barchan-dashes (panel longitudinal-dune-decorrelation).
          const proj = longitud
            ? [a[1] * ex[2] - a[2] * ex[1], a[2] * ex[0] - a[0] * ex[2], a[0] * ex[1] - a[1] * ex[0]]
            : ex;
          const phA = longitud ? 0 : rand01(bx, by, bz, s + 4); // per-anchor phase (cycles)
          for (let c = 0; c < N; c++) {
            const dx = dirs[c * 3] - a[0], dy = dirs[c * 3 + 1] - a[1], dz = dirs[c * 3 + 2] - a[2];
            const dist = R * Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > reach * boxM) continue;
            let env = (1 - (dist / (reach * boxM)) ** 2) ** 2;
            // a packet extends only as far as its frozen wind agrees with the
            // LOCAL wind: where deflection turns the field, near-orthogonal
            // packets overlapped in the blend and printed right-angle PLAID
            // (probe finding) — real dunes realign instead of superposing
            const wm3 = Math.hypot(wX[c], wY[c], wZ[c]);
            if (wm3 > 1e-5) {
              const align = Math.abs(ex[0] * wX[c] + ex[1] * wY[c] + ex[2] * wZ[c]) / wm3;
              env *= smoothstep(0.35, 0.75, align);
              if (env <= 1e-5) continue;
            }
            // anchor-relative Gabor phase (see stampTectPackets: the absolute
            // projection decorrelates at R/λ sensitivity and cancels ~60% of
            // the amplitude in the partition blend)
            const ph = (R * (dx * proj[0] + dy * proj[1] + dz * proj[2])) / lam + phA
              + (p.defAmp ?? 0.8) * noise3(dirs[c * 3] * defF, dirs[c * 3 + 1] * defF, dirs[c * 3 + 2] * defF, s + 5);
            const u = ph - Math.floor(ph);
            // slip-face asymmetry: u^k compresses the stoss (upwind) rise and
            // steepens the lee edge — the sign rides the TRUE wind direction
            const prof = Math.pow(Math.sin(Math.PI * Math.pow(u, 1 + slipK)), sharp) - profMean;
            // along-crest amplitude noise: FLATTENED for longitudinal (else it chops
            // the continuous ridge into dashes — panel decorrelation), full for barchans
            const seg = longitud
              ? 0.85 + 0.15 * noise3(dirs[c * 3] * segF, dirs[c * 3 + 1] * segF, dirs[c * 3 + 2] * segF, s + 6)
              : 0.55 + 0.45 * noise3(dirs[c * 3] * segF, dirs[c * 3 + 1] * segF, dirs[c * 3 + 2] * segF, s + 6);
            num[c] += env * prof * seg;
            den[c] += env;
          }
        }
    if (!any) continue;
    for (let c = 0; c < N; c++) {
      if (den[c] <= 1e-4) continue;
      const reg = regK > 0
        ? regK * (1 - smoothstep(0.05, 0.35, uplift[c]))
          * (0.35 + 0.65 * smoothstep(0.0, 0.45, -expo[c]))
        : 0;
      let A = smoothstep(gLo, gHi, Math.max(gate[c], reg));
      if (A <= 0.002) continue;
      const wm2 = Math.hypot(wX[c], wY[c], wZ[c]);
      A *= smoothstep(0.12, 0.4, wm2);
      A *= 1 - 0.45 * Math.max(expo[c], 0);          // windward scour thins sand
      if (p.dry) A *= 1 - smoothstep(p.dry.lo, p.dry.hi, moist[c]);
      // equatorial dune belt (round 16, opt-in): full inside |lat| < latBelt°,
      // fading over the next 15° — Titan's sand seas are confined to |lat|<30
      // (FIELDS carries no 'lat' gate, so this is a small principled knob, panel
      // titan-dune-lat-gate). Default-absent ⇒ no gate, byte-identical.
      if (p.latBelt != null) {
        A *= 1 - smoothstep(Math.sin((p.latBelt * Math.PI) / 180),
          Math.sin(((p.latBelt + 15) * Math.PI) / 180), Math.abs(dirs[c * 3 + 1]));
        if (A <= 0.002) continue;
      }
      height[c] += w * amp * A * (num[c] / den[c]);
    }
  }
}

// ===========================================================================
// round 18 — Phase 5 cryo pack (Europa + Pluto). New process FAMILIES (§6):
// engine implements the family, the recipe supplies the params. Byte-identical
// for every legacy body — the loop only dispatches a type a body LISTS, so a
// body that names none of these bakes bit-for-bit as before (no compile define,
// no body-class branch). Two new albedo FIELDS ride the ATLAS L6 spares
// (lineaAlb, tholinAlb); the nitrogen glacier writes the EXISTING `ice` field
// (N2 IS ice — the disc/ground brighten it for free), so the pre-code panel's
// signed-cryoProv zero-crossing seam never exists. Existence is always a
// closed-form fn of the body-fixed direction (Worley/fbm on dirs), level-stable
// and seam-free; baked FIELDS only modulate the EXPRESSION per output cell (the
// crater `mare` discipline) — never gate a feature's existence on an inherited
// field (the pre-code onset-gate-not-level-stable finding).
// ---------------------------------------------------------------------------
const norm3 = (v) => { const l = 1 / (Math.hypot(v[0], v[1], v[2]) || 1); return [v[0] * l, v[1] * l, v[2] * l]; };

// F1/F2 cellular (Worley) on a body-fixed 3D lattice at angular frequency `freq`.
// Returns nearest / 2nd-nearest feature distances in GRID units and the winning
// cell's integer coords (for per-cell hashes). Pure fn of direction ⇒ identical
// at every level and across faces (the crater-lattice seam discipline).
function worley3(x, y, z, freq, seed, jitter = 0.85) {
  const gx = x * freq, gy = y * freq, gz = z * freq;
  const bx = Math.floor(gx), by = Math.floor(gy), bz = Math.floor(gz);
  let d1 = 1e9, d2 = 1e9, ix = 0, iy = 0, iz = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const ox = bx + i, oy = by + j, oz = bz + k;
    const fx = ox + 0.5 + (rand01(ox, oy, oz, seed + 1) - 0.5) * jitter;
    const fy = oy + 0.5 + (rand01(ox, oy, oz, seed + 2) - 0.5) * jitter;
    const fz = oz + 0.5 + (rand01(ox, oy, oz, seed + 3) - 0.5) * jitter;
    const dx = gx - fx, dy = gy - fy, dz = gz - fz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < d1) { d2 = d1; d1 = d; ix = ox; iy = oy; iz = oz; }
    else if (d < d2) { d2 = d; }
  }
  return { d1, d2, ix, iy, iz };
}

// twin-hump double-ridge over u∈[0,1): two ridge crests flanking a medial
// trough — the Europa lineament signature. crest ≈ the ridge tops (for albedo).
function doubleRidge(u) {
  const d = u - 0.5, a = Math.abs(d);
  // TWO-sided clamp: a one-sided `x<1` left the far tail (|t|→0, x≪−1) nonzero,
  // printing a spurious CREST on the medial line that inverted the double ridge
  // into a single hump (post-impl cryo-1). The hump is now zero outside |x|<1.
  const hump = (t) => { const x = (Math.abs(t) - 0.22) / 0.15; return Math.abs(x) < 1 ? (1 - x * x) * (1 - x * x) : 0; };
  const ridge = hump(d);
  const trough = a < 0.11 ? -0.55 * (1 - (a / 0.11) ** 2) : 0;
  return { relief: ridge + trough, crest: ridge };
}

// tidal LINEAE (Europa): several age-rotated families of arcuate double ridges,
// each a set of concentric small circles about a family pole (the NSR/secular
// stress orientation, re-derived closed-form from the polar angle θ=acos(d̂·p̂) —
// no per-cell tangent projection, so the R/λ precision cliff and the ê⊥dir
// degeneracy cannot occur). The bright fracture ALBEDO (lineaAlb) is a LEVEL-
// INDEPENDENT closed-form OVERWRITE every level (procContext pattern) so it
// arrives WHOLE and never rides the height onset (the pre-code lineaAlb-onset
// KILLER: albedo must arrive whole, never the two-level ramp). The ridge HEIGHT
// blends in over two levels at ridgeLevel (procTect onset — no double-count).
function procLineae(ctx, p) {
  const { dirs, height, level, fields } = ctx;
  const lineaAlb = fields.lineaAlb;
  const s = p.seed | 0;
  const fams = (p.families || []).map((F) => ({ ...F, pole: norm3(F.pole) }));
  const rl = p.ridgeLevel ?? (p.levels[0] + 3);
  const wH = level === rl ? 0.55 : level === rl + 1 ? 0.45 : 0;
  for (let c = 0; c < N; c++) {
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    let alb = 0, relief = 0;
    for (let fi = 0; fi < fams.length; fi++) {
      const F = fams[fi], pl = F.pole;
      const pd = clamp(x * pl[0] + y * pl[1] + z * pl[2], -1, 1);
      // FIXED-frequency warp (level-independent ⇒ the overwrite never LOD-steps)
      const warp = (F.warp ?? 0.11) * fbm3(x * 3.1, y * 3.1, z * 3.1, s + fi * 31 + 11, 4, 2.2, 0.55);
      const th = Math.acos(pd) + warp;
      const u = th / (F.lam ?? 0.16) + (F.phase ?? 0);
      const dr = doubleRidge(u - Math.floor(u));
      const fade = F.fade ?? 1;
      relief += (F.amp ?? 320) * dr.relief * fade;
      alb += (F.albK ?? 0.6) * dr.crest * fade;
    }
    lineaAlb[c] = clamp(alb, 0, 1); // OVERWRITE — arrives whole, LOD-stable
    if (wH) height[c] += wH * relief;
  }
}

// CHAOS terrain (Europa): position-pure block jumble within a closed-form
// chaos-margin field. Blocks are body-fixed-lattice cells with a hashed vertical
// offset + a mild in-cell tilt (jostled rafts), gated by the fbm margin — NOT a
// stateful diffusion (the block-jumble would fight the 1-cell/iter halo budget)
// and NOT an inherited-field existence gate (level-stable margin). Two-level
// onset on the relief.
function procChaos(ctx, p) {
  const { dirs, height, level } = ctx;
  const bl = p.blockLevel ?? (p.levels[0] + 2);
  const wH = level === bl ? 0.55 : level === bl + 1 ? 0.45 : 0;
  if (wH === 0) return;
  const s = p.seed | 0, freq = p.blockFreq ?? 55, mf = p.marginFreq ?? 2.3, amp = p.blockH ?? 700;
  for (let c = 0; c < N; c++) {
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    const marg = smoothstep(p.marginLo ?? 0.30, p.marginHi ?? 0.56,
      fbm3(x * mf, y * mf, z * mf, s + 5, 4, 2.2, 0.55));
    if (marg < 0.02) continue;
    const w = worley3(x, y, z, freq, s);
    const off = rand01(w.ix, w.iy, w.iz, s + 21) - 0.42;             // raised/dropped raft
    const tiltK = (rand01(w.ix, w.iy, w.iz, s + 22) - 0.5) * 2;
    const inCell = smoothstep(0.0, 0.5, w.d2 - w.d1);                // interior flat, margins broken
    height[c] += wH * marg * amp * (off + tiltK * 0.5 * (w.d1 - 0.4)) * inCell;
  }
}

// NITROGEN GLACIER (Pluto — Sputnik Planitia): an AUTHORED closed-form basin
// (not a regional-low flood — one known 1000-km feature). The bright N2 ICE is
// re-asserted into the EXISTING ice field EVERY level (level-stable arc mask) so
// procContext's per-level ice overwrite cannot erase it; the basin FLOOR is
// flattened ONCE at levels[0] (procProvinces pattern — the 5×5 regional kernel
// is pure here because only position stamps have run; upsample carries it, no
// double-flatten, no LOD sink). Must run AFTER context, BEFORE thermal.
function procGlacier(ctx, p) {
  const { dirs, height, level, fields } = ctx;
  const ice = fields.ice;
  const R = ctx.body.R, s = p.seed | 0;
  const dn = norm3(p.dir), rM = p.r, iceK = p.iceK ?? 1, warpK = p.warp ?? 0.16;
  for (let c = 0; c < N; c++) {
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    const arc = Math.acos(clamp(x * dn[0] + y * dn[1] + z * dn[2], -1, 1)) * R
      + warpK * rM * fbm3(x * 4, y * 4, z * 4, s + 3, 4, 2.2, 0.55);
    const m = smoothstep(rM, rM * 0.72, arc);
    if (m > 1e-3) ice[c] = Math.max(ice[c], iceK * m);
  }
  if (level !== p.levels[0]) return;
  const flatten = p.flatten ?? 0.85, floor = p.floor ?? -600;
  const R2 = 2, lim = HALO - R2;
  const hs = new Float32Array(N);
  for (let j = -lim; j <= TILE_RES + lim; j++)
    for (let i = -lim; i <= TILE_RES + lim; i++) {
      let sum = 0;
      for (let dj = -R2; dj <= R2; dj++) for (let di = -R2; di <= R2; di++) sum += height[I(i + di, j + dj)];
      hs[I(i, j)] = sum / 25;
    }
  for (let j = -lim; j <= TILE_RES + lim; j++)
    for (let i = -lim; i <= TILE_RES + lim; i++) {
      const c = I(i, j), x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
      // SAME warp as the ice re-assertion above (post-impl cryo-2: an un-warped
      // flatten arc put the flattened basin on a different boundary than the
      // bright-ice extent — the lobate shoreline and the flat floor disagreed)
      const arc = Math.acos(clamp(x * dn[0] + y * dn[1] + z * dn[2], -1, 1)) * R
        + warpK * rM * fbm3(x * 4, y * 4, z * 4, s + 3, 4, 2.2, 0.55);
      const m = smoothstep(rM, rM * 0.72, arc);
      if (m > 1e-3) height[c] = lerp(height[c], Math.min(hs[c], floor), flatten * m);
    }
}

// POLYGONS (Pluto): ONE parameterized Voronoi family (§6) — convection cells on
// the glacier (domed interiors, Sputnik) OR contraction cracks (thermal fracture
// network). Position-pure Worley on d̂ (existence is closed-form, level-stable);
// the inherited `ice` field only MODULATES amplitude per output cell (halo-valid
// expression modulation, the crater `mare` pattern). Height only. Two-level onset.
function procPolygons(ctx, p) {
  const { dirs, height, level, fields } = ctx;
  const ice = fields.ice;
  const bl = p.polyLevel ?? (p.levels[0] + 1);
  const wH = level === bl ? 0.55 : level === bl + 1 ? 0.45 : 0;
  if (wH === 0) return;
  const s = p.seed | 0, freq = p.freq ?? 90, amp = p.depth ?? 60;
  const conv = (p.mode ?? 'contraction') === 'convection';
  const iceGate = p.iceGate ?? 1;
  for (let c = 0; c < N; c++) {
    const g = clamp(ice[c] * iceGate, 0, 1);
    if (g < 0.02) continue;
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    const w = worley3(x, y, z, freq, s);
    const prof = conv
      ? (0.5 - w.d1) - 0.4 * smoothstep(0.14, 0.0, w.d2 - w.d1)   // domed cells + boundary troughs
      : -smoothstep(0.10, 0.0, w.d2 - w.d1);                       // crack network (edges incise)
    height[c] += wH * amp * g * prof;
  }
}

// SUBLIMATION pits / blades / penitentes (Pluto): fine Worley pits + a
// directional corrugation along a recipe-declared mean-INSOLATION axis (the bake
// is sun-independent §5, time is closed-form §9 — orientation is a datum, never
// the live sun). Gated (expression) on the ice field. Height only, two-level onset.
function procSublimation(ctx, p) {
  const { dirs, height, level, fields } = ctx;
  const ice = fields.ice;
  const bl = p.subLevel ?? p.levels[0];
  const wH = level === bl ? 0.55 : level === bl + 1 ? 0.45 : 0;
  if (wH === 0) return;
  const s = p.seed | 0, freq = p.freq ?? 380, amp = p.pitDepth ?? 26, bladeK = p.bladeK ?? 0.5;
  const ax = norm3(p.bladeAxis ?? [1, 0, 0]);
  for (let c = 0; c < N; c++) {
    const g = clamp(ice[c], 0, 1);
    if (g < 0.05) continue;
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    const w = worley3(x, y, z, freq, s);
    const pit = -smoothstep(0.5, 0.05, w.d1);
    const blade = bladeK * 0.5 * Math.sin((x * ax[0] + y * ax[1] + z * ax[2]) * freq * 0.5);
    height[c] += wH * amp * g * (pit + blade);
  }
}

// THOLIN hemispheric albedo province (Pluto — Cthulhu Macula): a dark body-fixed
// LONGITUDE band written to tholinAlb. LEVEL-INDEPENDENT closed-form OVERWRITE
// every level (procContext pattern) — arrives whole, LOD-stable, mirrored in
// bakeDiscMap after the ice lerp. seasonalCap is latitude-only and cannot express
// a longitude province, so this is a bake province (the pre-code materials note).
function procTholin(ctx, p) {
  const { dirs, fields } = ctx;
  const tholinAlb = fields.tholinAlb;
  const s = p.seed | 0;
  const placement = p.placement ?? 'longitude';
  const lonC = (p.lonCenter ?? 0) * DEG, lonW = (p.lonWidth ?? 90) * DEG;
  const latB = (p.latBand ?? 35) * DEG, strength = p.strength ?? 0.8;
  const capLat = (p.capLatDeg ?? 55) * DEG, capSoft = (p.capSoftDeg ?? 12) * DEG;
  for (let c = 0; c < N; c++) {
    const x = dirs[c * 3], y = dirs[c * 3 + 1], z = dirs[c * 3 + 2];
    const lon = Math.atan2(z, x), lat = Math.asin(clamp(y, -1, 1));
    let dlon = lon - lonC;
    while (dlon > Math.PI) dlon -= 2 * Math.PI;
    while (dlon < -Math.PI) dlon += 2 * Math.PI;
    const warp = 0.18 * fbm3(x * 3, y * 3, z * 3, s + 7, 4, 2.2, 0.55);
    const lonM = smoothstep(lonW, lonW * 0.55, Math.abs(dlon) - warp);
    const latM = smoothstep(latB, latB * 0.5, Math.abs(lat));
    const polarM = smoothstep(capLat - capSoft, capLat + capSoft, Math.abs(lat) + warp * 0.25);
    tholinAlb[c] = clamp(strength * (placement === 'polar' ? polarM : lonM * latM), 0, 1);
  }
}

const PROCESSES = {
  continents: procContinents,
  provinces: procProvinces,
  fbmBand: procFbmBand,
  craters: procCraters,
  context: procContext,
  global: procGlobal,
  biomes: procBiomes,
  incision: procIncision,
  invert: procInvert,
  strata: procStrata,
  thermal: procThermal,
  materials: procMaterials,
  catena: procCatena,
  ao: procAo,
  horizon: procHorizon,
  edifice: procEdifice,
  rift: procRift,
  tect: procTect,
  age: procAge,
  bedforms: procBedforms,
  // round 18 — Phase 5 cryo pack (Europa + Pluto)
  lineae: procLineae,
  chaos: procChaos,
  glacier: procGlacier,
  polygons: procPolygons,
  sublimation: procSublimation,
  tholin: procTholin,
};

// ---------------------------------------------------------------------------
// upsampling (the one fixed kernel — CONCEPT §2)
// ---------------------------------------------------------------------------
function upsampleCubic(dst, src, ox, oy) {
  const row = new Float64Array(4);
  for (let j = -HALO; j <= 70; j++) {
    const q = oy + j / 2, qi = Math.floor(q), fy = q - qi;
    for (let i = -HALO; i <= 70; i++) {
      const p = ox + i / 2, pi = Math.floor(p), fx = p - pi;
      for (let r = 0; r < 4; r++) {
        const jj = qi - 1 + r;
        row[r] = catmullRom(src[I(pi - 1, jj)], src[I(pi, jj)], src[I(pi + 1, jj)], src[I(pi + 2, jj)], fx);
      }
      dst[I(i, j)] = catmullRom(row[0], row[1], row[2], row[3], fy);
    }
  }
}
function upsampleBilinear(dst, src, ox, oy) {
  for (let j = -HALO; j <= 70; j++) {
    const q = oy + j / 2, qi = Math.floor(q), fy = q - qi;
    for (let i = -HALO; i <= 70; i++) {
      const p = ox + i / 2, pi = Math.floor(p), fx = p - pi;
      const a = src[I(pi, qi)] * (1 - fx) + src[I(pi + 1, qi)] * fx;
      const b = src[I(pi, qi + 1)] * (1 - fx) + src[I(pi + 1, qi + 1)] * fx;
      dst[I(i, j)] = a * (1 - fy) + b * fy;
    }
  }
}

// ---------------------------------------------------------------------------
// hot recipe reload (Phase T tuning loop): band-selective cache invalidation.
// Changing a level-8+ process must not rebake levels 0-7 — the invalidation
// level is the shallowest band any changed/added/removed process owns.
// ---------------------------------------------------------------------------
// key-order-independent structural serialization (a UI patch may reorder keys)
function stableStr(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStr).join(',') + ']';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStr(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
// The shallowest bake level at which two process lists can diverge. Everything
// below it is byte-identical (a coarse tile never runs a deeper band and never
// reads a finer tile), so a reload need only invalidate level >= this value.
// Returns Infinity when the lists are structurally identical (no rebake).
export function invalidationLevel(oldProcs, newProcs) {
  const n = Math.max(oldProcs.length, newProcs.length);
  let lvl = Infinity;
  for (let i = 0; i < n; i++) {
    const a = oldProcs[i], b = newProcs[i];
    if (a && b && stableStr(a) === stableStr(b)) continue;
    // added / removed / changed at index i: it can first contribute at the
    // shallowest first-band level of whichever entries exist here
    const los = [];
    if (a && a.levels) los.push(a.levels[0]);
    if (b && b.levels) los.push(b.levels[0]);
    lvl = Math.min(lvl, los.length ? Math.min(...los) : 0);
  }
  return lvl;
}

// ---------------------------------------------------------------------------
// the baker
// ---------------------------------------------------------------------------
export function makeBaker(body, { cacheMax = 700 } = {}) {
  const cache = new Map(); // "face/level/x/y" -> tile
  const faceArc = (Math.PI / 2) * body.R;
  const fig = figOf(body); // null for every legacy body (sphere = the common case)
  let insolation = new Map();
  const rebuildInsolation = () => {
    insolation = new Map();
    for (const p of body.processes ?? []) {
      if (p.type === 'context' && p.insolation) insolation.set(p, makeInsolationContext(body, p));
    }
  };
  rebuildInsolation();

  function bakeTile(face, level, x, y) {
    const key = `${face}/${level}/${x}/${y}`;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; } // LRU touch

    const parent = level > 0 ? bakeTile(face, level - 1, x >> 1, y >> 1) : null;

    const height = new Float32Array(N);
    const fields = {};
    for (const f of FIELDS) fields[f] = new Float32Array(N);
    if (parent) {
      upsampleCubic(height, parent.height, (x & 1) * 32, (y & 1) * 32);
      for (const f of FIELDS) upsampleBilinear(fields[f], parent.fields[f], (x & 1) * 32, (y & 1) * 32);
    } else {
      fields.ao.fill(1);
    }
    // geomorph source (Phase M): the pure parent upsample, before this level's
    // band stamps — a child at morph 0 renders its parent's exact surface
    const heightBase = new Float32Array(height);

    // per-cell geometry: exact uv from integer numerators so overlapping cells of
    // neighbouring tiles get bit-identical inputs (the §3 guarantee rests on this)
    const D = TILE_RES << level;
    const dirs = new Float64Array(N * 3);
    const edge = new Float32Array(N);
    const tmp = [0, 0, 0];
    for (let j = -HALO; j <= 70; j++) {
      const v = (y * TILE_RES + j) / D;
      for (let i = -HALO; i <= 70; i++) {
        const u = (x * TILE_RES + i) / D;
        faceUvToDir(face, u, v, tmp);
        const c = I(i, j);
        dirs[c * 3] = tmp[0]; dirs[c * 3 + 1] = tmp[1]; dirs[c * 3 + 2] = tmp[2];
        edge[c] = edgeMask(tmp);
      }
    }
    // figure bodies (round 17): per-cell base point q (the S=0 ray crossing —
    // pure fn of the shared direction, so overlapping cells stay bit-identical),
    // displacement direction m̂ = ∇S(q), and the per-cell METRIC (metres per
    // grid step, from central differences of q — face-consistent by
    // construction because it is derived from shared 3-D points, never from
    // face-local analytic axes). Stateful ops and FD normals read lu/lv where
    // the sphere path reads the one scalar `cell`.
    let pos = null, metL = null;
    if (fig) {
      pos = new Float64Array(N * 3);
      for (let j = -HALO; j <= 70; j++) {
        for (let i = -HALO; i <= 70; i++) {
          const c = I(i, j);
          const d = [dirs[c * 3], dirs[c * 3 + 1], dirs[c * 3 + 2]];
          const t = figRadial(fig, d);
          pos[c * 3] = d[0] * t; pos[c * 3 + 1] = d[1] * t; pos[c * 3 + 2] = d[2] * t;
        }
      }
      metL = { lu: new Float32Array(N), lv: new Float32Array(N) };
      for (let j = -HALO; j <= 70; j++) {
        for (let i = -HALO; i <= 70; i++) {
          const c = I(i, j);
          const iA = I(Math.max(i - 1, -HALO), j), iB = I(Math.min(i + 1, 70), j);
          const jA = I(i, Math.max(j - 1, -HALO)), jB = I(i, Math.min(j + 1, 70));
          const su = 1 / (Math.min(i + 1, 70) - Math.max(i - 1, -HALO));
          const sv = 1 / (Math.min(j + 1, 70) - Math.max(j - 1, -HALO));
          metL.lu[c] = Math.hypot(pos[iB * 3] - pos[iA * 3], pos[iB * 3 + 1] - pos[iA * 3 + 1], pos[iB * 3 + 2] - pos[iA * 3 + 2]) * su;
          metL.lv[c] = Math.hypot(pos[jB * 3] - pos[jA * 3], pos[jB * 3 + 1] - pos[jA * 3 + 1], pos[jB * 3 + 2] - pos[jA * 3 + 2]) * sv;
        }
      }
    }

    const ctx = {
      body, face, level, x, y, R: body.R,
      fig, pos, met: metL,
      cell: faceArc / D,
      faceBasis: FACE_BASIS[face],
      // scatter-lattice cell size (m): rockDensity feature-width floor — a
      // density band narrower than a few lattice cells strings its rocks into
      // a single-file queue (round-5 live report, bead-chain register row)
      rockCell: body.rocks ? faceArc / (TILE_RES << body.rocks.latticeLevel) : 0,
      dirs, edge, height, insolation,
      uplift: fields.uplift, rock: fields.rock, ice: fields.ice,
      ao: fields.ao, rockDensity: fields.rockDensity, fields,
    };
    for (const p of body.processes) {
      if (level >= p.levels[0] && level <= p.levels[1]) {
        // round 17: halo budgets in PHYSICAL reach, converted to cells per tile
        // (exec row). A process may declare haloReachM — the physical context it
        // needs — and on a figure tile whose metric compresses cells below that
        // intent, the bake fails by NAME instead of silently seaming.
        if (fig && p.haloReachM) {
          // EVERY level in range, not just the coarsest: cells HALVE per level
          // so the finest band is the one that fails first (post-impl panel —
          // the levels[0]-only gate checked the one level that always passes)
          let minL = Infinity;
          for (let c = 0; c < N; c++) {
            if (metL.lu[c] < minL) minL = metL.lu[c];
            if (metL.lv[c] < minL) minL = metL.lv[c];
          }
          const need = Math.ceil(p.haloReachM / Math.max(minL, 1e-6));
          const avail = HALO - 4 + 2; // the deepest halo any local scan may read
          if (need > avail) {
            throw new Error(`figure(${body.id}): process '${p.type}' needs ${need} halo cells for its ` +
              `${p.haloReachM} m reach on tile ${face}/${level}/${x}/${y} (metric min ${minL.toFixed(1)} m/cell) ` +
              `but only ${avail} are valid — the figure stretches this tile past the halo budget`);
          }
        }
        PROCESSES[p.type](ctx, p);
      }
    }
    // bead-chain guard, second half (register): the scatter reads THIS level's
    // raster (the recipe's declared field level) through bilinear sampling — a
    // single-cell density ridge bilinear-sharpens into a sub-cell band and its
    // rocks queue single-file. One 3x3 tent pass floors the feature width at
    // the consumed level only (finer levels feed the shader's speckle, where
    // crisp detail is wanted). Reads halo-3-valid data, writes halo 2.
    if (body.rocks && level === body.rocks.minTileLevel) {
      const src = fields.rockDensity, lim = HALO - 4;
      const out = new Float32Array(src);
      for (let j = -lim; j <= TILE_RES + lim; j++)
        for (let i = -lim; i <= TILE_RES + lim; i++) {
          let s = 0;
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++)
              s += src[I(i + di, j + dj)] * ((di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1));
          out[I(i, j)] = s / 16;
        }
      fields.rockDensity = out;
      ctx.rockDensity = out;
    }

    if (!parent) heightBase.set(height); // root morphs to itself (no flatten-in)

    let minH = Infinity, maxH = -Infinity;
    for (let j = 0; j <= TILE_RES; j++)
      for (let i = 0; i <= TILE_RES; i++) {
        const h = height[I(i, j)];
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }

    // met rides the tile record on figure bodies so the fixture can validate
    // the SHIPPED metric against independent q-differences (post-impl panel:
    // the tensor that drives five stateful ops was itself untested)
    const tile = { key, face, level, x, y, height, heightBase, fields, minH, maxH, met: metL };
    cache.set(key, tile);
    if (cache.size > cacheMax) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    return tile;
  }

  // hot reload (Phase T): drop every cached tile at level >= minLevel; the
  // retained shallow tiles stay valid because they never ran the changed band.
  function invalidate(minLevel) {
    if (!(minLevel < Infinity)) return 0;
    let n = 0;
    for (const key of [...cache.keys()]) {
      if (+key.split('/')[1] >= minLevel) { cache.delete(key); n++; }
    }
    return n;
  }
  // swap the process list in place (the bake loop reads body.processes live);
  // callers pair this with invalidate(invalidationLevel(old, new))
  function setProcesses(procs) { body.processes = procs; rebuildInsolation(); }

  // Phase C: the worker owns one cross-body memory budget. Expose an LRU trim
  // primitive so its coordinator can reclaim background bakers without knowing
  // the cache representation. Root floors are retained by asking for keep >= 6.
  function trimCache(keep = 0) {
    let n = 0;
    while (cache.size > keep) {
      cache.delete(cache.keys().next().value);
      n++;
    }
    return n;
  }

  return { bakeTile, cacheSize: () => cache.size, invalidate, setProcesses, trimCache, body };
}

// face basis re-export for crater projection (avoids importing FACES twice)
import { FACES as FACE_BASIS } from './mathx.js';
// deliberate lazy circularity: globalgrid assembles its coarse grid by baking
// process PREFIXES through makeBaker; procGlobal calls globalFor at bake time.
// Neither touches the other at module evaluation, so ESM live bindings resolve.
import { globalFor } from './globalgrid.js';
import { makeInsolationContext, insolationTemperatureOffset } from './insolation.js';

// bilinear height sample inside a tile's interior; fu,fv in [0,1] across the tile
export function sampleTileHeight(tile, fu, fv) {
  const gx = clamp(fu, 0, 1) * TILE_RES, gy = clamp(fv, 0, 1) * TILE_RES;
  const i = Math.min(Math.floor(gx), TILE_RES - 1), j = Math.min(Math.floor(gy), TILE_RES - 1);
  const fx = gx - i, fy = gy - j;
  const h = tile.height;
  const a = h[I(i, j)] * (1 - fx) + h[I(i + 1, j)] * fx;
  const b = h[I(i, j + 1)] * (1 - fx) + h[I(i + 1, j + 1)] * fx;
  return a * (1 - fy) + b * fy;
}
// disc-map bake (§11 whole-disc ladder v2 — Phase 1c): the coarse tiles reduced to
// a small equirect albedo map, sampled by the sky pass's disc representation so a
// moon at 20 px shows its maria instead of turning into a white ball. The albedo
// rules approximate the terrain shader's field mixing at map scale (macro noise,
// biome patchiness and speckle are sub-pixel here); every pixel is the tile
// function's own fields, so the hand-down is mean-preserving by construction.
export function bakeDiscMap(body, baker, W = 256, H = 128) {
  const rgba = new Uint8Array(W * H * 4);
  // level 2: deep enough that every coarse province band (maria at [2,2]) has
  // stamped; 4·65 samples per face edge comfortably covers the 256-px map
  const level = 2, D = 1 << level;
  const pal = body.palette;
  const dir = [0, 0, 0];
  for (let py = 0; py < H; py++) {
    const lat = ((py + 0.5) / H - 0.5) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let px = 0; px < W; px++) {
      const lon = ((px + 0.5) / W) * 2 * Math.PI - Math.PI;
      dir[0] = cl * Math.cos(lon); dir[1] = sl; dir[2] = cl * Math.sin(lon);
      const f = dirToFaceUv(dir);
      const x = Math.min(Math.floor(f.u * D), D - 1), y = Math.min(Math.floor(f.v * D), D - 1);
      const tile = baker.bakeTile(f.face, level, x, y);
      const fu = f.u * D - x, fv = f.v * D - y;
      const h = sampleTileHeight(tile, fu, fv);
      const rock = sampleTileField(tile, 'rock', fu, fv);
      const ice = sampleTileField(tile, 'ice', fu, fv);
      const mare = sampleTileField(tile, 'mare', fu, fv);
      let r, g, b;
      if (body.seaLevel != null && h < body.seaLevel) {
        const t = 1 - Math.exp(-(body.seaLevel - h) * 0.1);
        r = lerp(pal.oceanShallow[0], pal.oceanDeep[0], t);
        g = lerp(pal.oceanShallow[1], pal.oceanDeep[1], t);
        b = lerp(pal.oceanShallow[2], pal.oceanDeep[2], t);
      } else {
        r = lerp(pal.dust[0], pal.rock[0], rock);
        g = lerp(pal.dust[1], pal.rock[1], rock);
        b = lerp(pal.dust[2], pal.rock[2], rock);
        if (pal.veg) {
          // the baked biome field (Phase 2): the disc shows the same moisture
          // geography the tiles do — rain shadows and river corridors included.
          // Whittaker v2 (round 13): the biome CLASS colour tracks temperature x
          // moisture (procBiomes' + the shader's closed form) so the companion
          // disc agrees with the ground (§11). Seasonal cap is the LIVE SKY_FRAG
          // overlay (not baked here); space weathering is mean-neutral at disc
          // scale, strata-in-plan sub-disc — none needs a disc mirror.
          const veg = 0.9 * sampleTileField(tile, 'veg', fu, fv) * (1 - rock);
          let vc = pal.veg;
          if (pal.vegCold) {
            const cl2 = body.processes.find((q) => q.type === 'context');
            const temp = cl2.tempEq + (cl2.tempPole - cl2.tempEq) * sl * sl - Math.max(h, 0) * cl2.lapse
              + 2.5 * noise3(dir[0] * 3, dir[1] * 3, dir[2] * 3, cl2.seed | 0);
            const mo = sampleTileField(tile, 'moist', fu, fv);
            const coldW = 1 - smoothstep(-4, 8, temp);
            const warmW = smoothstep(13, 26, temp);
            const dry = 1 - smoothstep(0.12, 0.30, mo);
            vc = [0, 1, 2].map((k) => {
              const green = lerp(lerp(pal.veg[k], pal.vegVar[k], warmW), pal.vegCold[k], coldW);
              return lerp(green, pal.vegWarm[k], dry * (1 - coldW) * 0.85);
            });
          }
          r = lerp(r, vc[0], veg); g = lerp(g, vc[1], veg); b = lerp(b, vc[2], veg);
        }
        if (pal.mare) {
          r = lerp(r, pal.mare[0], mare); g = lerp(g, pal.mare[1], mare); b = lerp(b, pal.mare[2], mare);
        }
        if (pal.freshTint) {
          // G6 freshness at disc scale: crater rays over the maria (a full Moon's
          // identity is mostly Tycho/Copernicus ray systems) — same field, same
          // sign convention as the terrain shader, so the §11 hand-down agrees
          const fr = sampleTileField(tile, 'fresh', fu, fv);
          r *= lerp(1, pal.freshTint[0], fr); g *= lerp(1, pal.freshTint[1], fr); b *= lerp(1, pal.freshTint[2], fr);
        }
        // consequence-chain albedo at disc scale (round 12): wind-scoured
        // young basalt darkens, sheltered/high ground mantles bright — the
        // SAME formula as TERRAIN_FRAG's scour/mantle block, so the §11 disc
        // hand-down agrees (design-review finding: the level-2 disc must
        // carry the same youth/windExpo terms the ground shows).
        const gk = body.ground ?? {};
        if ((gk.scourK ?? 0) > 0 || (gk.mantleK ?? 0) > 0) {
          const expoV = sampleTileField(tile, 'windExpo', fu, fv);
          const youthV = sampleTileField(tile, 'youth', fu, fv);
          const scour = smoothstep(0.05, 0.5, expoV) * (0.3 + 0.7 * youthV);
          const aLo = gk.mantleAlt?.[0] ?? 2000, aHi = gk.mantleAlt?.[1] ?? 9000;
          const mant = clamp(smoothstep(0.05, 0.6, -expoV) + smoothstep(aLo, aHi, h), 0, 1) * (1 - scour);
          const sT = pal.scourTint ?? [1, 1, 1], mT = pal.mantleTint ?? [1, 1, 1];
          const sw = (gk.scourK ?? 0) * scour, mw = (gk.mantleK ?? 0) * mant * 0.5;
          r *= lerp(1, sT[0], sw); g *= lerp(1, sT[1], sw); b *= lerp(1, sT[2], sw);
          r = lerp(r, mT[0], mw); g = lerp(g, mT[1], mw); b = lerp(b, mT[2], mw);
        }
        r = lerp(r, pal.ice[0], ice); g = lerp(g, pal.ice[1], ice); b = lerp(b, pal.ice[2], ice);
        // round 18 cryo albedo (§11 disc mirror) — placed AFTER the ice lerp, or
        // the ice≈1 lerp on a cold cryo body erases it (the pre-code discmap-
        // ice-order finding; TERRAIN mirrors this after its own uColIce mix).
        // Gated on the recipe palette key ⇒ legacy discs are byte-identical.
        if (pal.linea) {
          const la = sampleTileField(tile, 'lineaAlb', fu, fv);
          r = lerp(r, pal.linea[0], la); g = lerp(g, pal.linea[1], la); b = lerp(b, pal.linea[2], la);
        }
        if (pal.tholin) {
          const th = sampleTileField(tile, 'tholinAlb', fu, fv);
          r = lerp(r, pal.tholin[0], th); g = lerp(g, pal.tholin[1], th); b = lerp(b, pal.tholin[2], th);
        }
      }
      const c = (py * W + px) * 4;
      rgba[c] = clamp(r, 0, 1) * 255; rgba[c + 1] = clamp(g, 0, 1) * 255;
      rgba[c + 2] = clamp(b, 0, 1) * 255; rgba[c + 3] = 255;
    }
  }
  return { w: W, h: H, rgba };
}

export function sampleTileField(tile, name, fu, fv) {
  const gx = clamp(fu, 0, 1) * TILE_RES, gy = clamp(fv, 0, 1) * TILE_RES;
  const i = Math.min(Math.floor(gx), TILE_RES - 1), j = Math.min(Math.floor(gy), TILE_RES - 1);
  const fx = gx - i, fy = gy - j;
  const f = tile.fields[name];
  const a = f[I(i, j)] * (1 - fx) + f[I(i + 1, j)] * fx;
  const b = f[I(i, j + 1)] * (1 - fx) + f[I(i + 1, j + 1)] * fx;
  return a * (1 - fy) + b * fy;
}
