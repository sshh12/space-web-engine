// harness/motion.mjs — motion bench as a COMPOSITION, not a sibling driver
// (LAYOUT_ROADMAP §3): a run is renderShots over Situation timelines + the pure
// sequenceMetrics scorer. The pose capital (the canned camera paths) is the only
// durable thing here; everything else is ~20 lines over the kernel.
//
//   node harness/motion.mjs            # all paths
//   node harness/motion.mjs --path descent
//   node harness/motion.mjs --clouds-off
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderShots, ROOT } from './shots.mjs';
import { sequenceMetrics } from './metrics.mjs';
import { readPNG, luminance } from './png.mjs';

const args = process.argv.slice(2);
const only = args.includes('--path') ? args[args.indexOf('--path') + 1] : null;
const CLOUDS_OFF = args.includes('--clouds-off');

// fixedEV: pop metrics must measure the WORLD's steps, not the AE servo. waitMs on
// frame 0 is the cold-bake settle; later frames only need the advection step.
const PATHS = {
  descent: { frames: 36, center: true, spec: (i) => ({ body: 'tellus', lat: -4, lon: -76, tday: 0.3, clean: true, fixedEV: -0.8, waitMs: i ? 300 : 60000, alt: Math.round(20e6 * Math.pow(2e2 / 20e6, i / 35)) }) },
  'orbit-pan': { frames: 36, center: false, spec: (i) => ({ body: 'tellus', lat: 10, lon: i * 0.33, alt: 800000, tday: 0.35, clean: true, fixedEV: -0.8, waitMs: i ? 300 : 60000 }) },
  'ocean-fixed': { frames: 30, center: false, flicker: true, spec: (i) => ({ body: 'tellus', lat: -20, lon: -175, alt: 900, tday: 0.28 + i * 2e-5, yaw: -103, pitch: 18, clean: true, waitMs: i ? 300 : 60000 }) },
  'impostor-approach': { frames: 30, center: true, spec: (i) => ({ body: 'luna', lat: 10, lon: 35, tday: 0.22, clean: true, fixedEV: -0.8, fov: 28, pitch: 25, waitMs: i ? 300 : 60000, alt: Math.round(2400 - i * 60) }) },
  'impostor-approach-rubra': { frames: 30, center: true, spec: (i) => ({ body: 'rubra', lat: -12.0, lon: -77.7, tday: 0.26, clean: true, fixedEV: -0.8, fov: 28, pitch: 25, waitMs: i ? 300 : 60000, alt: Math.round(2000 - i * 50) }) },
  'cloud-drift': { frames: 36, center: false, flicker: true, spec: (i) => ({ body: 'tellus', lat: -49, lon: -110, alt: 3000, tday: 0.43 + i * 0.001, pitch: 25, fov: 60, clean: true, fixedEV: -0.8, waitMs: i ? 300 : 60000 }) },
  'cloud-approach': { frames: 32, center: true, spec: (i) => ({ body: 'tellus', lat: -13, lon: -158, tday: 0.32, clean: true, fixedEV: -0.8, pitch: 20, waitMs: i ? 300 : 60000, alt: Math.round(500e3 * Math.pow(600 / 500e3, i / 31)) }) },
};

// Expand each path into a Situation-style shot { name, frames:[spec,...] } for renderShots.
const shots = Object.entries(PATHS)
  .filter(([name]) => !only || name === only)
  .map(([name, p]) => ({
    name, center: p.center, flicker: p.flicker,
    frames: Array.from({ length: p.frames }, (_, i) => CLOUDS_OFF ? { ...p.spec(i), clouds: false } : p.spec(i)),
  }));

const out = resolve(ROOT, 'harness/out/motion');
mkdirSync(out, { recursive: true });
const recs = await renderShots(shots, { out, w: 960, h: 600 });

const results = {};
for (const rec of recs) {
  const path = PATHS[rec.name];
  const lums = rec.pngs.map((f) => luminance(readPNG(f)));
  results[rec.name] = { ...sequenceMetrics(lums, { center: path.center, flicker: path.flicker }), settled: rec.settled, errors: rec.errors.length };
  console.log(rec.name, JSON.stringify(results[rec.name]));
}
writeFileSync(resolve(out, 'motion-metrics.json'), JSON.stringify(results, null, 1));
console.log('wrote', resolve(out, 'motion-metrics.json'));
const bad = recs.filter((r) => r.errors.length || !r.settled).length;
process.exit(bad ? 1 : 0);
