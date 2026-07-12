// atmolut.js — Phase 1 "multiple scattering done right" (ROADMAP_V2). Demolishes
// the 1.55x Rayleigh fudge and the ambient-coupled MS proxy (the olive-twilight
// defect) in favor of:
//   (a) closed-form Chapman transmittance — the optical depth of an exponential
//       atmosphere along any ray, no marching (Schueler's approximation). The
//       GLSL twin lives in shaders.js COMMON; keep them identical.
//   (b) a per-body multiple-scattering table Psi(h, mu_s), Hillaire-style
//       (EGSR 2020): 2nd-order gather with uniform phase + the isotropic
//       infinite-series factor 1/(1-f_ms), plus the ground-albedo bounce.
// Both are deterministic pure functions of the recipe: two machines bake
// identical tables — [sky] discipline holds.

export const MS_N = 24;          // LUT edge (shaders.js MSLUT_S/B must match)
export const MS_MU0 = -0.4;      // mu_s domain: [-0.4, 1.0] (below -0.4 is night)

// optical depth in meters of datum-density path, for scale height H, from radius
// r along a ray with cos(zenith angle) = cosChi. exp overflow guarded (h_t clamp).
export function chapmanOD(H, R, r, cosChi) {
  const X = R / H;
  const h = Math.max(r - R, 0) / H;
  const c = Math.sqrt(1.5707963 * (X + h));
  const up = (c / ((c - 1) * Math.abs(cosChi) + 1)) * Math.exp(-h);
  if (cosChi >= 0) return H * up;
  const sinChi = Math.sqrt(Math.max(1 - cosChi * cosChi, 0));
  const xt = (X + h) * sinChi;                  // tangent radius, scale heights
  const ht = Math.max(xt - X, -30);             // tangent height (clamped: opaque)
  const c0 = Math.sqrt(1.5707963 * Math.max(xt, 1e-3));
  return H * (2 * Math.exp(-ht) * c0 - up);
}

// slant-path multiplier for the ozone tent shell (GLSL twin: shaders.js ozoneSec)
export function ozoneSecJS(atm, R, r, cosChi) {
  const oz = atm.ozone;
  if (!oz) return 0;
  const Rs = R + oz.center;
  const st = r * Math.sqrt(Math.max(1 - cosChi * cosChi, 0));
  if (r >= Rs && (cosChi >= 0 || st >= Rs)) return 0;
  const sec = Math.min(Rs / Math.sqrt(Math.max(Rs * Rs - st * st, 1)), 30);
  return (r < Rs ? 1 : 2) * sec;
}

// transmittance toward the sun from point p (planet-centered), Chapman OD.
// Solid-body limb handled by the caller (the soft factor) — here h_t << 0 just
// makes the column opaque, which is the same answer.
export function chapTransmit(atm, R, p, sunDir) {
  const r = Math.hypot(p[0], p[1], p[2]);
  const cosChi = (p[0] * sunDir[0] + p[1] * sunDir[1] + p[2] * sunDir[2]) / r;
  const odR = chapmanOD(atm.Hr, R, r, cosChi);
  const odM = chapmanOD(atm.Hm, R, r, cosChi);
  const bA = atm.betaA ?? [0, 0, 0];
  const bO = atm.ozone?.beta ?? [0, 0, 0];
  const odO = atm.ozone ? atm.ozone.width * ozoneSecJS(atm, R, r, cosChi) : 0;
  return [0, 1, 2].map((k) =>
    Math.exp(-Math.min(atm.betaR[k] * odR + (atm.betaM[k] + bA[k]) * odM + bO[k] * odO, 80)));
}

function raySphere(ro, rd, r) {
  const b = ro[0] * rd[0] + ro[1] * rd[1] + ro[2] * rd[2];
  const c = ro[0] ** 2 + ro[1] ** 2 + ro[2] ** 2 - r * r;
  const d = b * b - c;
  if (d < 0) return [1e18, -1e18];
  const s = Math.sqrt(d);
  return [-b - s, -b + s];
}

// Psi(h, mu_s): >=2nd-order scattered radiance per unit sun irradiance, isotropic.
// Grid matches the GLSL lookup: u = (mu_s - MS_MU0)/1.4, v = sqrt(h/top).
export function buildMsLUT(body, dirsN = 14, steps = 10) {
  const N = MS_N;
  const data = new Float32Array(N * N * 4);
  const atm = body.atmosphere;
  if (!atm) return data;
  const R = body.R, top = atm.top;
  const bA = atm.betaA ?? [0, 0, 0];
  // ground albedo for the bounce term: the SURFACE, not discAlbedo (which
  // includes the atmosphere's own brightness — using it double-counts the sky
  // and turns the whole disc milky). Ocean worlds: mostly dark sea.
  const pal = body.palette ?? {};
  const dust = pal.dust ?? [0.2, 0.2, 0.2];
  const sea = body.seaLevel != null ? (pal.oceanDeep ?? [0.01, 0.02, 0.04]) : null;
  const alb = sea ? dust.map((d, k) => 0.35 * d + 0.65 * (sea[k] + 0.02)) : dust;
  // Fibonacci sphere directions (deterministic)
  const dirs = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < dirsN; i++) {
    const y = 1 - (2 * (i + 0.5)) / dirsN;
    const rr = Math.sqrt(Math.max(1 - y * y, 0));
    dirs.push([Math.cos(ga * i) * rr, y, Math.sin(ga * i) * rr]);
  }
  const inv4pi = 1 / (4 * Math.PI);
  for (let j = 0; j < N; j++) {
    const h = ((j / (N - 1)) ** 2) * top;
    const p = [0, R + h, 0];
    for (let i = 0; i < N; i++) {
      const mus = MS_MU0 + 1.4 * (i / (N - 1));
      const sun = [Math.sqrt(Math.max(1 - mus * mus, 0)), mus, 0];
      // L1sum = sum over dirs of the 1st-order radiance arriving along each dir
      // (path in-scatter with the uniform 1/4pi gather phase + sunlit-ground
      // radiance); fSum = sum over dirs of the re-scattered fraction integral.
      const L1sum = [0, 0, 0];
      let fSum = 0;
      for (const d of dirs) {
        const tg = raySphere(p, d, R);
        const hitG = tg[0] > 1e-3;
        const tEnd = hitG ? tg[0] : Math.max(raySphere(p, d, R + top)[1], 0);
        if (tEnd <= 0) continue;
        const ds = tEnd / steps;
        let odR = 0, odM = 0, odO = 0;
        const bO = atm.ozone?.beta ?? [0, 0, 0];
        const Tv = [1, 1, 1];
        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) * ds;
          const q = [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
          const hq = Math.max(Math.hypot(q[0], q[1], q[2]) - R, 0);
          const dR = Math.exp(-hq / atm.Hr) * ds, dM = Math.exp(-hq / atm.Hm) * ds;
          odR += dR; odM += dM;
          if (atm.ozone) odO += Math.max(0, 1 - Math.abs(hq - atm.ozone.center) / atm.ozone.width) * ds;
          const Ts = chapTransmit(atm, R, q, sun);
          // solid-body shadow on the sun path comes free: Chapman treats
          // below-datum air as opaque, so grazing columns already vanish
          for (let k = 0; k < 3; k++) {
            Tv[k] = Math.exp(-(atm.betaR[k] * odR + (atm.betaM[k] + bA[k]) * odM + bO[k] * odO));
            L1sum[k] += Tv[k] * (atm.betaR[k] * dR + atm.betaM[k] * dM) * inv4pi * Ts[k];
          }
          fSum += Tv[1] * (atm.betaR[1] * dR + atm.betaM[1] * dM);
        }
        if (hitG) {
          // sunlit ground reflects into the bath (Hillaire's ground term)
          const g = [p[0] + d[0] * tEnd, p[1] + d[1] * tEnd, p[2] + d[2] * tEnd];
          const gl = Math.hypot(g[0], g[1], g[2]);
          const mu0 = Math.max((g[0] * sun[0] + g[1] * sun[1] + g[2] * sun[2]) / gl, 0);
          if (mu0 > 0) {
            const Tsg = chapTransmit(atm, R, g, sun);
            for (let k = 0; k < 3; k++) L1sum[k] += Tv[k] * (alb[k] / Math.PI) * mu0 * Tsg[k];
          }
        }
      }
      const f = Math.min(fSum / dirsN, 0.85);
      const idx = (j * N + i) * 4;
      for (let k = 0; k < 3; k++) data[idx + k] = (L1sum[k] / dirsN) / (1 - f);
      data[idx + 3] = 1;
    }
  }
  return data;
}

// copper-eclipse annulus tint for a body used as a sun occluder (round 9: the
// honest refracted-annulus integral, replacing the flat 0.01 calibration).
// During totality no straight ray reaches the umbra — the copper ring IS the
// Sun's light REFRACTED into the shadow by the occluder's atmosphere. Integrate
// over impact heights h above the limb: a grazing ray bends by δ(h) ∝ the local
// density ρ(h)=exp(-h/H) (the standard atmospheric-refraction grazing law, the
// bend proportional to refractivity × density) and survives with the tangent-
// chord transmittance T(h) — blue is extinguished over the long limb path, so
// the ring reddens to copper. The ring radiance ∝ ∫ δ(h)·T(h) dh; its AMPLITUDE
// now scales with the recipe refractivity (Earth's dense air -> a bright copper
// ring; Mars's thin CO2 -> almost none), physics rather than a hand-set number.
// The one remaining constant is the geometric dilution (the refracting annulus
// spreads its flux across the umbra disc) — annulusTint has no occluder distance,
// so that factor stays a documented calibration, tuned to a real totality frame.
export function annulusTint(body) {
  const atm = body.atmosphere;
  if (!atm) return [0, 0, 0];
  const R = body.R, refr = atm.refrac ?? 0;
  if (refr <= 0) return [0, 0, 0];
  const bA = atm.betaA ?? [0, 0, 0];
  const H = atm.Hr, N = 48, hMax = 8 * H;
  const num = [0, 0, 0];
  let dsum = 0;
  for (let i = 0; i < N; i++) {
    const h = ((i + 0.5) / N) * hMax, dh = hMax / N;
    const delta = Math.exp(-h / H);              // bending weight ∝ density
    const odR = chapmanOD(atm.Hr, R, R + h, 0);  // tangent-chord (cosChi = 0)
    const odM = chapmanOD(atm.Hm, R, R + h, 0);
    const odO = atm.ozone ? atm.ozone.width * ozoneSecJS(atm, R, R + h, 0) : 0;
    const bO = atm.ozone?.beta ?? [0, 0, 0];
    for (let k = 0; k < 3; k++)
      num[k] += delta * dh * Math.exp(-Math.min(atm.betaR[k] * odR + (atm.betaM[k] + bA[k]) * odM + bO[k] * odO, 80));
    dsum += delta * dh;
  }
  // num/dsum = the δ-weighted mean transmittance (the copper SPECTRUM); amp is
  // the geometric dilution × refractivity (Earth 2.9e-4 -> ~0.0044; Mars 9e-6 ->
  // ~1.4e-4, a ring you cannot see — as observed). Tuned DOWN from the first
  // pass (round-9 panel: the ring blazed as a "ring of fire"; a real totality is
  // a DIM copper glow, so the annulus sits well below the star-field exposure).
  const amp = 15.0 * refr;
  return num.map((v) => (amp * v) / Math.max(dsum, 1e-9));
}
