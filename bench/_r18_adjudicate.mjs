// Round-18 driver adjudication experiments (pre-code), run in parallel with the panel.
//  (1) Do Europa(~5.2 AU)/Pluto(~39 AU) as parent:'star' spheres ever crack a
//      control body's top-4 companion slice? (the r18-companion-shift gate)
//  (2) Ring opening angle from Titan: coplanar (current tree) vs Titan inclined
//      26.7deg into Saturn's equatorial plane. Edge-on (=0) is the icon target.
import { SYSTEM, bodyById, AU } from '../src/recipe.js';
import { bodyCenterInertial, ephemeris } from '../src/frames.js';

const DEG = Math.PI / 180;
const rotXv = (a, v) => [v[0], Math.cos(a) * v[1] - Math.sin(a) * v[2], Math.sin(a) * v[1] + Math.cos(a) * v[2]];

// hypothetical round-18 cryo bodies (heliocentric circular)
const EUROPA = { id: 'europa', R: 1_560_800, a: 5.203 * AU, periodDays: 4333, phase0: 1.3 }; // ~Jupiter dist
const PLUTO  = { id: 'pluto',  R: 1_188_300, a: 39.48 * AU, periodDays: 90560, phase0: 4.1 };
const heliocenter = (b, t) => {
  const th = 2 * Math.PI * (t / (b.periodDays * 86400)) + b.phase0;
  return [b.a * Math.cos(th), 0, b.a * Math.sin(th)];
};

// ---- (1) eviction test ----
const controls = ['tellus', 'rubra', 'luna'];
let evict = false, worstNewAng = 0, minSlot4 = Infinity;
for (const cid of controls) {
  const cb = bodyById(cid);
  // sample across a long span (Pluto's period dominates)
  const N = 4000, span = PLUTO.periodDays * 86400;
  for (let k = 0; k < N; k++) {
    const t = (k / N) * span;
    const eph = ephemeris(cb, t);
    const cc = bodyCenterInertial(cb, t);
    const base = eph.others.map(o => ({ id: o.body.id, ang: o.angRadius }));
    // add europa/pluto as seen from this control
    for (const nb of [EUROPA, PLUTO]) {
      const oc = heliocenter(nb, t);
      const d = Math.hypot(oc[0] - cc[0], oc[1] - cc[1], oc[2] - cc[2]);
      const ang = Math.atan(nb.R / d);
      base.push({ id: nb.id, ang });
      if (ang > worstNewAng) worstNewAng = ang;
    }
    const sorted = base.slice().sort((a, b) => b.ang - a.ang);
    const top4with = new Set(sorted.slice(0, 4).map(x => x.id));
    const without = base.filter(x => x.id !== 'europa' && x.id !== 'pluto').sort((a, b) => b.ang - a.ang);
    const top4without = new Set(without.slice(0, 4).map(x => x.id));
    // 4th-slot cutoff (without the new bodies)
    if (without[3]) minSlot4 = Math.min(minSlot4, without[3].ang);
    // eviction: a legacy body present in without-top4 but absent from with-top4
    for (const id of top4without) if (!top4with.has(id)) { evict = true; }
  }
}
console.log('=== (1) EVICTION TEST (europa/pluto vs control top-4) ===');
console.log('worst new-body angular radius from any control:', worstNewAng.toExponential(3), 'rad');
console.log('min legacy 4th-slot angular radius across controls:', minSlot4.toExponential(3), 'rad');
console.log('any legacy body evicted from a control top-4 by europa/pluto?', evict);
console.log('=> r18-companion-shift gate expected to', evict ? 'FIRE (needs adjudication)' : 'stay silent (like r17)');

// ---- (2) ring opening angle from Titan ----
const titan = bodyById('titan'), saturn = bodyById('saturn');
const ringNormalI = rotXv(saturn.spin.tiltDeg * DEG, [0, 1, 0]); // Saturn spin axis in inertial
const opening = (viewDirI) => {
  const d = Math.hypot(...viewDirI); const v = viewDirI.map(x => x / d);
  const dotN = Math.abs(v[0] * ringNormalI[0] + v[1] * ringNormalI[1] + v[2] * ringNormalI[2]);
  return Math.asin(Math.min(dotN, 1)) / DEG; // 0 = edge-on, 90 = face-on
};
// sample Titan's orbit at a fixed Saturn season, and also across Saturn's year
let coMin = 999, coMax = -999, inMin = 999, inMax = -999;
const NT = 720, NY = 40;
for (let y = 0; y < NY; y++) {
  const tSat = (y / NY) * saturn.orbit.periodDays * 86400;
  for (let k = 0; k < NT; k++) {
    const t = tSat + (k / NT) * titan.orbit.periodDays * 86400;
    const satC = bodyCenterInertial(saturn, t);
    // coplanar (current): titan local offset in XZ
    const th = 2 * Math.PI * (t / (titan.orbit.periodDays * 86400)) + titan.orbit.phase0;
    const loc = [titan.orbit.a * Math.cos(th), 0, titan.orbit.a * Math.sin(th)];
    const titanCoplanar = [satC[0] + loc[0], satC[1], satC[2] + loc[2]];
    const co = opening([satC[0] - titanCoplanar[0], satC[1] - titanCoplanar[1], satC[2] - titanCoplanar[2]]);
    coMin = Math.min(coMin, co); coMax = Math.max(coMax, co);
    // inclined 26.7 about X: titan orbits IN saturn's equatorial plane
    const locI = rotXv(saturn.spin.tiltDeg * DEG, loc);
    const titanIncl = [satC[0] + locI[0], satC[1] + locI[1], satC[2] + locI[2]];
    const ino = opening([satC[0] - titanIncl[0], satC[1] - titanIncl[1], satC[2] - titanIncl[2]]);
    inMin = Math.min(inMin, ino); inMax = Math.max(inMax, ino);
  }
}
console.log('\n=== (2) RING OPENING ANGLE FROM TITAN (0=edge-on, 90=face-on) ===');
console.log('COPLANAR (current tree):  min', coMin.toFixed(2) + '째', 'max', coMax.toFixed(2) + '째');
console.log('INCLINED 26.7 (in ring plane): min', inMin.toFixed(2) + '째', 'max', inMax.toFixed(2) + '째');
console.log('=> icon #14 wants NEAR-EDGE-ON; inclined gives ~edge-on, coplanar gives ~26.7 open');
