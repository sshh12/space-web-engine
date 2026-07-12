import { readPNG } from './png.mjs';

function regionStats(img, x0, x1, y0, y1) {
  const { width: W, height: H, channels: C, data } = img;
  let n = 0, clip254 = 0, white240 = 0, sum = 0;
  for (let y = y0; y < Math.min(y1, H); y++) {
    for (let x = x0; x < Math.min(x1, W); x++) {
      const b = (y * W + x) * C;
      const r = data[b], g = data[b + 1], bl = data[b + 2];
      const maxc = Math.max(r, g, bl);
      const minc = Math.min(r, g, bl);
      if (maxc >= 254) clip254++;
      if (minc >= 240) white240++; // "white" = all channels >=240 (desaturated)
      sum += (r + g + bl) / 3 / 255;
      n++;
    }
  }
  return { n, clip254pct: (100 * clip254 / n).toFixed(2), white240pct: (100 * white240 / n).toFixed(2), mean: (sum / n).toFixed(4) };
}

function regionStatsMaxOnly(img, x0, x1, y0, y1) {
  // alt definition: white240 = max channel >=240 (in case finding means max, not min)
  const { width: W, height: H, channels: C, data } = img;
  let n = 0, white240 = 0;
  for (let y = y0; y < Math.min(y1, H); y++) {
    for (let x = x0; x < Math.min(x1, W); x++) {
      const b = (y * W + x) * C;
      const r = data[b], g = data[b + 1], bl = data[b + 2];
      const maxc = Math.max(r, g, bl);
      if (maxc >= 240) white240++;
      n++;
    }
  }
  return { white240pct_maxdef: (100 * white240 / n).toFixed(2) };
}

const files = {
  cur: 'C:/dev/planet-render/bench/out/stills/loworbit-sunset.png',
  base: 'C:/dev/planet-render/bench/baseline/stills/loworbit-sunset.png',
  abOn: 'C:/dev/planet-render/bench/out/r15-ab-loworbit-sunset-on.png',
  abOff: 'C:/dev/planet-render/bench/out/r15-ab-loworbit-sunset-off.png',
  r15a: 'C:/dev/planet-render/bench/out/r15-a-loworbit-sunset.png',
  r15b: 'C:/dev/planet-render/bench/out/r15-b-loworbit-sunset.png',
};

const imgs = {};
for (const [k, p] of Object.entries(files)) {
  try { imgs[k] = readPNG(p); console.log(k, 'size', imgs[k].width, imgs[k].height); } catch (e) { console.log(k, 'ERR', e.message); }
}

console.log('\n--- planet band y540-780, full width ---');
for (const k of Object.keys(imgs)) {
  const im = imgs[k];
  console.log(k, JSON.stringify(regionStats(im, 0, im.width, 540, 780)), JSON.stringify(regionStatsMaxOnly(im, 0, im.width, 540, 780)));
}

console.log('\n--- lower-left limb x0-430,y600-780 ---');
for (const k of Object.keys(imgs)) {
  const im = imgs[k];
  console.log(k, JSON.stringify(regionStats(im, 0, 430, 600, 780)), JSON.stringify(regionStatsMaxOnly(im, 0, 430, 600, 780)));
}

console.log('\n--- sky_top (approx top 100px) ---');
for (const k of Object.keys(imgs)) {
  const im = imgs[k];
  console.log(k, JSON.stringify(regionStats(im, 0, im.width, 0, 100)));
}

console.log('\n--- using gamma-decoded luminance (2.2) for mean, matching metrics.mjs ---');
import { luminance } from './png.mjs';
function regionLumMean(img, x0, x1, y0, y1) {
  const { lum, W, H } = luminance(img);
  let n = 0, sum = 0;
  for (let y = y0; y < Math.min(y1, H); y++)
    for (let x = x0; x < Math.min(x1, W); x++) { sum += lum[y * W + x]; n++; }
  return (sum / n).toFixed(4);
}
for (const k of Object.keys(imgs)) {
  const im = imgs[k];
  console.log(k, 'planetband', regionLumMean(im, 0, im.width, 540, 780), 'lowerleft', regionLumMean(im, 0, 430, 600, 780));
}
