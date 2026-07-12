export const meta = {
  name: 'planet-visual-critique',
  description: 'Adversarial multi-lens visual critique of the planet renderer still suite',
  phases: [
    { title: 'Critique', detail: '5 visual lenses over the bench stills' },
    { title: 'Verify', detail: '2 skeptics per finding' },
  ],
}

// Round 9: judge the FRESH sweep output (Phase-1 photometry remainder), not an
// older baseline. Override with args.dir.
const DIR = (typeof args === 'object' && args && args.dir) || 'C:/dev/planet-render/bench/out/stills'
const CONTEXT = `You are critiquing screenshots of a from-scratch procedural planet renderer
(CONCEPT.md at C:/dev/planet-render; goal is a *credible* planet from orbit to bootprint).
Stills live in ${DIR} — read the ones your lens needs with the Read tool. Key scenes:
  disks/space: blue-marble, crescent-limb, earthrise, night-hemisphere, moon-sizes-fov{3,8,30,55}, terminator-split
  eclipse: lunar-eclipse-ring, lunar-eclipse-ground, transit-shadow, luna-knife-edge (earthshine)
  airless/regolith: luna-terminator, luna-boulderfield, crater-rim-walk, pavement-walk-luna, boulder-macro-luna, luna-knife-edge
  light/terrain: alpen-dawn, loworbit-sunset, rubra-canyon-dawn, rubra-blue-sunset, mountain-limb, cliff-bench-{tellus,rubra}
  ground residue: pavement-walk-rubra, boulder-macro-{rubra,tellus}, dune-field-edge
  consistency: lod-ladder-descent-00..11 (one site 20,000 km -> 5 m)
ROUND 9 shipped (Phase-1 photometry remainder — judge whether these LAND, and what they broke):
  (a) AIRLESS FILL: an opposition-surge SHOULDER (high-sun regolith no longer clips to featureless white); an
      isotropic airless ambient floor + a grazing-surviving sunlit-neighbour bounce (shadowed regolith gets fill
      instead of ink-black); a slope-scaled metre-scale-shadow bias (grazing rock shadows without acne).
  (b) REFRACTED-ANNULUS honest integral: the copper eclipse ring is now integrated over impact heights, amplitude
      scaled by recipe refractivity (Earth bright copper, Mars almost none) — lunar-eclipse-ring/-ground.
  (c) STAR OCCLUSION: stars are now blocked by companion discs + the sun (earthrise/moon-sizes: no stars burning
      through the lit disc).
  (d) PHYSICAL CAMERA: selectable metering (avg/center/spot) + white-balance choice (defaults identity).
  (e) ROUND-8 RESIDUE: directional ripple trains (along the wind, not isotropic grit); steepened catena fines->supply
      + a fines-pond albedo tint (crater-floor ponds read); a dedicated cliff-bench scene pair.
Report concrete, visible defects an attentive viewer would notice, ranked by impact, each tied to specific stills
and (when you can) a likely code/recipe cause in src/. Max 7 findings.
Do NOT report (documented roadmap / registered residual — NOT round-9 regressions):
  - the airless "black-pepper / leopard-spot" carpet AND the beach/dune "checker band" at GRAZING sun: round 9
    root-caused these (via mode diagnostics) to direct-term self-shadowing of the ~4m meso relief at the terminator,
    under-filled — the honest fix is Phase-M filtered/Toksvig normal folding (round 11). Round 9 softened but did not
    remove them. (Only report if you see a NEW hard-edged band clearly unrelated to grazing meso facets.)
  - MS second installment: green twilight limb fringe, Rubra sunset blue aureole / dark zenith, grazing-view
    pink/mauve aerial haze, distant-terrain-doesn't-meet-horizon-sky (registered; instrumented by horizon_gap).
  - clouds; overhangs/arches/formations; mesh-bound rock SILHOUETTES; ocean crosshatch/soft-glint/waveless
    (round 10 Water v2); exposure whiplash / relief pop-in radius / disc-to-ground albedo handoff (round 11 Phase M);
    a true master-joint octave + per-plate mean-plane counter-shaping (round-9 residue, deferred); UI/HUD; fast-mode
    atmosphere step banding; procedural (non-photo) textures.
ANTI-OVERFIT GATE (roadmap law): a photometry fix must read right on >=2 bodies — the airless fill must help Luna
WITHOUT washing out or milking Rubra/Tellus; a fix that only helps one body is a FINDING.`

const FINDINGS = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          shots: { type: 'string' }, title: { type: 'string' },
          detail: { type: 'string' }, suggestedFix: { type: 'string' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['shots', 'title', 'detail', 'suggestedFix', 'impact'],
      },
    },
  },
  required: ['findings'],
}
const VERDICT = {
  type: 'object', additionalProperties: false,
  properties: { real: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['real', 'reason'],
}

const LENSES = [
  { key: 'airless', prompt: `${CONTEXT}\nLENS: airless regolith photometry (round-9 headline) — on luna-terminator, luna-boulderfield, crater-rim-walk, pavement-walk-luna, boulder-macro-luna: does DIRECTLY LIT regolith read as bright dusty regolith (NOT clipped to featureless white — the opposition surge shoulder should keep it below clip), and do shadowed regions carry a plausible dim FILL rather than ink-black? Are boulders readable (crowns lit, denFloor not pockmark)? IGNORE the registered grazing-meso leopard/checker — judge the surge clip, the fill floor, and boulder readability. TWO-BODY: does Luna's fill/surge look right vs Rubra's dusty regolith (boulder-macro-rubra) — same law, or does one wash out?` },
  { key: 'eclipse-disc', prompt: `${CONTEXT}\nLENS: eclipse machinery + whole-disc ladder + planetshine (first full scene exercise) — lunar-eclipse-ring (does a COPPER refracted-annulus ring read around dark Tellus, dim as a real totality?), lunar-eclipse-ground (copper umbra light on the regolith?), transit-shadow (a penumbral dot on Tellus's disc?), earthrise + moon-sizes-fov{3,8,30,55} (does the disc show MARIA/provinces and the correct phase — never a white ball — and are stars NOT burning through the lit disc?), luna-knife-edge (earthshine fill on the night side?). Report anything that reads wrong, missing, or mis-scaled.` },
  { key: 'photometry', prompt: `${CONTEXT}\nLENS: BRDF / limb / surge across bodies — blue-marble, crescent-limb, terminator-split, moon-sizes, mountain-limb, rubra disc: do limb profiles and the day/terminator falloff read as measured photometry (Lommel-Seeliger + opposition surge: full-Moon-flat at low phase, limb-darkened crescent) rather than plastic Lambert? Ice/rock specular highlights plausible? Any body over- or under-exposed vs the others? Flag hue casts that look like a photometry bug (not the registered twilight-hue residuals).` },
  { key: 'routing-residue', prompt: `${CONTEXT}\nLENS: round-8 residue tunes + ground laws still holding — dune-field-edge, rubra-canyon-dawn, pavement-walk-rubra, cliff-bench-{tellus,rubra}, boulder-macro-*: do wind ripples now read as DIRECTIONAL TRAINS along the wind (not isotropic grit)? Do catena fines PONDS read on dust flats (crater floors lighter/smoother)? Do the new cliff-bench scenes show bench treads/risers as geology? Does the G1 two-body pavement gate still hold (Luna impact-shatter vs Rubra flagstone)? Report residue that did NOT land or newly regressed.` },
  { key: 'regression', prompt: `${CONTEXT}\nLENS: regression watch on ATMOSPHERE bodies — round 9's airless-fill, shadow-bias and annulus changes must not have touched Tellus/Rubra daytime looks. Compare alpen-dawn, loworbit-sunset, blue-marble, rubra-canyon-dawn, coast-400km against expectations: sky color vs sun elevation, terminator, long eye-level shadows (did the slope-scaled shadow bias detach/peter-pan any shadow?), exposure sanity. Flag ANY change that reads as a regression on an atmosphere body (the anti-overfit gate: the airless fix must not milk the day side).` },
]

phase('Critique')
// Standing rule 1 (ROADMAP execution plan): panel JUDGES run on Opus/Sonnet
// regardless of the round's driver model — judging a still does not need the
// frontier model.
const results = await pipeline(
  LENSES,
  (l) => agent(l.prompt, { label: `critique:${l.key}`, phase: 'Critique', schema: FINDINGS, effort: 'high', model: 'opus' }),
  (rev, lens) => {
    if (!rev || !rev.findings.length) return []
    return parallel(rev.findings.map((f) => () =>
      parallel([0, 1].map((i) => () =>
        agent(`${CONTEXT}\nA critic claims: "${f.title}" — ${f.detail} (shots: ${f.shots}).
Look at those stills yourself and judge: is this a real, visible, actionable defect an attentive viewer
would notice, or nitpicking / expected behavior / already-documented roadmap (see the do-NOT-report list)?
Default real=false when uncertain.`,
          { label: `verify:${lens.key}:${i}`, phase: 'Verify', schema: VERDICT, effort: 'high', model: 'sonnet' })))
        .then((votes) => ({ ...f, lens: lens.key, votes: votes.filter(Boolean).filter((v) => v.real).length }))
    ))
  },
)
const all = results.flat().filter(Boolean)
return {
  confirmed: all.filter((f) => f.votes >= 2).sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.impact] - { high: 0, medium: 1, low: 2 }[b.impact])),
  softer: all.filter((f) => f.votes === 1).map((f) => `${f.title} [${f.lens}]`),
}
