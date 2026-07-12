// bench/motion.mjs — Phase M motion bench: scripted camera paths rendered as frame
// sequences, scored on pop statistics and flicker energy.
//
//   npm run bench:motion              # all paths
//   node bench/motion.mjs --path descent
//
// Honesty notes (the "no silent caps" rule): frames are captured WITHOUT waiting
// for bakes to settle (a settled frame can't pop); pop_p99 is the p99 per-pixel
// luminance step between adjacent frames measured on the CENTER window for the
// descent (radial optic flow is small there) and on the full frame for the fixed
// -camera paths. The orbit pan's value includes real camera flow — compare it
// against its own baseline, not against zero. The descent's 36 log-spaced steps
// are ~1.4x altitude apart: its number is dominated by legitimate scene change,
// so treat orbit-pan as the primary pop gauge until the descent gets flow
// compensation (or 4x the frames).

import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readPNG, luminance } from './png.mjs';

const args = process.argv.slice(2);
const only = args.includes('--path') ? args[args.indexOf('--path') + 1] : null;
// round 15 (panel F4-bench): --clouds-off forces clouds:false into every spec
// — the legacy Tellus paths run BIT-FLAT against the round-14 baseline as the
// collateral control, so a cloud-caused pop can never hide inside a
// "content-honest" re-baseline
const CLOUDS_OFF = args.includes('--clouds-off');
const OUT = resolve('bench/out/motion');
mkdirSync(OUT, { recursive: true });

const PATHS = {
  // fixedEV: pop metrics must measure the WORLD's steps, not the AE servo's
  descent: {
    frames: 36, center: true,
    spec: (i) => ({
      body: 'tellus', lat: -4, lon: -76, tday: 0.3, clean: true, fixedEV: -0.8,
      waitMs: i ? 300 : 60000,
      alt: Math.round(20e6 * Math.pow(2e2 / 20e6, i / 35)), // 20,000 km -> 200 m
    }),
  },
  'orbit-pan': {
    frames: 36, center: false,
    spec: (i) => ({
      body: 'tellus', lat: 10, lon: i * 0.33, alt: 800000, tday: 0.35, clean: true,
      fixedEV: -0.8, waitMs: i ? 300 : 60000,
    }),
  },
  'ocean-fixed': {
    frames: 30, center: false, flicker: true,
    spec: (i) => ({
      body: 'tellus', lat: -20, lon: -175, alt: 900, tday: 0.28 + i * 2e-5, // ~1.7 s/frame
      yaw: -103, pitch: 18, clean: true, waitMs: i ? 300 : 60000,
    }),
  },
  // round 14 (panel M7/H5): a fixed-altitude slow dolly bracketing ONLY the
  // rock impostor<->mesh handoff distance — split/geomorph pop held constant,
  // so pop_p99 here reads the RUNG SWAP itself. fov 28 halves pixAng so the
  // band resolves at bench dpr 1 (the register's 2-6 px was a dpr-2 reading).
  // Runs the LUNA band; its Rubra sibling instruments the second body.
  'impostor-approach': {
    frames: 30, center: true,
    spec: (i) => ({
      body: 'luna', lat: 10, lon: 35, tday: 0.22, clean: true, fixedEV: -0.8,
      fov: 28, pitch: 25, waitMs: i ? 300 : 60000,
      alt: Math.round(2400 - i * 60), // 2.4 km -> 0.6 km through the band
    }),
  },
  'impostor-approach-rubra': {
    frames: 30, center: true,
    spec: (i) => ({
      body: 'rubra', lat: -12.0, lon: -77.7, tday: 0.26, clean: true, fixedEV: -0.8,
      fov: 28, pitch: 25, waitMs: i ? 300 : 60000,
      alt: Math.round(2000 - i * 50), // 2.0 km -> 0.5 km (smaller sizeMax)
    }),
  },
  // round 15 — the cloud [time-field]'s two motion witnesses.
  // cloud-drift: FIXED camera under the broken deck (the located deck-eye
  // region), world time stepped the ocean-fixed way (~86 s/frame) across a
  // KEYFRAME BOUNDARY (t/τ crosses 221 near frame 30): pop_p99 reads the
  // advection's smoothness and flicker_energy reads the crossfade (the F1
  // "keyframe breathing" class is a smooth variance dip — pop can't see it,
  // flicker can). Pre-registered ceiling: flicker_energy <= 3x ocean-fixed's
  // baseline (0.0011 -> <= 0.0033).
  'cloud-drift': {
    frames: 36, center: false, flicker: true,
    // fixedEV (round-15 panel TF-DRIFT-WITNESS-EXPOSURE): the metered run's
    // flicker was AE pumping, not advection — the instrument measures the
    // WORLD's steps, like every other pop path
    spec: (i) => ({
      body: 'tellus', lat: -49, lon: -110, alt: 3000, tday: 0.43 + i * 0.001,
      pitch: 25, fov: 60, clean: true, fixedEV: -0.8, waitMs: i ? 300 : 60000,
    }),
  },
  // cloud-approach: camera-only descent THROUGH the dense deck at the located
  // cloud-tops region — scores the deck integrator's quadrature/LOD/detail
  // transitions (orbit -> shell -> inside) the way impostor-approach scores
  // the rock rung swap. Time frozen: any pop is representation, not weather.
  'cloud-approach': {
    frames: 32, center: true,
    spec: (i) => ({
      body: 'tellus', lat: -13, lon: -158, tday: 0.32, clean: true, fixedEV: -0.8,
      pitch: 20, waitMs: i ? 300 : 60000,
      alt: Math.round(500e3 * Math.pow(600 / 500e3, i / 31)), // 500 km -> 600 m
    }),
  },
};
if (CLOUDS_OFF) {
  for (const p of Object.values(PATHS)) {
    const base = p.spec;
    p.spec = (i) => ({ ...base(i), clouds: false });
  }
  console.log('clouds:false forced into every path spec (--clouds-off)');
}

// per-subsystem frame-time budget (ms, reference-hardware 60 fps targets — the
// "real-time is a spec" Phase T gate). Headless scoring runs on SwiftShader
// (software GL), which is 100x slower than a GPU, so these numbers are REPORTED
// against the budget with a caveat, never hard-gated — the WebGPU checkpoint
// (round 15) supplies GPU numbers that make the gate bite. A single hard
// tripwire catches a renderer that has effectively died (round-4 OOM class).
const PERF_BUDGET = { frame: 16, update: 4, shadow: 3, render: 10 };
const HARD_CEIL_MS = 20000; // frame EMA beyond this = the renderer is not running

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

const results = {};
for (const [name, path] of Object.entries(PATHS)) {
  if (only && name !== only) continue;
  console.log(`path ${name}: ${path.frames} frames`);
  const lums = [];
  for (let i = 0; i < path.frames; i++) {
    await page.evaluate((s) => window.__shot(s), path.spec(i));
    await new Promise((r) => setTimeout(r, 120));
    const file = resolve(OUT, `${name}-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    lums.push(luminance(readPNG(file)));
  }
  // pop_p99: adjacent-frame per-pixel steps
  const steps = [];
  for (let i = 1; i < lums.length; i++) {
    const a = lums[i - 1], b = lums[i];
    const x0 = path.center ? (a.W * 0.3) | 0 : 0, x1 = path.center ? (a.W * 0.7) | 0 : a.W;
    const y0 = path.center ? (a.H * 0.3) | 0 : 0, y1 = path.center ? (a.H * 0.7) | 0 : a.H;
    const d = [];
    for (let y = y0; y < y1; y += 2)
      for (let x = x0; x < x1; x += 2) d.push(Math.abs(a.lum[y * a.W + x] - b.lum[y * b.W + x]));
    d.sort((p, q) => p - q);
    steps.push(d[Math.floor(d.length * 0.99)]);
  }
  steps.sort((p, q) => p - q);
  const r = { pop_p99: +(steps[Math.floor(steps.length * 0.99)] ?? 0).toFixed(4), frames: path.frames };
  if (path.flicker) {
    // flicker energy: mean per-pixel temporal variance (fixed camera)
    let sum = 0, n = 0;
    const T = lums.length, base = lums[0];
    for (let px = 0; px < base.lum.length; px += 4) {
      let m = 0, m2 = 0;
      for (let t = 0; t < T; t++) { const v = lums[t].lum[px]; m += v; m2 += v * v; }
      m /= T; sum += m2 / T - m * m; n++;
    }
    r.flicker_energy = +(sum / n).toFixed(6);
  }
  // perf-budget gate: sample the subsystem timing EMA at the end of the path
  // (its last frames are settled steady-state renders, the honest measurement)
  r.perf = await page.evaluate(() => window.__perf());
  results[name] = r;
  console.log(name, JSON.stringify(r));
}
await browser.close();
writeFileSync(resolve(OUT, 'motion-metrics.json'), JSON.stringify(results, null, 1));
console.log('wrote', resolve(OUT, 'motion-metrics.json'));

// ---- perf-budget report (Phase T) ----
console.log('\n== perf (EMA ms; SwiftShader software GL — NOT reference hardware) ==');
let dead = 0;
for (const [name, r] of Object.entries(results)) {
  if (!r.perf) continue;
  const cell = (k) => `${k} ${r.perf[k]?.toFixed(1)}/${PERF_BUDGET[k]}`;
  console.log(`${name}: ${['frame', 'update', 'shadow', 'render'].map(cell).join('  ')}`);
  if (r.perf.frame > HARD_CEIL_MS) { dead++; console.error(`  TRIPWIRE ${name}: frame EMA ${r.perf.frame.toFixed(0)} ms > ${HARD_CEIL_MS} — renderer stalled`); }
}
if (dead) process.exitCode = 1;
