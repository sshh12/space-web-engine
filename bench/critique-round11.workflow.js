export const meta = {
  name: 'critique-round11',
  description: 'Round-11 adversarial critique panel: Phase M core (geomorph, crossfade, scatter hand-down, honest budget, filtered normals, star occlusion)',
  phases: [
    { title: 'Review', detail: 'one finder per lens (Opus) reads its stills + round-10 baseline A/B' },
    { title: 'Verify', detail: 'each finding gets 2 skeptics (Sonnet) that try to refute' },
  ],
}

// Standing rule 1: judges run on Opus/Sonnet regardless of driver. Finders =
// Opus (spot the real defects); skeptics = Sonnet (adversarially refute).
// IMPORTANT context for every lens: round 11 replaced the request scheduler —
// several round-10 BASELINE stills carry display-starvation artifacts (a blown
// white coarse-tile wall in pavement-walk-luna's right quarter; coast-
// archipelago's islands entirely missing). A large A/B delta on those scenes
// is the FIX, not a regression — judge which side is RIGHT, not which changed.
const STILLS = 'C:/dev/planet-render/bench/out/stills';
const BASE = 'C:/dev/planet-render/bench/baseline/stills'; // round-10 A/B

const LENSES = [
  {
    key: 'lod-seams',
    scenes: ['pavement-walk-luna', 'alpen-dawn', 'coast-400km', 'rubra-canyon-dawn', 'crater-rim-walk', 'cliff-bench-tellus'],
    rubric: `Per-vertex geomorph + honest scheduler (Phase M). Hunt for LOD pathology: (a) straight-edged NOTCHES or height steps along tile boundaries (the registered per-tile-scalar notch — should now be impossible); (b) stipple/dither patterns left in a settled still (a crossfade that failed to complete = settle bug); (c) blown-white or blurry COARSE-TILE patches at eye level (display starvation — the round-10 baseline HAS these; the round-11 still must NOT); (d) mixed-depth seams, texel-resolution walls, see-through cracks.`,
  },
  {
    key: 'scatter-handdown',
    scenes: ['pavement-walk-luna', 'luna-boulderfield', 'pavement-walk-rubra', 'boulder-macro-rubra', 'beach-eye'],
    rubric: `Scatter hand-down (Phase M): the hard 800 m rock visibility radius is GONE — per-instance screen-footprint folds + a ground-texture conservation trade replace it. Look for: (a) a visible EDGE/line where rocks stop (the render bubble — should be a soft size-sorted dissolve now); (b) rock density reading as double-counted (instances over a ground texture that still carries the same rocks = too busy) or under-counted (bald ground beyond the instances where the texture fails to take over); (c) the new mid-field clast carpet: does it read as a real ejecta/lag field (Apollo-like) or as uniform sprinkles? (d) any tile-boundary discontinuity in rock density.`,
  },
  {
    key: 'airless-carpet',
    scenes: ['pavement-walk-luna', 'luna-terminator', 'beach-eye', 'crater-rim-walk', 'boulder-macro-rubra', 'luna-boulderfield'],
    rubric: `Filtered-normal folding (round 11 shipped the TRUE-cause fix for the thrice-misattributed grazing meso-facet carpet: mesh normals fold to a smooth twin as facets go sub-footprint, and the folded variance re-enters the direct term as a Gaussian shoulder). A/B each still vs the round-10 baseline: (a) is the mid/far-field black-pepper / checker / hash-dither CARPET on grazing regolith reduced? (b) did the fix WASH OUT legitimate shading — near-field facets must stay honestly bimodal, normal-sun scenes must be unchanged; (c) two-body gate: the same mechanism runs on Tellus (beach-eye) and Rubra (boulder-macro) — flag if either loses real texture or keeps its band unchanged.`,
  },
  {
    key: 'stars-night',
    scenes: ['luna-knife-edge', 'night-hemisphere', 'earthrise', 'luna-terminator'],
    rubric: `Star occlusion by terrain (round 11: each star now depth-tests against the rendered scene). (a) luna-knife-edge: do stars still burn through the boulders / ridge silhouette (the registered defect)? They must stop AT the terrain silhouette while still filling the sky above it; (b) no NEW star losses: stars above the true horizon must survive (an over-eager depth test would eat stars near the limb / in the sky); (c) night scenes otherwise unchanged vs baseline (star density, PSF, Milky Way band).`,
  },
  {
    key: 'regression',
    scenes: ['blue-marble', 'ocean-sunset-glint', 'coast-archipelago', 'rubra-blue-sunset', 'ecotone-traverse', 'river-outlet', 'luna-terminator'],
    rubric: `Round-11 regression sweep (streaming/LOD + shading changes must not disturb world content). A/B vs the round-10 baseline: flag any NEW artifact — exposure shifts, albedo/colour drift, spec changes, ocean glint/corduroy changes, disc-scale changes, missing content. KNOWN-GOOD deltas (do not flag): coast-archipelago now SHOWS its islands (the baseline's missing-island frame was display starvation); pavement-walk-luna's white wall is gone; mid-field rock density is higher by design (hand-down). Ignore pre-existing registered items (grazing wave streaking at oblique overlooks, horizon-line AA, orbital quad-grid dither).`,
  },
]

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'one-line defect' },
          scene: { type: 'string', description: 'scene name it appears in' },
          severity: { type: 'string', enum: ['high', 'med', 'low'] },
          isRegression: { type: 'boolean', description: 'true if NEW vs round-10 baseline; false if pre-existing/registered' },
          detail: { type: 'string', description: 'what/where, and the A/B verdict if a baseline exists' },
        },
        required: ['title', 'scene', 'severity', 'isRegression', 'detail'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean', description: 'true if the finding is NOT a real/actionable defect' },
    reason: { type: 'string' },
  },
  required: ['refuted', 'reason'],
}

const finderPrompt = (lens) => `You are a photorealism critic on the round-11 panel. LENS: ${lens.key}.
Read these round-11 stills (PNG): ${lens.scenes.map((s) => `${STILLS}/${s}.png`).join(' , ')}.
Where a round-10 baseline exists, also read ${BASE}/<scene>.png and do an explicit A/B.
CONTEXT: round 11 rebuilt the LOD scheduler — some BASELINE stills carry display-starvation
artifacts (blown coarse-tile wall in pavement-walk-luna; coast-archipelago's islands missing).
A big delta there is the fix; judge which side is RIGHT.
${lens.rubric}
Report ONLY defects you can actually SEE in the images (open each with the Read tool). Be specific about scene + location. Rank by severity. Do NOT invent issues; an empty list is a valid answer if the images look right. Return via the structured schema.`

phase('Review')
const reviews = await pipeline(
  LENSES,
  (lens) => agent(finderPrompt(lens), { label: `find:${lens.key}`, phase: 'Review', model: 'opus', schema: FINDINGS })
    .then((r) => ({ lens: lens.key, findings: (r?.findings ?? []) })),
  // verify each finding with 2 Sonnet skeptics that try to REFUTE
  (review) => parallel((review.findings).flatMap((f) =>
    [0, 1].map((k) => () =>
      agent(`Adversarially REFUTE this round-11 panel finding. Open the image(s) yourself and check.
Finding: "${f.title}" in scene ${f.scene} (severity ${f.severity}, claimedRegression=${f.isRegression}).
Detail: ${f.detail}
Round-11 still: ${STILLS}/${f.scene}.png . Round-10 baseline (if it exists): ${BASE}/${f.scene}.png .
CONTEXT: round 11 rebuilt the LOD scheduler; the round-10 baseline itself carries display-starvation
artifacts in some scenes (missing islands, blown coarse walls) — a delta relative to a BROKEN baseline
frame is not automatically a regression; judge whether the round-11 frame itself is wrong.
Decide: is this a REAL, actionable defect visible in the round-11 image (and, if claimed as a
regression, actually WORSE than the round-10 baseline)? Default to refuted=true if the image does
not clearly show it. Skeptic #${k}.`,
        { label: `verify:${f.scene}:${k}`, phase: 'Verify', model: 'sonnet', schema: VERDICT })
        .then((v) => ({ ...f, lens: review.lens, vote: v?.refuted === false ? 1 : 0, reason: v?.reason ?? '' }))
        .catch(() => null)
    )
  )).then((votes) => {
    // group the 2 votes per finding back together
    const byKey = new Map()
    for (const v of votes.filter(Boolean)) {
      const key = v.scene + '|' + v.title
      const e = byKey.get(key) ?? { ...v, votes: 0, reasons: [] }
      e.votes += v.vote; e.reasons.push(v.reason)
      byKey.set(key, e)
    }
    return [...byKey.values()]
  })
)

const all = reviews.flat().filter(Boolean)
const confirmed = all.filter((f) => f.votes >= 2)
const softer = all.filter((f) => f.votes === 1)
log(`panel done: ${confirmed.length} confirmed (2 votes) + ${softer.length} softer, from ${all.length} raw findings`)
return { confirmed, softer, raw: all }
