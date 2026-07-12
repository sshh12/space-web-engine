// contract-test.mjs — the process contract harness (ROADMAP_V2 Phase T).
// bake-test.mjs proves the invariants for the full pipeline at select tiles;
// this generalizes them into property tests that run against EVERY registered
// process, by baking cumulative process prefixes: if a seam breaks at prefix k
// the culprit is processes[k-1] by name. A new Phase 2/5 process cannot ship
// without passing a contract it never wrote.  (run: node test/contract-test.mjs)
//
// Per (body, prefix):
//   - determinism: two fresh bakers agree bit-exactly
//   - halo == neighbour interior (§3): heights to halo 4, fields to their
//     declared validity (standard fields halo 3, horizon octants halo 2)
//   - cross-face cube edge agreement (§3): stamps are 3D-pure, so a shared edge
//     vertex reads the same height whichever face bakes it
//   - finiteness: no process writes NaN/Inf into height or any field
//
// Runtime is bounded: one east-neighbour pair + one cube-edge probe per prefix.

import { makeBaker, TILE_RES, I } from '../src/bakecore.js';
import { SYSTEM } from '../src/recipe.js';
import { faceUvToDir, dirToFaceUv } from '../src/mathx.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) failures++;
};

const FIELD_HALO = { hor0: 2, hor1: 2, hor2: 2, hor3: 2, hor4: 2, hor5: 2, hor6: 2, hor7: 2 };
const DEFAULT_FIELD_HALO = 3;

function prefixBody(body, k) {
  return { ...body, id: `${body.id}~prefix${k}`, processes: body.processes.slice(0, k) };
}

function seamWorst(A, B) {
  let hWorst = 0;
  for (let j = -4; j <= TILE_RES + 4; j++)
    for (let i = TILE_RES + 1; i <= TILE_RES + 4; i++)
      hWorst = Math.max(hWorst, Math.abs(A.height[I(i, j)] - B.height[I(i - TILE_RES, j)]));
  let fWorst = 0, fName = '';
  for (const name of Object.keys(A.fields)) {
    const halo = FIELD_HALO[name] ?? DEFAULT_FIELD_HALO;
    for (let j = -halo; j <= TILE_RES + halo; j++)
      for (let i = TILE_RES + 1; i <= TILE_RES + halo; i++) {
        const d = Math.abs(A.fields[name][I(i, j)] - B.fields[name][I(i - TILE_RES, j)]);
        if (d > fWorst) { fWorst = d; fName = name; }
      }
  }
  return { hWorst, fWorst, fName };
}

// worst height mismatch along face 0's east cube edge, sampled at exact shared
// edge vertices (faceUvToDir(0,1,v)) and read from whichever neighbour face owns
// them — a 3D-pure stamp reads identically on both sides (bake-test §3 method)
function crossFaceWorst(baker, level) {
  const D = 1 << level;
  const A = baker.bakeTile(0, level, D - 1, Math.floor(D / 2));
  let worst = 0;
  for (let j = 0; j <= TILE_RES; j += 8) {
    const v = (Math.floor(D / 2) * TILE_RES + j) / (TILE_RES * D);
    const dir = faceUvToDir(0, 1, v);
    const alt = dirToFaceUv([dir[0] * (1 - 1e-12), dir[1], dir[2]]); // nudge off face 0
    if (alt.face === 0) continue;
    const bx = Math.min(Math.floor(alt.u * D), D - 1), by = Math.min(Math.floor(alt.v * D), D - 1);
    const B = baker.bakeTile(alt.face, level, bx, by);
    const gi = Math.round(alt.u * D * TILE_RES - bx * TILE_RES);
    const gj = Math.round(alt.v * D * TILE_RES - by * TILE_RES);
    worst = Math.max(worst, Math.abs(A.height[I(TILE_RES, j)] - B.height[I(gi, gj)]));
  }
  return worst;
}

// no process may write NaN/Inf (a universal correctness contract — a bad divide
// or log in a new process surfaces here before it can poison a render)
function nonFinite(tile) {
  for (let c = 0; c < tile.height.length; c++) if (!Number.isFinite(tile.height[c])) return 'height';
  for (const name of Object.keys(tile.fields))
    for (let c = 0; c < tile.fields[name].length; c++) if (!Number.isFinite(tile.fields[name][c])) return name;
  return null;
}

for (const body of SYSTEM.bodies) {
  const level = 5, f = 1, x = 10, y = 17;
  for (let k = 1; k <= body.processes.length; k++) {
    const pb = prefixBody(body, k);
    const pname = body.processes[k - 1].type;
    const tag = `${body.id}[0..${k - 1}] +${pname}`;

    const baker = makeBaker(pb);
    const A = baker.bakeTile(f, level, x, y);
    const B = baker.bakeTile(f, level, x + 1, y);
    const { hWorst, fWorst, fName } = seamWorst(A, B);
    check(`${tag}: halo == neighbour (height)`, hWorst === 0, `worst ${hWorst}`);
    check(`${tag}: halo == neighbour (fields)`, fWorst === 0, `worst ${fWorst} in '${fName}'`);

    const xf = crossFaceWorst(baker, 3);
    check(`${tag}: cross-face cube edge agrees (< 1 mm)`, xf < 1e-3, `worst ${xf} m`);

    const nf = nonFinite(A);
    check(`${tag}: all height/fields finite`, nf === null, `non-finite in '${nf}'`);

    const A2 = makeBaker(pb).bakeTile(f, level, x, y);
    let same = true;
    for (let c = 0; c < A.height.length && same; c++) if (A.height[c] !== A2.height[c]) same = false;
    for (const name of Object.keys(A.fields)) {
      if (!same) break;
      for (let c = 0; c < A.fields[name].length; c++)
        if (A.fields[name][c] !== A2.fields[name][c]) { same = false; break; }
    }
    check(`${tag}: deterministic rebake`, same);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall process contracts hold (halo, cross-face, finite, deterministic)');
process.exit(failures ? 1 : 0);
