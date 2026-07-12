import puppeteer from 'puppeteer';
import { resolve } from 'path';
const URL = 'http://localhost:8131/planet.html?fast=1';
const W = 1280, H = 780;
const launch = {
  headless: 'new', protocolTimeout: 420000,
  executablePath: 'C:/Users/Shriv/.cache/puppeteer/chrome/win64-149.0.7827.22/chrome-win64/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
};
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__ready && window.__ready(), { timeout: 240000, polling: 250 });
console.log('ready');
const base = { body: 'tellus', lat: -4, lon: -76, alt: 8000, phaseDeg: 86, faceSun: true, yaw: 60, pitch: 8, clean: true, waitMs: 120000 };
for (const spec of [
  { ...base, name: 'alpen_cloudsOn', },
  { ...base, name: 'alpen_cloudsOff', clouds: false },
]) {
  const t0 = Date.now();
  const r = await page.evaluate((s) => window.__shot(s), spec);
  await new Promise(res => setTimeout(res, 400));
  const out = resolve('bench/out/_skeptic_pitch_sweep', spec.name + '.png');
  await page.screenshot({ path: out });
  console.log(spec.name, 'settled=', r.settled, 'ms=', r.ms, 'elapsed', ((Date.now()-t0)/1000).toFixed(1)+'s');
}
await browser.close();
console.log('done ->');
