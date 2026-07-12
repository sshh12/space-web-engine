// atmo.js — the same scattering integral as the GLSL chunk, in JS, used for
// (a) the per-frame ambient sky irradiance knots and (b) the auto-exposure seed
// (CONCEPT §8: the sky is also the light; §10: exposure belongs to the camera).
// Fewer steps than the shader — same integrand, same convergence target.
// Phase 1 round 2: Chapman transmittance + the Hillaire MS table replace the
// 4-step sun march, the 1.55x Rayleigh fudge and the ambient-coupled MS proxy.

import { chapTransmit, MS_N, MS_MU0 } from './atmolut.js';

function raySphere(ro, rd, r) {
  const b = ro[0] * rd[0] + ro[1] * rd[1] + ro[2] * rd[2];
  const c = ro[0] ** 2 + ro[1] ** 2 + ro[2] ** 2 - r * r;
  const d = b * b - c;
  if (d < 0) return [1e18, -1e18];
  const s = Math.sqrt(d);
  return [-b - s, -b + s];
}

// bilinear sample of the MS table (Float32Array rgba, MS_N x MS_N). The shader
// consumes an 8x4 knot downsample of this (main.js uMsK) — exported so the
// knots come from the same sampler.
export function msSample(ms, mus, h, top) {
  if (!ms) return [0, 0, 0];
  const fx = Math.min(Math.max((mus - MS_MU0) / 1.4, 0), 1) * (MS_N - 1);
  const fy = Math.sqrt(Math.min(Math.max(h / top, 0), 1)) * (MS_N - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, MS_N - 1), y1 = Math.min(y0 + 1, MS_N - 1);
  const tx = fx - x0, ty = fy - y0;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const a = ms[(y0 * MS_N + x0) * 4 + k] * (1 - tx) + ms[(y0 * MS_N + x1) * 4 + k] * tx;
    const b = ms[(y1 * MS_N + x0) * 4 + k] * (1 - tx) + ms[(y1 * MS_N + x1) * 4 + k] * tx;
    out[k] = a * (1 - ty) + b * ty;
  }
  return out;
}

export function scatterRayJS(atm, R, sunRad, sunDir, ro, rd, tmax, steps = 8, ms = null) {
  const trans = [1, 1, 1], inscat = [0, 0, 0];
  if (!atm) return { trans, inscat };
  const shell = raySphere(ro, rd, R + atm.top);
  const t0 = Math.max(shell[0], 0), t1 = Math.min(shell[1], tmax);
  if (t1 <= t0) return { trans, inscat };
  // perigee-clustered quadrature — the GLSL twin in shaders.js, kept identical
  const tp = Math.min(Math.max(-(ro[0] * rd[0] + ro[1] * rd[1] + ro[2] * rd[2]), t0), t1);
  const sp = Math.min(Math.max((tp - t0) / Math.max(t1 - t0, 1e-6), 0), 1);
  let tPrev = t0;
  let odR = 0, odM = 0, odO = 0;
  const sumR = [0, 0, 0], sumM = [0, 0, 0], sumMS = [0, 0, 0];
  const bA = atm.betaA ?? [0, 0, 0];
  const bO = atm.ozone?.beta ?? [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const u = (i + 1) / steps;
    let tCur;
    if (u < sp && sp > 1e-4) { const w = 1 - u / sp; tCur = tp + (t0 - tp) * w * w; }
    else if (sp < 0.9999) { const v = (u - sp) / (1 - sp); tCur = tp + (t1 - tp) * v * v; }
    else tCur = t1;
    const dsi = tCur - tPrev;
    const t = 0.5 * (tCur + tPrev);
    tPrev = tCur;
    const p = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
    const pr = Math.hypot(...p);
    const h = Math.max(pr - R, 0);
    const dR = Math.exp(-h / atm.Hr) * dsi, dM = Math.exp(-h / atm.Hm) * dsi;
    odR += dR; odM += dM;
    if (atm.ozone) odO += Math.max(0, 1 - Math.abs(h - atm.ozone.center) / atm.ozone.width) * dsi;
    const ts = sunTransmitJS(atm, R, sunDir, p);
    const mus = (p[0] * sunDir[0] + p[1] * sunDir[1] + p[2] * sunDir[2]) / pr;
    const psi = msSample(ms, mus, h, atm.top);
    for (let k = 0; k < 3; k++) {
      const tv = Math.exp(-(atm.betaR[k] * odR + (atm.betaM[k] + bA[k]) * odM + bO[k] * odO));
      sumR[k] += dR * tv * ts[k];
      sumM[k] += dM * tv * ts[k];
      sumMS[k] += psi[k] * (atm.betaR[k] * dR + atm.betaM[k] * dM) * tv;
    }
  }
  const mu = rd[0] * sunDir[0] + rd[1] * sunDir[1] + rd[2] * sunDir[2];
  const phR = (3 / (16 * Math.PI)) * (1 + mu * mu); // exact — the 1.55x fudge is dead
  const g3 = Array.isArray(atm.mieG) ? atm.mieG : [atm.mieG, atm.mieG, atm.mieG];
  for (let k = 0; k < 3; k++) {
    const g = g3[k], g2 = g * g;
    const phM = ((3 / (8 * Math.PI)) * ((1 - g2) * (1 + mu * mu)))
      / ((2 + g2) * Math.pow(Math.max(1 + g2 - 2 * g * mu, 1e-4), 1.5));
    trans[k] = Math.exp(-(atm.betaR[k] * odR + (atm.betaM[k] + bA[k]) * odM + bO[k] * odO));
    inscat[k] = sunRad[k] * (phR * atm.betaR[k] * sumR[k] + phM * atm.betaM[k] * sumM[k] + sumMS[k]);
  }
  return { trans, inscat };
}

export function sunTransmitJS(atm, R, sunDir, p) {
  const b = -(p[0] * sunDir[0] + p[1] * sunDir[1] + p[2] * sunDir[2]);
  let soft = 1;
  if (b > 0) {
    const q = [p[0] + sunDir[0] * b, p[1] + sunDir[1] * b, p[2] + sunDir[2] * b];
    const per = Math.hypot(...q) - R;
    const a = -R * 0.002, bb = R * 0.006;
    const t = Math.min(Math.max((per - a) / (bb - a), 0), 1);
    soft = t * t * (3 - 2 * t);
  }
  if (!atm) return [soft, soft, soft];
  if (soft <= 0) return [0, 0, 0];
  const T = chapTransmit(atm, R, p, sunDir);
  return [soft * T[0], soft * T[1], soft * T[2]];
}

// hemispheric sky irradiance at a surface point: a few directional samples of the
// integral, cosine-weighted — the CPU stand-in for the irradiance LUT (DESIGN.md).
export function skyAmbient(atm, R, sunRad, sunDir, groundPos, ms = null, alb = null) {
  const up = norm(groundPos);
  if (!atm) {
    // airless (round-9 airless-fill row): no scattering sky, but shadowed
    // regolith is NOT pure black — a facet in the shade of the meso relief still
    // sees the SUNLIT surrounding regolith (a bright, ~Lambertian hemisphere).
    // The shader's view-factor bounce keys on the LANDFORM-scale horizon octants,
    // which read ~0 on open ground, so it cannot fill the metre-scale meso-facet
    // shadows — the "black-pepper / leopard-spot carpet" (round-6 defect). This
    // isotropic floor is the proxy for that meso-neighbour fill: it SATURATES
    // once the sun clears the local horizon (grazing sun still has bright
    // neighbours) instead of dying linearly with elevation, and stays 0 through
    // the terminator into true night. ~a few % of the direct sunlit level — the
    // Apollo look (deep but not INK-black shadows). Same value the meter sees.
    const s = up[0] * sunDir[0] + up[1] * sunDir[1] + up[2] * sunDir[2];
    // round 17: the neighbour-fill is REFLECTED regolith light, so it scales
    // with the recipe's surface albedo (recipe datum ambientAlbedo — the 0.02
    // constant was tuned on ~0.11-albedo regolith and is kept EXACTLY when no
    // datum is declared: Luna stays byte-identical; Haumea's 0.8 crystalline
    // ice fills its shadows ~7x brighter, as bright ground actually does)
    const f = (alb == null ? 0.02 : 0.02 * (alb / 0.11)) * Math.min(Math.max(s / 0.06, 0), 1);
    return [sunRad[0] * f, sunRad[1] * f, sunRad[2] * f];
  }
  const t0 = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e0 = norm(cross(t0, up));
  const e1 = cross(up, e0);
  const dirs = [
    [up, 0.5],
    [mix(up, e0, 0.8), 0.125], [mix(up, neg(e0), 0.8), 0.125],
    [mix(up, e1, 0.8), 0.125], [mix(up, neg(e1), 0.8), 0.125],
  ];
  const out = [0, 0, 0];
  for (const [d, w] of dirs) {
    const { inscat } = scatterRayJS(atm, R, sunRad, sunDir, groundPos, norm(d), 1e12, 6, ms);
    for (let k = 0; k < 3; k++) out[k] += inscat[k] * w * Math.PI * 0.5;
  }
  return out;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg = (a) => [-a[0], -a[1], -a[2]];
const mix = (a, b, t) => [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
function norm(a) {
  const il = 1 / Math.hypot(a[0], a[1], a[2]);
  return [a[0] * il, a[1] * il, a[2] * il];
}
