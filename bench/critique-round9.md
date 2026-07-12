# Round-9 adversarial critique panel — results + dispositions

Full multi-lens panel (`test/visual-critique.workflow.js`) over the round-9
sweep (`bench/out/stills`, 61 shots): 5 lenses (airless / eclipse-disc /
photometry / routing-residue / regression) × find → 2-skeptic verify, finders on
Opus, skeptics on Sonnet (standing rule 1). **53 agents, 0 errors, 14 confirmed
(2 votes) + 5 softer.** The panel earned its keep: it caught two real round-9
REGRESSIONS the driver missed, and separated them from the pre-existing /
registered defects. Dispositions below.

## Fixed in-round (the post-panel batch)

- **[HIGH] lunar-eclipse-ground read as bright neutral noon — no umbral
  darkening, zero copper.** A round-9 REGRESSION from the new isotropic airless
  ambient floor: the floor keyed on geometric sun elevation (`sinEl`), never on
  occluder visibility, so during totality it stayed at full daytime value and
  both kept the ground bright AND washed out the copper the eclipse-gated
  direct/bounce terms were adding. Fix: the airless ambient now multiplies by the
  sun visibility carried in `TsRaw` (`soft·vis` on airless; ~0 in the umbra), so
  the floor collapses under the occluder and the copper ring becomes the dominant
  remaining illuminant (terrain + rock frags).
- **[HIGH] Blocky black/white band at macro/near range on Luna and Rubra** — the
  panel attributed this to round-9's slope-scaled shadow bias. PARTLY right: the
  slope-scaled bias WAS a mistaken addition (it was never the fix for the leopard
  carpet — that is direct-term meso-facet self-shadow — and it can worsen
  near-ground map acne), so it was REVERTED to the round-8 fixed bias. But the
  band the panel pointed at (boulder-macro-rubra's distant-bench dither) sits
  BEYOND the ~35 m metre-scale-shadow-map box, so it is not the map at all — and
  the round-8 baseline still shows it PIXEL-FOR-PIXEL identical (baseline A/B).
  So the band is PRE-EXISTING: the grazing meso-facet self-shadow at a distant
  bench, the same registered class as the airless carpet — a THIRD mis-attribution
  of that family, caught by the baseline A/B. Routed to Phase-M filtered normals
  (round 11), not fixed this round.
- **[MED] Eclipse ring blazed as an annular "ring of fire", not a dim copper
  totality.** The honest annulus integral's geometric-dilution amplitude was too
  hot; tuned down (42→15 × refractivity) so Tellus's ring sits well below the
  star-field exposure as a dim copper glow.
- **[softer] Wind ripples read as a cross-hatched DIAMOND lattice, not
  directional trains.** A round-9 REGRESSION: the anisotropic train envelope
  sampled the wrapped `vnoise` on a stretched 2-D lattice → a diamond cross-hatch
  (worse than the round-8 "isotropic grit"). REVERTED to the round-8 ripple.
  Coherent along-wind trains need a 1-D noise or a real bedform system — routed
  to Phase-2 "coherent bedform systems" (round 12).

## Registered — pre-existing, harder, or a registered residual (NOT round-9
regressions to fix in-round)

- **[HIGH] Lit Luna regolith reads as a low-contrast near-white band; shadows
  crush to ink-black (bimodal, no midtones) — two-body FAIL vs Rubra/Tellus.**
  The round-9 surge shoulder holds the hard 255-clip (measured clip≥250 = 0.0%),
  but the L-S kernel is near-flat on a plain and the exposure servo pushes lit
  regolith to a ~233 plateau with no relief modeling, while the fill leaves
  shadows thin. This is the airless high-contrast / exposure balance — genuinely
  hard (real Apollo frames are bimodal too). Round 9 improved it (surge shoulder,
  eclipse-gated floor, grazing bounce) but the midtone/contrast balance +
  macro-shading on flat plains is the continued airless-photometry installment.
  Rule 2: not a blind exposure re-tune this round.
- **[HIGH] Stars burn through solid foreground terrain (luna-knife-edge).** A
  PRE-EXISTING gap: the star layer composites additively after the post pass with
  no terrain depth test, occluded only by the datum sphere — relief above the
  horizon (boulders, rims) never culls stars. Round-9 star-occlusion ADDED disc +
  sun occlusion (a net improvement); terrain star-occlusion needs the depth
  buffer or a horizon-field lookup in the star pass → Phase-M (round 11).
- **[HIGH] Tellus day disc over-exposed vs Luna/Rubra — washes to milky
  low-contrast near-white, continents featureless.** Pre-existing: the auto-meter
  log-averages the black-sky surround and pumps exposure until the disc bulk
  saturates (the p99≤0.92 protection is too weak for a disc whose bulk sits below
  the top 0.3%); the Rayleigh veil over high land albedo desaturates it. Metering
  / disc-exposure work (whole-disc + camera metering), not a round-9 regression.
- **[HIGH] Black-frame auto-exposure hard-clips a lit strip to pure white
  (luna-terminator).** The same black-surround metering behaviour as the Tellus
  disc — a lit subject on a black frame over-exposes. Camera-metering residual.
- **[HIGH] Luna close-range macro destroyed by a blown mega-facet over an
  ink-black lower half (boulder-macro-luna, pavement-walk-luna).** Two causes,
  both registered: the camera pose clips into a near-field facet (black lower
  half = eye below the local surface — a bench scene-spec refinement), and the
  facet blows to the ~233 plateau (the airless contrast item above). The grazing
  meso-facet leopard is the round-11 filtered-normal fix.
- **[HIGH] The new cliff-bench scene pair shows no dramatic cliff/benches on
  either body.** The scenes exercise the strata process, but the poses look down
  a plain where benches read as subtle contours rather than at a scarp face
  edge-on. Framing refinement (find a scarp-facing pose) is a Phase-T tuning-loop
  task; not a former failure.
- **[MED] Razor vertical brightness seam bisects the lit lunar limb.** The
  pre-existing cross-face tile seam (registered), visible on Luna orbital stills.
- **[MED] Catena fines-ponds don't read (crater floors not lighter/smoother).**
  The fines-pond albedo tint fires only where the baked fines field is high on a
  flat, which is rare (catena fills curvature hollows, not depositional flats) —
  the same fines-field-distribution gap as the retired fines-floor idea; ties to
  round-12 bedform/deposition work.

## Softer (1 vote — watch)
- Airless shadow fill too thin (Luna shadows crush while Rubra/Tellus carry fill)
  — the contrast half of the bimodal item above.
- Transit penumbral dot barely reads against the over-bright Tellus disc — the
  Tellus disc-exposure item.
- Hard diagonal seam in aerial perspective on Tellus dawn — the registered
  cube-edge / MS aerial-perspective residual.
