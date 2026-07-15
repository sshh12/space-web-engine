// tiles.js — CONCEPT §1: six quadtrees, one per cube face. Splits when the camera is
// close relative to node size; each displayed leaf renders a 65x65 corner grid sampled
// straight from its baked raster, with skirts masking coarse<->fine edge steps.
// Precision (§1/§9): tile centers are JS doubles; vertex positions are node-local
// float32; every frame each mesh.position is set to (center - cameraPos) in doubles
// while the camera sits at the origin — no system-scale coordinate touches float32.

import * as THREE from 'three';
import { TILE_RES, HALO, RASTER, I, ATLAS, sampleTileHeight, lowDegreeAxes } from '../core/bakecore.js';
import { faceUvToDir, dirToFaceUv, clamp, rand01, FACES, halfToFloat } from '../core/mathx.js';
// round 17 (§11 figure generality): q(d̂) + (h+meso)·m̂ replaces d̂·(R+h+meso)
// when the recipe declares a figure; legacy bodies take the old arithmetic
// verbatim (this.fig === null gates every branch — the byte-identity law)
import { figOf, figRadial, figUp, figMapDir, figAnchorR, figAlt } from '../core/figure.js';
import {
  withCommon, TERRAIN_VERT, TERRAIN_FRAG, OCEAN_VERT, OCEAN_FRAG,
  WIRE_VERT, WIRE_FRAG, ROCK_VERT, ROCK_FRAG, IMPOSTOR_VERT, IMPOSTOR_FRAG,
  FORM_VERT, FORM_FRAG,
} from './shaders.js';
import { placeRocks, placeFormations, anyFormationCandidate, mesoDisp, mesoDispRamped, mesoRamp } from '../core/scattercore.js';
import { makeRockSet, makeRockMaps, lodForLevel, VARIANTS } from '../core/rockcore.js';
import { makeFormationSet, FORM_VARIANTS } from '../core/meshcore.js';
import { makeMaterialMaps } from '../core/matstack.js';

// Material texture stacks v2 (round 10, §7 amplification). Body-independent (the
// four archetypes are fixed), so it is built once and shared by every body's
// terrain material. Mipmapped: the hardware trilinear fold IS the §7 mean-and-
// variance-preserving hand-down — the ~cm detail averages to its flat mean at
// distance, so there is nothing to shimmer (RepeatWrapping tiles the atlas; the
// shader hash-rotates the sample so the repeat has no lattice to see).
let _matStackTex = null;
function matStackTexture() {
  if (_matStackTex) return _matStackTex;
  const m = makeMaterialMaps();
  const t = new THREE.DataArrayTexture(m.data, m.size, m.size, m.layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  _matStackTex = t;
  return t;
}

const GRID = TILE_RES + 3;          // 67: 65 corners + 1 skirt ring per side
const SNAP = 4096;                  // detail-coordinate rebase quantum (m)
// screen-space-error split (Phase M): a node splits when the NEXT band's relief
// amplitude would project above TAU_AMP pixels (new bands arrive sub-pixel by
// construction), or its field texels stretch past TAU_TEXEL pixels (field
// sharpness), or the tile subtends too much arc (silhouette floor). Replaces the
// v0 distance/arc ratio (the "replace" ledger item).
const TAU_AMP = 1.5;                // px of un-resolved band amplitude
const TAU_TEXEL = 3.6;              // px per field texel
const ARC_FLOOR = 1.5;              // split while closer than this many arcs
// stream-in crossfade durations in WALL SECONDS, not frames: a frame-count
// fade is arbitrary across hardware (a 14-frame dissolve is invisible at 240
// fps, sluggish at 30, and on SwiftShader it stretched across fourteen
// motion-bench capture pairs — orbit-pan pop_p99 went 4x WORSE from stipple
// churn). Time-based, the dissolve is ~invisible to the 300 ms bench cadence
// (completing within one software-GL frame, i.e. the round-10 swap behaviour
// the bench already scored) while real-time hardware gets the smooth dissolve
// this Phase-M item exists for. Settled stills stay deterministic because
// settle gates on fading == 0.
const FADE_S = 0.28;                // tile content crossfade
const ROCK_FADE_S = 0.2;            // debris build-arrival dissolve
const CACHE_CAP = 700;              // tile budget (see evict + the request headroom guard)

// ---- shared, tile-independent geometry data (uv + index built once) ----
let sharedUv = null, sharedIndex = null;
function buildShared() {
  if (sharedUv) return;
  const uv = new Float32Array(GRID * GRID * 2);
  let k = 0;
  for (let gj = -1; gj <= TILE_RES + 1; gj++)
    for (let gi = -1; gi <= TILE_RES + 1; gi++) {
      uv[k++] = clamp(gi, 0, TILE_RES) / TILE_RES;
      uv[k++] = clamp(gj, 0, TILE_RES) / TILE_RES;
    }
  sharedUv = new THREE.BufferAttribute(uv, 2);
  const idx = new Uint32Array((GRID - 1) * (GRID - 1) * 6);
  k = 0;
  for (let j = 0; j < GRID - 1; j++)
    for (let i = 0; i < GRID - 1; i++) {
      const a = j * GRID + i, b = a + 1, c = a + GRID, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  sharedIndex = new THREE.BufferAttribute(idx, 1);
}

const OGRID = 35; // ocean: 33 corners + 1 skirt ring per side
let oceanUv = null, oceanIndex = null;
function buildOceanShared() {
  if (oceanIndex) return;
  const idx = new Uint32Array((OGRID - 1) * (OGRID - 1) * 6);
  let k = 0;
  for (let j = 0; j < OGRID - 1; j++)
    for (let i = 0; i < OGRID - 1; i++) {
      const a = j * OGRID + i, b = a + 1, c = a + OGRID, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  oceanIndex = new THREE.BufferAttribute(idx, 1);
}

const levelTint = (l) => new THREE.Color().setHSL((l * 0.137) % 1, 0.75, 0.5);

// RGBA8 DataArrayTexture from a meshcore hull-map pack (round 14)
function arrayTex8(h) {
  const t = new THREE.DataArrayTexture(h.data, h.size, h.size, h.layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
const dotNadir = (c, dir, r) => (c[0] * dir[0] + c[1] * dir[1] + c[2] * dir[2]) / r;

export class PlanetTiles {
  constructor(body, worker, shared, { atmSteps = 14, generation = 0, assetPack = null } = {}) {
    buildShared(); buildOceanShared();
    this.body = body;
    this.systemGeneration = generation;
    this.worker = worker;
    this.shared = shared;          // uniform value objects shared by every material
    this.atmSteps = atmSteps;
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    this.cache = new Map();        // key -> tile record (raster + gpu resources)
    this.pending = new Set();
    this.gen = 0;                  // hot-reload generation: drops stale in-flight bakes
    this.visible = [];
    this.deadPool = [];            // deferred disposals (reclaimed displayed tiles)
    this.wireframe = false;
    this.debris = true;
    this.stats = { tiles: 0, baked: 0, pending: 0, level: 0 };
    this.rockQueue = [];
    this.faceArc = (Math.PI / 2) * body.R;
    this.fig = figOf(body); // null for legacy bodies (sphere = the common case)
    this.matStackTex = matStackTexture(); // shared material detail stacks (§7)
    // relief scale for the amplitude split metric: the largest process amplitude
    // (round-12 edifice/rift deliberately declare 'height'/'depth', not 'amp' —
    // the planet-wide metric must not rescale to one mountain)
    this.relief = Math.max(...body.processes.map((p) => p.amp ?? 0), 500);
    // round 12: the closed-form degree-2 swell axis — the shader's G1 joint
    // orientation prior re-derives the SAME frame the bake's stress law uses
    const cont = body.processes.find((p) => p.type === 'continents');
    this.swellAxis = lowDegreeAxes(cont ? cont.seed : 0).a2;
    this.r13 = this.computeR13Look();
    // scatter hand-down conservation constants (Phase M, §7): clast sizes are
    // s(u) = m + a*u^3, so the projected-area normaliser is
    // A0 = ∫ s(u)^2 du = m^2 + m*a/2 + a^2/7 — the shader trades the resolved
    // share of this budget OUT of the ground's rockDensity detail
    if (body.rocks) {
      const m = body.rocks.sizeMin, a = body.rocks.sizeMax - body.rocks.sizeMin;
      this.rockDistParams = [m, a, 1 / (m * m + (m * a) / 2 + (a * a) / 7)];
    } else this.rockDistParams = [0.1, 1, 1];

    this._onMsg = (e) => this.onBaked(e.data);
    worker.addEventListener('message', this._onMsg);

    // Water v2 core (Phase 2): broadband wind-sea + swell. 16 components,
    // log-spaced wavelengths with seeded direction/phase/frequency decorrelation
    // — a handful of fixed sines is a periodic interference lattice and it shows
    // from orbit (§12 anti-tiling); a broadband spectrum has no repeat to see.
    this.waveDirs = []; this.waveK = []; this.waveAmp = []; this.waveOmega = [];
    const g = 9.81 * (body.R / 6.371e6);
    // dominant wind azimuth: the recipe's water.windDeg (compass heading, ties
    // the sea state to the same wind that routes sand); falls back to a fixed
    // bearing. Becomes the [global] wind field later.
    const th0 = body.water ? (body.water.windDeg * Math.PI) / 180 : 0.8;
    const NW = 16;
    for (let i = 0; i < NW; i++) {
      const lambda = 240 * Math.pow(0.8 / 240, i / (NW - 1)); // 240 m .. 0.8 m
      const swell = i < 3;                                    // longest = swell family
      // swell arrives as 2–3 trains from DIFFERENT distant storms — a single
      // near-parallel swell family reads as brushed-metal corduroy in perspective
      // (round-10 panel, coast-archipelago). Cross the swell trains + widen spread.
      const swellDir = swell ? [0.4, -0.3, 0.7][i] : 0;
      const a = th0 + (rand01(i, 5, 1, 91) - 0.5) * (swell ? 0.6 : 1.5) + swellDir;
      const tilt = Math.sin(i * 1.7) * 0.12;
      this.waveDirs.push(new THREE.Vector3(Math.cos(a), tilt, Math.sin(a)).normalize());
      const k = (2 * Math.PI) / lambda;
      this.waveK.push(k);
      // round 16 (panel titan-methane-lake-waveamp, §12 "wind and fetch context"):
      // water.calm scales the wave steepness — a near-still methane sea can't carry
      // Tellus chop. One knob: foldVar (and thus the broad specular-lobe roughness
      // floor) derives from uWaveAmp, so this calms both the mesh AND the glint.
      // Default 1.0 ⇒ byte-identical for every existing body.
      this.waveAmp.push(lambda * (swell ? 0.0045 : 0.0075) * (0.75 + 0.5 * rand01(i, 6, 1, 91)) * (body.water?.calm ?? 1.0));
      this.waveOmega.push(Math.sqrt(g * k) * (1 + 0.03 * (rand01(i, 7, 1, 91) - 0.5)));
    }

    // round 17: FIG_MODE is compile-time per body (this manager is rebuilt at
    // switchBody) — legacy bodies compile mode 0, which emits exactly the
    // pre-round-17 expressions (no runtime figure branch in any legacy program)
    const figMode = this.fig ? this.fig.mode : 0;
    const vFig = figMode ? `#define FIG_MODE ${figMode}\n` : '';
    this.terrainMatProto = new THREE.ShaderMaterial({
      vertexShader: vFig + TERRAIN_VERT,
      fragmentShader: withCommon(TERRAIN_FRAG, atmSteps, { fig: figMode }),
      side: THREE.DoubleSide,
    });
    this.oceanMatProto = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT,
      fragmentShader: withCommon(OCEAN_FRAG, atmSteps),
      side: THREE.DoubleSide,
      transparent: true, // shoreline soft blend (Phase M); depth still written
    });
    this.wireMat = new THREE.ShaderMaterial({
      vertexShader: WIRE_VERT, fragmentShader: WIRE_FRAG,
      uniforms: { uColor: { value: new THREE.Color(0.6, 0.85, 1.0) } },
      wireframe: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    // proto only: rocks render with a PER-TILE clone binding the owner tile's
    // field atlas, so instances receive the baked horizon-field shadows/view
    // factor of the ground they sit on (register row: boulders stayed lit
    // inside terrain shadows — two shadow representations must not disagree)
    this.rockMatProto = new THREE.ShaderMaterial({
      vertexShader: ROCK_VERT, fragmentShader: withCommon(ROCK_FRAG, atmSteps),
    });
    // rock asset pipeline (ground plan 4b): archetype x variant x LOD geometry
    // set, deterministic from the recipe; shared across every tile's instances
    this.rockGeoms = null; this.rockMeta = null; this.rockMapTex = null;
    if (body.rocks) {
      const rset = assetPack?.rocks?.set ?? makeRockSet(body.rocks);
      this.rockMeta = rset.meta;
      this.rockGeoms = rset.meshes.map((av) => av.map((lods) => lods.map((m) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
        g.setAttribute('aDir', new THREE.BufferAttribute(m.dirs, 3));
        if (m.index) g.setIndex(new THREE.BufferAttribute(m.index, 1));
        return g;
      })));
      // limit-surface normal + cavity maps (4b residue): one octahedral layer
      // per (archetype, variant) — facet interiors shade with the true sculpt
      const maps = assetPack?.rocks?.maps ?? makeRockMaps(body.rocks);
      const mt = new THREE.DataArrayTexture(maps.data, maps.size, maps.size, maps.layers);
      mt.format = THREE.RGBAFormat;
      mt.type = THREE.UnsignedByteType;
      mt.minFilter = THREE.LinearFilter; mt.magFilter = THREE.LinearFilter;
      mt.wrapS = mt.wrapT = THREE.ClampToEdgeWrapping;
      mt.needsUpdate = true;
      this.rockMapTex = mt;
      // round 14 — the impostor rung's hull maps (normal + visible-hull
      // radius, baked from the finest-LOD meshes in FIT space: squash + fit +
      // displacement carried by construction, panel K1)
      this.rockHullTex = arrayTex8(rset.hulls);
      this.rockHullMaxR = rset.hulls.maxR;
    }
    // round 14 — formations (ground plan L5): the non-heightfield class.
    // Geometry/meta from meshcore; drawn with a per-tile FORM material clone
    // (same owner-atlas lighting convention as rocks — one lighting answer)
    this.formGeoms = null; this.formMeta = null; this.formHullTex = null;
    if (body.formations) {
      const fset = assetPack?.formations?.set ?? makeFormationSet(body.formations);
      this.formMeta = fset.meta;
      this.formGeoms = fset.meshes.map((av) => av.map((lods) => lods.map((m) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
        g.setAttribute('aAO', new THREE.BufferAttribute(m.aAO, 1));
        g.setIndex(new THREE.BufferAttribute(m.index, 1));
        return g;
      })));
      this.formHullTex = arrayTex8(fset.hulls);
      this.formHullMaxR = fset.hulls.maxR;
      this.formMatProto = new THREE.ShaderMaterial({
        vertexShader: FORM_VERT, fragmentShader: withCommon(FORM_FRAG, atmSteps),
      });
      // the strata octave family (K2): [bedT0, bedLac, octaves, fold seed] +
      // [foldAmp, foldF] from the body's strata process — the ONE bed frame
      // both the bake and the formation tone read
      const sp = body.processes.find((q) => q.type === 'strata');
      this.formBedParams = sp
        ? new THREE.Vector4(sp.bedT0, sp.bedLac, sp.octaves ?? 3, sp.seed | 0)
        : new THREE.Vector4(650, 0.45, 5, 0);
      this.formFoldParams = sp
        ? new THREE.Vector2(sp.foldAmp ?? 0, sp.foldF ?? 5)
        : new THREE.Vector2(0, 5);
    }
    // impostor rung (round 14, the mesh->impostor->roughness ladder): one
    // camera-facing quad instanced per resolvable rock/formation on the band
    // tiles below each population's minTileLevel; the fragment samples the
    // closed-form hull. Quad base geometry is shared; per-tile geometries add
    // their instanced attributes (aVar map layer, aHullR denormalizer).
    this.impostorMatProto = new THREE.ShaderMaterial({
      vertexShader: IMPOSTOR_VERT, fragmentShader: withCommon(IMPOSTOR_FRAG, atmSteps),
    });
    this.quadPos = new THREE.BufferAttribute(new Float32Array([
      -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
    ]), 3);
    this.quadIdx = new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1);
    this.formQueue = [];
  }

  sharedUniforms(extra = {}) {
    return { ...this.shared, ...extra };
  }

  key(f, l, x, y) { return `${f}/${l}/${x}/${y}`; }

  // representation by tile depth (§7): every level's build floor is the fold
  // size at that level's NEAREST possible display distance — the same
  // invariant the geomorph rests on (a displayed level-l tile has d ≥ S(l),
  // amp term undiscounted, kSil only splits earlier), so a clast below the
  // floor could never resolve while this tile is the displayed one: building
  // it is pure waste (first-probe measurement: the honest scheduler filled
  // the L15/16 mid-field rings the old allocation left rock-free, and
  // floor-less L16 builds exploded instances 11× over baseline). Anchored at
  // the round-5 L15 floor, decaying by the split-distance ratio 2^(-0.8Δl).
  // Shared by the rock build and the terrain conservation (uRockFloor), so
  // the ground yields exactly the share the instances actually carry.
  rockSizeFloor(level) {
    const rk = this.body.rocks;
    if (!rk) return 0;
    const f15 = rk.sizeMin + 0.45 * (rk.sizeMax - rk.sizeMin);
    const f = f15 * Math.pow(2, -0.8 * (level - 15));
    return f > rk.sizeMin ? f : 0;
  }

  request(f, l, x, y) {
    const k = this.key(f, l, x, y);
    if (this.cache.has(k) || this.pending.has(k)) return;
    this.pending.add(k);
    this.worker.postMessage({ bodyId: this.body.id, face: f, level: l, x, y, gen: this.gen, generation: this.systemGeneration });
  }

  // hot recipe reload (Phase T): swap the process list and drop only the tiles
  // the change can affect (level >= the shallowest changed band). Coarse tiles
  // stay — the tuning-loop velocity win. The worker mirrors this eviction; the
  // generation bump discards any pre-reload bake still in flight.
  // round 13: derive the appearance-look params once (not per tile) — climate
  // for the in-shader Whittaker temp, the strata-in-plan fold/gate, seasonal
  // cap, space weathering, wetness and lee streaks. All recipe data (§6).
  computeR13Look() {
    const b = this.body;
    const ctx = b.processes.find((p) => p.type === 'context');
    const strata = b.processes.find((p) => p.type === 'strata');
    const pal = b.palette, gr = b.ground || {}, wa = b.water || {}, sc = b.seasonalCap || {};
    const sinDeg = (d) => Math.sin((d * Math.PI) / 180);
    return {
      climTemp: [ctx?.tempEq ?? 0, ctx?.tempPole ?? 0, ctx?.lapse ?? 0],
      climSeed: (ctx?.seed ?? 0) | 0,
      biomeCold: pal.vegCold ?? pal.veg ?? [0, 0, 0],
      biomeWarm: pal.vegWarm ?? pal.veg ?? [0, 0, 0],
      whitK: pal.vegCold ? 1 : 0,
      frostK: sc.k ?? 0,
      frostTint: sc.tint ?? [0.9, 0.92, 0.98],
      frostP: [sinDeg(sc.latOn ?? 90), sinDeg(sc.latFull ?? 90), sc.seasonK ?? 0],
      strataK: strata ? (strata.planK ?? 0) : 0,
      strataAmp: strata?.planAmp ?? 0.14,
      strataFold: strata ? [strata.bedT0 ?? 700, strata.foldAmp ?? 0, strata.foldF ?? 5, (strata.seed ?? 0) | 0]
        : [700, 0, 5, 0],
      strataGate: strata ? [strata.gate?.lo ?? 0, strata.gate?.hi ?? 1, strata.gate?.field === 'mare' ? 1 : 0]
        : [0, 1, 0],
      weatherK: gr.weatherK ?? 0,
      weatherSlope: gr.weatherSlope ?? 0.7,
      weatherTint: pal.weatherTint ?? [0.85, 0.8, 0.74],
      wetDark: wa.wetDark ?? 0,
      wetGloss: wa.wetGloss ?? 0,
      streakK: gr.streakK ?? 0,
    };
  }

  reload(processes) {
    this.gen++;
    this.body.processes = processes;
    this.relief = Math.max(...processes.map((p) => p.amp ?? 0), 500);
    // a continents-seed change invalidates level 0 (full rebake), so new
    // tiles pick the fresh axis; survivors kept their old one legitimately
    const contR = processes.find((p) => p.type === 'continents');
    this.swellAxis = lowDegreeAxes(contR ? contR.seed : 0).a2;
    this.r13 = this.computeR13Look();
    this.worker.postMessage({ type: 'reload', bodyId: this.body.id, processes, generation: this.systemGeneration });
    return this.gen;
  }

  evictFrom(minLevel) {
    if (!(minLevel < Infinity)) return;
    for (const k of [...this.pending]) if (+k.split('/')[1] >= minLevel) this.pending.delete(k);
    for (const t of [...this.cache.values()]) {
      if (t.level >= minLevel) { this.disposeTile(t); this.cache.delete(t.key); }
    }
    this.visible = this.visible.filter((t) => this.cache.has(t.key));
    this.rockQueue = this.rockQueue.filter((t) => this.cache.has(t.key));
  }

  onBaked(m) {
    if (m.generation !== this.systemGeneration) return;
    // round 17: a figure bake assert died in the worker — surface it LOUDLY
    // (an uncaught worker throw leaves the tile pending forever: settle-stall)
    if (m.type === 'bakeerror') {
      throw new Error(`bake failed (${m.bodyId} ${m.face}/${m.level}/${m.x}/${m.y}): ${m.message}`);
    }
    // hot-reload ack: mirror the worker's band-selective eviction locally, then
    // let the next update() re-request the dropped tiles under the new recipe
    if (m.type === 'reloaded' && m.bodyId === this.body.id) { this.evictFrom(m.minLevel); return; }
    if (m.type) return; // not a tile (e.g. discmap replies — main.js consumes those)
    if (m.bodyId !== this.body.id) return;
    const k = this.key(m.face, m.level, m.x, m.y);
    this.pending.delete(k);
    // a bake from before a reload carries a stale recipe — drop it (the tile was
    // re-requested at the current generation); otherwise it would cache old data
    if (m.gen !== undefined && m.gen < this.gen) return;
    if (this.cache.has(k)) return;
    const tile = {
      key: k, face: m.face, level: m.level, x: m.x, y: m.y,
      height: m.height, heightBase: m.heightBase, atlas: m.atlas,
      minH: m.minH, maxH: m.maxH,
      mesh: null, ocean: null, wire: null, rocks: null, forms: null, center: null, lastUse: 0,
      epoch: this.epoch ?? 0, // pose epoch at bake (rebalancer reclaim gate)
    };
    this.cache.set(k, tile);
  }

  // ---------------------------------------------------------------------
  // per-frame selection: desired leaves from all active cameras (main + inset),
  // then draw-best-available along ancestor paths while bakes stream in.
  // ---------------------------------------------------------------------
  update(cams, time, frameNo, pixAng = 0.0012, burst = false, dtFade = 0.1) {
    const { body } = this;
    // deferred disposal: tiles reclaimed WHILE DISPLAYED last frame rendered
    // one final frame (no hole; the zone falls back to a cached ancestor this
    // frame) and die here, safely out of every map
    for (const t of this.deadPool) this.disposeTile(t);
    this.deadPool.length = 0;
    const desired = [];
    const maxLevel = body.maxBakeLevel;
    // POSE EPOCH: bumps when the camera leaves its neighbourhood (teleports,
    // descents, long flights). Bakes are stamped with it; the rebalancer may
    // only reclaim covered tiles from an EARLIER epoch — the exact
    // discriminator between a previous pose's leftovers and the current
    // unlock's fresh bakes. (A frame-count age gate failed both ways on
    // software-GL pacing: 120 frames ≈ an entire bench scene sequence.)
    {
      const c0 = cams[0];
      // figure bodies: |cam|−R misreads the neck (its surface radius ≪ R —
      // the epoch scale would pin to the floor and thrash); figAlt is the law
      const alt = Math.max(this.fig ? figAlt(this.fig, c0) : Math.hypot(c0[0], c0[1], c0[2]) - body.R, 50);
      if (!this.epochPos) { this.epoch = 0; this.epochPos = c0.slice(); this.epochAlt = alt; }
      else {
        const moved = Math.hypot(c0[0] - this.epochPos[0], c0[1] - this.epochPos[1], c0[2] - this.epochPos[2]);
        // neighbourhood scale = the SMALLER of then/now altitudes: a descent
        // from orbit to the ground must bump (ninth probe: an epoch-start
        // orbital altitude set an 80,000 km bar that nothing ever crossed —
        // epoch stayed 0 and the rebalancer had zero candidates), and so must
        // an ascent leaving an eye-level neighbourhood
        if (moved > Math.max(4 * Math.min(this.epochAlt, alt), 2000)) {
          this.epoch++; this.epochPos = c0.slice(); this.epochAlt = alt;
        }
      }
    }
    const camsR = cams.map((c) => Math.hypot(c[0], c[1], c[2]));
    const fig = this.fig;
    // figure camera altitude PER CAMERA (the eye-level inset is cams[1]; a
    // single cams[0] altitude starved its near tiles — post-impl panel)
    const camsAltF = fig ? cams.map((c) => clamp(figAlt(fig, c), 0, 9000)) : null;

    const visit = (f, l, x, y) => {
      const D = 1 << l;
      const dir = faceUvToDir(f, (x + 0.5) / D, (y + 0.5) / D);
      // figure bodies: the node's physical span scales with its own hull
      // radius (Haumea's long axis is 1.45x the mean — the mean-R arc
      // under-splits it; the short axis over-splits). anchorR is the cheap
      // continuous hull radius — exact for ellipsoids, union-exit for lobes.
      const aR = fig ? figAnchorR(fig, dir) : 0;
      const arc = (this.faceArc / D) * (fig ? aR / body.R : 1);
      let dmin = Infinity, horizonOK = false;
      for (let ci = 0; ci < cams.length; ci++) {
        const c = cams[ci];
        // node radius estimate: near the surface, terrain under the camera is at
        // roughly the camera's own radial height — measuring to the datum instead
        // would cap the reachable level on mountains (review finding)
        const nodeR = fig ? aR + camsAltF[ci] : Math.min(camsR[ci], body.R + 9000);
        const dx = c[0] - dir[0] * nodeR, dy = c[1] - dir[1] * nodeR, dz = c[2] - dir[2] * nodeR;
        const d = Math.max(Math.hypot(dx, dy, dz) - arc * 0.75, 0.1);
        if (d < dmin) dmin = d;
        // horizon cull with generous margins (node angular radius + horizon
        // angle). Figure occluder radius = the INSCRIBED extent (minR): a
        // bounding-sphere occluder would cull tiles the true figure reveals
        // (acos is DECREASING in R — the panel caught the inversion)
        const r = camsR[ci];
        const cosAng = (c[0] * dir[0] + c[1] * dir[1] + c[2] * dir[2]) / r;
        const occR = fig ? fig.minR : body.R;
        const horizon = Math.acos(clamp(occR / Math.max(r, occR + 1), -1, 1)) + 0.35;
        if (Math.acos(clamp(cosAng, -1, 1)) < horizon + (arc / occR) * 1.6) horizonOK = true;
      }
      if (!horizonOK && l >= 2) return;
      // near-grazing tiles silhouette against the sky: give the horizon ring more
      // resolution or the limb crenellates into tile-width steps (critique panel).
      // The boost is a BAND around the ring, decaying on BOTH sides: clamping the
      // far side to "always boosted" blew the display set up to 1000+ tiles per
      // level at ground poses over below-datum terrain (1-cosHor degenerates to
      // ~1e-7 there), which made deep levels take minutes to stream in and let
      // __shot time out on half-morphed scenes (round-2 "dash" defect, final form)
      const c0 = cams[0];
      const cosHor = (fig ? fig.minR : body.R) / Math.max(camsR[0], (fig ? fig.minR : body.R) + 1);
      const tNad = clamp((dotNadir(c0, dir, camsR[0]) - cosHor) / Math.max(1 - cosHor, 1e-9), -1, 1);
      const kSil = 1 + 1.4 * Math.exp(-6 * tNad * tNad);
      // screen-space-error metric (see constants above). The field-texel term
      // gets a foreshortening discount at/beyond the ring: a grazing tile shows
      // ~10x compressed texels, and splitting it to nadir sharpness is what let
      // the level shells reach hundreds of km at eye level
      const fore = 0.35 + 0.65 * clamp(tNad, 0, 1);
      const px = 1 / Math.max(dmin * pixAng, 1e-9);
      const bandAmp = this.relief * Math.pow(2, -0.8 * (l + 1));
      const score = kSil * Math.max(
        (bandAmp * px) / TAU_AMP,
        (((arc / TILE_RES) * px) / TAU_TEXEL) * fore,
        (ARC_FLOOR * arc) / Math.max(dmin, 0.1));
      if (l < maxLevel && score > 1) {
        const cx = x * 2, cy = y * 2;
        visit(f, l + 1, cx, cy); visit(f, l + 1, cx + 1, cy);
        visit(f, l + 1, cx, cy + 1); visit(f, l + 1, cx + 1, cy + 1);
      } else {
        desired.push([f, l, x, y, dmin]);
      }
    };
    for (let f = 0; f < 6; f++) visit(f, 0, 0, 0);

    // draw best available; every missing tile on a path inherits the path's
    // PRIORITY = the SSE error the viewer currently suffers there — the shown
    // tile's band-amplitude/texel error at the leaf's distance (∞ if nothing
    // shown). One currency for all requests (Phase M "honest budget"): the
    // round-5 bands emerge as consequences — an under-camera path shows a
    // coarse ancestor at tiny dmin (top error), an uncovered face is ∞, the
    // mid-field orders by real error. Self-correcting against the round-5
    // covering collapse: a display degrading toward a face root RAISES that
    // root's error until its children win the queue.
    const display = new Map();
    const missing = new Map();
    const leaves = []; // [missKeys, shown, dmin] per desired leaf (pass-3 errors)
    for (const [f, l, x, y, dmin] of desired) {
      let shown = null;
      const mt = [];
      for (let ll = l; ll >= 0; ll--) {
        const k = this.key(f, ll, x >> (l - ll), y >> (l - ll));
        const t = this.cache.get(k);
        if (!t) mt.push([k, f, ll, x >> (l - ll), y >> (l - ll)]);
        else {
          t.lastUse = frameNo; // whole path stays warm or eviction thrashes it
          if (!shown) shown = t;
        }
      }
      if (shown) display.set(shown.key, shown);
      leaves.push([mt, shown, dmin]);
    }
    // a displayed ancestor fully covers its subtree: drop covered descendants so
    // coincident surfaces never double-draw (transient while bakes stream in)
    for (const t of [...display.values()]) {
      for (let ll = t.level - 1; ll >= 0; ll--) {
        if (display.has(this.key(t.face, ll, t.x >> (t.level - ll), t.y >> (t.level - ll)))) {
          display.delete(t.key);
          break;
        }
      }
    }
    // final covering tile per leaf + its NEAREST covered leaf distance. The
    // covering rule is NONLINEAR: one missing far path under the camera's L2
    // ancestor forces that L2 to display and cover the entire baked near
    // pyramid (second-probe collapse: beach-eye settled as an empty smooth
    // dune with 289 deep tiles baked-but-covered). So a missing tile's
    // priority is the error the DISPLAY suffers — the covering tile's SSE at
    // the covering tile's nearest covered leaf — not the requesting leaf's
    // own error. Coverage holes under near ancestors thereby outrank depth
    // refinement automatically, and the priorities localize recursively as
    // each covering ancestor releases (the round-5 coverage band, derived
    // instead of hard-coded).
    for (const [, shown, dmin] of leaves) {
      if (!shown) continue;
      let cov = shown;
      if (!display.has(shown.key)) {
        for (let ll = shown.level - 1; ll >= 0; ll--) {
          const a = this.cache.get(this.key(shown.face, ll, shown.x >> (shown.level - ll), shown.y >> (shown.level - ll)));
          if (a && display.has(a.key)) { cov = a; break; }
        }
      }
      if (cov.covFrame !== frameNo) { cov.covFrame = frameNo; cov.dist = dmin; }
      else if (dmin < cov.dist) cov.dist = dmin;
      shown.finalCov = cov;
    }
    for (const [mt, shown, dmin] of leaves) {
      if (!mt.length) continue;
      const cov = shown ? shown.finalCov ?? shown : null;
      const dm = cov ? Math.min(cov.dist, dmin) : dmin;
      const px = 1 / Math.max(dm * pixAng, 1e-9);
      // "nothing shown" gets the error it WOULD have showing one level above
      // the root — finite (an Infinity sentinel made the sort comparator NaN
      // against another Infinity: garbage order, first-probe deadlock) and on
      // the same scale as real errors, so the queue self-balances toward the
      // uniform-screen-space-error display the SSE metric defines
      const sl = cov ? cov.level : -1;
      const slD = sl < 0 ? 0.5 : 1 << sl;
      const err = Math.max((this.relief * Math.pow(2, -0.8 * (sl + 1)) * px) / TAU_AMP,
                           ((this.faceArc / slD / TILE_RES) * px) / TAU_TEXEL);
      for (const [k, f2, ll, xx, yy] of mt) {
        const e = missing.get(k);
        if (!e) missing.set(k, { f: f2, l: ll, x: xx, y: yy, err, dmin });
        else {
          if (err > e.err) e.err = err;
          if (dmin < e.dmin) e.dmin = dmin;
        }
      }
    }
    // honest per-frame request budget (Phase M — replaces BOTH the round-5
    // static-only three-band allocation and the moving-camera coarse-first
    // front with ONE rule, applied every frame): sort by suffered error
    // descending, coarse-first within equal error (parents are bake
    // prerequisites, and Infinity ties resolve coarse-first the same way).
    // The round-5 bands fall out of the currency — the unlock chain under the
    // camera carries the largest suffered error, uncovered faces are ∞, the
    // mid-field orders by real error, and a budget death degrades radially
    // because error ∝ 1/dmin (the alpen-dawn seam class). The full three-band
    // scheme + its unlock-chain proof is preserved in DESIGN.md round 5/11.
    // The request cap still protects the non-cancellable worker queue from
    // stale requests while the camera moves; turbo keeps the worker saturated.
    // error desc; equal-error ties order COARSE-FIRST, then nearest. Equal
    // errors mean "same covering tile" (its error is shared by every miss
    // under it), and a cover is RELEASED cheapest breadth-first: fill the
    // coarse coverage across all its sub-paths, the cover splits, the errors
    // localize, recurse. (Third-probe lesson: a nearest-first tiebreak here
    // sends the whole budget depth-first down the nearest chains — far
    // coverage starves, the cover never releases, and the display freezes at
    // the face root: the round-5 collapse, reproduced verbatim.) The fresh-
    // cache sentinel errors vary per leaf (∝1/dmin), so this tiebreak cannot
    // cause a global breadth flood — it only orders within one cover's group.
    const misses = [...missing.values()].sort((a, b) => (b.err - a.err) || (a.l - b.l) || (a.dmin - b.dmin));
    // CLOSED-LOOP commitment (the first-probe lesson): an open-loop burst
    // committed the whole headroom to blind-priority guesses in two frames —
    // the nearest chains ate the budget and mid-field coverage starved under
    // covering ancestors. Cap OUTSTANDING requests instead: each bake wave
    // lands, errors re-rank, the next wave goes out with fresher information.
    // The worker is serial, so deep outstanding queues buy no latency anyway.
    const capReq = Math.max(0, Math.min(burst ? 384 : 48, 128 - this.pending.size));
    // HEADROOM GUARD (round-4 OOM: never allocate to death) + PREEMPTIVE
    // REBALANCING (Phase M). Binary warmth is not enough: after a same-body
    // pose change the ENTIRE cache can sit on the new pose's desired-path
    // lineages (fourth probe: coast-400km → beach-eye left cold = 0, room =
    // 0, display frozen at the inherited L9 allocation). Retention must be
    // VALUE-ranked in the same error currency as the requests:
    //   ∞  displayed tiles + their ancestor chains (the render + its
    //      draw-best-available fallback — evicting either makes holes);
    //   0  cold tiles (untouched 30 frames);
    //   0.1 × the covering zone's suffered error for COVERED, non-displayed
    //      tiles — they contribute nothing to the current render; the camera
    //      pyramid's covered tiles ride their cover's huge error (protected),
    //      a far zone's leftovers ride its tiny one (reclaimed).
    // Trades only go UP by a 4× margin (top miss error vs victim value), so
    // the display error is a strictly decreasing potential — no thrash
    // cycles; a reclaimed soon-useful tile re-bakes once, and convergence
    // beats a frozen stall. If nothing qualifies, stop requesting at the cap
    // and settle at best-available.
    let room = Math.max(0, CACHE_CAP + 100 - this.cache.size - this.pending.size);
    const wantReq = Math.min(capReq, misses.length);
    // absolute suffering floor: at a budget-bound equilibrium some misses
    // ALWAYS remain (topErr ~1-2), and margin-only trades kept firing there —
    // the ocean-fixed motion path measured 2.4× flicker from tiles endlessly
    // re-dissolving (sixth probe). Rebalancing is for a display that is
    // actually hurting (the beach freeze sat at topErr ~1e5), not for
    // shaving the last epsilon off a settled one.
    if (room < wantReq && misses.length && misses[0].err > 3.0) {
      const topErr = misses[0].err;
      const protect = new Set();
      for (const t of display.values()) {
        protect.add(t.key);
        for (let ll = t.level - 1; ll >= 0; ll--) protect.add(this.key(t.face, ll, t.x >> (t.level - ll), t.y >> (t.level - ll)));
      }
      const errAt = (lvl, dist) => {
        const px = 1 / Math.max(dist * pixAng, 1e-9);
        return Math.max((this.relief * Math.pow(2, -0.8 * (lvl + 1)) * px) / TAU_AMP,
                        ((this.faceArc / (1 << lvl) / TILE_RES) * px) / TAU_TEXEL);
      };
      const cand = [];
      for (const t of this.cache.values()) {
        if (protect.has(t.key)) {
          // class 3 — a DISPLAYED tile from an EARLIER pose epoch: the legacy
          // display itself is what pins the budget after a pose change (probe
          // eight: the old-epoch covered pool drains, then legacy display +
          // ancestor chains hold ~400 slots in a mutual deadlock — they can't
          // release without room, room can't free without them). Value = the
          // one-level-fallback error at its own distance: far legacy zones go
          // first, near ones are expensive. NEVER the current epoch's display
          // (that's the render), and disposal is DEFERRED one frame so the
          // zone falls back to its cached ancestor without a hole frame.
          if (display.has(t.key) && (t.epoch ?? 0) < (this.epoch ?? 0)) {
            cand.push([errAt(Math.max(t.level - 1, 0), Math.max(t.dist ?? 1e9, 0.1)), t, true]);
          }
          continue; // pure ancestors stay untouchable (fallback chains)
        }
        if (t.lastUse < frameNo - 30) { cand.push([0, t, false]); continue; }
        // EPOCH GATE (probes six + seven): a covered tile baked under the
        // CURRENT pose epoch is part of an active unlock — its siblings are
        // still streaming, and reclaiming it rebakes it forever
        // (bake→cover→reclaim→rebake churn kept the ocean-fixed path
        // perpetually unsettled: 2.4× flicker). Only earlier-epoch leftovers
        // are junk.
        if ((t.epoch ?? 0) >= (this.epoch ?? 0)) continue;
        let v = 0;
        for (let ll = t.level - 1; ll >= 0; ll--) {
          const a = display.get(this.key(t.face, ll, t.x >> (t.level - ll), t.y >> (t.level - ll)));
          if (a) { v = 0.1 * errAt(a.level, Math.max(a.dist ?? 1e9, 0.1)); break; }
        }
        cand.push([v, t, false]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      let freed = 0;
      for (const [v, t, wasDisplayed] of cand) {
        if (room >= wantReq || freed >= 24) break;
        if (topErr < 4 * v) break; // only trade strictly up (potential argument)
        this.cache.delete(t.key);
        if (wasDisplayed) this.deadPool.push(t); // renders once more, dies next frame
        else this.disposeTile(t);
        room++; freed++;
      }
      this.stats.preempt = { cand: cand.length, freed, topErr: Math.round(topErr), epoch: this.epoch };
    }
    for (const mr of misses.slice(0, Math.min(capReq, room))) this.request(mr.f, mr.l, mr.x, mr.y);

    // sync scene: hide everything, then show/create the display set
    for (const t of this.visible) {
      if (t.mesh) t.mesh.visible = false;
      if (t.wire) t.wire.visible = false;
      if (t.ocean) t.ocean.visible = false;
      if (t.rocks) t.rocks.visible = false;
      if (t.forms) t.forms.visible = false; // panel HIGH: stale tiles kept formations visible — floaters over refined terrain
    }
    this.visible = [];
    let deepest = 0, fading = 0;
    // geometry morphs per VERTEX now (TERRAIN_VERT, pure fn of camera
    // distance) — the display loop only drives the stream-in CONTENT
    // crossfade: a fresh tile stipples in over FADE_S wall seconds while its direct
    // parent is co-drawn stippling out per child quadrant. The complementary
    // screen-anchored partition (ignoise) means exactly one of the pair owns
    // each pixel — no double-draw, no z-fight, no alpha sort (Phase M).
    const rk = this.body.rocks;
    // debris: rocks are facts of the planet; the render gate is the same
    // screen-footprint currency the per-instance fold uses — build only where
    // the LARGEST clast could still resolve (trails the fold by construction,
    // so nothing visible is ever culled: the 800 m "render bubble" edge is
    // gone, and the ≥L15 membership boundary sits beyond every clast's fold
    // distance at any FOV, because fold and split both key on pixAng)
    const rockDist = rk ? (rk.sizeMax * 1.4) / (1.54 * pixAng) : 0;
    // formations share the fold currency; their largest solid resolves ~20x
    // farther than the largest clast, so the band reaches tens of km
    this.formDist = this.body.formations
      ? (this.body.formations.sizeMax * 1.4) / (1.54 * pixAng) : 0;
    const coParents = new Map(); // parent tile -> per-quadrant child fades
    for (const t of display.values()) {
      if (!t.mesh) this.buildTile(t);
      let fade = (t.fade = Math.min((t.fade ?? 0) + dtFade / FADE_S, 1));
      const parent = t.level > 0
        ? this.cache.get(this.key(t.face, t.level - 1, t.x >> 1, t.y >> 1)) : null;
      if (fade < 1 && (!parent || !parent.mesh)) fade = t.fade = 1; // no partner: show whole
      t.mesh.material.uniforms.uFadeIn.value = fade;
      t.mesh.material.uniforms.uFadeOut.value.set(0, 0, 0, 0);
      if (t.ocean) {
        t.ocean.material.uniforms.uFadeIn.value = fade;
        t.ocean.material.uniforms.uFadeOut.value.set(0, 0, 0, 0);
      }
      if (fade < 1) {
        fading++;
        let cp = coParents.get(parent);
        if (!cp) coParents.set(parent, (cp = [1, 1, 1, 1])); // 1 = quadrant owned elsewhere
        cp[(t.y & 1) * 2 + (t.x & 1)] = fade;
      }
      t.mesh.visible = true;
      if (t.wire) t.wire.visible = this.wireframe;
      if (t.ocean) { t.ocean.visible = true; this.updateWavePhases(t, time); }
      if (t.level > deepest) deepest = t.level;
      // round 14: the band widens one level — tiles at minTileLevel-1 build
      // the IMPOSTOR representation of the same lattice facts (the L14
      // boulder band; buildRocks branches on the level). Same queue, same
      // fold currency, same settle accounting.
      if (rk && t.level >= rk.minTileLevel - 1 && t.dist < rockDist + this.faceArc / (1 << t.level)) {
        if (t.rocks === null && !t.rocksQueued) { t.rocksQueued = true; this.rockQueue.push(t); }
        if (t.rocks) {
          t.rocks.visible = this.debris;
          if (t.rockFade === undefined) {
            // seamless swap when the parent's rocks were already standing in
            // (identical lattice placement, §7) — dissolve in only on fresh ground
            t.rockFade = parent && parent.rocks ? 1 : 0;
          }
          t.rockFade = Math.min(t.rockFade + dtFade / ROCK_FADE_S, 1);
          if (t.rockMat) t.rockMat.uniforms.uRockFade.value = t.rockFade;
          if (t.rockFade < 1) fading++;
          // draw-range cull: instances are size-sorted at build, so the
          // resolvable population at this tile's distance is a PREFIX —
          // im.count shrinks the submission itself (an InstancedMesh
          // vertex-shades every submitted instance whether or not the fold
          // degenerates it, and that vertex work was the measured cost).
          // t.dist is the tile's NEAREST point: conservative, never culls a
          // resolvable rock; the per-instance jittered fold refines the rest.
          const foldSize = 1.54 * Math.max(t.dist, 1) * pixAng; // 2.2 px × min jit
          for (const im of t.rocks.children) {
            const sizes = im.userData.sizes;
            let n = sizes.length;
            if (sizes[0] < foldSize) n = 0;
            else if (sizes[n - 1] < foldSize) { // binary search the prefix end
              let lo = 0, hi = n - 1;
              while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (sizes[mid] >= foldSize) lo = mid; else hi = mid; }
              n = lo + 1;
            }
            im.count = n;
            im.visible = n > 0;
          }
        } else if (t.rocks === null && parent && parent.rocks) {
          // hold the parent's standing rocks until this tile's build lands —
          // the big boulders' matrices are identical, so the swap is seamless
          // (round 14: this now also bridges the impostor->mesh rung swap —
          // the L14 impostors stand in while the L15 mesh build lands, and
          // K5's child-anchored placement makes the positions bit-exact)
          parent.rocks.visible = this.debris;
          if (!this.visible.includes(parent) && !coParents.has(parent)) this.visible.push(parent);
          parent.lastUse = frameNo;
        }
      }
      // round 14 — formations (mesh rung >= minTileLevel, impostor rung one
      // level below), same lifecycle as rocks: queue/build/fade/prefix-cull
      const fmr = this.body.formations;
      if (fmr && t.level >= fmr.minTileLevel - 1
        && t.dist < this.formDist + this.faceArc / (1 << t.level)) {
        if (t.forms === null && !t.formsQueued) {
          t.formsQueued = true;
          // round 15 (residue: build-wave prefilter): the closed-form lattice
          // existence test runs at push time — a candidate-free tile goes
          // straight to the "built, empty" state buildForms would produce,
          // without costing the queue a slot (scheduling only)
          if (anyFormationCandidate(t, this.body)) this.formQueue.push(t);
          else t.forms = undefined;
        }
        if (t.forms) {
          t.forms.visible = this.debris;
          if (t.formFade === undefined) t.formFade = parent && parent.forms ? 1 : 0;
          t.formFade = Math.min(t.formFade + dtFade / ROCK_FADE_S, 1);
          if (t.formMat) t.formMat.uniforms.uRockFade.value = t.formFade;
          if (t.formImpMat) t.formImpMat.uniforms.uRockFade.value = t.formFade;
          if (t.formFade < 1) fading++;
          const foldSizeF = 1.54 * Math.max(t.dist, 1) * pixAng;
          for (const im of t.forms.children) {
            const sizes = im.userData.sizes;
            let n = sizes.length;
            if (sizes[0] < foldSizeF) n = 0;
            else if (sizes[n - 1] < foldSizeF) {
              let lo = 0, hi = n - 1;
              while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (sizes[mid] >= foldSizeF) lo = mid; else hi = mid; }
              n = lo + 1;
            }
            im.count = n;
            im.visible = n > 0;
          }
        } else if (t.forms === null && parent && parent.forms) {
          parent.forms.visible = this.debris;
          if (!this.visible.includes(parent) && !coParents.has(parent)) this.visible.push(parent);
          parent.lastUse = frameNo;
        }
      }
      this.visible.push(t);
    }
    // co-draw fade-parents: the parent renders ONLY the stipple complement of
    // its fading children (quadrants owned by settled tiles are fully yielded)
    for (const [p, fades] of coParents) {
      if (!p || !p.mesh) continue;
      p.lastUse = frameNo;
      p.fade = 1; // a co-parent never re-fades itself
      p.mesh.material.uniforms.uFadeIn.value = 1;
      p.mesh.material.uniforms.uFadeOut.value.set(fades[0], fades[1], fades[2], fades[3]);
      p.mesh.visible = true;
      if (p.ocean) {
        p.ocean.material.uniforms.uFadeIn.value = 1;
        p.ocean.material.uniforms.uFadeOut.value.set(fades[0], fades[1], fades[2], fades[3]);
        p.ocean.visible = true;
        this.updateWavePhases(p, time);
      }
      this.visible.push(p);
    }
    // 1/frame keeps interactive frames smooth; batched under turbo settle
    for (let k = burst ? 8 : 1; k > 0 && this.rockQueue.length; k--) this.buildRocks(this.rockQueue.shift());
    // formations drain TIME-BOXED (sweep-measured): the formation wave queues
    // every tile within formDist (~hundreds at eye level) but most builds are
    // EMPTY lattice scans of a few ms — a fixed count/frame stretched Rubra
    // settles past their bench budgets. Scheduling only: build content is
    // unchanged, and deferred builds requeue via the display loop, never
    // inside this frame (no intra-frame livelock).
    {
      const tF0 = performance.now();
      let nF = burst ? 96 : 2;
      while (nF-- > 0 && this.formQueue.length && performance.now() - tF0 < 8) {
        this.buildForms(this.formQueue.shift());
      }
    }

    this.evict(frameNo);
    this.stats.tiles = display.size;
    this.stats.baked = this.cache.size;
    this.stats.pending = this.pending.size;
    this.stats.level = deepest;
    this.stats.fading = fading; // __shot settles only when every dissolve is done
    // scheduler diagnostics (cheap; the honest-budget work is measured, not
    // guessed): desired leaf count, missing count, and the deepest MISS level
    this.stats.desired = desired.length;
    this.stats.missing = missing.size;
    // round 17: a LOOP, never a spread — on a 10 km body the whole visible
    // hemisphere is near, the missing set reaches tens of thousands, and
    // Math.max(...arr) overflows the call stack at ~50-65k args (the
    // arrokoth-terminator first-light crash: nondeterministic, right at the
    // V8 spread limit; this diagnostics line was the only unbounded spread)
    let missDeep = -1;
    for (const m of misses) if (m.l > missDeep) missDeep = m.l;
    this.stats.missDeep = missDeep;
    this.stats.room = room;
    return this.stats;
  }

  // set node-local mesh offsets for a given camera (called before each render pass)
  applyCamera(camPos) {
    for (const t of this.visible) {
      const c = t.center;
      const px = c[0] - camPos[0], py = c[1] - camPos[1], pz = c[2] - camPos[2];
      t.mesh.position.set(px, py, pz);
      if (t.wire) t.wire.position.set(px, py, pz);
      if (t.ocean) t.ocean.position.set(px, py, pz);
      if (t.rocks) t.rocks.position.set(px, py, pz);
      // round 14 (panel HIGH, the floaters' TRUE root cause): formation
      // groups carry tile-centre-relative matrices exactly like rocks — an
      // unpositioned group renders them displaced by the whole centre vector
      if (t.forms) t.forms.position.set(px, py, pz);
    }
  }

  updateWavePhases(t, time) {
    const u = t.ocean.material.uniforms;
    const c = t.center;
    for (let i = 0; i < this.waveK.length; i++) {
      const d = this.waveDirs[i];
      // double-precision phase per tile: k*dot(center, dir) + omega*t, mod 2pi (§12)
      const raw = this.waveK[i] * (c[0] * d.x + c[1] * d.y + c[2] * d.z) + this.waveOmega[i] * time;
      u.uWavePhase.value[i] = raw % (2 * Math.PI);
    }
  }

  // ---------------------------------------------------------------------
  buildTile(t) {
    const { body, fig } = this;
    const D = 1 << t.level;
    const cdir = faceUvToDir(t.face, (t.x + 0.5) / D, (t.y + 0.5) / D);
    t.center = fig
      ? figMapDir(fig, cdir) // anchor ON the figure surface, not the mean sphere
      : [cdir[0] * body.R, cdir[1] * body.R, cdir[2] * body.R];

    // positions over [-2..66] in doubles (halo heights give seamless normals — §3)
    const P = TILE_RES + 5; // 69
    const px = new Float64Array(P * P), py = new Float64Array(P * P), pz = new Float64Array(P * P);
    // undisplaced twin (no meso band): source of the SMOOTH normal the shader
    // folds toward when the meso facets go sub-footprint (Phase M filtered
    // normals — the thrice-misattributed grazing carpet's TRUE-cause fix)
    const qx = new Float64Array(P * P), qy = new Float64Array(P * P), qz = new Float64Array(P * P);
    const dirTmp = [0, 0, 0];
    const DD = TILE_RES << t.level;
    // ground plan L2: meso-displacement baked into the MESH (CPU, in doubles) —
    // one geometry every pass inherits: the sun depth pass renders tiles through
    // scene.overrideMaterial, so any shader-side displacement would detach the
    // terrain from its own shadows (the round-5 "per-representation invariant"
    // lesson). Position-pure (world-domain periodic noise, bit-exact across tile
    // edges); amplitude from the rock/debris fields; §4 onset ramp via mesoRamp.
    // dispK scales own-level displacement to the PARENT's ramp so the geomorph
    // morphs the band in with the same anchor discipline as the bake bands.
    const disp = new Float32Array(P * P);
    // figure bodies key the meso onset on PHYSICAL cell size (9.54 m = the
    // band's design onset — tellus's level-14 cell), not the absolute level:
    // a 10 km body's level 9 has 0.4 m cells and would otherwise never reach
    // the hardcoded level-14 onset (panel arrokoth-meso finding). Legacy
    // bodies keep the level-keyed ramp VERBATIM (their metre-keyed twin is
    // not byte-identical — different faceArc per body — so it is fig-gated).
    const cellM = this.faceArc / DD;
    const rampOwn = fig ? clamp(Math.log2(9.54 / Math.max(cellM, 1e-9)) / 3, 0, 1) : mesoRamp(t.level);
    const rampPar = fig ? clamp(Math.log2(9.54 / Math.max(cellM * 2, 1e-9)) / 3, 0, 1) : mesoRamp(t.level - 1);
    const dispK = rampOwn > 0 ? rampPar / rampOwn : 0;
    // per-vertex displacement direction m̂ for figure bodies (also consumed by
    // the skirt drop, the normal orientation flip, and the aFigN morph axis)
    const mDir = fig ? new Float64Array(P * P * 3) : null;
    const mTmp = [0, 0, 0];
    for (let j = -2; j <= TILE_RES + 2; j++) {
      const v = (t.y * TILE_RES + j) / DD;
      for (let i = -2; i <= TILE_RES + 2; i++) {
        const u = (t.x * TILE_RES + i) / DD;
        faceUvToDir(t.face, u, v, dirTmp);
        const h = t.height[I(i, j)];
        const c = (j + 2) * P + (i + 2);
        if (fig) {
          const tR = figRadial(fig, dirTmp);
          const bx = dirTmp[0] * tR, by = dirTmp[1] * tR, bz = dirTmp[2] * tR;
          figUp(fig, [bx, by, bz], mTmp);
          mDir[c * 3] = mTmp[0]; mDir[c * 3 + 1] = mTmp[1]; mDir[c * 3 + 2] = mTmp[2];
          let d = 0;
          if (rampOwn > 0) {
            const rAmp = Math.max(halfToFloat(t.atlas[I(i, j) * 4]), halfToFloat(t.atlas[I(i, j) * 4 + 3]));
            d = mesoDispRamped(bx + mTmp[0] * h, by + mTmp[1] * h, bz + mTmp[2] * h, rAmp, rampOwn);
          }
          disp[c] = d;
          px[c] = bx + mTmp[0] * (h + d) - t.center[0];
          py[c] = by + mTmp[1] * (h + d) - t.center[1];
          pz[c] = bz + mTmp[2] * (h + d) - t.center[2];
          qx[c] = bx + mTmp[0] * h - t.center[0];
          qy[c] = by + mTmp[1] * h - t.center[1];
          qz[c] = bz + mTmp[2] * h - t.center[2];
          continue;
        }
        let d = 0;
        if (rampOwn > 0) {
          const rAmp = Math.max(halfToFloat(t.atlas[I(i, j) * 4]), halfToFloat(t.atlas[I(i, j) * 4 + 3]));
          const r0 = body.R + h;
          d = mesoDisp(dirTmp[0] * r0, dirTmp[1] * r0, dirTmp[2] * r0, rAmp, t.level);
        }
        disp[c] = d;
        const r = body.R + h + d;
        px[c] = dirTmp[0] * r - t.center[0];
        py[c] = dirTmp[1] * r - t.center[1];
        pz[c] = dirTmp[2] * r - t.center[2];
        const r0 = body.R + h;
        qx[c] = dirTmp[0] * r0 - t.center[0];
        qy[c] = dirTmp[1] * r0 - t.center[1];
        qz[c] = dirTmp[2] * r0 - t.center[2];
      }
    }
    const at = (i, j) => (j + 2) * P + (i + 2);

    const cell = this.faceArc / DD;
    // deep tiles can display beside MUCH coarser neighbours (three-band
    // allocation): the skirt must cover the un-owned band-tail height
    // mismatch (~relief amplitude below the coverage level), or the edge
    // opens into a see-through crack (round-5 live report)
    const bandTail = t.level > 12 ? this.relief * 0.0012 : 0;
    // figure bodies: the R-fraction cap binds on a 10 km body (135 m vs the
    // local relief the skirt exists to mask) — key it on local scale instead
    const skirtDrop = fig
      ? Math.min(4 * cell + (t.maxH - t.minH) * 0.25 + bandTail, fig.boundR * 0.05)
      : Math.min(4 * cell + (t.maxH - t.minH) * 0.1 + bandTail, body.R * 0.015);
    const pos = new Float32Array(GRID * GRID * 3);
    const nrm = new Float32Array(GRID * GRID * 3);
    const nS = new Int16Array(GRID * GRID * 2); // oct-encoded SMOOTH normal (Phase M fold)
    const figN = fig ? new Int16Array(GRID * GRID * 2) : null; // oct m̂ (morph axis, round 17)
    const hgt = new Float32Array(GRID * GRID);
    const hgt0 = new Float32Array(GRID * GRID); // geomorph source (parent surface)
    let k = 0, maxR2 = 0;
    for (let gj = -1; gj <= TILE_RES + 1; gj++)
      for (let gi = -1; gi <= TILE_RES + 1; gi++) {
        const ci = clamp(gi, 0, TILE_RES), cj = clamp(gj, 0, TILE_RES);
        const skirt = ci !== gi || cj !== gj;
        const c = at(ci, cj);
        // outward-oriented normal from central differences (uses halo positions)
        let ex = px[at(ci + 1, cj)] - px[at(ci - 1, cj)],
          ey = py[at(ci + 1, cj)] - py[at(ci - 1, cj)],
          ez = pz[at(ci + 1, cj)] - pz[at(ci - 1, cj)];
        let fx = px[at(ci, cj + 1)] - px[at(ci, cj - 1)],
          fy = py[at(ci, cj + 1)] - py[at(ci, cj - 1)],
          fz = pz[at(ci, cj + 1)] - pz[at(ci, cj - 1)];
        let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
        const wx = t.center[0] + px[c], wy = t.center[1] + py[c], wz = t.center[2] + pz[c];
        // outward test: against m̂ on a figure (at a lobes neck the surface
        // normal points AWAY from the center line — n·worldPos flips wrongly)
        const ox = fig ? mDir[c * 3] : wx, oy = fig ? mDir[c * 3 + 1] : wy, oz = fig ? mDir[c * 3 + 2] : wz;
        if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const il = 1 / Math.hypot(nx, ny, nz);
        // smooth (undisplaced) normal — the fold target: identical to the mesh
        // normal wherever the meso band is zero, so the vertex mix is a no-op
        // there by construction (no per-tile gate needed)
        {
          let sx = qx[at(ci + 1, cj)] - qx[at(ci - 1, cj)],
            sy = qy[at(ci + 1, cj)] - qy[at(ci - 1, cj)],
            sz = qz[at(ci + 1, cj)] - qz[at(ci - 1, cj)];
          let txx = qx[at(ci, cj + 1)] - qx[at(ci, cj - 1)],
            tyy = qy[at(ci, cj + 1)] - qy[at(ci, cj - 1)],
            tzz = qz[at(ci, cj + 1)] - qz[at(ci, cj - 1)];
          let mx = sy * tzz - sz * tyy, my = sz * txx - sx * tzz, mz = sx * tyy - sy * txx;
          if (mx * ox + my * oy + mz * oz < 0) { mx = -mx; my = -my; mz = -mz; }
          const ml = 1 / Math.hypot(mx, my, mz);
          mx *= ml; my *= ml; mz *= ml;
          // octahedral encode into normalized Int16 (18 KB/tile — the full
          // 3-float twin would eat a quarter of the round-4 OOM headroom)
          const as = Math.abs(mx) + Math.abs(my) + Math.abs(mz);
          let ou = mx / as, ov = my / as;
          if (mz < 0) {
            const t0 = ou;
            ou = (1 - Math.abs(ov)) * (t0 >= 0 ? 1 : -1);
            ov = (1 - Math.abs(t0)) * (ov >= 0 ? 1 : -1);
          }
          nS[k * 2] = Math.round(clamp(ou, -1, 1) * 32767);
          nS[k * 2 + 1] = Math.round(clamp(ov, -1, 1) * 32767);
        }
        const wl = 1 / Math.hypot(wx, wy, wz);
        let vx = px[c], vy = py[c], vz = pz[c];
        if (skirt) {
          // skirts extrude along −m̂ on a figure (a radial drop at a concave
          // neck opens the seam it exists to mask), −r̂ on the sphere
          if (fig) { vx -= mDir[c * 3] * skirtDrop; vy -= mDir[c * 3 + 1] * skirtDrop; vz -= mDir[c * 3 + 2] * skirtDrop; }
          else { vx -= wx * wl * skirtDrop; vy -= wy * wl * skirtDrop; vz -= wz * wl * skirtDrop; }
        }
        pos[k * 3] = vx; pos[k * 3 + 1] = vy; pos[k * 3 + 2] = vz;
        nrm[k * 3] = nx * il; nrm[k * 3 + 1] = ny * il; nrm[k * 3 + 2] = nz * il;
        // aFigN: the baked displacement direction, oct-encoded — the geomorph
        // morph axis in the vertex shader (modes 1+2). The bake and the morph
        // MUST share one axis or a morphing child leaves its parent's surface
        // (panel: the radial re-derivation contradicts the baked m̂)
        if (fig) {
          const fx = mDir[c * 3], fy = mDir[c * 3 + 1], fz = mDir[c * 3 + 2];
          const as2 = Math.abs(fx) + Math.abs(fy) + Math.abs(fz);
          let fu = fx / as2, fv = fy / as2;
          if (fz < 0) {
            const t0f = fu;
            fu = (1 - Math.abs(fv)) * (t0f >= 0 ? 1 : -1);
            fv = (1 - Math.abs(t0f)) * (fv >= 0 ? 1 : -1);
          }
          figN[k * 2] = Math.round(clamp(fu, -1, 1) * 32767);
          figN[k * 2 + 1] = Math.round(clamp(fv, -1, 1) * 32767);
        }
        // geomorph heights carry the displacement band too: own amplitude at
        // aHeight, the parent ramp's share at aHeight0 — the band morphs in
        // exactly like a bake band instead of stepping at stream-in
        hgt[k] = t.height[I(ci, cj)] + disp[c];
        hgt0[k] = (t.heightBase ? t.heightBase[I(ci, cj)] : t.height[I(ci, cj)]) + disp[c] * dispK;
        const r2 = vx * vx + vy * vy + vz * vz;
        if (r2 > maxR2) maxR2 = r2;
        k++;
      }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('aNormS', new THREE.BufferAttribute(nS, 2, true));
    if (figN) geo.setAttribute('aFigN', new THREE.BufferAttribute(figN, 2, true));
    geo.setAttribute('uv', sharedUv);
    geo.setAttribute('aHeight', new THREE.BufferAttribute(hgt, 1));
    geo.setAttribute('aHeight0', new THREE.BufferAttribute(hgt0, 1));
    geo.setIndex(sharedIndex);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.sqrt(maxR2) + skirtDrop);

    // the field atlas (Phase 2 checkpoint): one RGBA16F array texture packed by
    // bakecore's ATLAS manifest — 16-bit ends the 8-bit contour/terracing class,
    // one binding replaces four, and Phase 2 fields get channels by data
    const tex = new THREE.DataArrayTexture(t.atlas, RASTER, RASTER, ATLAS.length);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.HalfFloatType;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    const fb = FACES[t.face];

    const snap = t.center.map((v) => v - Math.round(v / SNAP) * SNAP);
    t.snap = snap;
    const mat = this.terrainMatProto.clone();
    mat.uniforms = this.sharedUniforms({
      uAtlas: { value: tex },
      uColMare: { value: new THREE.Color(...(body.palette.mare ?? body.palette.dust)) },
      uFreshTint: { value: new THREE.Color(...(body.palette.freshTint ?? [1, 1, 1])) },
      uFaceU: { value: new THREE.Vector3(...fb.u) },
      uFaceV: { value: new THREE.Vector3(...fb.v) },
      uBounceAlb: { value: new THREE.Color(...body.palette.dust) },
      uDetailOffset: { value: new THREE.Vector3(...snap) },
      uTileCtr: { value: new THREE.Vector3(...t.center) },
      // per-vertex geomorph constant: S(l-1) = uMorphAmp / uPixAng in the
      // vertex shader — the band's pure amplitude split distance (Phase M)
      uMorphAmp: { value: this.relief * Math.pow(2, -0.8 * t.level) / TAU_AMP },
      // stream-in crossfade + scatter hand-down conservation (Phase M)
      uFadeIn: { value: 1 },
      uFadeOut: { value: new THREE.Vector4(0, 0, 0, 0) },
      // round 14: the impostor band (minTileLevel-1) also yields the ground's
      // conservation share — the existing closed-form share with THIS level's
      // floor hands exactly the impostor-carried budget out of rockDensity
      // detail (§7: one owner per tile; no new math)
      uRockOn: { value: body.rocks && t.level >= body.rocks.minTileLevel - 1 ? 1 : 0 },
      uRockFloor: { value: this.rockSizeFloor(t.level) },
      uRockDist: { value: new THREE.Vector3(...this.rockDistParams) },
      // Phase M filtered normals: this tile's meso-band onset share — the
      // fragment recomputes the mesoDisp amplitudes to size the σ shoulder
      uMesoRamp: { value: rampOwn },
      uLevelTint: { value: levelTint(t.level) },
      uColDust: { value: new THREE.Color(...body.palette.dust) },
      uColDustVar: { value: new THREE.Color(...body.palette.dustVar) },
      uColRock: { value: new THREE.Color(...body.palette.rock) },
      uColIce: { value: new THREE.Color(...body.palette.ice) },
      uColVeg: { value: new THREE.Color(...(body.palette.veg ?? [0, 0, 0])) },
      uColVegVar: { value: new THREE.Color(...(body.palette.vegVar ?? [0, 0, 0])) },
      // round 18 cryo albedo colours (Europa fracture, Pluto tholin). Default is
      // irrelevant for legacy bodies — their lineaAlb/tholinAlb fields are 0, so
      // mix(albedo, uCol*, 0)=albedo; the default just avoids spreading undefined.
      uColLinea: { value: new THREE.Color(...(body.palette.linea ?? [1, 1, 1])) },
      uColTholin: { value: new THREE.Color(...(body.palette.tholin ?? [1, 1, 1])) },
      uSeaLevel: { value: body.seaLevel ?? 1e9 },
      uHRange: { value: 1500 },
      // ground-law look params (round 8): G1 joint tessellation + G4 routing
      // agents — recipe data (body.ground). jointS must keep the 4096 m snap
      // an exact lattice multiple; uJointP is the matching vhash wrap period
      uJointS: { value: body.ground?.jointS ?? 1.0 },
      uJointK: { value: body.ground?.jointK ?? 0.0 },
      uJointAng: { value: body.ground?.jointAng ?? 0.6 },
      uJointTab: { value: body.ground?.jointTab ?? 0.8 },
      uJointP: { value: Math.round(4096 / (body.ground?.jointS ?? 1.0)) },
      uWindA: { value: ((body.ground?.windDeg ?? 0) * Math.PI) / 180 },
      uRipK: { value: body.ground?.ripK ?? 0.0 },
      uPavK: { value: body.ground?.pavK ?? 0.0 },
      // round 12 (oriented structure): joint-orientation stress coupling +
      // consequence-chain albedo — all recipe data, no per-body constants
      uStressAlign: { value: body.ground?.stressAlign ?? 0.0 },
      uSwellAxis: { value: new THREE.Vector3(...this.swellAxis) },
      uScourK: { value: body.ground?.scourK ?? 0.0 },
      uMantleK: { value: body.ground?.mantleK ?? 0.0 },
      uScourTint: { value: new THREE.Color(...(body.palette.scourTint ?? [1, 1, 1])) },
      uMantleTint: { value: new THREE.Color(...(body.palette.mantleTint ?? [1, 1, 1])) },
      uMantleAlt: { value: new THREE.Vector2(...(body.ground?.mantleAlt ?? [2000, 9000])) },
      // round 13 (Phase 2 mechanical residue): Whittaker biomes, seasonal cap,
      // strata-in-plan, space weathering, wetness, lee streaks — precomputed in
      // this.r13 (all recipe data, §6; the shader gates each off when its K = 0)
      uClimTemp: { value: new THREE.Vector3(...this.r13.climTemp) },
      uClimSeed: { value: this.r13.climSeed },
      uBiomeCold: { value: new THREE.Color(...this.r13.biomeCold) },
      uBiomeWarm: { value: new THREE.Color(...this.r13.biomeWarm) },
      uWhitK: { value: this.r13.whitK },
      uFrostK: { value: this.r13.frostK },
      uFrostTint: { value: new THREE.Color(...this.r13.frostTint) },
      uFrostP: { value: new THREE.Vector3(...this.r13.frostP) },
      uStrataK: { value: this.r13.strataK },
      uStrataAmp: { value: this.r13.strataAmp },
      uStrataFold: { value: new THREE.Vector4(...this.r13.strataFold) },
      uStrataGate: { value: new THREE.Vector3(...this.r13.strataGate) },
      uWeatherK: { value: this.r13.weatherK },
      uWeatherSlope: { value: this.r13.weatherSlope },
      uWeatherTint: { value: new THREE.Color(...this.r13.weatherTint) },
      uWetDark: { value: this.r13.wetDark },
      uWetGloss: { value: this.r13.wetGloss },
      uStreakK: { value: this.r13.streakK },
      // material texture stacks v2 (round 10): the shared archetype atlas + the
      // recipe's per-material layer picks, world scale (m per repeat) and amp
      uMatStack: { value: this.matStackTex },
      uMatFines: { value: body.matStack?.fines ?? 0 },
      uMatRock: { value: body.matStack?.rock ?? 1 },
      uMatIce: { value: body.matStack?.ice ?? 3 },
      uMatScale: { value: body.matStack?.scale ?? 2.5 },
      uMatAmp: { value: body.matStack?.amp ?? 1.0 },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = true;
    // metre-scale shadow caster (sun depth pass, main.js) — the coarsest tiles
    // are excluded: their polygonal silhouettes printed razor-edged
    // parallelogram shadows onto the deepened zone (round-5 panel), and their
    // shadows already live in the baked horizon field. The threshold sits at
    // L13, NOT the debris level: gating at L15 flipped shadow presence at
    // L14/L15 display boundaries inside the map window, which printed giant
    // straight-edged shadow seams at mixed-depth poses (round-5 live report)
    if (t.level >= 13) mesh.layers.enable(1);
    t.mesh = mesh;
    t.tex = tex;
    this.group.add(mesh);

    const wire = new THREE.Mesh(geo, this.wireMat);
    wire.visible = false;
    wire.renderOrder = 10;
    this.group.add(wire);
    t.wire = wire;

    if (body.seaLevel != null && t.minH < body.seaLevel) this.buildOcean(t);
  }

  buildOcean(t) {
    const { body } = this;
    const sea = body.seaLevel;
    const D = 1 << t.level, DD = TILE_RES << t.level;
    const pos = new Float32Array(OGRID * OGRID * 3);
    const ouv = new Float32Array(OGRID * OGRID * 2);
    const dirTmp = [0, 0, 0];
    const spacing = this.faceArc / D / 32;
    const sag = 12 * body.R * (spacing / body.R) ** 2 + 1.5;
    let k = 0, maxR2 = 0;
    for (let gj = 0; gj < OGRID; gj++)
      for (let gi = 0; gi < OGRID; gi++) {
        // 33 interior corners (even raster corners) + duplicated edge ring as skirt
        const ci = clamp(gi - 1, 0, 32), cj = clamp(gj - 1, 0, 32);
        const skirt = gi === 0 || gj === 0 || gi === OGRID - 1 || gj === OGRID - 1;
        const u = (t.x * TILE_RES + ci * 2) / DD, v = (t.y * TILE_RES + cj * 2) / DD;
        faceUvToDir(t.face, u, v, dirTmp);
        const r = body.R + sea - (skirt ? sag : 0);
        const x = dirTmp[0] * r - t.center[0], y = dirTmp[1] * r - t.center[1], z = dirTmp[2] * r - t.center[2];
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        // tile-fraction uv into the field atlas: per-PIXEL bathymetry replaces
        // the 33x33 per-vertex color mix (the orbit "checkerboard" defect)
        ouv[k * 2] = (ci * 2) / TILE_RES; ouv[k * 2 + 1] = (cj * 2) / TILE_RES;
        const r2 = x * x + y * y + z * z;
        if (r2 > maxR2) maxR2 = r2;
        k++;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(ouv, 2));
    geo.setIndex(oceanIndex);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.sqrt(maxR2) + 10);
    const mat = this.oceanMatProto.clone();
    mat.uniforms = this.sharedUniforms({
      uAtlas: { value: t.tex },
      uSeaLevel: { value: sea },
      uTileCenter: { value: new THREE.Vector3(...t.center) },
      uDetailOffset: { value: new THREE.Vector3(...t.snap) },
      uWaveDirs: { value: this.waveDirs },
      uWaveK: { value: this.waveK.slice() },
      uWavePhase: { value: new Array(this.waveK.length).fill(0) },
      uWaveAmp: { value: this.waveAmp.slice() },
      uVertSpacing: { value: spacing },
      uColShallow: { value: new THREE.Color(...this.body.palette.oceanShallow) },
      uColDeep: { value: new THREE.Color(...this.body.palette.oceanDeep) },
      uColDust: { value: new THREE.Color(...this.body.palette.dust) },
      // Water v2 [recipe]: glitter / surf / turbidity strengths + shoaling gain
      uGlitter: { value: this.body.water?.glitter ?? 1.0 },
      uSurf: { value: this.body.water?.surf ?? 1.0 },
      uSurfK: { value: this.body.water?.surfK ?? 0.12 },
      uTurbidity: { value: this.body.water?.turbidity ?? 1.0 },
      uFadeIn: { value: 1 },
      uFadeOut: { value: new THREE.Vector4(0, 0, 0, 0) },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    t.ocean = mesh;
  }

  buildRocks(t) {
    const { body } = this;
    // deferred build: the tile may have been evicted (never resurrect it) —
    // a stale build would leave a ghost InstancedMesh at the camera origin
    if (this.cache.get(t.key) !== t) { t.rocksQueued = false; return; }
    // round 14: below the declared field level, the tile builds the IMPOSTOR
    // representation of the same lattice facts (the ladder's middle rung)
    if (t.level < body.rocks.minTileLevel) return this.buildRockImpostors(t);
    // density is read at the recipe's declared field level, not the rendering
    // tile's — rocks are facts of the planet, not of the LOD (§7)
    const fl = Math.min(body.rocks.minTileLevel, t.level);
    let fieldTile = t;
    if (t.level > fl) {
      const fx = t.x >> (t.level - fl), fy = t.y >> (t.level - fl);
      fieldTile = this.cache.get(this.key(t.face, fl, fx, fy));
      if (!fieldTile) { this.request(t.face, fl, fx, fy); t.rocksQueued = false; return; }
    }
    const placed = placeRocks(t, fieldTile, body, this.rockMeta, 6000, this.rockSizeFloor(t.level));
    if (!placed.count) { t.rocks = undefined; return; }
    // one InstancedMesh per (archetype, variant) bucket sharing that geometry;
    // mesh LOD by tile level (deeper tiles sit nearer the camera). The material
    // is a PER-TILE clone (same program) binding the owner tile's field atlas:
    // rocks receive the baked horizon-field shadows and view factor of the
    // ground under them (packed uv rides the instance matrix, scattercore)
    const fb = FACES[t.face];
    const mat = this.rockMatProto.clone();
    mat.uniforms = this.sharedUniforms({
      uColRock: { value: new THREE.Color(...body.palette.rock) },
      uColDust: { value: new THREE.Color(...body.palette.dust) },
      uBounceAlb: { value: new THREE.Color(...body.palette.dust) },
      uAtlas: { value: t.tex },
      uFaceU: { value: new THREE.Vector3(...fb.u) },
      uFaceV: { value: new THREE.Vector3(...fb.v) },
      uRockMap: { value: this.rockMapTex },
      uVar: { value: 0 },
      uRockFade: { value: 1 }, // build-arrival dissolve, driven by the display loop
    });
    t.rockMat = mat;
    const lod = lodForLevel(t.level);
    const grp = new THREE.Group();
    for (const bk of placed.buckets) {
      const im = new THREE.InstancedMesh(this.rockGeoms[bk.ai][bk.vi][lod], mat, bk.count);
      im.instanceMatrix = new THREE.InstancedBufferAttribute(bk.matrices, 16);
      im.frustumCulled = false;
      im.userData.sizes = bk.sizes; // size-desc; display loop sets the draw range
      im.layers.enable(1); // metre-scale shadow caster
      // limit-surface map layer for this bucket, set just before its draw call
      // (one material per tile, one octahedral layer per archetype x variant)
      const layer = bk.ai * VARIANTS + bk.vi;
      im.onBeforeRender = () => { mat.uniforms.uVar.value = layer; };
      grp.add(im);
    }
    grp.visible = false; // shown (and positioned) by the display loop only
    this.group.add(grp);
    t.rocks = grp;
  }

  // round 14 — the impostor rung (mesh -> IMPOSTOR -> roughness, Appendix C).
  // The L14 band tile enumerates the SAME lattice facts through its four L15
  // children (density, clamping, height snap and meso level all bit-exact
  // with each child's own mesh build — panel K5), and draws one camera-facing
  // quad per resolvable rock, all buckets merged into ONE InstancedMesh (the
  // hull-map layer rides a per-instance attribute). Children are PINNED
  // against eviction while this tile stands (panel H1) and requested through
  // the normal worker queue, so the settle predicate stays honest.
  buildRockImpostors(t) {
    const { body } = this;
    if (this.cache.get(t.key) !== t) { t.rocksQueued = false; return; }
    const fl = body.rocks.minTileLevel;
    const kids = [];
    let missing = 0;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const k = this.key(t.face, fl, t.x * 2 + dx, t.y * 2 + dy);
        const kid = this.cache.get(k);
        if (kid) kids[dy * 2 + dx] = kid;
        else { missing++; this.request(t.face, fl, t.x * 2 + dx, t.y * 2 + dy); }
      }
    if (missing) {
      t.rockTries = (t.rockTries ?? 0) + 1;
      if (t.rockTries > 60) { // bounded (H1): never a settle livelock
        console.warn(`impostor build gave up: ${t.key} (${missing} children unavailable)`);
        t.rocks = undefined;
        return;
      }
      t.rocksQueued = false; // display loop re-queues next frame
      return;
    }
    const D15 = 1 << fl;
    const fieldFor = (u, v) => {
      const dx = Math.min(1, Math.max(0, Math.floor(u * D15) - t.x * 2));
      const dy = Math.min(1, Math.max(0, Math.floor(v * D15) - t.y * 2));
      return kids[dy * 2 + dx];
    };
    const placed = placeRocks(t, kids[0], body, this.rockMeta, 6000,
      this.rockSizeFloor(t.level), { fieldFor, fieldLevel: fl });
    if (!placed.count) { t.rocks = undefined; return; }
    t.rocks = this.buildImpostorGroup(t, placed.buckets, this.rockHullTex, this.rockHullMaxR, VARIANTS,
      new THREE.Color(...body.palette.rock), new THREE.Color(...body.palette.dust));
    t.rockMat = t.rocks.children[0].material;
  }

  // merge placement buckets into one instanced quad draw with per-instance
  // hull-map layer + radius denormalizer attributes; global size-desc order
  // keeps the display loop's prefix cull valid
  buildImpostorGroup(t, buckets, hullTex, hullMaxR, nVar, colRock, colDust) {
    let total = 0;
    for (const bk of buckets) total += bk.count;
    const matrices = new Float32Array(total * 16);
    const aVar = new Float32Array(total);
    const aHullR = new Float32Array(total);
    const order = [];
    for (const bk of buckets)
      for (let n = 0; n < bk.count; n++) order.push({ bk, n, s: bk.sizes[n] });
    order.sort((a, b) => b.s - a.s);
    const sizes = new Float32Array(total);
    for (let m = 0; m < order.length; m++) {
      const { bk, n, s } = order[m];
      matrices.set(bk.matrices.subarray(n * 16, n * 16 + 16), m * 16);
      const layer = bk.ai * nVar + bk.vi;
      aVar[m] = layer;
      aHullR[m] = hullMaxR[layer];
      sizes[m] = s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.quadPos);
    geo.setIndex(this.quadIdx);
    geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(aVar, 1));
    geo.setAttribute('aHullR', new THREE.InstancedBufferAttribute(aHullR, 1));
    const fb = FACES[t.face];
    const mat = this.impostorMatProto.clone();
    mat.uniforms = this.sharedUniforms({
      uColRock: { value: colRock },
      uColDust: { value: colDust },
      uBounceAlb: { value: colDust },
      uAtlas: { value: t.tex },
      uFaceU: { value: new THREE.Vector3(...fb.u) },
      uFaceV: { value: new THREE.Vector3(...fb.v) },
      uHullMap: { value: hullTex },
      uRockFade: { value: 1 },
    });
    const im = new THREE.InstancedMesh(geo, mat, total);
    im.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
    im.frustumCulled = false;
    im.userData.sizes = sizes;
    im.userData.ownGeo = geo; // per-tile geometry (instanced attrs) — disposed with the tile
    // NOT a shadow caster (layer 1 off): a camera-facing quad would print a
    // plate shadow, and the band sits beyond the metre-shadow box anyway
    const grp = new THREE.Group();
    grp.add(im);
    grp.visible = false;
    this.group.add(grp);
    return grp;
  }

  // round 14 — formation builds: mesh rung at >= minTileLevel (per-tile FORM
  // material clone, layer-1 shadow caster, same owner-atlas convention),
  // impostor rung one level below via the same children-resolver machinery.
  // Calved blocks (G3-iv) ride along as ROCK-archetype instances.
  buildForms(t) {
    const { body } = this;
    const fm = body.formations;
    if (this.cache.get(t.key) !== t) { t.formsQueued = false; return; }
    const impostor = t.level < fm.minTileLevel;
    // fields ALWAYS at the declared level (an ancestor for every rung —
    // unlike rocks, formations' field level sits ABOVE their impostor band,
    // so every rung reads the SAME tile and existence agrees trivially)
    const fl = Math.min(fm.fieldLevel, t.level);
    let fieldTile = t, opts = {};
    if (t.level > fl) {
      const fx = t.x >> (t.level - fl), fy = t.y >> (t.level - fl);
      fieldTile = this.cache.get(this.key(t.face, fl, fx, fy));
      if (!fieldTile) { this.request(t.face, fl, fx, fy); t.formsQueued = false; return; }
    }
    if (impostor) {
      // children at the MESH rung's level for the HEIGHT SNAP only (anchor
      // parity, K5): pinned + bounded-retry like the rock band (H1)
      const cl = fm.minTileLevel;
      const kids = [];
      let missing = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const k = this.key(t.face, cl, t.x * 2 + dx, t.y * 2 + dy);
          const kid = this.cache.get(k);
          if (kid) kids[dy * 2 + dx] = kid;
          else { missing++; this.request(t.face, cl, t.x * 2 + dx, t.y * 2 + dy); }
        }
      if (missing) {
        t.formTries = (t.formTries ?? 0) + 1;
        if (t.formTries > 60) { t.forms = undefined; return; }
        t.formsQueued = false;
        return;
      }
      const Dc = 1 << cl;
      opts = {
        snapLevel: cl,
        snapFor: (u, v) => {
          const dx = Math.min(1, Math.max(0, Math.floor(u * Dc) - t.x * 2));
          const dy = Math.min(1, Math.max(0, Math.floor(v * Dc) - t.y * 2));
          return kids[dy * 2 + dx];
        },
      };
    }
    const floorF = this.formSizeFloor(t.level);
    const placed = placeFormations(t, fieldTile, body, this.formMeta, this.rockMeta, 512, floorF, opts);
    if (!placed.count) { t.forms = undefined; return; }
    const grp = new THREE.Group();
    const fb = FACES[t.face];
    if (impostor) {
      if (placed.buckets.length) {
        const g = this.buildImpostorGroup(t, placed.buckets, this.formHullTex, this.formHullMaxR, FORM_VARIANTS,
          new THREE.Color(...body.palette.rock), new THREE.Color(...body.palette.dust));
        // adopt the inner mesh into our group (buildImpostorGroup made its own)
        const im = g.children[0];
        g.remove(im);
        this.group.remove(g);
        grp.add(im);
        t.formImpMat = im.material;
      }
    } else if (placed.buckets.length) {
      const mat = this.formMatProto.clone();
      mat.uniforms = this.sharedUniforms({
        uColRock: { value: new THREE.Color(...body.palette.rock) },
        uColDust: { value: new THREE.Color(...body.palette.dust) },
        uBounceAlb: { value: new THREE.Color(...body.palette.dust) },
        uAtlas: { value: t.tex },
        uFaceU: { value: new THREE.Vector3(...fb.u) },
        uFaceV: { value: new THREE.Vector3(...fb.v) },
        uRockFade: { value: 1 },
        // K2: the formation's bed tone comes from the SAME recipe octave
        // family the bake stamps (bedT0·bedLac^k), selected by footprint in
        // the fragment — the country-rock uStrataFold path is untouched
        uFormBed: { value: this.formBedParams },
        uFormFold: { value: this.formFoldParams },
        uBodyR: { value: body.R },
      });
      t.formMat = mat;
      const lod = t.level >= fm.minTileLevel + 3 ? 0 : t.level >= fm.minTileLevel + 1 ? 1 : 2;
      for (const bk of placed.buckets) {
        const im = new THREE.InstancedMesh(this.formGeoms[bk.ai][bk.vi][lod], mat, bk.count);
        im.instanceMatrix = new THREE.InstancedBufferAttribute(bk.matrices, 16);
        im.frustumCulled = false;
        im.userData.sizes = bk.sizes;
        im.layers.enable(1); // formations cast into the metre-shadow map
        grp.add(im);
      }
    }
    // calved blocks draw through the ROCK path (mesh rung only — at the
    // impostor rung they are sub-fold by the formation floor law)
    if (!impostor && placed.rockBuckets.length && this.rockGeoms) {
      const rmat = this.rockMatProto.clone();
      rmat.uniforms = this.sharedUniforms({
        uColRock: { value: new THREE.Color(...body.palette.rock) },
        uColDust: { value: new THREE.Color(...body.palette.dust) },
        uBounceAlb: { value: new THREE.Color(...body.palette.dust) },
        uAtlas: { value: t.tex },
        uFaceU: { value: new THREE.Vector3(...fb.u) },
        uFaceV: { value: new THREE.Vector3(...fb.v) },
        uRockMap: { value: this.rockMapTex },
        uVar: { value: 0 },
        uRockFade: { value: 1 },
      });
      const lodR = lodForLevel(t.level);
      for (const bk of placed.rockBuckets) {
        const im = new THREE.InstancedMesh(this.rockGeoms[bk.ai][bk.vi][lodR], rmat, bk.count);
        im.instanceMatrix = new THREE.InstancedBufferAttribute(bk.matrices, 16);
        im.frustumCulled = false;
        im.userData.sizes = bk.sizes;
        im.layers.enable(1);
        const layer = bk.ai * VARIANTS + bk.vi;
        im.onBeforeRender = () => { rmat.uniforms.uVar.value = layer; };
        grp.add(im);
      }
    }
    grp.visible = false;
    this.group.add(grp);
    t.forms = grp;
  }

  // formation build floor: anchored at the formation mesh rung's entry level
  // (the same derived-morph-invariant law as rockSizeFloor)
  formSizeFloor(level) {
    const fm = this.body.formations;
    if (!fm) return 0;
    const f0 = fm.sizeMin + 0.45 * (fm.sizeMax - fm.sizeMin);
    const f = f0 * Math.pow(2, -0.8 * (level - fm.minTileLevel));
    return f > fm.sizeMin ? f : 0;
  }

  // cap 700: the round-4 atlas layer (+47 KB/tile CPU + its GPU copy under
  // SwiftShader, which keeps textures in RAM) pushed a 60-scene single-page
  // bench run into ArrayBuffer allocation failures at cap 900 — the display
  // set stays 100-300 tiles, so 700 keeps paths warm with ~150 MB headroom
  // round 14 (H1, hardened after the probe caught the arrival gap): a tile
  // whose PARENT is a live band tile still awaiting its impostor build is
  // pinned — the panel's request/evict livelock otherwise re-opens through
  // the window between a child's bake ARRIVING (lastUse 0, prime evictee)
  // and the parent's build round-robining back to claim it. Parenthood is
  // derived, so the pin needs no bookkeeping and releases itself the moment
  // the parent's build lands (or the parent evicts).
  childPinned(t, frameNo) {
    const rk = this.body.rocks, fm = this.body.formations;
    for (const [pop, field] of [[rk, 'rocks'], [fm, 'forms']]) {
      if (!pop || t.level !== pop.minTileLevel) continue;
      const parent = this.cache.get(this.key(t.face, t.level - 1, t.x >> 1, t.y >> 1));
      if (parent && parent.lastUse >= frameNo - 30 && parent[field] === null) return true;
    }
    return false;
  }

  evict(frameNo, cap = CACHE_CAP) {
    if (this.cache.size <= cap) return;
    const tiles = [...this.cache.values()].filter((t) => t.lastUse < frameNo - 30
      && !this.childPinned(t, frameNo));
    tiles.sort((a, b) => a.lastUse - b.lastUse);
    for (const t of tiles.slice(0, this.cache.size - cap)) {
      this.disposeTile(t);
      this.cache.delete(t.key);
    }
  }

  disposeTile(t) {
    const rq = this.rockQueue.indexOf(t);
    if (rq >= 0) this.rockQueue.splice(rq, 1);
    if (t.mesh) {
      this.group.remove(t.mesh);
      // detach module-level shared attributes so dispose() can't deallocate the
      // uv/index GL buffers still used by every other tile (review finding)
      t.mesh.geometry.setIndex(null);
      t.mesh.geometry.deleteAttribute('uv');
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
    }
    if (t.tex) t.tex.dispose();
    if (t.wire) this.group.remove(t.wire);
    if (t.ocean) {
      this.group.remove(t.ocean);
      t.ocean.geometry.setIndex(null);
      t.ocean.geometry.dispose();
      t.ocean.material.dispose();
    }
    if (t.rocks) {
      this.group.remove(t.rocks);
      // dispose the per-tile instance buffers + the tile's material clone —
      // geometry and the map texture are shared, never disposed here
      if (t.rocks.children.length) t.rocks.children[0].material.dispose();
      for (const im of t.rocks.children) {
        if (im.userData.ownGeo) { // impostor quads carry per-tile instanced attrs
          im.userData.ownGeo.deleteAttribute('position');
          im.userData.ownGeo.setIndex(null);
          im.userData.ownGeo.dispose();
        }
        im.dispose();
      }
    }
    if (t.forms) {
      this.group.remove(t.forms);
      const seen = new Set();
      for (const im of t.forms.children) {
        if (!seen.has(im.material)) { seen.add(im.material); im.material.dispose(); }
        if (im.userData.ownGeo) {
          im.userData.ownGeo.deleteAttribute('position');
          im.userData.ownGeo.setIndex(null);
          im.userData.ownGeo.dispose();
        }
        im.dispose();
      }
    }
    const fq = this.formQueue.indexOf(t);
    if (fq >= 0) this.formQueue.splice(fq, 1);
  }

  dispose() {
    this.worker.removeEventListener('message', this._onMsg);
    for (const t of this.cache.values()) this.disposeTile(t);
    this.cache.clear();
    if (this.rockGeoms) for (const av of this.rockGeoms) for (const lods of av) for (const g of lods) g.dispose();
    if (this.rockMapTex) this.rockMapTex.dispose();
    if (this.rockHullTex) this.rockHullTex.dispose();
    if (this.formGeoms) for (const av of this.formGeoms) for (const lods of av) for (const g of lods) g.dispose();
    if (this.formHullTex) this.formHullTex.dispose();
    if (this.formMatProto) this.formMatProto.dispose();
    this.impostorMatProto.dispose();
    this.rockMatProto.dispose(); this.wireMat.dispose();
  }

  // deepest cached height under a body-fixed direction (camera clamp, inset placement)
  heightAt(dir) {
    const { face, u, v } = dirToFaceUv(dir);
    for (let l = this.body.maxBakeLevel; l >= 0; l--) {
      const D = 1 << l;
      const x = Math.min(Math.floor(u * D), D - 1), y = Math.min(Math.floor(v * D), D - 1);
      const t = this.cache.get(this.key(face, l, x, y));
      if (t) return sampleTileHeight(t, u * D - x, v * D - y);
    }
    return 0;
  }
}
