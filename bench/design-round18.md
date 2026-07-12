# Round 18 design — Phase 5 cryo pack + Phase 6 giants/rings (Opus, closeout)

The final exec row. Two pillars, both "well-specified" per the exec table:
Saturn as a real banded giant + ring system (Phase 6, serving icon #14
`titan-saturnrise`, which round 16 explicitly deferred here), and a cryo pack on
two canonical spheres — Europa + Pluto (the Phase-5 exit criterion names both;
round 17 already shipped the 67P-class figure). Anti-overfit is structural: two
cryo bodies, disjoint module sets, judged by different panel agents.

## The law of this round

Every new capability is **absent-datum ⇒ byte-identical**, three ways, matching the
established idioms:
1. **Cryo processes** — a new `PROCESSES[type]` entry is only dispatched for bodies
   that list it (`bakecore.js:1764`). A body that doesn't name `lineae`/`chaos`/
   `glacier`/`polygons`/`sublimation` bakes identically. NO compile define, NO
   body-class branch. (recon bake-pipeline §1.4, unanimous.)
2. **Giant + ring look** — rendered as **runtime per-slot gates in the SKY_FRAG
   companion loop** (`uBodyGiant[i]`, `uBodyRing[i]`, default 0). The sky is ONE
   shared program looping ≤4 companions; you cannot compile-branch on *which*
   companion you're drawing, so this is a runtime `if(uBodyGiant[i]>0.5)` exactly
   like `uBodyCloudN[i]`/`uBodyHazeK[i]`/`uBodyFrostK[i]`. This **sidesteps the
   `skyFigMode`-packing landmine** (render-orch §3.1) entirely — no GIANT_MODE/
   RING_MODE compile define, no sky rebuild key change.
3. **Frame-tree inclination** — `orbit.incl` (degrees about inertial X, absent=0)
   gates a `rotX` of the local orbit offset in `bodyCenterInertial`; `incl=0`
   reproduces the current expression bit-for-bit.

Europa/Pluto are **sphere bodies** (no `figure`): byte-clean, circular
`limbProfile`, and `assertFigureRecipe` returns `true` immediately (recipe.js:786)
so the round-17 scope law and whitelist are never consulted for them. figure.js is
untouched this round.

---

## PILLAR A — Saturn: banded giant + rings (Phase 6)

Primary view = the §11 companion disc from Titan (icon #14). Saturn stays
disc-primary this round (walk-on giant-deck TERRAIN path is registered forward).
The banded look + rings are synthesized **live in SKY_FRAG's per-companion block**
(differential rotation + storm + hexagon are closed-form, so the disc cannot be a
static baked atlas — recon sky-disc Q1). All new sky uniforms are length-4 slot
arrays defaulting to 0.

### A1. Titan inclination (the round's pivotal fork — physics vs the coplanar tree)

**Problem.** The frame tree is coplanar (all orbits in inertial XZ, y≡0;
frames.js:16-19). Saturn's equator/rings are tilted 26.7° about X. So from Titan
(in the ecliptic) the rings appear **~26.7° open** — but real Titan orbits *in*
Saturn's equatorial plane (incl 0.35° to it) → rings **edge-on**, exactly what
icon #14 ("near-edge-on rings", Cassini ISS) and physics demand.

**Decision: incline Titan into Saturn's equatorial plane** via a gated
`orbit.incl` on the shared `bodyCenterInertial`:
```
local = [x, 0, z]                     // current
if (body.orbit.incl) local = rotX(inclRad)·local   // gated; absent ⇒ identity
out = parent==='star' ? local : [p[0]+local[0], p[1]+local[1], p[2]+local[2]]
```
`incl=26.7` on Titan (= Saturn's obliquity, both tilts about X) makes Titan's
orbit-plane normal `rotX(26.7)·[0,1,0]` coincide with Saturn's spin axis → Titan
sits in the ring plane → edge-on rings, fixed in inertial (no precession).

**Why low-risk** despite touching the hot orbit function:
- `incl=0` is byte-identical for every legacy body (none declare `incl`); the gate
  is a single `if`. The Kepler-free circular-inclined orbit is one `rotX` — cheap
  in the 2048× `solvePhase` loop.
- The sun direction at Titan is dominated by Saturn's 9.5-AU heliocentric position;
  Titan's ≤1.2e9 m orbital displacement perturbs it ~0.08%. So Titan's **existing
  ground scenes' lighting is essentially unchanged** — only Saturn's aspect in
  Titan's sky moves (which is exactly what we want for the ring shot).
- Controls (tellus/rubra/luna) never involve Titan; the canonical gate pair is
  untouched. Titan's own scenes are icons (qualitative), and we're re-posing
  `titan-saturnrise` anyway. Verify at first-light that titan-lakeshore/orbit/
  haze-descent hold (expected: visually identical).

**Pre-code panel: adjudicate this against "accept the spectacular 26.7°-open
rings."** If a driver experiment shows edge-on is a thin unreadable line and open
is the money shot, fall back to coplanar-open (accept the physical fudge, document
it). Lean = physics-first edge-on with the ring **shadow band** across Saturn's
disc as the actual money element (the shadow is more visible than an edge-on ring).

### A2. Giant banded disc — `body.giant` datum + SKY_FRAG synthesis

Recipe datum on Saturn:
```
giant: {
  bands: [ {lat, col:[r,g,b]}, ... ],   // ≤8 zonal knots (belts/zones), blended
  limbDark: k,                          // extra emission-angle darkening (deck-like)
  storm:   {lon, lat, r, tint},         // ONE oval (Saturn's Great White Spot analog)
  hexagon: {lat, amp, phase},           // wavenumber-6 polar standing wave
  deepRate: degPerDay,                  // interior rotation (storm/hexagon drift clock)
  diffRate: degPerDay,                  // equator-vs-pole shear coefficient
}
```
Uploaded once/frame as a **single** `uGiant*` uniform set (there is one giant;
`assertGiantRecipe` throws by name if >1 giant body — M5, no silent caps), plus a
per-slot `uBodyGiant[i]` flag selecting the slot it applies to.

**SKY_FRAG synthesis** (new branch inside the `bAng<eR` disc block, replacing
`mapAlb` and `kd` when `uBodyGiant[i]>0.5`):
- Latitude `sinLat = nB.y` (already computed). **Bands** = fixed-index-unrolled
  blend of ≤8 `(latCenter,col)` knots by `smoothstep` weights — NO dynamic array
  index (SwiftShader; recon sky-disc §3.4). `bandCol = Σ w_k·col_k / Σ w_k`.
- **Differential rotation**: longitude `lon = atan(nB.z,nB.x)`; shift the
  storm/hexagon sampling longitude by `diffRate·sin²lat·tPhase` (deep vs zonal
  shear), `tPhase` a CPU-double body-fixed phase wrapped at its period (never
  `uTimeS`). Bands are zonal (latitude-only) so shear is only visible on the
  longitudinal features — which is where it physically shows.
- **Storm oval**: a closed-form Gaussian in (lon,lat) about the drifted center →
  `mix(bandCol, storm.tint, gauss)`.
- **Hexagon**: near the pole, `1 + amp·cos(6·(lon−phase))` windowed by
  `smoothstep(|lat|)` — warps the polar band boundary.
- **Strong limb darkening**: `kd_giant = kd · mix(1, pow(muv,limbDark_exp),
  limbK)` — a deck-like emission-angle falloff far stronger than regolith surge.
- Sub-pixel: storm/hexagon fold to the band mean as `eR→uPixAng` (§7/§11; the disc
  → point mean must equal `discAlbedo`). **`discAlbedo` = area-weighted mean of the
  band knot colors** (assert in test).

`uBodyAtlas` is bypassed for the giant slot (fully synthesized). `bakeDiscMap`
still bakes Saturn's disc deterministically (unused for the live giant path, but
keeps the manifest entry pinned). Legacy discs untouched (they set no `giant`
datum → the branch never runs).

### A3. Ring system — `saturn.rings` datum + SKY_FRAG analytic annulus

Recipe datum (rings are a Saturn **datum**, NOT a SYSTEM body — preserves NB /
atlas-row / top-4-slice byte-identity; recon frames §3.3):
```
rings: {
  innerR, outerR,               // metres (C-ring inner … A-ring outer, ~1.24–2.27 Rp)
  gaps: [ {r, w, depth}, ... ], // ≤4 analytic notches (Cassini ~1.95, Encke ~2.21)
  col:[r,g,b], tau,             // base color + optical depth scale
  fscatterG,                    // forward-scatter HG asymmetry (backlit flare)
  spokes: {n, rate, contrast},  // optional time-keyed dust overlay
}
```

**Rendering** (new block in the companion loop, gated `uBodyRing[i]>0.5`, tested
*independently* of `bAng<eR` since the ring extends past the disc):

1. **Ray–plane intersection, distance factored out (the precision law).** Ring
   plane normal in our frame `n̂ = (uBodyR0[i].y, uBodyR1[i].y, uBodyR2[i].y)`
   (target +Y mapped back). Body center dir `ĉ = uBodyDir[i]`. With `τ =
   (ĉ·n̂)/(rdS·n̂)`, the in-plane offset **in units of body distance D** is
   `rvec = τ·rdS − ĉ` — a difference of **O(1)** vectors, never raw 1e9 m
   (recon sky-disc §3.2, the §9 rule). `rNorm = length(rvec)`; the ring's angular
   radii `uRingInner = innerR/D`, `uRingOuter = outerR/D` are uploaded per-frame in
   double. Accept the hit if `τ>0` and `rNorm ∈ [uRingInner, uRingOuter]`.
2. **Radial opacity/color** = `col·tau · Π gapNotch(rNorm, gap_k)` where each
   `gapNotch = 1 − depth·smoothstep`-well — a **fixed unrolled set of ≤4 notches**
   (no dynamic index, no texture; resolves the two readers' tension — render-orch
   §3.8 "MS-LUT chose unrolled uniforms over an unstable texture LUT").
3. **Edge-on robustness**: near `|rdS·n̂|→0`, `τ` blows up; give the ring a soft
   thickness — opacity `·= clamp(t0/|rdS·n̂|, 1, tMax)` (grazing → longer path →
   more opacity), and clamp `|rdS·n̂|` to a floor so an exactly-edge-on ring is a
   bright finite line, not a divide-by-zero (recon sky-disc §3.8, frames §L1).
4. **Forward-scatter**: `phase = HG(dot(rdS,uBodySun[i]·in-our-frame), fscatterG)`
   → the ring brightens when the sun is behind it (the backlit-rings payoff).
5. **Spokes** (optional): `n` radial dark/bright streaks keyed on the body-fixed
   ring azimuth × a CPU-double drift phase; contrast **reverses sign with phase
   angle** (dark backscatter / bright forward — the thing an albedo mark cannot
   do, roadmap §Phase-6). Ship if cheap at first-light; else register forward.
6. **Sub-pixel fold**: ring width in px from `uPixAng`; fold to a mean strip when
   thin, and into Saturn's point flux at great range (§11).

Composite: `col += trans · uBodyCol[i] · ringCol · ringOpacity · fscatter`,
ordered so the ring occludes/underlays the disc by comparing `τ·D` (ring hit
distance) to the disc (draw ring-behind first, then disc, then ring-in-front —
sign of `rNorm`-side vs disc).

### A4. Mutual planet↔ring shadows — local disc-side code in the TARGET frame

`sunTransmit` (the §10 slot) is **sphere-only and frame-local to the RENDERED
body**; it does not serve the Saturn disc drawn from Titan (recon sky-disc §2.3,
frames §2.2). So mutual shadows are **local closed-form multipliers**, computed in
the **target's body-fixed frame in units of R** (no 1e9 m cancellation):
- Sun-in-target `sT = normalize(M·(uBodySun[i]))` (M rows = uBodyR0/1/2). Ring
  plane normal in target frame = `(0,1,0)`.
- **Ring shadow on the disc**: disc point `p = nB·R` (nB already target-frame). Cast
  to `sT`, intersect y=0: `t = −(nB.y·R)/sT.y`; `q = p + t·sT`; if `t>0` and
  `|q.xz|/R ∈ [innerR/R, outerR/R]` outside gaps → attenuate `kd` by the ring
  opacity at that radius. This is the **shadow band across Saturn** — the real
  money element at edge-on.
- **Planet shadow on the ring**: ring sample `q` (target frame). Parallel-ray
  cylinder: `qp = q − (q·sT)sT`; shadowed if `q·sT<0` (anti-sun) and `|qp|<R`;
  soft penumbra via `smoothstep`. Saturn's sun angular radius is tiny → a soft
  cylinder suffices.

### A5. Uniforms (all length-4 slot arrays default 0 ⇒ legacy byte-identical)

New in `skyUniforms` (uploaded in the per-companion loop, main.js:929-982, with
explicit else-resets like the cloud block):
`uBodyGiant[4]`, `uBodyRing[4]`, `uBodyDist[4]` (D, for innerR/D etc.),
`uRingNormal` (our frame), `uRingInner/uRingOuter` (angular), `uRingCol`,
`uRingTau`, `uRingGap0..3` (r,w,depth packed), `uRingFsG`, `uRingSpoke`,
`uGiantBandLat[8]`/`uGiantBandCol[8]`, `uGiantLimb`, `uGiantStorm` (lon,lat,r,tint),
`uGiantHex` (lat,amp,phase), `uGiantPhase` (CPU-double drift). Ring params are a
single set (one ringed body). Stars: extend STAR_VERT to attenuate stars by ring
opacity behind the ring plane (gated `uRingOn`), reusing the ring uniforms
(register forward if fiddly — stars-through-translucent-ring is acceptable).

`camera.far` gains a **separate** `max(…, ringOuterR·k)` term (do NOT widen
`bodyBoundR`, which drives tile LOD; render-orch §3.4) — only matters if Saturn is
ever the rendered body; harmless otherwise.

---

## PILLAR B — Cryo pack: Europa + Pluto (Phase 5)

Both **sphere bodies**, `parent:'star'` (no Jupiter/KBO parent needed — the SURFACE
physics is the deliverable). One shared polygon family. Exactly **2 new atlas
channels** (the 2 free spares at ATLAS L6 `[stress,youth,null,null]`):
`lineaAlb` (bright icy fracture albedo) and `cryoProv` (signed: + N₂-glacier ice,
− tholin). Convection/contraction polygons and chaos blocks write **height only**
(no atlas channel). Every cryo albedo sits **after** the `mix(albedo,uColIce,F.g)`
at TERRAIN_FRAG:1542 (else erased on high-ice bodies — materials §1.4/§3.4), and
each disc-visible albedo is **mirrored in `bakeDiscMap`** (§11 agreement).

### B1. `procLineae` — tidal double-ridges from a closed-form NSR stress field (Europa)

Model on `procTect`/`stampTectPackets`. Orientation is **re-derived closed-form**
(recon bake Q1-A: a `nsrOrientation(d)` like `stressTensor`), NOT baked — dodges
half-float π-periodic precision and the `ê⊥dir` degeneracy. Recipe:
```
{type:'lineae', levels:[l0,l1], families:[{ageRot, kNSR, seed}, ...], ridgeH, ridgeW,
 haloReachM, albK}
```
- Age-rotated families: several stamp bands, each with an NSR pole rotated by
  `ageRot` (older families rotated more; a cached frame per family).
- **Double-ridge profile**: twin-hump medial-trough (two parallel ridges flanking a
  central groove) along the stress orientation — the Europa signature.
- Writes `height` (two-level onset, §4) + `lineaAlb` (bright ice along ridge
  crests, mean-preserving fold, §7). Position-pure (reads only `dirs`) → full-raster
  legal, seam-free; `haloReachM` declared for the figure-guard (harmless on spheres,
  but the window math respects halo unconditionally).

### B2. `procChaos` — position-pure block jumble within a chaos-margin field (Europa)

recon bake Q2: **position-pure lattice displacement**, NOT a stateful diffusion
(the block-jumble fights the 1-cell/iter halo budget). Blocks whose displaced
height/tilt are body-fixed-lattice-hashed (crater/edifice discipline: seam-free, no
halo, LOD-consistent). Recipe `{type:'chaos', levels, marginField, blockR, tiltMax,
dropMax, seed}`. A chaos-margin field gates where blocks appear (a continents/fbm
threshold). Blocks = tilted raised/dropped polygonal platelets on the body-fixed
lattice. Height-only (no atlas channel); two-level onset. Runs before
materials/ao/horizon (they derive from the jumbled height).

### B3. `procPolygons` — one Voronoi/Worley family: glacier convection + contraction (Pluto)

recon bake Q5: **one parameterized family**, not three near-duplicate procs.
`{type:'polygons', levels, scale, depth, gate, mode:'convection'|'contraction', seed}`.
A body-fixed 3-D Worley network: `convection` = broad cellular troughs on the
glacier fill (Sputnik Planitia cells); `contraction` = fine polygonal cracks gated
on ice. Position-pure (Worley on `dirs`), full-raster, seam-free, height-only,
two-level onset. Sub-disc scale → no `bakeDiscMap` mirror needed.

### B4. `procGlacier` — nitrogen basin fill (Pluto)

Model on `procProvinces` (regional 5×5 low-flood). Runs **early** (before any
stateful op, so the regional kernel reads pure height; recon bake §2d landmine 6).
`{type:'glacier', levels, fillLevel, flatten, seed}`. Fills regional lows to a
level set (Sputnik basin), flattens, and writes `cryoProv=+1` (bright N₂ ice) over
the fill. `procPolygons(mode:'convection')` stamps the cells on top (later band).
Disc-visible via `cryoProv` → `bakeDiscMap` branch.

### B5. `procSublimation` — penitentes/blades (Pluto)

Fine-band position stamp gated on ice, oriented by a **recipe-declared mean-
insolation axis** (recon bake Q4: the bake is sun-independent §5; time is
closed-form §9 — orientation is a `bladeAxis` knob, not the live sun).
`{type:'sublimation', levels, pitDepth, bladeAxis, bladeK, seed}` — Worley pits +
axis-oriented blade ridges at the finest bands. Height-only, two-level onset.

### B6. Tholin hemispheric albedo (Pluto — Cthulhu Macula)

Body-fixed, **static** → bake it. A dark equatorial/hemispheric province keyed on
body-fixed longitude (a recipe `tholin:{lonCenter,lonWidth,latBand,strength}`),
written as `cryoProv=−strength`. Mirrored in `bakeDiscMap`. `seasonalCap` is
latitude-only and cannot express this (materials §L11) — hence a bake province.
Consumers (TERRAIN 1542+, bakeDiscMap): `cryoProv>0 → mix toward palette.ice
(bright N₂)`, `cryoProv<0 → mix toward palette.tholin (dark)`. Sign-normalized in
the bake (the `-0` determinism trap, bench §L10).

### B7. Recipes

- **Europa** `parent:'star'`, `R:1_560_800`, orbit ~5.2 AU, spin locked-ish;
  `discAlbedo` bright (~0.6), high `ambientAlbedo` (~0.6 — bright ice fills its
  own shadows; airless); `palette.ice` bright water ice, a subtle `tholin`/rock
  ruddy tint on the lineae flanks; processes: continents, fbmBand, **lineae**,
  **chaos**, craters (sparse, young surface), context, thermal, materials, ao,
  horizon. Look: wispy bright fracture network + chaos block terrain.
- **Pluto** `parent:'star'`, `R:1_188_300`, orbit ~39 AU, spin 6.39 d;
  `discAlbedo` mixed, `ambientAlbedo` ~0.5; airless this round (thin N₂ haze
  registered forward — a discHaze veil is the cheap future add); processes:
  continents, fbmBand, **glacier**, **polygons**(convection), **polygons**
  (contraction), **sublimation**, craters (ancient tholin uplands), context (very
  cold `iceTemp`), tholin province, materials, ao, horizon. Look: bright N₂
  Sputnik-Planitia glacier with convection cells beside dark cratered tholin
  uplands.

---

## Scope: shipped vs registered forward (honest closeout)

**Shipped**: Saturn giant (bands, diff-rotation, limb darkening, storm, hexagon) +
rings (analytic annulus, ≤4 gaps, forward-scatter, mutual shadows) + Titan
inclination for edge-on rings; Europa (lineae double-ridges, chaos, wispy albedo);
Pluto (glacier fill, convection+contraction polygons, sublimation, tholin
hemispheric); one shared `procPolygons`; 2 atlas channels. Ring spokes shipped if
cheap at first-light.

**Registered forward** (beyond ROADMAP_V2 — this is the last round; these are
known future work): ring spokes if deferred; comet coma+tail (eccentric-orbit
`bodyCenterInertial` extension + new render object); Enceladus tiger stripes +
plumes (emission machinery + a 3rd cryo body); Iapetus equatorial ridge +
leading/trailing hemispheric albedo; sea ice/leads, cantaloupe, PLD spirals,
araneiform spiders, glacial tongues, frozen-over seas; the walk-on giant deck
(TERRAIN/scatter banded-surface path + camera-at-Saturn ring mesh); oblate giant
figure + oblate atmospheres; Pluto N₂ haze; Titan cross-scene refinement after the
orbit inclination; stars-through-ring attenuation if deferred.

---

## New tests

- `test/ring-test.mjs` (`test:ring`): ring radial profile deterministic + mean/
  variance-preserving across LOD (§7); the ray-plane precision formulation
  (rvec = τ·rd−ĉ) vs a double-precision reference; gap notches at declared radii;
  mutual planet↔ring shadow geometry (ring-shadow-on-disc + planet-shadow-on-ring
  closed forms) exercised; forward-scatter monotonic in phase; edge-on
  non-divergence; `assertGiantRecipe`/ring negative tests (>1 giant, >4 gaps throw
  by name — M5); giant band-mean == discAlbedo; determinism (Object.is).
- `test/cryo-test.mjs` (`test:cryo`): NSR orientation eigen-rule; double-ridge
  twin-hump profile; age-rotated family separation; chaos block position-purity +
  seam (cross-face bit-identity); glacier basin-fill mass + flatten; polygon
  Worley determinism + mean-preservation; sublimation blade axis; tholin province
  longitude; `cryoProv` sign normalization (no −0); lineaAlb mean-preserving fold;
  bakeDiscMap mirrors (disc↔ground agreement for lineaAlb + cryoProv);
  determinism.
- `contract-test.mjs` picks up all 5 new processes for free (seam/halo/determinism
  on every body by cumulative-prefix bakes).

## New scenes (append after id 69; icons/breakpoints — qualitative, no gate)

- `saturn-rings-titan` (icon, upgrade id-14 titan-saturnrise): from Titan, edge-on
  rings + shadow band over the dune belt. `body:titan, lookAt:saturn`, season tuned.
- `saturn-disc` (icon): Saturn near-full with open-ish rings from a moon vantage —
  `disk:true, noLimb:true` (rings are fatal to limbProfile — bench §L3b).
- `europa-lineae` (icon): orbital disc, circular limb (sphere) → `disk:true` (limb
  runs, samples the fracture bands). Plus `europa-chaos` ground pose.
- `pluto-sputnik` (icon): Sputnik Planitia glacier vs tholin uplands, `disk:true`.
  Plus `pluto-blades` ground pose (penitentes), per-scene `waitMs`.

## Control gate

Add `r18-companion-shift` classifier to run.mjs (R18_BODIES={europa,pluto}) — the
eviction test analog of r17-companion-shift: verify no legacy control's top-4
companion slice changes when europa/pluto enter SYSTEM.bodies (closed-form,
pre-run). Presence of europa/pluto/banded-Saturn above a control horizon already
tags `r16-new-companion`. Keep control bodies = {tellus,rubra,luna}. Regenerate
the manifest (`npm run assets`); legacy hashes must stay identical.
