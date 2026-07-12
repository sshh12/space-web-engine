import { readPNG, luminance } from './png.mjs';

function regionStats(img, x0, x1, y0, y1) {
  const { width: W, height: H, channels: C, data } = img;
  let n = 0, clip254 = 0, white240 = 0;
  for (let y = y0; y < Math.min(y1, H); y++) {
    for (let x = x0; x < Math.min(x1, W); x++) {
      const b = (y * W + x) * C;
      const r = data[b], g = data[b + 1], bl = data[b + 2];
      const maxc = Math.max(r, g, bl);
      const minc = Math.min(r, g, bl);
      if (maxc >= 254) clip254++;
      if (minc >= 240) white240++;
      n++;
    }
  }
  const { lum, W: LW } = luminance(img);
  let sum = 0, cnt = 0;
  for (let y = y0; y < Math.min(y1, H); y++)
    for (let x = x0; x < Math.min(x1, LW); x++) { sum += lum[y * LW + x]; cnt++; }
  return { clip254pct: (100 * clip254 / n).toFixed(2), white240pct: (100 * white240 / n).toFixed(2), lumMean: (sum / cnt).toFixed(4) };
}

const files = {
  live2_true: 'bench/out/_live2-loworbit-sunset-clouds-true.png',
  live2_false: 'bench/out/_live2-loworbit-sunset-clouds-false.png',
  official_cur: 'bench/out/stills/loworbit-sunset.png',
  official_base: 'bench/baseline/stills/loworbit-sunset.png',
};
for (const [k, p] of Object.entries(files)) {
  const im = readPNG(p);
  console.log(k, 'lowerleft(x0-430,y600-780)', JSON.stringify(regionStats(im, 0, 430, 600, 780)));
}
