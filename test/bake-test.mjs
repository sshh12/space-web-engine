// bake-test.mjs — pure-Node verification of the CONCEPT.md guarantees the whole
// architecture rests on (run: node test/bake-test.mjs). No browser, no three.js.
//
//   1. determinism: two fresh bakers produce bit-identical tiles
//   2. halo == neighbour interior (§3), bit-exact, within each face's valid halo
//   3. cross-face cube edges agree (stamps are 3D-pure; stateful ops edge-masked)
//   4. accretion sanity: child = upsample(parent) + band, so their difference is
//      bounded by the band amplitude (never a re-stamp of inherited content)
//   5. scatter LOD-independence (§7): rocks from tiles at different levels covering
//      the same region are the same rocks

import { makeBaker, TILE_RES, HALO, I, RASTER } from '../src/bakecore.js';
import { listRocks } from '../src/scattercore.js';
import { bodyById } from '../src/recipe.js';
import { faceUvToDir, dirToFaceUv } from '../src/mathx.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failures++;
};

const body = bodyById('tellus');

// ---- 1. determinism across fresh bakers ----
{
  const a = makeBaker(body).bakeTile(2, 5, 11, 7);
  const b = makeBaker(body).bakeTile(2, 5, 11, 7);
  let same = true;
  for (let c = 0; c < a.height.length; c++) if (a.height[c] !== b.height[c]) { same = false; break; }
  for (const f of Object.keys(a.fields)) {
    for (let c = 0; c < a.fields[f].length; c++) if (a.fields[f][c] !== b.fields[f][c]) { same = false; break; }
  }
  check('determinism: identical rebake', same);
}

// ---- 2. halo cells == neighbour interior, bit-exact (within valid halo) ----
{
  const baker = makeBaker(body);
  const level = 6, f = 1, x = 20, y = 33;
  const A = baker.bakeTile(f, level, x, y);
  const B = baker.bakeTile(f, level, x + 1, y); // east neighbour
  // A's cells i in [65..68] must equal B's i-64 in [1..4]; heights valid to halo 4
  let worst = 0, worstF = 0;
  for (let j = -4; j <= TILE_RES + 4; j++)
    for (let i = TILE_RES + 1; i <= TILE_RES + 4; i++) {
      const d = Math.abs(A.height[I(i, j)] - B.height[I(i - TILE_RES, j)]);
      if (d > worst) worst = d;
    }
  // fields valid to halo 3
  for (const name of ['rock', 'ice', 'ao', 'rockDensity', 'mare'])
    for (let j = -3; j <= TILE_RES + 3; j++)
      for (let i = TILE_RES + 1; i <= TILE_RES + 3; i++) {
        const d = Math.abs(A.fields[name][I(i, j)] - B.fields[name][I(i - TILE_RES, j)]);
        if (d > worstF) worstF = d;
      }
  check('halo == neighbour interior (height, bit-exact)', worst === 0, `worst ${worst}`);
  check('halo == neighbour interior (fields, bit-exact)', worstF === 0, `worst ${worstF}`);
  // and the shared edge column itself (i=64 on A == i=0 on B)
  let edge = 0;
  for (let j = 0; j <= TILE_RES; j++)
    edge = Math.max(edge, Math.abs(A.height[I(TILE_RES, j)] - B.height[I(0, j)]));
  check('shared edge column identical', edge === 0, `worst ${edge}`);
}

// ---- 3. cross-face cube edge agreement ----
{
  const baker = makeBaker(body);
  const level = 4;
  // face 0 (+X) at u=1 borders face 4 (+Z) at u=1? Find the actual pairing by
  // comparing directions instead of assuming: walk A's east edge, locate the same
  // 3D points via dirToFaceUv on the neighbouring face and compare heights there.
  const D = 1 << level;
  const A = baker.bakeTile(0, level, D - 1, Math.floor(D / 2));
  let worst = 0, amp = 0;
  for (let j = 0; j <= TILE_RES; j += 8) {
    const v = ((Math.floor(D / 2)) * TILE_RES + j) / (TILE_RES * D);
    const dir = faceUvToDir(0, 1, v); // exactly on the cube edge
    // sample the other face's tile at the same 3D point
    const alt = dirToFaceUv([dir[0] * (1 - 1e-12), dir[1], dir[2]]); // nudge off face 0
    if (alt.face === 0) continue;
    const bx = Math.min(Math.floor(alt.u * D), D - 1), by = Math.min(Math.floor(alt.v * D), D - 1);
    const B = baker.bakeTile(alt.face, level, bx, by);
    const gi = Math.round(alt.u * D * TILE_RES - bx * TILE_RES);
    const gj = Math.round(alt.v * D * TILE_RES - by * TILE_RES);
    const hA = A.height[I(TILE_RES, j)];
    const hB = B.height[I(gi, gj)];
    worst = Math.max(worst, Math.abs(hA - hB));
    amp = Math.max(amp, Math.abs(hA));
  }
  check('cross-face edge heights agree (< 1 mm)', worst < 1e-3, `worst ${worst} m (amp ~${amp.toFixed(0)} m)`);
}

// ---- 4. accretion: child differs from upsampled parent only by its band ----
{
  const baker = makeBaker(body);
  const level = 9;
  const P = baker.bakeTile(3, level - 1, 3, 5);
  const C = baker.bakeTile(3, level, 6, 10);
  // child corner (2i,2j) coincides with parent corner (i,j) offset by child quadrant
  let maxDiff = 0;
  for (let j = 0; j <= TILE_RES; j += 2)
    for (let i = 0; i <= TILE_RES; i += 2) {
      const d = Math.abs(C.height[I(i, j)] - P.height[I(i / 2, j / 2)]);
      if (d > maxDiff) maxDiff = d;
    }
  // the level-9 band is dominated by fresh craters (depth ~ depthK * r can reach
  // ~250 m for the largest in-band crater); anything far beyond that would mean a
  // coarser band got re-stamped, which the accretion discipline forbids
  check('accretion bounded by band amplitude', maxDiff < 350, `max child-parent diff ${maxDiff.toFixed(2)} m`);
  check('accretion actually adds detail', maxDiff > 1e-4, `max diff ${maxDiff}`);
}

// ---- 4b. horizon field (Phase 1a): validity, seams, max-accretion ----
{
  const baker = makeBaker(body);
  const level = 6, f = 1, x = 20, y = 33;
  const A = baker.bakeTile(f, level, x, y);
  const B = baker.bakeTile(f, level, x + 1, y);
  // declared validity: halo 2 (reach-2 scan reads height to its halo-4 limit)
  let worst = 0;
  for (let o = 0; o < 8; o++)
    for (let j = -2; j <= TILE_RES + 2; j++)
      for (let i = TILE_RES + 1; i <= TILE_RES + 2; i++) {
        const d = Math.abs(A.fields['hor' + o][I(i, j)] - B.fields['hor' + o][I(i - TILE_RES, j)]);
        if (d > worst) worst = d;
      }
  check('horizon halo == neighbour interior (bit-exact to halo 2)', worst === 0, `worst ${worst}`);

  // max-accretion: at coincident corners a child's horizon can only grow
  const P = baker.bakeTile(f, level - 1, x >> 1, y >> 1);
  const C = A; // x,y even/odd handled via quadrant offset
  const ox = (x & 1) * 32, oy = (y & 1) * 32;
  let violations = 0, some = 0;
  for (let o = 0; o < 8; o++)
    for (let j = 0; j <= TILE_RES; j += 2)
      for (let i = 0; i <= TILE_RES; i += 2) {
        const pv = P.fields['hor' + o][I(ox + i / 2, oy + j / 2)];
        const cv = C.fields['hor' + o][I(i, j)];
        if (cv < pv - 1e-6) violations++;
        if (cv > 0.02) some++;
      }
  check('horizon max-accretion monotone (child >= inherited)', violations === 0, `${violations} cells shrank`);
  check('horizon field is non-trivial', some > 50, `${some} cells with sin > 0.02`);
}

// ---- 5. rocks are facts of the planet, not of the tile (§7) ----
{
  const baker = makeBaker(body);
  const rk = body.rocks;
  const lo = rk.minTileLevel, hi = lo + 1;
  const coarse = baker.bakeTile(5, lo, 100, 200);       // also the declared field tile
  const coarseSet = listRocks(coarse, coarse, body, 1e9);
  const fine = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const t = baker.bakeTile(5, hi, 200 + dx, 400 + dy);
    fine.push(...listRocks(t, coarse, body, 1e9));
  }
  // existence + lateral position must be identical whichever LOD renders them;
  // only the height snap refines with the raster
  const key = (r) => `${r.u},${r.v},${r.size}`;
  const fineKeys = new Set(fine.map(key));
  let missing = 0;
  for (const r of coarseSet) if (!fineKeys.has(key(r))) missing++;
  check('scatter LOD-independent (same rocks at both levels)',
    missing === 0 && coarseSet.length === fine.length,
    `coarse ${coarseSet.length} fine ${fine.length} missing ${missing}`);
  check('scatter produced rocks at all', coarseSet.length > 0, 'no rocks — density field empty?');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall tests passed');
process.exit(failures ? 1 : 0);
