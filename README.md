# space-web-engine

A deterministic procedural planet renderer, on the way to a SpaceEngine × KSP-class
game (multiplayer, space-to-surface navigation first). The core discipline — and the
reason it can scale — is that **the world is a pure deterministic function of
`(recipe, position, time)`**. The same core code runs in the browser's Web Worker, in
Node tests, and (eventually) on an authoritative multiplayer server.

- Cube-sphere quadtree; halo-baked terrain tiles for seam-exact determinism.
- One atmosphere integral from orbit to eye level; ocean glint, clouds, debris scatter.
- Recipe-driven bodies (a built-in solar system today; runtime-generated systems next).
- No build step: ES modules + Three.js from CDN, shaders as template literals.

See `docs/` for the full picture:
- **docs/CONCEPT.md** — the idea.
- **docs/DESIGN.md** — architecture map, invariants, known approximations.
- **docs/ROADMAP_V2.md** — the path to photorealism (18 rounds of defect register + laws).
- **docs/LAYOUT_ROADMAP.md** — this restructure's plan of record.

## Layout

```
apps/        one .html shell per mode (inspector today; descent/physics/nav/game later)
src/core/    PURE layer — no THREE/DOM/Date/random; runs in worker, Node, server
src/render/  THREE-coupled presentation
src/         engine.js (public API), scenespec.js, bake.worker.js
harness/     the test/bench kernel + pose data + reference corpus
test/        pure-Node tests (everything `npm test` runs)
cache/       disposable generated blobs, keyed by (recipeHash, bodyId) — gitignored
docs/        concept, design, roadmaps
```

## Develop

```bash
npm install                    # puppeteer (headless Chrome for the harness)
npm test                       # pure-Node determinism/seam/contract tests (seconds)
```

The interactive inspector is `apps/inspector.html` (served over http — see the harness,
which owns an ephemeral static server). The development loop is agent-driven:
edit → headless sweep → metric gate → iterate. The harness is a small kernel of general
primitives (capture, score, gate) documented in `docs/LAYOUT_ROADMAP.md §6`.

> This repo began as an image-to-terrain template; that scaffolding has been removed.
> The pre-reorg state is preserved at the `archive/pre-reorg` git tag.
