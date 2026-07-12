export const meta = {
  name: 'critique-round10',
  description: 'Round-10 adversarial critique panel: material texture stacks v2 + Water v2',
  phases: [
    { title: 'Review', detail: 'one finder per lens (Opus) reads its stills + round-9 baseline A/B' },
    { title: 'Verify', detail: 'each finding gets 2 skeptics (Sonnet) that try to refute' },
  ],
}

// Standing rule 1: judges run on Opus/Sonnet regardless of driver. Finders =
// Opus (spot the real defects); skeptics = Sonnet (adversarially refute).
const STILLS = 'C:/dev/planet-render/bench/out/stills';
const BASE = 'C:/dev/planet-render/bench/baseline/stills'; // round-9 A/B

const LENSES = [
  {
    key: 'water-glint',
    scenes: ['ocean-sunset-glint', 'coast-archipelago', 'blue-marble', 'crescent-limb', 'loworbit-sunset'],
    rubric: `Water v2. Look for: (a) the sun GLINT — is it broken into discrete Cox-Munk GLITTER sparkles near the camera, or an airbrushed smooth column (the registered defect)? (b) the wave field — any TILING MOIRE / periodic interference lattice from orbit (blue-marble), or does the broadband spectrum read as non-repeating? (c) surf/shoreline — foam where the seabed SHOALS vs a flat distance ring; sediment plume at river mouths; a hard discard edge or skirt-sag SEAM near the coast. (d) Fresnel sky-mirror + depth colour sane. NEW scenes (ocean-sunset-glint, coast-archipelago) have no round-9 baseline — judge on absolute realism.`,
  },
  {
    key: 'material-substance',
    scenes: ['pavement-walk-rubra', 'alpen-dawn', 'cliff-bench-tellus', 'cliff-bench-rubra', 'crater-rim-walk'],
    rubric: `Material texture stacks v2 (baked per-material detail: cracked basalt / regolith fines / duricrust / firn, hash-rotated §7). Look for: (a) does the ground read as SUBSTANCE (grain/cracks co-registered with shading) or as flat speckle / plastic? (b) any visible TILING or a repeating detail lattice (the §7 hash-rotation should hide the ~cm atlas repeat)? (c) a hard SEAM where the anti-tiling rotation field changes? (d) does spatially-varying roughness read (polished vs matte patches) without looking blotchy? Compare each to its round-9 baseline A/B — is the material a net improvement or a regression?`,
  },
  {
    key: 'airless-respeckle',
    scenes: ['pavement-walk-luna', 'luna-boulderfield', 'luna-terminator'],
    rubric: `Airless no-re-speckle gate (the round-9 lesson: harsh Luna exposure binarizes strong micro-relief into a black-pepper carpet, registered to round-11 Phase-M filtered normals). The round-10 material stacks fold the RELIEF out fast (matN) to avoid adding to this. Compare each Luna still to its round-9 baseline A/B: did round-10 make the airless carpet / leopard-spot stipple WORSE, the same, or better? Flag ONLY a genuine round-10 regression; the pre-existing grazing carpet is already registered — do NOT re-report it as new.`,
  },
  {
    key: 'regression',
    scenes: ['earthrise', 'luna-terminator', 'rubra-canyon-dawn', 'rubra-blue-sunset', 'night-hemisphere', 'blue-marble'],
    rubric: `Round-10 regression sweep (material + water changes must not disturb anything else). Compare each still to its round-9 baseline A/B. Flag any NEW artifact vs round-9: shifted exposure, colour/albedo shift on land, broken spec/roughness, disc changes, seams. Ignore pre-existing registered items (Tellus disc over-exposure, cross-face limb seam, airless grazing carpet).`,
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
          isRegression: { type: 'boolean', description: 'true if NEW vs round-9 baseline; false if pre-existing/registered' },
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

const finderPrompt = (lens) => `You are a photorealism critic on the round-10 panel. LENS: ${lens.key}.
Read these round-10 stills (PNG): ${lens.scenes.map((s) => `${STILLS}/${s}.png`).join(' , ')}.
Where a round-9 baseline exists, also read ${BASE}/<scene>.png and do an explicit A/B.
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
      agent(`Adversarially REFUTE this round-10 panel finding. Open the image(s) yourself and check.
Finding: "${f.title}" in scene ${f.scene} (severity ${f.severity}, claimedRegression=${f.isRegression}).
Detail: ${f.detail}
Round-10 still: ${STILLS}/${f.scene}.png . Round-9 baseline (if it exists): ${BASE}/${f.scene}.png .
Decide: is this a REAL, actionable defect visible in the round-10 image (and, if claimed as a regression, actually WORSE than the round-9 baseline)? Default to refuted=true if the image does not clearly show it. Skeptic #${k}.`,
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
