// main.js — wiring. The render world IS the current body's body-fixed frame; the
// camera renders from the origin and every tile mesh is offset by (center - camera)
// in doubles each pass (CONCEPT §1/§9). Two passes when the eye-level inset is on —
// same scene, same integral, different endpoint (§8's whole point).

import * as THREE from 'three';
import { SYSTEM, bodyById, assertPaletteRecipe, assertFigureRecipe, assertGiantRecipe, assertRingRecipe, assertGiantSystem, assertRingSystem } from './core/recipe.js';
// round 17 (§11 figure generality): recipe-declared reference shapes
import { figOf, figPreflight, figRadial, bodyBoundR, bodyEffR } from './core/figure.js';
import { ephemeris, bodyToInertial, mulMM, transpose } from './core/frames.js';
import { PlanetTiles } from './render/tiles.js';
import { OrbitalCamera } from './render/camera.js';
import { withCommon, SKY_VERT, SKY_FRAG, SCATTER_FOR_STARS, POST_VERT, POST_FRAG, BLOOM_DOWN_FRAG, BLOOM_UP_FRAG, DEPTH_VERT, DEPTH_FRAG } from './render/shaders.js';
import { makeStarPoints } from './render/stars.js';
import { skyAmbient, msSample } from './core/atmo.js';
import { buildMsLUT, annulusTint } from './core/atmolut.js';
import { clamp, vcross, vnorm } from './core/mathx.js';
import { cloudKeyOf, driftPhase, alphaMeanLit, assertCloudRecipe, cloudCovJS, cloudShadeJS, CLOUD_W, CLOUD_H, MAX_DECKS } from './core/cloudcore.js';

const q = new URL(location.href).searchParams;
const FAST = q.get('fast') === '1';
const $ = (id) => document.getElementById(id);

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: !FAST, logarithmicDepthBuffer: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(FAST ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;

// ---- HDR pipeline (Phase 1, [camera] per CONCEPT §10): the scene renders
// linear radiance into a half-float target (MSAA when not FAST); one post pass
// owns exposure, energy-conserving PSF bloom, ACES, sRGB and sensor grain ----
const BLOOM_LEVELS = FAST ? 4 : 5;
const BLOOM_W = 0.045;
const BLOOM_DECAY = 0.55; // per-level halo falloff (deep mips read as blobs on
                          // dim textured fields at night exposure — keep tight)
// mean normalization: the up chain accumulates sum(decay^k * blur_k)
let BLOOM_NORM = 0;
{ let wk = 1; for (let i = 0; i < BLOOM_LEVELS; i++) { BLOOM_NORM += wk; wk *= BLOOM_DECAY; } }
let rtScene = null;
const rtD = [], rtU = [];
// star-pass terrain occlusion (round 11): scene depth + the current pass's
// viewport mapping, updated in makeTargets()/renderPass()
const starDepth = {
  uSceneDepth: { value: null },
  uStarVp: { value: new THREE.Vector4(0, 0, 1, 1) },
  uRtSize: { value: new THREE.Vector2(1, 1) },
};
function makeTargets() {
  const w = renderer.domElement.width, h = renderer.domElement.height;
  if (rtScene) rtScene.dispose();
  for (const r of rtD) r.dispose();
  for (const r of rtU) r.dispose();
  rtD.length = 0; rtU.length = 0;
  rtScene = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false,
    samples: FAST ? 0 : 4,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  // scene depth as a texture: the star pass occlusion-tests each star against
  // the geometry actually rendered (register row: stars burned through
  // boulders/relief — the datum sphere was the only occluder). Sky and stars
  // write no depth, so one tap answers "is anything solid in front here".
  rtScene.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
  starDepth.uSceneDepth.value = rtScene.depthTexture;
  starDepth.uRtSize.value.set(w, h);
  let bw = w, bh = h;
  for (let i = 0; i < BLOOM_LEVELS; i++) {
    bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    const o = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    rtD.push(new THREE.WebGLRenderTarget(bw, bh, o));
    if (i < BLOOM_LEVELS - 1) rtU.push(new THREE.WebGLRenderTarget(bw, bh, o));
  }
}
makeTargets();

const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postTri = new THREE.BufferGeometry();
postTri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));

// ---- metre-scale shadows (Phase 1, §10: shadow maps scoped to m-km): a
// sun-aligned ortho depth pass over the debris band near the camera; terrain
// tiles + rock instances are tagged layer 1 (tiles.js) ----
const SHADOW_RES = 1024;
const shadowRT = new THREE.WebGLRenderTarget(SHADOW_RES, SHADOW_RES, {
  depthBuffer: true, stencilBuffer: false,
  depthTexture: new THREE.DepthTexture(SHADOW_RES, SHADOW_RES, THREE.UnsignedIntType),
});
const sunCam = new THREE.OrthographicCamera(-100, 100, 100, -100, 200, 3500);
sunCam.layers.set(1);
const depthMat = new THREE.ShaderMaterial({
  vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide,
  uniforms: { uPixAng: null /* bound to shared.uPixAng below */ },
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 6e8);
const insetCam = new THREE.PerspectiveCamera(60, 16 / 10, 0.3, 6e8);

// multiple-scattering table (Phase 1, atmolut.js): per-body, cached, swapped on
// body switch. Delivered to the shader as a 32-knot uniform curve (8 sinEl
// knots x 4 sqrt-altitude rows) — a texture LUT here proved per-pixel unstable
// on SwiftShader under draw-call pressure (round-2 dash defect, register row).
const msCache = new Map();

// ---- shared uniform value-objects: one source of truth for every material ----
const shared = {
  uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uSunRad: { value: new THREE.Vector3(20, 20, 20) },
  uCamPos: { value: new THREE.Vector3() },
  uPlanetR: { value: 1 },
  // round 17 figure uniforms (FIG_MODE != 0 programs only read them; the
  // declarations cost legacy programs nothing — mode 0 never compiles them in)
  uFigAxes: { value: new THREE.Vector3(1, 1, 1) },
  uLobeC0: { value: new THREE.Vector3() }, uLobeA0: { value: new THREE.Vector3(1, 1, 1) },
  uLobeC1: { value: new THREE.Vector3() }, uLobeA1: { value: new THREE.Vector3(1, 1, 1) },
  uNeckK: { value: 1 },
  uStarOccR: { value: 1 }, // star occluder: uPlanetR·0.9995 legacy, inscribed radius on figures
  uExposure: { value: 0.5 },
  uHasAtm: { value: 0 },
  uAtmTop: { value: 1 }, uHr: { value: 1 }, uHm: { value: 1 },
  uMieG: { value: new THREE.Vector3(0.76, 0.76, 0.76) }, // per-λ forward lobe
  uBetaR: { value: new THREE.Vector3() },
  uBetaM: { value: new THREE.Vector3() },
  uBetaA: { value: new THREE.Vector3() },
  uAirglow: { value: new THREE.Vector3() },
  uSunAngR: { value: 0.005 }, // penumbra width for the horizon-field shadow test
  uRefrac: { value: 0 },      // recipe refractivity (n-1) at the datum
  uBetaO3: { value: new THREE.Vector3() }, // ozone tent shell (blue twilight zenith)
  uOzH: { value: 0 }, uOzW: { value: 0 },
  // Hillaire MS knot curve: rows at v=.125/.375/.625/.875, knots per skyAmbAt
  uMsK: { value: Array.from({ length: 32 }, () => new THREE.Vector3()) },
  // metre-scale shadow map (camera-local presentation aid, §10)
  uShadowMat: { value: new THREE.Matrix4() },
  uShadowMap: { value: shadowRT.depthTexture },
  uShadowOn: { value: 0 },
  uShadowTexel: { value: 0.1 },
  // eclipse & transit machinery (Phase 1): companions as sun-disc occluders
  uNumOcc: { value: 0 },
  uOccPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uOccR: { value: [0, 0] },
  uOccAnn: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  // sky-ambient curve: 8 knots of irradiance vs sin(sun elevation), evaluated per
  // frame from atmo.js — the shader looks lighting up at each SAMPLE's own sun
  // geometry, never the camera's (Phase 1b terminator-split fix)
  uAmb: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
  uBrdfA: { value: new THREE.Vector4(0.3, 0.06, 0.3, 0.5) }, // regolithW, surgeHs, surgeB0, iceSSS
  uBrdfB: { value: new THREE.Vector4(0.2, 0.4, 0.05, 0.6) }, // iceSpec, iceRough, rockSpec, rockRough
  uTimeS: { value: 0 },
  uShineDir: { value: new THREE.Vector3(0, 1, 0) },
  uShineRad: { value: new THREE.Vector3() },
  uPixAng: { value: 0.001 }, // radians per pixel (sky discs + scatter hand-down)
  uMode: { value: 0 },
  // Phase 4 clouds (round 15) — in `shared`, NEVER skyUniforms-only: every
  // sunTransmit/scatterInline dependency lives here, and the star material
  // (built once, spreads ...shared) must see the decks or stars shine through
  // night clouds (panel M4/F2)
  uCloudMap: { value: null },     // set to cloudTex below (declared later)
  uCloudDecks: { value: 0 },
  uCloudLerp: { value: 0 },
  uCloudMuClamp: { value: 0.09 },
  uCloudDeckA: { value: [new THREE.Vector4(0, 1, 0, 0), new THREE.Vector4(0, 1, 0, 0)] },
  uCloudDeckB: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  uCloudAlb: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  // Phase 4 EMISSION pack (round 16, §8 "the recipe may add emission") — in
  // `shared` (NOT skyUniforms-only) because the emission now lives INSIDE
  // scatterInline (pre-code panel aurora-atm-gate/star-gate): terrain/ocean's
  // aerial-perspective splice must carry it over the night disc from orbit. Each
  // term is recipe-data-gated (a zero colour disables) and drowned by day via the
  // exposure servo. Aurora dual-band (green lower / red upper); phase = (curtain
  // drift offset that wraps at the vnoise period, substorm pulse) computed on the
  // CPU in double (never uTimeS — panel aurora-uTimeS-wrap-seam).
  uAuroraAxis: { value: new THREE.Vector3(0, 1, 0) },
  uAuroraColLo: { value: new THREE.Vector3() },
  uAuroraColHi: { value: new THREE.Vector3() },
  uAuroraLatS: { value: 0.92 },
  uAuroraWS: { value: 0.04 },
  uAuroraH: { value: new THREE.Vector2(110_000, 220_000) },
  uAuroraPhase: { value: new THREE.Vector2(0, 1) },
  uLightCol: { value: new THREE.Vector3() },
  uLightRate: { value: 0 },
  uLightFreq: { value: 40 },
  uLightBucket: { value: new THREE.Vector2(0, 0) },
  // photo mode ([camera], Phase T): white-balance tint + film grade. Both default
  // to exact identity (WB=1, grade=0) so non-photo renders are bit-unchanged.
  uWB: { value: new THREE.Vector3(1, 1, 1) },
  uGrade: { value: 0 },
};
const AMB_KNOTS = [-0.35, -0.18, -0.08, 0, 0.08, 0.25, 0.55, 1.0]; // matches skyAmbAt()
assertGiantSystem(); assertRingSystem(); // round 18: ONE uGiant*/uRing* set each (M5 no silent caps)
depthMat.uniforms.uPixAng = shared.uPixAng; // depth-pass fold tracks the main camera

// post materials share the exposure/time/mode value-objects — one camera state
const postMat = new THREE.ShaderMaterial({
  vertexShader: POST_VERT, fragmentShader: POST_FRAG,
  uniforms: {
    uScene: { value: null }, uBloom: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: shared.uExposure, uTimeS: shared.uTimeS, uMode: shared.uMode,
    uWB: shared.uWB, uGrade: shared.uGrade,
    uBloomW: { value: BLOOM_W }, uBloomN: { value: 1 / BLOOM_NORM },
  },
  depthTest: false, depthWrite: false,
});
const downMat = new THREE.ShaderMaterial({
  vertexShader: POST_VERT, fragmentShader: BLOOM_DOWN_FRAG,
  uniforms: { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() }, uKnee: { value: 0 } },
  depthTest: false, depthWrite: false,
});
const upMat = new THREE.ShaderMaterial({
  vertexShader: POST_VERT, fragmentShader: BLOOM_UP_FRAG,
  uniforms: { uSrc: { value: null }, uSrc2: { value: null }, uTexel: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() }, uDecay: { value: BLOOM_DECAY } },
  depthTest: false, depthWrite: false,
});
const postMesh = new THREE.Mesh(postTri, postMat);
postMesh.frustumCulled = false;
const postScene = new THREE.Scene();
postScene.add(postMesh);
function blit(mat, rt) {
  postMesh.material = mat;
  renderer.setRenderTarget(rt);
  renderer.setViewport(0, 0, rt.width, rt.height);
  renderer.render(postScene, postCam);
}

// ---- sky: one fullscreen evaluation of the same integral (§8) ----
// §11 whole-disc ladder v2: one atlas of root-tile-baked equirect albedo maps,
// one 256x128 row per SYSTEM body, filled asynchronously by the worker at startup
const DISC_W = 256, DISC_H = 128;
// round 16: the body ROW dimension is now NB = the system's body count, not a
// hardcoded 4 — Titan/Venus/Saturn push the count past 4 (pre-code panel D). The
// disc atlas is a DataArrayTexture (one LAYER per body) exactly like the cloud
// atlas: sampler2DArray mips are per-layer by spec, so minified companion discs
// can never bleed one body's albedo into another's row (panel disc-atlas-mip-
// cross-row-bleed — the stacked-2D-texture version did, at mip 7-8).
const NB = SYSTEM.bodies.length;
const discAtlas = new Uint8Array(DISC_W * DISC_H * 4 * NB);
const discTex = new THREE.DataArrayTexture(discAtlas, DISC_W, DISC_H, NB);
discTex.format = THREE.RGBAFormat; discTex.type = THREE.UnsignedByteType;
discTex.wrapS = THREE.RepeatWrapping; discTex.wrapT = THREE.ClampToEdgeWrapping;
discTex.minFilter = THREE.LinearMipmapLinearFilter; discTex.magFilter = THREE.LinearFilter;
discTex.generateMipmaps = true;
discTex.needsUpdate = true;

// Phase 4 clouds (round 15): the coverage [time-field] atlas — one 256x128
// equirect layer per (body row x deck), RGBA8 packing BOTH keyframes
// (R,G = cov,type at k; B,A at k+1: a rollover is one worker message).
// sampler2DArray so bilinear can never bleed across bodies/decks, hardware
// mips for the §7 footprint-matched minification (panel F4).
const CLOUD_LAYERS = NB * MAX_DECKS;
const cloudData = new Uint8Array(CLOUD_W * CLOUD_H * 4 * CLOUD_LAYERS);
const cloudTex = new THREE.DataArrayTexture(cloudData, CLOUD_W, CLOUD_H, CLOUD_LAYERS);
cloudTex.format = THREE.RGBAFormat; cloudTex.type = THREE.UnsignedByteType;
cloudTex.wrapS = THREE.RepeatWrapping; cloudTex.wrapT = THREE.ClampToEdgeWrapping;
cloudTex.minFilter = THREE.LinearMipmapLinearFilter; cloudTex.magFilter = THREE.LinearFilter;
cloudTex.generateMipmaps = true;
cloudTex.needsUpdate = true;
// cloud CPU-side state: uploaded keyframe pair per body + in-flight requests
// (the settle predicate watches `pending` — new async pipelines must feed it,
// the round-14 lesson)
const cloudState = { rows: new Map(), want: new Map(), pending: 0 };
const shineCovCache = new Map(); // bodyId -> { tq, alb } (per-world-minute)
shared.uCloudMap.value = cloudTex;

const vec3x4 = () => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const skyUniforms = {
  ...shared,
  uInvProj: { value: new THREE.Matrix4() },
  uB2I0: { value: new THREE.Vector3(1, 0, 0) },
  uB2I1: { value: new THREE.Vector3(0, 1, 0) },
  uB2I2: { value: new THREE.Vector3(0, 0, 1) },
  uNumBodies: { value: 0 },
  uBodyDir: { value: vec3x4() },
  uBodyAngR: { value: [0, 0, 0, 0] },
  uBodyCol: { value: vec3x4() },
  uBodySun: { value: vec3x4() },
  uBodyAtlas: { value: discTex },
  uBodyR0: { value: vec3x4() },
  uBodyR1: { value: vec3x4() },
  uBodyR2: { value: vec3x4() },
  uBodyRowV: { value: [0, 0, 0, 0] },
  // seasonal cap on companion discs (round 13): per-body frost strength/params/
  // tint; the disc shader takes the own-frame subsolar declination from uBodyR1
  uBodyFrostK: { value: [0, 0, 0, 0] },
  uBodyFrostP: { value: vec3x4() },
  uBodyFrostCol: { value: vec3x4() },
  // round 17: render-time disc haze veil (Titan forward-queue item) — K=0
  // everywhere else keeps legacy discs byte-identical without a manifest re-pin
  uBodyHazeK: { value: [0, 0, 0, 0] },
  uBodyHazeCol: { value: vec3x4() },
  // §11 clouds on companion discs (round 15): per-slot deck count, per-deck
  // (driftPhase, 2·sigma·thick, layer, keyframe frac), per-body cloud albedo
  uBodyCloudN: { value: [0, 0, 0, 0] },
  uBodyCloudA: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
  uBodyCloudAlb: { value: vec3x4() },
  // round 18 — Phase 6 giant + ring. RUNTIME per-slot gates (default 0 ⇒ legacy
  // discs byte-identical). ONE giant profile + ONE ring set (assertGiantSystem/assertRingSystem).
  // Ring radii are ANGULAR (R·mult/dist) so the ray-plane math avoids the 1e9 m
  // cancellation. Reset explicitly per body in switchBody (the F2 star-leak class).
  uBodyGiant: { value: [0, 0, 0, 0] },
  uBodyRing: { value: [0, 0, 0, 0] },
  uGiantBand: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
  uGiantBandN: { value: 0 },
  uGiantLimbExp: { value: 1 }, uGiantLimbK: { value: 0 },
  uGiantStorm: { value: new THREE.Vector4() },
  uGiantStormCol: { value: new THREE.Vector3() },
  uGiantHex: { value: new THREE.Vector4(0.9, 0, 0, 0) },
  uGiantHexCol: { value: new THREE.Vector3() },
  uRingInner: { value: 0 }, uRingOuter: { value: 0 }, uRingRp: { value: 0 },
  uRingGap: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
  uRingCol: { value: new THREE.Vector3() },
  uRingTau: { value: 0 }, uRingFsG: { value: 0 },
  // uAurora* live in `shared` now (round 16): the aurora emission moved into
  // scatterInline, so terrain/ocean need the uniforms too, not just the sky.
};
let skyMesh = null; // round 17: switchBody swaps the sky program per FIG_MODE
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const m = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: withCommon(SKY_FRAG, FAST ? 12 : 24),
    uniforms: skyUniforms, depthWrite: false, depthTest: true,
  });
  const sky = new THREE.Mesh(g, m);
  skyMesh = sky;
  sky.frustumCulled = false;
  sky.renderOrder = 1000;
  scene.add(sky);
}
// night sky v2: catalog star points in the inertial frame. They live in their
// OWN scene, composited additively AFTER the post pass — the sprite already
// carries the PSF, and running hundreds of sub-pixel points through the bloom
// pyramid painted the night sky with a blurred copy of the star-density field
const starScene = new THREE.Scene();
starScene.add(makeStarPoints(shared, skyUniforms, withCommon, SCATTER_FOR_STARS, FAST ? 6 : 12, starDepth));

// ---- state ----
const worker = new Worker(new URL('./bake.worker.js', import.meta.url), { type: 'module' });
worker.addEventListener('message', (e) => {
  const m = e.data;
  if (m.type === 'clouds') {
    cloudState.pending = Math.max(0, cloudState.pending - 1);
    const row = SYSTEM.bodies.findIndex((b) => b.id === m.bodyId);
    if (row >= 0 && row < NB && m.decks > 0) {
      cloudState.rows.set(m.bodyId, { k: m.k, decks: m.decks, rgba: m.rgba });
      const N4 = CLOUD_W * CLOUD_H * 4;
      for (let d = 0; d < m.decks; d++) {
        cloudData.set(m.rgba.subarray(d * N4, (d + 1) * N4), (row * MAX_DECKS + d) * N4);
      }
      cloudTex.needsUpdate = true;
      shineCovCache.delete(m.bodyId);
    }
    return;
  }
  if (m.type !== 'discmap') return;
  const row = SYSTEM.bodies.findIndex((b) => b.id === m.bodyId);
  if (row >= 0 && row < NB) {
    // DataArrayTexture layer memory is layer-major (stride W·H·4) — same offset
    // arithmetic as the old stacked texture, now selecting layer `row`.
    discAtlas.set(m.rgba, row * DISC_W * DISC_H * 4);
    discTex.needsUpdate = true;
  }
  state.discPending--;
});
// request a body's cloud keyframe pair at index k (deduped; the frame loop
// calls this every frame for the current body + visible cloud companions,
// which covers startup, body switches AND free-run rollovers uniformly)
function requestClouds(b, k) {
  if (!b.clouds) return;
  const cur = cloudState.rows.get(b.id);
  if (cur && cur.k === k) return;
  if (cloudState.want.get(b.id) === k) return;
  cloudState.want.set(b.id, k);
  cloudState.pending++;
  worker.postMessage({ type: 'clouds', bodyId: b.id, k });
}
const state = {
  body: null, tiles: null, t: 0, tday: 0.5, season: 0.15, speed: 60,
  exposureBias: 0, autoExp: 0.5, expSnap: 5, expSeed: true, inset: false, frameNo: 0,
  stable: 0, ready: false, lastMs: 16,
  fig: null, skyFigMode: 0, // round 17 (the initial sky program IS fig 0)
  cloudsOff: false,  // bench lever (round 15): clouds:false in a __shot spec
  fixedEV: null,     // bench: uExposure = 2^fixedEV, metering bypassed (R3)
  clean: false,      // bench: UI/HUD hidden for scoring frames (R3)
  lookAtBody: null,  // bench: aim the main camera at another body (§11 shots)
  discPending: SYSTEM.bodies.length, // §11 disc maps still baking in the worker
  wbTemp: 0, grade: 0, photo: false, // photo mode ([camera] controls)
  meterMode: 'center',  // exposure metering ([camera]): avg / center / spot
  wbMode: 'scene',      // white balance ([camera]): 'scene' shows the illuminant's
                        // colour cast (identity unless the temp knob is used);
                        // 'camera' neutralises the illuminant (D65 as-camera)
  // per-subsystem frame timing (EMA ms) exposed as __perf — the motion bench
  // reads it into a perf-budget gate (Phase T "performance budgets as gates")
  perf: { frame: 16, update: 0, shadow: 0, render: 0 },
};
const PERF_A = 0.12;
const recordPerf = (k, v) => { state.perf[k] = state.perf[k] * (1 - PERF_A) + v * PERF_A; };
// white balance: map a temperature knob [-1,1] to an RGB tint (warm..cool),
// green pinned so mid-grey luminance barely moves; 0 = exact identity (1,1,1)
function applyWB(temp) {
  state.wbTemp = temp;
  shared.uWB.value.set(1 + 0.35 * temp, 1, 1 - 0.35 * temp);
}
for (const b of SYSTEM.bodies) worker.postMessage({ type: 'discmap', bodyId: b.id });

const figOkCache = new Set(); // preflight once per body per session

function switchBody(id) {
  const body = bodyById(id);
  if (!body) return;
  // round 17: figure scope-law + geometry preflight BEFORE the current scene
  // is torn down — a bad recipe throws with the live session intact (the
  // post-impl panel caught the dispose-then-assert ordering bricking the app)
  assertFigureRecipe(body);
  assertGiantRecipe(body); assertRingRecipe(body); // round 18 — BEFORE teardown (dispose-then-brick class, M5)
  const fig = figOf(body);
  if (fig && !figOkCache.has(body.id)) {
    figPreflight(fig, body.id, body.figure.reliefBudget, 800);
    figOkCache.add(body.id);
  }
  if (state.tiles) { scene.remove(state.tiles.group); state.tiles.dispose(); }
  state.body = body;
  state.fig = fig;
  state.tiles = new PlanetTiles(body, worker, shared, { atmSteps: FAST ? 6 : 14 });
  scene.add(state.tiles.group);
  shared.uPlanetR.value = body.R;
  // figure uniforms + the star occluder radius (inscribed on figures)
  if (fig) {
    if (fig.mode === 1) shared.uFigAxes.value.fromArray(fig.axes);
    else {
      shared.uLobeC0.value.fromArray(fig.lobes[0].c); shared.uLobeA0.value.fromArray(fig.lobes[0].axes);
      shared.uLobeC1.value.fromArray(fig.lobes[1].c); shared.uLobeA1.value.fromArray(fig.lobes[1].axes);
      shared.uNeckK.value = fig.neckK;
    }
    let minRad = Infinity;
    for (let i = 0; i < 200; i++) {
      const yy = 1 - (2 * i + 1) / 200, rr = Math.sqrt(Math.max(1 - yy * yy, 0)), ph = i * 2.399963;
      minRad = Math.min(minRad, figRadial(fig, [rr * Math.cos(ph), yy, rr * Math.sin(ph)]));
    }
    shared.uStarOccR.value = minRad * 0.98;
  } else {
    // BIT-exact legacy: the round-16 shader computed f32(R)*f32(0.9995) on the
    // GPU; a double-precision product uploads a value 0.25 m off on Titan and
    // moves the occluder limb by a float ulp (post-impl panel) — fround twice
    shared.uStarOccR.value = Math.fround(Math.fround(body.R) * Math.fround(0.9995));
  }
  // FIG_MODE is a compile-time define: the sky program is rebuilt when the
  // figure class changes (tile materials rebuild with PlanetTiles already)
  const skyFig = fig ? fig.mode : 0;
  if (skyFig !== state.skyFigMode) {
    state.skyFigMode = skyFig;
    const old = skyMesh.material;
    skyMesh.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: withCommon(SKY_FRAG, FAST ? 12 : 24, { fig: skyFig }),
      uniforms: skyUniforms, depthWrite: false, depthTest: true,
    });
    old.dispose();
  }
  const atm = body.atmosphere;
  shared.uHasAtm.value = atm ? 1 : 0;
  if (atm) {
    shared.uAtmTop.value = atm.top;
    shared.uHr.value = atm.Hr; shared.uHm.value = atm.Hm;
    const g3 = Array.isArray(atm.mieG) ? atm.mieG : [atm.mieG, atm.mieG, atm.mieG];
    shared.uMieG.value.fromArray(g3);
    shared.uBetaR.value.fromArray(atm.betaR);
    shared.uBetaM.value.fromArray(atm.betaM);
    shared.uBetaA.value.fromArray(atm.betaA ?? [0, 0, 0]);
    shared.uAirglow.value.fromArray(atm.airglow);
  } else {
    shared.uAirglow.value.set(0, 0, 0);
  }
  shared.uRefrac.value = atm?.refrac ?? 0;
  const oz = atm?.ozone;
  shared.uBetaO3.value.fromArray(oz?.beta ?? [0, 0, 0]);
  shared.uOzH.value = oz?.center ?? 0;
  shared.uOzW.value = oz?.width ?? 0;
  // multiple-scattering table: deterministic pure fn of the recipe, cached.
  // The full 24x24 f32 table feeds the JS twin; the shader gets 8x4 knots
  // (sinEl knots per skyAmbAt x sqrt-altitude rows at v=.125/.375/.625/.875)
  if (!msCache.has(body.id)) msCache.set(body.id, atm ? buildMsLUT(body) : null);
  state.msLUT = msCache.get(body.id);
  {
    const MS_V = [0.125, 0.375, 0.625, 0.875];
    for (let r = 0; r < 4; r++) {
      const h = atm ? MS_V[r] * MS_V[r] * atm.top : 0;
      for (let k = 0; k < 8; k++) {
        const psi = state.msLUT ? msSample(state.msLUT, AMB_KNOTS[k], h, atm.top) : [0, 0, 0];
        shared.uMsK.value[r * 8 + k].fromArray(psi);
      }
    }
  }
  // Phase 4 EMISSION pack (round 16) — recipe-data-gated (a zero colour disables),
  // set on `shared` so terrain/ocean carry it (the emission is inside scatterInline).
  const au = atm?.aurora;
  if (au) {
    const tilt = ((au.dipoleTiltDeg ?? 9) * Math.PI) / 180;
    shared.uAuroraAxis.value.set(0, Math.cos(tilt), Math.sin(tilt));
    // dual altitude bands: green lower, red upper (real aurora is red-over-green);
    // a single `color` recipe falls back to both bands (Phase-1d back-compat).
    shared.uAuroraColLo.value.fromArray(au.colorLo ?? au.color ?? [0, 0, 0]);
    shared.uAuroraColHi.value.fromArray(au.colorHi ?? au.color ?? [0, 0, 0]);
    shared.uAuroraLatS.value = Math.sin((au.latDeg * Math.PI) / 180);
    shared.uAuroraWS.value = Math.max(Math.cos((au.latDeg * Math.PI) / 180) * (au.widthDeg * Math.PI) / 180, 0.01);
    shared.uAuroraH.value.set(au.hLo ?? au.height ?? 110_000, au.hHi ?? au.height ?? 240_000);
  } else {
    shared.uAuroraColLo.value.set(0, 0, 0);
    shared.uAuroraColHi.value.set(0, 0, 0);
  }
  // lightning: convective flashes tied to the cloud deck (round 16)
  const lt = body.clouds?.lightning;
  if (lt) {
    shared.uLightCol.value.fromArray(lt.color ?? [0.55, 0.7, 1.0]);
    shared.uLightRate.value = lt.rate ?? 0.02;
    shared.uLightFreq.value = lt.freq ?? 40;
  } else {
    shared.uLightCol.value.set(0, 0, 0);
    shared.uLightRate.value = 0;
  }
  const brdf = body.brdf ?? {};
  shared.uBrdfA.value.set(brdf.regolithW ?? 0.3, brdf.surgeHs ?? 0.06, brdf.surgeB0 ?? 0.3, brdf.iceSSS ?? 0.5);
  shared.uBrdfB.value.set(brdf.iceSpec ?? 0.2, brdf.iceRough ?? 0.4, brdf.rockSpec ?? 0.05, brdf.rockRough ?? 0.6);
  // Phase 4 clouds (round 15): own-body deck uniforms with EXPLICIT else-branch
  // resets (the uAirglow pattern — the star material is built once and shares
  // these runtime uniforms, so stale Tellus decks on Luna would extinct stars
  // off-disc while the dmean gate stays blind: pre-code panel F2). The deck
  // count itself is gated per-frame on the keyframe row being loaded.
  {
    const cl = body.clouds;
    assertPaletteRecipe(body);
    if (cl) assertCloudRecipe(body);
    shared.uCloudDecks.value = 0; // per-frame gate raises it once data is live
    shared.uCloudMuClamp.value = cl?.muClamp ?? 0.09;
    const row = SYSTEM.bodies.indexOf(body);
    for (let d = 0; d < MAX_DECKS; d++) {
      const deck = cl?.decks?.[d];
      if (deck) {
        shared.uCloudDeckA.value[d].set(deck.baseM, deck.thickM, deck.sigmaK ?? 0.003, row * MAX_DECKS + d);
        shared.uCloudDeckB.value[d].set(0, deck.detailAmp ?? 0.7, deck.detailFreq ?? 220, deck.ambW ?? 0.35);
        shared.uCloudAlb.value[d].fromArray(deck.alb ?? [0.92, 0.93, 0.95]);
      } else {
        shared.uCloudDeckA.value[d].set(0, 1, 0, 0);
        shared.uCloudDeckB.value[d].set(0, 0, 0, 0);
        shared.uCloudAlb.value[d].set(0, 0, 0);
      }
    }
  }
  camera.far = insetCam.far = Math.max(bodyBoundR(body) * 24, 8e7); // covers the zoom-out clamp (legacy: boundR === R)
  camera.updateProjectionMatrix(); insetCam.updateProjectionMatrix();
  if (cam) { cam.body = body; cam.fig = fig; cam.set(body.camera); cam.alt = body.camera.alt; }
  // tiles instance is new: re-apply the UI's toggle state instead of defaults
  if ($('wire')) state.tiles.wireframe = $('wire').checked;
  if ($('debris')) state.tiles.debris = $('debris').checked;
  state.ready = false; state.stable = 0;
  if ($('body')) $('body').value = id;
}

const cam = new OrbitalCamera(canvas, bodyById('tellus'), (dir) => (state.tiles ? state.tiles.heightAt(dir) : 0));
switchBody('tellus');

// ---- UI ----
const MODES = ['lit', 'albedo', 'normals', 'height', 'slope', 'ao', 'lod', 'shadow'];
function bindUI() {
  // Body menu is data-driven: one <option> per SYSTEM body, straight from the
  // recipe list (CONCEPT §6 — the recipe data is the single source of truth).
  // The old planet.html hardcoded only tellus/rubra/luna, so every body added
  // after Luna (titan, venus, saturn, the figures, the cryo worlds) existed and
  // rendered via switchBody but was never offered in the UI. Rebuild from
  // SYSTEM.bodies so the menu can never drift out of sync with the recipes again.
  const bodySel = $('body');
  if (bodySel) {
    bodySel.innerHTML = '';
    for (const b of SYSTEM.bodies) {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      bodySel.appendChild(opt);
    }
    bodySel.value = state.body.id; // re-select the body switchBody('tellus') already loaded
  }
  for (let i = 0; i < MODES.length; i++) {
    const el = $('mode-' + MODES[i]);
    if (el) el.onclick = () => setMode(i);
  }
  const on = (id, fn) => { const el = $(id); if (el) el.oninput = () => fn(el); };
  on('body', (el) => switchBody(el.value));
  on('tday', (el) => { state.tday = +el.value; });
  on('season', (el) => { state.season = +el.value; });
  on('speed', (el) => { state.speed = +el.value; });
  on('ev', (el) => { state.exposureBias = +el.value; $('evv').textContent = (+el.value).toFixed(1); });
  const chk = (id, fn) => { const el = $(id); if (el) el.onchange = () => fn(el.checked); };
  chk('wire', (v) => { state.tiles.wireframe = v; });
  chk('debris', (v) => { state.tiles.debris = v; });
  chk('inset', (v) => { setInset(v); });
  // photo panel (Phase T)
  on('pfov', (el) => { camera.fov = +el.value; camera.updateProjectionMatrix(); if ($('pfovv')) $('pfovv').textContent = el.value; });
  on('pwb', (el) => { applyWB(+el.value); if ($('pwbv')) $('pwbv').textContent = (+el.value).toFixed(2); });
  on('pgrade', (el) => { shared.uGrade.value = state.grade = +el.value; if ($('pgradev')) $('pgradev').textContent = (+el.value).toFixed(2); });
  chk('pfree', (v) => { cam.free = v; });
  const bm = $('pbookmark'); if (bm) bm.onclick = saveBookmark;
  const pl = $('pplay'); if (pl) pl.onclick = playBookmarks;
  renderBookmarks();
}
function setInset(v) {
  state.inset = v;
  $('insetframe').style.display = v ? 'block' : 'none';
  const h = $('hint');
  if (h) h.style.display = v || state.clean ? 'none' : 'block'; // they share the corner
}
// clean scoring frames (R3): pure render, no chrome — a [camera] concern only
function setClean(v) {
  state.clean = v;
  for (const id of ['ui', 'hud', 'hint']) {
    const el = $(id);
    if (el) el.style.display = v ? 'none' : '';
  }
  const ph = $('photo'); if (ph) ph.style.display = !v && state.photo ? 'block' : 'none';
  if (!v) setInset(state.inset); // restore the hint/inset corner arbitration
}
function setMode(i) {
  shared.uMode.value = i;
  for (let m = 0; m < MODES.length; m++) {
    const el = $('mode-' + MODES[m]);
    if (el) el.classList.toggle('active', m === i);
  }
}
bindUI(); setMode(0);

// ---- one-key defect capture (ROADMAP_V2 Phase T): F8 writes the current view
// as a reproducible __shot spec + screenshot — every "this looks wrong" moment
// becomes a register row, not a description. Files land in the browser's
// download folder; move them into bench/defects/. ----
function currentShotSpec(note = 'defect capture') {
  const s = {
    body: state.body.id,
    lat: +((cam.lat * 180) / Math.PI).toFixed(4),
    lon: +((cam.lon * 180) / Math.PI).toFixed(4),
    alt: +cam.alt.toFixed(1),
    tday: +state.tday.toFixed(5),
    season: +state.season.toFixed(5),
    yaw: +((cam.yaw * 180) / Math.PI).toFixed(2),
    pitch: +((cam.pitch * 180) / Math.PI).toFixed(2),
    fov: camera.fov,
    mode: shared.uMode.value,
    exposure: state.exposureBias,
    debris: state.tiles.debris,
    note,
  };
  // photo-mode [camera] state travels with the spec only when engaged
  if (cam.free) { s.free = true; s.roll = +((cam.roll * 180) / Math.PI).toFixed(2); }
  if (state.wbTemp) s.wb = +state.wbTemp.toFixed(2);
  if (state.grade) s.grade = +state.grade.toFixed(2);
  return s;
}
addEventListener('keydown', (e) => {
  if (e.target && e.target.matches && e.target.matches('input,select,textarea')) return;
  if (e.key === 'F8') { state.captureDefect = true; return; } // defect capture (buffer valid at end-of-frame)
  if (e.key === 'F9') { state.capturePhoto = true; return; }  // supersampled clean still (photo mode)
  if (e.key === 'p' || e.key === 'P') togglePhoto();
});
const dlFile = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
function captureDefect() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const spec = currentShotSpec();
  dlFile('data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(spec, null, 1)), `defect-${stamp}.json`);
  dlFile(canvas.toDataURL('image/png'), `defect-${stamp}.png`);
}

// ---- photo mode (ROADMAP_V2 Phase T director tools) ----
function togglePhoto() {
  state.photo = !state.photo;
  const el = $('photo');
  if (el) el.style.display = state.photo && !state.clean ? 'block' : 'none';
}
// supersampled clean still: render one frame at 2x internal resolution with the
// chrome hidden, grab the drawing buffer, restore. "Hold still, get a clean shot."
function capturePhoto() {
  const prev = renderer.getPixelRatio();
  renderer.setPixelRatio(Math.min(prev * 2, 4));
  renderer.setSize(innerWidth, innerHeight);
  makeTargets();
  const wasClean = state.clean; if (!wasClean) setClean(true);
  const cs = cam.getState();
  renderShadowPass(cs);
  renderer.setScissorTest(true);
  renderPass(camera, cs.pos, cs.quat, [0, 0, innerWidth, innerHeight]);
  renderer.setScissorTest(false);
  dlFile(canvas.toDataURL('image/png'), `photo-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
  renderer.setPixelRatio(prev); renderer.setSize(innerWidth, innerHeight); makeTargets();
  if (!wasClean) setClean(false);
}
// bookmarks: a saved view IS a reproducible __shot spec (localStorage-backed)
function saveBookmark() {
  const list = JSON.parse(localStorage.getItem('planet-bookmarks') || '[]');
  list.push(currentShotSpec('bookmark'));
  localStorage.setItem('planet-bookmarks', JSON.stringify(list));
  renderBookmarks();
}
// camera path playback: tween through the saved bookmarks (each a __shot spec) —
// the motion bench's canned paths, made authorable by bookmarking. Click again
// to stop. Time (tday) lerps too, so a path can carry the sun across the sky.
let playRAF = 0;
function playBookmarks() {
  if (playRAF) { cancelAnimationFrame(playRAF); playRAF = 0; return; }
  const list = JSON.parse(localStorage.getItem('planet-bookmarks') || '[]');
  if (list.length < 2) return;
  state.speed = 0; const sp = $('speed'); if (sp) sp.value = '0';
  if (list[0].body && list[0].body !== state.body.id) switchBody(list[0].body);
  const SEG_MS = 2500, t0 = performance.now();
  const lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
  const step = () => {
    const el = performance.now() - t0;
    const seg = Math.min(Math.floor(el / SEG_MS), list.length - 2);
    const f = ease((el - seg * SEG_MS) / SEG_MS);
    const A = list[seg], B = list[seg + 1];
    cam.lon = (lerp(A.lon, B.lon, f) * Math.PI) / 180;
    cam.lat = (lerp(A.lat, B.lat, f) * Math.PI) / 180;
    cam.alt = Math.exp(lerp(Math.log(A.alt), Math.log(B.alt), f));
    cam.yaw = (lerp(A.yaw ?? 0, B.yaw ?? 0, f) * Math.PI) / 180;
    cam.pitch = (lerp(A.pitch ?? 0, B.pitch ?? 0, f) * Math.PI) / 180;
    camera.fov = lerp(A.fov ?? 55, B.fov ?? 55, f); camera.updateProjectionMatrix();
    if (A.tday !== undefined && B.tday !== undefined) state.tday = lerp(A.tday, B.tday, f);
    if (el >= (list.length - 1) * SEG_MS) { playRAF = 0; return; }
    playRAF = requestAnimationFrame(step);
  };
  playRAF = requestAnimationFrame(step);
}
function renderBookmarks() {
  const box = $('pbooks'); if (!box) return;
  const list = JSON.parse(localStorage.getItem('planet-bookmarks') || '[]');
  box.innerHTML = '';
  list.forEach((sp, i) => {
    const row = document.createElement('div'); row.className = 'bmark';
    const b = document.createElement('button');
    b.textContent = `${sp.body} · ${sp.alt >= 1000 ? (sp.alt / 1000).toFixed(0) + 'km' : Math.round(sp.alt) + 'm'}`;
    b.title = JSON.stringify(sp); b.onclick = () => window.__shot(sp);
    const x = document.createElement('button'); x.textContent = '×'; x.className = 'bx';
    x.onclick = () => {
      const l = JSON.parse(localStorage.getItem('planet-bookmarks') || '[]');
      l.splice(i, 1); localStorage.setItem('planet-bookmarks', JSON.stringify(l)); renderBookmarks();
    };
    row.append(b, x); box.append(row);
  });
}

// ---- render loop ----
let lastFrame = performance.now();

// exposure metering: whole-frame coverage via a few horizontal bands (a lit
// horizon strip at the frame edge must reach the meter, or it blows out)
let meterBuf = null, meterLum = null;
function meterImage() {
  const gl = renderer.getContext();
  const CW = renderer.domElement.width, CH = renderer.domElement.height;
  const bh = Math.max(1, Math.floor(CH / 16));
  if (!meterBuf || meterBuf.length < CW * bh * 4) {
    meterBuf = new Uint8Array(CW * bh * 4);
    meterLum = new Float32Array(Math.ceil((CW * bh) / 4) * 5 + 8);
  }
  let sum = 0, wsum = 0, n = 0;
  const mode = state.meterMode;   // avg / center / spot ([camera] §10)
  for (let b = 0; b < 5; b++) {
    const y = Math.min(Math.floor((b / 4.001) * (CH - bh)), CH - bh);
    gl.readPixels(0, y, CW, bh, gl.RGBA, gl.UNSIGNED_BYTE, meterBuf);
    const dy = (y + bh * 0.5) / CH - 0.5;
    for (let i = 0; i < CW * bh * 4; i += 16) { // every 4th pixel
      const l = (0.2126 * meterBuf[i] + 0.7152 * meterBuf[i + 1] + 0.0722 * meterBuf[i + 2]) / 255;
      // selectable weighting: avg = flat (whole frame), center = gaussian
      // (default — a small subject on black still reaches the meter), spot =
      // tight central patch (meter a lit subject; let the surround crush/clip)
      const dx = ((i >> 2) % CW) / CW - 0.5;
      const r2 = dx * dx + dy * dy;
      const w = mode === 'avg' ? 1 : mode === 'spot' ? Math.exp(-r2 * 60) : 1 + 3 * Math.exp(-r2 * 14);
      sum += w * Math.log(0.02 + l); wsum += w;
      meterLum[n++] = l;
    }
  }
  if (!n) return null;
  const s = meterLum.subarray(0, n).slice().sort();
  // p99.7: protect the brightest ~0.3% — a small centered disc, a lit horizon
  // strip — not broad dim glows like the Milky Way
  return { gray: Math.exp(sum / wsum) - 0.02, p99: s[Math.min(n - 1, Math.floor(0.997 * n))] };
}

// metre-scale shadow pass: sun-aligned ortho depth over the debris band, only
// near the ground with the sun up. Rendered in the MAIN camera's render space
// (tiles positioned camera-relative), so it is valid for that pass only.
function renderShadowPass(cs) {
  const s = shared.uSunDir.value;
  // local vertical: the figure normal when declared (cs.up from getState),
  // the parameter direction otherwise — identical on spheres
  const upV = cs.up ?? cs.dir;
  const sunUp = upV[0] * s.x + upV[1] * s.y + upV[2] * s.z;
  const on = cs.alt < 400 && sunUp > -0.05;
  shared.uShadowOn.value = on ? 1 : 0;
  if (!on) return;
  state.tiles.applyCamera(cs.pos);
  const E = clamp(cs.alt * 2.5 + 30, 50, 400);
  shared.uShadowTexel.value = (2 * E) / SHADOW_RES;
  // ground focus point: camera minus altitude along the local vertical — on a
  // figure the radial reconstruction dir·(R+groundH) lands off the surface
  const gp = state.fig
    ? [-upV[0] * cs.alt, -upV[1] * cs.alt, -upV[2] * cs.alt]
    : (() => {
      const gR = state.body.R + Math.max(cs.groundH, 0);
      return [cs.dir[0] * gR - cs.pos[0], cs.dir[1] * gR - cs.pos[1], cs.dir[2] * gR - cs.pos[2]];
    })();
  sunCam.left = -E; sunCam.right = E; sunCam.top = E; sunCam.bottom = -E;
  sunCam.near = 500; sunCam.far = 3500;
  sunCam.position.set(gp[0] + s.x * 2000, gp[1] + s.y * 2000, gp[2] + s.z * 2000);
  sunCam.up.set(...(Math.abs(s.y) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  sunCam.lookAt(gp[0], gp[1], gp[2]);
  sunCam.updateProjectionMatrix();
  sunCam.updateMatrixWorld(true);
  scene.overrideMaterial = depthMat;
  renderer.setScissorTest(false);
  renderer.setRenderTarget(shadowRT);
  renderer.setViewport(0, 0, SHADOW_RES, SHADOW_RES);
  renderer.clear(true, true, false);
  renderer.render(scene, sunCam);
  scene.overrideMaterial = null;
  shared.uShadowMat.value.multiplyMatrices(sunCam.projectionMatrix, sunCam.matrixWorldInverse);
}

function renderPass(cameraObj, posBF, quat, viewport, bloom = true) {
  cameraObj.position.set(0, 0, 0);
  cameraObj.quaternion.copy(quat);
  cameraObj.updateMatrixWorld(true);
  shared.uCamPos.value.set(posBF[0], posBF[1], posBF[2]);
  skyUniforms.uInvProj.value.copy(cameraObj.projectionMatrixInverse);
  shared.uPixAng.value = (cameraObj.fov * Math.PI / 180) / (viewport[3] * renderer.getPixelRatio());
  state.tiles.applyCamera(posBF);
  // scene -> HDR target (linear radiance; materials tonemap nothing)
  renderer.setRenderTarget(rtScene);
  renderer.setViewport(...viewport);
  renderer.setScissor(...viewport);
  renderer.clear(true, true, false);
  renderer.render(scene, cameraObj);
  // PSF bloom pyramid (full-frame lit passes only — diagnostics stay clean)
  const doBloom = bloom && shared.uMode.value === 0;
  if (doBloom) {
    renderer.setScissorTest(false);
    let src = rtScene.texture, sw = rtScene.width, sh = rtScene.height;
    for (let i = 0; i < rtD.length; i++) {
      downMat.uniforms.uSrc.value = src;
      downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      downMat.uniforms.uRes.value.set(rtD[i].width, rtD[i].height);
      // exposed-space knee on the first level only (see BLOOM_DOWN_FRAG)
      downMat.uniforms.uKnee.value = i === 0 ? (64 * shared.uExposure.value) / 24 : 0;
      blit(downMat, rtD[i]);
      src = rtD[i].texture; sw = rtD[i].width; sh = rtD[i].height;
    }
    for (let i = rtD.length - 2; i >= 0; i--) {
      const from = i === rtD.length - 2 ? rtD[i + 1] : rtU[i + 1];
      upMat.uniforms.uSrc.value = from.texture;
      upMat.uniforms.uSrc2.value = rtD[i].texture;
      upMat.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
      upMat.uniforms.uRes.value.set(rtU[i].width, rtU[i].height);
      blit(upMat, rtU[i]);
    }
    renderer.setScissorTest(true);
  }
  // the physical camera: exposure -> bloom mix -> ACES -> sRGB -> grain
  postMat.uniforms.uScene.value = rtScene.texture;
  postMat.uniforms.uBloom.value = rtU.length ? rtU[0].texture : null;
  postMat.uniforms.uBloomW.value = doBloom ? BLOOM_W : 0;
  postMat.uniforms.uRes.value.set(rtScene.width, rtScene.height);
  postMesh.material = postMat;
  renderer.setRenderTarget(null);
  renderer.setViewport(...viewport);
  renderer.setScissor(...viewport);
  renderer.render(postScene, postCam);
  // star layer: additive on the tonemapped frame (exact on black sky; the
  // camera's PSF is the sprite itself — see stars.js). Each star depth-tests
  // against the scene target's depth texture at its own projected pixel.
  starDepth.uStarVp.value.set(viewport[0], viewport[1], viewport[2], viewport[3]);
  renderer.render(starScene, cameraObj);
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  state.lastMs = now - lastFrame;
  recordPerf('frame', state.lastMs);
  lastFrame = now;

  const body = state.body;
  const spinSec = body.spin.periodH * 3600;
  if (state.speed > 0) {
    // dayCount keeps t continuous across midnight — a bare %1 wrap would snap the
    // ephemeris (moon position, waves) backwards a whole day (review finding)
    state.tday += (dt * state.speed) / spinSec;
    if (state.tday >= 1) { state.tday -= 1; state.dayCount = (state.dayCount || 0) + 1; }
    const el = $('tday');
    if (el && !el.matches(':active')) el.value = state.tday.toFixed(4);
  }
  state.t = state.season * body.orbit.periodDays * 86400 + ((state.dayCount || 0) + state.tday) * spinSec;

  const eph = ephemeris(body, state.t);
  shared.uSunDir.value.set(...eph.sunDirBF);
  const sc = SYSTEM.star.color;
  shared.uSunRad.value.set(sc[0] * eph.irradiance, sc[1] * eph.irradiance, sc[2] * eph.irradiance);
  shared.uSunAngR.value = eph.sunAngRadius;
  const m = eph.b2i; // row-major; columns feed the shader (mat3 upload sidestep)
  skyUniforms.uB2I0.value.set(m[0], m[3], m[6]);
  skyUniforms.uB2I1.value.set(m[1], m[4], m[7]);
  skyUniforms.uB2I2.value.set(m[2], m[5], m[8]);
  // round 16 (panel proxsort-762): with NB>4 bodies every body's `others` list
  // exceeds the 4 co-visible SLOTS, so pick the 4 that MATTER — largest angular
  // radius first (nearest/biggest win) — before the slice. DESC is load-bearing:
  // an array-order slice would drop whichever body is last in recipe order, which
  // for Titan looking at Saturn (~5.5° disc, by far the biggest) is exactly the
  // one that must survive. The slot arrays stay length-4; only ROW capacity grew.
  eph.others.sort((a, b) => b.angRadius - a.angRadius);
  const others = eph.others.slice(0, 4);
  skyUniforms.uNumBodies.value = others.length;
  // eclipse machinery (Phase 1): how much of the sun each companion still sees.
  // Its disc dims with the geometric fraction and coppers with the occluder's
  // refracted annulus — the eclipsed moon emerges, and moonlight dies with it.
  const discVisJS = (d, rs, ro) => {
    if (d >= rs + ro) return 1;
    if (d + Math.min(rs, ro) <= Math.max(rs, ro)) return ro >= rs ? 0 : 1 - (ro * ro) / (rs * rs);
    const a1 = Math.acos(clamp((d * d + rs * rs - ro * ro) / (2 * d * rs), -1, 1));
    const a2 = Math.acos(clamp((d * d + ro * ro - rs * rs) / (2 * d * ro), -1, 1));
    const root = Math.sqrt(Math.max((-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro), 0));
    return clamp(1 - (rs * rs * a1 + ro * ro * a2 - 0.5 * root) / (Math.PI * rs * rs), 0, 1);
  };
  const eclVis = others.map((o) => {
    let vis = 1;
    const ann = [0, 0, 0];
    const occs = [{ pos: [-o.dirBF[0] * o.dist, -o.dirBF[1] * o.dist, -o.dirBF[2] * o.dist], body }];
    for (const x of others) {
      if (x === o) continue;
      occs.push({ pos: [x.dirBF[0] * x.dist - o.dirBF[0] * o.dist, x.dirBF[1] * x.dist - o.dirBF[1] * o.dist, x.dirBF[2] * x.dist - o.dirBF[2] * o.dist], body: x.body });
    }
    for (const c of occs) {
      const dl = Math.hypot(...c.pos);
      const co = (c.pos[0] * o.sunDirBF[0] + c.pos[1] * o.sunDirBF[1] + c.pos[2] * o.sunDirBF[2]) / dl;
      if (co <= 0) continue;
      const v = discVisJS(Math.acos(clamp(co, -1, 1)), eph.sunAngRadius, Math.asin(Math.min(c.body.R / dl, 1)));
      if (v < vis) {
        vis = v;
        const at = annulusTint(c.body);
        for (let k = 0; k < 3; k++) ann[k] = at[k] * (1 - v);
      }
    }
    return { vis, ann };
  });
  for (let i = 0; i < others.length; i++) {
    const o = others[i];
    skyUniforms.uBodyDir.value[i].set(...o.dirBF);
    skyUniforms.uBodyAngR.value[i] = o.angRadius;
    // albedo now comes from the disc atlas (§11 v2); this carries irradiance only
    const ev = eclVis[i];
    skyUniforms.uBodyCol.value[i]
      .set(sc[0] * (ev.vis + ev.ann[0]), sc[1] * (ev.vis + ev.ann[1]), sc[2] * (ev.vis + ev.ann[2]))
      .multiplyScalar(o.irradiance / Math.PI);
    skyUniforms.uBodySun.value[i].set(...o.sunDirBF);
    // our-body-fixed -> target-body-fixed rotation (the disc spins with its own
    // ephemeris: the same face of a locked moon, the right face of a spinning one)
    const M = mulMM(transpose(bodyToInertial(o.body, state.t)), m);
    skyUniforms.uBodyR0.value[i].set(M[0], M[1], M[2]);
    skyUniforms.uBodyR1.value[i].set(M[3], M[4], M[5]);
    skyUniforms.uBodyR2.value[i].set(M[6], M[7], M[8]);
    skyUniforms.uBodyRowV.value[i] = SYSTEM.bodies.indexOf(o.body);
    // seasonal cap params for this companion's disc (round 13)
    const scB = o.body.seasonalCap;
    if (scB) {
      const sinD = (d) => Math.sin((d * Math.PI) / 180);
      skyUniforms.uBodyFrostK.value[i] = scB.k ?? 0;
      skyUniforms.uBodyFrostP.value[i].set(sinD(scB.latOn ?? 90), sinD(scB.latFull ?? 90), scB.seasonK ?? 0);
      skyUniforms.uBodyFrostCol.value[i].set(...(scB.tint ?? [0.9, 0.92, 0.98]));
    } else skyUniforms.uBodyFrostK.value[i] = 0;
    // round 17: the §11 disc haze veil (atmosphere.discHaze — Titan); a
    // render-time mix over the baked ground albedo so the disc agrees with
    // the haze-tinted far point. Absent ⇒ K=0 ⇒ mix is an exact no-op.
    const dh = o.body.atmosphere?.discHaze;
    if (dh) {
      skyUniforms.uBodyHazeK.value[i] = dh.k ?? 0;
      skyUniforms.uBodyHazeCol.value[i].set(...(dh.color ?? [0.3, 0.22, 0.13]));
    } else skyUniforms.uBodyHazeK.value[i] = 0;
    // §11 clouds on this companion's disc (round 15): the target's OWN drift
    // phase + keyframe frac (its keyframeH, its ω — same field, same alpha
    // law as planetshine), gated on its keyframe row being loaded
    const cb = o.body.clouds;
    if (cb && !state.cloudsOff) {
      const bk = cloudKeyOf(o.body, state.t);
      requestClouds(o.body, bk.k);
      const cRow = cloudState.rows.get(o.body.id);
      const bi = SYSTEM.bodies.indexOf(o.body);
      const nD = cRow && cRow.k === bk.k ? Math.min(cb.decks.length, MAX_DECKS) : 0;
      skyUniforms.uBodyCloudN.value[i] = nD;
      for (let d = 0; d < nD; d++) {
        const deck = cb.decks[d];
        skyUniforms.uBodyCloudA.value[i * 2 + d].set(
          driftPhase(deck, state.t), 2 * (deck.sigmaK ?? 0.003) * deck.thickM,
          bi * MAX_DECKS + d, bk.frac,
        );
      }
      skyUniforms.uBodyCloudAlb.value[i].fromArray(cb.decks[0].alb ?? [0.92, 0.93, 0.95]);
    } else skyUniforms.uBodyCloudN.value[i] = 0;
    // round 18 — giant + ring per-slot upload (else-reset keeps legacy discs
    // byte-identical; the F2 star-leak class). Storm/hexagon drift at per-FEATURE
    // rigid rates Ω(lat)=deepRate+diffRate·sin²lat, reduced to one revolution in
    // double (the per-pixel-shear + wrap-value findings). Ring radii are ANGULAR
    // (R·mult/dist, double) ⇒ the shader ray-plane math has no 1e9 m cancellation.
    const gnt = o.body.giant;
    if (gnt) {
      skyUniforms.uBodyGiant.value[i] = 1;
      skyUniforms.uGiantBandN.value = gnt.bands.length;
      for (let k = 0; k < 8; k++) {
        const bd = gnt.bands[k];
        skyUniforms.uGiantBand.value[k].set(bd ? bd.s : 0, bd ? bd.c[0] : 0, bd ? bd.c[1] : 0, bd ? bd.c[2] : 0);
      }
      skyUniforms.uGiantLimbExp.value = gnt.limbExp;
      skyUniforms.uGiantLimbK.value = gnt.limbK;
      const tDays = state.t / 86400, frac = (x) => x - Math.floor(x);
      // DIFFERENTIAL drift: the disc is synthesized in the target's BODY-FIXED
      // frame (nB via uBodyR* = transpose(bodyToInertial)), which ALREADY rotates
      // at the body spin rate, so a feature's drift ACROSS the disc is its zonal
      // rate MINUS the frame spin (post-impl GIANT-1: the absolute rate double-
      // counted the spin, sweeping storm/hexagon at ~2× rate). Bands are zonal.
      const spinRate = 360 * 24 / o.body.spin.periodH; // deg/day (System III, already in nB)
      const omega = (sinLat) => gnt.deepRate + gnt.diffRate * sinLat * sinLat - spinRate;
      const sDrift = frac(omega(gnt.storm.lat) * tDays / 360) * 2 * Math.PI;
      skyUniforms.uGiantStorm.value.set(gnt.storm.lon, gnt.storm.lat, gnt.storm.r, sDrift);
      skyUniforms.uGiantStormCol.value.set(...gnt.storm.c);
      const hDrift = frac(omega(gnt.hexagon.latOn) * tDays / 360) * 2 * Math.PI;
      skyUniforms.uGiantHex.value.set(gnt.hexagon.latOn, gnt.hexagon.amp, hDrift, 0);
      skyUniforms.uGiantHexCol.value.set(...gnt.hexagon.c);
    } else skyUniforms.uBodyGiant.value[i] = 0;
    const rng = o.body.rings;
    if (rng) {
      skyUniforms.uBodyRing.value[i] = 1;
      const Rb = o.body.R, D = o.dist;
      skyUniforms.uRingInner.value = Rb * rng.inner / D;
      skyUniforms.uRingOuter.value = Rb * rng.outer / D;
      skyUniforms.uRingRp.value = Rb / D; // exact planet R/D ratio for the shadow/occlusion tests (post-impl ring-1)
      for (let k = 0; k < 4; k++) {
        const gp = rng.gaps && rng.gaps[k];
        if (gp) skyUniforms.uRingGap.value[k].set(Rb * gp.r / D, Rb * gp.w / D, gp.depth, 1);
        else skyUniforms.uRingGap.value[k].set(0, 0, 0, 0);
      }
      skyUniforms.uRingCol.value.set(...rng.col);
      skyUniforms.uRingTau.value = rng.tau;
      skyUniforms.uRingFsG.value = rng.fscatterG;
    } else skyUniforms.uBodyRing.value[i] = 0;
  }

  shared.uTimeS.value = state.t % 4096;
  // aurora [time-field] (round 16): curtain drift offset wrapped at the vnoise
  // period 4096 (seamless — vnoise(4096)==vnoise(0); NOT the uTimeS sawtooth, panel
  // aurora-uTimeS-wrap-seam) + a smooth substorm intensity pulse (closed-form in t).
  {
    const drift = (state.t * 0.03) % 4096;
    const pulse = 0.55 + 0.28 * Math.sin(state.t * 3.1e-4) + 0.22 * Math.sin(state.t * 7.3e-4 + 1.7);
    shared.uAuroraPhase.value.set(drift, Math.max(pulse, 0.05));
    // lightning flash bucket: seed + frac from the UNWRAPPED t (no 4096 seam).
    const lp = state.body?.clouds?.lightning?.period ?? 3.0;
    const bucket = Math.floor(state.t / lp);
    const bseed = ((Math.imul(bucket, 2654435761) >>> 0) % 100000) / 1000; // [0,100)
    shared.uLightBucket.value.set(bseed, state.t / lp - bucket);
  }
  // eclipse & transit machinery (Phase 1): companions become sun-disc occluders
  // inside sunTransmit — shadow dots on the ground, darkened air, copper umbra.
  // Only bodies that can MEANINGFULLY eclipse qualify (angular radius within
  // ~20x of the sun's): a far planet covers ~1e-5 of the disc, and its 1e11 m
  // position wrecks the shader's fp32 overlap test near conjunction (the
  // round-2 "twilight dash" defect — per-pixel acos cancellation noise).
  {
    let no = 0;
    for (const o of others) {
      if (no >= 2) break;
      if (Math.asin(Math.min(o.body.R / o.dist, 1)) < eph.sunAngRadius * 0.05) continue;
      shared.uOccPos.value[no].set(o.dirBF[0] * o.dist, o.dirBF[1] * o.dist, o.dirBF[2] * o.dist);
      shared.uOccR.value[no] = o.body.R;
      shared.uOccAnn.value[no].fromArray(annulusTint(o.body));
      no++;
    }
    shared.uNumOcc.value = no;
  }
  // planetshine (§10): the brightest companion's reflected disc radiance —
  // scaled by its eclipse visibility (moonlight dies during totality)
  let shineE = 0;
  for (let oi = 0; oi < others.length; oi++) {
    const o = others[oi];
    const cosPh = -(o.sunDirBF[0] * o.dirBF[0] + o.sunDirBF[1] * o.dirBF[1] + o.sunDirBF[2] * o.dirBF[2]);
    // clouds brighten the shining disc (round 15, §11 "the value its far
    // point renders with"): coverage mean over the LIT, RECEIVER-FACING
    // hemisphere at the current drift phase (a whole-sphere mean is
    // drift-invariant by construction and averages in the unseen far side —
    // pre-code panel H1), through the same alpha law the disc pixel uses.
    // Cached per world-minute: the inputs are all slow.
    let a = o.body.discAlbedo;
    const cbS = o.body.clouds, cRowS = cloudState.rows.get(o.body.id);
    if (cbS && cRowS && !state.cloudsOff) {
      const tq = Math.floor(state.t / 60);
      let cc = shineCovCache.get(o.body.id);
      if (!cc || cc.tq !== tq) {
        const Mt = mulMM(transpose(bodyToInertial(o.body, state.t)), m);
        const mv = (v) => [
          Mt[0] * v[0] + Mt[1] * v[1] + Mt[2] * v[2],
          Mt[3] * v[0] + Mt[4] * v[1] + Mt[5] * v[2],
          Mt[6] * v[0] + Mt[7] * v[1] + Mt[8] * v[2],
        ];
        const alb = [...a];
        const toUs = mv([-o.dirBF[0], -o.dirBF[1], -o.dirBF[2]]);
        const toSun = mv(o.sunDirBF);
        for (let d = 0; d < Math.min(cbS.decks.length, MAX_DECKS) && d < cRowS.decks; d++) {
          // mean ALPHA over the lit visible hemisphere (never alpha of the
          // mean coverage — the saturating law overshoots 2x under Jensen)
          const aD = alphaMeanLit(o.body, cRowS.rgba, d, state.t, toUs, toSun);
          const ca = cbS.decks[d].alb ?? [0.92, 0.93, 0.95];
          for (let ch = 0; ch < 3; ch++) alb[ch] = alb[ch] * (1 - aD) + ca[ch] * aD;
        }
        cc = { tq, alb };
        shineCovCache.set(o.body.id, cc);
      }
      a = cc.alb;
    }
    const mean = (a[0] + a[1] + a[2]) / 3;
    const E = o.irradiance * mean * (1 + cosPh) * 0.5 * (o.body.R / o.dist) ** 2
      * (eclVis[oi].vis + (eclVis[oi].ann[0] + eclVis[oi].ann[1] + eclVis[oi].ann[2]) / 3);
    if (E > shineE) {
      shineE = E;
      shared.uShineDir.value.set(...o.dirBF);
      shared.uShineRad.value.set(a[0] / mean, a[1] / mean, a[2] / mean).multiplyScalar(E);
    }
  }
  if (!shineE) shared.uShineRad.value.set(0, 0, 0);
  // Phase 4 clouds (round 15): keyframe request/rollover + per-frame phases
  // for the OWN body. All time inputs derive from state.t (frozen by __shot);
  // drift phases are computed in DOUBLE here and wrap per-deck (never the
  // 4096 s uTimeS wrap). The deck count is gated on the keyframe row being
  // loaded at the CURRENT k, so a shot can never render stale coverage.
  {
    const cl = body.clouds;
    if (cl && !state.cloudsOff) {
      const { k, frac } = cloudKeyOf(body, state.t);
      requestClouds(body, k);
      const rowC = cloudState.rows.get(body.id);
      // rollover continuity (round-15 panel TF-ROLLOVER-DROPOUT): while the
      // next keyframe pair generates, the PREVIOUS pair at frac=1 equals the
      // new pair at frac=0 byte-exactly (the rollover continuity law) —
      // render it instead of blinking the deck out for a frame in free-run
      const live = rowC && (rowC.k === k || rowC.k === k - 1);
      shared.uCloudLerp.value = rowC && rowC.k === k - 1 ? 1 : frac;
      shared.uCloudDecks.value = live ? Math.min(cl.decks.length, MAX_DECKS) : 0;
      for (let d = 0; d < MAX_DECKS; d++) {
        shared.uCloudDeckB.value[d].x = cl.decks[d] ? driftPhase(cl.decks[d], state.t) : 0;
      }
    } else {
      shared.uCloudDecks.value = 0;
    }
  }

  const cs = cam.getState();
  const sunRadArr = [shared.uSunRad.value.x, shared.uSunRad.value.y, shared.uSunRad.value.z];
  // the shader's ambient curve: 8 sun-elevation knots of the same integral (1b).
  // ~1k exp() per frame — cheap, and never stale across bodies or seasons.
  {
    const gp = [body.R + 2, 0, 0];
    for (let k = 0; k < 8; k++) {
      const s = AMB_KNOTS[k], c = Math.sqrt(1 - s * s);
      const a = skyAmbient(body.atmosphere, body.R, sunRadArr, [s, c, 0], gp, state.msLUT, body.ambientAlbedo);
      shared.uAmb.value[k].set(a[0], a[1], a[2]);
    }
  }
  // auto-exposure (§10, camera property). The heuristic scene_L formula only SEEDS
  // the servo on teleports; the actual metering reads the rendered image below
  // (a real camera meters the picture, not a proxy — the "replace" ledger item)
  // figure bodies: the metering/WB proxy stands at the camera's own ground
  // point with the FIGURE normal (post-impl panel — the radial vertical read
  // the wrong sun elevation on the neck); legacy takes the old expressions
  const upM = cs.up ?? cs.dir;
  const groundPos = state.fig
    ? cs.pos.map((p, i) => p - upM[i] * (cs.alt - 2))
    : cs.dir.map((d) => d * (body.R + Math.max(cs.groundH, 0) + 2));
  const amb = skyAmbient(body.atmosphere, body.R, sunRadArr, eph.sunDirBF, groundPos, state.msLUT, body.ambientAlbedo);
  const sunElev = upM[0] * eph.sunDirBF[0] + upM[1] * eph.sunDirBF[1] + upM[2] * eph.sunDirBF[2];
  const lum = 0.2126 * amb[0] + 0.7152 * amb[1] + 0.0722 * amb[2];
  const scene_L = lum * 1.6 + eph.irradiance * 0.09 * Math.max(sunElev, 0) + eph.irradiance * 0.0006;
  // white balance ([camera] §10): 'camera' neutralises the ground illuminant
  // (sunlight + sky) so a grey card reads neutral — the D65 "as-camera" choice;
  // 'scene' (default) leaves uWB at the manual temp knob (identity at 0) so the
  // sun's warm cast and Rubra's butterscotch sky survive as they truly are.
  if (state.wbMode === 'camera') {
    const se = Math.max(sunElev, 0);
    const il = [sunRadArr[0] * se + amb[0] + 1e-6, sunRadArr[1] * se + amb[1] + 1e-6, sunRadArr[2] * se + amb[2] + 1e-6];
    const y = 0.2126 * il[0] + 0.7152 * il[1] + 0.0722 * il[2];
    shared.uWB.value.set(y / il[0], y / il[1], y / il[2]);
  }
  if (state.expSeed) {
    state.autoExp = clamp(0.42 / (0.02 + scene_L), 0.02, 400);
    state.expSeed = false;
  }
  // fixed-EV mode (R3): metering differences must not pollute render-vs-photo pairs
  shared.uExposure.value = state.fixedEV != null ? Math.pow(2, state.fixedEV) : state.autoExp;

  // eye-level inset: a second endpoint of the same function of (body, position, time)
  let eyePos = null, eyeQuat = null;
  if (state.inset) {
    const eyeH = Math.max(cs.groundH, body.seaLevel ?? -Infinity) + 1.7;
    // figure bodies: the eye stands at q + m̂·eyeH (the tiles' own law) with
    // the figure normal as up; the radial form is the sphere special case
    const upE = cs.up ?? cs.dir;
    eyePos = state.fig
      ? cs.pos.map((p, i) => p - upE[i] * (cs.alt - (eyeH - cs.groundH)))
      : cs.dir.map((d) => d * (body.R + eyeH));
    const up = new THREE.Vector3(...upE);
    const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
    if (east.lengthSq() < 1e-9) east.set(1, 0, 0);
    const north = new THREE.Vector3().crossVectors(up, east);
    const fwd = up.clone().multiplyScalar(-Math.cos(1.47)).addScaledVector(north, Math.sin(1.47));
    fwd.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(up, -cam.yaw));
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();
    eyeQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, camUp, fwd.clone().negate()));
  }

  const cams = eyePos ? [cs.pos, eyePos] : [cs.pos];
  const mainPixAng = (camera.fov * Math.PI / 180) / (innerHeight * renderer.getPixelRatio());
  // turbo settle (Phase T): with time paused (every __shot scene), streaming
  // is frame-rate-bound — requests, rock builds and the stability count all
  // tick per FRAME, and SwiftShader renders eye-level frames at ~1-2 fps, so
  // deep scenes took 150-300 s to settle. With the clock stopped nothing in
  // the world changes frame to frame: burst the request cap, batch rock
  // builds, and skip the expensive render passes on 3 of 4 unsettled frames.
  // Every SETTLED frame still renders (the meter converges there, and the
  // screenshot only ever sees settled frames), so nothing scored changes.
  const turbo = state.speed === 0;
  const tU0 = performance.now();
  // crossfade clock: TRUE frame wall time (unclamped — the dt above is capped
  // at 0.1 s for world integration; a 1.5 s software-GL frame must advance a
  // 0.28 s dissolve to completion, or the stipple smears across the motion
  // bench's capture pairs — measured 4x on orbit-pan pop_p99)
  const stats = state.tiles.update(cams, state.t, ++state.frameNo, mainPixAng, turbo,
    Math.min(state.lastMs / 1000, 2));
  recordPerf('update', performance.now() - tU0);
  const unsettled = stats.pending > 0 || state.tiles.rockQueue.length > 0
    || state.tiles.formQueue.length > 0;
  const skipRender = turbo && unsettled && (state.frameNo % 8) !== 0;
  const meterNow = !skipRender && state.fixedEV == null && (state.expSnap > 0 || state.frameNo % 4 === 0);

  // lookAt override (bench/R3): aim the main camera at another body's disc —
  // a [camera] pose choice; the world is untouched
  let mainQuat = cs.quat;
  if (state.lookAtBody) {
    const o = eph.others.find((x) => x.body.id === state.lookAtBody);
    if (o) {
      const fwd = new THREE.Vector3(...o.dirBF);
      const up0 = new THREE.Vector3(...cs.dir);
      let right = new THREE.Vector3().crossVectors(fwd, up0);
      if (right.lengthSq() < 1e-9) right.set(0, 1, 0).cross(fwd);
      right.normalize();
      const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();
      mainQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, camUp, fwd.clone().negate()));
    }
  }

  const W = innerWidth, H = innerHeight;
  if (!skipRender) {
  const tS0 = performance.now();
  renderShadowPass(cs);
  recordPerf('shadow', performance.now() - tS0);
  renderer.setScissorTest(true);
  const tR0 = performance.now();
  renderPass(camera, cs.pos, mainQuat, [0, 0, W, H]);
  // histogram metering: read back a centered window of the image just rendered
  // and servo the exposure toward a mid-gray log-average — the camera meters its
  // own picture. The clamp is the camera's ISO/shutter limit: starless-dark
  // scenes bottom out instead of amplifying to noise.
  if (meterNow) {
    const mtr = meterImage();
    state.lastMeter = mtr; // exposed for tooling/debug (__state.lastMeter)
    // frames with no displayable tiles (right after a body switch) carry no
    // scene photometry — only stars — and metering them pumps the exposure to
    // the clamp before the surface arrives; a camera can't meter a scene that
    // isn't there yet
    if (mtr && stats.baked > 0) {
      // night anchoring: mid-gray drive alone renders a moonlit ocean as bright
      // as noon (it amplifies until SOMETHING hits 0.30 — user report: the night
      // side became a bright blue mottle field). Real night photos look dark
      // because the scene IS dark: scale the target by the metered ABSOLUTE
      // radiance, compressing below ~5e-3 (relative units) with a floor so
      // starlit scenes stay readable. EV bias still overrides ([camera]).
      const radGray = mtr.gray / Math.max(shared.uExposure.value, 1e-6);
      const nightAnchor = Math.max(Math.pow(clamp(radGray / 5e-3, 0, 1), 0.3), 0.18);
      const targetGray = clamp(0.30 * nightAnchor * Math.pow(2, state.exposureBias), 0.015, 0.75);
      // mid-gray drive, capped by highlight protection: a lit surface against a
      // black sky exposes for the surface, not the star field
      let r = Math.min(targetGray / Math.max(mtr.gray, 1e-4), 0.92 / Math.max(mtr.p99, 1e-4));
      // deep clip: a saturated histogram can't say HOW far over — step down
      // hard (real AE behavior) instead of creeping at the 0.92 floor
      if (mtr.p99 >= 0.995 && mtr.gray > targetGray * 0.6) r = Math.min(r, 0.55);
      if (Math.abs(Math.log(r)) > 0.02) {
        // asymmetric gains, like a real AE loop: highlight recovery is fast
        // (blown frames are unusable), brightening is cautious
        const gain = state.expSnap > 0 ? 0.9 : r < 1 ? 0.5 : 0.18;
        state.autoExp = clamp(state.autoExp * Math.pow(r, gain), 1e-3, 3000);
      }
      if (state.expSnap > 0) state.expSnap--;
    }
  }
  if (eyePos) {
    const iw = Math.round(W * 0.3), ih = Math.round(iw * 0.62);
    insetCam.aspect = iw / ih; insetCam.updateProjectionMatrix();
    // the shadow map lives in the MAIN camera's render space — invalid here
    const shadowWas = shared.uShadowOn.value;
    shared.uShadowOn.value = 0;
    renderPass(insetCam, eyePos, eyeQuat, [W - iw - 12, 12, iw, ih], false);
    shared.uShadowOn.value = shadowWas;
  }
  renderer.setScissorTest(false);
  recordPerf('render', performance.now() - tR0);
  } // end !skipRender

  if (state.captureDefect) { state.captureDefect = false; captureDefect(); }
  if (state.capturePhoto) { state.capturePhoto = false; capturePhoto(); }

  // readiness / stability (for __shot and __ready) — a mid-dissolve tile
  // (stats.fading, Phase M stream-in crossfade) counts as unsettled so a
  // screenshot never catches the stipple pattern
  // round 14: formation/impostor builds are new async pipelines — they must
  // feed this predicate or scene 28 captures mid-stream by construction
  // round 15: cloud keyframe generation is a new async pipeline — it feeds
  // the predicate like every other (a shot must never capture a deck-less
  // frame of a cloud body because the worker was still generating)
  const settled = stats.pending === 0 && state.tiles.rockQueue.length === 0
    && state.tiles.formQueue.length === 0
    && !stats.fading && state.discPending <= 0 && cloudState.pending === 0;
  state.stable = settled ? state.stable + 1 : 0;
  if (state.stable > 5) state.ready = true;

  const hud = $('hud');
  if (hud && state.frameNo % 10 === 0) {
    const alt = cs.alt;
    hud.textContent =
      `${body.name} · alt ${alt >= 10000 ? (alt / 1000).toFixed(0) + ' km' : alt.toFixed(1) + ' m'}`
      + ` · tiles ${stats.tiles} · baked ${stats.baked} · pending ${stats.pending}`
      + ` · L${stats.level} · ${state.lastMs.toFixed(0)} ms`;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  makeTargets();
});

// ---- headless hooks (same contract as viewer.html + screenshot.mjs) ----
window.__state = state; window.__shared = shared; // debug/inspection access
window.__ready = () => state.ready;
// per-subsystem frame timing (EMA ms) for the motion bench's perf-budget gate
window.__perf = () => ({ ...state.perf });
// stream-state introspection for the bench/probes (round 14): which queue is
// holding a settle open — turns "did not settle" from a mystery into a name
window.__stream = () => {
  // impostor-rung existence counters (round 14): drawn instances on band
  // tiles — the ladder's live proof (a 2 px population is honest but hard to
  // eyeball in a still)
  let impRock = 0, impForm = 0, meshRock = 0;
  const rk = state.body.rocks, fm = state.body.formations;
  for (const t of state.tiles.cache.values()) {
    if (rk && t.rocks && t.rocks.visible) {
      for (const im of t.rocks.children) {
        if (t.level === rk.minTileLevel - 1) impRock += im.count;
        else meshRock += im.count;
      }
    }
    if (fm && t.forms && t.forms.visible && t.level === fm.minTileLevel - 1) {
      for (const im of t.forms.children) impForm += im.count;
    }
  }
  return {
    pending: state.tiles.stats.pending, fading: state.tiles.stats.fading,
    rockQ: state.tiles.rockQueue.length, formQ: state.tiles.formQueue.length,
    disc: state.discPending, stable: state.stable,
    impRock, impForm, meshRock,
    cloudQ: cloudState.pending, cloudDecks: shared.uCloudDecks.value,
  };
};
// round-15 cloud twins for probes/tests (F3-bench: the GPU witness probe
// compares uMode 8/9 readbacks against exactly these, on the same bytes)
window.__cloud = (dir, sunDir) => {
  const b = state.body;
  const row = cloudState.rows.get(b.id);
  if (!b.clouds || !row) return null;
  const R = b.R;
  const gp = dir.map((v, i2) => v * (R + 2));
  return {
    k: row.k,
    cov: cloudCovJS(b, row.rgba, 0, dir, state.t),
    shade: cloudShadeJS(b, row.rgba, gp, sunDir ?? [shared.uSunDir.value.x, shared.uSunDir.value.y, shared.uSunDir.value.z], state.t),
  };
};

// hot recipe reload (Phase T tuning loop): swap the current body's process list
// and rebake ONLY the affected bands (level >= the shallowest changed band) —
// changing a level-8+ process leaves levels 0-7 untouched. The velocity limit
// for every Phase 2 round. __recipe() returns a deep copy to patch and hand back.
window.__recipe = () => JSON.parse(JSON.stringify(state.body.processes));
window.__reload = (processes) => {
  if (!Array.isArray(processes)) throw new Error('__reload expects a processes array (see __recipe())');
  state.body.processes = processes;
  state.tiles.reload(processes);
  // the disc map is a level-2 bake: re-request it so shallow-band edits show on
  // the §11 whole-disc representation too (the worker rebakes it post-reload)
  state.discPending++;
  worker.postMessage({ type: 'discmap', bodyId: state.body.id });
  state.ready = false; state.stable = 0;
  return true;
};

// R3: solve tday so the sun–point–camera phase angle matches a reference's viewing
// geometry (the ephemeris is closed-form, so a scan is exact enough & deterministic)
function solvePhase(body, deg, dir, season) {
  let best = 0.5, bestErr = Infinity;
  for (let i = 0; i < 2048; i++) {
    const td = i / 2048;
    const t = season * body.orbit.periodDays * 86400 + td * body.spin.periodH * 3600;
    const s = ephemeris(body, t).sunDirBF;
    const ph = Math.acos(clamp(s[0] * dir[0] + s[1] * dir[1] + s[2] * dir[2], -1, 1)) * 180 / Math.PI;
    const err = Math.abs(ph - deg);
    if (err < bestErr) { bestErr = err; best = td; }
  }
  return best;
}
// R3: free sun azimuth — spin the camera so it faces the sun's azimuth at the point
function faceSunYaw() {
  const body = state.body;
  const t = state.season * body.orbit.periodDays * 86400 + state.tday * body.spin.periodH * 3600;
  const s = ephemeris(body, t).sunDirBF;
  const up = cam.surfaceDir();
  const east = vnorm(vcross([0, 1, 0], up));
  const north = vcross(up, east);
  const e = s[0] * east[0] + s[1] * east[1] + s[2] * east[2];
  const n = s[0] * north[0] + s[1] * north[1] + s[2] * north[2];
  return Math.atan2(e, n); // yaw convention: 0 = north, +yaw rotates toward east
}

window.__shot = (spec = {}) => new Promise((resolve) => {
  if (spec.body && spec.body !== state.body.id) switchBody(spec.body);
  if (spec.tday !== undefined) state.tday = spec.tday;
  // season resets like every other field (round-3 bench: the eclipse scenes'
  // season 5.0 leaked into all later scenes — Luna solves aimed at a moved
  // moon, sun azimuths drifted; the round-1 reset-semantics class, one field
  // missed because its guard predates the reset rule)
  state.season = spec.season !== undefined ? spec.season : 0.15;
  const seasEl = $('season'); if (seasEl) seasEl.value = String(state.season);
  state.dayCount = 0; // a __shot spec IS the scene: ephemeris must be reproducible
  state.speed = 0;
  const sp = $('speed'); if (sp) sp.value = '0';
  // every un-specified field resets to its canonical default — sequential shots
  // must not inherit pose/toggle state from earlier scenes (bench pose leakage)
  cam.yaw = 0; cam.pitch = 0; cam.free = false; cam.roll = 0;
  cam.set(spec);
  // photo-mode [camera] controls reset like every other field
  applyWB(spec.wb ?? 0);
  state.meterMode = spec.meter ?? 'center';   // avg / center / spot
  state.wbMode = spec.wbMode ?? 'scene';      // scene / camera (D65 as-camera)
  shared.uGrade.value = state.grade = spec.grade ?? 0;
  if (spec.phaseDeg !== undefined) state.tday = solvePhase(state.body, spec.phaseDeg, cam.surfaceDir(), state.season);
  if (spec.faceSun) cam.yaw = faceSunYaw() + ((spec.yaw ?? 0) * Math.PI) / 180;
  camera.fov = spec.fov ?? 55; camera.updateProjectionMatrix();
  state.lookAtBody = spec.lookAt ?? null;
  state.fixedEV = spec.fixedEV ?? null;
  setClean(!!spec.clean);
  const mode = spec.mode ?? 0;
  setMode(typeof mode === 'string' ? MODES.indexOf(mode) : mode);
  { const v = spec.wire ?? false; state.tiles.wireframe = v; const el = $('wire'); if (el) el.checked = v; }
  { const v = spec.debris ?? true; state.tiles.debris = v; const el = $('debris'); if (el) el.checked = v; }
  // round 15: clouds:false is the bench A/B + perf-differential lever (and the
  // clear-sky witness's control) — resets to ON like every other field
  state.cloudsOff = spec.clouds === false;
  { const v = spec.inset ?? false; setInset(v); const el = $('inset'); if (el) el.checked = v; }
  state.exposureBias = spec.exposure ?? 0;
  state.expSnap = 10; // teleports snap the metering instead of easing (§10: camera EV)
  state.expSeed = true;
  state.stable = 0;
  const t0 = performance.now();
  // generous default: a screenshot of an UNSETTLED scene is a false defect
  // machine (round-2: half-morphed coarse tiles read as sky noise) — better a
  // slow bench than a lying one. Round 14: the resolution now CARRIES the
  // settle state ({settled, ms} — truthy, callers unaffected) instead of
  // swallowing it: the waitMs deadline escape produced the round-13
  // under-settled boulder capture, and the harness can only retry/fail loud
  // if it can tell a settled frame from a timed-out one.
  const wait = () => {
    const settled = state.stable > 6;
    if (settled || performance.now() - t0 > (spec.waitMs ?? 150000)) {
      resolve({ settled, ms: Math.round(performance.now() - t0) });
    } else setTimeout(wait, 100);
  };
  setTimeout(wait, 50);
});

frame();
