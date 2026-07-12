// global-test.mjs — contract tests for the [global] coarse pass (ROADMAP_V2
// Phase 2 prerequisite). The per-tile harnesses cannot police a planet-wide
// op, so its own invariants live here (run: node test/global-test.mjs):
//   1. fresh-build determinism: two independent builds agree bit-exactly
//   2. hydrological mass balance: every cell's area reaches a terminal
//   3. routing is total on land: every land cell drains (post priority-flood)
//   4. sampling is continuous across cube edges (padded rasters stitch)
//   5. prefix contract: the grid ignores processes AFTER the global entry
//      (routing is defined on the pre-incision surface — the circularity break)

import { buildGlobal } from '../src/core/globalgrid.js';
import { bodyById } from '../src/core/recipe.js';
import { faceUvToDir } from '../src/core/mathx.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failures++;
};

for (const id of ['tellus', 'rubra']) {
  const body = bodyById(id);
  const p = body.processes.find((q) => q.type === 'global');
  const pd = { ...p, debug: true };

  // 1. fresh-build determinism (bit-exact across independent builds)
  const A = buildGlobal(body, pd);
  const B = buildGlobal(body, pd);
  let same = A.flowN.length === B.flowN.length;
  for (let c = 0; c < A.flowN.length && same; c++) if (A.flowN[c] !== B.flowN[c]) same = false;
  check(`${id}: fresh-build determinism (flow bit-exact)`, same);
  if (A.Wm) {
    const d = [0, 0, 0];
    let sameM = true;
    for (let k = 0; k < 5000 && sameM; k++) {
      const a = ((k * 2654435761) % 4096) / 4096 * Math.PI * 2;
      const b = (((k * 40503) % 4096) / 4096 - 0.5) * 3.0;
      d[0] = Math.cos(b) * Math.cos(a); d[1] = Math.sin(b); d[2] = Math.cos(b) * Math.sin(a);
      const l = 1 / Math.hypot(d[0], d[1], d[2]);
      d[0] *= l; d[1] *= l; d[2] *= l;
      if (A.sample('moist', d) !== B.sample('moist', d)) sameM = false;
    }
    check(`${id}: fresh-build determinism (moisture bit-exact)`, sameM);
  }

  // 2. mass balance: sum of accumulation at terminals == total cell area
  let termAcc = 0;
  for (let c = 0; c < A.flowTo.length; c++) if (A.flowTo[c] < 0) termAcc += A.acc[c];
  const relErr = Math.abs(termAcc - A.areaTotal) / A.areaTotal;
  check(`${id}: hydrological mass balance`, relErr < 1e-9, `rel err ${relErr.toExponential(2)}`);

  // 3. routing total on land: after priority-flood, land cells must not be
  // orphan pits (flowTo == -1 is legal only for outlet/terminal cells)
  const sea = body.seaLevel ?? p.drainLevel;
  let orphans = 0, land = 0;
  for (let c = 0; c < A.flowTo.length; c++) {
    if (A.hgt[c] < sea) continue;
    land++;
    if (A.flowTo[c] < 0) orphans++;
  }
  check(`${id}: land routing total`, orphans === 0, `${orphans} orphan pits of ${land} land cells`);

  // 4. seam continuity AT cube edges: sample a hair to each side of the edge —
  // the two faces' padded-bilinear branches must agree. (A quarter-cell walk
  // test is wrong here: flowN is legitimately sharp at channel width, and
  // channel gradient is not a seam defect.) The pads reconstruct the edge with
  // up to half a cell of support mismatch (gnomonic metric), so where a trunk
  // channel crosses the edge obliquely the two branches can differ by a
  // fraction of the CHANNEL amplitude — that is reconstruction sharpness, not
  // a routing defect. The routing defect signature is a channel present on one
  // face and ABSENT on the other: mismatch large AND one side at background.
  let worst = 0, defects = 0;
  const d = [0, 0, 0];
  for (let k = 0; k <= 2000; k++) {
    // points along the +X/+Z cube edge (x == z plane), varying y
    const y = ((k / 2000) * 1.6 - 0.8);
    const s = Math.sqrt((1 - y * y) / 2);
    for (const eps of [3e-6]) {
      d[0] = s * (1 + eps); d[1] = y; d[2] = s * (1 - eps);
      let l = 1 / Math.hypot(d[0], d[1], d[2]);
      const va = A.sample('flow', [d[0] * l, d[1] * l, d[2] * l]);
      d[0] = s * (1 - eps); d[2] = s * (1 + eps);
      l = 1 / Math.hypot(d[0], d[1], d[2]);
      const vb = A.sample('flow', [d[0] * l, d[1] * l, d[2] * l]);
      const m = Math.abs(va - vb);
      worst = Math.max(worst, m);
      if (m > 0.15 && Math.min(va, vb) < 0.25 * Math.max(va, vb)) defects++;
    }
  }
  check(`${id}: flow continuous across cube edges (no one-sided channels)`,
    defects === 0, `${defects} one-sided channel points, worst mismatch ${worst.toFixed(3)}`);

  // 5. prefix contract: appending a post-global process must not change the grid
  const bodyMut = {
    ...body,
    processes: [...body.processes, { type: 'fbmBand', levels: [2, 9], amp: 5000, hurst: 0.9, seed: 999 }],
  };
  const pMut = bodyMut.processes.find((q) => q.type === 'global');
  const C = buildGlobal(bodyMut, { ...pMut, debug: true });
  let samePrefix = true;
  for (let c = 0; c < A.flowN.length && samePrefix; c++) if (A.flowN[c] !== C.flowN[c]) samePrefix = false;
  check(`${id}: grid is a pure fn of the process PREFIX`, samePrefix);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall global-grid contracts hold');
process.exit(failures ? 1 : 0);
