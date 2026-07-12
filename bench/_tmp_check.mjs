import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readPNG, luminance } from './png.mjs';

const OUT = resolve('bench/out/_tmp_check');
mkdirSync(OUT, { recursive: true });

const W = 960, H = 600;
const launch = {
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
};
if (process.env.PUPPETEER_EXECUTABLE_PATH) launch.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto('http://localhost:8131/planet.html?fast=1', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__ready && window.__ready(), { timeout: 240000, polling: 250 });

async function runPath(name, specFn, frames) {
  const lums = [];
  const rawMeans = [];
  for (let i = 0; i < frames; i++) {
    await page.evaluate((s) => window.__shot(s), specFn(i));
    await new Promise((r) => setTimeout(r, 120));
    const file = resolve(OUT, `${name}-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    const img = readPNG(file);
    lums.push(luminance(img));
    // raw mean too
    const { width: Wd, height: Hd, channels: C, data } = img;
    let s = 0;
    for (let k = 0; k < Wd*Hd; k++) { const b=k*C; s += 0.2126*data[b]+0.7152*data[b+1]+0.0722*data[b+2]; }
    rawMeans.push(s/(Wd*Hd));
  }
  const steps = [];
  for (let i = 1; i < lums.length; i++) {
    const a = lums[i - 1], b = lums[i];
    const d = [];
    for (let y = 0; y < a.H; y += 2)
      for (let x = 0; x < a.W; x += 2) d.push(Math.abs(a.lum[y * a.W + x] - b.lum[y * b.W + x]));
    d.sort((p, q) => p - q);
    steps.push(d[Math.floor(d.length * 0.99)]);
  }
  steps.sort((p, q) => p - q);
  const pop_p99 = +(steps[Math.floor(steps.length * 0.99)] ?? 0).toFixed(4);
  // flicker energy
  let sum = 0, n = 0;
  const T = lums.length, base = lums[0];
  for (let px = 0; px < base.lum.length; px += 4) {
    let m = 0, m2 = 0;
    for (let t = 0; t < T; t++) { const v = lums[t].lum[px]; m += v; m2 += v * v; }
    m /= T; sum += m2 / T - m * m; n++;
  }
  const flicker_energy = +(sum / n).toFixed(6);
  return { pop_p99, flicker_energy, rawMeans };
}

// cloud-drift AS-IS (no fixedEV)
const specAsIs = (i) => ({
  body: 'tellus', lat: -49, lon: -110, alt: 3000, tday: 0.43 + i * 0.001,
  pitch: 25, fov: 60, clean: true, waitMs: i ? 300 : 60000,
});
// cloud-drift WITH pinned fixedEV
const specFixed = (i) => ({
  body: 'tellus', lat: -49, lon: -110, alt: 3000, tday: 0.43 + i * 0.001,
  pitch: 25, fov: 60, clean: true, waitMs: i ? 300 : 60000, fixedEV: -0.8,
});

console.log('Running cloud-drift AS-IS (AE live, matches motion.mjs)...');
const r1 = await runPath('asis', specAsIs, 36);
console.log('AS-IS result:', JSON.stringify({ pop_p99: r1.pop_p99, flicker_energy: r1.flicker_energy }));
console.log('AS-IS raw means:', r1.rawMeans.map(v=>v.toFixed(1)).join(','));

console.log('\nRunning cloud-drift with fixedEV=-0.8 (AE pinned)...');
const r2 = await runPath('fixed', specFixed, 36);
console.log('FIXED result:', JSON.stringify({ pop_p99: r2.pop_p99, flicker_energy: r2.flicker_energy }));
console.log('FIXED raw means:', r2.rawMeans.map(v=>v.toFixed(1)).join(','));

writeFileSync(resolve(OUT, 'check-results.json'), JSON.stringify({ asis: { pop_p99: r1.pop_p99, flicker_energy: r1.flicker_energy, rawMeans: r1.rawMeans }, fixed: { pop_p99: r2.pop_p99, flicker_energy: r2.flicker_energy, rawMeans: r2.rawMeans } }, null, 1));

await browser.close();
