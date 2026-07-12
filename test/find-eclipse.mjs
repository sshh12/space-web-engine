// find-eclipse.mjs — scan the closed-form ephemeris for eclipse geometry:
//   solar (Luna's shadow dot crossing Tellus) and lunar (Tellus's umbra on Luna).
// Prints season/tday + sub-occluder lon/lat to pose bench scenes. Deterministic —
// the same scan two machines run finds the same eclipse.
import { SYSTEM, bodyById } from '../src/recipe.js';
import { ephemeris } from '../src/frames.js';

const tellus = bodyById('tellus');
const luna = bodyById('luna');

function scan(body, occId, label) {
  const spinSec = body.spin.periodH * 3600;
  let best = null;
  for (let i = 0; i < 200000; i++) {
    const t = i * 300; // 5-min steps over ~2 years
    const eph = ephemeris(body, t);
    const o = eph.others.find((x) => x.body.id === occId);
    if (!o) continue;
    const cosSep = o.dirBF[0] * eph.sunDirBF[0] + o.dirBF[1] * eph.sunDirBF[1] + o.dirBF[2] * eph.sunDirBF[2];
    const sep = Math.acos(Math.min(Math.max(cosSep, -1), 1));
    const lim = o.angRadius + eph.sunAngRadius;
    if (sep < lim && (!best || sep < best.sep)) {
      // __shot composes t = season*orbitSec + tday*spinSec — subtract the day
      // fraction from season or the spec lands hours off the alignment
      const tday = (t % spinSec) / spinSec;
      const season = (t - tday * spinSec) / (body.orbit.periodDays * 86400);
      const lat = (Math.asin(o.dirBF[1]) * 180) / Math.PI;
      const lon = (Math.atan2(o.dirBF[2], o.dirBF[0]) * 180) / Math.PI;
      best = { sep, t, season: +season.toFixed(6), tday: +tday.toFixed(6), lat: +lat.toFixed(2), lon: +lon.toFixed(2), angO: o.angRadius, angS: eph.sunAngRadius };
    }
  }
  console.log(label, JSON.stringify(best));
  return best;
}

// solar eclipse on Tellus: Luna between Tellus and sun (sub-Luna point = shadow dot)
scan(tellus, 'luna', 'solar-on-tellus:');
// lunar eclipse on Luna: Tellus between Luna and sun
scan(luna, 'tellus', 'lunar-on-luna:  ');
