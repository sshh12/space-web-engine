# Round-13 adversarial critique panel — results + dispositions

Multi-lens panel (Workflow tool) over the round-13 sweep (`bench/out/stills`) vs
the **same-day git-stash-A/B round-12 baseline** (`bench/baseline/stills`):
6 lenses (whittaker / seasonal-cap / strata-space-weathering / inverted-relief /
two-body-overfit / regression) × find → verify, finders on **Opus**, skeptics on
**Sonnet** (standing rule 1). **12 agents, 0 errors; 6 raw findings → 1 confirmed
regression fixed in-round, 2 confirmed pre-existing/register, 1 softer, 2
refuted.**

## The headline: the two riskiest new mechanisms cleared with ZERO findings

- **Seasonal cap lens: 0 findings.** The §11 disc/ground agreement (the pre-code
  review's D1 frame fix — companion discs use the OWN-frame declination
  `dot(uBodyR1,uBodySun)`), the winter/summer advance-retreat, the
  permanent-ice non-double-bright gate, and the Luna-airless negative control
  all survived direct adversarial inspection across blue-marble / polar-cap /
  rubra-disk / terminator scenes.
- **Inverted-relief lens: 0 findings.** No place the raised paleochannels read
  as random bumps or fight the incised valleys (the D4 mid-flow-band worked);
  no unnatural additive lumps on the plains.

## Refuted

- **[HIGH, claimed REGRESSION — REFUTED 1-0] "Every boulder vanished on
  boulder-macro-rubra."** The finder saw a bare dune desert; the skeptic
  re-rendered the scene IN ISOLATION (fresh page) and the boulder field is
  complete (metrics deltas collapsed to dslope 0.005 / dkurt 6.8). Root cause:
  the 68-shot sweep reuses ONE puppeteer page across all scenes, so a
  rock-streaming timing hiccup / state leak produced a one-off incomplete
  capture — NOT a deterministic round-13 regression. `scattercore.js` is
  byte-identical to round 12; no round-13 term touches rockDensity or the
  instanced-rock visibility path. (Registered: the single-page sweep's
  occasional under-settled capture — a bench-harness flake, not a world defect.)
- **[LOW] pavement-walk-luna joint-crack firefly speckle — REFUTED.** Present
  (in fact more extensive) in the round-12 baseline; the registered joint-crack
  sparkle family (already adjudicated in critique-round12.md). Pre-existing.

## Confirmed — fixed in-round

- **[MED, REGRESSION] pavement-walk-luna reads as a mechanical joint grid vs
  round-12's organic bright-crack pavement.** Investigated with two isolated
  re-renders: (1) round-13 was over-darkening the pavement — space weathering
  (Luna weatherK 0.35) was maturity-darkening the bright fresh SAND-FILL in the
  joints, muting the crack network (dmean +0.042 vs baseline). **Fixed
  in-round**: the space-weathering `immature` term now includes `fill` (fresh
  fines deposits stay bright — a young deposit must not mature-darken) and Luna
  weatherK 0.35→0.2; dmean restored to −0.002. (2) The RESIDUAL grid persisted
  with space weathering fixed AND with strata-in-plan disabled — it is the
  PRE-EXISTING joint-lattice / metre-shadow grazing moiré (the registered
  round-12 grazing cross-hatch family), merely UN-MASKED by round-13's *correct*
  resurfacing-SFD smoothing of the maria (a smoother mare surface breaks up the
  joint grid less). Registered forward: the joint/shadow-map grazing AA (round
  14). Also: **Luna strata-in-plan set OFF this round** (planK 0) — it added a
  slight tonal banding on the mare that compounded the busy look; strata-in-
  plan ships on **Rubra only** (the strong, probe-confirmed canyon-wall case),
  Luna mare-flow benches registered forward.

## Confirmed — pre-existing / registered

- **[MED] blue-marble: Whittaker biome geography is illegible on the whole
  disc** (land crushed to near-white cream, chroma ~absent). CONFIRMED but
  PRE-EXISTING: byte-adjacent to the round-12 baseline (max Δ 35, 0.35% of
  pixels differ) — it is the disc's pre-existing ACES/exposure calibration
  pushing high-albedo land into the near-white compression region while ocean
  keeps its mid-tone hue. The Whittaker MIX is correct (the eye-level probes
  showed a clean green/tan/steppe gradient); the flagship disc exposure hides
  it. Registered: whole-disc biome legibility (an exposure/tonemap-vs-land-
  albedo calibration item, round 14).
- **[LOW] alpen-dawn: near-field foreground shows an olive-green/tan checkerboard
  stipple** rather than a smooth ecotone. CONFIRMED, new: the biome/wetness tint
  keys on the baked moisture texel field `F4.g`; `smoothstep` widens the
  value-space transition but does not spatially blur a texel-quantized input, so
  at extreme near-field grazing the bake-resolution texels are screen-magnified
  into blocks. Narrow band, under cloud shadow. Registered: a footprint fade on
  the biome-class differentiation at extreme near range (round 14).

## Softer (1 vote)

- **[MED→SOFTER] luna-wrinkle-mare contrast/relief drop.** The named cause
  (over-applied lee streaks) was REFUTED — lee streaks are architecturally OFF
  on windless Luna (`uStreakK` unset, F5≈0), and the "combed streaks" the finder
  saw are the PRE-EXISTING crater ray system read edge-on (cross-correlates with
  the baseline). The real, milder residue: a near-field-concentrated contrast
  drop (near half std 39.3→28.6, far half barely moves) = round-13's resurfacing
  SFD legitimately smoothing the mare craters + the tile-settling capture family.
  Correct behaviour + a pre-existing capture family, registered.

## Panel-confirmed positives

- The seasonal cap reads as physical frost and advances/retreats with season on
  both Tellus (snow) and Rubra (CO2); Luna stays uncapped (airless control).
- Inverted-relief paleochannel ridges read coherently; no incision fight.
- No new oriented-stamp lattice repeat, no Whittaker salt-and-pepper at normal
  range, no seasonal-cap §11 disc/ground disagreement — the lenses hunting the
  round's own mechanisms came back empty on mechanism defects.
