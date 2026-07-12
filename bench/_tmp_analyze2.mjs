import { readPNG } from './png.mjs';
import { resolve } from 'node:path';

const OUT = resolve('bench/out/motion');
function rawLum(img) {
  const { width: W, height: H, channels: C, data } = img;
  const lum = new Float32Array(W*H);
  for (let i=0;i<W*H;i++){
    const b=i*C;
    lum[i] = C>=3 ? 0.2126*data[b]+0.7152*data[b+1]+0.0722*data[b+2] : data[b];
  }
  return lum;
}
const N=36;
const lums=[];
for(let i=0;i<N;i++){
  const f=resolve(OUT,`cloud-drift-${String(i).padStart(2,'0')}.png`);
  lums.push(rawLum(readPNG(f)));
}
console.log('frame mean(0-255 raw luminance)');
for(let i=0;i<N;i++){
  let s=0; for(const v of lums[i]) s+=v;
  console.log(i, (s/lums[i].length).toFixed(2));
}
console.log('\ndiffs (raw 0-255):');
for(let i=1;i<N;i++){
  const a=lums[i-1], b=lums[i];
  let sumAbs=0,sumNet=0,changed=0,n=a.length;
  const deltas=new Float32Array(n);
  for(let k=0;k<n;k++){const d=b[k]-a[k]; deltas[k]=d; sumAbs+=Math.abs(d); sumNet+=d; if(Math.abs(d)>0.5) changed++;}
  const meanAbs=sumAbs/n, meanNet=sumNet/n;
  let within=0;
  for(let k=0;k<n;k++){const ad=Math.abs(deltas[k]); if(ad>=0.5*meanAbs && ad<=1.5*meanAbs) within++;}
  console.log(`${i-1}->${i}: changed=${(100*changed/n).toFixed(1)}% meanAbsDelta=${meanAbs.toFixed(1)} netMeanDelta=${meanNet.toFixed(1)} within[0.5x,1.5x of MEAN LUM]=${(100*within/n).toFixed(1)}%`);
}
