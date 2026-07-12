# Round-12 adversarial critique panel — results + dispositions

Multi-lens panel (`bench/critique-round12.workflow.js`, run via the Workflow
tool) over the round-12 sweep (`bench/out/stills`): 5 lenses (oriented-
structure / bedforms / singularity-disc / two-body-overfit / regression) ×
find → 2-skeptic verify, finders on **Opus**, skeptics on **Sonnet**
(standing rule 1). **31 agents, 0 errors; 13 raw findings → 3 confirmed
(2 votes), 4 softer (1 vote), 6 refuted.** The A/B baseline was the round-11
build re-rendered the SAME DAY (git-stash A/B), so the date-seeded control
gate compared like-for-like: all 8 controls dmean 0.000.

## The headline: the negative control survived direct attack

- **[HIGH, claimed REGRESSION — REFUTED 2-0] "Aeolian dune field rendered on
  windless Luna" (pavement-walk-luna).** The two-body-overfit lens fired at
  exactly the invariant it was built to test — and both skeptics killed it
  independently: (1) code-level — `procBedforms` hard-gates on the body's
  `global.wind` entry and Luna has no `global` process at all ("the negative
  control is structural"); one skeptic ran `test/tect-test.mjs` (all checks
  green, including Luna-highlands byte-identity with tect removed); (2)
  pixel-level — the called-out foreground is byte-identical to the round-11
  baseline; the only changed region is a distant ridge (tect band content).
- **["Wrinkle ridges read as scratches/rays" (luna-wrinkle-mare), split
  1-1 → softer.]** BOTH skeptics traced the lineations to their true source:
  the round-4 CRATER-RAY system — fans converging on specific source-crater
  rims (structure-tensor vanishing-point analysis + per-crater seed code
  audit). Rays crossing the maria is correct stratigraphy (Tycho's rays do).
  The honest residue: the round-12 wrinkle ridges (bake-verified at ~60 m in
  the mascon) are too subtle to READ at this pose against the ray field —
  ridge legibility (amp/seg/light) is a rule-3 data tune, round 13.

## Confirmed — registered

- **[MED] luna-wrinkle-mare: rectangular lower-detail patch with straight
  seams.** Real and verified twice (edge-detect + Laplacian energy maps):
  one coarse tile displayed among finer neighbours. This is the round-11
  honest scheduler's cache-bound equilibrium, not a round-12 mechanism: the
  pose desires 865 tiles against the 800 cap (stats), so the uniform-SSE
  display legitimately keeps a coarser ancestor somewhere. Registered as the
  "over-budget pose" class — grows relevant as content deepens; the real fix
  ladder is round-14 impostors / round-15 budget growth, not thrashing the
  cap for one scene.
- **[LOW] beach-eye grazing cross-hatch moiré** — pixel-identical in the
  round-11 baseline (skeptics diffed): the pre-existing grazing ripple-
  aliasing family (joins the registered grazing-streak rows).
- **[MED] blue-marble ocean square-lattice + blocky coastlines** —
  pixel-identical in baseline; the registered orbital ocean quad-grid family.

## Softer (1 vote) — registered as data tunes

- **[MED] tellus-megadunes read busier than "subtle banding"** (one skeptic:
  clear sinuous S-curves; the other: subtle at native contrast). Megadune
  aspect/defAmp calibration — round 13 data.
- **[LOW] rubra-disk washed out at phaseDeg 20** — near-full illumination
  collapses shading; the face carries on albedo alone (rift scar clear,
  provinces faint). Icon lighting + scourK/mantleK contrast are recipe/scene
  data — round 13.
- **[LOW] crater-rim-walk dither patch** — byte-identical to baseline
  (pre-existing family).

## Refuted

- rubra-disk "rectangular tile seams in the albedo provinces": the raw pixel
  grid at the claimed corner is uniform noise (215-218/255) — no edge exists.
- ocean-sunset-glint "5% sky dimming": a uniform full-frame shift including
  the sun halo — the auto-exposure metering the honestly-changed content
  (§10: that is its job); invisible in side-by-side.
- cliff-bench-rubra "stair-step rim": nearest-neighbour zoom artifact; the
  rim is smooth at native resolution in both frames.
- pavement-walk-luna "firefly speckle": max channel delta 3/255 vs baseline —
  pre-existing (the registered joint-crack sparkle family).

## Panel-confirmed positives

- Coherent transverse dune trains with slip-face asymmetry read at eye level
  (rubra-dune-sea), consistent with the G4 ripple direction (the bedforms
  lens's item (e) passed explicitly).
- The rift reads as a canyon SYSTEM at nadir (tapered, en-echelon); the
  reposed rubra-canyon-dawn icon stands on a real rim.
- No oriented-stamp lattice repeat, no packet-window seams, no dunes on
  steep/windward/wet terrain — the lenses hunting the round's own
  mechanisms came back empty on mechanism defects.
