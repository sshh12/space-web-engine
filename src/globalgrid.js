// globalgrid.js — the [global] home (ROADMAP_V2 Phase 2 prerequisite). One
// planet-wide coarse pass for processes whose reach the halo guarantee cannot
// bound: flow accumulation crosses cube faces and has unbounded upstream reach,
// so it runs ONCE on a single grid assembled from all six faces (§4's
// "expensive long-range processes" clause), and every tile at every level
// SAMPLES the result — never re-derives it.
//
// Determinism contract: the grid is a pure function of the recipe's process
// PREFIX (everything before the 'global' entry in the ordered list) at the
// declared coarse level. Later processes may consume it even where they write
// height (incision): routing is defined on the pre-incision surface, exactly
// like real geology — drainage established first, then carved sharper. That
// also breaks the circularity statically: the grid never reads its consumers.
//
// Pipeline: assemble prefix heights -> priority-flood depression fill (outlets
// = cells below sea/drain level) -> D8 steepest descent with metric cross-face
// stitching -> Kahn-order accumulation with gnomonic cell areas -> optional
// moisture: Jacobi upwind advection with orographic rainout along a zonal wind
// prior. All deterministic: stable tie-breaks, no Math.random, no clock.

import { makeBaker, sampleTileHeight, TILE_RES } from './bakecore.js';
import { faceUvToDir, dirToFaceUv, clamp, latOf } from './mathx.js';

const CACHE = new Map();

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// cached entry point used by the baker. Keyed on the prefix CONTENT (not the
// body id): the contract harness bakes '~prefixN' clones whose prefix below
// the global entry is identical — they must share one build.
export function globalFor(body, p) {
  const prefix = prefixOf(body, p);
  const key = djb2(JSON.stringify({ R: body.R, sea: body.seaLevel, prefix, p }));
  let g = CACHE.get(key);
  if (!g) {
    g = buildGlobal(body, p, prefix);
    CACHE.set(key, g);
  }
  return g;
}

// the process prefix the grid is a pure function of: everything before the
// 'global' entry. Matched by identity first, by type as a fallback (tests pass
// copies) — NEVER the full list, or the grid would read its own consumers.
function prefixOf(body, p) {
  let idx = body.processes.indexOf(p);
  if (idx < 0) idx = body.processes.findIndex((q) => q.type === 'global');
  return idx >= 0 ? body.processes.slice(0, idx) : body.processes;
}

// uncached build (tests call this directly to prove fresh-build determinism)
export function buildGlobal(body, p, prefix = null) {
  if (!prefix) prefix = prefixOf(body, p);
  const G = p.level ?? 3;
  const W = TILE_RES << G;          // cells per face side
  const N = W * W, N6 = 6 * N;
  const sea = body.seaLevel ?? p.drainLevel ?? null;

  // ---- assemble prefix heights at cell centers, all six faces ----
  const baker = makeBaker({ ...body, processes: prefix }, { cacheMax: 48 });
  const hgt = new Float32Array(N6);
  const D = 1 << G;
  for (let f = 0; f < 6; f++)
    for (let ty = 0; ty < D; ty++)
      for (let tx = 0; tx < D; tx++) {
        const tile = baker.bakeTile(f, G, tx, ty);
        for (let j = 0; j < TILE_RES; j++)
          for (let i = 0; i < TILE_RES; i++) {
            const gi = tx * TILE_RES + i, gj = ty * TILE_RES + j;
            hgt[f * N + gj * W + gi] =
              sampleTileHeight(tile, (i + 0.5) / TILE_RES, (j + 0.5) / TILE_RES);
          }
      }

  // cell center directions (float32: only used for chord distances/areas)
  const dirs = new Float32Array(N6 * 3);
  {
    const d = [0, 0, 0];
    for (let f = 0; f < 6; f++)
      for (let j = 0; j < W; j++)
        for (let i = 0; i < W; i++) {
          faceUvToDir(f, (i + 0.5) / W, (j + 0.5) / W, d);
          const c = f * N + j * W + i;
          dirs[c * 3] = d[0]; dirs[c * 3 + 1] = d[1]; dirs[c * 3 + 2] = d[2];
        }
  }

  // metric cross-face neighbour: gnomonic uv extension -> true face lookup
  const tmp = [0, 0, 0];
  const nbrId = (f, i, j, di, dj) => {
    const ii = i + di, jj = j + dj;
    if (ii >= 0 && ii < W && jj >= 0 && jj < W) return f * N + jj * W + ii;
    faceUvToDir(f, (ii + 0.5) / W, (jj + 0.5) / W, tmp);
    const q = dirToFaceUv(tmp);
    const ni = Math.min(Math.floor(q.u * W), W - 1);
    const nj = Math.min(Math.floor(q.v * W), W - 1);
    return q.face * N + nj * W + ni;
  };
  const OCT = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  // ---- priority-flood depression fill (outlets seed the min-heap) ----
  // Deterministic: stable (key, id) tie-break. EPS enforces drainage on flats.
  const filled = new Float32Array(hgt);
  const visited = new Uint8Array(N6);
  const heapK = new Float64Array(N6 + 1);
  const heapI = new Int32Array(N6 + 1);
  let heapN = 0;
  const less = (a, b) => heapK[a] < heapK[b] || (heapK[a] === heapK[b] && heapI[a] < heapI[b]);
  const push = (id, k) => {
    let c = ++heapN;
    heapK[c] = k; heapI[c] = id;
    while (c > 1) {
      const par = c >> 1;
      if (less(c, par)) {
        const tk = heapK[c], ti = heapI[c];
        heapK[c] = heapK[par]; heapI[c] = heapI[par];
        heapK[par] = tk; heapI[par] = ti;
        c = par;
      } else break;
    }
  };
  const pop = () => {
    const id = heapI[1];
    heapK[1] = heapK[heapN]; heapI[1] = heapI[heapN]; heapN--;
    let c = 1;
    for (;;) {
      let m = c;
      const l = c * 2, r = l + 1;
      if (l <= heapN && less(l, m)) m = l;
      if (r <= heapN && less(r, m)) m = r;
      if (m === c) break;
      const tk = heapK[c], ti = heapI[c];
      heapK[c] = heapK[m]; heapI[c] = heapI[m];
      heapK[m] = tk; heapI[m] = ti;
      c = m;
    }
    return id;
  };

  let seeded = 0;
  if (sea != null) {
    for (let c = 0; c < N6; c++)
      if (hgt[c] < sea) { visited[c] = 1; push(c, hgt[c]); seeded++; }
  }
  if (!seeded) {
    // no cell below the drain level: the single global minimum is the outlet
    let mn = 0;
    for (let c = 1; c < N6; c++) if (hgt[c] < hgt[mn]) mn = c;
    visited[mn] = 1; push(mn, hgt[mn]);
  }
  const EPS = 0.01; // m: flats drain instead of ponding
  while (heapN > 0) {
    const c = pop();
    const f = (c / N) | 0, rem = c - f * N, j = (rem / W) | 0, i = rem - j * W;
    for (let o = 0; o < 8; o++) {
      const n = nbrId(f, i, j, OCT[o][0], OCT[o][1]);
      if (visited[n]) continue;
      visited[n] = 1;
      filled[n] = Math.max(hgt[n], filled[c] + EPS);
      push(n, filled[n]);
    }
  }

  // ---- D8 steepest descent on the filled surface ----
  const flowTo = new Int32Array(N6).fill(-1);
  const isOut = (c) => sea != null && hgt[c] < sea;
  for (let c = 0; c < N6; c++) {
    if (isOut(c)) continue; // outlets terminate flow
    const f = (c / N) | 0, rem = c - f * N, j = (rem / W) | 0, i = rem - j * W;
    let best = 0, bestN = -1;
    for (let o = 0; o < 8; o++) {
      const n = nbrId(f, i, j, OCT[o][0], OCT[o][1]);
      if (n === c) continue;
      const dh = filled[c] - filled[n];
      if (dh <= 0) continue;
      const dx = dirs[c * 3] - dirs[n * 3], dy = dirs[c * 3 + 1] - dirs[n * 3 + 1],
        dz = dirs[c * 3 + 2] - dirs[n * 3 + 2];
      const s = dh / Math.sqrt(dx * dx + dy * dy + dz * dz + 1e-20);
      if (s > best || (s === best && bestN >= 0 && n < bestN)) { best = s; bestN = n; }
    }
    flowTo[c] = bestN;
  }

  // ---- accumulation in topological (Kahn) order — no sort needed ----
  // gnomonic cell area element: dA ∝ 1/(1+a²+b²)^(3/2) (relative units)
  const acc = new Float64Array(N6);
  let areaTotal = 0;
  for (let c = 0; c < N6; c++) {
    const rem = c % N, j = (rem / W) | 0, i = rem - j * W;
    const a = (2 * (i + 0.5)) / W - 1, b = (2 * (j + 0.5)) / W - 1;
    const q = 1 + a * a + b * b;
    acc[c] = 1 / (q * Math.sqrt(q));
    areaTotal += acc[c];
  }
  const indeg = new Int32Array(N6);
  for (let c = 0; c < N6; c++) if (flowTo[c] >= 0) indeg[flowTo[c]]++;
  const queue = new Int32Array(N6);
  let qh = 0, qt = 0;
  for (let c = 0; c < N6; c++) if (indeg[c] === 0) queue[qt++] = c;
  while (qh < qt) {
    const c = queue[qh++];
    const t = flowTo[c];
    if (t >= 0) {
      acc[t] += acc[c];
      if (--indeg[t] === 0) queue[qt++] = t;
    }
  }

  // ---- normalized log flow (land only; outlets carry 0) ----
  const aCell = areaTotal / N6;
  let accMax = aCell;
  for (let c = 0; c < N6; c++) if (!isOut(c) && acc[c] > accMax) accMax = acc[c];
  const logMax = Math.log(accMax / aCell) || 1;
  const flowN = new Float32Array(N6);
  for (let c = 0; c < N6; c++)
    flowN[c] = isOut(c) ? 0 : clamp(Math.log(Math.max(acc[c] / aCell, 1)) / logMax, 0, 1);

  // ---- padded per-face rasters (seamless bilinear sampling across faces) ----
  const flowPad = padFaces(flowN, W);

  // ---- moisture: upwind Jacobi advection with orographic rainout ----
  let moistPad = null, Wm = 0;
  if (p.moisture && sea != null) {
    Wm = W >> 1;
    const r = buildMoisture(hgt, W, Wm, sea, p.moisture, dirs, p.wind);
    moistPad = r;
  }

  // ---- wind (round 12): the zonal prior promoted to a first-class output,
  // with terrain deflection + windward/lee exposure. buildMoisture's inline
  // prior is deliberately NOT refactored onto this (its advection stays
  // bit-identical for a fixed prefix; deflected-wind moisture is round-13
  // residue) — but flow/moisture DO react to prefix topography changes
  // (edifices, the rift), which is the architecture working.
  let windRes = null;
  const Ww = W >> 1;
  if (p.wind) windRes = buildWindField(hgt, W, Ww, p.wind);

  // wind fields are ROUGH at grid scale (deflection follows 20 km relief), so
  // point-sampling them into a coarse tile's ~275 km texels aliases into
  // reticulated mottling AND makes the sampled content level-dependent (§5:
  // appearance must not depend on the rendering level; §7: sub-footprint
  // content folds into the mean). Each wind raster carries a 2x2-mean MIP
  // pyramid; sampling takes the caller's texel footprint and lerps between
  // the two bracketing mips — mean-preserving and continuous across levels.
  const mipSample = (mips, dir, footRad) => {
    // grid spacing of mip k is (π/2)/w_k; find the finest mip whose spacing
    // covers the footprint, blend with the next coarser by the log2 fraction
    if (footRad <= 0) return samplePad(mips[0].pad, mips[0].w, dir);
    let k = 0;
    while (k + 1 < mips.length && (Math.PI / 2) / mips[k].w < footRad) k++;
    const a = samplePad(mips[k].pad, mips[k].w, dir);
    if (k === 0 || k + 1 >= mips.length) return a;
    const s0 = (Math.PI / 2) / mips[k - 1].w;
    const t = clamp(Math.log2(footRad / s0), 0, 1);
    if (t >= 1) return a;
    const b = samplePad(mips[k - 1].pad, mips[k - 1].w, dir);
    return b * (1 - t) + a * t;
  };

  const g = {
    level: G, W, Wm, Ww,
    hasWind: !!windRes,
    sample(name, dir, footRad = 0) {
      if (name === 'flow') return samplePad(flowPad, W, dir);
      if (name === 'moist') return moistPad ? samplePad(moistPad, Wm, dir) : 0;
      if (!windRes) return 0;
      if (name === 'windX') return mipSample(windRes.wx, dir, footRad);
      if (name === 'windY') return mipSample(windRes.wy, dir, footRad);
      if (name === 'windZ') return mipSample(windRes.wz, dir, footRad);
      if (name === 'windExpo') return mipSample(windRes.expo, dir, footRad);
      return 0;
    },
  };
  if (p.debug) Object.assign(g, { hgt, filled, flowTo, acc, areaTotal, flowN, windRes });
  return g;
}

// 2x2-mean mip chain of a flat 6-face grid, each level padded for seamless
// cross-face bilinear sampling. Deterministic (plain means, fixed depth).
function mipChain(flat, W) {
  const mips = [{ pad: padFaces(flat, W), w: W }];
  let cur = flat, w = W;
  while (w > 16) {
    const w2 = w >> 1, N2 = w2 * w2, N1 = w * w;
    const next = new Float32Array(6 * N2);
    for (let f = 0; f < 6; f++)
      for (let j = 0; j < w2; j++)
        for (let i = 0; i < w2; i++) {
          const b = f * N1 + (2 * j) * w + 2 * i;
          next[f * N2 + j * w2 + i] = 0.25 * (cur[b] + cur[b + 1] + cur[b + w] + cur[b + w + 1]);
        }
    mips.push({ pad: padFaces(next, w2), w: w2 });
    cur = next; w = w2;
  }
  return mips;
}

// wind field on the half-resolution grid (round 12). Prior = the SAME zonal
// profile buildMoisture uses (trades / westerlies / polar easterlies + the
// meridional Hadley/Ferrel mixing term), scaled by the recipe speed; then
// terrain deflection — subtracting the range-scale height gradient turns the
// prior around ridges and adds katabatic downslope drift where the prior is
// weak (the registered round-3 residue "wind has no terrain deflection").
// windExpo = directional slope along the wind on the LOCAL grid (windward +,
// lee −): province-scale scour/mantling and crater lee streaks fall out of
// this one signed scalar. Everything deterministic; padded per-face rasters
// sampled seamlessly across cube edges like flow/moist.
function buildWindField(hgt, W, Wm, wp) {
  const Nm = Wm * Wm, N6m = 6 * Nm;
  const NW = W * W;
  // downsample heights 2x2 (mean) — the local grid exposure reads
  const hm = new Float32Array(N6m);
  for (let f = 0; f < 6; f++)
    for (let j = 0; j < Wm; j++)
      for (let i = 0; i < Wm; i++) {
        const b = f * NW + (2 * j) * W + 2 * i;
        hm[f * Nm + j * Wm + i] =
          0.25 * (hgt[b] + hgt[b + 1] + hgt[b + W] + hgt[b + W + 1]);
      }
  // range-scale grid (4x coarser) — deflection AND exposure read ridge-scale
  // relief, not fBm roughness (the moisture pass's calibration lesson)
  const Ws = Wm >> 2, Ns = Ws * Ws;
  const hs = new Float32Array(6 * Ns);
  for (let f = 0; f < 6; f++)
    for (let j = 0; j < Ws; j++)
      for (let i = 0; i < Ws; i++) {
        let sum = 0;
        for (let bj = 0; bj < 4; bj++)
          for (let bi = 0; bi < 4; bi++)
            sum += hm[f * Nm + (4 * j + bj) * Wm + 4 * i + bi];
        hs[f * Ns + j * Ws + i] = sum / 16;
      }
  const hsPad = padFaces(hs, Ws);

  const speed = wp.speed ?? 1;
  const kDef = wp.kDef ?? 22;         // wind per unit range-scale slope
  const expoRef = wp.expoRef ?? 0.045; // local slope along wind that saturates expo
  const wCap = 1.6 * speed;
  const wxA = new Float32Array(N6m), wyA = new Float32Array(N6m), wzA = new Float32Array(N6m);
  const exA = new Float32Array(N6m);
  const d = [0, 0, 0], dq = [0, 0, 0];
  const dsS = 1.6 * (Math.PI / 2) / Ws;  // range-grid gradient step (rad)
  // tangent-plane sample helper: central difference of a padded grid along a
  // tangent axis, in height-per-radian
  const gradAlong = (pad, Wp, p0, ax, ds) => {
    dq[0] = p0[0] + ax[0] * ds; dq[1] = p0[1] + ax[1] * ds; dq[2] = p0[2] + ax[2] * ds;
    const hp = samplePad(pad, Wp, dq);
    dq[0] = p0[0] - ax[0] * ds; dq[1] = p0[1] - ax[1] * ds; dq[2] = p0[2] - ax[2] * ds;
    return (hp - samplePad(pad, Wp, dq)) / (2 * ds);
  };
  for (let f = 0; f < 6; f++)
    for (let j = 0; j < Wm; j++)
      for (let i = 0; i < Wm; i++) {
        faceUvToDir(f, (i + 0.5) / Wm, (j + 0.5) / Wm, d);
        const c = f * Nm + j * Wm + i;
        const lat = latOf(d);
        const cl = Math.cos(lat);
        // zonal prior — VERBATIM the moisture pass's profile
        let ex = -d[2], ez = d[0];
        const el = Math.hypot(ex, ez);
        const w = el < 1e-6 ? 0 : -Math.cos(3 * lat) * clamp(cl * 4, 0, 1);
        ex = (ex / (el + 1e-9)) * w; ez = (ez / (el + 1e-9)) * w;
        const mv = 0.35 * Math.sin(2 * lat) * Math.cos(3 * lat);
        let nx = -d[0] * d[1], ny = 1 - d[1] * d[1], nz = -d[2] * d[1];
        const nl = Math.hypot(nx, ny, nz) + 1e-9;
        nx /= nl; ny /= nl; nz /= nl;
        let wx = (ex + nx * mv) * speed, wy = ny * mv * speed, wz = (ez + nz * mv) * speed;
        // terrain deflection: subtract the range-scale tangent gradient
        // (slope in height-per-radian, normalized by the planet-scale unit —
        // radians are the natural unit on the unit sphere grid)
        const eAx = [el < 1e-6 ? 1 : -d[2] / el, 0, el < 1e-6 ? 0 : d[0] / el];
        const nAx = [nx, ny, nz];
        const ge = gradAlong(hsPad, Ws, d, eAx, dsS);
        const gn = gradAlong(hsPad, Ws, d, nAx, dsS);
        // per-radian -> per-planet-arc slope: divide by R-equivalent; the grid
        // has no R, so the recipe kDef absorbs the scale (documented there)
        wx -= kDef * 1e-6 * (ge * eAx[0] + gn * nAx[0]);
        wy -= kDef * 1e-6 * (ge * eAx[1] + gn * nAx[1]);
        wz -= kDef * 1e-6 * (ge * eAx[2] + gn * nAx[2]);
        // tangentialize + cap
        const rad = wx * d[0] + wy * d[1] + wz * d[2];
        wx -= rad * d[0]; wy -= rad * d[1]; wz -= rad * d[2];
        const wm = Math.hypot(wx, wy, wz);
        if (wm > wCap) { wx *= wCap / wm; wy *= wCap / wm; wz *= wCap / wm; }
        wxA[c] = wx; wyA[c] = wy; wzA[c] = wz;
        // exposure: RANGE-scale slope along the wind, saturating at expoRef.
        // The moisture pass's calibration lesson applies verbatim: raw
        // local-grid slopes are fbm-noise-dominated and saturate the field
        // into texel mottle (instrumented: ±0.33 texel-to-texel — it printed
        // a reticulate maze on the disc through the scour/mantle albedo).
        // Province-scale scour/mantling reads province-scale relief; crater-
        // scale lee streaks want a finer CONSUMER, not a rougher field
        // (registered, round 13).
        if (wm > 1e-4) {
          const ux = wx / (wm || 1), uy = wy / (wm || 1), uz = wz / (wm || 1);
          const gAlong = gradAlong(hsPad, Ws, d, [ux, uy, uz], dsS);
          exA[c] = clamp(gAlong * 1e-6 / expoRef, -1, 1) * clamp(wm / (0.5 * speed), 0, 1);
        } else exA[c] = 0;
      }
  return { wx: mipChain(wxA, Wm), wy: mipChain(wyA, Wm), wz: mipChain(wzA, Wm), expo: mipChain(exA, Wm) };
}

// bilinear sample of raw (unpadded) per-face grids by direction; taps clamped
// to the face — used only to fill pads, where the half-cell clamp error at the
// far corner is negligible for these smooth fields.
function sampleRaw(faces, W, dir) {
  const q = dirToFaceUv(dir);
  const F = faces[q.face];
  const cx = clamp(q.u * W - 0.5, 0, W - 1), cy = clamp(q.v * W - 0.5, 0, W - 1);
  const i = Math.min(Math.floor(cx), W - 2), j = Math.min(Math.floor(cy), W - 2);
  const fx = cx - i, fy = cy - j;
  const a = F[j * W + i] * (1 - fx) + F[j * W + i + 1] * fx;
  const b = F[(j + 1) * W + i] * (1 - fx) + F[(j + 1) * W + i + 1] * fx;
  return a * (1 - fy) + b * fy;
}

// split a flat 6-face grid into per-face rasters padded by one cross-face cell
function padFaces(flat, W) {
  const N = W * W, P = W + 2;
  const faces = [];
  for (let f = 0; f < 6; f++) faces.push(flat.subarray(f * N, (f + 1) * N));
  const out = [];
  for (let f = 0; f < 6; f++) {
    const pd = new Float32Array(P * P);
    for (let j = 0; j < W; j++)
      for (let i = 0; i < W; i++) pd[(j + 1) * P + (i + 1)] = faces[f][j * W + i];
    out.push(pd);
  }
  refreshPads(out, faces, W);
  return out;
}
function refreshPads(padded, faces, W) {
  const P = W + 2;
  const d = [0, 0, 0];
  for (let f = 0; f < 6; f++) {
    const pd = padded[f];
    for (let k = 0; k < P; k++) {
      const cellOf = (pi) => pi - 1 + 0.5; // pad grid -> extended cell center
      for (const [pi, pj] of [[k, 0], [k, P - 1], [0, k], [P - 1, k]]) {
        faceUvToDir(f, cellOf(pi) / W, cellOf(pj) / W, d);
        pd[pj * P + pi] = sampleRaw(faces, W, d);
      }
    }
  }
}

// bilinear over a padded per-face raster, seamless at cube edges
function samplePad(padded, W, dir) {
  const q = dirToFaceUv(dir);
  const P = W + 2;
  const F = padded[q.face];
  const cx = clamp(q.u * W + 0.5, 0, W + 0.999), cy = clamp(q.v * W + 0.5, 0, W + 0.999);
  const i = Math.min(Math.floor(cx), W), j = Math.min(Math.floor(cy), W);
  const fx = cx - i, fy = cy - j;
  const a = F[j * P + i] * (1 - fx) + F[j * P + i + 1] * fx;
  const b = F[(j + 1) * P + i] * (1 - fx) + F[(j + 1) * P + i + 1] * fx;
  return a * (1 - fy) + b * fy;
}

// moisture on a half-resolution grid: zonal wind prior (trades / westerlies /
// polar easterlies), upwind Jacobi sweeps with evaporation sources, background
// decay and orographic rainout, then an ITCZ/subtropic zonal prior. Returns
// padded per-face rasters. Order-independent per sweep => deterministic.
function buildMoisture(hgt, W, Wm, sea, mp, dirsW, wp) {
  const Nm = Wm * Wm, N6m = 6 * Nm;
  // downsample heights 2x2 (mean)
  const hm = new Float32Array(N6m);
  const NW = W * W;
  for (let f = 0; f < 6; f++)
    for (let j = 0; j < Wm; j++)
      for (let i = 0; i < Wm; i++) {
        const b = f * NW + (2 * j) * W + 2 * i;
        hm[f * Nm + j * Wm + i] =
          0.25 * (hgt[b] + hgt[b + 1] + hgt[b + W] + hgt[b + W + 1]);
      }
  const hPad = padFaces(hm, Wm);
  // orographic rain reads RANGE-scale relief: a 4x-coarser height grid
  // (~230 km cells). Keyed on raw cell steps, ordinary fBm roughness rains out
  // every parcel and continental interiors go bone-dry (first calibration run).
  const Ws = Wm >> 2, Ns = Ws * Ws;
  const hs = new Float32Array(6 * Ns);
  for (let f = 0; f < 6; f++)
    for (let j = 0; j < Ws; j++)
      for (let i = 0; i < Ws; i++) {
        let sum = 0;
        for (let bj = 0; bj < 4; bj++)
          for (let bi = 0; bi < 4; bi++)
            sum += hm[f * Nm + (4 * j + bj) * Wm + 4 * i + bi];
        hs[f * Ns + j * Ws + i] = sum / 16;
      }
  const hsPad = padFaces(hs, Ws);
  // terrain deflection of the advection wind (round 13, R1): the same
  // range-scale gradient operator buildWindField uses, reused here on this
  // pass's own hsPad so orographic rain shadows wrap around orography.
  const kDef = wp ? (wp.kDef ?? 0) : 0;
  const dsS = 1.6 * (Math.PI / 2) / Ws;   // range-grid gradient step (rad)
  const dq = [0, 0, 0];
  const gradAlong = (pad, Wp, p0, ax, ds2) => {
    dq[0] = p0[0] + ax[0] * ds2; dq[1] = p0[1] + ax[1] * ds2; dq[2] = p0[2] + ax[2] * ds2;
    const hp = samplePad(pad, Wp, dq);
    dq[0] = p0[0] - ax[0] * ds2; dq[1] = p0[1] - ax[1] * ds2; dq[2] = p0[2] - ax[2] * ds2;
    return (hp - samplePad(pad, Wp, dq)) / (2 * ds2);
  };

  // per-cell wind vector (unit tangent x zonal profile) + upwind source dir
  const beta = mp.beta ?? 0.42, gamma = mp.gamma ?? 0.012;
  const e0 = mp.evapSea ?? 0.055, e1 = mp.evapLand ?? 0.006;
  const sweeps = mp.sweeps ?? 64;
  const ds = 1.4 * (Math.PI / 2) / Wm; // radians per step (~1.4 cells)
  const upDir = new Float32Array(N6m * 3);
  const d = [0, 0, 0];
  for (let f = 0; f < 6; f++)
    for (let j = 0; j < Wm; j++)
      for (let i = 0; i < Wm; i++) {
        faceUvToDir(f, (i + 0.5) / Wm, (j + 0.5) / Wm, d);
        const c = f * Nm + j * Wm + i;
        const lat = latOf(d);
        const cl = Math.cos(lat);
        // east = normalize(cross(+Y, dir)); zonal speed w: trades easterly,
        // mid-latitude westerlies, polar easterlies; dies at the poles. A small
        // meridional component (Hadley/Ferrel surface flow) mixes air across the
        // band boundaries — without it the w=0 latitudes are advection-dead and
        // print as hard dry streaks (first viz pass)
        let ex = -d[2], ez = d[0];
        const el = Math.hypot(ex, ez);
        const w = el < 1e-6 ? 0 : -Math.cos(3 * lat) * clamp(cl * 4, 0, 1);
        ex = (ex / (el + 1e-9)) * w; ez = (ez / (el + 1e-9)) * w;
        const mv = 0.35 * Math.sin(2 * lat) * Math.cos(3 * lat); // cross-band mixing
        // north = tangent toward +Y at this point
        let nx = -d[0] * d[1], ny = 1 - d[1] * d[1], nz = -d[2] * d[1];
        const nl = Math.hypot(nx, ny, nz) + 1e-9;
        const naxx = nx / nl, naxy = ny / nl, naxz = nz / nl;
        ex += naxx * mv; let ey = naxy * mv; ez += naxz * mv;
        // terrain deflection (round 13, R1): bend the advection wind around
        // range-scale relief (the buildWindField operator), so the rain shadow
        // wraps around the edifice/ranges instead of a straight zonal band.
        // Capped so steep relief bends but never dominates the advection.
        if (kDef) {
          const eax = el < 1e-6 ? 1 : -d[2] / el, eaz = el < 1e-6 ? 0 : d[0] / el;
          const ge = gradAlong(hsPad, Ws, d, [eax, 0, eaz], dsS);
          const gn = gradAlong(hsPad, Ws, d, [naxx, naxy, naxz], dsS);
          const kk = kDef * 1e-6;
          ex -= kk * (ge * eax + gn * naxx);
          ey -= kk * (gn * naxy);
          ez -= kk * (ge * eaz + gn * naxz);
          const wmag = Math.hypot(ex, ey, ez);
          if (wmag > 1.5) { const s2 = 1.5 / wmag; ex *= s2; ey *= s2; ez *= s2; }
        }
        // upwind position: cell center minus wind * ds, renormalized
        let ux = d[0] - ex * ds, uy = d[1] - ey * ds, uz = d[2] - ez * ds;
        const il = 1 / Math.hypot(ux, uy, uz);
        upDir[c * 3] = ux * il; upDir[c * 3 + 1] = uy * il; upDir[c * 3 + 2] = uz * il;
      }

  // precompute per-cell rain/evap (static across sweeps): ascent on the
  // range-scale surface along the wind, evaporation from the raw surface
  const rainC = new Float32Array(N6m);
  const evapC = new Float32Array(N6m);
  {
    const cd = [0, 0, 0], ud2 = [0, 0, 0];
    for (let f = 0; f < 6; f++)
      for (let j = 0; j < Wm; j++)
        for (let i = 0; i < Wm; i++) {
          const c = f * Nm + j * Wm + i;
          faceUvToDir(f, (i + 0.5) / Wm, (j + 0.5) / Wm, cd);
          ud2[0] = upDir[c * 3]; ud2[1] = upDir[c * 3 + 1]; ud2[2] = upDir[c * 3 + 2];
          const ascent = samplePad(hsPad, Ws, cd) - samplePad(hsPad, Ws, ud2);
          rainC[c] = clamp(beta * Math.max(ascent, 0) / 1000, 0, 0.5);
          evapC[c] = hm[c] < sea ? e0 : e1;
        }
  }
  let m = new Float32Array(N6m);
  let mNext = new Float32Array(N6m);
  let mPad = padFaces(m, Wm);
  const ud = [0, 0, 0];
  for (let s = 0; s < sweeps; s++) {
    for (let c = 0; c < N6m; c++) {
      ud[0] = upDir[c * 3]; ud[1] = upDir[c * 3 + 1]; ud[2] = upDir[c * 3 + 2];
      const mUp = samplePad(mPad, Wm, ud);
      mNext[c] = mUp * (1 - rainC[c]) * (1 - gamma) + evapC[c];
    }
    const t = m; m = mNext; mNext = t;
    // rebuild interior + pads for the next sweep's sampling
    mPad = padFaces(m, Wm);
  }

  // normalize so open ocean -> 1: the geometric series only reaches
  // (1-(1-γ)^sweeps) of the e0/γ steady state in `sweeps` iterations — divide
  // by what the iteration can actually attain, not the asymptote
  const norm = gamma / e0 / (1 - Math.pow(1 - gamma, sweeps));
  for (let f = 0; f < 6; f++)
    for (let j = 0; j < Wm; j++)
      for (let i = 0; i < Wm; i++) {
        const c = f * Nm + j * Wm + i;
        faceUvToDir(f, (i + 0.5) / Wm, (j + 0.5) / Wm, d);
        const lat = latOf(d);
        // gentle ITCZ/subtropic modulation (±25%): a hard prior crushed whole
        // latitude bands to desert regardless of fetch (calibration run 2)
        const prior = 0.75 + 0.25 * Math.cos(6 * lat);
        m[c] = clamp(m[c] * norm * prior, 0, 1);
      }
  return padFaces(m, Wm);
}

// test hook: drop every cached grid (fresh-build determinism checks)
export function clearGlobalCache() { CACHE.clear(); }
