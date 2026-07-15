import assert from 'node:assert/strict';
import { SOL_SYSTEM } from '../src/core/sol.js';
import { bodyCenterInertial, frameState } from '../src/core/frames.js';
import {
  APPROACH_DISC_PX, NAV_WARP_CEILING, anomalySamples, approachFootprintPx,
  assertAtomicRebase, cameraRangeBounds, characteristicScale, descendantsOf,
  hostExtent, hostRelativePosition, makeTravelPlan, meteringClassBlend,
  pickMarker, pivotCameraPosition, projectPoint, sampleOrbit, sampleTravel,
  segmentSphereOccluded, starterSystemPose, variancePreservingBlend,
} from '../src/core/navigation.js';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const near = (a, b, e, m) => ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`);

// Every range clamp is derived from the recipe tree and contains every direct
// descendant apoapsis. The starter pose is the declared 35-degree view.
const rb = cameraRangeBounds(SOL_SYSTEM, 'star'), pose = starterSystemPose(SOL_SYSTEM);
ok(rb.min > SOL_SYSTEM.star.radius && rb.max > rb.min && rb.far > rb.max, 'root camera bounds are ordered');
near(pose.pitch, 35 * Math.PI / 180, 0, 'starter elevation');
ok(pose.range >= rb.min && pose.range <= rb.max, 'starter range within derived clamp');
ok(hostExtent(SOL_SYSTEM, 'star') > 39 * 149_597_870_700, 'outer system sets extent');
near(characteristicScale(SOL_SYSTEM, 'star'), SOL_SYSTEM.star.radius, 0, 'star scale derives from recipe');
ok(descendantsOf(SOL_SYSTEM, 'star').length === SOL_SYSTEM.bodies.length + (SOL_SYSTEM.nodes?.length ?? 0), 'root descendants cover tree');
for (const host of ['tellus', 'iovis', 'saturn', 'caelus', 'pontus']) {
  const b = cameraRangeBounds(SOL_SYSTEM, host);
  ok(b.min > 0 && b.max >= b.min * 12, `${host} clamp derives from its system`);
}

// Host-relative positions and atomic rebases preserve inertial vectors across
// random epochs and every useful host class (root, body, barycenter).
let seed = 0x13579bdf;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0xffffffff; };
const hosts = ['star', 'tellus', 'iovis', 'pluto-navita'];
for (let n = 0; n < 80; n++) {
  const t = (rnd() * 2 - 1) * 120 * 365.25 * 86400;
  const body = SOL_SYSTEM.bodies[n % SOL_SYSTEM.bodies.length];
  const p = bodyCenterInertial(body, t, [0, 0, 0], SOL_SYSTEM);
  const a = hosts[n % hosts.length], b = hosts[(n + 1) % hosts.length];
  ok(assertAtomicRebase([p, pivotCameraPosition(pose)], frameState(a, t, SOL_SYSTEM).origin,
    frameState(b, t, SOL_SYSTEM).origin), `atomic ${a}->${b} ${n}`);
  const rel = hostRelativePosition(SOL_SYSTEM, body.id, a, t);
  const origin = frameState(a, t, SOL_SYSTEM).origin;
  const rebuilt = rel.map((v, i) => v + origin[i]);
  ok(Math.hypot(...rebuilt.map((v, i) => v - p[i])) <= Math.max(Math.hypot(...p), 1) * 8e-15,
    `host-relative round trip ${body.id} ${n}`);
}

// Orbit lines use a nested true-anomaly sampler (convergence is exact at the
// shared knots), close, move with secular epoch, and concentrate at periapsis.
const a96 = anomalySamples(96), a192 = anomalySamples(192);
for (let i = 0; i <= 96; i++) near(a96[i], a192[i * 2], 0, `nested anomaly knot ${i}`);
const center = 48, periStep = a96[center + 1] - a96[center], apoStep = a96[1] - a96[0];
ok(periStep < apoStep * 0.2, 'sampler is denser at periapsis');
for (const id of ['cinis', 'tellus', 'rubra', 'iovis', 'luna', 'errans', 'pluto']) {
  const p96 = sampleOrbit(SOL_SYSTEM, id, 0, 96), p192 = sampleOrbit(SOL_SYSTEM, id, 0, 192);
  ok(p96.length === 97 && p192.length === 193, `${id} sample counts`);
  for (let i = 0; i < p96.length; i += 8) {
    ok(Math.hypot(...p96[i].map((v, k) => v - p192[i * 2][k])) < 1e-12, `${id} convergence ${i}`);
  }
  ok(Math.hypot(...p96[0].map((v, k) => v - p96.at(-1)[k])) < 0.01, `${id} line closes`);
}
const reg0 = sampleOrbit(SOL_SYSTEM, 'luna', 0, 64), reg1 = sampleOrbit(SOL_SYSTEM, 'luna', 20 * 365.25 * 86400, 64);
ok(Math.hypot(...reg0[10].map((v, i) => v - reg1[10][i])) > 1e7, 'precessing orbit line is epoch keyed');

// Finite segment sphere test: between hides, behind the sample does not.
ok(segmentSphereOccluded([0, 0, 0], [10, 0, 0], [5, 0, 0], 1), 'between sphere occludes');
ok(!segmentSphereOccluded([0, 0, 0], [10, 0, 0], [12, 0, 0], 3), 'sphere beyond sample does not occlude');
ok(!segmentSphereOccluded([0, 0, 0], [10, 0, 0], [5, 3, 0], 1), 'off-axis sphere does not occlude');

// Projection/picking round trips with generous UI radii and depth tie-breaks.
const camera = [0, 2, 10], target = [0, 0, 0], screen = projectPoint([1, 0, 0], camera, target, [0, 1, 0], Math.PI / 3, 1200, 800);
ok(screen && screen.x > 600 && screen.depth > 0, 'point projects in front');
const markers = [{ id: 'far', x: screen.x, y: screen.y, depth: 20, radiusPx: 4 },
  { id: 'near', x: screen.x, y: screen.y, depth: 10, radiusPx: 4 }];
assert.equal(pickMarker(markers, screen.x + 8, screen.y, 14).id, 'near'); checks++;
assert.equal(pickMarker(markers, screen.x + 30, screen.y, 14), null); checks++;

// Stepped travel is continuous, monotone, has one declared handoff, clamps
// warp for the duration, and restores the saved value in the plan.
const tellus = SOL_SYSTEM.bodies.find((b) => b.id === 'tellus');
const targetI = bodyCenterInertial(tellus, 123456, [0, 0, 0], SOL_SYSTEM);
const plan = makeTravelPlan({ from: [8e12, 3e12, -4e12], target: targetI, targetRadius: tellus.R,
  epochS: 123456, warp: 1e7 });
ok(plan.travelWarp === NAV_WARP_CEILING && plan.savedWarp === 1e7, 'travel warp clamp + saved value');
let last = sampleTravel(plan, 0), switches = 0;
for (let i = 1; i <= 240; i++) {
  const cur = sampleTravel(plan, plan.durationS * i / 240);
  ok(cur.u >= last.u, `travel monotone ${i}`);
  ok(Math.hypot(...cur.position.map((v, k) => v - last.position[k])) < Math.hypot(...plan.from.map((v, k) => v - plan.arrival[k])) / 30,
    `travel step continuous ${i}`);
  if (cur.hostPhase !== last.hostPhase) switches++;
  last = cur;
}
assert.equal(switches, 1); checks++;
ok(last.complete && Math.hypot(...last.position.map((v, i) => v - plan.arrival[i])) < 0.01, 'travel reaches arrival');
ok(sampleTravel(plan, plan.durationS / 4, true).u === 1, 'hold accelerates travel 4x');

// Disc->tiles handoff preserves mean weights and the declared correlated
// variance. Metering switches continuously in log exposure without a snap.
for (let px = 50; px <= 95; px++) {
  const b = variancePreservingBlend(px, 0.94);
  near(b.meanDisc + b.meanTiles, 1, 2e-16, `mean blend ${px}`);
  near(b.discGain ** 2 + b.tileGain ** 2 + 2 * 0.94 * b.discGain * b.tileGain, 1, 3e-15, `variance blend ${px}`);
  ok(b.t >= 0 && b.t <= 1, `blend range ${px}`);
}
assert.deepEqual(variancePreservingBlend(APPROACH_DISC_PX.enter), { t: 0, discGain: 1, tileGain: 0, meanDisc: 1, meanTiles: 0 }); checks++;
assert.deepEqual(variancePreservingBlend(APPROACH_DISC_PX.tiles), { t: 1, discGain: 0, tileGain: 1, meanDisc: 0, meanTiles: 1 }); checks++;
for (let i = 0; i <= 30; i++) {
  const m = meteringClassBlend(0.1, 20, i / 30 * 0.75);
  ok(m.exposure >= 0.1 - 1e-14 && m.exposure <= 20 + 1e-12, `meter continuity ${i}`);
}
near(approachFootprintPx(100, 1000, Math.PI / 2, 800), 2 * Math.atan(0.1) / (Math.PI / 2) * 800, 0, 'footprint law');

console.log(`navigation contracts pass (${checks} assertions)`);
