# Round-6 adversarial critique panel — results (run in round 7)

The full multi-lens adversarial panel (`test/visual-critique.workflow.js`) that
was cut short in round 6 by the account spend limit, re-run in round 7 over the
round-6 tree (`bench/baseline/stills`, tag `round-6`). 65 agents, 0 errors, 5
lenses × find → 2-skeptic verify. **23 confirmed findings (≥2 votes)** + 4
softer. These are the queue for the rounds below — none is a round-7 regression
(round 7 shipped no world content; the render path for non-photo scenes is
bit-unchanged). Honest note: round 6's abbreviated main-loop review
(7 BETTER / 3 UNCHANGED) missed most of this; the full panel is the real signal.

## Confirmed (by scheduled home)

### Airless-body shading — the biggest cluster (Phase 1 photometry, round 9; + round-6 residue)
The round-6 material stacks and cavity maps assume ambient/sky fill. On airless
Luna `gndV≈0`, so micro-hollow bump normals and cavity pockets clamp Lambert to
pure black — **re-creating a speckle/pockmark look on Luna specifically**, an
honest partial-regression on round 6's "speckle carpet removed" claim (it holds
on Tellus, where atmosphere fills).
- **[HIGH] Luna eye-level ground = hard black-pepper speckle carpet.** f2/f3 bump
  octaves (0.5 m/0.125 m) aren't amplitude-antialiased; each sub-pixel pit
  posterizes to a black speck with no fill. Fix: airless MS/sky fill floor +
  roll off f3/f2 bump amplitude with fwidth before it aliases.
- **[MED] Luna boulders = smooth clay domes + isolated hard-black cavity blotches.**
  `albedo *= 1 - 0.30*cav` with no fill drives cavity to 0. Fix: same fill floor
  on the rock path + lift the damped mottle.
- **[MED] Airless shadows crush to information-free #000** (no regolith bounce).
  The one-bounce fill (coeff 0.45, gated by gndV) is too weak. Fix: raise coeff
  for airless bodies, weight by sunlit-neighbour view factor from the horizon
  field, not open-sky fraction. (This is the registered "terrain-bounce
  illumination" Phase 1 item, now measured.)

### Rock scatter / placement (recipe data + Phase M scatter, rounds 8/11)
- **[HIGH] Luna "boulderfield" reads as a pockmarked plain, not boulders.**
  `denFloor:0.22` floods every lattice cell with sub-decimetre clasts, and Luna
  rock albedo [0.20] ≈ dust [0.26] so tiny clasts contribute only a shadow pixel.
  Fix: cut Luna denFloor (~0.22→0.08), raise near-camera visible size floor,
  give rock crowns slightly higher albedo / stronger surge.
- **[HIGH] Hard flat panel/wedge + rectangular LOD patch in the near field**
  (pavement-walk-luna right third, boulder-macro-luna left). A foreground tile
  rendered flat/at-parent-LOD beside a displaced neighbour, or a scatter patch
  not clipped like its neighbours — a straight-edged near-field seam. Related to
  the registered mixed-depth three-band-allocation seam. → Phase M near-field LOD.
- **[MED] Oblate "pancake/puck" clasts lie flat** — `sy` floor 0.6 vs sx/sz ~1.3
  yields 2:1 oblate ellipsoids that settle as discs. Fix: raise sy floor (~0.75)
  or couple to sx/sz; reserve flat profiles for the slab archetype.

### Atmosphere / photometry (Phase 1, round 9)
- **[HIGH] Bright green fringe on every twilight limb/terminator**
  (night-hemisphere, crescent-limb, terminator-split). Ozone Chappuis absorption
  isn't reaching grazing columns: `ozoneSecJS` returns 0 for above-shell chords
  and the MS table cuts off at `MS_MU0=-0.4` where deep twilight lives. Fix:
  extend ozoneSec to above-shell grazing chords, lower MS_MU0 / raise green
  ozone beta. (Ties to the registered aerial-perspective / MS-LUT residual.)
- **[HIGH] Rubra "blue sunset" has no blue near the sun.** The intended
  wavelength-split Mie aureole isn't surviving bloom/exposure or the blue
  Rayleigh is too weak vs dust Mie. Fix: verify pre-bloom, soften the sun PSF,
  lift blue Rayleigh / blue forward-scatter weight.
- **[MED] Rubra daytime sky collapses to near-black zenith + inverted dark
  horizon band.** Dust in-scatter falls off too steeply above the horizon (Hm
  too small / MS+ground-bounce underpowered). Fix: raise aerosol scale height +
  ground-albedo bounce so the whole dome fills butterscotch.
- **[LOW] Terminator drops straight to black (no warm twilight sliver);
  razor-thin red limb line; sun/limb blow to colourless white** — all the same
  low-mu_s MS cutoff + limb-blend + forward-scatter-tint family.

### Ocean (Water v2, round 10)
- **[HIGH] Diagonal texel-grid crosshatch on the ocean from orbit** (blue-marble).
  Per-texel bathymetry quantization shows through as a weave. The round-3
  "checkerboard FIXED" claim is only half true — a residual grid survives. Fix:
  linear-filter the bathymetry channel, upsample/smooth the seabed field or
  bicubic fetch.
- **[HIGH] Sun glint = soft round bloom, not specular glitter** (open-ocean-glint,
  blue-marble). GGX roughness clamped very broad + folded slope variance smears
  the lobe into a haze disc. Fix: tighten the specular lobe near nadir, add
  high-frequency slope modulation for glitter.
- **[MED] Open ocean at altitude = featureless blue gradient** indistinguishable
  from sky (waves faded out, deep base overwhelmed by in-scatter). Fix: keep a
  residual folded slope-variance sheen through the wave fade.
- **[MED] Low-altitude "ocean" scenes contain no water** (beach-eye,
  shoreline-graze, coast-400km framed over land). → Re-pose/re-seed these casting
  poses so a waterline is in frame (a bench/scenes.json fix, cheap).

### Cross-altitude consistency (Phase M, round 11)
- **[HIGH] Exposure whiplashes down the descent** — one site reads
  pale→tan→near-black→pink→beige because the meter keys off frame composition
  (disc-on-black vs full-frame ground). Fix: cross-frame exposure continuity
  keyed to absolute radiance/sun-geometry, rate-limit the servo, weight by
  lit-surface radiance not frame-fill.
- **[HIGH] Surface hue + water/greenery don't survive the descent** — orbital
  blue-marble (blue lakes, green patches) → waterless red → uniform beige, with
  no transition and non-continuous base tone. Fix: reconcile the far-field
  fold-to-mean colour and the orbital discAlbedo proxy with the actual ground
  material stack; carry water bodies into the near-ground material.
- **[HIGH] Ground relief pops in at a hard altitude radius** — flat plain
  5 km→300 m, then dunes + boulders switch on together at 80 m. Fix: extend
  meso/dune displacement continuously through the 300 m–5 km band; raise + cross-
  fade the rock activation radius. (Round-6 meso is gated near-ground.)
- **[MED] Rectilinear white lattice blotches on the disc at 5,000 km** — an
  unrotated integer-lattice value-noise octave aliasing at one LOD. Fix: domain-
  warp/rotate that octave.
- **[MED] Faceted terrain horizon silhouette** (5 km–80 m) — tile tessellation /
  skirt quantization at the limb. → registered silhouette/skirt rework.
- **[MED] Luna disc-to-ground handoff loses maria + contrast** — disc shows
  two-tone maria + crisp craters, ground is uniform low-contrast grey. Fix: carry
  the mare/highland albedo split + crater contrast into the near-ground material.

### Low impact
- **[LOW] Aliased sawtooth terrain silhouette** against the sky (ground pass edge
  AA / skirt). → silhouette/skirt rework.

## Softer (1 vote — watch, not yet actioned)
- Tellus rocks read as cold-grey pasted-on objects with no ground contact.
- Cavity/dark map overshoots into solid-black "hole" blotches on boulders.
- Tellus/desert bootprint ground has no micro-relief — smooth plasticine blur.
- Shoreline shows no shallow-water band or foam line from orbit.
