// bench/run.mjs — ROADMAP_V2 Phase R: render the scene registry headless + score it.
//
//   npm run bench                       # all active scenes + today's control set
//   node bench/run.mjs --filter luna    # subset by name substring
//   node bench/run.mjs --no-controls    # registry only
//   node bench/run.mjs --full           # full quality (no ?fast=1) — slower
//
// Outputs: bench/out/stills/<name>.png + bench/out/metrics.json.
// If bench/baseline/metrics.json exists, prints per-metric deltas (regression gate:
// icons are qualitative anchors; ONLY control-set deltas may gate a change).
//
// Anti-overfit protocol (roadmap "Iconic-scene registry"): the control set is N
// randomly-posed scenes whose seeds rotate deterministically with the UTC date —
// tuning to the sixteen icons is caught by the controls regressing.

import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { metricsFor } from './metrics.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt;
};
const FILTER = opt('--filter', null);
const SEED_OVERRIDE = opt('--seed', null); // force the control date-seed (baseline reproduction)
const FULL = args.includes('--full');
const NO_CONTROLS = args.includes('--no-controls');
const PAGE_URL = opt('--url', `http://localhost:8131/planet.html${FULL ? '' : '?fast=1'}`);
const OUT = resolve(opt('--out', 'bench/out'));
const STILLS = resolve(OUT, 'stills');
mkdirSync(STILLS, { recursive: true });

// ---- expand the registry into concrete shots ----
const registry = JSON.parse(readFileSync(new URL('./scenes.json', import.meta.url), 'utf8'));
const META = ['id', 'name', 'tier', 'exercises', 'note', 'pending', 'motion', 'disk', 'altLadder', 'fovLadder', 'panDeg', 'noLimb'];
const shots = [];
for (const s of registry.scenes) {
  if (s.pending) continue;
  if (FILTER && !s.name.includes(FILTER)) continue;
  const spec = { clean: true };
  for (const k of Object.keys(s)) if (!META.includes(k)) spec[k] = s[k];
  if (s.altLadder) {
    s.altLadder.forEach((alt, i) =>
      shots.push({ name: `${s.name}-${String(i).padStart(2, '0')}-${alt}m`, tier: s.tier, disk: !!s.disk, noLimb: !!s.noLimb, spec: { ...spec, alt } }));
  } else if (s.fovLadder) {
    s.fovLadder.forEach((fov) =>
      shots.push({ name: `${s.name}-fov${fov}`, tier: s.tier, disk: !!s.disk, noLimb: !!s.noLimb, spec: { ...spec, fov } }));
  } else if (s.motion && s.alt === undefined) {
    // motion-only probe with no still pose
  } else {
    shots.push({ name: s.name, tier: s.tier, disk: !!s.disk, noLimb: !!s.noLimb, spec });
  }
}

// ---- rotating control set (deterministic from UTC date) ----
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
if (!NO_CONTROLS && !FILTER) {
  // control seed = UTC date by default (rotates daily), OR an explicit --seed
  // YYYYMMDD override so a verification sweep can reproduce the BASELINE's exact
  // control poses across dates (the anti-overfit regression gate compares
  // like-for-like controls; round 18 shipped this — the baseline was promoted on
  // a different date than the verification sweep).
  const d = new Date();
  const seed = SEED_OVERRIDE != null ? (parseInt(SEED_OVERRIDE, 10) | 0)
    : d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const rnd = mulberry32(seed);
  const bodies = ['tellus', 'rubra', 'luna'];
  // round 14 (panel M5): pre-classify controls whose view can intersect a
  // luna mascon-basin footprint — R6 legitimately relocates mare there, so
  // their deltas are EXPECTED and adjudicated individually; the rest gate at
  // ~0 as usual. Closed-form (forEachBasin), decided BEFORE the run, never
  // from the metrics (the silent-caps rule).
  const { forEachBasin } = await import('../src/core/bakecore.js');
  const { bodyById } = await import('../src/core/recipe.js');
  const lunaBasins = [];
  forEachBasin(bodyById('luna'), (b) => { if (b.fill > 0.05) lunaBasins.push(b); });
  // round 15 (panel F1-bench/M2): clouds move Tellus/Rubra content — but the
  // exemption is per-POSE, closed-form, decided BEFORE the run (the M5 rule):
  // a control is expected-delta ONLY if the coverage field actually reaches
  // its view footprint at the scene's own t. A clear-sky pose gates at ~0
  // exactly like Luna. Never from the metrics.
  const { makeCloudKeyframes, cloudCovJS, cloudKeyOf } = await import('../src/core/cloudcore.js');
  const { globalFor } = await import('../src/core/globalgrid.js');
  const kfCache = new Map();
  const cloudKfFor = (body, k) => {
    const key = body.id + ':' + k;
    if (!kfCache.has(key)) {
      const p = (body.processes ?? []).find((q) => q.type === 'global');
      const moist = p?.moisture ? ((g) => (dir) => g.sample('moist', dir))(globalFor(body, p)) : null;
      kfCache.set(key, makeCloudKeyframes(body, k, moist));
    }
    return kfCache.get(key);
  };
  const cloudInView = (body, spec) => {
    if (!body.clouds) return false;
    const t = 0.15 * body.orbit.periodDays * 86400 + spec.tday * body.spin.periodH * 3600;
    const { k } = cloudKeyOf(body, t);
    const kf = cloudKfFor(body, k);
    const la = (spec.lat * Math.PI) / 180, lo = (spec.lon * Math.PI) / 180;
    const dir = [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
    const viewAng = Math.acos(body.R / (body.R + spec.alt)) + 0.05;
    // scan a spiral of directions over the view cap for either deck's coverage
    const N = 160;
    const east = [-dir[2], 0, dir[0]];
    const el = Math.hypot(...east) || 1;
    east[0] /= el; east[2] /= el;
    const north = [
      dir[1] * east[2] - dir[2] * east[1],
      dir[2] * east[0] - dir[0] * east[2],
      dir[0] * east[1] - dir[1] * east[0],
    ];
    for (let i = 0; i < N; i++) {
      const r = viewAng * Math.sqrt((i + 0.5) / N);
      const th = i * 2.399963;
      const cr = Math.cos(r), sr = Math.sin(r);
      const d2 = [0, 1, 2].map((c) => dir[c] * cr + (east[c] * Math.cos(th) + north[c] * Math.sin(th)) * sr);
      for (let L = 0; L < Math.min(body.clouds.decks.length, 2); L++) {
        if (cloudCovJS(body, kf.rgba, L, d2, t) > 0.15) return true;
      }
    }
    return false;
  };
  // round 16 (panel emission/weather/companion control-gate): the NB-body capacity
  // widening injects the new Titan/Venus/Saturn §11 discs into every legacy sky, and
  // Tellus's night emission (aurora + city lights) now reads over the disc — both
  // legitimately change a control render vs the frozen round-15 baseline. Classify
  // per-POSE, closed-form, BEFORE the run (the M5 silent-caps rule), never from the
  // metrics. Over-tagging (marking a control expected-delta it might not show) is
  // SAFE; under-tagging (missing a real delta) is the failure the panel guards.
  const { ephemeris } = await import('../src/core/frames.js');
  const R15_BODIES = new Set(['tellus', 'rubra', 'luna']);
  const tOfControl = (body, spec) => 0.15 * body.orbit.periodDays * 86400 + spec.tday * body.spin.periodH * 3600;
  const dirOf = (spec) => {
    const la = (spec.lat * Math.PI) / 180, lo = (spec.lon * Math.PI) / 180;
    return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
  };
  // scan the view cap (nadir + the depressed horizon a pitched camera can see —
  // post-panel: a single nadir point under-tags; reuse cloudInView's cap geometry)
  const capDirs = (spec, margin = 0.05) => {
    const dir = dirOf(spec);
    const viewAng = Math.acos(bodyById(spec.body).R / (bodyById(spec.body).R + spec.alt)) + margin;
    const east = [-dir[2], 0, dir[0]]; const el = Math.hypot(...east) || 1; east[0] /= el; east[2] /= el;
    const north = [dir[1] * east[2] - dir[2] * east[1], dir[2] * east[0] - dir[0] * east[2], dir[0] * east[1] - dir[1] * east[0]];
    const out = [];
    for (let i = 0; i < 64; i++) {
      const r = viewAng * Math.sqrt((i + 0.5) / 64), th = i * 2.399963, cr = Math.cos(r), sr = Math.sin(r);
      out.push([0, 1, 2].map((c) => dir[c] * cr + (east[c] * Math.cos(th) + north[c] * Math.sin(th)) * sr));
    }
    return out;
  };
  const newCompanionInView = (body, spec) => {
    const eph = ephemeris(body, tOfControl(body, spec));
    const others = eph.others.slice().sort((a, b) => b.angRadius - a.angRadius).slice(0, 4);
    const up = dirOf(spec);
    const viewAng = Math.acos(body.R / (body.R + spec.alt));
    // a new companion contributes if it is above the depressed horizon the view cap
    // reaches (not just above the sub-camera nadir point).
    return others.some((o) => !R15_BODIES.has(o.body.id)
      && (o.dirBF[0] * up[0] + o.dirBF[1] * up[1] + o.dirBF[2] * up[2]) > -Math.sin(viewAng));
  };
  const nightEmissionInView = (body, spec) => {
    if (!body.atmosphere?.aurora && !body.nightLights) return false;
    const eph = ephemeris(body, tOfControl(body, spec));
    const s = eph.sunDirBF;
    // any sampled view direction near/past its own terminator → emission reads there
    return capDirs(spec).some((d) => (d[0] * s[0] + d[1] * s[1] + d[2] * s[2]) < 0.05);
  };
  for (let i = 0; i < 8; i++) {
    const body = bodies[(rnd() * 3) | 0];
    const alt = Math.exp(Math.log(50) + rnd() * (Math.log(2e7) - Math.log(50)));
    const spec = {
      clean: true, body,
      lat: -60 + rnd() * 120, lon: -180 + rnd() * 360,
      alt: Math.round(alt), tday: +(0.15 + rnd() * 0.7).toFixed(3),
      yaw: Math.round(rnd() * 360), pitch: Math.round(rnd() * 45),
    };
    let expected;
    if (body === 'luna') {
      const R = bodyById('luna').R;
      const la = (spec.lat * Math.PI) / 180, lo = (spec.lon * Math.PI) / 180;
      const dir = [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
      // view radius: horizon distance at this altitude, as an angle
      const viewAng = Math.acos(R / (R + spec.alt));
      for (const b of lunaBasins) {
        const ang = Math.acos(Math.max(-1, Math.min(1,
          dir[0] * b.v[0] + dir[1] * b.v[1] + dir[2] * b.v[2])));
        if (ang < viewAng + b.r / R) { expected = 'r6-basin-mare'; break; }
      }
    } else if (cloudInView(bodyById(body), spec)) {
      // round 15: coverage reaches this pose's view — the delta is the world
      // responding to clouds. A Tellus/Rubra control with a clear view stays
      // hard-gated (the blanket per-body exemption was panel-killed).
      expected = 'r15-clouds';
    }
    // round 16 tags (checked after clouds so the label reflects the primary cause;
    // any of these makes the control a legitimate expected-delta vs the r15 baseline)
    if (!expected && newCompanionInView(bodyById(body), spec)) expected = 'r16-new-companion';
    if (!expected && nightEmissionInView(bodyById(body), spec)) expected = 'r16-night-emission';
    // round 17 (panel top4-eviction): tag when the top-4 companion SET with the
    // round-17 bodies differs from the set without them (the presence test above
    // is blind to EVICTION). Closed-form, before the run; over-tag safe. The
    // three figure bodies' angular radii sit orders below the 4th slot at every
    // epoch (vesta ~1.4e-6 rad vs ~9e-6 worst 4th), so this never fires today —
    // it exists so a future orbit/size edit trips the gate loudly.
    if (!expected) {
      const R17_BODIES = new Set(['vesta', 'haumea', 'arrokoth']);
      const eph17 = ephemeris(bodyById(body), tOfControl(bodyById(body), spec));
      const all17 = eph17.others.slice().sort((a, b) => b.angRadius - a.angRadius);
      const with17 = all17.slice(0, 4).map((o) => o.body.id).join();
      const without17 = all17.filter((o) => !R17_BODIES.has(o.body.id)).slice(0, 4).map((o) => o.body.id).join();
      if (with17 !== without17) expected = 'r17-companion-shift';
    }
    // round 18 (europa/pluto eviction analog): a DEFENSIVE dead tripwire like
    // r17's — europa/pluto are recipe `skyHidden:true` (post-impl R18-LEGACY-1:
    // unhidden, they cracked Haumea's top-4 and broke its byte-identity), so
    // ephemeris().others already filters them out and they can never enter any
    // top-4. The check would only fire if a future edit removed skyHidden — it
    // exists to trip loudly in that case. (Ringed Saturn appearing in a control
    // sky is already r16-new-companion, Saturn ∉ R15 — an expected delta there.)
    if (!expected) {
      const R18_BODIES = new Set(['europa', 'pluto']);
      const eph18 = ephemeris(bodyById(body), tOfControl(bodyById(body), spec));
      const all18 = eph18.others.slice().sort((a, b) => b.angRadius - a.angRadius);
      const with18 = all18.slice(0, 4).map((o) => o.body.id).join();
      const without18 = all18.filter((o) => !R18_BODIES.has(o.body.id)).slice(0, 4).map((o) => o.body.id).join();
      if (with18 !== without18) expected = 'r18-companion-shift';
    }
    shots.push({
      name: `control-${seed}-${i}`, tier: 'control', disk: alt > 5e6,
      expected, spec,
    });
  }
}

console.log(`${shots.length} shots -> ${STILLS}`);

// ---- render ----
const W = 1280, H = 780;
const launch = {
  headless: 'new',
  // protocolTimeout must exceed the longest scene settle (__shot waitMs up to
  // 300 s on eye-level scenes) or puppeteer kills the blocking evaluate call
  protocolTimeout: 420000,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
};
// Chrome pin repair (round 17, registered r16): the puppeteer-declared Chrome
// (131) is broken on this host while 149 works. Resolution order: the explicit
// env override, else the NEWEST Chrome in the local puppeteer cache, else the
// bundled default. No hardcoded user path (§5: no machine dependence) — the
// cache scan finds whatever chrome the machine actually has.
if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  launch.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
} else {
  try {
    const { readdirSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const root = join(homedir(), '.cache', 'puppeteer', 'chrome');
    const vers = readdirSync(root).filter((d) => d.startsWith('win64-'))
      .sort((a, b) => parseFloat(b.slice(6)) - parseFloat(a.slice(6)));
    if (vers.length) launch.executablePath = join(root, vers[0], 'chrome-win64', 'chrome.exe');
  } catch { /* no cache: fall through to the bundled default */ }
}
const browser = await puppeteer.launch(launch);
const errs = [];
async function freshPage() {
  const p = await browser.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  console.log('loading', PAGE_URL);
  await p.goto(PAGE_URL, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__ready && window.__ready(), { timeout: 240000, polling: 250 });
  return p;
}
let page = await freshPage();

const results = [];
let broken = 0, underSettled = 0;
for (const shot of shots) {
  const t0 = Date.now();
  // round 14: __shot resolves {settled, ms} — the round-13 flake was the
  // waitMs deadline escape rendering a still-streaming scene indistinguishable
  // from a settled one. An unsettled capture gets ONE retry on a FRESH page
  // (same-page retries measure cache warmth, not settle honesty — panel M6);
  // a second miss marks the scene and fails the sweep loud. Keyed on stream
  // state only, never on metrics (the silent-caps rule).
  // round 15 (panel F6): the whole per-shot body is contained — a protocol
  // kill (waitMs colliding with protocolTimeout, a wedged page) fails THAT
  // scene loud and the sweep continues; metrics.json is written incrementally
  // so a crash can never discard the scenes already captured.
  try {
    if (shot.expected) console.log(`  (${shot.name}: pre-classified expected-delta — ${shot.expected})`);
    let res = await page.evaluate((s) => window.__shot(s), shot.spec);
    let retried = false;
    if (res && res.settled === false) {
      console.warn(`UNSETTLED ${shot.name} after ${res.ms} ms — retrying on a fresh page`);
      await page.close();
      page = await freshPage();
      res = await page.evaluate((s) => window.__shot(s), shot.spec);
      retried = true;
    }
    await new Promise((r) => setTimeout(r, 350));
    const file = resolve(STILLS, shot.name + '.png');
    await page.screenshot({ path: file });
    // round 17: noLimb — figure-body disk scenes skip the limb-profile metric
    // (an azimuthally-averaged radial profile presumes a CIRCULAR silhouette).
    // disk and limb are SEPARATE tags: a noLimb disk must not fall back to the
    // ground-scene horizonGap metric either (post-impl panel).
    const m = metricsFor(file, { disk: shot.disk, limb: shot.disk && !shot.noLimb });
    m.tier = shot.tier;
    if (shot.expected) m.expected = shot.expected;
    if (res && res.settled === false) {
      m.underSettled = true;
      underSettled++;
      console.error(`UNDER-SETTLED ${shot.name}: still streaming after retry (${res.ms} ms) — metrics untrustworthy`);
    } else if (retried) {
      console.log(`  retry settled ${shot.name} in ${res.ms} ms`);
    }
    // a dead renderer must FAIL the scene, never be scored: the round-4 OOM
    // painted allocation-failure banners into stills and their metrics read as
    // content regressions until the images themselves were opened
    const perr = await page.evaluate(() => (window.__pageErrors ?? []).splice(0));
    if (perr.length) {
      m.pageError = perr.join(' | ');
      broken++;
      console.error(`PAGE-ERROR ${shot.name}: ${m.pageError}`);
    }
    results.push(m);
    console.log(`${shot.name}  slope ${m.spec_slope} kurt ${m.grad_kurtosis} shadow ${m.shadow_frac} mean ${m.lum_mean}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    broken++;
    results.push({ name: shot.name, tier: shot.tier, pageError: 'protocol/driver: ' + String(e).split('\n')[0] });
    console.error(`PROTOCOL-FAIL ${shot.name}: ${String(e).split('\n')[0]} — fresh page, continuing`);
    try { await page.close(); } catch {}
    page = await freshPage();
  }
  writeFileSync(resolve(OUT, 'metrics.json'), JSON.stringify(results, null, 1));
}
await browser.close();
if (errs.length) console.log('page errors:', errs.slice(0, 8).join(' | '));
if (broken) console.error(`\n${broken} scene(s) rendered on a BROKEN page — do not trust their metrics`);
if (underSettled) console.error(`${underSettled} scene(s) captured UNDER-SETTLED — do not trust their metrics`);
process.exitCode = (broken || underSettled) ? 1 : 0;

writeFileSync(resolve(OUT, 'metrics.json'), JSON.stringify(results, null, 1));
console.log('wrote', resolve(OUT, 'metrics.json'));

// ---- regression deltas vs baseline (control tier gates; icons informative) ----
const basePath = resolve('bench/baseline/metrics.json');
if (existsSync(basePath)) {
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  const byFile = new Map(base.map((b) => [b.file, b]));
  console.log('\n== deltas vs baseline (gate on control tier only) ==');
  for (const m of results) {
    const b = byFile.get(m.file);
    if (!b) continue;
    const d = (k) => (m[k] != null && b[k] != null ? (m[k] - b[k]).toFixed(3) : 'n/a');
    const tag = m.tier !== 'control' ? '' : m.expected ? `[GATE:EXPECTED ${m.expected}] ` : '[GATE] ';
    console.log(`${tag}${m.file}: dslope ${d('spec_slope')} dkurt ${d('grad_kurtosis')} dshadow ${d('shadow_frac')} dmean ${d('lum_mean')}`);
  }
}
