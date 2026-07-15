// One epoch clock for every consumer. Legacy season/tday specs remain an input
// format, but are resolved here and never composed at their call sites.

import { orbitalPeriodS, spinPeriodS } from './frames.js';
import { isLegacyOrbit, isLegacySpin } from './mechanics.js';

const DAY_S = 86400;

export function epochFromViews(body, views = {}, system) {
  if (views.epochS != null) return Number(views.epochS);
  const season = Number(views.season ?? 0.15);
  const tday = Number(views.tday ?? 0.5);
  const dayCount = Number(views.dayCount ?? 0);
  // Preserve the original multiplication grouping on the demo compatibility
  // path: even regrouping season*(periodDays*86400) moves one ULP.
  if (isLegacyOrbit(body.orbit) && isLegacySpin(body.spin)) {
    return season * body.orbit.periodDays * DAY_S
      + (dayCount + tday) * body.spin.periodH * 3600;
  }
  return season * orbitalPeriodS(body, system) + (dayCount + tday) * spinPeriodS(body, system);
}

export function viewsAtEpoch(body, epochS, system) {
  const spinS = spinPeriodS(body, system);
  const orbitS = orbitalPeriodS(body, system);
  const frac = (x) => ((x % 1) + 1) % 1;
  return { season: frac(epochS / orbitS), tday: frac(epochS / spinS) };
}

// A legacy pair which composes back to exactly epochS through epochFromViews.
export function legacyViewsAtEpoch(body, epochS, system) {
  const spinS = spinPeriodS(body, system);
  const tday = ((epochS % spinS) + spinS) % spinS / spinS;
  return {
    season: (epochS - tday * spinS) / orbitalPeriodS(body, system),
    tday,
  };
}

export function solvePhaseTday(body, phaseDeg, dir, ephemerisAt, season = 0.15) {
  let best = 0.5, bestErr = Infinity;
  for (let i = 0; i < 2048; i++) {
    const tday = i / 2048;
    const sun = ephemerisAt(body, epochFromViews(body, { season, tday })).sunDirBF;
    const phase = Math.acos(Math.max(-1, Math.min(1, sun[0] * dir[0] + sun[1] * dir[1] + sun[2] * dir[2]))) * 180 / Math.PI;
    const error = Math.abs(phase - phaseDeg);
    if (error < bestErr) { bestErr = error; best = tday; }
  }
  return best;
}
