# Round-14 adversarial critique panel — results + dispositions

Multi-lens panel (Workflow) over the round-14 sweep (`bench/out/stills`, 69
scenes + the merged settled re-renders) vs the **same-day git-stash-A/B
round-13 baseline** (`bench/baseline/stills`): 7 lenses (formation-fusion /
impostor-handoff / sculpt-silhouette / r6-luna-face / moiré-residues /
two-body-overfit / regression-sweep) × find → verify, finders on **Opus**,
skeptics on **Sonnet** (standing rule 1). **29 agents, 0 errors; 22 verified
findings → 1 CONFIRMED HIGH mechanism failure fixed in-round (with a second
HIGH that shared its root cause), 4 more fixed in the post-panel batch, 1
REFUTED, the rest adjudicated pre-existing / registered.**

## The headline: the panel caught what every probe missed

- **[HIGH, MECHANISM-FAIL, CONFIRMED] Formations floating in the sky on
  rubra-canyon-dawn** — hoodoos/outcrops rendered above the horizon, detached,
  "shadow discs cast onto empty air" (pixel-verified: sky→body→sky→horizon
  banding at x=690). ROOT CAUSE (driver, post-panel — found by measurement,
  three hypotheses deep): `applyCamera` positions `t.rocks` camera-relative
  every pass but `t.forms` was never added — formation groups rendered their
  tile-centre-relative instance matrices from the group ORIGIN, displaced by
  the whole centre vector. The live instance walk was the tell: every anchor
  measured at sane terrain heights (233–779 m) and no instance subtended
  > 0.02 rad, yet 150 px columns stood in frame — the GPU was not drawing
  where the CPU thought. A `debris:false` bisect pinned the class; the one
  missing line fixed it. **Two secondary holes found on the way and also
  fixed**: the early-hide loop reset `t.rocks.visible` but not `t.forms`
  (stale tiles could keep formations visible), and the settle predicate's
  formation-wave cost (the time-boxed drain). All formation-bearing scenes
  re-rendered SETTLED with the fix; the skeptic's "pre-fix geometry shipped
  here" narrative was the right FACT with the wrong mechanism.
- **[HIGH + MED + LOW, one root cause, CONFIRMED] Formations render
  near-black/unlit** (overhang-gallery outcrop + calved debris vs fully
  sunlit boulders in the same frame; canyon-dawn dark masses). ROOT CAUSE:
  the formation meshers' face winding was INWARD — measured outward-normal
  fraction 0.06–0.12 (rocks: ~1.0). mu0 = dot(n,sun) clamped to 0 on every
  lit face; only ambient survived. The one orientation test mesh-test ran on
  rocks was never applied to formations. **Fixed in-round** (winding flipped:
  outcrop 0.94 / hoodoo 0.88 outward — the remainder is the undercut's real
  concavity; the outwardness check added to mesh-test for formations),
  scenes re-rendered.
- **[MED, CONFIRMED] Black footing bars clipping the sunlit sand** — on a
  slope the downhill base pedestal surfaced as a straight-sided bar.
  **Fixed in-round**: slope-aware burial (burial += min(0.3, slope·0.5),
  slope already computed at the anchor in listFormations).
- **[MED, CONFIRMED] K2 bedding invisible + hoodoo lit faces ~2× host
  terrain** (zero bed crossings at ±0.07 effective amplitude; lum 0.67 vs
  0.31, partly physical — dawn grazes the ground while vertical faces catch
  full sun — but the cream tone read as a prop). **Fixed in-round**: bed-tone
  amplitude 0.14→0.32 with the sub-octave weighted up, vShade trimmed
  0.85–1.15 → 0.72–0.98. Re-rendered; the K2 probe target (≥2 visible
  crossings) re-judged on the new stills.
- **[LOW→fix, CONFIRMED] beach-eye dark mottled band on mid-distance dunes**
  — the biome/wetness magnification fade leaked: atlas texels are already
  screen-magnified at MID range, so the widened `wet` remap darkened
  mid-field dunes. **Fixed in-round**: the gate tightened to true extreme
  near-field magnification (tpx 0.15–0.45 → 0.03–0.12); far/mid-field
  recovers the exact round-13 edges.

## R6 adjudication

- **[MED, MECHANISM-FAIL, CONFIRMED] R6 unwitnessed by the still bench** —
  no frame showed the newly flooded mascon basin (moon-sizes is gibbous, the
  basin sits at lat 68.9 lon −120.7; luna-wrinkle-mare poses at the OLD
  mare). DISPOSITION: a first-light witness scene `luna-mascon-basin` added
  (breakpoint tier, posed at the forEachBasin site, provenance in the note).
  The mechanism itself was Node-witnessed all along (tect-test co-location +
  coverage rows; the R6 probe).
- **[MED, CONFIRMED] The r6-basin-mare expected-delta control was
  byte-identical (unfalsifiable exemption)** — its pose didn't resolve the
  basin. DISPOSITION: correct behaviour, weak witness — the exemption
  remains sound (it pre-classifies by CLOSED-FORM overlap, never metrics),
  and the new witness scene carries the visual burden instead.

## Impostor / sculpt adjudication

- **[LOW ×2, CONFIRMED] The Luna L14 band fix VERIFIED working** — the
  previously-empty band now carries boulders; the flip side reads as a
  uniform far-field stipple blanket to the horizon crest. REGISTERED:
  band-density calibration at extreme grazing (an angular fade or SFD-aware
  floor — needs design, not a blind tune).
- **[MED, REFUTED]** "impostor band packs discrete boulders with no
  roughness handoff" — the skeptic traced the population to the mesh rung's
  own draw at those ranges; the fold behaves per the law.
- **[MED, CONFIRMED, trade documented] Decimated Luna boulders lose interior
  crater/pit micro-detail and brighten** (+ [LOW] a knife-edge hero rock
  rounded). The decimation spends triangles on silhouettes; interior facet
  VARIANCE drops at the 320/80-tri tiers (the limit-surface map preserves
  normals, not facet-scale variance). REGISTERED as the explicit trade the
  round chose: silhouettes (the registered residue) won; interior micro-
  relief detail returns via the octa-map cavity/mottle channel (a look tune)
  or higher mid-LOD budgets once the WebGPU checkpoint re-prices vertices.
- **[MED, CONFIRMED] pavement-walk-luna breccia identity softening** — same
  decimation trade, Luna-specific character loss adjudicated MILD (the
  angular archetype mix and burial conventions carry the identity).

## Moiré / regression adjudication

- **[MED, CONFIRMED] rubra-dune-sea near-field striation +30%** — the
  localShadow texel-footprint fade removed the map's sampling noise that had
  DITHERED the pre-existing meso-facet grazing striation (round-9 family);
  the AA unmasked it, exactly as round 13's resurfacing unmasked the joint
  moiré. REGISTERED to the striation family (rule 2: no blind counter-tune).
- **[SOFTER] overhang-gallery contour banding** — grazing terracing moiré on
  smooth sand, the same family; registered.
- **[LOW, PRE-EXISTING] Luna near-field joint webbing** byte-unchanged —
  correctly untouched by the AA (it keys on footprint, not proximity).
- **[MED, CONFIRMED, adjudicated] control-6 whole-disc drift** (dark Rubra
  crescent at 16,281 km; shadow_frac 0.908→0.869 on a DEGENERATE p95=0
  denominator; dmean 0.000): no round-14 code path is live at that scale
  (formations cull by floor law; joints/wetness/shadow-map inert; Rubra R6
  structurally off) — the dark-frame metering/star-noise family (same class
  the panel confirmed LOW on controls 0/7). Quality-neutral, registered.
- **[LOW, CONFIRMED] coast/waterline edge-AA aniso swings ±20%, quality-
  neutral** — registered to the shoreline family.
- **[LOW, MECHANISM-FAIL, CONFIRMED] the two-body gate is only PARTIALLY
  bench-testable for formations** — no ground-level Tellus outcrop scene
  exists (the locator verified real sites; the Rubra/Tellus recipe agents
  differ by data). REGISTERED: a tellus-tor scene next round.

## Panel-confirmed positives

- The four drain-fix re-rendered Rubra scenes are clean: formations
  grounded, contacts honest.
- The L14 boulder band populates where round 13 was empty (the register's
  residue demonstrably closed).
- Ocean/coast/biome/seasonal scenes: no regressions beyond the adjudicated
  quality-neutral families; the far-field biome edges byte-recover.
- The control gate: dmean 0.000 across all 8 same-day controls.
