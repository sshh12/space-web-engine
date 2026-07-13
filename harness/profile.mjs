// harness/profile.mjs — load-time WATERFALL for a scene (LAYOUT_ROADMAP §6, perf work).
//
// renderShots reports total settle `ms`; this shows WHERE that time went. It fires the
// scene and polls window.__stream() to build a timeline of the pending counts, then
// prints when each subsystem drained — so "why is this scene slow" is a name, not a
// guess. The bake worker is the usual bottleneck and this makes that visible per scene.
//
//   node harness/profile.mjs rubra-canyon-dawn            # one scene by name
//   node harness/profile.mjs blue-marble luna-boulderfield
//   node harness/profile.mjs --trace rubra-canyon-dawn    # + Chrome/Perfetto trace file
//   node harness/profile.mjs --body luna --alt 2.5        # ad-hoc pose (no scenes.json)
//
// For the deep main-thread/worker/GPU flamegraph, add --trace and open the emitted
// harness/out/profile/<name>.trace.json in https://ui.perfetto.dev or chrome://tracing.
import { resolve } from 'node:path';
import { renderShots, ROOT } from './shots.mjs';
import { expandRegistry } from './bench.mjs';

// Map __stream() counters to human subsystem names (peak>0 => it did work).
const SUBSYS = [
  { key: 'pending', label: 'tiles' },
  { key: 'rockQ', label: 'rocks' },
  { key: 'formQ', label: 'forms' },
  { key: 'cloudQ', label: 'clouds' },
  { key: 'disc', label: 'disc' },
  { key: 'fading', label: 'fade' },
];

// From a timeline [{t, pending, rockQ, ...}] derive, per subsystem, its peak backlog and
// the t at which it first hit zero (having been >0). The last drain is the bottleneck.
export function waterfall(timeline) {
  const total = timeline.length ? timeline[timeline.length - 1].t : 0;
  const rows = [];
  for (const { key, label } of SUBSYS) {
    let peak = 0, everBusy = false, drain = null;
    for (const s of timeline) {
      const v = s[key] ?? 0;
      if (v > 0) { everBusy = true; peak = Math.max(peak, v); }
      if (everBusy && v === 0 && drain == null) drain = s.t;
    }
    if (!everBusy) continue;                         // subsystem did nothing this scene
    rows.push({ label, peak, drain: drain ?? total });
  }
  rows.sort((a, b) => b.drain - a.drain);            // slowest first
  return { total, rows, bottleneck: rows[0]?.label ?? 'none' };
}

function render(name, timeline) {
  const { total, rows, bottleneck } = waterfall(timeline);
  const W = 32;
  console.log(`\n${name}  total ${(total / 1000).toFixed(1)}s  (bottleneck: ${bottleneck})`);
  for (const r of rows) {
    const bars = total ? Math.max(1, Math.round((r.drain / total) * W)) : 0;
    console.log(`  ${r.label.padEnd(7)}${'█'.repeat(bars).padEnd(W)} ${(r.drain / 1000).toFixed(1)}s  peak ${r.peak}`);
  }
}

// ---- CLI ----
const argv = process.argv.slice(2);
const TRACE = argv.includes('--trace');
const names = argv.filter((a) => !a.startsWith('--') && !/^-?\d/.test(a));
const bodyI = argv.indexOf('--body'); const altI = argv.indexOf('--alt');

let shots;
if (bodyI >= 0) {
  const body = argv[bodyI + 1], alt = altI >= 0 ? +argv[altI + 1] : 2000;
  shots = [{ name: `${body}-${alt}m`, spec: { clean: true, body, lat: 0, lon: 0, alt, tday: 0.3, waitMs: 240000 } }];
} else {
  const all = expandRegistry(null);
  shots = names.map((n) => all.find((s) => s.name === n)).filter(Boolean)
    .map((s) => ({ ...s, spec: { ...s.spec, waitMs: 240000 } }));
  const missing = names.filter((n) => !shots.some((s) => s.name === n));
  if (missing.length) { console.error('unknown scene(s):', missing.join(', ')); process.exit(1); }
}
if (!shots.length) { console.error('usage: node harness/profile.mjs <scene>... | --body <id> --alt <m>  [--trace]'); process.exit(1); }

const out = resolve(ROOT, 'harness/out/profile');
const recs = await renderShots(shots, { out, parallel: 1, profile: true, trace: TRACE, quiet: false });
for (const r of recs) {
  if (r.errors.length) { console.error(`\n${r.name}: ERRORS ${r.errors.join(' | ')}`); continue; }
  if (!r.profile) { console.error(`\n${r.name}: no profile captured`); continue; }
  render(r.name, r.profile);
  if (!r.settled) console.error(`  (did NOT settle — timeline is a partial load)`);
  if (TRACE) console.log(`  trace: ${resolve(out, 'stills', r.name + '.trace.json')}  -> ui.perfetto.dev`);
}
