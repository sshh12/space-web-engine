# image-to-procedural

> **New:** this repo now also contains a from-scratch **baked-tile planet renderer**
> (the CONCEPT.md architecture): cube-sphere quadtree, deterministic halo-baked terrain
> tiles in a Web Worker, one atmosphere integral from orbit to eye level, ocean glint,
> debris scatter, and three recipe-driven bodies (Earth-like / Mars-like / airless moon).
>
> ```bash
> npm run serve                 # python -m http.server 8131
> # open http://localhost:8131/planet.html
> npm test                      # bake determinism/seam tests (pure Node)
> npm run test:contract         # per-process contract harness (halo + determinism)
> npm run bench                 # scene registry + control set -> bench/out/ + metrics
> npm run bench:motion          # scripted camera paths -> pop/flicker metrics
> npm run shots:critique        # headless screenshot suite -> shots-critique/
> ```
>
> See **DESIGN.md** for the architecture map, invariants, and known approximations,
> and **ROADMAP_V2.md** for build phase 2: the path to photorealism (benchmark
> harness, geo-realism taxonomy, Titan/Venus, iconic-scene + breakpoint registry).
> Rounds 1 and 2 of that roadmap are implemented — Phase R + M + the whole of
> Phase 1 (photometry, shadows, eclipses, HDR camera) + a Phase 2 slice; see
> DESIGN.md's "Build round 1/2" sections. F8 in the viewer captures the current
> view as a reproducible defect spec. The original template below still works.

A tiny, dependency-light **template** for experiments that go:

> **AI image generation → albedo + height map → displaced 3D terrain → headless screenshots**

Three self-contained pieces, no framework, no build step:

| File | What it is |
|---|---|
| `imagegen.py` | General-purpose CLI over OpenAI's image API (`generate` / `edit` / `tile` / `pbr` / `glb` / `preview`). Prompts are yours; nothing domain-specific. Prints token `[usage]` + an estimated cost per call. |
| `viewer.html` | Standalone Three.js viewer: an **albedo** + a **grayscale height map** → a CPU-displaced 3D surface (height baked into geometry, so lighting responds to real relief). Live controls; configurable textures via URL. |
| `screenshot.mjs` | Headless renderer (Puppeteer + SwiftShader) that drives the viewer's `window.__shot(az,el,dist)` hook and writes PNGs. Works with no GPU / no display (CI-friendly). |

A runnable **sample** (`assets/sample_albedo.png` + `assets/sample_height.png`) is included so the viewer works before you generate anything.

---

## Setup

```bash
# python side (imagegen): openai SDK + pillow + numpy
pip install openai pillow numpy
cp .env.example .env          # put your OPENAI_API_KEY in it

# node side (screenshots)
npm install                            # puppeteer
npx puppeteer browsers install chrome  # fetch the headless Chrome (one time)
# ...or reuse any Chrome:  PUPPETEER_EXECUTABLE_PATH=/path/to/chrome.exe
```

## End-to-end in 4 steps

```bash
# 1. generate an albedo (top-down / nadir reads best for terrain)
python imagegen.py generate \
  --prompt "top-down nadir view of <your surface>, evenly lit, no perspective, fills the frame" \
  --size 1024x1024 -q high -o assets/albedo.png

# 2. generate a matching HEIGHT MAP from it (edit = stays pixel-aligned).
#    push for a clean DEM, or it displaces into spikes:
python imagegen.py edit -i assets/albedo.png \
  --prompt "smooth grayscale topographic height map / DEM of this exact surface, pixel-aligned. \
            black = lowest, white = highest. NO lighting, NO shadows, NO fine speckle. \
            smooth low-frequency elevation only." \
  --size 1024x1024 -q high -o assets/height.png

# 3. view it (textures must be served, not file://)
python -m http.server 8000
#   open http://localhost:8000/viewer.html?albedo=assets/albedo.png&height=assets/height.png

# 4. headless screenshots
node screenshot.mjs "http://localhost:8000/viewer.html?albedo=assets/albedo.png&height=assets/height.png" shots
```

The default viewer (`?` omitted) loads the bundled sample.

---

## Notes / knobs

- **Viewer controls:** Height (displacement), **Smooth** (blurs the height map — essential; raw AI height maps have grain that displaces into grass-like spikes), Tiling, Sun angle, Detail (mesh subdivision), wireframe, and a "show heightmap" toggle.
- **Height-map alignment:** the viewer samples height with `(1-v)` to match Three.js `flipY` so relief lines up with the albedo. If you sample height in *world* coordinates after a `rotateX`, drop that flip (world-V already runs opposite UV-V).
- **AI height maps are inferred, not measured** — they nail obvious landforms but guess where brightness ≠ elevation. Prompt for a smooth DEM and lean on the Smooth slider.
- **WebGL, not WebGPU, on purpose:** SwiftShader (what makes headless screenshots work with no GPU) doesn't do WebGPU. Swap `WebGLRenderer` → `WebGPURenderer` if you only need interactive use.
- **Cost:** `imagegen` prints `[usage]` (real tokens) and an estimate using OpenAI's published image rates — scale if your model's price differs. Low quality is ~10× cheaper than high and often fine when an input reference carries the structure.

## imagegen cheatsheet

```bash
python imagegen.py generate --prompt "..." -o out.png            # text -> image
python imagegen.py edit -i ref.png --prompt "..." -o out.png     # image(+mask) + prompt -> image
python imagegen.py tile -i tex.png --prompt "..." -o seamless.png --check   # make seamless
python imagegen.py pbr  -i albedo.png -o mat                     # albedo -> UE5 PBR set (local)
python imagegen.py glb  --prefix mat -o mat.glb --displace 0.2   # PBR set -> displaced .glb
python imagegen.py <cmd> --help
```
