# ROADMAP_V2 — build phase 2: from "credible" to photoreal, at every altitude

> **Status (build round 18, July 2026 — Opus-driven per the model plan):**
> **Phase 5 cryo pack + Phase 6 giants/rings — the ROADMAP closeout.** Two
> pillars, both well-specified: Saturn becomes a real banded fluid giant with a
> ring system (serving icon #14 titan-saturnrise, deferred here from round 16),
> and a cryo pack lands two canonical icy worlds — Europa and Pluto (the Phase-5
> exit names both; round 17 already shipped the 67P-class figure). Anti-overfit
> is structural: two cryo bodies, DISJOINT module sets. **The round's pivotal
> correction came, again, from the driver's own pre-code experiment:** the design
> proposed inclining Titan into Saturn's ring plane (a shared-frame-tree change)
> to force edge-on rings — the experiment (bench/_r18_adjudicate.mjs) OVERTURNED
> it, showing the coplanar tree already sweeps the ring opening 0.00°→26.70° over
> Titan's own orbit. So the ring aspect is a POSING choice, not a frame-tree one:
> pose near-edge-on (Titan near its node) and the rings are a thin ellipse + the
> shadow band, with NO frames.js change, and — decisively — ĉ·n̂=sin(opening)≠0
> so the ring geometry is never at the 0/0 singularity that had scoped a Fable
> escalation. That single decision dissolved FIVE pre-code findings at once
> (saturn-pinned-to-titan-equator, the ring singularity, the razor-line
> continuity, the saturn-disc open-ring contradiction) and kept the round on
> Opus. **The giant + ring (Phase 6):** the look is LIVE-synthesized in
> SKY_FRAG's §11 companion-disc block (differential rotation, one storm oval, the
> polar hexagon are closed-form time, so the disc can't be a static atlas) —
> RUNTIME per-slot gates (uBodyGiant/uBodyRing default 0 ⇒ every legacy disc is
> byte-identical; NOT a compile define, since the sky loops all companions). The
> ring is an analytic annulus, all math in units of the body distance D factored
> OUT (rvec = τ·rd − ĉ, O(1) — no 1e9 m cancellation, the §9 law); the plane
> normal is uBodyR1[i] (target +Y in our frame — the ROW, not the y-column, a
> mirror-flipped bug three pre-code lenses caught independently); ≤4 gap notches
> unrolled (Cassini + Encke, no dynamic index); forward-scatter HG for the
> backlit flare; mutual planet↔ring shadows as LOCAL disc-side code in the target
> frame in units of R (sunTransmit is sphere-only and frame-local to the RENDERED
> body, so it can't serve the Saturn-disc-from-Titan — the money element is the
> ring SHADOW BAND across the disc). Bands are ≤8 sin-lat knots blended by
> unrolled smoothstep; storm/hexagon drift at PER-FEATURE rigid rates Ω(lat) =
> deepRate+diffRate·sin²lat, reduced to one revolution in CPU double (never a
> per-pixel sin²lat·tPhase shear — the pre-code §9 rollover-seam finding), the
> longitude delta angularly wrapped. discAlbedo IS the cos-lat integral of the
> band profile (§11 disc→point, pinned by test:ring). **The cryo pack (Phase 5,
> §6 new FAMILIES):** six position-pure closed-form processes, byte-identical for
> legacy bodies because the loop only dispatches a type a body LISTS. procLineae
> (Europa's tidal double ridges — age-rotated families of arcuate small-circles
> about NSR poles, orientation from the polar angle acos(d̂·p̂) so the R/λ
> precision cliff and the ê⊥dir degeneracy cannot occur; the bright fracture
> ALBEDO arrives WHOLE, a level-independent overwrite, never the height onset —
> the pre-code lineaAlb-onset KILLER); procChaos (position-pure jostled ice rafts
> on the body-fixed lattice within a closed-form fbm margin — NOT a stateful
> diffusion that would fight the halo budget); procGlacier (Pluto's Sputnik
> Planitia as an AUTHORED closed-form basin — the bright N2 ICE re-asserted into
> the EXISTING ice field EVERY level so context's per-level overwrite can't erase
> it, the floor flattened ONCE at levels[0]; this is why the pre-code signed-
> cryoProv zero-crossing seam NEVER exists — glacier rides `ice`, freeing the two
> ATLAS L6 spares for two UNSIGNED albedo channels lineaAlb + tholinAlb);
> procPolygons (ONE Voronoi family — convection cells + contraction cracks, gated
> by EXPRESSION not existence, level-stable); procSublimation (penitente blades
> oriented on a recipe mean-insolation axis, §5 sun-independent); procTholin
> (Cthulhu Macula as a body-fixed longitude province, latitude-only seasonalCap
> can't express it). Existence is ALWAYS closed-form on the direction (Worley/fbm
> — level-stable, seam-free; the pre-code onset-gate-not-level-stable finding);
> baked fields only modulate expression per output cell (the crater `mare`
> discipline). **Recipes (§6 data):** Europa (bright water ice + ruddy lineae
> crosshatch + Conamara chaos; parent:'star' with its REAL 3.55-d synchronous
> spin, decoupled from the placeholder heliocentric orbit — the pre-code europa-
> spin finding), Pluto (bright N2 Sputnik glacier with convection cells beside
> dark red-brown Cthulhu tholin; context BEFORE the ice-gated cryo bands — the
> pre-code pluto-order fix), Saturn (the giant + ring datums). Europa/Pluto are
> SPHERE bodies (byte-clean, circular limbProfile) appended after arrokoth so no
> legacy atlas row shifts; their angular radii stay below every control's 4th
> companion slot (2.83e-6 vs 4.60e-6 rad, a 1.63× margin on Rubra — so the new
> r18-companion-shift eviction tripwire is genuinely load-bearing, and stays
> silent as the closed-form check predicts). Two new ATLAS L6 channels (lineaAlb,
> tholinAlb); the worker cacheMax stays 300 (+46 KB/tile ⇒ ~202 MB, ~40 MB below
> the failure point — post-impl-confirmed memory-safe; an interim 280 starved the
> descent scenes' tile-streaming settle). **Scope law:** assertGiant/
> assertRingRecipe + assertGiantSystem (>1 giant / >4 gaps / |fscatterG|≥1 /
> limbExp≤0 throw by name, wired into switchBody + the bench render check — M5 no
> silent caps); assertPaletteRecipe extended for palette.linea/tholin.
> **Panels (rule 1: finders Opus / skeptics Sonnet):** pre-code (12 lenses, 50
> findings, skeptic-verified) — the driver's aspect-sweep experiment overturned
> the Titan-inclination design (one decision dissolving five findings), three
> lenses INDEPENDENTLY caught the ring-normal column-vs-row error, and the
> killers were settled on paper (the signed-cryoProv zero-crossing seam →
> glacier rides the `ice` field + two UNSIGNED albedo channels; the lineaAlb
> onset ramp → arrives-whole; the §9 per-pixel drift shear → per-feature rigid
> drift; the pluto context-before-ice-gate order; the giant §11 mean
> convention). Plus a post-implementation panel reading the SHIPPED diff (12
> agents, 11 CONFIRMED, ALL fixed in-round): the storm/hexagon drift
> DOUBLE-COUNTED Saturn's spin (the disc is synthesized in the already-spinning
> body-fixed frame, so drift is the DIFFERENTIAL rate Ω(lat)−spinRate);
> doubleRidge's one-sided clamp printed a spurious central crest that inverted
> the Europa lineae signature; europa/pluto (unhidden) cracked HAUMEA's top-4
> companion slice and broke its byte-identity (→ recipe `skyHidden`, filtered
> from every other body's sky — standalone worlds never appear in another's
> sky); the ring mutual-shadow/occlusion tests read atan(R/D) where the annulus
> reads the exact R/D ratio (→ a dedicated uRingRp); a missing assertRingSystem
> (the M5 asymmetry vs assertGiantSystem); the giant/ring asserts fired AFTER the
> scene teardown (the dispose-then-brick class round-17 fixed for figures); the
> glacier flatten used an un-warped arc while the ice mask was warped; plus two
> test-hardening catches (the arrives-whole test undersampled a high-freq field
> → a resolution-stable peak comparison; a tautological finite check).
> See bench/critique-round18.md.
> **Verified:** test:ring (27) + test:cryo (12) green plus all 12 legacy Node
> suites green; assets:check 28/28 deterministic with every LEGACY hash UNCHANGED
> (only the saturn/europa/pluto discs re-pinned, git-confirmed); the full 105-shot
> sweep ran with the control seed forced to the baseline's date (a new run.mjs
> `--seed` override — the anti-overfit gate compares like-for-like controls across
> promotion dates) with the control gate 8/8 pre-classified EXPECTED (5
> r16-new-companion, 3 r15-clouds) and every delta dmean ≈ 0.000 — NO unexpected
> control regression, and the r18-companion-shift tripwire silent as designed.
> The canonical gate pair blue-marble +
> loworbit-sunset are BYTE-IDENTICAL to the round-17 baseline (dmean/dslope/dkurt
> all 0.000000), and the round-17 figure bodies revert exactly (vesta-rheasilvia
> and haumea-disk byte-identical 0.000000) — the `skyHidden` fix confirmed:
> europa/pluto are absent from every other body's companion set, so haumea/vesta/
> arrokoth are unpolluted. The remaining icons carry only the known cross-sweep
> warm-state kurt drift (dmean ≤ 0.002, order-dependent, visually identical). The
> single scene that did not reach the strict all-queues-settled state was
> boulder-macro-rubra (the heaviest bench scene, 2 m from a maximum-detail boulder
> cluster) — but its render is BYTE-CORRECT (dmean 0.000 vs the baseline), only a
> few final background tiles trickling in past even a 400 s budget on this loaded
> machine (a settle-predicate/machine-speed limit on the one heaviest scene, not a
> regression; its budget was raised 300→400 s for the +2-fields per-tile cost).
> Every GATE scene (canonical pair, 8 controls), figure body, and new scene
> settled; zero page errors, zero broken scenes.
> **First light WITNESSED:** the pale-gold banded Saturn with the full ring
> annulus, the Cassini division, mutual planet↔ring shadows (the planet notching
> the ring, the ring shadow band across the disc) and front/back occlusion (the
> ring passing behind the disc at top, in front at bottom); the near-edge-on ring
> line + crescent Saturn over Titan's orange haze; Europa's ruddy double-ridge
> lineae crosshatch over blue-white water ice; Pluto's bright Sputnik N2 glacier
> beside the dark Cthulhu tholin belt — all render on SwiftShader with ZERO GLSL
> errors, no NaN, and the ring precision holds (no jitter/tearing at the
> near-edge-on money vantage).
> **Honest scope / registered → future work (this is the last ROADMAP round):**
> ring spokes (the phase-reversing contrast overlay — deferred to remove the
> first-light decision point, rule 4); stars-through-ring attenuation (deferred —
> the F2-safe fallback is stars through the translucent ring); comet coma+tail
> (an eccentric-orbit extension to the shared bodyCenterInertial + a new render
> object); Enceladus tiger stripes + plumes (emission machinery + a 3rd cryo
> body); Iapetus equatorial ridge + leading/trailing hemispheric albedo; sea ice/
> leads, cantaloupe, PLD spirals, araneiform spiders, glacial tongues, frozen-
> over seas; the walk-on giant deck (TERRAIN/scatter banded surface + camera-at-
> Saturn ring mesh); oblate giant figure + oblate atmospheres; Pluto N2 haze; the
> polar hexagon at a pole-on vantage (sub-resolution from Titan's near-equatorial
> view — a documented geometric limit, the machinery is present). Baseline
> re-promoted (tag `round-18`). **ROADMAP_V2 build phase 2 complete.**
> **Status (build round 17, July 2026 — Fable-driven per the model plan):**
> **Phase 5 figure generality — the recipe declares the reference shape the
> rasters displace; the sphere is merely the common case (§11, now code).**
> ONE law replaced the sphere everywhere it was an assumption: q(d̂) = the
> unique S=0 crossing along the body-fixed ray (the reference SDF GENERALIZES
> figRadial), m̂ = ∇S(q), p = q + (h+meso)·m̂, up = ∇S, alt = S — with the
> sphere reducing to the exact legacy arithmetic (every fig branch is gated on
> the recipe datum; FIG_MODE is a compile-time define, so legacy programs are
> source-identical modulo the shared COMMON text). **The round's pivotal
> correction came from the driver's own experiment:** the design-as-written
> parameterized the contact binary by a far-start Newton flow; the pre-code
> panel split on whether it folds (two skeptics, contradictory numerics), and
> the adjudication harness proved BOTH half-right — no fold, but the landing
> point tears (34% scrambled Jacobians on every necking config; sphere sanity
> 0). The shipped ray-crossing map is fold-free (negDet 0 across all 6 faces),
> continuous (max stretch 3.4× = the real neck metric, which is exactly what
> the per-cell metric tensor carries), keeps normalize(q)=d̂ — every dir↔cell
> inversion in the engine stays a bijection — and star-shape is ASSERTED
> loudly (the barely-touching negative config fails 3000/3000 directions).
> **The machinery (exec row, all shipped):** per-cell metric tensors from
> central differences of q (face-consistent by construction), consumed by
> thermal (EDGE-SHARED pair talus — conservation survives a varying metric),
> materials/AO/catena FD, horizon steps, and the crater stamps (3-D-metre
> footprints from the pos array — mean-R chord stretches craters into
> ellipses at Haumea's 1.45× long axis; lattice bboxes from actual figure
> extents); injectivity asserts = a curvature bound from the normal-turn rate
> (validated against closed forms: vesta c²/a=174.5 km, haumea 224 km, to 4
> digits) + an other-sheet march on figAlt=S/|∇S| (the neck compresses |∇S|
> to 0.5 — the raw level value reads HALF the true offset, panel KILLER),
> asserted ≥2× headroom at LOAD/preflight (never a silent worker stall — the
> worker ships typed bakeerror), measured relief vs the DECLARED
> figure.reliefBudget datum; halo budgets in physical reach convert per tile
> (haloReachM → cells, named error); the irregular-domain seam fixture landed
> in test/figure-test.mjs (31 asserts: bit-identical heights + sub-micron
> reconstructed q+h·m̂ across a cube edge on arrokoth, the neck-anisotropy
> floor, both negative tests, sphere-mode equivalence to 1.5e-7,
> byte-determinism). **Three §6 recipes (data):** vesta (oblate 572.6×446.4 km
> + the AUTHORED Rheasilvia basin — a new craters.basins datum with a t=0
> CENTRAL peak; the stochastic vocabulary provably could not place or shape
> it), haumea (extreme triaxial 1160×870×510, 3.92 h spin — the figure IS the
> look; crystalline ice with an ambientAlbedo-scaled airless fill, ~7× Luna's,
> byte-exact for Luna), arrokoth (contact binary: two flattened lobes + smin
> neck as recipe data; m̂ leans 63° off radial on the flanks —
> fixture-asserted). Their orbits are reference-grounded and their angular
> radii stay below every legacy top-4 slot at all epochs (closed-form check +
> the r17-companion-shift membership-diff tripwire): legacy skies untouched.
> **Render side:** camera/tiles/skirts/geomorph (oct-encoded aFigN — the
> morph axis IS the baked m̂ or T-junctions crack), visit() with inscribed-
> radius horizon cull (boundR is ANTI-conservative — acos falls with R; panel
> caught the design's inversion), per-node hull-radius split arc, figure
> sunTransmit (mode 1 exact scaled-space closest approach; mode 2 an 8-tap
> min-S march from t0 PAST the local surface — a daylit point must not
> self-shadow on its own figS=0 — giving MUTUAL LOBE SHADOWING from the one
> §10 occlusion slot), SKY/star occlusion via inscribed figures (the mean-R
> sphere pokes out of the neck and eats a band of sky), meso keyed on
> physical cell size (a 10 km body never reaches absolute level 14).
> **Scope law (assertFigureRecipe, named errors):** figure bodies are airless
> and dry this round — process whitelist {continents, fbmBand, craters,
> context, thermal, materials, ao, horizon, catena}; no rocks/formations/
> emission; lobes.length===2 (the GLSL twin's cap — M5, no silent caps).
> **Forward-queue (registered r16 → shipped here):** rubra-blue-sunset
> waitMs 240 s (per-scene, never a global bump); the Chrome pin repair (env
> override else newest-cache scan — no machine-specific path); Titan §11
> discHaze as a RENDER-time veil (mix(a,b,0)=a exactly ⇒ no manifest re-pin —
> the bake-fold variant was panel-killed three ways); titan/venus control
> rotation served by registry scenes #60/#61 (pool widening re-rolls all 8
> daily control draws — panel-rejected). **Panels (rule 1: finders Opus /
> skeptics Sonnet):** pre-code 12 finders + skeptics = 53 findings (10
> KILLER), three split verdicts adjudicated by the driver's experiment — the
> flow map replaced, figS made first-order-true, the injectivity assert made
> curvature-based, Rheasilvia given an authored datum, the horizon-cull
> inversion fixed, the discHaze re-pin averted, the recipes given orbits
> (frames.js would have crashed at boot) — plus a post-implementation panel
> on the shipped diff (26 agents, 20 findings — 16 CONFIRMED / 3 MITIGATE /
> 1 REFUTED, ALL fixed in-round): the GLSL mode-2 vertical was 21° off the
> baked m̂ at the neck (now a central-difference of figS — the CPU's own
> construction — fixture-pinned to <0.2°); the ellipsoid recipes had their
> polar axis on Z while the engine's pole is +Y (Vesta's flattening was
> SIDEWAYS); the legacy star-occluder uniform was one f32 ulp off the
> round-16 shader arithmetic (fround twice); the authored basin measured
> chord not arc; the crater-center Newton stepped with figS where the neck
> compresses |∇S| to 0.5 (8-45 m off-surface — figAlt converges exactly);
> the anchor hull under-read the waist by the smin bridge (2.5-3 LOD levels
> of starvation at the money pose); the eye-inset LOD anchor ignored its own
> camera's altitude; haloReachM guarded the one band that always passes;
> switchBody disposed the live scene before validating the recipe; the
> mutual-shadow penumbra scaled with camera distance. Plus two driver
> first-light catches: the tiles.js Math.max(...misses) spread overflow (V8
> ~50-65k args — a small body's visible hemisphere legitimately reaches it;
> the nondeterministic terminator crash, root-caused from the error overlay)
> and the 8-tap terminator speckle. See bench/critique-round17.md.
> **Verified:** test/figure-test.mjs 34 asserts green (the seam fixture +
> negative tests + the GLSL-twin pin) and all 10 legacy Node suites green;
> assets:check 26/26 deterministic with every legacy hash unchanged (the 3 new
> discs pinned); the full 97-shot sweep completed with ZERO unsettled scenes
> (rubra-blue-sunset settles inside its new per-scene budget; beach-eye's
> earlier under-settle was panel CPU contention, clean in the final sweep) and
> zero page errors; the control gate 8/8 pre-classified expected-delta (5
> r16-new-companion, 3 r15-clouds — three controls at literal 0.000) with the
> r17-companion-shift tripwire never firing, exactly as the closed-form check
> predicted; blue-marble and loworbit-sunset BYTE-IDENTICAL to the round-16
> baseline (the canonical gate pair — and the ~0 controls prove the legacy
> pipeline unchanged; icon-tier stills carry the known cross-sweep warm-state
> drift, visually identical, dmean ≤ 0.001, order-dependent and deterministic
> per context); first light WITNESSED: the Haumea lens silhouette, Vesta's
> oblate crater record with the Rheasilvia rim arc, the bilobate Arrokoth
> disc, the neck ground under a star field, and the phase-84 crescent limb
> with the far lobe's occlusion dimming the ridge — 7/7 figure poses settle
> with zero GLSL errors on SwiftShader. **Honest scope / registered → round 18 (Opus,
> rule 3):** resolved figure COMPANION discs (the affine two-lobe composite —
> the new bodies are sub-pixel points from everywhere, checked closed-form);
> planetshine rotational variance (a Haumea shine should pulse ~2×; constant
> effR preserves the mean only — §7 waiver documented); rocks/formations/
> emission on figures (their up/alt paths are still radial); oblate
> atmospheres (figure+atmosphere is asserted apart); the sphere's own
> gnomonic per-cell metric (a documented known-approximation, byte-identity
> forbids fixing it silently); Titan orbital-disc MS fill, Venus deck-ceiling
> lid, aurora oval sharpening, Titan zenith fill (the r16 look queue).
> Baseline re-promoted (tag `round-17`).
> **Status (build round 16, July 2026 — Opus-driven per the model plan):**
> **Phase 4 content + Phase 3 recipes — aurora, lightning, global dust storms,
> polar hoods; Titan + Venus + Saturn as pure §6 recipe data.**
> "Stamps and config on the round-15 stack" — three DATA workstreams plus two
> small data-driven engine GENERALISATIONS, and the ONE thing the "recipes are
> data" framing hid, surfaced by an 8-reader recon before a line was written:
> the demo's atlases were sized for exactly 3 bodies. **Engine capacity (D):**
> `NB = SYSTEM.bodies.length` replaced a hardcoded 4-body ROW cap across ~9
> sites, and — on the pre-code panel's finding — the disc atlas became a
> DataArrayTexture (one LAYER per body, like the round-15 cloud atlas) so a
> minified companion disc can never bleed one body's albedo into another's row
> (the stacked 2-D texture did, at mip 7-8); a proximity sort before
> others.slice(0,4) keeps the nearest/biggest companions (Saturn, ~5.5° from
> Titan, is the one the naive array-order slice would have dropped); a load-time
> assertPaletteRecipe turns two latent bakeDiscMap TypeErrors into named errors.
> **Emission pack (A, §8 "the recipe may add emission"):** the aurora moved
> INSIDE scatterInline so it reads over the terrain-covered night disc from
> orbit (witnessed at 11,000 km) — three pre-code killers shaped it: the
> UNCONDITIONAL outer scope (not the uHasAtm gate, or the orbital limb arc
> drops); a SEPARATE `emis` out-param (never `inscat`, so a bright oval can't
> feed the star contrast gate and black out every star across it — the star
> splice generates no emission code at all); and PER-CROSSING deck occlusion
> (the _dkMid ordering test, not the background _dkTr fold, so a deck behind the
> aurora from orbit doesn't darken it). Dual altitude/colour bands (OI green
> lower, OI red upper), curtain + substorm phases as CPU-double uniforms that
> wrap at the vnoise period (never the uTimeS sawtooth). Lightning: one post-loop
> vhash(cell × CPU time-bucket) flash at the near deck, gated on coverage.
> **Weather config
> (B, "coverage is a field, volume is a look"):** the global dust storm and
> polar hood are ONE gated additive term each into covAt, default-no-op so the
> legacy decks bake byte-identical; both key closed-form on orbital season (a
> wrapped-gaussian on the PHASE angle for the storm — circular orbit has no
> perihelion distance cue; the seasonalFrost shape for the hood). **The KILLER
> the pre-code panel caught on paper (fifth consecutive round):** the season
> scalar must be evaluated SEPARATELY for keyframe k and k+1 (unlike the shared
> k-independent moisture sampler) or rollover byte-continuity breaks — the
> shipped s0/s1 split pins maxDiff 0 across 524k texels on the storm's rising
> edge. Rubra grew a 2nd dust-storm deck (EXACTLY clear off-season, a near-total
> butterscotch pall in-season casting the ground shadow) and a winter-pole cirrus
> hood (|lat|>64°, outside F1's band). F1 now skips near-uniform decks (std<0.02
> — the storm + Venus overcast), correctness pinned by an envelope on/off +
> rollover test (test:cloud 43, +7). **Recipes (C), reference-grounded:** Titan
> (orange emerges from the COEFFICIENTS — betaA blue≫red tholin absorption, not a
> gradient; a LONGITUDINAL seif dune belt via the new bedforms axis+latBelt
> knobs; a near-still methane sea via seaLevel + water.calm; Huygens ice
> cobbles), Venus (the near-total sulfuric deck IS a round-15 elevated slab
> reading pale-yellow from space, the shadowless sub-cloud ORANGE is the deep-
> column CO2 Rayleigh — TWO looks from ONE integral; 50×-Earth refractivity kept
> monotone by the round-16 saturated Bennett term), Saturn (a minimal pale-gold
> §11 disc — banded giant + rings are Phase 6/round 18). Titan's nested frame
> (Titan→Saturn→star) just works. **Two data-driven engine knobs (§6, not
> hacks):** bedforms `axis:'longitudinal'` (cross-wind phase + a symmetric
> profile with slipK overridden at its single binding so profMean tracks it —
> mean(prof−profMean)=1.6e-7; phA=0 + flattened seg keep ridges CONTINUOUS, the
> panel proved random phA chops them into barchan-dashes) and `water.calm`; both
> byte-identical for existing bodies. Plus the Venus-refraction saturation and
> the _dkMid occlusion-anchor fix (both no-ops for Tellus/Rubra). **First-light:
> Venus pale-yellow from space, the Mars global dust storm as a butterscotch
> pall with white cirrus poking through, the aurora over the night disc, Titan's
> orange surface gloom + Huygens cobbles, Saturn hanging pale-gold in Titan's sky
> — all render.** **Panels (rule 1: finders Opus / skeptics Sonnet):** pre-code
> (31 agents, 25 verified — 18 CONFIRMED / 4 MITIGATE / 3 REFUTED, killers dead
> on paper the fifth straight round: the storm rollover, the aurora atm-gate +
> star-gate + dkTr, the F1 variance collapse, the Venus refraction dead-band, the
> longitudinal-dune decorrelation, the city-lights LOD/firefly/hash quartet, the
> disc-atlas mip bleed, the Saturn palette crash) + a post-implementation
> critique that read the SHIPPED code, not the plan (16 agents, 11 verified —
> 10 CONFIRMED / 1 MITIGATE / 0 REFUTED, all fixed in-round: an emission
> DOUBLE-ATTENUATION by the deck-folded transmittance (~11x too dim), a
> pow(negative,2) GLSL UB, the aurora presence gate on .g only, Titan's betaA
> REVERSED — red-heavy, the cause of the dark blue-limbed disc; flipping it to
> blue-heavy made the disc a warm orange marble as the panel predicted — a Venus
> refraction dead-zone the result-floor alone left, a _dkMid guard that fired on
> ordinary Tellus/Rubra limb rays and broke their byte-identity, and the control
> classifiers under-tagging a pitched view). See bench/critique-round16.md.
> **Verified:** test:cloud 43 green;
> assets:check 13/13 legacy BYTE-IDENTICAL (the 3 new bodies deterministic, added
> to the manifest); 0 GLSL errors on the 6-body boot/settle; Titan bakes with a
> coherent longitudinal dune field. **Honest scope / registered:** Titan-from-
> orbit reads as a dark disc with an orange haze LIMB (the in-scatter is too dim
> at 9.58 AU to fill the disc — real Titan needs near-IR/RADAR; a non-gated
> breakpoint); titan-saturnrise proves the Saturn disc but framed it above the
> dune belt (pose refinement); the venus-deck-breakout ceiling is orange twilight
> without a distinct overcast lid. **Rings = Phase 6 (round 18).** Baseline
> re-promoted (tag `round-16`).
> **Registered forward (rule 3 → round 17, Fable per the model plan):** the
> round-14/15 mechanical queue unchanged where not shipped, PLUS the round-16
> content queue: Titan orbital-disc haze brightness (multiple-scattering fill),
> the titan-saturnrise dune-belt framing, the Venus deck-ceiling from below,
> aurora oval sharpening (curtain rays vs blotch), the Titan zenith-sky orange
> fill, the Titan §11 disc/far-point haze tint (fold a closed-form haze colour
> into bakeDiscMap), a Titan/Venus control-rotation entry, the rubra-blue-sunset
> settle budget (the alt-2m ground scene + Rubra's 2nd deck settles in ~114 s
> alone but exceeds the 160 s sweep budget under SwiftShader load), and the
> puppeteer Chrome-131 pin repair (149 operative via env override).
> **Status (build round 15, July 2026 — Fable-driven per the model plan):**
> **Phase 4 clouds core + the WebGPU checkpoint — the biggest new subsystem
> left, shipped through CONCEPT §8's own words: coverage is a FIELD, volume
> is a LOOK.** The reframe: the repo already held both halves — the round-12
> [global] grid discipline supplies the "coarse planetary raster" (as a
> 512x256 equirect per deck, generated per KEYFRAME in the worker: the
> ROADMAP [time-field] row verbatim — recipe-declared keyframes k=floor(t/τ),
> a fixed lerp, and advection as closed-form DRIFTED coordinates, per-deck
> lon phases computed in DOUBLE on the CPU); and `sunTransmit` IS §10's
> occlusion slot cloud shadow was promised — ONE factor (coverage along the
> sun ray, never the rendered cloud) reaches terrain, ocean (which had no
> other shadow wiring — the anchor board's shadows-on-the-sea came free),
> rocks, formations, impostors, every in-scatter step (crepuscular
> structure), and the STARS (night clouds extinguish the star field through
> the same spliced integral: 71 vs 159,859 bright pixels, witnessed). The
> deck integrator lives INSIDE scatterInline — no new pass, no compositing
> seam — as ONE estimator whose quadrature and tap LOD follow ray geometry
> (march ≤8 thicknesses + 3-tap Jensen-correct folds for the remainder and
> the far-limb re-entry): "distance chooses how the integral is computed,
> never what it converges to," with no rung thresholds to pop. **The
> pre-code panel (4 Opus lenses / Sonnet skeptics, 29 agents, 25 verified)
> caught killers on paper for the FOURTH consecutive round:** F1 keyframe
> BREATHING (independent per-k fbm draws crossfade into a 0.71x variance
> collapse every mid-frac — fixed: correlated keyframe evolution by
> coordinate advance, mid-frac variance ratio pinned >= 0.9, measured
> 0.95/0.98/0.97); F2 the one-integrand break (an unnormalized vertical
> profile ⇒ the SEEN cloud thinner than the shadow it casts — fixed:
> h(x)=6x(1-x) EXACTLY mean-1 with H=smoothstep as the one column law, and
> detailAmp <= 1 enforced so detail is exactly mean-1 with no clamp
> rectification); K1 the horizon slab fold (one midpoint tap on a 67-150 km
> grazing remainder diverges 10-43% by Jensen — fixed: the folds ARE coarse
> marches at footprint-matched LOD); F2-bench the "Luna byte gate" that
> wasn't (dmean is a whole-frame mean; the star pass is built ONCE so
> compile-unrolling can't protect it — fixed: uCloud* in `shared` with
> explicit switchBody else-resets + a real PIXEL gate); F3 the moisture term
> as a DC duplicate (amended by measurement: the shipped γ=0.007/128-sweep
> ocean sits near 0.4·prior with real fetch structure — the term is now an
> ANOMALY about a recipe mid-scale, global mean 0.002); H1 the ~3.3 s cold
> [global] build that would have blocked the main thread (measured — moved
> to a worker 'clouds' message; cloudPending joins the settle predicate).
> Recipes (§6, the deck LIST the Phase-4/6 clients need): Tellus = broken
> cumulus + thin cirrus veil (two decks prove the multi-deck schema); Rubra
> = ONE sparse high water-ice cirrus deck (the second agent, wildly
> different data — dust storms are round-16 content); Luna = NO clouds key
> (the structural negative control). §11 hand-downs: the companion disc
> samples the SAME equirect in the target's own frame at ITS drift
> phase/keyframe frac with the HG+MS split (never the ground's regolith
> kd); planetshine's disc albedo folds the LIT-VISIBLE-HEMISPHERE mean of
> the ALPHA law (never alpha of the mean coverage — Jensen, pinned 0.486 vs
> 0.494 disc integral). **First-light drove five measured look fixes:** an
> MS quasi-Lambert term (single-scatter HG left cloud tops 3-7x under-lit),
> detail-modulated within-deck self-shadow exp(-od·det) (the volume look's
> own light; ground shade stays coverage-only per §8), a hard clear floor
> (remap skirts of cov 0.1 slant-amplify x2-8 into whole-sky veils), 512x256
> + EDGE FRACTALIZATION (a near-binary field's boundary is a 78-km texel
> staircase — re-thresholding with the same detail noise carves it at cell
> scale, mean-neutral, shadow law untouched), and detail folding on ITS OWN
> wavelength (§7: the raster-LOD gate folded 20x too late — disc-scale
> speckle). The blue-marble disc now carries white synoptic cloud systems
> over blue ocean; the nadir tier reads as a satellite tile (popcorn fields,
> fractal deck edges, co-located shadows). Honest scope: eye-level
> broken-sky and cumulus-top texture need km-scale cell content
> (round 16 — the two new cloud scenes ship as breakpoints documenting the
> core's state; the round's cloud icons are blue-marble + loworbit-sunset,
> the tier the core owns). **The WebGPU checkpoint — DECIDED: DEFER,** on
> data: headless WebGPU scoring is PROVEN at render tier on the operative
> bench binary (Chrome 149; adapter+device+WGSL pipeline+readback,
> deterministic, on BOTH the RTX 5090 and --use-webgpu-adapter=swiftshader;
> the repo's old "WebGPU doesn't work under SwiftShader" claim is corrected
> — it needs the webgpu adapter flag, not the ANGLE one, and a secure
> context); the budget table's clouds row costs <= 0.4 ms of render on the
> RTX 5090 (7.7 ms worst pose vs the 10 ms budget; SwiftShader pays up to
> +165% on sky-heavy poses — a bench cost, settle budgets hold); froxels
> were NOT needed (the deck integrator fits the one-integral architecture);
> the port cost is the whole raw-GLSL stack + a three pin bump. Re-open
> triggers recorded (hardware render row biting, a Phase-5/6 froxel/compute
> need, a forced three bump); the decimation vertex-budget rider inherits
> the deferral. **Rule-3 residue shipped:** the formation build-wave
> prefilter (the closed-form lattice-existence test at enqueue — candidate-
> free tiles go straight to built-empty) and the tellus-tor first-light
> scene (the located 23 m tor + strata scarp at -42.99/15.69, closing the
> formation two-body bench gap). **Bench honesty, the round's discovery:**
> the new Luna PIXEL gate measured what dmean 0.000 always hid — settled
> SwiftShader captures are NOT bit-reproducible (same-code run-vs-run
> envelope maxDiff ~215, the AE servo's ±1-LSB exposure quanta scaling
> every pixel) — so the negative-control gate is now an ENVELOPE gate
> (current-vs-baseline must not exceed run-vs-run noise; it doesn't, and
> the cloud code was exonerated by the same-code A/B). Controls are
> classified per-POSE by closed-form coverage-in-view (the M5 rule — the
> blanket per-body exemption was panel-killed); the clearsky σ(0) witness
> renders PIXEL-EXACT clouds-on vs clouds:false at a located zero-coverage
> pose; the GPU alignment witness reads mode-8/9 shadow/coverage back
> within 0.0012 of the JS twins. Verified: 10 Node suites green (NEW
> test:cloud, 36 asserts: keyframe determinism + rollover byte-continuity,
> the F1 variance-ratio law, the F2 column law, the K1 fold-vs-march
> convergence + the killed single-midpoint divergence, the moisture anomaly
> laws, schema incl. detailAmp <= 1, Luna null, drift/wrap/time
> continuity, the planetshine alpha calibration); assets:check 14/14;
> motion A/B — legacy paths BIT-FLAT with clouds:false (descent
> 0.8525→0.8525, orbit-pan 0.021→0.021, flicker 0.001085→0.001051), the
> clouds-on content baselines re-established post-panel-fix (descent
> 0.9357, orbit-pan 0.1055 — cloud edges under pan; ocean-fixed now sits
> under cloud shade, flicker 0.0001 — the instrument's pose is registered
> for relocation), NEW cloud-drift (metered run 0.00304 vs the
> PRE-REGISTERED <= 0.00315 ceiling; at fixedEV the WORLD's own
> crossfade+advection flicker is 0.000398 — the panel proved the metered
> headline was AE pumping, and the correlated-evolution law is what keeps
> the world quiet) and cloud-approach (0.746 vs the 0.6784 clouds-off
> control: the deck crossing adds ~0.07 pop, orbit-pan-class quiet);
> sweeps 74 stills x2 (pre/post-panel-fix), 0 page errors, 0 under-settled
> (fresh-page retries recovered); final control gate — 5 expected-delta by
> closed-form coverage-in-view (honest cloud deltas up to dkurt 900),
> rubra-night 0.000x4, the two Luna controls inside the measured capture
> envelope (dmean 0.014/0.009). **Panel** (35 agents, 7 Opus lenses / Sonnet skeptics; 28
> verified — 18 CONFIRMED collapsing into FOUR root causes, all fixed
> in-round): (1) grazing SUB-NYQUIST detail — open-ocean-orbit rendered the
> deck as per-pixel static (HF-probe 8.63 vs 0.17 clouds-off, a 50×
> clouds-lever differential); TRUE mechanism: the fold's footprint ignored
> ray OBLIQUITY (a ~4× stretch at grazing incidence) — fixed with the
> obliquity-true footprint + quarter-wavelength fold saturation (post-fix
> 1.55; every witness ≤ 0.8); (2) BLACK-STAIN shadows — the deck removed
> direct flux and returned nothing; fixed with `cloudFill`, an
> energy-bounded overcast downlight in every material's ambient
> (redistribution, never conjured); (3) SUNWARD WHITEWASH — earthrise's
> companion disc as a white ball + the loworbit limb blowout; fixed by
> coverage −15%, a softened forward lobe, and blue-marble spot→center (a
> drifting cloud under the spot re-exposed the disc −17%; documented
> camera-semantics change) — earthrise reads marble again; (4) keyframe
> ROLLOVER DROPOUT in free-run — fixed by the rollover-continuity law
> itself (the previous pair at frac=1 IS the next at frac=0). The panel's
> negative result: the [time-field] mechanism held under all three mandated
> attacks (no render-level breathing, live advection matches the drift law,
> GPU witnesses match the twins). 4 adjudicated to families, 6 REFUTED
> (incl. the luna "recolor" negative-control attack — exposure family).
> See bench/critique-round15.md. Baseline re-promoted (tag `round-15`).
> **Registered forward (rule 3 → round 16, Opus per the model plan):**
> the round-14 mechanical queue unchanged where not shipped (R4 mare-frame
> joints — groundwork intact; bake-side formation ground-response; the
> formation far-field shadow gap; contact-decal under-overhang darkening;
> R5 water.windDeg fetch; polar-cap margin lace; Luna mare-flow
> strata-in-plan — its moiré-AA blocker has now held a round; L14 far-field
> stipple calibration; the decimation look-tune rider; ridge legibility,
> still lacking a metric; SDF+MC genus-1 archetypes; the round-8
> master-joint/quantization rows stay pointed at a future ground-texture
> round per DESIGN's register) PLUS the round-15 cloud-content queue:
> km-scale cumulus-cell erosion with mean compensation (the eye-level
> broken-sky look), cloud-top height modulation (the sea-of-clouds look),
> the orange horizon band at eye/above-deck tiers (needs a mechanism
> diagnosis, not a tune), loworbit forward-scatter exposure + limb shadow
> texel steps, the ocean-fixed flicker pose relocation, multi-deck content
> (storm systems, dust storms, aurora/lightning per exec row 16), and the
> bench-housekeeping pin repair (the puppeteer-declared Chrome 131 cache
> entry is broken; 149 is the operative binary via env override).
> **Next: round 16 = Phase 4 content + Phase 3 recipes — run on Opus** (exec
> row 16: aurora, lightning, dust storms, polar hoods; Titan +
> Venus recipes as data on this round's deck-list schema).
> **Status (build round 14, July 2026 — Fable-driven per the model plan):**
> **Beyond the heightfield: the non-heightfield geometry class + the
> mesh→impostor→roughness ladder + displacement-decimated sculpts.** The
> reframe: the rock sculpt is a CLOSED FORM (radiusAt(direction)), so every
> ladder rung is a sampling strategy of one function — the decimated sculpt is
> a better sampler, the impostor a cruder one, and §7's hand-downs hold by
> construction. Three simplifications killed whole risk classes: the arch is a
> swept tube with buried footings (grid triangulation, genus 0 — no marching
> cubes); the quadric decimator uses SUBSET placement (every output vertex is
> byte-identical to a source vertex — on-surface silhouettes, zero-tolerance
> tests); the L14 impostor build resolves density/height/meso through its four
> L15 CHILDREN, so the rung handoff swaps sampling strategy, never facts (the
> Node partition test passes with EXACT 3D-anchor equality). **The pre-code
> panel (4 Opus lenses / Sonnet skeptics, 27 agents, 23 verified findings)
> caught FIVE killers on paper — the discipline's third consecutive round:**
> K1 a raw-radiusAt hull map drops the slab squash + fit transform (impostors
> would render as round blobs that pop to flat discs — numerically reproduced;
> fixed: hull maps bake FROM the finest-LOD mesh in fit space, one code path
> for rocks AND formations); K2 the formation bedding key was constant at
> formation scale (bedT0 650–900 m vs 10–40 m hoodoos — one flat bed; fixed:
> FORM_FRAG selects octaves from the SAME recipe family T_k = bedT0·bedLac^k,
> footprint-adaptive, country-rock path untouched); K3 the closed-form caprock
> predicate was decorrelated from the visible ledges (octave residency +
> post-thermal drift; fixed: placement gates on the BAKED riser-exposure
> `rock` field procStrata writes at cap time); K4 the R6 basin flood would
> have flooded Rubra's Hellas-class basins with mare (fixed: a per-body
> provinces `basinFill` scalar, Luna only, byte-identity assertions); K5 the
> impostor→mesh handoff had a systematic VERTICAL pop the ownership test was
> structurally blind to (mesoRamp(14)=0 + L14-raster anchors; fixed: option A,
> anchors snap via the L15 children at mesoRamp(15) — bit-exact with the mesh
> successor). Shipped: **formation archetypes** (ground plan L5) — hoodoo
> (caprock over eroding neck, per-bed ledges), undercut outcrop, buried-
> footing arch (H2: BOTH footing grades sampled at the declared field level,
> over-slope candidates rejected), calved-block fields (G3-iv: rock-archetype
> clusters keyed off the formation hash — debris traces to its source);
> placed by the scattercore lattice discipline gated on baked fields (riser
> rock × recipe gate × slope window × not-ice), PLUMB orientation (bedding
> horizontal, the ê⊥dir class impossible), FORM_FRAG = rock lighting + baked
> overhang AO (the under-arch darkening the tile atlas cannot know) + the
> strata-family bed tone; Rubra strata agent (hoodoos/outcrops/arches at the
> emergent cluster lat −12.85 lon −76.83) + Tellus bedrock-outcrop agent (H4
> discharged at a LOCATED site: a 23 m tor at −42.99/15.69); Luna has NO
> formations block — registered honestly as "no agent authored this round"
> (H3), not dressed as a derivation. **Displacement-decimated rock sculpts**
> — subdiv-5 source (20 480 tris) through the UNCHANGED shapeFn, cascade-
> decimated to the SAME budgets (5120/320/80): identical vertex cost,
> triangles at the smin creases (measured: max support-function error 2.8×
> lower at the 320-tri tier); aDir and the limit-surface maps work unchanged
> (subset placement); ~1 s at load, runtime stays build-free. **The impostor
> rung** (Appendix C row, CONCEPT §7's ladder sentence built): L14 band tiles
> draw ONE merged InstancedMesh of camera-facing quads (per-instance aVar/
> aHullR attributes — no per-bucket draws), the fragment ray-marches the
> fit-space HULL in the instance's own anisotropic frame (M1: normalized
> sphere proxies flatten slab lighting), lighting = ROCK_FRAG's mean terms
> (mottle/patina/contact-AO fold to their means at 2–6 px, §7), discard
> cutout + log-depth (stars still occlude), NOT a shadow caster (the band
> sits beyond the metre-shadow box); the terrain conservation share flips on
> for band tiles with that level's floor — the existing closed form hands
> exactly the impostor-carried budget out of the ground detail. Live proof:
> 1,645 impostor instances drawn at a Rubra band pose (Luna's
> rung engages under budget pressure/dpr-2 — the register's own case).
> **Rule-3 residue:** R6 SHIPPED — forEachBasin gains a per-basin closed-form
> `fill` law ((1−0.7·deg) — the SAME shape the stress law weights mascon
> loads by, so flooded ⇔ ridge-bearing BY CONSTRUCTION); procProvinces adds a
> basin-centred flood term (arc in metres, height-gated, noise-mask-bypassed)
> behind Luna-only `basinFill`; the round-13 "mare≡0 across the largest
> ridge-bearing basin" is now mare 0.29 co-located with its deg-attenuated
> ridges; downstream chain (resurfacing SFD, youth, strata gates, disc)
> inherits automatically; tect-test pins co-location + coverage bounds
> (26.8%) + the Rubra structural control. Joint/shadow grazing moiré
> AA — the zero-mean joint carriers (plate tone, coplanar damp, groove bump)
> fold at a STRICTER footprint gate (at fw≈S the old gate passed 84% of their
> amplitude into the maximum-aliasing band); localShadow gains a map-texel
> footprint fade →1 handing the mean to the baked octant field through the
> existing min() (VERT_STAGE-guarded; rocks inherit by construction).
> Biome/wetness magnification fade (the F4.g class remaps widen symmetrically
> ONLY under extreme near-field magnification — the panel caught the first
> gate leaking a mottled wet band onto mid-distance dunes, tightened to
> texels ≳8× screen-magnified; elsewhere BIT-identical, edges recover at k=1). Blue-marble disc legibility: `meter: 'spot'` scene
> data (the centre-weighted meter averaged space into the target and the
> highlight servo pinned land onto the ACES shoulder) — a DOCUMENTED
> camera-semantics change, icon re-baselined, controls keep the default
> meter. Harness: __shot resolves {settled, ms}; an unsettled capture retries
> ONCE on a fresh page (same-page retries measure cache warmth — M6) then
> fails LOUD (the round-13 boulder-flake class is now impossible to score);
> new build pipelines feed the settle predicate; a live-probe-caught
> arrival-gap LIVELOCK (children evicted at lastUse 0 before the band build
> claimed them — H1's second half) fixed with a derived parenthood pin in
> evict(). Ridge legibility REFUSED this round (rule 2: no principled
> pre-registered target). Verified: 9 Node suites green (new test:mesh —
> decimator manifold/χ/subset/determinism, hull-vs-mesh silhouette + slab
> anisotropy K1 guard, formation solids, the K5 partition test with EXACT 3D
> anchors; tect-test +4 R6 checks; contract auto-covers provinces);
> assets:check 14/14 deterministic (+2 formation packs; the M8 manifest-extra
> symmetry direction added); probes: formations at the emergent cluster
> (overhung outcrop casting its own shadow, caprock hoodoo, 71-block calved
> field tracing to its ledge), settle honesty (the formation scene settles at
> ~165–295 s where it previously NEVER settled), the Luna "bald plain" A/B'd
> byte-adjacent to round 13 (the registered high-sun photometry family, not
> a regression); motion A/B BIT-FLAT on the legacy paths (descent 0.8525→0.8525, orbit-pan 0.021→0.021, ocean flicker 0.001005→0.001085; NEW impostor-approach paths on Luna AND Rubra — H5); sweep
> 69 (+1 first-light R6 witness merged post-panel) stills (overhang-gallery FIRST-LIGHT — no r13 baseline row,
> panel-only this round), 0 page errors, 4 recovered by the fresh-page retry; 4 formation-wave under-settles re-rendered SETTLED after the time-boxed drain fix and merged (scheduling-only — content identical)
> fresh-page retries; control gate CLEAN (dmean 0.000 on all 8 same-day controls; control-6 = a dark-crescent metering-family wobble on a degenerate denominator, adjudicated quality-neutral) (controls pre-classified for R6
> basin overlap gate separately — M5). **Panel** (29 agents,
> finders Opus / skeptics Sonnet): 22 verified findings — the panel caught what every probe missed: formations floating over refined terrain (TRUE root cause found by live instance-walk + debris bisect: applyCamera never positioned the formation groups — one line; plus two secondary holes: the forms early-hide and the settle-wave drain) and near-black formations (INWARD mesh winding, outward fraction 0.06–0.12 — the orientation test rocks had and formations lacked), both fixed in-round with four batch fixes (slope-aware burial, K2 bed-tone amplitude + brightness trim, the magnification-fade gate tightened off the mid-field, the R6 witness scene added); 1 REFUTED; the decimation interior-detail trade documented; the L14 band residue VERIFIED CLOSED. See
> bench/critique-round14.md. Baseline re-promoted (tag `round-14`).
> **Registered forward (rule 3 → round 15, Opus where mechanical):** R4
> mare-frame joints (the R6 unification now provides the coherent per-basin
> data a uBasin[K] frame hangs off — the groundwork this round built);
> bake-side formation ground-response (talus ring / horizon stamp — the pure
> placement law makes it possible; a second seam, not forced); the formation
> far-field shadow gap (beyond the metre-shadow box the baked horizon field
> cannot know a formation); contact-decal under-overhang terrain darkening;
> SDF+MC genus-1 archetypes (windows/double arches); R5 spatial water.windDeg
> fetch (recon design banked); polar-cap margin lace (in-shader temp-contour
> design banked; §11 disc-side constraint documented); Luna mare-flow
> strata-in-plan (blocked on the moiré AA holding a round); ridge legibility
> (needs a pre-registered metric); the round-8 master-joint octave +
> per-plate quantization rows re-pointed here (their "round-14 texture-stack
> pass" pointer was stale — no such pass exists this round). **Next: round
> 15 = Phase 4 clouds core + the WebGPU checkpoint — run on Fable** (exec
> row 15; the biggest new subsystem left).
> **Status (build round 13, July 2026 — Opus-driven per the model plan):**
> **Phase 2 mechanical residue — appearance CONSEQUENCES over the round-12
> context fields.** The reframe: none of the six exec items needed a new atlas
> field — Whittaker, seasonal cap, strata-in-plan, space weathering and wetness
> are in-shader looks over existing baked channels; inverted relief computes
> induration as a transient inside one bake-time process. Both L6 spares stay
> free. The one enabling primitive: a GLSL `noise3`/`fbm3` that reproduces
> mathx bit-for-bit (the shader `vhash` IS `hashi`), unlocking the in-shader
> strata fold + the Whittaker temperature. **A pre-code adversarial design
> review (3 Opus lenses / Sonnet verify, 21 raw findings) caught the round's
> silent killer on paper — the round-12 discipline holding a second time:**
> keying space weathering on `youth` is DEGENERATE on Luna (youth is mare-only
> there — no edifice/rift — so it bakes to a constant across the highlands AND
> at every fresh crater while all determinism tests pass, the ê⊥dir class
> exactly). Fixed pre-code: maturity keys on the `fresh` field x slope (real
> spatial variance). Eight further MITIGATE findings were all applied (the
> companion-disc cap frame `dot(uBodyR1,uBodySun)`, the strata footprint gate,
> the halo-safe per-output-cell resurfacing gate, the inverted-relief mid-flow
> band, recipe-sourced strata uniforms §6, the byte-identical controls).
> Shipped: **Whittaker biomes v2** — temperature x moisture -> biome-CLASS
> palette (cold taiga / temperate / warm tropics along temperature; ARIDITY
> desaturates toward dry-steppe tan — hot+wet stays lush, only hot+DRY goes
> tan, the calibration the first two probes corrected) with wide ecotones;
> temperature is recomputed in-shader from procContext's exact closed form
> (up.y, vHeight, the noise3 wobble) so the biome bands agree with the baked
> snow line (§5, colour-only). **Seasonal volatile cap** (the top whole-disc
> cue) — a render-time frost overlay = pure fn(latitude, closed-form subsolar
> declination `uSunDir.y`, which is spin-invariant ⇒ purely seasonal): the
> winter-hemisphere cap advances equatorward and retreats each summer, on the
> ground AND on companion discs (SKY_FRAG, own-frame declination) sharing ONE
> seasonalFrost() so §11 holds by form; Rubra CO2 (dramatic), Tellus H2O snow,
> Luna none (airless control). **G2 strata-in-plan** — the procStrata fold
> recomputed in-shader (fbm3 matches the bake) and coloured by fold-frame
> elevation band, gated by slope x the recipe gate field x a footprint gate (no
> colour-without-relief at coarse LOD, D2); layered beds read on canyon walls
> and scarps. **Space weathering from age** — airless maturity darkens gardened
> flats while fresh rays + steep faces stay immature (Luna agent; Tellus/Rubra
> weatherK=0 controls). **Inverted relief** (`procInvert`, new) — ancient dry
> indurated paleochannels stand up as sinuous ridges: an ADDITIVE position-pure
> raise of the resistant network on a MID flow band (excludes the incised
> thalweg so it does not fight incision, D4), gated dry x old; prints ~200 m
> ridges on Rubra's ancient highlands, byte-identical off the paleochannels.
> **Wetness** — moisture darkens + glosses the ground (the shoreline band folds
> into one path); Tellus water agent, dry bodies byte-identical. **Rule-3
> residue:** deflected-wind moisture (R1 — the advection wind now bends around
> range-scale relief, so orographic rain shadows wrap around the edifice/ranges;
> instrumented, moves the field maxΔ 0.39 on Tellus, deterministic),
> resurfacing-age crater SFD (R3 — the accept stays a pure fn of (anchor,seed);
> each small crater's EXPRESSION is faded per OUTPUT cell by the local `mare`,
> halo-safe, so maria carry subdued craters, byte-identical off-mare, D3),
> crater-scale lee streaks (R2 — a finer wind-vector consumer). **Registered
> forward** (investigated, don't force): R6 flooded-basin ridge gate — Luna's
> stress-source basins and its provinces-maria are DISTINCT populations (mare
> is identically 0 across the largest ridge-bearing basin, instrumented), so a
> mare-keyed ridge gate has no co-located features; unifying the populations is
> structural, round 14. R4 mare-frame joints — a §5-safe body-fixed orientation
> needs field gradients or per-basin uniforms (screen-space dFdx would be
> view-dependent), round 14. Also registered: ridge legibility (a lighting/
> contrast tune), R5 water fetch field, polar-cap-margin lace. Verified: 8 Node
> suites green (contract on every process incl. the new `invert` — halo/cross-
> face/finite/deterministic all auto-covered; the new `test:climate` suite pins
> inverted relief additive+gated, resurfacing subdues-maria + byte-identical-
> highlands, deflected moisture wired + deterministic) + assets:check (12; disc
> re-baked for the Whittaker mirror); probes 0 page errors (Whittaker green/tan
> gradient after two dry-threshold calibrations to Tellus's compressed
> moisture scale; seasonal cap advance/retreat on both bodies; strata bands on
> the uplifted scarps; inverted-relief ridges); motion A/B BIT-FLAT (descent
> pop 0.852→0.8525, orbit-pan 0.0211→0.021, ocean flicker 0.001003→0.001005 —
> the new inverted-relief geometry + every shader look add ZERO LOD pop); final
> sweep 68 stills, 0 page errors; control gate CLEAN (all 8 controls dmean ≈
> 0.000 vs a same-day git-stash-A/B round-12 baseline — the date-seeded
> controls are only meaningful re-rendered like-for-like; the dkurt/dslope
> deltas are the world responding to biomes/strata/resurfacing/invert, not
> exposure drift). **Panel** (12 agents, finders Opus / skeptics Sonnet; 6 raw
> — the two RISKIEST new mechanisms cleared with ZERO findings: the seasonal-
> cap §11 disc/ground agreement AND the inverted-relief incision-fight both
> survived): the HIGH "boulders vanished on Rubra" attack was REFUTED as a
> one-off bad capture (the 68-shot single-page sweep leaks state; an isolated
> re-render is boulder-complete); the blue-marble Whittaker-illegibility is a
> PRE-EXISTING disc-exposure crush (byte-adjacent to round 12 — the biome mix
> reads at eye level, the probes confirmed); the near-field biome stipple + the
> Luna near-field softening register as the texel-quantized-moisture / tile-
> settling capture family. No round-13 code defect confirmed. See
> bench/critique-round13.md. Baseline re-promoted (tag `round-13`). **Next:
> round 14 = Phase 2 beyond-the-heightfield + impostors — run on Fable**
> (formation archetypes: mesas/hoodoos/arches/overhangs; the impostor ladder
> for the registered over-budget poses; plus round 13's residue: R4 mare-frame
> joints, R6 flooded-basin ridge (unify the stress-basin + mare populations),
> blue-marble disc-exposure biome legibility, near-field biome/moisture texel
> fade, ridge legibility, R5 spatial water.windDeg).
> **Status (build round 12, July 2026 — Fable-driven per the model plan):**
> **Phase 2 oriented structure — terrain stops being isotropic noise and
> starts being CAUSED.** A pre-code adversarial design review (3 Opus lenses
> vs the repo) caught the round's would-be silent killer on paper: the
> oriented-stamp phase `s = R·(dir·ê)/λ` with a per-cell-tangentialized axis
> is IDENTICALLY ZERO (ê ⊥ dir — the round-9 diamond-cross-hatch trap,
> re-derived) — every dune, wrinkle ridge and graben would have baked to
> nothing while every determinism test passed. Shipped: **wind/stress/youth
> context fields** (atlas layers L5/L6; wind = the moisture pass's zonal
> prior promoted to a first-class [global] output in body-fixed Cartesian,
> + terrain deflection (the registered round-3 residue) + windward/lee
> exposure; the wind rasters carry a MIP pyramid and tiles sample them
> footprint-matched — a rough field point-sampled into 275 km texels aliased
> into a disc-scale reticulate MAZE and was level-dependent (§5+§7 at once);
> the maze was mode-diagnosed by a field-roughness transect after two wrong
> hypotheses: exposure must read RANGE-scale relief, the moisture pass's
> calibration lesson re-learned). **Tectonism** — a closed-form two-source
> stress law (swell dome: hoop extension → radial grabens + the rift;
> flexural periphery → concentric ridges; MASCON loads re-derived from
> exactly the basin lattice stampCraters draws: interior compression →
> concentric wrinkle ridges, margin extension → arcuate rilles) with
> anisotropic ANCHORED-WAVE-PACKET stamps (Gabor form; anchor-relative
> phase — the absolute projection decorrelates at R/λ ≈ 1e4 sensitivity and
> cancelled ×0.42 of the amplitude, instrumented; alignment-weighted
> envelopes — orthogonal packets otherwise superpose into right-angle
> PLAID). Two-body gate: Rubra swell agent vs Luna basin agent, one
> eigen-rule; Node suite verifies the SIGNS and AXES; Luna highlands far
> from mascons bake byte-identical with the process removed. **Coherent
> bedforms**: dune systems along the [global] wind (slip-face asymmetry on
> the true wind vector, defect merging where the field turns, supply =
> catena fines + a lee-lowland regional erg term), located by supply×wind
> (the first probe site sat on the zonal node at lat ±30 — wind matters);
> Tellus polar MEGADUNES on the ice sheet are the second agent; windless
> Luna is the structural negative control (no global entry ⇒ zero
> channels). G4 eye-level ripples now orient by the baked wind — the
> sub-raster octave nests under the baked dunes. **Singularity remainder**:
> winner-take-all edifices (24-point seeded Fibonacci candidates, swell^1.5
> × hash, min-separation — a Tharsis-class trio EMERGES; Tellus gets one
> glaciated hotspot highland whose equatorial summit ice falls out of the
> climate context) and ONE rift (8-azimuth WTA off the swell pole — it
> emerged radial from edifice #1's flank: Valles-from-Tharsis adjacency
> from pure statistics), with a band-limited WALL LADDER (a single coarse
> stamp put the 20 km wall inside one cell — upsample smeared it to a 9°
> sag; each level re-stamps the profile difference, converging to ~21°
> walls that strata stressK terraces). **Consequence-chain albedo**: scour
> (windExpo × youth) darkens young wind-swept basalt — Syrtis-class
> provinces EMERGE over the dichotomy lowlands — and mantling brightens lee
> + edifice-class heights; mirrored exactly in bakeDiscMap (§11: the disc
> face and the ground agree; procAge runs [2,19] so the level-2 disc
> carries the same youth). The Rubra disc has a FACE. Probe-driven fixes:
> Rubra lapse 4.5→2.2 K/km + iceTemp −80 (the Earth-like lapse iced every
> edifice summit into blown-white blobs), wrinkle ridges to real-Moon
> amplitude, worker cache 400→300 (+142 KB/tile of new fields vs a
> documented allocation ceiling). Flow/moisture REACT to the new coarse
> topography (edifices/rift sit in the [global] prefix) — reclassified from
> bug to feature: drainage routes around a Tharsis; Tellus content deltas
> are the world responding. Verified: 7 Node suites green (contract 275
> checks; the NEW tect suite pins the eigen-rule's signs/axes on both
> agents + every byte-identity negative control) + assets:check (12; disc
> maps re-baked); motion A/B descent/orbit-pan pop BIT-FLAT (0.852/0.0211),
> ocean-fixed within content response; probes 6 iterations, 0 page errors;
> final sweep 68 stills, 0 page errors, control gate CLEAN (8× dmean 0.000
> vs a SAME-DAY re-rendered round-11 baseline — the controls are
> date-seeded, so the git-stash A/B re-render is what makes the gate mean
> anything). **Panel** (31 agents, finders Opus / skeptics Sonnet; 3
> confirmed + 4 softer from 13 raw): the HIGH "dunes on windless Luna"
> attack on the negative control was REFUTED code-level and pixel-level;
> the luna "scratches" traced to the round-4 crater-ray system (correct
> stratigraphy — rays cross maria); every confirmed item is a pre-existing
> family or the round-11 scheduler's over-budget-pose class. No round-12
> code defect survived. See bench/critique-round12.md.
> Scenes: `rubra-disk` + `rubra-dune-sea` icons + 3 breakpoints posed at
> the EMERGENT locations (read off the build, never authored);
> `rubra-canyon-dawn`'s round-4 note ("no canyon yet — becomes real with
> Ph2 singularity") is discharged — the icon now stands on the rift rim.
> See DESIGN.md "Build round 12". Baseline re-promoted (tag `round-12`).
> **Next: round 13 = Phase 2 mechanical residue — run on Opus** (Whittaker
> biomes v2, seasonal volatiles, G2 strata-in-plan, space weathering from
> youth, inverted relief, wetness; plus round 12's rule-3 queue: deflected-
> wind moisture, crater density × youth resurfacing, dune/tect parameter
> calibration, mare-frame joints, crater-scale lee streaks).
> **Status (build round 11, July 2026 — Fable-driven per the model plan):**
> **Phase M core.** Recon reframed the round: the SSE split metric and the
> binary per-instance rock fold already existed — the open work was every
> place two REPRESENTATIONS meet. Shipped: **per-vertex CDLOD geomorph**
> (morph = pure fn of vertex camera distance; the invariant chain is DERIVED
> from the split metric — the amp term is undiscounted and kSil only splits
> earlier, so a level boundary always sits at morph 0 = the parent's exact
> surface: the registered per-tile-scalar NOTCH is structurally impossible);
> **stream-in crossfade** (complementary screen-anchored stipple between a
> fresh tile and its co-drawn parent — exact pixel partition, no z-fight;
> WALL-CLOCK fade, 0.28 s — a frame-count fade smeared stipple churn across
> the motion bench's capture pairs, 4× on orbit-pan pop before the clock was
> fixed); the **honest request scheduler** — ONE error currency, NINE probes,
> FIVE root-caused failures (NaN sentinel; blind-window stampede → closed-
> loop 128-outstanding cap; covering-rule nonlinearity → misses inherit the
> COVERING tile's error, breadth-first ties; the panel-caught warm-cache
> freeze → value-ranked preemptive rebalancing, displayed-earlier-epoch tiles
> reclaimable at one-level-fallback error with deferred disposal; seed-corn
> churn → pose-EPOCH gate + absolute suffering floor). The display now
> self-balances to the uniform-SSE equilibrium; the round-10 BASELINE's
> display-starvation artifacts (pavement-walk-luna's blown coarse-tile WALL,
> coast-archipelago's MISSING islands) render resolved. **Scatter hand-down
> completed**: the 800 m radius is gone (build gate = footprint of the
> largest clast — trails the per-instance fold, no edge at any FOV);
> per-level build floors on the morph's own invariant; size-sorted draw-range
> culling; fold τ 1.8→2.2 px paid for by the new CONSERVATION term (ground
> rockDensity detail yields the closed-form resolved-area share — no more
> double-count). **Filtered-normal folding** (the thrice-misattributed
> grazing carpet, at its TRUE cause): mesh normals fold to a smooth
> undisplaced twin as the meso wavelength's projected footprint collapses;
> the folded variance re-enters the direct term as a Gaussian shoulder
> (µ0_eff = σ·h(µ0/σ)) + Toksvig spec. Instrumented: pavement-walk-luna
> dark-spike 6.96→4.78 %, boulder-macro-luna 9.39→4.47 % (kurt 68→18),
> beach-eye's checker WALL gone; two-body gate held (Rubra/Tellus flat).
> **Star occlusion by terrain**: one scene-depth tap per star (MSAA-safe);
> luna-knife-edge grad-kurt 1026→178, stars stop AT the boulder silhouette.
> **Panel** (27 agents, finders Opus / skeptics Sonnet; 8 confirmed + 1
> softer): caught the warm-cache freeze the driver's fresh-cache probes
> structurally could not see (its stills come from the SEQUENTIAL sweep);
> the rest were pre-existing registered families or metering consequences of
> honestly-richer displays (controls dmean ≈ 0). Verified: 6 Node suites,
> assets:check (12), motion A/B (orbit-pan pop 0.0194→~0.02 flat, ocean
> flicker ≤ baseline, descent flat), final sweep clean + control gate clean.
> Registered: Luna's L14 boulder band (2–6 px, 0.95–1.9 km) wants the round-14
> impostor ladder; descent-streaming update EMA ~5 ms vs the 4 ms budget row
> (report-only until round-15 WebGPU). See DESIGN.md "Build round 11".
> Baseline re-promoted (tag `round-11`). **Next: round 12 = Phase 2 oriented
> structure — Fable (splittable: field infra + basic stamps are Opus-grade).**
> **Status (build round 10, July 2026 — Opus-driven per the model plan):**
> **Material texture stacks v2 + Water v2.** Recon reframed the round (as round
> 9): Water v2's **broadband wind-sea + swell spectrum**, LEAN glint fold,
> per-pixel bathymetry and shoreline soft-blend were **already built in rounds
> 2–3** — so round 10 landed the open items. **Material stacks** (`matstack.js`
> NEW): four tileable per-material detail archetypes (regolith fines / cracked
> basalt / duricrust / firn), baked deterministically into the round-7 asset step
> (`shared/matstack`, hashed), each texel co-registering albedo/relief/roughness/
> AO; `TERRAIN_FRAG` samples them with a §7 CONTINUOUS hash-rotation (mipmapped →
> automatic mean-preserving fold), driving micro-relief, co-registered albedo, and
> a now-**spatially-varying GGX roughness** (was a scalar). A two-fade discipline
> holds the relief→normal term to the near field, and on AIRLESS bodies the whole
> stack is gated hard down (the harsh unfilled sun binarizes micro-detail — the
> round-9 lesson). **Water v2**: **Cox-Munk glitter** (the panel confirmed the
> registered airbrushed-column glint is GONE — it now resolves into discrete
> sparkles), depth-and-slope-driven surf, sediment plumes, wind-driven spectrum
> azimuth + crossing swell trains. Two new eye-level water scenes
> (`ocean-sunset-glint`, `coast-archipelago`) via new `find-ocean`/`find-beach`
> height-query helpers. **The round-10 panel** (18 agents, Opus finders / Sonnet
> skeptics per rule 1; 5 confirmed + 2 softer) caught two REGRESSIONS — Rubra
> duricrust lost intra-plate grain (f3 grain restored on filled bodies); the Luna
> floor gained a comb+pepper (airless stack gate; dark-spike density back to the
> round-9 level, normal-map-confirmed as pre-existing meso self-shadow) — plus the
> coast corduroy (crossing swell trains, grad-kurtosis 191→93); all fixed +
> verified. 6 Node suites green, `assets:check` reproduces all 12 artifacts, final
> 63-scene sweep clean (0 page errors), control gate clean (material detail added
> no exposure shift: dmean ~0). See DESIGN.md "Build round 10". Baseline
> re-promoted (tag `round-10`). **Next: round 11 = Phase M core — run on Fable.**
> **Status (build round 9, July 2026 — Opus-driven per the model plan):**
> **Phase 1 photometry remainder.** Recon reframed the round: the BRDF library,
> MS LUT, atmospheric refraction, sky-ambient-from-LUT, whole-disc ladder v2,
> eclipse/transit machinery, planetshine, night-sky v2 and the physical-camera
> post pass were all **already built and wired across rounds 1–3** (the recipe
> even carries the `brdf` and `refrac` data). Round 9 landed what was genuinely
> open. **Airless fill cluster** (`shaders.js`/`atmo.js`): an opposition-surge
> SHOULDER (`1 + B0·B/(1+0.5·B0·B)`) so high-sun regolith lands below clip
> instead of the round-8 "featureless white" (verified luna-highsun p95 0.53,
> textured); an isotropic airless ambient floor (the `!atm` branch was a hard
> zero) that SATURATES once the sun clears the horizon; the sunlit-neighbour
> bounce re-gated on `smoothstep(sinEl)` (the old `max(sinEl,0)` died at grazing
> sun); and a slope-scaled metre-scale-shadow bias. **The rule-2 win:** the
> airless "black-pepper carpet" and the beach "checker band" had each been
> misattributed TWICE (round 6: bump octaves + cavity; round 8: catena rock
> boost) — round 9's first instinct (an fwidth roll-off + a fines floor) made the
> metrics WORSE (beach kurt 27→81), so the **diagnostic modes** settled it: the
> band lives only in the LIT frame (albedo/normals/horizon-shadow all smooth) =
> the direct term `mu0` self-shadowing the ~4 m meso relief at the terminator,
> under-filled. The speculative changes were reverted; the fill terms soften it
> (normal-sun luna reads clean, kurt 15) and the grazing-facet aliasing residual
> is routed to **Phase M filtered-normal folding (round 11)** against its TRUE
> cause. **Honest refracted-annulus integral** (`atmolut.js`): the copper ring
> is integrated over impact heights with amplitude from recipe refractivity
> (Tellus bright copper, Mars almost none, Luna zero) — the Fable-flag did not
> trip. **Star occlusion** by companion + sun discs (`stars.js`); **physical
> camera** selectable metering (avg/center/spot) + WB mode (defaults identity);
> **round-8 residue**: directional ripple trains, steepened catena fines→supply
> + a fines-pond tint, a dedicated cliff-bench scene pair (Luna `denFloor`
> re-check HELD at 0.08 — the icon's grazing sun keeps the meso-facet residual).
> **Horizon-convergence acceptance check** (`bench/metrics.mjs horizon_gap`)
> instruments the MS aerial-perspective residual, which is registered as the MS
> second installment's continued work. See DESIGN.md "Build round 9". Baseline
> re-promoted (tag `round-9`). **Next: round 10 = material texture stacks v2 +
> Water v2 — run on Opus.**
> **Status (build round 8, July 2026 — Fable-driven per the model plan):**
> **Ground plan L1 + ground laws G1/G4/G5** — the first new bake-process
> families since the model plan. Shipped: **the cliff-and-bench former**
> (`procStrata`) — a per-cell PURE height remap in a dipping/folded strata
> frame (no stencil reads: it shares levels with thermal, where a stencil
> breaks the §3 bit-exact halo contract — the contract harness *designed* the
> algorithm): a monotone `(1−q)·f + q·S(f)` remap collapses soft mid-bed
> material onto treads and concentrates each bed's rise into a riser under a
> SPARSE cap hash (escarpments are events, not wallpaper), faded along strike,
> gated by recipe FIELDS (Tellus/Rubra uplift highlands; Luna mare flow-fronts
> — highlands bake byte-identical with the process removed, tested); risers
> expose bedrock (G1's substrate), calved blocks collect below (G3 iv),
> thermal relaxes oversteepened risers into talus. Mechanism numbers (allcap
> variant, Rubra upland L12): tread share 24.6→59.3%, slope mass concentrates
> into the top-5% tail, local steepening ×4.6 — redistribution, never conjured
> relief (monotone ⇒ no inversions, `test/strata-test.mjs`). **G5 catena**
> (`procCatena`, new `fines` field in the free ATLAS L4 slot): signed
> curvature accreted per band — hollows accumulate fines (measured 4–15× the
> crest value on BOTH creep-Luna and aeolian-Rubra: one mechanism, two agents,
> the anti-overfit gate's shape), convexities gain bedrock exposure + shed
> clasts, fines ponds bury a fraction of the clast field. **G4 sand routing
> v2**: the shader's fill SUPPLY now keys on the baked fines field (a real
> upslope integral), wind ripples ride a continuous sin phase along the recipe
> wind heading confined to sand accumulations (windless Luna: pooling only).
> **G1 joint tessellation** (`plates()` in TERRAIN_FRAG): exposed bedrock
> breaks into coplanar plates — a cellular field on an AXIS-ALIGNED lattice
> (a rotated lattice coordinate breaks the 4096 m detail-snap wrap and seams
> at tile edges — caught in design) with the joint-set orientation in a
> rotated anisotropic distance METRIC (continuous ⇒ snap-safe); joints
> sand-fill through the same G4 fill mask, plate interiors go coplanar,
> per-plate tone varies; a recipe `pavK` exposes bedrock pavement on
> fines-poor flats (strong on wind-scoured Rubra, rare on gardened Luna).
> First-probe landmine, fixed in-round: a 0.12·S joint groove is sub-pixel at
> walking distance and aliased into black/white pixel stairs — the crack line
> now WIDENS to the footprint and FOLDS its amplitude (§7). **Round-8
> register fixes** (pure data): Luna `denFloor` 0.22→0.08 + `sizeMin` 0.2 +
> rock albedo 0.20→0.30 (the boulderfield pockmark row), clast `sy` floor
> 0.75 (pancake pucks retired — flat is the slab archetype's job). Verified:
> 7 Node suites green (bake, contract incl. strata/catena per-prefix on every
> body, global, rock, reload, strata, assets:check — assets bit-identical, no
> rebuild needed); probes clean (0 page errors); Rubra pavement-walk now reads
> as flagstone plates + routed sand + lag (the Curiosity-pan look the G-laws
> were read from). Full 59-scene sweep: zero page errors, control-tier gate
> clean, orbital sentinels ≈0 delta; motion bench unchanged (descent pop_p99
> 0.8526 vs 0.852, orbit-pan 0.0186, ocean flicker 0.000944), perf gate green.
> **Round-8 critique panel** (53 agents, finders Opus / skeptics Sonnet per
> rule 1): 20 confirmed + 5 softer → `bench/critique-round8.md`; its headline
> catch was the anti-overfit law working as designed — Luna's joints read as
> re-tuned Rubra flagstone (two-body gate FAIL) — fixed in-round with a
> post-panel batch (`jointTab` fracture-agent divergence, plate-merge
> block-size hierarchy, sand-seam tone) and verified by probe before the
> final sweep. Luna eye-level harshness (blown whites / black-pepper
> aliasing) is the REGISTERED round-9 airless-fill item, pre-existing in the
> round-6 baseline — round 8's joints/pavement inherit it and get re-tuned
> when fill lands. Baseline re-promoted from the post-fix sweep (tag
> `round-8`). See DESIGN.md "Build round 8".
> **Round 7 (July 2026, Opus-driven):**
> **Phase T tooling — the velocity round** (no new world content; the render
> path for non-photo scenes is bit-unchanged). Shipped: **hot recipe reload
> with band-selective invalidation** — `invalidationLevel(old,new)` (pure fn:
> shallowest changed band), `baker.invalidate(minLevel)`/`setProcesses`,
> `__reload(processes)` wired through the worker + tile cache with a
> per-request generation counter that discards in-flight stale bakes; changing
> a level-13 process leaves levels 0-12 byte-identical (the Phase 2 tuning-loop
> velocity limit); **completed process contract harness** (per-prefix
> cross-face cube-edge agreement + NaN/Inf finiteness added to the existing
> determinism + halo checks, over every process on every body); **asset build
> step** `npm run assets` — deterministic generation of rock packs / rock maps
> / MS LUTs / disc maps with a sha256 `assets/manifest.json` (`assets:check`
> proves reproducibility; runtime stays build-free); **photo mode** — free-look
> camera (unlocks the tilt clamp to nadir↔zenith + roll: the registered
> "camera cannot look up" defect), white-balance + film-grade `[camera]` post
> controls (exact identity at default → sentinels bit-unchanged), F9
> supersampled clean capture, localStorage bookmarks (a saved view IS a
> reproducible `__shot` spec); **motion-bench perf gate** (`__perf` subsystem
> EMAs → measured-vs-budget with an honest SwiftShader caveat + a stall
> tripwire); **seed casting** `bench/casting.mjs` — cast N reseeded variants
> via `__reload` into a whole-disk/limb contact sheet (Rubra n=3 → three
> distinct worlds); and **R1 artifact masks** — per-ref crop windows + artifact
> exclusion masks in the manifest (inspecting the Apollo ground frame showed
> the old crop sampled straight into the LRV rover — fixed; the round-2
> fool-rate bias is discharged for that ref). Verified: six Node suites green
> (bake, contract, global, rock, **reload**, **assets:check**), reload-test
> proves shallow tiles are byte-identical after a deep-band change; smoke
> probes clean (free-look zenith, WB/grade, reload A/B, `__perf` all zero page
> errors); full regression sweep zero page errors + sentinel bit-identity
> (WB/grade default to exact identity). The deferred **round-6 critique panel
> re-run** ran in full this time (65 agents, 0 errors) — **23 confirmed
> findings + 4 softer** on the round-6 tree, none a round-7 regression;
> `bench/critique-round6.md` has the list, and the highest-impact rows are now
> in the register above, routed to rounds 8-11. See DESIGN.md "Build round 7".
> **Round 6** shipped ground plan L2+L3 first slice — the ground and its rocks
> became ONE continuum: L2 meso-displacement (position-pure ~4 m/~1 m octaves
> CPU-baked into deep-tile meshes, §4 onset L15–17), L3 procedural material
> stacks (creased rock + dust-fill height-blend replacing the speckle carpet —
> **honest caveat from the round-7 panel: this holds on Tellus but the bump
> octaves re-speckle on airless Luna for lack of ambient fill; queued for the
> round-9 airless-fill fix**), baked limit-surface rock normal+cavity maps
> (facet interiors shade as the true sculpt at every LOD — the low-poly/clay
> rows die), and scatter lighting unified with the terrain's horizon-field
> shadows (lit-boulders-in-shadow fixed); bead-chain guards turned crater-rim
> dot-trails into talus aprons. bench/baseline re-promoted (tag `round-6`).
> See DESIGN.md "Build round 6".
> **Round 5** shipped the rock overhaul — watertight archetype sculpts
> (rockcore), clustered G3 placement with exact §7 partition, lag/ejecta
> density content, the three-band request allocation (L19 underfoot), binary
> footprint folds in both passes, and `git init` (tags round-4/round-5);
> round 5.1 fixed the live-reported shadow-seam gate (L13), mixed-depth edge
> cracks (skirt band-tail), rock rectangle (L15 size-floor), and scoped the
> three-band allocation to static poses (flight LOD fossils).
> **Round 4** shipped the crater overhaul (power-law SFD, morphology by size
> class, ejecta + ray systems through the baked `fresh` field / G6 sign per
> recipe, provinces regional fill) + turbo settle (sweep 85→31 min) + the
> request headroom guard; four sweeps, 58+18-agent panels — the round-4
> baseline-provenance lesson ("git init before the next promotion") is now
> discharged. **Round 3** shipped Phase 2 ENTRY (the [global] coarse pass —
> cross-face D8 flow + advected moisture, `test:global` — and the 16-bit
> field atlas) with first consumers (baked biomes, incision valleys,
> per-pixel bathymetry); **round 2** closed out Phase 1 + a Phase T slice +
> R1 start; **round 1** was Phase R, 1a–1d, M, and a Phase 2 slice —
> DESIGN.md carries all deltas ("Build round N" sections).
> Phase 1 residue: honest refracted-annulus integral, terrain-side refraction,
> spectral band mode. Next: **round 9 = Phase 1 remainder — run on Opus**
> (BRDF library, opposition surge, whole-disc ladder v2, planetshine,
> eclipse/transit machinery, star-occlusion fix, physical camera v1, sky-view
> LUT / MS second installment, refraction + refracted annulus — plus the
> now-measured AIRLESS FILL cluster: MS/sky-fill floor, fwidth bump-amplitude
> roll-off, stronger sunlit-neighbour bounce). Round 8's mechanical residue
> queues into round 9 per the de-escalation rule (standing rule 3): per-body
> strata/joint/ripple parameter tuning (all hot-reloadable data), Luna
> jointK/pavK re-tune once airless fill lands, a dedicated bench/cliff scene
> pair in scenes.json, and a luna-boulderfield density re-check at the icon
> site (denFloor 0.08 may want 0.10–0.12). The full remaining schedule lives
> in **"Execution plan — rounds × model"** below: Fable drives the open-ended
> / landmine-dense rounds (Phase M core, oriented structure, formations,
> clouds core, Phase 5 domains); Opus drives everything literature-specified
> or mechanical. Rounds 7 (Phase T tooling) and 8 (ground L1 + G1/G4/G5) are
> **done** — see the status blocks above.

The build renders a coherent planet from orbit to bootprint. It does not yet pass for a
photograph at any altitude. This roadmap closes that gap **without ever breaking the
CONCEPT.md contract**: the solar system stays one pure deterministic function of
(body, body-fixed position, time), and photorealism is achieved by adding *better terms
to that function* — never by painting special cases.

## Why it still looks toy — the six tells

Benchmarked against real imagery (Phase R), the gap decomposes into six failures, each
owned by a different subsystem, each fixable within the architecture:

1. **Photometry** (disk scale). We shade Lambert + one hacked regolith curve. Real
   bodies obey measured BRDFs: Lommel-Seeliger/Hapke regolith, opposition surge,
   forward-scattering ice, limb profiles. A photograph's "materialness" *is* its BRDF.
2. **Structure** (regional scale). Our relief is isotropic fBm + craters. Real terrain
   is *oriented and causal*: drainage trees, fault families, dune fields aligned to
   wind, strata, flow fronts. The eye detects purposeless noise instantly. This is the
   "geo realism" program (Phases 2, 4, 5 — the taxonomy's A–D).
3. **Light transport** (all scales). Single scattering + a fudge factor. Real skies are
   multiply scattered; real terrain casts shadows on itself; real clouds shade the
   ground. Shadows are the single largest realism-per-effort win we have not built.
4. **Camera** (all scales). Real photos are made by lenses and sensors: PSF/bloom,
   flare, grain, white balance, metering choices, motion blur. CONCEPT §10 already
   assigns all of this to the camera — we simply haven't built the camera.
5. **Temporal coherence** (motion). Craters and landforms pop in on descent — and even
   while just rotating in orbit; waves, foam and micro-detail shimmer. A still can
   lie; motion can't. CONCEPT already prescribes the fixes we skipped: §1 sanctions
   geomorphing, and §4 demands "a band's onset should blend in rather than switch
   on." Since the goal is *real-time cinematic* capture, motion gets its own phase
   (M) and its own bench (scripted camera paths, not stills).
6. **Composition & singularity** (identity). Real worlds have *places* — Olympus
   Mons, Valles Marineris, Sputnik Planitia. Statistically uniform procedural output
   reads as mush no matter how good each hectare is. The fix is **not** a hardcoded
   list of named features (that would betray the whole philosophy): real singularity
   is *statistical* — heavy-tailed size-frequency laws and low-degree convection
   structure make a few giant features inevitable and unique. Our processes are
   stationary and band-truncated, so nothing can dominate. Grow the giants from the
   right statistics; *select* good worlds by seed, never paint them (Phase 2
   "Singularity from first principles").

## Defect register — v0 build review

Concrete observations on the current build; each names its known root cause and where
in this roadmap the fix lives. (This register is append-only: new critique rounds add
rows here first, then the rows get homes.)

| Observation | Known root cause in v0 | Home / phase |
|---|---|---|
| Night side of planets doesn't read as real from space | No planetshine, no aurora, no night structure; airglow is now a limb shell but the disc interior is featureless; exposure lets it sit as a flat dim wash | Phase 1 "Night-side pack" |
| Craters/landforms pop on descent *and* while rotating in orbit | Bands switch on at full amplitude at their first level (`procCraters` has no onset ramp — violates §4 "blend in"); the distance-ratio split lets new bands arrive pixels-large; draw-best-available swaps tiles with no morph/fade | Phase M: SSE split + **per-vertex geomorph + stream-in crossfade SHIPPED round 11** (bands arrive at 1.5 px by construction; content dissolves over 0.28 s wall time); the [bake]-side onset ramps (procCraters) remain — ride the Phase 2 crater rounds |
| Scatter unrealistic — world reads as "heightmesh + sprinkled rocks"; no overhangs, formations, dunes, real textures | One rock archetype, no clustering, one density scalar; no non-heightfield geometry class exists; micro "texture" is value-noise speckle, not material texture | Rounds 5–6 closed most of it: archetypes+clusters (5), meso-displacement + creased material stacks + dust-fill height-blend + unified rock lighting (6) — ground and rocks are one continuum now. Remaining: overhangs/formations (L5 "Beyond the heightfield"), coherent bedforms, generated texture stacks |
| Clouds don't match reality (anchor: `bench/boards/board-tellus-loworbit-sunset-clouds.webp`) | No clouds exist yet | Phase 4, gated on that board's character |
| Sunset from space unconvincing (OK to lean cinematic *as a camera profile*) | Single scattering + proxy; no cloud shadows or crepuscular structure at the terminator; no camera grading | Phase 1 (multi-scatter, refraction) + Phase 4 (terminator milestone) + Phase M (cinematic profiles) |
| Night sky lacks diversity — star types/sizes/clusters, galaxy | Two hash layers, no colors, no catalog, no Milky Way | Phase 1 "Night sky v2" |
| Biomes salt-and-pepper, not geographically/geologically placed | Vegetation = temperature bands × one noise octave; no moisture geography, no orography | **FIXED round 3**: baked `veg` field = temperature × [global] advected moisture with wide ecotones + orographic rain shadows + riparian corridors; the shader's noise-proxy biome block deleted. Whittaker multi-biome palettes (steppe/taiga/desert classes) remain Phase 2 content |
| Ocean reads unreal and flickers, worst at coastlines | Wave-octave folding uses per-pixel `fwidth` fades (temporally unstable), foam keyed on raw noise, shoreline is a hard `discard` boundary | **Water v2 SHIPPED round 10** (broadband wind-sea+swell spectrum, LEAN glint fold, per-pixel bathymetry, shoreline soft-blend, slope-driven surf, sediment plumes); residual temporal flicker + grazing-overlook wave streaking stay Phase M |
| Scatter stops at an abrupt edge — you can see exactly where rocks are being rendered vs not | Hard camera-distance visibility radius + per-tile build gating; no folded far representation hand-off — a literal §7 violation ("distance chooses representation, never membership") shipped as a v1 shortcut. **Round 5 root-caused the worst form**: the 6000-rock cap truncated an L15 tile's 65k-cell lattice scan a fraction of the way through, printing DENSE STRIPS with hard edges — the "boulder fields" were partly this artifact | Cap artifact **FIXED round 5** (`minTileLevel` 16 puts every build under the cap; placement is now exactly the Node-tested partition). The remaining honest edge — instances confined to ≥L16 displayed tiles, no folded far representation — stays Phase M "Scatter hand-down (no edges)" + ground-plan layer 4. **SHIPPED round 11**: the 800 m radius is deleted (build gate = the largest clast's fold distance, which trails the per-instance fold — no edge at any FOV) and the ground's rockDensity detail now yields the conservation share the instances carry. Residue **CLOSED round 14**: the L14 band draws hull-map impostors of the same lattice facts (bit-exact anchors via the L15 children; conservation handed to the ground share); the rung engages wherever the scheduler displays L14 within rock range (budget pressure / dpr-2 — the band's own framing) |
| A moon at small angular size turns into a pure white sphere instead of looking like the Moon | The §11 disc representation uses a flat `discAlbedo` constant (CONCEPT says "disc albedo from the root tiles") with Lambert shading that blows out — no surface pattern, no regolith photometry, no mean-preserving tiles→disc hand-down | Phase 1 "Whole-disc ladder v2" |
| Rubra's disk is a uniform butterscotch ball with random same-scale craters — no giant features, no albedo provinces, nothing Mars-like about its *face* | Every process is scale-truncated and stationary: the crater law's per-band density cannot produce a basin-class tail (max radius ~150 km — a Hellas is statistically impossible); the cascade has no spherical-harmonic degree-1–3 top (no dichotomy, no Tharsis-class swell); volcanism/rifting aren't concentrated by any field; albedo has no wind × elevation × age consequence chain — ice caps are the only global structure | **Mostly landed by round 4**: dichotomy + swell (degree-1–3 top), Hellas-class basin tail draining the valley networks, dark lowland provinces (Syrtis-class), power-law crater texture + dark fresh rays — the disc has a face (round-4 probe). **Remainder SHIPPED round 12**: winner-take-all edifices on the swell (a Tharsis-class trio emerges from a seeded candidate set), ONE rift system radial off the dome (8-azimuth WTA — it landed on edifice #1's flank: Valles-from-Tharsis adjacency from pure statistics), and the wind × elevation × age consequence-chain albedo (scour darkens young swept basalt — Syrtis-class provinces emerge; mantling brightens lee + edifice heights; disc and ground agree via the shared bakeDiscMap block) |
| Close-up scatter is unusable: faceted geodesic blobs, background visible *through* cracks in the rocks, one identical archetype, untextured flat gray | The single rock mesh is `IcosahedronGeometry(0.5, 1)` — 80 flat facets; the per-vertex "lumpiness" deform is applied to three.js's **non-indexed triangle soup**, so shared vertices split and the mesh literally cracks open; one archetype, no material/texture, own ad-hoc lambert instead of the terrain BRDF | **FIXED round 5**: `rockcore.js` — welded-icosphere seeded sculpts (watertight by construction, Node-verified closed 2-manifolds), four G3 archetypes × variants × 3 LODs, per-recipe `rounding`/`mix`, settle tilt, bottom-anchored burial, parent→child clusters, object-space mottle + G6 dust patina + contact AO in the shared terrain BRDF. Residue: offline hi-res sculpt + normal maps, material-stack textures, grain-size continuum below 30 cm |
| Oceans show obvious tiling/grid moiré from orbit, with straight seam lines at tile borders | Three stacked causes: (1) the wave field is six fixed sines — a *periodic interference lattice* that literally tiles; (2) geometric wave displacement toggles per-tile (`λ > 4·uVertSpacing` boolean), so amplitude steps quilt along tile boundaries; (3) ocean skirt rings read as dark seam lines near nadir | Phase 2 "Water v2" (broadband wind-sea+swell spectrum — kills the lattice), Phase M filtered folding (per-pixel screen-footprint hand-down replaces the per-tile boolean), shoreline/skirt rework |
| Framing the disc with day and night split across the screen looks wrong: night side washed olive-bright, contour-ring banding around night landforms, split is a bare linear ramp | Three stacked causes: (1) `uSkyAmbient` is one global uniform metered at the ground point *under the camera* and applied to every fragment — night terrain inherits daytime ambient, i.e. **view-dependent lighting** (same bug class as the camera-gated MS proxy); (2) 8-bit AO/field quantization becomes visible contour rings under night-exposure amplification; (3) no warm scattered terminator band — the split is raw cos(N·L) falloff plus that ambient | Phase 1 "Sky ambient from the LUT" (per-sample sun geometry), multi-scatter + refraction (the warm ring), night-side pack (dark stays dark); field-atlas checkpoint (AO → 16-bit or dithered) — **(1) and dark-stays-dark FIXED in round 1**; (2) and the warm ring remain |
| *(round-1 panel)* Ground shows no long metre-scale shadows at eye level; rocks cast nothing | Horizon field is capped at landform scale (level 14) by design — sub-landform self-shadowing belongs to the BRDF statistically, and the camera-local shadow map for the debris band is still unbuilt | **FIXED round 2**: sun-aligned ortho depth pass, normal-offset PCF, min-composited with the horizon field |
| *(round-1 panel)* Twilight/horizon carries an olive-green band; sky hue drifts at altitude | The 1.55× Rayleigh + ambient-curve multiple-scattering proxy — exactly the fudge the ledger already condemns; ALSO missing ozone (no Chappuis absorption = olive zenith, a physics gap not a proxy artifact) | **FIXED round 2**: Chapman transmittance + Hillaire MS table + recipe ozone shell |
| *(round-2 probes)* Exposure servo pumped to the clamp through the no-tiles black window after a body switch, then recovered too slowly from deep clip (blown Luna stills) | Metering ran on frames with no displayable scene; r was floored at 0.92/p99 when the histogram saturated | **FIXED round 2**: no metering while stats.baked == 0; asymmetric gains; hard step-down on deep clip |
| *(round-2 probes)* Zodiacal light read as a white searchlight blob at night exposure | Amplitude ~2 orders too bright relative to the Milky Way | **FIXED round 2**: real (tiny) amplitude + steeper elongation falloff |
| *(round-2 probes)* Night-side disc blocky mottling persists under high EV (moonlit ocean/land patches) | 8-bit field texels at coarse levels are content-scale blobs, not just contour rings — dither can't fix texel size | **Precision half FIXED round 3** (16-bit atlas; dither bridge retired). The texel-SIZE half (77×77 covering a whole coarse tile) is a resolution matter — reassess at the Phase 2 bench re-score |
| *(round-2 probes)* Ground camera cannot look up (tilt clamp 1.52 rad ≈ 3° below horizontal max) — zenith subjects (central eclipse, aurora overhead) are unframeable | OrbitalCamera auto-tilt + pitch clamp was authored for orbit-to-horizon framing | **FIXED round 7**: photo-mode free-look (`cam.free`) measures pitch from the horizon and reaches nadir↔zenith, plus roll; the auto-tilt path is bypassed. `__shot { free:true, pitch, roll }` frames zenith subjects (verified: a Luna eye-level shot at pitch 78° frames the sun disc + star field above the horizon) |
| *(round-2 probes)* Concentric twilight arcs at low ATM_STEPS; a per-pixel jitter fix traded them for severe chroma noise on Rubra's forward-Mie sky | Uniform march steps undersample the exponential density on long grazing rays; white-noise offsets need far more steps than 6–24 to average out | **FIXED round 2**: perigee-clustered quadrature (samples follow the density; deterministic, no noise). Faint residual arcs at fast step counts remain — fully die with the sky-view LUT or higher steps |
| *(round-2 probes)* Rubra twilight/ground skies covered in dark "dashes"; ground scenes shot with the camera under terrain; scene content varied run-to-run at identical specs | THE REAL CAUSE (after three misattributed fixes): at ground poses over below-datum terrain, `1 − cosHor` degenerates to ~1e-7, the silhouette boost applies to every tile in view and the texel term splits grazing tiles for hundreds of km — the display set balloons to 1000+ tiles per level, deep levels take minutes to stream, and `__shot`'s 60 s timeout screenshots a half-morphed scene with the camera clamped to a stale ground height. The "dashes" are unsettled coarse-tile terrain; live-toggle "fixes" (occluder gate, MS knot curve) coincided with re-settling | **FIXED round 2**: silhouette boost confined to a band around the ring (decays both sides), foreshortening discount on the grazing texel term, `__shot` settle deadline 60 s → 150 s. The occluder angular-radius gate and the MS knot curve ship anyway as correct fp32/ANGLE hygiene. Debugging lesson registered: an unsettled scene mimics shader bugs — always check `stats.pending`/`stable` before bisecting pixels |
| *(round-2 panel, CONFIRMED sev 4–5)* Sun's blown core renders as a rounded SQUARE at orbital scales | Any bloom halo bright enough to clip wears the upscaled deep-mip texel's box shape — the sun is 5 orders above the scene, so the pyramid clipped no matter the filter | **FIXED round 2**: 13-tap downsample + exposed-space Karis knee on the first level — the pyramid halo can no longer saturate; the round inline glare owns the core |
| *(round-2 probes)* Milky Way lane-noise, zodiacal cone, and airglow banding burned through twilight/daylight skies at high exposure; catalog stars showed as dots through the daytime sky | Night-sky radiances were tuned for night salience against the old over-bright (1.55x) sky — absolutely 1–2 orders too bright once the honest darker twilight landed; stars added flux regardless of the sky's radiance along the same ray | **FIXED round 2**: MW/zodiacal/airglow recalibrated at night exposure; stars gated by PSF-peak vs same-ray in-scatter contrast (the brightest still pierce twilight, as they should) |
| *(round-2 panel)* blue-marble full-phase disc: uniform bright limb ring all around + no clouds | Atmosphere ring is real physics but the surface lacks full-phase limb-darkening contrast; clouds are Phase 4 | Phase 4 clouds carry most of it; limb photometry check rides the Phase-2 bench re-score |
| *(round-2 panel, first blind fool-rate)* 0% across all four bands (n=64) vs ~40–50% real-vs-real control baseline | Judges' dominant tells, in order: (1) statistically uniform single-scale procedural speckle vs real multi-scale texture (land, regolith, rock fields); (2) crater discs read as "identical stamped rings — no ejecta rays, no size-frequency hierarchy, no shadow relief"; (3) no clouds on the Tellus disc; (4) stair-stepped heightfield silhouettes and binary-threshold coastlines | (1) Phase 2 material stacks + ground plan; (2) Phase 2 crater overhaul; (3) Phase 4; (4) ground plan layer 1–2. Expected pre-Phase-2 baseline; Phase-1's own gate band (high-phase terminator discs) still needs refs |
| *(round-2 panel, harness)* Fool-rate judges also identified photos by rover hardware, Hasselblad reseau crosshairs, and mosaic stitch borders inside the crops | `foolrate.py` crop windows too coarse — the protocol demands non-iconic crops free of instrument artifacts | **FIXED round 7** (mechanism + first ref): per-ref crop windows + artifact exclusion masks now live in `bench/manifest.json`; a crop overlapping a masked rect is rejected. Inspecting the Apollo ground frame revealed the old crop window sampled straight into the LRV rover — corrected to the clean regolith/boulder region with the centre astronaut masked. Reseau crosshairs are a ~1px grid (attenuated by the 384px downscale, not rect-maskable — a grid-aware crop is future work); per-panorama masks are added as refs are inspected |
| *(round-2 panel)* open-ocean-glint: ocean base color is a soft blue CHECKERBOARD from orbit; the "glint" this scene was named for is gone | (a) ocean shallow/deep color mixes on per-vertex bathymetry from coarse tiles — the field-texel blockiness class, water edition; (b) round-1's "glint blotch" was substantially the old broad glare kernel, which the tight kernel + bloom knee removed — the pose no longer has the mirror ellipse in frame | (a) **FIXED round 3**: the atlas ships the height raster (`hgt` channel) and the ocean samples per-PIXEL bathymetry; (b) re-pose the scene on the true specular ellipse; Cox-Munk glitter remains the Water v2 row |
| *(round-2 panel)* moon-sizes ladder rendered blank blue frames | The pose aimed `lookAt: luna` at a moon BELOW the camera's horizon (tday 0.3 puts Luna on the far side); round-1 renders of this scene were pose-leaked so the error never showed | **FIXED round 2**: tday 0.2854 solved from the ephemeris (Luna at 0.978 dot with the camera zenith, 36.5° phase) |
| *(round-3 panel, CONFIRMED sev4)* Land albedo detail wiped out from orbit — continents flat cream; biome geography invisible at the disc; a knock-on exposure shift made dim limb bands read saturated magenta | Deleting the shader's noise-proxy veg block removed ALL mid-frequency land variation (the old mottle was that noise); the baked replacement was too smooth (40 km advection cells) and too dry (thresholds above the land moisture mean) | **FIXED round 3 (same round)**: procBiomes gained a level-gated meso-patchiness octave ladder (~1500 km → ~30 km, each octave admitted only when the level resolves it — ungated octaves alias into level-inconsistent noise) + response-curve recalibration to the measured land moisture mean. Full Whittaker biome classes stay Phase 2 content |
| *(round-3 panel, CONFIRMED sev3; persists post-veg-fix)* Terrain at grazing view angles washes PINK-MAUVE (limb bands from orbit, distant terrain in oblique shots); real grazing photos go blue-hazy | Aerial perspective is transmission-dominated at long paths: Rayleigh extinction reddens the transmitted terrain light while the single-scatter + isotropic-MS in-scatter veil stays too weak to cover it — the missing energy is the higher-order forward-accumulated blue haze along grazing view paths | [sky] residual for the sky-view LUT / Bruneton-complete MS table (the roadmap's "multiple scattering done right" line item, second installment); the same gap feeds the "sunset from space unconvincing" register row |
| *(round-3 panel, CONFIRMED sev3)* Trunk rivers read as constant-width cartographic strokes at 400 km — no perspective falloff, no valley context | The river albedo darkening had no footprint fold: a sub-pixel channel must fold into the mean like every other octave (§7), not persist as a vector overlay | **FIXED round 3**: river term fades with fwidth footprint (visible only where the channel is resolved); darkening reduced 0.3 → 0.22. True channel geometry remains Water v2 |
| *(round-3 panel, CONFIRMED sev3)* Small metre-scale/horizon shadows clamp to pure black with posterized edges on Luna | Penumbra floor cut 0.012 → 0.003 on the 16-bit argument — but the floor also covers the 8-octant azimuth interpolation, which still facets regardless of channel depth | **FIXED round 3**: floor 0.006 (quantization share retired, interpolation share kept) |
| *(round-3 bench, harness)* Every scene after the eclipse icons rendered wrong: moon-sizes aimed at a below-horizon Luna (blank blue frames, second cause), crater-rim-walk/pavement-walk sun azimuths drifted, 25+ scenes' deltas polluted | `__shot`'s reset semantics missed ONE field: `season` only applied when specified (its guard predates the round-1 reset rule), so the eclipse scenes' `season: 5.0` leaked into every later scene — the icons joined scenes.json in round 2 but this was the first FULL sweep to run them in sequence | **FIXED round 3**: season resets to canonical 0.15 like every other field. Harness lesson re-registered: reset semantics must be a whitelist-of-nothing — every stateful field resets unless the spec names it |
| *(round-3 probes)* River channels print as circuit-board STAIRCASES — axis-aligned segments with 90° jogs across whole continents | D8 flow on the coarse global grid is an 8-direction polyline field; bilinear sampling + a tint/carve threshold traces it verbatim | **FIXED round 3**: meander domain warp — tiles sample the global rasters at a position-pure warped direction (~1.2 cells at ~3-cell wavelength), turning polylines into meanders; §3/LOD contracts hold because the warp is pure in body-fixed position. True sub-grid channel geometry remains Phase 2 flow-sharpening work |
| *(round-3 probes)* Night ground sky: black + stars ✓, but posterized green/gray BLOBS survived at the meter's exposure clamp | The airglow shell's gravity-wave vnoise banding — at clamp exposure the ±10% modulation quantizes into hard-edged patches (the same visual class as the round-2 blob field); any authored airglow structure is invisible at working exposures in reality | **FIXED round 3**: banding term deleted (smooth shell only) + airglow recalibrated so the sky stays essentially black AT THE CLAMP (the term remains in the integral for future extreme-EV camera profiles; the orbital limb line dims accordingly — physically honest) |
| *(round-2/3 live, user-reported 6x)* Night sky a bright blue/green mottled blob field at ground level; Milky Way read as gray noise clouds | Four stacked causes, unpicked by a structural Node audit of the JS integral twins (every scattering term is a true zero at night — the night sky IS airglow × the meter): (1) star field ran through the bloom pyramid — hundreds of sub-pixel points × deep-mip halos = a blurred copy of the star-density field; (2) the meter lifted any dark scene to mid-gray (no radiance anchor); (3) the analytic Milky Way/zodiacal vnoise lobes read as clouds at any tuning; (4) airglow was authored BLUE and ~2 orders too bright — real airglow is the OI 557.7 nm green line and needs minutes of tracked exposure, so it must sit ~2 orders below the star field's working range | **FIXED rounds 2–3**: stars composite post-tonemap in their own pass (the sprite IS the PSF); radiance-anchored night metering target; analytic MW/zodiacal DELETED (user direction "pure stars") — the galactic band is the star catalog's disc-population density (16 000 stars to m 7.2); airglow respec'd to the OI green spectrum ~2 orders down (survives as the orbital limb line). Calibration law registered: every night-sky radiance is calibrated in absolute units against the star field's working exposure |
| *(round-1 panel)* Sun glint is an airbrushed column: no Cox-Munk glitter speckle | Folded slope variance is smooth by construction; discrete facet sparkle needs a deterministic glint-stamp population | **SHIPPED round 10**: Cox-Munk glitter — a sparse facet field resolves the near-field glint into discrete sparkles + folds to the smooth lobe at range (round-10 panel confirmed the airbrushed column is gone) |
| *(round-1 panel)* Ground texture smears anisotropically at grazing view angles | Micro-detail is isotropic 3D value noise on a heightfield — no material detail stacks, no parallax occlusion | Phase 2 ground plan layers 2–3 |
| *(round-1 panel)* Night-side disc shows blocky mottling under night exposure | 8-bit RGBA field texels amplified by high EV (predicted in the checkpoint list) | **FIXED round 3**: 16-bit field atlas (see the round-2 row above for the residual texel-size component) |
| *(round-1 panel)* Mid-scale craters read as thresholded noise: no rims/ejecta/floors morphology | v0 crater stamp is bowl+rim only; degradation, ejecta, terracing, SFD nuance below basin scale unbuilt | **FIXED round 4**: power-law SFD within each band (size hierarchy, fresh-biased degradation states), morphology by size class (Pike depth law, flat floors, central peaks, wall terraces, basin peak rings), hummocky ejecta blankets, bright/dark ray systems via the `fresh` field (G6 sign per recipe). Residue: secondary chains, multi-ring profiles, sub-grid ray streak geometry |
| *(round-4 probes)* Giant ray systems / basin ejecta square-truncated at cube-face edges | The stamp footprint was windowed through the gnomonic center projection: a center past the face horizon projects to k≤0 (skipped on one face, stamped on its neighbour) and the stretch outruns the fixed 2.6× over-scan — band-0/1 rays reach ~90° of arc | **FIXED round 4**: stamps whose reach exceeds 0.12 R abandon the window and scan the whole raster with the exact 3D distance test — identical math on every face, seam-proof by construction, cheap because only a handful of giants exist |
| *(round-4 probes)* Square mare dots + square flattening dents at province-level cell scale | `procProvinces` filled EVERY low: the SFD's small deep bowls at the one province level became 1–3-cell mare pits, inherited bilinearly forever as squares (one printed as the gibbous-disc notch's albedo component) | **FIXED round 4**: lava fill keys on a 5×5 box-mean regional height — maria flood basins and lowland plains (and the largest old craters: Plato-class), never sub-resolution pits. Kernel is legal at the province level (all prior processes are position stamps); writes clamp to halo 4 |
| *(round-4 probes)* Ray albedo stepped 45% across LOD boundaries (straight-edged square patches in ray systems) | The `fresh` field rode the height onset ramp's 0.55/0.45 two-level split — correct for height (blends in, geomorph smooths), wrong for albedo (a coarse tile carried 55% of a ray system against its finer neighbour's 100%) | **FIXED round 4**: albedo fields write at FULL weight on the band's own pass, never on the completion pass — height blends in, albedo arrives whole |
| *(round-4 probes)* A straight-edged tile "notch" (band-content step) at one gibbous-disc pose — view-dependent, moves with altitude | Per-tile scalar geomorph: where the split score varies across a tile (obliquity discount, silhouette-band boost), the unsplit side of a level boundary sits partially morphed against a completed neighbour; step = (1−morph)·band onset amplitude, raised into visibility by the overhaul's giant-crater band amplitudes | Phase M "screen-space-error split": CDLOD-style per-vertex morph is continuous across boundaries by construction — a per-tile scalar cannot satisfy both sides when adjacent scores differ. Registered, not patched: every scalar re-anchor tried either mutes band content or moves the step. **FIXED round 11**: per-vertex CDLOD morph — a pure function of vertex camera distance whose ramp is DERIVED from the split metric (a displayed level-l tile provably sits at d ≥ S(l)), so both sides of any boundary agree by construction |
| *(round-4 bench)* Every scene from `open-ocean-glint` onward rendered broken (missing tiles over bare sky, half-baked terrain) with an on-canvas `RangeError: Array buffer allocation failed` | Memory, not content: the round-4 atlas layer (+47 KB/tile CPU, plus its GPU copy which SwiftShader keeps in RAM) and the 18th field pushed the 60-scene single-page bench run over the tab's allocation ceiling — the worker OOM'd packing atlases, the main thread OOM'd allocating mesh buffers. A long live flight would hit the same wall | **FIXED round 4**: tile-cache caps trimmed (main 900→700, worker 500→400 — display sets are 100-300 tiles, so paths stay warm), and the page now exports `__pageErrors` which `bench/run.mjs` checks per scene — a dead renderer FAILS the scene loudly instead of being scored (the OOM stills initially read as content regressions) |
| *(round-4 panel)* Tellus sentinels (blue-marble, coast-400km) judged "vegetation erased + pink-mauve cast" vs the baseline stills; ecotone-traverse/river-outlet judged "camera detached, scene changed identity" | NOT round-4 regressions — baseline provenance: bisecting ALL round-4 changes out (fresh read off, 4-layer atlas, round-3 crater recipe, even full-quality mode) still renders the sentinels ~identically to the round-4 output and unlike the baseline still, and the Node-baked veg field is unchanged (mean 0.095); ecotone/river baselines predate the round-3 scene RE-POSING, so the panel compared different places. The promoted baseline images were made by a code+registry state that can no longer be reconstructed — the repo has NO version control, so "before" can never be re-rendered, only trusted | Harness row. The honest fix is `git init` + tagging the exact commit a baseline was promoted from (and re-promoting the baseline whenever scenes.json re-poses); until then a baseline is a photograph of an unrecoverable state and sentinel comparisons inherit its drift |
| *(round-4 panel, CONFIRMED sev3)* Stars render through dim terrain below the horizon (luna-knife-edge: star PSFs continue across the horizon line onto earthshine-lit ground); moon-sizes-fov55 reads as "Tellus absent" — stars print straight through the true-black night hemisphere | The round-2/3 star pass composites post-tonemap in its own pass, gated by same-ray in-scatter contrast — but terrain occlusion is not tested per pixel, and on an airless body (or a truly black night disc, which round 3's night work deliberately achieved) there is no radiance to gate it | Phase 1 "Night sky v2" residue: the star composite needs a depth/coverage test against the scene (occlusion by geometry), not just a radiance gate. Visible wherever geometry is darker than the star PSF floor |
| *(round-4 follow-up panel, CONFIRMED sev4-5)* Eye-level plains under harsh low sun show a leopard-print of soft dark ovals (20–50 px, no supporting relief, size not scaling with perspective) | The texel-SIZE half of the registered field-mottling class, daylight edition: coarse-level AO/horizon texels (77×77 per tile) bilinearly magnified into feathered ovals, then amplified into hard dapple by the blown-white/black-crush tonality of low-sun airless exposure | The registered resolution matter (round-2 row), now measured at eye level: raster/texel budget rides the Phase 2 ground-plan L2–3 work (meso-displacement + material stacks replace texel-scale AO as the near-field texture carrier); the chalk-white tonality half is the Phase 1 photometry/exposure family |
| *(round-4 follow-up panel, CONFIRMED sev4)* A thin dark BEADED contour ring hugs crater-rimmed limbs just inside the bright edge (rubra-dust-limb; luminance dips ~15–30 with single-pixel beading) | Tile skirts seen edge-on at the silhouette: the overhaul put crater rims ON the limb, and each rim segment exposes its tile's skirt wall as a dark sliver — the "skirt walls on the limb" signature breakpoint #22 polices, now excited planet-wide by crater relief | Silhouette/skirt rework (the shoreline-skirt row's airless sibling): Phase M/2 shoreline + skirt replacement; mountain-limb + rubra-dust-limb police it |
| *(round-5 probes)* Grazing ground poses settled at L15 underfoot — eye-level ground and the new hero rocks rendered from coarse tiles (blobby texels, low-LOD meshes) no matter how long the scene streamed | Round-4's request headroom budget filled with far coarse paths first, and draw-best-available's **ancestor-covering dedup clamps displayed depth to the shallowest leaf sharing a subtree** — a mid-field leaf displaying a shared L12 ancestor drops the whole camera pyramid; a naive nearest-first re-sort collapsed the display to ONE face root (the covering rule in its purest form) | **FIXED round 5**: three-band request allocation — (0) the camera-ancestor sibling "unlock chain" that provably enables full depth underfoot (~4 tiles × 7 levels), (1) planet coverage to L12 coarse-first, (2) depth nearest-wanting-leaf first. L19 underfoot within the same memory budget; eye-level settles another 3-6× faster. The mixed-depth SEAM at the deepened-zone boundary joins the Phase M geomorph row — **closed by round 11's per-vertex morph** (boundaries agree by construction) |
| *(round-5 probes)* With the cap-strip artifact gone, luna plains rendered nearly rock-free — real mare regolith carries clasts everywhere (every Apollo pan), and "boulder field" sites had no reason to exist | Two G3 content gaps, not pipeline bugs: rockDensity had no ambient lag population (impact gardening) and `stampCraters` never wrote rockDensity — ejecta blankets shed no blocks, so no site could concentrate debris | **FIXED round 5**: per-body `denFloor` (gardened lag on airless plains, deflation lag on Rubra, soil-buried ~0 on Tellus — pure recipe data, §7-trivial) + freshness-weighted ejecta-blanket `rockDensity` writes in `stampCraters` (young craters shed block fields traceable to their crater; degraded blankets lie buried). pavement-walk-luna went from empty plain to blocky ejecta debris field on data changes alone |
| *(round-5 panel, CONFIRMED)* Hero rocks read low-poly — faceted silhouettes on every close boulder, one horizon cobble a perfect sphere — and large boulders are untextured smooth "clay" with only mottle tint | Runtime meshes cap at 1280 tris with facet normals (deliberate v1 budget: SwiftShader vertex cost); no material detail stacks exist yet, so a big rock's surface is albedo mottle alone | **Mostly FIXED round 6**: limit-surface normal+cavity maps (surface detail at any LOD without new triangles) + cavity-driven crevice/patina shading — boulders read weathered, not clay. Remaining: mesh-bound silhouettes (offline decimated sculpts), photo texture stacks (L3 v2) |
| *(round-5 panel, CONFIRMED)* Mid/far-field rocks read as flat unshaded DECALS: dark speckles with no lit faces, no cast shadows, riding the ground like paint (worst on luna-boulderfield, where ripple shading passes beneath them) | Two representations that don't hand off: instanced geometry exists only on ≥L16 tiles above the ~2 px footprint fold, while the terrain shader's rockDensity speckle term paints albedo-only "rocks" at ALL scales with no shading/shadow — between them sits a population rendered as pure texture | Phase M "Scatter hand-down": the fold must conserve the mean/variance budget INTO the ground material (shading included), not duplicate it as flat albedo. **Conservation SHIPPED round 11** (TERRAIN_FRAG trades the closed-form resolved-area share of the clast population out of the rockDensity detail; the material stack carries the shading). Register note: the round-5 depth-pass fold fixed the inverse mismatch (shadows without casters) |
| *(round-5 live, user-reported)* Rocks string into obvious single-file DOTTED LINES along terrain features (Rubra low-altitude flight: bead chains tracing crest lines and rim arcs; conspicuous against the otherwise-scattered lag field) | The debris lattice samples rockDensity point-wise, so any high-density BAND narrower than a few lattice cells (~0.6 m on Rubra) collapses its rocks into a one-cell-wide queue: crater-rim crest peaks (the round-5 size gate killed only sub-14 m craters — larger rims still carry a narrow density ridge) and the materials process's slope-threshold contour (rock exposure switches on along a thin slope band, printing chains along every crest edge) | **Mostly FIXED round 6** (both register prescriptions): the rim density write is now a downslope talus APRON with a ~4-lattice-cell width floor (mass-conserving; already-wide rims bit-identical), and the consumed field level gets one 3×3 tent blur — the crisp "tire-track" trails read as scattered debris. A faint residual trail survives on Rubra pavement probes; full fix is per-population G3 fields with declared feature widths |
| *(round-5 live, user-reported)* Large straight-edged SHADOW SEAMS at low-altitude Tellus poses: a frame-wide dark region with razor-straight horizontal/vertical boundaries, dithered/beaded bands along its edges, plus a stair-step terrain silhouette at the horizon | The round-5 metre-scale-caster gate (≥L15) made shadow PRESENCE flip at L14/L15 display-tile boundaries inside the shadow-map window: one side of a tile edge casts into the map, the other side's shadow exists only in the coarse baked horizon field — two shadow representations disagreeing along a straight tile edge. The stair-step horizon is the coarse displayed silhouette at a budget-starved pose (registered class) | Gate moved to L13 (mitigation — restores mid-field casting continuity while still excluding the parallelogram-printing coarsest tiles). The honest fix is the Phase M representation-boundary work: map- and field-shadows must hand off by REGION (map window interior vs exterior), never by caster LOD |
| *(round-5 live, user-reported)* Boulders stay LIT inside large terrain shadows — bright gray rocks floating in a dark hillside shadow | Rocks receive only the camera-local shadow MAP (`localShadow`); the terrain's baked horizon-field shadow term is per-tile atlas data that the shared rock material never samples — large-scale shadows (a dune or ridge shading half a valley) simply don't exist for rocks | **FIXED round 6**: rock materials are per-tile clones binding the owner tile's atlas; each instance's tile-local uv rides the matrix's spare bottom-row slot; ROCK_FRAG samples the horizon octants + view factor there, MIN-composited with the shadow map, plus the terrain's enclosure-ambient and bounce terms — rocks and ground read one lighting answer |
| *(round-5 live, user-reported)* Hero rocks read visibly low-poly at macro range (facet grid on a metre boulder fills the frame) | Panel-confirmed 4b residue, re-confirmed live: runtime meshes topped out at 1280 tris with flat facet normals and no normal maps | **FIXED round 6**: the sculpt is a closed-form radius fn of direction, so its infinitely-subdivided normal is computable anywhere — baked octahedral limit-surface normal+cavity maps per (archetype, variant), indexed by a sculpt-direction attribute; facet interiors shade as the true rock at every LOD and the round-5.1 noise-bump bridge is deleted. Residue: SILHOUETTES are still mesh-bound (sub-vertex silhouette detail needs offline displacement-decimated meshes — registered) |
| *(round-5 live, user-reported)* Long diagonal see-through CRACK across terrain at oblique mid-altitude poses (a dark jagged gap line running hundreds of metres) | Mixed-depth display (three-band allocation) puts L18-19 tiles beside L13-14 neighbours; skirt drop was sized `4·cell + local relief·0.1` — under a metre on deep tiles — while the un-owned band-tail height mismatch vs a coarse neighbour is several metres: the shared edge opens | **FIXED round 5**: deep tiles (>L12) add a band-tail allowance (~relief·0.0012) to their skirt drop. Skirt WALLS at silhouettes remain the registered class (silhouette rework) |
| *(round-5 live, user-reported, LOD-view confirmed)* LOD PATCHWORK FOSSILIZES during flight: broad level bands with a coarse STRIP sandwiched between finer zones, its magnified field texels reading as a brick-textured seam hundreds of metres long | With the camera moving (speed ≠ 0), the warm-path set alone pins the whole request budget (room 0) — streaming stalls and the three-band allocation's mixed-depth display freezes into whatever patchwork existed; the strips are stale coarse tiles that never got their deeper versions | **FIXED round 5**: the three-band allocation is scoped to STATIC poses (turbo settle / paused); a moving camera streams the uniform coarse-first front (with the radial tie-break) — uniformly softer beats sharp-next-to-coarse, and pausing immediately deepens the ground underfoot. The honest per-frame priority/budget scheme (preemptive eviction, SSE split) is Phase M — **SHIPPED round 11**: one SSE error currency for requests AND retention, closed-loop 128-outstanding commitment, value-ranked preemptive rebalancing with a pose-epoch gate (the three-band scheme is retired; its bands fall out of the currency) |
| *(round-5 live, user-reported)* Rock field ends in a razor-edged RECTANGLE at mid-altitude oblique views — debris exists inside an axis-aligned box of tiles and stops dead at its edge | The pure ≥L16 build gate made the instanced-debris zone exactly the block of deep tiles; every boundary is a straight tile edge | **Softened round 5**: L15 tiles build the LARGE-rock representation (per-rock size floor — a pure representation choice per §7, cap-safe since few rocks pass), so big boulders continue to the visibility radius and only sub-pixel clasts stop at the depth boundary. The full continuum stays the Phase M scatter hand-down row |
| *(round-1 panel, harness)* Sequential bench shots inherited camera pose/toggles from earlier scenes, producing false sev-5 "defects" (voxel-slab rocks = leaked fov-3 telephoto; buried-camera sunset) | `__shot` only applied specified fields | **FIXED**: `__shot` resets every unspecified field to its canonical default (bench README "Reset semantics") |
| *(round-6 panel, run in round 7 — the deferred full re-run)* **23 confirmed findings + 4 softer** over the round-6 tree; full list + fixes + scheduled homes in **`bench/critique-round6.md`**. None is a round-7 regression (round 7 shipped no world content). Highest-impact clusters below; the rest are in the file | The abbreviated round-6 main-loop review (7 BETTER / 3 UNCHANGED) missed most of this — the spend limit cut the panel to 3 sentinels; the full 65-agent panel is the real signal | Panel itself DISCHARGED (round-6 status's "re-run when the limit resets" is done); findings routed to the rounds below |
| *(round-6 panel, CONFIRMED sev4-5)* Luna eye-level ground re-speckles into a hard black-pepper carpet; airless boulders go clay-dome + hard-black cavity blotches; airless shadows crush to #000 | **Honest partial-regression on round 6's "speckle carpet removed" claim, airless only**: the material-stack bump octaves and cavity map assume ambient/sky fill; on Luna `gndV≈0` so micro-hollows and cavities clamp Lambert to 0 (holds fine on Tellus, where atmosphere fills). The one-bounce regolith fill (coeff 0.45, gated by open-sky gndV) is too weak | **Partially FIXED + RE-ATTRIBUTED round 9.** Shipped: an isotropic airless ambient floor (the `!atm` skyAmbient branch was a hard zero), the sunlit-neighbour bounce re-gated on `smoothstep(sinEl)` so it survives grazing sun, and a slope-scaled metre-scale-shadow bias. These fill the DIRECTLY-lit regolith (normal-sun Luna reads clean, kurt 15). But the mode diagnostic showed the black-pepper CARPET itself is the ~4 m meso relief self-shadowing at the terminator (same root as the beach checker) — NOT the bump octaves the round-6 diagnosis named; the fwidth roll-off was tried and reverted (it worsened the metrics). Residual grazing-facet aliasing → Phase-M filtered normals — **SHIPPED round 11** (smooth-normal fold + Gaussian σ shoulder on the direct term at the projected-footprint key; pavement-walk-luna dark-spike 6.96→4.78 %, boulder-macro-luna 9.39→4.47 %, kurt 68→18; near-field facets stay honestly bimodal by design) |
| *(round-6 panel, CONFIRMED sev4)* Luna "boulderfield" reads as a pockmarked plain — no readable boulders, just dark blotches in lattice rows | `denFloor:0.22` floods every cell with sub-decimetre clasts and Luna rock albedo [0.20] ≈ dust [0.26], so tiny clasts contribute only a shadow pixel | **FIXED round 8** (pure data): denFloor 0.22→0.08, sizeMin 0.1→0.2 (visible size floor), rock albedo 0.20→0.30 (fresh breccia outshines mature regolith); the pancake-puck sibling (sy floor 0.6 vs sx/sz ~1.3) fixed with sy floor 0.75 — flat profiles belong to the slab archetype. Residue: re-check density at the icon site once round-9 airless fill makes the scene readable (0.08 may want 0.10–0.12) |
| *(round-6 panel, CONFIRMED sev4)* Green fringe on every Tellus twilight limb/terminator; Rubra "blue sunset" has no blue near the sun; Rubra daytime sky collapses to a near-black zenith | Ozone Chappuis absorption doesn't reach grazing columns (`ozoneSecJS`=0 above-shell, MS table cut at `MS_MU0=-0.4` where deep twilight lives); the intended Rubra wavelength-split Mie aureole doesn't survive bloom/exposure; dust in-scatter falls off too steeply above the horizon | Phase 1 sky-view LUT / MS second installment (round 9): extend ozoneSec above-shell + lower MS_MU0; soften the sun PSF + lift blue Rayleigh; raise aerosol Hm + ground bounce (ties to the registered aerial-perspective residual) |
| *(round-6 panel, CONFIRMED sev4)* Ocean carries a diagonal texel-grid crosshatch from orbit; sun glint is a soft round bloom, not specular glitter | Per-texel bathymetry quantization shows through as a weave (the round-3 "checkerboard FIXED" is only half true — a residual grid survives); GGX roughness clamped very broad + folded slope variance smears the glint into a haze disc | Water v2 (round 10): linear-filter + smooth/bicubic the bathymetry channel; tighten the near-nadir specular lobe + add high-frequency slope modulation (Cox-Munk glitter) |
| *(round-6 panel, CONFIRMED sev4)* Down one vertical descent the same site whiplashes pale→tan→near-black→pink→beige, loses all water/greenery with no transition, and ground relief pops in at a hard altitude radius (flat 5 km→300 m, dunes+boulders switch on at 80 m) | Auto-exposure keys off frame composition (disc-on-black vs full-frame ground) with no cross-frame continuity; the far-field fold-to-mean colour and orbital discAlbedo proxy don't match the ground material stack; round-6 meso-displacement + the rock band are gated near-ground | Phase M (round 11): cross-frame exposure continuity keyed to absolute radiance; reconcile fold-to-mean colour with the ground stack + carry water into the near-ground material; extend meso displacement through the 300 m–5 km band and cross-fade rock activation |
| *(round-8 sweep)* beach-eye mid-field grew a black-and-white CHECKER SPECKLE BAND along the dune line (the round-6 baseline shows the same class as one small patch) — **an honest partial-regression shipped with the round**, the round-6-airless-caveat precedent | First attributed to the Tellus pavement term (pavK 0.2→0.06) — REFUTED by A/B sweeps: dkurt −58.9 vs −59.9, the band ignores pavK. The real amplifier is **catena's convexity rock boost** (kRock/kDen raise rockW + the CPU meso amplitude on dune-flank convexities), running the f2/f3 creased-bump octaves hot right at their footprint-fade boundary — near-Nyquist bump normals posterize under low sun. The CLASS is the registered round-6 texel-dapple/speckle family, amplified where catena now lawfully exposes rock | **RE-ATTRIBUTED + partially FIXED round 9 (the rule-2 note paid off).** The prescribed (a) fwidth roll-off and (b) fines floor were TRIED and made the metrics WORSE (beach kurt 27→81, and the fines floor regressed pavement-rubra 14→43 via a per-pixel-slope-gate flicker) — the THIRD wrong attribution. The **diagnostic modes** (albedo=smooth, normals=smooth, horizon-shadow=smooth) proved the band lives ONLY in the lit frame: the direct term `mu0=max(dot(n,sunDir),0)` self-shadowing the ~4 m CPU meso relief at the terminator, under-filled — NOT bumps, catena, pavement, or the shadow map. The speculative changes were reverted; the airless-fill terms (surge shoulder, ambient floor, grazing bounce) soften it (normal sun is clean) but the grazing-facet aliasing needs **Phase-M filtered/Toksvig normal folding — SHIPPED round 11**: the dune-line checker WALL is gone (the σ shoulder + normal fold at the projected-footprint key; the two-body gate held on Rubra/Tellus). Lesson: three blind attributions cost more than one mode-diagnostic |
| *(round-8 panel, 53 agents — finders Opus, skeptics Sonnet per rule 1)* **20 confirmed + 5 softer** over the round-8 tree; full dispositions in **`bench/critique-round8.md`**. Three highs fixed IN-ROUND (rows below); several "suspected regressions" proven pre-existing by the sweep's ≈0 metric deltas (the 5,000 km reticulation and the mid-LOD waxy dome are the round-6 lattice + relief rows re-observed) | The panel's adversarial two-body lens did exactly its job — it caught the gate failure the driver missed | Panel discharged; fixes verified by probe r8c; residue routed to rounds 9–11 per the file |
| *(round-8 panel, CONFIRMED sev-high)* **Two-body gate FAIL: Luna's joints read as the same flagstone pavement as Rubra** — same cellular mechanism, different knobs only; the exact "Mars feature wearing a law's clothing" the anti-overfit law forbids | plates() was body-agnostic up to scalars: same tabular metric (false bedding on igneous breccia), same coplanar tops, same sand-seam grooves on both bodies | **FIXED round 8 (post-panel batch)**: `jointTab` recipe scalar picks the fracture AGENT — tabular tectonic flagstone (Rubra 1.0/Tellus 0.8: oriented sets, flat tops, full grooves) vs equant impact shatter (Luna 0.1: isotropic metric, rough tops, softened tone-first gardened boundaries). Verified divergent by probe |
| *(round-8 panel, CONFIRMED sev-high)* Joint plates monodisperse — single-scale Voronoi read as a mud-crack decal, not fractured bedrock | One jittered site per lattice cell ⇒ near-constant F2−F1 spacing, no block-size hierarchy | **FIXED round 8 (post-panel batch)**: symmetric two-site merge hash erases ~1/3 of joints, fusing cells into larger polyomino blocks. Residue: a true master-joint octave (4×S gating sub-plates) — DEFERRED past round 9 (the merge hash already delivers a block-size distribution; the extra octave costs a second cellular pass for marginal gain — the "round-14 texture-stack pass" pointer was STALE — round 14 became formations/impostors; re-registered to a future ground-texture round) |
| *(round-8 panel, CONFIRMED sev-med)* Rubra joints read as dark incised grooves (pixel-sampled 35–55% darker), not wind-filled sand seams; per-plate tone invisible | Groove recess + crevice darkening dominated the fill-albedo lift; tone ±9% was gated by the interior mask to near-zero | **FIXED round 8 (post-panel batch)**: groove depth ×(1−0.9·fill) in filled joints, plate tone ±16% ungated |
| *(round-8 panel, CONFIRMED sev-med)* Plates are not coplanar — joints drape over the rolling meso relief ("cracks scribed on a blanket") | The interior damping flattens the micro octaves only; the ~4 m meso octave is CPU VERTEX displacement, which a fragment term cannot flatten | DEFERRED past round 9: per-plate mean-plane counter-shaping in dH (normals-only fake) was skipped — the meso relief is CPU VERTEX displacement, so a fragment counter-shape is cosmetic at best; the honest fix is mesh-side plate quantization — its "round-14 texture-stack pass" pointer was STALE (round 14 became formations/impostors); re-registered to a future ground-texture round |
| *(round-8 panel, CONFIRMED sev-med)* G4 ripples never read as directional trains (isotropic grit on Tellus, featureless swales on Rubra); catena contrast dies beyond the near field and is invisible on pure-dust plains | Ripple amp loses to the macro dust vnoise and the `trains` patch noise destroys along-wind coherence; far-field fill folds to 0.38·supply with too shallow a fines→supply curve; no albedo response where rockW≈0 | **FIXED round 9 (data/look)**: ripple amp 0.05→0.08 and the train envelope now sampled stretched ALONG the wind + slow ACROSS the crest, so ripples read as directional trains migrating along uWindA (not isotropic grit); catena fines→supply ramp steepened (0.02–0.25) with a subtle fines-pond albedo tint so crater-floor ponds read on dust flats |
| *(round-8 panel, CONFIRMED sev-med)* Distant terrain fails to converge to the horizon sky at eye level (bright warm rim under a darker sky); dawn sky carries a dark band just above the horizon; orbital limb wedges a saturated orange/red ring | Aerial-perspective in-scatter under-fills at grazing chords (the registered MS/aerial residual family, measured three new ways) | **Acceptance check SHIPPED round 9** (`bench/metrics.mjs horizon_gap`): median column luminance step across the terrain→sky boundary (measured: beach ~0.26, Rubra ~0.17; airless bodies correctly read a sharp gap). The MS in-scatter grazing FILL that would close the gap is registered as the MS second installment's continued work — per rule 2 the aerial-perspective hunt is not started blind; the check now measures it |
| *(round-8 panel, CONFIRMED sev-med)* Luna macro shots clip to featureless white — the surge term pushes near-normal-incidence regolith past 1.0, blocking all ground-law judgement at high sun | Sharper diagnosis of the registered airless-exposure family: opposition surge has no highlight shoulder | **FIXED round 9**: opposition-surge SHOULDER `1 + B0·B/(1 + 0.5·B0·B)` (`brdfDiffuse`) caps the boost so sunlit regolith lands below clip while staying monotone + peaked at opposition (full-Moon flatness survives). Verified: luna-highsun p95 0.53, textured, not blown |

| *(round-9 panel, 53 agents — finders Opus, skeptics Sonnet per rule 1)* **14 confirmed + 5 softer** over the round-9 tree; full dispositions in **`bench/critique-round9.md`**. The panel caught two real round-9 REGRESSIONS the driver missed (eclipse-ground floor not occluder-gated; slope-scaled shadow bias posterizing the metre-scale map) and separated them from the pre-existing set | The adversarial multi-lens pass did its job on the new photometry | Panel discharged; post-panel batch fixed the two regressions + the ring-amplitude + the ripple-diamond, verified by probe; the rest routed below |
| *(round-9 panel, CONFIRMED sev-high)* lunar-eclipse-ground read as bright neutral NOON — no umbral darkening, zero copper | The round-9 isotropic airless AMBIENT floor keyed on geometric sun elevation, never on occluder visibility, so it stayed at full daytime value through totality and washed out the copper the eclipse-gated direct/bounce terms were adding | **FIXED round 9 (post-panel)**: the airless ambient now multiplies by the sun visibility carried in `TsRaw` (`soft·vis`; ~0 in the umbra), so the floor collapses under the occluder and the copper ring lights the regolith — verified (the ground glows copper) |
| *(round-9 panel, sev-high — RE-ATTRIBUTED)* blocky black/white band at macro/near range on Luna and Rubra, blamed on the round-9 slope-scaled shadow bias | The slope bias WAS a mistaken addition (never the leopard fix; can worsen near-ground map acne) — but the band the panel pointed at (boulder-macro-rubra distant bench) sits BEYOND the ~35 m shadow-map box and is PIXEL-IDENTICAL in the round-8 baseline (A/B): it is pre-existing grazing meso-facet self-shadow, a THIRD mis-attribution of that family | **REVERTED the slope bias round 9** (clean removal of a speculative change); the BAND itself is the registered grazing meso-facet residual → Phase-M filtered normals, **SHIPPED round 11** (boulder-macro-rubra kurt flat 19.5→17.1 — the fix acts by mechanism, not by body). Caught by baseline A/B, not another blind fix |
| *(round-9 panel, CONFIRMED sev-high, REGISTERED)* lit Luna regolith washes to a low-contrast ~233 near-white plateau while shadows crush to ink-black (bimodal, no midtones) — two-body FAIL vs Rubra/Tellus | The surge shoulder holds the hard 255-clip but the L-S kernel is near-flat on a plain and the exposure servo + airless fill leave a bimodal high-contrast frame (real Apollo frames are bimodal too) | Round 9 improved it (surge shoulder, eclipse-gated floor, grazing bounce); the midtone/contrast balance + macro-shading on flat plains is the CONTINUED airless-photometry installment (rule 2: no blind exposure re-tune) |
| *(round-9 panel, CONFIRMED sev-high, REGISTERED)* stars burn through solid foreground terrain (luna-knife-edge boulders) | Pre-existing: the star layer composites additively after post with no terrain depth test, occluded only by the datum sphere; relief above the horizon never culls stars | Round-9 star-occlusion ADDED companion-disc + sun occlusion (a net improvement); terrain star-occlusion needs the depth buffer or a horizon-field lookup in the star pass → **FIXED round 11**: rtScene carries a DepthTexture and STAR_VERT taps it at each star's own projected pixel (MSAA-safe on r160); luna-knife-edge grad-kurt 1026→178, stars stop AT the boulder silhouette |
## The rules (the contract)

Every roadmap item below is tagged with its **home** — the only places a feature is
allowed to live:

| Tag | Home | Discipline it inherits |
|---|---|---|
| `[bake]` | baked field / process module (bakecore) | halo rules, band ownership, accretion, determinism |
| `[look]` | render-time derived look (shader) | pure fn of fields + body-fixed position (+ time), LOD-independent |
| `[sky]` | the one scattering integral / sky-pass analytic object | altitude-independent, evaluable from outside |
| `[ladder]` | representation ladder (mesh → impostor → disc → point) | mean/variance-preserving hand-downs |
| `[frame]` | frame tree / ephemeris | closed-form in time |
| `[camera]` | exposure, PSF, tone, noise | applied after radiance, never in the world |
| `[domain]` | base domain the rasters displace (§11) | sphere is the common case, not the assumption |
| `[recipe]` | pure data | counts are data; no shader assumes one of anything |
| `[global]` | one-time planet-wide coarse pass | for §4's "expensive long-range processes": run ONCE at a declared coarse level on a single global grid assembled across all six faces; output is a read-only input field, itself a pure function of the body id — tiles *sample* it, never re-derive it |
| `[time-field]` | coverage-class field keyed (face, uv-box, level, **t**) | value is closed-form in t with no inter-key state (§8 clouds precedent); caching quantizes t into recipe-declared keyframes with a fixed deterministic interpolation, so two machines at the same t render identically; advected patterns evaluate in closed-form *drifted coordinates* (e.g. lon − ω·t), never face-local uv, so face edges stay seamless |

A feature that can't be placed in this table doesn't get built.

## Extend vs replace — the honesty ledger

v0 was built to prove the architecture, and some of its implementations were
scaffolding. So we don't get trapped polishing past suboptimal decisions, every
subsystem is declared up front as **preserve** (the contract), **extend** (the
foundation is right), or **replace** (scheduled for demolition — incremental fixes to
these must justify themselves as bridge work, and no exit criterion may depend on
tuning them). The meta-rule: *interfaces are the contract, implementations are
disposable* — anything may be rewritten wholesale if the bench says the rewrite wins.

**Preserve (the contract — never rewritten, only honored):** the CONCEPT invariants
themselves; the recipe schema and field semantics (a recipe written today must still
bake in the photoreal engine); the determinism/halo/seam test battery and the bench —
tests and benchmarks outlive every implementation below.

**Extend (foundation validated, build on it):**
- Cube-sphere quadtree + halo-baked rasters + accretion discipline (the core bet —
  the seam tests prove it; Phase 2/5 stack more processes on it).
- The frame tree / closed-form ephemeris (extend circular orbits to full conics +
  proper obliquity seasons — same shape, more terms).
- Camera-relative rendering, double-precision centers, log depth.
- The engine-reads-only-the-recipe pattern; bodies as data.
- The worker bake pipeline (extends with `[global]` passes; may later *migrate* to
  GPU compute for throughput — a port, not a redesign).
- The scatter lattice discipline (extends to archetypes, hierarchy, formations).
- The headless critique/bench loop itself.

**Replace (scheduled demolition — don't polish):**
- **The atmosphere implementation.** The inline single-scatter marcher with its fudge
  factors (1.55× Rayleigh, ambient-coupled MS proxy, 4-step sun OD, CPU ambient
  samples) is Phase 1 demolition material for the LUT stack. The *interface* — one
  integral, recipe β spectra, altitude-independence, the occlusion slot — is
  preserved; the marcher is not.
- **Terrain fragment shading.** The hand-mixed palette blends (dust/rock/ice/veg
  lerps, value-noise speckle) are replaced by the material-layer system: BRDF library
  + detail-texture stacks driven by the same fields.
- **Ocean fragment shading.** The 6-sine sum with `fwidth` fades is replaced by
  wind-sea+swell spectra with filtered moment folding (Phases M/2). The per-tile
  double-precision phase machinery and the level-set concept carry over.
- **The star field.** Hash stars → catalog + galaxy radiance map.
- **Auto-exposure metering.** The `scene_L` heuristic formula → histogram metering on
  actual rendered radiance (a real camera meters the image, not a proxy).
- **The LOD split metric.** Distance/arc ratio → screen-space band-amplitude error
  (Phase M). The quadtree stays; the decision rule goes.
- **v0 terrain content.** The Tellus/Rubra/Luna band configs are placeholders; expect
  wholesale re-authoring on the Phase 2 process set rather than parameter tuning.

**Strategic checkpoints (decide, don't drift):**
- **three.js + WebGL2 vs WebGPU** — WebGL2 was chosen for headless-SwiftShader
  benchmarking, and it constrains volumetrics/compute (and forced the inline-splice
  driver workaround). Decision point at Phase 4 (clouds): if froxel volumetrics and
  GPU baking justify it, port the renderer layer to WebGPU. The port is contained by
  design: the world function (baker, recipes, ephemeris) never touches the GPU API,
  and shaders are already declared disposable above. Headless scoring on WebGPU must
  be proven *before* the port is approved.
- **Field packing.** One RGBA8 texture (rock/ice/AO/rockDensity) is already full;
  Phase 2's fields (moisture, age, stress, flow…) need a field-atlas refactor (texture
  array + per-recipe channel manifest). Precision is part of it: 8-bit AO already
  bands into visible contour rings under night-exposure amplification — perceptually
  critical fields move to 16-bit (or get dithered) in the same refactor. Do it once,
  at Phase 2 entry, not channel by channel.
- **Raster/halo budget.** 64-cell tiles with halo 6 cap stateful ops at 2 iterations;
  richer erosion may want 128-cell tiles or larger halos — a cost/quality decision to
  make with Phase 2 profiling data, not a default to inherit.
- **CPU mesh building** on the main thread survives until it shows up in the motion
  bench's frame-time histograms; then it moves to the worker (or GPU) mechanically.

---

## Phase R — Reference corpus & benchmark harness (build FIRST)

"Looks toy" must become a number before we can burn it down. Deliverable: `bench/`.

### R1. Real-photo corpus (`bench/refs/`)

Curated, license-clean, **geometry-annotated** references per body-analog and per scale
band (whole-disk / limb / regional / local / ground). Primary sources:

| Analog | Sources (public-domain or permissive) |
|---|---|
| Tellus (Earth) | DSCOVR EPIC whole-disk; Himawari-8/9 (CC BY 4.0); GOES; ISS Gateway to Astronaut Photography; Landsat 8/9, Sentinel-2 (regional); VIIRS Black Marble (night) |
| Luna (Moon) | LROC WAC mosaics + NAC frames (regional/local); **whole-disk photometry:** Clementine & Galileo flyby full-disk mosaics, Kaguya HDTV frames, ROLO ground-based photometry, or disk profiles forward-modeled from LROC-WAC Hapke maps; Apollo Hasselblad scans (ground) |
| Rubra (Mars) | Viking & MGS MOC global mosaics; CTX/HiRISE regional-to-local; MSL + Mars 2020 Navcam/Mastcam ground panoramas (a starter set is already in `bench/refs/rubra-ground/` — the source of ground laws G1–G6); MER sunset sequences |
| Titan | Cassini ISS (938 nm CB3) + VIMS (5 µm) disk/limb — **band-annotated**; Huygens DISR descent mosaic + surface frame (credit ESA/NASA/JPL/Univ. of Arizona; source from the NASA PDS archive and verify license per image) |
| Venus | Mariner 10 & Akatsuki UV/IR cloud imagery (JAXA terms); Magellan SAR mosaics (structure reference, not photometric); Venera-13/14 surface panoramas (rights unclear — reference-only, do not redistribute) |
| Ice/cryo class | Galileo (Europa, Ganymede), Cassini (Enceladus, Iapetus, Dione), New Horizons (Pluto/Charon), Voyager 2 (Triton) |
| Small/irregular | Rosetta NAVCAM 67P (CC BY-SA 3.0 IGO); Dawn (Vesta, Ceres); Hayabusa2 (JAXA); OSIRIS-REx Bennu |
| Giants & rings | Cassini (Saturn, rings, spokes, forward-scatter); Juno JunoCam **raw frames** (NASA/SwRI/MSSS — reprocess in-house; community-processed versions only with a per-image license recorded in the manifest, many are NC); Voyager/HST |

Each entry in `bench/manifest.json` records: source URL + **verified per-image
license** (an R1 acceptance criterion, not an afterthought), body analog, scale band,
a `colorimetric` flag (`true` / `approximate` / `false` — most planetary imagery is
not true-color), and **viewing geometry** (phase angle, sub-solar and sub-observer
lat/lon, range, filter/wavelength — from PDS labels where available). Geometry and
band are what make a comparison honest: we re-pose our camera to *match each
reference*, not to flatter.

### R2. Synthetic look-boards (`bench/boards/`)

Where no photo exists (eye level on Europa, standing in a Venus twilight), use the
in-repo `imagegen.py` to generate *look-development boards* from carefully written
prompts (and `edit` mode seeded with real analog photos). Rules: boards are labeled
`synthetic`, used to steer art direction only — they are **never scored against** as
ground truth (generated images have their own tells and biases; benchmarking against
them optimizes toward a different fiction).

### R3. Matched-shot generator

Extend `__shot` + `screenshot.mjs` with: `phaseDeg` (solves tday for a requested
sun–body–camera phase), free sun azimuth, `clean: true` (hide UI/HUD for scoring
frames), fixed-EV mode (metering differences shouldn't pollute comparisons), and a
**spectral band mode**: the recipe already stores β *spectra*, so rendering at a
reference's filter wavelength is sampling the same integral at one λ instead of
integrating to RGB — a `[camera]` property (sensor band), not world state. Fool-rate
scoring is restricted to **band-matched pairs**; off-band references remain as art
direction. A `bench/pose.mjs` maps each manifest entry to a `__shot` spec via the
deterministic ephemeris — same machinery, no new state.

### R4. Scoring

- **Blind panel (north star):** shuffled real/render pairs at matched geometry and
  band, forced-choice "which is the photograph" by a multi-agent panel (the existing
  critique-workflow pattern). Anti-confound protocol: draw **non-iconic frames from
  raw/PDS archives** (never press images the panel may recognize), present **cropped
  sub-regions**, push both real and rendered images through **one normalization
  pipeline** (common resample, identical re-encode, matched noise floor), and
  calibrate with real-vs-real control pairs — report fool-rate *relative to that
  baseline*. **n ≥ 100 pairs per body × scale band** (cheap with an agent panel and
  the headless generator); gates use the **Wilson 95% CI lower bound**, not the point
  estimate. Attribute rubric (photometry / structure / color / camera) localizes
  failures.
- **Objective tells:** radially-averaged luminance power spectrum (slope + anisotropy —
  toy renders are spectrally too clean; compare only after the shared normalization
  pipeline, since reference PSF/compression contaminate spectra), gradient-histogram
  kurtosis (real terrain is heavy-tailed: cliffs and shadows), limb brightness
  profiles for disks, shadow-fraction vs sun elevation; CIELAB gamut + hue histograms
  **only against `colorimetric: true` references** (calibrated Mastcam, ISS photos,
  Himawari true-color) — everything else is scored on luminance metrics alone.
  Script: `bench/metrics.mjs` over PNG pairs.
- **Gate:** every phase below declares exit criteria in these units. The suite runs
  headless (`npm run bench`) so any visual change re-scores.

---

## Phase 1 — Photometry, shadows, camera ("de-toy every scale at once")

The highest leverage per line of code. All items are `[look]`, `[sky]`, or `[camera]` —
no new baked state except the horizon field.

| Item | Home | Mechanism |
|---|---|---|
| Material BRDF library | `[look]` `[recipe]` | Per-material BRDF params in the recipe: Lommel-Seeliger + Hapke-lite (single-scattering albedo, opposition surge width/amplitude) for regolith; microfacet for ice/rock faces; retro-reflection for frost. Replaces the current airless if-branch. |
| Opposition surge | `[look]` | Hapke shadow-hiding term of phase angle — full Moon flatness and the bright halo around a ground camera's own shadow point, from one formula. |
| Cast terrain shadows | `[bake]` `[look]` | The §4/§10 **baked horizon-angle field** (8-direction max-elevation octants). Not additive accretion: each level **re-derives** its octants from its own height raster with a declared bounded scan reach (which sets its halo budget), then takes the **max** against the inherited coarse-level value — far mountains arrive via the parent, near ridges via the local scan; the max operator is order-independent so determinism and LOD-consistency hold. Direct sun multiplies by a soft horizon test. Long terminator shadows are the single biggest "photograph" cue on airless bodies. |
| Metre-scale shadows | `[look]` | Camera-local shadow map for the debris/mesh band only (§10 explicitly scopes shadow maps to m–km). Presentation aid, world stays pure. |
| Multiple scattering done right | `[sky]` | Replace the 1.55×/proxy fudges with precomputed Bruneton-style LUTs (transmittance + multi-scatter), parameterized by the recipe's β spectra. Must keep the eclipse/occlusion slot (§10) — with the honesty note that a point-local visibility multiplier is exact only for the single-scatter term; the multi-scatter term needs a widened (blurred-source) occlusion factor or umbra interiors over-darken (Venus and eclipse umbrae make this visible). Mind the DESIGN.md driver landmines (no out-param GLSL; LUT sampling instead of dynamic loops is a perf win on ANGLE too). |
| Atmospheric refraction | `[sky]` `[recipe]` | Recipe declares refractivity(λ) ∝ density. Two consumers: (a) the occluder cone test gains an analytic **refracted-annulus** source term — during totality no straight ray reaches the Moon, so the copper eclipse *is* refraction; the claim "copper = occluder transmittance" only works through this term; (b) inside dense atmospheres, apparent-elevation remapping via a per-recipe deflection LUT (flattened setting sun on Earth; periscope-horizon distortion on Venus). Venus descent and the copper-eclipse milestone are **gated on this item**. |
| Sky ambient from the LUT | `[sky]` | Terrain ambient becomes an irradiance LUT lookup keyed on the **sample's** altitude and sun elevation — not a global uniform metered under the camera (v0's shortcut, which paints daytime ambient onto the night side whenever a view spans the terminator; the split-screen disc framing makes it glaring). Ground and sky *still* cannot disagree, and lighting stops depending on where the camera is. |
| Physical camera v1 | `[camera]` | PSF bloom (energy-conserving kernel post-exposure), lens flare/veiling glare optional, sensor grain (deterministic per-frame hash keyed on time), white-balance choice (D65 "as-camera" vs as-scene), selectable metering (avg/center/spot) — auto-exposure already exists. |
| Night sky v2 | `[sky]` `[recipe]` | Real bright-star catalog (Hipparcos/Gaia top ~9000 baked to a small texture) with B–V → color temperature and true magnitudes; hashed faint tail continuing the magnitude power law; the **Milky Way** as an inertial-frame integrated-starlight radiance map (§9 — it must rotate with the star backdrop); a few clusters/nebulae as catalog entries; zodiacal light lobe along the ecliptic. Stars don't twinkle in vacuum — scintillation appears only through an atmosphere, as a camera-time effect. |
| Night-side pack | `[sky]` `[look]` `[frame]` | What makes a night hemisphere *read*: planetshine (§10 — the moonlit ground and the moonlit ocean glint), aurora ovals pulled forward from Phase 4 for the night-disk shot, airglow limb (✅) plus faint disc-interior airglow structure (gravity-wave banding as a `[time-field]` look), and exposure behavior that lets the dark side sit *dark* against the star field instead of washing teal. |
| Whole-disc ladder v2 | `[ladder]` `[bake]` | §11 as written: **disc albedo from the root tiles** — bake each body's six root tiles down to a small equirect albedo/elevation map once (deterministic, cached), and have the disc representation sample it, shaded with the same Hapke/L-S photometry and limb profile as the terrain, hand-downs mean- and variance-preserving through disc → point flux. A moon at 20 px must show its maria and its correct phase curve — never a white ball. This also feeds planetshine (the §10 whole-disc radiance) for free. |
| Eclipse & transit machinery | `[frame]` `[sky]` | Penumbra-aware cone test of the solar disc vs the body list (§10) — moon transit shadow dots on the primary, umbra/penumbra gradients, copper lunar eclipses via the occluder's transmittance spectrum. Counts are data: works for any system. |

Also pulled forward from Phase 2 (cheap, and Luna's disk identity depends on it): the
coarse **maria/highlands albedo province field** — without it no photometric fix can
make a full Moon read as the Moon.

**Exit criteria:** Luna-analog fool-rate ≥ 30% at **high-phase/terminator disk shots**
(what Phase 1 actually builds: shadow structure, limb profile, surge) and ≥ 20% at
ground scale; the low-phase full-disk gate moves to Phase 2. Limb profile error < 10%
vs Clementine/Kaguya/ROLO-class whole-disk references; terminator shadow-fraction
curve within the family of real low-sun frames.

## Phase M — Motion & the cinematic camera (temporal realism)

The end product is *real-time cinematic capture*, so motion quality is a shipping
surface, not a nicety. Everything here is presentation or camera — CONCEPT explicitly
carves out this space ("rebasing is presentation, never meaning"; technique
transitions "may change how the integral is computed, never what it converges to").
The world function never changes; only how smoothly we approach it.

| Item | Home | Mechanism |
|---|---|---|
| Band-onset ramps | `[bake]` | §4's "a band's onset should blend in rather than switch on", actually enforced: **every** process amplitude (craters above all) ramps in over ≥ 2 levels, like `procThermal`'s onset already does. Kills the largest pops at the *content* level — this is a correctness fix, not presentation. |
| Screen-space-error split | engine | Split when a band's *amplitude in projected pixels* would exceed a threshold, instead of the distance/arc ratio — new bands then arrive sub-pixel by construction, which is what "LOD-independent appearance" means statistically. Applies to bake bands, micro-detail fades, and scatter visibility alike. |
| Geomorphing | presentation | Vertex heights morph from parent-sampled to own-band values as a continuous function of the split metric (§1 sanctions it by name). Deterministic per camera distance; no wall-clock state. |
| Stream-in crossfade | presentation | Draw-best-available currently *swaps* tiles the frame a deeper bake lands; crossfade over a short interval instead. Also apply to debris visibility (rocks currently pop at the radius edge — fade scale over the last 15%). |
| Filtered specular/normal folding | `[look]` | Replace per-pixel `fwidth` band fades with LEAN/Toksvig-style *moment folding*: micro-normal variance folds into roughness analytically, stable under motion. This is the ocean-shimmer fix and the micro-detail-sparkle fix in one mechanism (§7/§12's variance-preserving hand-down, done properly). |
| Shoreline & foam stability | `[look]` | Soft depth-blend at the waterline instead of the hard `discard` edge; foam driven by filtered wave-phase quantities rather than raw noise, so it breathes instead of sizzling. (Content side of the fix is Phase 2 "Water v2".) |
| Scatter hand-down (no edges) | `[look]` `[recipe]` | §7's law applied to the rocks themselves: distance chooses representation, never membership. Replace the hard visibility radius with **screen-footprint-keyed** transitions: per-instance, hash-jittered thresholds (small clasts fold first, boulders persist much farther — sorted persistence for free), each instance crossfading (stable dither, no alpha sort) into the ground material's rock contribution with the **mean/variance budget conserved** — the folded far representation already exists as the rockDensity-driven detail; today the two double-count instead of trading off. Decouple per-instance visibility from per-tile build gating so tile boundaries never show. Kills the "render bubble" edge and the build-pop in one mechanism. |
| Camera motion pack | `[camera]` | Temporal accumulation/supersampling for stills ("hold still → image refines"), motion blur from the camera path, and **cinematic grade profiles** (film-response tone curves, halation, gate weave off/on) as named camera presets — "leaning cinematic" is a legitimate *camera* choice and never leaks into the world. |
| Motion bench | bench | `bench/motion/`: scripted descent, orbit-rotation, and fixed-camera-over-ocean paths rendered headless as frame sequences; scored on pop statistics (p99 per-pixel luminance step between adjacent frames, discounting camera flow) and flicker energy (temporal variance at fixed camera). Gates below use these. |

**Exit criteria:** on the canned descent and orbit-rotation paths, zero visible pop
events above threshold (p99 step within the family measured on real orbital video,
e.g. ISS time-lapse); fixed-camera ocean and micro-detail flicker energy below
threshold; a blind panel watching 5-second clips stops naming "popping/shimmer" as an
attribute failure.

## Phase T — Tooling: the tuning loop & director tools (continuous, like R)

Every defect in the register was found by a human *flying around and looking* — not by
the batch bench. That loop is the real production line of v2, and it deserves tools.
Likewise, "screenshots I can take" makes the capture UX itself a product surface.

- **Photo mode** `[camera]`. In-app: pause/scrub time, free camera with FOV/roll,
  supersampled still capture, EV/grade/white-balance controls, focus/DoF for near
  subjects. This is where "lean cinematic" is actually *used*.
- **Camera paths & bookmarks.** Keyframed camera moves (the motion bench's canned
  paths become authorable), and every view bookmarkable as a `__shot` spec — a
  bookmark *is* a reproducible scene.
- **One-key defect capture.** A hotkey that writes the current `__shot` spec +
  screenshot + HUD state into `bench/defects/` — every "this looks wrong" moment
  arrives as a reproducible register row instead of a description. The register
  stops being prose and becomes a queue of scenes.
- **The tuning loop.** Recipe iteration latency is the velocity limit for everything
  in Phase 2: hot recipe reload with **band-selective cache invalidation** (changing
  a level-8+ process must not rebake levels 0–7), and same-seed A/B diff renders
  (old vs new recipe, same view, side by side).
- **Seed-casting tooling.** The "singularity" item's selection workflow made real:
  `bench/casting.mjs` bakes N seeds at coarse level, renders whole-disk + limb
  contact sheets, and runs the panel over them. Choosing a world becomes an
  afternoon, not a superstition.
- **Process contract harness.** `bake-test.mjs` generalizes into property tests that
  run automatically against *every* registered process: halo bit-exactness,
  determinism, band ownership, cross-face behavior, valid-region bookkeeping. A new
  Phase 2/5 process cannot ship without passing the contract it never wrote.
- **Asset build step** (amendment to "no build step"). v2 introduces generated
  artifacts for the first time — rock mesh packs, material stacks, star catalog
  texture, scattering LUTs. One deterministic, seeded `npm run assets` produces them
  with a hashed manifest; the *runtime* stays build-free and the artifacts are data.
- **Performance budgets as gates.** "Real-time" is a spec: a frame-time budget table
  per subsystem (terrain / ocean / clouds / sky / scatter) on reference hardware,
  measured by the motion bench every run. A phase that ships beautiful-but-20fps has
  not shipped; the WebGPU checkpoint decision consumes this data.

## Phase 2 — Geological structure (the "geo realism" core: taxonomy A, B, D)

The toy-killer at regional scale is *causality*: every landform must look like
something **did** it. Architecturally these are new process modules (`[bake]`) plus
derived looks — the pipeline was built for exactly this. Two structural upgrades
unlock most of the list:

- **Prerequisite — the shared global coarse grid** `[global]`. DESIGN.md already
  concedes that per-face grid-stateful ops fade near the 12 cube edges; Phase 2 adds
  many more stateful ops, so this debt comes due first. One planet-wide coarse grid
  (all six faces assembled, edges metrically stitched) hosts every long-range pass
  below; per-tile ops keep their halo rules for the band-limited work only. Exit
  criteria for this phase explicitly measure spectrum anisotropy in windows that
  *straddle cube edges*, not just face interiors.
- **Oriented context fields.** A coarse `stress` field (direction + magnitude, baked
  like any field) makes tectonism expressible: ridges, scarps, grabens, and wrinkle
  ridges become *anisotropic* stamps aligned to it, instead of isotropic noise.
  Likewise a `wind` direction field (from latitude bands + terrain deflection) drives
  everything aeolian, and an `age` field drives maturity everywhere. **SHIPPED round
  12** (atlas L5/L6: Cartesian wind + windward/lee exposure with MIP footprint
  folding; signed dominant stress from the closed-form two-source law; youth as an
  overwrite-per-level context — orientation is re-derived closed-form by consumers,
  never baked as an angle).
- **Global flow routing** `[global]`. Flow accumulation and basin membership have
  **unbounded upstream reach — the halo guarantee cannot apply to them**, and real
  drainage crosses cube faces. So routing is exactly what §4's "expensive long-range
  processes run once at coarse levels" clause exists for: one deterministic D8 +
  accumulation + watershed pass over the global coarse grid (a pure function of the
  body id, since its inputs are deterministic tiles), producing read-only `flow` and
  `basin` fields that tiles at every level *sample and never re-derive*. Finer bands
  only sharpen inherited valleys (band-limited incision under normal halo rules) —
  never re-route. This is what makes coastlines, deltas and valley networks stop lying.
- **Vegetation & biomes** (CONCEPT §7 names this a first-class client; Tellus bench
  references — Landsat/Sentinel regional, ISS ground — will score it). Baked
  biome/vegetation-density context fields from the climate fields (+ the global
  `flow`/moisture data), a **closed-form seasonal cycle** in t, and the §7 ladder for
  representation: instanced flora near, impostors mid, density folded into
  albedo/roughness far — mean- and variance-preserving hand-downs, forest-from-orbit
  as the aggregate of its trees. The current shader-derived tint (✅) becomes the far
  end of that ladder.
- **Seasonal volatiles / transient-albedo overlay** `[look]` (+`[bake]` for static
  susceptibility fields). Terrain tiles are keyed *without* time, so anything seasonal
  or transient on the surface must be a render-time overlay: appearance = pure
  fn(baked susceptibility/context fields, closed-form solar longitude Lₛ(t)).
  Clients: **seasonal polar cap advance/retreat** (the top whole-disk Mars cue, added
  here to the taxonomy), CO₂ frost, RSL, dust-devil tracks, araneiform fan darkening.
  **SHIPPED round 13** (the cap client): a render-time frost overlay = pure fn(latitude,
  closed-form subsolar declination `uSunDir.y` — spin-invariant ⇒ purely seasonal),
  advancing equatorward each winter, shared by the ground and the companion disc via one
  `seasonalFrost()` (§11); Rubra CO₂, Tellus H₂O snow, Luna none. RSL / dust-devil /
  araneiform clients remain.
- **Beyond the heightfield** `[recipe]` `[look]`. **SHIPPED round 14** (hoodoo /
  undercut outcrop / buried-footing arch + calved-block fields, placed by the BAKED
  riser-exposure field procStrata writes at cap time × gate × slope window, plumb
  orientation, FORM lighting = rock conventions + baked overhang AO + the strata
  octave-family bed tone; the impostor rung + the terrain-share fold complete the
  ladder). Remaining formation content (mesa-rim populations as a distinct archetype,
  SDF+MC genus-1 arches) is registered data/asset work. A heightfield cannot make an
  overhang, an arch, a hoodoo, or a boulder the camera can walk around — and that is
  much of why eye-level shots read as "heightmesh + scatter." The §7 scatter class
  already covers this conceptually ("a rock is a fact of the planet"): extend it to a
  library of **formation archetypes** — mesa caprock rims, hoodoos, arches, collapsed
  cliff blocks, bedrock outcrops with real overhang geometry — instanced by the same
  global-lattice hash discipline, *placed by the fields* (strata hardness, slope, age,
  rock density), and handed down the mesh → impostor → folded-roughness ladder.
- **Clustered, varied scatter** `[recipe]`. Real debris is hierarchical and social:
  outcrops shed boulder trains, boulders shed cobble fans, everything ages together.
  Parent-child hash placement (fragments key off their parent's hash), several rock
  archetypes per material class with rounding/burial parameters, and density that
  comes from the geology — talus cones under cliffs, ejecta blankets, clean interdune
  corridors — instead of one scalar field.
- **Material detail textures** `[look]` `[recipe]`. **SHIPPED round 10** (`matstack.js`: four baked tileable per-material stacks — regolith fines / cracked basalt / duricrust / firn — §7 hash-rotated, mipmap-folded, co-registered albedo/relief/roughness). Replace the value-noise speckle
  with per-material anti-tiled **detail texture stacks** (albedo/normal/roughness,
  hash-rotated per §7's anti-tiling) — cracked basalt, regolith fines, duricrust,
  firn. This is most of what "texture realism" means inside 50 m.
- **Coherent bedforms** `[bake]`. Dunes are *systems*, not bumps: crest spacing,
  defect merging, slip-face asymmetry along the `wind` field, with ripples nested
  under dunes (band ownership per octave, §7). Same machinery does snow sastrugi and
  Titan's linear dunes. **SHIPPED round 12** (anchored Gabor packets: anchor-relative
  phase — an absolute projection decorrelates at R/λ sensitivity — and alignment-
  weighted envelopes — orthogonal packets otherwise print PLAID; ergs live at
  supply×wind winners; Tellus polar megadunes are the second agent; Titan rides its
  recipe in round 16).
- **Singularity from first principles** `[bake]` `[recipe]`. Real planets have one
  Tharsis and one Valles *without anyone naming them* — singularity is a property of
  the generating statistics, and hardcoding a feature list would betray the concept.
  Four mechanisms produce it honestly:
  (a) **Heavy-tailed size-frequency laws.** Extend the crater process to basin scale
  with a true power-law SFD — today's per-band constant density truncates the tail
  (max ~150 km), making a Hellas statistically impossible. With the correct tail, one
  or two giant basins *emerge* from the same lattice hash, and downstream processes
  (age resets, ejecta mantling, rim uplands) react to them.
  (b) **A low-degree top of the cascade.** The accretion cascade currently starts at
  mid frequencies; physics says the longest convection wavelengths dominate — so the
  first bands should be explicit spherical-harmonic degree-1–3 structure: crustal
  dichotomy, one or two mantle swells. Still pure position stamps seeded by body id.
  (c) **Winner-take-all concentration.** Volcanism thresholds on the swell field's
  peak (few giant edifices, not sprinkled bumps); rifting where the swell's radial
  stress peaks (one great canyon system, emergent); each a causal consequence of (b).
  (d) **Consequence-chain albedo.** Mars's face is mostly albedo: dust mantles lows
  and lee sides (bright), wind scours young basalt plains (dark), streaks trail
  craters — all derivable from wind × elevation × material age. Provinces become
  consequences of the same fields, not painted units.
  Finally, **seed casting, not naming**: because a body is a pure function of its
  seed, hero quality is a *selection* problem — bake coarse levels across N seeds,
  panel-score the emergent feature diversity, ship the chosen seed in the recipe.
  Authorship moves to choosing the world, never painting it. (Hand-pinned feature
  parameters remain a legal recipe escape hatch — they are data — but emergence is
  the default path.)
- **Biome geography v2** `[bake]` `[look]`. **SHIPPED round 13** (temperature ×
  moisture → biome-CLASS palette: temperature sets the green shade cold-taiga →
  temperate → warm-tropics, ARIDITY desaturates toward dry-steppe tan, wide ecotones;
  temperature recomputed in-shader from procContext's closed form so the bands agree
  with the snow line; whole-disc legibility under the ACES exposure is registered).
  Whittaker-style mapping (temperature ×
  moisture → biome) over the global `flow`/moisture fields with **wide smooth
  ecotones** — fixes the salt-and-pepper vegetation — plus orographic rain shadows
  (wind × relief) so forests, steppes and deserts sit where a geographer would put
  them, on every body that has a climate.
- **Water v2** `[look]` `[recipe]`. Separate **broadband** wind-sea + swell spectra —
  a handful of fixed sines is a periodic lattice and it *shows from orbit* (the tiling
  moiré in the defect register); a proper spectrum with anti-tiled phase decorrelation
  (§12 names this) has no repeat to see. Glint through the Phase M filtered variance
  fold (no shimmer), and the geometric-vs-normal-vs-roughness hand-down becomes a
  **per-pixel screen-footprint decision**, never a per-tile boolean — no amplitude
  quilting at tile borders. Depth/slope-driven **surf band** — breakers where the
  bathymetry says so, not a distance ring; sediment plumes at river mouths (a look
  over the `flow` field); shoreline soft blend replacing the discard edge *and* the
  skirt ring (whose sag reads as seam lines near nadir). With the §12 discipline
  intact: one spectrum, orbit glint to shoreline.

### The ground plan — eye-level terrain & textures as a five-layer stack

The bullets above are ingredients; this is the recipe. "Not obviously heightmap +
scatter" fails as long as ground and objects are *two systems* — a smooth carpet with
props on it. Real ground is one continuum, and each layer below removes one seam
between them. Every layer has a legal home; together they are the replacement spec
for the terrain shading already on the demolition ledger.

1. **Shape — the heightfield must earn cliffs** `[bake]`. Today's band spectrum
   cannot produce a ledge, and no texture rescues a world with no vertical anywhere.
   Add the *cliff-and-bench former*: hardness-layered incision (strata table ×
   erosion) that carves near-vertical faces, structural benches, knickpoints, and
   angle-of-repose talus aprons below them. This is where "landforms" start being
   forms. **SHIPPED round 8** (`procStrata`: monotone per-cell strata remap,
   sparse caps, field-gated; talus via the downstream thermal band + calved-block
   rockDensity). Residue **closed round 12**: strata `stressK` pushes the riser remap toward
   vertical (clamped below 1 for monotonicity) in tectonized zones — rift
   walls and ridge belts terrace toward true cliffs.
2. **Meso-displacement — geometry below the raster** `[look]`. §7 already says the
   recurrence continues below the deepest bake as position stamps; today we spend
   that band on *normals only*, which is why near ground reads as painted. Spend it
   on **displacement**: a vertex-shader displacement band on near tiles (band-owned,
   position-pure, amplitude driven by the material fields) plus parallax-occlusion
   in the material layer at mid-range — so gravel, rubble and bedrock joints have
   real silhouettes at 5–30 cm, not shading suggestions. Checkpoint: whether to also
   raise `maxBakeLevel` 19 → 21 (8 cm cells near the camera) rides on Phase M's
   frame-time data.
3. **Materials — stacks with coherence, composited by height** `[recipe]` `[look]`.
   Two rules make textures read as *substance*: (a) **cross-scale coherence** — the
   micro albedo must correlate with the meso relief (dust settles in cracks, varnish
   on exposed faces), so stacks are authored/generated as coupled sets, never as
   independent noise layers; (b) **height-blend compositing** between materials —
   sand *fills the lows* of a rock face; the linear lerp is the single most
   recognizable game-tell and it dies here. Sources: the in-repo `imagegen.py`
   `tile` + `pbr` pipeline was built for exactly this — generate seamless, aligned
   PBR sets per material family from prompts seeded with the Phase R ground
   references (MSL duricrust, Apollo regolith, Huygens cobbles), plus license-clean
   photogrammetry where it exists. Textures are recipe *data*: deterministic,
   position-sampled, §7 anti-tiled.
4. **Clast continuum — scatter that is OF the ground, not on it** `[recipe]` `[look]`.
   One grain-size distribution field spans texture → displacement → instances: clasts
   below ~5 cm live in the material stack, 5–30 cm in the displacement band, above
   30 cm as instances — same distribution, three representations (§7's ladder applied
   to rocks themselves). Then **contact fusion**: standard partial burial, instances
   height-blend into the ground material at their base, contact AO, and the ground
   texture *responds* to the local density field (debris shadows, cleared halos, soil
   pockets under boulders). When one field drives both the sand between the rocks and
   the rocks, the "sprinkles" tell is gone. (The distance hand-off rules — no visible
   edge where instancing ends — live in Phase M's "Scatter hand-down" item.)

   **4b. Rock asset pipeline** `[recipe]`. The instances themselves are currently a
   cracked 80-facet icosahedron — no placement logic can save that. Per archetype
   (angular clast, rounded cobble, slab, jointed block, breccia), generate meshes
   offline and deterministically: seeded SDF/noise displacement sculpted at high
   resolution on a *welded* base mesh (never deform three.js's non-indexed polyhedron
   soup — that's what cracked v0's rocks), then decimated into a small LOD chain with
   baked normal maps; a `rounding`/angularity parameter per material family (Huygens
   cobbles vs lunar breccia). Rocks are shaded by the **same** material stacks and
   BRDFs as the ground (layer 3) — a rock is terrain that happens to be convex, and
   the moment it has its own shading model it reads as a prop again. Ships as recipe
   data (a generated asset pack per body family), validated at `luna-boulderfield`
   and the `boulder-macro` breakpoint.
5. **Formations — the non-heightfield class** (the "Beyond the heightfield" bullet):
   outcrops, overhangs, arches, jointed block fields — placed by strata/stress/age
   fields, fused to the ground by the same layer-4 contact rules.

### What the rover panoramas teach (generalized — these are cross-body laws)

Reading the reference set in `bench/refs/rubra-ground/` (Perseverance/Curiosity
panoramas) against the five layers exposes six organizing principles the layers must
obey. None is Mars-specific — each applies verbatim to Luna's ejecta plains, Titan's
cobble flats, and Earth's deserts; that generality is the overfitting guard.

- **G1 · The fracture network is a first-class field** `[bake]` `[look]`. Much of what
  reads as "rocks" in real panoramas is not transported debris but **in-place
  fractured bedrock**: pavements of angular plates with coplanar tops, joints filled
  with sand, whole surfaces tessellated by two or three crack orientations. A
  jointing process (oriented crack-set fields → plate tessellation at fine bands, in
  the strata/stress frame) gives us flagstone pavements, jointed ledges, and the
  layer-5 block fields *from one cause*. Without it, every clast looks transported —
  a subtle but constant wrongness. **SHIPPED round 8** (`plates()`: axis-aligned
  cellular lattice + rotated anisotropic metric = snap-safe oriented sets; joints
  sand-fill through the G4 mask; `pavK` pavement exposure on fines-poor flats).
  Residue **round 12**: joint orientation now blends the closed-form swell-radial
  stress prior by baked |stress| (Rubra; snap-safe — the orientation enters through
  the continuous metric). Luna's mare-frame joints stay hash (registered, round 13);
  the layer-5 calved BLOCK FIELDS (3D geometry) ride round 14.
- **G2 · Strata express in plan, not just in cliffs.** Where erosion bevels dipping
  beds, layering appears as **curved bands running across flat ground** (the
  Curiosity flagstone arcs). The strata look must project the material column onto
  the surface by bed orientation × local slope — cliffs are just the vertical case.
- **G3 · Clast populations have provenance.** One size distribution is not enough:
  the panoramas show at least four distinct populations with different logic —
  (i) in-place fracture plates (angular, aligned, coplanar — from G1), (ii)
  transported float (rounder, catena-sorted), (iii) **deflation lag** (small clasts,
  Poisson-even, half-embedded, armoring fines), (iv) **ledge-calved blocks**
  (concentrated below the resistant stratum that shed them — debris that traces back
  to its source). Layer 4's distribution becomes per-population, each placed by its
  causal field. Identity check: a geologist should be able to tell *why* each rock
  is where it is.
- **G4 · Sand is routed, never sprinkled** `[look]`. In every frame, fines occupy
  exactly where transport puts them: filling joints and swales, ribboned ripple
  fields confined in hollows, **scour moats and lee tails around every obstacle**,
  aprons at slope toes. One micro-routing look — sand presence = f(curvature, wind
  dir, upslope supply) — drives crack-fill, swale-fill, per-rock moat/tail and
  bedform confinement (bedform amplitude keys on the sand-supply field, so dunes
  live where sand *can* accumulate, not wherever wind exists). Probably the single
  highest realism-per-cost item at eye level. **SHIPPED round 8** (supply = baked
  catena fines field × micro pooling; crack-fill; sin-phase ripples confined to
  accumulations; agent is recipe data — windless Luna pools without ripples).
  Residue: per-rock scour moats / lee tails need per-instance ground response —
  the Phase M contact-fusion row (round 11); full bedform SYSTEMS **SHIPPED round 12** (anchored-packet dune/megadune systems; the shader ripple octave now orients by the baked wind, nesting under the baked dunes).
- **G5 · The catena rule.** Material sorts by hillslope position: rocky crests and
  convexities (erosion wins), mixed midslopes, fine-filled hollows (deposition
  wins). A curvature × slope × upslope-distance function ordering soil/clast/bedrock
  exposure — cheap, and it makes hills read as *weathered* instead of noise-shaded.
  **SHIPPED round 8** (`procCatena`: per-band signed-curvature accretion into the
  `fines` field — the multi-band accretion IS the upslope integral at every scale;
  convexity rock exposure + clast shedding + fines burial of the clast field).
- **G6 · Freshness is a universal veneer** `[look]`. Dust patina ages every surface
  toward the body's tone; anything recent — rockfall scars, steep faces, crater
  interiors, scour moats — reads cleaner/darker (or brighter, per body). One
  freshness term = f(age field, slope, disturbance) unifies space weathering, dust
  mantling, and the crisp-edged look of young surfaces.

**The generalization contract.** The laws were *read off* Mars panoramas, but they
ship as agent-parameterized engine mechanisms — the recipe supplies the agent, the
sign, and the rates; engine code may contain **no Mars constants**. What varies per
body (all recipe data):

| Law | Mars-like | Airless (Luna) | Titan | Venus | Earth-like | Icy worlds |
|---|---|---|---|---|---|---|
| G1 fracture agent | thermal + tectonic joints | thermal cycling, impact shatter | ice-bedrock joints, dried mudcrack | columnar/polygonal lava cooling | all of these | shell fractures at every scale |
| G2 strata origin | lake/aeolian beds | stacked mare flows, ejecta layers | fluvial/lacustrine beds | stacked flows | ubiquitous | layered ices |
| G3 populations | plates, float, lag, calved blocks | ejecta blocks (traceable to *their* crater), gardened lag — no fluvial float | rounded fluvial cobbles + tholin-sand lag | short-range ejecta, blocky lava | full set | chaos blocks, plume-fallout lag |
| G4 routing agent | wind | **no wind** — impact gardening, seismic creep, electrostatic lofting; fines still pool in lows (crater-floor ponds), so the law survives with a different operator | methane wind + rain runoff | slow dense winds, short transport | wind + water + ice | sublimation lag, plume fallout |
| G5 catena | gravity | gravity (creep-only, slower) | gravity | gravity | gravity | gravity |
| G6 freshness sign | fresh = **darker** (dust-free rock) | fresh = **brighter** (rays, immature regolith) | fresh = evaporite-bright / wet-dark | fresh lava dark | varies | fresh ice bright |

**Anti-overfit gate:** a ground law only ships when it demonstrably improves at least
**two bodies with different agents** (e.g. G4 must make both a Mars swale and a lunar
crater-floor fines pond read right, from one mechanism). A law that only helps Rubra
is a Mars feature wearing a law's clothing — reject or re-derive it.

### Dimensions a full-system photo tour adds (derived in advance; verify on R1 acquisition)

Running the same reading exercise mentally across Venera, Apollo, Bennu/Ryugu, 67P,
and the icy-moon flybys — surfaces we don't have panoramas for yet — surfaces five
more dimensions that apply to the bodies we *already* ship:

- **Terrain-bounce illumination** `[look]` (Phase 1). Apollo's tell: lunar shadows
  are readable because sunlit regolith backscatters into them — on an airless body
  it is the *only* fill light, and v0 renders those shadows pitch black. One-bounce
  irradiance ≈ surrounding sunlit albedo × sun × view factor, and the **baked
  horizon-angle field already encodes the view factor** — the shadow item and this
  one share their data. Same term gives canyon walls their glowing red bounce light
  (any Grand-Canyon or Valles photo) and snowfields their shadow fill. Applies to
  every body from day one.
- **Shadow character must emerge from the sky's angular radiance** (Phase 1
  acceptance check, not a feature). The solar system is a spectrum: knife-edge
  shadows on Luna, soft-cored on dusty Mars, weakly directional on Titan, none on
  Venus. If penumbra softness and ambient fill derive honestly from sun disc size +
  aerosol forward halo + bounce, each body lands at its right point *without a
  per-body shadow knob*. Add per-body shadow-softness curves to the bench.
- **Ice & snow translucency (SSS)** `[look]` `[recipe]` (Phase 1 BRDF library entry;
  exercised hard in Phase 5). The BRDF list has no subsurface term, but bright icy
  surfaces are defined by it: glowing snowbanks with filled shadows, blue crevasse
  interiors, Enceladus-class saturated brightness. A cheap depth-tinted SSS
  approximation covers Tellus ice caps and snow *now* and the icy moons later.
- **Wetness as a universal material modifier** `[look]` (Phase 2 materials). The
  existing shoreline "wet band" generalizes: any recipe liquid darkens its substrate
  and adds a specular film — water on Tellus sand, methane-damp tholin at a Titan
  lakeshore (Huygens saw exactly this). One modifier, agent from the recipe.
- **G7 · Gravity sets the packing** `[recipe]` `[bake]` (ground law; Phase 5 for its
  extreme). Bennu/Ryugu close-ups show what low g does to ground texture: boulder-
  on-boulder porosity, improbably perched blocks, fines confined to isolated ponds.
  Settling/packing rules in the clast continuum take g from the recipe — a subtle
  scaling on our current bodies (talus angles, dune heights already do this), the
  *defining* ground texture for Phobos-class rubble worlds.

Two robustness notes from the same tour: the exposure/tonemap path and the bench must
hold at **albedo extremes** (67P's 4% charcoal to Enceladus's ~100% frost — both are
coming in Phase 5; add one dark-world and one bright-world control scene then), and
regolith/snow BRDFs eventually want the **micro-sparkle** population (glass beads,
ice crystals — the glinting in every Apollo pan), a deterministic position-hashed
glint stamp in the material stacks.

**Ground exit criteria:** blind panel on eye-level frames vs MSL/M2020/Apollo/Huygens
panoramas reaches fool-rate ≥ 25%; a rock-skyline silhouette at eye level shows
sub-vertex detail (layer-2 proof); no visible texture tiling at any distance on a
`lod-ladder-descent` still sheet; the `crater-rim-walk` and `overhang-gallery`
breakpoint scenes pass their failure-signature checks.

Highlights (full taxonomy mapping in Appendix A): dendritic valleys + deltas, crater
overhaul (ejecta rays as albedo stamps, secondary chains, degradation-by-age,
multi-ring basins, viscous relaxation on icy recipes), dune fields and yardangs along
`wind`, strata as depth-layered materials exposed by slope (`[look]`), mass-wasting
talus v2, inverted relief, space weathering from `age`, and the whole **D category**
(albedo provinces, dichotomies, streaks, swirls, faculae) — cheap coarse albedo fields
decoupled from relief, exactly what whole-disk realism needs.

**Exit criteria:** blind panel stops flagging "noise terrain" as top attribute failure;
power-spectrum anisotropy at 1–100 km within real-terrain family, measured in windows
both inside faces **and straddling cube edges** (the fade-band artifact must not
survive); Mars-analog regional fool-rate ≥ 25%.

## Phase 3 — Titan & Venus (recipes that stress the atmosphere)

Both are *data* (§6) plus atmosphere work they force us to do honestly.

### Titan (`titan`)
- **Recipe:** R 2 575 km, parent **Saturn** (new body: §11 disc + analytic ring annulus
  with mutual shadows — Saturn hangs in Titan's sky), N₂ atmosphere with tall scale
  height (extended limb), tholin aerosol: strong forward Mie + blue absorption →
  orange veil; **detached haze layers** as a recipe-declared aerosol profile (2–3
  Gaussian shells) — concentric limb arcs for free. `[recipe]` `[sky]`
- **Surface:** polar hydrocarbon seas — the existing **level set** works unchanged
  because only the polar basins dip below the liquid equipotential (context-driven
  polar dissection in the bake); dark equatorial dune belts from the `wind` field +
  tholin-sand albedo; methane fluvial channels reusing Phase 2 flow routing; bright
  evaporite basin rims (albedo province); rounded-cobble debris at ground scale
  (Huygens look) via a `rounding` param on the rock mesh. `[bake]` `[look]`
- **Wavelength honesty.** Titan's haze has visible-band optical depth of several: in
  honest RGB the orbital view is a featureless orange ball — and rendering it as such
  is *correct*, not a failure. Cassini saw dunes at 938 nm and the sea glint at 5 µm;
  our benchmarks and payoff shots are therefore **band-annotated** and rendered in the
  R3 spectral band mode. Same rule covers Venus's UV "Y" pattern.
- **Payoff shots:** Saturn + rings from *above the main haze deck*, rings near
  edge-on (Titan orbits in Saturn's ring plane) over the sub-Saturn hemisphere;
  specular sea glint rendered in the 938 nm/5 µm band at the Cassini geometry; the
  Huygens-style descent to a cobble plain in dim red-orange light (visible band —
  below most of the haze this one is honest RGB).

### Venus (`venus`)
- **Recipe:** R 6 052 km, retrograde 243-day spin `[frame]`; ~92-bar CO₂ column —
  Rayleigh β so large the surface is veiled from orbit; opaque H₂SO₄ **cloud deck**
  (45–70 km) as the first client of the Phase 4 cloud stack; **super-rotation** as a
  closed-form longitude drift of the coverage field (ω_cloud·t — time stays a pure
  input, no weather state); UV absorber "Y" pattern as a coverage-field look.
- **Surface:** coronae (ring-fracture annular stamps), tesserae (two crossed oriented
  ridge families from the `stress` field — a Venus-only process config), pancake domes,
  wrinkle-ridged volcanic plains, few-and-large craters (recipe crater-size floor —
  the thick atmosphere filters small impactors; a *data* expression of physics).
- **The milestone:** one continuous descent — featureless pearl disk from orbit, into
  the deck (Phase 4 volumetrics), out the bottom into an orange, shadowless,
  sun-disc-free twilight lit entirely by multiply-scattered flux (Phase 1 LUTs are a
  hard prerequisite; this scene is *the* test that exposure and light transport are
  physical, per §10 — nothing here can be authored).

**Exit criteria:** Cassini-analog Titan limb arcs reproduce (detached layers visible at
matched phase); Venus whole-disk UV pattern statistics match the Akatsuki family (scored in the UV band via R3's spectral mode); Venus
surface illumination within a stop of published Venera radiometry.

## Phase 4 — Clouds & weather (taxonomy E, minus giants)

CONCEPT §8 already specifies the design: **coverage is a field, volume is a look.**

- Coverage/type as a coarse planetary raster under the same tile machinery, keyed by
  (face, uv-box, level, **time**) — weather patterns advect as pure functions of time
  (closed-form winds), no simulation state. `[time-field]`
- Three joined representations (§8/§7 ladder): near raymarch ↔ far shell ↔ orbital
  layer, all shading through the same integral. `[sky]` `[ladder]`
- **Cloud shadows evaluate coverage along the sun ray** — never the rendered cloud —
  so ground shade and orbital cloud shadows are one answer; attenuating in-scatter by
  the same factor yields crepuscular rays for free. `[sky]`
- Global dust storms (Mars) = a slow time-keyed coverage mode of the same field;
  polar haze hoods = latitude-shaped aerosol term; multi-deck clouds and cyclonic
  systems = coverage field octaves with vortex stamps (advected, closed-form).
- Night-side emissives: auroral ovals (magnetic-pole-ringed emission term, recipe)
  and lightning (deterministic transient stamps — hash of (cell, time-window), so
  two machines render the same storm).

**Anchor board:** `bench/boards/board-tellus-loworbit-sunset-clouds.webp` (synthetic —
art direction, not scored). The character it demands: broken cumulus with real
vertical development and **self-shadowing**, cloud shadows cast on the sea surface,
warm grazing terminator light, crepuscular streaks, haze deepening toward the limb.
Every one of those is an existing roadmap term (coverage field + volume look + shadow
integral + Phase 1 multi-scatter); the board is the taste target they must add up to.

**Exit criteria:** Earth-analog whole-disk fool-rate ≥ 35% (clouds are most of Earth's
photo identity); an oblique low-orbit terminator shot holds its own against the anchor
board in panel critique; moonlit clouds read on the night side (planetshine × coverage);
cloud-shadow alignment exact by construction (assert in tests: shade at ground point ==
coverage integral along its sun ray).

## Phase 5 — Cryo worlds, small bodies, figure generality (taxonomy C + 0)

- **Figure:** oblate spheroids (flattening as recipe datum — affects gravity level set
  and silhouette) and triaxial ellipsoids (Vesta-class) as **base domains** (§11 says
  the sphere is merely the common case) — for these, star-shaped and mildly
  anisotropic, the cube parameterization carries over directly. **Contact binaries
  (67P-class) are harder and the roadmap says so:** the body is not star-shaped, so
  (a) all non-radial topology (the neck, both lobes) lives in the recipe's reference
  SDF, and rasters displace along the SDF *gradient* with amplitude bounded below the
  local injectivity radius (a bake-time assert); (b) the (face,uv)→surface metric is
  strongly non-uniform at the neck, so stateful ops and finite-difference normals read
  a per-cell **metric tensor**, and halo budgets are declared in *physical reach* and
  converted to cells per-tile; (c) `bake-test.mjs` gains an irregular-domain seam
  fixture before any Phase 5 module ships on one. `[domain]`
- **Cryo process pack** (per-recipe configs of new modules): lineae from a baked
  **nonsynchronous-rotation/secular stress orientation field** (age parameter rotates
  older families) while **cycloid arcs alone follow the closed-form diurnal stress
  trajectory** (Hoppa-style) — two stress sources, both position stamps; double ridges,
  tiger stripes + plumes (emission + scatter along fractures), grooved terrain
  (oriented band families), chaos blocks, nitrogen glaciers with convection polygons
  (stateful op at coarse band), sublimation pits/blades, contraction polygons,
  araneiform spiders, polar layered spirals, sea ice with leads (context field +
  derived look over the existing ocean), wispy fracture albedo. `[bake]` `[look]`
- Equatorial ridge (Iapetus), hemispheric dust asymmetry (leading/trailing hemisphere
  is a pure function of body-fixed longitude on a locked moon `[frame]`+`[look]`).

**Exit criteria:** Europa/Pluto/67P-analog disk fool-rate ≥ 25%; every cryo module
passes the standard halo/determinism test battery (extend `bake-test.mjs` per module).

## Phase 6 — Fluid giants, rings, and the full sky (rest of taxonomy E)

A new body *class*, not a new engine: the "surface" is a cloud deck.

- Banded zonal flow (jet profile as 1-D recipe curve), differential rotation
  closed-form in time; storm vortices as advected stamps (GRS = a very old stamp);
  polar cyclone clusters and Saturn's hexagon as pole-anchored standing patterns;
  altitude-coded deck colors; strong limb darkening. `[recipe]` `[look]` `[frame]`
- Ring system: analytic annulus with gap structure as a 1-D radial recipe profile,
  mutual ring/planet shadowing through §10's occlusion, **forward-scatter brightening**
  at high phase (the backlit-rings money shot); spokes as a time-keyed **dust-density
  overlay with its own forward-scattering phase function** — real spokes reverse
  contrast with phase angle (dark backscattered, bright forward-scattered), which an
  albedo mark cannot do. `[ladder]` `[sky]`
- Comets: coma + separate dust/ion tails as analytic emission/scatter objects in the
  frame tree (anti-sunward + orbit-trailing geometry is pure ephemeris). `[frame]` `[sky]`

---

## Sequencing & dependencies

```
R (bench)  ──────────────────────────────► gates every phase
T (tooling/tuning loop) ─────────────────► continuous; multiplies every phase after it
M (motion) ──────────────────────────────► gates every phase after 1 (motion bench)
1 (photometry/shadows/camera) ──► 3 (Venus needs multi-scatter LUTs)
2 (geo structure) ──► 3 (Titan dunes/rivers), 5 (cryo reuses oriented fields/flow)
4 (clouds) ──► 3 (Venus deck), 6 (giant decks are the same stack at 100% coverage)
5, 6 close out the taxonomy
```

Rough order of attack: **R → 1 → M → 2 → 4 → 3 → 5 → 6**. M sits right after 1
because popping and shimmer poison every judgment made afterward — there is no point
art-directing terrain that strobes. Titan is startable after 2 (its haze needs only
the existing integral + profile layers); full Venus is gated on 1+4. Every phase
lands with: recipe/process code + halo/determinism tests + bench re-score (stills
*and* motion paths) + a DESIGN.md delta. The round-by-round schedule, with the
driver model each round runs on, is the next section.

## Execution plan — rounds × model

Build rounds are expensive, and the expense is not uniform: six rounds of history
say the cost driver is **emergent-artifact debugging**, not lines of code — the
round-2 "dashes" hunt burned three misattributed fixes before the real cause; the
round-4 OOM masqueraded as a content regression; round 5's naive request re-sort
collapsed the display to one face root. Well-specified work (formulas from
literature, tooling, recipe data) has never blown a budget. So every remaining
round declares its **driver model up front**, chosen by the character of the task:

- **Fable (super-intelligent driver)** — reserved for the open-ended /
  landmine-dense rounds: inventing new process families under the halo /
  determinism / seam contract, touching the LOD-streaming core, unifying two
  representations across a hand-off, or any work whose failure mode is a subtle
  emergent visual artifact that must be *root-caused*. The expensive failure mode
  is a misattributed fix, not a slow edit.
- **Opus (very-intelligent driver)** — everything well-specified: implementations
  from literature (BRDF formulas, LUT stacks, wave spectra), tooling, recipe/data
  authoring, corpus curation, and the mechanical residue queued by Fable rounds.

**Standing rules (all rounds, either model):**
1. Critique-panel *judge* agents run on Opus/Sonnet regardless of the driver
   model — judging a still does not need the frontier model. Sweeps and benches
   are compute, not model.
2. **Escalation rule:** an Opus round that hits an emergent artifact it cannot
   root-cause within two attempts STOPS and registers it for a Fable round —
   the register's misattributed-fix history says a wrong fix costs more than the
   model difference.
3. **De-escalation rule:** every Fable round ends by queueing its mechanical
   residue (tuning, extra archetypes, recipe fills) into the next Opus round
   instead of finishing it at Fable prices.
4. Rounds stay model-homogeneous: one hard item inside an otherwise mechanical
   round either escalates the whole round or gets a bad fix — move it.

**The schedule** (phase-graph dependencies all preserved; three deliberate
re-orderings explained below the table):

| Round | Contents | Model | Why this model |
|---|---|---|---|
| ~~7~~ ✅ | **Phase T tooling** (SHIPPED): hot recipe reload (band-selective invalidation), photo mode + free-look + bookmarks, `casting.mjs` seed casting, completed process contract harness, `npm run assets` + hashed manifest, motion-bench perf gate; **R1 artifact masks**; the deferred **round-6 panel re-run** | **Opus** | Well-specified tooling with unit-testable verification and low panel dependence; the velocity multiplier for every round below — cheapest chunk, biggest downstream discount |
| ~~8~~ ✅ | **Ground plan L1 + ground laws** (SHIPPED): cliff-and-bench former (`procStrata` pure monotone strata remap + talus via thermal), G1 jointing / plate tessellation (snap-safe cellular metric), G4 sand routing v2 (fines-field supply + confined ripples), G5 catena (`fines` field), pavement exposure, Luna boulderfield + pancake-clast register fixes | **Fable** | New bake-process families under the halo/seam law; judged on ≥2 bodies (anti-overfit gate held: catena/joints/routing verified on Rubra + Luna with different agents); mechanical residue queued to round 9 per rule 3 |
| ~~9~~ ✅ | **Phase 1 remainder** (SHIPPED): most of Phase 1 was already built in rounds 1–3 (BRDF library, MS LUT, refraction, sky-ambient LUT, whole-disc ladder v2, eclipse/transit, planetshine, night-sky v2, physical-camera post) — round 9 landed what was still open: the **airless fill cluster** (opposition-surge shoulder, isotropic airless ambient floor, grazing-surviving sunlit-neighbour bounce, slope-scaled metre-scale-shadow bias), the **honest refracted-annulus integral** (amplitude from recipe refractivity), **star occlusion** by companion/sun discs, **physical-camera completion** (selectable metering + WB modes), the round-8 residue, and a **horizon-convergence acceptance check**. The refracted-annulus Fable-flag did NOT trip (bounded integral). Rule-2 win: the airless/beach "carpet/checker" was root-caused (mode diagnostics) to meso-relief self-shadow at the terminator — twice misattributed before — and the residual routed to Phase M | **Opus** | Literature-specified formulas plugged into slots that already existed; the airless-fill debugging was the one emergent-artifact hunt, resolved by instrumentation not blind tuning |
| ~~10~~ ✅ | **Material texture stacks v2** (SHIPPED) (imagegen → recipe data, rides round 7's asset step) + **Water v2** (broadband wind-sea+swell spectrum, LEAN/Toksvig moment folding — which *is* Phase M's "filtered folding" item, shipped early — Cox-Munk glitter, surf band, shoreline soft blend) | **Opus** | Generation is pipeline/data work; the spectrum + folding math is established literature; round 6 already built the height-blend compositing frame the textures plug into |
| ~~11~~ ✅ | **Phase M core** (SHIPPED): screen-space-error split (already live; the morph now consumes it), per-vertex geomorph (killed the registered notch), stream-in crossfade (wall-clock stipple), scatter hand-down (conservation trade shipped; L14 boulder impostors → round 14), honest per-frame request budget with value-ranked preemptive rebalancing (nine probes, five root-caused failures) | **Fable** | The most landmine-dense subsystem in the repo — rounds 2, 4 and 5 each lost days to emergent streaming/covering bugs here; cross-boundary continuity invariants are exactly the class Fable exists for |
| ~~12~~ ✅ | **Phase 2 oriented structure** (SHIPPED): wind/stress/youth context fields (+MIP-folded [global] wind with terrain deflection), tectonism as anchored-wave-packet stamps in a closed-form two-source stress law (swell vs mascon agents), coherent bedform systems (ergs by supply×wind; Tellus megadunes the second agent), winner-take-all edifices + ONE emergent rift (Valles-from-Tharsis adjacency from statistics), consequence-chain albedo (the Rubra disc has a FACE) | **Fable** | Bedforms are emergent-pattern design (dune *systems* with defect merging, not bumps); winner-take-all concentration is judged, not specified. Splittable: field infrastructure + basic stamps are Opus-grade (the crater-stamp precedent exists); the pattern design stays Fable |
| ~~13~~ ✅ | **Phase 2 mechanical residue** (SHIPPED): Whittaker biomes v2 (temp×moist biome-class palette, wide ecotones), seasonal volatile cap (spin-invariant declination overlay, ground + companion disc), strata-in-plan (G2, in-shader fold matching the bake), space weathering from `age` (keyed on `fresh`×slope — youth is Luna-degenerate, caught pre-code), inverted relief (procInvert: additive mid-flow-band paleochannel ridges), wetness; + rule-3 residue (deflected-wind moisture, resurfacing-age crater SFD, lee streaks). R4/R6 registered forward. | **Opus** | Config/formula over the round-12 fields |
| ~~14~~ ✅ | **Beyond the heightfield** (SHIPPED): formation archetypes (hoodoo/undercut-outcrop/buried-footing-arch + calved-block fields — closed-form grid solids, no marching cubes; Rubra strata agent + Tellus outcrop agent at LOCATED sites; Luna honestly absent), displacement-decimated rock sculpts (subset-placement quadric chain, same budgets, 2.8× lower silhouette error — closes the silhouette residue), the mesh→impostor→roughness ladder (L14 band, fit-space hull maps, EXACT-anchor rung handoff). 5 pre-code killers caught on paper. R6 basin/mare unification shipped alongside. | **Fable** | The novelty round earned its model: the panel killed five designs-as-written before code |
| 15 | **Phase 4 clouds core**: coverage `[time-field]`, raymarch ↔ shell ↔ orbital ladder, cloud shadows as coverage along the sun ray; **the WebGPU checkpoint decision** — **SHIPPED round 15 (checkpoint: DEFER, data-driven — see the status block)** | **Fable** | The biggest new subsystem left, a three-representation unification, and a strategic port decision consuming perf data — worth the frontier model once, done right |
| 16 | **Phase 4 content + Phase 3 recipes**: aurora, lightning, global dust storms, polar hoods; Titan + Venus recipes (data) with band-annotated bench scenes | **Opus** | **SHIPPED round 16** — emission pack + weather config + Titan/Venus/Saturn recipes + the NB-body capacity widening (see the status block) | Stamps and config on the round-15 stack; recipes are data by design (§6) |
| 17 | **Phase 5 figure generality**: oblate/triaxial domains, contact-binary reference SDF, per-cell metric tensors, injectivity asserts, irregular-domain seam fixture | **Fable** | **SHIPPED round 17** — the ray-crossing base-domain law + metric tensors + injectivity asserts + the seam fixture + vesta/haumea/arrokoth (see the status block) | Genuinely novel domain math — the roadmap itself flags contact binaries "harder and the roadmap says so" |
| 18 | **Phase 5 cryo pack + Phase 6 giants/rings** | **Opus** | **SHIPPED round 18** — Saturn banded giant + analytic ring system (Cassini/Encke gaps, mutual shadows, forward-scatter) + the Europa/Pluto cryo pack (lineae, chaos, glacier, polygons, sublimation, tholin); the ROADMAP_V2 closeout (see the status block) | Many small well-specified processes once round 17's fixtures exist; giants/rings are analytic + recipe work |

Net, at a glance —
**Fable: rounds 8, 11, 12, 14, 15, 17** (ground L1 + ground laws · Phase M core ·
oriented structure · formations · clouds core · Phase 5 domains).
**Opus: rounds 7, 9, 10, 13, 16, 18** (tooling · Phase 1 photometry · textures +
Water v2 · Phase 2 residue · Phase 3/4 content · cryo pack + giants).
Round 12 is splittable toward Opus per its row.

Re-sequencing vs the original order of attack — the phase dependency graph is
unchanged (R → 1 → M → 2 → 4 → 3 → 5 → 6 all still hold); what moved, and why:
(a) **Phase T jumps to the front** (it was "continuous"; now it is round 7) —
the tuning loop, hot reload and casting tools make every later round cheaper and
faster, and it is the least open-ended chunk left; (b) **phases are split into
model-homogeneous rounds** so Fable is bought only where rounds 2–6 history shows
emergent-debugging depth was actually needed; (c) **Water v2 + texture stacks
move ahead of the Phase M core** — they are Opus-grade, independently
verifiable, and Water v2 ships M's filtered-folding mechanism as a side effect,
shrinking the later Fable round.

---

## Iconic-scene registry (standing critique targets)

Real worlds are remembered as *scenes*. Two tiers, both fixed `__shot` specs in
`bench/scenes.json`, re-rendered every bench run and panel-critiqued with per-scene
rubrics: **icons** (beauty anchors — each names the phases it exercises, so "make this
scene real" always decomposes into scheduled work) and **breakpoints** (adversarial
probes posed at the transitions most likely to fail).

**Anti-overfitting protocol:** iconic scenes are *qualitative* anchors only — they
never gate metrics. Metric gates run on a **control set** of randomly posed scenes
whose seeds rotate every bench run (deterministically, from the run date), scored
blind alongside the icons. A change that improves an icon but regresses the controls
is rejected: we are tuning the *function*, not sixteen photographs.

| # | Scene | Setup | Exercises |
|---|---|---|---|
| 1 | `blue-marble` | Tellus full disk, low phase, ocean hemisphere, local noon | Ph 1 photometry, 2 provinces/biomes, 4 clouds |
| 2 | `crescent-limb` | Tellus thin crescent from 20 000 km, atmosphere ring, glint sliver | Ph 1 multi-scatter + refraction |
| 3 | `loworbit-sunset` | 400 km oblique across the terminator over broken cumulus and open sea (the anchor board) | Ph 4 clouds/shadows, 1 multi-scatter, M grade |
| 4 | `night-hemisphere` | Tellus night side: airglow, aurora oval, moonlit clouds, star field (city-lights variant optional) | Ph 1 night packs, 4 clouds |
| 5 | `alpen-dawn` | 8 km over a mountain range at grazing sun: long shadows, valley haze, snowline | Ph 1 shadows, 2 relief/strata, M |
| 6 | `coast-400km` | Continental shelf from 400 km: depth gradient, sediment plumes, glint edge | Ph 2 water v2 + flow fields |
| 7 | `beach-eye` | Eye level on a shoreline: surf band, wet sand, glint path, dune field behind | Ph 2 water v2 + bedforms + textures, M stability |
| 8 | `earthrise` | Tellus disc over Luna's limb from low lunar orbit (Apollo 8 geometry) | Ph 1 Hapke + earthshine, §11 ladder |
| 9 | `luna-terminator` | Luna from 100 km along the terminator: crater shadow spikes, earthshine night side | Ph 1 cast shadows + surge |
| 10 | `luna-boulderfield` | Eye level in an ejecta boulder field at low sun, black sky, Tellus overhead | Ph 2 clustered scatter, 1 shadows/BRDF |
| 11 | `rubra-canyon-dawn` | Valles-class rift from 6 km at dawn: layered walls, canyon fog, landslide aprons | Ph 2 landmarks + strata + mass wasting |
| 12 | `rubra-blue-sunset` | Ground-level Mars sunset: blue aureole around the sun disc, butterscotch sky (MER analog) | Ph 1 refraction + Mie forward lobe, 3 dust optics |
| 13 | `rubra-dust-limb` | Orbital limb during a regional dust storm; polar hood | Ph 4 dust as time-field, 3 |
| 14 | `titan-saturnrise` | Saturn + near-edge-on rings over a linear dune belt, from above the main haze (band-annotated) | Ph 3 Titan + 6 rings, 2 bedforms |
| 15 | `titan-lakeshore` | Cobble shoreline of a methane sea in orange gloom, low drizzle haze (Huygens+) | Ph 3 Titan, 2 scatter/rounding, water v2 |
| 16 | `venus-deck-breakout` | Descent frame: breaking out of the cloud-deck base over tessera highlands in shadowless orange twilight | Ph 3 Venus + 4 volumetrics + 1 LUTs/refraction |

### Breakpoint scenes (adversarial probes)

The icons above are posed where the world is *beautiful*; these are posed where it is
most likely to be **wrong** — squarely on the transitions where the architecture makes
its promises (LOD independence, halo seams, representation ladders, level sets, band
ownership, exposure continuity). Each names the promise under test and the failure
signature to hunt for. Several are motion paths (`bench/motion/`), because most of
these failures are invisible in a still and glaring in a pan.

| # | Scene | Setup | Promise under test → failure signature |
|---|---|---|---|
| 17 | `lod-ladder-descent` | One continuous vertical descent, 20 000 km → 2 m, fixed lon/lat (motion path + a still per altitude octave) | The whole ladder: §11 disc→tiles, band onsets, micro handoff, atmosphere continuity → pops, band "arrival", color/exposure jumps between octaves |
| 18 | `orbit-pan` | Slow 90° orbital rotation at 800 km (motion path) | Stream-in invisibility → tiles/craters popping into the moving view, glint crawling |
| 19 | `cube-edge-flyover` | 5 km flight directly along a cube-face edge, grazing sun (motion path) | Cross-face statefulness (the DESIGN-documented fade band) → erosion/AO anisotropy dying along a great-circle line, crater sparsity, spectrum change straddling the edge |
| 20 | `ecotone-traverse` | 100 km low-aerial traverse desert → steppe → forest → treeline → snow (motion path + stills) | Biome geography v2 → banding, salt-and-pepper mixing, scatter archetypes switching without blending, palette steps |
| 21 | `shoreline-graze` | 3 km altitude looking down a coastline: near-field surf, mid-shelf color, far glint in one frame | §12 one-spectrum ladder + level-set looks → wave shimmer bands, foam sizzle, the discard edge, glint discontinuity at the wave-resolution handoff |
| 22 | `mountain-limb` | Mountains exactly on the horizon silhouette from 200 km, atmosphere behind | Silhouette honesty → crenellated tile steps, skirt walls, haze/terrain sorting errors on the limb |
| 23 | `terminator-cross` | Orbital pass day → terminator → night in one take (motion path) | Exposure as a camera property + night packs → metering lurches, ambient washing, stars snapping in, airglow onset stepping |
| 24 | `polar-cap-margin` | Flight along the seasonal cap edge at Lₛ where the cap is retreating | Transient-albedo overlay vs baked materials → hard frost line, overlay/terrain misregistration, BRDF step ice↔regolith |
| 25 | `crater-rim-walk` | Eye level on a fresh crater rim: shadowed interior, ejecta field behind, low sun | Horizon-field shadows + scatter density gradients → interior not truly dark, ejecta scatter with a visible density cliff, AO/shadow double-darkening |
| 26 | `dune-field-edge` | Where the dune sea ends against bedrock pavement, oblique 500 m | Bedform system boundary + band ownership → dunes fading as amplitude noise instead of terminating as bedforms, ripple/dune octave seams, texture switch lines |
| 27 | `river-outlet` | Delta from 20 km: channel network, sediment plume, veg corridor, open water | `[global]` flow fields consumed by height, albedo, water and veg at once → channels not connecting across tiles, plume/edge misalignment, veg ignoring the river |
| 28 | `overhang-gallery` | Slot canyon / undercut cliff walk at eye level (**ACTIVE round 14** — posed at the emergent Rubra formation cluster, first-light) | Non-heightfield formation class → formations floating/intersecting terrain, impostor pop at the mesh↔impostor handoff, shadow leaks under overhangs |
| 29 | `luna-knife-edge` | Eye level on Luna, sun just set behind a ridge: earthshine-only illumination | Radiometric floor (§10) → not pitch black (ambient hack) or pure black (missing earthshine); camera noise behavior at extreme EV |
| 30 | `titan-haze-descent` | Descent through the detached layers → main deck → clear air below (band-annotated, motion path) | Aerosol profile shells + altitude independence → layer boundaries as hard slabs, hue steps between shells, surface "reveal" pop |
| 31 | `moon-sizes` | Luna seen from Tellus orbit as a contact sheet at ~2, 8, 20, 60, 200 px angular size, gibbous phase | §11 mean-preserving ladder → white-ball disc (flat albedo, blown photometry), maria pattern absent at small sizes, phase curve wrong, point-flux twinkle below a pixel |
| 32 | `terminator-split` | Disc framed with the terminator vertical, day and night filling half the screen each (the user's framing), from ~2 R | View-independent lighting + terminator optics → night half washed by camera-metered ambient, AO contour banding under night exposure, a bare cosine ramp with no warm scattered band, water going hole-black |
| 33 | `open-ocean-orbit` | Open ocean nadir → oblique from 400 km with the glint in frame (still + slow pan) | §12 spectrum fold + tile independence → periodic wave-lattice moiré, per-tile amplitude quilting, skirt seam lines, glint as a blotch instead of a wind-shaped ellipse |
| 34 | `boulder-macro` | Camera 2 m from a boulder cluster, low sun, on each body family | Rock asset pipeline + contact fusion → visible facets or mesh cracks, clone-stamped archetypes, prop-shading mismatch with the ground, floating bases / missing contact shadows, normal-map LOD pop |
| 35 | `pavement-walk` | Eye level on a beveled bedrock pavement: fractured plates, plan-view strata bands, sand-filled joints, lag between slabs — **posed on two bodies with different agents** (Rubra flagstone analog + Luna gardened plain) | Ground laws G1–G4 and their generalization contract → clasts reading as transported blobs instead of in-place plates, no plan banding, fines uniform instead of routed; a law that passes on Rubra but fails on Luna = Mars overfit |

## Appendix A — full taxonomy → architecture mapping

Legend: ✅ already in the build · homes as defined above. Phase = where it lands.
Two items are **added** beyond the supplied taxonomy because benchmarks will score
them: *vegetation/biomes* (Phase 2 — CONCEPT §7 names it a first-class scatter
client) and *seasonal polar caps* (category D below).

### 0 · Figure & illumination

| Item | Home | Phase | How |
|---|---|---|---|
| Rotational oblateness | `[domain]` `[recipe]` | 5 | Flattening datum; level sets & horizon math read the ellipsoid |
| Irregular / triaxial figure | `[domain]` | 5 | Reference ellipsoid/SDF the rasters displace (§11) |
| Contact-binary lobes | `[domain]` | 5 | Two-lobe reference SDF; displacement along SDF gradient bounded by injectivity radius; stateful ops read a per-cell metric tensor (see Phase 5 — *not* "just a displaced sphere") |
| Phase / terminator | `[frame]` | ✅ | Sun line from ephemeris |
| Opposition surge | `[look]` | 1 | Hapke shadow-hiding term in the regolith BRDF |
| Tidal locking | `[frame]` `[recipe]` | ✅ (set spin = orbit) | Data: spin rate equals orbital rate |
| Cast shadows | `[bake]` `[look]` | 1 | Baked horizon-angle field × sun test |
| Lommel-Seeliger law | `[look]` | 1 | Regolith BRDF replaces Lambert |
| Star color temperature | `[recipe]` `[sky]` | ✅ (spectrum is data) | Star spectrum tints everything downstream |
| Earthshine | `[sky]` `[ladder]` | 1–2 | Planetshine per §10: companion's whole-disc radiance lights the night side |

### A · Endogenic

| Item | Home | Phase | How |
|---|---|---|---|
| Tectonism | `[bake]` | 2 | Oriented `stress` context field + anisotropic ridge/fold stamps |
| Lobate thrust scarps | `[bake]` | 2 | One-sided scarp stamps along stress-field isolines |
| Wrinkle ridges | `[bake]` | 2 | Compressional ridge stamps confined to plains-material field |
| Shield volcanism | `[bake]` | 2 | Edifice + caldera stamps; slope-graded flow aprons write material/albedo |
| Flood basalts / maria | `[bake]` | 2 | Fill-to-level process (lava level set frozen into height + dark material) |
| Magma ocean / lava self-emission | `[look]` `[recipe]` | 5 | Emission term keyed on a `melt` field — night-side glow from the same radiance budget |
| Rift valleys / grabens | `[bake]` | 2 | Paired-fault down-drop stamps along stress field |
| Coronae | `[bake]` | 3 | Annular ring-fracture stamps (Venus process config) |
| Tesserae | `[bake]` | 3 | Two crossed oriented ridge families, high-age material |
| Mantle-plume swell | `[bake]` | 2 | Broad uplift stamp at coarse band (Tharsis-class) |
| Volcanic plains / plateaus | `[bake]` | 2 | Constructional plateau stamps + flood-fill material |

### B · Exogenic

| Item | Home | Phase | How |
|---|---|---|---|
| Impact cratering | `[bake]` | ✅ → 2 | Present; upgrade: rim terracing, central peaks by size class |
| Viscous relaxation | `[bake]` | 5 | Age×ice-rheology flattening op on inherited craters (icy recipes) |
| Multi-ring basins | `[bake]` | 2 | Largest-band crater stamps emit concentric ring profiles |
| Secondary chains | `[bake]` | 2 | Radial chain stamps seeded by parent crater hash |
| Hydraulic erosion | `[global]` `[bake]` | 2 | Planet-wide one-time routing pass (accumulation/basins have unbounded reach — not halo-able) → read-only `flow`/`basin` fields; fine bands incise only, under halo rules |
| Aeolian | `[bake]` `[look]` | 2 | `wind` field → dunes/ripples/mantling; ripples continue below raster as §7 stamps |
| Sedimentary strata | `[look]` `[bake]` | 2 | Depth-layered material table; slopes expose bands (render-derived, LOD-free) |
| Space weathering | ~~2~~ ✅ r13 | `age` field → albedo maturity curve; **SHIPPED**: Luna airless maturity keyed on `fresh`×slope (youth is mare-only on Luna ⇒ degenerate — caught pre-code) + fresh sand-fill kept immature |
| Hydraulic rivers/deltas | `[bake]` | 2 | Same flow fields; deltas = deposition stamps at basin inlets |
| Mass wasting | `[bake]` | ✅ → 2 | Thermal-talus present; add slide scars + talus aprons writing material |
| Wind erosion / yardangs | `[bake]` | 2 | Anisotropic erosion op aligned to `wind` over soft-material field |
| Glacial erosion | `[bake]` | 5 | U-valley reprofiling op along `flow` in cold context |
| Coastlines / benches | `[look]` `[bake]` | 2 | Bench/cliff profile derived against the level set (+ paleo-shoreline bench field) |
| Inverted relief | ~~2~~ ✅ r13 | **SHIPPED** (`procInvert`): additive position-pure raise of ancient dry indurated paleochannels on a MID flow band (excludes the incised thalweg); ~200 m ridges on Rubra, byte-identical off-channel |
| Crater degradation | `[bake]` | 2 | Age-keyed smoothing/infill of inherited crater shapes |

### C · Cryo / ice / fluids

| Item | Home | Phase | How |
|---|---|---|---|
| Tidal lineae | `[bake]` | 5 | Baked NSR/secular stress-orientation field (age-rotated families) → global lineae; diurnal stress drives cycloids only |
| Double ridges / cycloids | `[bake]` | 5 | Ridge-pair profile along cycloid arcs |
| Tiger stripes + plumes | `[bake]` `[sky]` `[ladder]` | 5 | Fracture stamps + plume scatter columns (analytic, lit by the integral, §11-evaluable) |
| Grooved terrain (sulci) | `[bake]` | 5 | Oriented groove band families over resurfaced material |
| Chaos terrain | `[bake]` | 5 | Block-jumble stateful op within chaos-margin field |
| Nitrogen glacier | `[bake]` | 5 | Basin fill + convection-cell polygons (coarse stateful op) |
| Sublimation / blades | `[bake]` | 5 | Insolation-keyed pitting/blade op (penitentes at fine band) |
| Hydrocarbon seas | `[recipe]` | 3 | Existing liquid level set + methane optics; polar basins from context |
| Equatorial ridge (Iapetus) | `[bake]` | 5 | Latitude-keyed ridge stamp (data-driven oddity) |
| Global glaciation (snowball) | `[recipe]` | 5 | Climate params push ice line to equator — emerges from context |
| Cryovolcanic domes | `[bake]` | 5 | Viscous dome stamps + lobate flow fronts |
| Cantaloupe terrain | `[bake]` | 5 | Packed diapir dimple stamps (blue-noise lattice) |
| Wispy fracture terrain | `[bake]` `[look]` | 5 | Bright fracture-albedo network over cliff stamps |
| Contraction polygons | `[bake]` `[look]` | 5 | Polygonal crack network; fine bands as §7 stamps |
| Polar layered spirals | `[bake]` | 5 | Spiral trough stamps over strata (PLD config) |
| Glacial flow tongues | `[bake]` | 5 | Overtopping lobate flow op from filled basins |
| Frozen-over seas | `[look]` `[recipe]` | 5 | Ice-lid look over the level set when context T < freeze |
| Sea ice / leads | `[bake]` `[look]` | 5 | Coarse floe field + crack-lead look on the ocean shader |
| Araneiform spiders | `[bake]` `[look]` | 5 | Baked radial fan *susceptibility* stamps; seasonal darkening via the transient-albedo overlay (fn of Lₛ(t)) |

### D · Albedo provinces (decoupled from relief)

All `[bake]` coarse albedo/material fields + `[look]` — cheap, and they carry
whole-disk identity. Phase 2 unless noted.

| Item | How |
|---|---|
| Albedo provinces | Coarse province field (sharp-edged units), composition palette per unit |
| Crustal dichotomy | Degree-1 hemispheric asymmetry term in the continents process |
| Hemispheric albedo (Iapetus) | Leading/trailing longitude function on locked moons (Phase 5) |
| Polar tholin cap (Charon) | Cold-trap albedo field keyed on polar temperature (Phase 5) |
| Slope streaks / RSL | Baked streak susceptibility on steep slopes; seasonal activity via the transient-albedo overlay (`[look]`, fn of Lₛ(t)) |
| **Seasonal polar caps** *(added — absent from the source taxonomy but the top whole-disk Mars cue)* | CO₂/H₂O frost line as transient-albedo overlay: pure fn(context fields, closed-form Lₛ(t)) — never a time-keyed terrain bake |
| Wind streaks | Crater-anchored tails along `wind` |
| Magnetic swirls | Sinuous albedo stamps from a recipe magnetic-anomaly field (Reiner Gamma) |
| Compositional provinces | Mare/highland-class unit boundaries in the material fields |
| Faculae / salt deposits | Compact bright evaporite stamps in basin floors (Phase 5 for Ceres-class) |
| Latitudinal albedo bands | Zonal banding term in context |
| Dust-devil tracks | Criss-cross trail *susceptibility* stamps; appearance/fading through the transient-albedo overlay (terrain bakes carry no time key) (Phase 4) |

### E · Atmosphere, clouds & companions

| Item | Home | Phase | How |
|---|---|---|---|
| Atmosphere thickness | `[recipe]` `[sky]` | ✅ | Scale heights already set limb/twilight/veiling |
| Rayleigh scattering | `[sky]` | ✅ → 1 | Present; LUT multi-scatter fixes the residual hue errors |
| Aerosol haze veil (Mie) | `[sky]` | ✅ → 3 | Present (Rubra); Titan/Venus push it to opacity |
| Detached haze layers | `[recipe]` `[sky]` | 3 | Aerosol density profile = sum of shells (Titan/Pluto) |
| Limb darkening | `[look]` `[ladder]` | 6 | Deck photometry for fluid giants; discs already limb-darken |
| Cloud shadows | `[sky]` | 4 | Coverage along the sun ray — one answer at all altitudes |
| Zonal jets / bands | `[recipe]` `[look]` | 6 | 1-D jet profile, closed-form differential rotation |
| Altitude-coded color | `[look]` | 6 | Deck-height → palette in the giant cloud look |
| Storm vortices | `[time-field]` | 6 | Advected vortex stamps (GRS = long-lived stamp) |
| Polar cyclone clusters | `[time-field]` | 6 | Pole-anchored vortex rings |
| Polar hexagon | `[look]` | 6 | Standing wavenumber-6 jet distortion at the pole |
| Cloud layer over surface | `[time-field]` `[ladder]` | 4 | The §8 coverage-field stack (Venus = 100% cover) |
| Global dust storm | `[time-field]` | 4 | Slow storm mode of the Mars coverage field |
| Axial tilt / obliquity | `[frame]` `[recipe]` | ✅ | Tilt is already data (Uranus is one line) |
| Rings + divisions + shadows | `[ladder]` `[sky]` | 6 | Analytic annulus + radial profile + §10 mutual shadows |
| Moons + transit shadows | `[frame]` `[sky]` | 1 | Body-list cone test (the eclipse machinery) |
| Auroral ovals | `[recipe]` `[sky]` | 4 | Emission term ringed on magnetic poles, night-side |
| Comet coma + tail | `[frame]` `[sky]` | 6 | Analytic coma/tail objects; geometry pure ephemeris |
| Cyclonic weather | `[time-field]` | 4 | Vortex stamps + fronts in the coverage field |
| Multi-deck clouds | `[time-field]` `[ladder]` | 4 | Stacked coverage fields; gaps reveal lower decks |
| Lightning | `[look]` | 4 | Deterministic transient emission stamps: hash(cell, time-window) |
| Ring spokes | `[sky]` `[ladder]` | 6 | Time-keyed dust-density overlay with its own forward-scattering phase function (contrast must reverse with phase angle — an albedo mark can't) |
| Ring forward-scatter | `[sky]` `[ladder]` | 6 | Phase-function term in ring shading (backlit flare) |
| Eclipse penumbra | `[sky]` | 1 | Finite-disc cone test soft edge (already stubbed as the terminator softener); umbra interior lit by the refracted-annulus term (refraction item) |
| Dust + ion comet tails | `[frame]` `[sky]` | 6 | Two tail geometries: orbit-curved dust, anti-sunward ion |
| Polar haze hood | `[recipe]` `[sky]` | 4 | Latitude-shaped aerosol density term |

---

## Appendix B — exit-criteria scorecard (per phase)

For each phase, `npm run bench` reports per body-analog × scale band:

```
fool_rate            blind forced-choice, multi-agent panel (n ≥ 100 pairs per
                     body × scale band; gate on Wilson 95% CI lower bound,
                     reported relative to the real-vs-real control baseline)
attr_worst           worst attribute (photometry|structure|color|camera|motion)
spec_slope_err       |render − ref| radial power-spectrum slope
grad_kurtosis_err    gradient-histogram tail mismatch
limb_profile_err     disk shots only
shadow_frac_err      vs sun-elevation family (post-Phase 1)
pop_p99              p99 per-pixel luminance step on canned descent/rotation
                     paths, camera flow discounted (post-Phase M)
flicker_energy       temporal variance at fixed camera (ocean, micro-detail)
```

Stills metrics run on the rotating **control set** (random seeds each run); the
sixteen iconic scenes are re-rendered and panel-critiqued alongside but never gate
metrics (see the registry's anti-overfitting protocol).

A phase ships when its named criteria hold **and** no previously-passing criterion
regresses (the bench suite is the visual analog of `bake-test.mjs` — run both on every
change).

## Appendix C — hand-off inventory (every seam, audited)

The v0 defect register has a shape: **almost every complaint is a visible boundary
between two representations** — scatter↔ground, geometric↔folded waves, tile↔tile,
day↔night ambient, disc↔terrain. CONCEPT's deepest promise is that such boundaries
are impossible by construction; this table makes that promise auditable. Every
hand-off in the engine is enumerated with its blending mechanism and the breakpoint
scene that polices it. **A new representation may not be added without a row here.**

| Hand-off | Mechanism (phase) | Policed by |
|---|---|---|
| Bake band → shader micro-detail | fixed band ownership + footprint fades (✅), onset ramps (M) | 17 `lod-ladder-descent` |
| Tile LOD n → n+1 | screen-space-error split + geomorph + crossfade (M) | 17, 18 `orbit-pan` |
| Parent tile → child tiles (streaming) | draw-best-available + crossfade (M) | 18 |
| Scatter instance → ground material | footprint-keyed per-instance fold, mean/variance conserved (M) | 34 `boulder-macro`, 25 |
| Clast texture → displacement → instance | one grain-size distribution, three representations (ground plan L4) | 34 |
| Formation mesh → impostor → roughness | §7 ladder hand-downs — **SHIPPED round 14** (fit-space hull impostors, exact-anchor rung swap, terrain-share fold) | 28 `overhang-gallery` |
| Formation ↔ terrain contact | bottom anchor + burial + contact AO + baked overhang AO (14); ground response (talus/horizon stamp) REGISTERED | 28 `overhang-gallery` |
| Ocean geometric → normal → roughness waves | per-pixel footprint fold of one spectrum (M/2) | 33 `open-ocean-orbit`, 21 |
| Ocean ↔ terrain at the waterline | soft depth blend, no discard, no skirt ring (2) | 21 `shoreline-graze` |
| Terrain tiles → §11 disc → point | root-tile-baked disc albedo, mean/variance preserved (1) | 31 `moon-sizes`, 17 |
| Day ↔ night lighting | per-sample irradiance LUT, no camera-metered globals (1) | 32 `terminator-split`, 23 |
| Atmosphere near-march ↔ far shell ↔ orbital layer (clouds) | one integral, three evaluations (4) | 30 `titan-haze-descent`, 3 |
| Biome ↔ biome | wide ecotones, smooth field mixing (2) | 20 `ecotone-traverse` |
| Face ↔ face (cube edges) | global coarse grid for stateful ops; 3D-pure stamps (✅/2) | 19 `cube-edge-flyover` |
| Baked seasonal state ↔ transient overlay | susceptibility fields × closed-form Lₛ(t) (2) | 24 `polar-cap-margin` |
| Sun-lit ↔ eclipse/occluded | penumbra cone test + refracted annulus (1) | eclipse shots (Ph 1) |

## Non-goals (so the roadmap stays honest)

- No fluid/weather *simulation state* — time stays a pure input everywhere (§8).
- No per-view content: nothing may read the camera except the camera. The bench
  harness exists to *catch* accidental view-dependence as much as to score beauty.
- No sourced-imagery textures in the renderer itself — references are for scoring and
  art direction; the planet remains a function, not a mosaic.
