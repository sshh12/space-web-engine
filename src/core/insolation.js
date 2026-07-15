// Orbit-averaged, latitude-resolved insolation for baked climate context.
// Fixed quadrature keeps this a deterministic pure function of recipe data.

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

function solveKepler(M, e) {
  let E = M + Math.sign(Math.sin(M)) * 0.85 * e;
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

export function orbitPole(orbit) {
  const i = (orbit?.iDeg ?? 0) * DEG;
  const O = (orbit?.OmegaDeg ?? 0) * DEG;
  return [Math.sin(O) * Math.sin(i), -Math.cos(i), -Math.cos(O) * Math.sin(i)];
}

export function spinPole(spin) {
  if (spin?.poleLatDeg == null) {
    const tilt = (spin?.tiltDeg ?? 0) * DEG;
    return [0, -Math.cos(tilt), -Math.sin(tilt)];
  }
  const lon = spin.poleLonDeg * DEG, lat = spin.poleLatDeg * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
}

export function obliquityRad(body) {
  const a = orbitPole(body.orbit), b = spinPole(body.spin);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot);
}

// Mean daily top-of-atmosphere flux at one latitude, normalized so a zero-e,
// zero-obliquity world's global area mean at referenceA is 1.
export function annualMeanInsolation(latitudeRad, orbit, obliquity, referenceA, samples = 48) {
  const a = orbit?.a;
  if (!(a > 0) || !(referenceA > 0)) return 1;
  const e = orbit.e ?? 0;
  let sum = 0;
  for (let k = 0; k < samples; k++) {
    const M = -Math.PI + TAU * (k + 0.5) / samples;
    const E = solveKepler(M, e);
    const nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
    const lambda = nu + (orbit.omegaDeg ?? 0) * DEG;
    const dec = Math.asin(Math.sin(obliquity) * Math.sin(lambda));
    const x = -Math.tan(latitudeRad) * Math.tan(dec);
    const H = x <= -1 ? Math.PI : x >= 1 ? 0 : Math.acos(x);
    const daily = (H * Math.sin(latitudeRad) * Math.sin(dec)
      + Math.cos(latitudeRad) * Math.cos(dec) * Math.sin(H)) / Math.PI;
    const rOverA = 1 - e * Math.cos(E);
    sum += Math.max(0, daily) * (referenceA / a) ** 2 / (rOverA * rOverA);
  }
  return 4 * sum / samples;
}

export function makeInsolationContext(body, process, bins = 181) {
  const cfg = process.insolation;
  if (!cfg || !(body.orbit?.a > 0)) return null;
  const referenceA = cfg.referenceA ?? body.orbit.a;
  const referenceObliquity = (cfg.referenceObliquityDeg ?? (obliquityRad(body) / DEG)) * DEG;
  const actualObliquity = obliquityRad(body);
  const values = new Float64Array(bins), reference = new Float64Array(bins);
  const circular = { ...body.orbit, a: referenceA, e: 0 };
  for (let i = 0; i < bins; i++) {
    const lat = -Math.PI / 2 + Math.PI * i / (bins - 1);
    values[i] = annualMeanInsolation(lat, body.orbit, actualObliquity, referenceA);
    reference[i] = annualMeanInsolation(lat, circular, referenceObliquity, referenceA);
  }
  return { values, reference, orbitResponseC: cfg.orbitResponseC ?? 55, latitudeResponseC: cfg.latitudeResponseC ?? 5 };
}

export function insolationTemperatureOffset(context, latitudeRad) {
  if (!context) return 0;
  const n = context.values.length;
  const x = Math.max(0, Math.min(n - 1, (latitudeRad / Math.PI + 0.5) * (n - 1)));
  const i = Math.min(n - 2, Math.floor(x)), f = x - i;
  const q = context.values[i] * (1 - f) + context.values[i + 1] * f;
  const qr = context.reference[i] * (1 - f) + context.reference[i + 1] * f;
  const orbit = context.orbitResponseC * (Math.pow(Math.max(q, 1e-9), 0.25) - Math.pow(Math.max(qr, 1e-9), 0.25));
  const latitude = context.latitudeResponseC * (q - qr);
  return orbit + latitude;
}
