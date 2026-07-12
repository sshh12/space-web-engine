// figure.js — CONCEPT §11: "the recipe declares the reference shape the rasters
// displace; the sphere is merely the common case." Pure deterministic math shared
// by the baker (worker + Node tests) and the main thread — mathx.js discipline:
// no three.js, no Date, no Math.random; every function is a pure function of its
// arguments so figure bodies bake identically on any machine and any tile.
//
// The one law (round 17):
//   q(d̂)  = the UNIQUE S=0 crossing along the body-fixed ray d̂  (star-shaped
//           by construction for the recipe families below, and ASSERTED — the
//           panel + a driver experiment proved a far-start 3-D Newton flow
//           tears; the 1-D radial crossing is fold-free wherever the star-shape
//           assert passes, and normalize(q)=d̂ keeps every dir↔cell inversion
//           in the engine a true bijection)
//   m̂(d̂) = ∇S(q)/|∇S(q)|      (rasters displace along the SDF gradient)
//   p     = q + (h + meso)·m̂   (the raster displacement law)
//   up(p) = ∇S(p)/|∇S|,  alt(p) = S(p)   (the gravity level set, everywhere)
//
// S is a FIRST-ORDER TRUE distance (F/|∇F|, so |∇S|≈1 near the surface — the
// panel proved the naive (1−1/k)|p| level value carries |∇S| up to 1.36 at
// Haumea's axis ratio, corrupting altitude and the injectivity march).
//
// Figure classes (recipe data, §6 — the engine implements the families):
//   { type:'ellipsoid', axes:[a,b,c] }                       — oblate/triaxial
//   { type:'lobes', lobes:[{c:[x,y,z], axes:[a,b,c]},x2], neckK } — contact binary
// No figure datum ⇒ sphere of radius body.R ⇒ none of this module runs (legacy
// bodies keep their exact code paths — the byte-identity gate).

const hyp3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// ---------------------------------------------------------------------------
// normalization: recipe figure -> internal fig object (precomputed bounds)
// ---------------------------------------------------------------------------
const _figCache = new WeakMap(); // per-frame callers (frames.js) — build once
export function figOf(body) {
  const f = body.figure;
  if (!f) return null;
  const hit = _figCache.get(body);
  if (hit) return hit;
  let fig;
  if (f.type === 'ellipsoid') {
    const [a, b, c] = f.axes;
    fig = {
      mode: 1, axes: f.axes,
      boundR: Math.max(a, b, c),
      minR: Math.min(a, b, c),
      // flux-true mean projected radius (§11 point hand-down): sqrt of the
      // orientation-averaged projected area  ~ sqrt((ab+bc+ca)/3)
      effR: Math.sqrt((a * b + b * c + c * a) / 3),
    };
  } else if (f.type === 'lobes') {
    let boundR = 0, minR = Infinity, area = 0;
    for (const L of f.lobes) {
      const [a, b, c] = L.axes;
      boundR = Math.max(boundR, hyp3(L.c[0], L.c[1], L.c[2]) + Math.max(a, b, c));
      minR = Math.min(minR, a, b, c);
      area += (a * b + b * c + c * a) / 3;
    }
    fig = { mode: 2, lobes: f.lobes, neckK: f.neckK, boundR, minR, effR: Math.sqrt(area) };
  } else {
    throw new Error(`figure: unknown type '${f.type}' (ellipsoid | lobes)`);
  }
  _figCache.set(body, fig);
  return fig;
}
// body-level entry points — the ONLY way consumers read a figure radius, so the
// legacy fallback is uniform (panel: a bare figBoundR(undefined) NaNs frames.js)
export const bodyBoundR = (body) => { const f = figOf(body); return f ? f.boundR : body.R; };
export const bodyEffR = (body) => { const f = figOf(body); return f ? f.effR : body.R; };

// ---------------------------------------------------------------------------
// the level function S (first-order distance) and its gradient
// ---------------------------------------------------------------------------
function ellS(axes, cx, cy, cz, p) {
  const x = p[0] - cx, y = p[1] - cy, z = p[2] - cz;
  const u = x / axes[0], v = y / axes[1], w = z / axes[2];
  const F = u * u + v * v + w * w - 1;
  const gl = 2 * hyp3(x / (axes[0] * axes[0]), y / (axes[1] * axes[1]), z / (axes[2] * axes[2]));
  return F / Math.max(gl, 1e-30);
}
// polynomial smooth-min: bridges the crevice between the lobes with a fillet of
// radius ~neckK (the neck IS this term — recipe data, not engine constant)
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function figS(fig, p) {
  if (fig.mode === 1) return ellS(fig.axes, 0, 0, 0, p);
  const L = fig.lobes;
  let s = ellS(L[0].axes, L[0].c[0], L[0].c[1], L[0].c[2], p);
  for (let i = 1; i < L.length; i++) {
    s = smin(s, ellS(L[i].axes, L[i].c[0], L[i].c[1], L[i].c[2], p), fig.neckK);
  }
  return s;
}
// central-difference gradient with a FIXED absolute step: a pure function of p,
// so vertex normals agree bit-exactly across tiles/faces/halo extensions (§3)
export function figGrad(fig, p, out = [0, 0, 0]) {
  const e = Math.max(fig.minR * 1e-4, 1e-3);
  const pa = [p[0], p[1], p[2]];
  for (let i = 0; i < 3; i++) {
    pa[i] = p[i] + e; const s1 = figS(fig, pa);
    pa[i] = p[i] - e; const s0 = figS(fig, pa);
    pa[i] = p[i];
    out[i] = (s1 - s0) / (2 * e);
  }
  return out;
}
export function figUp(fig, p, out = [0, 0, 0]) {
  figGrad(fig, p, out);
  const il = 1 / Math.max(hyp3(out[0], out[1], out[2]), 1e-30);
  out[0] *= il; out[1] *= il; out[2] *= il;
  return out;
}
// first-order TRUE altitude: S/|∇S|. At a lobes neck the smin gradients of the
// two lobes partially cancel (|∇S| ≈ 0.5 measured on the arrokoth waist), so
// the raw level value reads HALF the true offset — every metric consumer
// (altitude, the injectivity march, epoch scale) must use this, not figS.
const _ga = [0, 0, 0];
export function figAlt(fig, p) {
  const s = figS(fig, p);
  figGrad(fig, p, _ga);
  return s / Math.max(hyp3(_ga[0], _ga[1], _ga[2]), 1e-6);
}

// ---------------------------------------------------------------------------
// the parameterization q(d̂): unique S=0 crossing along the origin ray
// ---------------------------------------------------------------------------
// far crossing of the origin ray t·d̂ with one lobe ellipsoid (0 if it misses)
function rayEllExit(L, d) {
  const dx = d[0] / L.axes[0], dy = d[1] / L.axes[1], dz = d[2] / L.axes[2];
  const cx = L.c[0] / L.axes[0], cy = L.c[1] / L.axes[1], cz = L.c[2] / L.axes[2];
  const A = dx * dx + dy * dy + dz * dz;
  const B = -(dx * cx + dy * cy + dz * cz);
  const C = cx * cx + cy * cy + cz * cz - 1;
  const disc = B * B - A * C;
  if (disc < 0) return 0;
  return Math.max((-B + Math.sqrt(disc)) / A, 0);
}
// radial distance to the figure surface along unit d̂ (the generalized figRadial)
export function figRadial(fig, d) {
  if (fig.mode === 1) {
    const u = d[0] / fig.axes[0], v = d[1] / fig.axes[1], w = d[2] / fig.axes[2];
    return 1 / Math.sqrt(u * u + v * v + w * w);
  }
  // bracket around the star-shaped hull exit (smin only ADDS material within
  // ~neckK of the union, so the crossing sits in [hull-2k, hull+2k])
  let tH = 0;
  for (const L of fig.lobes) tH = Math.max(tH, rayEllExit(L, d));
  if (tH <= 0) tH = fig.minR * 0.5; // gap directions: bridge only (star assert guards)
  const st = (t) => figS(fig, [d[0] * t, d[1] * t, d[2] * t]);
  const step = Math.max(fig.neckK * 0.5, fig.boundR * 0.005);
  let hi = tH, sHi = st(hi);
  for (let g = 0; sHi <= 0 && g < 40; g++) { hi += step; sHi = st(hi); }
  let lo = Math.max(hi - step, 1), sLo = st(lo);
  for (let g = 0; sLo > 0 && g < 80; g++) { lo = Math.max(lo - step, 0); sLo = st(lo); }
  for (let i = 0; i < 40; i++) { // fixed-count bisection: pure fn of d̂ (§3)
    const mid = 0.5 * (lo + hi);
    if (st(mid) > 0) hi = mid; else lo = mid;
  }
  let t = 0.5 * (lo + hi);
  for (let i = 0; i < 2; i++) { // 1-D Newton polish (grazing-ray residual)
    const e = Math.max(fig.minR * 1e-5, 1e-3);
    const ds = (st(t + e) - st(t - e)) / (2 * e);
    if (Math.abs(ds) > 1e-9) t -= st(t) / ds;
  }
  return t;
}
export function figMapDir(fig, d, out = [0, 0, 0]) {
  const t = figRadial(fig, d);
  out[0] = d[0] * t; out[1] = d[1] * t; out[2] = d[2] * t;
  return out;
}
// displacement direction m̂(d̂) = unit ∇S at the base point
export function figNormalDir(fig, d, out = [0, 0, 0]) {
  const q = figMapDir(fig, d);
  return figUp(fig, q, out);
}
// anchor radius for the per-frame LOD walk (visit()) — exact for ellipsoids;
// lobes take the full radial solve too: the union-hull shortcut under-read
// the waist by the whole smin bridge, and the post-impl panel measured 2.5-3
// LOD levels of under-refinement at the neck icon pose — the split metric
// starved exactly the tiles the money shot frames. Small bodies keep the
// bisection cost trivial (~90 S evals x ~hundreds of nodes per frame).
export function figAnchorR(fig, d) {
  return figRadial(fig, d);
}

// ---------------------------------------------------------------------------
// asserts — LOUD, load-time/pre-flight (panel: a worker throw is a silent
// settle-stall; these run on the main thread / in Node before any bake)
// ---------------------------------------------------------------------------
// star-shape: origin comfortably inside, and every direction crosses S=0 once
export function assertStarShaped(fig, name, samples = 2000) {
  const s0 = figS(fig, [0, 0, 0]);
  if (!(s0 < -0.02 * fig.boundR)) {
    throw new Error(`figure(${name}): origin is not inside the body (S(0)=${s0.toFixed(1)} m) — ` +
      `place the lobes so the body-fixed origin sits within the figure (star-shape law)`);
  }
  const R0 = fig.boundR * 1.4;
  for (let i = 0; i < samples; i++) {
    // deterministic spiral cover of S²
    const y = 1 - (2 * i + 1) / samples;
    const r = Math.sqrt(Math.max(1 - y * y, 0)), ph = i * 2.39996322972865332;
    const d = [r * Math.cos(ph), y, r * Math.sin(ph)];
    let n = 0, prev = figS(fig, [d[0] * 2, d[1] * 2, d[2] * 2]);
    const step = Math.max(fig.neckK ? fig.neckK * 0.25 : fig.minR * 0.02, fig.boundR * 0.004);
    for (let t = step; t <= R0; t += step) {
      const s = figS(fig, [d[0] * t, d[1] * t, d[2] * t]);
      if ((s > 0) !== (prev > 0)) n++;
      prev = s;
    }
    if (n !== 1) {
      throw new Error(`figure(${name}): not star-shaped from the origin — the ray toward ` +
        `[${d.map((x) => x.toFixed(3))}] crosses the surface ${n} times (thicken neckK / overlap the lobes)`);
    }
  }
}
// injectivity bound at a base point: min(march bound along ±m̂, curvature bound
// from the normal-turn rate). Panel: the march alone measures |∇S|≈1, not
// injectivity — the curvature term is the one that binds at the concave neck.
export function figInjectivity(fig, d, hStep) {
  const q = figMapDir(fig, d);
  const m = figUp(fig, q);
  // curvature: normal turn per metre along two surface tangents
  const e = hStep;
  let kMax = 0;
  const t1 = Math.abs(m[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a = [m[1] * t1[2] - m[2] * t1[1], m[2] * t1[0] - m[0] * t1[2], m[0] * t1[1] - m[1] * t1[0]];
  const al = 1 / Math.max(hyp3(a[0], a[1], a[2]), 1e-30);
  const ta = [a[0] * al, a[1] * al, a[2] * al];
  const tb = [m[1] * ta[2] - m[2] * ta[1], m[2] * ta[0] - m[0] * ta[2], m[0] * ta[1] - m[1] * ta[0]];
  for (const tv of [ta, tb]) {
    const p1 = [q[0] + tv[0] * e, q[1] + tv[1] * e, q[2] + tv[2] * e];
    const p0 = [q[0] - tv[0] * e, q[1] - tv[1] * e, q[2] - tv[2] * e];
    const m1 = figUp(fig, p1), m0 = figUp(fig, p0);
    const k = hyp3(m1[0] - m0[0], m1[1] - m0[1], m1[2] - m0[2]) / (2 * e);
    if (k > kMax) kMax = k;
  }
  const curvBound = kMax > 1e-12 ? 1 / kMax : Infinity;
  // other-sheet march: the smooth fold is the curvature bound's job; the march
  // catches a DIFFERENT surface sheet sitting closer than the offset. figAlt
  // (S/|∇S|) is first-order true even where the neck compresses the raw level,
  // so |alt| ≪ t is a real second-sheet signature, not a gradient artifact.
  let marchBound = Infinity;
  for (const sgn of [1, -1]) {
    for (let i = 1; i <= 16; i++) {
      const t = (i / 16) * Math.min(curvBound, fig.boundR * 0.5);
      const a2 = figAlt(fig, [q[0] + sgn * t * m[0], q[1] + sgn * t * m[1], q[2] + sgn * t * m[2]]);
      if (Math.abs(a2) < 0.5 * t) { marchBound = Math.min(marchBound, t); break; }
    }
  }
  return Math.min(curvBound, marchBound);
}
// pre-flight: worst-case injectivity over a dense direction sweep vs the
// recipe's relief budget — throws a NAMED error before any worker bake runs
export function figPreflight(fig, name, reliefBudget, samples = 1500) {
  assertStarShaped(fig, name, samples);
  let worst = Infinity, worstD = null;
  for (let i = 0; i < samples; i++) {
    const y = 1 - (2 * i + 1) / samples;
    const r = Math.sqrt(Math.max(1 - y * y, 0)), ph = i * 2.39996322972865332;
    const d = [r * Math.cos(ph), y, r * Math.sin(ph)];
    const b = figInjectivity(fig, d, Math.max(fig.minR * 0.01, 1));
    if (b < worst) { worst = b; worstD = d; }
  }
  if (!(reliefBudget * 2 <= worst)) {
    throw new Error(`figure(${name}): relief budget ${reliefBudget.toFixed(0)} m exceeds half the ` +
      `injectivity bound ${worst.toFixed(0)} m (worst at [${worstD.map((x) => x.toFixed(3))}]) — ` +
      `displaced surfaces would fold at the neck/concavity; reduce process amplitudes or soften the figure`);
  }
  return worst;
}

// The relief budget is DECLARED recipe data (figure.reliefBudget, metres):
// figPreflight asserts budget·2 ≤ the injectivity bound (geometry vs recipe),
// and the test fixture MEASURES baked tile min/max heights against the same
// declaration — the panel proved a per-process amplitude sum is not a
// computable pre-bake quantity (edifice/rift deliberately declare height/depth
// outside 'amp'; crater depth depends on band cell sizes).
