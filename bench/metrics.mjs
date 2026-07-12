// bench/metrics.mjs — ROADMAP_V2 Phase R4 "objective tells", computed on PNG frames.
//   node bench/metrics.mjs <dir-or-file> [...more] [-o out.json]
//
// Per image:
//   spec_slope      radially-averaged luminance power-spectrum slope (log-log fit).
//                   Toy renders are spectrally too clean (slope too steep / too flat
//                   depending on the failure); real scenes sit in a family.
//   spec_aniso      spectral anisotropy: max/min radial power over angular sectors.
//   grad_kurtosis   gradient-histogram excess kurtosis — real terrain is heavy-tailed
//                   (cliffs, shadow edges); noise terrain is near-Gaussian.
//   shadow_frac     fraction of pixels below 10% of the p95 luminance.
//   limb_profile    (disk shots) radial luminance profile in 48 bins of r/R.
//   lum stats       mean + percentiles, for exposure sanity.
//
// These are *relative* instruments: they only mean something against the same
// metric on reference photos pushed through the same decode path (R4 protocol) or
// against a previous run (regression gates). Absolute values are not "scores".

import { readPNG, luminance } from './png.mjs';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

// ---------------- FFT (iterative radix-2, in-place) ----------------
function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

function fft2d(gray, N) { // gray: N*N Float32/64, returns power spectrum N*N
  const re = new Float64Array(N * N), im = new Float64Array(N * N);
  re.set(gray);
  const rr = new Float64Array(N), ri = new Float64Array(N);
  for (let y = 0; y < N; y++) { // rows
    for (let x = 0; x < N; x++) { rr[x] = re[y * N + x]; ri[x] = im[y * N + x]; }
    fft(rr, ri);
    for (let x = 0; x < N; x++) { re[y * N + x] = rr[x]; im[y * N + x] = ri[x]; }
  }
  for (let x = 0; x < N; x++) { // cols
    for (let y = 0; y < N; y++) { rr[y] = re[y * N + x]; ri[y] = im[y * N + x]; }
    fft(rr, ri);
    for (let y = 0; y < N; y++) { re[y * N + x] = rr[y]; im[y * N + x] = ri[y]; }
  }
  const pw = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) pw[i] = re[i] * re[i] + im[i] * im[i];
  return pw;
}

// ---------------- metrics ----------------
export function spectrumMetrics(lum, W, H) {
  const N = Math.min(512, 1 << Math.floor(Math.log2(Math.min(W, H))));
  const x0 = (W - N) >> 1, y0 = (H - N) >> 1;
  const g = new Float64Array(N * N);
  let mean = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) mean += lum[(y0 + y) * W + (x0 + x)];
  mean /= N * N;
  for (let y = 0; y < N; y++) { // Hann window, mean removed
    const wy = 0.5 - 0.5 * Math.cos(2 * Math.PI * y / (N - 1));
    for (let x = 0; x < N; x++) {
      const wx = 0.5 - 0.5 * Math.cos(2 * Math.PI * x / (N - 1));
      g[y * N + x] = (lum[(y0 + y) * W + (x0 + x)] - mean) * wx * wy;
    }
  }
  const pw = fft2d(g, N);
  // radial average (frequencies mapped to [-N/2, N/2))
  const half = N >> 1;
  const rad = new Float64Array(half), cnt = new Float64Array(half);
  const SECT = 8;
  const sect = new Float64Array(SECT), sectCnt = new Float64Array(SECT);
  for (let y = 0; y < N; y++) {
    const fy = y < half ? y : y - N;
    for (let x = 0; x < N; x++) {
      const fx = x < half ? x : x - N;
      const r = Math.sqrt(fx * fx + fy * fy);
      const ri = Math.round(r);
      if (ri >= 1 && ri < half) { rad[ri] += pw[y * N + x]; cnt[ri]++; }
      if (r >= 4 && r < half * 0.7) { // anisotropy over mid frequencies
        const a = ((Math.atan2(fy, fx) + Math.PI) / Math.PI * SECT / 2) | 0;
        const ai = Math.min(a % SECT, SECT - 1);
        sect[ai] += pw[y * N + x]; sectCnt[ai]++;
      }
    }
  }
  // log-log slope fit over k in [4, N/4]
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let k = 4; k <= half / 2; k++) {
    if (!cnt[k] || rad[k] <= 0) continue;
    const lx = Math.log(k), ly = Math.log(rad[k] / cnt[k]);
    sx += lx; sy += ly; sxx += lx * lx; sxy += lx * ly; n++;
  }
  const slope = n > 2 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0;
  let mn = Infinity, mx = 0;
  for (let a = 0; a < SECT; a++) {
    if (!sectCnt[a]) continue;
    const v = sect[a] / sectCnt[a];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { spec_slope: +slope.toFixed(3), spec_aniso: mn > 0 ? +(mx / mn).toFixed(3) : null };
}

export function gradientKurtosis(lum, W, H) {
  let n = 0, mean = 0, m2 = 0, m4 = 0;
  const gs = [];
  for (let y = 1; y < H - 1; y += 1)
    for (let x = 1; x < W - 1; x += 1) {
      const gx = lum[y * W + x + 1] - lum[y * W + x - 1];
      const gy = lum[(y + 1) * W + x] - lum[(y - 1) * W + x];
      gs.push(gx, gy);
    }
  for (const g of gs) { mean += g; n++; }
  mean /= n;
  for (const g of gs) { const d = g - mean; m2 += d * d; m4 += d * d * d * d; }
  m2 /= n; m4 /= n;
  return m2 > 1e-12 ? +(m4 / (m2 * m2) - 3).toFixed(3) : 0;
}

// horizon-convergence acceptance check (round 9, ROADMAP register row 265): at
// the terrain->sky horizon of a grazing eye-level frame, the distant terrain
// radiance should MEET the sky radiance (aerial perspective in-scatter fills the
// long chord). A big luminance JUMP across that boundary is the registered
// "distant terrain fails to converge — bright warm rim under a darker sky". This
// proxy scans each column for the sky->ground transition (sky = the smooth top
// band) and reports the mean |luminance step| across it, in the middle 80% of
// columns (edges excluded). Lower = converged; it instruments the MS second
// installment's target across future rounds. Meaningful only for grazing land
// frames — ~0 / null on disk shots and full-sky frames.
export function horizonGap(lum, W, H) {
  const col = [];
  for (let x = (W * 0.1) | 0; x < W * 0.9; x += 2) {
    // sky reference = median luminance of the top 12% of this column
    const topN = Math.max(4, (H * 0.12) | 0);
    const top = [];
    for (let y = 0; y < topN; y++) top.push(lum[y * W + x]);
    top.sort((a, b) => a - b);
    const skyL = top[top.length >> 1];
    // walk down; the horizon is the first row that departs from the sky band by
    // more than a margin and STAYS departed (a real ground edge, not a star/cloud)
    const margin = 0.06 + 0.5 * skyL;
    for (let y = topN; y < H - 3; y++) {
      const a = lum[y * W + x], b = lum[(y + 1) * W + x], c = lum[(y + 2) * W + x];
      if (Math.abs(a - skyL) > margin && Math.abs(b - skyL) > margin && Math.abs(c - skyL) > margin) {
        col.push(Math.abs(lum[y * W + x] - lum[(y - 1) * W + x])); // step across the boundary
        break;
      }
    }
  }
  if (col.length < W * 0.2) return null; // no consistent horizon (disk / full-sky)
  col.sort((a, b) => a - b);
  return +col[col.length >> 1].toFixed(4); // median column step
}

export function lumStats(lum) {
  const s = Float32Array.from(lum).sort();
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  let mean = 0;
  for (const v of lum) mean += v;
  mean /= lum.length;
  const p95 = q(0.95);
  let shadow = 0;
  for (const v of lum) if (v < 0.1 * p95) shadow++;
  return {
    lum_mean: +mean.toFixed(4),
    lum_p05: +q(0.05).toFixed(4), lum_p50: +q(0.5).toFixed(4), lum_p95: +p95.toFixed(4),
    shadow_frac: +(shadow / lum.length).toFixed(4),
  };
}

// disk shots: radial luminance profile about the brightness centroid
export function limbProfile(lum, W, H) {
  let sw = 0, sx = 0, sy = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = lum[y * W + x];
      sw += v; sx += v * x; sy += v * y;
    }
  if (sw <= 0) return null;
  const cx = sx / sw, cy = sy / sw;
  // disk radius: luminance threshold at 8% of p95
  const s = Float32Array.from(lum).sort();
  const thr = 0.08 * s[Math.floor(0.95 * s.length)];
  let rMax = 0;
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2)
      if (lum[y * W + x] > thr) {
        const r = Math.hypot(x - cx, y - cy);
        if (r > rMax) rMax = r;
      }
  if (rMax < 20) return null;
  const BINS = 48;
  const prof = new Float64Array(BINS), cnt = new Float64Array(BINS);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - cx, y - cy) / rMax;
      if (r >= 1) continue;
      const b = Math.min(BINS - 1, (r * BINS) | 0);
      prof[b] += lum[y * W + x]; cnt[b]++;
    }
  const out = [];
  for (let b = 0; b < BINS; b++) out.push(cnt[b] ? +(prof[b] / cnt[b]).toFixed(5) : null);
  return { r_px: +rMax.toFixed(1), profile: out };
}

export function metricsFor(path, tags = {}) {
  const { lum, W, H } = luminance(readPNG(path));
  const m = {
    file: basename(path), w: W, h: H,
    ...spectrumMetrics(lum, W, H),
    grad_kurtosis: gradientKurtosis(lum, W, H),
    ...lumStats(lum),
  };
  if (!tags.disk) { const hg = horizonGap(lum, W, H); if (hg != null) m.horizon_gap = hg; }
  // round 17: limb is its own tag (defaulting to disk) — a figure-body disk
  // scene (noLimb) skips the circular-limb profile WITHOUT falling back to
  // the ground-scene horizonGap above
  if (tags.limb ?? tags.disk) m.limb = limbProfile(lum, W, H);
  return m;
}

// ---------------- CLI ----------------
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  const oi = args.indexOf('-o');
  const out = oi >= 0 ? args.splice(oi, 2)[1] : null;
  const files = [];
  for (const a of args.length ? args : ['bench/out/stills']) {
    const p = resolve(a);
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p)) if (f.endsWith('.png')) files.push(resolve(p, f));
    } else files.push(p);
  }
  const results = files.map((f) => {
    const m = metricsFor(f, { disk: /disk|marble|hemisphere|moon-sizes|terminator-split|crescent/.test(f) });
    console.log(`${m.file}: slope ${m.spec_slope} aniso ${m.spec_aniso} kurt ${m.grad_kurtosis} shadow ${m.shadow_frac} mean ${m.lum_mean}`);
    return m;
  });
  if (out) { writeFileSync(out, JSON.stringify(results, null, 1)); console.log('wrote', out); }
}
