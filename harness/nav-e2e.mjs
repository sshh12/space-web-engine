// Phase N one-take browser gate: system view -> marker click -> atomic travel
// handoff -> continuous descent -> return to system, under a stepped capture.

import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, ROOT } from './shots.mjs';
import { decodePNG, luminance } from './png.mjs';
import { buildSystemControls } from './bench.mjs';
import { SOL_SYSTEM, SOL_REPIN_DELTA } from '../src/core/sol.js';

const baseline = JSON.parse(readFileSync(resolve(ROOT, 'harness/baseline/nav.json'), 'utf8'));
const outDir = resolve(ROOT, 'harness/nav-out'); mkdirSync(outDir, { recursive: true });
const candidates = process.platform === 'win32' ? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const executablePath = candidates.find(existsSync);
const server = await startServer(ROOT, 0);
const browser = await puppeteer.launch({ headless: 'new', executablePath, protocolTimeout: 420000,
  args: ['--no-sandbox', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const browserErrors = [];
page.on('pageerror', (e) => browserErrors.push(String(e.stack ?? e)));
page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(m.text()); });

const frames = [], exposures = [];
const snap = async (name) => {
  const handle = await page.$('#c');
  const buf = Buffer.from(await handle.screenshot({ type: 'png' }));
  if (name) writeFileSync(resolve(outDir, `${name}.png`), buf);
  const lum = luminance(decodePNG(buf)).lum;
  frames.push(lum); exposures.push(await page.evaluate(() => window.__shared.uExposure.value));
  return lum;
};
const p99 = (a) => { const b = Float32Array.from(a).sort(); return b[Math.floor((b.length - 1) * 0.99)]; };

let failures = 0;
try {
  await page.goto(`${server.url}/apps/system.html?fast=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction((n) => window.__ready?.() && window.__nav?.().markers.length === n,
    { timeout: 60000 }, baseline.markerCount);
  const initial = await page.evaluate(() => ({ nav: __nav(), system: __system(), errors: __pageErrors }));
  if (initial.system.id !== baseline.system.id || initial.system.recipeHash !== baseline.system.recipeHash
    || initial.errors.length || initial.nav.hostId !== 'star') failures++;
  const iconLum = await snap('system-view');
  const litFraction = iconLum.reduce((n, v) => n + (v > 0.0005), 0) / iconLum.length;
  if (litFraction < baseline.icon.litFractionMin || litFraction > baseline.icon.litFractionMax) failures++;

  // Random system-view controls: host/target/range/epoch draws must all settle,
  // retain their structured pose and keep the target in the marker population.
  const controls = buildSystemControls(20260713, 4, { system: SOL_SYSTEM, diff: SOL_REPIN_DELTA });
  for (const control of controls) {
    await page.evaluate((spec) => { __systemShot(spec); __state.speed = 0; }, control.spec);
    await page.waitForFunction(() => __ready?.(), { timeout: 30000 });
    const got = await page.evaluate(() => ({ shot: __capture(), markers: __nav().markers.map((m) => m.id), errors: __pageErrors }));
    if (got.shot.host !== control.spec.host || got.shot.epochS !== control.spec.epochS || got.errors.length
      || !got.markers.includes(control.spec.target)) failures++;
  }

  // Restore the canonical icon, then perform the click through the real canvas
  // picking path. Paused time makes capture stepping deterministic.
  await page.evaluate(() => { __systemShot({ host: 'star', target: 'star', epochS: 0, warp: 0, reset: true }); });
  await page.waitForFunction(() => __ready?.(), { timeout: 30000 });
  const tellus = await page.evaluate(() => __nav().markers.find((m) => m.id === 'tellus'));
  await page.mouse.click(tellus.x, tellus.y);
  await page.waitForFunction(() => __nav().travel?.bodyId === 'tellus', { timeout: 5000 });
  const declared = await page.evaluate(() => __nav().travel);
  if (!(declared.durationS <= baseline.budgets.travelDurationS)) failures++;
  await page.keyboard.down('Shift');
  for (let i = 0; i < 13; i++) { await snap(); await new Promise((r) => setTimeout(r, 280)); }
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => __state.viewClass === 'surface' && __state.body.id === 'tellus', { timeout: 30000 });
  await snap('arrival');

  // Continuous camera interpolation to the registered Tellus shoreline; no
  // teleport expSnap path is used. Settle includes all terrain/debris/cloud work.
  await page.evaluate(() => __descendToSurface({ lat: -5, lon: -77.5, alt: 1.8, yaw: -60, pitch: 4 }, 1.2));
  await page.waitForFunction(() => __ready?.(), { timeout: baseline.budgets.settleMs });
  await snap('shore-arrival');
  const arrival = await page.evaluate(() => ({ capture: __capture(), stream: __stream(), errors: __pageErrors,
    viewClass: __state.viewClass, hostId: __state.hostId }));
  if (arrival.errors.length || arrival.viewClass !== 'surface' || arrival.hostId !== 'tellus'
    || arrival.capture.alt > 2 || arrival.stream.workerTiles > baseline.budgets.workerTiles
    || arrival.stream.prewarmQ !== 0 || arrival.stream.coarseBodies < 1) failures++;

  // One-take deltas, including the exact system->surface class switch frames.
  let pop = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i], d = new Float32Array(a.length);
    for (let k = 0; k < d.length; k++) d[k] = Math.abs(a[k] - b[k]);
    pop = Math.max(pop, p99(d));
  }
  let exposureStepEv = 0;
  for (let i = 1; i < exposures.length; i++) exposureStepEv = Math.max(exposureStepEv,
    Math.abs(Math.log2(Math.max(exposures[i], 1e-9) / Math.max(exposures[i - 1], 1e-9))));
  if (pop > baseline.budgets.popP99 || exposureStepEv > baseline.budgets.exposureStepEv) failures++;

  await page.evaluate(() => __enterSystemView('star'));
  await page.waitForFunction((n) => __ready?.() && __nav().markers.length === n, { timeout: 30000 }, baseline.markerCount);
  const final = await page.evaluate(() => ({ nav: __nav(), errors: __pageErrors }));
  if (final.nav.hostId !== 'star' || final.errors.length || browserErrors.length) failures++;

  // HiDPI ring↔render registration (post-round-24 defect class): the whole
  // gate battery runs at deviceScaleFactor 1 AND ?fast=1 (pixelRatio 1),
  // which hid a viewport double-scaling that detached every GL ring/point
  // from its DOM marker on real dpr>1 displays. Reload at dsf 1.5 WITHOUT
  // fast (the real-user path — fast masks exactly this class), then require
  // the RENDERED pixels to lie along each planet's own current-epoch orbit
  // curve, predicted in-page from the pose through the shared navigation
  // math. A window-around-marker test is too weak — under the bug the
  // displaced arcs and stars light generic windows by coincidence; the
  // specific-curve coverage cannot pass displaced. Structural (no budget):
  // every probed planet needs >=60% of its in-frame predicted ring lit.
  let hidpiAligned = null;
  {
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
    await page.goto(`${server.url}/apps/system.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction((n) => window.__ready?.() && window.__nav?.().markers.length === n,
      { timeout: 120000 }, baseline.markerCount);
    await page.evaluate(() => { __state.speed = 0; });
    await new Promise((r) => setTimeout(r, 400));
    const rings = await page.evaluate(async () => {
      const nav = await import('/src/core/navigation.js');
      const fr = await import('/src/core/frames.js');
      const { SOL_SYSTEM } = await import('/src/core/sol.js');
      const n = __nav(), t = __state.epochS;
      const hostOrigin = fr.frameState(n.hostId, t, SOL_SYSTEM).origin;
      const cameraI = nav.pivotCameraPosition(n.pose).map((v, i) => v + hostOrigin[i]);
      const targetI = n.pose.pivot.map((v, i) => v + hostOrigin[i]);
      const out = {};
      for (const id of ['iovis', 'saturn', 'caelus']) {
        const body = SOL_SYSTEM.bodies.find((b) => b.id === id);
        out[id] = nav.sampleOrbit(SOL_SYSTEM, body, t, 128)
          .map((s) => nav.projectPoint(s, cameraI, targetI, [0, 1, 0], 55 * Math.PI / 180, 1280, 720))
          .filter(Boolean).map((q) => [q.x, q.y]);
      }
      return out;
    });
    const img = decodePNG(Buffer.from(await (await page.$('#c')).screenshot({ type: 'png' })));
    const scale = img.width / 1280; // screenshot is in device pixels
    const parts = [];
    for (const [id, ring] of Object.entries(rings)) {
      let lit = 0, tested = 0;
      for (const [cx, cy] of ring) {
        const x = Math.round(cx * scale), y = Math.round(cy * scale);
        if (x < 4 || y < 4 || x > img.width - 4 || y > img.height - 4) continue;
        tested++;
        let m = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const o = ((y + dy) * img.width + (x + dx)) * img.channels;
          m = Math.max(m, img.data[o] + img.data[o + 1] + img.data[o + 2]);
        }
        if (m > 30) lit++;
      }
      parts.push(`${id} ${lit}/${tested}`);
      if (!tested || lit / tested < 0.6) failures++;
    }
    hidpiAligned = parts.join(', ');
  }

  const report = { markerCount: initial.nav.markers.length, systemControls: controls.length,
    travelDurationS: declared.durationS, popP99: +pop.toFixed(5), exposureStepEv: +exposureStepEv.toFixed(4),
    workerTiles: arrival.stream.workerTiles, iconLitFraction: +litFraction.toFixed(5),
    hidpiAligned, errors: [...browserErrors, ...final.errors] };
  writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close(); await server.close();
}

console.log(failures ? `${failures} navigation e2e failure(s)` : 'navigation e2e passed');
process.exit(failures ? 1 : 0);
