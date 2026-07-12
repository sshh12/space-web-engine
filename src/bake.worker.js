// bake.worker.js — thin Web Worker shell around bakecore. Receives (body, face,
// level, x, y), bakes (memoizing the parent chain), replies with transferable
// copies: the float height raster plus the FIELD ATLAS — one half-float RGBA
// buffer, layer-major, packed exactly by bakecore's ATLAS manifest (the Phase 2
// 16-bit checkpoint: 8-bit AO/horizon quantization was printing contour rings
// and shadow terracing under night exposure; the dither bridge retires here).
// 'hgt' is the height raster itself (per-pixel bathymetry for the ocean).
// Also answers { type:'discmap', bodyId } with the §11 equirect disc albedo map.

import { makeBaker, bakeDiscMap, invalidationLevel, RASTER, ATLAS } from './bakecore.js';
import { bodyById } from './recipe.js';
import { floatToHalf } from './mathx.js';
import { makeCloudKeyframes, keyframeSec } from './cloudcore.js';
import { ephemeris } from './frames.js';
import { globalFor } from './globalgrid.js';

const TAU = Math.PI * 2;

// the [global] moisture sampler for cloud generation — lives HERE (the worker
// realm's globalgrid cache, warm after any tile bake of the body) so the cold
// ~3.3 s level-3 grid build can never block the main thread (panel H1)
function moistSamplerFor(body) {
  const p = (body.processes ?? []).find((q) => q.type === 'global');
  if (!p || !p.moisture) return null;
  const g = globalFor(body, p);
  return (dir) => g.sample('moist', dir);
}

// round 16 — per-keyframe seasonal scalars for the dust-storm / polar-hood coverage
// modes (pre-code panel B). Returns null unless a deck actually declares the mode, so
// Tellus/Luna and Rubra's cirrus deck bake BYTE-IDENTICAL to round 15. th = orbital
// phase angle; sinDecl = subsolar-latitude sine from the same ephemeris the render
// uses (uSunDir.y) — closed-form in t, machine-identical (frames.js doubles).
function seasonSamplerFor(body) {
  const decks = body.clouds?.decks ?? [];
  if (!decks.some((d) => (d.stormW ?? 0) !== 0 || (d.hoodAmp ?? 0) !== 0)) return null;
  const tau = keyframeSec(body);
  const per = body.orbit.periodDays * 86400;
  return (kk) => {
    const t = kk * tau;
    return { th: TAU * (t / per) + body.orbit.phase0, sinDecl: ephemeris(body, t).sunDirBF[1] };
  };
}

const bakers = new Map();
const N = RASTER * RASTER;

function bakerFor(bodyId) {
  let baker = bakers.get(bodyId);
  if (!baker) {
    // ~630 KB/tile with the Phase-2 fields (round 12's six wind/stress/youth
    // channels added ~142 KB); round 18's two cryo albedo fields add ~46 KB/tile
    // → ~673 KB/tile × 300 ≈ 202 MB, still ~40 MB below the 500×480 KB ≈ 243 MB
    // configuration that tipped the long bench run into allocation failures (the
    // post-impl panel SKEPTIC confirmed 300 stays memory-safe). Kept at 300: the
    // interim 280 starved the ancestor-chain memoization on tile-streaming
    // descents (lod-ladder) and pushed their settle past the per-scene budget.
    baker = makeBaker(bodyById(bodyId), { cacheMax: 300 });
    bakers.set(bodyId, baker);
  }
  return baker;
}

self.onmessage = (e) => {
  if (e.data.type === 'discmap') {
    const { bodyId } = e.data;
    const m = bakeDiscMap(bodyById(bodyId), bakerFor(bodyId));
    self.postMessage({ type: 'discmap', bodyId, w: m.w, h: m.h, rgba: m.rgba }, [m.rgba.buffer]);
    return;
  }
  // Phase 4 clouds (round 15): coverage keyframe rasters for one body at
  // keyframe index k — generated HERE because the moisture sampler needs the
  // [global] grid (a cold build is ~3.3 s: worker cache, never the main
  // thread — pre-code panel H1). Pure fn of (recipe, k); RGBA8 packs both
  // keyframes (R,G = k; B,A = k+1) so a rollover is one new message.
  if (e.data.type === 'clouds') {
    const { bodyId, k } = e.data;
    const b = bodyById(bodyId);
    const m = makeCloudKeyframes(b, k, moistSamplerFor(b), seasonSamplerFor(b));
    self.postMessage({ type: 'clouds', bodyId, k, decks: m.decks, rgba: m.rgba }, [m.rgba.buffer]);
    return;
  }
  // hot recipe reload (Phase T tuning loop): swap the process list and drop only
  // the tiles the change can affect (level >= the shallowest changed band). The
  // main thread mirrors the eviction and re-requests — coarse tiles never rebake.
  if (e.data.type === 'reload') {
    const { bodyId, processes } = e.data;
    const baker = bakerFor(bodyId);
    const minLevel = invalidationLevel(baker.body.processes, processes);
    baker.setProcesses(processes);
    baker.invalidate(minLevel);
    self.postMessage({ type: 'reloaded', bodyId, minLevel });
    return;
  }
  const { bodyId, face, level, x, y, gen } = e.data;
  const baker = bakerFor(bodyId);
  // round 17: a bake-time assert (figure halo/injectivity) that throws HERE
  // would otherwise die silently — postMessage never fires, the tile stays
  // 'pending' forever and the bench settle-stalls with no signal (panel).
  // Typed error reply → the main thread throws the named error loudly.
  let t;
  try {
    t = baker.bakeTile(face, level, x, y);
  } catch (err) {
    self.postMessage({ type: 'bakeerror', bodyId, face, level, x, y, gen, message: String(err?.message ?? err) });
    return;
  }
  const height = new Float32Array(t.height); // copy: the worker cache keeps its own
  const heightBase = new Float32Array(t.heightBase); // geomorph source (Phase M)
  const atlas = new Uint16Array(N * 4 * ATLAS.length);
  for (let L = 0; L < ATLAS.length; L++) {
    const base = L * N * 4;
    for (let ch = 0; ch < 4; ch++) {
      const name = ATLAS[L][ch];
      if (name == null) continue; // manifest pad: stays zero
      const src = name === 'hgt' ? t.height : t.fields[name];
      for (let c = 0; c < N; c++) atlas[base + c * 4 + ch] = floatToHalf(src[c]);
    }
  }
  self.postMessage(
    { bodyId, face, level, x, y, gen, minH: t.minH, maxH: t.maxH, height, heightBase, atlas },
    [height.buffer, heightBase.buffer, atlas.buffer],
  );
};
