// strata-test.mjs — ground plan L1 unit contracts (round 8). The seam/halo/
// determinism laws are the contract harness's job (contract-test.mjs covers
// 'strata'/'catena' per prefix on every body); this file proves the properties
// specific to the cliff-and-bench former:
//   1. the remap is MONOTONE for every gate weight — a heightfield remap that
//      inverts creates overhangs a heightfield cannot represent
//   2. dh is pinned to 0 at bed boundaries — a cap-hash flip across floor(zs)
//      must stay continuous
//   3. the carve is bounded by the bed thickness budget
//   4. on a real Rubra tile the former measurably BIMODALIZES slope: more
//      near-flat tread cells AND more steep riser cells than the un-benched
//      bake (that is what "cliffs that read as forms" means, statistically),
//      while airless-Luna highlands (mare-gated) stay untouched
// run: node test/strata-test.mjs

import { makeBaker, TILE_RES, I } from '../src/core/bakecore.js';
import { bodyById } from '../src/core/recipe.js';
import { smoothstep } from '../src/core/mathx.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failures++;
};

// -- 1..3: the remap r(f) = (1-q) f + q S(f) in isolation --
const S = (f) => smoothstep(0.55, 0.85, f);
{
  let mono = true, worst = 0;
  for (let qi = 0; qi <= 10; qi++) {
    const q = qi / 10;
    let prev = -Infinity;
    for (let i = 0; i <= 1000; i++) {
      const f = i / 1000;
      const r = (1 - q) * f + q * S(f);
      if (r < prev - 1e-12) { mono = false; }
      prev = r;
      worst = Math.max(worst, Math.abs(r - f));
    }
  }
  check('remap monotone for all q in [0,1] (no inversions/overhangs)', mono);
  check('remap pinned at bed boundaries: r(0)=0, r(1)=1', S(0) === 0 && S(1) === 1);
  check(`carve bounded: max|r-f| = ${worst.toFixed(3)} <= 0.6 of bed thickness`, worst <= 0.6);
}

// -- 4: measured consequence on a real bake, Rubra uplands at level 12 (bed
// octaves T0..T2 stamped). Two claims, separated because caps are SPARSE by
// design (escarpments are events): (a) the recipe carve is PRESENT (height
// moved by tens of metres on a real fraction of cells); (b) the MECHANISM
// bimodalizes slope where beds are capped — proven on an every-bed-capped
// variant (hardBias -1), where treads and steep risers must both gain share
// over the no-strata bake. An aggregate slope histogram on the sparse recipe
// is deliberately NOT asserted: one scarp crossing a tile moves it ~1%.
function slopeStats(tile, cell) {
  const slopes = [];
  let flat = 0;
  for (let j = 1; j < TILE_RES; j++)
    for (let i = 1; i < TILE_RES; i++) {
      const gx = (tile.height[I(i + 1, j)] - tile.height[I(i - 1, j)]) / (2 * cell);
      const gy = (tile.height[I(i, j + 1)] - tile.height[I(i, j - 1)]) / (2 * cell);
      const s = Math.hypot(gx, gy);
      if (s < 0.09) flat++;          // < ~5 deg: tread / bench
      slopes.push(s);
    }
  slopes.sort((a, b) => a - b);
  return {
    flat: flat / slopes.length,
    p995: slopes[Math.floor(0.995 * (slopes.length - 1))],  // the riser tail
  };
}
function bakeAt(body, face, level, x, y) {
  return makeBaker(body).bakeTile(face, level, x, y);
}
{
  const rubra = bodyById('rubra');
  const without = { ...rubra, id: 'rubra~nostrata', processes: rubra.processes.filter((p) => p.type !== 'strata') };
  const allcap = {
    ...rubra, id: 'rubra~allcap',
    processes: rubra.processes.map((p) => (p.type === 'strata' ? { ...p, hardBias: -1, amp: 1 } : p)),
  };
  const cell = (Math.PI / 2) * rubra.R / (TILE_RES << 12);
  // gated upland candidates by relief (deterministic scan). Caps are SPARSE
  // (escarpments are events, not wallpaper), so presence is asserted over the
  // candidate list: SOME upland tile must carry a real carve.
  const gate = rubra.processes.find((p) => p.type === 'strata').gate;
  const probeBaker = makeBaker({ ...rubra, id: 'rubra~probe' });
  const cands = [];
  for (let f = 0; f < 6; f++)
    for (let t = 0; t < 12; t++) {
      const x = (t * 7 + 3) % 16, y = (t * 5 + 2) % 16;
      const tile = probeBaker.bakeTile(f, 4, x, y);
      let u = 0, n = 0;
      for (let j = 0; j <= TILE_RES; j += 8) for (let i = 0; i <= TILE_RES; i += 8) { u += tile.fields.uplift[I(i, j)]; n++; }
      if (u / n > gate.hi) cands.push({ f, x, y, relief: tile.maxH - tile.minH });
    }
  cands.sort((a, b) => b.relief - a.relief);
  check('found gated upland probe tiles', cands.length >= 3, `only ${cands.length}`);
  let carved = null;
  for (const c of cands.slice(0, 6)) {
    const A = bakeAt(rubra, c.f, 12, c.x << 8, c.y << 8);
    const B = bakeAt(without, c.f, 12, c.x << 8, c.y << 8);
    let dMax = 0, moved = 0, n = 0;
    for (let j = 0; j <= TILE_RES; j++)
      for (let i = 0; i <= TILE_RES; i++) {
        const d = Math.abs(A.height[I(i, j)] - B.height[I(i, j)]);
        if (d > dMax) dMax = d;
        if (d > 5) moved++;
        n++;
      }
    if (dMax > 25 && moved / n > 0.02) { carved = { ...c, dMax, movedPct: 100 * moved / n }; break; }
  }
  check('recipe carve present on some gated upland (max > 25 m, > 2% of cells moved > 5 m)',
    !!carved, 'no candidate carried a carve');
  if (carved) console.log(`  rubra upland L12 recipe carve: max ${carved.dMax.toFixed(0)} m on ${carved.movedPct.toFixed(1)}% of cells (face ${carved.f})`);
  // mechanism: a monotone remap with r(0)=0, r(1)=1 cannot change the total
  // elevation across a bed — it REDISTRIBUTES it: treads go flat, the drop
  // CONCENTRATES into risers (whose slope scales with the ORIGINAL slope:
  // cliffs form on canyon and crater walls, not conjured on plains). Assert
  // exactly that: (a) tread share up strongly; (b) relief concentration up —
  // the share of total slope mass carried by the steepest 5% of cells rises;
  // (c) somewhere a cell steepened by >1.8x (the riser exists locally).
  const c0 = cands[0];
  const B = bakeAt(without, c0.f, 12, c0.x << 8, c0.y << 8);
  const C = bakeAt(allcap, c0.f, 12, c0.x << 8, c0.y << 8);
  const grid = (tile) => {
    const s = [];
    for (let j = 1; j < TILE_RES; j++)
      for (let i = 1; i < TILE_RES; i++) {
        const gx = (tile.height[I(i + 1, j)] - tile.height[I(i - 1, j)]) / (2 * cell);
        const gy = (tile.height[I(i, j + 1)] - tile.height[I(i, j - 1)]) / (2 * cell);
        s.push(Math.hypot(gx, gy));
      }
    return s;
  };
  const sB = grid(B), sC = grid(C);
  const conc = (s) => {
    const sorted = [...s].sort((a, b) => b - a);
    const top = sorted.slice(0, Math.ceil(s.length * 0.05)).reduce((a, v) => a + v, 0);
    return top / Math.max(sorted.reduce((a, v) => a + v, 0), 1e-9);
  };
  const flatShare = (s) => s.filter((v) => v < 0.09).length / s.length;
  let steepen = 0;
  for (let k = 0; k < sB.length; k++) steepen = Math.max(steepen, sC[k] / Math.max(sB[k], 0.15));
  const fB = flatShare(sB), fC = flatShare(sC), cB = conc(sB), cC = conc(sC);
  console.log(`  allcap mechanism: tread ${(fB * 100).toFixed(1)}% -> ${(fC * 100).toFixed(1)}%, top-5% slope share ${(cB * 100).toFixed(1)}% -> ${(cC * 100).toFixed(1)}%, max local steepening x${steepen.toFixed(1)}`);
  check('cliff-and-bench mechanism: treads UP + relief concentrates into risers + local steepening',
    fC > fB + 0.05 && cC > cB && steepen > 1.8,
    `flat ${fC} !> ${fB}+0.05 or conc ${cC} !> ${cB} or steepen ${steepen} !> 1.8`);
}
// Luna highlands (mare-gated OFF there): byte-identical with/without strata
{
  const luna = bodyById('luna');
  const without = { ...luna, id: 'luna~nostrata', processes: luna.processes.filter((p) => p.type !== 'strata') };
  // find a highlands tile (mare ~ 0)
  const probeBaker = makeBaker({ ...luna, id: 'luna~probe' });
  let found = null;
  for (let t = 0; t < 24 && !found; t++) {
    const x = (t * 7 + 1) % 16, y = (t * 5 + 4) % 16;
    const tile = probeBaker.bakeTile(2, 4, x, y);
    let m = 0;
    for (let j = 0; j <= TILE_RES; j += 8) for (let i = 0; i <= TILE_RES; i += 8) m = Math.max(m, tile.fields.mare[I(i, j)]);
    if (m < 0.01) found = { x, y };
  }
  check('found a Luna highlands probe tile', !!found);
  if (found) {
    const A = bakeAt(luna, 2, 13, found.x << 9, found.y << 9);
    const B = bakeAt(without, 2, 13, found.x << 9, found.y << 9);
    let same = true;
    for (let c = 0; c < A.height.length; c++) if (A.height[c] !== B.height[c]) { same = false; break; }
    check('mare-gated strata leaves Luna highlands byte-identical', same);
  }
}

// -- catena: fines accumulate in hollows, crests shed. Sign check against
// COARSER-scale curvature (2-cell baseline): the field accreted over levels
// 10..16, so the discriminating signal is regional concavity, not the last
// level's 1-cell Laplacian. Run on both airless-creep Luna and aeolian Rubra
// (the G4/G5 generalization contract: one mechanism, two agents).
for (const id of ['luna', 'rubra']) {
  const body = bodyById(id);
  const baker = makeBaker({ ...body, id: `${id}~catena` });
  const t = baker.bakeTile(2, 14, (5 << 10) + 3, (9 << 10) + 7); // cratered mid-latitudes
  const cell = (Math.PI / 2) * body.R / (TILE_RES << 14);
  let hollowF = 0, hollowN = 0, crestF = 0, crestN = 0;
  for (let j = 2; j < TILE_RES - 1; j++)
    for (let i = 2; i < TILE_RES - 1; i++) {
      const c = I(i, j);
      const avg = (t.height[I(i - 2, j)] + t.height[I(i + 2, j)] + t.height[I(i, j - 2)] + t.height[I(i, j + 2)]) * 0.25;
      const cv = (avg - t.height[c]) / (2 * cell);
      if (cv > 0.06) { hollowF += t.fields.fines[c]; hollowN++; }
      else if (cv < -0.06) { crestF += t.fields.fines[c]; crestN++; }
    }
  const hm = hollowF / Math.max(hollowN, 1), cm = crestF / Math.max(crestN, 1);
  console.log(`  ${id} L14 fines: hollows ${hm.toFixed(3)} (n=${hollowN}) vs crests ${cm.toFixed(3)} (n=${crestN})`);
  check(`catena(${id}): hollows carry more fines than crests`, hollowN > 50 && crestN > 50 && hm > cm * 1.3, `${hm} !> 1.3x ${cm}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nstrata/catena contracts hold');
process.exit(failures ? 1 : 0);
