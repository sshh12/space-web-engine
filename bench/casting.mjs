// bench/casting.mjs — seed casting (ROADMAP_V2 Phase T / the "singularity" item).
// A body is a pure function of its seed, so hero quality is a SELECTION problem,
// not an authoring one: bake N reseeded variants, render whole-disk + limb, and
// lay them out as a contact sheet to choose (or panel-score) a world. Choosing a
// world becomes an afternoon, not a superstition.
//
//   npm run cast -- --body rubra --n 6
//   node bench/casting.mjs --body luna --n 8 --seed 104729
//
// Reseeding rides the round-7 hot-reload hook (__reload): each variant swaps the
// process seeds and rebakes WITHOUT a page reload — variant 0 is the shipped seed.
// Output: bench/out/casting/<body>-contact.png + <body>-casting.json.

import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bodyById } from '../src/recipe.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const BODY = opt('--body', 'rubra');
const N = Math.max(1, Math.min(12, +opt('--n', 6)));
const STRIDE = +opt('--seed', 104729); // per-variant seed offset (prime; hash decorrelates)
const OUT = resolve('bench/out/casting');
mkdirSync(OUT, { recursive: true });

const body = bodyById(BODY);
if (!body) { console.error(`unknown body '${BODY}'`); process.exit(1); }
// round 17: disc/limb framing keys on the figure's bounding extent — a
// triaxial/bilobate body framed at mean-R multiples would clip its long axis
// (bodyBoundR === body.R for every legacy body)
const { bodyBoundR } = await import('../src/figure.js');
const R = bodyBoundR(body);
const c = body.camera;

const launch = {
  headless: 'new', protocolTimeout: 420000,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1024,1024'],
};
if (process.env.PUPPETEER_EXECUTABLE_PATH) launch.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await page.goto('http://localhost:8131/planet.html?fast=1', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__ready && window.__ready(), { timeout: 240000, polling: 250 });

// prime the body once, capture its baseline recipe
await page.evaluate((b) => window.__shot({ body: b, alt: 1, clean: true }), BODY);
const base = await page.evaluate(() => window.__recipe());

const disc = { body: BODY, alt: Math.round(R * 2.2), lat: c.lat, lon: c.lon, tday: 0.45, clean: true };
const limb = { body: BODY, alt: Math.round(R * 2.6), lat: c.lat, lon: c.lon, phaseDeg: 74, clean: true };

const shot64 = async (spec) => {
  await page.evaluate((s) => window.__shot(s), spec);
  return page.screenshot({ encoding: 'base64' });
};

const cells = [];
for (let i = 0; i < N; i++) {
  const t0 = Date.now();
  const procs = base.map((p) => (typeof p.seed === 'number' ? { ...p, seed: p.seed + i * STRIDE } : { ...p }));
  await page.evaluate(async (pr) => {
    window.__reload(pr);
    const t = Date.now();
    while (!window.__ready() && Date.now() - t < 120000) await new Promise((r) => setTimeout(r, 200));
  }, procs);
  const d = await shot64(disc);
  const l = await shot64(limb);
  cells.push({ variant: i, offset: i * STRIDE, disc: d, limb: l });
  console.log(`variant ${i} (seed +${i * STRIDE})  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

// contact sheet: compose an HTML grid of the captured frames and screenshot it
const TH = 300;
const rows = cells.map((cl) => `
  <div class="row">
    <div class="lab">#${cl.variant}<br>+${cl.offset}</div>
    <img src="data:image/png;base64,${cl.disc}">
    <img src="data:image/png;base64,${cl.limb}">
  </div>`).join('');
const html = `<!doctype html><meta charset=utf8><style>
  body{margin:0;background:#0d0d10;color:#cfcfd6;font:13px system-ui}
  h1{font-size:14px;margin:10px 14px}
  .row{display:flex;align-items:center;gap:8px;padding:4px 10px}
  .lab{width:60px;text-align:right;opacity:.7;font-variant-numeric:tabular-nums}
  img{width:${TH}px;height:${TH}px;object-fit:cover;border:1px solid #ffffff18;border-radius:4px;background:#000}
</style><h1>seed casting · ${body.name} · whole-disk / limb · variant 0 = shipped seed</h1>${rows}`;
await page.setViewport({ width: 60 + TH * 2 + 60, height: 40 + cells.length * (TH + 8) });
await page.setContent(html, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 400));
const contact = resolve(OUT, `${BODY}-contact.png`);
await page.screenshot({ path: contact, fullPage: true });
await browser.close();

writeFileSync(resolve(OUT, `${BODY}-casting.json`),
  JSON.stringify({ body: BODY, n: N, stride: STRIDE, variants: cells.map((cl) => ({ variant: cl.variant, offset: cl.offset })) }, null, 1));
console.log(`\nwrote ${contact}`);
if (errs.length) { console.error('page errors:', errs.slice(0, 5).join(' | ')); process.exitCode = 1; }
