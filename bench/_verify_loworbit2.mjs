import { readPNG } from './png.mjs';

const cur = readPNG('bench/out/stills/loworbit-sunset.png');
const base = readPNG('bench/baseline/stills/loworbit-sunset.png');

// byte-identical check for region above the planet band (y 0-539, full width) -- sky + sun bloom
function regionIdentical(a, b, x0, x1, y0, y1) {
  const { width: W, channels: C } = a;
  let diffs = 0, n = 0, maxdiff = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const off = (y * W + x) * C;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a.data[off + c] - b.data[off + c]);
        if (d > 0) diffs++;
        if (d > maxdiff) maxdiff = d;
        n++;
      }
    }
  }
  return { diffs, n, pct: (100 * diffs / n).toFixed(4), maxdiff };
}

console.log('full image (0,1280,0,780) byte diff:', JSON.stringify(regionIdentical(cur, base, 0, 1280, 0, 780)));
console.log('sky/bloom region (0,1280,0,540) byte diff:', JSON.stringify(regionIdentical(cur, base, 0, 1280, 0, 540)));
console.log('planet band region (0,1280,540,780) byte diff:', JSON.stringify(regionIdentical(cur, base, 0, 1280, 540, 780)));

// find bounding box of the sun bloom (bright pixels away from bottom-planet)
import { luminance } from './png.mjs';
const { lum, W, H } = luminance(cur);
let sumL=0,cnt=0,clip=0;
for (let y=0;y<540;y++) for (let x=0;x<W;x++){ sumL+=lum[y*W+x]; cnt++; }
console.log('sky_top(y0-540) mean lum', (sumL/cnt).toFixed(4));

// clip254 pct for sky region
function clip254pct(img, x0,x1,y0,y1){
  const {width:W,channels:C,data}=img; let n=0,c=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const b=(y*W+x)*C; if(Math.max(data[b],data[b+1],data[b+2])>=254) c++; n++; }
  return (100*c/n).toFixed(2);
}
console.log('cur sky clip254', clip254pct(cur,0,1280,0,540));
console.log('base sky clip254', clip254pct(base,0,1280,0,540));
