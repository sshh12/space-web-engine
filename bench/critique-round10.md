# Round-10 adversarial critique panel — results + dispositions

Multi-lens panel (`bench/critique-round10.workflow.js`, run via the Workflow
tool) over the round-10 sweep (`bench/out/stills`): 4 lenses (water-glint /
material-substance / airless-respeckle / regression) × find → 2-skeptic verify,
finders on **Opus**, skeptics on **Sonnet** (standing rule 1). **18 agents, 0
errors, 5 confirmed (2 votes) + 2 softer.** The panel earned its keep: it caught
two real round-10 REGRESSIONS the driver's own probes had waved through, and it
independently CONFIRMED the headline water win — "the registered airbrushed
smooth-column defect is NOT present" (ocean-sunset-glint resolves into discrete
Cox-Munk glitter). Dispositions below.

## Fixed in-round (the post-panel batch)

- **[MED, REGRESSION] pavement-walk-rubra: duricrust plates read as faceted
  plastic, not granular substance.** A/B measured a ~33% drop in foreground
  edge-energy and lower patch std vs the round-9 baseline: replacing the round-6
  f2/f3 value-noise crease with the material stack (whose relief folds fast, by
  `matN`) LOST the fine intra-plate grain on the filled body. Fix: a light
  per-material f3-band grain is added back to `dH`, GATED to atmosphere-filled
  bodies (`uHasAtm > 0.5`) so it cannot re-pepper the airless frame — the stack
  carries the macro character (crack network, polygons), the grain carries the
  intra-plate texture, together = substance. Verified: the plates read as
  textured duricrust again.
- **[MED, REGRESSION] pavement-walk-luna: material relief added a diagonal
  comb + denser pepper to the airless near-field floor** (the skeptic's
  dark-spike density rose 4.32%→6.59% pre-fix). The harsh unfilled airless sun
  binarizes ANY micro-detail (the round-9 lesson): both the relief (self-shadow)
  and the albedo texture (grazing isotropic-mip aliasing) fed the carpet. Fix:
  the WHOLE stack is gated well DOWN on airless bodies — `matN ×0.15`,
  `matA ×0.4`, grain zeroed — since its substance there is marginal anyway
  (regolith fines are near-flat). Verified by instrumentation (rule 2): the mode-2
  NORMAL map of the near-field floor is now smooth (the material stack no longer
  contributes), and the dark-spike density in the bright floor ROI is back to the
  round-9 level (round-9 0.32% vs round-10-fixed 0.34%). The residual lit-frame
  comb+pepper is the PRE-EXISTING meso-relief direct-term self-shadow — the same
  round-9-registered item, routed to Phase-M filtered normals (round 11) — not
  the material stack.
- **[MED] coast-archipelago: foreground sea reads as brushed-metal corduroy, not
  broadband ripples.** The swell family (the 3 longest components) shared nearly
  one direction (the wind azimuth ±0.125 rad), so the resolved mid-field surface
  was a set of near-parallel long crests that converge to the sub-camera point in
  perspective — a "combed" look. Fix: the swell now arrives as 2–3 crossing trains
  from different bearings (directions spread ~1.0 rad, jitter widened 0.25→0.6),
  as real swell does. Reduced the structure substantially (grad-kurtosis 191→93)
  while the eye-level ocean-sunset-glint stayed excellent (crossing trains read as
  natural sea texture). Residual grazing streaking on the very-oblique overlook is
  partly inherent to viewing a wave field edge-on — registered, not chased.

## Registered — pre-existing or minor (NOT round-10 regressions to fix in-round)

- **[MED] crater-rim-walk: mid-ground regolith band reads as harsh hash/dither
  speckle.** Present identically in the round-9 baseline (skeptics measured it as
  actually HARSHER in round-9: mean|deriv| 14.1 → 6.3), so pre-existing, not a
  regression — the registered grazing meso-facet self-shadow, Phase-M round 11.
- **[LOW] crater-rim-walk: central foreground regolith radial corduroy.** A
  grazing streak on the near-field regolith; the airless-relief gate above softens
  the material-stack contribution to it. The core residual is the same registered
  grazing-facet family.
- **[softer, MED] blue-marble: orbital ocean quad-grid tiling lattice.** One
  skeptic REFUTED it as sub-visible quantization/dither (FFT/autocorrelation
  showed no coherent periodic peak; the "lattice" only appears after a NEAREST
  upscale + ~100× contrast stretch). Pre-existing (round-9 crop is pixel-identical
  bar one glitter pixel). The registered periodic-interference item; not worsened.
- **[softer, LOW] ocean-sunset-glint: faint horizon-line aliasing.** One skeptic
  refuted it as normal sub-pixel horizon rasterization (real AA blend pixels are
  present). Cosmetic; the same skeptic confirmed the glint itself is correctly
  resolved into discrete Cox-Munk sparkles.

## The headline positive (panel-confirmed)

The Cox-Munk glitter lands: on ocean-sunset-glint the glint is "discrete Cox-Munk
glitter sparkles (broken column plus scattered gold near-field puddles) — the
registered airbrushed smooth-column defect is NOT present." The broadband
spectrum shows no tiling from orbit that survives adversarial scrutiny.
