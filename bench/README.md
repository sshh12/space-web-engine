# bench/ — Phase R harness (ROADMAP_V2)

"Looks toy" becomes a number here. Pieces:

| Path | What |
|---|---|
| `scenes.json` | Iconic-scene registry (#1–16) + breakpoint probes (#17–35) as `__shot` specs. Icons are **qualitative anchors only**; metric gates run on the rotating control set. |
| `run.mjs` | `npm run bench` — renders active scenes + today's control set headless, writes `out/stills/` + `out/metrics.json`, prints deltas vs `baseline/metrics.json` if present. |
| `metrics.mjs` | Objective tells: power-spectrum slope/anisotropy, gradient kurtosis, shadow fraction, limb profiles, luminance stats. Relative instruments — compare render↔photo through the same decode path, or run↔baseline. |
| `png.mjs` | Zero-dep PNG decode (the one normalization path both sides go through). |
| `manifest.json` | R1 reference-corpus ledger: source, **verified license**, colorimetric flag, viewing geometry. Acquisition is blocked on license verification per image. |
| `refs/` | Acquired references (currently: `rubra-ground/` MSL/M2020 panoramas). |
| `boards/` | Synthetic look-dev boards (imagegen) — art direction only, **never scored against**. |
| `defects/` | One-key defect captures (Phase T): press **F8** in the viewer — a `__shot` spec + PNG land in your downloads; move them here. |
| `foolrate.py` | R4 blind-panel pair builder: band-matched real-vs-render crops through ONE normalization pipeline (resize 384 + same JPEG re-encode), seeded left/right, `key.json` held out of the panel prompts, real-vs-real controls. Renders come from `out/stills/` + `foolrate-shots.json` (matched-geometry poses). |
| `../test/find-eclipse.mjs` | Scans the closed-form ephemeris for eclipse alignments (season/tday + sub-occluder lon/lat) — how icons #12.5–12.7 were posed. |
| `../test/contract-test.mjs` | Process contract harness: halo bit-exactness + determinism for every registered process as cumulative prefixes (a failing seam names its process). |

## `__shot` spec extensions (R3)

Beyond the v0 fields (`body lat lon alt tday season yaw pitch mode wire debris inset exposure`):

- **Reset semantics:** every field a spec omits resets to its canonical default
  (yaw/pitch 0, fov 55, mode lit, debris on, wire/inset off, EV bias 0, auto
  metering). Sequential shots share one page; without this, poses leak between
  scenes (found by the round-1 critique panel — sev-5 "defects" that were stale
  camera state).
- `clean: true` — hide all UI for scoring frames.
- `fixedEV: n` — lock exposure at `2^n` (bypasses metering; render-vs-photo pairs must not differ by metering).
- `phaseDeg: d` — solve `tday` so the sun–point–camera phase angle matches a reference's geometry.
- `faceSun: true` — yaw the camera to the sun's azimuth (`yaw` becomes an offset from it).
- `fov: deg` — camera FOV (default 55). `lookAt: "<bodyId>"` — aim at another body's disc.

## Scoring rules (R4, abbreviated)

- Blind panel: n ≥ 100 pairs per body × scale band, forced choice, **band-matched pairs only**, non-iconic crops, one normalization pipeline, real-vs-real control baseline, gate on the Wilson 95% CI lower bound.
- Objective tells gate on the **control set** (random poses, seed rotates with the UTC date), never on the icons.
- A change that improves an icon but regresses controls is rejected: we tune the function, not sixteen photographs.

Spectral band mode (render at a reference's filter wavelength) is still to come — until then, off-band references are art direction only.
