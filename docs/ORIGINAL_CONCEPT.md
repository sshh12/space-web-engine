# CONCEPT — baked-tile planet renderer

**The solar system is one pure, deterministic function of (body, body-fixed position, time); the
renderer is just an evaluator of it.** Whatever needs memory of its neighbours — geology — is
baked once, in scale bands that accrete down a quadtree with halos; everything stateless
(micro-detail, scatter, sky, waves) is computed on demand as a pure function of position and
time. Because every pixel derives from that one function, what you see at a point can never
depend on how you're looking at it — which tile, which LOD, which altitude — so seams, popping
and skybox swaps aren't bugs to patch; they're impossible by construction.

## 1. Sphere & LOD: cube-sphere quadtree

Six quadtrees, one per cube face, projected to a sphere. Split a node when the camera is close
relative to the node's size; merge on the way out. Each leaf renders a grid mesh sampled
directly from its tile raster. Neighbouring tiles may differ by one level, so the edge steps at
coarse↔fine boundaries must be masked somehow (skirts, stitching, geomorphing — any works).

**Precision at real scale** (metric doubles inside §9's frame tree): stage vertex positions in
double precision, store them **node-local** (body-fixed minus node centre) in single precision,
draw **camera-relative** with a logarithmic depth buffer whose budget is derived for AU, not
radii. Never let a system-scale coordinate pass through float32. Above its six root tiles the
quadtree continues upward into §11's whole-body ladder.

## 2. Terrain: a baked raster per tile, not a noise function

The core move. Closed-form `height = f(x,y,z)` cannot express stateful, neighbourhood geology
(erosion, deposition, flow). So every quadtree node owns a small fixed-resolution **raster of
surface state** — height plus whatever per-cell fields the processes need (materials, geologic
context, regolith, ice…) — covering its (u,v) box plus an apron, baked as:

```
tile(level n) = upsample(parent tile) + processes that first become resolvable at n
```

Detail **accretes down the tree**: coarse tiles bake continent-scale relief; each deeper tile
inherits everything coarser verbatim and stamps only its own scale band, exactly once. A tile is
a **pure deterministic function of (body, face, uv-box, level)** — every seed routed through the
body id, camera-independent, so it never
goes stale and caches trivially; LOD only chooses which level to draw. The upsample kernel is a
free choice, but it must be the same everywhere: determinism is what every other guarantee
rests on.

## 3. Seams: the ghost-cell halo

Independently baked rasters would crack at tile edges — unless each raster carries a halo apron
of ghost cells filled by the *same* deterministic rules (same parent upsample, same
position-keyed stamps) the neighbouring tile uses for its interior. Then a stateful
neighbourhood op run over interior + halo yields an interior **identical** to a planet-wide
pass, provided `halo ≥ iterations × stencil reach + 1`. Adjacent same-level tiles match exactly;
no stitching, at any depth.

Free bonus: vertex normals are plain finite differences of the raster — the halo supplies the
across-edge neighbours, so normals are seamless too.

## 4. Geology: an ordered pipeline of scale-banded processes

Terrain content is a flat, ordered list of small **process modules** ("builders"), each
declaring the scale band where it acts and the fields it reads and writes. A bake runs them in
dependency order over the tile: base relief fields, then inherited state, then **context**
fields (the geologic "climate": age, latitude, dust, moisture, and orbit-averaged insolation and
temperature from latitude, axial tilt and orbital elements…), then geomorphic processes.
Two execution classes: **position stamps** (pure functions of world position — boundary-safe for
free) and **stateful neighbourhood ops** (iterate the raster; these are what the halo exists
for). Expensive long-range processes run once at coarse levels and are simply *inherited*
downward; a band's onset should blend in rather than switch on. A baked horizon-angle field for
grazing-light self-shadow (§10) is one more field under the same halo rules.

## 5. Every surface field obeys the same rules as height

Materials, context, and any other per-cell state are stored as smooth **distributions** (weights
per cell, not categories), inherited by the same upsample and filled into the same halo — so the
seam guarantee covers them automatically. The one hard rule: **a point's appearance must not
depend on which LOD level renders it** — nor on the altitude or machine doing the rendering. Any
process may write any field, at any level, provided
it follows the same accretion discipline as height (deterministic, halo-consistent, each band
added exactly once). Looks that are purely derived from the surface (e.g. exposed rock on steep
slopes, shoreline and depth colour against §12's level set) can instead be computed at render
time, which is LOD-consistent for free.

## 6. Planet = data recipe, engine = agnostic

Everything planet-specific — radius, relief amplitude, the material and context-field sets, the
ordered process list, low-frequency albedo, sky — is one composition object, and every planet
recipe is a child of one **system recipe**: the star's spectrum and luminosity, the frame tree
of bodies (§9), each body a recipe plus orbital and rotation elements, liquid level set, rings
and belts, base domain (§11). Counts are data — no shader assumes one sun or one moon. The
engine (bake loop, quadtree, geometry, shading) reads only the composition. New planet = new
recipe; new system = new list.

## 7. Micro-detail & scatter: the tile function continued below the raster

**Baking stops where state stops.** Below the deepest tile nothing needs memory of its
neighbours, so the accretion recurrence continues at render time, restricted to position stamps
— pure functions of (body-fixed position, finest baked fields, recipe seed), never of tile
identity, level or the render mesh — so the seam and LOD guarantees hold with no halo and no
cache.
Per-material detail texture, relief octaves (ripples, pitting), hashed anti-tiling and instanced
scatter are all this one class. **Amplification expresses geology, never invents it**: wind
context orients the ripples, crater- and talus-written rock density seeds the scatter, dust
mutes it all — a micro-look the fields cannot drive is a missing field, not a cleverer shader. A
rock is a fact of the planet: hash body-fixed position (§9), threshold against baked density
(read at a declared level where that field is complete), derive size, orientation, burial.
Vegetation is the same client — density, species, size from §4's climate fields; a forest from
orbit is the mean- and variance-preserving aggregate of its trees. **Distance
chooses a band's representation, never its membership**: mesh → impostor → speckle folded into
albedo/roughness, each hand-down mean- and variance-preserving, keyed on screen footprint. One
owner per octave — the recipe assigns every scale band to bake, amplification, texture or
scatter; no detail gap at the raster limit, no band stamped twice. Position keys derive in
double precision in the body-fixed frame (§1, §9), or grain-scale hashes shimmer.

## 8. Atmosphere: one scattering integral, orbit to ground

Twin of §5's rule: **a view's appearance must not depend on the altitude rendering it.** The
limb from orbit, the sky dome from the surface and the haze flattening a distant butte are one
transmittance/in-scatter integral with different ray endpoints (the precomputed-LUT lineage:
Bruneton, Hillaire). No skybox, no space mode, no handoff altitude — descent just moves the
camera through the model. Aerial perspective is that integral applied to terrain, not a fog term
applied to tiles: haze converges to the horizon sky by construction, identical at a world
position whatever the tile level. The sky is also the light — terrain consumes ambient
irradiance from the same integral, so ground and sky cannot disagree. The palette is recipe data
(§6): Rayleigh/Mie/absorption spectra, scale heights, an aerosol riding the geology's own dust
context field. Earth's blue day with warm sunsets and Mars's butterscotch day with blue sunsets
must emerge from the coefficients, not from a painted gradient.

Clouds split like terrain: **coverage is a field, volume is a look.** Coverage/type is a coarse
planetary raster under the same tile machinery, keyed by (face, uv-box, level, time) — time is a
pure input and sun direction derives from it through the ephemeris (§9), never a free parameter;
no stepped weather state, so determinism and caching survive.
Near raymarch, far shell and orbital layer are three renderings of that one field, joined to the
same view-ray integral; cloud shadow evaluates coverage along the sun ray — never the rendered
cloud — so shade on the ground and the shadow fields seen from orbit are one answer, and
attenuating in-scatter by it yields crepuscular rays for free. Technique transitions may change
how the integral is computed, never what it converges to. The light term admits §10's body-list
occlusion and planetshine; the recipe may add emission (aurora, airglow); the output is absolute
radiance — exposure belongs to the camera (§10) — and the integral must be evaluable from
outside, for another body's shading (§11).

## 9. Frames: a position is meaningless without its frame

One shot runs from an AU out to a bootprint, so no single coordinate space can serve. Positions
live in a **frame tree**: system-barycentric inertial at the root, one rotating body-fixed frame
per body, §1's node-local frames beneath. Each frame's origin and orientation is closed-form in
time — Kepler elements; spin = axis, rate, epoch; no integrator, no accumulated dt — so the sun
line, phases and shadows at any moment evaluate alike on any machine, as pure as a tile.
Terrain, tiles, scatter and oceans live body-fixed, where they are static forever; **every
position-keyed function in this document keys on body-fixed position** — hash inertial space and
every rock and ripple crawls across the ground as the planet turns. Transforms compose in double
precision at frame boundaries; float32 exists only frame-local and camera-relative, so §1
survives verbatim, one level down: **never let a system-scale coordinate pass through float32**
— velocity included, which rebases with the origin or everything jitters at 30 km/s. Rebasing is
presentation, never meaning, and atomic across every subsystem: a partial rebase is two frames
pretending to be one, the dual-representation bug this architecture exists to forbid. The star
catalogue alone is fixed in the inertial root — the backdrop everything else visibly moves
against.

## 10. Light: one star, one radiometric budget

**The star is the sole luminous authority, in physical units; nothing is authored bright.**
Spectrum and luminosity are recipe data; per-body irradiance is inverse-square arithmetic —
Mars's dim noon comes free — and the sun's finite disc sets penumbrae, glint and eclipse
geometry. Shadow splits by scale: a **penumbra-aware cone test of the solar disc against the
body list** — analytic, never a planet-scale shadow map — multiplies the §8 integral per sample
in the slot cloud shadow already occupies (precomputed LUTs must admit that factor), so an
eclipse darkens ground, sky and the orbital umbra as one answer; a baked horizon-angle field
(§4) casts mountain-on-mountain shadow at grazing light; shadow maps cover metre-to-kilometre
geometry only. Planetshine is the same machinery backwards: a body's whole-disc radiance — the
value its far point renders with (§11) — lights its neighbours' nights, and a lunar eclipse's
copper is the occluder's own §8 transmittance as the light's spectrum. At the eye, **exposure is
a property of the camera, never of the world**: noon regolith to starlight spans ~13 orders of
magnitude in one descent, so the integral outputs absolute radiance — one auto-exposed EV, one
fixed tone curve, bloom and glare as the camera's point-spread function after exposure. Stars
are catalogue flux, drowned at noon and surfacing through twilight because the arithmetic says
so; a boosted night ambient is the skybox swap returned through the tone mapper, and pure black
is a missing emission term (airglow, zodiacal light), not mood.

## 11. Whole bodies: the representation ladder continued above the quadtree

Every hillside sky holds every other body, and an approach must run from star-point to filled
screen with no swap — there is no scaled-space twin, no separate far scene (the swap pop is the
canonical dual-representation bug). The quadtree already coarsens to six root tiles; the ladder
simply continues: below a few pixels of footprint, an analytic limb-darkened, phase-correct disc
lit through the same §8 integral; below a pixel, a point whose flux is that disc integrated —
Venus over a night-side ridge because the arithmetic says so. **Distance chooses a body's
representation, never its membership** — §7's law at planetary scale, each hand-down mean- and
variance-preserving: disc albedo from the root tiles, point flux from the disc, phase from
sun–body–camera geometry in the frame tree; no per-body light direction exists anywhere. The
atmosphere descends its own ladder in step (full integral → limb LUT → disc tint → point flux),
and sub-pixel emitters splat energy-conservingly — mean-and-variance preservation extended to
the screen sample itself, or the night sky twinkles with fireflies. Rings are an analytic
annulus exchanging shadows with their planet through §10's occlusion; belts are §7 scatter over
an orbital density field — an asteroid is a fact of the system. Irregular bodies (comets,
Phobos-class moons) keep the machinery but swap the base domain: the recipe declares the
reference shape the rasters displace; the sphere is merely the common case.

## 12. Oceans: one wave spectrum, orbit glint to shoreline

From orbit, water reads as water because of glint — a specular ellipse at the mirror point,
stops brighter than land, its width set by wave-slope variance; a Lambertian blue never reads.
**Liquid is a level set in the recipe** — an equipotential radius per body (tides, if kept, a
pure-in-time perturbation of it). Bathymetry is simply the raster below sea level — same tiles,
same halo — and shoreline, depth colour, breakers and wet sand are render-time looks derived
from height against the level set (§5's derived class, LOD-consistent for free), never painted
masks. The moving surface is one closed-form spectral function of (body-fixed position, time,
wind and fetch context fields) — pure in time like §8's clouds, never a stepped simulation —
evaluated in the same cube-sphere parameterisation with §7's position-hashed anti-tiling, since
planar wave tiles seam at face edges and pinch at poles. Representation obeys §7 verbatim:
displaced mesh → normal map → roughness folded into the glint lobe, each hand-down mean- and
variance-preserving, so **the glint from orbit is the sub-pixel tail of the eye-level waves** —
one spectrum, not a separate effect. Slow state (currents, sea ice, temperature) is context
fields baked at coarse bands like any geology; foam with memory is camera-local garnish nothing
else reads.