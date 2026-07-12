// Headless screenshot runner for any page exposing the window.__ready() +
// window.__shot(...) hooks — the boilerplate viewer.html (positional args:
// azimuth°, elevation°, distance) and planet.html (a spec object; returns a
// Promise that resolves once tile bakes settle).
//
// Uses SwiftShader (software GL) so it renders WebGL with no GPU / no display —
// works in CI and headless boxes. (WebGPU does NOT work under SwiftShader; both
// viewers use WebGLRenderer for exactly this reason.)
//
//   npm install
//   python -m http.server 8000          # in another terminal, serving this dir
//   node screenshot.mjs [url] [outDir] [specfile.json]
//
//   node screenshot.mjs http://localhost:8000/viewer.html shots
//   node screenshot.mjs "http://localhost:8000/planet.html?fast=1" shots-planet
//   node screenshot.mjs "http://localhost:8000/planet.html?fast=1" shots-planet specs.json
//
// Spec file: JSON array. Entries with an "args" array call __shot(...args) (old
// viewer contract); plain objects call __shot(spec) with {name} as the filename.
import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const URL    = process.argv[2] || 'http://localhost:8000/viewer.html';
const OUTDIR = resolve(process.argv[3] || 'shots');
const SPECFILE = process.argv[4];
mkdirSync(OUTDIR, { recursive: true });

const VIEWER_VIEWS = [
  { name: 'oblique', args: [35, 30, 11] },
  { name: 'low',     args: [20, 10, 9] },
  { name: 'top',     args: [0, 88, 12] },
  { name: 'graze',   args: [60, 6, 10] },
];
const PLANET_VIEWS = [
  { name: 'orbit-lit',  body: 'tellus', lat: 18, lon: 25, alt: 16_000_000, tday: 0.50 },
  { name: 'mid-lit',    body: 'tellus', lat: -4, lon: -76, alt: 400_000, tday: 0.30 },
  { name: 'low-lit',    body: 'tellus', lat: -4, lon: -76, alt: 12_000, tday: 0.30 },
  { name: 'ground-lit', body: 'tellus', lat: -4, lon: -76, alt: 150, tday: 0.30, inset: true },
];

const VIEWS = SPECFILE
  ? JSON.parse(readFileSync(SPECFILE, 'utf8'))
  : (URL.includes('planet') ? PLANET_VIEWS : VIEWER_VIEWS);

const W = 1280, H = 780;
// First run? install the browser:  npx puppeteer browsers install chrome
// Or point at any Chrome:          PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node screenshot.mjs ...
const launch = {
  headless: 'new',
  // must exceed the longest __shot settle (waitMs up to 300 s) or the blocking
  // evaluate call dies with a ProtocolError mid-run
  protocolTimeout: 420000,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
};
if (process.env.PUPPETEER_EXECUTABLE_PATH) launch.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

console.log('loading', URL);
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__ready && window.__ready(), { timeout: 240000, polling: 250 });
console.log('ready');

for (const view of VIEWS) {
  const t0 = Date.now();
  if (Array.isArray(view.args)) {
    await page.evaluate((args) => window.__shot(...args), view.args);
  } else {
    await page.evaluate((s) => window.__shot(s), view); // awaits the page's promise
  }
  await new Promise(r => setTimeout(r, 400));
  const out = resolve(OUTDIR, (view.name || 'shot') + '.png');
  await page.screenshot({ path: out });
  console.log(`wrote ${out} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

if (errs.length) console.log('page errors:', errs.slice(0, 8).join(' | '));
await browser.close();
console.log('done ->', OUTDIR);
