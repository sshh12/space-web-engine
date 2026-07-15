# The editor — Phase E laws and the invalidation taxonomy

Round 25 (ROADMAP_V3 Phase E). This page is the published form of the taxonomy
the roadmap required in DESIGN.md; DESIGN.md was retired in the docs reorg, so
the table lives here. The executable source of truth is `src/core/editor.js`
(`BODY_KEY_CLASS` / `STAR_KEY_CLASS` / `SYSTEM_KEY_CLASS`), asserted complete
against the shipped schemas at module load and against every edited payload in
preflight — a recipe key without a class row throws by name (M5: schemas are
data too).

## The mutation path

An edit NEVER mutates the live system. The panel (or a harness script) clones
the loaded recipe (`__editorSystem()`), mutates the clone, and hands the whole
next system to `__editSystem(next)`, which runs:

1. **λ-continuity** (`withLambdaContinuity`) — for every body/barycenter whose
   *resolved* mean longitude at the current epoch would change (element edits,
   parent-GM edits, star-GM edits alike), the epoch anomaly (`M0Deg`/`phase0`)
   is re-solved so the current mean longitude is preserved at the edit
   instant: the orbit reshapes around where the body *is*. Radial position may
   still step when a/e change (accepted, documented). Resonance members are
   never re-solved — their phase is group data and the pinned resonant
   argument already holds.
2. **Preflight on a copy** (`preflightEditedSystem`) — the full assert battery
   (mechanics, palette, figure, giant, ring, cloud, capacity, clone-safety,
   taxonomy closure). A bad edit reports in-panel and changes nothing.
3. **Classification** (`classifyEdit`) — a closed-form diff of the two recipes
   into the classes below. Never derived from metrics or render output.
4. **Dispatch** — the engine invalidates exactly what the classes name, riding
   ONE generation bump so every stale worker reply is structurally dead (the
   Phase C fence). The running epoch is an invariant: an edit never moves the
   clock, and the camera pose survives a current-body rebuild verbatim.

## The taxonomy

Classes (cheapest first) and their mechanisms:

| Class | Mechanism |
|---|---|
| `presentation` | zero invalidation — menu/label refresh at most |
| `look` | render-side re-bind: material/sky/LUT uniforms rebuilt, disc map re-baked; the current body's tiles re-upload from the *warm* worker cache — **zero worker tile re-bake** |
| `clouds` | cloud keyframe (or Phase W mean) rasters re-requested; deck/lightning uniforms re-bound |
| `mechanics` | frames re-derive closed-form (free); storm/hood cloud keyframes re-request for the edited body **and its descendants** (their `sunDirBF` rides the parent chain); insolation-context bands re-bake where authored |
| `processes` | band-selective tile re-bake from the shallowest changed band (`invalidationLevel`) + disc re-bake |
| `rebuild` | full body rebuild: worker baker dropped, asset packs regenerated, coarse residency dropped, tiles/disc re-baked |
| `system` | structural: the full `setSystem` preflight/teardown (validated before the old world disposes) |

Body datum → class:

| Datum | Class | Why |
|---|---|---|
| `name`, `camera`, `skyHidden` | presentation | labels / default poses / visibility hints |
| `palette`, `discAlbedo`, `brdf`, `atmosphere`, `water`, `ground`, `matStack`, `seasonalCap`, `ambientAlbedo`, `giant`, `rings` | look | consumed by uniforms/LUTs and the disc bake only — `bakecore` never reads them into tile bytes |
| `orbit`, `spin`, `GM` | mechanics | ephemeris is a pure fn of (recipe, t); the only *bake* consumers are seasonal cloud keyframes and authored insolation contexts |
| `processes` | processes | the existing `__reload`/`invalidationLevel` band law, per body |
| `clouds` | clouds | keyframes regenerate worker-side; uniforms re-bind |
| `R`, `seaLevel`, `figure`, `maxBakeLevel`, `rocks`, `formations` | rebuild | bake inputs (`seaLevel` at bakecore:743, `rocks.latticeLevel` via `rockCell`, `R` via face arc) or ladder shape |
| `coma` (Phase B) | look | a pure emission look: consumed by the point-tier flux hand-down and the system-view tail — never a bake input |
| `id`, `parent` | system | membership / frame-tree structure |

Star: `name` → presentation; `GM`, `radius`, `irradianceAt1AU`, `color` →
system (rare edits, global lighting/μ consequences — the honest big hammer).
System: `validYears` → presentation; `nodes`, `resonances`, `id` → system;
membership changes (add/delete) → system; `belts` (Phase B) → system (the
instanced scatter buffers regenerate on the setSystem path — rare edits,
whole-annulus consequences; the panel edits belts via JSON import/export).

"Zero rebake" is therefore true exactly for bodies whose edit touches neither
`processes` nor a bake input nor (via insolation/storm decks) the ephemeris —
the roadmap's promise, now enforced by the edit-isolation gate.

## Reproducibility

`spec.system` in SceneSpec carries either a canonical id string
(`demo-system` / `sol-system`, resolved through the engine registry) or an
**inline recipe payload**. Every capture surface — `__capture()`, bookmarks,
F8 defect captures — embeds the payload automatically whenever the loaded
recipe hash is not a shipped one, so any pose in any edited system reproduces
headlessly (`applyScene` resolves `spec.system` before posing). The hash is
the same one Phase 0 stamps into provenance.

## Gates

- `test/editor-test.mjs` (Node): taxonomy completeness on both shipped
  systems, classification unit laws, λ-continuity (legacy + conic + secular
  rates + parent-GM + barycenter outer/relative orbits + the geometric
  direction-preservation witness), preflight copy-law, templates/clone/delete,
  and the fuzz contract (150 random valid edits never refuse or mutate input;
  invalid edits always refuse by name).
- `harness/editor-e2e.mjs` (browser, GPU tier): **edit-isolation** (edit rubra
  live: every other body's disc row hashes byte-identical, an unedited-body
  control frame re-captures byte-identical, rubra's own disc must change),
  **live≡reboot** (edited frames vs a cold boot resolving the exported
  `spec.system` payload, gated by an in-run measured A/A envelope ×1.5 —
  frame equivalence, not bake equivalence, so stale-uniform F2 classes fail),
  **fuzz-lite** through the live path, and the **live-build demo** (template
  add → membership setSystem → travel to the new world → surface arrival with
  a reproducible capture).
