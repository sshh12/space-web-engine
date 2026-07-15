// harness/smallbody-e2e.mjs — Phase B browser gates (round 26):
//
//   A: BELT-SPAN — the main belt renders through the system view's instanced
//      point pass AT THE PREDICTED PER-MEMBER POSITIONS: the gate re-evaluates
//      the same closed-form elements in plain JS (beltMembers + the solver
//      twin + the frames.js rotation composition) and requires the rendered
//      pixels to lie on those exact points — a real CPU-vs-GLSL A/B, the
//      hidpi specific-curve law applied to scatter. Belts add NO markers.
//   B: COMET-PERIHELION — at the solved perihelion epoch the coma glows and
//      the tail renders along the predicted anti-sunward ray; at aphelion the
//      same probe finds nothing (activity is a pure function of r).
//   C: LAND ON THE COMET — travel from the system view to the nucleus surface
//      (the comet is a body; the belts, structurally, never are).

import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, ROOT } from './shots.mjs';
import { decodePNG } from './png.mjs';

const outDir = resolve(ROOT, 'harness/smallbody-out'); mkdirSync(outDir, { recursive: true });
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

let failures = 0;
const report = { errors: browserErrors };
const check = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`  FAIL ${label}`); } };
const shot = async (name) => {
  const buf = Buffer.from(await (await page.$('#c')).screenshot({ type: 'png' }));
  writeFileSync(resolve(outDir, `${name}.png`), buf);
  return decodePNG(buf);
};
// fraction of predicted screen points with a lit window around them
const litFraction = (img, pts, win = 3, threshold = 25) => {
  let lit = 0, tested = 0;
  for (const [cx, cy] of pts) {
    const x = Math.round(cx), y = Math.round(cy);
    if (x < win || y < win || x > img.width - win - 1 || y > img.height - win - 1) continue;
    tested++;
    let m = 0;
    for (let dy = -win; dy <= win; dy++) for (let dx = -win; dx <= win; dx++) {
      const o = ((y + dy) * img.width + (x + dx)) * img.channels;
      m = Math.max(m, img.data[o] + img.data[o + 1] + img.data[o + 2]);
    }
    if (m > threshold) lit++;
  }
  return { lit, tested, fraction: tested ? lit / tested : 0 };
};

// In-page predictor: project world points through the CURRENT system-view pose
// with the shared navigation math (the nav-e2e hidpi pattern).
const PROJECT = `
  const nav = await import('/src/core/navigation.js');
  const fr = await import('/src/core/frames.js');
  const { SOL_SYSTEM } = await import('/src/core/sol.js');
  const n = window.__nav();
  const hostOrigin = fr.frameState(n.hostId, window.__state.epochS, SOL_SYSTEM).origin;
  const cameraI = nav.pivotCameraPosition(n.pose).map((v, i) => v + hostOrigin[i]);
  const targetI = n.pose.pivot.map((v, i) => v + hostOrigin[i]);
  const project = (p) => nav.projectPoint(p, cameraI, targetI, [0, 1, 0], 55 * Math.PI / 180, 1280, 720);
`;

try {
  await page.goto(`${server.url}/apps/system.html?fast=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__ready?.(), { timeout: 300000, polling: 250 });
  await page.evaluate(() => { window.__state.speed = 0; });

  // ---------------- A: belt-span ----------------
  const markers = await page.evaluate(() => window.__nav().markers.map((m) => m.id));
  check(markers.includes('cometa'), 'A: the comet is a marker (a body)');
  check(!markers.some((id) => id.includes('belt')), 'A: belts add no markers (never landable, structurally)');

  await page.evaluate(() => { window.__systemShot({ host: 'star', epochS: 0, warp: 0, reset: true, range: 5.2e11, pitch: 62, yaw: 20 }); window.__state.speed = 0; });
  await page.waitForFunction(() => window.__ready?.(), { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 400));
  const beltPts = await page.evaluate(`(async () => {
    ${PROJECT}
    const sm = await import('/src/core/smallbody.js');
    const { AU } = await import('/src/core/recipe.js');
    const belt = SOL_SYSTEM.belts[0];
    const m = sm.beltMembers(belt, SOL_SYSTEM.star.GM);
    const meanAlb = (belt.albedo[0] + belt.albedo[1] + belt.albedo[2]) / 3;
    // the brightest members (top of the size power law) — the ones the pass
    // renders at full gain; independent JS re-evaluation of the GLSL math
    const order = [...Array(m.count).keys()]
      .map((i) => ({ i, K: (AU / m.a[i]) ** 2 * meanAlb * m.R[i] * m.R[i] }))
      .sort((a, b) => b.K - a.K).slice(0, 200);
    const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const rotYL = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
    const rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
    const t = window.__state.epochS;
    const out = [];
    for (const { i } of order) {
      const M = wrap(m.M0[i] + m.n[i] * t);
      let E = M + m.e[i] * Math.sin(M);
      for (let k = 0; k < sm.BELT_SOLVER_ITERS; k++) E -= (E - m.e[i] * Math.sin(E) - M) / (1 - m.e[i] * Math.cos(E));
      const q = Math.sqrt(1 - m.e[i] * m.e[i]);
      const R = fr.mulMM(fr.mulMM(rotYL(m.Omega[i]), rotX(m.inc[i])), rotYL(m.omega[i]));
      const p = fr.mulMV(R, [m.a[i] * (Math.cos(E) - m.e[i]), 0, m.a[i] * q * Math.sin(E)]);
      const s = project(p);
      if (s && Math.abs(s.ndc[0]) < 0.98 && Math.abs(s.ndc[1]) < 0.98) out.push([s.x, s.y]);
    }
    return out;
  })()`);
  const beltImg = await shot('belt-span');
  const beltLit = litFraction(beltImg, beltPts);
  report.belt = { predicted: beltPts.length, ...beltLit };
  check(beltPts.length > 80, `A: enough bright members predicted in frame (${beltPts.length})`);
  check(beltLit.fraction >= 0.5, `A: rendered belt lies on the predicted members (${beltLit.lit}/${beltLit.tested} lit)`);

  // ---------------- B: comet-perihelion ----------------
  const peri = await page.evaluate(`(async () => {
    const fr = await import('/src/core/frames.js');
    const { SOL_SYSTEM } = await import('/src/core/sol.js');
    const cometa = SOL_SYSTEM.bodies.find((b) => b.id === 'cometa');
    const o = fr.resolvedOrbit(cometa, SOL_SYSTEM);
    const P = 2 * Math.PI / o.n;
    return { tPeri: -o.M0 / o.n, P };
  })()`);
  const tailProbe = async (epochS, name) => {
    await page.evaluate((t) => { window.__systemShot({ host: 'cometa', epochS: t, warp: 0, range: 3.5e10, pitch: 14, yaw: 140 }); window.__state.speed = 0; }, epochS);
    await page.waitForFunction(() => window.__ready?.(), { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 400));
    const pts = await page.evaluate(`(async () => {
      ${PROJECT}
      const sm = await import('/src/core/smallbody.js');
      const { AU } = await import('/src/core/recipe.js');
      const cometa = SOL_SYSTEM.bodies.find((b) => b.id === 'cometa');
      const center = fr.bodyCenterInertial(cometa, window.__state.epochS, [0, 0, 0], SOL_SYSTEM);
      const rM = Math.hypot(...center);
      const len = sm.tailLengthM(cometa.coma, rM / AU, AU);
      const dir = center.map((v) => v / rM);
      const head = project(center);
      const ray = [];
      for (let i = 1; i <= 24; i++) {
        const s = len * (0.6 * i / 24) ** 1.35;   // the bright 60% of the tail
        const p = project([center[0] + dir[0] * s, center[1] + dir[1] * s, center[2] + dir[2] * s]);
        if (p && Math.abs(p.ndc[0]) < 0.98 && Math.abs(p.ndc[1]) < 0.98) ray.push([p.x, p.y]);
      }
      return { head: head ? [head.x, head.y] : null, ray, lenAU: len / AU };
    })()`);
    const img = await shot(name);
    return { pts, img };
  };

  const at = await tailProbe(peri.tPeri, 'comet-perihelion');
  report.tail = { lenAU: +at.pts.lenAU.toFixed(3), raySamples: at.pts.ray.length };
  check(at.pts.lenAU > 0.3, `B: perihelion tail at showcase length (${at.pts.lenAU.toFixed(2)} AU)`);
  const headLit = at.pts.head ? litFraction(at.img, [at.pts.head], 4, 80) : { fraction: 0 };
  check(headLit.fraction === 1, 'B: the coma glows at the nucleus');
  const rayLit = litFraction(at.img, at.pts.ray, 2, 18);
  report.tail.lit = `${rayLit.lit}/${rayLit.tested}`;
  check(rayLit.tested >= 12 && rayLit.fraction >= 0.4, `B: the tail renders along the predicted anti-sunward ray (${rayLit.lit}/${rayLit.tested})`);

  const off = await tailProbe(peri.tPeri + peri.P / 2, 'comet-aphelion');
  check(off.pts.lenAU === 0, 'B: no tail law at aphelion (activity is a pure function of r)');
  // probe the equivalent ray anyway: nothing may render along it
  const offRay = [];
  for (let i = 1; i <= 24; i++) {
    const s = i / 24;
    if (at.pts.head) offRay.push([at.pts.head[0] + s * 300, at.pts.head[1]]);
  }
  const offLit = litFraction(off.img, offRay, 2, 18);
  check(offLit.fraction < 0.15, `B: aphelion frame is tail-free along the probe (${offLit.lit}/${offLit.tested})`);

  // ---------------- C: land on the comet ----------------
  await page.evaluate((t) => { window.__systemShot({ host: 'star', epochS: t, warp: 0, reset: true }); window.__state.speed = 0; }, peri.tPeri);
  await page.waitForFunction(() => window.__ready?.(), { timeout: 60000 });
  await page.evaluate(() => window.__travelTo('cometa'));
  await page.keyboard.down('Shift');
  for (let i = 0; i < 25; i++) {
    const done = await page.evaluate(() => window.__state.viewClass === 'surface' && window.__state.body.id === 'cometa');
    if (done) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => window.__state.viewClass === 'surface' && window.__state.body.id === 'cometa', { timeout: 90000 });
  await page.waitForFunction(() => window.__ready?.(), { timeout: 240000, polling: 250 });
  await shot('comet-surface');
  const arrival = await page.evaluate(() => ({ capture: window.__capture(), stream: window.__stream(), errors: (window.__pageErrors ?? []).splice(0) }));
  check(arrival.capture.body === 'cometa', 'C: nucleus surface arrival (the comet is landable)');
  check(arrival.errors.length === 0 && browserErrors.length === 0,
    `C: zero page errors${arrival.errors.length || browserErrors.length ? ` (${arrival.errors[0] ?? browserErrors[0]})` : ''}`);
  report.landing = { body: arrival.capture.body, workerTiles: arrival.stream.workerTiles };
} finally {
  writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await server.close();
}

console.log(JSON.stringify(report, null, 2));
console.log(failures ? `${failures} smallbody e2e failure(s)` : 'smallbody e2e passed');
process.exit(failures ? 1 : 0);
