// harness/bench.mjs — the metric gate (LAYOUT_ROADMAP §6.3). A thin CLI over three
// durable ideas from the old bench/run.mjs, now built on the renderShots kernel:
//   1. a rotating date-seeded CONTROL SET (anti-overfit: tuning to the iconic scenes
//      is caught by the controls regressing) — control bodies DERIVE FROM THE LOADED
//      SYSTEM, never a hardcoded list, so a generated system gets controls for free;
//   2. EXPECTED-DELTAS pre-classified from closed-form geometry BEFORE the run, never
//      read back from the metrics (the silent-caps rule);
//   3. a BASELINE DIFF that gates on the control tier only (icons are qualitative
//      anchors). Promotion is `--promote` (writes baseline/metrics.json + provenance),
//      not a manual copy ritual.
//
//   node harness/bench.mjs                 # icons + today's controls, gate vs baseline
//   node harness/bench.mjs --filter luna   # subset by name substring (no controls)
//   node harness/bench.mjs --seed 20260712 # reproduce a baseline's exact control poses
//   node harness/bench.mjs --promote       # capture on a pinned seed, write the baseline
//   node harness/bench.mjs --parallel 3
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { renderShots, ROOT, defaultParallel } from './shots.mjs';
import { metricsFor } from './metrics.mjs';
import { SYSTEM, bodyById } from '../src/core/recipe.js';
import { SOL_SYSTEM, SOL_REPIN_DELTA } from '../src/core/sol.js';
import { validateSpec } from '../src/scenespec.js';
import { forEachBasin } from '../src/core/bakecore.js';
import { makeCloudKeyframes, cloudCovJS, cloudKeyOf } from '../src/core/cloudcore.js';
import { globalFor } from '../src/core/globalgrid.js';
import { ephemeris } from '../src/core/frames.js';
import { cameraRangeBounds } from '../src/core/navigation.js';
import { epochFromViews } from '../src/core/time.js';
import { sameRunProvenance } from '../src/core/system.js';

const BASELINE = resolve(ROOT, 'harness/baseline/metrics.json');

// ---------------- pure gate ----------------
// Compare a fresh run to a baseline. Only control-tier shots gate; an `expected` tag
// exempts that shot (the delta is the world legitimately responding, pre-classified).
// Returns { rows, regressions } — regressions is [] when clean.
export function gate(run, baseline, policy = {}) {
  if (policy.runProvenance || policy.baselineProvenance) {
    if (!sameRunProvenance(policy.runProvenance, policy.baselineProvenance)) {
      throw new Error(`refusing incomparable runs: ${JSON.stringify(policy.runProvenance)} vs ${JSON.stringify(policy.baselineProvenance)}`);
    }
  }
  // Round 19 repeated-control envelope: grad_kurtosis moved by 69.958 on one
  // multistable tile set while the three aggregate metrics stayed flat. 100 is
  // the observed maximum x1.43; the photometric/spectral gates stay unchanged.
  const tol = policy.tol || { spec_slope: 0.25, grad_kurtosis: 100, shadow_frac: 0.05, lum_mean: 0.03 };
  const byFile = new Map(baseline.map((b) => [b.file, b]));
  const rows = [], regressions = [];
  for (const m of run) {
    const b = byFile.get(m.file);
    if (!b) continue;
    const deltas = {};
    for (const k of Object.keys(tol)) if (m[k] != null && b[k] != null) deltas[k] = +(m[k] - b[k]).toFixed(3);
    const gated = m.tier === 'control' && !m.expected;
    const over = gated ? Object.keys(tol).filter((k) => deltas[k] != null && Math.abs(deltas[k]) > tol[k]) : [];
    rows.push({ file: m.file, tier: m.tier, expected: m.expected || null, deltas, gated, over });
    if (over.length) regressions.push({ file: m.file, over: over.map((k) => `${k} ${deltas[k]}`) });
  }
  return { rows, regressions };
}

// ---------------- control set (derived from the loaded system) ----------------
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Closed-form expected-delta classifiers, ported verbatim in spirit from round 14-18.
// Each answers "would this pose legitimately differ from a frozen baseline?" from
// geometry alone. Over-tagging is SAFE (a control marked expected that isn't just
// isn't gated); under-tagging is the failure these guard. Built once with caches.
function makeClassifier(system, diff = {}) {
  const added = new Set(diff.addedBodies ?? []);
  const changed = new Set(diff.changedBodies ?? []);
  const cloudBodies = new Set(diff.cloudBodies ?? []);
  const emissionBodies = new Set(diff.emissionBodies ?? []);
  const basinBodies = new Set(diff.basinBodies ?? []);
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
  const dirOf = (spec) => { const la = spec.lat * Math.PI / 180, lo = spec.lon * Math.PI / 180; return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)]; };
  const tOf = (body, spec) => epochFromViews(body, spec, system);
  const capDirs = (spec, N = 96, margin = 0.05) => {
    const body = bodyById(spec.body, system), dir = dirOf(spec);
    const viewAng = Math.acos(body.R / (body.R + spec.alt)) + margin;
    const east = [-dir[2], 0, dir[0]]; const el = Math.hypot(...east) || 1; east[0] /= el; east[2] /= el;
    const north = [dir[1] * east[2] - dir[2] * east[1], dir[2] * east[0] - dir[0] * east[2], dir[0] * east[1] - dir[1] * east[0]];
    const out = [];
    for (let i = 0; i < N; i++) { const r = viewAng * Math.sqrt((i + 0.5) / N), th = i * 2.399963, cr = Math.cos(r), sr = Math.sin(r); out.push([0, 1, 2].map((c) => dir[c] * cr + (east[c] * Math.cos(th) + north[c] * Math.sin(th)) * sr)); }
    return out;
  };
  const cloudInView = (body, spec) => {
    if (!body.clouds || !cloudBodies.has(body.id)) return false;
    const t = tOf(body, spec); const { k } = cloudKeyOf(body, t); const kf = cloudKfFor(body, k);
    return capDirs(spec, 160).some((d2) => { for (let L = 0; L < Math.min(body.clouds.decks.length, 2); L++) if (cloudCovJS(body, kf.rgba, L, d2, t) > 0.15) return true; return false; });
  };
  const newCompanionInView = (body, spec) => {
    const eph = ephemeris(body, tOf(body, spec), system); const up = dirOf(spec); const viewAng = Math.acos(body.R / (body.R + spec.alt));
    return eph.others.slice().sort((a, b) => b.angRadius - a.angRadius).slice(0, 4)
      .some((o) => added.has(o.body.id) && (o.dirBF[0] * up[0] + o.dirBF[1] * up[1] + o.dirBF[2] * up[2]) > -Math.sin(viewAng));
  };
  const nightEmissionInView = (body, spec) => {
    if (!body.atmosphere?.aurora || !emissionBodies.has(body.id)) return false;
    const s = ephemeris(body, tOf(body, spec), system).sunDirBF;
    return capDirs(spec).some((d) => (d[0] * s[0] + d[1] * s[1] + d[2] * s[2]) < 0.05);
  };
  const basinsByBody = new Map();
  const lunaLikeBasins = (body) => {
    if (!basinsByBody.has(body.id)) { const arr = []; try { forEachBasin(body, (b) => { if (b.fill > 0.05) arr.push(b); }); } catch { /* no basins */ } basinsByBody.set(body.id, arr); }
    return basinsByBody.get(body.id);
  };
  return (body, spec) => {
    if (changed.has(body.id)) return 'body-data';
    const basins = basinBodies.has(body.id) ? lunaLikeBasins(body) : [];
    if (basins.length) {
      const dir = dirOf(spec), viewAng = Math.acos(body.R / (body.R + spec.alt));
      for (const b of basins) { const ang = Math.acos(Math.max(-1, Math.min(1, dir[0] * b.v[0] + dir[1] * b.v[1] + dir[2] * b.v[2]))); if (ang < viewAng + b.r / body.R) return 'basin-fill'; }
    }
    if (cloudInView(body, spec)) return 'clouds';
    if (newCompanionInView(body, spec)) return 'new-companion';
    if (nightEmissionInView(body, spec)) return 'night-emission';
    return null;
  };
}

function buildControls(seed, n = 8, { system = SYSTEM, diff = {} } = {}) {
  const rnd = mulberry32(seed);
  const byId = new Map(system.bodies.map((b) => [b.id, b]));
  const pool = system.bodies.filter((b) => b.rocks).map((b) => b.id);
  const classify = makeClassifier(system, diff);
  const classes = { surface: [], disk: [], system: [], travel: [], warp: [] };
  for (let i = 0; i < n; i++) {
    const body = pool[(rnd() * pool.length) | 0];
    const alt = Math.round(Math.exp(Math.log(50) + rnd() * (Math.log(2e7) - Math.log(50))));
    const spec = { clean: true, body, lat: -60 + rnd() * 120, lon: -180 + rnd() * 360, alt, tday: +(0.15 + rnd() * 0.7).toFixed(3), yaw: Math.round(rnd() * 360), pitch: Math.round(rnd() * 45) };
    const poseClass = alt > 5e6 ? 'disk' : 'surface';
    classes[poseClass].push({ name: `control-${seed}-${i}`, tier: 'control', poseClass, disk: poseClass === 'disk', expected: classify(byId.get(body), spec), spec });
  }
  classes.warp = buildWarpControls(seed, 2, { system, diff });
  return classes;
}

// Phase W's control surface (round 24): random epoch × declared-warp draws
// under the capture law. Every draw is closed-form from (system, seed) before
// rendering; the declared warp selects the representation set (above-band
// forms render mean clouds / no lightning / canonical ocean), so a regression
// in the [time-field] policy moves these controls, not just fixed detents.
// Cloud-bearing bodies are the pool — they exercise every band the table owns.
function buildWarpControls(seed, n = 2, { system = SYSTEM, diff = {} } = {}) {
  const rnd = mulberry32(seed ^ 0x57415250);
  const byId = new Map(system.bodies.map((b) => [b.id, b]));
  const pool = system.bodies.filter((b) => b.clouds).map((b) => b.id);
  if (!pool.length) return [];
  const classify = makeClassifier(system, diff);
  return Array.from({ length: n }, (_, i) => {
    const body = pool[(rnd() * pool.length) | 0];
    const warp = Math.round(Math.exp(Math.log(10) + rnd() * Math.log(3.15e8 / 10))) * (rnd() < 0.25 ? -1 : 1);
    const alt = Math.round(Math.exp(Math.log(2e5) + rnd() * Math.log(2e7 / 2e5)));
    const spec = { clean: true, body, lat: -45 + rnd() * 90, lon: -180 + rnd() * 360, alt,
      epochS: Math.round((rnd() * 2 - 1) * 20 * 365.25 * 86400), warp,
      yaw: Math.round(rnd() * 360), pitch: Math.round(rnd() * 30) };
    return { name: `warp-control-${seed}-${i}`, tier: 'control', poseClass: 'warp',
      disk: alt > 5e6, expected: classify(byId.get(body), spec), spec };
  });
}

// Phase N's second control surface. These are consumed by nav-e2e because they
// target apps/system.html rather than the inspector's surface SceneSpec. Every
// draw is closed-form from (system, seed): host, target, range and epoch are
// recorded before rendering, and membership deltas are classified from the
// Re-Pin ledger rather than inferred from pixels.
function buildSystemControls(seed, n = 4, { system = SYSTEM, diff = {} } = {}) {
  const rnd = mulberry32(seed ^ 0x4e4156), added = new Set(diff.addedBodies ?? []);
  const hosts = ['star', ...(system.nodes ?? []).map((x) => x.id), ...system.bodies.map((x) => x.id)];
  return Array.from({ length: n }, (_, i) => {
    const host = hosts[(rnd() * hosts.length) | 0], target = system.bodies[(rnd() * system.bodies.length) | 0];
    const bounds = cameraRangeBounds(system, host), range = Math.exp(Math.log(bounds.min) + rnd() * Math.log(bounds.max / bounds.min));
    return { name: `system-control-${seed}-${i}`, tier: 'control', poseClass: 'system',
      expected: added.has(target.id) ? 'new-membership' : null,
      spec: { viewClass: 'system', host, target: target.id, range, epochS: Math.round((rnd() * 2 - 1) * 50 * 365.25 * 86400),
        yaw: rnd() * 360 - 180, pitch: rnd() * 140 - 70 } };
  });
}

// ---------------- registry expansion (iconic scenes) ----------------
const META = ['id', 'name', 'tier', 'exercises', 'note', 'pending', 'motion', 'disk', 'altLadder', 'fovLadder', 'panDeg', 'noLimb'];
function expandRegistry(filter) {
  const registry = JSON.parse(readFileSync(resolve(ROOT, 'harness/scenes.json'), 'utf8'));
  const shots = [];
  for (const s of registry.scenes) {
    if (s.pending) continue;
    if (filter && !s.name.includes(filter)) continue;
    const spec = { clean: true };
    for (const k of Object.keys(s)) if (!META.includes(k)) spec[k] = s[k];
    if (s.altLadder) s.altLadder.forEach((alt, i) => shots.push({ name: `${s.name}-${String(i).padStart(2, '0')}-${alt}m`, tier: s.tier, disk: !!s.disk, noLimb: !!s.noLimb, spec: { ...spec, alt } }));
    else if (s.fovLadder) s.fovLadder.forEach((fov) => shots.push({ name: `${s.name}-fov${fov}`, tier: s.tier, disk: !!s.disk, noLimb: !!s.noLimb, spec: { ...spec, fov } }));
    else if (s.motion && s.alt === undefined) { /* motion-only probe, no still */ }
    else shots.push({ name: s.name, tier: s.tier, disk: !!s.disk, noLimb: !!s.noLimb, spec });
  }
  return shots;
}

// ---------------- CLI ----------------
export { buildControls, buildSystemControls, buildWarpControls, makeClassifier, expandRegistry };

const isMain = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isMain) {
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt; };
const FILTER = opt('--filter', null);
const PROMOTE = args.includes('--promote');
const CONTROLS_ONLY = args.includes('--controls-only');
const SYSTEM_NAME = opt('--system', 'demo');
if (!['demo', 'sol'].includes(SYSTEM_NAME)) { console.error('--system must be demo or sol'); process.exit(1); }
const LOADED_SYSTEM = SYSTEM_NAME === 'sol' ? SOL_SYSTEM : SYSTEM;
const PARALLEL = +(opt('--parallel', defaultParallel()));
const utcSeed = () => { const d = new Date(); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
const SEED = opt('--seed', null) != null ? parseInt(opt('--seed'), 10) : utcSeed();

const shots = [
  ...(CONTROLS_ONLY ? [] : expandRegistry(FILTER)),
  ...(FILTER ? [] : Object.values(buildControls(SEED, 8, { system: LOADED_SYSTEM, diff: SYSTEM_NAME === 'sol' ? SOL_REPIN_DELTA : {} })).flat()),
];
console.log(`${shots.length} shots (system ${SYSTEM_NAME}, seed ${SEED}, parallel ${PARALLEL})`);
// validate every spec against the SceneSpec schema BEFORE the (slow) render — a typo'd
// field is a fail-fast here instead of a mystery zero-delta scene 15 minutes later.
let invalid = 0;
for (const s of shots) { const v = validateSpec(s.spec); if (!v.ok) { invalid++; console.error(`  INVALID ${s.name}: ${v.errors.join('; ')}`); } }
if (invalid) { console.error(`${invalid} spec(s) fail the schema — fix before rendering.`); process.exit(1); }
for (const s of shots) if (s.expected) console.log(`  ${s.name}: expected-delta (${s.expected})`);

const recs = await renderShots(shots, { out: resolve(ROOT, 'harness/out'), parallel: PARALLEL, seed: SEED, system: SYSTEM_NAME });

// score each captured still
const scored = [];
for (const r of recs) {
  if (r.errors.length) { scored.push({ file: r.name + '.png', tier: r.tier, pageError: r.errors.join(' | ') }); continue; }
  const m = metricsFor(r.png, { disk: r.disk, limb: r.disk && !r.noLimb });
  m.tier = r.tier; if (r.expected) m.expected = r.expected; if (!r.settled) m.underSettled = true;
  scored.push(m);
}
mkdirSync(resolve(ROOT, 'harness/out'), { recursive: true });
writeFileSync(resolve(ROOT, 'harness/out/metrics.json'), JSON.stringify(scored, null, 1));

const broken = recs.filter((r) => r.errors.length).length;
const unsettled = recs.filter((r) => !r.settled).length;

if (PROMOTE) {
  if (broken || unsettled) { console.error('refusing to promote: broken/unsettled shots in the run'); process.exit(1); }
  if (execSync('git status --porcelain', { cwd: ROOT }).toString().trim()) {
    console.error('refusing to promote from a dirty worktree'); process.exit(1);
  }
  mkdirSync(resolve(ROOT, 'harness/baseline'), { recursive: true });
  const provenance = { ...recs[0]?.provenance, seed: SEED, promotedFrom: 'harness/bench.mjs' };
  writeFileSync(BASELINE, JSON.stringify({ provenance, metrics: scored }, null, 1));
  console.log(`\npromoted baseline: ${scored.length} shots @ seed ${SEED}, commit ${provenance.commit}`);
  console.log('commit harness/baseline/metrics.json to pin this gate to a revision.');
} else if (existsSync(BASELINE)) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  let gated;
  try {
    gated = gate(scored, base.metrics || base, { runProvenance: recs[0]?.provenance, baselineProvenance: base.provenance });
  } catch (error) {
    console.error(String(error)); process.exit(1);
  }
  const { rows, regressions } = gated;
  console.log('\n== deltas vs baseline (gate on control tier only) ==');
  for (const r of rows) {
    const tag = r.tier !== 'control' ? '' : r.expected ? `[EXPECTED ${r.expected}] ` : r.over.length ? '[REGRESSION] ' : '[GATE] ';
    console.log(`${tag}${r.file}: ${Object.entries(r.deltas).map(([k, v]) => `${k} ${v}`).join('  ')}`);
  }
  if (regressions.length) { console.error(`\n${regressions.length} control(s) REGRESSED:`); for (const r of regressions) console.error(`  ${r.file}: ${r.over.join(', ')}`); }
  else console.log('\ncontrols within tolerance.');
  process.exitCode = (broken || unsettled || regressions.length) ? 1 : 0;
} else {
  console.log('\nno baseline yet — run with --promote to create one.');
  process.exitCode = (broken || unsettled) ? 1 : 0;
}
}
