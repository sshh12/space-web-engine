# Round 17 — critique panels (Phase 5 figure generality, Fable-driven)

## Pre-code adversarial panel (design attacked on paper, before any code)

12 finder agents (Opus) × one dimension each over the round-17 design
(oblate/triaxial domains, contact-binary reference SDF, per-cell metric
tensors, injectivity asserts, irregular-domain seam fixture), then Sonnet
skeptics per finding (2 per KILLER). **53 findings: 10 KILLER / ~20 HIGH /
rest MED.** Three split verdicts on the lobes flow map were adjudicated by the
driver with a decisive numerical experiment (scratchpad r17-flowmap-adjudicate
.mjs) — the round's central design was OVERTURNED on its evidence:

**The adjudication (the round's pivotal correction).** The design-as-written
parameterized the contact binary by a fixed-24-iteration Newton flow from the
bounding sphere. The finders claimed folds; one skeptic refuted (the cited
"fold" was a 1-D coordinate reversal — normal at any surface-of-revolution
equator, the signed Jacobian never flips), one confirmed (necking ⟺ fold).
The driver's harness settled it: the far-start Newton lands ON the surface
(residual 0) but NOT smoothly — **34% of cells got scrambled negative
determinants on every necking config** (sphere sanity: 0), a landing-point
jitter neither skeptic had isolated. The shipped construction replaces it:
**q(d̂) = the unique S=0 crossing along the origin ray** (40-step bisection +
2 Newton polish — the SDF *generalizes* figRadial), star-shape ASSERTED
(figS(origin) inside + a single-crossing sweep; the barely-touching negative
config fails 3000/3000 directions, loudly). Fold-free (negDet = 0 across all
6 faces), continuous (max jump 3.4× the mean cell = real metric stretch, which
is exactly what the metric tensor carries), and normalize(q) = d̂ exactly — so
every direction↔cell inversion in the engine (dirToFaceUv round-trips, stamp
windows, the disc atlas) stays a true bijection. Displacement still rides
∇S per the roadmap — the neck's non-radial character lives there (m̂ leans
63° off radial on the arrokoth flanks, fixture-asserted).

**KILLERs confirmed and fixed in the design before code:**
- figS=(1−1/k)|p| is NOT first-order distance (|∇S|=1.357 on Haumea's flank —
  closed form √(1+sin²θcos²θ(a²/c²+c²/a²−2)) verified numerically by two
  independent skeptics): altitude inflated 36%, the injectivity march
  self-fires. → figS = F/|∇F| (true first-order distance; the fixture pins
  figS(R+123)=123 m on a sphere-as-ellipsoid), plus figAlt = S/|∇S| for
  metric consumers (the neck compresses |∇S| to ~0.5 — measured).
- The single-ray injectivity march measures |∇S|≈1, not injectivity (caustics
  are a NEIGHBOUR-ray property). → curvature bound from the normal-turn rate
  (validated against the closed forms: vesta c²/a = 174.5 km, haumea 224 km
  — both reproduced to 4 digits) + an other-sheet march on figAlt.
- "Relief budget = recipe amplitude sum" is not computable pre-bake (edifice/
  rift deliberately declare height/depth outside amp). → reliefBudget is a
  DECLARED figure datum; preflight asserts budget·2 ≤ injectivity bound;
  the fixture MEASURES baked min/max heights against the declaration.
- Crater footprints stayed mean-R chord (circular craters become ellipses at
  Haumea's 1.45× long axis; Rheasilvia at r≈R shrinks 36% under chord vs
  arc). → 3-D-metre footprints from the per-cell pos array; lattice bbox from
  actual figure extents; sphere path keeps R·acos for the authored basin.
- Rheasilvia is UNREPRESENTABLE in the stochastic vocabulary (opts.basin's
  peak term is a RING at t=0.5, placement is a lattice draw). → the authored
  basin datum craters.basins:[{dir,r,depth,peakH,...}] with a t=0 central
  peak — a discrete recipe fact, stamped before the lattice bands.
- The mode-2 self-limb min-S march includes t=0 where figS(p)=0 — EVERY
  daylit point self-shadows to the penumbra midpoint (two skeptics
  CONFIRMED). → march starts at t0 = neckK·0.75, strictly past the asserted
  relief budget; only the far limb / other lobe can drive min-S negative.
- figBoundR as the horizon-cull occluder is ANTI-conservative (acos is
  decreasing in R — a bounding sphere culls MORE, eating visible tiles).
  → the INSCRIBED radius (figMinR) is the occluder; boundR only for framing.
- The three recipes had no orbits/spins/discAlbedo (frames.js crashes on
  body.orbit.a). → full reference-grounded elements (Vesta 2.36 AU/5.34 h,
  Haumea 43.1 AU/3.92 h, Arrokoth 44.6 AU/15.92 h); their angular radii stay
  ≤1.5e-6 rad from every legacy body at all epochs — below the 9e-6 worst
  4th companion slot, so legacy skies are untouched (checked closed-form,
  plus the r17-companion-shift membership-diff classifier as a tripwire).
- Titan discHaze folded into bakeDiscMap re-pins a manifest byte artifact
  (three verdicts across two dimensions). → RENDER-time veil (uBodyHazeK
  mix over the sampled atlas; mix(a,b,0)=a exactly ⇒ legacy discs
  byte-identical, no re-pin).
- Camera auto-tilt's absolute 20 km..4000 km ramp frames every small-body
  disk 23–76° off nadir. → thresholds scale by figBoundR on figure bodies.

**Selected HIGH/MED confirmations (all shipped):** stars.js occlusion left on
the mean-R sphere (pokes out of the neck, eats a band of sky) → uStarOccR =
the inscribed radius, depth-tap covers the rest; geomorph must morph along the
BAKED m̂ (oct-encoded aFigN attribute, modes 1+2 — a re-derived radial/analytic
axis contradicts the bake and cracks T-junctions); rayEllipsoid needs the FULL
quadratic (the reduced raySphere assumes |rd|=1 — up to 2.27× wrong affinely);
thermal's per-axis talus must be EDGE-SHARED min(len[c],len[n]) or mass
conservation breaks; iterated stateful ops keep CELL halo budgets (the metres
conversion was a category error — panel), with haloReachM as an optional
per-tile physical-reach assert; worker bake asserts must not die silently
(typed bakeerror → loud main-thread throw); the meso band keys on PHYSICAL
cell size for figure bodies (a 10 km body never reaches absolute level 14);
pan gain scales by the local hull radius; the epoch-alt |cam|−R misreads the
neck (figAlt); skirt caps key on local scale not R·0.015 (135 m binds on a
10 km body); assertFigureRecipe whitelists processes and rejects
atmosphere/ocean/clouds/nightLights/aurora/rocks/formations + lobes>2 by name
(M5: the GLSL twin caps at two lobes); the control pool stays
['tellus','rubra','luna'] (widening re-rolls all 8 daily draws — the queued
titan/venus control-rotation is served by registry scenes #60/#61 instead);
limbProfile is EXCLUDED for figure disk scenes via the noLimb scene flag (an
azimuthal average presumes a circular limb); the airless ambient fill gets an
ambientAlbedo recipe datum (the 0.02 constant was tuned on ~0.11 regolith;
Haumea's 0.8 ice fills ~7× brighter; absent ⇒ Luna byte-identical).

**REFUTED (fabricated/wrong, discarded):** the finding that q(d̂) folds per the
∏(1+tκ) offset-Jacobian argument (wrong map — that formula governs the small
h-offset, which the injectivity assert already bounds); the limbProfile
"body.figure sniff is impossible" finding (quoted text not in the design);
point-flux-keys-to-figBoundR (the design already used effR for flux);
the lobes spin-axis "static assert is vacuous" finding (no such remedy in the
design text).

## The driver's adjudication artifacts

- scratchpad/r17-flowmap-adjudicate.mjs — fold/continuity/coverage harness
  (sphere sanity negDet 0; far-start Newton negDet 18778/55296; ray-crossing
  map negDet 0, multiCross 0/3000 on the ship config, 3000/3000 on the
  invalid barely-touch config — the loud-failure signature the fixture's
  negative test reuses).
- test/figure-test.mjs — the shipped fixture battery (31 asserts): the
  irregular-domain SEAM fixture (bit-identical heights + sub-micron
  reconstructed q+h·m̂ across a cube edge on arrokoth), metric sanity + the
  neck-anisotropy floor ("the fixture fails if the neck stops necking"),
  injectivity positive (≥2× headroom: vesta 2.6×, haumea 22.5×, arrokoth
  2.0×) and negative (over-budget + open-gap + scope-law + 3-lobes + halo
  reach — all named errors), sphere-mode equivalence (metric = great-circle
  arc to 1.5e-7), and two-baker byte-determinism.

## Post-implementation panel (the shipped code, not the plan)

6 finder agents (Opus) over the round-17 diff + Sonnet skeptics per finding.
**20 findings: 16 CONFIRMED / 3 MITIGATE / 1 REFUTED — all CONFIRMED fixed
in-round.** The catches the fixture battery structurally could not see:

- **GLSL figUpDir (mode 2) was a wrong gradient** — the raw-gradient mix put
  the fragment's local vertical up to 21° off the baked m̂ at the neck (the
  terminator/slope vertical on the one body that IS a neck); two independent
  skeptics reproduced 13.1°/20.8° numerically. Even the analytic unit-gradient
  smin blend keeps ~7° inside the bridge (per-lobe gradients are only unit ON
  their own surfaces). Fixed with a central-difference of figS — the SAME
  construction the CPU figGrad uses — and a fixture assert now pins GLSL-twin
  agreement to <0.2°.
- **The ellipsoid recipes put the polar axis on Z, but the engine's spin/
  latitude pole is +Y** — Vesta's flattening was SIDEWAYS and Rheasilvia's
  "south pole" sat on a long axis. Axes reordered ([a, c_polar, a]).
- **Legacy star occlusion was not bit-exact**: the shader's f32(R)·f32(0.9995)
  became a double product uploaded as a uniform (+0.25 m on Titan — a ulp at
  the occluder limb). Fixed with fround(fround(R)·fround(0.9995)).
- **The authored basin measured 3-D chord on figures** — the exact metric the
  sphere branch's R·acos was written to reject (~4% asymmetric shrink at
  Rheasilvia's r≈R scale). Now angle × mean local radius.
- **Crater-center reprojection stepped with figS·m̂, not figAlt·m̂** — where
  the neck compresses |∇S| to ~0.5 the 3-iteration Newton left centers 8–45 m
  off-surface (skeptic reproduced 10.8/23.0/34.8/46.2 m). figAlt converges the
  same loop to ~0.
- **figAnchorR's union-exit hull under-read the waist by the whole smin
  bridge** — 2.5–3 LOD levels of under-refinement at the neck icon pose (a
  skeptic drove the live engine to verify). The anchor is now the full radial
  solve (trivial cost on small-body trees).
- **The eye-level inset's LOD anchor used cams[0]'s figure altitude** —
  per-camera altitudes restored.
- **haloReachM was gated at the coarsest band** — the one level that always
  passes (cells halve per level); now checked at every level in range.
- **switchBody disposed the live scene BEFORE validating the recipe** — a bad
  figure recipe bricked the session; asserts now run first.
- **sunTransmit mode-2 penumbra scaled with camera distance** (2·b march) —
  now span-bounded taps + a fixed physical penumbra with a tap-spacing floor.
- **The metering/WB proxy used the radial vertical on figures** — cs.up now.
- **Pan gain double-applied the anisotropy correction**; **the per-figure nrm
  bake array was a dead store**; **ctx.met was itself untested** (now shipped
  on the tile record + fixture-validated against independent q-differences);
  **noLimb disk scenes fell back to the ground horizonGap metric** (disk and
  limb are now separate tags); **state.skyFigMode init** (MITIGATE, fixed);
  **thermal conserves height-sum, volume only to first order** (MITIGATE —
  comment corrected, approximation documented).
- REFUTED: the scene-68 aim-direction finding (quoted a pose that predates
  the first-light re-pose; the shipped pose was verified visually).

Driver additions during first light (before the panel): the tiles.js:905
`Math.max(...misses)` spread overflow (V8 ~50–65k arg limit — small-body
hemispheres legitimately reach it; the arrokoth-terminator 428-error crash,
root-caused from the error overlay, fixed with a loop) and the original
tap-spacing terminator speckle at the waist.
