// stars.js — Night sky v2 (ROADMAP_V2 Phase 1d). A deterministic synthetic star
// catalog (power-law magnitudes, B–V color temperatures, galactic-disc density,
// a few open clusters) rendered as point sprites fixed in the INERTIAL frame (§9:
// the star backdrop rotates with the frame tree, never with the body). Replaces
// the v0 hash stars. Real-catalog (Hipparcos) drop-in stays open: this module is
// the loader boundary — swap makeCatalog() for a file read, nothing else moves.
//
// Radiometry: stars add trans·flux AFTER the sky pass (additive blending). The
// addition happens post-tonemap, which is exact on a black night sky and a
// negligible error under a bright one (trans·flux is stops below the sky then).

import * as THREE from 'three';
import { rand01 } from './mathx.js';

// galactic frame for the synthetic sky (fictional system — arbitrary but fixed)
export const GAL_POLE = new THREE.Vector3(0.35, 0.80, 0.487).normalize();

function bvToRGB(bv) {
  // crude blackbody tint: bv in [-0.3, 1.9] -> blue-white .. orange-red
  const t = Math.max(-0.3, Math.min(1.9, bv));
  const r = t < 0.4 ? 0.75 + 0.25 * (t + 0.3) / 0.7 : 1.0;
  const g = t < 0.4 ? 0.82 + 0.18 * (t + 0.3) / 0.7 : 1.0 - 0.35 * (t - 0.4) / 1.5;
  const b = t < 0.4 ? 1.0 : 1.0 - 0.75 * (t - 0.4) / 1.5;
  return [r, g, b];
}

// N raised 7000 -> 16000 when the analytic Milky Way was removed (user
// direction): the galactic band is now carried entirely by the disc
// population's star DENSITY, so the faint tail must be rich enough to read
export function makeCatalog(N = 16000, seed = 77) {
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const flux = new Float32Array(N);
  const gp = GAL_POLE;
  const gx = new THREE.Vector3(1, 0, 0).cross(gp).normalize();
  const gy = new THREE.Vector3().crossVectors(gp, gx);
  const v = new THREE.Vector3();
  // cluster centers (disc-weighted)
  const clusters = [];
  for (let c = 0; c < 8; c++) {
    const l = rand01(c, 1, 0, seed + 9) * Math.PI * 2;
    const b = (rand01(c, 2, 0, seed + 9) - 0.5) * 0.5;
    clusters.push(new THREE.Vector3()
      .addScaledVector(gx, Math.cos(b) * Math.cos(l))
      .addScaledVector(gy, Math.cos(b) * Math.sin(l))
      .addScaledVector(gp, Math.sin(b)).normalize());
  }
  for (let i = 0; i < N; i++) {
    const u1 = rand01(i, 3, 0, seed), u2 = rand01(i, 4, 0, seed), u3 = rand01(i, 5, 0, seed);
    const kind = rand01(i, 6, 0, seed);
    if (kind < 0.05) { // cluster member
      const c = clusters[i % clusters.length];
      v.set(c.x + (u1 - 0.5) * 0.03, c.y + (u2 - 0.5) * 0.03, c.z + (u3 - 0.5) * 0.03).normalize();
    } else if (kind < 0.60) { // galactic-disc population
      const l = u1 * Math.PI * 2;
      // approx gaussian latitude via sum of uniforms
      const b = (u2 + u3 + rand01(i, 7, 0, seed) - 1.5) * 0.35;
      v.set(0, 0, 0)
        .addScaledVector(gx, Math.cos(b) * Math.cos(l))
        .addScaledVector(gy, Math.cos(b) * Math.sin(l))
        .addScaledVector(gp, Math.sin(b)).normalize();
    } else { // isotropic halo
      const z = 2 * u1 - 1, ph = u2 * Math.PI * 2, s = Math.sqrt(Math.max(1 - z * z, 0));
      v.set(s * Math.cos(ph), z, s * Math.sin(ph));
    }
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    // magnitudes: dN ∝ 10^(0.5 m), m in [-1.5, 7.2] (deeper faint tail — the
    // band reads as unresolved-star glow at night exposure)
    const u = rand01(i, 8, 0, seed);
    const m = Math.log10(u * (Math.pow(10, 0.5 * 8.7) - 1) + 1) / 0.5 - 1.5;
    flux[i] = 0.012 * Math.pow(10, -0.4 * m);
    const bv = -0.3 + 2.2 * Math.pow(rand01(i, 9, 0, seed), 1.6);
    const c = bvToRGB(bv);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  return { pos, col, flux };
}

const STAR_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  __COMMON__
  uniform vec3 uB2I0, uB2I1, uB2I2; // body-fixed -> inertial columns (sky pass twins)
  uniform int  uNumBodies;          // celestial occlusion (round 9): companion discs
  uniform vec3 uBodyDir[4];         // body-fixed directions to companions (sky twins)
  uniform float uBodyAngR[4];       // their angular radii
  uniform sampler2D uSceneDepth;    // terrain occlusion (round 11): the scene
  uniform vec4 uStarVp;             // target's depth, tapped at this star's own
  uniform vec2 uRtSize;             // pixel — boulders/relief finally cull stars
  uniform float uStarOccR;          // round 17: sunken occluder radius — the
                                    // INSCRIBED radius on figure bodies (the
                                    // mean-R sphere pokes out of a contact
                                    // binary's neck and eats a band of sky);
                                    // legacy uploads exactly uPlanetR*0.9995,
                                    // and the depth tap covers the rest
  attribute float aFlux;
  attribute vec3 aColor;
  varying vec3 vCol;
  void main(){
    // inertial -> body-fixed via the transpose of the b2i columns (§9)
    vec3 di = normalize(position);
    vec3 rd = vec3(dot(uB2I0, di), dot(uB2I1, di), dot(uB2I2, di));
    // occlusion by the planet body (datum sphere, slightly sunken like the sky pass)
    vec2 pg = raySphere(uCamPos, rd, uStarOccR);
    float occ = (pg.x > 0.0 && pg.y > 0.0) ? 0.0 : 1.0;
    // celestial occlusion (round 9): a companion disc or the sun in FRONT of a
    // star blocks it — earthrise/moon-sizes showed the star field burning
    // straight through the lit planet/moon disc. Angular test in the body-fixed
    // frame (uBodyDir/uSunDir are the sky pass's own twins), so it is exact at
    // the disc limb the sky pass draws.
    if (acos(clamp(dot(rd, uSunDir), -1.0, 1.0)) < uSunAngR) occ = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= uNumBodies) break;
      if (acos(clamp(dot(rd, uBodyDir[i]), -1.0, 1.0)) < uBodyAngR[i]) occ = 0.0;
    }
    // transmittance along the star ray: the same integral as everything else (§8)
    ${'__SCATTER__'}
    vCol = aColor * aFlux * trans * occ;
    // contrast gate: a star is visible only where its PSF peak competes with
    // the sky radiance along the SAME ray (inscat, computed above). At night
    // inscat ~ 0 and stars pass untouched; in daylight/twilight they drown —
    // except the brightest, which is what a real sky does (round-2: catalog
    // flux is night-calibrated, so absolute addition burned dots through
    // bright skies at high exposure)
    float _skyL = max(inscat.r, max(inscat.g, inscat.b));
    float _peak = max(vCol.r, max(vCol.g, vCol.b)) * 2.2;
    // k=2: night airglow must not eat the faint star tail (a mag-4 star's pixel
    // outshines the night sky ~400x in reality); daylight suppression still
    // holds because day inscat is 3+ orders above any star peak
    vCol *= clamp(_peak / (_peak + _skyL * 2.0 + 1e-9), 0.0, 1.0);
    vec4 wp = vec4(rd * 3.0e7, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
    // terrain/rock occlusion (round 11, register row: stars burned through
    // solid foreground): one depth tap at the star's projected pixel. The sky
    // writes no depth (cleared to 1), so any solid geometry in front reads
    // < 1 and kills the star. Vertex-level like the datum test — the whole
    // PSF sprite winks at the silhouette, which is what a point source does.
    if (gl_Position.w > 0.0) {
      vec2 sUv = (uStarVp.xy + (gl_Position.xy / gl_Position.w * 0.5 + 0.5) * uStarVp.zw) / uRtSize;
      if (sUv == clamp(sUv, 0.0, 1.0) && texture2D(uSceneDepth, sUv).r < 0.999999) vCol = vec3(0.0);
    }
    float lum = max(vCol.r, max(vCol.g, vCol.b)) * uExposure;
    // 3px floor: a 2px gaussian sprite rasterizes as a square dot (user shots)
    gl_PointSize = clamp(3.0 + 0.9 * log2(1.0 + lum * 30.0), 3.0, 8.0);
    #include <logdepthbuf_vertex>
  }
`;

const STAR_FRAG = /* glsl */ `
  precision highp float;
  #define PI 3.14159265359
  uniform float uExposure;
  uniform int uMode;
  varying vec3 vCol;
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
  vec3 lin2srgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
  void main(){
    if (uMode >= 2) discard;             // diagnostics: no stars
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;
    float psf = exp(-r2 * 3.5);
    // Stars composite AFTER the post pass (additive on the tonemapped frame —
    // exact on a black night sky, negligible under a bright one). Running them
    // through the HDR bloom pyramid turned the whole night sky into a blurred
    // copy of the star-density field: hundreds of sub-pixel points x deep-mip
    // halos = the blue blob field (user report). The sprite IS the PSF.
    vec3 c = lin2srgb(aces(vCol * uExposure * psf * 2.2));
    if (max(c.r, max(c.g, c.b)) < 0.004) discard;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// scatterInline lives in shaders.js; the caller passes it in so there is exactly
// one source of the integral text (§8 discipline at the module level too)
export function makeStarPoints(shared, skyUniforms, withCommonFn, scatterText, atmSteps, depthUniforms = {}) {
  const cat = makeCatalog();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(cat.pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(cat.col, 3));
  g.setAttribute('aFlux', new THREE.BufferAttribute(cat.flux, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3.1e7);
  const vert = withCommonFn(STAR_VERT, atmSteps, { vertex: true }).replace('__SCATTER__', scatterText);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: STAR_FRAG,
    uniforms: { ...shared, uB2I0: skyUniforms.uB2I0, uB2I1: skyUniforms.uB2I1, uB2I2: skyUniforms.uB2I2,
      uNumBodies: skyUniforms.uNumBodies, uBodyDir: skyUniforms.uBodyDir, uBodyAngR: skyUniforms.uBodyAngR,
      ...depthUniforms },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false, // occlusion is geometric (raySphere in the vertex shader);
                      // this layer draws on the tonemapped canvas, whose depth
                      // buffer never saw the scene (it lives in the HDR target)
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}
