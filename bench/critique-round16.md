# Round-16 adversarial critique panels — results + dispositions

Standing rule-1 discipline: finders **Opus**, skeptics **Sonnet**, regardless of driver.

## Pre-code design panel (31 agents, 25 verified: 18 CONFIRMED / 4 MITIGATE / 3 REFUTED)
Five disjoint Opus finder lenses generated killers on paper; Sonnet skeptics reproduced
each against the real code + math. Killers dead on paper for the FIFTH consecutive round.
Every disposition below is folded into the build BEFORE code (the corrected spec).

### KILLERs (all fixed pre-code)
- **[KILLER] storm-season-rollover** — a single season scalar shared across covAt's k (R,G)
  and k+1 (B,A) calls (the moistAt precedent nudges toward it) breaks rollover byte-
  continuity: Rubra th advances 0.00305 rad/keyframe, >1 LSB after remap. FIX: evaluate
  `s0=seasonAt(body,k)` and `s1=seasonAt(body,k+1)` SEPARATELY, feed the matching covAt
  call; covAt gains a trailing optional `season` param (default 0 → existing 5-arg calls
  unaffected). Pin a rollover test at an in-season Rubra k.
- **[KILLER] aurora-atm-gate** — aurora relocated "beside airglow (line 687)" lands INSIDE
  `if(uHasAtm>0.5 && _t1>_t0)`, which is false for an orbital ray sighting the 110-220 km
  shell above the dark limb (closest approach ≫ atm.top 80 km) → the limb arc vanishes.
  FIX: add aurora/lightning emission in the UNCONDITIONAL outer scope of scatterInline
  (after the block close), own `raySphere(ro,rd,uPlanetR+auroraH)`, clip `tc>0 && tc<tmax`,
  ×trans (defaults vec3(1)).
- **[KILLER] aurora-star-gate-suppression** — folding aurora into the shared `inscat`
  leaks into SCATTER_FOR_STARS's contrast gate (`_skyL=max(inscat)`), blacking out all but
  the brightest stars across the whole 6°-wide oval (aurora radiance is 5 orders above
  airglow). FIX: scatterInline gains a SEPARATE `emis` out-param (6th) for volumetric
  emission; material call sites add emis to col/aIns; the star pass never references emis.
  §8's "emission beside the integral, not inside it." (Airglow STAYS in inscat — genuine
  sky in-scatter that correctly gates stars, the round-15 witnessed behavior.)
- **[KILLER] B1-storm-F1-variance-collapse** — a Rubra 2nd storm deck drives F1's mid-lat
  spatial-std to ~0 BOTH off-season (all clear) and in-season (all pall) → ratio 0/1e-9
  fails ≥0.9; the design's own "F1≥0.9 with storm" test-plan line is unachievable. FIX:
  generalize the Venus exemption into a real guard — F1 skips any deck with std<~0.02
  (covers Venus permanent + Rubra storm at all k); bump `assertCloudRecipe(rubra)===2`;
  replace the promise with an envelope on/off correctness test (off-season covAt≈0,
  in-season>hi); F1 covers only Rubra's cirrus deck (index 0, untouched).
- **[KILLER] venus-refrac-deadband** — Venus refrac 0.015 (50× Earth) runs the Earth-tuned
  Bennett term 50× past its regime: max|delta|=48° → e2<0 (light "from below the horizon")
  and a 5.69° unrenderable dead-band at true elevation ∈(2.31°,8°); venus-deck-breakout's
  low twilight sun sits in it. FIX: saturate the bend (delta cap / tanh) + replace the hard
  `if(eDeg<8)` branch with a smoothstep(6,8) fade so e2 is monotonic for any refrac. Earth/
  Mars unaffected (delta<1° → no-op). Add a Venus elevation-sweep monotonicity probe.
- **[KILLER] longitudinal-dune-decorrelation** — the 2-change longitudinal branch (cross-
  wind phase + slipK→0) still leaves per-anchor random phA + the seg-noise multiplier, so
  the belt reads as segmented barchan-DASHES, not continuous linear ridges (on-axis peak-
  to-peak 176%). FIX: for axis==='longitudinal' also set phA=0 (shared phase origin) AND
  flatten seg (0.85+0.15·noise). VERIFY with an on-axis coherence check in Node BEFORE
  claiming "correct"; if still incoherent within the packet budget, ship as an oriented
  approximation and RELABEL honestly (do not over-promise). [Highest-risk content item.]

### HIGH (all fixed pre-code)
- **[HIGH] city-lights** (4 confirmed defects: LOD-pop existence, firefly aliasing, vWorld
  crawl, no §11 disc hand-down) — the naive per-tile-atlas-threshold + per-pixel-hash is
  broken four ways. FIX (do it RIGHT at the tier that matters): existence from a LOD-FREE
  closed-form habitability (temperate × non-desert × low-alt × coastal, the biome-color
  closed-form precedent shaders.js:1198, NOT a per-tile uAtlas threshold); hash the light
  lattice on body-fixed `pPC` not `vWorld`; footprint-FOLD (fw-gated smoothstep) so it
  converges to a smooth dim habitability×radiance GLOW from orbit and only resolves to
  clustered speckle at low altitude (§7/§11 mean-preserving); night-gated by (1-lit);
  extinguished by aerial perspective. Add a matching dim emissive wash to bakeDiscMap's
  disc rung (Tellus-from-Luna night) OR gate off above a footprint ceiling + register.
  Anti-overfit pin: existence identical at a body-fixed point sampled from parent vs child.
- **[HIGH] disc-atlas-mip-cross-row-bleed** — the disc atlas is a STACKED 2D DataTexture;
  minified companions select mip 7-8 whose box filter exceeds one 128-row → bleeds across
  body rows (latent today between tellus/rubra rows; worse with 6 hued rows). FIX: convert
  discAtlas to a DataArrayTexture with NB layers (mirror the cloud atlas); shader →
  `sampler2DArray` + `texture(uBodyAtlas, vec3(buv, layer))`. Eliminates the row-scale
  float nit too. Land in the D (engine-capacity) workstream that already rewrites this code.
- **[HIGH] saturn-palette-crash** — bakeDiscMap reads palette.dust/rock UN-defaulted; a
  "just discAlbedo" Saturn throws TypeError at bake, blocking titan-saturnrise. FIX: Saturn
  palette must set dust+rock (pale gold), seaLevel:null, no veg. Add a load-time
  `assertPaletteRecipe(body)` beside assertCloudRecipe (require dust+rock; sea→ocean colors;
  vegCold→a context process).
- **[HIGH] proxsort-762** (confirms D mandatory) — with 6 bodies every legacy body's
  `others` has 5 entries; the naive array-order slice(0,4) can drop Saturn from Titan's sky.
  FIX: `eph.others.sort((a,b)=>b.angRadius-a.angRadius)` (DESC — reversing reintroduces the
  drop) before slice. Add a lookAt-in-others bench assertion.
- **[HIGH] titan-methane-lake-waveamp** — waveAmp is a body-independent engine constant; the
  methane lake ships Earth-like chop + a bright broad specular ellipse (glitter scales only
  the discrete sparkle, not the broad lobe). FIX: promote `water.calm` (default 1.0) from
  conditional to REQUIRED — one scale at tiles.js:182 folds through foldVar→a2 automatically
  (calms chop AND roughness floor). Titan water:{calm:~0.15-0.25}. §12-mandated, same shape
  as the axis knob.
- **[HIGH] emission/weather/companion control-gate** — the row-widening injects Titan/Venus/
  Saturn discs into EVERY legacy control sky (even Luna, the pure negative control), and
  emission/storm/hood legitimately change Tellus/Rubra control renders. FIX: two closed-form
  pre-run classifiers in run.mjs (the cloudInView M5 precedent) — (1) aurora/storm/hood-in-
  view tagging expected-delta; (2) new-companion-in-view (titan/venus/saturn in a legacy
  body's sorted top-4 within the view cone) tagging expected-delta. Re-freeze baseline ONLY
  after these exist (no silent caps).

### MED (fixed)
- **[MED] aurora-uTimeS-wrap-seam** — vnoise-of-uTimeS pops at the 4096 s wrap (recurs every
  ~68 real-s at speed 60). FIX: compute the curtain + substorm-pulse phases as driftPhase-
  style JS-double wrapped uniforms, not from uTimeS.
- **[MED] aurora-dkTr-occlusion** — the unconditional _dkTr fold occludes the aurora by a
  deck that is actually BEHIND it from orbit. FIX: per-crossing `_dkA`-style midpoint
  ordering test (shaders.js:656 pattern). Night-disc aurora icon must have cloud under part
  of the oval to exercise it.
- **[MED] bedforms-axis-profMean** (paired with a REFUTED twin) — resolved: override slipK at
  its single binding (line 1324) `const slipK = p.axis==='longitudinal'?0:(p.slipK??0.7)` so
  profMean + prof stay consistent by construction. Add a longitudinal mean-zero regression.
- **[MED] titan-dune-lat-gate** — there is NO 'lat gate' knob (FIELDS has no 'lat'). Titan's
  E-W equatorial belt (|lat|<30) is its single most iconic feature. FIX: add a small opt-in
  `p.latBelt` term to procBedforms (default-off, zero-disables, byte-identical for existing
  bodies) — the axis-knob discipline. Titan opts in; Tellus/Rubra unchanged.

### MITIGATE
- **[MITIGATE] venus-deck-breakout _dkMid anchor** — atm.top clip already resolved (100 km);
  the real (pre-existing round-15) bug: `_dkMid0` is anchored to the near slab even when the
  FAR split carries the deck's optical depth → grazing rays at alt∈[48,70) km wrongly zero
  near-camera sky in-scatter. FIX (localized): anchor _dkMid0/_dkMid1 to whichever segment
  carries material. Verify carefully (re-read shaders.js:505-620 at build); add a Venus
  grazing-ray test. Not a deck-math rewrite.
- **[MITIGATE] titan-haze-featureless** — at τ≈7 near-nadir from above the haze the surface
  IS swamped by haze glow (real Titan needs near-IR/RADAR); NOT an MS-clamp artifact. FIX:
  soften the C1 claim ("faint surface visibility" scoped to low-alt/short-path scenes);
  pin fixedEV on high-alt Titan bench poses (round-15 convention). Honest scope, not code.
- **[MITIGATE] frames nested parent** — geometry SOUND (arbitrary-depth recursion; Saturn
  ~5.46° dia from Titan, not 26°). Optional hardening: guard bodyById(parent) with a clear
  error. Array order irrelevant.

### REFUTED (why-safe, no block)
- **lightning-4096-seam** — bucket floor(t/period) turnover at the wrap is an ordinary hash
  turnover (identical to the ~512 others), and periods dividing 4096 are exact. Prefer a
  4096-dividing period as hygiene; not a correctness block.
- **lightning-per-tap-star-leak** — the design's Placement Law already mandates a single
  post-loop add folded by the deck's aggregate _dkTr; taps are path-length weighted (no
  energy-scales-with-count); the star-integral sharing is the DELIBERATE round-15 witnessed
  behavior. Implement per the Placement Law, do NOT #ifndef-guard the star stage.
- **bedforms-symmetric-profMean** — slipK is a single binding read by both profMean and prof;
  overriding it at the binding is desync-proof by construction (see the MED twin's fix).

## Post-implementation critique panel (16 agents, 11 verified: 10 CONFIRMED / 1 MITIGATE /
## 0 REFUTED) — bugs the DESIGN-level panel could not see, all fixed in-round

Five Opus finder lenses attacked the SHIPPED code (Sonnet skeptics reproduced each with
node probes against the actual source). Every finding was real and fixed before commit —
the value of a second panel that reads the code, not the plan.

- **[CONFIRMED] emission double-attenuation** (raised twice) — the aurora/lightning add
  reused `${trans}` AFTER `trans *= _dkTr0*_dkTr1`, so the deck extinction was applied
  BOTH via trans AND via the per-crossing `_dkOcc` (0.3⁴ vs 0.3² — ~11× too dim on the
  ground; a cloud-shaped dark imprint under an orbital aurora that clouds beneath should
  not touch). FIXED: capture `_emTr = trans` BEFORE the deck fold; the aurora uses
  `_emTr·_dkOcc`, lightning uses `_emTr·(_dkMid1<_dkMid0?_dkTr1:1)` (sourced within deck 0,
  so deck 0 must not self-suppress it; only a nearer deck 1 occludes).
- **[CONFIRMED] pow(negative,2.0) UB** — `pow((_s−latS)/WS, 2.0)` runs with a negative base
  over most of the shell; GLSL ES 3.0 leaves pow(x<0,y) undefined (the shipped SwiftShader
  folds it to a square, but native Mesa / mobile GPUs may not). FIXED: explicit `_q*_q`
  (bit-identical on the tested backend). Same one-line fix applied to the pre-existing
  eclipse-ring `ringA` term.
- **[CONFIRMED] aurora presence gate on .g only** — a red-dominant band (small green) would
  be silently dropped. FIXED: gate on `max(r,g,b)`.
- **[CONFIRMED] Titan betaA reversed** — shipped [3.5e-5,1.4e-5,0.35e-5] absorbs RED, the
  OPPOSITE of its comment and the Rubra/Venus blue-heavy convention — the cause of the
  dark blue-limbed disc. FIXED: [0.35e-5,1.4e-5,3.5e-5] (absorb blue). Re-capture: the disc
  is now a warm ORANGE organic-haze marble (the panel predicted the exact reflectance flip).
- **[CONFIRMED] Venus refraction dead-zone survived** — flooring only the RESULT (e2 ≥ −2°)
  left a flat apparent-elevation band (many true elevations collapse to −2°). FIXED:
  SATURATE the bend itself (`delta = min(delta, 4°)`) — e2 strictly monotone, zero flat
  samples for Earth/Mars/Venus (verified).
- **[CONFIRMED] _dkMid guard fires on legacy limb rays** — `_r1>_r0` alone fires on ordinary
  Tellus/Rubra limb rays (near slab entered from the side), not just Venus's pinched case —
  the byte-identity claim was false. FIXED: gate on `_s1−_s0<1.0 && _r1>_r0` (near slab
  actually empty) → byte-identical for every non-pinched pose.
- **[CONFIRMED] classifiers test one nadir point** — newCompanionInView/nightEmissionInView
  under-tagged (a pitched view sees past the sub-camera horizon). FIXED: depressed-horizon
  `dot > −sin(viewAng)` for companions; a 64-sample view-cap spiral for night emission.
- **[CONFIRMED] city-lights comment overclaimed** — the habitability is a latitude/altitude/
  clustering PROXY (deliberately LOD-free), NOT the per-tile climate field (the forbidden
  LOD-dependent path). FIXED: honest comment.
- **[CONFIRMED] Titan §11 disc/far-point tint gap** — Titan seen as a companion disc / far
  point uses bakeDiscMap's palette albedo, which carries no haze tint, so it reads ~4.3×
  different from the actual hazed Titan. REGISTERED as a §11 breakpoint (round 17: fold a
  closed-form haze tint into bakeDiscMap when atmosphere exists + no clouds) — Titan is only
  seen this way from Saturn (not a viewed body) or as a far point mid-approach.
- **[MITIGATE] Rubra hood onset reaches mid-lat in deep winter** (~47°, inside F1's band, not
  polar as claimed) — but F1 bakes with NO season sampler so the hood is a no-op there, and
  it is a smooth zonal DC lift (no per-k noise) so it cannot break the variance-ratio pin.
  FIXED: the two false comments corrected; the hood ships (Mars's real hood extends to
  mid-latitudes too).
