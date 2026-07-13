# DESIGN — implementation of CONCEPT.md (baked-tile planet renderer)

A no-build, static-file Three.js app in the same style as the boilerplate `viewer.html`:
ES modules served over `python -m http.server`, Three.js from a CDN, and a Puppeteer
screenshot harness (`screenshot.mjs`) driving `window.__shot` / `window.__ready` hooks so
every change can be rendered headlessly and critiqued.

```
planet.html          viewer shell: canvas, UI panel (toggles/sliders), HUD, importmap
src/mathx.js         deterministic hash/noise, cube-sphere map, catmull-rom, edge mask
src/recipe.js        the SYSTEM recipe: star + bodies (Tellus, Rubra, Luna), pure data
src/frames.js        frame tree + closed-form ephemeris (orbits, spin, sun dir, star rot)
src/bakecore.js      the tile baker: process pipeline, halo rasters, accretion, cache
src/bake.worker.js   thin Web Worker shell around bakecore (bakes off the main thread)
src/shaders.js       GLSL: shared atmosphere/tonemap/noise chunk, terrain, sky, ocean, rocks
src/tiles.js         cube-sphere quadtree: selection, mesh/texture build, draw-best-available
src/scattercore.js   debris placement (pure, testable): global-lattice rock instances
src/rockcore.js      rock asset pipeline (pure, testable): welded seeded archetype meshes
src/camera.js        orbital camera (lon/lat/alt/yaw/pitch), altitude-scaled controls
src/main.js          wiring: render loop, camera-relative rebase, UI, inset view, __shot
test/bake-test.mjs   Node tests: determinism + seam guarantees (no browser needed)
screenshot.mjs       Puppeteer harness (works for planet.html and the old viewer.html)
```

Run:

```
npm run serve                     # python -m http.server 8123
# open http://localhost:8123/planet.html
node test/bake-test.mjs           # bake determinism/seam tests (pure Node)
node screenshot.mjs "http://localhost:8123/planet.html?fast=1" shots-planet
```

## How CONCEPT.md maps onto the code

**§1 Sphere & LOD.** Six quadtrees (`tiles.js`), split when camera distance < K × tile arc
length, drawn as 65×65 corner-grid patches with skirts masking coarse↔fine steps. Precision:
tile vertex positions are baked **node-local** float32 (body-fixed minus tile center, centers
held in JS doubles); the camera sits at the world origin every frame and each mesh's position
is set to `center − cameraPos` computed in doubles (camera-relative rendering); the renderer
uses a logarithmic depth buffer (near 0.5 m, far 10⁸ m). No system-scale coordinate ever
passes through float32: only small camera-relative offsets do.

**§2 Terrain rasters.** Every node owns a 77×77 float raster (65 interior corners + 6-cell
halo) of height plus per-cell fields (rock, ice, AO, rock-density; uplift/regolith as
bake-internal fields). `tile(n) = upsample(parent) + band(n)`: height upsamples by
catmull-rom (exact at half-samples), smooth weight fields bilinearly; each level stamps only
the octave/crater band that first becomes resolvable at that level. A tile is a pure function
of (body, face, level, x, y) — every seed routes through the body id; nothing reads the
camera. The worker memoizes the parent chain and LRU-evicts.

**§3 Halo.** Halo cells are filled by the *same* deterministic rules as any interior cell
(same uv→direction math, same parent taps, same stamps), so a stateful op run over
interior+halo matches the neighbor's interior **bit-exactly** (asserted by
`test/bake-test.mjs`). Budget: halo 6 ≥ 2 erosion iterations × reach 1 + cubic-upsample
support; height stays valid to halo 4, derived fields to halo 3. Vertex normals are finite
differences of the raster (computed at mesh build) — the halo supplies across-edge
neighbors, so normals are seamless too.

**§4 Geology pipeline.** `recipe.js` lists ordered process configs; `bakecore.js` executes
them per band: continents (warped fBm, position stamp), ridged mountains masked by an
uplift field, hills, craters, micro-relief, context (latitude/altitude → temperature → ice),
thermal erosion (the stateful neighborhood op the halo exists for; deposits regolith, exposes
rock, feeds rock-density), and an accreted AO field (multiplicative concavity per band).

**§5 Fields.** All fields are smooth weights, inherited/haloed exactly like height. Purely
derived looks (slope-exposed rock, shoreline/depth color against the sea level set, and a
vegetation tint computed from the same closed-form climate the baker uses) are computed at
render time, which is LOD-consistent for free.

**§6 Recipes.** One `SYSTEM` object: star spectrum/luminosity + body list (orbit, spin,
radius, sea level, atmosphere coefficients, palette, process list, band ownership). Engine
code reads only the recipe. Three bodies ship: **Tellus** (Earth-like, ocean, ice caps),
**Rubra** (Mars-like: thin butterscotch atmosphere from coefficients, cratered, polar caps),
**Luna** (airless, heavily cratered — exercises the "no atmosphere" path of the same shaders).

**§7 Micro-detail & scatter.** Below the deepest baked band (~0.3 m cells at level 19) the
recurrence continues in the fragment shader as position stamps: band-limited 3D value-noise
octaves (normal + albedo), amplitudes driven by baked material weights, faded mean-preservingly
when sub-pixel. Precision: detail coordinates are (tile center − 4096 m-snapped origin) +
node-local position, computed in doubles CPU-side; noise lattices are power-of-two periodic so
snap boundaries are seamless. Debris rocks are facts of the planet: a fixed global lattice
(declared level, ~1.2 m cells) hashed against the baked rock-density field gives existence,
size, orientation, burial — identical whichever tile renders them; distance only gates
visibility. The eye-level inset view is the standing proof that appearance is
altitude-independent.

**§8 Atmosphere.** One single-scattering integral (Rayleigh + Mie, 4-step marched sun
optical depth), spliced from one source into the sky pass and the terrain/ocean aerial
perspective — haze converges to the horizon sky by construction, and there is no skybox and no
handoff altitude: descent just moves the camera. Ambient terrain light is the same integral
evaluated CPU-side per frame (zenith/horizon samples) so ground and sky cannot disagree
(approximation of the irradiance LUT lineage). Earth-blue and Mars-butterscotch come from the
recipe's β coefficients, not painted gradients. Clouds: roadmap (see below).

**§9 Frames.** `frames.js` is a closed-form frame tree: star-centric inertial root, Kepler
circular orbits (Luna parented to Tellus), spin = axis/rate/epoch. Terrain, tiles, waves and
scatter all key on **body-fixed** position; the render world IS the body-fixed frame (so
terrain is static), the sun direction and star-field rotation are transformed into it per
frame, in doubles. Time is a pure input (scrub + speed controls); no integrator anywhere.

**§10 Light.** The star is the only luminous authority: per-body irradiance is
luminosity/r² from the recipe (Rubra's dim noon and Luna's harsh contrast come free).
Exposure is a camera property: shaders output linear radiance-scaled values; one smoothed
auto-EV (CPU sky-integral luminance) × user bias, then one fixed ACES curve. Stars are hashed
catalogue flux in the inertial frame, drowned at noon and surfacing through twilight because
the arithmetic says so; a small airglow emission term keeps night from being pure black.

**§11 Whole bodies.** Other bodies render in the sky pass as analytic phase-lit discs
(limb-darkened, albedo from recipe) that integrate to points below a pixel — no second scene,
no swap. Terrain-level rendering of the ladder (root-tile-driven disc albedo) is roadmap.

**§12 Ocean.** Liquid is a level set in the recipe (equipotential radius). Bathymetry is just
the raster below sea level (same tiles/halo). Ocean patches reuse the terrain tile's height
texture for depth color; the moving surface is a closed-form sum of directional sine octaves
of (body-fixed position, time) — per-tile phase offsets computed in doubles keep it seamless —
with sun glint whose roughness widens with distance (the orbit glint is the sub-pixel tail of
the eye-level waves). Shoreline/foam are render-derived against the level set, never masks.

## Viewer toggles (inspection/critique diagnostics)

- **View modes:** Lit · Albedo · Normals (world-space RGB) · Height (grayscale, normalized
  to recipe amplitude) · Slope · AO (baked field) · LOD tint (tile level).
- **Wireframe** overlay (second pass, polygon-offset) — shows quadtree density and skirts.
- **Debris** on/off.
- **Eye-level inset:** picture-in-picture camera 1.7 m above the terrain under the main view,
  sharing the LOD selector (its position feeds the split metric), so orbit-vs-ground
  consistency is inspectable live.
- HUD: altitude, tile/bake counts, level under camera, frame time.
- Sliders: time-of-day scrub, season, time speed, exposure bias, atmosphere quality; body picker.

## Platform landmines (found empirically, kept for posterity)

- **ANGLE/SwiftShader silently zeroes GLSL functions with `out vec3` parameters** (the
  same code inlined works). The scattering integral is therefore spliced inline into
  every consumer by a JS-side generator (`scatterInline` in `shaders.js`) — which also
  happens to enforce "one integral, one source of truth" (§8) at the text level.
- **Unprojecting the far plane collapses in float32**: with far/near ~10⁸ the
  projection matrix's `(f+n)/(f-n)` rounds to 1.0f and the unprojected `w` becomes 0
  (NaN rays). Sky rays unproject the *near* plane instead — §1's "never let a
  system-scale coordinate pass through float32" applies in clip space too.
- three.js `#include <logdepthbuf_*>` chunks require `#include <common>` in the vertex
  shader (for `isPerspectiveMatrix`).

## Known approximations (deliberate, documented)

- **Cross-face stateful ops:** position stamps are 3D-lattice pure (bit-agnostic to cube
  faces), but grid-stateful ops (erosion, AO) run on each face's gnomonic grid, which does not
  align across cube edges. Their amplitude is faded by a deterministic body-fixed edge mask so
  both faces agree exactly on the shared edge (no cracks); the cost is slightly less erosion
  in a narrow band along the 12 cube edges. Exact cross-face statefulness would need a shared
  per-level global grid — roadmap.
- Sun optical depth is a closed-form Chapman function (round 2) — exact for the
  exponential profiles; the ozone tent shell uses an analytic capped-secant column.
- Multiple scattering is a per-recipe Hillaire-style table (atmolut.js): 2nd-order
  gather + isotropic series + ground bounce. Honest in magnitude and hue; not a full
  Bruneton LUT stack (no per-view-angle MS anisotropy).
- Ambient irradiance is a per-frame CPU evaluation of the same integral, not a full LUT.
- The copper-eclipse annulus (round 9) integrates the refracted, transmitted sunlight
  over impact heights h — amplitude ∝ recipe refractivity (Earth bright copper, Mars
  almost none), spectrum from the tangent-chord transmittance; one geometric-dilution
  constant remains (annulusTint has no occluder distance).
- Refraction remaps light-source apparent elevation (Bennett profile x recipe
  refractivity x local density); terrain/horizon refraction and sunset timing are not
  yet lifted (the sun still sets ~2 min early on Tellus).

## Build round 1 of ROADMAP_V2 (implemented — July 2026)

Phases R, 1, M and a slice of 2 are now in the build:

- **Bench harness (R).** `bench/`: scene registry (16 icons + 19 breakpoints as
  `__shot` specs), `npm run bench` stills + rotating date-seeded control set +
  objective tells (spectrum slope/anisotropy, gradient kurtosis, shadow fraction,
  limb profiles), `npm run bench:motion` scripted paths scored on pop_p99/flicker.
  `__shot` gained `clean`, `fixedEV`, `phaseDeg`, `faceSun`, `fov`, `lookAt`.
  Server moved to port **8131**.
- **Horizon-angle field (1a).** 8-octant baked sin(elevation) field (max-accretion
  across levels, reach-2 scans, valid to halo 2, capped at level ~14 — finer
  self-shadowing belongs to the BRDF statistically). Consumers: soft cast shadows
  (penumbra = sun disc + quantization floor) and the terrain-bounce view factor
  (one-bounce fill — the only fill light on airless bodies).
- **BRDF library + per-sample ambient (1b).** Recipe-driven Lommel-Seeliger +
  Hapke-lite opposition surge, ice SSS wrap, GGX lobes for ice/rock. The
  camera-metered `uSkyAmbient` global is GONE: lighting reads an 8-knot ambient
  curve at each SAMPLE's own sun elevation (terminator-split defect fixed at root).
- **Whole-disc ladder v2 (1c).** Worker-baked 256x128 equirect albedo maps (one
  atlas row per body) sampled by the sky-pass discs with L-S photometry + surge —
  a moon at 20 px shows its maria. New `provinces` bake process (flood-basalt
  maria that flatten + resurface; dark plains on Rubra) in a second field texture
  page (`rgba2`: mare + spares — the field atlas begins).
- **Night sky v2 + night packs + camera (1d).** `stars.js`: deterministic catalog
  (7000 stars, B–V colors, galactic disc + clusters) as inertial-frame points
  through the same scattering integral; analytic Milky Way + zodiacal light in the
  sky pass; aurora emission shell (recipe dipole); planetshine (companion disc
  radiance — earthshine works); airglow gravity-wave banding ([time-field]);
  deterministic ISO-scaled sensor grain. **Auto-exposure is now histogram
  metering**: the camera reads back its own rendered frame (log-avg drive,
  highlight-protected) — the scene_L heuristic only seeds teleports.
- **Motion pack (M).** Crater band-onset ramps (55% at own level, completed by the
  next — same lattice, bit-identical shapes); screen-space-error split metric
  (band-amplitude px + field-texel px + arc floor); geomorphing (children born on
  the parent's exact surface via worker-shipped `heightBase`, morph driven by the
  split score, doubling as stream-in crossfade); scatter hand-down (per-instance
  screen-footprint fold with jittered thresholds — no visibility-radius edge);
  LEAN-style variance folding for the ocean; shoreline soft transparency replacing
  the discard edge.
- **Phase 2 slice.** Broadband 16-component wind-sea+swell spectrum (kills the
  orbit moiré; per-vertex smooth resolvability ramp replaces the per-tile
  boolean); singularity statistics: degree-1–3 cascade top (dichotomy + swell axes
  in `continents`) and a heavy-tailed basin population (`basinTail`: 4x-coarser
  lattice, relaxed flat floors, outer rings); biome moisture ecotones (lite).

Additional platform landmines found this round (see the section above for the old
ones): GLSL functions must be declared before use inside the COMMON chunk (grain's
hash), `patch` is reserved (again), texture derivatives are undefined inside
non-uniform branches (disc atlas sampled in uniform flow), three's `#include
<common>` redefines PI (our define is now guarded), and `dFdx` must be compiled
out of vertex-stage COMMON (`VERT_STAGE`).

## Build round 2 of ROADMAP_V2 (implemented — July 2026)

Phase 1 is closed out (light transport + the physical camera), plus a Phase T slice:

- **Atmosphere demolition (the "replace" ledger item, executed).** The 4-step
  sun-OD march, the 1.55x Rayleigh fudge and the ambient-coupled MS proxy are
  gone. Sun transmittance is a closed-form **Chapman function** (JS twin in
  `atmolut.js`, GLSL twin in COMMON — keep identical). Multiple scattering is a
  per-recipe **Hillaire-style table** Psi(mu_s, h) built deterministically on the
  CPU (2nd-order gather, isotropic series, ground-albedo bounce — bounce albedo
  derives from the palette, NOT discAlbedo, which double-counts the sky) and
  added per-step inside the one integral. **Ozone** is a recipe tent-shell
  absorber (numeric along marched view paths, analytic capped-secant on sun
  paths) — the Chappuis band is what turns a twilight zenith blue instead of
  olive (the round-1 panel's hue defect, fixed at root). The march start is
  per-pixel jittered (fragment stages only) — the twilight arc-banding died with it.
- **Refraction + per-λ Mie (1).** Recipe `refrac` (n−1 at datum) remaps apparent
  elevation for the sun/companion discs near the horizon (Bennett profile x local
  density — the flattened setting sun is the curve's derivative). `mieG` may now
  be per-wavelength: Rubra's `[0.58, 0.68, 0.82]` gives micron dust a tighter
  blue forward lobe — the MER blue aureole emerges from phase + absorption.
- **Eclipse & transit machinery (1).** Companions become sun-disc occluders
  *inside `sunTransmit()`*, so one analytic disc-overlap (`discVis`) shades
  terrain, ocean, rocks AND every march step (the air column darkens too).
  Transit shadow dots land on the disc from space; the sky pass draws the
  per-pixel crescent, dims the glare by the integrated fraction, and wears the
  copper **refracted-annulus ring** at an atmosphere-bearing occluder's limb
  (`annulusTint`: the occluder's physical limb transmittance spectrum). CPU-side
  mutual occlusion dims + coppers companion discs (the eclipsed moon from
  Tellus) and planetshine dies during totality. `test/find-eclipse.mjs` scans
  the closed-form ephemeris for alignments; three eclipse icons joined the
  registry (#12.5–12.7).
- **HDR pipeline + physical camera v1 (1, [camera]).** Materials now output
  linear radiance (pre-exposed 1/64 to stay inside half-float) into an MSAA
  HalfFloat target; ONE post pass owns exposure → energy-conserving PSF bloom
  (5-level down/up pyramid, per-level decay, mean-preserving mix) → ACES → sRGB
  → grain. Stars' additive blend is now radiometrically exact. The metering
  servo gained: no metering while zero tiles are displayable (the black window
  after a body switch used to pump exposure to the clamp), asymmetric gains
  (highlight recovery fast, brightening cautious), and a hard step-down when
  the histogram is deeply clipped (a saturated frame can't say how far over).
- **Metre-scale shadows (1, §10 m–km scope).** Sun-aligned ortho depth pass over
  the debris band (terrain + rock instances via layer 1, override depth material
  with NO log-depth — log depth degenerates under ortho), PCF + normal-offset
  sampling (2.5 texels — grazing sun turns to acne without it), composited with
  the baked horizon field by `min()` (product would double-darken shared ridges).
  Camera-local presentation aid; the world stays pure.
- **Field dither bridge (register row).** Terrain field reads (`ao`, `mare`)
  get ±0.5 LSB screen-hash dither — kills 8-bit contour rings under night
  exposure until the Phase-2-entry 16-bit field atlas.
- **Phase T slice.** `test/contract-test.mjs` (npm run test:contract): every
  registered process passes halo bit-exactness + determinism as cumulative
  prefixes — a failing seam names its process. F8 = one-key defect capture
  (current `__shot` spec + PNG to downloads → `bench/defects/`).
- **R1 acquisition begun.** License-verified PD starter corpus: 2 DSCOVR EPIC
  full disks, 2 Apollo full-moon discs, Apollo 17 Station-6 ground frame (+ the
  11 MSL panoramas) — `bench/manifest.json` carries per-image license +
  geometry. `bench/foolrate.py` builds the normalized band-matched pair
  montages + real-vs-real controls for the blind panel.

Round-2 landmines: three.js log-depth breaks under orthographic projection
(shadow pass uses a bare depth material); reversed `smoothstep` edges are
undefined in ES GLSL (again); a WebGL canvas readback between rAF tasks returns
zeros (metering reads inside the frame); per-pixel march jitter at 6–24 steps
is severe chroma noise on a forward-Mie sky — the march uses perigee-clustered
quadrature instead (samples follow the density, deterministic); NEVER pass a
far planet (1e11 m position) into a per-fragment fp32 angular test — acos/dot
cancellation near conjunction flickers per pixel (occluders are gated by
angular radius); a bloom pyramid fed an unclamped sun clips into the deep-mip
texel's upscaled SQUARE — compress pyramid input with an exposed-space knee;
every night-sky radiance (Milky Way, zodiacal, airglow, star points) must be
calibrated in absolute units or high-exposure twilight frames exhume them —
stars additionally gate on PSF-peak vs same-ray in-scatter contrast. And the
one that cost the most: **an unsettled scene mimics shader bugs** — a
screenshot taken while tiles stream (half-morphed coarse terrain, stale ground
clamp) produces artifacts that "respond" to whatever you toggle, because every
toggle buys the stream another second; check `stats.pending`/`stable` before
bisecting pixels.

## Build round 3 of ROADMAP_V2 (implemented — July 2026)

Phase 2 ENTRY: the two structural upgrades the roadmap gates the geo-realism
core on, plus their first visible consumers.

- **The `[global]` home exists (`src/globalgrid.js`).** One planet-wide coarse
  pass for work the halo guarantee cannot bound. The recipe declares it as an
  ordered process entry (`{ type:'global', level: 3, ... }`); the grid is a
  pure function of the process PREFIX (everything before the entry) baked at
  the declared level (512×512 cells/face ≈ 19.5 km on Tellus, ~4 s once per
  body, module-cached by prefix content hash). Pipeline: assemble six faces →
  priority-flood depression fill (outlets = below sea/`drainLevel`; stable
  (key,id) tie-breaks) → D8 steepest descent with **metric cross-face
  stitching** (gnomonic uv extension → true face lookup) → accumulation in
  Kahn topological order with gnomonic cell areas (mass balance holds to
  1e-14) → optional **moisture**: upwind Jacobi advection along a zonal wind
  prior (trades/westerlies + a meridional mixing term), evaporation sources,
  orographic rainout read from a 4x-smoothed height grid (raw cell steps rain
  out ordinary fBm roughness and deserts the interior — calibration finding),
  normalized by the attainable geometric-series factor, gentle ITCZ prior.
  Fields ship as padded per-face rasters sampled bilinearly by direction —
  seamless at cube edges. `test/global-test.mjs` (npm run test:global): fresh-
  build determinism (bit-exact), mass balance, routing totality, edge-seam
  mismatch, prefix purity (appending a post-global process must not change it).
- **Consumers (Phase 2 firsts).** `procGlobal` writes `flow`/`moist` rasters
  into every tile (position stamps — bilinear by direction, so the §3 halo
  contract holds for free; overwritten each level like `context`).
  `procBiomes` bakes `veg` = temperature window × moisture curve with wide
  ecotones + riparian corridors along trunk flow — the shader's noise-proxy
  biome block is DELETED (macro geography never comes from render-time noise
  again); the disc map samples the same field, so orbit and ground agree.
  `procIncision` carves valley networks from `flow` with crater-style
  two-level onset, graded to base level — routing was established on the
  pre-incision surface, which is both the physics and the circularity break.
- **16-bit field atlas (the Phase-2-entry checkpoint, executed once).** The
  four RGBA8 field textures are replaced by ONE RGBA16F `DataArrayTexture`
  packed layer-major by `bakecore.ATLAS` — the single manifest the worker
  packs by, the shaders index by, and JS samplers decode by (half codec in
  mathx.js). The 8-bit quantization class dies at the root: the round-2 dither
  bridge and the shadow penumbra's 8-bit floor are retired. New channels ship
  in the same refactor: `veg`, `flow`, and `hgt` (the height raster), which
  gives the ocean **per-pixel bathymetry** — the round-2 panel's blue
  checkerboard was 33×33 per-vertex depth mixing, and the fix is sampling
  depth like the field it is.

Round-3 landmines: a Jacobi advection field converges as a geometric series —
normalize by `(1-(1-γ)^sweeps)`, not the asymptote, or every field sits at half
scale; orographic rain keyed on raw grid steps at ~50 km spacing extracts all
moisture into fBm roughness (rain must read range-scale relief); when a
process entry is matched by identity to find its prefix, provide a by-type
fallback or copies of the entry silently pick up the FULL list (the grid would
read its own consumers); D8 flow is an 8-direction polyline field — consumers
that trace it (tint thresholds, incision) print circuit-board staircases
unless the sampling position is domain-warped (meanders are a warp, not a
router change); and any authored night-sky STRUCTURE (airglow banding) will be
posterized into blobs by the meter's exposure clamp — at working exposures a
real camera sees a smooth-to-invisible airglow shell, so calibrate at the
clamp, not at "night." Harness: `__shot` reset semantics must be a
whitelist-of-nothing — `season` kept a legacy only-if-specified guard, and the
first full sweep to include the eclipse icons (season 5.0) leaked it into 25+
later scenes (below-horizon Luna, drifted sun azimuths) that read exactly like
code regressions. Moisture calibration: the advection field is normalized by
the OCEAN steady state (e0/γ), so raising `evapSea` is a no-op — only the
land/sea evaporation ratio, γ, and rainout move the normalized land values.
And when a baked field replaces a render-time noise proxy, budget for the
STRUCTURE the proxy carried (mid-frequency mottle), not just its mean — a
smooth honest field can read worse than a dishonest textured one until the
patchiness octaves land.

## Build round 4 of ROADMAP_V2 (implemented — July 2026)

Phase 2 core content, first slice: **the crater overhaul** — the register's
"identical stamped rings — no ejecta rays, no size-frequency hierarchy" tell
(the round-2 blind panel's #2 attribute failure), burned down at the stamp:

- **SFD within each band.** Crater radii draw from a truncated power law
  (`N(>r) ∝ r^-sfd`, default slope 2, three thinned tries per lattice cell so
  expected count still equals `density`) — every band now carries a size
  hierarchy instead of one same-scale ring per box. Degradation state `deg`
  draws fresh-biased (`u^1.6`): most craters are subdued, every band keeps a
  crisp population (a uniform deg flattened the whole population into custard).
- **Morphology by size class.** `complexR` (recipe datum) marks the
  simple→complex transition: below it, parabolic bowls with the linear depth
  law; above it, Pike's shallowing law (`d ∝ r^0.3`), flat floors, central
  peaks rising from the floor (never above the rim), sine-profile wall
  terraces; the basin tail keeps flat floors + outer ring and gains a peak
  ring. Degradation subdues depth, widens + lowers rims, erases
  peaks/terraces/ejecta — old craters read as ghosts, not faded stamps.
- **Ejecta + rays + the `fresh` field (G6 groundwork).** A hummocky continuous
  ejecta blanket (r^-3 falloff, windowed at 2.4 r) in height; young large
  craters write radial ray spokes (azimuthal value noise on the crater's local
  circle, patchy along their length) into a new `fresh` field — ALBEDO only.
  The shader and the §11 disc map both consume it through the recipe's
  `palette.freshTint`, so the G6 sign is data: Luna fresh = brighter (immature
  regolith — its full-disc identity is now its ray systems), Rubra fresh =
  darker (dust-free rock). Atlas grew layer 4 (`fresh`/`moist`/`uplift`; the
  manifest accepts null pads that pack as zeros).
- **Provinces fill regionally.** `procProvinces` keys its lava fill on a 5×5
  box-mean height instead of per-cell height: maria flood broad lows (basins,
  lowland plains, the largest old craters — real stratigraphy), never every
  sub-resolution crater pit. The kernel is contract-legal at the province level
  because every earlier process is a position stamp (height is pure across the
  full raster there); writes clamp to the height-validity window (halo 4).
  Provinces must keep running before any stateful neighbourhood op.

Round-4 landmines: a GIANT stamp (band-0/1 ray systems reach ~90° of arc)
cannot be windowed through the gnomonic center projection — a center past the
face horizon projects to k≤0 and the stretch outruns any fixed over-scan, which
printed square-truncated ray fields at cube-face edges; giants scan the whole
raster with the exact 3D distance test instead (seam-proof by construction,
and only a handful exist). An ALBEDO field must arrive whole at its band's
first level: routing `fresh` through the height onset ramp's 0.55/0.45 split
printed a 45% ray-albedo step wherever draw-best-available put a LOD boundary
through a ray system (height blends in; albedo arrives whole). A one-level
province fill that reads raw height inherits every earlier band's pits — the
SFD's small deep bowls became square mare dots + square flattening dents at
level-2 cell scale. And the per-tile scalar geomorph has a now-legible
residual: where the split score varies across a tile (obliquity/silhouette
terms), the unsplit side of a level boundary sits partially morphed against a
completed neighbour — the step is `(1−morph) × band onset amplitude`, which
round-4's giant craters raised into visibility at one gibbous disc pose
(register row; the honest cure is Phase M's screen-space-error split with
CDLOD-style per-vertex morph, continuous by construction — a scalar per-tile
anchor cannot satisfy both sides of the boundary when adjacent scores differ).
**Turbo settle (Phase T velocity slice).** Profiling the 150-300 s eye-level
scene settles showed the bake was NEVER the bottleneck (3.5 ms/tile; a full
eye-level pyramid ≈ 2-3 s of CPU) — streaming is frame-rate-coupled, and
SwiftShader renders eye-level frames at ~1-2 fps, so the request cap
(48/frame), rock builds (1/frame) and the 6-quiet-frames stability count all
crawled at render speed. With time PAUSED (`state.speed === 0`, true for every
`__shot` scene) nothing in the world changes between frames, so: the request
cap bursts to 384, rock builds batch 16/frame, and the expensive render passes
are skipped on 7 of 8 UNSETTLED frames. Every settled frame still renders —
the meter converges on real frames and `stable` only counts frames whose
canvas shows the settled scene — verified pixel-identical output (max 1/255).
Worst scenes: pavement-walk 187→78 s, boulder-macro 204→146 s; interactive use
(speed > 0) is untouched. The same profiling run killed the worker-pool idea:
parallel bake workers would multiply the OOM-prone tile caches for a stage
that costs 2% of the wall-clock. Turbo then exposed a latent bound: a
pathological pose (the moon-sizes fov-3 zoom) can DESIRE more tiles than the
memory budget — every desired-path tile is lastUse-warm so evict() cannot trim
it, and the cache grows until allocation fails; the old 48/frame trickle had
merely never streamed such scenes before their timeout. The request loop now
stops at the cache cap's headroom: an over-demanding scene settles at the best
draw-best-available the budget allows (the fov-3 rung dropped 152 s → 2.8 s,
and the runaway demand was for out-of-frame terrain below the camera anyway).

Verification landmines: growing per-tile memory (+1 atlas layer, +1 field)
tipped the 60-scene single-page bench into allocation failures — a metrics
outlier can be the RENDERER dying, so the page now exports `__pageErrors` and
the bench fails such scenes loudly; and WITHOUT version control a promoted
baseline is a photograph of an unrecoverable state — round-4's panel "found"
sentinel regressions that a full bisect proved were baseline drift (plus
baselines that predate a scene re-pose comparing different places). Init git
before the next baseline promotion. And when a scene's `__shot` settle budget
is raised past ~180 s, puppeteer's `protocolTimeout` must be raised with it —
the blocking evaluate call otherwise dies mid-run with a ProtocolError and the
sweep silently stops.

## Build round 5 of ROADMAP_V2 (implemented — July 2026)

Ground plan first slice: **the rock overhaul** — layer 4b (rock asset
pipeline) plus the clast-continuum placement rules, burning down the
register's worst eye-level row ("faceted geodesic blobs, background visible
THROUGH cracks in the rocks, one identical archetype, untextured flat gray"):

- **`rockcore.js` — the asset pipeline as a pure function.** Every mesh is a
  deterministic fn of (archetype, variant, LOD, `body.rocks`): a WELDED
  icosphere (midpoint-cached subdivision) sculpted by seeded cut planes
  (soft-min edges), a max-norm box morph for the blocky classes, and fBm
  roughening — evaluated per unique vertex DIRECTION before any unwelding, so
  facet output is watertight by construction. v0 deformed three.js's
  non-indexed IcosahedronGeometry per vertex INDEX: shared vertices split and
  the mesh literally cracked open. Four archetypes follow G3 provenance
  (angular clast / rounded cobble / bedding slab / jointed block), 2 variants
  each, 3 LODs (1280/320/80 tris) sharing ONE fit transform per variant so a
  LOD swap never shifts a rock's footprint; `rounding` (recipe) shallows the
  cuts and softens normals (Huygens cobbles vs lunar breccia). Node suite
  `test/rock-test.mjs`: determinism, closed-2-manifold on every mesh,
  LOD anchor stability, clustered §7 partition, population-mix convergence.
- **Placement (scattercore).** Archetype drawn from the recipe's G3 `mix`
  weights, settle tilt (plates/blocks lie flatter), bottom-anchored burial
  from per-variant mesh bounds (v0 assumed a centred sphere — slabs floated),
  and CLUSTERS: big rocks shed 2-4 fragments keyed off the parent's lattice
  cell (angular by provenance; rounded bodies shed cobbles), with the
  candidate scan margin widened to the child reach so the §7 tile partition
  stays exact — a child owned by a different tile than its parent lands
  exactly once (bake-test's partition check now exercises this for free).
- **Per-instance data without breaking geometry sharing.** Seed + burial ride
  the instance matrix's spare bottom row (m[3], m[7]): those elements never
  enter `(M·v).xyz` or `mat3(M)` in GLSL, so the affine transform is
  untouched and per-tile instanced attributes (which would force per-tile
  geometry clones) are unnecessary. The shader derives shade/mottle/fade
  jitter from the seed — a fact of the planet, stable across tile rebuilds
  (gl_InstanceID would repaint a rock whenever its owning tile rebuilt).
- **Rocks are terrain (shading).** Same BRDF library, plus: object-space
  albedo mottle (two vnoise octaves — world coords lose fp32 precision at
  planet radius), G6 dust patina on up-facing surfaces weighted by burial
  (the veneer sign is the dust palette), and contact AO at the base (layer-4
  fusion, cheap half). One InstancedMesh per (tile, archetype, variant)
  bucket in a Group; mesh LOD by tile level (deeper tiles sit nearer).

Round-5 landmines — all three were found because the new near-field detail
made old approximations legible:

- **The request budget starved the ground underfoot.** Grazing ground poses
  settled at L15 (round 4's memory caps): far coarse paths exhausted the
  CACHE_CAP+100 request budget, and draw-best-available's ancestor-covering
  dedup clamps displayed depth to the SHALLOWEST leaf sharing a subtree — a
  mid-field leaf displaying a shared L12 ancestor drops the whole camera
  pyramid. Requests now issue in three bands: (0) the camera-ancestor sibling
  chain that provably unlocks full depth underfoot (~4 tiles × 7 levels —
  displaying level k+1 requires every sibling child of the level-k camera
  ancestor baked past k), (1) planet coverage to L12 coarse-first (a leaf
  displaying a face ROOT would cover-and-drop the whole face — a nearest-first
  sort alone collapsed the display to ONE root tile), (2) remaining depth
  nearest-wanting-leaf first. Eye-level scenes reach L19 underfoot within the
  same memory budget and settle 3-6× faster again (burst requests stop being
  spent on far tiles whose rocks then had to build too).
- **The v0 "boulder field" was an enumeration artifact.** An L15 tile spans
  65k lattice cells; the 6000-rock cap truncated the scan a fraction of the
  way through and printed DENSE STRIPS with hard edges (the round-2 "scatter
  stops at an abrupt edge" tell, root-caused at last). `minTileLevel` 16 puts
  every build under the cap — production placement is now exactly the
  Node-tested partition. The honest density this exposed was CONTENT: G3 says
  airless plains carry impact-gardened lag everywhere (`denFloor`, per-body
  data: Luna 0.22, Rubra deflation lag 0.12, Tellus soil-buried 0.02) and
  ejecta blocks are traceable to their crater — `stampCraters` now writes
  freshness-weighted `rockDensity` into the ejecta blanket, so young craters
  shed block fields and degraded blankets lie buried. pavement-walk-luna went
  from empty plain to blocky ejecta debris field from those two data changes.
- **Instanced rocks are only as good as the tiles that own them** — at
  memory-starved poses the instanced-debris zone is confined to the deepened
  bubble (tiles ≥ L16); beyond it there are no instances at all. The honest
  fix stays the registered Phase M "scatter hand-down" row (per-instance
  screen-footprint folding into the ground material's rock term).
- **Every representation must fold consistently — the shadow pass too.** The
  panel's severest finding was fields of disembodied shadow blobs: the
  footprint fold culled rocks from the main pass while DEPTH_VERT still drew
  them into the metre-scale shadow map (shadows with no casters), and coarse
  terrain tiles cast razor-edged polygonal shadows onto the deepened zone
  (their shadows already live in the baked horizon field — double counting).
  Both gates now match: the depth pass applies the same binary fold, and only
  ≥L15 tiles are metre-scale casters. Same family, opposite sign, as the
  round-4 "albedo arrives whole" lesson: LOD decisions are per-REPRESENTATION
  invariants, not per-pass conveniences. And when a request budget dies, it
  must die RADIALLY (coverage ties break by distance) — insertion order let
  it die along a straight line across the alpen-dawn frame (panel: WORSE).

## Build round 6 of ROADMAP_V2 (implemented — July 2026)

**Ground plan L2 + L3 first slice, and the rocks finish joining the ground.**
Round 5 put honest rocks ON the ground; round 6 makes ground and rocks one
continuum — one micro-relief function, one shadow answer, one weathered
surface language.

- **Meso-displacement (L2), CPU-baked into the mesh.** Two position-pure
  value-noise octaves (~4 m and ~1 m; `mathx.vnoise3`, a bit-exact JS twin of
  the shaders' `vnoise` lattice) displace deep-tile vertices radially at
  `buildTile`, amplitude driven by the rock/rockDensity fields (rubble ground
  undulates ±0.35 m, dust plains stay near-flat), onset-ramped over L15–17
  (§4). CPU-side because the sun depth pass renders tiles through
  `scene.overrideMaterial`: shader-side displacement would detach terrain
  from its own shadows — the round-5 per-representation-invariant lesson,
  applied in advance this time. The band rides `aHeight`/`aHeight0` so
  geomorph blends it in like any bake band; skirts, bounding spheres and the
  shadow pass inherit it for free. Rock placement adds the same function to
  its height snap (rocks sit on the displaced ground, not the raster).
- **Material stacks v1 (L3), procedural.** The flat value-noise speckle — the
  demolition ledger's "terrain fragment shading" item — is replaced by
  per-material composites: exposed rock gets CREASED micro-relief (ridged
  octaves), fines stay smooth; a G4-lite fill term pools dust in the
  micro-hollows of the SAME meso function the geometry displaced (cross-scale
  coherence: albedo correlates with relief), covering rock by height-blend
  and folding to its statistical mean when sub-pixel (§7). Crevices hold
  settled fines and shadow — one relief, three consequences.
- **Limit-surface rock maps (4b residue).** The sculpt is a closed-form
  radius function of direction, so the infinitely-subdivided surface normal
  is computable at any direction: `makeRockMaps` bakes one octahedral RGBA8
  normal+cavity layer per (archetype, variant) at startup (~0.3 s,
  deterministic, Node-tested), indexed by a sculpt-direction vertex
  attribute. Facet interiors now shade as the TRUE high-res rock at every
  mesh LOD — the "low-poly/untextured clay" register rows die without new
  triangles; the round-5.1 generic noise-bump bridge is deleted. Cavity
  drives crevice darkening and dust-patina accumulation (the same
  dust-in-cracks rule as the ground).
- **Scatter lighting unification.** Rocks were lit only by the camera-local
  shadow map — bright boulders floated inside baked horizon-field shadows
  (round-5 live report). Rock materials are now PER-TILE clones binding the
  owner tile's field atlas; each instance carries its tile-local uv packed
  into the instance matrix's third spare bottom-row slot (11 bits/axis —
  exact in the f32 mantissa; like seed/burial it never enters (M·v).xyz or
  mat3(M)). ROCK_FRAG samples the horizon octants + view factor at that uv
  and composites with the shadow map by MIN, plus the terrain's enclosure
  ambient and bounce terms verbatim: rocks and the ground they sit on now
  read one lighting answer.
- **Bead-chain guards (register).** Two bake-data fixes for rockDensity bands
  narrower than the placement lattice: the crater-rim density write became a
  downslope talus APRON with a ~4-lattice-cell width floor (amplitude scaled
  by rimW/rw so shed mass is conserved; already-wide rims are bit-identical),
  and the consumed field level (`rocks.minTileLevel`) gets one 3×3 tent blur
  (fine levels keep crisp detail for the shader speckle — they never feed
  placement). Round-5's crisp "tire-track" dot trails read as scattered
  debris now; a faint residual trail is registered.

Landmine notes: the meso band must NEVER be evaluated shader-side for
geometry (override-material depth pass), and its JS/GLSL twins stay bit-exact
only because every scale × 4096 m is an exact power-of-two lattice period —
`rock-test.mjs` pins both (snap periodicity, §4 onset ramp). The blur writes
halo 2 from halo-3-valid reads; scatter and display never look past halo 2.

## Build round 7 of ROADMAP_V2 (implemented — July 2026)

**Phase T tooling — the velocity round.** No new world content: round 7 builds
the tuning loop, director tools, and asset/gate machinery that make every later
round cheaper and faster. Everything here is `[camera]`, tooling, or Node-side
determinism; the render path for non-photo scenes is bit-unchanged.

- **Hot recipe reload with band-selective invalidation** (`bakecore`,
  `bake.worker`, `tiles`, `main`). `invalidationLevel(oldProcs, newProcs)` is a
  pure function returning the shallowest bake level at which two process lists
  can diverge (min first-band of every changed/added/removed process; Infinity
  if identical). `baker.invalidate(minLevel)` drops only cached tiles at level
  ≥ that, `setProcesses` swaps the list in place. `__reload(processes)` posts a
  reload to the worker (which mirrors the eviction) and the main-thread tile
  cache evicts + re-requests the affected band — **changing a level-13 process
  leaves levels 0-12 byte-identical** and never rebakes them. A generation
  counter on every tile request+reply discards bakes that were in flight across
  a reload (they carry the old recipe). `reload-test.mjs` proves the retained
  shallow tile equals a from-scratch NEW-recipe bake (genuinely unaffected, not
  stale-cached) and the in-band tile rebakes deterministically. This is the
  velocity limit for every Phase 2 round, and the engine for seed casting below.
- **Process contract harness completed** (`contract-test`). The existing
  per-prefix determinism + halo checks gain **cross-face cube-edge agreement**
  (a 3D-pure stamp reads the same height on both faces of a shared edge) and a
  **finiteness** guard (no process writes NaN/Inf) — run against every
  registered process on every body by baking cumulative prefixes. A new Phase
  2/5 process cannot ship without passing a contract it never wrote.
- **Asset build step** (`scripts/assets.mjs`, `npm run assets`). CONCEPT's "no
  build step" is amended: one deterministic seeded pass writes the engine's
  generated artifacts (rock mesh packs, limit-surface rock maps, MS LUTs, §11
  disc maps) to `assets/*.bin` with `assets/manifest.json` recording a sha256
  per artifact. `assets:check` regenerates in memory and verifies the hashes —
  the determinism contract. The runtime stays build-free (it still regenerates
  these from the same pure functions at load); the blobs are gitignored, the
  manifest committed. Future generated artifacts (imagegen texture stacks,
  offline-decimated rock sculpts) land here. Star catalog extraction (three-
  coupled) rides a later round — a one-line loader swap.
- **Photo mode + director tools** (`camera`, `main`, `shaders POST_FRAG`,
  `planet.html`). Free-look camera unlocks the tilt clamp (pitch measured from
  the horizon reaches nadir↔zenith) plus roll — the registered "camera cannot
  look up" defect (central eclipse / aurora overhead are now framable); a
  white-balance tint (`uWB`) and film-grade S-curve (`uGrade`) as `[camera]`
  post controls, both **exact identity at default** so sentinels are
  bit-unchanged; a supersampled clean still capture (F9, renders one frame at
  2× internal res); localStorage bookmarks (a saved view IS a reproducible
  `__shot` spec) with a click-to-jump panel (P toggles). All new fields travel
  in `__shot`/`currentShotSpec` and reset with the round-1 reset semantics.
- **Perf-budget gate** (`main` → `__perf`, `bench/motion`). The render loop
  accumulates per-subsystem frame-time EMAs (frame / tile-update / shadow /
  render); the motion bench samples `__perf()` at each path's settled end,
  reports measured-vs-budget, and trips only on a hard "renderer stalled"
  ceiling. Numbers are honest-caveated as SwiftShader (software GL, ~100× a
  GPU); the budget bites once the WebGPU checkpoint (round 15) supplies GPU
  numbers.
- **Seed casting** (`bench/casting.mjs`, `npm run cast`). A body is a pure
  function of its seed, so hero quality is selection, not authoring: cast N
  reseeded variants via `__reload` (no page reload — variant 0 is the shipped
  seed), render whole-disk + limb, lay them out as a contact sheet. Rubra n=3
  produces three visibly distinct worlds (different dark provinces, polar caps,
  albedo) — choosing a world is an afternoon.
- **R1 artifact masks** (`bench/foolrate`, `bench/manifest`). Per-ref crop
  windows and exclusion masks now live in the manifest; a random crop
  overlapping a masked artifact rect is rejected. Inspecting the Apollo ground
  frame showed the old crop window sampled straight into the LRV rover — fixed
  to the clean regolith/boulder region with the centre astronaut masked. The
  round-2 harness finding (fool-rate biased LOW by rover/reseau/mosaic leakage)
  is discharged for that ref; reseau crosshairs are a ~1px grid (attenuated by
  the 384px downscale, not rect-maskable — noted for a grid-aware crop later).

Landmine notes: WB/grade default to exact identity (`hdr * vec3(1.0)` and a
skipped `if (uGrade != 0.0)` branch) so no non-photo render moves a bit — the
sentinel bit-identity check confirms it. The reload generation counter is
essential: without it a pre-reload bake reply races the re-request and caches
old-recipe data. `__reload` scopes to `processes`; palette/rocks edits still
need a body switch (noted for a future full hot-reload).

Phase T residue (light follow-ups, not blocking any round): depth-of-field /
focus for near subjects in photo mode; a dedicated same-view A/B diff render
(the primitives exist — `__reload` old vs new, or `casting.mjs` for seeds —
but no side-by-side UI); moving the motion bench's canned paths from code into
`paths.json` data (in-app bookmark playback already makes paths authorable);
star-catalog extraction into the asset pack (a one-line loader swap in stars.js).

## Build round 8 of ROADMAP_V2 (implemented — July 2026, Fable-driven per the model plan)

**Ground plan L1 + ground laws G1/G4/G5** — the first new bake-process families
since the model plan, and the round that makes ground read as *geology*.

- **The cliff-and-bench former** (`bakecore procStrata`, recipes). A per-cell
  PURE remap of height in a strata frame — position + current height only, no
  stencil reads: the process shares levels with thermal, where a stencil would
  break the §3 bit-exact halo contract (the contract harness enforces height
  equality to halo 4, so this constraint *designed* the algorithm).
  `zs = (h − fold(pos))/T` puts each point in a dipping, gently folded bed;
  `r(f) = (1−q)·f + q·S(f)` monotonically remaps the within-bed coordinate so
  soft mid-bed material collapses onto treads and the bed's rise concentrates
  into a riser under the cap — benches, scarps, mesa edges, knickpointed
  valley walls, with NO possibility of height inversions (monotone for any q;
  `test/strata-test.mjs` proves it, plus dh→0 pinning at bed boundaries so
  cap-hash flips stay continuous). q gates stack: sparse per-bed cap hash
  (escarpments are events, not wallpaper), strike fade, and a recipe FIELD
  gate — Tellus/Rubra benches live in the uplift highlands, Luna's subtle
  flow-front benches are gated to the maria (highlands bake byte-identical
  with the process removed — tested). Each bed octave stamps once at the level
  that resolves its riser, with the crater-style two-level onset. Consequences
  ride the same weight: risers write rock exposure (G1's substrate), calved
  blocks collect below (G3 iv), and thermal (later in the list) relaxes
  oversteepened risers into talus. Mechanism numbers (allcap variant, Rubra
  upland L12): tread share 24.6→59.3%, top-5% slope concentration up, local
  steepening ×4.6 — a redistribution, never conjured relief.
- **G5 catena** (`procCatena`, new `fines` field in ATLAS L4 alpha). Signed
  curvature accreted per band over the hillslope levels: hollows accumulate
  fines, crests shed them, convexities gain bedrock exposure and a few shed
  clasts; fines ponds bury a fraction of the clast field. Measured on real
  tiles: hollows carry 4–15× the fines of crests on both Luna (creep agent)
  and Rubra (aeolian) — one mechanism, two agents, per the generalization
  contract.
- **G4 sand routing v2** (`TERRAIN_FRAG`). The round-6 micro pooling now keys
  its SUPPLY on the baked fines field (a real upslope integral, not noise);
  wind ripples are a continuous sin phase along the recipe wind heading
  (snap-safe: no rotated lattice), wobbled and patch-confined to sand
  accumulations — bedforms live where sand CAN accumulate; on windless Luna
  ripK=0 and pooling alone survives (crater-floor fines ponds).
- **G1 joint tessellation** (`TERRAIN_FRAG plates()`). Exposed bedrock breaks
  into coplanar plates: a cellular field on an AXIS-ALIGNED lattice (a rotated
  lattice coordinate breaks the 4096 m detail-snap wrap and seams at tile
  edges — found in design, not debugging) whose joint-set ORIENTATION lives in
  a rotated anisotropic distance METRIC (continuous in position = snap-safe).
  Consequences: sand-filled joints (the crack mask feeds the G4 fill, so
  joints inherit dust albedo + burial), coplanar interiors (micro octaves
  damped inside plates), per-plate tone. Landmine from the first probe: a
  0.12·S groove is sub-pixel at walking distance — the crack line must WIDEN
  to the footprint and FOLD its amplitude (§7), or it aliases into
  black-and-white pixel stairs.
- **Pavement exposure** (`uPavK`, recipe). Flat, fines-poor ground reads as
  beveled bedrock pavement in regional patches (G5 "erosion wins" where
  nothing supplies fines) — the substrate the G1 plates tessellate; strong on
  wind-scoured Rubra, rare on gardened Luna (recipe data).
- **Round-8 register fixes** (recipe/scatter data): Luna `denFloor` 0.22→0.08 +
  `sizeMin` 0.1→0.2 (the boulderfield reads as boulders, not pockmark specks),
  Luna rock albedo 0.20→0.30 (fresh breccia is brighter than mature regolith),
  clast `sy` floor 0.6→0.75 (pancake pucks retired; flat profiles belong to
  the slab archetype).

**The round-8 critique panel** (53 agents, finders on Opus / skeptics on
Sonnet per standing rule 1; 20 confirmed + 5 softer — full dispositions in
`bench/critique-round8.md`) caught the exact failure the anti-overfit law
exists for: **Luna's joints read as the same flagstone pavement as Rubra**
(same mechanism, different knobs — "a Mars feature wearing a law's clothing").
Fixed in-round with a post-panel batch, verified by probe: **`jointTab`**
(recipe data) picks the fracture AGENT — 1 = oriented tabular sets + coplanar
flagstone tops + full sand-seam grooves (Rubra 1.0 / Tellus 0.8), 0 =
isotropic equant impact shatter with rough tops and softened gardened
boundaries (Luna 0.1) — the LOOK diverges, not the parameters; a **plate-merge
hash** (symmetric hash of the two nearest cellular sites erases ~1/3 of
joints) breaks the monodisperse mud-crack net into a block-size hierarchy;
and filled joints now brighten toward dust (groove ×(1−0.9·fill)) with ±16%
ungated per-plate tone. The panel's other highs were verified pre-existing by
the sweep's ≈0 metric deltas (the 5,000 km reticulation and the mid-LOD waxy
dome are registered round-6 rows re-observed, not regressions).

Landmine notes: any dot-product/rotated coordinate fed to the wrapped `vnoise`
lattice breaks the 4096 m snap (joints/ripples had to be built from cellular
metrics and continuous sin phases); the strata remap iterates toward tread
attractors, so its risers NARROW rather than widen — slope-histogram share is
the wrong acceptance metric (concentration + local steepening are right); a
fines field normalized by cell size accretes weakly on gentle lunar terrain
(kFines is per-body recipe data for a reason); catena accretes fines only
in HOLLOWS, so every flat sand plain reads "fines-poor" and legally paves
(pavK cut to 0.06 on Tellus as data hygiene; the depositional-flat fines
floor is round 9); and the beach-eye mid-field checker band taught an
attribution lesson — blamed on pavK, REFUTED by A/B sweep metrics (the band
ignored the pavK cut): the real amplifier is catena's convexity rock boost
running the f2/f3 bump octaves hot at their fade boundary, an amplification
of the registered round-6 speckle class. Shipped as an honest registered
partial-regression (the round-6 airless-caveat precedent); the fwidth
amplitude roll-off that fixes the whole family is round 9's.

## Build round 9 of ROADMAP_V2 (implemented — July 2026, Opus-driven per the model plan)

**Phase 1 photometry remainder.** Recon reframed the round: the BRDF library
(Lommel-Seeliger + Hapke-lite surge), the multiple-scattering LUT, atmospheric
refraction (Bennett apparent-elevation remap), the sky-ambient-from-LUT curve,
the whole-disc ladder v2 (root-tile-baked equirect atlas), eclipse/transit
machinery, planetshine, night-sky v2 and the physical-camera post pass were all
*already built and wired* across rounds 1–3 — the recipe even carries the `brdf`
and `refrac` data. So round 9 is what was genuinely still open: the **airless
fill cluster**, the **honest refracted-annulus integral**, **star occlusion**,
the **physical-camera completion** (metering/WB modes), the **round-8 residue**,
and an **acceptance-check instrument** for the one remaining sky residual.

- **Airless fill cluster** (`shaders.js`, `atmo.js`, recipes). Four terms, and a
  lesson. (1) An **opposition-surge shoulder**: the raw `1 + B0·B(phg)` surge
  peaks at 1+B0 (2× for full-surge regolith) and drove near-opposition / high-sun
  Luna past clip — the round-8 panel's "featureless white". The saturating form
  `1 + B0·B/(1 + 0.5·B0·B)` caps the boost so sunlit regolith lands below clip
  while staying monotone and peaked at opposition (full-Moon flatness survives;
  verified: luna-highsun p95 0.53, textured, not blown). (2) An **isotropic
  airless ambient floor** (`atmo.js skyAmbient`, the `!atm` branch was a hard
  `[0,0,0]`): a shadowed facet still sees the sunlit surrounding regolith, so the
  floor is ~a few % of the direct level, **saturating** once the sun clears the
  local horizon rather than dying linearly with elevation. (3) The
  **sunlit-neighbour bounce** now gates on `smoothstep(sinEl)` not `max(sinEl,0)`
  — the old linear factor sent the fill to ~0 exactly at grazing sun, the worst
  case. (4) A **slope-scaled metre-scale-shadow bias** (`localShadow`): the map
  is sun-aligned, so grazing ground spans many depth texels per pixel and a fixed
  bias leaves acne — scale the receiver push and depth bias by `tan(grazing)`.
- **THE ATTRIBUTION LESSON** (rule 2, "the fix lands with instrumentation, not
  another blind tune"). The airless "black-pepper carpet" (round-6 register) and
  the beach-eye "checker band" (round-8 register) had each been attributed
  **twice** — round 6 to the material-stack bump octaves + cavity map, round 8 to
  catena's convexity rock boost running the f2/f3 bumps hot. Round 9's first
  instinct followed suit (an fwidth roll-off on f2/f3, a fines floor) and made
  the metrics **worse** — beach kurtosis 27→81. The **diagnostic modes** settled
  it: render the same pose as albedo (uMode 1 — smooth), normals (uMode 2 —
  smooth), horizon-shadow (uMode 7 — smooth). The band lives ONLY in the lit
  frame, i.e. in the **direct term**: `mu0 = max(dot(n, sunDir), 0)` crossing
  zero on the ~4 m CPU meso relief at the terminator — genuinely dark self-shadowed
  facets, under-filled (ink-black on airless Luna, gray on atmosphere-filled
  Tellus). NOT the bumps, NOT catena, NOT pavement, NOT the shadow map. The
  speculative f2/f3 roll-off and fines floor were reverted; the fill terms above
  are the honest partial fix (they soften the facets — normal sun reads clean:
  luna-highsun kurt 15). The residual grazing-facet aliasing is Phase-M filtered
  / Toksvig normal folding (round 11), now registered against its TRUE cause.
  Landmine registered: a literal backtick inside a GLSL `/* glsl */` template
  comment terminates the JS template string ("Unexpected identifier" at load) —
  never put backticks in shader-source comments.
- **Refracted-annulus honest integral** (`atmolut.js annulusTint`). The copper
  eclipse ring replaces a flat `0.01×T` calibration: integrate over impact
  heights h the sunlight refracted into the umbra — each grazing ray bends by
  δ(h) ∝ density and survives with the tangent-chord transmittance T(h) (blue
  extinguished → copper). The ring radiance ∝ ∫δ(h)T(h)dh, so its **amplitude now
  scales with recipe refractivity** — Tellus a bright copper ring (RGB ~5e-3,
  red/blue 4.0), Rubra almost none (~1e-4, thin CO₂), Luna zero (airless). One
  geometric-dilution constant remains (annulusTint has no occluder distance),
  documented. The Fable-grade flag did not trip — the integral is bounded and
  stable, no escalation needed.
- **Star occlusion** (`stars.js`). Stars were occluded only by the datum sphere;
  now a companion disc or the sun in front of a star blocks it (angular test in
  the body-fixed frame, the sky-pass's own `uBodyDir`/`uSunDir` twins) — earthrise
  and moon-sizes no longer burn the star field through the lit disc.
- **Physical camera v1 completion** (`main.js`, `POST_FRAG`). Selectable
  **metering** (`avg` / `center` / `spot` — parametrizes `meterImage`'s weight)
  and a **white-balance mode** (`scene` shows the illuminant's cast, `camera`
  neutralises it to D65) — both default to the round-7 behaviour, so sentinels
  stay bit-identical. PSF bloom / grain / grade / free-look were already round-7.
- **Round-8 residue** (data + small shader). Wind ripples now read as
  **directional trains**: the envelope is sampled stretched along the wind and
  slow across the crest, so a fetch of ripples migrates along `uWindA` instead of
  an isotropic dot field (amp 0.05→0.08). The **catena fines→supply** ramp is
  steepened (0.02–0.25) with a subtle **fines-pond albedo tint** so crater-floor
  ponds read on dust flats. Luna `denFloor` 0.08→0.10 (the register's boulder
  re-check). A dedicated **cliff-bench scene pair** (`cliff-bench-tellus`,
  `cliff-bench-rubra`) joins the registry. The master-joint octave and per-plate
  mean-plane counter-shaping stay deferred (their own register hedge — mesh-side).
- **Horizon-convergence acceptance check** (`bench/metrics.mjs horizonGap`). The
  register asked the sky-view-LUT installment to gain an acceptance check: at a
  grazing land frame the distant terrain radiance must MEET the sky radiance.
  `horizon_gap` measures the median column luminance step across the terrain→sky
  boundary — an instrument for the MS aerial-perspective residual (measured this
  round: beach ~0.26, Rubra ~0.17; airless bodies read a sharp gap correctly).
  The **MS second installment** proper (lower MS_MU0, extend ozone above-shell,
  the grazing blue in-scatter fill) is registered as continued residual — the
  roadmap frames MS as multi-installment, and per rule 2 an emergent aerial-
  perspective hunt is not started blind; the acceptance check now measures it.

**The round-9 critique panel** (53 agents, finders on Opus / skeptics on Sonnet
per standing rule 1; 14 confirmed + 5 softer — full dispositions in
`bench/critique-round9.md`) again earned its keep: it caught two real round-9
REGRESSIONS the driver missed. Fixed in the post-panel batch, verified by probe:
(1) **lunar-eclipse-ground read as bright neutral noon** — the new isotropic
airless floor keyed on sun elevation, not occluder visibility, so it stayed lit
through totality and washed the copper; the airless ambient now multiplies by the
sun visibility carried in `TsRaw` and collapses under the umbra (the regolith
glows copper, verified). (2) The panel blamed a blocky
band on the round-9 slope-scaled shadow bias; the bias WAS a mistaken addition
(never the leopard fix), so it was REVERTED — but the flagged band sits beyond the
35 m shadow-map box and is PIXEL-IDENTICAL in the round-8 baseline (A/B), i.e.
pre-existing grazing meso-facet self-shadow (a third mis-attribution of that
family, routed to Phase M), not a round-9 regression. (3) The
annulus amplitude was tuned down (42→15 × refractivity) — the ring was blazing as
a "ring of fire", not a dim copper totality. (4) The directional-ripple redesign
made a diamond cross-hatch (worse than the round-8 grit) and was REVERTED;
coherent trains are Phase-2 bedform work. Registered (pre-existing / harder): the
airless midtone/contrast balance (lit regolith washes to a ~233 plateau while
shadows crush), stars burning through foreground terrain (the round adds disc/sun
star-occlusion but terrain occlusion needs depth integration, Phase M), the
Tellus day disc over-exposing against its black-sky surround (camera metering),
and the cliff-bench scenes needing a scarp-facing pose (tuning-loop refinement).

## Build round 10 of ROADMAP_V2 (implemented — July 2026, Opus-driven per the model plan)

**Material texture stacks v2 + Water v2.** As in round 9, recon reframed the
round: **Water v2's core was already built** across rounds 2-3 — a broadband
wind-sea + swell spectrum (`tiles.js`: 16 log-spaced components 240 m→0.8 m with
seeded direction/phase/frequency decorrelation, a swell family at the long end),
LEAN-style moment folding of sub-pixel wave slope into glint roughness
(`OCEAN_FRAG foldVar`), per-pixel bathymetry from the field atlas, and the
shoreline soft-blend that already replaced the discard edge. So round 10 landed
what was genuinely open on both fronts.

- **Material texture stacks v2** (`matstack.js` NEW, `assets.mjs`, `tiles.js`,
  `shaders.js`, recipes). CONCEPT §7 names "per-material detail texture … hashed
  anti-tiling" as one amplification class; round 6 replaced the value-noise
  speckle with an in-shader procedural composite, and this is the next step: a
  small library of TILEABLE per-material detail stacks, baked once by a
  deterministic seeded pass that **rides round 7's asset step** (`shared/matstack`
  in the manifest, hashed for reproducibility; the runtime regenerates the same
  bytes, so the .bin is only a cache). Four archetypes cover the classes the
  recipe references — **regolith fines** (fine grit + sparse micro-pits),
  **cracked basalt** (thin anastomosing fracture network), **duricrust**
  (polygonal desiccation crust) and **firn** (granular sintered ice) — each texel
  packing, CO-REGISTERED so the look reads as one substance (L3 rule (a)): R
  albedo detail, G relief detail, B roughness, A cavity/AO. `TERRAIN_FRAG` samples
  the atlas with a §7 CONTINUOUS hash-rotation + offset (a smooth low-frequency
  rotation field, not a per-cell discrete one — the latter seams at cell edges)
  so the ~cm atlas has no lattice repeat to lock onto; the fetch is mipmapped, so
  hardware trilinear IS the §7 mean-and-variance-preserving sub-pixel fold. The
  stack drives three things: the micro-relief (into the existing `bumpNormal`
  path — deriving the normal from the mipped height folds cleaner than sampling a
  normal map, whose vectors do not average to the coarse normal), the
  co-registered albedo (crevices read darker — substance, not speckle), and a
  **spatially-varying roughness** feeding the previously-scalar GGX spec. Recipe
  data picks the per-body archetypes + scale + amplitude (Tellus soil/basalt,
  Rubra dust/duricrust, Luna regolith/breccia).
- **The two-fade discipline** (the airless lesson, applied by construction and
  then hardened by the panel). A bumped normal DIFFERENTIATES the texture, so the
  relief→normal term aliases at grazing long before the albedo does — exactly the
  round-9 airless-carpet mechanism. So the relief uses a TIGHTER footprint fade
  (`matN`) than the albedo/roughness (`matA`), AND on **airless** bodies the whole
  stack is gated hard down (`matN ×0.15`, `matA ×0.4`, fine-grain zeroed) — its
  substance there is marginal (regolith fines are near-flat) and the harsh
  unfilled sun binarizes any micro-detail into a pepper carpet. Instrumented
  A/B confirmed the residual Luna grazing carpet is the SAME pre-existing
  meso-facet self-shadow (round-9-registered, Phase-M round 11): the mode-2 normal
  map of the near-field floor is smooth (the stack no longer contributes) and the
  dark-spike density is back to the round-9 level (0.32% vs 0.34%).
- **Water v2 remainder** (`OCEAN_FRAG`, `tiles.js`, recipe `water` block). Three
  genuinely-open items landed on top of the pre-built spectrum. (1) **Cox-Munk
  glitter**: the smooth glint lobe is the sub-pixel MEAN of the facet field; near
  the camera the facets RESOLVE into discrete sun flashes. A sparse high-frequency
  facet field jitters the mirror test and sharpens it, and the whole term folds
  out (`resFine`) to the smooth lobe at range — so the airbrushed-column defect
  (registered) becomes a broken glitter path up close while the orbit glint stays
  its seamless §12 tail (the panel confirmed the airbrushed column is GONE). (2)
  **Depth-and-slope-driven surf**: two extra bathymetry taps give the seabed
  gradient, so breakers key on where the bottom SHOALS steeply, not a fixed
  distance ring; the static shoal-surf persists to distance (real whitecaps read
  from far off) while only the MOVING swell-crest modulation folds out to avoid
  sub-pixel twinkle. (3) **Sediment plumes**: a look over the [global] flow channel
  — turbid soil-tinted discharge where a river meets shallow sea. The spectrum's
  dominant azimuth reads the recipe's `water.windDeg`, and (post-panel) the swell
  arrives as 2-3 crossing trains from different bearings — a single near-parallel
  swell family read as brushed-metal corduroy in perspective.
- **Two new water bench scenes** (`scenes.json`, found with new `find-ocean` /
  `find-beach` height-query helpers): **ocean-sunset-glint** (eye-level open ocean,
  low sun — the glitter path + broadband swell) and **coast-archipelago** (a broken
  coast with shallows/depth colour). The registry had no scene that framed
  eye-level water (beach-eye and coast-400km are dune/land poses).

**The round-10 critique panel** (18 agents, finders Opus / skeptics Sonnet per
rule 1; 5 confirmed + 2 softer — full dispositions in `bench/critique-round10.md`)
again caught two real REGRESSIONS the driver's probes had waved through, both
fixed in the post-panel batch and verified: (1) **pavement-walk-rubra duricrust
read as plastic plates** — replacing the f2/f3 crease with the fast-folding stack
lost the intra-plate grain (edge-energy −33% vs baseline); a light f3-band grain
was added back, gated to filled bodies. (2) **pavement-walk-luna material relief
added a comb+pepper to the airless floor** — resolved by the airless stack gate
above (dark-spike density back to the round-9 level, normal-map-confirmed). (3)
**coast-archipelago combed-corduroy sea** — the crossing-swell-trains fix cut its
grad-kurtosis 191→93 while the eye-level glint scene stayed excellent. Registered
(pre-existing / minor): the crater-rim-walk grazing meso hash band (round-11), the
orbital-ocean quad-grid lattice (one skeptic refuted it as sub-visible dither),
and faint horizon-line AA. Verified: all 6 Node suites green, `npm run assets:check`
reproduces all 12 artifacts incl. the new `shared/matstack` (deterministic); the
final 63-scene sweep clean (0 page errors), control-tier gate clean (material
detail added no exposure/brightness shift: dmean ~0 across all controls). Baseline
re-promoted (tag `round-10`).


## Build round 11 of ROADMAP_V2 (implemented — July 2026, Fable-driven per the model plan)

**Phase M core.** Recon reframed the round (the rounds-9/10 pattern): the
screen-space-error split metric (TAU_AMP/TAU_TEXEL/ARC_FLOOR) and the binary
per-instance rock footprint fold already shipped in earlier rounds — what was
genuinely open was every place TWO representations meet: the per-tile-scalar
geomorph (the registered notch), the draw-best-available content swap, the
scatter membership boundary + ground double-count, the static-only three-band
request scheme, the thrice-misattributed grazing meso-facet carpet, and stars
compositing with no terrain test. Round 11 unified them around two ideas: ONE
error currency for the scheduler, and §7 variance-preserving folds at every
hand-off.

- **Per-vertex geomorph** (`TERRAIN_VERT`, CDLOD-style). Morph is now a PURE
  function of the vertex's own camera distance and one per-tile constant
  (uMorphAmp = relief·2^(−0.8·l)/TAU_AMP): band-l content ramps in over
  d ∈ [S(l−1), S(l)], where S(l) is the pure amplitude split distance. The
  invariant chain is DERIVED from the split metric: the amp term carries no
  view discount and kSil ≥ 1 only ever splits EARLIER, so every point of a
  displayed level-l tile lies at d ≥ S(l) — a fine tile's edge shared with a
  coarser neighbour therefore sits at morph 0 = its parent's exact surface
  (bakecore's heightBase is the pure parent upsample), and same-level
  neighbours share the pure function. The per-tile-scalar failure mode
  (register row: "a scalar cannot satisfy both sides when adjacent scores
  differ" — every re-anchor moved the step) is structurally impossible. New
  bands arrive at TAU_AMP px = sub-visible by construction (§4 "blend in";
  §1 sanctions geomorphing by name). Normals do not morph (matches the old
  scalar's endpoint behaviour; a shading-notch residue would be the queued
  follow-up — none surfaced in probes).
- **Stream-in crossfade** (tiles + ocean + debris). Draw-best-available used
  to swap a parent for a fresh child the frame its bake landed. Now the child
  stipples IN while its direct parent is co-drawn stippling OUT per child
  quadrant — complementary partition on a screen-anchored interleaved-
  gradient hash: exactly one of the pair owns each pixel, so no double-draw,
  no z-fight, no alpha sort (a world-anchored hash cannot guarantee the
  partition: parent and child carry different 4096 m snap origins). Fade
  clocks are WALL TIME (0.28 s tiles / 0.2 s rocks), not frames: a
  frame-count fade is arbitrary across hardware, and on SwiftShader it
  smeared stipple churn across fourteen motion-bench capture pairs —
  orbit-pan pop_p99 went 4× WORSE before the clock was fixed (0.0194 →
  0.0785 → 0.0182 final, slightly better than the round-10 baseline).
  Settled stills stay deterministic: a mid-dissolve tile counts as unsettled
  (stats.fading gates __shot). Debris batches dissolve in on build arrival,
  and a child's rock set swaps seamlessly against its parent's (identical
  lattice placement, §7) instead of blinking.
- **Honest per-frame request budget + preemptive rebalancing** — the landmine
  den: NINE instrumented probes, FIVE root-caused failures (several of them
  round-5 lessons rediscovered, then DERIVED from one currency instead of
  hard-coded as bands):
  1. *NaN-comparator deadlock.* "Nothing shown" was an Infinity sentinel;
     Infinity−Infinity = NaN and a NaN comparator is garbage order — 384
     arbitrary requests/frame pinned the 800-tile headroom before the camera
     pyramid streamed (display froze at L1-5, pending 0). Fix: a finite
     root-level error estimate keeps every priority on one real scale.
  2. *Blind-window stampede.* An open-loop burst committed the whole headroom
     to blind guesses in two frames (the nearest chains ate 280 slots of
     L18/19; mid-field coverage starved; the deep pyramid sat baked-but-
     covered). Fix: CLOSED-LOOP commitment — outstanding requests cap at 128,
     so each bake wave re-ranks errors before the next wave commits. The
     worker is serial; deep queues buy no latency anyway.
  3. *Covering-rule nonlinearity.* One missing FAR path under the camera's L2
     ancestor forces that L2 to display and cover the entire baked near
     pyramid (beach-eye settled as an empty smooth dune with 289 deep tiles
     baked-but-covered — Tellus' ocean+land desired set exposed what Luna
     squeaked past). A missing tile's true cost is the error the DISPLAY
     suffers: it now inherits the covering tile's SSE evaluated at the
     covering tile's nearest covered leaf, and equal-error ties order
     COARSE-FIRST (a cover releases cheapest breadth-first; a nearest-first
     tiebreak here reproduced the round-5 "collapse to one face root"
     verbatim before it was caught). Coverage-first, the unlock chain, and
     radial degradation all fall out of the one currency; the display
     self-balances toward the uniform-screen-space-error equilibrium the SSE
     metric defines.
  4. *Warm-cache freeze (panel-caught: beach-eye went bald in the sequential
     sweep).* After a same-body pose change the ENTIRE cache sits on the new
     pose's desired-path lineages (the poses share the region) — binary
     warmth protected every inherited tile, cold = 0, room = 0, display
     frozen at the inherited allocation. Fresh-cache probes structurally
     cannot see this; the panel's sequential-sweep stills did. Fix:
     VALUE-RANKED preemptive rebalancing in the same error currency —
     covered non-displayed tiles at 0.1× their covering zone's suffered
     error, displayed EARLIER-EPOCH tiles at their one-level-fallback error
     (disposal deferred one frame: the zone falls back to its cached
     ancestor, never a hole), the current epoch's display + all ancestor
     chains untouchable, trades only strictly UP by a 4× margin (a
     decreasing display-error potential — no cycles).
  5. *Seed-corn churn + the epoch clock.* Reclaiming freshly-baked covered
     tiles (mid-unlock, waiting on siblings) rebaked them forever — the
     ocean-fixed motion path went 2.4× on flicker, perpetually unsettled.
     The junk/fresh discriminator is the POSE EPOCH (bumped when the camera
     leaves its neighbourhood), not frame age (120 frames ≈ an entire bench
     sequence on software GL) — and the neighbourhood scale must be the
     SMALLER of then/now altitudes (an epoch-start orbital altitude set an
     80,000 km bar nothing crossed). Plus an absolute suffering floor
     (topErr > 3): rebalancing is for a hurting display, not for shaving
     epsilon off a settled one.
  End state, verified on both failure modes: the sweep-sequence beach-eye
  reaches the L19 equilibrium (532 displayed tiles, settle 80 s, preemption
  idle at topErr 9), ocean-fixed flicker 0.000991 vs baseline 0.001008.
  Cost: update EMA 1.3 ms orbit / ~5 ms descent-streaming (the 4 ms budget
  row is exceeded while heavily streaming — report-only until the round-15
  WebGPU numbers make the gate bite). The fixed scheduler exposed that the
  round-10 BASELINE stills carry display-starvation artifacts:
  pavement-walk-luna's right quarter is a blown-white coarse-tile WALL,
  coast-archipelago's islands are missing entirely (open sea), and
  crater-rim-walk's mid-field carries a washed stipple band — all now render
  resolved. Their baseline deltas are fixes, not regressions
  (panel-confirmed under a provenance brief).
- **Scatter hand-down completed** (closes the render-bubble row; the
  decal-rocks row's conservation half). The hard 800 m visibility radius is
  DELETED; the build gate is footprint-derived (largest clast still above
  fold at the tile's distance), which trails the per-instance fold by
  construction — nothing visible is ever culled, so there is no edge to see,
  at any FOV (fold and split share the pixAng currency). The honest display
  then exposed the honest cost: instances went 16.8k → 191k at the luna walk
  pose (the old allocation had starved the L15/16 mid-field rings rock-free).
  Levers, all in the same currency: per-level build floors = the fold size at
  each level's nearest possible display distance (the SAME invariant the
  morph rests on: floor(l) = floor15·2^(−0.8Δl) — a clast below it can never
  resolve while that tile displays, so building it is waste); size-sorted
  instance buffers with per-frame draw-range culling (im.count — an
  InstancedMesh vertex-shades every submitted instance whether or not the
  fold degenerates it, and that vertex work was the measured software-GL
  cost); fold τ 1.8 → 2.2 px. The τ rise is paid for by the new
  CONSERVATION term: TERRAIN_FRAG scales the rockDensity-driven detail by
  (1 − 0.6·share), share = the closed-form projected-area fraction of the
  clast population (s(u) = m + a·u³) above the per-pixel resolve threshold
  s* = max(2.4·fw, tile floor) — instances and ground texture now TRADE the
  budget instead of double-counting (§7: distance chooses representation,
  never doubles it). Residue registered: on Luna the texel-governed L15
  display band ends ≈ 950 m while 2 m boulders stay 2–6 px out to ~1.9 km —
  L14 instancing would cost 262k-cell scans and hundreds of draws for a
  population whose honest representation at that footprint is an IMPOSTOR:
  routed to round 14's mesh→impostor→roughness ladder.
- **Filtered-normal folding** (`aNormS` + σ shoulder) — the TRUE-cause fix
  for the grazing meso-facet carpet (three misattributed fixes across rounds
  6-9; the round-9 mode diagnostics pinned it on the direct term's hard mu0
  over the ~4 m CPU meso relief). Mechanism, §7 variance-preserving (the
  water LEAN fold's terrain edition): buildTile bakes a SMOOTH normal twin
  from undisplaced positions (oct-encoded Int16, 18 KB/tile); the vertex
  folds the mesh normal toward it as the meso wavelength's PROJECTED
  footprint collapses (distance and grazing-view compression both shrink it);
  the folded share's slope variance re-enters the BRDF as a Gaussian
  shoulder on the direct term — mu0_eff = σ·h(mu0/σ), h(x) =
  (x + √(x²+0.637))/2, the analytic E[max(µ,0)] over the sub-footprint facet
  distribution (exact max(µ0,0) as σ→0) — plus a Toksvig widening of the
  spec lobe. σ is sized from the exact mesoDisp amplitudes (scattercore
  twin) × the tile's onset ramp. Near-field facets stay honestly bimodal
  (vFold→0); the register's Apollo-bimodality row stays registered, not
  silently "fixed". Instrumented A/B (same-probe stash comparison):
  pavement-walk-luna dark-spike 6.96 → 4.78 %, grad-kurt 33.8 → 21.5;
  boulder-macro-luna spike 9.39 → 4.47 %, kurt 68.3 → 17.9; the beach-eye
  checker WALL along the dune line is gone (its kurt now measures the new
  honest distant clast field, not the stipple); two-body gate held —
  boulder-macro-rubra 19.5 → 17.1, pavement-walk-rubra 15.3 → 16.8 (flat,
  no wash).
- **Star occlusion by terrain** (register row: stars burned through
  luna-knife-edge's boulders). rtScene now carries a DepthTexture; STAR_VERT
  taps it once at the star's own projected pixel (sky and stars write no
  depth, so any solid geometry reads < 1 and kills the star — vertex-level,
  like the datum test: a point source winks at a silhouette). Works under
  MSAA (r160 resolves the multisampled depth — verified no-GL-error on the
  non-FAST build) and per-viewport (inset safe). luna-knife-edge grad-kurt
  1026 → 178: the star PSFs printed on terrain were most of the frame's
  gradient spikes.

**The round-11 critique panel** (27 agents, finders Opus / skeptics Sonnet per
rule 1; 8 confirmed + 1 softer — full dispositions in
`bench/critique-round11.md`) caught the ONE regression the driver's probes
structurally could not see: the warm-cache display freeze only manifests in
the SEQUENTIAL sweep the panel's stills come from (fresh-cache probes of the
same pose reached L19). Fixed in-round (the rebalancing story above) and
verified on the exact reproduction path. Everything else confirmed was
pre-existing-and-registered (the cross-face terminator seam, the NEAR-field
hex-facet lattice where the fold correctly declines to act, the joint sparkle
web) or a metering consequence of honestly-richer displays (the 8 rotating
controls all gate dmean ≈ 0.000). Panel-confirmed wins: the baseline's
starvation artifacts resolved, the star-burn gone, and the lenses hunting the
round's own mechanisms (notch, stipple residue, scatter edge) came back
empty.

**Verified:** 6 Node suites green; `assets:check` reproduces all 12 artifacts;
motion bench A/B — orbit-pan pop_p99 0.0194 → ~0.02 (flat; the wall-clock-fade
fix recovered an interim 4× stipple regression), descent 0.852 flat
(scene-change-dominated per the bench's honesty note), ocean-fixed
flicker_energy 0.000991 vs baseline 0.001008 (better); the instrument battery
above; MSAA smoke clean; final 63-scene sweep 0 page errors, control gate
clean (dmean/dslope/dshadow ≈ 0 on all 8 date-rotated controls). Baseline
re-promoted (tag `round-11`).

## Build round 12 — Phase 2 oriented structure (Fable-driven per the model plan)

The round the "geo realism" core turns on: terrain stops being isotropic noise
and starts being *caused*. Everything below ships as engine mechanisms with
recipe agents — no Mars constants in code, every mechanism judged on two
bodies with different agents (the standing anti-overfit gate).

### Recon reframe

The degree-1..3 cascade top (dichotomy + swell axes) already existed (round
4), the zonal wind prior already existed *inside* the moisture pass (round 3,
with "no terrain deflection" registered), and the atlas manifest was built
for exactly this extension. The genuinely open work was: promoting wind to a
first-class [global] output, the stress LAW and its anisotropic stamps, the
bedform pattern law, winner-take-all site selection, and the consequence-
chain albedo — plus every place they must agree with the halo/LOD contract.

### Adversarial design review (before any code)

A three-lens Opus panel attacked the design doc against the repo and caught,
pre-implementation: **the oriented-stamp phase `s = R·(dir·ê)/λ` with a
per-cell-tangentialized axis is identically zero** (ê ⊥ dir by construction —
the round-9 diamond-cross-hatch trap re-derived; every dune, ridge and graben
would have baked to silent nothing while every determinism test passed);
procAge's accretive-max was not LOD-consistent (monotone accumulation over
level-drifting inputs → albedo that darkens as you zoom — §5 violation);
procAge missed the level-2 disc bake (§11 disagreement); the ∇mare stress
stencil overread its halo; the edifice dome clamp as written was a no-op on
the squared term (the raw quartic RISES past Re — under the whole-raster
giant scan it would have dominated global relief); the worker cache was
headed past its documented allocation-failure ceiling; and the "moisture
stays bit-identical" claim was structurally false — edifices/rift sit in the
global grid's process PREFIX, so flow routes around the shields and the rift
floor (below drainLevel) becomes an outlet. That last one was reclassified
from bug to feature: drainage responding to a Tharsis is the architecture
working. All fixed on paper; the round then built the corrected design.

### The context fields (atlas layers L5/L6)

- **wind** (`windX/Y/Z`, body-fixed CARTESIAN — an (east,north) encoding
  inherits the tangent-pole frame flip at |lat|≈82°, where Tellus's ice
  sheets live): the moisture pass's zonal profile verbatim (trades /
  westerlies / polar easterlies + meridional mixing), promoted to a
  first-class output of the [global] grid, with **terrain deflection**
  (`w ← w − kDef·∇h_range`, the registered round-3 residue) and a magnitude
  cap. Luna has no global entry ⇒ all wind channels are structurally zero ⇒
  every aeolian consumer is inert — the negative control is architecture,
  not tuning.
- **windExpo**: signed windward(+)/lee(−) exposure — the directional slope
  of the RANGE-scale surface along the wind, saturating at a recipe
  reference. Two instrumented lessons live here: (1) exposure from the raw
  local grid is fbm-noise-dominated and saturates into ±1 texel mottle (the
  moisture pass's calibration lesson, re-learned: it printed a reticulate
  MAZE on the disc through the albedo consumers — mode-diagnosed via a
  field-roughness transect after two wrong hypotheses, then fixed at the
  true cause); (2) the wind rasters carry a 2×2-mean MIP pyramid and
  `procGlobal` samples them FOOTPRINT-MATCHED (texel radius picks the mip,
  lerped) — a rough field point-sampled into 275 km texels aliases AND
  makes appearance level-dependent, violating §5/§7 at once.
- **stress**: the dominant signed principal value (+extension /
  −compression) of a closed-form two-source tangent-plane tensor (§ below).
  Magnitude+sign only — orientation is π-periodic; stamps re-derive it,
  the shader uses the closed-form prior.
- **youth** (the CONCEPT §4 age context, zero-default = ancient): an
  OVERWRITE-per-level context (procContext pattern) re-derived each level
  from closed forms — the edifice-site helper, the rift-frame helper,
  kMare·mare, fixed-frequency regional noise. Never accretive-max (the
  design review's LOD-consistency finding).

### The stress law — two sources, one eigen-rule (`procTect`)

A thin shell over an uplifting SWELL: hoop extension on the dome (radial
grabens; the rift), radial compression at the flexural periphery (concentric
wrinkle ridges). MASCON BASIN loads — re-derived from EXACTLY the heavy-tail
basin lattice `stampCraters` draws (shared `forEachBasin`, same seeds, same
SFD): interior compression (concentric ridges), margin extension (arcuate
rilles) — Serenitatis-textbook, fully closed-form, no field reads, no halo
caveat anywhere. Features form ⊥ their driving eigendirection via a 2×2
tangent-tensor eigendecomposition per anchor. **Two-body gate**: Rubra runs
the swell agent, Luna the basin agent (kSw=0 — highlands far from every
basin bake byte-identical with the process removed, tested). Node suite
verifies the SIGNS and AXES: swell-flank extension eigendir tangential
(graben runs radial ✓ Tharsis), basin-margin extension eigendir radial
(rille runs concentric ✓).

### Anchored wave packets — the oriented-pattern primitive

Stamps are Gabor-style packets on the body-fixed 3D lattice (the crater
discipline): each anchor freezes its axis (the stress eigendirection, or the
[global] wind sampled AT the anchor — planet-wide and available OUTSIDE the
tile raster, which no baked field is), and stamps a windowed plane wave in
**anchor-relative coordinates with a per-anchor hash phase**. Two hard-won
invariants: (1) the phase must be anchor-relative — an absolute-position
projection is hypersensitive (R/λ ≈ 1e4 turns a 0.006° axis difference into
a full cycle), so packets never cohere and the partition blend averages
random phases (instrumented: ×0.42 amplitude residual; the fix more than
doubled dune field energy); (2) a packet extends only as far as its frozen
wind agrees with the LOCAL wind (alignment-weighted envelope) — where
deflection turns the field, near-orthogonal packets otherwise superpose into
right-angle PLAID (probe finding; real dunes realign, they don't
interfere). Defects and en-echelon segmentation land at packet boundaries —
which is where the real features keep theirs.

### Coherent bedforms (`procBedforms`)

Dune SYSTEMS per band (λ = lamK·cell, amp = aspect·λ, two-level §4 onset):
slip-face asymmetry via u^(1+slipK) phase warp (the sign rides the true wind
VECTOR), crest segmentation, defect warp. Amplitude gates on the sand supply
— catena `fines` plus a REGIONAL erg term (lee-lowland accumulation,
instrumented finding: catena fines are hollow-confined; ergs need a
province-scale supply, and the roadmap's own "dunes live where sand CAN
accumulate" is the law) — wind magnitude, windward-scour suppression, and an
optional dryness gate. **Two-body gate**: Rubra sand seas (fines agent,
located by supply×wind — the first probe site sat on the zonal node at
lat −30 and proved wind matters) vs Tellus polar MEGADUNES on the ice sheet
(ice agent, Antarctic-class subtle banding) + desert dunes where dry.
G4 eye-level ripples now orient by the baked wind vector (atlas), so the
sub-raster octave nests under the baked dunes coherently; windless Luna:
zero channels, ripples already off (`ripK 0`).

### Winner-take-all singularity (`procEdifice`, `procRift`)

Exactly 24 points of a seed-rotated Fibonacci spiral, weighted swell^1.5 ×
hash, greedy min-separation in weight order, keep volN: a Tharsis-class trio
EMERGES on Rubra (with the two-pole degree-2 symmetry giving a second
cluster), one glaciated hotspot highland on Tellus (its equatorial
Kilimanjaro-class summit ice emerges from the climate context). Shield =
clamped quartic dome + caldera pit; writes uplift (strata/thermal react) and
youth. The RIFT: an 8-candidate winner-take-all azimuth off the swell pole —
it emerged RADIAL FROM THE FLANK OF EDIFICE #1 (Valles-from-Tharsis
adjacency from pure statistics); trough = tapered arc with flat floor,
en-echelon side troughs, uplifted shoulders, and a **band-limited wall
ladder** (levels [2,4]): a single level-2 stamp put the 20 km wall inside
one cell and the cubic upsample smeared it into a 9° sag — each level now
re-stamps the profile difference toward the true 28%-halfW wall (crater-
onset logic applied to a profile), converging to ~21° walls that the
strata stressK coupling then terraces. `height`/`depth` params are
deliberately NOT `amp`: tiles.js derives the planet-wide split-metric
relief from max(p.amp) and must not rescale to one mountain.

### Consequence-chain albedo

`scour = f(windExpo₊)·(0.3+0.7·youth)` darkens wind-scoured young basalt
(Syrtis-class provinces emerge where the dichotomy lowlands, the young-mare
youth term and the windExpo field coincide); `mantle = f(−windExpo) +
f(altitude)` brightens sheltered lee and edifice-class heights (Tharsis/
Arabia dust). Both recipe-gated (Luna: zero, doubly inert), both mirrored
EXACTLY in `bakeDiscMap` so the §11 disc hand-down agrees — including
procAge's [2,19] band so the level-2 disc carries the same youth the ground
shows (design-review finding). G1 joint orientation gains the closed-form
swell prior, blended by baked |stress| (register row closed; orientation
enters plates() through the continuous METRIC — snap-safe per the round-8
law).

### Recipe/climate fixes surfaced by the probes

Rubra lapse 4.5→2.2 K/km (thin-air value; the Earth-like lapse iced every
edifice summit into blown-white blobs) and iceTemp −75→−80 (the lat-30
edifice's latitude term kept a bright cap; now faint frost). Wrinkle-ridge
amplitudes to real-Moon scale (230 m Luna / 210 m Rubra — 130 m read as
timid at display scale). Worker `cacheMax` 400→300 (six new Float32 fields
= +142 KB/worker-tile; the old 500×486 KB configuration was a documented
allocation failure).

### Scenes

`rubra-disk` (icon — the disc has a face), `rubra-dune-sea` (icon, eye-level
crest trains), `rubra-rift-oblique`, `luna-wrinkle-mare`, `tellus-megadunes`
(breakpoints), all POSED AT THE EMERGENT LOCATIONS (read off the build by
locator scripts — supply×wind argmax for the erg, the shared rift frame for
the canyon; never authored). `rubra-canyon-dawn` reposed onto the real rift
(its round-4 note — "no canyon yet, becomes real with Ph2 singularity" —
is discharged); `dune-field-edge` reposed to the erg margin.

### Verification

7 Node suites green — bake; contract (275 checks: every new process and
field picked up automatically per prefix per body); global (+ wind
determinism, cap, expo range, cube-edge continuity, flow bit-identity under
the wind-config toggle); the NEW tect suite (33 oriented-structure mechanism
checks: WTA count/separation/determinism, the eigen-rule's SIGNS and AXES on
both agents, rift bounds/taper/silence, edifice print ≈ H, youth marking,
Luna-highlands byte-identity with tect removed, bedform print + supply-gate
byte-identity + dry-gate byte-identity); reload; strata; rock — plus
assets:check (12 artifacts reproduce; disc maps re-baked, level-2 content
changed). Probes: 6 iterations, 0 page errors throughout; the instrument
battery caught and root-caused: the wind-node erg placement, the Gabor phase
decorrelation (×0.42 amplitude), the plaid interference, the windExpo fbm
saturation (the disc maze — after two wrong hypotheses, settled by a
field-roughness transect), the rift-wall Nyquist smear, and the summit-ice
climate response. Motion A/B (same-machine): descent 0.852 and orbit-pan
0.0211 pop_p99 BIT-FLAT vs round 11 — the geomorph/scheduler absorbed four
new terrain bands without a tremor; ocean-fixed 0.2605/0.001029 within
content response (Tellus coastlines legitimately moved); update EMA
3.6-4.3 ms vs the 4 ms row (the two new atlas layers; SwiftShader-only,
report-only). Full sweep: 68 stills (51 scenes + ladders + 8 controls),
0 page errors; control gate CLEAN — all 8 date-matched controls dmean 0.000
against a SAME-DAY re-rendered round-11 baseline (git-stash A/B; the
control set is date-seeded, so like-for-like requires it). Panel: 31
agents, 0 errors — 3 confirmed (all pre-existing families or the round-11
scheduler's over-budget-pose class), 4 softer (data tunes), 6 refuted; the
HIGH "dunes on windless Luna" attack on the negative control was refuted
code-level AND pixel-level; both skeptics independently traced the
luna-wrinkle-mare "scratches" to the round-4 crater-ray system (correct
stratigraphy). No round-12 code defect survived the panel. See
bench/critique-round12.md.

### Registered (rule 3 → round 14 — DISCHARGED/RE-REGISTERED by round 14, see its section)

R4 mare-frame joint orientation on Luna (a §5-safe body-fixed frame needs
field gradients or per-basin uniforms — screen-space dFdx would be
view-dependent — more than a residue tune); R6 flooded-basin ridge gate
(instrumented: Luna's stress-source basins and its provinces-maria are
DISTINCT populations — mare≡0 across the largest ridge-bearing basin — so a
mare-keyed gate has no co-located features; unifying the populations is
structural); Luna mare-flow strata-in-plan (a gentle tonal band compounded
the pre-existing joint-lattice grazing moiré on the smooth maria); the
joint/shadow-map grazing moiré AA (un-masked by the correct resurfacing
smoothing of the maria); blue-marble whole-disc biome legibility (an ACES/
exposure-vs-land-albedo calibration crushes land to near-white); a
footprint fade on the biome/wetness texel differentiation at extreme
near-field grazing (salt-and-pepper relocated); ridge legibility (a
lighting/contrast tune); R5 spatial water.windDeg fetch field; polar-cap
margin lace; the single-page sweep's occasional under-settled capture (a
bench-harness flake — an isolated re-render is clean).

## Build round 13 — Phase 2 mechanical residue (Opus-driven)

Exec row 13: Whittaker biomes v2, seasonal volatiles / transient-albedo
overlay, strata-in-plan (G2), space weathering from `age`, inverted relief,
wetness modifier — "config/formula work over fields that exist by round 12" —
plus the round-12 rule-3 residue queue.

**The reframe (recon).** None of the six items needed a new atlas field. The
climate/context fields (`moist`, `youth`, `stress`, `windX/Y/Z/windExpo`,
`fresh`, `mare`) all exist by round 12, so round 13 is overwhelmingly
in-shader looks over them + one bake-time height process. Both L6 spares stay
free (no new layer, no worker-cache hit) — the "mechanical residue" character
the exec row promised. The single enabling primitive is a GLSL `noise3`/`fbm3`
that matches mathx bit-for-bit: the shader `vhash(ivec3,int)` IS `mathx.hashi`
(identical constants + avalanche + /2^32), so a `noise3` that calls it on the
UN-wrapped sign-correct lattice reproduces `mathx.noise3` (integer hash exact;
f32 trilerp negligible at the low fold frequencies). That unlocks the in-shader
strata fold (registers to the baked ledges) and the Whittaker temperature
wobble (agrees with procContext).

**Pre-code adversarial design review (round-8/11/12 discipline).** Before a
line of code: 3 Opus lenses (invariants/bit-match, silent-killer, anti-overfit)
attacked the design doc against the repo, Sonnet skeptics verified — 21 raw
findings. It caught the round's SILENT KILLER on paper, the ê⊥dir class again:
space weathering keyed on `youth` is degenerate on Luna, where `youth` is
written ONLY by `kMare*mare` (Luna has no edifice/rift process), so it is 0
across the highlands AND at every fresh crater — the "airless maturity + young-
crater contrast" would bake to a constant while every determinism test passed.
Fixed pre-code (D0): maturity keys on the `fresh` field (the real immaturity/
ray signal) x slope (steep faces stay fresh — the real spatial variance). Eight
MITIGATE findings, all applied before build: the companion-disc cap must use
the OTHER body's OWN-frame declination `dot(uBodyR1[i],uBodySun[i])` not
`uBodySun.y` (D1); the strata tone needs a footprint gate so it never colours a
coarse LOD where the ledge relief is not yet baked (D2); the resurfacing crater
gate must fade per OUTPUT cell (halo-valid), never at the crater ANCHOR (which
seams past the halo, D3); inverted relief must select a MID flow band excluding
the incised thalweg or it cancels incision (D4); the strata fold params must be
recipe uniforms not GLSL literals (§6, D8); the negative controls must be
byte-identical via zeroed recipe scalars, not a "the signal is zero" claim
(D5/D6/D9). The review's value repeated exactly: a determinism-green flat-bake
caught on paper.

### What shipped

- **Whittaker biomes v2** (shaders.js). The 2-green veg mix becomes a biome-
  CLASS pick from temperature x moisture with wide ecotones: temperature sets
  the green SHADE (cold taiga `uBiomeCold` -> temperate `uColVeg`/`uColVegVar`
  -> warm deep-green tropics), and ARIDITY (low `moist`) desaturates toward the
  dry-steppe/savanna TAN `uBiomeWarm` — the key correction the first two probes
  forced: hot+WET must stay lush green, only hot+DRY goes tan (my first pass let
  `warmW` force tan regardless of moisture; the tan-tropics bug). The dry axis
  is calibrated to Tellus's COMPRESSED moisture scale (wet≈0.31, dry<0.12 —
  measured), `dry = 1 - smoothstep(0.12,0.30,moist)`. Temperature is recomputed
  in-shader from procContext's exact closed form (`up.y`=sin lat, `vHeight`, the
  `noise3(up*3,seed)` wobble) — colour-only and LOD-free (§5), so the bands
  agree with the baked snow line. Mirrored in bakeDiscMap for the companion
  disc. Two-body: Tellus (full Whittaker) + Rubra/Luna byte-identical control
  (veg=0 masks the classifier — scored as a control per D5, not a helped body).

- **Seasonal volatile cap** (the top whole-disc cue). A render-time overlay =
  pure fn(latitude, closed-form subsolar declination). The driver `sSun =
  uSunDir.y` is PROVABLY spin-invariant: `sunDirBF = rotY(-spin)·rotX(-tilt)·
  sunDirI` and rotY never touches the y-component ⇒ `sunDirBF.y = -sin(tilt)·
  sin(theta_orbit)` = pure seasonal declination, no diurnal term (the review
  confirmed the ground path sound; REFUTED as a defect). `seasonalFrost(sinLat,
  sSun, fp)` returns a cap that advances equatorward in winter
  (`winter = -sinLat·sSun > 0` in the pole tilted from the sun) and retreats in
  summer, gated off the permanent ice (`x(1-F.g)`, no double-bright). ONE COMMON
  helper is shared by the ground (TERRAIN_FRAG, `uSunDir.y`) and the companion
  disc (SKY_FRAG, the own-frame declination `dot(uBodyR1[i],uBodySun[i])`) so
  §11 holds by construction. Because the same-body whole disc is terrain tiles
  (not the static disc texture), the headline whole-disc cap is TERRAIN_FRAG at
  every zoom. Rubra CO2 (latOn 38°, seasonK 0.45 — dramatic), Tellus H2O snow,
  Luna none (uFrostK=0 control). Probe: the cap advances/retreats with the
  season slider on both bodies.

- **G2 strata-in-plan** (shaders.js). The procStrata fold is recomputed
  in-shader (`g = foldAmp·fbm3(dir·foldF, seed+500)`, matching the bake), and
  `albedo` is modulated by a per-BED tone bucketed on `(vHeight-g)/bedT0` — the
  fold-frame elevation band, which IS stratigraphy in plan view. Gated by slope
  (bands read on beveled walls, not flat treads), the SAME recipe gate field the
  bake uses (`uplift`/`mare` via `uStrataGate`), a footprint gate (D2: fades in
  only where the ledge relief is baked), and `uStrataK`; the fold params ride
  `uStrataFold` from the recipe (§6). No new baked field, LOD-free. Probe: on a
  Rubra uplift-0.20 scarp the beds read as curved tonal layers along the
  contours. Ships on RUBRA only this round; Luna mare-flow benches are
  registered forward — the panel found a gentle Luna-mare strata tonal band
  compounded the pre-existing joint-lattice grazing moiré on the smooth maria.

- **Space weathering from age** (shaders.js). `immature = max(fresh, slopeK·
  smoothstep(slope))`; mature gardened flats tint toward `uWeatherTint` (dark/
  red) while fresh crater rays + steep faces stay bright — keyed on `fresh`+
  slope (D0), not the degenerate youth — and fresh sand FILL (bright fines in
  joints/hollows are a young deposit, not gardened: the panel caught the Luna
  pavement's bright crack network muting when maturity darkened the fill;
  excluding it restored the organic pavement). ~Mean-neutral so no disc mirror
  needed. Luna agent (weatherK 0.2); Tellus/Rubra weatherK=0 controls (whole
  block gated ⇒ byte-identical off).

- **Inverted relief** (`procInvert`, bakecore.js — the one new bake process).
  Ancient dry indurated paleochannels resist the band-limited deflation that
  lowers the softer plains, standing UP as sinuous ridges (Aeolis/Medusae). It
  is an ADDITIVE, position-pure raise of the resistant network (equivalent to
  deflating the plains, but full-raster legal — reads only position-pure
  flow/moist/youth + local height, no neighbour read, LOD-consistent). The
  selector is a MID flow band `smoothstep(fLo,fMid,flow)·(1-smoothstep(fMid,
  fHi,flow))` (D4: excludes the peak-incised thalweg so it does not cancel
  incision) x dry (`1-moist`; Rubra moist≡0) x old (`1-youth`). Placed after
  incision at levels [5,7] with the §4 two-level onset; Rubra only, byte-
  identical where the gate closes. Prints ~203 m ridges on the ancient highland
  drainage (test-verified additive-dominant, only bounded catmull-rom flank
  undershoot).

- **Wetness** (shaders.js). `wet = smoothstep(moist)` (+ the Tellus shoreline
  band folded in, D9 — not a second multiplier) darkens the ground and adds a
  soil specular lobe + lower roughness (glossy when wet). Tellus water agent
  (`uWetDark`/`uWetGloss`); dry bodies byte-identical (moist=0 AND uWetDark=0).

- **Rule-3 residue.** *Deflected-wind moisture* (R1, globalgrid.js): the
  moisture advection wind now bends around range-scale relief — the same
  operator `buildWindField` uses, reused on buildMoisture's own `hsPad`, capped
  — so orographic rain shadows wrap around the edifice/ranges instead of
  straight zonal bands (instrumented: moves the Tellus field maxΔ 0.39,
  deterministic; the moisture pass no longer runs the raw prior). *Resurfacing-
  age crater SFD* (R3/D3, bakecore.js): the accept decision stays a pure fn of
  (anchor,seed); each small crater's stamped depth/ejecta/ray EXPRESSION is
  faded per OUTPUT cell by the local `mare` (halo-valid; basins exempt), so
  maria carry subdued/erased small craters — byte-identical off-mare. *Crater-
  scale lee streaks* (R2): a finer wind-vector consumer than the province-scale
  scour — 1D across-wind albedo lineations combed along the [global] wind, lobe-
  weighted and footprint-faded.

- **Registered forward** (investigated with instrumentation, not forced):
  *R6 flooded-basin ridge gate* — a probe found Luna's stress-source basins
  (the crater `basinTail` population) and its provinces-maria are DISTINCT
  populations: `mare` is identically 0 across the largest ridge-bearing basin,
  so a mare-keyed ridge boost/suppression has no co-located features to act on.
  Unifying the two populations is structural (round 14), not a residue tune;
  Luna's tect stays byte-identical to round 12. *R4 mare-frame joints* — a
  §5-safe body-fixed orientation needs field gradients or per-basin uniforms
  (screen-space dFdx would make joint orientation view-dependent), round 14.
  Also registered: ridge legibility (a lighting/contrast tune, not amplitude),
  R5 spatial water.windDeg (ocean-shader-heavy), polar-cap-margin lace.

### Verification

Eight Node suites green: the generalized contract harness auto-covered the new
`invert` process (halo == neighbour, cross-face < 1 mm, finite, deterministic
on every body/prefix) and the deflected-moisture global pass (mass balance +
determinism); the NEW `test:climate` suite pins the three bake-side mechanisms
the harness can't see — inverted relief prints (Δ203 m) + is additive-dominant
+ byte-identical where the gate closes; resurfacing subdues maria crater relief
(Δ30.6 m) yet is byte-identical off the maria (mare=0 highlands); deflected-
wind moisture moves the field (maxΔ 0.39) and rebuilds bit-identically.
`assets:check` reproduces all 12 artifacts (disc re-baked for the Whittaker
mirror). Probes: 0 page errors across every look; the Whittaker green/tan
gradient reads after two dry-threshold calibrations to the measured Tellus
moisture scale; the seasonal cap advances/retreats with season on Tellus and
Rubra; strata beds read on the uplifted scarps. Motion A/B BIT-FLAT (descent pop
0.852→0.8525, orbit-pan 0.0211→0.021, ocean flicker 0.001003→0.001005 — the new
inverted-relief geometry + every shader look add zero LOD pop). Final sweep 68
stills, 0 page errors; control gate CLEAN (all 8 controls dmean ≈ 0.000 vs a
same-day git-stash-A/B round-12 baseline; the dkurt/dslope deltas are the world
responding to biomes/strata/resurfacing/invert, not exposure drift).

**The critique panel** (12 agents, Opus finders / Sonnet skeptics; 6 raw) — the
two RISKIEST new mechanisms cleared with ZERO findings (the seasonal-cap §11
disc/ground agreement AND the inverted-relief incision-fight). The HIGH
"boulders vanished on Rubra" attack was REFUTED as a one-off bad capture (the
68-shot single-page sweep leaks state; the isolated re-render is boulder-
complete, scattercore.js byte-identical to round 12). The one confirmed
regression — Luna's pavement reading as a joint grid — was fixed in-round:
space weathering was maturity-darkening the bright fresh sand-fill (dmean +0.042
→ −0.002 after excluding `fill` + softening weatherK); the residual grid is the
PRE-EXISTING joint-lattice grazing moiré, merely un-masked by round-13's correct
resurfacing smoothing of the maria (registered, round-14 joint/shadow AA), and
Luna strata-in-plan was set off to stop compounding it. blue-marble Whittaker
illegibility is a PRE-EXISTING disc-exposure crush (byte-adjacent to round 12 —
the biome mix reads at eye level). No round-13 code defect survived. See
bench/critique-round13.md. Baseline re-promoted (tag `round-13`).

## Build round 18 — Phase 5 cryo pack + Phase 6 giants/rings (the closeout)

The final ROADMAP_V2 build round. Two pillars — a banded gas giant + ring system
(Phase 6) and a cryo process pack on two icy worlds (Phase 5) — both well-specified
Opus work, delivered under the same recon → design → pre-code panel → build →
first-light → post-implementation panel → sweep discipline.

### The frame-tree adjudication (the round's flow-map moment)

The design proposed inclining Titan into Saturn's equatorial (ring) plane via a
gated `orbit.incl` datum on the shared `bodyCenterInertial`, to force the rings
edge-on (physically Titan sits in the ring plane). A pre-code driver experiment
(`bench/_r18_adjudicate.mjs`) **overturned it**: the coplanar tree already sweeps
the Titan→Saturn ring opening **0.00°→26.70°** over Titan's own 15.9-day orbit
(Titan is tidally locked, so Saturn stays framed while `season` sets the aspect +
lighting). So the ring aspect is a *posing* choice, not a frame-tree change. This
was decisive on three axes: (a) it drops the `frames.js` change entirely (no touch
to the hot orbit function called 2048× in `solvePhase`); (b) posing a few degrees
open keeps `ĉ·n̂ = sin(opening) ≠ 0`, so the ring ray-plane math is never at the
0/0 singularity that had scoped a Fable escalation — the ring becomes ordinary
Opus analytic geometry; (c) it made `saturn-disc`'s open-ring shot satisfiable
(inclination would have pinned Titan in-plane forever). The ring **shadow band**
across Saturn's disc — set by Saturn's own sub-solar latitude (~−20.7° from its
`phase0`, independent of the Titan scene's season) — is the money element at
near-edge-on; a razor-thin ring line does not carry the shot, the shadow does.

### Giant + ring rendering (Phase 6) — live in the §11 companion disc

Saturn appears from Titan as a §11 companion disc. Because differential rotation,
the storm oval, and the polar hexagon are closed-form functions of time (§9), the
disc cannot be a static baked atlas — so the giant look is **synthesized live** in
SKY_FRAG's per-companion loop, as **runtime per-slot gates** (`uBodyGiant[i]`,
`uBodyRing[i]`, default 0). This is *not* a compile define: the sky is one shared
program looping ≤4 companions, so you cannot branch at compile time on *which*
companion you're drawing. Default-0 gates keep every legacy companion disc
byte-identical (`mix(a,b,0)=a`), exactly the `uBodyCloudN`/`uBodyFrostK` idiom.

- **Bands**: ≤8 sin-lat knots blended by a fixed-unrolled smoothstep weight (no
  dynamic uniform-array index — the SwiftShader constraint), explicit squares
  (never `pow(nB.y,2)`). `discAlbedo` is defined as the cos-lat integral of the
  blended `bandCol(lat)` — which for a sphere equals the uniform-in-sin-lat mean —
  so the §11 disc→point fold is exact (pinned by `test:ring`); Saturn's
  `palette.dust` mirrors it (the manifest-pinned `bakeDiscMap` disc is unused for
  the giant slot but stays consistent in luminance).
- **Differential rotation / storm / hexagon**: each longitudinal feature sits at
  its fixed latitude and drifts at a *rigid* rate `Ω(lat_f) = deepRate + diffRate·
  sin²(lat_f)`, its longitude reduced to one revolution in CPU double
  (`frac(Ω·t/rev)·2π`) and uploaded as a scalar — never a per-pixel `sin²lat·
  tPhase` shear (which cannot roll over seamlessly at any period: the pre-code §9
  finding). The shader wraps the storm/hexagon longitude delta to `(−π,π]` so the
  oval never tears at the ±π meridian.
- **Limb darkening**: a strong deck-like emission-angle falloff `mix(1, pow(max(
  muv,1e-4), limbExp), limbK)` on the giant slot (`limbExp>0` asserted; `max(·,
  1e-4)` guards the SwiftShader `pow(0,·)` NaN).

The **ring** is an analytic annulus, all geometry in **units of the body distance
D factored out** (`rvec = τ·rd − ĉ`, all O(1) — never a 1e9 m coordinate through
f32, the §9 precision law; the eclipse slot guards the same class). The ring-plane
normal in our frame is `uBodyR1[i]` — the *row* of the our→target rotation M
(target +Y expressed in our frame), **not** `(uBodyR0.y, uBodyR1.y, uBodyR2.y)`
which is the y-*column* (our +Y in the target frame, a mirror-flipped plane; three
pre-code lenses caught this independently). Ring radii (inner/outer/gaps) are
uploaded as angular values `R·mult/dist` in double. The radial opacity is the base
optical depth times ≤4 unrolled gap notches (Cassini, Encke); an edge-on
path-length term thickens grazing rays; forward-scatter is an HG lobe on the
sun-through-ring alignment (`dot(rd, uBodySun[i])→1`, the backlit flare). Front/
back occlusion compares `τ·D` to the sphere near-surface depth `cosβ − √(angR²−
sin²β)` (no raw target R — `uPlanetR` is the rendered body Titan). **Mutual
shadows** are local disc-side code in the target frame in units of R (`sunTransmit`
is sphere-only and frame-local to the *rendered* body, so it cannot serve the
Saturn-disc-from-Titan): the planet's shadow on the ring is a parallel-ray cylinder
test; the ring's shadow on the disc casts the disc point toward the sun onto the
ring plane and attenuates `kd` by the ring opacity there, with a hard boolean gate
+ an `sT.y` floor so Saturn equinox (rings edge-on to the sun ⇒ no shadow)
degrades cleanly without NaN.

### Cryo pack (Phase 5) — six position-pure closed-form process families

New `PROCESSES` entries are byte-identical for every legacy body automatically: the
per-tile loop only dispatches a type a body *lists*. All six are **position-pure
closed-form stamps** (existence a Worley/fbm function of the body-fixed direction —
level-stable and cross-face seam-free by construction; the pre-code onset-gate-not-
level-stable finding: never gate a feature's existence on a bilinear-inherited
field — fields only modulate the *expression* per output cell, the crater `mare`
discipline).

- **procLineae** (Europa tidal double ridges): age-rotated families of concentric
  arcuate ridges — small circles about NSR poles, orientation from the polar angle
  `acos(d̂·p̂)` directly, so the R/λ precision cliff and the `ê⊥dir` degeneracy that
  plague a tangent-projected phase simply cannot occur. The ridge *height* blends
  in over two levels at `ridgeLevel` (the procTect onset — no double-count); the
  bright fracture *albedo* (`lineaAlb`) is a **level-independent overwrite every
  level** so it arrives WHOLE and never rides the height onset (the pre-code
  albedo-onset KILLER: albedo must arrive whole, the crater-`fresh` discipline).
- **procChaos** (Europa block terrain): position-pure jostled ice rafts on the
  body-fixed lattice within a closed-form fbm chaos-margin — a raised/dropped/
  tilted platelet per Worley cell, NOT a stateful diffusion (which would fight the
  1-cell/iter halo budget). Two-level height onset.
- **procGlacier** (Pluto's Sputnik Planitia): an AUTHORED closed-form basin — not
  a regional-low flood, one known 1000-km feature. The bright N2 ICE is
  re-asserted into the EXISTING `ice` field EVERY level (a level-stable arc mask),
  so `procContext`'s per-level ice overwrite cannot erase it; the basin floor is
  flattened ONCE at `levels[0]` (the procProvinces pattern — the 5×5 regional
  kernel is pure there, upsample carries it, no double-flatten). Riding the `ice`
  field for the glacier is what lets the two ATLAS L6 spares be two **unsigned**
  albedo channels (`lineaAlb`, `tholinAlb`) instead of one signed provenance
  channel — so the pre-code signed-cryoProv zero-crossing seam never exists.
- **procPolygons** (Pluto): ONE parameterized Voronoi family — `convection` cells
  (domed interiors, Sputnik) or `contraction` cracks (the network edges incise),
  gated by the `ice` field as expression modulation. Two-level onset.
- **procSublimation** (Pluto): penitente blades + pits, oriented on a recipe-
  declared mean-insolation axis (the bake is sun-independent §5, time is closed-
  form §9 — orientation is a datum, never the live sun).
- **procTholin** (Pluto's Cthulhu Macula): a dark body-fixed longitude province
  (latitude-only `seasonalCap` cannot express a longitude band), a level-
  independent `tholinAlb` overwrite mirrored in `bakeDiscMap` **after** the ice
  lerp (else the ice≈1 lerp on a cold cryo body erases it — the pre-code disc-
  order finding).

Europa and Pluto are **sphere bodies** (near-spherical in reality; the sphere path
is byte-clean and keeps the circular `limbProfile`), `parent:'star'` with a fake
heliocentric orbit (the surface physics is the deliverable) and each body's REAL
synchronous spin (Europa 3.55 d — decoupled from the placeholder orbit; the
pre-code europa-spin finding). Appended after arrokoth so no legacy atlas row
shifts; their angular radii stay below every control's 4th companion slot at all
epochs (a 1.63× margin on Rubra — so the new `r18-companion-shift` eviction
tripwire in `run.mjs` is genuinely load-bearing, unlike r17's dead tripwire, and
stays silent as the closed-form check predicts).

### Byte-identity and scope law

The two new FIELDS (`lineaAlb`, `tholinAlb`) fill the two ATLAS L6 spares; the
worker packs by `ATLAS.length` (unchanged at 7), legacy bodies never write them
(`floatToHalf(+0)=0x0000` = the old null-pad), and the TERRAIN cryo mix reads
`F6.zw` which is exactly 0.0 for legacy ⇒ `mix(albedo,·,0)=albedo` byte-identical.
The worker `cacheMax` stays 300 (+46 KB/tile ⇒ ~202 MB, ~40 MB below the known
failure point — an interim drop to 280 starved the ancestor-chain memoization on
tile-streaming descents and pushed their settle past the per-scene budget).
`assertGiantRecipe`/`assertRingRecipe`
+ `assertGiantSystem` (>1 giant / >4 gaps / |fscatterG|≥1 / limbExp≤0 throw by
name; wired into `switchBody` and the bench render check — M5 no silent caps);
`assertPaletteRecipe` extended to require `palette.linea`/`palette.tholin` when
their consumer is present (the saturn-palette-crash class).

## Build round 17 — Phase 5 figure generality (Fable-driven)

**CONCEPT §11, now code:** "the recipe declares the reference shape the
rasters displace; the sphere is merely the common case." One law everywhere:

- `figure.js` (pure, worker+main+tests): `q(d̂)` = the unique S=0 crossing
  along the body-fixed ray (fixed-count bisection + 2 Newton polish — a pure
  function of d̂, so overlapping cells of neighbouring tiles/faces/halos stay
  bit-identical, and `normalize(q)=d̂` keeps every dir↔cell inversion a
  bijection); `m̂ = ∇S(q)`; `p = q + (h+meso)·m̂`; `up = ∇S(p)`;
  `alt = figAlt = S/|∇S|` (first-order TRUE even where the neck compresses
  |∇S| to ~0.5). S is a first-order distance (F/|∇F| per ellipsoid, smin'd
  for lobes; neckK = the fillet radius, recipe data).
- Figure classes: `{type:'ellipsoid', axes:[a,b,c]}` and `{type:'lobes',
  lobes:[{c,axes}×2], neckK}` + a REQUIRED `reliefBudget` (metres). The
  engine implements the families; recipes supply parameters (§6).
- Asserts, all LOUD and load-time/preflight (a worker throw is a silent
  settle-stall — the worker now ships a typed `bakeerror` the main thread
  throws): star-shape (origin inside + single-crossing sweep), injectivity
  (curvature bound from the normal-turn rate + other-sheet march on figAlt;
  budget·2 ≤ bound), per-tile halo physical-reach (`haloReachM` → cells),
  scope law (`assertFigureRecipe`: airless/dry, process whitelist, two-lobe
  GLSL cap, rocks/formations/emission rejected by name).
- Per-cell metric tensor: lu/lv from central differences of the pos array
  (face-consistent by construction — derived from shared 3-D points, never
  face-local axes). Consumers: thermal (EDGE-SHARED pair talus preserves
  mass conservation), materials/AO/catena FD, horizon steps, crater
  footprints (|pos−qc| 3-D metres), lattice bboxes.
- `craters.basins` (authored): a discrete basin datum with a t=0 CENTRAL
  peak (the stochastic `opts.basin` peak term is a RING and its placement a
  lattice draw — Rheasilvia is a fact of Vesta, not a probability).
- Render: FIG_MODE is a compile-time define per body (materials rebuild at
  switchBody; the sky program swaps too). Geomorph morphs along the baked
  m̂ via the oct-encoded `aFigN` attribute (the morph axis MUST equal the
  bake anchor or T-junctions crack). visit(): inscribed-radius horizon cull
  (a bounding-sphere occluder is ANTI-conservative), per-node hull-radius
  arc scale, figAlt epoch scale. sunTransmit: mode-1 exact scaled-space
  closest approach; mode-2 8-tap min-S march from t0 past the local surface
  → mutual lobe shadowing from the one §10 slot. Stars/SKY occlude by
  inscribed figures (uStarOccR — the mean-R sphere pokes out of a neck).
  Meso keys on physical cell size for figure bodies (mesoDispRamped).
- The driver's adjudication experiment (see bench/critique-round17.md): the
  design's original far-start Newton flow map TEARS (34% scrambled
  Jacobians; residual 0 — the failure is landing-point jitter, not
  convergence, which is why both panel skeptics half-missed it). The
  ray-crossing map: negDet 0, multiCross 0/3000; the invalid barely-touch
  config fails 3000/3000 — the fixture's negative test.
- test/figure-test.mjs (31): the irregular-domain seam fixture + the battery.
- Legacy byte-identity: every fig branch is recipe-gated; assets:check legacy
  entries byte-identical; blue-marble/loworbit-sunset renders byte-identical
  (FIG_MODE 0 emits the legacy expressions; mix(a,b,0)=a for discHaze;
  uStarOccR uploads exactly uPlanetR·0.9995 on legacy bodies).

## Build round 16 — Phase 4 content + Phase 3 recipes (Opus-driven)

Exec row 16: aurora, lightning, global dust storms, polar hoods;
Titan + Venus recipes (data) with band-annotated bench scenes — "stamps and config on the
round-15 stack; recipes are data by design (§6)." Plus the round-14/15 rule-3 residue.

The round split into three data workstreams and two small, data-driven engine
GENERALISATIONS (never per-body hacks). The one thing the "pure recipe data" framing
hid — surfaced by recon before a line was written — was that the demo's atlases were
sized for exactly the 3-body system.

### The hidden change: engine capacity (workstream D)

The literal `4` was a hardcoded body-ROW cap across ~9 sites (disc atlas rows, cloud
layers, `row<4` gates, the shader `*0.25` row fraction), indexed by ABSOLUTE
SYSTEM.bodies position — so Titan(3)/Venus(4)/Saturn(5) would overflow into a
ClampToEdge smear of Luna's disc. Fixed by deriving `NB = SYSTEM.bodies.length` and, on
the pre-code panel's finding, CONVERTING the disc atlas from a stacked 2-D DataTexture
to a DataArrayTexture (one layer per body) exactly like the round-15 cloud atlas — array
mips are per-layer by spec, so a minified companion disc can never bleed one body's
albedo into another's row (the stacked texture did, at mip 7-8). The co-visible SLOT cap
stays 4, now fed by a PROXIMITY SORT (`others.sort` by angular radius desc) before the
slice, so the nearest/biggest companions always win — with 6 bodies the naive array-order
slice would have silently dropped whichever body was last in recipe order, which for
Titan looking at Saturn (by far the biggest disc, ~5.5°) is exactly the one that must
survive. A load-time `assertPaletteRecipe` turns two latent bakeDiscMap TypeErrors
(missing palette.dust/rock; sea without ocean colours; vegCold without a context process)
into named errors. Anti-overfit held: the 3 legacy bodies bake BYTE-IDENTICAL
(assets:check 13/13) and their discs render unchanged.

### Emission pack (workstream A) — §8 "the recipe may add emission"

Placement law (recon + pre-code panel): a SKY_FRAG post-term is depth-occluded by
terrain over the night disc from orbit; airglow survives only because it lives INSIDE
scatterInline (which terrain re-runs as aerial perspective). So the aurora MOVED into
scatterInline — but three killers landed on paper first and shaped the shipped form:
(1) placed in the UNCONDITIONAL outer scope, not the `uHasAtm && _t1>_t0` branch, or the
orbital limb arc (above uAtmTop) would vanish; (2) accumulated in a SEPARATE `emis`
out-param, never `inscat`, so it can't feed the star contrast gate (`_skyL=max(inscat)`)
and black out every star across the 6°-wide oval; (3) occluded PER-CROSSING by the
`_dkMid` ordering test, not the background `_dkTr` fold, so a deck BEHIND the aurora from
orbit doesn't darken it. The star splice passes 5 args, so NO emission code is generated
in the star vertex shader at all. First-light witnessed the payoff: the dual-band oval
(OI green lower / OI red upper) reads over the terrain-covered night disc from 11,000 km,
not just above the limb. Curtain drift + substorm pulse are CPU-double phase uniforms
that wrap at the vnoise period (never the uTimeS sawtooth — panel wrap-seam).

Lightning is one post-loop add at the near deck: a `vhash(cell × CPU-computed time
bucket)` fires a fraction of convective cells, spiking `exp(-frac·6)` and gated on local
coverage — deterministic, machine-identical, drowned by day.

### Weather config (workstream B) — §8 "coverage is a field, volume is a look"

Global dust storm and polar hood are ONE gated additive term each into covAt's `raw`,
default-no-op via the `?? 0` idiom (Tellus / Luna / Rubra's cirrus deck bake
byte-identical). Both key CLOSED-FORM on orbital season — a wrapped-gaussian
`stormEnvelope` on the orbital PHASE ANGLE (circular orbit has no perihelion distance
cue, §10) for the storm, and the seasonalFrost SHAPE (winter = −sinLat·sinDecl) for the
hood. The KILLER the pre-code panel caught: the season scalar must be evaluated
SEPARATELY for keyframe k and k+1 inside makeCloudKeyframes (unlike the k-independent
moisture sampler, which is legitimately shared) — a single shared scalar shifts the k+1
slice and breaks rollover byte-continuity; the shipped code computes `s0=seasonAt(k)`,
`s1=seasonAt(k+1)` and a node probe pins maxDiff 0 across 524k texels on the storm's
rising edge. Rubra gained a 2nd dust-storm deck (cov0 −0.3 + a seasonal DC lift → EXACTLY
clear off-season, a near-total butterscotch pall in-season that casts the ground shadow
through the same cloud-shadow slot) and a winter-pole cirrus hood (|lat|>64°, outside
F1's mid-lat variance band by construction). The season enters the worker via a
`seasonSamplerFor` built only when a deck declares the mode (else null → byte-identical).
The F1 variance-ratio test now SKIPS near-uniform decks (std<0.02) — covering both the
storm deck and Venus's permanent overcast — with correctness pinned instead by an
envelope on/off + rollover test (test:cloud, +7 asserts → 43).

### Recipes as data (workstream C) — reference-grounded

Titan, Venus, Saturn ship as pure §6 recipe data on the existing engine. Titan: a thick
ORGANIC HAZE atmosphere where the orange emerges from the COEFFICIENTS (betaA blue ≫ red
— tholin eats blue; betaM high, haze-dominated; betaR ~0), a LONGITUDINAL (seif)
equatorial dune belt via the new bedforms `axis`+`latBelt` knobs (crests parallel to the
wind, |lat|<30, dark tholin sand from the palette), a methane sea via seaLevel + a dark
palette + `water.calm` (a near-still low-glint surface), and rounded ice cobbles
(Huygens). Venus: the near-total sulfuric deck IS a round-15 deck (an elevated 48-70 km
slab, cov0 0.95) reading pale-yellow from space, while the shadowless sub-cloud ORANGE is
the blue-AND-green-weighted CO2 Rayleigh over the deep column — TWO looks from ONE
integral, exactly §8. Its 50×-Earth refractivity is kept monotone by the round-16
saturated Bennett term. Saturn is a minimal pale-gold §11 disc so it hangs in Titan's sky
(the banded giant + rings are Phase 6 / round 18). Titan's nested frame (Titan → Saturn →
star) just works (arbitrary-depth recursion). First-light calibration drove the Titan
haze (brighter orange-scattering, negligible gas Rayleigh) and the Venus sub-cloud
reddening; Venus-from-space and the surface twilight, the Rubra dust storm, and the aurora
over the night disc all landed.

### The two data-driven engine knobs (§6 generalisations, not hacks)

`bedforms axis: 'longitudinal'` projects the Gabor phase on the CROSS-wind tangent with a
symmetric profile — slipK is overridden at its single BINDING so profMean and prof stay
consistent by construction (desync-proof; a node probe pins mean(prof−profMean)=1.6e-7),
and phA=0 + a flattened along-crest segment noise keep the ridges CONTINUOUS (the panel
proved random phA chops longitudinal dunes into barchan-dashes; on-axis phase now matches
at anchors 5λ apart). `bedforms latBelt` and `water.calm` are opt-in, default-no-op
scalars. All three are byte-identical for the existing transverse/full-chop bodies
(assets:check confirms).

### Verified / honest scope

Node suites all green (test:cloud 43, +7 round-16 asserts; assets:check 13/13 legacy
byte-identical, the 3 new bodies deterministic and added to the manifest); the emission
pack + engine capacity compile/boot/settle on the 6-body system with 0 GLSL errors;
first-light captures confirm the deliverables. Honest scope / registered refinements:
Titan-from-orbit reads as a dark disc with an orange haze LIMB (the haze in-scatter is too
dim at 9.58 AU to fill the disc face — real Titan needs near-IR/RADAR from orbit;
titan-orbit is a non-gated breakpoint); titan-saturnrise proves Saturn hangs pale-gold in
the sky but `lookAt:saturn` framed it above the dune belt (pose refinement); the
venus-deck-breakout ceiling is orange twilight without a distinct overcast lid. Rings are
Phase 6 (round 18). See bench/critique-round16.md for both panels.

## Build round 15 — Phase 4 clouds core + the WebGPU checkpoint (Fable-driven)

Exec row 15: coverage `[time-field]`, the raymarch ↔ shell ↔ orbital ladder,
cloud shadows as coverage along the sun ray, the WebGPU checkpoint decision —
plus the round-14 rule-3 residue queue.

### The reframe

CONCEPT §8 wrote the design years early: **coverage is a field, volume is a
look.** The build found both halves already in the repo. The round-12
[global] grid discipline supplies the coarse planetary raster — shipped as a
512×256 equirect per (body, deck), generated per KEYFRAME in the worker by
DIRECT per-texel evaluation of a closed-form cov(direction, k) (the
discAtlas precedent — no intermediate grid, one source of truth for GPU,
JS twins and tests). Time enters exactly as the ROADMAP's `[time-field]` row
demands: recipe-declared keyframes (k = floor(t/τ)), a fixed deterministic
lerp, and advection as closed-form DRIFTED coordinates — per-deck lon phases
computed in DOUBLE on the CPU each frame (the uWavePhase discipline), never
a float32 time product, never face-local uv. And `sunTransmit` is §10's
occlusion slot in the flesh: ONE cloud-shadow factor (coverage along the sun
ray — never the rendered cloud) multiplies there and reaches terrain, ocean
(which had no other shadow wiring — the anchor board's shadows-on-the-sea
came free), rocks, formations, impostors, every in-scatter step (crepuscular
attenuation), and the STARS, whose vertex splice of the same integral
extinguishes them through night decks (witnessed: 71 vs 159,859 bright px).

### cloudcore.js — the field and its laws

covAt = cov0 + zonalW·zonal(lat) + moistW·(moist(d) − moistMid·prior(lat))
+ fbmW·fbm3(drifted-coords), remapped bimodal (smoothstep(covLo, covHi))
with a HARD CLEAR FLOOR (below covFloor the air is EXACTLY clear — remap
skirts of cov ~0.1 slant-amplify ×2–8 into whole-sky veils, measured at
first light). Three laws are load-bearing and test-pinned:
- **Correlated keyframe evolution** (pre-code panel F1, the killer): k
  enters through a COORDINATE ADVANCE of one continuous field, never a
  reseed — two adjacent keyframes are nearby slices, so the lerp is
  evolution, not a cross-dissolve (the ⊕k version collapses spatial
  variance 0.71× at every mid-frac — "keyframe breathing"). Pinned: the
  mid-frac variance ratio ≥ 0.9 (ships 0.95/0.98/0.97), plus rollover
  byte-continuity ((B,A at k) == (R,G at k+1) exactly — which is also the
  free-run dropout fix: while the next pair generates, the previous pair
  at frac=1 IS the next at frac=0).
- **The one column law** (pre-code F2): the vertical profile h(x)=6x(1−x)
  integrates to EXACTLY 1 with H(x)=x²(3−2x) (=smoothstep) as its
  antiderivative — every rung, the remainder folds, the within-deck
  self-shadow and the ground shadow share it; detailAmp ≤ 1 is a load
  assert (fbm3 ∈ [−1,1] ⇒ detail = 1+amp·fbm is strictly positive and
  EXACTLY mean-1, no clamp rectification).
- **The moisture anomaly** (pre-code F3, amended by measurement): the
  shipped γ=0.007/128-sweep ocean does NOT saturate to the prior (it sits
  near 0.4·prior with real fetch geography), so the term is an anomaly
  about a recipe mid-scale — zero-mean globally (0.002, pinned ±0.08),
  geography-only.

### The deck integrator — one estimator, no rungs to pop

Inside `scatterInline` (no new pass; renderPass/bloom/metering/star-depth
untouched): analytic ray∩shell segments (near crossing + the far limb
re-entry), CLOUD_STEPS taps over the first ≤8 deck-thicknesses, the
remainder and far segment folded as 3-tap coarse marches — every tap at a
footprint-matched LOD from RAY GEOMETRY only (§5/K9: no derivatives, no
altitude; the sun-shadow tap is always LOD 0 so a ground point's shade is
camera-invariant). §7 holds by construction: quadrature and tap LOD are how
the integral is computed; cov·h·detail (each exactly mean-1 where it
claims) is what it converges to. The pre-code panel killed the original
three-rung-blend design's altitude dependence (M1-alt) — the shipped form
retired the class structurally. Volume light: dual-lobe HG (softened
post-panel: the 0.72 forward spike blew the sunward limb) + an MS
quasi-Lambert term 0.22·µ0 (single-scatter HG leaves cloud tops 3–7×
under-lit — clouds are white because of multiple scattering) + skyAmb ×
ambW + uShineRad (moonlit clouds' hook); per-tap sun = sunTransmit ×
cloudShade(exp(−od·det) detail-corrected within the deck — the volume
look's own light; the GROUND shade stays coverage-only per §8's "never the
rendered cloud"). Two look laws landed at first light and were
panel-hardened: EDGE FRACTALIZATION (a near-binary field's boundary is a
78-km texel staircase — re-thresholding with the same detail noise carves
it at cell scale, mean-neutral, the shadow law untouched) and the
OBLIQUITY-TRUE footprint (the post-sweep panel's headline: at grazing
orbital incidence the surface footprint stretches ~4×; the detail octave
sampled sub-Nyquist rendered as per-pixel static — HF probe 8.63 → 1.55
after the fix, clouds-off floor 0.17). Shadows got `cloudFill` — an
energy-bounded overcast downlight ((1−csh)·µ0·0.12 into every material's
ambient): real overcast is gray, not black, because the deck re-emits half
the blocked flux downward. Redistribution, never conjured.

### §11 hand-downs + recipes

The companion disc samples the SAME equirect layers in the target's own
frame at ITS drift phase and keyframe frac, shading the cloud fraction with
the cloud phase (HG+MS) — never the ground's regolith kd; planetshine's
disc albedo folds the LIT-VISIBLE-HEMISPHERE mean of the ALPHA law
(alphaMeanLit — never alpha of the mean coverage: the saturating law
overshoots 2× under Jensen; pinned 0.486 vs 0.494 disc integral). Recipes
(§6): the deck LIST the Phase-3/6 clients need — Tellus broken cumulus +
thin cirrus veil (two decks prove the schema), Rubra ONE sparse high
water-ice cirrus deck (the second agent; dust storms are round-16 content),
Luna no key (structural null). Coverage calibrated in Node (global mean
0.35 → −15% post-panel), all knobs recipe data.

### The WebGPU checkpoint — DECIDED: DEFER

The precondition was PROVEN, not assumed: headless WebGPU renders
deterministically at render tier (WGSL pipeline + readback) on the operative
bench binary — Chrome 149 (the puppeteer-declared 131 cache entry is broken;
149 is what every bench run launches via env override — registered for pin
repair) — on BOTH the RTX 5090 and `--use-webgpu-adapter=swiftshader` (the
old "WebGPU doesn't work under SwiftShader" claim is corrected: wrong flag +
insecure context). The budget table got its reference-hardware rows: the
ENTIRE clouds subsystem costs ≤ 0.4 ms of render on the RTX 5090 (worst pose
7.7 ms vs the 10 ms budget); SwiftShader pays up to +165% on sky-heavy poses
— a bench cost with settle budgets holding. Froxels were not needed (the
core's own evidence); the port cost is the whole raw-GLSL stack + a three
pin bump. DEFERRED with recorded re-open triggers (a hardware render row
biting, a Phase-5/6 froxel/compute need, a forced three bump); the
round-14 decimation vertex-budget rider inherits the deferral.

### Bench honesty — the round's discovery

The panel-demanded Luna PIXEL gate measured what dmean 0.000 always hid:
settled SwiftShader captures are NOT bit-reproducible — same-code
run-vs-run reproduces the same envelope (maxDiff ~215; the AE servo's
±1-LSB exposure quanta scale every pixel). The negative-control gate is now
an ENVELOPE gate (current-vs-baseline ≤ run-vs-run noise — it is), and the
cloud code was exonerated by the same-code A/B, not by assertion. Controls
classify per-POSE by closed-form coverage-in-view (the blanket per-body
exemption was panel-killed); the σ(0) witness renders PIXEL-EXACT clouds-on
vs clouds:false at a located clear pose; the GPU alignment witness reads
mode-8/9 back within 0.0012 of the JS twins (panel F3-bench: never JS-vs-JS
alone). Honest scope, demoted BY MEASUREMENT: eye-level broken sky needs
km-scale cells (a 156-km raster + mean-1 density detail cannot carve them)
and above-deck tops need height modulation — both round-16 content; the two
new cloud scenes ship as breakpoints documenting the core's state, and the
round's cloud icons are blue-marble + loworbit-sunset, the tier the core
owns (the blue marble carries white synoptic systems; the nadir tier reads
as a satellite tile).

### Rule-3 residue

SHIPPED: the formation build-wave prefilter (the closed-form lattice
existence test at enqueue — candidate-free tiles go straight to
built-empty; scheduling only) and the tellus-tor first-light scene (the
located 23 m tor + strata scarp, closing the formation two-body bench gap).
The rest of the round-14 queue rides to round 16 (Opus) unchanged, joined
by the round-15 cloud-content queue (cell erosion with mean compensation,
top-height modulation, the orange horizon band diagnosis, loworbit
forward-scatter exposure + limb shadow texels, the ocean-fixed pose
relocation, the moonlit-cloud night pack, multi-deck content).

### Verified

10 Node suites green (NEW test:cloud, 36 asserts — determinism, rollover
continuity, the variance-ratio law, the column law, fold-vs-march
convergence + the killed single-midpoint divergence, the anomaly laws,
schema, Luna null, drift/wrap/time continuity, the planetshine
calibration); assets:check 14/14; motion — legacy paths BIT-FLAT under
clouds:false (descent 0.8525→0.8525, orbit-pan 0.021→0.021, flicker
0.001085→0.001051; the impostor dollies in their streaming band), content
baselines re-established clouds-on, cloud-drift's flicker under its
pre-registered ceiling (0.00304 ≤ 0.00315, metered; re-baselined at
fixedEV post-panel), cloud-approach 0.733 vs its 0.6784 clouds-off control;
sweeps: 74 shots × 2 (pre/post-panel-fix), 0 page errors, 0 under-settled;
control gate per-pose classified. Panels: bench/critique-round15.md.

## Build round 14 — beyond the heightfield + the representation ladder (Fable-driven)

Exec row 14: formation archetypes (overhangs, arches, outcrops, calved-block
fields), offline displacement-decimated rock sculpts, the
mesh→impostor→roughness ladder — plus the round-13 rule-3 residue queue.

### The reframe

The rock sculpt is a closed form (`shapeFn.radiusAt(direction)`), so every
representation is a sampling strategy of one function: the icosphere LODs
sampled it uniformly (the silhouette residue WAS curvature-blind sampling),
the decimated chain samples it adaptively, the octahedral maps sample its
exact normal, and the impostor samples its hull per-fragment on a quad. §7's
hand-downs hold by construction (§8's law one scale down: "technique
transitions may change how the integral is computed, never what it converges
to"). Three design simplifications retired whole risk classes before code:
the arch is a swept tube with buried footings (closed grid triangulation,
genus 0 — marching cubes deferred with its nondeterminism/manifoldness
risks); the decimator is SUBSET-placement quadric collapse (no vertex ever
moves — every output vertex byte-identical to a source sample, so `aDir`
and the limit-surface maps survive unchanged and the on-surface test is
zero-tolerance); the L14 impostor build resolves existence, clamping, height
and meso through the four L15 CHILDREN (pinned against eviction, panel H1),
making the rung swap positionally BIT-EXACT (panel K5; the mesh-test
partition asserts exact 3D-anchor equality, not (u,v,size) tuples).

### meshcore.js — the deterministic mesh pipeline

`decimateChain` (guarded quadric subset collapse: edge-link condition,
normal-flip rejection, integer-total-order heap — double runs hash equal,
cascaded snapshots so LODs nest), `makeFormationSet` (hoodoo r(y,θ) with
per-bed radius steps; undercut outcrop; swept-tube arch with endDrop-buried
footings; analytic overhang AO from the band-profile horizon scan),
`makeHullMaps` (octahedral normal+radius per variant, baked FROM the
finest-LOD mesh VERTICES in fit space with max-radius splat + hole-fill —
the K1 mitigation: squash, fit and displacement carried by construction, one
code path for rocks and formations). Rocks: subdiv-5 source (20 480 tris,
Uint16-safe) → 5120/320/80 — the same budgets, so the round-11 measured
vertex cost is unchanged; the win is placement (measured 2.8× lower max
support-function error at 320 tris). ~1 s at load; the runtime stays
build-free; assets.mjs pins 14 artifacts (+forms packs, + the M8 symmetry
direction: a manifest entry with no generator now FAILS).

### Formations (ground plan L5) + the ladder

Placement mirrors scattercore verbatim: existence from the lattice hash at
`formations.latticeLevel` (12) thresholded against BAKED fields at the
declared `fieldLevel` (12) — riser-exposure `rock` (procStrata writes it at
cap time — attached to the shipped height by construction; the pre-code K3
killer was gating on a re-derived bed predicate that decorrelates through
octave residency and post-thermal drift) × recipe gate × slope window ×
not-ice; PLUMB orientation (spin only — bedding horizontal, axis frozen at
the anchor). The arch samples BOTH footing grades at the declared level and
rejects over-slope candidates (H2). Calved blocks are rock-archetype
clusters keyed off the formation hash (G3-iv), drawn by the ROCK path.
FORM_FRAG = ROCK lighting (owner-atlas octants, min() shadow map, terrain
BRDF) + baked per-vertex overhang AO gating ambient AND bounce (the
under-arch darkening the tile atlas cannot know — the scene-28 tell) + bed
tone from the SAME strata octave family the bake stamps (T_k =
bedT0·bedLac^k, footprint-adaptive, finest two octaves + one §7 sub-octave —
the K2 killer was keying on bedT0, constant across a 30 m hoodoo; the
country-rock path is untouched byte-for-byte). Two agents (L34): Rubra
strata country (emergent cluster at lat −12.85 lon −76.83: 28–38 m hoodoos/
outcrops shedding 71-block calved fields) + Tellus bedrock outcrops (H4
discharged at a LOCATED 23 m tor, −42.99/15.69); Luna: NO formations block —
honestly registered as "no agent authored" (H3). The impostor rung: L14 band
tiles (and formation-L12 tiles) draw ONE merged instanced quad batch
(per-instance aVar/aHullR), the fragment ray-marches the fit-space hull in
the instance's own ANISOTROPIC frame (M1) and shades with the mesh rung's
mean terms; discard cutout + log-depth (stars occlude); not a caster (the
band is beyond the metre-shadow box, where localShadow ≡ 1 — the omission is
shared with the mesh rung, so the rungs agree). Terrain conservation flips
on for band tiles with that level's floor — the round-11 closed form hands
exactly the impostor share out of the ground detail; no new math. Live:
1,645 impostors drawn at a Rubra band pose; Luna's rung engages
under budget pressure/dpr-2 (the register's own framing of the band).

### The round-13 residue queue

R6 SHIPPED (the structural item): `forEachBasin` gains a per-basin `fill`
LAW — (1−0.7·deg)·sizeW·jitter, the SAME deg-attenuation the stress law
weights mascon loads by, so flooded ⇔ ridge-bearing by construction, no
field reads, no per-basin pins. procProvinces adds a basin-centred flood
term (arc in METRES — the M2 units trap; height-gated so rims stay dry;
the hemispheric noise mask bypassed for the basin term only) behind a
per-body `basinFill` scalar — Luna 1.0; Rubra (which also carries basinTail
+ provinces) structurally OFF, byte-identical (the K4 killer). The round-13
instrument "mare≡0 across the largest ridge-bearing basin" now reads mare
0.29 co-located with that basin's deg-attenuated ridges; the fresh 213 km
basin keeps its strong regional mare (max-composited). Downstream (resurfK
crater fading, youth, strata mare gates, the disc) inherits automatically.
Moiré AA: the joint block's zero-mean carriers fold at a stricter gate
(fJc over [0.3S, 0.9S] — at fw≈S the old gate passed 84% of their amplitude
into the maximum-aliasing band); localShadow fades →1 as the pixel's
map-space footprint exceeds ~1.5–2 texels, handing the mean to the baked
octant field through the existing min() (fwidth behind VERT_STAGE — the
stars vertex shader splices COMMON; rocks inherit the fade by construction).
Biome/wetness magnification fade: the F4.g class remaps widen symmetrically about their centres ONLY under extreme near-field magnification — the panel caught the first gate leaking a mottled wet band onto mid-distance dunes, tightened to texels ≳8× screen-magnified; elsewhere bit-identical (k=1 recovers the exact round-13 edges).
Blue-marble: `meter: 'spot'` (scene data; documented camera-semantics
change; icon re-baselined; controls keep the default meter — M3). Harness:
`__shot` resolves `{settled, ms}`; run.mjs retries an unsettled capture
ONCE on a FRESH page (same-page retries measure cache warmth — M6) then
marks `underSettled`, fails loud; luna controls pre-classified for basin
overlap (closed-form, before the run — M5). A live probe caught the H1
livelock's second half — children arriving at lastUse 0 and evicting before
the band build claimed them — fixed with a derived PARENTHOOD pin in
evict() (no bookkeeping; releases when the parent's build lands); the
formation scene then settles at ~165–295 s where it previously never
settled. Ridge legibility REFUSED (rule 2 — no principled target).

### Verified

9 Node suites green (`test:mesh` new: manifold/χ per LOD, subset
byte-identity, double-run hashes, hull-covers-mesh + slab-anisotropy K1
guard, formation solids + arch meta, the K5 exact-anchor partition;
tect-test +4 R6 rows: co-location, coverage bounds 26.8%, fill-law
range, Rubra control); assets:check 14/14; probes (first light: an overhung
outcrop casting its own shadow, a caprock hoodoo, the calved bench tracing
to its ledge; the Luna "bald plain" A/B'd byte-adjacent to round 13 — the
registered high-sun photometry family, NOT a regression; 508k mesh
instances provably submitted at that pose); motion A/B bit-flat legacy paths (descent 0.8525→0.8525, orbit-pan 0.021→0.021, flicker 0.001005→0.001085) + first-baseline band dollies (Luna 0.7032; Rubra 0.0966 — the rung swap is orbit-pan-class quiet); sweep
69 (+1 first-light R6 witness merged post-panel) stills, 0 errors, 4 recovered by the fresh-page retry; 4 formation-wave under-settles re-rendered SETTLED after the time-boxed drain fix and merged (scheduling-only — content identical) retries
(overhang-gallery is FIRST-LIGHT: no baseline row, no delta line — panel
only); control gate CLEAN (dmean 0.000 on all 8 same-day controls; control-6 = a dark-crescent metering-family wobble on a degenerate denominator, adjudicated quality-neutral). Panel: 22 verified findings — the panel caught what every probe missed: formations floating over refined terrain (TRUE root cause found by live instance-walk + debris bisect: applyCamera never positioned the formation groups — one line; plus two secondary holes: the forms early-hide and the settle-wave drain) and near-black formations (INWARD mesh winding, outward fraction 0.06–0.12 — the orientation test rocks had and formations lacked), both fixed in-round with four batch fixes (slope-aware burial, K2 bed-tone amplitude + brightness trim, the magnification-fade gate tightened off the mid-field, the R6 witness scene added); 1 REFUTED; the decimation interior-detail trade documented; the L14 band residue VERIFIED CLOSED
(bench/critique-round14.md).

### Registered (rule 3 → round 15 — DISPOSED by round 15: the formation build-wave prefilter and the tellus-tor scene SHIPPED; the mechanical remainder rides to round 16, see the round-15 section)

R4 mare-frame joints (R6 built the coherent per-basin data a uBasin[K]
frame hangs off); bake-side formation ground-response (talus/horizon stamp
— pure and possible, a second seam, not forced); the formation far-field
shadow gap (beyond the shadow box the baked horizon field cannot know a
formation); contact-decal under-overhang terrain darkening; SDF+MC genus-1
archetypes; R5 water.windDeg fetch field (recon design banked); polar-cap
margin lace (design banked; §11 disc constraint documented); Luna mare-flow
strata-in-plan (blocked on the moiré AA holding a round); ridge legibility
(pre-registered metric required); the round-8 master-joint octave and
per-plate mean-plane quantization (their "round-14 texture-stack pass"
pointers were STALE — re-registered to a future ground-texture round);
formation build-wave settle cost (~2–3 min added to dense eye-level scenes
— honest but slow; a gate-field prefilter at queue time is the obvious
mechanical win).

## Roadmap (remaining)

**`ROADMAP_V2.md`** carries the full plan and status, now with a per-round
driver-model plan (Fable for the open-ended/landmine-dense rounds, Opus for the
literature-specified and mechanical ones). **Round 7 shipped Phase T tooling**
(hot recipe reload with band-selective invalidation, the completed process
contract harness, `npm run assets` + hashed manifest, photo mode / free-look /
bookmarks, the motion-bench perf gate, `bench/casting.mjs` seed casting) and the
R1 artifact masks. **Round 8 shipped ground plan L1 + ground laws G1/G4/G5**
(cliff-and-bench former, joint tessellation, routed sand, catena — see "Build
round 8"). Still ahead: R1 corpus growth + the full n≥100 fool-rate
gates, the Phase 2 ground
plan's remaining layers (round 5 shipped 4b rock pipeline + clast-continuum
placement; round 6 shipped L2 meso-displacement v1 + L3 material stacks v1
procedural; round 8 shipped L1 + G1 jointing — remaining: generated texture
stacks via imagegen (round 10), G2 strata-in-plan (round 13), the grain-size
continuum below 30 cm, per-population G3 fields) and ground laws G2/G6-en-
hancement/G7, Water v2 spectrum, Titan + Venus (3), clouds (4), cryo worlds
(5), giants (6). Rock residue
(round 6 baked limit-surface normal+cavity maps): true sub-vertex SILHOUETTES
still need displacement-decimated offline meshes or tessellation; material
texture stacks still procedural; scatter hand-down folding (Phase M). Crater residue (round 4 shipped the
overhaul): secondary chains, multi-ring basins beyond the peak/outer-ring
profile, ejecta rays as sub-grid streak geometry, space-weathering age curve
beyond the fresh veneer. Phase 1 residue (after round 9's airless fill + honest
annulus): the MS second installment (grazing aerial-perspective blue fill —
instrumented by `horizon_gap`, lower MS_MU0, ozone above-shell), the airless
meso-facet terminator self-shadow (Phase-M filtered normals, round 11),
terrain-side refraction, spectral band mode (R3). [global] residue:
`basin` field unshipped (no consumer yet), wind has no terrain deflection,
flow is single-level (fine bands sharpen only by sampling — no sub-grid
channel geometry yet). Phase M residue now visible: per-tile scalar geomorph
steps at level boundaries (the round-4 tile-notch row) — wants the
screen-space-error split + CDLOD per-vertex morph.
