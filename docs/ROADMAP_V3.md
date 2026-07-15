# ROADMAP_V3 — build phase 3: one continuous system — navigable, editable, on real orbits

ROADMAP_V2 ended with a photoreal *inspector*: eleven bodies, each rendered
superbly, one at a time, on circular clockwork. V3 makes it a *world*: a
single-page app that opens on the whole system — sun, planets, moons, orbit
lines — where you drag to look, click a body to travel to it, and descend
continuously to its surface with every other body still hanging in its sky;
where the system itself is data you can edit live; and where one time slider
runs from real-time to timescales that make the orbital machinery — resonances,
precessions, seasons — visible.

> Provenance: this roadmap was drafted from a six-reader code recon and then
> panel-hardened before adoption (6 finder lenses / per-finding skeptics; 44
> confirmed + 14 amended findings folded in — including four KILLERs in the
> original Phase K mechanics spec). The panel discipline that wrote this
> document is the same one that executes it.

**Scope contract (owner-locked, July 2026):**

1. **Fictional Sol-analog.** Invented worlds, real architecture: rocky inner
   planets, gas giants with resonant moon systems, ice giants, a belt, KBOs —
   the full set of planets and major moons (~30 bodies). Existing bodies keep
   their identities and get re-homed into the new structure.
2. **As real as feasible, KSP-compatible.** Orbits are honest Kepler conics
   with secular precession — closed-form in time per CONCEPT §9 — and the
   design must leave a straight road to KSP-style patched-conic spacecraft
   with time warp (`core/physics.js`, a later roadmap). That constraint,
   not raw ephemeris accuracy, is what selects the mechanics below.
3. **A modest editor.** The editor exists to *prove* runtime edit and
   generation — a structured panel over the recipe with hot reload,
   add/clone/delete, and JSON import/export. Not a content-creation suite.
4. **V2-grade verification.** Every phase lands with Node suites, registered
   scenes, metric gates on controls, motion budgets, and finder/skeptic
   panels — the same image-verification discipline as ROADMAP_V2, extended
   to the new surfaces (travel, warp, editing).
5. **No overfitting to the current structure.** Refactor or demolish whatever
   the upgrade needs. CONCEPT's invariants and the verification battery are
   the contract; implementations — including load-bearing ones — are
   disposable (the V2 meta-rule, now pointed at V2's own scaffolding).

---

## Why it is still an inspector, not a world — the tells

The V2 exit review, run against the V3 goal. Every tell is verified against
the code as of commit `73ae4d8`; each becomes register rows below.

1. **The sky is a clock, not a solar system.** Every orbit is a circle in the
   inertial XZ plane — `orbit: {a, periodDays, phase0}` is the entire element
   set (`src/core/frames.js:14-21`); every spin axis tilts about the same
   inertial X (`frames.js:41-45`). No eccentricity, no inclination, no nodes,
   no apsides, no precession, no resonance beyond hand-tuned period ratios.
   Europa orbits nothing (`parent:'star'`, a "heliocentric stand-in (no
   Jupiter in SYSTEM)", `src/core/recipe.js:799`) and hides from every sky
   (`skyHidden`) to protect byte-identity.
2. **There is nowhere to stand except a surface.** The camera is
   (lon, lat, alt) around the current body, alt clamped to 18 R
   (`src/render/camera.js:65-70`); `camera.far = max(boundR·24, 8e7)`
   (`src/main.js:550`). A viewpoint *between* bodies is unrepresentable. There
   is no system view, no orbit line, no travel — the only transition is a
   teardown-rebuild dropdown (`switchBody`, `main.js:410-558`).
3. **Time is body-local.** `t = season·orbitPeriod + (dayCount+tday)·spinPeriod`
   of the *current* body, composed at **five sites in three files** — the
   frame loop (`main.js:900`), `solvePhase` (`main.js:1427`), `faceSunYaw`
   (`main.js:1438`), `harness/bench.mjs:73`, `harness/find-eclipse.mjs:26` —
   which have already drifted once (`:900` carries `dayCount`; `:1438` does
   not). There is no shared epoch; "season" means a different absolute time
   on every body. The speed select tops out at 43200×.
4. **The system caps out below Sol-analog shape.** One giant and one ringed
   body per SYSTEM, asserted at module load (`src/core/recipe.js:1007-1024`,
   wired at `main.js:192`) — a second giant throws before the page renders.
   Four co-visible companion slots (`main.js:911-918`), two eclipse occluders
   (`main.js:1073-1084`), atlas layer = array position as a compatibility
   surface (`recipe.js:785-786`).
5. **Editing is one hook deep.** `__reload(processes)` does honest
   band-selective invalidation (`src/core/bakecore.js:1867-1891`) — the right
   foundation — but palette, atmosphere, clouds, orbit, spin, figure, rocks
   have no live path, and the worker imports its own static recipe module
   (`src/bake.worker.js:11`), so even a future `setSystem` desyncs realms
   without a new protocol.
6. **The gates guard the wrong flank for V3.** Everything scores `?fast=1`
   (`harness/shots.mjs:114-124` defaults; committed `golden.json` provenance
   says `fast: true`) — the full-quality render has zero regression coverage.
   `bench --promote` stamps hardcoded false provenance
   (`harness/bench.mjs:192`: `backend:'swiftshader', fast:true` regardless of
   the actual run). The bench control baseline isn't committed at all. The
   prescribed `test:e2e` smoke (LAYOUT_ROADMAP §6) was never built. The
   control classifier defines "legacy" as the first three rock-bearing bodies
   *by array order* (`bench.mjs:61`) — an editor reorder or a 30-body system
   silently redefines the gate.
7. **The app never runs.** Every gate freezes time (`__shot` forces
   `speed = 0`, `main.js:1457-1459`) and the settle predicate assumes a world
   that stops changing. V3's deliverable is an app that *never* stops — its
   verification story does not exist yet.

## The V3 register

Numbered for citation; each row names its phase. Evidence lines above.

| # | Gap | Phase |
|---|---|---|
| V3-1 | Conic elements, secular rates, real spin axes, resonance/locking as data, μ-consistency | K |
| V3-2 | Barycenter nodes (binary systems); root-frame decision (star wobble registered) | K |
| V3-3 | One epoch time; per-body season/tday become derived views; the five composition sites die | 0/K |
| V3-4 | Host-frame camera (any node of the frame tree), system view, orbit lines, markers | N |
| V3-5 | Click-to-travel with an atomic frame handoff and no scene swap | N |
| V3-6 | The missing §11 rungs: all-bodies point tier; disc → resident-tiles transition, quantified and policed | C/N |
| V3-7 | K-slot sky, multi-giant/multi-ring per-slot, ≥3 eclipse occluders, uniform-storage budget | C |
| V3-8 | `setSystem`: NB atlases rebuilt at runtime; generation-stamped worker protocol; boot waterfall for ~30 bodies; worker memory shared across bodies | C |
| V3-9 | The `sol` system recipe: full roster on real-analog elements | S |
| V3-10 | Time warp ladder + per-subsystem high-rate policy (`[time-field]` under warp) | W |
| V3-11 | Full hot-reload scope (every recipe datum classed by invalidation cost) + editor UI | E |
| V3-12 | Edited-system reproducibility: `spec.system` payloads in SceneSpec/bookmarks/harness | E |
| V3-13 | Harness debts: provenance bug, committed bench baseline, `test:e2e`, full-quality gate tier, deterministic input scripting, control-classifier redesign | 0 |
| V3-14 | Verification for a running world: declared-warp capture law, travel/warp motion budgets, control classes for new camera surfaces | N/W |
| V3-15 | System-view exposure law (`[camera]`); the sun as a renderable body | N |
| V3-16 | Belts as §7 scatter over orbital density; comet (own solver class) showcase | B (stretch) |

---

## The rules (the contract)

The V2 homes table is inherited verbatim (`[bake] [look] [sky] [ladder]
[frame] [camera] [domain] [recipe] [global] [time-field]` — ROADMAP_V2 §The
rules). V3 adds two homes and re-affirms the laws that bind every phase below:

| Tag | Home | Discipline it inherits |
|---|---|---|
| `[system]` | system-scale presentation (orbit lines, markers, labels, travel paths) | camera-relative doubles only — **never let a system-scale coordinate pass through float32** (CONCEPT §9); occlusion computed analytically against the body list (representation-independent); pure fn of (ephemeris, camera), no retained scene state; excluded from metering |
| `[editor]` | recipe mutation path | validate → preflight → invalidate → rebake; **no mutable bake state** — an edit produces a *new recipe* and the world stays a pure function of it; every edit re-runs the M5 assert battery *before* teardown |

Standing laws, restated because every V3 phase touches them:

- **Closed-form in time. No integrator, no accumulated dt** (CONCEPT §9). A
  Kepler solve is a root-find of a pure function of t — allowed; its
  iteration policy must be fixed and deterministic. Craft integration is
  explicitly *out* of V3 (non-goals).
- **Distance chooses representation, never membership** (CONCEPT §7/§11).
  Slot overflow *demotes* a body down the ladder (disc → point tier); it may
  never delete one from the sky. The travel handoff is a representation
  change and must be mean/variance-honest and pop-free.
- **Counts are data; no silent caps** (M5). Every capacity lifted in Phase C
  gets a named assert and a declared budget row — including GPU resource
  budgets (fragment-uniform vectors), not just body counts.
- **Exposure is a property of the camera, never the world** (CONCEPT §10) —
  the system view gets its own metering *law* with a declared continuity
  mechanism at view-class boundaries, not authored brightness.
- **The recipe is the only input.** The editor mutates recipes; the engine
  re-evaluates. Nothing reads editor state.
- **Preflight before teardown** in every state transition — now including
  every editor apply and every travel handoff.
- **Every new async pipeline feeds the settle predicate** — now including
  prewarmed travel targets and editor rebakes.
- **A new representation may not be added without a hand-off inventory row**
  (V2 Appendix C law) — V3's inventory is written below, in this document.

## Extend vs replace — the honesty ledger, V3 edition

Per the scope contract: *do not get stuck in the existing structure.*
Everything below is declared up front.

**Preserve (the contract — never rewritten, only honored):**
- CONCEPT.md invariants; the recipe-as-pure-data schema discipline (existing
  body recipes must still bake identically under the new system schema unless
  a datum they consume deliberately changes).
- The determinism/halo/seam battery (`test/*-test.mjs`), the harness kernel
  (`renderShots`/`metrics`/`gate`), metric-tolerance gating on controls.
- `src/core/` purity (no THREE/DOM/Date/random) — the future server runs it.

**Extend (foundation validated, build on it):**
- `frames.js` — the *shape* (closed-form frame tree, `ephemeris(body,t)`
  contract) extends to conics + rates + axes; consumers keep their interface.
- The §11 ladder (disc atlas, point flux, live giant synthesis) — gains the
  all-bodies point tier, the resident-tiles rung, and K slots.
- The bake worker + band-selective invalidation (`invalidationLevel`,
  generation counters) — the editor's engine; the tile-bake generation
  pattern extends to *every* worker message class and to a `setSystem`
  protocol.
- SceneSpec (`system` field already reserved, `src/scenespec.js:24`) and the
  harness's system-derived body lists — the JIT-worlds hooks V3 cashes in.
- `OrbitalCamera` — remains the surface/orbit camera; gains a host-frame
  generalization above it, not a rewrite inside it.

**Replace (scheduled demolition — don't polish):**
- **The circular-orbit arithmetic** (`bodyCenterInertial`'s cos/sin circle)
  and **tilt-about-inertial-X** spin. Kept only as the verbatim compat
  fast-paths for recipes that author no new datums (see the migration law
  below), deleted when the last such recipe is gone.
- **Body-local time composition** — all **five** sites (`main.js:900`,
  `main.js:1427` solvePhase, `main.js:1438` faceSunYaw, `bench.mjs:73`,
  `find-eclipse.mjs:26`). Epoch seconds become the *only* primary time; tday
  and season become per-body derived views.
- **`switchBody` as the only transition.** It decomposes into primitives
  (preflight, host-frame change, residency change, uniform re-bind) that
  travel and the editor share; the dropdown becomes one caller.
- **Init-time system constants** — `NB` at module init, atlas rows keyed by
  array position, `assertGiantSystem/assertRingSystem`'s one-per-SYSTEM
  shape, the 4-slot uniform arrays, the alt/far/pivot-range clamps (every
  clamp derives from the loaded system, never a literal). All become
  per-loaded-system state rebuilt by `setSystem`.
- **`main.js` as the engine.** The deferred LAYOUT step-7 extraction
  (`createEngine`) stops being deferred — it is Phase 0, because every later
  phase (multi-view exposure, travel, editor, epoch time) churns `main.js`
  and must not churn a 1500-line DOM-coupled monolith three times.
- **The bench control classifier's "first 3 rock-bearing bodies" legacy set**
  and the hardcoded promote provenance — both replaced in Phase 0.

**Strategic checkpoints (decide, don't drift):**
- **Residency at handoff.** Render-side `PlanetTiles` residency is **singular
  always** (the N3 law: handoff fires only when both endpoints are
  sub-ladder). The "dual-residency window" is strictly **worker-cache
  dual-residency** — the target's coarse pyramid pre-baked in the worker
  while the departure body still renders. If approach benches prove the
  disc→tiles rung needs *rendered* terrain on both ends, revisit with the
  render-side memory budget on the table.
- **Worker topology.** One serial bake worker is a boot bottleneck at 30
  bodies (30 discs × ~0.5 s + [global] grids ≈ tens of seconds FIFO). Decide
  in Phase C, before the boot budget is gated: (a) main-side priority queue
  dispatching one job at a time to one worker (job-granular priority; the
  `main.js:406` boot flood dies; worst-case inversion = one ~3.3 s [global]
  job), or (b) a small worker pool with one *shared* tile/memory budget
  (the round-4 "pools multiply OOM-prone caches" finding must be re-examined,
  not assumed, now that per-body caches are being re-budgeted anyway).
- **WebGPU** — triggers unchanged from round 15 (a hardware budget row
  biting, froxel/compute need, forced three bump). K-slot sky cost and the
  uniform-storage budget are candidate triggers; measure before assuming.
- **Orbit-line rendering** — camera-relative double-rebased polylines first
  (the tiles.js `applyCamera` pattern) **with analytic body-occlusion from
  day one** (finite-distance ray-sphere against the co-visible body list —
  the `stars.js:104-105` form, not the angular-only companion test); if
  compositing still fights, the fully analytic sky-pass curve is the
  fallback. Decide on evidence in Phase N, not by taste.

## Byte-identity is a migration instrument, not a museum

V2's byte-identity culture exists to catch *unintended* change. V3 makes
intended change constantly. The reconciliation, as law:

1. **Two systems ship.** `demo` — the current 11-body SYSTEM, frozen as a
   *test fixture* (its ~250 body-id references across 12 of the 14 Node
   suites and the golden corpus keep their meaning) — and `sol`, the
   deliverable, a new system recipe that re-homes the same body recipes onto
   real elements and adds the missing roster. `createEngine({system})` and
   the harness's system-derived body lists make coexistence cheap; run and
   baseline **provenance gains the system identity** (`{id, recipeHash}`)
   and gate/promote refuse on provenance mismatch, so a `demo` baseline and
   a `sol` run can never be silently compared. `demo` retires only when its
   last unique gate has a `sol` replacement.
2. **Compat fast-paths, proven then bounded.** An orbit authoring only
   `{a, periodDays, phase0}` — and a spin authoring only
   `{tiltDeg, periodH, phase0}` — executes the *verbatim* legacy code path,
   branch keyed on schema shape (round-17 `FIG_MODE` precedent: the sphere
   reduces to exact legacy arithmetic). Recipes may not mix schemas within
   one datum; the validator throws by name. `demo` therefore stays
   byte-identical through Phase K — golden and all 14 suites remain live
   instruments while the conic machinery lands under them. The 0-ULP twin
   tests pin *branch selection*, not floating-point trig identities.
3. **Re-pins are events, not drift.** When a change *intends* visual deltas
   (re-homing scenes onto `sol`, epoch-time migration of scenes.json's 76
   body-posed specs), the round runs A/B, pre-classifies every delta from
   closed-form geometry (never from metrics), lands the re-pin in one commit
   with provenance, and the panel reviews the diff sheet. "All gates die
   simultaneously" is the failure mode; the two-system + compat-path design
   exists so that at every commit, *some* trusted gate is green.

---

## Phase 0 — Engine extraction & harness debts (build FIRST)

The velocity phase, all well-specified; nothing here changes a rendered
pixel (golden-verified).

| Item | Home | Mechanism |
|---|---|---|
| `createEngine()` extraction | engine | The deferred LAYOUT step 7: `src/engine.js` (render loop, passes, body switch, metering, settle) + thin `apps/inspector.html` binding. `applyScene` consumes the SceneSpec defaults table — the two hand-synced defaults tables (`scenespec.js:22-45` vs `__shot`'s hand-rolled resets, `main.js:1448-1502`) collapse to one. `__shot`/`__ready`/`__perf`/`__reload` stay byte-compatible one-line bridges (harness contract). The engine sizes from its canvas param per LAYOUT §5's `createEngine(canvas, …)` signature — today main.js reads `innerWidth/innerHeight` at `main.js:29, 682, 1266, 1350-1353`. |
| Epoch time primary | engine `[frame]` | `state.epochS` (seconds, JS double, epoch J2000-analog = 0) is THE clock; `tday`/`season` become derived views computed *per body* from the ephemeris. **All five** composition sites (`main.js:900`, `main.js:1427`, `main.js:1438`, `bench.mjs:73`, `find-eclipse.mjs:26`) collapse into one exported function, which `solvePhase`/`faceSunYaw` must call. SceneSpec gains `epochS`; existing fields keep their *documented distinct semantics* — `season` keeps defaults-table reset (0.15), `tday` keeps its sticky control semantics, `phaseDeg`/`faceSun` stay solver fields — each resolving to epochS through the named body. A Node test proves old specs (including phaseDeg- and faceSun-posed ones) resolve to the same t. |
| Provenance fix + system stamp | harness | `bench.mjs:192` stamps the *actual* run provenance (the `golden.mjs:97` pattern) — land before any V3 `--promote`. Provenance records gain `system: {id, recipeHash}`; `gate`/`--promote` **refuse** when run and baseline provenance disagree (system, backend, fast) instead of silently diffing. |
| Bench baseline committed | harness | `bench --promote` on a pinned seed; `harness/baseline/metrics.json` + provenance committed. Promotion refuses on a dirty `git status`. The V3 baseline-zero. |
| Full-quality gate tier | harness | Golden gains a `fast:false` subset (≥3 scenes, GPU) — the actual deliverable gets regression coverage; `fast:true` remains the wide/cheap tier. Tolerances re-measured per tier (cross-run jitter × safety factor, the LAYOUT method). |
| `test:e2e` | harness | The prescribed smoke, built: boot every body of the loaded system, applyScene round-trip equals capture, 0 page errors, settle in budget, and A→B→A body-switch equivalence — compared at the golden gate's **metric-tolerance tier** (stable aggregates; sha reported as the informational pixel-identical signal), inheriting LAYOUT §11's bake-multistability correction rather than the superseded pixel-identity wording. The F2 star-leak class it polices produces gross metric deltas and is still caught. Body list derives from the system under test. |
| Deterministic input scripting | harness | `renderShots` gains scripted input steps (`{input:[...]}`) — but **no gated capture may depend on wall-clock**: in capture mode the engine runs a stepped clock (fixed dt per rendered frame, epochS pinned — the travel analog of `__shot`'s speed=0), easing/travel progress is a pure function of that clock, and input events are frame-indexed against it. The machinery for click-to-travel, drag-orbit, and editor-panel tests, without importing the timing-nondeterminism class the harness spent rounds eliminating. |
| Control classifier redesign | harness | "Legacy = first 3 rock-bearing bodies by array order" (`bench.mjs:61`) dies. Expected-delta classification keys on *declared recipe/system diffs* (which bodies' data changed, which skies gained a companion — still closed-form, still pre-render), not array position. `buildControls` becomes **pose-class structured** — `{surface, disk}` today; `{system, travel, warp}` classes reserved with their spec shapes — so later phases extend the rotating-control instrument without rework. |
| Asset-script dissolution | harness | Finish the registered LAYOUT disposition: the determinism proof already runs as `test/assets-test.mjs` on every `npm test`; `scripts/assets.mjs`'s header claims an `npm run assets:check` that does not exist and a committed-manifest contract that is no longer true — retire the script (or correct its header and drop the phantom alias), rather than aliasing stale claims into package.json. |

**Exit:** golden 7/7 within tolerance (pure move), `npm test` green including
new e2e, both baselines committed with true (system-stamped) provenance, one
defaults table, deterministic-input demo test green.

**Round 19 status — COMPLETE (2026-07-12).** `createEngine(canvas, options)`
now owns the renderer behind the thin inspector binding; `epochS` is the only
render clock and legacy time views resolve through `core/time.js`; SceneSpec
defaults/application are unified. Harness provenance is stamped with the real
backend/quality/system identity and rejects mismatches, controls are pose-class
structured and declared-diff classified, deterministic frame-indexed input and
the 11-body A→B→A e2e smoke are live, and the stale asset script is retired.
Verification: 16 Node suites + typecheck green; e2e green; 7/7 fast golden and
3/3 full-quality golden green; the pinned 8-control metric baseline repeat is
green under its measured multistability envelope.

## Phase K — The Kepler core (`[frame]` v2)

The heart of V3's realism. Everything remains a pure function of epoch
seconds; nothing integrates; every consumer of `ephemeris()` keeps its
interface. Fable round — precision landmines everywhere, and every sun line
in the repo moves if it's wrong.

**Conventions (normative, K-wide).** The engine inertial frame is
right-handed, Y-up; **the ecliptic is the XZ plane**; the reference longitude
direction is +X; orbital angles increase in the legacy sense — +X toward +Z
(`frames.js:15-16`) — which means a prograde (iDeg < 90) orbit's angular
momentum points toward **−Y**; real-Sol signed secular rates transcribe under
that stated sign convention (a one-line table in the recipe header, pinned by
a Node test on a known case). Recipe-authored angles are **degrees** (the
`Deg` suffix *is* the unit, matching `tiltDeg` house style), converted to
radians exactly once at recipe validation; every internal ephemeris API
surface is radians and unsuffixed; the validator asserts every angle-valued
field in the new schemas carries its unit suffix.

### K1. The element schema

```js
orbit: {
  // conic elements at epoch (angles in degrees per the Deg suffix; lengths metres)
  a, e, iDeg, OmegaDeg, omegaDeg, M0Deg, epochS,   // e ∈ [0, eMax=0.95], assert
  // secular rates — closed-form linear drift, degrees per Julian century
  OmegaDotDegCy, omegaDotDegCy,                     // nodal regression, apsidal precession
  frame: 'ecliptic' | 'parentEq',                   // reference plane for i/Ω (see rule below)
}
```

- **Propagation:** M = M0 + n·(t − epoch); solve Kepler's equation
  E − e·sinE = M by Newton with a Danby starter and a **fixed iteration
  count** (8) — bit-deterministic across machines, no data-dependent
  branching (the determinism law applied to a solver; measured residual
  ≤ 1e-15 across the e ≤ 0.95 range at 6 iterations). ν, r from E; rotate by
  ω, i, Ω (drifted by their rates) into the parent frame under the stated
  conventions; compose parent chains in doubles exactly as today.
- **Mean motion n is DERIVED, never authored** — see K4 (and K3 for the
  resonance-member exception, where *a* is the derived datum instead).
  `periodDays` disappears from new-schema orbits.
- **The frame rule keys on precession physics, not formation class:** a
  moon's i/Ω are referenced to `'parentEq'` when the parent's oblateness
  dominates its nodal precession (close-in moons: Galilean-analogs, inner
  Saturnian-analogs, **and the Triton-analog** — retrograde is `iDeg ≈ 157`
  in the parent frame), and to `'ecliptic'` when solar perturbation dominates
  (distant moons — **the Luna-analog explicitly**: its 5.1° inclination is
  fixed to the ecliptic while its node regresses, which is why an
  Earth-equator reference would be wrong; irregular outer moons likewise).
  A true Laplace-plane datum is registered, not built, with the
  Iapetus-analog named as its future consumer (its stuck intermediate tilt
  is the one roster case neither plane serves well).
- **Compat law:** an orbit authoring only `{a, periodDays, phase0}` takes the
  verbatim legacy code path — `demo` stays byte-identical (the migration
  instrument). Recipes may not mix schemas; the validator throws by name.
  The provable-overlap mapping between the paths is stated, not implied:
  `GM_equiv := (2π/(periodDays·86400))²·a³` per body (demo periods are *not*
  μ-consistent), e = i = Ω = ω = 0, epochS = 0, M0 from phase0 under the
  legacy angle convention; frames2-test evaluates both paths on every demo
  body across an epoch sweep under that mapping.
- **Velocity ships with position — with the frame-drift terms.**
  `bodyStateInertial(body, t) → {r, v}` where
  v = R_z(Ω)R_x(i)R_z(ω)·ṗ **+ Ω̇(ẑ_frame × r) + ω̇(ĥ × r)** — ẑ_frame the
  reference-plane pole per the orbit's `frame` datum, ĥ the orbit normal;
  omitting the drift terms fails the gate by six orders of magnitude on a
  Luna-analog (measured: 4.9e-3 relative vs the 1e-9 tolerance). Closed-form,
  deterministic, two cross products. Nothing in V3 renders v, but the
  KSP-readiness contract (K4) and the light-time register need it, and
  retrofitting velocity into a frame tree is the §9 "velocity rebases with
  the origin" bug factory. Node-tested against central-difference of r to
  1e-9 relative **with a per-body step h ≈ P/1e5** (a fixed h under-resolves
  fast moons and noise-floors slow planets).

### K2. The spin schema

```js
spin: { poleLonDeg, poleLatDeg,      // pole direction, ecliptic coords
        periodH | locked: true,       // sidereal period, or derived from orbit (K3)
        phase0, meridianDeg }         // prime-meridian epoch offset
```

- Replaces tilt-about-inertial-X: every body gets a real pole *direction* —
  the Uranus-analog lies on its side pointing where its recipe says, not
  where the shared X axis allows. Render-time season consumers (subsolar
  latitude via `sunDirBF[1]`: seasonal frost caps `main.js:970-976`, cloud
  seasonality via the worker's `seasonSamplerFor`, `bake.worker.js:34-43`)
  get real seasonal geometry from the new axes. **Baked context temperature
  is latitude-only today** (`bakecore.js:487` — authored tempEq/tempPole +
  lapse; no orbit/tilt input anywhere in bakecore/globalgrid) — making baked
  climate *insolation-driven* is a named Phase S work item, not a free
  consequence of this schema.
- **Compat mirrors K1:** a spin authoring only `{tiltDeg, periodH, phase0}`
  executes the verbatim legacy `rotX(tilt)·rotY(spin)` branch
  (`frames.js:42-45`), keyed on schema shape — a pole-angle *remap* through
  the general path cannot be 0-ULP (different transcendental expressions
  round differently). The twin test pins branch selection; the
  pole↔tilt mapping equivalence is a tolerance-tested documentation twin.
- **Axial precession** (`poleDotDegCy`, equinox precession) is registered,
  default 0 — the 18.6-yr *nodal* cycle of the Luna-analog comes from
  `OmegaDotDegCy` (K1), which is the visually load-bearing one.

### K3. Resonance & locking as data

- **`spin.locked: true`** derives the sidereal spin period and phase from the
  body's own orbit (synchronous rotation as a *law*, not two hand-synced
  numbers — the Luna/Titan/Europa maintenance bug class dies). A
  `lockRatio: [3,2]` generalization gives the Mercury-analog its 3:2
  spin-orbit resonance — one datum, a real and *visible* long-timescale
  behavior (its solar day is 2 of its years).
- **`resonance: {group, ratio, phaseDeg}`** on orbits. The derivation chain,
  stated exactly because three constraints must not fight:
  1. members' **mean-longitude rates** are pinned to exact rational ratios
     of the group base: λ̇_i = ratio_i · λ̇_base (pinning λ̇, not n, is what
     makes the resonant argument *exactly* stationary under nonzero secular
     rates: for [4,2,1]-rate Galilean-analogs, λ̇1 − 3λ̇2 + 2λ̇3 = (4−6+2)·λ̇base
     = 0 by construction, while naively pinning anomaly rates lets the
     authored Ω̇/ω̇ drift the argument ~17°/yr);
  2. each member's anomaly rate derives: n_i = λ̇_i − Ω̇_i − ω̇_i;
  3. each member's **a derives from the μ-law on that n_i** —
     a_i = (GM_parent/n_i²)^{1/3}. **Resonance-group members may not author
     a; the validator throws by name** (the schema-mixing law again). Cost is
     invisible: deriving from a real Io-analog base lands the Europa- and
     Ganymede-analog a within 0.3-0.8% of the real values.
  Epoch mean longitudes are chosen so the declared resonant argument holds —
  the Laplace group ships λ1 − 3λ2 + 2λ3 = 180°, asserted by a Node test at
  1000 random epochs (the conjunction pattern is a theorem, not a hope).
  Forced eccentricities are authored `e` values with a comment. Libration is
  registered, not built (fixed-point resonance is the closed-form-honest
  first rung).
- **Where the "weird orbits" realism actually lives:** Galilean-analog nodal
  regression about the giant's pole (parentEq + Ω̇), the Luna-analog's 5.1°
  ecliptic inclination with 18.6-yr node regression and 8.85-yr apsidal
  advance, the Iapetus-analog's stuck tilt, Triton-analog retrograde capture
  — all pure element data on K1 machinery. No new mechanism per moon.

### K4. μ-consistency — the KSP-readiness contract

- Every body (and the star) gets `GM` (m³/s²) as recipe data. **Law: mean
  motion derives — n²a³ = GM(parent)** for a body orbiting a body. For a
  **barycenter pair the law holds on the relative orbit**:
  n²·a_rel³ = GM_p + GM_s (a member's *barycentric* ellipse obeys
  n²a_i³ = G·m_other³/(m_p+m_s)² — the validator must never apply the naive
  form to member amplitudes). Gravity becomes real: periods are consequences
  of mass and distance, an editor moving a planet outward *slows it*
  correctly with zero extra code, and a future craft on a patched conic in
  the same μ tree is consistent with the world by construction.
- SOI radii `r_SOI = a·(GM/GM_parent)^{2/5}` exported as a pure helper, with
  the barycenter rule stated (a member's SOI computes against the
  companion's GM; the pair's combined GM serves at the node) so physics.js
  never sees GM_parent = 0.
- The contract, stated for the future physics round: bodies-on-rails
  (closed-form conics, this phase) + craft-on-conics-within-SOI (patched,
  later) + time warp = pure re-evaluation at scaled t. V3 builds no craft,
  but every K decision is audited against "would this break patched conics?"
  — the reason elements + secular rates won over series ephemerides
  (a VSOP-style position series has no conic to patch against; slowly
  drifting osculating elements do).

### K5. Barycenters & the root

- The frame tree gains **barycenter nodes**: massless frame parents for a
  declared two-body split. **A barycenter pair authors ONE relative conic
  plus the mass split; the engine derives both member conics** —
  a_p = a_rel·GM_s/(GM_p+GM_s), a_s = a_rel·GM_p/(GM_p+GM_s), shared
  e/i/Ω/rates, ω_s = ω_p + 180°, one shared M(t); n from the relative μ-law
  (K4). The Pluto-analog/Charon-analog binary is the shipping consumer — the
  mutual dance is one of the roster's showcase looks.
- **The frame tree also gains a non-rotating body-centered frame class**
  (parent-oriented axes, origin at the body): the natural home for travel
  paths and orbit-mechanics presentation, where the existing rotating
  body-fixed frames would smear any eased path into a spiral. Surface/orbit
  cameras keep the rotating frame exactly as today; Phase N consumes this.
- **The root stays star-pinned in V3.** CONCEPT §9 says "system-barycentric";
  the star's giant-driven wobble is ~1 star-radius (~0.005 AU) — invisible at
  every V3 scale, and honest to defer. Registered with its trigger: if/when
  eclipse-timing gates or craft physics need it, the star becomes a body of
  the tree orbiting the system barycenter with the same machinery.
- `ephemeris(body,t)` keeps its exact output contract; a node-hosted variant
  `ephemerisAt(node,t)` (root/barycenter viewpoints — no "current body")
  ships for Phase N. `irradianceAt(actual distance)` already flows
  eccentricity into instantaneous irradiance for free (`frames.js:79`).

### K6. Long-timescale honesty & solver hygiene

- Secular rates are *linear in t*: angles drift forever without blowup —
  numerically stable at any epoch (angles wrap in double before use; the
  `uTimeS % 4096` GPU law untouched). Accuracy vs a real system decays
  outside a declared `validYears` window (recipe datum, default ±5000 y);
  beyond it the UI shows an unobtrusive "extrapolated" tag (Phase W).
- Kepler solve edge cases pinned by an e×M sweep test (residual < 1e-12 up
  to eMax; the measured margin is ~1e-15); e=0 short-circuit is *exactly*
  E = M (the Danby starter reduces to it and Newton is a fixed point), so
  the compat overlap mapping (K1) is provable, not asserted.
- `harness/find-eclipse.mjs` and the `phaseDeg`/`faceSun` solvers migrate to
  the new ephemeris in this phase (their *time composition* was already
  centralized in Phase 0); the pinned demo eclipse scenes re-solve to the
  same epochs via the compat path (asserted).

### K7. What deliberately stays out (registered, with triggers)

n-body and GR (never — the architecture forbids integrators); series
ephemerides (trigger: a use case needing arcsecond planet positions);
light-time/aberration (trigger: craft physics or eclipse-timing gates;
velocity from K1 makes it cheap); tides as forces (CONCEPT sanctions a
pure-in-time level-set perturbation — Phase B stretch at most); axial
precession (K2); the Laplace-plane datum (K1, Iapetus-analog named); libration
(K3); star wobble (K5); the comet solver class (Phase B: its *own* fixed-count
policy — 16 Newton or 8-10 Halley steps, verified to machine epsilon at
e = 0.9999 — plus its own eMax < 0.9999 assert and a perihelion-corner sweep
gate with log-spaced M probes; the K1 8-iteration policy measurably degrades
past e ≈ 0.995 and must not be silently reused).

**Exit:** `test/frames2-test.mjs` green — solver determinism ×2 fresh
processes; e×M sweep; velocity vs per-body-step central difference at 1e-9
(including secular-rate bodies); μ-law on plain bodies AND the relative-orbit
form on barycenter pairs; resonance argument stationary at 1000 epochs
*with nonzero secular rates authored*; resonance-member a-derivation;
locked-spin and lockRatio derivation; compat-path branch-selection 0-ULP on
every demo body (orbit AND spin) plus the epoch-sweep overlap mapping;
frame-rule round-trips (parentEq/ecliptic); the sign-convention pin. All 14
legacy suites + golden byte/tolerance-green via the compat paths;
find-eclipse reproduces the three pinned demo eclipses.

**Round 20 status — COMPLETE (2026-07-12).** Phase K ships as a pure
mechanics/schema layer plus the frame-tree implementation: fixed-count conic
propagation with secular-rate velocity terms; real pole axes and derived
spin locks; λ̇-pinned resonance groups; GM/SOI laws; barycenter nodes with one
relative conic; body-centered and node-hosted frames; validity-window
reporting; and exact legacy orbit/spin branches for `demo`. The pre-code
contract review made the two implicit authoring surfaces explicit:
`system.resonances[]` owns each group's `baseBody`/`baseA`, so members never
author `a`, and `system.nodes[]` separates a barycenter's outer `orbit` from
its one `relativeOrbit`. `test/frames2-test.mjs` runs 25,778 assertions,
including two-fresh-process determinism, the full e×M sweep, <1e-9 velocity
twins with nonzero rates, 1,000-epoch resonance stationarity, relative μ and
mass-split laws, locks, frame round-trips, exact demo branch selection, all
11 overlap mappings, and the three pinned eclipse poses. Verification:
17 Node suites + typecheck green; live e2e green on all 11 demo bodies;
golden 7/7 fast + 3/3 full-quality green without metric re-pins; and all 8
rotating controls within their committed tolerance. Adding GM/validity data
changed only the honest system provenance hash (`6bd998a2`).

## Phase C — Capacity: the system stops being 11 bodies deep

Everything that hard-caps system shape, lifted behind named asserts with
declared budgets. Mechanical but cross-shader-atomic — a partial lift is the
F2 star-leak class, so the round gets a pre-code panel despite being
Opus-grade.

| Item | Home | Mechanism |
|---|---|---|
| K-slot sky | `[sky]` `[ladder]` | Companion slots 4 → **8** (build constant `MAX_BODY_SLOTS`, M5 assert, budget row). Both unrolled copies change together — SKY_FRAG (`shaders.js:1846-1852`) and the star-occlusion loop (`stars.js:112-114`) — plus `uBodyCloudA` packing (4×2 → 8×2) and the O(slots²) eclipse pairs (`main.js:931-951`). Per-pixel sky cost scales linearly with occupied slots: measured on the RTX tier *and* SwiftShader; the budget row is a gate. |
| Uniform-storage budget | `[sky]` | The M5 counts-law applied to a GL resource: the sky material's default-uniform-block vector count becomes a declared budget with a boot-time named assert against `gl.MAX_FRAGMENT_UNIFORM_VECTORS` plus headroom — the 8-slot lift alone roughly doubles today's ~180-vector block, and per-slot giant/ring sets add ~19 vectors × slots. If the assert ever binds, the registered fallback is packing per-slot data into a float texture (a mechanical change, decided by the assert, not mid-round panic). |
| Multi-giant / multi-ring | `[sky]` `[recipe]` | The single `uGiant*`/`uRing*` uniform sets become per-slot arrays; `assertGiantSystem`/`assertRingSystem` (one per SYSTEM, `recipe.js:1007-1024`) become per-*co-visible-set* invariants (any number in the system; per-slot data for the ≤K resolved). Two ringed bodies co-visible render both — the "last-written params" bug class dies. Per-ring gap cap 4 and band-knot cap 8 stay (data caps, asserted). |
| The all-bodies point tier | `[sky]` `[ladder]` | The §11 ladder's bottom rung stops living inside the slot loop: an **instanced point pass over ALL system bodies** fed by the ephemeris — per-vertex disc-integrated flux, PSF sprite, the same occlusion tests, the `stars.js` machinery pattern — so **slot overflow demotes to the point tier, never deletes** (CONCEPT §7/§11: distance — or slot pressure — chooses representation, never membership; Venus-over-a-night-ridge survives a crowded sky). This is also what makes the Phase N root-hosted system view renderable at all: ~33 bodies from 40 AU are all points; the ≤K resolved discs are the exception, not the rule. Budget row + a closed-form assert that a demoted body's flux is continuous across the slot↔point boundary (mean-preserving hand-down). |
| Eclipse occluders | `[sky]` | 2 → 3 (a Galilean-analog sees sibling transits + giant eclipse in one sky), keeping the angular-radius ≥ 5%-of-sun gate and the fp32-cancellation law (`main.js:1073-1084`). |
| `setSystem` + generation-stamped protocol | engine `[recipe]` | The registered first work item of the JIT round, built: disc/cloud DataArrayTextures, slot uniforms, body menu, per-body caches rebuilt from the *loaded* system; atlas layer keyed by body **id → layer map**, not array position. Worker gains a `{type:'system', system}` message — recipes are verified structured-clone-safe — replacing its static recipe import for system data. **Every worker message and reply — tiles, discmap, clouds, reload, system — carries a monotonically bumped system/edit generation** (the tiles.js `gen` pattern, protocol-wide): `sol` reuses `demo` ids, so an un-stamped in-flight `discmap` from the old system would land in the new system's atlas row and render. `discPending`/`cloudState` rebuild per generation, never decrement across one. Preflight-before-teardown: the new system validates completely before the old one disposes. |
| Boot at 30 bodies | engine | Per-body one-time costs, budgeted: disc map ≈ level-0..2 pyramid (~0.5 s/body), MS LUT (ms), [global] grids (~3.3 s each), rock/formation packs (landable bodies), giants near-free (maxBakeLevel 8, no rocks). Boot becomes a **prioritized JIT queue** (per the worker-topology checkpoint — main-side, job-granular). Progressive disc appearance gets the clouds treatment: a **per-slot `discLoaded` gate falling back to the recipe's flat `discAlbedo`** until the row lands (the zeroed atlas otherwise renders black companions for up to a minute), and disc settle accounting goes per-visible-body instead of the global `discPending <= 0`. Target: interactive < 5 s, all-discs-settled < 60 s on the GPU tier, gated by the load waterfall (`profile.mjs`) *after* the topology decision. |
| Worker memory | worker | Per-body bakers are never freed (`bake.worker.js:45-61`) — fine at 11, unacceptable at 30+. One shared cross-body tile budget with per-body LRU floors (the current body keeps its 300-tile guarantee; background bodies decay to root pyramids). The budget's numeric cap is **measured-then-pinned in-round** (the V2 cacheMax discipline: a number + measured headroom, e.g. today's 300 tiles ≈ 202 MB vs the ~243 MB failure point), and named eviction stats land in `__stream()` so starvation is visible. |
| Node scaling suites | test | `test/system-test.mjs`: 30-body recipe validation en masse, id→layer map round-trips, generation-fencing unit tests (stale-gen replies dropped), setSystem A→B→A e2e contract (metric-tolerance tier), slot-overflow demotion continuity. |

**Exit:** `demo` unchanged (golden green); a synthetic 30-body stress system
boots inside budget on the decided worker topology; slot/giant/ring/point-tier
lifts verified by new breakpoint scenes (two ringed giants co-visible;
8-slot Galilean sky; slot-overflow demotion); uniform-storage assert green
with declared headroom; the 6-body **tour e2e** (scripted A→B→…→A across six
bodies, memory stats bounded under the pinned budget, zero stale-generation
artifacts) green.

**Round 21 status — COMPLETE (2026-07-12).** Phase C now has one shared
capacity contract (`MAX_BODY_SLOTS=8`, three eclipse occluders, 512 declared
sky-uniform vectors plus 64 required headroom), and both the sky-disc loop and
star-occlusion loop consume the eight-slot shape. Giant bands and ring profiles
are independently packed per slot; the stress breakpoint resolves three
ringed giants concurrently. The ladder assigns the largest eight angular discs
to those slots and sends every overflow member through a PSF point pass using
the same occlusion tests and the shared Lambert disc-integrated-flux hand-down.
Unbaked disc rows use authored `discAlbedo`, so JIT work never produces a black
or missing world.

The required pre-code panel was performed as a direct contract audit because
delegated agents were not authorized for this workspace. It fixed the atomic
boundaries before edits: one constants source for both shaders, id→layer maps
instead of array identity, complete structured-clone/schema preflight before
teardown, one protocol-wide generation, and one job-granular worker so decoded
tile memory has a genuinely shared cap. `setSystem` rebuilds atlases, menus,
caches, pending state and worker data from the loaded recipe; every tile,
discmap, cloud, reload and system message/reply is generation-stamped. Cold
background bakers are freed after the six-root warm floor, preserving the
foreground's 300-tile capacity inside the measured 336-tile shared budget;
`__stream()` exposes tiles, budget, bakers, evictions, generation, interactive
time and uniform headroom.

Verification: `test/system-test.mjs` passes 1,070 assertions including the
30-body validation/load, A→B→A id-layer maps, stale-generation fencing,
deterministic JIT priority, eight-slot/22-point partition and exact boundary
flux equality. On the RTX 5090 tier the live `demo → stress-30 → demo` e2e was
interactive in 1.76 s, settled all 30 disc rows in 30.96 s, and held its sampled
decoded cache at 304/336 tiles with zero page errors; its 1024-vector limit left
512 vectors over the declared block. The six-body tour, all 11 demo bodies and
A→B→A render contract also passed. SwiftShader compiled and settled the same
eight-slot program with 3,584 uniform vectors of headroom and no page errors.
`npm test` passes 18 suites plus typecheck; `npm run test:golden` passes 7/7
fast and 3/3 full-quality scenes without a re-pin. Demo provenance remains
`demo-system@6bd998a2`.

## Phase S — The `sol` system recipe (roster & content)

Pure §6 data plus palettes — the "recipes are data" thesis at full stretch.
Opus round; the panel guards the anti-overfit law (same family, different
knobs must yield different *looks* — the jointTab precedent).

### The roster (~33 bodies)

Existing bodies keep ids and recipes; **new** bodies reuse shipped process
families first (right column). Names are placeholder data, driver may refine.

| Slot | Id | Analog | Parent / notes | Families reused (new data only) |
|---|---|---|---|---|
| Star | `sol` | Sun | root; renderable body (Phase N) | — |
| 1 | `cinis` | Mercury | 3:2 `lockRatio`; e = 0.21 — the eccentricity showcase | luna family + strata (lobate scarps) |
| 2 | `venus` | Venus | exists; retrograde pole via K2 | — |
| 3 | `tellus` | Earth | exists | — |
| 3a | `luna` | Moon | `frame:'ecliptic'` (the K1 rule), 5.1° incl, 18.6-y node, 8.85-y apse | — |
| 4 | `rubra` | Mars | exists; dust-storm season re-keyed to true-anomaly Ls | — |
| 4a/b | `timor`, `pavor` | Phobos/Deimos | figure (lobes/ellipsoid) moonlets, parentEq | arrokoth/vesta figure machinery |
| 5 | `iovis` | Jupiter | NEW giant: banded + GRS-class storm oval | saturn giant machinery |
| 5a | `fornax` | Io | Laplace group base (authors a; siblings derive theirs); volcanic look | provinces + fresh + sulfur palette |
| 5b | `europa` | Europa | **re-homed**: parent iovis, unhidden, resonance slot (a derived) | exists |
| 5c | `sulcus` | Ganymede | resonance slot (a derived); grooved terrain | lineae families + craters |
| 5d | `vetus` | Callisto | outside the resonance; dark saturated cratering | craters + ice + age/tholin |
| 6 | `saturn` | Saturn | exists, rings | — |
| 6a | `candor` | Enceladus | bright E-ring feeder; stripes | lineae + ice (plumes registered) |
| 6b | `rhea` | Rhea | cratered ice | craters + ice |
| 6c | `titan` | Titan | exists | — |
| 6d | `ianus` | Iapetus | two-tone leading/trailing + tilted orbit; the registered Laplace-plane consumer | tholin longitude-province (Cthulhu precedent) |
| 7 | `caelus` | Uranus | NEW ice giant; 98° pole — the K2 showcase; faint ring | giant machinery, muted knots |
| 7a-e | `ruina` +4 | Miranda + big 5 | ruina = chaos+strata mashup; 4 siblings from one cratered-ice template | chaos/strata/craters/ice |
| 8 | `pontus` | Neptune | NEW ice giant; vivid + dark storm | giant machinery |
| 8a | `errans` | Triton | retrograde captured — `frame:'parentEq'`, iDeg≈157 (close-in: the parent's oblateness owns its precession); cantaloupe-lite | polygons + sublimation + tholin |
| belt | `vesta`, `ordo` | Vesta, Ceres | exists; NEW ordo = bright-spot craters | figure; craters + fresh + ice |
| KBO | `pluto`+`navita` | Pluto/Charon | **barycenter pair** (K5), unhidden; navita's polar tholin cap needs the family's new placement-axis knob | exists; navita = tholin (polar) + lineae |
| KBO | `haumea`, `arrokoth` | — | exist, re-homed onto real-analog KBO elements | — |

- **Reuse-first law:** a new body may not add a process family if a data
  configuration of shipped families passes the panel. Family *knobs* are the
  sanctioned middle ground (the round-16 bedforms-`axis` precedent): the one
  named for the roster is **tholin placement-axis** (`longitude province |
  polar cap`, byte-identical default) for navita. Genuinely new looks are
  bounded to Phase B or the register (fornax plume deposits/emission, candor
  plumes, oblate giant figure+atmosphere).
- **Insolation-driven context (named work item).** Baked context temperature
  is latitude-only today (`bakecore.js:487`); this item makes the context
  process consume the recipe's orbit/axis data (orbit-averaged insolation per
  latitude — closed-form in the elements, still camera- and time-independent,
  so the bake stays pure). This is what makes "editor moves a planet outward
  → its climate cools" *true at the bake level*, and it is the only new
  bake-input class in V3 — it ships with its own invalidation-taxonomy row
  (Phase E), its own expected-delta class for the Re-Pin, and a contract-test
  prefix run. Without this item, orbit edits change *no* baked field —
  which is also acceptable; the roadmap ships it because the editor's
  realism story (scope contract #2) is hollow without it.
- **Elements are real-analog:** a, e, i, rates transcribed from the real Sol
  values under the K1 sign conventions — except resonance-group members,
  whose a derives from the pinned λ̇ ratios (K3; transcribe e, i, rates,
  epoch longitudes only). The fiction is in the worlds, not the mechanics.
- Orbit-consuming bakes are exactly enumerable and small: cloud keyframes for
  storm/hood decks (`seasonSamplerFor`), plus the new insolation-context
  item. The Re-Pin's expected-delta classification enumerates precisely
  these — everything else on a re-homed body must bake byte-identical, and a
  delta outside the enumeration is a *finding*, not an expectation.
- Each new body ships: recipe + palette, disc bake, angular-budget check
  against the K-slot sky, one registered scene (icon or breakpoint), panel
  review against its reference-analog imagery (R1 additions below).

**Exit:** `sol` boots inside Phase C budgets; per-body panel sign-off vs
analog references; the Re-Pin event landed (every delta pre-classified from
the enumerated orbit-consuming list); family-portrait icons live; baseline
re-promoted on `sol` with system-stamped provenance.

**Round 22 status — COMPLETE (2026-07-12).** `src/core/sol.js` now ships
`sol-system@b89f5b85`: 31 bodies on one closed-form frame tree, including all
20 new data recipes, eight real-analog planetary conics and secular rates,
the 4:2:1 Iovis resonance group, the Pluto/Navita barycenter, parent-equator
moon planes, the retrograde Errans orbit, and Caelus's sideways pole/faint
ring. Every added body reuses the shipped process registry; the suite proves
the 11 retained surface recipes are identical after removing the explicitly
classified mechanics/visibility/insolation inputs. The only family extension
is the byte-compatible `tholin.placement` knob (`longitude` default, `polar`
on Navita). `core/insolation.js` supplies deterministic fixed-quadrature,
latitude-resolved orbit-average flux to opt-in context processes; moving a
recipe outward now cools the baked field and increases its ice coverage.

The Re-Pin classification is committed in
`harness/baseline/repin-sol.json`: orbit lighting/sky, Rubra's seasonal cloud
deck, the named insolation contexts, and new body membership are the complete
expected-delta set. The scene registry adds one icon for each new body (20),
including `iovis-family`, `ring-span`, `caelus-sideways`, and
`pluto-navita-dance`; the R1 manifest adds five NASA/JPL family-portrait,
Jovian, ring-geometry, and Pluto/Charon reference rows. Direct GPU captures of
all 20 added-body icons settled without page errors and were visually audited;
the Caelus pose was moved to Ruina's maximum 4.34° ring opening after that
audit exposed the edge-on conditioning floor; the same pass caught and removed
Vesta's absolute 250-km basin from the two kilometre-scale Mars moonlets, moved
Pontus onto the live giant path, and exposed Ordo's bright crater rays. The environment's no-delegation
rule precluded the roadmap's separate finder/judge agents, so this round logs
the direct contract and rendered-anchor audit instead of inventing panel
verdicts.

Measured on the RTX 5090 GPU tier, the canonical warm-engine `demo → sol`
load reaches first baked terrain in **2.861 s**, completes all 31 discs in
**26.401 s**, holds **162/336** sampled worker tiles with 512 sky-uniform
vectors of headroom, and reports zero page errors. `npm test` passes **20
suites plus typecheck**, including 425 Phase-S roster/disc assertions, five
insolation contract assertions, the 25,778-assertion frames suite, and the
1,070-assertion capacity suite. `npm run test:e2e` remains green through the
11-body tour and `demo → stress30 → demo`. The independent Re-Pin verify passes
**7/7 fast** and **3/3 full-quality** scenes under `sol-system` provenance
(2 fast scenes pixel-identical; every other metric inside its committed
envelope).

## Phase N — The navigable system (`apps/system.html`)

The flagship Fable round: host frames, precision at AU scale, the missing
ladder rungs, and the one-take descent. The new app page is the V3 starter;
`inspector.html` remains the debug shell over the same engine.

### N1. Host frames & the system view

- The camera's host becomes **any node of the frame tree**. Two frame
  classes serve it (K5): surface/orbit cameras stay in the rotating
  body-fixed frame exactly as today; **system hosting and travel use the
  non-rotating body-centered (or root/barycenter) frames** — easing a path
  in a rotating frame would spiral it. Render world = host frame,
  camera-relative doubles, origin unchanged. On root/barycenter hosts the
  engine consumes `ephemerisAt(node,t)` (K5) — there is no "current body".
- Pivot-orbit camera on non-surface hosts (target point, range, yaw/pitch);
  **every clamp derives from the loaded system** (range max ≈ margin × the
  host's outermost descendant apoapsis — the same quantity `camera.far`
  scales to; range min ≈ the host's characteristic scale) — no literal AU
  constants (the Replace-ledger law).
- **True scale, honestly presented.** From 40 AU every body renders through
  the Phase C point tier at correct flux; the ≤K resolved discs are the
  near-field exception. The *UI* carries findability: orbit lines, markers
  (screen-space, analytically occlusion-tested), labels on hover, click
  targets with generous pick radii. No scaled-up planets, no compressed
  distances — CONCEPT's honesty is the product's identity.
- **The starter view**: `sol` from ~35° above the ecliptic, all planet
  orbits + the moon systems of whatever's in view, time running at the
  highest rate the shipped time-field machinery survives — **≤ 43200×
  (today's ceiling) until Phase W lands the warp policy**, then raised to
  the ~1e5× "inner system visibly moves" default. (Shipping N at 1e5× would
  strobe the cloud keyframes W exists to fix — the dependency is stated,
  not discovered.)

### N2. Orbit lines `[system]`

- Sampled analytically from the *same* element evaluation as the ephemeris
  (never a stored polyline — an edited orbit redraws by construction),
  adaptive in true anomaly (dense at periapsis), computed in doubles,
  uploaded camera-relative per frame (the `applyCamera` rebase pattern).
- **Occlusion is analytic and representation-independent:** line samples
  test camera→sample segments against the co-visible body list
  (finite-distance ray-sphere — the `stars.js:104-105` form; the angular
  companion test would wrongly erase near-camera arcs). A line hidden behind
  a body is hidden identically whether that body is a disc or resident tiles
  — otherwise the occlusion answer would flip at exactly the N4 rung (§5's
  "appearance must not depend on which representation renders it", applied
  to `[system]` geometry). Overlay only where the body is sub-line-width.
  Lines are excluded from N5 metering.
- Moon orbit lines fade in with approach to their parent (screen-footprint
  keyed — presentation, never world). A body's current-epoch marker rides
  its line; at high warp the line itself visibly precesses (it is a pure
  function of t).

### N3. Click-to-travel & the frame handoff

- Click → `travelTo(bodyId)`: an eased path in the **non-rotating** departure
  host frame out to disc scale, a **mid-flight host handoff**, and an eased
  arrival into the target's OrbitalCamera at its recipe default pose.
  Duration ~log(distance), user-scalable, skippable (hold = 4×). **Travel ×
  warp law:** warp clamps to a declared ceiling for the travel duration and
  restores after (an eased path through a fast-forwarded system is otherwise
  unsolvable UX and untestable geometry).
- **The handoff law:** the host frame may change only when *both* endpoints
  render sub-ladder (discs/points — no live terrain on either), so exactly
  ONE PlanetTiles residency ever exists (the dual-residency window is
  *worker-cache only*, per the strategic checkpoint), and the handoff
  frame's rebase is atomic across every subsystem in one frame (camera,
  uniforms, star occluders, shadow pass, metering seed) — a partial rebase
  is the §9 dual-representation bug by definition and gets a named assert
  (`assertAtomicRebase` in debug builds: re-derive two invariant vectors in
  both frames, compare at ULP scale).
- **Prewarm warms the right realms.** Worker-side: the target's root
  pyramid, disc, cloud keyframes at background priority (per-body worker
  caches make revisits cheap) — **plus rock/formation pack generation moved
  into the worker** (rockcore/meshcore are pure core modules; today
  `makeRockSet`/`makeFormationSet` run ~1 s synchronously in the PlanetTiles
  constructor, `tiles.js:228-271`, which would hitch the arrival frame).
  Main-side: MS LUT, material/program warming via `renderer.compileAsync`,
  and a persistent coarse-residency layer so prewarmed bakes have a home —
  today `PlanetTiles.onBaked` drops replies for non-live bodies
  (`tiles.js:403`) and the cache dies with the instance. Prewarm state feeds
  the settle predicate.
- After the handoff the target body **is the host**, and today's paths
  structurally exclude a host self-representation (ephemeris skips self,
  `frames.js:59-61`; discs are companion-only; scatterInline treats the host
  as the enveloping medium). N4's approach rung therefore names the
  **self-disc** — the host rendered as a positioned disc until resident
  tiles take over — as a first-class representation with its own hand-off
  inventory row.
- `lookAtBody` generalizes to any body id including the star — today it
  aims only at non-skyHidden companions of the current body (`main.js:1253`
  searches `eph.others`; the disc renders only if the target makes the
  top-4 slice at `main.js:918`).

### N4. The missing §11 rung: disc → resident tiles

- Quantify, then police, the transition the V2 ladder never needed: the
  256×128 disc atlas is texel-honest to roughly a 64-80 px disc; beyond
  that, root/coarse tiles must be feeding the real terrain pipeline. Ship as
  a screen-footprint-keyed crossfade (self-disc ↔ tiles), **mean- AND
  variance-preserving** (§7's full law — a crossfade between imperfectly
  correlated representations collapses contrast mid-blend, the round-15 F1
  "variance collapse" class at planetary scale). Correlation is maximized by
  construction: the disc's transition-tier appearance derives from the same
  root tiles the coarse rung renders (§11's "disc albedo from the root
  tiles", extended to the shading terms that currently differ). The
  threshold is a build constant pinned by a new **approach-ladder breakpoint
  scene per body class** (rocky, giant-with-rings, figure) scored on pop_p99
  *and* a contrast/variance metric across the fade.
- Giants approach to a deck floor: descent clamps at a recipe `minAlt`
  (walk-on decks stay registered); the disc→limb→sky transition must still
  read as one object (the live giant synthesis already evaluates at any
  range — the rung is only about *terrain* residency, which giants skip).

### N5. Exposure & the sun `[camera]` `[sky]`

- The system view breaks the metering servo's body-coupled assumptions —
  the expSeed/WB proxy stands at the current body's ground point
  (`main.js:1172-1198`, re-armed per teleport at `:1485`) and metering gates
  on `stats.baked > 0` with a surface-tuned night anchor
  (`main.js:1278-1308`). V3 adds a **view-class metering law**:
  surface/orbit views keep the servo; system views use disc-flux metering
  (meter on the brightest discs + sun glare, night-anchored), with fixedEV
  available everywhere for gates. **Continuity at the class boundary is part
  of the law:** the two laws' targets blend over a declared window (or the
  incoming law seeds from the outgoing autoExp with a rate-limited target),
  and continuous travel must *not* take the teleport `expSnap` path
  (`main.js:1484-1485` — that snap stays correct for dropdown/editor
  teleports only). The one-take gate scores exactly the frames where the
  class switches; an exposure step there is a finding, not a surprise.
- **The sun becomes renderable**: a limb-darkened disc through the same
  §8/§10 machinery (it already *is* the sole luminous authority — this is
  the §11 ladder applied to the star itself), correct angular size
  everywhere, PSF glare from the camera, eclipse geometry unchanged. Surface
  descent to the star is a non-goal (travel floor derived from the star's
  recipe, not a literal).

**Exit:** the **one-take gate**: a scripted continuous run — system view →
click tellus-analog → travel → arrival → descent to eye level on a shore —
captured under the deterministic stepped clock with pop_p99 within its
pre-registered budget across the handoff, the metering-class switch, and the
ladder rung, zero page errors, zero asserts. Plus: system-view icon scenes
settle and pass the golden-tier tolerance gate; **the bench control set
gains a system-view control class** (randomly posed host/target/range/epoch
draws with closed-form expected-delta classification — the anti-overfit
instrument extended to the new camera surface, not just fixed poses);
`test/nav-test.mjs` green (host-rebase invariance at random epochs/hosts to
ULP-scale tolerance, orbit-line sampler convergence + periapsis density,
picking round-trips, travel-path continuity under the stepped clock);
N2/N3/N4 breakpoints registered; input-scripted click-to-travel e2e green.

**Round 23 status — COMPLETE (2026-07-13).** Phase N now ships the V3
starter at `apps/system.html` over the same `createEngine` instance as the
inspector. `src/core/navigation.js` owns the renderer-free laws: tree-derived
camera clamps, non-rotating host-relative doubles, nested periapsis-dense orbit
sampling from `frames.js`'s resolved elements, finite camera→sample sphere
occlusion, marker projection/picking, log-duration travel with the 43200×
ceiling, the single atomic mid-flight rebase assert, the 64–80 px approach
window with correlated mean/variance preservation, and log-exposure class
blending. `src/render/systemview.js` uploads bodies/orbits camera-relative each
frame, renders the star with an angular-size limb/PSF sprite, meters the body
point tier from disc-integrated flux, fades moon systems by parent footprint,
and leaves findability to analytically occluded UI markers rather than scaled
world geometry. Root, barycenter, and body hosts all use the same frame tree.

Click travel prewarms the target disc/cloud/root pyramid, moves rock and
formation pack generation into the worker, retains coarse roots on the main
side, keeps exactly one `PlanetTiles` residency, exposes the target self-disc
through the second half of the host handoff, and arrives through the existing
surface renderer without taking the teleport `expSnap` path. The app exposes
search, true-scale markers, hover labels, the current 43200×-capped clock,
drag/wheel pivot controls, Shift-held 4× travel, return-to-system, and a
continuous `descendToSurface` path. `harness/nav-scenes.json` registers the
system icon, finite-occlusion/handoff breakpoints, and 64/72/80 px rocky,
giant-with-rings, and figure approach classes; the bench now exports seeded
host×target×range×epoch system controls with closed-form Re-Pin classification.

Verification on the final SOL hash `b89f5b85`: `test/nav-test.mjs` passes 1,037
assertions; the one-take browser gate settles 32/32 markers plus four randomized
system controls, clicks Tellus through the real canvas pick path, performs one
host switch, continuously descends to the registered shoreline, returns to the
root host, reports zero page errors/asserts, stays at the 336 worker-tile cap,
and records `pop_p99 0.91803 < 0.98` with a `0.6541 EV < 8 EV` class-boundary
step. The complete Node gate passes 21 suites plus typecheck in 175.3 s; the
legacy browser tour remains green in 128.2 s; golden verification remains green
at 7/7 fast and 3/3 full (one fast scene pixel-identical). The requested
pre-code multi-agent panel was not invoked because this environment explicitly
forbids delegation unless the user requests it; the contract and rendered icon
were audited directly instead.

## Phase W — Time: one epoch, a warp ladder, honest long scales

Small in code, load-bearing for the product; Opus round with a pre-code
panel on the policy-table design and a standing Fable-flag (an emergent
artifact surviving two fix attempts escalates per V2 rule 2).

| Item | Home | Mechanism |
|---|---|---|
| The slider | app | Signed log warp: pause ∥ ±1 s/s … ±decade/s (≈3.2e8×, the cap — "century/s" exceeds any honest cloud/AE story today and is deferred with the long-scale register), detents at real-time / minute / hour / day / month / year / decade per second; epoch scrub + calendar readout (presentational 365.25-d year over epochS); "now" reset. Persisted in SceneSpec (`epochS`, `warp`). Showcase scenes pin to detents: `node-regression` at decade/s, `laplace-dance` at ~day/s. |
| Warp policy law | `[time-field]` | Every time-keyed subsystem **declares its validity rate band and its above-band representation** in one table (asserted complete against the subsystem list — M5), and **representation selection is a pure function of the spec-declared warp**, never of the live clock's motion — so a frozen capture at declared warp 1e6 renders the above-band representation (the gate can actually see it). Above-band forms are *pure and Jensen-honest*: clouds → the closed-form time-average of the **alpha/optical-depth law, never of coverage** (alpha(mean cov) ≠ mean(alpha(cov)) — the round-15 planetshine lesson, pinned by the same style of Node calibration test); lightning → off above its bucket rate; giant storm drift, seasonal caps, frost, aurora phases → verified closed-form-safe at any rate; ocean/detail time above its aliasing rate → pinned to a **canonical closed-form value per band** (never the value at band entry — a held phase is retained state and breaks capture reproducibility) or dropped to the time-averaged representation with wave-slope variance folded into the glint-lobe roughness (§7's fold, applied over time). Band transitions are rate-hysteretic and mean/variance-preserving — technique changes, never what it converges to. |
| AE under warp | `[camera]` | Sweeping sun at high warp pumps the servo: metering gains a warp-aware time constant, or fixedEV auto-engages above a declared rate — decided by bench, not taste. |
| Capture law at speed ≠ 0 | harness | **Declared-warp frozen-epoch capture**: a spec declares `{epochS, warp}`; the engine renders the representation set for that *declared* warp at that exact closed-form epoch (never "freeze whenever the wall clock fired") and settles — running-world scenes become gateable without racing a live clock, and the same spec reproduces bit-honestly on any machine. Same-epoch A/B gates render below-band vs above-band representations at the transition rate and pin their agreement (the mean/variance-preservation twin, as an image gate). |
| Band-edge gates | harness | `warp-cross-{clouds,detail,lightning}` motion scenes: scripted warp sweeps through each declared band edge in both directions with pre-registered pop_p99/flicker_energy budgets at the crossing — the canonical failure (pop or oscillation exactly at the switch rate) must be *observable*, and fixed detents deliberately between band edges cannot see it. Plus the detent ladder scenes (fixed camera, every detent, pre-registered flicker budgets). |
| Node suite | test | `test/warp-test.mjs`: policy-table completeness as a test; the hysteresis state machine (up/down switch rates differ, no oscillation at a held boundary rate); the analytic cloud time-average equals the keyframe-law mean to a pinned tolerance (the Jensen twin); canonical frozen-phase purity (two evaluations at the same (epochS, warp) are identical). |
| Showcase scenes | bench | `laplace-dance` (Galilean-analog conjunctions), `node-regression` (luna-analog orbit line precessing at decade/s), `cinis-day` (3:2 resonance: 2 years = 1 solar day), `perihelion-seasons` (rubra dust season vs Ls). Icons — the *product proof* that the K machinery is real and visible. The starter view's default warp rises to its Phase N target here. |

**Exit:** detent ladder + band-edge crossings green within pre-registered
budgets on both `demo` and `sol`; `test/warp-test.mjs` green; policy table
asserted complete; showcase icons panel-reviewed; the bench control set
gains a **warp control class** (random epoch × declared-warp draws under the
capture law); no unsettleable state at any detent.

**Round 24 status — COMPLETE (2026-07-13).** Phase W ships as
`src/core/warp.js` — the signed detent ladder (pause ∥ ±1 s/s … ±decade/s ≈
3.16e8×, the cap), the eleven-row policy table asserted complete at module
load against the canonical subsystem list, band edges pinned strictly between
detents (lightning 240×, ocean 600×, aurora 10,000×, clouds/AE 46,000× — the
proven 43,200× Phase N ceiling stays below-band), pure representation
selection as a function of the DECLARED warp, and a live hysteresis machine
(×1.12 bracket) that every capture/apply resets to the pure selection. The
SceneSpec gains `warp` and the capture law is real: `__shot` freezes the
clock while the declared warp selects the representation set, so gates render
above-band forms deterministically. Above-band clouds are the Jensen-honest
closed-form time-mean — an *equivalent coverage* inverted through the disc
alpha law, drift-ring-averaged for drifting decks, evaluated over a
season-local evolution block (the perihelion story survives at month/s),
generated worker-side (`cloudmean`, generation-stamped, feeding the settle
predicate) and packed with both keyframe slots equal so the unchanged
samplers render the exact mean; cloud rows are kind-tagged so a mean raster
can never render as a keyframe pair after a downward crossing. Lightning
gates off above its bucket band; aurora pins to canonical drift 0 / mean
pulse 0.55; ocean wave time pins to the canonical constant 0 (never
band-entry); the AE servo's time constant stretches by √(edge/rate) above its
band. Time is signed (negative warp runs the same closed-form world back),
`system.html` gains the detent slider, epoch jog scrub, 365.25-d calendar
readout, "now" reset and the `validYears` "extrapolated" tag, and the starter
warp rises 43,200× → 86,400× (day/s) with the travel ceiling unchanged.

The pre-code policy-table panel was performed as a direct contract audit
(the standing no-delegation precedent). Its load-bearing findings, all
folded in before code: purity vs hysteresis reconciled by confining
hysteresis to the live slider path with reset-to-pure on every apply; the
shared cloud-atlas rows demanded kind-tagged rows (the F2
stale-representation class); the live path's k−1 rollover fallback needed the
mean rows' `k = −1` sentinel; the frame loop's `speed > 0` guard silently
discarded negative time; `cloudmean` had to feed the existing settle counter;
and warp 0 had to select every live path arithmetically unchanged so `demo`
golden stays the instrument.

Verification: `test/warp-test.mjs` passes 447 checks (table completeness,
edges-off-detents, no oscillation at a held boundary rate, reset ≡ pure
selection over 200 random draws, the Jensen twin within 0.035 absolute with
the naive alpha(mean cov) provably overshooting the saturating deck, byte-pure
mean-raster regeneration, frac-lerp identity, seasonal-mean domination, and
deterministic warp controls). `harness/warp-e2e.mjs` pre-registers its
budgets (measured ×1.5 + floor, committed in `harness/baseline/warp.json`)
and passes 16/16 gates on the GPU tier across BOTH systems: the five-detent
stepped-epoch ladders under live AE, and the three band-edge crossings in
both directions with return-leg deltas of exactly 0 (no retained state),
same-epoch below/above mean-luminance deltas of 0.007 (demo) / 0.014 (sol) on
the clouds edge, and per-frame STRUCTURAL representation checks (cloud row
kind, lightning rate uniform) all clean — added after an 8-bucket probe
showed the pinned lightning epoch's flash cells dark at both exposure
regimes, so the off-above-band law is enforced by a deterministic uniform
check rather than a stochastic flash. The bench control set gains the warp
class (2 random epoch × declared-warp draws from the cloud-bearing pool,
schema-validated, classifier-classified); the 8 committed seed-20260712
controls stay within tolerance, and the class enters the gated baseline at
the next promote. Showcase icons rendered and directly audited: `laplace-dance`
(Iovis-hosted Galilean orbits at day/s), `node-regression` (luna's inclined
line at decade/s), `cinis-day` (its wash confirmed identical at warp 0 and
matching the round-22 icon), and `perihelion-seasons` whose month/s capture
renders the season-local dusty pall while an off-season control shows clear
provinces — the Jensen mean visibly working. Full battery: 22 Node suites +
typecheck green; `test:e2e` green; the Phase N one-take nav gate green at the
new starter warp; golden 7/7 fast + 3/3 full-quality green with three shots
pixel-identical — warp 0 is byte-identical by construction.

*Post-round defect (user report, fixed 2026-07-13): "planets not aligned with
the orbits."* Diagnosis by measurement: markers sit on their own projected
rings to ≤3.5 px at every probed pose with the clock running, but
`SystemView.rebuildOrbits` anchored each cached orbit polyline to its
**parent's position at build epoch** and rebuilt only every 4 world-days — so
a moon's (or barycenter member's) ring lagged its parent by up to 4 days of
heliocentric arc. Invisible below Phase N's 43,200×; at the new day/s starter
the reproduction showed luna's ring floating 255 px off tellus. Fix: rows
carry `buildParent`, and the per-frame upload (and the analytic occlusion
test) translates samples by the parent's *current* minus build-epoch position
— the cache keeps only the secular-slow shape, and the ring rides its planet
every frame. Verified: the current-epoch luna ring pixel-tests lit under
tellus at day/s (57/65 samples, remainder occlusion-cut); the one-take nav
gate and typecheck stay green.

*Second report ("still seems broken"), same day — the true root cause of the
user's screenshots:* `SystemView.render()` passed **drawing-buffer**
dimensions to `renderer.setViewport`, which multiplies by the pixel ratio
internally — on any dpr>1 display (Windows scaling) the whole GL scene
(rings, points, stars) rendered dpr× oversized about the lower-left corner
while the DOM markers stayed at their correct CSS positions: every ring and
dot detached from its body. Invisible to the entire gate battery because the
harness pins deviceScaleFactor 1 AND `?fast=1` forces pixelRatio 1 (the
engine's own `renderPass` was already correct — it sizes from `viewportSize`
in CSS px). Reproduced exactly at dsf 1.25 on the no-fast user path; fixed by
passing `clientWidth/clientHeight`; verified aligned at dsf 1.25 and 2.0. The
blind spot is now a standing instrument: `nav-e2e` gains a **HiDPI
ring-registration check** — dsf 1.5, no fast, ≥60% of each probed planet's
in-page-predicted current-epoch orbit curve must be lit in the rendered
pixels. The check was adversarially proven to observe the failure (a
window-around-marker first draft passed under the bug by coincidence and was
rejected; the curve-coverage form reads 6-21/129 under the reverted bug and
129/129 fixed).

## Phase E — The editor (prove live edit & generation)

Deliberately modest UI over a rigorous mutation path. Opus round.

| Item | Home | Mechanism |
|---|---|---|
| Invalidation taxonomy | `[editor]` | Every recipe datum classed by cost, in one table (asserted complete against the schema — including ephemeris-*derived* consumers): **orbit/spin** → frames + **cloud-keyframe re-request for storm/hood decks** (their season sampler reads the elements) + **insolation-context bands if Phase S shipped them** (band-selective, the existing machinery) — "zero rebake" is true only for bodies with neither; **palette/discAlbedo/brdf/atmosphere** → uniforms + disc re-bake + LUT rebuild; **processes** → existing band-selective path; **clouds** → keyframe re-request; **figure/R/seaLevel** → full body rebuild (the switchBody primitive, reused); **system membership** → setSystem. Every edit rides the Phase C generation-stamped protocol — the stale-reply class is structurally dead. |
| Edit-continuity law | `[editor]` `[frame]` | Editing elements at running t must not teleport the body: the editor re-solves the epoch anomaly so the body's **current mean longitude is preserved** at the edit instant — the orbit reshapes around where the body *is*. (Radial position may still step when e/a change — accepted, documented; λ-continuity kills the jarring 90%.) |
| Preflight, always | `[editor]` | Every apply runs the full assert battery (palette/figure/giant/ring/cloud recipes, μ-law incl. the barycenter relative form, e/i ranges, resonance-group consistency incl. the no-authored-a rule) against a *copy* before touching the live system — a bad edit reports in-panel and changes nothing (the dispose-then-brick law, now user-facing). |
| The panel | app | Body tree (grouped by parent); per-body: orbit elements + rates, spin/pole, R, GM, seaLevel, palette colors, process toggles + seeds, per-family knobs — validated numeric fields, sliders only where ranges are honest; add body (clone from family templates: rocky / icy moon / giant / figure), delete (with orphan re-parent check); star luminosity/spectrum; reseed (the casting.mjs recipe, in-app). |
| Persistence & reproducibility | `[editor]` engine | Edited systems serialize as recipe JSON: export/import file, localStorage autosave, and — the load-bearing part — **`spec.system` carries an inline recipe payload (or its recipeHash resolvable from the payload registry — the same hash Phase 0 stamped into provenance)** in SceneSpec, bookmarks, and F8 defect captures, so *any* pose in *any* edited system reproduces headlessly. The harness resolves `spec.system` before applying. |
| Edit-isolation gate | harness | The editor's flagship correctness gate: scripted edit of body X → every *other* body's tile hashes, disc bytes, and control metrics unchanged (bit-level where the compat path applies, tolerance elsewhere); X's own deltas classified from the edit's declared taxonomy class. |
| Live≡reboot contract | harness | `edited-system-reboot`, defined precisely: scripted edit applied **live** → settle → capture; **cold boot** resolving the exported `spec.system` payload → same SceneSpec (same epochS/pose) → capture; frames equal within the per-tier capture envelope. Byte-equal bakes alone would pass with stale sky/LUT/slot uniforms (the F2 class this gate exists to catch); the contract is *frame* equivalence. Plus a fuzz suite: random schema-valid edits never throw past preflight, never brick, never leak across bodies. |

**Exit:** edit-isolation + fuzz + live≡reboot suites green; a scripted
"build a planet live" demo (add body from template → edit orbit → travel to
it) runs as an e2e; the taxonomy table published in DESIGN.md.

**Round 25 status — COMPLETE (2026-07-13).** Phase E ships `src/core/editor.js`
— the pure mutation laws — plus the engine dispatch and a deliberately modest
panel in `apps/system.html`. The invalidation taxonomy classes every recipe
datum (`presentation / look / clouds / mechanics / processes / rebuild /
system`), is asserted complete against the shipped schemas at module load and
against every edited payload in preflight, and is published in
**docs/EDITOR.md** (DESIGN.md was retired in the docs reorg; EDITOR.md is its
successor). The classes are honest to the code: bakecore reads seaLevel and
`rocks.latticeLevel` into tile bytes (→ rebuild) but never palette/brdf/water
(→ look, a warm-cache re-bind with zero worker rebake); the only ephemeris
consumers of a bake are seasonal storm/hood cloud keyframes (→ mechanics
cascades to DESCENDANTS, whose sunDirBF rides the parent chain) and authored
insolation contexts (→ band-selective from the context's shallowest band).
`__editSystem` runs λ-continuity → preflight-on-a-copy → classifyEdit →
dispatch, riding ONE generation bump: a new worker message class
`{type:'body'}` replaces a single roster entry and invalidates exactly what
the class names while every other body's baker stays warm. The edit-continuity
law re-solves the epoch anomaly wherever the RESOLVED mean longitude would
change — element edits, parent-GM edits, star-GM edits, barycenter outer and
relative orbits alike (probed through frames' own resolution, exactly linear
in M0) — so an edit at running t reshapes the orbit around where the body is;
resonance members are never re-solved (their phase is group data). An edit
never moves the clock, and a current-body rebuild preserves the camera pose
verbatim. Edits that die in-flight can no longer wedge the settle predicate:
applyEdit re-derives every async pipeline counter under the new generation.

Reproducibility: `spec.system` now accepts a canonical id string (resolved
through an engine registry) or an inline recipe payload; `applyScene` resolves
it before posing, and every capture surface — `__capture()`, bookmarks, F8
defects — embeds the payload automatically whenever the loaded hash is not a
shipped one. The panel (body tree grouped by parent, orbit/spin/GM/R/seaLevel
fields, palette colors, process toggles + seeds, star luminosity, add-from-
template / clone / reseed / delete with an orphan reparent-or-cascade choice,
JSON export/import, localStorage autosave) holds no authority: every commit
clones the live recipe, mutates the clone, and hands it back through the one
preflighted path — a refused edit reports in-panel and changes nothing, which
the DOM probe proved with an e=2.5 commit through the real input.

Verification: `test/editor-test.mjs` passes 697 checks (taxonomy closure on
both systems, classification laws incl. the synthetic storm-deck env cascade,
λ-continuity across legacy/conic/secular-rate/parent-GM/barycenter forms plus
the non-tautological circular-direction witness, preflight copy law, template
determinism, delete guards, 150-edit valid fuzz with zero refusals and zero
input mutation, 7-form invalid fuzz with named refusals). `npm test` passes
23 suites + typecheck. `harness/editor-e2e.mjs` passes all gates on the GPU
tier over `sol`: **edit-isolation** — a three-class edit of rubra
(look+mechanics+processes) left every other body's disc row hash and a luna
control frame BYTE-IDENTICAL while rubra's own disc changed;
**live≡reboot** — the edited-world frame equals a cold boot resolving the
exported `spec.system` payload byte-for-byte (envelope measured in-run from an
A/A recapture, ×1.5 + floor); **fuzz-lite** — six random live edits with zero
page errors, an invalid edit refused by name with the live hash untouched;
**live-build** — Novus added from the rocky template at 2.2 AU (a classified
membership edit), its orbit edited live, then travelled-to and orbited with a
reproducible capture (`sol-system@1f5a54a9`). Standing gates stay green:
`test:e2e` (11 bodies + tour + stress-30), golden 7/7 fast + 3/3 full-quality
(1 pixel-identical — render-neutral), the Phase N one-take nav gate (pop_p99
0.813, HiDPI rings 129/129 ×3), the Phase W battery (16/16 detent + band-edge
gates on both systems, return-leg deltas exactly 0, structural checks clean),
and `bench --controls-only` within committed tolerance (10 controls, seed
20260714 — the gate form rounds 23/24 used).
*Harness residue (rule 3, not a Phase E defect):* the full-scene bench sweep
at default parallelism (8 pages) can blow `crater-rim-walk`'s 300 s settle
ceiling and even 300 s page boots — the same scene settles in 6–12 s solo,
sequenced, and paired after `rubra-dune-sea`; mid-sweep boots were measured at
126–219 s under contention. Queued: contention-aware settle deadlines (or a
lower default width) for full sweeps.

## Phase B — Belts, comet, stretch looks (optional closeout)

Asteroid/Kuiper belts as §7 scatter over an orbital density field (CONCEPT
§11's "an asteroid is a fact of the system" — existence hashed on orbital
cells, rendered through the Phase C point tier, never landable); one comet on
the K1 machinery **with the comet solver class** (K7: own fixed-count policy,
own eMax assert, perihelion-corner gate) + coma/tail as an emission look
(registered since round 18); fornax plume deposits / candor plumes / oblate
giant figure+atmosphere / ring spokes — each ships only if its panel row
passes on data, else stays registered. Nothing in Phases 0–E depends on B.

**Round 26 status — COMPLETE (2026-07-13).** Phase B ships the V3-16 register
row plus the round-25 residue, closing the V3 execution plan.

*The comet solver class (K7's registered trigger, built).* `orbit.solver =
'comet'` in `core/frames.js`: Mikkola's cubic corner starter + ten fixed
Halley steps — no convergence predicate varies the work. The sweep gate
(`test/smallbody-test.mjs`) pins machine epsilon over e ∈ [0, 0.9999] × M
including log-spaced perihelion-corner probes to M = ±π·10⁻¹² against a
200-step bisection reference (measured worst scaled residual 2.2e-16 ≈ 1 ulp);
the same gate proves the ban is real — the K1 8-step Newton's corner residual
is 5.9e-6, ten orders worse. The e-ceilings are both strict recipe law:
`KEPLER_E_MAX` refusal now NAMES the opt-in, `COMET_E_MAX = 0.9999` is
exclusive, resonance members may not claim the solver.

*The comet.* `cometa` joins sol (32 bodies, `sol-system@25885364`):
real-analog Halley elements (e 0.96714 — past the K1 ceiling by design,
i 162.26° retrograde, period 75.32 y, perihelion 0.586 AU / aphelion 35.08 AU,
both radii exact by the corner solve), a 5 km vesta-family nucleus under the
timor/pavor retune law, and the round-18 registered **coma/tail emission
look**: activity is a pure closed-form function of heliocentric distance
(zero at 3 AU, unit at 1 AU), emission joins the `discIntegratedFlux`
hand-down at the point rung and the system-view row (a perihelion comet
legitimately re-meters the view), and the anti-sunward ion tail renders in
the system view (0.51 AU at perihelion). The resolved-disc coma halo stays
registered — and the gap is proven unreachable: the nucleus never wins a sky
slot from any body at 16 epochs across the full period (Node-asserted).

*Belts as §7 scatter (V3-16).* `core/smallbody.js` owns the pure laws:
member EXISTENCE is hashed on the orbital cell against the authored density
field (elements-knob retunes provably cannot change who exists), elements and
power-law sizes come from the same cell hash, and the Kirkwood gaps are
density rows at the iovis resonances — nothing special-cased. Two belts ship
(main 2.06–3.30 AU with four gaps, Kuiper 42–48 AU; 5,468 + 4,096 members from
6,144 + 4,096 cells) under named budgets (`MAX_BELTS`, `MAX_BELT_CELLS`,
`BELT_E_CEILING = 0.4` — the bound the in-shader fixed-count solve is verified
to). Rendering is one instanced pass per belt in the system view: the GLSL
vertex shader evaluates the closed-form conic at the CURRENT mean anomaly
(CPU-wrapped in doubles per frame, so GPU float time precision never enters),
with gain gamma-normalized within the belt class (documented display
transform — ordering preserved; the view is presentational like its orbit
lines). The radiometric sky pass omits belts BY THE FLUX LAW, not by flag:
the pinned floor shows the brightest possible member at a 0.01 AU flyby stays
an order below the faintest catalog star. Belts are never landable
structurally — they are not bodies, so no marker/travel/menu surface exists.

*Editor closure.* Taxonomy rows `coma → look` and `belts → system` keep the
M5 completeness assert green; preflight validates belts and comas on the
copy; λ-continuity holds under comet-orbit edits (solver-independent, tested);
`spec.system` payloads carry belts + coma through export/import/capture.

*Gates.* `test/smallbody-test.mjs` (1,159 assertions) covers everything
above. `harness/smallbody-e2e.mjs` (GPU tier) passes all three gates first
run: **belt-span** — the rendered belt lies on 137/137 member positions
re-evaluated independently in JS (a CPU-vs-GLSL A/B, the hidpi specific-curve
law applied to scatter) and belts add zero markers; **comet-perihelion** —
coma glows at the nucleus and the tail renders along 14/14 predicted
anti-sunward ray samples at the solved perihelion epoch, with the aphelion
negative control tail-free; **land on the comet** — travel from the system
view to the nucleus surface with zero page errors (the surface capture was
visually audited: bilobed cratered ellipsoid). Both scenes are registered in
`harness/nav-scenes.json`.

*The re-pin (classified, membership-only: `b89f5b85` → `25885364`).* Golden
re-captured and diffed against the PREVIOUS pin under the standing tolerances:
every retained scene inside the envelope, 4 pixel-identical (max delta
titan-lakeshore spec_slope −0.064, the known bistable-settle class); the
fresh pin re-verifies 7/7 fast + 3/3 full. `nav.json` re-pins markerCount
32 → 33 with every budget untouched; nav-e2e passes (pop_p99 0.918 ≤ 0.98,
HiDPI rings 129/129 ×3, icon litFraction 0.295 inside the pinned envelope
with the Kuiper belt now visible at the starter view). Standing battery:
`npm test` 24 suites + typecheck, `test:e2e`, warp 16/16 on both systems
(return-leg deltas exactly 0, structural checks clean), editor-e2e all gates.

*Round-25 residue CLOSED (rule 3).* `renderShots` deadlines are now
contention-aware: every boot/settle deadline scales ×(1 + 0.75·(N−1)) with
the pool width and the protocol timeout is raised to cover the longest
blocking `__shot` (deadlines exist to fail loud, not to pace healthy runs).
Proven by the previously-impossible artifact: the FULL 128-shot sweep at
8-page parallelism completed with zero unsettled/zero errors and controls
within committed tolerance — while absorbing measured mid-run boots of
891–1,398 s and a 414.7 s scene settle, each of which would have killed the
old flat 300 s ceilings. The round-25 failure class was the deadlines, not
the scenes.

*Stretch looks stay registered.* Fornax plume deposits, candor plumes, the
oblate giant figure+atmosphere, and ring spokes ship only on a passing panel
row by decree; this environment's no-delegation rule precludes the
finder/judge protocol (the rounds 21/22 precedent), none has a data-only
configuration ready, and the comet + belts + residue closeout was the round's
honest scope. Each remains in the register with its trigger.

---

## The V3 hand-off inventory (Appendix-C discipline, written now)

V2's law, enforced verbatim: **a new representation may not be added without
a row here.** Every V3 seam, its mechanism, and the scene that polices it:

| Hand-off | Mechanism (phase) | Policed by |
|---|---|---|
| Slot disc ↔ point tier (slot overflow / distance) | demotion down the §11 ladder, flux-continuous, never membership loss (C) | `slot-overflow` breakpoint |
| Self-disc ↔ resident tiles (approach) | screen-footprint crossfade, mean+variance preserving, disc appearance derived from root tiles (N4) | `approach-ladder-{rocky,giant,figure}` |
| Departure frame ↔ arrival frame (travel) | atomic rebase at sub-ladder scale, `assertAtomicRebase` (N3) | `handoff-frame` single-frame diff |
| Surface-servo ↔ disc-flux metering (view class) | target blend over declared window; no expSnap on continuous paths (N5) | one-take exposure-step budget |
| Orbit line ↔ body occlusion | analytic ray-sphere vs body list, representation-independent (N2) | `orbitline-depth` |
| Moon orbit-line fade | screen-footprint keyed opacity, presentation-only (N2) | `orbitline-depth` variant |
| Sun disc ↔ PSF glare | §11 ladder on the star + camera PSF (N5) | `system-exposure-night` |
| Below-band ↔ above-band time representations (per subsystem) | declared-warp pure selection, Jensen-honest means, hysteresis (W) | `warp-cross-{clouds,detail,lightning}` + same-epoch A/B |
| Live edited state ↔ rebooted-from-export state | generation-stamped invalidation + spec.system payload (E) | `edited-system-reboot` |
| Mid-rebake presentation (editor apply) | draw-best-available + generation fencing — stale never renders (C/E) | `edit-isolation-pair` |
| Belt scatter ↔ radiometric sky | orbital-cell existence (pure recipe fn); system-view instanced pass carries the class, the sky pass omits it BY THE FLUX LAW, never by flag (B) | `belt-span` (smallbody-e2e A: CPU-vs-GLSL member positions) + smallbody-test flux floor |
| Coma/tail emission ↔ nucleus point/disc | emission joins the discIntegratedFlux hand-down at the point rung; resolved-disc halo registered (unreachable in shipped data, Node-asserted) (B) | `comet-perihelion` (smallbody-e2e B: predicted-ray coverage, aphelion negative control) |

## Verification plan — V2-grade, per phase

The instruments are V2's; the surfaces are new. Consolidated contract; every
row above already cites it.

**Node suites (all on `npm test`, seconds, no browser):** `frames2-test`
(K), `system-test` (C), `nav-test` (N), `warp-test` (W), `editor-test` (E) —
plus the existing 14 untouched; `demo` keeps them meaningful through every
migration step.

**Scene registry v3 (harness/scenes.json, same anti-overfit protocol —
icons never gate the bench, controls always do; golden-tier tolerance gating
of pinned scenes remains the separate render-neutrality instrument, exactly
as V2 ran both):**

*Icons (product anchors):* `system-portrait` (the starter view),
`iovis-family` (Galilean-analog sky from sulcus, 8 slots occupied),
`ring-span` (saturn from candor, rings + shadow), `caelus-sideways` (98°
pole, faint ring), `pluto-navita-dance` (barycenter mutual orbit),
`laplace-dance`, `node-regression`, `cinis-day`, `perihelion-seasons`,
`one-take-descent` (motion), plus the full V2 icon tier (29 scenes of the
76-scene registry) re-homed onto `sol` at the Re-Pin event.

*Breakpoints (adversarial):* `approach-ladder-{rocky,giant,figure}`,
`handoff-frame`, `orbitline-depth`, `system-exposure-night`,
`warp-cross-{clouds,detail,lightning}`, warp detent ladder, `slot-overflow`,
`two-ringed-covisible`, `edit-isolation-pair`, `edited-system-reboot`.

**Rotating controls extend to every new camera surface** (the anti-overfit
instrument itself, not just fixed poses): Phase 0 makes `buildControls`
pose-class structured; Phase N adds the system-view class (random
host/target/range/epoch draws); Phase W adds the warp class (random epoch ×
declared warp under the capture law); expected-delta classification stays
closed-form and pre-render in every class.

**Motion & running-world gates:** pop_p99/flicker_energy on the one-take
descent, travel paths, warp detents and band-edge crossings — **every V3
motion budget is pre-registered in-round before its gate first runs**,
derived by the LAYOUT method (same-code run-vs-run envelope × safety factor)
or against a declared reference family; the declared-warp frozen-epoch
capture law (W) is the capture semantics for anything at speed ≠ 0, and the
deterministic stepped clock (Phase 0) is the capture semantics for anything
input-driven.

**Image verification (R1 continuation):** the reference corpus grows
system-scale geometry rows — Voyager/Cassini/Juno family-portrait and
ring-geometry frames, Galileo Jovian-system mosaics, New Horizons
Pluto-Charon barycenter sequence, license-verified per the existing manifest
discipline — used exactly as V2 used them: geometry-matched panel
comparisons and art direction for the new roster looks (fool-rate style
panels per new body family; synthetic look-boards never scored against).

**Panels:** V2 rule 1 verbatim — **critique-panel finder/judge agents run on
Opus with Sonnet skeptics regardless of the driver model**; sweeps and
benches are compute, not model. **Pre-code panels run for K, C, N, and W's
policy-table design** (C earns one on the F2-atomicity risk; V2's record —
killers dead on paper five consecutive rounds, including Opus rounds — says
pre-code panels are cheap insurance, not Fable garnish); post-implementation
panels read the shipped diff in every round. Verdicts and dispositions
logged per round as before.

**Gate hygiene sequencing (the migration law, operationalized):** Phase 0
fixes the instruments → K lands under the compat paths (gates never blind) →
C/S re-pin as one classified event on `sol` (system-stamped provenance makes
cross-system comparison a refused error, not a silent one) → N/W/E gate on
`sol` with `demo` retained until each of its unique gates has a successor.

## Sequencing & dependencies

```
0 (extraction + harness debts) ─► everything
K (kepler core) ─► S (elements schema), N (frames/travel), W (epoch/warp), E (μ-law preflight)
C (capacity/setSystem/point tier/protocol) ─► S (sol can't even LOAD past one giant), N (system view render path), E (setSystem + generations)
S (sol recipe) ─► N (the system worth navigating), W showcases
N (navigation) ─► W (warp UI lives in system.html; N's starter warp is W-capped), E benefits (travel-to-edited-body)
B — optional, after S; nothing depends on it
```

Order of attack: **0 → K → C → S → N → W → E → (B)**. W and E are
swappable; N precedes both because system.html is the page they inhabit.

## Execution plan — rounds × model

Standing rules inherited from V2 verbatim: rule 1 (panel finders Opus /
skeptics Sonnet, regardless of driver), rule 2 (escalation on twice-failed
root-cause), rule 3 (Fable rounds queue mechanical residue to the next Opus
round), rule 4 (model-homogeneous rounds).

| Round | Contents | Model | Why this model |
|---|---|---|---|
| 19 | **Phase 0** — createEngine extraction, epoch-time primary (all five sites), SceneSpec unification, provenance fix + system stamp, bench baseline, full-quality golden tier, test:e2e, deterministic input scripting, control-classifier redesign, assets-script dissolution | **Opus** | Well-specified refactor + tooling under an existing golden gate; the one risky item (extraction) is protected by design (byte-compatible bridges, pure move) |
| 20 | **Phase K** — conic elements + rates + conventions, pole axes, resonance/locking (λ̇-pinned), μ-law + barycenter relative form, velocity with frame-drift terms, compat fast-paths, frames2 suite, solver migrations — **pre-code panel** | **Fable** | Precision-critical, everything downstream consumes it, and the failure mode is subtle emergent drift (a wrong frame composition reads as a shader bug three rounds later); the panel already killed four KILLERs in this phase's own spec |
| 21 | **Phase C** — K-slot sky + uniform budget, per-slot giant/ring, all-bodies point tier, 3 occluders, setSystem + generation-stamped protocol, id→layer maps, worker-topology decision + boot JIT queue, discLoaded fallback, cross-body worker budget — **pre-code panel** | **Opus** | Mechanical lifts with named asserts; the F2-class atomicity risk is exactly what its pre-code panel covers; escalation rule stands if an emergent artifact resists two attempts |
| 22 | **Phase S** — the `sol` roster (elements transcription under K conventions, ~20 new recipes on reused families, the tholin placement knob, insolation-context item, palettes, discs, angular budgets), family-portrait icons, R1 corpus additions, **the Re-Pin event** | **Opus** | Recipes are data by design; the panel carries the look burden; re-pin is process discipline, not invention |
| 23 | **Phase N** — non-rotating host frames, system view over the point tier, orbit lines with analytic occlusion, markers/picking, travel + atomic handoff + prewarm (worker-side packs), self-disc rung, metering continuity law, sun-as-body, nav-test, system-view control class, one-take gate — **pre-code panel** | **Fable** | The flagship: two new representation hand-offs (the canonical pop factories), AU-scale precision, and cross-subsystem atomic rebase — the exact class rounds 11/15/17 needed Fable for |
| 24 | **Phase W** — warp slider + detents, the rate-policy table (Jensen-honest above-band forms), AE-under-warp, declared-warp capture law, band-edge + detent gates, warp-test, warp control class, showcase icons — **pre-code panel on the policy table** | **Opus** | Policy + UI + scenes on K's machinery; Fable-flag registered per rule 2 if the cloud time-average or AE policy shows emergent artifacts beyond two fix attempts |
| 25 | **Phase E** — invalidation taxonomy (incl. ephemeris-derived consumers), edit-continuity, preflight-always, panel UI, spec.system payloads, edit-isolation + fuzz + live≡reboot gates, live-build demo | **Opus** | The hard invariants (invalidation, generation fencing) land in C and are Node-tested; this is disciplined plumbing + UI + gates |
| 26 | **Phase B** (optional) — belts on the point tier, comet solver class + coma/tail, stretch looks; plus the round-25 mechanical residue | **Opus** | Data + one bounded new scatter consumer; ships only what passes |

Net: **Fable buys rounds 20 and 23** — the ephemeris core and the navigable
continuum — everything else rides Opus on V2's evidence that well-specified
work has never blown a budget, with pre-code panels at K, C, N, and W.

## Exit-criteria scorecard (per phase)

| Phase | Ships when |
|---|---|
| 0 | Golden 7/7 (pure move); both baselines committed, true system-stamped provenance; e2e + A→B→A (metric tier) green; one defaults table; deterministic-input demo green; five composition sites → one |
| K | frames2 suite green (compat branch-selection 0-ULP on all demo bodies, epoch-sweep overlap, μ-law + barycenter relative form, λ̇-pinned resonance argument stationary at 1000 epochs with secular rates on, velocity incl. frame-drift terms at 1e-9 with per-body FD step); all legacy suites + golden green untouched; find-eclipse reproduces pinned eclipses |
| C | demo unchanged; 30-body stress boot < 5 s interactive / < 60 s all-discs (GPU tier, decided topology); slot/ring/point-tier breakpoints green incl. demotion flux continuity; uniform-storage assert green with headroom; 6-body tour e2e green under the pinned (measured-in-round) worker budget with zero stale-generation artifacts |
| S | sol boots in budget; per-body panel sign-off vs analog references; Re-Pin landed with every delta inside the enumerated orbit-consuming set; family-portrait icons live; insolation-context contract-test prefix green |
| N | one-take descent pop_p99 ≤ pre-registered budget with zero handoff spike and zero metering-class step over budget; approach-ladder breakpoints green per body class (pop_p99 + variance metric); nav-test green; system-view control class live in bench; system-view icons settle and pass golden-tier tolerance; click-to-travel e2e green |
| W | detent ladder + band-edge crossing budgets green (pre-registered); warp-test green (hysteresis, Jensen twin, frozen-phase purity); policy table asserted complete; warp control class live; showcase icons panel-reviewed |
| E | edit-isolation green (other-body hashes unchanged); fuzz green; live≡reboot frame-equivalence green; live-build e2e green; taxonomy table published |

Plus, standing: no previously-passing criterion regresses; every capacity
has a named assert; every V3 hand-off has its inventory row and policing
breakpoint (the table above is the checklist).

## Risk register (carried consciously, owners = the named phases)

1. **All gates die simultaneously** on system migration → the two-system +
   compat-path + Re-Pin-event law, with system-stamped provenance refusing
   silent cross-system comparison. *Phase 0/K/S.*
2. **Multi-body worker/tile residency unknowns** — listener routing, gen
   counters, shared caps under interleaved bodies (`tiles.js:393-410`) —
   verified by the Phase C tour e2e before Phase N builds on it.
3. **Warp before its policy** → Phase N's starter warp is capped at today's
   ceiling (43200×) until W lands; the capture law is designed in W *with*
   N's gates, and representation selection keys on declared warp so gates
   can actually observe above-band forms.
4. **The disc→tiles rung is unquantified** → Phase N measures before it
   builds (approach-ladder scenes first, threshold second), and the
   self-disc is named as a representation, not discovered as a gap.
5. **Editor edits at running t teleport bodies** → λ-continuity law (Phase E).
6. **Edited systems are unreproducible** → spec.system payloads + recipeHash
   provenance (Phase 0/E); until then the editor is demo-only by decree.
7. **High warp starves the cloud worker / strobes time-fields** → the W
   policy table; clouds fall back to their Jensen-honest analytic mean,
   never to strobe; band edges are gated in both directions.
8. **System-view exposure hunts or pops at the class switch** → view-class
   metering law with its continuity window (N5), fixedEV escape hatch
   everywhere, the one-take budget covering the switch frames.
9. **Partial slot-lift (F2 class)** → both unrolled shader copies + packing
   change in one commit, policed by the slot-overflow breakpoint + A→B→A,
   with the Phase C pre-code panel on exactly this risk.
10. **Epoch migration breaks pinned poses** — season semantics are body-local
    in 76 specs, and the composition lives at five sites → all five collapse
    in Phase 0 with the old-spec-equals-same-t test covering phaseDeg/faceSun;
    the Re-Pin event owns intended deltas.
11. **Kepler-solver nondeterminism across JS engines** → fixed iteration
    counts, no data-dependent branching, twin tests across worker/main/Node
    realms, solver sweep run in two fresh processes.
12. **Boot cost at 33 bodies underestimated** → the worker-topology decision
    and measured budgets land in Phase C on the stress system before Phase S
    authors content against them.
13. **GPU resource ceilings at 8 slots × per-slot giants/rings** → the
    uniform-storage budget row + boot assert, with the float-texture packing
    fallback registered.

## Non-goals (so the roadmap stays honest)

- **No craft, no patched-conic gameplay, no maneuver planning** — V3 ships
  the μ-consistent rails and closed-form state vectors (the KSP-readiness
  contract); `core/physics.js` is the next roadmap.
- **No n-body, no integrators, no GR** — ever, by architecture (§9).
- **No multiplayer/netcode** (`net/` remains future; determinism + epoch
  time is the sync story, unchanged).
- **No series-ephemeris accuracy claims** — elements + secular rates, with a
  declared validity window; "extrapolated" is a label, not a bug.
- **No walk-on giant decks, no star surface** — descent floors are recipe
  data; both stay registered.
- **No scaled/compressed space** — true scale everywhere; findability is
  UI (lines, markers), never geometry lies.
- **No editor content suite** — the editor proves live edit/generation;
  authoring depth stays in recipes-as-code.
- **No new process families in Phase S** — family *knobs* with
  byte-identical defaults are the sanctioned extension; a genuinely new
  family ships only if the reuse-first panel row fails, in Phase B.
- **No per-view content** — nothing reads the camera except the camera; the
  bench exists to catch it (unchanged, now with more cameras).
