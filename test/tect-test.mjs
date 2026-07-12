// tect-test.mjs — round-12 oriented-structure mechanism contracts.
// Everything the contract harness cannot see: the WTA selection, the stress
// eigen-rule's SIGNS and AXES, the anchored-packet asymmetry, the bedform
// supply gate, the rift profile bounds, and the two-body negative controls.
// Run: npm run test:tect

import {
  makeBaker, TILE_RES, HALO, I,
  lowDegreeAxes, edificeSites, forEachBasin, stressSources, stressTensor,
  riftFrame, riftDepthAt,
} from '../src/core/bakecore.js';
import { bodyById } from '../src/core/recipe.js';
import { dirToFaceUv } from '../src/core/mathx.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const clone = (b) => ({ ...b, processes: b.processes.map((p) => ({ ...p })) });
const without = (b, type) => ({ ...b, processes: b.processes.filter((p) => p.type !== type) });

const rubra = bodyById('rubra');
const luna = bodyById('luna');
const tellus = bodyById('tellus');

// ---- 1. winner-take-all edifice selection ----
{
  const p = rubra.processes.find((q) => q.type === 'edifice');
  const sites = edificeSites(rubra, p);
  check('rubra WTA: exactly volN edifices', sites.length === p.volN, `n=${sites.length}`);
  const { a2 } = lowDegreeAxes(rubra.processes.find((q) => q.type === 'continents').seed);
  let minDot = 1, minSwell = Infinity;
  for (let i = 0; i < sites.length; i++) {
    const q2 = sites[i].v[0] * a2[0] + sites[i].v[1] * a2[1] + sites[i].v[2] * a2[2];
    minSwell = Math.min(minSwell, 1.5 * q2 * q2 - 0.5);
    for (let j = i + 1; j < sites.length; j++)
      minDot = Math.min(minDot, sites[i].v[0] * sites[j].v[0] + sites[i].v[1] * sites[j].v[1] + sites[i].v[2] * sites[j].v[2]);
  }
  check('rubra WTA: min separation honoured', minDot < Math.cos(p.sepDeg * Math.PI / 180) + 1e-9,
    `closest pair ${(Math.acos(Math.min(minDot, 1)) * 180 / Math.PI).toFixed(1)} deg`);
  check('rubra WTA: every edifice sits ON the swell (S>0)', minSwell > 0, `min S=${minSwell.toFixed(3)}`);
  const again = edificeSites(rubra, p);
  check('rubra WTA: deterministic re-derivation', JSON.stringify(sites) === JSON.stringify(again));
}

// ---- 2. the stress eigen-rule: signs and axes ----
{
  // swell source: on the dome flank, hoop extension must dominate and the
  // extension eigendirection must be TANGENTIAL (perpendicular to radial) —
  // grabens then run radial (Tharsis fans). At the periphery ring, radial
  // compression appears.
  const tp = rubra.processes.find((q) => q.type === 'tect');
  const src = stressSources(rubra, tp);
  const { a2 } = lowDegreeAxes(rubra.processes.find((q) => q.type === 'continents').seed);
  // a point ~35 deg off the +a2 pole (dome flank, |q2|~0.82)
  const g = Math.abs(a2[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let t1 = [g[1] * a2[2] - g[2] * a2[1], g[2] * a2[0] - g[0] * a2[2], g[0] * a2[1] - g[1] * a2[0]];
  const il = 1 / Math.hypot(...t1);
  t1 = t1.map((v) => v * il);
  const th = 35 * Math.PI / 180;
  const d = [
    a2[0] * Math.cos(th) + t1[0] * Math.sin(th),
    a2[1] * Math.cos(th) + t1[1] * Math.sin(th),
    a2[2] * Math.cos(th) + t1[2] * Math.sin(th),
  ];
  const t = stressTensor(d, { ...src, basins: [] }, {});
  const mid = (t.txx + t.tyy) / 2, q = Math.sqrt(((t.txx - t.tyy) / 2) ** 2 + t.txy ** 2);
  const hi = mid + q;
  check('swell flank: extension present (hoop)', hi > 0, `hi=${hi.toFixed(3)}`);
  // extension eigendirection vs the radial direction at d
  const phi = 0.5 * Math.atan2(2 * t.txy, t.txx - t.tyy);
  const ex = [
    t.e[0] * Math.cos(phi) + t.n[0] * Math.sin(phi),
    t.e[1] * Math.cos(phi) + t.n[1] * Math.sin(phi),
    t.e[2] * Math.cos(phi) + t.n[2] * Math.sin(phi),
  ];
  const q2d = d[0] * a2[0] + d[1] * a2[1] + d[2] * a2[2];
  let rad = [a2[0] - q2d * d[0], a2[1] - q2d * d[1], a2[2] - q2d * d[2]];
  const rl = 1 / Math.hypot(...rad);
  rad = rad.map((v) => v * rl);
  const align = Math.abs(ex[0] * rad[0] + ex[1] * rad[1] + ex[2] * rad[2]);
  check('swell flank: extension eigendir TANGENTIAL (graben runs radial)', align < 0.15,
    `|ext.radial|=${align.toFixed(3)}`);
}
{
  // basin source (Luna): interior compression, margin extension, both with a
  // RADIAL eigen-axis (ridges/rilles concentric)
  const tp = luna.processes.find((q) => q.type === 'tect');
  const src = stressSources(luna, tp);
  check('luna basins enumerated', src.basins.length > 0, `n=${src.basins.length}`);
  const b = src.basins.reduce((a, c) => (c.r > a.r ? c : a), src.basins[0]);
  // a point at 0.4 r_b (interior) and 1.1 r_b (margin), offset along a tangent
  const g = Math.abs(b.v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let tt = [g[1] * b.v[2] - g[2] * b.v[1], g[2] * b.v[0] - g[0] * b.v[2], g[0] * b.v[1] - g[1] * b.v[0]];
  const til = 1 / Math.hypot(...tt);
  tt = tt.map((v) => v * til);
  const at = (xr) => {
    const a = (xr * b.r) / luna.R;
    return [
      b.v[0] * Math.cos(a) + tt[0] * Math.sin(a),
      b.v[1] * Math.cos(a) + tt[1] * Math.sin(a),
      b.v[2] * Math.cos(a) + tt[2] * Math.sin(a),
    ];
  };
  const tIn = stressTensor(at(0.4), src, {});
  const loIn = (tIn.txx + tIn.tyy) / 2 - Math.sqrt(((tIn.txx - tIn.tyy) / 2) ** 2 + tIn.txy ** 2);
  check('basin interior: compression (wrinkle ridges)', loIn < 0, `lo=${loIn.toFixed(3)}`);
  const tRg = stressTensor(at(1.1), src, {});
  const hiRg = (tRg.txx + tRg.tyy) / 2 + Math.sqrt(((tRg.txx - tRg.tyy) / 2) ** 2 + tRg.txy ** 2);
  check('basin margin: extension (arcuate rilles)', hiRg > 0, `hi=${hiRg.toFixed(3)}`);
  // margin extension eigendirection must be RADIAL (rille runs concentric)
  const phi = 0.5 * Math.atan2(2 * tRg.txy, tRg.txx - tRg.tyy);
  const ex = [
    tRg.e[0] * Math.cos(phi) + tRg.n[0] * Math.sin(phi),
    tRg.e[1] * Math.cos(phi) + tRg.n[1] * Math.sin(phi),
    tRg.e[2] * Math.cos(phi) + tRg.n[2] * Math.sin(phi),
  ];
  const dm = at(1.1);
  const bd = dm[0] * b.v[0] + dm[1] * b.v[1] + dm[2] * b.v[2];
  let rad = [b.v[0] - bd * dm[0], b.v[1] - bd * dm[1], b.v[2] - bd * dm[2]];
  const rl2 = 1 / Math.hypot(...rad);
  rad = rad.map((v) => v * rl2);
  const align = Math.abs(ex[0] * rad[0] + ex[1] * rad[1] + ex[2] * rad[2]);
  check('basin margin: extension eigendir RADIAL (rille concentric)', align > 0.85,
    `|ext.radial|=${align.toFixed(3)}`);
}

// ---- 3. rift profile: bounds, taper, winner determinism ----
{
  const p = rubra.processes.find((q) => q.type === 'rift');
  const f = riftFrame(rubra, p);
  const f2 = riftFrame(rubra, p);
  check('rift frame deterministic', f === f2 || JSON.stringify(f) === JSON.stringify(f2));
  let dMax = 0, before = 0;
  for (let k = 0; k <= 400; k++) {
    const th = -0.1 + (1.1 * k) / 400;
    const d = [
      f.pole[0] * Math.cos(th) + f.u[0] * Math.sin(th),
      f.pole[1] * Math.cos(th) + f.u[1] * Math.sin(th),
      f.pole[2] * Math.cos(th) + f.u[2] * Math.sin(th),
    ];
    const v = riftDepthAt(d, f, p, rubra.R, p.seed | 0);
    dMax = Math.max(dMax, v);
    if (th < f.th0 - 0.06 || th > f.th1 + 0.06) before = Math.max(before, Math.abs(v));
  }
  check('rift depth bounded (<1.35x nominal)', dMax <= p.depth * 1.35, `max=${dMax.toFixed(0)}m`);
  check('rift reaches meaningful depth mid-arc', dMax >= p.depth * 0.7, `max=${dMax.toFixed(0)}m`);
  check('rift silent outside its arc', before === 0, `leak=${before.toFixed(1)}m`);
}

// ---- 4. bake-level A/B: stamps print, negative controls hold ----
const tileAt = (body, dir, level) => {
  const f = dirToFaceUv(dir);
  const D = 1 << level;
  const x = Math.min(Math.floor(f.u * D), D - 1), y = Math.min(Math.floor(f.v * D), D - 1);
  return { face: f.face, level, x, y };
};
const maxAbsDelta = (A, B) => {
  let m = 0;
  for (let j = 0; j <= TILE_RES; j++)
    for (let i = 0; i <= TILE_RES; i++) {
      const d = Math.abs(A.height[I(i, j)] - B.height[I(i, j)]);
      if (d > m) m = d;
    }
  return m;
};
{
  // Rubra: a level-2 tile over the largest edifice must rise ~H vs a no-
  // edifice bake; the same tile with rift removed must differ too (rift
  // crosses the dome region often — assert only the edifice delta).
  const p = rubra.processes.find((q) => q.type === 'edifice');
  const site = edificeSites(rubra, p).reduce((a, c) => (c.H > a.H ? c : a));
  const loc = tileAt(rubra, site.v, 2);
  const A = makeBaker(clone(rubra), { cacheMax: 24 }).bakeTile(loc.face, loc.level, loc.x, loc.y);
  const B = makeBaker(without(clone(rubra), 'edifice'), { cacheMax: 24 }).bakeTile(loc.face, loc.level, loc.x, loc.y);
  const dm = maxAbsDelta(A, B);
  check('edifice prints at its site (~H)', dm > site.H * 0.5 && dm < site.H * 1.6,
    `delta=${dm.toFixed(0)}m H=${site.H.toFixed(0)}m`);
  // youth rides the edifice (procAge closed-form re-derivation)
  let yMax = 0;
  for (let j = 0; j <= TILE_RES; j++)
    for (let i = 0; i <= TILE_RES; i++) yMax = Math.max(yMax, A.fields.youth[I(i, j)]);
  check('youth marks the edifice young', yMax > 0.6, `youth max=${yMax.toFixed(2)}`);
}
{
  // Luna negative control: a highlands tile far from every basin bakes
  // byte-identical with the tect process removed (kSw=0 -> basin agent only)
  const tp = luna.processes.find((q) => q.type === 'tect');
  const src = stressSources(luna, tp);
  // hunt a direction > 1.8 x r_b away from every basin
  let far = null;
  outer: for (let k = 0; k < 400; k++) {
    const u = (k * 0.618033988749895) % 1, v2 = ((k * 0.754877666) % 1);
    const lat = Math.asin(2 * u - 1), lon = 2 * Math.PI * v2;
    const d = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    for (const b of src.basins) {
      const arc = luna.R * Math.hypot(d[0] - b.v[0], d[1] - b.v[1], d[2] - b.v[2]);
      if (arc < 1.9 * b.r) continue outer;
    }
    far = d;
    break;
  }
  check('found a far-from-basins Luna probe dir', !!far);
  if (far) {
    const loc = tileAt(luna, far, 9);
    const A = makeBaker(clone(luna), { cacheMax: 24 }).bakeTile(loc.face, loc.level, loc.x, loc.y);
    const B = makeBaker(without(clone(luna), 'tect'), { cacheMax: 24 }).bakeTile(loc.face, loc.level, loc.x, loc.y);
    let same = true;
    for (let c = 0; c < A.height.length && same; c++) same = A.height[c] === B.height[c];
    check('luna highlands byte-identical with tect removed', same);
  }
}
{
  // Luna mascon: wrinkle ridges actually PRINT inside the largest basin at a
  // stamp band. Probe at 0.45 r_b OFF-CENTER — at the exact center the
  // radial frame degenerates and the law is silent BY DESIGN (omnidirectional
  // summit/center fabric guard).
  const tp = luna.processes.find((q) => q.type === 'tect');
  const src = stressSources(luna, tp);
  const b = src.basins.reduce((a, c) => (c.r > a.r ? c : a), src.basins[0]);
  const g2 = Math.abs(b.v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let tb = [g2[1] * b.v[2] - g2[2] * b.v[1], g2[2] * b.v[0] - g2[0] * b.v[2], g2[0] * b.v[1] - g2[1] * b.v[0]];
  const tbl = 1 / Math.hypot(...tb);
  tb = tb.map((v) => v * tbl);
  const oa = (0.45 * b.r) / luna.R;
  const dv = [
    b.v[0] * Math.cos(oa) + tb[0] * Math.sin(oa),
    b.v[1] * Math.cos(oa) + tb[1] * Math.sin(oa),
    b.v[2] * Math.cos(oa) + tb[2] * Math.sin(oa),
  ];
  const loc = tileAt(luna, dv, 9); // band 8 stamped 0.55 at 8, completes at 9
  const A = makeBaker(clone(luna), { cacheMax: 24 }).bakeTile(loc.face, loc.level, loc.x, loc.y);
  const B = makeBaker(without(clone(luna), 'tect'), { cacheMax: 24 }).bakeTile(loc.face, loc.level, loc.x, loc.y);
  const dm = maxAbsDelta(A, B);
  check('wrinkle ridges print inside the mascon', dm > tp.ridgeAmp * 0.15,
    `delta=${dm.toFixed(1)}m (ridgeAmp=${tp.ridgeAmp})`);
  check('ridge amplitude bounded', dm < tp.ridgeAmp * 2.5, `delta=${dm.toFixed(1)}m`);
}
{
  // Bedforms: dunes print where fines+wind allow, and a fines-free ridge
  // tile is byte-identical with bedforms removed (the supply gate).
  const bakerA = makeBaker(clone(rubra), { cacheMax: 200 });
  const bakerB = makeBaker(without(clone(rubra), 'bedforms'), { cacheMax: 200 });
  // hunt at level 11 (band 10 complete + band 11 onset): rank tiles by the
  // process's OWN gate input — max(fines, regK·leeLowland) — so the finder
  // sees the same supply the stamp does (incl. the round-12 regional erg
  // term); the control needs the gate CLOSED at every interior cell.
  const bp = rubra.processes.find((q) => q.type === 'bedforms');
  const gateIn = (t, c) => {
    const reg = (bp.regK ?? 0)
      * (1 - Math.min(Math.max((t.fields.uplift[c] - 0.05) / 0.3, 0), 1))
      * (0.35 + 0.65 * Math.min(Math.max((-t.fields.windExpo[c]) / 0.45, 0), 1));
    return Math.max(t.fields.fines[c], reg);
  };
  let dune = null, bare = null;
  for (let k = 0; k < 300 && (!dune || !bare); k++) {
    const u = (k * 0.618033988749895) % 1, v2 = ((k * 0.754877666) % 1);
    const lat = Math.asin(2 * (u - 0.5)) * 0.7, lon = 2 * Math.PI * v2;
    const d = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    const loc = tileAt(rubra, d, 11);
    const t = bakerA.bakeTile(loc.face, loc.level, loc.x, loc.y);
    let gMean = 0, gMax = 0, wMean = 0, n = 0;
    for (let j = 0; j <= TILE_RES; j += 2)
      for (let i = 0; i <= TILE_RES; i += 2) {
        const c = I(i, j);
        const gi = gateIn(t, c);
        gMean += gi;
        if (gi > gMax) gMax = gi;
        wMean += Math.hypot(t.fields.windX[c], t.fields.windY[c], t.fields.windZ[c]);
        n++;
      }
    gMean /= n; wMean /= n;
    if (!dune && gMean > 0.12 && wMean > 0.3) dune = loc;
    if (!bare && gMax < 0.05) bare = loc;
  }
  check('found a dune-candidate tile (fines+wind)', !!dune);
  check('found a fines-free control tile', !!bare);
  if (dune) {
    const A = bakerA.bakeTile(dune.face, dune.level, dune.x, dune.y);
    const B = bakerB.bakeTile(dune.face, dune.level, dune.x, dune.y);
    const dm = maxAbsDelta(A, B);
    check('bedforms print where sand can accumulate', dm > 1.5, `delta=${dm.toFixed(1)}m`);
    check('bedform amplitude bounded (< aspect*lam*1.7)', dm < bp.aspect * bp.lamK * (Math.PI / 2 * rubra.R / (64 << 10)) * 1.7,
      `delta=${dm.toFixed(1)}m`);
  }
  if (bare) {
    const A = bakerA.bakeTile(bare.face, bare.level, bare.x, bare.y);
    const B = bakerB.bakeTile(bare.face, bare.level, bare.x, bare.y);
    let same = true;
    for (let c = 0; c < A.height.length && same; c++) same = A.height[c] === B.height[c];
    check('fines-free tile byte-identical with bedforms removed', same);
  }
}
{
  // Tellus: the ice-gated megadune entry must not fire outside ice, and the
  // dry gate must keep dunes out of the rainforest (moist high).
  const bakerA = makeBaker(clone(tellus), { cacheMax: 120 });
  const bakerB = makeBaker({
    ...tellus,
    processes: tellus.processes.filter((p) => p.type !== 'bedforms'),
  }, { cacheMax: 120 });
  let wet = null;
  for (let k = 0; k < 240 && !wet; k++) {
    const u = (k * 0.618033988749895) % 1, v2 = ((k * 0.754877666) % 1);
    const lat = Math.asin(2 * (u - 0.5)) * 0.35, lon = 2 * Math.PI * v2; // tropics
    const d = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    const loc = tileAt(tellus, d, 11);
    const t = bakerA.bakeTile(loc.face, loc.level, loc.x, loc.y);
    let mMean = 0, hMean = 0, iMean = 0, n = 0;
    for (let j = 0; j <= TILE_RES; j += 4)
      for (let i = 0; i <= TILE_RES; i += 4) {
        const c = I(i, j);
        mMean += t.fields.moist[c]; iMean += t.fields.ice[c]; hMean += t.height[c];
        n++;
      }
    mMean /= n; hMean /= n; iMean /= n;
    if (mMean > 0.45 && hMean > 50 && iMean < 0.05) wet = loc;
  }
  check('found a wet lowland Tellus tile', !!wet);
  if (wet) {
    const A = bakerA.bakeTile(wet.face, wet.level, wet.x, wet.y);
    const B = bakerB.bakeTile(wet.face, wet.level, wet.x, wet.y);
    let same = true;
    for (let c = 0; c < A.height.length && same; c++) same = A.height[c] === B.height[c];
    check('rainforest byte-identical with bedforms removed (dry gate)', same);
  }
}

// ---- 5. wind field invariants (the [global] extension) ----
{
  const { buildGlobal, clearGlobalCache } = await import('../src/core/globalgrid.js');
  const gp = rubra.processes.find((q) => q.type === 'global');
  clearGlobalCache();
  const g1 = buildGlobal({ ...rubra }, { ...gp, debug: true });
  clearGlobalCache();
  const g2 = buildGlobal({ ...rubra }, { ...gp, debug: true });
  check('wind grid exists on rubra', g1.hasWind === true);
  // determinism: sampled field bit-exact across fresh builds
  let det = true, cap = true, expoOk = true, seam = 0;
  const wCap = 1.6 * (gp.wind.speed ?? 1) + 1e-6;
  for (let k = 0; k < 4000; k++) {
    const u = (k * 0.618033988749895) % 1, v2 = ((k * 0.754877666) % 1);
    const lat = Math.asin(2 * u - 1), lon = 2 * Math.PI * v2;
    const d = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    const w1 = [g1.sample('windX', d), g1.sample('windY', d), g1.sample('windZ', d)];
    const w2 = [g2.sample('windX', d), g2.sample('windY', d), g2.sample('windZ', d)];
    if (w1[0] !== w2[0] || w1[1] !== w2[1] || w1[2] !== w2[2]) det = false;
    if (Math.hypot(...w1) > wCap * 1.02) cap = false;
    const e = g1.sample('windExpo', d);
    if (!(e >= -1.0001 && e <= 1.0001)) expoOk = false;
  }
  check('wind fresh-build determinism (bit-exact)', det);
  check('|wind| respects the cap', cap);
  check('windExpo in [-1,1]', expoOk);
  // cube-edge continuity: walk across a face edge, sampled field must move
  // smoothly (padded rasters are seamless by construction — verify anyway)
  for (let k = 0; k < 200; k++) {
    const t = -0.02 + 0.04 * (k / 199);
    // a walk crossing the +x/+y face edge region: rotate a unit vector
    const d = [Math.cos(Math.PI / 4 + t), Math.sin(Math.PI / 4 + t) * Math.cos(0.3), Math.sin(Math.PI / 4 + t) * Math.sin(0.3)];
    const il = 1 / Math.hypot(...d);
    const dn = d.map((q) => q * il);
    const w = g1.sample('windX', dn);
    if (k > 0) seam = Math.max(seam, Math.abs(w - seamPrev));
    var seamPrev = w;
  }
  check('wind continuous across cube edges', seam < 0.08, `max step=${seam.toFixed(4)}`);
  // the moisture pass must be bit-identical with and without the wind config
  clearGlobalCache();
  const gNoWind = buildGlobal({ ...rubra }, { ...gp, wind: undefined, debug: true });
  let flowSame = true;
  for (let k = 0; k < 2000; k++) {
    const u = (k * 0.618033988749895) % 1, v2 = ((k * 0.754877666) % 1);
    const lat = Math.asin(2 * u - 1), lon = 2 * Math.PI * v2;
    const d = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    if (g1.sample('flow', d) !== gNoWind.sample('flow', d)) flowSame = false;
  }
  check('flow bit-identical with wind config toggled', flowSame);
  clearGlobalCache();
}

// ---- round 14 (R6): the stress-basin and provinces-mare populations UNIFY
// through forEachBasin's per-basin fill law. Metric checks, not truthy cells
// (panel M2): every fill-bearing basin carries mare at its centre, coverage
// stays bounded, and Rubra (no basinFill scalar) is structurally untouched.
{
  const baker = makeBaker(luna, { cacheMax: 64 });
  const sampleMare = (dirV) => {
    const r = dirToFaceUv(dirV);
    const D = 4;
    const x = Math.min(D - 1, Math.floor(r.u * D)), y = Math.min(D - 1, Math.floor(r.v * D));
    const t = baker.bakeTile(r.face, 2, x, y);
    const i = Math.round((r.u * D - x) * TILE_RES), j = Math.round((r.v * D - y) * TILE_RES);
    return t.fields.mare[I(i, j)];
  };
  const basins = [];
  forEachBasin(luna, (b) => basins.push(b));
  check('R6: luna basin population non-empty, fill law in [0,1]',
    basins.length > 0 && basins.every((b) => b.fill >= 0 && b.fill <= 1));
  let dry = 0;
  for (const b of basins) if (b.fill > 0.15 && sampleMare(b.v) < 0.6 * b.fill) dry++;
  check('R6: every fill-bearing mascon basin carries mare at its centre (co-location)',
    dry === 0, `${dry}/${basins.length} dry`);
  // coverage bound: the failure mode a truthy-cell check would miss is the
  // basin term flooding the highlands — mare fraction must stay lunar
  let mareCells = 0, n = 0;
  for (let k = 0; k < 400; k++) {
    const u = (k * 0.618033988749895) % 1, v2 = (k * 0.754877666) % 1;
    const lat = Math.asin(2 * u - 1), lon = 2 * Math.PI * v2;
    const d = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    if (sampleMare(d) > 0.3) mareCells++;
    n++;
  }
  check('R6: luna mare coverage bounded (2-45%)',
    mareCells / n > 0.02 && mareCells / n < 0.45, `${(100 * mareCells / n).toFixed(1)}%`);
  // Rubra control: no basinFill scalar -> the basin loop never runs (K4)
  const rubraProv = rubra.processes.find((q) => q.type === 'provinces');
  check('R6: rubra provinces has NO basinFill (structural negative control, K4)',
    !(rubraProv.basinFill > 0));
}

console.log('');
if (failures) {
  console.error(`${failures} tect/bedform contract(s) FAILED`);
  process.exit(1);
}
console.log('all oriented-structure contracts hold');
