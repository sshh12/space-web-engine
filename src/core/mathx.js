// mathx.js — deterministic math shared by the baker (worker + Node tests) and the
// main thread. No three.js, no Date, no Math.random: every function here is a pure
// function of its arguments so bakes are identical on any machine (CONCEPT §2, §9).

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// cube-sphere: six faces, uv in [0,1] per face (values outside [0,1] are the
// gnomonic extension used for halo cells of edge tiles — still valid sphere
// points, so position stamps stay pure across face boundaries).
// ---------------------------------------------------------------------------
export const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

// face uv -> unit direction (body-fixed). out is [x,y,z]; returns out.
export function faceUvToDir(face, u, v, out = [0, 0, 0]) {
  const f = FACES[face];
  const a = 2 * u - 1, b = 2 * v - 1;
  const x = f.n[0] + a * f.u[0] + b * f.v[0];
  const y = f.n[1] + a * f.u[1] + b * f.v[1];
  const z = f.n[2] + a * f.u[2] + b * f.v[2];
  const il = 1 / Math.sqrt(x * x + y * y + z * z);
  out[0] = x * il; out[1] = y * il; out[2] = z * il;
  return out;
}

// unit direction -> {face, u, v} with u,v in [0,1].
export function dirToFaceUv(d) {
  const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]);
  let face;
  if (ax >= ay && ax >= az) face = d[0] >= 0 ? 0 : 1;
  else if (ay >= ax && ay >= az) face = d[1] >= 0 ? 2 : 3;
  else face = d[2] >= 0 ? 4 : 5;
  const f = FACES[face];
  const k = 1 / (d[0] * f.n[0] + d[1] * f.n[1] + d[2] * f.n[2]);
  const px = d[0] * k, py = d[1] * k, pz = d[2] * k;
  const a = px * f.u[0] + py * f.u[1] + pz * f.u[2];
  const b = px * f.v[0] + py * f.v[1] + pz * f.v[2];
  return { face, u: (a + 1) * 0.5, v: (b + 1) * 0.5 };
}

// fade mask -> 0 at cube-face edges, 1 in face interiors. Pure function of the
// body-fixed direction, so both faces at a shared edge agree exactly; used to
// attenuate grid-stateful ops (erosion, AO) whose grids don't align across faces.
export function edgeMask(d, width = 0.06) {
  const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]);
  const s = Math.max(ax, Math.max(ay, az));
  // second largest / largest: 1 exactly on an edge, 0 at face center
  let m2 = -Infinity;
  for (const c of [ax, ay, az]) if (c !== s && c > m2) m2 = c;
  if (m2 === -Infinity) m2 = s; // degenerate (two equal maxima on the edge)
  const t = m2 / s; // in [0,1], 1 at edge
  return smoothstep(1, 1 - width, t);
}

// ---------------------------------------------------------------------------
// deterministic hashing / noise (integer avalanche; imul keeps it 32-bit exact)
// ---------------------------------------------------------------------------
export function hashi(x, y, z, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^
    Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export const rand01 = (x, y, z, s) => hashi(x, y, z, s) * (1 / 4294967296);

const quintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// 3D value noise in [-1, 1], lattice keyed on floor(p) and seed.
export function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = quintic(x - xi), fy = quintic(y - yi), fz = quintic(z - zi);
  const c000 = rand01(xi, yi, zi, seed), c100 = rand01(xi + 1, yi, zi, seed);
  const c010 = rand01(xi, yi + 1, zi, seed), c110 = rand01(xi + 1, yi + 1, zi, seed);
  const c001 = rand01(xi, yi, zi + 1, seed), c101 = rand01(xi + 1, yi, zi + 1, seed);
  const c011 = rand01(xi, yi + 1, zi + 1, seed), c111 = rand01(xi + 1, yi + 1, zi + 1, seed);
  const x00 = lerp(c000, c100, fx), x10 = lerp(c010, c110, fx);
  const x01 = lerp(c001, c101, fx), x11 = lerp(c011, c111, fx);
  return 2 * lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz) - 1;
}

// JS twin of the shaders' periodic detail noise (COMMON vhash/vnoise): same
// integer-avalanche hash (hashi IS vhash), same quintic, same power-of-two
// lattice wrap — so CPU-displaced geometry (ground plan L2) and shader-derived
// looks (dust fill, crevice albedo) read ONE micro-relief function, bit-exact
// across tile edges. period must be a power of two; scales must keep the 4096 m
// detail-domain snap an exact integer multiple of the lattice.
export function vnoise3(x, y, z, period, seed) {
  const M = (period - 1) | 0;
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = quintic(x - xi), fy = quintic(y - yi), fz = quintic(z - zi);
  const c000 = rand01(xi & M, yi & M, zi & M, seed), c100 = rand01((xi + 1) & M, yi & M, zi & M, seed);
  const c010 = rand01(xi & M, (yi + 1) & M, zi & M, seed), c110 = rand01((xi + 1) & M, (yi + 1) & M, zi & M, seed);
  const c001 = rand01(xi & M, yi & M, (zi + 1) & M, seed), c101 = rand01((xi + 1) & M, yi & M, (zi + 1) & M, seed);
  const c011 = rand01(xi & M, (yi + 1) & M, (zi + 1) & M, seed), c111 = rand01((xi + 1) & M, (yi + 1) & M, (zi + 1) & M, seed);
  const x00 = lerp(c000, c100, fx), x10 = lerp(c010, c110, fx);
  const x01 = lerp(c001, c101, fx), x11 = lerp(c011, c111, fx);
  return 2 * lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz) - 1;
}

// fBm of noise3; rotates lattice between octaves via seed increment.
export function fbm3(x, y, z, seed, octaves, lacunarity = 2.02, gain = 0.5) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * noise3(x * f + i * 17.17, y * f - i * 9.3, z * f + i * 3.7, seed + i);
    norm += a;
    a *= gain; f *= lacunarity;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// interpolation kernels (must be the same everywhere — CONCEPT §2)
// ---------------------------------------------------------------------------
// catmull-rom of 4 samples at fractional t in [0,1] between p1 and p2.
export function catmullRom(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

// small vector helpers on [x,y,z] arrays (doubles)
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vlen = (a) => Math.sqrt(vdot(a, a));
export function vnorm(a, out = [0, 0, 0]) {
  const il = 1 / vlen(a);
  out[0] = a[0] * il; out[1] = a[1] * il; out[2] = a[2] * il;
  return out;
}
export function vcross(a, b, out = [0, 0, 0]) {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

export const latOf = (d) => Math.asin(clamp(d[1], -1, 1)); // spin axis = +Y

// ---------------------------------------------------------------------------
// IEEE 754 half-float codec — the 16-bit field atlas's packing (worker) and
// JS-side sampling (scattercore). Round-to-nearest on encode; no infinities
// out (clamps to max finite: a field value must never become a GLSL inf).
// ---------------------------------------------------------------------------
const _f2h = new Float32Array(1), _f2hI = new Uint32Array(_f2h.buffer);
export function floatToHalf(v) {
  _f2h[0] = v;
  const x = _f2hI[0];
  const sign = (x >>> 16) & 0x8000;
  let exp = (x >>> 23) & 0xff;
  const man = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7bff;          // inf/nan -> max finite
  exp = exp - 127 + 15;
  if (exp >= 31) return sign | 0x7bff;             // overflow -> max finite
  if (exp <= 0) {
    if (exp < -10) return sign;                    // underflow -> signed zero
    return sign | (((man | 0x800000) >> (1 - exp)) + 0x1000) >> 13;
  }
  return sign | ((exp << 10) + ((man + 0x1000) >> 13)); // carry may bump exp: correct
}
export function halfToFloat(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h & 0x7c00) >> 10, m = h & 0x3ff;
  if (e === 0) return s * 5.9604644775390625e-8 * m;   // 2^-24 * m
  if (e === 31) return s * (m ? NaN : Infinity);
  return s * Math.pow(2, e - 25) * (1024 + m);
}
