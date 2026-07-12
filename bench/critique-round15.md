# Round-15 adversarial critique panel — results + dispositions

Two panels ran this round (the standing rule-1 discipline: finders **Opus**,
skeptics **Sonnet**).

## Pre-code design panel (29 agents, 25 verified: 8 CONFIRMED / 12 MITIGATE /
## 5 REFUTED) — killers dead on paper, the fourth consecutive round

- **[KILLER, CONFIRMED] F1/H3 keyframe breathing** — adjacent keyframes as
  independent fbm draws (⊕k) crossfade into a 0.71× spatial-variance collapse
  at every mid-frac (the skeptic REPRODUCED it against the real mathx
  primitives: measured 0.68–0.71, mid-band population 2–3×). FIXED pre-code:
  correlated keyframe evolution (coordinate advance of ONE field); the
  mid-frac variance ratio is a pinned law (≥ 0.9; ships 0.95/0.98/0.97).
- **[KILLER, CONFIRMED] F2 the one-integrand break** — the vertical profile
  was never mean-normalized (a peak-1 bump has mean 0.5–0.8 ⇒ the SEEN cloud
  systematically thinner than the shadow it casts) and clamp(1+amp·fbm)
  rectifies the tail. FIXED pre-code: h(x)=6x(1−x) EXACTLY mean-1 with
  H=smoothstep as the single column law shared by every rung and the shadow;
  detailAmp ≤ 1 is a load-time assert (fbm3 is bounded — no clamp exists).
- **[KILLER, CONFIRMED] K1 the horizon remainder fold** — one midpoint tap on
  a 67–150 km grazing crossing diverges 10–43% from the marched mean (Jensen;
  the skeptic ran the geometry AND the radiometry). FIXED pre-code: the folds
  are 3-tap coarse marches at footprint-matched LOD (mean of exp, never exp
  of a midpoint).
- **[KILLER, CONFIRMED] F2-bench the "Luna byte gate" that wasn't** — dmean
  is a whole-frame mean (blind to ~1000-px patches and sign-canceling
  drift); the star pass is built ONCE so per-body compile-unrolling cannot
  protect it. FIXED: uCloud* are runtime uniforms in `shared` with explicit
  switchBody else-resets, plus a real PIXEL gate (see below — it found
  something better than a bug).
- **[KILLER→MITIGATE, F1-bench] control-tier blanket exemption** — "any
  control on a cloud body is expected-delta" would have disarmed 2/3 of the
  anti-overfit tier. FIXED: per-POSE closed-form classification
  (cloudCovJS over the view footprint — the round-14 M5 pattern) + a located
  clear-sky σ(0) witness scene that must render PIXEL-EXACT clouds-on vs
  clouds:false (it does: maxDiff 0).
- **[HIGH, CONFIRMED] F3 moisture DC** — amended BY MEASUREMENT: with the
  shipped advection params the ocean sits near 0.4·prior with real fetch
  structure (the panel's own analytic saturation model used default params);
  the term ships as an ANOMALY about a recipe mid-scale (global mean 0.002,
  pinned ±0.08).
- **[HIGH, CONFIRMED] H1 the cold [global] build** — the skeptic MEASURED
  the main-thread block (~3.3 s); keyframes generate in the worker ('clouds'
  message), cloudPending joins the settle predicate.
- **[MED, CONFIRMED] M1-alt quadrature altitude dependence** — retired
  STRUCTURALLY: the shipped integrator has no rung thresholds at all (one
  estimator, quadrature + tap LOD from ray geometry).
- 12 MITIGATE deltas adopted (equirect direct evaluation — no six-face
  resample; analytic K9-legal footprint LOD; hemispheric planetshine;
  disc HG+MS split; shadow stride-2; the GPU readback witness; clouds:false
  motion A/B; star uniform placement; blue-marble meter ruling; waitMs
  headroom + per-shot try/catch). 5 REFUTED — notably BOTH attacks on the
  coverage-only shadow (CONCEPT §8's "never the rendered cloud" is
  pre-adjudicated; muClamp keeps the modeled slant path sub-texel, so the
  single tap is adequate BECAUSE of the clamp), and the fool-rate ≥ 35%
  criterion RULED phase-level, not a round-15 gate.

## Post-sweep critique panel (35 agents, 28 verified: 18 CONFIRMED /
## 4 ADJUDICATED-FAMILY / 6 REFUTED) — four root causes, one fix batch

**Root cause 1 — grazing sub-Nyquist detail (the headline):** open-ocean-
orbit rendered the deck as per-pixel SALT-AND-PEPPER static (the skeptic's
HF-energy probe: 8.63 vs 0.17 clouds-off — a 50× differential gated purely by
the clouds lever); the same mechanism at milder amplitude on every
orbital/grazing pose (orbital-cloud-speckle, coast-400km curtains). TRUE
mechanism: the footprint fed to the detail fold ignored ray OBLIQUITY — at
grazing incidence the surface footprint stretches ~4× and the 4-km detail
octave sampled below Nyquist is white noise. FIXED: obliquity-true footprint
(÷ max(|dot(rd, radial)|, 0.2)) for the detail fold AND the raster LOD, with
the fold saturating by a QUARTER wavelength. Post-fix HF: 8.63 → 1.55
(clouds-off floor 0.17); every witness ≤ 0.8.

**Root cause 2 — black-stain shadows:** cloud shadows saturated to pixel-hard
BLACK (terminator-cross's gap-as-stain, the ladder's blocky patches, low-sun
blocks). The deck removed direct flux and returned NOTHING — real overcast is
gray because the cloud re-emits roughly half the blocked flux downward.
FIXED: `cloudFill` — an energy-BOUNDED overcast downlight ((1−csh)·µ0·0.12)
added to every material's ambient (terrain/ocean/rocks/formations/impostors).
Redistribution, never conjured light.

**Root cause 3 — sunward whitewash:** earthrise's Tellus disc rendered as a
featureless WHITE BALL (companion-disc tier), loworbit-sunset's limb blew to
structureless white, sunset icons buried under veils. Three contributing
knobs, all fixed: global coverage −15% (cov0 0.26/0.20 — hemispheres ran
cloudy enough to erase the marble identity), the forward HG lobe softened
(g1 0.72→0.62, w 0.62→0.55 — the sunward spike), and blue-marble's meter
spot→center (the panel caught a drifting cloud under the spot re-exposing
the whole disc −17%; with cloud contrast shipped, center is legible — a
documented camera-semantics change, icon re-baselined). Post-fix: earthrise
reads blue-ocean/tan-land/white-systems again; loworbit recovers its blue
rim and structure (the sun-facing icon still under-delivers vs the anchor
board — registered, phase-level).

**Root cause 4 — keyframe rollover dropout (free-run only):** at every k
increment the deck gated to 0 for ≥1 frame while the worker generated. FIXED
by the rollover-continuity law itself: the previous pair at frac=1 IS the
next pair at frac=0 byte-exactly — render it while pending.

**The panel's negative result (quote of the round):** TF-MECHANISM-SOUND —
the coverage [time-field] held under all three mandated attacks: no keyframe
breathing in the RENDER, advection matches the drift law live, and the GPU
mode-8/9 witnesses match the JS twins.

**Adjudicated families / registered:** tellus-tor scarp serration (the
strata-edge family); night-hemisphere moonlit clouds effectively unlit (the
shine term exists but is visually nil — round-16 night-pack content);
cloud-approach's one-frame base-crossing flash (LOW — diagnosis registered);
the smooth-sheet/eye-level items (already registered round-16 content);
ocean-fixed's flicker pose now sits under cloud shade (instrument relocation
registered); cloud-drift's metered flicker was AE pumping (the path now pins
fixedEV like every other pop instrument). REFUTED: the luna-knife-edge
"chromatic recolor" negative-control breach (exposure family), the
blue-marble milky-veil framing, ladder net-dimming, disc/point form
mismatch, clearsky re-verify (the pixel-exact A/B stands), and
cloud-shade-ground-crush (subsumed by the downlight fix).

## Bench honesty — the round's discovery

The new Luna PIXEL gate measured what every dmean-0.000 gate silently sat
on: settled SwiftShader captures are NOT bit-reproducible. Same-code
run-vs-run reproduces the same envelope (maxDiff ~215, millions of
sub-pixels — the AE servo's ±1-LSB exposure quanta scaling every pixel).
The negative-control gate is therefore an ENVELOPE gate: current-vs-baseline
must not exceed run-vs-run noise. It doesn't — and the cloud code was
exonerated by the same-code A/B, not by assertion.

## Witnesses (all PASS)

- Alignment (the Phase-4 exit assert): GPU mode-8 shade vs twin Δ 0.0012;
  mode-9 coverage Δ 0.0008 (tolerance 0.03).
- σ(0): the located clear-sky pose renders PIXEL-EXACT clouds-on vs
  clouds:false (maxDiff 0, 0 subpixels).
- Star occlusion: 71 vs 159,859 bright pixels through the verified dense
  night deck (the first witness pose had drifted clear — the field moves;
  every cloud scene must be located at ITS OWN t).
- cloud-drift flicker 0.00304 vs the PRE-REGISTERED ≤ 0.00315 ceiling
  (metered; the fixedEV re-baseline supersedes it).
