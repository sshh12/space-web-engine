import { makeBaker, bakeDiscMap } from '../src/bakecore.js';
import { bodyById, assertPaletteRecipe, assertGiantRecipe, assertRingRecipe, assertGiantSystem } from '../src/recipe.js';
import { makeCloudKeyframes, assertCloudRecipe } from '../src/cloudcore.js';
assertGiantSystem();
for (const id of ['titan', 'venus', 'saturn', 'europa', 'pluto']) {
  const b = bodyById(id);
  try {
    assertPaletteRecipe(b);
    if (b.clouds) assertCloudRecipe(b);
    assertGiantRecipe(b); assertRingRecipe(b); // round 18 (M5 no silent caps)
    const baker = makeBaker(b, { cacheMax: 32 });
    const m = bakeDiscMap(b, baker, 64, 32);
    let mn = [9, 9, 9], mx = [0, 0, 0], sum = [0, 0, 0], n = 0, amaxA = 0;
    for (let i = 0; i < m.rgba.length; i += 4) { for (let c = 0; c < 3; c++) { const v = m.rgba[i + c] / 255; mn[c] = Math.min(mn[c], v); mx[c] = Math.max(mx[c], v); sum[c] += v; } amaxA = Math.max(amaxA, m.rgba[i + 3]); n++; }
    console.log(`${id}: disc OK  mean [${(sum[0] / n).toFixed(3)},${(sum[1] / n).toFixed(3)},${(sum[2] / n).toFixed(3)}]  max [${mx.map((v) => v.toFixed(2)).join(',')}]  maxAlpha ${amaxA}`);
  } catch (e) { console.log(`${id}: THREW ${e.message}`); }
}
// Venus cloud raster sanity (near-total overcast, F1-exempt)
try {
  const kf = makeCloudKeyframes(bodyById('venus'), 3, null, null);
  let s = 0, n = kf.rgba.length / 4;
  for (let i = 0; i < kf.rgba.length; i += 4) s += kf.rgba[i] / 255;
  console.log(`venus cloud deck mean cov = ${(s / n).toFixed(3)} (design: near-total ~1)`);
} catch (e) { console.log('venus clouds THREW ' + e.message); }
