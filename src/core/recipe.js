// recipe.js — CONCEPT §6: planet = data recipe, engine = agnostic. One SYSTEM object:
// the star, then each body as a recipe plus orbital/rotation elements. Counts are
// data; nothing else in the codebase hardcodes a body. Pure data, importable by the
// worker, the main thread and Node tests alike.
// Phase-K sign transcription (standard ecliptic -> engine XZ ecliptic):
// +X→standard +Y becomes +X→engine +Z, so i/Ω/ω and Ωdot/ωdot keep their
// published signs; the corresponding prograde angular-momentum pole is -Y.

import { assertMechanicsSystem } from './mechanics.js';

export const AU = 1.496e11; // m

export const SYSTEM = {
  id: 'demo-system',
  validYears: 5000,
  star: {
    name: 'Sol',
    GM: 1.32712440018e20,     // m^3/s^2; Phase K's rails/physics consistency root
    radius: 6.96e8,           // m — sets the disc's angular size per body
    irradianceAt1AU: 25.0,    // radiance scale of the whole renderer (relative units)
    color: [1.0, 0.96, 0.9],  // spectrum stand-in
  },
  bodies: [
    {
      id: 'tellus',
      name: 'Tellus (Earth-like)',
      parent: 'star',
      GM: 3.986004418e14,
      R: 6_371_000,
      orbit: { a: 1.0 * AU, periodDays: 365.25, phase0: 0.0 },
      spin: { tiltDeg: 23.4, periodH: 24, phase0: 0.0 },
      seaLevel: 0,           // level set (m above datum); null = no ocean
      maxBakeLevel: 19,
      discAlbedo: [0.3, 0.45, 0.75],
      camera: { lon: 25, lat: 18, alt: 16_000_000 },
      // ordered process list; levels = [first band, last band] (CONCEPT §4)
      processes: [
        { type: 'continents', levels: [0, 3], amp: 2600, freq: 1.15, warp: 0.55, oceanBias: 0.32, hurst: 0.85, dichotomy: 0.15, swell: 0.2, seed: 11 },
        // round 12 (Phase 2 singularity (c)): winner-take-all volcanism on the
        // swell peak — ONE hotspot edifice (Hawaii-class; oceanic swell -> an
        // emergent island). 'height' deliberately not 'amp' (split metric).
        { type: 'edifice', levels: [2, 2], volN: 1, height: 8500, radius: 230000, sepDeg: 20, seed: 131 },
        { type: 'fbmBand', levels: [2, 9], amp: 2400, hurst: 0.92, ridged: true, upliftMask: true, seed: 23 },
        { type: 'fbmBand', levels: [4, 12], amp: 400, hurst: 0.78, seed: 31 },
        // sparse + degraded (an active surface erases its craters); no rays
        { type: 'craters', levels: [8, 12], density: 0.012, depthK: 0.18, complexR: 2400, seed: 41 },
        { type: 'fbmBand', levels: [8, 16], amp: 55, hurst: 0.72, seed: 49 },
        { type: 'fbmBand', levels: [13, 19], amp: 4.0, hurst: 0.85, rockBoost: true, seed: 53 },
        { type: 'context', levels: [0, 19], tempEq: 28, tempPole: -38, lapse: 6.5e-3, iceTemp: -8, seed: 61 },
        // round 12 oriented structure: the closed-form stress context (mild
        // swell agent — Tellus is plate-tectonic, our stagnant-lid law only
        // carries gentle ridge belts; registered) + the age/youth context
        { type: 'tect', levels: [2, 19], stampLevels: [8, 11], kSw: 0.3, kBasin: 0, tauC: 0.24, tauE: 0.34, ridgeAmp: 110, grabenAmp: 80, seed: 133 },
        { type: 'age', levels: [2, 19], kMare: 0, seed: 137 },
        // Phase 2 [global]: ONE planet-wide coarse pass (flow routing across all
        // six faces + advected moisture), assembled from the process prefix
        // above at the declared level; every tile samples it, never re-derives
        { type: 'global', levels: [0, 19], level: 3, moisture: { beta: 0.42, gamma: 0.007, evapSea: 0.055, evapLand: 0.022, sweeps: 128 }, wind: { speed: 1, kDef: 60, expoRef: 0.008 }, seed: 105 },
        { type: 'biomes', levels: [0, 19], moistLo: 0.05, moistHi: 0.24, seed: 107 },
        { type: 'incision', levels: [4, 5], depth: 1300, grade: 600, power: 1.6, seed: 109 },
        // ground plan L1 (round 8): hardness-layered cliff-and-bench former —
        // benches/scarps in the uplifted highlands only (uplift gate), beds
        // folded at ~2.5° regional dips so bench edges cross hillsides
        { type: 'strata', levels: [9, 16], bedT0: 650, bedLac: 0.45, octaves: 5, foldAmp: 26000, foldF: 5, hardBias: 0.58, amp: 0.85, stressK: 0.5, gate: { field: 'uplift', lo: 0.22, hi: 0.5 }, seed: 117 },
        { type: 'thermal', levels: [7, 19], iters: 2, talusDeg: 34, rate: 0.22, seed: 71 },
        { type: 'materials', levels: [0, 19], rockSlopeDeg: 28, seed: 83 },
        // G5 catena (round 8): curvature sorts material by hillslope position;
        // agent = gravity + water (full rates)
        { type: 'catena', levels: [10, 16], kFines: 0.55, kShed: 0.35, kRock: 0.35, kDen: 0.08, kBury: 0.1, seed: 119 },
        // round 12 coherent bedforms — TWO agents on one mechanism (the
        // anti-overfit gate's shape): desert dunes gated on fines + dryness,
        // polar MEGADUNES gated on firn/ice (Antarctic-class: km spacing,
        // metres of amplitude). Windless bodies simply lack the entries.
        { type: 'bedforms', levels: [10, 13], gate: { field: 'fines', lo: 0.08, hi: 0.32 }, regK: 0.22, dry: { lo: 0.06, hi: 0.2 }, lamK: 9, aspect: 0.075, slipK: 0.7, sharp: 2.2, defAmp: 0.8, seed: 145 },
        { type: 'bedforms', levels: [9, 10], gate: { field: 'ice', lo: 0.45, hi: 0.75 }, lamK: 9, aspect: 0.003, slipK: 0.3, sharp: 1.4, defAmp: 0.5, seed: 147 },
        { type: 'horizon', levels: [2, 14], reach: 2 },
        { type: 'ao', levels: [2, 19], k: 0.85, seed: 97 },
      ],
      palette: {
        dust: [0.30, 0.25, 0.17],   // soil/regolith base
        dustVar: [0.37, 0.315, 0.205],
        rock: [0.30, 0.28, 0.26],
        ice: [0.93, 0.95, 0.99],
        veg: [0.065, 0.14, 0.045],  // §5 derived look: climate-driven tint
        vegVar: [0.16, 0.22, 0.08],
        vegCold: [0.05, 0.11, 0.075],  // taiga/tundra (Whittaker cold class, round 13)
        vegWarm: [0.30, 0.27, 0.12],   // savanna / dry steppe (warm+arid class)
        oceanShallow: [0.06, 0.32, 0.35],
        oceanDeep: [0.004, 0.016, 0.045],
        scourTint: [0.82, 0.8, 0.78],   // round 12: subtle desert deflation darkening
      },
      // G3 populations: temperate world — transported float dominates (rounded
      // cobbles), with bedding slabs and calved blocks; water-worked = high rounding
      rocks: { latticeLevel: 17, perCell: 0.14, minTileLevel: 15, sizeMin: 0.15, sizeMax: 2.2, denFloor: 0.02, seed: 5,
        mix: { clast: 0.2, cobble: 0.45, slab: 0.2, block: 0.15 }, rounding: 0.65, clusterK: 0.45, meshSeed: 11 },
      // round 14 — formations: the bedrock-outcrop agent (upland tors/coastal
      // stacks; the two-body gate's second agent — H4: verified at a LOCATED
      // site, else dropped)
      formations: { latticeLevel: 12, fieldLevel: 12, minTileLevel: 13, perCell: 0.03, sizeMin: 8, sizeMax: 24, seed: 63,
        mix: { outcrop: 1 }, gate: { field: 'uplift', lo: 0.2, hi: 0.45 },
        rockLo: 0.2, rockHi: 0.5, slopeLo: 0.05, slopeHi: 0.55, calveK: 0.35, rough: 0.07 },
      // ground-law look params (round 8): G1 joint tessellation + G4 sand
      // routing agents — all data, engine carries no per-body constants.
      // jointS must keep the 4096 m detail snap an exact lattice multiple
      // (0.25/0.5/1/2); windDeg is a compass heading (0 = from north)
      // pavK low: Tellus pavements are desert-rare. (Round 9 diagnosed the
      // beach-eye "checker band" as metre-scale shadow-map slope acne, NOT a
      // pavement/fines problem — fixed in localShadow's slope-scaled bias — so
      // the queued fines-floor-on-flats is retired here.)
      ground: { jointS: 1.0, jointK: 0.5, jointAng: 0.5, jointTab: 0.8, windDeg: 240, ripK: 0.45, pavK: 0.06, stressAlign: 0.3, scourK: 0.15, mantleK: 0.0 },
      // material texture stacks v2 (round 10): archetype picks per material class
      // (0 regolith-fines, 1 cracked-basalt, 2 duricrust, 3 firn), the detail's
      // world scale (m per atlas repeat) and amplitude. Temperate soil + basalt.
      matStack: { fines: 0, rock: 1, ice: 3, scale: 2.5, amp: 0.9 },
      // Water v2 [recipe]: wind heading drives the wave spectrum's dominant
      // azimuth; glitter/surf/turbidity scale the Cox-Munk sparkle, the shoaling
      // surf band and the river-mouth sediment plume
      water: { windDeg: 240, glitter: 1.0, surf: 1.0, surfK: 0.12, turbidity: 1.0, wetDark: 0.13, wetGloss: 0.5 },
      // seasonal H2O snow cap (round 13): retreats toward temperate latitudes each summer
      seasonalCap: { k: 0.7, tint: [0.93, 0.95, 0.99], latOn: 50, latFull: 72, seasonK: 0.3 },
      // Phase 4 clouds core (round 15, CONCEPT §8 "coverage is a field,
      // volume is a look"): coverage decks — a [time-field] equirect per deck
      // (cloudcore.js), keyframes every keyframeH world-hours with a fixed
      // lerp, advection = the closed-form drift lon − ω·t (driftDegPerDay).
      // TWO decks prove the multi-deck schema (§6: counts are data): broken
      // low cumulus + a thin high cirrus veil. detailAmp <= 1 is a LAW (the
      // mean-1 detail bound), asserted at load.
      clouds: {
        keyframeH: 6, seed: 71, muClamp: 0.09,
        decks: [
          { baseM: 1500, thickM: 1800, sigmaK: 0.0022, alb: [0.94, 0.95, 0.97],
            cov0: 0.26, covLo: 0.45, covHi: 0.585, zonalW: 0.25, moistW: 0.5, moistMid: 0.4, fbmW: 0.6,
            freq: 6.5, oct: 4, evolve: 0.24, driftDegPerDay: -85,
            detailAmp: 0.85, detailFreq: 1600, ambW: 0.4, profile: 'cumulus' },
          { baseM: 8200, thickM: 1600, sigmaK: 0.00035, alb: [0.92, 0.94, 0.98],
            cov0: 0.2, covLo: 0.38, covHi: 0.72, zonalW: 0.24, moistW: 0.3, moistMid: 0.4, fbmW: 0.55,
            freq: 3.2, oct: 3, evolve: 0.16, driftDegPerDay: -170,
            detailAmp: 0.5, detailFreq: 380, ambW: 0.35, profile: 'cirrus' },
        ],
        // round 16 — lightning: transient flashes in the cumulus (deck 0)
        // convective cells, visible at night as brief in-deck illumination. A
        // [time-field] stochastic emitter (hash of cell × time-bucket), drowned by
        // day. period divides 4096 (bench hygiene).
        lightning: { color: [0.5, 0.62, 1.0], rate: 0.018, freq: 46, period: 4 },
      },
      // material BRDF params (Phase 1b): soils lean Lambert with a mild surge;
      // ice is translucent (SSS wrap) with glossy facets
      brdf: { regolithW: 0.3, surgeHs: 0.07, surgeB0: 0.25, iceSSS: 0.7, iceSpec: 0.3, iceRough: 0.32, rockSpec: 0.06, rockRough: 0.6 },
      atmosphere: {
        top: 80_000, Hr: 8_500, Hm: 1_200,
        betaR: [5.8e-6, 13.5e-6, 33.1e-6],
        betaM: [4.0e-6, 4.0e-6, 4.0e-6],
        betaA: [0.3e-6, 0.3e-6, 0.3e-6],
        mieG: 0.76,
        refrac: 2.9e-4,   // datum refractivity (n-1): flattened setting sun, copper umbra
        // stratospheric ozone (Chappuis band eats green/yellow): without it a
        // simulated twilight zenith turns olive — the round-1 panel's hue defect
        ozone: { beta: [6.5e-7, 1.881e-6, 8.5e-8], center: 25_000, width: 15_000 },
        // NIGHT-SIDE AUDIT (rounds 2-3): with the sun down, every scattering
        // term is a true zero (1e-37) — airglow is the ONLY night emitter, so
        // the night sky IS this value x the meter, and the meter runs to its
        // clamp on a star-field scene. Calibrated so that AT THE CLAMP the sky
        // stays essentially black (real airglow needs minutes of tracked
        // exposure — a working-exposure camera cannot see it; the term stays
        // in the integral for future extreme-EV camera profiles). Spectrum:
        // OI 557.7nm green, never blue.
        airglow: [0.00000005, 0.00000012, 0.00000006],
        // night-side pack — aurora, enriched round 16 to a dual-altitude [time-field]
        // look: OI 557.7 nm green lower band + OI 630 nm red upper band (real aurora
        // is red-over-green), a substorm intensity pulse and drifting curtains, now
        // rendered INSIDE the one integral so it reads over the night DISC from orbit
        // (not just above the limb). Dipole-tilted oval; drowned by day via exposure.
        aurora: {
          latDeg: 67, widthDeg: 6, dipoleTiltDeg: 9,
          colorLo: [0.004, 0.024, 0.010], hLo: 110_000,
          colorHi: [0.018, 0.005, 0.008], hHi: 240_000,
        },
      },
    },
    {
      id: 'rubra',
      name: 'Rubra (Mars-like)',
      parent: 'star',
      GM: 4.282837e13,
      R: 3_389_500,
      orbit: { a: 1.52 * AU, periodDays: 687, phase0: 2.2 },
      spin: { tiltDeg: 25.2, periodH: 24.6, phase0: 0.0 },
      seaLevel: null,
      maxBakeLevel: 19,
      discAlbedo: [0.55, 0.32, 0.18],
      camera: { lon: -40, lat: 10, alt: 9_000_000 },
      processes: [
        // dichotomy + swell: the degree-1..3 cascade top — a hemispheric split and
        // a Tharsis-class bulge emerge from the statistics, never from a name
        { type: 'continents', levels: [0, 3], amp: 3400, freq: 0.9, warp: 0.7, oceanBias: 0.5, hurst: 0.9, dichotomy: 0.5, swell: 0.42, seed: 13 },
        // round 12 (Phase 2 singularity (c)): winner-take-all volcanism — a
        // Tharsis-class shield trio EMERGES on the swell peak (selection over a
        // seeded candidate set, never a name) — and ONE great rift system where
        // the dome's hoop extension peaks, radial off the swell (Valles-from-
        // Tharsis geometry). 'height'/'depth' deliberately not 'amp': tiles.js
        // derives the split-metric relief from max(p.amp) and must not rescale
        // the whole planet to one mountain.
        { type: 'edifice', levels: [2, 2], volN: 3, height: 15000, radius: 650000, sepDeg: 17, seed: 151 },
        { type: 'rift', levels: [2, 4], depth: 6500, width: 140000, arc: [0.16, 0.78], seed: 153 },
        // dark lowland plains (wind-scoured young basalt — albedo mostly, little fill)
        { type: 'provinces', levels: [2, 2], fillHi: -200, fillLo: -1400, bias: -0.02, flatten: 0.15, seed: 21 },
        { type: 'fbmBand', levels: [2, 8], amp: 1900, hurst: 0.92, ridged: true, upliftMask: true, seed: 27 },
        { type: 'fbmBand', levels: [4, 12], amp: 380, hurst: 0.87, seed: 33 },
        // crater overhaul: power-law SFD in-band, complex morphology above ~7 km
        // diameter, dark rays (fresh impacts punch through the bright dust — G6
        // sign is per-body data, the opposite of Luna's)
        // depthK 0.4 + degBias 2.1 (round-4 follow-up panel: Pike shallowing x
        // soft degradation collapsed the disc's relief to waxy ghosts — Mars
        // preserves crisp craters; fresh D=20 km now carves ~1.5 km, per Pike)
        { type: 'craters', levels: [2, 16], density: 0.35, depthK: 0.4, complexR: 3800, degBias: 2.1, basinTail: 0.035, rayK: 0.4, rayAge: 0.15, rayReach: 5, resurfK: 0.3, seed: 43 },
        { type: 'fbmBand', levels: [13, 19], amp: 3.0, hurst: 0.85, rockBoost: true, seed: 57 },
        { type: 'context', levels: [0, 19], tempEq: -20, tempPole: -95, lapse: 2.2e-3, iceTemp: -80, seed: 67 },
        // round 12 oriented structure: closed-form stress (swell agent strong —
        // radial graben fans on the bulge, wrinkle-ridged plains at the
        // periphery; basin agent from the heavy-tail mascon population) + the
        // age/youth context (dark provinces = wind-scoured YOUNG basalt: the
        // consequence-chain albedo reads youth x windExpo)
        { type: 'tect', levels: [2, 19], stampLevels: [8, 12], kSw: 0.85, kBasin: 0.5, tauC: 0.22, tauE: 0.3, ridgeAmp: 210, grabenAmp: 150, seed: 155 },
        { type: 'age', levels: [2, 19], kMare: 0.75, seed: 157 },
        // [global] flow routing with deep basins as outlets (Hellas-class lows
        // drain the valley networks — no ocean needed); no moisture, no biomes
        { type: 'global', levels: [0, 19], level: 3, drainLevel: -1800, wind: { speed: 1, kDef: 26, expoRef: 0.015 }, seed: 111 },
        { type: 'incision', levels: [4, 5], depth: 750, grade: 450, power: 1.5, base: -1800, seed: 113 },
        // inverted relief (round 13): ancient dry paleochannels indurate and
        // stand up as sinuous ridges after the softer plains deflate (Aeolis-
        // class). MID flow band excludes the incised trunks; gated dry + old.
        { type: 'invert', levels: [5, 7], amp: 280, flowLo: 0.22, flowMid: 0.5, flowHi: 0.85, dryLo: 0.1, dryHi: 0.4, ageLo: 0.15, ageHi: 0.55, seed: 167 },
        // ground plan L1 (round 8): flat-lying beds (low fold dip ~1.2°) over a
        // wide uplift gate — canyon-wall benches, mesa caprock, valley
        // knickpoints; the rubra-canyon-dawn icon's layered walls live here
        { type: 'strata', levels: [8, 16], bedT0: 900, bedLac: 0.45, octaves: 5, foldAmp: 7000, foldF: 5, hardBias: 0.5, amp: 1.0, stressK: 0.8, gate: { field: 'uplift', lo: 0.08, hi: 0.3 }, planK: 0.55, planAmp: 0.24, seed: 121 },
        { type: 'thermal', levels: [6, 19], iters: 2, talusDeg: 32, rate: 0.28, seed: 73 },
        { type: 'materials', levels: [0, 19], rockSlopeDeg: 26, seed: 87 },
        // G5 catena: gravity + wind agents — crests scoured rocky, swales filled
        { type: 'catena', levels: [10, 16], kFines: 0.5, kShed: 0.35, kRock: 0.4, kDen: 0.1, kBury: 0.12, seed: 123 },
        // round 12 coherent bedforms: sand-sea dune systems — amplitude keys on
        // the catena fines supply (dunes live where sand CAN accumulate), crest
        // trains ride the [global] wind, defects emerge where it turns
        { type: 'bedforms', levels: [10, 13], gate: { field: 'fines', lo: 0.07, hi: 0.3 }, regK: 0.42, lamK: 9, aspect: 0.075, slipK: 0.7, sharp: 2.2, defAmp: 0.8, seed: 159 },
        { type: 'horizon', levels: [2, 14], reach: 2 },
        { type: 'ao', levels: [2, 19], k: 0.6, seed: 101 },
      ],
      palette: {
        dust: [0.42, 0.22, 0.11],
        dustVar: [0.52, 0.30, 0.15],
        rock: [0.30, 0.20, 0.14],
        ice: [0.9, 0.92, 0.95],
        mare: [0.26, 0.14, 0.085],   // dark basalt-sand provinces (Syrtis-class)
        freshTint: [0.62, 0.5, 0.44], // fresh = DARKER (dust-free rock; G6 sign)
        // round 12 consequence-chain albedo: scour multiplies toward dark
        // basalt (Syrtis-class), mantle lerps toward bright dust (Tharsis/
        // Arabia) — both consequences of wind x elevation x age, never units
        scourTint: [0.6, 0.52, 0.5],
        mantleTint: [0.54, 0.31, 0.16],
        oceanShallow: [0, 0, 0],
        oceanDeep: [0, 0, 0],
      },
      // G3 populations: rover-panorama mix — fracture plates (slab-heavy), angular
      // float, some rounded ancient fluvial cobbles; aeolian abrasion = mid rounding
      rocks: { latticeLevel: 17, perCell: 0.22, minTileLevel: 15, sizeMin: 0.12, sizeMax: 1.8, denFloor: 0.12, seed: 7,
        mix: { clast: 0.3, cobble: 0.2, slab: 0.35, block: 0.15 }, rounding: 0.35, clusterK: 0.6, meshSeed: 13 },
      // round 14 — formations (ground plan L5, beyond the heightfield): the
      // strata-hardness agent — hoodoos/outcrops/arches on the uplands where
      // procStrata's baked riser exposure marks caprock country (K3: gates on
      // shipped fields, never a re-derived bed predicate)
      formations: { latticeLevel: 12, fieldLevel: 12, minTileLevel: 13, perCell: 0.06, sizeMin: 12, sizeMax: 42, seed: 61,
        mix: { hoodoo: 0.45, outcrop: 0.4, arch: 0.15 }, gate: { field: 'uplift', lo: 0.08, hi: 0.3 },
        rockLo: 0.15, rockHi: 0.4, slopeLo: 0.04, slopeHi: 0.5, calveK: 0.55, rough: 0.06, bedY: 0.16 },
      // G1 flagstone pavements (thermal+tectonic joints, angular) + strong
      // aeolian routing: the Curiosity-pan look lives in these numbers
      ground: { jointS: 1.0, jointK: 0.85, jointAng: 0.75, jointTab: 1.0, windDeg: 100, ripK: 0.8, pavK: 0.75, stressAlign: 0.7, scourK: 0.5, mantleK: 0.45, mantleAlt: [6000, 14000], streakK: 0.5 },
      // seasonal CO2 polar cap (round 13): the dramatic Mars whole-disc cue —
      // advances to ~40 deg in winter, nearly sublimes away in summer
      seasonalCap: { k: 0.85, tint: [0.95, 0.95, 0.98], latOn: 38, latFull: 62, seasonK: 0.45 },
      // Phase 4 clouds (round 15): ONE thin, high, fast-drifting water-ice cirrus
      // deck — the second AGENT of the cloud mechanism with wildly different data
      // (the two-body anti-overfit gate). No moisture grid: coverage falls back to
      // zonal prior + fbm. Round 16 adds the two [time-field] SEASONAL modes the
      // recipe.js:280 note promised — a winter POLAR HOOD on the cirrus deck and a
      // GLOBAL DUST STORM as a second, dust-coloured deck. Both key closed-form on
      // orbital season (subsolar declination / phase), zero off-season (byte-
      // identical to round 15 at the default season), and the storm CASTS the pall
      // through the same cloud-shadow slot. "Coverage is a field, volume is a look."
      clouds: {
        keyframeH: 8, seed: 83, muClamp: 0.09,
        decks: [
          { baseM: 14_000, thickM: 2500, sigmaK: 0.00018, alb: [0.9, 0.93, 0.97],
            cov0: 0.22, covLo: 0.44, covHi: 0.85, zonalW: 0.3, moistW: 0, fbmW: 0.65,
            freq: 4.2, oct: 4, evolve: 0.16, driftDegPerDay: 140,
            detailAmp: 0.45, detailFreq: 500, ambW: 0.3, profile: 'cirrus',
            // winter polar hood: a CO2/water-ice cirrus cap over the winter pole
            // (hoodLatOn 0.9 = 64°; the winter-declination shift pulls the onset to
            // ~47° in deep winter, like Mars's real hood). A smooth zonal DC lift.
            hoodAmp: 0.55, hoodLatOn: 0.9, hoodLatFull: 0.99, hoodSeasonK: 0.55 },
          // GLOBAL DUST STORM: a low, thick, dust-COLOURED deck whose coverage is a
          // seasonal DC lift (stormEnvelope on the orbital phase, peaking near
          // "perihelion" phase stormLs). cov0 deeply negative + covFloor ⇒ EXACTLY
          // clear off-season; in-season raw saturates past covHi to a near-total
          // butterscotch pall. sigmaK·thick ≈ 8 (opaque). alb = the dust palette.
          { baseM: 6000, thickM: 12_000, sigmaK: 0.00068, alb: [0.55, 0.34, 0.2],
            cov0: -0.3, covLo: 0.35, covHi: 0.6, zonalW: 0.05, moistW: 0, fbmW: 0.4,
            freq: 3.0, oct: 4, evolve: 0.16, driftDegPerDay: 40,
            detailAmp: 0.5, detailFreq: 320, ambW: 0.3, profile: 'cumulus',
            stormW: 1.3, stormLs: 4.71, stormWidth: 0.7 },
        ],
      },
      // material texture stacks v2: dusty regolith over indurated duricrust —
      // the polygonal crust net is the Curiosity-pan look the joints ride over
      matStack: { fines: 0, rock: 2, ice: 3, scale: 2.0, amp: 1.0 },
      // dusty regolith: mostly Lommel-Seeliger, moderate opposition surge
      brdf: { regolithW: 0.85, surgeHs: 0.06, surgeB0: 0.6, iceSSS: 0.5, iceSpec: 0.2, iceRough: 0.4, rockSpec: 0.05, rockRough: 0.65 },
      atmosphere: {
        top: 70_000, Hr: 10_800, Hm: 8_000,
        betaR: [0.6e-7, 1.4e-7, 3.3e-7],
        betaM: [2.6e-5, 2.2e-5, 1.6e-5],  // dust scattering
        betaA: [0.4e-5, 1.4e-5, 3.6e-5],  // dust ABSORBS blue -> butterscotch emerges
        // per-λ forward lobe: micron dust diffracts blue into a tighter cone than
        // red — the MER blue sunset aureole emerges from phase + absorption alone
        mieG: [0.58, 0.68, 0.82],
        refrac: 9e-6,     // thin CO2 column: negligible flattening (honest)
        airglow: [0.00000004, 0.000000045, 0.00000004], // dim neutral-warm (CO2+ bands)
      },
    },
    {
      id: 'luna',
      name: 'Luna (airless moon)',
      parent: 'tellus',
      GM: 4.9048695e12,
      R: 1_737_000,
      orbit: { a: 3.84e8, periodDays: 27.3, phase0: 1.1 },
      spin: { tiltDeg: 1.5, periodH: 27.3 * 24, phase0: 0.0 },
      seaLevel: null,
      maxBakeLevel: 19,
      discAlbedo: [0.32, 0.32, 0.31],
      camera: { lon: 0, lat: 8, alt: 4_500_000 },
      processes: [
        { type: 'continents', levels: [0, 3], amp: 2200, freq: 1.0, warp: 0.4, oceanBias: 0.42, hurst: 0.9, dichotomy: 0.28, swell: 0.15, seed: 17 },
        // maria: flood basalt fills the lows, flattens them, resurfaces old craters
        { type: 'provinces', levels: [2, 2], fillHi: 150, fillLo: -600, fillLevel: -300, bias: 0.05, basinFill: 1.0, seed: 19 },
        { type: 'fbmBand', levels: [4, 12], amp: 300, hurst: 0.87, seed: 37 },
        // crater overhaul: the Moon's face IS its crater statistics — power-law
        // SFD, complex morphology above ~18 km diameter, bright ray systems
        // (immature regolith) that cross the maria
        { type: 'craters', levels: [1, 17], density: 0.55, depthK: 0.32, complexR: 9000, basinTail: 0.05, rayK: 0.85, rayAge: 0.22, rayReach: 7, resurfK: 0.6, seed: 47 },
        // round 12 oriented structure, BASIN agent (kSw 0 — no swell tectonics:
        // highlands far from mascons bake byte-identical with the process
        // removed, the anti-overfit negative control): concentric wrinkle
        // ridges INSIDE the mascon basins, arcuate rilles at their margins —
        // same eigen-rule as Rubra's radial graben fans, opposite agent. The
        // age context marks the maria modestly younger than the highlands
        // (round-13 space weathering consumes it; no albedo consumer here).
        { type: 'tect', levels: [2, 19], stampLevels: [8, 12], kSw: 0, kBasin: 1.0, tauC: 0.2, tauE: 0.28, ridgeAmp: 230, grabenAmp: 140, seed: 161 },
        { type: 'age', levels: [2, 19], kMare: 0.3, seed: 163 },
        { type: 'fbmBand', levels: [13, 19], amp: 2.6, hurst: 0.85, rockBoost: true, seed: 59 },
        // ground plan L1 (round 8): thin stacked mare-flow fronts (G2's "stacked
        // mare flows" strata origin) — subtle benches gated to the maria; the
        // gardened highlands stay unbenched
        { type: 'strata', levels: [11, 17], bedT0: 130, bedLac: 0.45, octaves: 3, foldAmp: 1600, foldF: 6, hardBias: 0.62, amp: 0.35, gate: { field: 'mare', lo: 0.15, hi: 0.55 }, planK: 0.0, planAmp: 0.12, seed: 125 },
        { type: 'context', levels: [0, 19], tempEq: -20, tempPole: -60, lapse: 0, iceTemp: -300, seed: 69 },
        { type: 'thermal', levels: [8, 19], iters: 2, talusDeg: 36, rate: 0.15, seed: 79 },
        { type: 'materials', levels: [0, 19], rockSlopeDeg: 30, seed: 89 },
        // G5 catena, creep-only agent (slower rates): crater-floor fines ponds
        // are the G4 no-wind routing case — fines pool in lows without any wind
        // kFines high: gentle lunar curvature accretes slowly (measured p90
        // ~0.05 at 0.35 — too weak a signal for the G4 supply consumer)
        { type: 'catena', levels: [10, 16], kFines: 0.9, kShed: 0.5, kRock: 0.3, kDen: 0.08, kBury: 0.12, seed: 129 },
        { type: 'horizon', levels: [2, 14], reach: 2 },
        { type: 'ao', levels: [2, 19], k: 0.65, seed: 103 },
      ],
      palette: {
        dust: [0.26, 0.255, 0.245],
        dustVar: [0.34, 0.335, 0.325],
        // round-8 register fix: rock crowns must separate from the dust they sit
        // on — freshly exposed breccia is BRIGHTER than mature regolith (space
        // weathering darkens); 0.20 ≈ dust 0.26 made every clast a shadow pixel
        rock: [0.30, 0.295, 0.285],
        ice: [0.9, 0.9, 0.9],
        mare: [0.135, 0.132, 0.126],  // basalt maria ≈ half highland albedo
        freshTint: [1.75, 1.75, 1.82], // fresh = BRIGHTER (immature regolith rays)
        weatherTint: [0.84, 0.80, 0.76], // space weathering: mature regolith darkens/reddens (round 13)
        oceanShallow: [0, 0, 0],
        oceanDeep: [0, 0, 0],
      },
      // G3 populations: airless — ejecta blocks + impact-shattered angular clasts,
      // NO fluvial float; nothing rounds a rock on the Moon (breccia, rounding low).
      // Round-8 register fix (round-6 panel: "boulderfield reads as a pockmarked
      // plain"): denFloor 0.22→0.08 — the gardened lag stays but stops flooding
      // every lattice cell with sub-decimetre clasts; sizeMin 0.1→0.2 raises the
      // visible size floor so near-camera clasts resolve as rocks, not specks.
      // Round-9 re-check: denFloor 0.08→0.10 (the register's low end). The lift
      // was conditional on the airless fill making the icon readable; the fill
      // landed but the icon's phaseDeg-78 GRAZING sun keeps the registered
      // meso-facet leopard carpet (the Phase-M filtered-normal fix, round 11),
      // so the boulderfield stays pockmark-limited AT THIS POSE regardless — the
      // modest lift restores boulder presence at the non-grazing poses; a full
      // re-check (0.10→0.12, or re-posing the icon lower) waits on the round-11
      // grazing fix.
      rocks: { latticeLevel: 17, perCell: 0.25, minTileLevel: 15, sizeMin: 0.2, sizeMax: 2.2, denFloor: 0.10, seed: 9,
        mix: { clast: 0.45, cobble: 0.05, slab: 0.15, block: 0.35 }, rounding: 0.12, clusterK: 0.7, meshSeed: 17 },
      // G1 impact-shatter jointing: jointTab 0.1 = equant chaotic breccia
      // boundaries, no oriented sets, no coplanar flagstone tops, softened
      // gardened grooves (round-8 panel two-body gate: Luna must NOT read as
      // Rubra's pavement); shows only on exposed bedrock; no wind — G4 pools
      ground: { jointS: 0.5, jointK: 0.35, jointAng: 0.9, jointTab: 0.1, windDeg: 0, ripK: 0.0, pavK: 0.12, weatherK: 0.2, weatherSlope: 0.7 },
      // material texture stacks v2: regolith fines over impact breccia; amp kept
      // LOW — airless exposure binarizes strong micro-relief (the round-9 lesson:
      // no re-speckling of the harsh Luna frame)
      matStack: { fines: 0, rock: 1, ice: 3, scale: 3.0, amp: 0.6 },
      // pure regolith photometry: full L-S, strong shadow-hiding surge (full-Moon
      // flatness + the bright halo around a ground camera's own shadow point)
      brdf: { regolithW: 1.0, surgeHs: 0.05, surgeB0: 1.0, iceSSS: 0, iceSpec: 0, iceRough: 0.5, rockSpec: 0.04, rockRough: 0.7 },
      atmosphere: null,
    },
    // ===================== round 16: Phase 3 recipes (data) =====================
    // Titan, Venus, Saturn — pure §6 recipe data on the existing engine (the only
    // engine work was the capacity widening to NB bodies + the axis/latBelt/calm
    // knobs). All physical coefficients are reference-grounded (Cassini/Huygens,
    // Venera/Akatsuki); the ORANGE of Titan and Venus emerges from the absorption/
    // Rayleigh COEFFICIENTS, never a painted gradient (§8).
    {
      id: 'titan',
      name: 'Titan (organic-haze moon)',
      parent: 'saturn',
      GM: 8.9781382e12,
      R: 2_574_700,
      orbit: { a: 1.2219e9, periodDays: 15.945, phase0: 0.7 }, // around Saturn (tidally locked)
      spin: { tiltDeg: 26.7, periodH: 15.945 * 24, phase0: 0.0 }, // locked; Saturn's obliquity drives seasons
      seaLevel: -600,          // north-polar methane/ethane lowlands below datum
      maxBakeLevel: 19,
      discAlbedo: [0.30, 0.22, 0.13], // orange-brown (haze-tinted disc)
      camera: { lon: 10, lat: -8, alt: 6_000_000 },
      processes: [
        // low-relief icy world: gentle relief, a mild dichotomy, sparse craters
        // (resurfaced by haze fallout + fluvial), bright icy uplands (Xanadu-class)
        { type: 'continents', levels: [0, 3], amp: 1400, freq: 1.05, warp: 0.5, oceanBias: 0.4, hurst: 0.88, dichotomy: 0.25, swell: 0.12, seed: 211 },
        { type: 'fbmBand', levels: [2, 9], amp: 900, hurst: 0.9, seed: 213 },
        { type: 'fbmBand', levels: [4, 12], amp: 260, hurst: 0.85, seed: 217 },
        { type: 'craters', levels: [6, 13], density: 0.03, depthK: 0.14, complexR: 3000, seed: 219 },
        { type: 'fbmBand', levels: [13, 19], amp: 3.0, hurst: 0.85, rockBoost: true, seed: 223 },
        { type: 'context', levels: [0, 19], tempEq: -179, tempPole: -190, lapse: 1.0e-3, iceTemp: -300, seed: 227 },
        // [global]: methane-rain fluvial routing (Huygens dendritic channels) + wind
        { type: 'global', levels: [0, 19], level: 3, drainLevel: -600, wind: { speed: 1, kDef: 30, expoRef: 0.01 }, seed: 231 },
        { type: 'incision', levels: [4, 6], depth: 400, grade: 300, power: 1.5, base: -600, seed: 233 },
        { type: 'materials', levels: [0, 19], rockSlopeDeg: 27, seed: 237 },
        { type: 'catena', levels: [10, 16], kFines: 0.7, kShed: 0.4, kRock: 0.3, kDen: 0.1, kBury: 0.12, seed: 239 },
        // Titan's SIGNATURE: LONGITUDINAL (seif) equatorial dune belt — E-W crests
        // parallel to the wind, |lat|<30, dark organic tholin sand (the round-16
        // axis + latBelt knobs; palette carries the colour, bedforms the relief)
        { type: 'bedforms', levels: [10, 13], gate: { field: 'fines', lo: 0.05, hi: 0.28 }, regK: 0.3, axis: 'longitudinal', latBelt: 30, lamK: 9, aspect: 0.06, sharp: 1.8, defAmp: 0.6, seed: 241 },
        { type: 'thermal', levels: [8, 19], iters: 2, talusDeg: 30, rate: 0.18, seed: 243 },
        { type: 'horizon', levels: [2, 14], reach: 2 },
        { type: 'ao', levels: [2, 19], k: 0.6, seed: 247 },
      ],
      palette: {
        dust: [0.09, 0.06, 0.035],   // dark organic (tholin) equatorial sand
        dustVar: [0.13, 0.09, 0.05],
        rock: [0.40, 0.33, 0.25],    // bright icy highland (Xanadu), tholin-dusted
        ice: [0.55, 0.50, 0.42],     // dirty water-ice bedrock
        mare: [0.07, 0.05, 0.03],    // sand-sea dark provinces
        oceanShallow: [0.030, 0.028, 0.026], // methane sea: near-black, faint brown
        oceanDeep: [0.012, 0.012, 0.016],
        scourTint: [0.7, 0.65, 0.55],
      },
      // rounded icy cobbles strewn on a granular plain — the Huygens surface frame
      rocks: { latticeLevel: 17, perCell: 0.12, minTileLevel: 15, sizeMin: 0.1, sizeMax: 1.2, denFloor: 0.06, seed: 251,
        mix: { clast: 0.2, cobble: 0.5, slab: 0.15, block: 0.15 }, rounding: 0.7, clusterK: 0.5, meshSeed: 19 },
      ground: { jointS: 1.0, jointK: 0.4, jointAng: 0.5, jointTab: 0.6, windDeg: 270, ripK: 0.5, pavK: 0.1 },
      matStack: { fines: 0, rock: 1, ice: 3, scale: 2.5, amp: 0.7 },
      // methane sea: near-still (low wind, low gravity 1.35 m/s²), low glint, NO
      // white surf, no sediment plume — all pure recipe data (round-16 water.calm)
      water: { windDeg: 270, glitter: 0.3, surf: 0, surfK: 0.12, turbidity: 0, calm: 0.2, wetDark: 0.1, wetGloss: 0.3 },
      brdf: { regolithW: 0.4, surgeHs: 0.06, surgeB0: 0.3, iceSSS: 0.4, iceSpec: 0.2, iceRough: 0.4, rockSpec: 0.05, rockRough: 0.6 },
      atmosphere: {
        // thick ORGANIC HAZE (tholin): the surface is lit by diffuse forward-
        // scattered ORANGE light (shadowless from above). Colour is the ABSORPTION
        // spectrum — betaA blue ≫ red (tholin eats blue → orange-brown); betaM high
        // and haze-dominated; the haze fills the whole column (Hm ~ Hr), not a thin
        // boundary layer. Strong forward lobe (g 0.65) keeps a faint surface view.
        top: 550_000, Hr: 25_000, Hm: 55_000,
        // first-light calibration (round 16): the haze must SCATTER orange brightly
        // and DOMINATE the (negligible) gas Rayleigh, or the disc reads dark and the
        // surface sky reads blue. betaR ~0 (buried under haze); betaM high (τ_M ~7)
        // with a moderately high single-scatter albedo so the haze glows; betaA eats
        // BLUE ~10x red so the bright scattered light is orange (not white).
        betaR: [0.05e-6, 0.1e-6, 0.2e-6],  // negligible gas Rayleigh
        betaM: [1.3e-4, 1.05e-4, 0.8e-4],  // bright orange-scattering haze (τ_M ≈ 7)
        betaA: [0.35e-5, 1.4e-5, 3.5e-5],  // absorbs BLUE ~10x red → the orange colourant (post-panel: was reversed)
        mieG: 0.65,
        refrac: 1.3e-3,                    // derived (n-1), flagged; gentle flattening
        // round 17 (§11 forward-queue): the τ≈7 haze veils the whole disc — a
        // RENDER-time mix toward the haze colour (matches discAlbedo) in the
        // companion-disc pass, so the disc agrees with the far point without
        // re-pinning the manifest disc bytes. k from single-scatter albedo of
        // the deep column (most ground light is replaced by haze light).
        discHaze: { k: 0.75, color: [0.30, 0.22, 0.13] },
        airglow: [0.00000002, 0.00000002, 0.00000002],
      },
    },
    {
      id: 'venus',
      name: 'Venus (runaway greenhouse)',
      parent: 'star',
      GM: 3.24858592e14,
      R: 6_052_000,
      orbit: { a: 0.723 * AU, periodDays: 224.7, phase0: 4.1 },
      spin: { tiltDeg: 177.4, periodH: 243 * 24, phase0: 0.0 }, // retrograde, ~upside-down (≈no seasons)
      seaLevel: null,
      maxBakeLevel: 19,
      discAlbedo: [0.72, 0.70, 0.55], // pale lemon-yellow from space (Bond ~0.77)
      camera: { lon: 20, lat: 5, alt: 12_000_000 },
      processes: [
        // basaltic plains (~80%) + TESSERA highlands (tectonized, higher & rougher)
        { type: 'continents', levels: [0, 3], amp: 2200, freq: 1.0, warp: 0.6, oceanBias: 0.35, hurst: 0.9, dichotomy: 0.2, swell: 0.2, seed: 311 },
        { type: 'edifice', levels: [2, 2], volN: 2, height: 8000, radius: 300000, sepDeg: 40, seed: 313 },
        { type: 'fbmBand', levels: [2, 9], amp: 1600, hurst: 0.92, ridged: true, upliftMask: true, seed: 317 },
        { type: 'fbmBand', levels: [4, 12], amp: 320, hurst: 0.85, seed: 319 },
        { type: 'craters', levels: [3, 15], density: 0.06, depthK: 0.2, complexR: 4000, seed: 321 }, // few (young resurfaced ~500 Ma)
        { type: 'fbmBand', levels: [13, 19], amp: 3.0, hurst: 0.85, rockBoost: true, seed: 323 },
        { type: 'context', levels: [0, 19], tempEq: 465, tempPole: 455, lapse: 8e-3, iceTemp: -300, seed: 327 }, // 740 K, ~uniform
        // strong tectonics ⇒ tessera "continents/islands" (Ishtar/Aphrodite, Maxwell)
        { type: 'tect', levels: [2, 19], stampLevels: [8, 12], kSw: 0.7, kBasin: 0.3, tauC: 0.2, tauE: 0.3, ridgeAmp: 240, grabenAmp: 180, seed: 331 },
        { type: 'global', levels: [0, 19], level: 3, wind: { speed: 0.3, kDef: 20, expoRef: 0.02 }, seed: 335 }, // sluggish surface wind
        { type: 'strata', levels: [9, 16], bedT0: 700, bedLac: 0.45, octaves: 4, foldAmp: 9000, foldF: 5, hardBias: 0.5, amp: 0.6, gate: { field: 'uplift', lo: 0.1, hi: 0.35 }, seed: 337 },
        { type: 'thermal', levels: [7, 19], iters: 2, talusDeg: 32, rate: 0.2, seed: 339 },
        { type: 'materials', levels: [0, 19], rockSlopeDeg: 27, seed: 343 },
        { type: 'catena', levels: [10, 16], kFines: 0.4, kShed: 0.35, kRock: 0.4, kDen: 0.1, kBury: 0.1, seed: 347 },
        { type: 'horizon', levels: [2, 14], reach: 2 },
        { type: 'ao', levels: [2, 19], k: 0.6, seed: 351 },
      ],
      palette: {
        dust: [0.10, 0.085, 0.070],  // dark reddish basalt (reads orange-brown under the deck)
        dustVar: [0.13, 0.11, 0.09],
        rock: [0.15, 0.12, 0.095],   // tessera (marginally brighter, rougher)
        ice: [0.30, 0.28, 0.25],
        mare: [0.08, 0.065, 0.05],   // smooth dark plains
        freshTint: [0.5, 0.45, 0.4],
        oceanShallow: [0, 0, 0], oceanDeep: [0, 0, 0],
      },
      rocks: { latticeLevel: 17, perCell: 0.15, minTileLevel: 15, sizeMin: 0.12, sizeMax: 1.6, denFloor: 0.08, seed: 353,
        mix: { clast: 0.35, cobble: 0.15, slab: 0.35, block: 0.15 }, rounding: 0.25, clusterK: 0.55, meshSeed: 23 },
      ground: { jointS: 1.0, jointK: 0.7, jointAng: 0.7, jointTab: 0.9, windDeg: 60, ripK: 0.2, pavK: 0.5 },
      matStack: { fines: 0, rock: 1, ice: 3, scale: 2.2, amp: 0.9 },
      // NEAR-TOTAL sulfuric cloud deck as a round-15 deck: an ELEVATED slab (base
      // 48 km, top 70 km — the real detached H2SO4 deck), cov0 0.95 so it saturates
      // to full overcast everywhere; bright, conservative-scattering, pale-yellow.
      // NOT put through the F1 variance test (near-uniform → ill-conditioned, panel).
      clouds: {
        keyframeH: 6, seed: 361, muClamp: 0.09,
        decks: [
          { baseM: 48_000, thickM: 22_000, sigmaK: 0.0008, alb: [0.86, 0.82, 0.6],
            cov0: 0.95, covLo: 0.2, covHi: 0.5, zonalW: 0.02, moistW: 0, fbmW: 0.08,
            freq: 2.0, oct: 3, evolve: 0.1, driftDegPerDay: 90,
            detailAmp: 0.3, detailFreq: 200, ambW: 0.5, profile: 'cirrus' },
        ],
      },
      brdf: { regolithW: 0.6, surgeHs: 0.06, surgeB0: 0.4, iceSSS: 0.3, iceSpec: 0.15, iceRough: 0.45, rockSpec: 0.05, rockRough: 0.62 },
      atmosphere: {
        // TWO looks from ONE integral: pale yellow-white from space (the bright
        // deck) and shadowless ORANGE below it — the sub-cloud CO2 RAYLEIGH over the
        // deep, dense column scatters blue away (betaR blue ≫ red, LARGE), so the
        // transmitted/multiply-scattered surface light reddens to orange. The deck
        // top (70 km) sits inside the atm shell (top 90 km). Huge refractivity
        // (n-1 ~0.014, ~50x Earth) — the round-16 saturated Bennett term keeps the
        // apparent-elevation map monotone (no dead-band).
        top: 90_000, Hr: 15_900, Hm: 2_000,
        // first-light calibration: stronger blue-AND-green removal over the deep CO2
        // column so the transmitted/multiply-scattered surface light reddens to
        // orange (not olive — green must be removed too, λ⁻⁴ over a dense path).
        betaR: [28e-6, 52e-6, 105e-6],   // STRONG blue-weighted (the surface-orange driver)
        betaM: [3.0e-6, 3.0e-6, 2.6e-6],
        betaA: [0.2e-6, 0.5e-6, 0.9e-6], // slight UV/blue absorber → the pale-lemon disc
        mieG: 0.75,
        refrac: 0.014,                   // derived (~50x Earth); saturated to stay monotone
        airglow: [0.00000003, 0.00000002, 0.00000002],
      },
    },
    {
      id: 'saturn',
      name: 'Saturn (banded gas giant + rings — best seen from Titan\'s sky)',
      parent: 'star',
      GM: 3.7931187e16,
      R: 58_232_000,
      orbit: { a: 9.58 * AU, periodDays: 10759, phase0: 0.9 },
      spin: { tiltDeg: 26.7, periodH: 10.7, phase0: 0.0 },
      seaLevel: null,
      maxBakeLevel: 8, // only ever seen as a §11 disc from Titan; no deep tiles
      discAlbedo: [0.776, 0.691, 0.508], // round 18: the cos-lat integral of the giant band profile (§11 disc→point; pinned by test:ring)
      camera: { lon: 0, lat: 0, alt: 200_000_000 },
      // a smooth pale-gold ball: bakeDiscMap reads palette.dust/rock, so keep the
      // relief tiny and the palette uniform → a featureless pale disc. The banded
      // fluid-giant look AND the ring annulus are Phase 6 (round 18); this recipe
      // exists so Saturn hangs in Titan's sky (titan-saturnrise breakpoint) and so
      // the NB-body capacity widening is load-bearing/tested (§11 disc→point).
      processes: [
        { type: 'continents', levels: [0, 3], amp: 200, freq: 0.8, warp: 0.2, oceanBias: 0.5, hurst: 0.9, dichotomy: 0.0, swell: 0.0, seed: 411 },
        { type: 'fbmBand', levels: [2, 6], amp: 60, hurst: 0.9, seed: 413 },
        { type: 'context', levels: [0, 19], tempEq: -139, tempPole: -160, lapse: 0, iceTemp: -300, seed: 417 },
        { type: 'materials', levels: [0, 19], rockSlopeDeg: 40, seed: 419 },
        { type: 'ao', levels: [2, 19], k: 0.3, seed: 421 },
      ],
      palette: {
        dust: [0.776, 0.691, 0.508], // = discAlbedo = the band cos-lat mean (bakeDiscMap reads dust/rock)
        dustVar: [0.82, 0.75, 0.56],
        rock: [0.78, 0.70, 0.50],
        ice: [0.90, 0.88, 0.80],
        oceanShallow: [0, 0, 0], oceanDeep: [0, 0, 0],
      },
      ground: { jointS: 1.0, jointK: 0, jointAng: 0, jointTab: 0, windDeg: 0 },
      matStack: { fines: 0, rock: 1, ice: 3, scale: 3.0, amp: 0.2 },
      brdf: { regolithW: 0.7, surgeHs: 0.1, surgeB0: 0.2, iceSSS: 0.3, iceSpec: 0.1, iceRough: 0.5, rockSpec: 0.03, rockRough: 0.7 },
      atmosphere: null,
      // round 18 — Saturn becomes a banded fluid giant (Phase 6). The look is
      // LIVE-synthesized in SKY_FRAG's §11 companion-disc block (differential
      // rotation + storm + hexagon are closed-form time, so the disc can't be a
      // static baked atlas). discAlbedo/palette.dust are the cos-lat integral of
      // the blended bandCol (§7/§11 disc→point; pinned by test:ring). bakeDiscMap
      // still bakes a pale-gold disc (unused for the giant slot but manifest-pinned).
      giant: {
        // zonal bands: sin-lat knots (pole −1 … pole +1), pale-gold belts/zones,
        // blended in-shader by unrolled smoothstep weights (no dynamic index)
        bands: [
          { s: -0.95, c: [0.74, 0.66, 0.48] }, // S polar
          { s: -0.62, c: [0.91, 0.83, 0.61] }, // bright zone
          { s: -0.32, c: [0.66, 0.56, 0.38] }, // dark belt
          { s: -0.10, c: [0.93, 0.85, 0.63] }, // bright equatorial zone
          { s: 0.15, c: [0.68, 0.57, 0.39] },  // dark belt
          { s: 0.42, c: [0.88, 0.80, 0.58] },  // zone
          { s: 0.70, c: [0.64, 0.55, 0.42] },  // dark belt
          { s: 0.92, c: [0.73, 0.68, 0.57] },  // N polar (hexagon region)
        ],
        limbExp: 0.55, limbK: 0.55,                              // strong deck-like limb darkening
        storm: { lon: 2.2, lat: -0.55, r: 0.13, c: [0.95, 0.90, 0.82] }, // white oval, S mid-lat (drifts at Ω(lat))
        hexagon: { latOn: 0.88, amp: 0.05, c: [0.66, 0.66, 0.62] },       // N-polar wavenumber-6 standing wave
        deepRate: 810, diffRate: 90,                             // deg/day interior rotation + equator-pole shear
      },
      // ring system (Phase 6): an analytic annulus in the SKY_FRAG disc block.
      // inner/outer/gaps in PLANET RADII (main.js converts to angular via
      // dist); ≤4 gap notches, unrolled (no dynamic index). Forward-scatter HG.
      rings: {
        inner: 1.24, outer: 2.27,   // C-ring inner … A-ring outer
        gaps: [
          { r: 1.95, w: 0.02, depth: 0.85 },  // Cassini division
          { r: 2.21, w: 0.006, depth: 0.55 }, // Encke gap
        ],
        col: [0.76, 0.72, 0.62], tau: 1.6, fscatterG: 0.5,
      },
    },
    // ============== round 17: Phase 5 figure generality (data) ==============
    // Vesta, Haumea, Arrokoth — the recipe declares the reference shape the
    // rasters displace (§11 verbatim); the sphere is merely the common case.
    // All three are airless and dry (real physics, and the round-17 scope law
    // assertFigureRecipe enforces): the figure work is the domain math, not a
    // new look. Angular radii from every legacy body stay far below the top-4
    // companion slice at all epochs (checked closed-form: ≤1.5e-6 rad vs the
    // 9e-6 rad worst 4th slot), so legacy skies are untouched.
    {
      id: 'vesta',
      name: 'Vesta (oblate protoplanet — Rheasilvia basin)',
      parent: 'star',
      GM: 1.7288e10,
      R: 262_000, // volumetric mean of the figure below
      figure: {
        // the POLAR (short) semi-axis sits on +Y — the engine's spin/latitude
        // axis (mathx latOf; post-impl panel: axes [a,a,c] put the flattening
        // SIDEWAYS and Rheasilvia's south pole on a long axis)
        type: 'ellipsoid', axes: [285_000, 223_000, 285_000], // Dawn: 572.6×572.6×446.4 km
        reliefBudget: 26_000, // Rheasilvia floor −19 km / central peak; preflight asserts vs injectivity
      },
      orbit: { a: 2.36 * AU, periodDays: 1325, phase0: 2.1 },
      spin: { tiltDeg: 29, periodH: 5.34, phase0: 0.0 },
      seaLevel: null,
      maxBakeLevel: 14,
      discAlbedo: [0.38, 0.36, 0.33], // bright howardite regolith (geometric albedo ~0.42)
      camera: { lon: 20, lat: -55, alt: 700_000 },
      processes: [
        { type: 'continents', levels: [0, 3], amp: 3000, freq: 1.1, warp: 0.35, oceanBias: 0.5, hurst: 0.9, dichotomy: 0.15, swell: 0.1, seed: 511 },
        { type: 'fbmBand', levels: [3, 11], amp: 700, hurst: 0.88, seed: 513 },
        // the crater record IS the surface — plus ONE authored basin: Rheasilvia,
        // 500 km across a 570 km body, floor −19 km, a central PEAK (t=0 term,
        // round-17 authored-basin datum — the stochastic lattice cannot place it)
        { type: 'craters', levels: [1, 12], density: 0.6, depthK: 0.3, complexR: 12000, rayK: 0.2, rayAge: 0.5, rayReach: 4, resurfK: 0.4, seed: 521,
          basins: [{ dir: [0, -1, 0], r: 250_000, depth: 16_000, peakH: 9_000, peakR: 0.14, rimH: 3_000, seed: 523 }] },
        { type: 'context', levels: [0, 14], tempEq: -60, tempPole: -110, lapse: 0, iceTemp: -300, seed: 525 },
        { type: 'fbmBand', levels: [12, 14], amp: 3.5, hurst: 0.85, rockBoost: true, seed: 527 },
        { type: 'thermal', levels: [7, 14], iters: 2, talusDeg: 34, rate: 0.18, seed: 529 },
        { type: 'materials', levels: [0, 14], rockSlopeDeg: 28, seed: 531 },
        { type: 'catena', levels: [9, 13], kFines: 0.8, kShed: 0.5, kRock: 0.3, kDen: 0.08, kBury: 0.1, seed: 533 },
        { type: 'horizon', levels: [2, 12], reach: 2 },
        { type: 'ao', levels: [2, 14], k: 0.6, seed: 535 },
      ],
      palette: {
        dust: [0.305, 0.29, 0.265],
        dustVar: [0.37, 0.355, 0.33],
        rock: [0.35, 0.335, 0.31],   // fresh breccia brighter than mature regolith (Luna law)
        ice: [0.9, 0.9, 0.9],
        freshTint: [1.5, 1.5, 1.55],
        weatherTint: [0.88, 0.85, 0.81],
        oceanShallow: [0, 0, 0], oceanDeep: [0, 0, 0],
      },
      ground: { jointS: 0.5, jointK: 0.3, jointAng: 0.9, jointTab: 0.1, windDeg: 0, ripK: 0.0, pavK: 0.1, weatherK: 0.2, weatherSlope: 0.7 },
      matStack: { fines: 0, rock: 1, ice: 3, scale: 3.0, amp: 0.55 },
      brdf: { regolithW: 1.0, surgeHs: 0.05, surgeB0: 0.9, iceSSS: 0, iceSpec: 0, iceRough: 0.5, rockSpec: 0.04, rockRough: 0.7 },
      ambientAlbedo: 0.36, // round-17 airless-fill datum (panel: the fill was albedo-blind)
      atmosphere: null,
    },
    {
      id: 'haumea',
      name: 'Haumea (extreme triaxial fast-spinner — crystalline ice)',
      parent: 'star',
      GM: 2.674e11,
      R: 801_000, // (abc)^(1/3)
      figure: {
        // short (polar) axis on +Y = the spin axis — a fast spinner flattens
        // along its rotation axis; long/mid axes ride the equator plane
        type: 'ellipsoid', axes: [1_160_000, 510_000, 870_000], // the rotational figure IS the look
        reliefBudget: 5_000,
      },
      orbit: { a: 43.1 * AU, periodDays: 103_660, phase0: 4.0 },
      spin: { tiltDeg: 28, periodH: 3.92, phase0: 0.0 }, // the fastest spinner known at this size
      seaLevel: null,
      maxBakeLevel: 15,
      discAlbedo: [0.80, 0.80, 0.82], // crystalline water ice
      camera: { lon: 0, lat: 10, alt: 3_500_000 },
      processes: [
        { type: 'continents', levels: [0, 3], amp: 1200, freq: 1.0, warp: 0.3, oceanBias: 0.5, hurst: 0.9, dichotomy: 0.1, swell: 0.0, seed: 611 },
        { type: 'fbmBand', levels: [3, 12], amp: 350, hurst: 0.88, seed: 613 },
        { type: 'craters', levels: [2, 13], density: 0.3, depthK: 0.25, complexR: 15000, rayK: 0.3, rayAge: 0.3, rayReach: 4, resurfK: 0.5, seed: 617 },
        { type: 'context', levels: [0, 15], tempEq: -220, tempPole: -240, lapse: 0, iceTemp: -180, seed: 619 },
        { type: 'fbmBand', levels: [13, 15], amp: 2.5, hurst: 0.85, rockBoost: true, seed: 621 },
        { type: 'thermal', levels: [8, 15], iters: 2, talusDeg: 38, rate: 0.12, seed: 623 },
        { type: 'materials', levels: [0, 15], rockSlopeDeg: 35, seed: 625 },
        { type: 'horizon', levels: [2, 13], reach: 2 },
        { type: 'ao', levels: [2, 15], k: 0.45, seed: 627 },
      ],
      palette: {
        dust: [0.76, 0.78, 0.80],    // crystalline ice plain
        dustVar: [0.70, 0.72, 0.75],
        rock: [0.55, 0.57, 0.60],    // exposed older ice scarps darker
        ice: [0.88, 0.90, 0.93],
        oceanShallow: [0, 0, 0], oceanDeep: [0, 0, 0],
      },
      ground: { jointS: 0.7, jointK: 0.4, jointAng: 0.6, jointTab: 0.3, windDeg: 0, ripK: 0.0, pavK: 0.0, weatherK: 0.1, weatherSlope: 0.6 },
      matStack: { fines: 0, rock: 1, ice: 3, scale: 3.0, amp: 0.4 },
      brdf: { regolithW: 0.35, surgeHs: 0.06, surgeB0: 0.4, iceSSS: 0.5, iceSpec: 0.25, iceRough: 0.35, rockSpec: 0.06, rockRough: 0.6 },
      ambientAlbedo: 0.7,
      atmosphere: null,
    },
    {
      id: 'arrokoth',
      name: 'Arrokoth (contact binary — the neck)',
      parent: 'star',
      GM: 2.4e5,
      R: 9_000,
      figure: {
        type: 'lobes',
        lobes: [
          { c: [-5_200, 0, 0], axes: [6_500, 5_600, 3_400] }, // Wenu (large, flattened)
          { c: [5_800, 0, 0], axes: [4_900, 4_400, 2_900] },  // Weeyo
        ],
        neckK: 2_500,      // smin fillet radius — the neck IS this datum
        reliefBudget: 260, // gentle mounded terrain; preflight asserts 2x headroom at the neck
      },
      orbit: { a: 44.6 * AU, periodDays: 108_000, phase0: 5.2 },
      spin: { tiltDeg: 99, periodH: 15.92, phase0: 0.0 }, // near-sideways spin (New Horizons)
      seaLevel: null,
      maxBakeLevel: 9,
      discAlbedo: [0.21, 0.13, 0.08], // very red cold-classical tholins
      camera: { lon: 0, lat: 35, alt: 30_000 },
      processes: [
        { type: 'continents', levels: [0, 3], amp: 90, freq: 1.3, warp: 0.4, oceanBias: 0.5, hurst: 0.92, dichotomy: 0.0, swell: 0.0, seed: 711 },
        { type: 'fbmBand', levels: [2, 7], amp: 40, hurst: 0.9, seed: 713 }, // the mounded-terrain undulation
        { type: 'craters', levels: [2, 8], density: 0.18, depthK: 0.22, complexR: 1e9, rayK: 0, rayAge: 0, rayReach: 3, resurfK: 0.3, seed: 717 },
        { type: 'context', levels: [0, 9], tempEq: -230, tempPole: -245, lapse: 0, iceTemp: -300, seed: 719 },
        { type: 'fbmBand', levels: [8, 9], amp: 0.8, hurst: 0.85, rockBoost: true, seed: 721 },
        { type: 'thermal', levels: [5, 9], iters: 2, talusDeg: 32, rate: 0.15, seed: 723 },
        { type: 'materials', levels: [0, 9], rockSlopeDeg: 30, seed: 725 },
        { type: 'catena', levels: [5, 8], kFines: 0.9, kShed: 0.4, kRock: 0.3, kDen: 0.08, kBury: 0.12, seed: 727 },
        { type: 'horizon', levels: [2, 8], reach: 2 },
        { type: 'ao', levels: [2, 9], k: 0.6, seed: 729 },
      ],
      palette: {
        dust: [0.165, 0.105, 0.072],   // deep red tholin regolith
        dustVar: [0.20, 0.13, 0.09],
        rock: [0.21, 0.14, 0.10],
        ice: [0.34, 0.26, 0.20],       // the brighter fine-grained collar material
        oceanShallow: [0, 0, 0], oceanDeep: [0, 0, 0],
      },
      ground: { jointS: 0.4, jointK: 0.25, jointAng: 0.8, jointTab: 0.15, windDeg: 0, ripK: 0.0, pavK: 0.05, weatherK: 0.15, weatherSlope: 0.7 },
      matStack: { fines: 0, rock: 1, ice: 3, scale: 3.0, amp: 0.5 },
      brdf: { regolithW: 1.0, surgeHs: 0.06, surgeB0: 0.9, iceSSS: 0, iceSpec: 0, iceRough: 0.5, rockSpec: 0.03, rockRough: 0.75 },
      ambientAlbedo: 0.06,
      atmosphere: null,
    },
    // ============== round 18: Phase 5 cryo pack (data) ==============
    // Europa + Pluto — canonical cryo worlds (the Phase-5 exit names both). Both
    // are SPHERE bodies (near-spherical in reality; sphere path is byte-clean and
    // keeps the circular limbProfile). Appended AFTER arrokoth so no legacy atlas
    // row shifts. parent:'star' with a fake heliocentric orbit — the SURFACE is
    // the deliverable, and spin is the body's REAL synchronous rotation (decoupled
    // from the placeholder orbit — the pre-code europa-spin finding). Their angular
    // radii from every control (tellus/rubra/luna) stay below the 4th companion
    // slot at all epochs (closed-form check + the r18-companion-shift tripwire:
    // worst 2.83e-6 rad vs the 4.60e-6 rad floor, 1.63× margin on Rubra).
    {
      id: 'europa',
      name: 'Europa (icy moon — tidal lineae + chaos)',
      parent: 'star',
      GM: 3.2027388e12,
      skyHidden: true, // standalone: never rendered in another body's sky (keeps legacy skies byte-identical)
      R: 1_560_800,
      orbit: { a: 5.203 * AU, periodDays: 4333, phase0: 1.3 }, // heliocentric stand-in (no Jupiter in SYSTEM)
      spin: { tiltDeg: 3, periodH: 85.2, phase0: 0.0 },        // REAL 3.55-d synchronous rotation (NOT the fake orbit)
      seaLevel: null,
      maxBakeLevel: 15,
      discAlbedo: [0.62, 0.62, 0.66], // bright water-ice (geometric albedo ~0.67)
      ambientAlbedo: 0.6,             // bright ice fills its own shadows (airless)
      camera: { lon: 200, lat: 5, alt: 900_000 },
      processes: [
        { type: 'continents', levels: [0, 3], amp: 1200, freq: 1.0, warp: 0.4, oceanBias: 0.5, hurst: 0.9, dichotomy: 0.1, swell: 0.08, seed: 811 },
        { type: 'fbmBand', levels: [2, 10], amp: 260, hurst: 0.9, seed: 813 },
        // context first (writes the ice field the cryo looks key on — very cold)
        { type: 'context', levels: [0, 15], tempEq: -160, tempPole: -185, lapse: 0, iceTemp: -120, seed: 817 },
        // tidal LINEAE: age-rotated families of arcuate double ridges (the ruddy
        // fracture network over bright ice — Europa's whole identity). Present at
        // level 2 (disc mirror). The bright albedo arrives WHOLE; ridge relief
        // blends in at ridgeLevel.
        { type: 'lineae', levels: [2, 12], ridgeLevel: 6, seed: 821,
          families: [
            { pole: [0.2, 0.95, 0.1], lam: 0.085, phase: 0.1, amp: 300, albK: 0.85, warp: 0.06, fade: 1.0 },
            { pole: [0.9, 0.1, 0.4], lam: 0.11, phase: 0.5, amp: 240, albK: 0.70, warp: 0.08, fade: 0.8 },
            { pole: [0.3, 0.2, 0.93], lam: 0.14, phase: 0.8, amp: 180, albK: 0.55, warp: 0.10, fade: 0.6 }, // oldest, faintest
          ] },
        // CHAOS terrain (Conamara-class block jumble) within an fbm margin field
        { type: 'chaos', levels: [3, 12], blockLevel: 7, blockFreq: 60, marginFreq: 2.3, marginLo: 0.34, marginHi: 0.6, blockH: 650, seed: 831 },
        { type: 'craters', levels: [4, 13], density: 0.02, depthK: 0.16, complexR: 8000, rayK: 0.3, rayAge: 0.6, rayReach: 4, resurfK: 0.6, seed: 841 }, // young surface: sparse
        { type: 'thermal', levels: [7, 15], iters: 2, talusDeg: 32, rate: 0.14, seed: 843 },
        { type: 'materials', levels: [0, 15], rockSlopeDeg: 35, seed: 845 },
        { type: 'ao', levels: [2, 15], k: 0.4, seed: 847 },
        { type: 'horizon', levels: [2, 12], reach: 2 },
      ],
      palette: {
        dust: [0.66, 0.66, 0.70],   // MUST match discAlbedo start (bakeDiscMap reads dust/rock)
        dustVar: [0.70, 0.70, 0.74],
        rock: [0.55, 0.52, 0.52],
        ice: [0.82, 0.85, 0.92],    // bright blue-white water ice
        linea: [0.52, 0.34, 0.26],  // ruddy contaminant along the double ridges (round-18 cryo albedo)
        oceanShallow: [0, 0, 0], oceanDeep: [0, 0, 0],
      },
      ground: { jointS: 0.5, jointK: 0.1, jointAng: 0.4, jointTab: 0.1, windDeg: 0 },
      matStack: { fines: 0, rock: 1, ice: 3, scale: 3.0, amp: 0.3 },
      brdf: { regolithW: 0.7, surgeHs: 0.08, surgeB0: 0.4, iceSSS: 0.4, iceSpec: 0.12, iceRough: 0.45, rockSpec: 0.04, rockRough: 0.6 },
      atmosphere: null,
    },
    {
      id: 'pluto',
      name: 'Pluto (nitrogen glacier + tholin uplands)',
      parent: 'star',
      GM: 8.6961382e11,
      skyHidden: true, // standalone: never rendered in another body's sky (keeps legacy skies byte-identical)
      R: 1_188_300,
      orbit: { a: 39.48 * AU, periodDays: 90560, phase0: 4.1 },
      spin: { tiltDeg: 57, periodH: 153.3, phase0: 0.0 }, // 6.39-d rotation (independent, correct)
      seaLevel: null,
      maxBakeLevel: 15,
      discAlbedo: [0.52, 0.45, 0.40], // mixed bright-N2 / dark-tholin hemisphere
      ambientAlbedo: 0.42,            // lower than Europa: preserve tholin-vs-glacier contrast
      camera: { lon: 155, lat: 18, alt: 800_000 },
      processes: [
        { type: 'continents', levels: [0, 3], amp: 2200, freq: 1.05, warp: 0.45, oceanBias: 0.55, hurst: 0.9, dichotomy: 0.2, swell: 0.1, seed: 861 },
        { type: 'fbmBand', levels: [2, 10], amp: 600, hurst: 0.88, seed: 863 },
        // context BEFORE the ice-gated cryo bands (the pre-code pluto-order fix):
        // it writes the thermal ice field glacier augments and polygons/sublimation gate on
        { type: 'context', levels: [0, 15], tempEq: -228, tempPole: -238, lapse: 0, iceTemp: -232, seed: 867 },
        // NITROGEN GLACIER (Sputnik Planitia): authored closed-form basin — bright
        // N2 ice into the existing ice field (re-asserted every level, survives
        // context's overwrite) + a one-time floor flatten. dir faces the icon.
        { type: 'glacier', levels: [2, 15], dir: [-0.35, 0.42, 0.84], r: 780_000, iceK: 1.0, warp: 0.16, flatten: 0.88, floor: -1200, seed: 871 },
        // convection cells on the glacier, then contraction cracks (ONE polygon family)
        { type: 'polygons', levels: [4, 13], mode: 'convection', freq: 42, depth: 90, iceGate: 1.0, seed: 873 },
        { type: 'polygons', levels: [7, 14], mode: 'contraction', freq: 150, depth: 45, iceGate: 1.0, seed: 875 },
        // sublimation pits + blades oriented on the recipe mean-insolation axis
        { type: 'sublimation', levels: [10, 15], subLevel: 11, freq: 360, pitDepth: 30, bladeK: 0.5, bladeAxis: [1, 0, 0.2], seed: 877 },
        { type: 'craters', levels: [3, 13], density: 0.22, depthK: 0.24, complexR: 9000, rayK: 0.1, rayAge: 0.4, rayReach: 3, resurfK: 0.3, seed: 881 }, // ancient tholin uplands
        // THOLIN hemispheric province (Cthulhu Macula): dark equatorial longitude band
        { type: 'tholin', levels: [2, 15], lonCenter: 55, lonWidth: 95, latBand: 42, strength: 0.95, seed: 891 },
        { type: 'thermal', levels: [8, 15], iters: 2, talusDeg: 33, rate: 0.15, seed: 893 },
        { type: 'materials', levels: [0, 15], rockSlopeDeg: 33, seed: 895 },
        { type: 'ao', levels: [2, 15], k: 0.4, seed: 897 },
        { type: 'horizon', levels: [2, 12], reach: 2 },
      ],
      palette: {
        dust: [0.55, 0.48, 0.42],   // MUST match discAlbedo (bakeDiscMap reads dust/rock)
        dustVar: [0.60, 0.53, 0.46],
        rock: [0.48, 0.42, 0.38],
        ice: [0.90, 0.88, 0.82],    // bright nitrogen ice (Sputnik/Tombaugh)
        tholin: [0.16, 0.09, 0.06], // dark red-brown Cthulhu tholin (round-18 cryo albedo)
        oceanShallow: [0, 0, 0], oceanDeep: [0, 0, 0],
      },
      ground: { jointS: 0.5, jointK: 0.15, jointAng: 0.5, jointTab: 0.12, windDeg: 0 },
      matStack: { fines: 0, rock: 1, ice: 3, scale: 3.0, amp: 0.4 },
      brdf: { regolithW: 0.8, surgeHs: 0.07, surgeB0: 0.5, iceSSS: 0.35, iceSpec: 0.08, iceRough: 0.5, rockSpec: 0.03, rockRough: 0.65 },
      atmosphere: null,
    },
  ],
};

// Phase K: fail named schema/GM/parent errors at recipe load, before a renderer
// or worker tears down live state. The demo remains entirely on legacy branches.
assertMechanicsSystem(SYSTEM);

export const bodyById = (id, system = SYSTEM) => system.bodies.find((b) => b.id === id);

// recipe load assert (round 16, pre-code panel saturn-palette-crash): bakeDiscMap
// reads palette.dust/rock UN-defaulted (bakecore.js), so a body missing them throws
// a bare TypeError deep in the worker bake instead of a named error at load. Turn
// the two latent traps into actionable asserts, alongside assertCloudRecipe.
export function assertPaletteRecipe(body) {
  const p = body.palette;
  if (!p || !Array.isArray(p.dust) || !Array.isArray(p.rock)) {
    throw new Error(`recipe: body '${body.id}' needs palette.dust and palette.rock (bakeDiscMap reads them un-defaulted)`);
  }
  if (body.seaLevel != null && (!Array.isArray(p.oceanShallow) || !Array.isArray(p.oceanDeep))) {
    throw new Error(`recipe: body '${body.id}' has seaLevel but no palette.oceanShallow/oceanDeep`);
  }
  if (p.vegCold && !body.processes?.some((q) => q.type === 'context')) {
    throw new Error(`recipe: body '${body.id}' sets palette.vegCold but has no 'context' process (bakeDiscMap reads its climate)`);
  }
  // round 18 (cryo pack): the lineae/tholin consumers read palette.linea/tholin
  // UN-defaulted in TERRAIN + bakeDiscMap — the saturn-palette-crash class. A
  // body that stamps them but omits the colour throws a named error at load.
  const has = (t) => body.processes?.some((q) => q.type === t);
  if (has('lineae') && !Array.isArray(p.linea)) {
    throw new Error(`recipe: body '${body.id}' has a 'lineae' process but no palette.linea (the fracture-albedo colour)`);
  }
  if (has('tholin') && !Array.isArray(p.tholin)) {
    throw new Error(`recipe: body '${body.id}' has a 'tholin' process but no palette.tholin (the dark-province colour)`);
  }
  for (const proc of body.processes ?? []) {
    if (proc.type === 'tholin' && !['longitude', 'polar'].includes(proc.placement ?? 'longitude')) {
      throw new Error(`recipe: body '${body.id}' tholin.placement must be 'longitude' or 'polar'`);
    }
    if (proc.type === 'context' && proc.insolation) {
      if (!(proc.insolation.referenceA > 0)) throw new Error(`recipe: body '${body.id}' context.insolation.referenceA must be > 0`);
      if (body.parent === 'star' && !(body.orbit?.a > 0)) {
        throw new Error(`recipe: body '${body.id}' uses insolation context but has no authored heliocentric orbit.a`);
      }
    }
  }
  return true;
}

// round-17 figure scope law (§6 load assert, sibling of assertPaletteRecipe /
// assertCloudRecipe): a figure body is airless and dry THIS round — every render
// path it may not take is rejected by name, and only processes with figure-true
// metric/displacement semantics are allowed. The whitelist is the honest edge of
// what round 17 generalized; round 18 (cryo pack) widens it.
const FIGURE_PROC_WHITELIST = new Set([
  'continents', 'fbmBand', 'craters', 'context', 'thermal', 'materials', 'ao', 'horizon', 'catena',
]);
export function assertFigureRecipe(body) {
  const f = body.figure;
  if (!f) return true;
  if (f.type === 'ellipsoid') {
    if (!Array.isArray(f.axes) || f.axes.length !== 3 || f.axes.some((a) => !(a > 0))) {
      throw new Error(`figure(${body.id}): ellipsoid needs axes:[a,b,c] > 0`);
    }
  } else if (f.type === 'lobes') {
    if (!Array.isArray(f.lobes) || f.lobes.length !== 2) {
      // the GLSL twin hard-codes two lobes (uLobeC0/uLobeA0/uLobeC1/uLobeA1) — a
      // longer list would bake N lobes but RENDER two (M5: no silent caps)
      throw new Error(`figure(${body.id}): lobes.length must be exactly 2 (the GLSL twin's cap)`);
    }
    if (!(f.neckK > 0)) throw new Error(`figure(${body.id}): lobes needs neckK > 0 (the smin fillet radius)`);
    for (const L of f.lobes) {
      if (!Array.isArray(L.c) || L.c.length !== 3 || !Array.isArray(L.axes) || L.axes.length !== 3 || L.axes.some((a) => !(a > 0))) {
        throw new Error(`figure(${body.id}): each lobe needs c:[x,y,z] and axes:[a,b,c] > 0`);
      }
    }
  } else {
    throw new Error(`figure(${body.id}): unknown type '${f.type}' (ellipsoid | lobes)`);
  }
  if (!(f.reliefBudget > 0)) {
    throw new Error(`figure(${body.id}): reliefBudget (metres) is required — the injectivity preflight and the fixture measure against it`);
  }
  if (body.atmosphere) throw new Error(`figure(${body.id}): atmosphere on a figure body is round 18+ (airless scope law)`);
  if (body.seaLevel != null) throw new Error(`figure(${body.id}): seaLevel/ocean on a figure body is round 18+ (dry scope law)`);
  if (body.clouds) throw new Error(`figure(${body.id}): clouds on a figure body is round 18+`);
  if (body.aurora || body.clouds?.lightning) {
    throw new Error(`figure(${body.id}): night emission on a figure body is round 18+ (emission paths key radial up/alt)`);
  }
  if (body.rocks || body.formations) {
    throw new Error(`figure(${body.id}): rocks/formations on a figure body are round 18 (scatter anchors reconstruct radially)`);
  }
  for (const p of body.processes) {
    if (!FIGURE_PROC_WHITELIST.has(p.type)) {
      throw new Error(`figure(${body.id}): process '${p.type}' is not figure-generalized (round-17 whitelist: ${[...FIGURE_PROC_WHITELIST].join(', ')})`);
    }
  }
  return true;
}

// round 18 — Phase 6 giant/ring schema asserts (M5 no silent caps). The giant
// look is a SINGLE shader uniform set + the ring is a fixed unrolled ≤4-gap
// profile, so >1 giant body or >4 gaps would silently misrender; throw by name.
// Wired into the load path (switchBody) and the bench render check, not test-only.
export function assertGiantRecipe(body) {
  const g = body.giant;
  if (!g) return true;
  if (!Array.isArray(g.bands) || g.bands.length < 2 || g.bands.length > 8) {
    throw new Error(`giant(${body.id}): giant.bands must be 2..8 sin-lat knots (the shader blends a fixed 8, unrolled)`);
  }
  for (const b of g.bands) {
    if (!(typeof b.s === 'number') || !Array.isArray(b.c) || b.c.length !== 3) {
      throw new Error(`giant(${body.id}): each band needs { s:sinLat, c:[r,g,b] }`);
    }
  }
  if (!(g.limbExp > 0)) throw new Error(`giant(${body.id}): giant.limbExp must be > 0 (pow base guard)`);
  return true;
}
export function assertRingRecipe(body) {
  const r = body.rings;
  if (!r) return true;
  if (!(r.inner > 1) || !(r.outer > r.inner)) {
    throw new Error(`ring(${body.id}): rings.inner > 1 and rings.outer > inner (planet radii)`);
  }
  if (r.gaps && r.gaps.length > 4) {
    throw new Error(`ring(${body.id}): at most 4 gap notches (the shader unrolls exactly 4 — M5 no silent caps)`);
  }
  if (Math.abs(r.fscatterG ?? 0) >= 1) {
    throw new Error(`ring(${body.id}): |rings.fscatterG| must be < 1 (HG phase base ≥ 0)`);
  }
  return true;
}
// Phase C co-visible-set checks: system cardinality is data; fixed per-profile
// knot/gap caps remain asserted for every body in the resolved set.
export function assertGiantSystem(system = SYSTEM, coVisible = system.bodies) {
  // Phase C carries one giant profile PER resolved slot. Any number may exist in
  // the loaded system; callers may pass the <=K resolved set for a named guard.
  for (const body of coVisible) assertGiantRecipe(body);
  return true;
}
export function assertRingSystem(system = SYSTEM, coVisible = system.bodies) {
  for (const body of coVisible) assertRingRecipe(body);
  return true;
}

// star irradiance (relative radiance units) at orbital radius a — CONCEPT §10:
// inverse-square arithmetic, never authored brightness.
export function irradianceAt(a, system = SYSTEM) {
  return system.star.irradianceAt1AU * (AU / a) * (AU / a);
}
