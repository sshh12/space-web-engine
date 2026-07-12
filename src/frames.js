// frames.js — CONCEPT §9: a position is meaningless without its frame. Star-centric
// inertial root; each body a rotating body-fixed frame. Everything is closed-form in
// time (circular Kepler + spin = axis/rate/epoch): no integrator, no accumulated dt.
// All math in JS doubles; float32 only ever sees frame-local, camera-relative values.

import { SYSTEM, bodyById, irradianceAt, AU } from './recipe.js';
// round 17: a figure body's apparent size uses its flux-true mean projected
// radius (bodyEffR ≡ body.R for every legacy body — the sphere fallback)
import { bodyEffR } from './figure.js';

const TAU = Math.PI * 2;

// body center in inertial frame (star at origin), t in seconds
export function bodyCenterInertial(body, t, out = [0, 0, 0]) {
  const th = TAU * (t / (body.orbit.periodDays * 86400)) + body.orbit.phase0;
  const x = body.orbit.a * Math.cos(th), z = body.orbit.a * Math.sin(th);
  if (body.parent === 'star') { out[0] = x; out[1] = 0; out[2] = z; return out; }
  const p = bodyCenterInertial(bodyById(body.parent), t);
  out[0] = p[0] + x; out[1] = p[1]; out[2] = p[2] + z;
  return out;
}

// rotation matrices as row-major 3x3 arrays acting on column vectors
function mulMV(m, v, out = [0, 0, 0]) {
  const x = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
  const y = m[3] * v[0] + m[4] * v[1] + m[5] * v[2];
  const z = m[6] * v[0] + m[7] * v[1] + m[8] * v[2];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}
export function mulMM(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
const rotY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
export const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

// body-fixed -> inertial rotation at time t (tilt about inertial X, then spin about body Y)
export function bodyToInertial(body, t) {
  const spin = TAU * (t / (body.spin.periodH * 3600)) + body.spin.phase0;
  return mulMM(rotX((body.spin.tiltDeg * Math.PI) / 180), rotY(spin));
}

// everything a renderer of `body` needs for one frame, in the body-fixed frame
export function ephemeris(body, t) {
  const center = bodyCenterInertial(body, t);
  const b2i = bodyToInertial(body, t);
  const i2b = transpose(b2i);
  // sun direction: from body toward star (star at inertial origin)
  const sunDirI = [-center[0], -center[1], -center[2]];
  const dSun = Math.hypot(sunDirI[0], sunDirI[1], sunDirI[2]);
  sunDirI[0] /= dSun; sunDirI[1] /= dSun; sunDirI[2] /= dSun;
  const sunDirBF = mulMV(i2b, sunDirI);
  // other bodies as seen from this one (CONCEPT §11: discs/points in the same sky)
  const others = [];
  for (const ob of SYSTEM.bodies) {
    if (ob.id === body.id) continue;
    // round 18: standalone surface-deliverable bodies (europa/pluto) never appear
    // in ANOTHER body's sky — they are arbitrary heliocentric stand-ins, and
    // letting them into `others` changed legacy figure bodies' top-4 companion
    // slice (post-impl R18-LEGACY-1: europa/pluto cracked Haumea's top-4, breaking
    // its byte-identity). Skipping them keeps every legacy/other sky untouched.
    if (ob.skyHidden) continue;
    const oc = bodyCenterInertial(ob, t);
    const rel = [oc[0] - center[0], oc[1] - center[1], oc[2] - center[2]];
    const d = Math.hypot(rel[0], rel[1], rel[2]);
    const dirBF = mulMV(i2b, [rel[0] / d, rel[1] / d, rel[2] / d]);
    // phase: sun direction at the other body, expressed in *our* body frame
    const sunAtOtherI = [-oc[0], -oc[1], -oc[2]];
    const ds = Math.hypot(...sunAtOtherI);
    const sunAtOtherBF = mulMV(i2b, [sunAtOtherI[0] / ds, sunAtOtherI[1] / ds, sunAtOtherI[2] / ds]);
    others.push({
      body: ob, dirBF, dist: d,
      angRadius: Math.atan(bodyEffR(ob) / d),
      sunDirBF: sunAtOtherBF,
      irradiance: irradianceAt(Math.hypot(...oc) || AU),
    });
  }
  return {
    t, center, b2i, i2b, sunDirBF,
    sunAngRadius: Math.atan(SYSTEM.star.radius / dSun),
    irradiance: irradianceAt(dSun),
    others,
  };
}
