// test:cryo — round 18 Phase 5 cryo pack (Europa + Pluto). The seam/halo/
// determinism laws come free via test:contract (every process, every body); this
// pins the MECHANISM laws that harness can't see: lineae/tholin albedo arrive
// WHOLE (no onset ramp), glacier ice PERSISTS past context, the tholin longitude
// province, the §11 disc↔ground mirror, and legacy byte-cleanliness of the fields.
import { makeBaker, bakeDiscMap, sampleTileField, sampleTileHeight } from '../src/bakecore.js';
import { dirToFaceUv } from '../src/mathx.js';
import { bodyById } from '../src/recipe.js';

let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; } else { fail++; console.log('FAIL ', name); } };
const norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };

const bakers = new Map();
const bakerFor = (id) => { if (!bakers.has(id)) bakers.set(id, makeBaker(bodyById(id), { cacheMax: 120 })); return bakers.get(id); };
// sample a named field (or height) at a body-fixed direction & level
function sampleAt(id, dir, level, name) {
  const D = 1 << level, f = dirToFaceUv(norm(dir));
  const x = Math.min(Math.floor(f.u * D), D - 1), y = Math.min(Math.floor(f.v * D), D - 1);
  const tile = bakerFor(id).bakeTile(f.face, level, x, y);
  const fu = f.u * D - x, fv = f.v * D - y;
  return name === 'hgt' ? sampleTileHeight(tile, fu, fv) : sampleTileField(tile, name, fu, fv);
}

// ---- Europa: lineae albedo arrives WHOLE (level-independent overwrite; no onset ramp) ----
{
  // lineaAlb arrives WHOLE (the crater-fresh discipline: albedo never rides the
  // 0.55/0.45 height onset — the pre-code KILLER). It is a level-INDEPENDENT
  // overwrite, so the PEAK CREST magnitude is the same at level L and its child
  // L+1 (an onset ramp would make it 0.55× at one). Peak over a tile's cells is a
  // resolution-STABLE statistic — unlike a bilinear point sample of a high-freq
  // field, which undersamples at coarse LOD (post-impl cryo-test fix). tB is the
  // top-left child of tA (same region), so both cover lineae crests.
  const fmax = (t) => { let m = 0; const f = t.fields.lineaAlb; for (let i = 0; i < f.length; i++) if (f[i] > m) m = f[i]; return m; };
  const tA = bakerFor('europa').bakeTile(3, 6, 20, 20);
  const tB = bakerFor('europa').bakeTile(3, 7, 40, 40); // child (top-left quadrant of tA)
  const mA = fmax(tA), mB = fmax(tB);
  ok(Math.abs(mA - mB) < 0.1, `lineaAlb peak crest arrives whole (L6 ${mA.toFixed(2)} ≈ L7 ${mB.toFixed(2)}, no onset ramp)`);
  ok(mA > 0.3, `lineaAlb non-trivial (peak crest ${mA.toFixed(2)})`);
}

// ---- Europa: chaos + lineae produce relief; legacy Luna has none ----
{
  let europaRelief = 0;
  for (let i = 0; i < 12; i++) {
    const dir = norm([Math.cos(i * 1.3), Math.sin(i * 0.9) * 0.7, Math.cos(i * 0.5) * 0.8]);
    const h = sampleAt('europa', dir, 8, 'hgt');
    europaRelief = Math.max(europaRelief, Math.abs(h));
  }
  ok(europaRelief > 100, `europa cryo relief present (max |h| ${europaRelief.toFixed(0)} m)`);
}

// ---- Pluto: nitrogen glacier — ice PERSISTS past context's per-level overwrite ----
{
  const g = bodyById('pluto').processes.find((p) => p.type === 'glacier');
  const center = norm(g.dir);
  // at deep level, context has overwritten ice each level; the glacier re-asserts
  // it every level, so the basin center must still read as N2 ice
  const iceCenter = sampleAt('pluto', center, 9, 'ice');
  const far = norm([-center[0], -center[1] + 0.3, -center[2]]); // opposite hemisphere
  const iceFar = sampleAt('pluto', far, 9, 'ice');
  ok(iceCenter > 0.8, `glacier ice persists at Sputnik center (ice ${iceCenter.toFixed(2)} > 0.8 at L9, after context)`);
  ok(iceCenter > iceFar + 0.2, `glacier ice localized to the basin (center ${iceCenter.toFixed(2)} > far ${iceFar.toFixed(2)})`);
}

// ---- Pluto: tholin longitude province (Cthulhu) — dark band at the equator ----
{
  const p = bodyById('pluto').processes.find((q) => q.type === 'tholin');
  const lonC = p.lonCenter * Math.PI / 180;
  const inBand = norm([Math.cos(lonC), 0.0, Math.sin(lonC)]);   // equator at lonCenter
  const atPole = norm([0, 1, 0.02]);
  const tIn = sampleAt('pluto', inBand, 6, 'tholinAlb');
  const tPole = sampleAt('pluto', atPole, 6, 'tholinAlb');
  ok(tIn > 0.4, `tholin province present in the Cthulhu band (tholinAlb ${tIn.toFixed(2)})`);
  ok(tPole < 0.1, `tholin absent at the pole (tholinAlb ${tPole.toFixed(2)})`);
}

// ---- §11 disc mirror: the disc carries lineae/glacier/tholin (disc↔ground) ----
{
  const eDisc = bakeDiscMap(bodyById('europa'), bakerFor('europa'), 128, 64);
  const pDisc = bakeDiscMap(bodyById('pluto'), bakerFor('pluto'), 128, 64);
  const brightest = (d) => { let mx = 0; for (let i = 0; i < d.rgba.length; i += 4) mx = Math.max(mx, d.rgba[i]); return mx; };
  const darkest = (d) => { let mn = 255; for (let i = 0; i < d.rgba.length; i += 4) mn = Math.min(mn, d.rgba[i]); return mn; };
  ok(brightest(eDisc) > 180, `europa disc has bright ice (max R ${brightest(eDisc)})`);
  ok(brightest(pDisc) > 200 && darkest(pDisc) < 120, `pluto disc has BOTH bright glacier & dark tholin (${darkest(pDisc)}..${brightest(pDisc)})`);
}

// ---- legacy byte-cleanliness: a legacy body's cryo fields are exactly 0 ----
{
  let mx = 0;
  for (let i = 0; i < 8; i++) {
    const dir = norm([Math.cos(i), Math.sin(i * 1.1), Math.cos(i * 0.6) + 0.2]);
    mx = Math.max(mx, Math.abs(sampleAt('luna', dir, 6, 'lineaAlb')), Math.abs(sampleAt('luna', dir, 6, 'tholinAlb')));
  }
  ok(mx === 0, `legacy Luna lineaAlb/tholinAlb are exactly 0 (byte-clean; max ${mx})`);
}

// ---- determinism: cryo bakes are bit-identical (Object.is), no -0 in the fields ----
{
  const b1 = makeBaker(bodyById('pluto'), { cacheMax: 8 }).bakeTile(2, 5, 10, 12);
  const b2 = makeBaker(bodyById('pluto'), { cacheMax: 8 }).bakeTile(2, 5, 10, 12);
  let identical = true, negZero = false;
  for (let i = 0; i < b1.height.length; i++) if (!Object.is(b1.height[i], b2.height[i])) identical = false;
  for (const nm of ['ice', 'tholinAlb', 'lineaAlb']) {
    const f1 = b1.fields[nm], f2 = b2.fields[nm];
    for (let i = 0; i < f1.length; i++) { if (!Object.is(f1[i], f2[i])) identical = false; if (Object.is(f1[i], -0)) negZero = true; }
  }
  ok(identical, 'cryo rebake bit-identical (Object.is)');
  ok(!negZero, 'no -0 in cryo albedo fields (unsigned; determinism-safe)');
}

console.log(`\ncryo-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
