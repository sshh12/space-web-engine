// Phase N true-scale system presentation. Positions remain doubles until the
// last camera-relative upload; markers are UI, never enlarged world geometry.

import * as THREE from 'three';
import { AU } from '../core/recipe.js';
import { bodyBoundR } from '../core/figure.js';
import { bodyCenterInertial, frameState } from '../core/frames.js';
import {
  NAV_WARP_CEILING, assertAtomicRebase, cameraRangeBounds, hostRelativePosition,
  itemById, makeTravelPlan, pickMarker, pivotCameraPosition, projectPoint,
  sampleOrbit, sampleTravel, segmentSphereOccluded, starterSystemPose, systemFlux,
} from '../core/navigation.js';
import {
  BELT_SOLVER_ITERS, beltMembers, comaActivity, comaApparentFlux, tailLengthM,
} from '../core/smallbody.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const TAU = Math.PI * 2;
const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

const POINT_VERT = `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
void main(){
  vColor=aColor;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  gl_PointSize=aSize;
}`;
const POINT_FRAG = `
varying vec3 vColor;
void main(){
  vec2 q=gl_PointCoord*2.0-1.0; float r=length(q); if(r>1.0) discard;
  float limb=sqrt(max(1.0-r*r,0.0));
  float core=smoothstep(1.0,0.72,r)*(0.55+0.45*limb);
  gl_FragColor=vec4(vColor*core,core);
}`;

// Phase B belts: one instanced point pass per belt. The vertex shader evaluates
// each member's closed-form conic (same rotYL(Ω)·rotX(i)·rotYL(ω) composition
// as frames.js, fixed-count Newton — belt eMax ≤ 0.4 keeps it exact in fp32) at
// the CURRENT mean anomaly, which the CPU wraps in doubles per frame so GPU
// float time-precision never enters. The 'position' attribute carries (a, e, i).
// Gain normalizes within the belt class (uKn ∈ (0,1] preserves the members'
// true relative photometry; uScale keys the class to the annulus scale) — the
// system view is presentational like its orbit lines. The radiometric sky pass
// keeps the true flux law, which is why belts are honestly absent from surface
// skies (smallbody-test pins the flux floor).
const BELT_VERT = `
attribute vec3 aPlane;   // Omega, omega, (spare)
attribute float aKn;     // member flux kernel, normalized to the belt max
attribute float aM;      // current mean anomaly (CPU-wrapped double)
uniform vec3 uCamHi, uCamLo;
uniform float uScale;
varying float vGain;
void main(){
  float a=position.x, e=position.y, inc=position.z;
  float M=aM;
  float E=M+e*sin(M);
  for(int i=0;i<${BELT_SOLVER_ITERS};i++) E-=(E-e*sin(E)-M)/(1.0-e*cos(E));
  vec3 pq=vec3(a*(cos(E)-e),0.0,a*sqrt(1.0-e*e)*sin(E));
  float cO=cos(aPlane.x),sO=sin(aPlane.x),ci=cos(inc),si=sin(inc),cw=cos(aPlane.y),sw=sin(aPlane.y);
  mat3 rO=mat3(cO,0.,sO, 0.,1.,0., -sO,0.,cO);
  mat3 rI=mat3(1.,0.,0., 0.,ci,si, 0.,-si,ci);
  mat3 rW=mat3(cw,0.,sw, 0.,1.,0., -sw,0.,cw);
  vec3 pos=rO*(rI*(rW*pq));
  vec3 rel=(pos-uCamHi)-uCamLo;
  vGain=aKn*uScale/max(dot(rel,rel),1.0);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(rel,1.0);
  gl_PointSize=clamp(1.2+0.6*log2(1.0+vGain*8.0),1.2,3.0);
}`;
const BELT_FRAG = `
uniform vec3 uTint;
varying float vGain;
void main(){
  vec2 q=gl_PointCoord*2.0-1.0; float r=dot(q,q); if(r>1.0) discard;
  float core=(1.0-r)*(1.0-r);
  gl_FragColor=vec4(uTint*min(vGain,1.6)*core,core);
}`;

function bodyColor(body, starColor) {
  const a = body.discAlbedo ?? [0.35, 0.35, 0.35];
  return a.map((v, i) => clamp(v * starColor[i] * 2.2, 0.05, 1.8));
}

function deterministicStars(count = 1600) {
  const a = new Float32Array(count * 3), c = new Float32Array(count * 3);
  let x = 0x9e3779b9;
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 0xffffffff; };
  for (let i = 0; i < count; i++) {
    const y = rnd() * 2 - 1, p = rnd() * Math.PI * 2, r = 1;
    const h = Math.sqrt(1 - y * y); a.set([h * Math.cos(p) * r, y, h * Math.sin(p) * r], i * 3);
    const k = 0.28 + 0.72 * Math.pow(rnd(), 8); c.set([k, k * (0.9 + rnd() * 0.1), k], i * 3);
  }
  return { a, c };
}

export class SystemView {
  constructor(renderer, camera, canvas, system, options = {}) {
    this.renderer = renderer; this.camera = camera; this.canvas = canvas;
    this.options = options; this.system = system; this.pose = starterSystemPose(system);
    this.hostId = this.pose.hostId; this.markers = []; this.hovered = null;
    this.travel = null; this.travelStartMs = 0; this.hold = false; this.lastOrbitEpoch = NaN;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x010208);

    const stars = deterministicStars();
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(stars.a, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(stars.c, 3));
    const sm = new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true,
      depthWrite: false, depthTest: false, transparent: true, opacity: 0.9 });
    this.stars = new THREE.Points(sg, sm); this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    this.orbitGroup = new THREE.Group(); this.scene.add(this.orbitGroup);
    this.pointGeometry = new THREE.BufferGeometry();
    this.pointGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((system.bodies.length + 1) * 3), 3));
    this.pointGeometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(system.bodies.length + 1), 1));
    this.pointGeometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array((system.bodies.length + 1) * 3), 3));
    this.pointMaterial = new THREE.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(this.pointGeometry, this.pointMaterial); this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.attach(); this.rebuildOrbits(0); this.rebuildSmallBodies();
  }

  setSystem(system) {
    this.system = system; Object.assign(this.pose, starterSystemPose(system)); this.hostId = 'star';
    const n = system.bodies.length + 1;
    this.pointGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.pointGeometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.pointGeometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.rebuildOrbits(0); this.rebuildSmallBodies();
  }

  // Phase B: belts + comet tails are pure recipe data — rebuilt whole on any
  // system swap (the editor classes system.belts as system-scope).
  rebuildSmallBodies() {
    for (const d of this.beltDraws ?? []) { this.scene.remove(d.points); d.points.geometry.dispose(); d.points.material.dispose(); }
    for (const d of this.cometDraws ?? []) { this.scene.remove(d.line); d.line.geometry.dispose(); d.line.material.dispose(); }
    this.beltDraws = []; this.cometDraws = [];
    const sc = this.system.star.color;
    for (const belt of this.system.belts ?? []) {
      const m = beltMembers(belt, this.system.star.GM);
      const shape = new Float32Array(m.count * 3), plane = new Float32Array(m.count * 3);
      const kn = new Float32Array(m.count), K = new Float64Array(m.count);
      const meanAlb = (belt.albedo[0] + belt.albedo[1] + belt.albedo[2]) / 3;
      let maxK = 0;
      for (let i = 0; i < m.count; i++) {
        shape.set([m.a[i], m.e[i], m.inc[i]], i * 3);
        plane.set([m.Omega[i], m.omega[i], 0], i * 3);
        const irr = this.system.star.irradianceAt1AU * (AU / m.a[i]) ** 2;
        K[i] = irr * meanAlb * m.R[i] * m.R[i] * (2 / 3);
        if (K[i] > maxK) maxK = K[i];
      }
      // gamma-compressed relative flux (display transform, ordering preserved):
      // the size power law spans ~5 decades of member flux, and a linear gain
      // renders only the top decade. The sky pass keeps the true flux law.
      for (let i = 0; i < m.count; i++) kn[i] = (K[i] / maxK) ** 0.2;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(shape, 3));
      g.setAttribute('aPlane', new THREE.BufferAttribute(plane, 3));
      g.setAttribute('aKn', new THREE.BufferAttribute(kn, 1));
      g.setAttribute('aM', new THREE.BufferAttribute(new Float32Array(m.count), 1).setUsage(THREE.DynamicDrawUsage));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), belt.aOuter * 2);
      const mid = (belt.aInner + belt.aOuter) / 2;
      const tint = belt.albedo.map((v, i) => clamp(v * sc[i] * 2.2, 0.02, 1.8));
      const material = new THREE.ShaderMaterial({
        vertexShader: BELT_VERT, fragmentShader: BELT_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
          uCamHi: { value: new THREE.Vector3() }, uCamLo: { value: new THREE.Vector3() },
          uScale: { value: 10 * mid * mid }, uTint: { value: new THREE.Vector3(...tint) },
        },
      });
      const points = new THREE.Points(g, material); points.frustumCulled = false;
      this.scene.add(points);
      this.beltDraws.push({ members: m, points, aM: g.getAttribute('aM') });
    }
    for (const body of this.system.bodies.filter((b) => b.coma)) {
      const N = 48;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const col = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) col.set(body.coma.color.map((v) => v * (1 - i / (N - 1)) ** 2), i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(g, material); line.frustumCulled = false; line.visible = false;
      this.scene.add(line);
      this.cometDraws.push({ body, line });
    }
  }

  updateSmallBodies(epochS, cameraI) {
    for (const d of this.beltDraws) {
      const m = d.members;
      for (let i = 0; i < m.count; i++) d.aM.setX(i, wrapPi(m.M0[i] + m.n[i] * epochS));
      d.aM.needsUpdate = true;
      const u = d.points.material.uniforms;
      u.uCamHi.value.set(Math.fround(cameraI[0]), Math.fround(cameraI[1]), Math.fround(cameraI[2]));
      u.uCamLo.value.set(cameraI[0] - Math.fround(cameraI[0]), cameraI[1] - Math.fround(cameraI[1]), cameraI[2] - Math.fround(cameraI[2]));
    }
    for (const d of this.cometDraws) {
      const center = bodyCenterInertial(d.body, epochS, [0, 0, 0], this.system);
      const rM = Math.max(Math.hypot(...center), 1), rAU = rM / AU;
      const len = tailLengthM(d.body.coma, rAU, AU);
      if (!(len > 0)) { d.line.visible = false; continue; }
      const dir = center.map((v) => v / rM);   // anti-sunward (ion tail)
      const a = d.line.geometry.getAttribute('position');
      for (let i = 0; i < a.count; i++) {
        const s = len * (i / (a.count - 1)) ** 1.35;
        a.setXYZ(i, center[0] + dir[0] * s - cameraI[0], center[1] + dir[1] * s - cameraI[1], center[2] + dir[2] * s - cameraI[2]);
      }
      a.needsUpdate = true;
      d.line.material.opacity = Math.min(1, comaActivity(d.body.coma, rAU));
      d.line.visible = true;
    }
  }

  attach() {
    let drag = null, moved = false;
    this.onDown = (e) => { if (!this.options.isActive()) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; moved = false; };
    this.onMove = (e) => {
      if (!this.options.isActive()) return;
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        moved ||= Math.abs(dx) + Math.abs(dy) > 2;
        this.pose.yaw -= dx * 0.004; this.pose.pitch = clamp(this.pose.pitch + dy * 0.004, -1.48, 1.48);
      } else this.updateHover(e.clientX, e.clientY);
    };
    this.onUp = (e) => {
      if (!this.options.isActive() || !drag || drag.id !== e.pointerId) return;
      drag = null; if (!moved) this.pick(e.clientX, e.clientY);
    };
    this.onWheel = (e) => {
      if (!this.options.isActive()) return; e.preventDefault();
      const b = cameraRangeBounds(this.system, this.hostId);
      this.pose.range = clamp(this.pose.range * Math.exp(e.deltaY * 0.0012), b.min, b.max);
    };
    this.onKey = (e) => {
      if (!this.options.isActive()) return;
      if (e.key === 'Shift') this.hold = e.type === 'keydown';
      if (e.key === 'Escape' && this.travel) this.travelStartMs = -Infinity;
    };
    this.canvas.addEventListener('pointerdown', this.onDown); this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp); this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey); window.addEventListener('keyup', this.onKey);
  }

  // The inertial position of an item's parent anchor (star origin, a body
  // centre, or a barycenter/frame-node origin) at epochS. Moon and
  // barycenter-member lines translate with THIS every frame — the samples
  // cache only the orbit's SHAPE (secular-slow, rebuilt every 4 world-days);
  // anchoring the cached samples to the build-epoch parent position let a
  // moon's ring lag its planet by up to 4 days of heliocentric arc, which at
  // the day/s starter warp visibly detached luna's ring from tellus.
  parentCenterOf(item, epochS) {
    if (item.parent === 'star') return [0, 0, 0];
    const parent = itemById(this.system, item.parent);
    return parent?.R ? bodyCenterInertial(parent, epochS, [0, 0, 0], this.system)
      : frameState(item.parent, epochS, this.system).origin;
  }

  rebuildOrbits(epochS) {
    for (const child of this.orbitGroup.children) { child.geometry.dispose(); child.material.dispose(); }
    this.orbitGroup.clear(); this.orbitRows = [];
    for (const item of [...(this.system.nodes ?? []), ...this.system.bodies]) {
      const baryMember = (this.system.nodes ?? []).some((node) => node.id === item.parent && node.type === 'barycenter');
      if (!item.orbit && !baryMember) continue;
      const samples = sampleOrbit(this.system, item, epochS, item.parent === 'star' ? 224 : 96);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(0, samples.length - 1) * 6), 3));
      const moon = item.parent !== 'star';
      const material = new THREE.LineBasicMaterial({ color: moon ? 0x41516f : 0x516887,
        transparent: true, opacity: moon ? 0.28 : 0.48, depthWrite: false });
      const line = new THREE.LineSegments(samples.length ? geometry : new THREE.BufferGeometry(), material);
      line.frustumCulled = false; this.orbitGroup.add(line);
      this.orbitRows.push({ item, samples, line, moon, buildParent: this.parentCenterOf(item, epochS) });
    }
    this.lastOrbitEpoch = epochS;
  }

  beginTravel(bodyId, epochS, warp, durationScale = 1) {
    const body = bodyId === 'star'
      ? { id: 'star', R: this.system.star.radius }
      : this.system.bodies.find((b) => b.id === bodyId);
    if (!body) throw new Error(`travel: unknown body '${bodyId}'`);
    const hostOrigin = frameState(this.hostId, epochS, this.system).origin;
    const cameraRel = pivotCameraPosition(this.pose), from = cameraRel.map((v, i) => v + hostOrigin[i]);
    const target = bodyId === 'star' ? [0, 0, 0]
      : bodyCenterInertial(body, epochS, [0, 0, 0], this.system);
    this.travel = { ...makeTravelPlan({ from, target, targetRadius: bodyBoundR(body), epochS, warp, durationScale }), bodyId };
    this.options.onTravel?.({ active: true, bodyId, durationS: this.travel.durationS, warp: this.travel.travelWarp });
    return this.travel;
  }

  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const marker = pickMarker(this.markers, clientX - r.left, clientY - r.top, 16);
    if (marker) this.options.onPick?.(marker.id);
    return marker;
  }

  updateHover(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const marker = pickMarker(this.markers, clientX - r.left, clientY - r.top, 14);
    if (marker?.id !== this.hovered) { this.hovered = marker?.id ?? null; this.options.onHover?.(marker ?? null); }
  }

  update(epochS, nowMs) {
    const W = this.canvas.clientWidth || 1, H = this.canvas.clientHeight || 1;
    let cameraI, targetI, hostOrigin = frameState(this.hostId, epochS, this.system).origin;
    if (this.travel) {
      const step = sampleTravel(this.travel, (nowMs - this.travelStartMs) / 1000, this.hold);
      cameraI = step.position; targetI = this.travel.target;
      const nextHost = step.hostPhase === 'target' ? this.travel.bodyId : 'star';
      if (nextHost !== this.hostId) {
        const nextOrigin = frameState(nextHost, epochS, this.system).origin;
        assertAtomicRebase([cameraI, targetI], hostOrigin, nextOrigin); this.hostId = nextHost; hostOrigin = nextOrigin;
        this.options.onHost?.(nextHost);
      }
      if (step.complete) {
        const id = this.travel.bodyId, savedWarp = this.travel.savedWarp; this.travel = null;
        this.options.onTravel?.({ active: false, bodyId: id, warp: savedWarp });
        this.options.onArrive?.(id); return null;
      }
    } else {
      const rel = pivotCameraPosition(this.pose); cameraI = rel.map((v, i) => v + hostOrigin[i]);
      targetI = this.pose.pivot.map((v, i) => v + hostOrigin[i]);
    }
    this.camera.position.set(0, 0, 0); this.camera.up.set(0, 1, 0);
    this.camera.lookAt(...sub(targetI, cameraI));
    const range = Math.max(Math.hypot(...sub(targetI, cameraI)), 1);
    const bounds = cameraRangeBounds(this.system, this.hostId);
    this.camera.near = Math.max(range * 1e-8, 1); this.camera.far = Math.max(bounds.far, range * 3);
    this.camera.updateProjectionMatrix();

    // The sky sphere follows the camera. World geometry is rebased in doubles.
    this.stars.scale.setScalar(this.camera.far * 0.45);
    const pos = this.pointGeometry.getAttribute('position'), size = this.pointGeometry.getAttribute('aSize');
    const col = this.pointGeometry.getAttribute('aColor'), starColor = this.system.star.color;
    const rows = [{ id: 'star', name: this.system.star.name ?? 'Sun', radius: this.system.star.radius,
      center: [0, 0, 0], color: starColor, star: true },
    ...this.system.bodies.map((body) => ({ id: body.id, name: body.name, radius: bodyBoundR(body), body,
      center: bodyCenterInertial(body, epochS, [0, 0, 0], this.system), color: bodyColor(body, starColor) }))];
    for (const row of rows) {
      row.cameraDistance = Math.max(Math.hypot(...sub(row.center, cameraI)), row.radius);
      row.flux = row.star ? Infinity : systemFlux(row.body, this.system, row.cameraDistance,
        Math.max(Math.hypot(...row.center), 1));
      // Phase B: coma emission joins the row's flux (the same hand-down the
      // sky point tier uses) — a perihelion comet legitimately outshines its
      // nucleus and re-meters the view like any bright body would.
      if (row.body?.coma) {
        row.comaFlux = comaApparentFlux(row.body.coma,
          Math.max(Math.hypot(...row.center), 1) / AU, row.cameraDistance, AU);
        row.flux += row.comaFlux;
      }
    }
    const fluxMeter = Math.max(...rows.filter((row) => !row.star).map((row) => row.flux), 1e-30);
    this.markers = [];
    const occluders = [];
    const spheres = rows.map((row) => ({ center: row.center, radius: row.radius, id: row.id }));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], rel = sub(row.center, cameraI), dist = row.cameraDistance;
      pos.setXYZ(i, rel[0], rel[1], rel[2]);
      const angularPx = 2 * Math.atan(row.radius / dist) / (this.camera.fov * Math.PI / 180) * H;
      if (angularPx > 1) occluders.push({ center: row.center, radius: row.radius, id: row.id });
      size.setX(i, (row.star ? clamp(angularPx, 2.5, 100) : clamp(angularPx, 1.4, 86))
        + (row.comaFlux ? 5 * Math.min(1, row.comaFlux / row.flux) : 0));
      const fluxGain = row.star ? 1 : row.flux / fluxMeter;
      col.setXYZ(i, row.color[0] * fluxGain, row.color[1] * fluxGain, row.color[2] * fluxGain);
      const screen = projectPoint(row.center, cameraI, targetI, [0, 1, 0], this.camera.fov * Math.PI / 180, W, H);
      if (screen && Math.abs(screen.ndc[0]) < 1.08 && Math.abs(screen.ndc[1]) < 1.08) {
        const hidden = spheres.some((s) => s.id !== row.id && segmentSphereOccluded(cameraI, row.center, s.center, s.radius));
        this.markers.push({ id: row.id, name: row.name.replace(/\s*\(.*/, ''), x: screen.x, y: screen.y, depth: screen.depth,
          radiusPx: Math.max(angularPx * 0.5, 5), hidden, moon: row.body?.parent !== 'star' });
      }
    }
    pos.needsUpdate = size.needsUpdate = col.needsUpdate = true;
    this.updateSmallBodies(epochS, cameraI);

    // Secularly moving orbit planes are a pure function of epoch. Rebuild often
    // enough for high warp; upload every sample camera-relative every frame.
    if (!Number.isFinite(this.lastOrbitEpoch) || Math.abs(epochS - this.lastOrbitEpoch) > 86400 * 4) this.rebuildOrbits(epochS);
    for (const row of this.orbitRows) {
      const parent = itemById(this.system, row.item.parent);
      const parentCenter = this.parentCenterOf(row.item, epochS);
      // ride the parent's CURRENT position: cached samples carry the shape at
      // build epoch; the anchor translates every frame (doubles, pre-rebase)
      const off = [parentCenter[0] - row.buildParent[0], parentCenter[1] - row.buildParent[1], parentCenter[2] - row.buildParent[2]];
      const ps = projectPoint(parentCenter, cameraI, targetI, [0, 1, 0], this.camera.fov * Math.PI / 180, W, H);
      row.line.visible = !row.moon || (!!ps && Math.max(parent?.R ?? this.system.star.radius, 1) / ps.depth * H > 0.12);
      const a = row.line.geometry.getAttribute('position');
      const visible = row.samples.map((sample) => !occluders.some((sphere) =>
        segmentSphereOccluded(cameraI, [sample[0] + off[0], sample[1] + off[1], sample[2] + off[2]], sphere.center, sphere.radius)));
      let cursor = 0;
      for (let i = 1; i < row.samples.length; i++) if (visible[i - 1] && visible[i]) {
        const p = row.samples[i - 1], q = row.samples[i];
        a.setXYZ(cursor++, p[0] + off[0] - cameraI[0], p[1] + off[1] - cameraI[1], p[2] + off[2] - cameraI[2]);
        a.setXYZ(cursor++, q[0] + off[0] - cameraI[0], q[1] + off[1] - cameraI[1], q[2] + off[2] - cameraI[2]);
      }
      row.line.geometry.setDrawRange(0, cursor); if (a) a.needsUpdate = true;
    }
    this.options.onMarkers?.(this.markers); return { cameraI, targetI, markers: this.markers };
  }

  render() {
    this.renderer.setRenderTarget(null); this.renderer.setScissorTest(false);
    // CSS pixels, not drawing-buffer pixels: setViewport multiplies by the
    // renderer's pixelRatio internally, and canvas.width is ALREADY scaled —
    // passing it double-scaled the whole GL scene about the lower-left corner
    // on any dpr > 1 display (markers are DOM, so they stayed put and every
    // ring/point appeared detached from its body). Invisible to every gate:
    // the harness pins deviceScaleFactor 1 and ?fast=1 forces pixelRatio 1.
    this.renderer.setViewport(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.clear(true, true, true); this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this.onDown); this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp); this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKey);
    for (const child of this.orbitGroup.children) { child.geometry.dispose(); child.material.dispose(); }
    for (const d of this.beltDraws) { d.points.geometry.dispose(); d.points.material.dispose(); }
    for (const d of this.cometDraws) { d.line.geometry.dispose(); d.line.material.dispose(); }
    this.stars.geometry.dispose(); this.stars.material.dispose(); this.pointGeometry.dispose(); this.pointMaterial.dispose();
  }
}

export { NAV_WARP_CEILING };
