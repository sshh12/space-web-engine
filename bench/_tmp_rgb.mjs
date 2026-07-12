import { readPNG } from './png.mjs';
import { resolve } from 'node:path';
const OUT = resolve('bench/out/motion');
for (const i of [17,18,19,20,21,22,23,24,25,26,27,28]) {
  const f = resolve(OUT, `cloud-drift-${String(i).padStart(2,'0')}.png`);
  const img = readPNG(f);
  const { width:W, height:H, channels:C, data } = img;
  let r=0,g=0,b=0, n=W*H;
  for (let k=0;k<n;k++){ const o=k*C; r+=data[o]; g+=data[o+1]; b+=data[o+2]; }
  r/=n; g/=n; b/=n;
  const sat = (Math.max(r,g,b)-Math.min(r,g,b))/(Math.max(r,g,b)+1e-6);
  console.log(`frame ${i}: R=${r.toFixed(1)} G=${g.toFixed(1)} B=${b.toFixed(1)}  B/R=${(b/r).toFixed(3)}  chromaSpread=${(Math.max(r,g,b)-Math.min(r,g,b)).toFixed(1)}`);
}
