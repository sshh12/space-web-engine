import { readPNG } from './png.mjs';

function diffCount(a, b) {
  const { width: W, height: H, channels: C } = a;
  let diffs = 0, n = 0, maxd = 0;
  for (let i = 0; i < W * H * C; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    if (d > 0) diffs++;
    if (d > maxd) maxd = d;
    n++;
  }
  return { diffs, n, pct: (100 * diffs / n).toFixed(4), maxd };
}

const live2True = readPNG('bench/out/_live2-loworbit-sunset-clouds-true.png');
const officialCur = readPNG('bench/out/stills/loworbit-sunset.png');
console.log('live2_true vs official_cur (full image):', JSON.stringify(diffCount(live2True, officialCur)));

const live2False = readPNG('bench/out/_live2-loworbit-sunset-clouds-false.png');
const officialBase = readPNG('bench/baseline/stills/loworbit-sunset.png');
console.log('live2_false vs official_base (full image):', JSON.stringify(diffCount(live2False, officialBase)));
