// harness/editor-e2e.mjs — Phase E gates (round 25), browser-level.
//
//   A. EDIT-ISOLATION (`edit-isolation-pair`): edit body X live; every OTHER
//      body's baked disc row hashes byte-identically and a fixed control scene
//      on an unedited body re-captures without change (byte-equality reported;
//      the gate is a near-zero luminance envelope, golden's tolerance-tier
//      precedent). X's own disc MUST change — an invisible edit is a finding.
//   B. LIVE ≡ REBOOT (`edited-system-reboot`): scripted edits applied live →
//      settle → capture; a COLD page resolves the exported spec.system payload
//      (the __capture round-trip) → same SceneSpec → capture. Frames must agree
//      within an envelope MEASURED IN-RUN from a same-page A/A recapture
//      (measured ×1.5 + floor — the LAYOUT method, applied to frame identity).
//      Byte-equal bakes alone would pass with stale sky/LUT/slot uniforms (F2);
//      the contract is FRAME equivalence.
//   C. FUZZ-LITE: random schema-valid edits through the live path never throw,
//      never brick, never leak page errors; an invalid edit refuses by name and
//      the live hash is untouched.
//   D. LIVE-BUILD DEMO: add a body from a family template → membership edit
//      (full setSystem) → travel to it → arrive on its surface. The product
//      proof that runtime edit + generation is real.
//
//   node harness/editor-e2e.mjs
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, ROOT } from './shots.mjs';
import { decodePNG, luminance } from './png.mjs';

const outDir = resolve(ROOT, 'harness/editor-out');
mkdirSync(outDir, { recursive: true });
const candidates = process.platform === 'win32' ? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const executablePath = candidates.find(existsSync);
const server = await startServer(ROOT, 0);
const browser = await puppeteer.launch({ headless: 'new', executablePath, protocolTimeout: 420000,
  args: ['--no-sandbox', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });

let failures = 0;
const report = { errors: [] };
const check = (cond, name) => {
  if (cond) { console.log(`  ok  ${name}`); return true; }
  failures++; console.error(`  FAIL ${name}`); report.errors.push(name); return false;
};
const shotBytes = async (page) => Buffer.from(await (await page.$('#c')).screenshot({ type: 'png' }));
const lumStats = (a, b) => {
  const la = luminance(decodePNG(a)).lum, lb = luminance(decodePNG(b)).lum;
  let mean = 0; const d = new Float32Array(la.length);
  for (let i = 0; i < la.length; i++) { d[i] = Math.abs(la[i] - lb[i]); mean += d[i]; }
  d.sort();
  return { mean: mean / la.length, p99: d[Math.floor((d.length - 1) * 0.99)] };
};
const newPage = async (url) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => report.errors.push(String(e).split('\n')[0]));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ready?.(), { timeout: 300000, polling: 250 });
  return page;
};
const settle = (page, ms = 240000) => page.waitForFunction(() => window.__ready?.(), { timeout: ms, polling: 200 });
const allDiscs = (page) => page.waitForFunction(() => window.__stream?.().disc === 0, { timeout: 120000, polling: 250 });

const CONTROL = { body: 'luna', lat: 12, lon: 40, alt: 4_000_000, epochS: 43200, fixedEV: -0.4, clean: true, waitMs: 200000 };
const EDITED_POSE = { body: 'rubra', lat: -10, lon: 65, alt: 5_000_000, epochS: 43200, fixedEV: -0.4, clean: true, waitMs: 200000 };

try {
  // ---------------- A + B + C run on the inspector over sol ----------------
  const page = await newPage(`${server.url}/apps/inspector.html?fast=1&system=sol`);
  await allDiscs(page);
  const hashes0 = await page.evaluate(() =>
    Object.fromEntries(window.__editorSystem().bodies.map((b) => [b.id, window.__discHash(b.id)])));
  check(Object.values(hashes0).every(Boolean), 'A: every disc row baked and hashable');

  await page.evaluate((s) => window.__shot(s), CONTROL);
  const control0 = await shotBytes(page);
  writeFileSync(resolve(outDir, 'control-before.png'), control0);

  // the scripted edit of X = rubra: look (palette) + mechanics (orbit, with
  // insolation) + processes (deep seed) — three taxonomy classes in one apply
  const editResult = await page.evaluate(() => {
    const sys = window.__editorSystem();
    const rubra = sys.bodies.find((b) => b.id === 'rubra');
    rubra.palette.dust = rubra.palette.dust.map((v) => Math.min(1, v * 1.18));
    rubra.orbit.a *= 1.05;
    const deep = rubra.processes.find((p) => p.type === 'fbmBand' && p.levels[0] >= 8);
    if (deep) deep.seed += 17;
    return window.__editSystem(sys);
  });
  check(editResult.scope === 'bodies', `A: edit dispatches per-body (got ${editResult.scope})`);
  const classes = editResult.bodies.rubra?.classes ?? [];
  check(classes.includes('look') && classes.includes('mechanics') && classes.includes('processes'),
    `A: classes classified as look+mechanics+processes (got ${classes.join(',')})`);
  await settle(page);
  await allDiscs(page);
  const hashes1 = await page.evaluate(() =>
    Object.fromEntries(window.__editorSystem().bodies.map((b) => [b.id, window.__discHash(b.id)])));
  const leaked = Object.keys(hashes0).filter((id) => id !== 'rubra' && hashes1[id] !== hashes0[id]);
  check(leaked.length === 0, `A: zero cross-body disc leaks${leaked.length ? ` (leaked: ${leaked.join(',')})` : ''}`);
  check(hashes1.rubra !== hashes0.rubra, 'A: the edited body\'s own disc actually changed');

  await page.evaluate((s) => window.__shot(s), CONTROL);
  const control1 = await shotBytes(page);
  writeFileSync(resolve(outDir, 'control-after.png'), control1);
  const iso = lumStats(control0, control1);
  report.isolation = { byteEqual: control0.equals(control1), ...iso };
  check(iso.p99 <= 0.004 && iso.mean <= 0.001,
    `A: unedited-body control frame unchanged (p99 ${iso.p99.toFixed(5)}, mean ${iso.mean.toFixed(6)}, byteEqual ${report.isolation.byteEqual})`);

  const stream = await page.evaluate(() => window.__stream());
  check(stream.systemEdited === true, 'A: engine reports an edited system');

  // ---------------- B: live ≡ reboot ----------------
  // widen the edited surface: clouds class on tellus + a look edit on luna
  await page.evaluate(() => {
    const sys = window.__editorSystem();
    const tellus = sys.bodies.find((b) => b.id === 'tellus');
    tellus.clouds.decks[0].cov0 = 0.4;
    const luna = sys.bodies.find((b) => b.id === 'luna');
    luna.palette.dust = [0.42, 0.36, 0.3];
    return window.__editSystem(sys);
  });
  await settle(page);
  await page.evaluate((s) => window.__shot(s), EDITED_POSE);
  const live0 = await shotBytes(page);
  // A/A envelope on the SAME page: the frame-identity noise floor this config
  // actually has, measured in-run (×1.5 + floor — the LAYOUT method)
  await page.evaluate((s) => window.__shot(s), EDITED_POSE);
  const liveAA = await shotBytes(page);
  const aa = lumStats(live0, liveAA);
  const envelope = { mean: aa.mean * 1.5 + 5e-4, p99: aa.p99 * 1.5 + 2e-3 };
  const captured = await page.evaluate(() => window.__capture());
  check(!!captured.system?.bodies, 'B: __capture carries the inline spec.system payload');
  const liveIdentity = await page.evaluate(() => window.__system());
  writeFileSync(resolve(outDir, 'live.png'), live0);

  const cold = await newPage(`${server.url}/apps/inspector.html?fast=1&system=sol`);
  // cold boot resolves the exported payload through the SceneSpec itself —
  // the spec IS the reproduction vehicle (applyScene handles spec.system)
  const rebootSpec = { ...EDITED_POSE, system: captured.system };
  await cold.evaluate((s) => window.__shot(s), rebootSpec);
  await settle(cold);
  const coldIdentity = await cold.evaluate(() => window.__system());
  check(coldIdentity.recipeHash === liveIdentity.recipeHash,
    `B: reboot resolves to the same recipe hash (${coldIdentity.recipeHash})`);
  await cold.evaluate((s) => window.__shot(s), EDITED_POSE);
  const reboot0 = await shotBytes(cold);
  writeFileSync(resolve(outDir, 'reboot.png'), reboot0);
  const rb = lumStats(live0, reboot0);
  report.reboot = { byteEqual: live0.equals(reboot0), ...rb, envelope, aa };
  check(rb.mean <= envelope.mean && rb.p99 <= envelope.p99,
    `B: live ≡ reboot within the measured envelope (mean ${rb.mean.toFixed(6)} <= ${envelope.mean.toFixed(6)}, p99 ${rb.p99.toFixed(5)} <= ${envelope.p99.toFixed(5)})`);
  await cold.close();

  // ---------------- C: fuzz-lite through the live path ----------------
  const fuzz = await page.evaluate(() => {
    const rand = (() => { let a = 0xC0FFEE; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const results = [];
    for (let i = 0; i < 6; i++) {
      const sys = window.__editorSystem();
      const body = sys.bodies[Math.floor(rand() * sys.bodies.length)];
      if (body.palette?.dust && rand() < 0.5) body.palette.dust = body.palette.dust.map((v) => Math.min(1, Math.max(0, v + (rand() - 0.5) * 0.1)));
      else if (body.orbit && !body.orbit.resonance && body.orbit.e != null) body.orbit.e = Math.min(0.6, Math.max(0, body.orbit.e + (rand() - 0.5) * 0.05));
      else body.GM *= 0.9 + rand() * 0.2;
      try { results.push({ id: body.id, scope: window.__editSystem(sys).scope }); }
      catch (e) { results.push({ id: body.id, error: String(e?.message ?? e) }); }
    }
    // one deliberately invalid edit: must refuse by name and change nothing
    const hashBefore = window.__system().recipeHash;
    let refused = null;
    try {
      const sys = window.__editorSystem();
      sys.bodies.find((b) => b.id === 'tellus').orbit.e = 1.5;
      window.__editSystem(sys);
    } catch (e) { refused = String(e?.message ?? e); }
    return { results, refused, hashUnchanged: window.__system().recipeHash === hashBefore };
  });
  check(fuzz.results.every((r) => !r.error), `C: ${fuzz.results.length} random live edits applied without throwing`);
  check(/e must be in/.test(fuzz.refused ?? ''), 'C: invalid edit refuses by name');
  check(fuzz.hashUnchanged, 'C: refused edit leaves the live recipe untouched');
  await settle(page);
  const errs = await page.evaluate(() => (window.__pageErrors ?? []).splice(0));
  check(errs.length === 0, `C: zero page errors after the fuzz batch${errs.length ? ` (${errs[0]})` : ''}`);
  report.fuzz = fuzz;
  await page.close();

  // ---------------- D: the live-build demo (system.html) ----------------
  const app = await newPage(`${server.url}/apps/system.html?fast=1`);
  await app.waitForFunction(() => window.__nav?.().markers.length > 30, { timeout: 120000 });
  await app.evaluate(() => { window.__state.speed = 0; });
  const build = await app.evaluate(async () => {
    const { makeBodyFromTemplate } = await import('/src/core/editor.js');
    const sys = window.__editorSystem();
    // 2.2 AU: between rubra and iovis — a lit, reachable inner-system slot
    sys.bodies.push(makeBodyFromTemplate(sys, 'rocky', { id: 'novus', name: 'Novus', parent: 'star', aM: 3.3e11 }));
    const r = window.__editSystem(sys);
    return { scope: r.scope, added: r.membership.added, hash: r.identity.recipeHash };
  });
  check(build.scope === 'system' && build.added.includes('novus'), 'D: template add is a classified membership edit');
  await settle(app);
  await app.waitForFunction(() => window.__nav?.().markers.some((m) => m.id === 'novus'), { timeout: 60000 });
  console.log('  ok  D: the new body enters the marker population');
  // orbit edit on the new body at running t, then travel to it
  await app.evaluate(() => {
    const sys = window.__editorSystem();
    sys.bodies.find((b) => b.id === 'novus').orbit.e = 0.12;
    return window.__editSystem(sys);
  });
  await settle(app);
  await app.evaluate(() => window.__travelTo('novus'));
  await app.keyboard.down('Shift');
  for (let i = 0; i < 20; i++) {
    const done = await app.evaluate(() => window.__state.viewClass === 'surface' && window.__state.body.id === 'novus');
    if (done) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  await app.keyboard.up('Shift');
  await app.waitForFunction(() => window.__state.viewClass === 'surface' && window.__state.body.id === 'novus', { timeout: 90000 });
  await settle(app);
  writeFileSync(resolve(outDir, 'novus-arrival.png'), await shotBytes(app));
  const arrival = await app.evaluate(() => ({ errors: (window.__pageErrors ?? []).splice(0), stream: window.__stream(), capture: window.__capture() }));
  check(arrival.errors.length === 0, `D: arrival with zero page errors${arrival.errors.length ? ` (${arrival.errors[0]})` : ''}`);
  check(arrival.capture.body === 'novus' && !!arrival.capture.system?.bodies, 'D: the arrival capture reproduces (pose + inline edited system)');
  report.liveBuild = { hash: build.hash, workerTiles: arrival.stream.workerTiles };
  await app.close();
} finally {
  writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await server.close();
}

console.log(JSON.stringify(report, null, 2));
console.log(failures ? `${failures} editor e2e failure(s)` : 'editor e2e passed');
process.exit(failures ? 1 : 0);
