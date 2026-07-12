// Adversarial probe: measure REAL along-crest coherence of Titan's longitudinal
// dune field in a baked tile (not the synthetic geometric identity the shipped
// _titan_probe uses). Isolate the dune relief = full bake - (bake w/o bedforms),
// then compute the gradient structure tensor + along/across-crest autocorrelation.
import { makeBaker, TILE_RES, HALO, I, RASTER } from '../src/bakecore.js';
import { faceUvToDir } from '../src/mathx.js';
import { bodyById } from '../src/recipe.js';

const titan = bodyById('titan');
// clone recipe without the bedforms process
const noBed = JSON.parse(JSON.stringify(titan));
noBed.processes = noBed.processes.filter((p) => p.type !== 'bedforms');
noBed.id = 'titan_nobed';

const bFull = makeBaker(titan, { cacheMax: 128 });
const bNo = makeBaker(noBed, { cacheMax: 128 });

// scan candidate equatorial tiles at level 12 on each face, pick the max dune signal
const LV = 12, D = TILE_RES << LV;
let best = null;
for (const face of [0, 1, 2, 3, 4, 5]) {
  // equatorial-ish tile: pick x,y near the middle of the face
  for (const [tx, ty] of [[D / 128 | 0, D / 128 | 0], [D / 256 | 0, D / 256 | 0], [D / 200 | 0, D / 300 | 0]]) {
    const f = bFull.bakeTile(face, LV, tx, ty);
    const n = bNo.bakeTile(face, LV, tx, ty);
    let ss = 0, cnt = 0, latsum = 0;
    for (let j = 0; j <= TILE_RES; j++)
      for (let i = 0; i <= TILE_RES; i++) {
        const c = I(i, j);
        const d = f.height[c] - n.height[c];
        ss += d * d; cnt++;
      }
    // tile-center lat
    const u = (tx * TILE_RES + 32) / D, v = (ty * TILE_RES + 32) / D;
    const dir = faceUvToDir(face, u, v, [0, 0, 0]);
    const lat = Math.asin(Math.max(-1, Math.min(1, dir[1]))) * 180 / Math.PI;
    const rms = Math.sqrt(ss / cnt);
    if (Math.abs(lat) < 30 && (!best || rms > best.rms)) best = { face, tx, ty, rms, lat };
  }
}
if (!best) { console.log('no equatorial dune tile found'); process.exit(0); }
console.log(`dune tile: face ${best.face} (${best.tx},${best.ty}) lat ${best.lat.toFixed(1)}°  dune RMS ${best.rms.toFixed(2)} m`);

const f = bFull.bakeTile(best.face, LV, best.tx, best.ty);
const n = bNo.bakeTile(best.face, LV, best.tx, best.ty);
// dune field on interior grid [0..64]^2
const M = TILE_RES + 1; // 65
const dune = new Float64Array(M * M);
for (let j = 0; j <= TILE_RES; j++)
  for (let i = 0; i <= TILE_RES; i++)
    dune[j * M + i] = f.height[I(i, j)] - n.height[I(i, j)];

// --- gradient structure tensor (raster space) ---
let Jxx = 0, Jyy = 0, Jxy = 0;
for (let j = 1; j < TILE_RES; j++)
  for (let i = 1; i < TILE_RES; i++) {
    const gx = 0.5 * (dune[j * M + i + 1] - dune[j * M + i - 1]);
    const gy = 0.5 * (dune[(j + 1) * M + i] - dune[(j - 1) * M + i]);
    Jxx += gx * gx; Jyy += gy * gy; Jxy += gx * gy;
  }
// eigenvalues of [[Jxx,Jxy],[Jxy,Jyy]]
const tr = Jxx + Jyy, det = Jxx * Jyy - Jxy * Jxy;
const disc = Math.sqrt(Math.max(tr * tr / 4 - det, 0));
const l1 = tr / 2 + disc, l2 = tr / 2 - disc; // l1>=l2
const aniso = (l1 - l2) / (l1 + l2 + 1e-12);
// dominant gradient eigenvector (for l1): [Jxy, l1-Jxx] (or handle degenerate)
let gvx = Jxy, gvy = l1 - Jxx;
if (Math.hypot(gvx, gvy) < 1e-9) { gvx = l1 - Jyy; gvy = Jxy; }
const gl = Math.hypot(gvx, gvy) || 1; gvx /= gl; gvy /= gl;
// crest direction = perpendicular to dominant gradient
const cvx = -gvy, cvy = gvx;
console.log(`structure-tensor anisotropy = ${aniso.toFixed(3)}  (1=perfect linear ridges, 0=isotropic blobs/plaid)`);
console.log(`crest raster-dir = (${cvx.toFixed(3)}, ${cvy.toFixed(3)})`);

// --- along-crest vs across-crest autocorrelation of the dune field ---
// sample the field via bilinear at grid center stepping ± along the two dirs
function bilerp(fx, fy) {
  fx = Math.max(0, Math.min(TILE_RES - 1e-4, fx));
  fy = Math.max(0, Math.min(TILE_RES - 1e-4, fy));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
  return (dune[y0 * M + x0] * (1 - ax) + dune[y0 * M + x0 + 1] * ax) * (1 - ay)
       + (dune[(y0 + 1) * M + x0] * (1 - ax) + dune[(y0 + 1) * M + x0 + 1] * ax) * ay;
}
function autocorr(dx, dy, lag) {
  // correlation between field(p) and field(p + lag*(dx,dy)) over a grid of p
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, nc = 0;
  for (let j = 8; j <= TILE_RES - 8; j += 2)
    for (let i = 8; i <= TILE_RES - 8; i += 2) {
      const a = bilerp(i, j);
      const b = bilerp(i + dx * lag, j + dy * lag);
      sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; nc++;
    }
  const ca = sab / nc - (sa / nc) * (sb / nc);
  const va = saa / nc - (sa / nc) ** 2, vb = sbb / nc - (sb / nc) ** 2;
  return ca / Math.sqrt(va * vb + 1e-12);
}
console.log('lag(cells):   along-crest   across-crest   (ridges: along stays ~1, across oscillates)');
for (const lag of [2, 4, 6, 8, 12, 16]) {
  const al = autocorr(cvx, cvy, lag);
  const ac = autocorr(gvx, gvy, lag);
  console.log(`  ${String(lag).padStart(2)}          ${al.toFixed(3).padStart(6)}        ${ac.toFixed(3).padStart(6)}`);
}

// --- relate crest to LOCAL WIND (longitudinal ⇒ crest ∥ wind) ---
// build raster tangent basis at center from faceUvToDir, project mean wind
{
  const cx = best.tx * TILE_RES + 32, cy = best.ty * TILE_RES + 32;
  const p0 = faceUvToDir(best.face, cx / D, cy / D, [0, 0, 0]);
  const pu = faceUvToDir(best.face, (cx + 1) / D, cy / D, [0, 0, 0]);
  const pv = faceUvToDir(best.face, cx / D, (cy + 1) / D, [0, 0, 0]);
  const eu = [pu[0] - p0[0], pu[1] - p0[1], pu[2] - p0[2]];
  const ev = [pv[0] - p0[0], pv[1] - p0[1], pv[2] - p0[2]];
  const nu = Math.hypot(...eu), nv = Math.hypot(...ev);
  for (let k = 0; k < 3; k++) { eu[k] /= nu; ev[k] /= nv; }
  // mean wind over interior
  let wx = 0, wy = 0, wz = 0;
  for (let c = 0; c < RASTER * RASTER; c++) { wx += f.fields.windX[c]; wy += f.fields.windY[c]; wz += f.fields.windZ[c]; }
  const wmag = Math.hypot(wx, wy, wz) || 1; wx /= wmag; wy /= wmag; wz /= wmag;
  const wU = wx * eu[0] + wy * eu[1] + wz * eu[2];
  const wV = wx * ev[0] + wy * ev[1] + wz * ev[2];
  const windAng = Math.atan2(wV, wU) * 180 / Math.PI;
  const crestAng = Math.atan2(cvy, cvx) * 180 / Math.PI;
  let dAng = Math.abs(((crestAng - windAng + 180 + 360) % 360) - 180); // 0..180
  dAng = Math.min(dAng, 180 - dAng); // fold to 0..90 (orientation)
  console.log(`wind raster-dir angle ${windAng.toFixed(1)}°, crest angle ${crestAng.toFixed(1)}°  → |crest-wind| = ${dAng.toFixed(1)}°  (longitudinal wants ~0°)`);
}
