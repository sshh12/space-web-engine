// matstack.js — Material texture stacks v2 (ROADMAP_V2 round 10, ground-plan L3).
//
// CONCEPT §7 names "per-material detail texture ... hashed anti-tiling" as one
// amplification class: geology expressed, never invented. Round 6 replaced the
// value-noise speckle with an in-shader procedural composite; this is the next
// step — a small library of TILEABLE per-material detail stacks (albedo / relief /
// roughness), baked once by a deterministic seeded pass (it rides round 7's asset
// step and hashes into the manifest) and sampled in TERRAIN_FRAG with §7's
// position-hashed rotation so the lattice has no repeat to see. The runtime
// regenerates the same bytes from this pure function; the .bin is just a cache.
//
// Four archetypes cover the material classes the recipe references (cracked
// basalt, regolith fines, duricrust, firn). Each texel packs, co-registered so
// the look reads as ONE substance (L3 rule (a): albedo correlates with relief):
//   R = albedo detail   (~0.5 mean → a multiplier centred on 1)
//   G = relief detail    (~0.5 mean → signed micro-height, folds into the bump)
//   B = roughness detail (~0.5 mean → scales the recipe's per-material rough)
//   A = cavity / AO      (1 open, →0 in crevices: darkens + de-glosses lows)
// The shader derives the micro-NORMAL from G analytically (bumpNormal), which
// folds to its mean cleanly under §7 — cleaner than sampling a normal map, whose
// vectors do not average to the coarse normal when sub-pixel.

import { rand01, vnoise3, clamp, smoothstep, lerp } from './mathx.js';

export const MAT_SIZE = 128;    // power of two (vnoise3 wraps on pow2 → tileable)
export const MAT_LAYERS = 4;
export const MAT = { REGOLITH: 0, BASALT: 1, DURICRUST: 2, FIRN: 3 };

// tileable fBm: each octave's frequency is a power of two, so vnoise3's pow2
// lattice wrap makes the argument periodic with period 1 in (u,v) — the texture
// tiles seamlessly under RepeatWrapping. z is a fixed slice per field.
function tfbm(u, v, seed, oct, base, z = 0.5) {
  let a = 0.5, f = base, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * vnoise3(u * f, v * f, z, f, seed + o * 7);
    norm += a; a *= 0.5; f *= 2;
  }
  return sum / norm; // [-1, 1]
}

// tileable Worley: feature points on a CxC grid, indices wrapped mod C. Returns
// nearest distance d1 and the edge quantity d2-d1 (small on polygon boundaries).
function cell2(u, v, C, seed) {
  const fx = u * C, fy = v * C;
  const xi = Math.floor(fx), yi = Math.floor(fy);
  let d1 = 9, d2 = 9;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = (((xi + ox) % C) + C) % C, cy = (((yi + oy) % C) + C) % C;
    const jx = xi + ox + rand01(cx, cy, 0, seed);
    const jy = yi + oy + rand01(cx, cy, 1, seed);
    const dx = fx - jx, dy = fy - jy, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return { d1: Math.sqrt(d1), edge: Math.sqrt(d2) - Math.sqrt(d1) };
}

// per-archetype field: returns {alb, rel, rough, ao} each in [0,1] at (u,v).
function fieldAt(mat, u, v) {
  if (mat === MAT.REGOLITH) {
    // fine grit + sparse micro-pits (gardened impact micro-craters). Near-flat
    // relief, high roughness — regolith is matte and finely turned over.
    const grain = 0.5 + 0.32 * tfbm(u, v, 211, 4, 16);
    const c = cell2(u, v, 16, 233);
    const pit = smoothstep(0.14, 0.0, c.d1) * 0.9;          // sparse round dimples
    const rel = clamp(grain - 0.5 * pit, 0, 1);
    return { alb: clamp(0.5 + 0.14 * (grain - 0.5) - 0.35 * pit, 0, 1),
             rel, rough: clamp(0.62 + 0.10 * (grain - 0.5) + 0.12 * pit, 0, 1),
             ao: clamp(1.0 - 0.85 * pit, 0, 1) };
  }
  if (mat === MAT.BASALT) {
    // impact-shattered / columnar basalt: an anastomosing crack network in the
    // relief, faces smoother than the fractured crevices between them. Cracks are
    // kept THIN (high ridge threshold) so the layer's albedo/relief means stay
    // near 0.5 — the shader uses these as centred details, so a crack-heavy mean
    // would globally darken and sink the terrain.
    const ridged = 1 - Math.abs(tfbm(u, v, 307, 5, 8));     // [0,1], 1 on ridge lines
    const crack = smoothstep(0.86, 0.995, ridged);          // thin fracture lines
    const face = 0.5 + 0.26 * tfbm(u, v, 331, 3, 24);       // coarse facet tone, centred
    const rel = clamp(0.5 + 0.42 * (face - 0.5) - 0.5 * crack, 0, 1);
    return { alb: clamp(0.5 + 0.42 * (face - 0.5) - 0.34 * crack, 0, 1),
             rel, rough: clamp(0.48 + 0.36 * crack + 0.12 * (face - 0.5), 0, 1),
             ao: clamp(1.0 - 0.85 * crack, 0, 1) };
  }
  if (mat === MAT.DURICRUST) {
    // indurated polygonal crust (desiccation / thermal-contraction net): raised
    // bright polygon interiors, recessed darker cracks between them.
    const c = cell2(u, v, 10, 419);
    const crack = smoothstep(0.16, 0.0, c.edge);            // 1 on polygon edges
    const interior = smoothstep(0.05, 0.4, c.d1);           // toward polygon centre
    const grit = 0.5 + 0.18 * tfbm(u, v, 431, 3, 20);
    const rel = clamp(0.5 + 0.28 * (interior - 0.5) - 0.5 * crack + 0.12 * (grit - 0.5), 0, 1);
    return { alb: clamp(0.5 + 0.22 * (interior - 0.5) - 0.34 * crack + 0.08 * (grit - 0.5), 0, 1),
             rel, rough: clamp(0.6 + 0.22 * crack - 0.1 * (interior - 0.5), 0, 1),
             ao: clamp(1.0 - 0.8 * crack, 0, 1) };
  }
  // FIRN — granular snow/ice: rounded packed grains, glossy (low roughness) with
  // sintered facets; bright and near-uniform in albedo.
  const blob = 0.5 + 0.5 * tfbm(u, v, 523, 4, 12);
  const grain = smoothstep(0.35, 0.75, blob);
  const rel = clamp(0.5 + 0.3 * (grain - 0.5) + 0.12 * tfbm(u, v, 541, 3, 28), 0, 1);
  return { alb: clamp(0.5 + 0.1 * (grain - 0.5), 0, 1),
           rel, rough: clamp(0.34 + 0.16 * (1 - grain), 0, 1),
           ao: clamp(0.85 + 0.15 * grain, 0, 1) };
}

// Build the packed RGBA array-texture: MAT_LAYERS layers of size×size. Pure,
// deterministic, three-free — the assets.mjs builder and the runtime both call it.
export function makeMaterialMaps(size = MAT_SIZE) {
  const data = new Uint8Array(size * size * MAT_LAYERS * 4);
  for (let m = 0; m < MAT_LAYERS; m++) {
    const base = m * size * size * 4;
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const u = i / size, v = j / size;
        const f = fieldAt(m, u, v);
        const o = base + (j * size + i) * 4;
        data[o] = Math.round(clamp(f.alb, 0, 1) * 255);
        data[o + 1] = Math.round(clamp(f.rel, 0, 1) * 255);
        data[o + 2] = Math.round(clamp(f.rough, 0, 1) * 255);
        data[o + 3] = Math.round(clamp(f.ao, 0, 1) * 255);
      }
  }
  return { data, size, layers: MAT_LAYERS };
}
