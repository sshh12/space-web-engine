import { readPNG, luminance } from './png.mjs';

const cur = readPNG('bench/out/stills/loworbit-sunset.png');
const base = readPNG('bench/baseline/stills/loworbit-sunset.png');

function stats(img, x0,x1,y0,y1){
  const {width:W,height:H,channels:C,data}=img; let n=0,clip=0;
  for(let y=y0;y<Math.min(y1,H);y++) for(let x=x0;x<Math.min(x1,W);x++){
    const b=(y*W+x)*C; if(Math.max(data[b],data[b+1],data[b+2])>=254) clip++; n++;
  }
  const {lum,W:LW}=luminance(img); let sum=0,cnt=0;
  for(let y=y0;y<Math.min(y1,H);y++) for(let x=x0;x<Math.min(x1,LW);x++){ sum+=lum[y*LW+x]; cnt++; }
  return {clip254pct:(100*clip/n).toFixed(2), mean:(sum/cnt).toFixed(4), n};
}
function diffB(a,b,x0,x1,y0,y1){
  const {width:W,channels:C}=a; let d=0,n=0,maxd=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const off=(y*W+x)*C;
    for(let c=0;c<3;c++){ const dd=Math.abs(a.data[off+c]-b.data[off+c]); if(dd>0)d++; if(dd>maxd)maxd=dd; n++; } }
  return {diffpct:(100*d/n).toFixed(4), maxd, n};
}

// try candidate boxes around the visible sun bloom
const boxes = {
  'wide_sky_no_bloom_edges': [0,1280,0,540],
  'sun_bloom_tight': [430,830,120,520],
  'sun_bloom_wide': [330,930,50,560],
  'sun_core_disc': [560,700,260,420],
};
for (const [name,[x0,x1,y0,y1]] of Object.entries(boxes)) {
  console.log(name, 'cur', JSON.stringify(stats(cur,x0,x1,y0,y1)), 'base', JSON.stringify(stats(base,x0,x1,y0,y1)), 'diff', JSON.stringify(diffB(cur,base,x0,x1,y0,y1)));
}
