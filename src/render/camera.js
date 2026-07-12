// camera.js — orbital-to-surface camera. State is (lon, lat, altitude-above-ground,
// yaw, pitch) in doubles; position is derived in the body-fixed frame. Controls scale
// with altitude so one mouse spans orbit to bootprint (CONCEPT §1/§9). The camera
// object itself always renders from the origin — main.js sets mesh offsets.

import * as THREE from 'three';
import { clamp } from '../core/mathx.js';
// round 17 (§11 figure generality): position/up derive from the recipe's
// reference shape when one is declared; sphere bodies keep the old arithmetic
import { figOf, figMapDir, figUp, figAnchorR } from '../core/figure.js';

export class OrbitalCamera {
  constructor(dom, body, heightAt) {
    this.body = body;
    this.fig = figOf(body);     // null for legacy bodies
    this.heightAt = heightAt;   // (dirDouble[3]) -> terrain height (m over datum)
    this.lon = (body.camera.lon * Math.PI) / 180;
    this.lat = (body.camera.lat * Math.PI) / 180;
    this.alt = body.camera.alt; // above ground, m
    this.yaw = 0;
    this.pitch = 0;             // user offset on top of the auto tilt
    // photo mode (Phase T): free look unlocks the tilt clamp (zenith framing —
    // central eclipse, aurora overhead: the registered "camera cannot look up"
    // defect) and adds roll; auto-tilt is bypassed, pitch is measured from horizon
    this.free = false;
    this.roll = 0;
    this.attach(dom);
  }

  attach(dom) {
    let drag = null;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey };
      dom.setPointerCapture(e.pointerId);
    });
    const end = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('lostpointercapture', end);
    dom.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.btn === 2 || drag.shift) {
        this.yaw += dx * 0.0032;
        // free look widens the pitch range to reach nadir..zenith (from horizon)
        const pc = this.free ? 1.55 : 1.4;
        this.pitch = clamp(this.pitch + dy * 0.0032, -pc, pc);
      } else {
        // figure bodies: metres-per-radian is the LOCAL hull radius, not the
        // mean R (1.45x mis-gain at Haumea's long axis; worse at a neck).
        // ONE correction only — alt/locR already rescales the gain (the
        // post-impl panel caught the extra R/locR factor double-applying it)
        const locR = this.fig ? Math.max(figAnchorR(this.fig, this.surfaceDir()), this.fig.minR * 0.3) : this.body.R;
        const s = 0.0022 * clamp(this.alt / locR + 0.0004, 0.00002, 1.2);
        // move along the current view heading so dragging stays intuitive when yawed
        const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
        const mE = dx * cy - dy * sy, mN = dy * cy + dx * sy;
        this.lon -= (s * mE) / Math.max(Math.cos(this.lat), 0.05);
        this.lat += s * mN;
        this.lat = clamp(this.lat, -1.55, 1.55);
      }
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.alt *= Math.exp(e.deltaY * 0.0011);
      this.alt = clamp(this.alt, 1.8, this.body.R * 18); // must stay inside camera.far

    }, { passive: false });
  }

  surfaceDir() {
    const cl = Math.cos(this.lat);
    return [cl * Math.cos(this.lon), Math.sin(this.lat), cl * Math.sin(this.lon)];
  }

  // -> { pos: double[3] body-fixed, quat: THREE.Quaternion, alt, groundH }
  getState() {
    const dir = this.surfaceDir();
    const sea = this.body.seaLevel ?? -Infinity;
    const groundH = Math.max(this.heightAt(dir), sea);
    let pos, upD = dir;
    if (this.fig) {
      // q(d̂) + m̂·(ground + alt): the same displacement law the tiles bake,
      // so the camera stands ON the terrain it sees (never dir·(R+h) — at a
      // lobes neck that radial reconstruction is inside the ground)
      const q = figMapDir(this.fig, dir);
      const m = figUp(this.fig, q);
      const e = groundH + this.alt;
      pos = [q[0] + m[0] * e, q[1] + m[1] * e, q[2] + m[2] * e];
      upD = m;
    } else {
      const r = this.body.R + groundH + this.alt;
      pos = [dir[0] * r, dir[1] * r, dir[2] * r];
    }

    // tilt: 0 = nadir, π/2 = horizon, π = zenith. Free look measures pitch from
    // the horizon and reaches the full sphere; otherwise auto-tilt eases nadir
    // (orbit) to near-horizon (low altitude) with the pitch offset on top.
    // Figure bodies scale the ease thresholds by their own size — the absolute
    // 20 km..4000 km ramp framed every small-body disk 23-76° off nadir (panel)
    let tilt;
    if (this.free) {
      tilt = clamp(Math.PI / 2 + this.pitch, 0.02, Math.PI - 0.02);
    } else {
      const la = Math.log(clamp(this.alt, 10, 1e9));
      const lo = this.fig ? Math.log(0.025 * this.fig.boundR) : Math.log(20_000);
      const hi = this.fig ? Math.log(5 * this.fig.boundR) : Math.log(4_000_000);
      const tAuto = 1 - smooth((la - lo) / (hi - lo));
      tilt = clamp(tAuto * 1.32 + this.pitch, 0.02, 1.52);
    }

    const up = new THREE.Vector3(...upD);
    const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
    if (east.lengthSq() < 1e-9) east.set(1, 0, 0);
    const north = new THREE.Vector3().crossVectors(up, east);
    // start looking at nadir, rotate toward horizon by tilt, then spin by yaw
    const fwd = up.clone().multiplyScalar(-Math.cos(tilt)).addScaledVector(north, Math.sin(tilt));
    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, -this.yaw);
    fwd.applyQuaternion(qYaw);
    let right = new THREE.Vector3().crossVectors(fwd, up);
    if (right.lengthSq() < 1e-12) right = east.clone();
    right.normalize();
    const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();
    // camera roll (photo mode): spin the (right, up) basis about the view axis
    if (this.free && this.roll) {
      const qRoll = new THREE.Quaternion().setFromAxisAngle(fwd.clone().negate().normalize(), this.roll);
      right.applyQuaternion(qRoll);
      camUp.applyQuaternion(qRoll);
    }
    const m = new THREE.Matrix4().makeBasis(right, camUp, fwd.clone().negate());
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), alt: this.alt, groundH, dir, up: upD };
  }

  set(spec) {
    if (spec.lon !== undefined) this.lon = (spec.lon * Math.PI) / 180;
    if (spec.lat !== undefined) this.lat = (spec.lat * Math.PI) / 180;
    if (spec.alt !== undefined) this.alt = spec.alt;
    if (spec.yaw !== undefined) this.yaw = (spec.yaw * Math.PI) / 180;
    if (spec.pitch !== undefined) this.pitch = (spec.pitch * Math.PI) / 180;
    if (spec.free !== undefined) this.free = !!spec.free;
    if (spec.roll !== undefined) this.roll = (spec.roll * Math.PI) / 180;
  }
}

const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
