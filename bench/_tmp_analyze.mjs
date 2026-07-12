import { readPNG, luminance } from './png.mjs';
import { resolve } from 'node:path';

const OUT = resolve('bench/out/motion');
const N = 36;
const lums = [];
for (let i = 0; i < N; i++) {
  const file = resolve(OUT, `cloud-drift-${String(i).padStart(2,'0')}.png`);
  const img = readPNG(file);
  lums.push(luminance(img));
}

console.log('frame, mean_lum');
for (let i = 0; i < N; i++) {
  const l = lums[i].lum;
  let sum = 0;
  for (let k = 0; k < l.length; k++) sum += l[k];
  console.log(i, (sum / l.length).toFixed(3));
}

console.log('\nframe-to-frame diffs:');
for (let i = 1; i < N; i++) {
  const a = lums[i-1].lum, b = lums[i].lum;
  let sumAbs = 0, sumNet = 0, n = a.length;
  let changedCount = 0;
  const deltas = [];
  for (let k = 0; k < n; k++) {
    const d = b[k] - a[k];
    sumAbs += Math.abs(d);
    sumNet += d;
    if (Math.abs(d) > 1e-6) changedCount++;
    deltas.push(d);
  }
  const meanAbs = sumAbs / n;
  const meanNet = sumNet / n;
  let within = 0;
  for (let k = 0; k < n; k++) {
    const ad = Math.abs(deltas[k]);
    if (ad >= 0.5*meanAbs && ad <= 1.5*meanAbs) within++;
  }
  console.log(`${i-1}->${i}: changed=${(100*changedCount/n).toFixed(1)}% meanAbsDelta=${meanAbs.toFixed(2)} netMeanDelta=${meanNet.toFixed(2)} within[0.5x,1.5x]=${(100*within/n).toFixed(1)}%`);
}
