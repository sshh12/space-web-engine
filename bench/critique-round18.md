# Round 18 — pre-code adversarial panel (finders Opus / skeptics Sonnet)

12 lenses, 50 findings, skeptic-verified. Driver adjudication experiments:
`bench/_r18_adjudicate.mjs` (ring aspect + control eviction) plus the skeptics'
own SwiftShader query (MAX_FRAGMENT_UNIFORM_VECTORS=4096) and frame-math checks.

## The pivotal adjudication — the round's flow-map moment

The design proposed inclining Titan into Saturn's equatorial plane (`orbit.incl`)
to force edge-on rings. **The pre-code driver experiment overturned it.** The
coplanar tree already sweeps the ring opening **0.00°→26.70°** over Titan's own
orbit (`_r18_adjudicate.mjs`), so the aspect is a *posing* choice, not a frame-tree
choice. Inclining Titan to EXACTLY edge-on is actively harmful — five findings
converge:
- `saturn-pinned-to-titan-equator` (CONFIRMED MAJOR): incl=obliquity pins Saturn to
  Titan's body-fixed equator (elevation ≡0, azimuth at 2× rate), voiding the
  "refine season for elevation" lever and materially rearranging Titan's sky.
- `ring-singularity-is-primary-vantage` / `edge-on-razor-line-continuity`
  (MAJOR, driver-flagged): at *exactly* edge-on, `ĉ·n̂≡0` → `τ=0/0`, and the ring
  projects to a sub-pixel razor line whose readability is a numeric knife-edge.
- `saturn-disc-open-ring-impossible` (CONFIRMED MAJOR): with Titan pinned in-plane,
  the second icon's "open-ish rings" is geometrically unsatisfiable.
- `pey1-plus-zero-neg-zero-fragility` (MINOR): the gated `bodyCenterInertial` edit.

**Decision: NO Titan inclination. Coplanar tree unchanged. Pose the ring aspect
per scene** — `saturn-rings-titan` at a Titan phase giving a *small readable
opening* (~5–12°, "near-edge-on" per icon #14: a thin ring ellipse showing the
Cassini division + the shadow band, NOT a 0/0 razor line); `saturn-disc` at a
larger opening (~20–26°) for the open-annulus demo. This simultaneously: matches
icon #14, drops the `frames.js` change entirely, keeps `ĉ·n̂=sin(few°)≠0` so the
ring geometry is **well-conditioned** (dissolving the singularity that scoped a
Fable escalation → the ring becomes ordinary Opus analytic geometry), and makes
both ring scenes satisfiable. The ring shadow band is fixed at Saturn's ~−20.7°
sub-solar latitude (Saturn `phase0=0.9`, NOT the scene `season` — documented; a
ring-test assertion pins `phase0` keeps the sun ≥15° off the ring plane).
Control eviction: Europa/Pluto peak 2.83e-6 rad vs the legacy 4th-slot floor
4.60e-6 rad — never crack a control's top-4 (r18-companion-shift stays silent,
but the margin is 1.63× on Rubra so the tripwire is genuinely load-bearing).

## Consolidated build-spec deltas (the authoritative fix list)

**Ring geometry (KILLER/MAJOR, 3 lenses):**
1. Ring-plane normal in our frame = **`uBodyR1[i]`** (the full row = target +Y in
   our frame), NOT `vec3(uBodyR0[i].y,uBodyR1[i].y,uBodyR2[i].y)` (that is column 1
   = our +Y in the target frame — a mirror-flipped plane). Ring-test asserts
   `rdS·n̂` and the shadow plane coincide vs a double-precision reference.
2. Never pose exactly edge-on (see adjudication) → `τ=(ĉ·n̂)/(rdS·n̂)` well-
   conditioned. Still floor `|rdS·n̂|` defensively; ring-test asserts finite output
   at the degenerate limit (no NaN on SwiftShader).
3. Front/back ordering: compare `τ·D` to the sphere **near-surface** depth
   `d_sphere(bAng)=D·cosβ−√(R²−D²sin²β)` for pixels with `bAng<uBodyAngR`, not the
   center depth D.

**Mutual shadows (A4):**
4. Work in **unit-R** in the target frame: `p=nB` (no `·R`), `t=−nB.y/sT.y`,
   `q=nB+t·sT`; compare `|q.xz|` to `uRingInner/uBodyAngR[i]`, `uRingOuter/
   uBodyAngR[i]` (R cancels). **Never reference `uPlanetR`** (that is the rendered
   body Titan, not Saturn).
5. Floor `sT.y` and evaluate annulus membership as a **hard boolean gate** before
   touching `kd` (at Saturn equinox sT.y→0 = rings edge-on to sun = no shadow → the
   gate cleanly rejects; no `inf·0` NaN into a smoothstep). `sT = normalize(M·
   uBodySun[i])` is correct (uBodySun is our-frame; M rows = uBodyR0/1/2).

**Giant §11 consistency:**
6. `discAlbedo` = the **cos-lat integral of the exact shader `bandCol(lat)`**
   blend (dense sampling), one weighting convention end-to-end. Ring/giant-test
   integrates bandCol and asserts `==discAlbedo` (Saturn's near-gold knots → a
   few-% correction). Saturn `palette.dust=discAlbedo=band-mean` so the pinned
   bakeDiscMap atlas ≈ the live disc mean (document the atlas is unused-but-pinned
   for the giant slot).
7. **Per-feature rigid drift, NO per-pixel `sin²lat·tPhase` shear** (the §9 seam):
   each longitudinal feature at its fixed latitude gets rate `Ω(lat_f)=deepRate+
   diffRate·sin²(lat_f)`; drift its longitude on CPU as `frac(Ω·t/rev)·2π`
   (driftPhase pattern), upload a scalar per feature. Bands are zonal → never
   drift. Every drift phase reduced to `[0,1)` before upload; shader wraps the
   storm/hexagon longitude delta to `(−π,π]` (or dot/cross, avoiding the atan
   branch cut). Ring/giant-test asserts eval at t and t+rev byte-equal.
8. Giant limb: split `limbDark` → `limbExp` + `limbK`; assert `limbExp>0`; write
   `pow(max(muv,1e-4),limbExp)`. Never `pow(nB.y,2)` — use `nB.y*nB.y`. HG base
   `1+g²−2g·c ≥0` for `|g|<1` (assert `|fscatterG|<1`).
9. Giant branch = **guarded overwrite after the untouched legacy `mapAlb`/`kd`/
   composite statements**: keep the unconditional `texture(uBodyAtlas…)` at
   shaders.js:1837, synthesize `giantCol` separately, then
   `mapAlb = uBodyGiant[i]>0.5 ? giantCol : mapAlb` (never wrap the sample in the
   gate). No reordered intermediates.

**Cryo fields (KILLER/MAJOR):**
10. **Drop the signed `cryoProv` channel.** `procGlacier` raises the **existing
    `ice` field** over the basin (N₂ *is* ice — 1542 mix + bakeDiscMap:1933 lerp
    brighten it for free, §11 for free, zero new channels). The two L6 spares
    become two **unsigned** channels: `lineaAlb` (Europa bright fracture) and
    `tholinAlb` (Pluto dark province, 0..1). No sign, no zero-crossing seam, no −0.
    Consumer: `albedo = mix(albedo, uColTholin, tholinAlb)` and
    `albedo = mix(albedo, uColLinea, lineaAlb)`, both **after** the ice mix at 1542.
11. **`lineaAlb`/`tholinAlb` arrive WHOLE** (the crater `freshW` pattern: full
    weight on the band's own pass, skipped on the completion pass — NEVER the
    two-level height onset ramp). cryo-test asserts crest albedo equal at L and L+1.
12. **Existence gates closed-form + level-stable.** Chaos block existence, polygon
    existence, sublimation existence gate on a closed-form `fbm3`/hash of `dirs`
    (recomputed identically each level), NEVER a bilinear-inherited field
    (`ice`/`marginField`). Fields only **modulate expression per output cell**
    (the crater `mare` pattern). Chaos `marginField` = a continents/fbm threshold
    (closed-form) — explicit. cryo-test bakes a band straddling a sharp gate at L
    and L+1, asserts max shared-edge height delta ≈ 0.
13. **Pluto process order: `context` BEFORE the ice-gated bands.** Order:
    continents, fbmBand, **context**, glacier, polygons(convection),
    polygons(contraction), sublimation, craters, tholin, materials, ao, horizon.
    "ice-gated" = the thermal `ice` field (which glacier augments) — disambiguated.
14. `procLineae` reuses `stampTectPackets`' frozen-axis anchor-relative phase
    machinery (double-ridge = a different `prof(u)` only) — no per-cell
    `(R·dir)·ê(dir)` phase (REFUTED as already-specified, but make it explicit).
15. bakeDiscMap cryo/tholin branch placed **after** the ice lerp (:1933), gated by
    recipe presence; pin lineae/glacier/tholin recipe `levels` to include ≤2 so the
    §11 disc mirror carries them. cryo-test asserts disc↔ground agreement.

**Recipes / load / control gate:**
16. `assertGiantRecipe(SYSTEM)` (>1 giant throws) + `assertRingRecipe(body)` (>4
    gaps throw) in recipe.js, wired into `switchBody` + `_render_check.mjs` (not
    test-only) — M5 no silent caps.
17. Extend `assertPaletteRecipe` (or `assertCryoRecipe`): require `palette.tholin`
    when a tholin consumer is present, `palette.ice` present (already universal).
18. Europa `spin.periodH ≈ 85.2` (3.55 d, its REAL synchronous rotation — NOT
    derived from the fake 5.2 AU heliocentric orbit); Pluto 6.39 d (already OK).
    Both `parent:'star'`, appended after arrokoth.
19. Add `r18-companion-shift` classifier to run.mjs (R18_BODIES={europa,pluto},
    the r17 eviction-diff analog; load-bearing at 1.63× margin). Document that the
    r18 baseline legitimately shifts on Saturn-visible controls (ringed Saturn,
    already `r16-new-companion`-tagged; add an `r18-ring` reason label).
20. `cacheMax`: the pre-code plan lowered it 300→280 for the +2 fields, but the
    verification sweep showed 280 starved the ancestor-chain memoization on
    tile-streaming descents (lod-ladder rungs under-settled past their budget), so
    it stays **300** (+46 KB/tile ⇒ ~202 MB, ~40 MB below the 243 MB failure point —
    the post-impl skeptic confirmed 300 is memory-safe). cacheMax is a memoization
    cap only, so the reversal is byte-identical (no hash/output change).

**Scope (deferred — remove first-light decision points):**
21. **DEFER spokes** and **DEFER stars-through-ring attenuation** to the registered-
    forward list now (no first-light "ship if cheap" gate — rule 4). Keep
    forward-scatter in code (cheap HG term) and add a **`saturn-backlit` breakpoint**
    (Titan on Saturn's anti-sun side, crescent Saturn) to actually witness the
    backlit flare — else it is inert in the gibbous shipped scenes.
22. Add a `saturn-hex` closeup breakpoint (tight fov) so the hexagon/storm machinery
    is exercised (sub-resolution at the 69px icon disc — bands+gold+shadow carry the
    giant read).
23. Tune Pluto glacier seed + tholin `lonCenter` so Sputnik-analog and Cthulhu-
    analog share the icon's visible hemisphere; cryo-test asserts both a high-ice
    (glacier) and a high-tholinAlb region are visible at the icon sub-observer point.

## Disposition summary
- Ring normal column-vs-row: found by 3 independent lenses → the definitive fix
  (`n̂=uBodyR1[i]`).
- REFUTED (5): lineae-perp-dir-degeneracy (design already says "model on
  stampTectPackets"), swiftshader-sky-uniform-overflow (bench cap is 4096 not 256),
  sky-loop-unroll-zeroread (WebGL2 GLSL ES 3.00 allows dynamic indexing; oversized
  shaders fail LOUD), variable-count-band-gap-arrays (design already mandates fixed
  unrolled), atlas-row-append-order (disc bytes keyed by body.id, order-independent).
- All other CONFIRMED/PARTIAL findings folded into the 23 deltas above.
- The round STAYS on Opus: the one novel-primitive risk (the ring singularity) is
  dissolved by the pose-near-edge-on decision, leaving well-specified analytic
  geometry + 5 precedented cryo processes.

---

# Round 18 — post-implementation panel (reading the SHIPPED diff)

12 finder→skeptic agents over the shipped `git diff round-17..HEAD`. 11 findings
CONFIRMED (4 MAJOR, 7 MINOR), **all fixed in-round** — the r17 discipline (read the
code, not the plan) earned its keep again: two of the four MAJORs are pure
angular-velocity / cross-frame defects that a single still cannot show.

**MAJOR (all fixed):**
1. **GIANT-1 / drift double-count** — the giant disc is synthesized in the target's
   BODY-FIXED frame (`nB` via `uBodyR* = transpose(bodyToInertial)`), which already
   rotates at Saturn's System-III spin (~807 °/day ≈ deepRate). The storm/hexagon
   then drifted at the ABSOLUTE zonal rate `Ω(lat)` on top → features swept the
   disc at ~2× rate. Fix: the differential `Ω(lat) − 360·24/periodH` (only the
   diff-rotation and the deep-vs-frame offset drift in the body frame). Invisible
   in a still (§9 time-evolution only); byte-safe (Saturn-only).
2. **cryo-1 / doubleRidge one-sided clamp** — `hump()` used `x<1` not `|x|<1`, so
   the far tail (the medial line, x≪−1) returned a nonzero value → a spurious
   central CREST that inverted the double ridge into a single hump. Fix: two-sided
   clamp.
3. **R18-LEGACY-1 / Haumea byte-identity** — europa/pluto (at 5.2 / 39 AU) were
   large enough from HAUMEA's 43-AU vantage to crack its top-4 companion slice,
   changing its rendered sky vs the r17 baseline. Controls (tellus/rubra/luna)
   were unaffected (they never see europa/pluto in top-4), which is why the pre-
   code control check passed — but figure bodies did. Fix: recipe `skyHidden:true`
   on europa/pluto, filtered out of `ephemeris().others` — standalone
   surface-deliverable worlds never appear in another body's sky. Verified: haumea/
   vesta/arrokoth/tellus companion sets revert to the exact r17 set.
4. **cryo-test arrives-whole FAILS** — the look-tuning (tightening the lineae
   wavelength) turned lineaAlb into a high-frequency field, so the test's bilinear
   point-sample cross-LOD comparison undersampled at coarse levels (maxΔ 0.066 >
   0.02). The MECHANISM is correct (level-independent overwrite); fix: compare the
   resolution-STABLE tile-interior peak crest (an onset ramp would make it 0.55× at
   one level) rather than a bilinear point delta.

**MINOR (all fixed):** ring-1 (shadow/occlusion tests read `atan(R/D)` where the
annulus reads the exact `R·mult/D` ratio → a dedicated `uRingRp`); ring-2 /
R18-MAIN-RINGSYS (no `assertRingSystem` — the ring uniform set is global; added it
+ corrected the false "assertGiantSystem enforces ringed body" comments);
R18-MAIN-ASSERTORDER (giant/ring asserts fired after `dispose()` — moved before the
teardown, next to `assertFigureRecipe`); cryo-2 (glacier flatten used an un-warped
arc while the ice mask was warped — same warp added so the shoreline and the flat
floor share one boundary); r18-shift-dead-tripwire (reworded — with `skyHidden` the
tripwire is defensive/dead, not load-bearing); ring-test-tautology (`t>0||t<=0` →
`Number.isFinite(t)`); cryo-discalbedo-vs-discmap (moot — `skyHidden` bodies are
never seen as a disc/point, so §11 disc==point does not apply; discAlbedo stays the
geometric-albedo reference).

**Post-fix verification:** test:ring 27/27, test:cryo 12/12, and all 12 legacy Node
suites green; skyHidden confirmed (europa/pluto absent from every other body's
`others`); assets 28/28 deterministic with every legacy hash unchanged (only
saturn/europa/pluto discs re-pinned); shaders recompile on SwiftShader with no error.
