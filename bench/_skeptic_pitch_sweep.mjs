// Skeptic probe: pitch sweep at the alpen-dawn ground point to test whether
// cloud-deck coverage/opacity is angle-dependent (broken at steep/nadir-ish
// angles, solid sheet at grazing/horizon angles), plus a clouds:false control.
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const URL = 'http://localhost:8131/planet.html?fast=1';
const OUTDIR = resolve('bench/out/_skeptic_pitch_sweep');
mkdirSync(OUTDIR, { recursive: true });

const W = 1280, H = 780;
const launch = {
  headless: 'new',
  protocolTimeout: 420000,
  executablePath: 'C:/Users/Shriv/.cache/puppeteer/chrome/win64-149.0.7827.22/chrome-win64/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
};

const base = { body: 'tellus', lat: -4, lon: -76, alt: 8000, phaseDeg: 86, faceSun: true, yaw: 60, waitMs: 60000 };

// pitch sweep: steep negative = looking down toward nadir-ish (short slant path
// through any deck below), through the scene's own pitch (8, near-horizontal),
// to shallow-positive grazing toward the horizon (long slant path).
const pitches = [-80, -60, -40, -20, -5, 8, 20];

const specs = [];
for (const p of pitches) specs.push({ ...base, name: `pitch_${p}`, pitch: p });
for (const p of pitches) specs.push({ ...base, name: `pitch_${p}_cloudsOff`, pitch: p, clouds: false });

const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

console.log('loading', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__ready && window.__ready(), { timeout: 240000, polling: 250 });
console.log('ready');

for (const spec of specs) {
  const t0 = Date.now();
  const r = await page.evaluate((s) => window.__shot(s), spec);
  await new Promise(res => setTimeout(res, 400));
  const out = resolve(OUTDIR, spec.name + '.png');
  await page.screenshot({ path: out });
  console.log(`wrote ${out} settled=${r.settled} ms=${r.ms} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
await browser.close();
console.log('done ->', OUTDIR);
