// bake.worker.js — thin Web Worker shell around bakecore. Receives (body, face,
// level, x, y), bakes (memoizing the parent chain), replies with transferable
// copies: the float height raster plus the FIELD ATLAS — one half-float RGBA
// buffer, layer-major, packed exactly by bakecore's ATLAS manifest (the Phase 2
// 16-bit checkpoint: 8-bit AO/horizon quantization was printing contour rings
// and shadow terracing under night exposure; the dither bridge retires here).
// 'hgt' is the height raster itself (per-pixel bathymetry for the ocean).
// Also answers { type:'discmap', bodyId } with the §11 equirect disc albedo map.

import { makeBaker, bakeDiscMap, invalidationLevel, RASTER, ATLAS } from './core/bakecore.js';
import { SYSTEM } from './core/recipe.js';
import { floatToHalf } from './core/mathx.js';
import { makeCloudKeyframes, makeCloudMeanRaster, keyframeSec } from './core/cloudcore.js';
import { ephemeris, orbitalPhaseAt } from './core/frames.js';
import { globalFor } from './core/globalgrid.js';
import { assertMechanicsSystem } from './core/mechanics.js';
import { WORKER_TILE_BUDGET, FOREGROUND_TILE_FLOOR, BACKGROUND_TILE_FLOOR, MAX_WARM_BAKERS } from './core/capacity.js';
import { makeRockSet, makeRockMaps } from './core/rockcore.js';
import { makeFormationSet } from './core/meshcore.js';

let loadedSystem = SYSTEM;
let systemGeneration = 0;
let activeBodyId = null;
const bodyById = (id) => loadedSystem.bodies.find((b) => b.id === id);

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
  return (kk) => {
    const t = kk * tau;
    return { th: orbitalPhaseAt(body, t, loadedSystem), sinDecl: ephemeris(body, t, loadedSystem).sunDirBF[1] };
  };
}

const bakers = new Map();
const bakerUse = new Map();
let useClock = 0;
let evictions = 0;
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
    const body = bodyById(bodyId);
    if (!body) throw new Error(`worker: body '${bodyId}' is not in generation ${systemGeneration}`);
    baker = makeBaker(body, { cacheMax: FOREGROUND_TILE_FLOOR });
    bakers.set(bodyId, baker);
  }
  bakerUse.set(bodyId, ++useClock);
  return baker;
}

function cacheStats() {
  let tiles = 0;
  for (const baker of bakers.values()) tiles += baker.cacheSize();
  return { tiles, budget: WORKER_TILE_BUDGET, bakers: bakers.size, evictions };
}

function enforceSharedBudget() {
  let stats = cacheStats();
  if (stats.tiles <= WORKER_TILE_BUDGET) return stats;
  const background = [...bakers.entries()]
    .filter(([id]) => id !== activeBodyId)
    .sort((a, b) => (bakerUse.get(a[0]) ?? 0) - (bakerUse.get(b[0]) ?? 0));
  for (const [, baker] of background) {
    evictions += baker.trimCache(BACKGROUND_TILE_FLOOR);
  }
  // Six recently used background root pyramids fit beside the foreground's
  // full 300-tile guarantee. Colder bakers are freed completely and rebuild
  // their six roots on revisit; otherwise 30*6 roots would consume the budget
  // before the current body could reach its promised floor.
  const cold = Math.max(0, bakers.size - MAX_WARM_BAKERS);
  for (const [id, baker] of background.slice(0, cold)) {
    evictions += baker.cacheSize(); bakers.delete(id); bakerUse.delete(id);
  }
  stats = cacheStats();
  if (stats.tiles <= WORKER_TILE_BUDGET) return stats;
  const foreground = activeBodyId && bakers.get(activeBodyId);
  if (foreground && stats.tiles > WORKER_TILE_BUDGET) {
    const otherTiles = stats.tiles - foreground.cacheSize();
    evictions += foreground.trimCache(Math.max(BACKGROUND_TILE_FLOOR, WORKER_TILE_BUDGET - otherTiles));
  }
  return cacheStats();
}

self.onmessage = (e) => {
  if (e.data.type === 'system') {
    const { system, generation } = e.data;
    if (!(generation > systemGeneration)) return;
    assertMechanicsSystem(system);
    loadedSystem = system;
    systemGeneration = generation;
    activeBodyId = null;
    bakers.clear(); bakerUse.clear(); evictions = 0;
    self.postMessage({ type: 'system', generation, systemId: system.id, cache: cacheStats() });
    return;
  }
  // Phase E (round 25): a single-body edit — replace the roster entry and
  // invalidate exactly what the edit's taxonomy class names, keeping every
  // other body's baker warm (the edit-isolation law, worker-side). One edit
  // may carry several bodies under ONE generation bump, so equal generations
  // are adopted, earlier ones dropped.
  if (e.data.type === 'body') {
    const { body, generation, bake } = e.data;
    if (!(generation >= systemGeneration)) return;
    systemGeneration = generation;
    const idx = loadedSystem.bodies.findIndex((b) => b.id === body.id);
    if (idx < 0) return;
    loadedSystem.bodies[idx] = body;
    const baker = bakers.get(body.id);
    if (baker) {
      if (bake === 'full') {
        evictions += baker.cacheSize();
        bakers.delete(body.id); bakerUse.delete(body.id);
      } else if (bake === 'bands') {
        // band-selective: the shallowest changed band decides what rebakes
        const minLevel = invalidationLevel(baker.body.processes ?? [], body.processes ?? []);
        baker.setProcesses(structuredClone(body.processes ?? []));
        baker.invalidate(minLevel);
      } else if (bake === 'mechanics') {
        // the baker's captured body reads orbit/spin at insolation rebuild;
        // tiles rebake only where an insolation-bearing context contributes
        baker.body.orbit = body.orbit; baker.body.spin = body.spin; baker.body.GM = body.GM;
        let lvl = Infinity;
        for (const p of baker.body.processes ?? []) {
          if (p.type === 'context' && p.insolation) lvl = Math.min(lvl, p.levels?.[0] ?? 0);
        }
        if (lvl < Infinity) { baker.setProcesses(baker.body.processes); baker.invalidate(lvl); }
      }
      // bake 'none' (look/presentation): tiles never read those datums — the
      // cache stays byte-warm; discmap/clouds read the fresh roster entry.
    }
    self.postMessage({ type: 'body', bodyId: body.id, generation, bake, cache: enforceSharedBudget() });
    return;
  }
  const generation = e.data.generation;
  if (e.data.type === 'reload' && generation > systemGeneration) systemGeneration = generation;
  if (generation !== systemGeneration) return; // structurally drop stale work
  if (e.data.type === 'assetpack') {
    const body = bodyById(e.data.bodyId);
    const pack = {
      rocks: body.rocks ? { set: makeRockSet(body.rocks), maps: makeRockMaps(body.rocks) } : null,
      formations: body.formations ? { set: makeFormationSet(body.formations) } : null,
    };
    const transfers = [], seen = new Set();
    const visit = (v) => {
      if (!v || typeof v !== 'object') return;
      if (ArrayBuffer.isView(v)) { if (!seen.has(v.buffer)) { seen.add(v.buffer); transfers.push(v.buffer); } return; }
      if (Array.isArray(v)) { for (const x of v) visit(x); return; }
      for (const x of Object.values(v)) visit(x);
    };
    visit(pack);
    self.postMessage({ type: 'assetpack', bodyId: body.id, generation, pack, cache: cacheStats() }, transfers);
    return;
  }
  if (e.data.type === 'discmap') {
    const { bodyId } = e.data;
    const m = bakeDiscMap(bodyById(bodyId), bakerFor(bodyId));
    self.postMessage({ type: 'discmap', bodyId, generation, w: m.w, h: m.h, rgba: m.rgba, cache: enforceSharedBudget() }, [m.rgba.buffer]);
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
    self.postMessage({ type: 'clouds', bodyId, k, generation, decks: m.decks, rgba: m.rgba, cache: enforceSharedBudget() }, [m.rgba.buffer]);
    return;
  }
  // Phase W (round 24): the above-band analytic time-mean raster — the same
  // packed format with cov* in BOTH keyframe slots (frac-lerp = identity), the
  // Jensen-honest alpha-law mean over one evolution block. Generated HERE for
  // the same reason live keyframes are (the [global] moisture sampler; panel
  // H1), and generation-stamped like every other message class.
  if (e.data.type === 'cloudmean') {
    const { bodyId, block } = e.data;
    const b = bodyById(bodyId);
    const m = makeCloudMeanRaster(b, block, moistSamplerFor(b), seasonSamplerFor(b));
    self.postMessage({ type: 'cloudmean', bodyId, block, generation, decks: m.decks, rgba: m.rgba, cache: enforceSharedBudget() }, [m.rgba.buffer]);
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
    self.postMessage({ type: 'reloaded', bodyId, minLevel, generation, cache: enforceSharedBudget() });
    return;
  }
  const { bodyId, face, level, x, y, gen } = e.data;
  activeBodyId = bodyId;
  const baker = bakerFor(bodyId);
  // round 17: a bake-time assert (figure halo/injectivity) that throws HERE
  // would otherwise die silently — postMessage never fires, the tile stays
  // 'pending' forever and the bench settle-stalls with no signal (panel).
  // Typed error reply → the main thread throws the named error loudly.
  let t;
  try {
    t = baker.bakeTile(face, level, x, y);
  } catch (err) {
    self.postMessage({ type: 'bakeerror', bodyId, face, level, x, y, gen, generation, message: String(err?.message ?? err), cache: enforceSharedBudget() });
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
    { bodyId, face, level, x, y, gen, generation, minH: t.minH, maxH: t.maxH, height, heightBase, atlas, cache: enforceSharedBudget() },
    [height.buffer, heightBase.buffer, atlas.buffer],
  );
};
