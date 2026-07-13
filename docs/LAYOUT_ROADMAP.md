# LAYOUT_ROADMAP — repo restructure: renderer + template + lab bench → engine + apps + harness

Goal: reshape the repo so it can grow into a SpaceEngine × KSP-class game (multiplayer,
space-to-surface navigation first) without changing renderer functionality yet. This
document is the plan of record for the reorganization; execute it top to bottom.

Reviewed by an independent agent pass; its structural edits are folded in (flat
SceneSpec, harness kernel reduction, migration reorder, enforcement teeth on checkJs).

---

## 1. North star / philosophy

The one property that makes this codebase capable of scaling is already its core
discipline: **the world is a pure deterministic function of (recipe, position, time)**.
Every structural decision below protects and exploits that.

1. **`core/` stays pure** — no THREE, no DOM, no `Date`/`Math.random`. The same code
   runs in the Web Worker, in Node tests, and eventually on an authoritative
   multiplayer server.
2. **Two kinds of state, never confused.** *Derived* state (terrain, clouds, discs)
   is a pure function of the recipe and never travels the wire or gets serialized.
   *Integrated* state (craft, players — later) is dynamical, owns its own
   serialization, and is what netcode syncs. SceneSpec (§4) describes observations of
   the world; it must never accrete entity state.
3. **The system is a value, not a constant.** Near-term expectation: **entire solar
   systems dynamically generated at runtime** (a system from a seed, JIT worlds).
   Therefore no module may treat `SYSTEM` as a global singleton contract: `recipe.js`
   trends toward schema + validators + generators + one built-in default system;
   the engine takes a system as input; harness/tests derive body lists from the
   system under test, never from a literal list. Anything sized or keyed at init
   time by "the body count" is a registered liability (§5).
4. **One spec object is the universal currency.** Today's `__shot` spec is bench
   scene, bookmark, defect capture, and test fixture at once. Formalized as
   **SceneSpec** it also becomes descent-sim initial condition, replay frame, and
   tutorial setup. Never invent a second format for these.
5. **Apps are thin shells over one engine API.** Each mode (inspector, descent sim,
   physics demo, game client) is another `.html` shell binding a different UI to the
   same engine.
6. **The harness is a small kernel of general primitives, operated by an agent.**
   The development loop is agent-driven (edit → headless sweep → metric gate →
   iterate). Checked-in machinery exists for exactly two jobs the register proved it
   does well: **anti-regression** and **anti-self-deception**. Diagnosis is
   agent-composed on demand from the primitives — probes proliferated historically
   only because every one-off had to rewrite browser boilerplate; the kernel removes
   that incentive instead of institutionalizing the probes.
7. **No stubs, and no frozen taxonomy.** Directories exist to encode *dependency
   rules* (what may import what), not topics. Files merge and split freely within a
   layer; subfolders appear only when a new dependency rule needs a boundary. The
   file placements in §3 describe where today's code sorts for the migration — they
   are not a commitment to that decomposition. Beware overfitting the new structure
   to the current file inventory: the current files are one snapshot of an evolving
   decomposition, not the shape of the domain.

---

## 2. Step 0 — snapshot before anything

Almost the entire working tree is **untracked** (one initial commit exists). First
action, before any delete/move:

```bash
git add -A && git commit -m "pre-reorg snapshot: full v2-round-18 state"
git tag archive/pre-reorg
```

Every deletion below then costs nothing — history keeps it all. ROADMAP_V2 registers
this lesson itself: "git init before the next promotion."

---

## 3. Target layout

```
space-web-engine/
├── apps/                      # one .html shell per mode — no shared app framework
│   └── inspector.html         # today's planet.html, renamed (debug views, wire, LOD…)
│   # future, added only when built: descent.html, physics.html, nav.html, game.html
├── src/
│   ├── core/                  # PURE layer (the dependency rule: imports nothing above it,
│   │   │                      #   no THREE/DOM/Date/random). Today's files that sort here:
│   │   ├── mathx.js  recipe.js  frames.js  figure.js
│   │   ├── bakecore.js  globalgrid.js  cloudcore.js
│   │   ├── scattercore.js  rockcore.js  meshcore.js  matstack.js
│   │   └── atmo.js  atmolut.js
│   ├── render/                # THREE-coupled presentation layer
│   │   ├── tiles.js  shaders.js  stars.js  camera.js
│   │   └── post.js  shadowpass.js     # extracted from main.js
│   ├── engine.js              # public API (§5) — most of today's main.js
│   ├── scenespec.js           # SceneSpec: defaults table, apply/capture/validate
│   └── bake.worker.js         # thin shell around core/
├── harness/                   # the kernel (§6) + data
│   ├── shots.mjs              # renderShots(): browser + ephemeral static server
│   │                          #   lifecycle, page pool, retry/recycle/fail-loud policy
│   ├── metrics.mjs  png.mjs   # pure scoring over stills AND frame sequences
│   ├── bench.mjs              # thin gate CLI: control set, baseline diff, --promote
│   ├── foolrate.mjs           # blind-panel protocol (checked in on purpose — §7)
│   ├── scenes.json  foolrate-shots.json   # pose capital (solved alignments)
│   ├── refs/ + manifest.json  # license-verified reference corpus — irreplaceable
│   ├── solvers.mjs            # pose solvers (eclipse/land/ocean scans) — data producers
│   └── baseline/              # metrics.json + provenance COMMITTED; stills gitignored
├── test/                      # pure-Node tests only (everything npm test runs)
├── cache/                     # was assets/ — fully gitignored, manifest included.
│                              #   A disposable store keyed by (recipeHash, bodyId) —
│                              #   safe to delete anytime; JIT generation is just
│                              #   "cache miss → generate now". No committed pins.
├── docs/                      # CONCEPT.md  DESIGN.md  ROADMAP_V2.md  LAYOUT_ROADMAP.md
├── tsconfig.json              # checkJs, enforced via npm test (§8)
├── package.json               # renamed "space-web-engine"; scripts updated
└── README.md                  # rewritten: planet engine, not an image template
```

No `tools/` directory: cache generation is the engine's job (JIT), and the
determinism proof is a test (§6). A standalone script whose function a general path
already performs is the smell this layout removes everywhere it appeared
(`gen-assets`, `motion.mjs`, `casting.mjs`, `rebuild-baseline.mjs`, `npm run serve`).

### Disposition table

| Today | Action | Why |
|---|---|---|
| `viewer.html`, `imagegen.py`, `.env`, `.env.example`, `assets/sample_*.png` | **delete** | The original starter template; zero coupling to the planet path. |
| `bench/_*.mjs`, `bench/*.log`, `bench/find-*.mjs`, stray `_crop_*/_probe_*` captures | **delete** | One-off probes + their stdout/outputs. Archaeology lives in the snapshot tag. |
| `bench/critique-round*.md`, `design-round18.md`, `*.workflow.js`, `test/visual-critique.workflow.js` | **delete** | Round output artifacts, not living docs. Note the cost knowingly taken: ROADMAP_V2's defect register cites round files by name; those references resolve via `git show archive/pre-reorg:...`. |
| `bench/{metrics,png}.mjs`, `scenes.json`, `manifest.json`, `refs/`, `foolrate-shots.json` | **move → `harness/`** | Durable instruments + data. Data (poses, refs) is the most bitter-lesson-compatible thing in the repo — keep all of it. |
| `bench/run.mjs` | **shrink → `harness/bench.mjs`** | Its three durable ideas (rotating date-seeded control set, expected-delta pre-classification from geometry, baseline diff) become a `gate()` library fn + ~50-line CLI. Fix while shrinking: control bodies derive from the loaded system, never a hardcoded list. Promotion becomes `bench --promote` (records provenance, commits `baseline/metrics.json`) — not a manual ritual. |
| `bench/motion.mjs` | **dissolve** | Sequence metrics (pop_p99, flicker_energy) move into `metrics.mjs`; a motion run is `renderShots` over a spec with a `timeline` + the gate — `npm run bench:motion` stays as a ~20-line composition, not a sibling driver. |
| `bench/casting.mjs` | **dissolve** | Pure composition (reseed via `__reload` + disc shots + contact sheet). Document the recipe in one paragraph; the agent re-authors it per casting session in ~20 lines. |
| `bench/foolrate.py`, `foolrate-score.py` | **rewrite in JS → `harness/foolrate.mjs`**, delete originals | §7. |
| `bench/baseline*/`, `bench/out/`, `bench/boards/` | **delete; re-baseline fresh** | Tied to old poses/paths. Going forward: `baseline/metrics.json` + provenance are COMMITTED (small, diffable, ties every gate to a commit — the round-4 "baseline is a photograph of an unrecoverable state" lesson); stills stay gitignored. |
| `screenshot.mjs` | **absorb into `harness/shots.mjs`** | One browser-driving path. `renderShots` also owns an ephemeral Node static server (free port per run) — kills the Python `serve` dependency and the "did you start the server" failure mode, and gives parallel runs port isolation. |
| `scripts/assets.mjs` | **dissolve** | Its two roles split to where they belong: determinism proof → `test/assets-test.mjs` (generate twice in-process, compare hashes — runs on every `npm test`, strictly better than a remember-to-run `--check`); population → the engine's JIT loader. If CI ever wants pre-warming, that's a `--warm` flag on `bench.mjs`. |
| `test/find-eclipse.mjs`, `find-land.mjs` | **move → `harness/solvers.mjs`** | Pose solvers are harness utilities that *produce* scenes.json data, not tests. `test/` holds only what `npm test` runs. |
| `assets/` → `cache/` (manifest inside, gitignored with the blobs) | **rename** | Blobs re-derivable; manifest is a cache-internal staleness index, NOT a committed contract — a committed pin would fight JIT system generation. Determinism is enforced by the pure-Node tests. |
| `planet.html` → `apps/inspector.html` | **rename** | First mode entrypoint. |
| `CONCEPT.md`, `DESIGN.md`, `ROADMAP_V2.md` → `docs/` | **move** | Root stays navigable. |

---

## 4. SceneSpec — the universal currency

`src/scenespec.js` owns:

- **A FLAT spec.** No grouped/nested v2 schema: every existing consumer
  (scenes.json's 35 scenes, foolrate-shots.json, bookmarks, F8 captures, 18 rounds
  of specs quoted in the defect register) is flat, and grouping buys namespacing
  against a collision that hasn't happened at the cost of an upgrader plus churn in
  every file. Keep `v` for the day a breaking change is real.
- **The schema IS the canonical-defaults table** — one object literal. A spec is a
  flat partial override of it; `applySpec` iterates the table (reset semantics =
  whitelist-of-nothing, the round-3 season-leak law, now structural);
  `validateSpec` = every key exists in the table (or is a solver field:
  `phaseDeg`, `faceSun`, `lookAt`), every value type-matches.
- **`system` field.** A spec names the system it's posed in (default: the built-in
  SYSTEM's id; later: a seed or recipe hash). Required for specs to stay
  reproducible once systems are generated at runtime — a pose without its system is
  meaningless in a JIT-worlds future.
- **Observation only.** SceneSpec is strictly the observation spec (system, body,
  epoch/time, camera pose, view/diagnostic mode, camera settings). Dynamical entity
  state (craft, players) gets its own serialized form later and is *referenced
  alongside* a spec by a Situation — never merged into it. This sentence is the
  cheap decision that prevents a format schism at the physics round.
- `applySpec(engine, spec)`, `captureSpec(engine) → spec`, `validateSpec(spec)`.

A **Situation** is `{ start: SceneSpec, timeline: [...] }` — the motion bench's
canned paths and the bookmark-tween player already have this shape. `renderShots`
honors a `timeline` from day one (that's what dissolves `motion.mjs`); richer
Situation semantics wait for the descent sim.

---

## 5. Engine API

Split today's `main.js` (~1.5k lines) into engine (reusable) and inspector app
(UI-specific):

```js
// src/engine.js
const engine = await createEngine(canvas, { fast: bool, system: SYSTEM /* default */ });

engine.applyScene(spec)   // → Promise<{settled, ms}> — THE primitive; full reset semantics
engine.captureScene(n?)   // → SceneSpec, exact round-trip of current state
engine.ready              // settle predicate covering ALL async queues (tiles, discs, clouds)
engine.perf()             // per-subsystem EMA ms
engine.setBody(id) / setMode(m) / setTime(t) / …   // live controls for interactive apps
engine.dispose()
```

- `createEngine` **takes the system as a parameter** (§1.3). During extraction it
  defaults to the built-in SYSTEM and nothing else changes — but the signature is the
  contract that systems are inputs.
- **Registered liability (do NOT fix during extraction):** today `main.js` sizes the
  disc atlas and cloud atlas by `NB = SYSTEM.bodies.length` at module init and keys
  layers by body row. Dynamic system switching requires rebuilding these on
  `setSystem` — register it as the first work item of the JIT-systems round, and
  avoid adding any NEW init-time system-shaped constants in the meantime.
- `apps/inspector.html` keeps: UI binding, photo mode, bookmarks, F8/F9, HUD. The
  engine keeps: render loop, passes, body switch, metering, settle machinery.
- `window.__shot` / `__ready` / `__perf` / `__reload` / `__recipe` / `__pageErrors`
  remain one-line bridges to the engine — they are the harness contract and stay
  **byte-compatible** through the refactor (verified by the harness itself, §9).
- Preflight-before-teardown stays a hard rule in every state transition (the
  dispose-then-assert row).
- Epoch time is primary engine state; `tday`/`season` are derived views. Do it
  during extraction only if byte-compatible; otherwise register it.

---

## 6. Harness — a minimal kernel operated by an agent

What 18 rounds actually showed: the fixed machinery caught **regressions, state
leaks, and self-deception** (season leak via the sequenced sweep; OOM-as-regression
via `__pageErrors`; three mis-attributions unwound by baseline A/B; icon-tuning
policed by the control set). Root causes were found almost exclusively by **ad-hoc
agent probes**. So: check in the anti-regression/anti-self-deception instruments,
make probes nearly free to write, and keep nothing else.

### The kernel (checked in, complete list)

1. **`renderShots(specs | situation, opts)`** — the one capture path.
   `{ parallel: N, out, retries: 1, seed }`. Owns: Puppeteer lifecycle, ephemeral
   static server, page pool, and the policy laws distilled from the register:
   - page recycled after K shots (round-4 OOM; "68-shot single-page sweep leaks state");
   - unsettled/errored capture → one retry on a fresh page → then fail LOUD;
   - results stream to disk incrementally (a crash never discards completed shots);
   - `settled:false` is carried in the result, never swallowed;
   - **engine-agnostic result records**: `{name, png, settled, ms, errors, provenance}`
     — no page/browser handle ever leaks out. This one rule is what lets a future
     Node + WebGPU / offscreen-canvas backend replace Puppeteer inside one file.
   - **provenance rides every record**: `{backend, fast, dpr, seed, commit}`.
2. **`metrics.mjs` + `png.mjs`** — pure scoring over stills *and* frame sequences
   (pop_p99 / flicker_energy absorbed from motion.mjs). One decode path.
3. **`bench.mjs` / `gate(runA, runB, policy)`** — diff any two runs. Rotating
   date-seeded control set (bodies derived from the system under test),
   expected-deltas pre-classified from geometry BEFORE rendering (never from
   metrics), gates on controls never icons, `--promote` writes
   `baseline/metrics.json` + provenance and commits it.
4. **Data**: `scenes.json`, `refs/` + `manifest.json`, `foolrate-shots.json`,
   committed `baseline/metrics.json`. Pose capital and license-verified references —
   accumulate, never regenerate.
5. **`foolrate.mjs`** — checked in deliberately, see §7.

Everything else — probes, panels, casting sheets, motion drivers, one-off diffs —
is agent-composed on demand from 1–3. `npm run bench:motion` and any future `cast`
are ~20-line compositions, not instruments.

### SwiftShader honesty (perf rounds)

SwiftShader is a CPU rasterizer: absolute perf numbers are unrepresentative and
`?fast=1` changes AA/DPR. Perf gates are therefore **relative, same-backend,
same-provenance only** — the provenance field makes mixing runs a detectable error,
not a silent one. Before shipping a perf round, a real-GPU spot check (headful
Chrome via `PUPPETEER_EXECUTABLE_PATH`) is the sanity valve so the agent never
optimizes to SwiftShader hotspots.

### Verification laws (from the ROADMAP_V2 defect register)

1. **Reset semantics are data** → Node test: apply spec A, apply `{}`, captured
   state equals canonical defaults.
2. **Settle is a first-class contract** — "an unsettled scene mimics shader bugs."
   Every new async pipeline must feed the settle predicate (round-14 clouds lesson).
3. **Fail loud, never score a corpse** — errors + settled flag in every result;
   nonzero exit on any broken scene.
4. **Gates on controls, never icons; expected-deltas from geometry, never metrics.**
5. **Preflight before teardown** in every engine state transition.
6. **Explicit uniform resets on body switch** (F2 star-leak class) → contract test:
   A→B→A headless, the two A frames pixel-identical.
7. **JS/GLSL twins must not drift** (atmo, cloudCov, Chapman) — twin tests in `test/`.

### Test pyramid (npm scripts)

```
npm test              # typecheck + all pure-Node tests (seconds) — every change
npm run test:e2e      # small smoke: boot each body of the loaded system, applyScene
                      #   round-trip, 0 page errors, settles in budget, A→B→A pixels
npm run bench         # metric gates on control set vs committed baseline
npm run bench:motion  # timeline composition over renderShots + sequence metrics
# foolrate + critique panels: episodic, agent/human-triggered, never CI
```

---

## 7. Foolrate → JavaScript, and why it stays checked in

Port to `harness/foolrate.mjs`. Image ops (crop → resize 384 → JPEG q85 re-encode)
run through an offscreen canvas in the headless Chrome we already drive — zero new
dependencies, and Chrome becomes the single decode/encode path for BOTH the real
photos and the renders: strictly stronger adherence to the band-matching law than
PIL was. Preserve exactly: manifest crop windows + artifact masks, seeded left/right
assignment, held-out `key.json`, real-vs-real control pairs, Wilson 95% lower-bound
scoring per body × band.

**Why this is kernel, not agent-composed:** the blind protocol is an integrity
control **on the operator**, and the operator (an agent) is also the test subject.
An agent recomposing its own blind protocol on demand is structurally positioned to
leak the key or soften the band-matching without noticing. Anti-self-deception
machinery must be rigid precisely because everything else is fluid.

---

## 8. TypeScript decision

**Not full TS. `tsconfig.json` with `checkJs` + JSDoc types on the seams — with
enforcement teeth.**

- The no-build property is load-bearing: edit → refresh → screenshot, shaders as
  template literals, `core/` running identically in worker and bare Node. Full TS
  forces a bundler into every one of those paths.
- JSDoc + `tsc --noEmit` delivers the high-value 80%: SceneSpec, the recipe schema
  (the biggest win — every body is untyped data feeding 13k LOC), the engine API,
  the worker message protocol, metrics records.
- **Enforcement**: `typescript` as a devDependency, `"typecheck": "tsc --noEmit"`,
  and `npm test` runs typecheck first. There is no CI; `npm test` is the enforcement
  point — without this the tsconfig is a file that decays.

**Revisit trigger**: the day the game needs real dependencies/bundling anyway
(netcode, game-HUD framework, code splitting), flip to full TS + Vite in that same
change. Not before.

---

## 9. Migration sequence — the harness verifies the migration

Order: **snapshot → deletes → cache → src split → HARNESS → golden capture →
engine extraction → renames → re-baseline**. The deliberate move: build the new
harness *before* the risky refactor steps, against the **pre-refactor**
`planet.html` + `__shot` contract (which survives unchanged — that's the point of
byte-compat). The harness then gates its own repo's surgery.

1. **Snapshot commit + tag** (§2).
2. **Deletes + doc moves** — template files, bench sediment, critique artifacts,
   workflows; docs → `docs/`; rewrite README; rename package.
   *Verify: `npm test` green; planet.html renders.*
3. **`assets/` → `cache/`** — rename, gitignore wholesale, update loader paths;
   add `test/assets-test.mjs` (the determinism proof, replacing `--check`).
   *Verify: `npm test` green (now includes the assets proof); planet.html renders.*
4. **`src/` split into `core/` / `render/`** — pure file moves + import updates,
   zero logic edits (verified: no core candidate imports THREE).
   *Verify: full `test/` suite; planet.html renders.*
5. **Build `harness/shots.mjs` + `metrics.mjs` port + `bench.mjs`** against the
   CURRENT `planet.html`. Fold in screenshot.mjs; add `--parallel`
   (start `min(4, cores/3)`; N pages × bake workers contend for RAM — measure).
   *Verify: a 10-shot sweep completes, 0 unsettled, records carry provenance.*
6. **Golden capture**: `renderShots` over a pinned-seed control set + a hand-picked
   icon subset → committed `baseline/metrics.json` + local golden stills. **This is
   the migration's own gate**: every step after this must reproduce it.
7. **Extract `engine.js` + `scenespec.js` from `main.js`** — mechanical; `__shot`
   stays byte-compatible. *Verify: re-run step 6's exact sweep — pixel-identical
   stills (or byte-identical metrics) on the same seed, same backend. Any diff is a
   refactor bug by definition; there is no "expected delta" in a pure move.*
8. **`planet.html` → `apps/inspector.html`** + path fixes; port foolrate to JS.
   *Verify: step 6's sweep again against the new URL — identical.*
9. **Re-baseline + wire scripts**: `bench --promote` on a pinned seed (fresh
   provenance: date, seed, commit, backend); add `typecheck` to `npm test`; JSDoc
   the seams (SceneSpec, recipe, engine, worker protocol) incrementally.

Steps 2–4 mechanical; step 7 is the careful one — and it is now gated by tooling
that exists, on a golden set captured before surgery.

---

## 10. Deliberately NOT built now (but the layout anticipates)

- **Dynamic solar systems / JIT worlds** — the near-term big one. This re-arch
  prepares it without building it: system-as-parameter in `createEngine`, `system`
  field in SceneSpec, cache keyed by recipe hash with no committed pins, harness
  deriving body lists from the loaded system, and the NB-atlas rebuild registered
  as the round's first work item (§5). JIT generation itself is "cache miss →
  generate now" through the same pure functions.
- **Craft physics / orbits** → future `core/physics.js` beside `frames.js`
  (closed-form ephemeris stays; craft get patched conics later). Pure step function
  → server-runnable. Craft state is *integrated* state (§1.2) with its own
  serialization.
- **Multiplayer** → future `net/`; determinism means state sync is entity state +
  epoch time.
- **Mode apps** (descent sim, physics demo, nav) → added as `apps/*.html` when real.
- **Bundler / CDN** → §8's revisit trigger. Not before.
- **Critique panels as checked-in workflows** → re-authored per round from the
  kernel primitives; the finder/skeptic pattern is documented in ROADMAP_V2 and the
  snapshot tag.

---

## 11. Execution log (what was actually built)

Executed top-to-bottom against the `archive/pre-reorg` snapshot. Per-step commits;
every step gated as specified.

- **Steps 1–6 — done as written.** Snapshot+tag; template/bench-sediment/critique
  deletes; docs → `docs/`; `assets/` → `cache/` (gitignored, manifest untracked) with
  the determinism proof promoted to `test/assets-test.mjs`; `src/` split into
  `core/`+`render/` (all imports rewritten, 14/14 pure-Node suites green); the harness
  kernel (`shots.mjs` renderShots + ephemeral server, `bench.mjs` gate with
  system-derived controls, `metrics.mjs` + absorbed `sequenceMetrics`, `motion.mjs`
  as a composition, `serve.mjs`); golden capture over 8 diverse pinned scenes.
- **`.env` kept, not deleted.** It is gitignored (absent from the snapshot), so
  deleting it is unrecoverable; it is invisible to git anyway. Left in place.
- **Step 7 — partial.** `src/scenespec.js` landed as the shared, PURE SceneSpec schema
  (defaults-as-data table + `validateSpec`, validated against all 97 registry specs;
  the harness now fail-fasts bad specs). **Deferred:** the `createEngine()` factory and
  moving `main.js`'s `__shot` apply-logic onto the table — held with the DOM-decoupling
  refactor so `main.js` (1518 lines, tightly coupled to the inspector DOM) churns once,
  not twice. It is the single genuinely large/risky refactor remaining, now protected
  by the golden gate. `main.js` is unchanged; `apps/inspector.html` still loads it.
- **Step 8 — done.** `planet.html` → `apps/inspector.html` (one relative-path fix);
  harness default page repointed. Verified render-neutral by the golden gate.
  **Foolrate:** the two Python scripts moved to `harness/` (capability preserved) so
  `bench/` dissolves; the offscreen-canvas JS port (§7) is deferred with the other
  remaining work — it is episodic/human-triggered, not on the `npm test` path.
- **Step 9 — done.** `tsconfig.json` (`checkJs`) enforced via `npm test` (runs
  `tsc --noEmit` first — no CI, so `npm test` is the enforcement point). Typed seams
  started at the clean set — `src/scenespec.js` (SceneSpec) + `harness/metrics.mjs`,
  `png.mjs` (metrics records); `+@types/node`. `include` grows file-by-file; the
  kernel/recipe/worker seams are the next incremental additions.

### Correction to §6/§8 — the gate is metric-tolerance, NOT pixel identity

The plan assumed SwiftShader is byte-deterministic, making pixel identity the golden
gate. **Measured false:** SwiftShader + the async bake workers are **bistable across
processes** — a complex scene settles into one of a few sub-perceptually-different
pixel states depending on which tiles finished baking when the settle predicate fired
(`blue-marble` alternates between two fixed shas, Δlum_mean ≈ 5e-4; run A reproduced
the capture sha *exactly*, run B the other state). So `golden --verify` and every
future gate compare **stable photometric/spectral metrics within tolerance**
(`spec_slope` 0.05, `lum_mean` 0.02, `shadow_frac` 0.02, …); `grad_kurtosis` swings
with sub-pixel jitter and is reported but not gated; sha is kept as an informational
"pixel-identical" signal when it happens. This vindicates the register's
metrics-over-pixels instinct and is the honest backend behavior to build on.

### Parallel rendering — measured a non-win on SwiftShader

`renderShots` has a page pool (`parallel: N`) and a boot mutex, but **parallelism does
not speed up the headless backend**. Measured on 32 cores: SwiftShader is a CPU
rasterizer that saturates every core for a *single* render, so N concurrent pages each
run at ~1/N speed — total wall-time is flat-to-worse, and the inflated per-shot
wall-clock trips the settle deadline into false "unsettled" (at parallel=3, blue-marble
went from 19 s to >240 s and failed to settle). The cold **boots** (a full default-view
bake per page) are separately contention-prone; the boot mutex serializes them so they
stop thrashing. Net: the default page-pool size is **1 under SwiftShader**. Parallelism
only pays off where a page's draw work leaves the CPU free — a **real GPU** Chrome
(`PUPPETEER_EXECUTABLE_PATH`, then `PARALLEL=n`), or **sharding across machines**. The
pool + boot mutex exist for exactly those cases; they are correct, just not exploitable
by the software rasterizer.

A tight gate also needs **monostable** scenes. The step-8 verify came back with 6/7
retained shots within tolerance and one (`earthrise`) **pixel-identical** — decisive
proof the rename is render-neutral. Two scenes had to be handled specially:
`titan-lakeshore` (thick-haze ground) settles right at the 150 s deadline, so the gate
gives every golden shot a 240 s settle budget; `beach-eye` (eye-level ocean glint)
swings `spec_slope` ~0.08 between settle states — inherently multistable, so it is
**excluded from the golden gate** (it stays in `scenes.json` for the ongoing bench).
The reliable gate is 7 scenes across 4 bodies.
