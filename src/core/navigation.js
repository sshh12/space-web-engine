// Phase N navigation laws. This module is deliberately renderer-free: system
// bounds, camera-relative rebases, orbit sampling, finite-segment occlusion,
// picking, travel and representation/exposure blends are deterministic doubles
// and can be policed in Node.

import { AU } from './recipe.js';
import { bodyBoundR } from './figure.js';
import {
  bodyCenterInertial, frameState, orbitPointAtTrueAnomaly, resolvedOrbit,
} from './frames.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k];

export const NAV_WARP_CEILING = 43_200;
export const APPROACH_DISC_PX = Object.freeze({ enter: 64, tiles: 80 });

export function itemById(system, id) {
  if (id === 'star' || id === system.star.id) return { ...system.star, id: 'star', type: 'star' };
  return system.bodies.find((body) => body.id === id)
    ?? (system.nodes ?? []).find((node) => node.id === id) ?? null;
}

export function descendantsOf(system, hostId) {
  const children = new Map();
  for (const item of [...(system.nodes ?? []), ...system.bodies]) {
    const a = children.get(item.parent) ?? [];
    a.push(item); children.set(item.parent, a);
  }
  const out = [], queue = [...(children.get(hostId) ?? [])];
  while (queue.length) {
    const item = queue.shift(); out.push(item);
    queue.push(...(children.get(item.id) ?? []));
  }
  return out;
}

function authoredApoapsis(item, system) {
  if (item.type === 'barycenter') {
    const o = item.orbit && resolvedOrbit({ id: item.id, parent: item.parent, orbit: item.orbit }, system);
    return o ? o.a * (1 + o.e) : 0;
  }
  if (!item.orbit) return 0;
  // Barycenter members author no outer orbit; their characteristic reach is
  // already represented by the containing node.
  const bary = (system.nodes ?? []).find((n) => n.id === item.parent && n.type === 'barycenter');
  return bary ? 0 : resolvedOrbit(item, system).a * (1 + resolvedOrbit(item, system).e);
}

export function hostExtent(system, hostId = 'star') {
  let outer = 0;
  const direct = [...(system.nodes ?? []), ...system.bodies].filter((item) => item.parent === hostId);
  for (const item of direct) outer = Math.max(outer, authoredApoapsis(item, system)
    + (item.R ? bodyBoundR(item) : 0));
  return outer || system.star.radius;
}

export function characteristicScale(system, hostId = 'star') {
  const item = itemById(system, hostId);
  if (item?.type === 'star') return item.radius;
  if (item?.type === 'barycenter') {
    const members = system.bodies.filter((b) => b.parent === item.id);
    return Math.max(...members.map(bodyBoundR), 1);
  }
  return item ? bodyBoundR(item) : system.star.radius;
}

export function cameraRangeBounds(system, hostId = 'star', margin = 1.28) {
  const scale0 = characteristicScale(system, hostId);
  const max = Math.max(hostExtent(system, hostId) * margin, scale0 * 12);
  return { min: Math.max(scale0 * 1.05, 1), max, far: max * 2.5 };
}

export function starterSystemPose(system) {
  const bounds = cameraRangeBounds(system, 'star');
  return { hostId: 'star', pivot: [0, 0, 0], range: bounds.max * 0.88,
    yaw: -0.72, pitch: 35 * Math.PI / 180, minRange: bounds.min, maxRange: bounds.max };
}

export function pivotCameraPosition(pose) {
  const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
  const offset = [pose.range * cp * Math.sin(pose.yaw), pose.range * sp,
    pose.range * cp * Math.cos(pose.yaw)];
  return add(pose.pivot, offset);
}

export function hostRelativePosition(system, id, hostId, epochS) {
  const body = system.bodies.find((b) => b.id === id);
  const p = body ? bodyCenterInertial(body, epochS, [0, 0, 0], system)
    : frameState(id, epochS, system).origin;
  return sub(p, frameState(hostId, epochS, system).origin);
}

// Power-warped true anomaly: equal indices are deliberately denser around
// periapsis (nu=0), where the curvature and apparent motion are highest.
export function anomalySamples(count = 192, densityPower = 1.55) {
  const n = Math.max(16, count | 0), out = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const u = 2 * i / n - 1;
    out[i] = Math.sign(u) * Math.PI * Math.pow(Math.abs(u), densityPower);
  }
  return out;
}

export function sampleOrbit(system, itemOrId, epochS, count = 192) {
  const item = typeof itemOrId === 'string' ? itemById(system, itemOrId) : itemOrId;
  const baryMember = item && (system.nodes ?? []).some((node) => node.id === item.parent && node.type === 'barycenter');
  if (!item || item.type === 'star' || (!item.orbit && !baryMember)) return [];
  return Array.from(anomalySamples(count), (nu) => orbitPointAtTrueAnomaly(item, nu, epochS, system));
}

// True only when the *finite* camera->sample segment intersects a sphere. A
// body beyond the sample cannot erase the line, unlike an infinite-ray test.
export function segmentSphereOccluded(camera, sample, center, radius, epsilon = 1e-7) {
  const d = sub(sample, camera), m = sub(camera, center);
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (!dd) return false;
  const t = clamp(-(m[0] * d[0] + m[1] * d[1] + m[2] * d[2]) / dd, 0, 1);
  if (t <= epsilon || t >= 1 - epsilon) return false;
  const q = add(m, scale(d, t));
  return q[0] * q[0] + q[1] * q[1] + q[2] * q[2] < radius * radius;
}

export function visibleOrbitSegments(points, camera, spheres) {
  const visible = points.map((p) => !spheres.some((s) => segmentSphereOccluded(camera, p, s.center, s.radius)));
  const segments = [];
  for (let i = 1; i < points.length; i++) if (visible[i - 1] && visible[i]) segments.push([points[i - 1], points[i]]);
  return segments;
}

export function projectPoint(point, camera, target, up, fovY, width, height) {
  const f = sub(target, camera), fl = len(f); if (!fl) return null;
  const forward = scale(f, 1 / fl);
  let right = [forward[1] * up[2] - forward[2] * up[1], forward[2] * up[0] - forward[0] * up[2], forward[0] * up[1] - forward[1] * up[0]];
  const rl = len(right); if (!rl) right = [1, 0, 0]; else right = scale(right, 1 / rl);
  const camUp = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  const v = sub(point, camera), z = v[0] * forward[0] + v[1] * forward[1] + v[2] * forward[2];
  if (z <= 0) return null;
  const sy = 1 / Math.tan(fovY * 0.5), sx = sy * height / width;
  const nx = (v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) * sx / z;
  const ny = (v[0] * camUp[0] + v[1] * camUp[1] + v[2] * camUp[2]) * sy / z;
  return { x: (nx + 1) * width * 0.5, y: (1 - ny) * height * 0.5, depth: z, ndc: [nx, ny] };
}

export function pickMarker(markers, x, y, radiusPx = 14) {
  let best = null, bestD = Infinity;
  for (const marker of markers) {
    if (marker.hidden) continue;
    const d = Math.hypot(marker.x - x, marker.y - y);
    const r = Math.max(radiusPx, marker.radiusPx ?? 0);
    if (d <= r && (d < bestD || (d === bestD && marker.depth < best.depth))) { best = marker; bestD = d; }
  }
  return best;
}

export function travelDuration(distance, characteristic, durationScale = 1) {
  return clamp((2.2 + 0.72 * Math.log1p(distance / Math.max(characteristic, 1))) * durationScale, 2.5, 18);
}

export function makeTravelPlan({ from, target, targetRadius, epochS, warp = 0, durationScale = 1 }) {
  const delta = sub(target, from), distance = len(delta);
  const dir = distance ? scale(delta, 1 / distance) : [0, 0, 1];
  // Finish at the measured disc-atlas breakpoint (~70 px at the default
  // 55-degree/720 px camera), where the self-disc and root tiles overlap.
  const arrivalDistance = Math.max(targetRadius * 22, 1);
  const arrival = sub(target, scale(dir, arrivalDistance));
  return Object.freeze({ from: from.slice(), target: target.slice(), arrival, epochS,
    durationS: travelDuration(distance, targetRadius, durationScale), handoffAt: 0.5,
    savedWarp: warp, travelWarp: clamp(warp, -NAV_WARP_CEILING, NAV_WARP_CEILING) });
}

export function sampleTravel(plan, elapsedS, hold = false) {
  const raw = elapsedS * (hold ? 4 : 1) / plan.durationS, u = clamp(raw, 0, 1), t = ease(u);
  return { u, position: plan.from.map((v, i) => mix(v, plan.arrival[i], t)),
    hostPhase: u < plan.handoffAt ? 'departure' : 'target', complete: u >= 1 };
}

export function assertAtomicRebase(inertialPoints, fromOrigin, toOrigin, tolerance = 32 * Number.EPSILON) {
  for (const p of inertialPoints) {
    const a = sub(p, fromOrigin), b = sub(p, toOrigin);
    const rebuilt = add(b, toOrigin);
    const scale0 = Math.max(len(p), len(a), len(b), 1);
    if (len(sub(rebuilt, p)) > scale0 * tolerance) throw new Error('navigation: non-atomic host rebase');
  }
  return true;
}

// Correlated blend gains preserve the variance of two representations. Means
// are carried separately by the caller and interpolate linearly.
export function variancePreservingBlend(footprintPx, correlation = 0.94, thresholds = APPROACH_DISC_PX) {
  const t = ease((footprintPx - thresholds.enter) / (thresholds.tiles - thresholds.enter));
  const a = 1 - t, b = t;
  const norm = Math.sqrt(a * a + b * b + 2 * clamp(correlation, -1, 1) * a * b) || 1;
  return { t, discGain: a / norm, tileGain: b / norm, meanDisc: a, meanTiles: b };
}

export function meteringClassBlend(outgoingExposure, incomingTarget, elapsedS, windowS = 0.75) {
  const t = ease(elapsedS / Math.max(windowS, 1e-6));
  return { t, exposure: Math.exp(mix(Math.log(Math.max(outgoingExposure, 1e-9)), Math.log(Math.max(incomingTarget, 1e-9)), t)) };
}

export function systemFlux(body, system, distanceToCamera, distanceToStar) {
  const a = body.discAlbedo ?? [0.3, 0.3, 0.3];
  const mean = (a[0] + a[1] + a[2]) / 3;
  const irradiance = system.star.irradianceAt1AU * (AU / Math.max(distanceToStar, 1)) ** 2;
  return irradiance * mean * Math.PI * (bodyBoundR(body) / Math.max(distanceToCamera, 1)) ** 2;
}

export function approachFootprintPx(radius, distance, fovY, viewportH) {
  return 2 * Math.atan(radius / Math.max(distance, radius * 1e-9)) / fovY * viewportH;
}

export const NAV_INTERNALS = Object.freeze({ ease, TAU });
