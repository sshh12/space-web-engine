export const meta = {
  name: 'critique-round12',
  description: 'Round-12 adversarial critique panel: Phase 2 oriented structure (wind/stress/age fields, tectonism, bedforms, edifices/rift, consequence albedo)',
  phases: [
    { title: 'Review', detail: 'one finder per lens (Opus) reads its stills + round-11 baseline A/B' },
    { title: 'Verify', detail: 'each finding gets 2 skeptics (Sonnet) that try to refute' },
  ],
}

// Standing rule 1: judges run on Opus/Sonnet regardless of driver. Finders =
// Opus (spot real defects); skeptics = Sonnet (adversarially refute).
// IMPORTANT context for every lens: round 12 added COARSE WORLD CONTENT —
// three shield edifices + one rift system on Rubra (winner-take-all on the
// swell), one hotspot island on Tellus, wrinkle ridges/rilles on Luna maria,
// dune fields, and windExpo/youth-driven albedo provinces. Flow routing and
// moisture legitimately REACT to the new topography (they sample the coarse
// height), so Tellus/Rubra coastline-scale content deltas vs the round-11
// baseline are EXPECTED world responses, not regressions — judge whether the
// round-12 frame is RIGHT, not whether it changed. The baseline used for A/B
// was re-rendered from the round-11 build on the SAME DAY as this sweep.
const STILLS = 'C:/dev/planet-render/bench/out/stills';
const BASE = 'C:/dev/planet-render/bench/baseline/stills'; // round-11 A/B

const LENSES = [
  {
    key: 'oriented-structure',
    scenes: ['rubra-canyon-dawn', 'rubra-rift-oblique', 'luna-wrinkle-mare', 'rubra-disk', 'cliff-bench-rubra'],
    rubric: `Tectonism (round 12): anisotropic stamps in a closed-form stress frame — wrinkle ridges (asymmetric vergent ribbons, CONCENTRIC around Luna mascons and the Rubra swell periphery), grabens (sparse paired-scarp troughs, RADIAL fans on the Rubra dome, arcuate at mascon margins), one great rift with terraced walls (stress-boosted strata). Hunt: (a) ridges/grabens that read as ISOTROPIC noise or random bumps instead of oriented systems; (b) obvious periodicity/lattice repeat (equal spacing everywhere = the anchored-packet wavelength showing through); (c) tile-boundary discontinuities in ridge trains; (d) the rift: does it read as a canyon SYSTEM (tapered ends, en-echelon side troughs, walls) or a painted trench (uniform width, hard edges)? (e) ridges crossing terrain they should not (through fresh craters implausibly, over the rift floor).`,
  },
  {
    key: 'bedforms',
    scenes: ['rubra-dune-sea', 'dune-field-edge', 'pavement-walk-rubra', 'tellus-megadunes', 'beach-eye'],
    rubric: `Coherent bedform systems (round 12): dune crest trains along the [global] wind, defects/Y-junctions where the wind turns, slip-face asymmetry (steep lee), amplitude keyed on sand supply (catena fines + lee-lowland regional term). Hunt: (a) dune fields reading as isotropic bumps or noise (no coherent crest direction); (b) a visible LATTICE or equal-spacing repeat; (c) crest trains that stop at a straight line (tile boundary or packet-window edge); (d) dunes on terrain that should have none (steep slopes, windward scoured plateaus, rainforest); (e) the eye-level G4 sand ripples: do they still read coherent and do they run CONSISTENT with the dune-scale wind direction? (f) Tellus polar megadunes: subtle banding is right — flag if they read as strong dunes or as nothing at all.`,
  },
  {
    key: 'singularity-disc',
    scenes: ['rubra-disk', 'rubra-dust-limb', 'blue-marble', 'earthrise', 'crescent-limb'],
    rubric: `Winner-take-all singularity + consequence-chain albedo (round 12). The Rubra disc should now have a FACE: a Tharsis-class shield cluster (look for the flank shading + caldera dots), ONE rift system scar, and dark scour provinces (wind-scoured young lowland basalt) + bright mantled highs that read as albedo GEOGRAPHY. Hunt: (a) edifices reading as pasted circles / bullseyes (caldera rings too perfect, no interaction with craters/relief); (b) the rift visible as an obvious straight dark STROKE (should taper and meander slightly via wall benches); (c) scour/mantle tint painting over the terminator or into shadows (it must be albedo, not lighting); (d) Luna disc must be essentially UNCHANGED vs baseline except mascon-interior ridge texture at high zoom — flag ANY Luna disc-scale albedo change; (e) Tellus: one island/highland at the hotspot — flag if it broke coastlines elsewhere (flow/moisture react legitimately, but the DISC should not shift exposure: dmean stays ~0).`,
  },
  {
    key: 'two-body-overfit',
    scenes: ['pavement-walk-luna', 'luna-boulderfield', 'pavement-walk-rubra', 'crater-rim-walk', 'luna-wrinkle-mare'],
    rubric: `The anti-overfit gate (standing law): one mechanism, different agents per body — NEVER one body's look re-tuned onto another. Round 12: (a) Luna must stay WINDLESS — no ripples, no dunes, no scour/mantle tint anywhere on Luna (the wind channels are structurally zero there); flag ANY aeolian-looking pattern on Luna; (b) Luna wrinkle ridges must read as lunar mare ridges (smooth, low, sinuous under grazing light), NOT as Rubra's sharper tectonic ridges; (c) Rubra keeps its Curiosity-pan pavement look unchanged at eye level (the round-8 legacy) — flag if the new stress-aligned joint orientation broke the flagstone read or made plates visibly ANISOTROPIC in a repeated direction everywhere; (d) G1 joints on Luna must remain equant impact shatter (stressAlign is 0 there).`,
  },
  {
    key: 'regression',
    scenes: ['blue-marble', 'ocean-sunset-glint', 'coast-archipelago', 'ecotone-traverse', 'river-outlet', 'alpen-dawn', 'luna-terminator', 'beach-eye'],
    rubric: `Round-12 regression sweep. A/B vs the round-11 baseline (re-rendered same-day): flag any NEW artifact — exposure shifts, spec/roughness changes, ocean glint changes, star field changes, LOD seams/stipple residue, missing content. KNOWN-GOOD deltas (do not flag): Tellus coastline/moisture/vegetation SHIFTS at region scale (flow+moisture legitimately re-routed around the new hotspot edifice and coarse content — judge whether the new geography is self-consistent, not whether it moved); Rubra disc face changes (edifices/rift/provinces are the round's deliverable); dune fields where plains used to be flat. Ignore pre-existing registered items (grazing wave streaking, horizon-line AA, luna-terminator cross-face seam, L14 boulder band, joint-crack sparkle web).`,
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
          isRegression: { type: 'boolean', description: 'true if NEW vs round-11 baseline; false if pre-existing/registered' },
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

const finderPrompt = (lens) => `You are a photorealism critic on the round-12 panel. LENS: ${lens.key}.
Read these round-12 stills (PNG): ${lens.scenes.map((s) => `${STILLS}/${s}.png`).join(' , ')}.
Where a round-11 baseline exists, also read ${BASE}/<scene>.png and do an explicit A/B.
CONTEXT: round 12 added coarse world content (edifices, a rift, wrinkle ridges, dune fields,
scour/mantle albedo provinces) and flow/moisture legitimately REACT to the new topography —
content deltas are expected; judge whether the round-12 frame is RIGHT, not whether it changed.
${lens.rubric}
Report ONLY defects you can actually SEE in the images (open each with the Read tool). Be specific
about scene + location. Rank by severity. Do NOT invent issues; an empty list is a valid answer if
the images look right. Return via the structured schema.`

phase('Review')
const reviews = await pipeline(
  LENSES,
  (lens) => agent(finderPrompt(lens), { label: `find:${lens.key}`, phase: 'Review', model: 'opus', schema: FINDINGS })
    .then((r) => ({ lens: lens.key, findings: (r?.findings ?? []) })),
  // verify each finding with 2 Sonnet skeptics that try to REFUTE
  (review) => parallel((review.findings).flatMap((f) =>
    [0, 1].map((k) => () =>
      agent(`Adversarially REFUTE this round-12 panel finding. Open the image(s) yourself and check.
Finding: "${f.title}" in scene ${f.scene} (severity ${f.severity}, claimedRegression=${f.isRegression}).
Detail: ${f.detail}
Round-12 still: ${STILLS}/${f.scene}.png . Round-11 baseline (if it exists): ${BASE}/${f.scene}.png .
CONTEXT: round 12 added coarse world content (edifices/rift/ridges/dunes/albedo provinces); flow and
moisture legitimately re-routed around the new topography, so region-scale content deltas on Tellus/
Rubra are expected responses — a delta is only a defect if the round-12 frame itself is WRONG.
Decide: is this a REAL, actionable defect visible in the round-12 image (and, if claimed as a
regression, actually WORSE than the round-11 baseline)? Default to refuted=true if the image does
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
