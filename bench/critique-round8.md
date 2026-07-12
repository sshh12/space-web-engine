# Round-8 adversarial critique panel — results + dispositions

Full multi-lens panel (`test/visual-critique.workflow.js`) over the round-8
sweep (`bench/out/stills`, 59 scenes): 5 lenses (cliffs / pavement / routing /
light / consistency) × find → 2-skeptic verify, finders on Opus, skeptics on
Sonnet (standing rule 1). **53 agents, 0 errors, 20 confirmed (2 votes) + 5
softer.** Dispositions below — three findings were fixed IN-ROUND before the
final sweep; the sweep's metric deltas (≈0 vs the round-6 baseline on the
orbital scenes) prove several "suspected regressions" are pre-existing
registered defects re-observed.

## Fixed in-round (the post-panel fix batch — verify probe r8c)

- **[HIGH] Two-body gate FAIL: Luna's ground read as the same flagstone
  pavement as Rubra.** The plates() mechanism was body-agnostic up to scalar
  knobs — same math, same look, same material; exactly what the anti-overfit
  law forbids ("a law that only helps Rubra is a Mars feature wearing a law's
  clothing"). Fix: `jointTab` (recipe data) picks the fracture AGENT — 1 =
  oriented tabular sets + coplanar flagstone tops + full grooves (tectonic,
  Rubra 1.0 / Tellus 0.8); 0 = isotropic equant shatter, rough tops, softened
  gardened grooves, tone-first boundaries (impact breccia, Luna 0.1). The
  LOOK diverges, not just the parameters.
- **[HIGH] Monodisperse plates — single-scale Voronoi read as a mud-crack
  decal.** One jittered site per lattice cell = near-constant F2−F1 spacing.
  Fix: a symmetric hash of the two nearest sites erases ~1/3 of the joints,
  merging neighbours into larger polyomino blocks — a block-size distribution.
  Residue (round 9): a true master-joint octave (4×S gating sub-plates).
- **[MED] Rubra joints read dark-incised, not wind-filled sand seams**
  (pixel-sampled 35–55% darker than plates); per-plate tone ±9% gated to
  near-zero. Fix: groove depth now damps ×(1−0.9·fill) in filled joints, and
  plate tone raised to ±16% ungated by the interior mask.

Also fixed in-round before the panel: the first probe's joint-groove
black/white pixel-stair aliasing (§7 crack widen-and-fold), and the beach-eye
checker band (Tellus pavK 0.2→0.06; root-cause fix queued round 9 — see
register).

## Pre-existing, re-observed (sweep deltas ≈ 0 vs round-6 baseline — NOT
round-8 regressions; register rows already exist)

- **[HIGH] Reticulated/rectilinear grid at descent-01/02 (5,000/1,200 km).**
  Strata/catena bands (levels ≥8/10) cannot reach level-4-6 display tiles, and
  dkurt deltas at those octaves are ≤0.7 — this is the round-6 register row
  "rectilinear white lattice blotches at 5,000 km" (unrotated value-noise
  octave aliasing; domain-warp fix, Phase M window).
- **[HIGH] Mid-LOD descent ladder featureless waxy dome (300 km → 300 m) +
  mountain-limb smooth arc.** Deltas ≈0: pre-existing mid-band relief deficit;
  the ladder site (Tellus lat −4 lon −76 lowland) also sits OUTSIDE the strata
  uplift gate, so round 8 legally adds nothing there. Round-9 residue: mid-band
  amplitude retention re-tune (data) + consider re-siting the ladder over
  gated uplift so it exercises strata; relief pop-in radius itself is the
  registered round-11 row.
- **[MED] rubra-canyon-dawn: soft rimless craters, no canyon.** The scene's
  own metadata says "no canyon yet — becomes real with Ph2 singularity"
  (round 12 rifting). Crater softness at this site is the round-4 depthK
  family — crisper-crater data re-tune queued round 9.
- **[MED] alpen-dawn hard diagonal LOD seam + flat wedge.** Visible in the
  round-6 baseline still too — the registered mixed-depth seam / per-tile
  scalar geomorph class (round 11).
- **[MED] Luna macro shots clip to featureless white; eye-level exposure
  bimodal #000/#fff.** The registered round-9 airless family, now with a
  sharper diagnosis from the panel: the opposition-surge term pushes
  near-normal-incidence regolith past clip — round 9 adds a surge shoulder /
  highlight roll-off alongside the MS/sky fill floor.
- **[LOW] Site hue + lake-field topology swing octave-to-octave on descent.**
  The round-11 descent-consistency family (fold-to-mean colour + discAlbedo
  reconciliation); lake re-thresholding per octave noted as its own symptom.

## New round-8 findings, registered → routed

- **[HIGH] luna-boulderfield icon is still pockmark speckle** — the denFloor
  fix works elsewhere (crater-rim-walk, pavement-walk-luna show readable lit
  boulders) but at the icon framing every clast falls below crown-readable
  size and the blown exposure erases what remains. → round 9 with the airless
  exposure fix; then re-judge density (0.08 may want 0.10–0.12), consider
  raising Luna sizeMax or re-posing the icon lower.
- **[MED] Plates are not coplanar — joints drape over the meso relief.** The
  interior damping flattens micro octaves only; the ~4 m meso octave is CPU
  vertex displacement a fragment term cannot flatten. → round 9 attempt:
  per-plate mean-plane counter-shaping in dH (normals-only); honest fix is
  mesh-side and rides the texture-stack round.
- **[MED] Ripples never read as directional trains** — amplitude loses to the
  macro dust vnoise and the `trains` patch noise destroys along-wind
  coherence. → round 9 data/look tune: amp up, lengthen train coherence along
  uWindA, macro dust yields to fill on accumulations.
- **[MED] Catena contrast dies beyond the near field** — fill folds to
  0.38·supply and the fines→supply curve is too shallow to carry hollows-vs-
  crests at distance; on pure-dust Rubra plains catena is invisible (no
  albedo response where rockW≈0). → round 9: steepen the fines→supply map,
  add a subtle fines albedo/smoothness tint on dust tiles.
- **[MED] Distant terrain fails to converge to horizon sky at eye level; dawn
  sky shows a dark band above the horizon; orange/red ring wedged at the
  orbital limb.** → round-9 sky-view LUT installment gains an acceptance
  check: terrain endpoint radiance must meet the sky-pass radiance at the
  horizon row; monotonic dawn sky toward the sun horizon.
- **[LOW] Dithered band where joint/micro relief fades at a fixed radius** —
  the fade windows hand off over a narrow fw annulus. → round 9: stagger/widen
  the fade windows (same fwidth family as the bump roll-off).

## Softer (1 vote — watch)
- Cliff-and-bench former under-firing at its own anchors (sparse caps + gates;
  the mechanism is proven in Node — visibility is a data tune, round 9).
- Luna eye-level bimodal exposure (duplicate of the confirmed clip row).
- Orbital limb saturated orange/red ring (round-9 sky).
- descent-05 (20 km) dead-detail octave (round-11 descent family).
