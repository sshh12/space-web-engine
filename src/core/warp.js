// warp.js — Phase W [time-field] law. One table declares, for EVERY time-keyed
// subsystem, its validity rate band and its above-band representation; selection
// is a PURE function of the spec-declared warp (never of the live clock's
// motion), so a frozen capture at declared warp 1e6 renders the above-band
// forms and the gate can actually see them. Hysteresis exists only on the live
// slider path — a pair of thresholds bracketing each canonical edge — and every
// capture/apply resets the machine to the pure selection.
//
// Above-band forms are pure and Jensen-honest (the round-15 planetshine
// lesson): clouds take the closed-form time-average of the ALPHA law, never of
// coverage (see equivalentMeanCov in cloudcore.js); lightning goes off above
// its bucket rate; ocean wave time pins to a canonical closed-form value per
// band (never the value at band entry — a held phase is retained state and
// breaks capture reproducibility). Band transitions change technique, never
// what it converges to. This module is pure (no THREE/DOM/Date) per core law.

const HYSTERESIS = 1.12; // live up-switch at edge×1.12, down-switch at edge/1.12

// ---------------------------------------------------------------------------
// the warp ladder. Signed log detents: pause ∥ ±1 s/s … ±decade/s. The cap is
// decade/s ≈ 3.16e8× — "century/s" exceeds any honest cloud/AE story today and
// stays registered with the long-scale register (ROADMAP_V3 Phase W).
export const YEAR_S = 365.25 * 86400;          // presentational Julian year
export const WARP_DETENTS = Object.freeze([
  { warp: 0, label: 'Paused' },
  { warp: 1, label: '1× real time' },
  { warp: 60, label: '60× · minute/s' },
  { warp: 3600, label: '3,600× · hour/s' },
  { warp: 86400, label: '86,400× · day/s' },
  { warp: 2629800, label: 'month/s' },         // 30.4375 d
  { warp: 31557600, label: 'year/s' },
  { warp: 315576000, label: 'decade/s' },      // the cap, ≈3.16e8×
]);
export const WARP_CAP = WARP_DETENTS[WARP_DETENTS.length - 1].warp;
// Phase N's starter ceiling was 43,200× pending this policy; the Phase W
// starter default is the "inner system visibly moves" day/s detent.
export const STARTER_SYSTEM_WARP = 86400;

// signed detent index ∈ [-(N-1) … N-1]; 0 = pause
export const detentWarp = (index) => {
  const i = Math.max(-(WARP_DETENTS.length - 1), Math.min(WARP_DETENTS.length - 1, Math.round(index)));
  return Math.sign(i) * WARP_DETENTS[Math.abs(i)].warp || 0;
};
export const detentIndexOf = (warp) => {
  let best = 0, bestErr = Infinity;
  for (let i = 0; i < WARP_DETENTS.length; i++) {
    const err = Math.abs(Math.abs(warp) - WARP_DETENTS[i].warp);
    if (err < bestErr) { bestErr = err; best = i; }
  }
  return (warp < 0 ? -1 : 1) * best;
};
export const warpLabel = (warp) => {
  if (!warp) return WARP_DETENTS[0].label;
  const row = WARP_DETENTS[Math.abs(detentIndexOf(warp))];
  const exact = row.warp === Math.abs(warp);
  const base = exact ? row.label : `${Math.abs(warp).toLocaleString()}×`;
  return warp < 0 ? `−${base}` : base;
};

// ---------------------------------------------------------------------------
// THE POLICY TABLE. Every time-keyed subsystem, its validity band (maxRate in
// |warp|; Infinity = closed-form-safe at any rate), its above-band
// representation, and why. Band edges sit strictly BETWEEN detents so the
// band-edge gates can scan crossings the detent ladder cannot see.
export const WARP_POLICY = Object.freeze({
  // closed-form at any rate — verified: pure functions of epochS in doubles,
  // no retained state, angles wrapped before use (K6).
  ephemeris: Object.freeze({ maxRate: Infinity, above: 'closed-form', note: 'conics + secular rates are linear-in-t pure functions (K1/K6)' }),
  'giant-drift': Object.freeze({ maxRate: Infinity, above: 'closed-form', note: 'storm/hex zonal drift reduced to one revolution in double per frame (engine giant upload)' }),
  'seasonal-frost': Object.freeze({ maxRate: Infinity, above: 'closed-form', note: 'subsolar-latitude consumers ride the ephemeris' }),
  'sensor-grain': Object.freeze({ maxRate: Infinity, above: 'stochastic-per-frame', note: '[camera] grain is per-frame decorrelated by design; statistics are warp-invariant; frozen captures pin it via pinned epochS' }),
  // clouds: keyframe pair + drift, proven live to 43,200× (the Phase N starter).
  // Above: worker-generated analytic time-mean raster via EQUIVALENT COVERAGE
  // through the alpha law (Jensen-honest; cloudcore.makeCloudMeanRaster), packed
  // R=B/G=A so the frac lerp is the identity; drift/frac phases canonical 0.
  clouds: Object.freeze({ maxRate: 46000, above: 'analytic-mean', note: 'alpha-law time-average, never coverage mean (alpha(mean cov) != mean(alpha(cov)))' }),
  // free-run keyframe requests follow the clouds band: above it none are issued
  // (the mean raster replaces the stream) — the "high warp starves the cloud
  // worker" register row dies structurally.
  'cloud-requests': Object.freeze({ maxRate: 46000, above: 'none', note: 'no rollover stream above band; mean raster is the representation' }),
  // planetshine's coverage term consumes whichever rows the clouds row selected;
  // its per-world-minute quantization is a cache key, not retained state.
  planetshine: Object.freeze({ maxRate: Infinity, above: 'follows-clouds', note: 'alphaMeanLit reads the selected rows; mean rows are frac/drift-invariant by packing' }),
  // lightning: 3-4 s flash buckets strobe once a bucket lasts under ~15 ms real.
  lightning: Object.freeze({ maxRate: 240, above: 'off', note: 'off above its bucket rate; the time-mean emission is negligible by construction' }),
  // aurora: substorm pulse periods are 2.0-5.6 h — a 5 Hz strobe by 43,200×.
  // Above: curtain drift canonical 0, pulse pinned to its closed-form mean 0.55.
  aurora: Object.freeze({ maxRate: 10000, above: 'time-mean', note: 'drift 0 (canonical), pulse = closed-form mean of 0.55 + 0.28sin + 0.22sin = 0.55' }),
  // ocean waves: phase = ω·t; the visible octaves scramble past a few hundred×.
  // Above: phases pinned to the canonical closed-form value at t = 0 per band —
  // a statistically identical sea (same spectrum, one fixed phase draw), never
  // the value at band entry.
  'ocean-waves': Object.freeze({ maxRate: 600, above: 'canonical-phase', note: 'wave time pinned to epoch 0; spectrum (mean/variance) preserved in distribution' }),
  // AE servo [camera]: above band the day cycle beats the servo settle and the
  // meter pumps; the servo time constant stretches by sqrt(edge/|warp|) so the
  // exposure converges to the time-averaged scene. fixedEV stays the gate
  // escape hatch everywhere. (Bench-decided: detent-ladder flicker budgets.)
  'ae-servo': Object.freeze({ maxRate: 46000, above: 'stretched-time-constant', note: 'gain × sqrt(edge/|warp|); teleport expSnap unaffected' }),
});

// the canonical subsystem list the table is asserted complete against (M5).
export const TIME_FIELD_SUBSYSTEMS = Object.freeze([
  'ephemeris', 'giant-drift', 'seasonal-frost', 'sensor-grain',
  'clouds', 'cloud-requests', 'planetshine', 'lightning', 'aurora',
  'ocean-waves', 'ae-servo',
]);

export function assertWarpPolicyComplete() {
  const table = new Set(Object.keys(WARP_POLICY));
  for (const name of TIME_FIELD_SUBSYSTEMS) {
    if (!table.has(name)) throw new Error(`warp policy: subsystem '${name}' has no declared band`);
    table.delete(name);
    const row = WARP_POLICY[name];
    if (!(row.maxRate > 0)) throw new Error(`warp policy: '${name}' band edge must be positive`);
    if (typeof row.above !== 'string' || !row.above) throw new Error(`warp policy: '${name}' declares no above-band representation`);
    // band edges must sit strictly between detents so detent scenes and
    // band-edge sweeps are distinct instruments.
    if (Number.isFinite(row.maxRate) && WARP_DETENTS.some((d) => d.warp === row.maxRate)) {
      throw new Error(`warp policy: '${name}' band edge ${row.maxRate} sits exactly on a detent`);
    }
  }
  if (table.size) throw new Error(`warp policy: undeclared subsystem row(s): ${[...table].join(', ')}`);
  return true;
}
assertWarpPolicyComplete();

// ---------------------------------------------------------------------------
// pure selection: the representation set for a DECLARED warp. This is the
// capture law's selector — no history, no live-clock input.
export function warpRepresentation(declaredWarp = 0) {
  const rate = Math.abs(declaredWarp || 0);
  return Object.freeze({
    rate,
    clouds: rate > WARP_POLICY.clouds.maxRate ? 'mean' : 'live',
    lightningOn: rate <= WARP_POLICY.lightning.maxRate,
    aurora: rate > WARP_POLICY.aurora.maxRate ? 'mean' : 'live',
    ocean: rate > WARP_POLICY['ocean-waves'].maxRate ? 'canonical' : 'live',
    aeGain: rate > WARP_POLICY['ae-servo'].maxRate ? Math.sqrt(WARP_POLICY['ae-servo'].maxRate / rate) : 1,
  });
}

// canonical above-band values (constants per band by law — never band-entry).
export const CANONICAL_OCEAN_TIME_S = 0;
export const AURORA_MEAN_PULSE = 0.55;
export const oceanTimeS = (epochS, representation) =>
  representation.ocean === 'canonical' ? CANONICAL_OCEAN_TIME_S : epochS;

// ---------------------------------------------------------------------------
// the live hysteresis machine. Continuous slider sweeps cross each edge at
// ×HYSTERESIS going up and ÷HYSTERESIS coming down, so a rate HELD at an edge
// never oscillates. reset() — used by every capture/apply — collapses to the
// pure selection at the declared warp.
export function makeWarpBandMachine() {
  const edges = {
    clouds: WARP_POLICY.clouds.maxRate,
    lightning: WARP_POLICY.lightning.maxRate,
    aurora: WARP_POLICY.aurora.maxRate,
    ocean: WARP_POLICY['ocean-waves'].maxRate,
  };
  let above = { clouds: false, lightning: false, aurora: false, ocean: false };
  const selectionFor = (warp) => {
    const pure = warpRepresentation(warp);
    return Object.freeze({
      ...pure,
      clouds: above.clouds ? 'mean' : 'live',
      lightningOn: !above.lightning,
      aurora: above.aurora ? 'mean' : 'live',
      ocean: above.ocean ? 'canonical' : 'live',
    });
  };
  return {
    reset(declaredWarp = 0) {
      const rate = Math.abs(declaredWarp || 0);
      for (const k of Object.keys(above)) above[k] = rate > edges[k];
      return selectionFor(declaredWarp);
    },
    step(declaredWarp = 0) {
      const rate = Math.abs(declaredWarp || 0);
      for (const k of Object.keys(above)) {
        if (!above[k] && rate > edges[k] * HYSTERESIS) above[k] = true;
        else if (above[k] && rate < edges[k] / HYSTERESIS) above[k] = false;
      }
      return selectionFor(declaredWarp);
    },
    state: () => ({ ...above }),
  };
}

// ---------------------------------------------------------------------------
// presentational calendar over epochS: 365.25-day years, J2000-analog = Y0 D0.
export function calendarOf(epochS) {
  const sign = epochS < 0 ? -1 : 1;
  const t = Math.abs(epochS);
  const year = Math.floor(t / YEAR_S);
  const rem = t - year * YEAR_S;
  const day = Math.floor(rem / 86400);
  const s = rem - day * 86400;
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return { year: sign * year, day, hh, mm, text: `Y${sign < 0 ? '−' : '+'}${year} · D${String(day).padStart(3, '0')} · ${hh}:${mm}` };
}

// accuracy honesty (K6): beyond the recipe's validity window the UI shows an
// unobtrusive "extrapolated" tag — a label, never a clamp.
export const isExtrapolated = (epochS, system) =>
  Math.abs(epochS) > (system?.validYears ?? 5000) * YEAR_S;

export const WARP_INTERNALS = Object.freeze({ HYSTERESIS });
