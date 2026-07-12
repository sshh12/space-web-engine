# Round-11 adversarial critique panel — results + dispositions

Multi-lens panel (`bench/critique-round11.workflow.js`, run via the Workflow
tool) over the round-11 sweep (`bench/out/stills`): 5 lenses (lod-seams /
scatter-handdown / airless-carpet / stars-night / regression) × find →
2-skeptic verify, finders on **Opus**, skeptics on **Sonnet** (standing rule
1). **27 agents, 0 errors, 8 confirmed (2 votes) + 1 softer from 11 raw.**
The panel again caught the one real regression the driver's probes had missed
— the warm-cache display freeze — because its stills came from the full
SEQUENTIAL sweep, which is exactly the state the driver's fresh-cache probes
cannot reproduce. Dispositions below.

## Fixed in-round (the post-panel batch)

- **[HIGH, REGRESSION] beach-eye: all scattered rocks vanished — scene fully
  bald; ripple/dune texture flattened** (two finders independently). Root
  cause (fifth scheduler probe, replicating the sweep's scene order): after a
  same-body pose change (coast-400km → beach-eye) the ENTIRE 800-tile cache
  sat on the new pose's desired-path lineages — the two poses genuinely share
  the region — so binary "desired-path warmth" protected every inherited
  tile, preemption found cold = 0, room pinned at 0, and the display froze at
  the inherited L9 allocation (fresh-cache probes of the same pose reached
  L19: the driver's battery could not see it). Fix: **value-ranked preemptive
  rebalancing** in the same error currency as the requests, hardened by four
  more instrumented probes: (6) covered non-displayed tiles are reclaimable
  at 0.1× their covering zone's suffered error, but ONLY from an earlier
  POSE EPOCH — reclaiming the current unlock's fresh bakes rebaked them
  forever (bake→cover→reclaim→rebake churn: the ocean-fixed motion path went
  2.4× on flicker before the epoch gate); (7) an absolute suffering floor
  (topErr > 3) keeps the rebalancer idle at settled budget-bound equilibria;
  (8) the legacy DISPLAY itself pins ~400 slots after a pose change (it
  can't release without room, room can't free without it) — displayed
  earlier-epoch tiles are reclaimable at their one-level-fallback error with
  disposal DEFERRED one frame (the zone falls back to its cached ancestor;
  no hole frame); (9) the epoch's neighbourhood scale must be the SMALLER of
  then/now altitudes, or a page-load orbital epoch sets an 80,000 km bar
  nothing crosses. Trades only go UP by a 4× margin (a strictly decreasing
  display-error potential — no thrash cycles), and the current epoch's
  display + all ancestor chains stay untouchable. Verified on BOTH failure
  modes: the sweep-sequence beach-eye reaches the L19 equilibrium (532
  displayed tiles, settle 80 s) with boulders + ripples + the distant clast
  field, while ocean-fixed flicker returns to baseline-or-better
  (0.000991 vs 0.001008).

## Registered — pre-existing (confirmed present in the round-10 baseline)

- **[MED] luna-terminator: razor-straight vertical seam clips the lit surface
  at the terminator** (two finders). Pixel-identical in the round-10 baseline
  — the registered cross-face limb seam family (silhouette/skirt rework row),
  not a round-11 item. (The σ-shoulder was briefly suspected — impossible at
  this pose: orbital tiles carry uMesoRamp = 0, the shoulder is inert there.)
- **[MED] crater-rim-walk: hexagonal facet-edge lattice + dark stipple on the
  eye-level foreground regolith.** Identical in baseline; the registered
  grazing meso-facet family at NEAR field, where the round-11 fold correctly
  refuses to act (vFold→0: resolved facets stay honestly bimodal). The
  skeptics independently verified the finder's aside: the baseline's
  mid-left crater-floor stipple band IS gone in round-11 — the filtered
  normals working exactly where they should.
- **[LOW ×3] pavement-walk-luna / luna-boulderfield: bright sparkle "web" /
  black-pepper dither along joint-crack seams.** Pre-existing (baseline
  A/B'd earlier in-round too): the G1 joint-groove spec/crack aliasing
  family, unchanged by the hand-down. Registered.

## Metering-consequence deltas (not shading regressions)

- **[MED→soft] ocean-sunset-glint: sky ≈6% darker; [LOW] ecotone-traverse:
  ≈4% brighter with slight cool drift.** The 8 date-rotated CONTROLS all gate
  dmean ≈ 0.000 — there is no global exposure/shading shift. These scenes'
  displayed CONTENT changed honestly (the equilibrium display resolves more
  sea/terrain), and the auto-exposure meters the picture it sees (§10 —
  that's its job). The glint itself (round-10's headline) verified intact on
  the still. Disposition: consequence of the display-correctness fix;
  baseline re-promotion absorbs it.

## The headline positives (panel-confirmed)

- The round-10 BASELINE's display-starvation artifacts are gone: the blown
  coarse-tile wall in pavement-walk-luna, coast-archipelago's missing
  islands, and crater-rim-walk's washed mid-field stipple band all render
  resolved — the panel judged the deltas as fixes under the pre-briefed
  provenance note.
- luna-knife-edge: stars stop AT the terrain/boulder silhouette (the
  registered star-burn is gone; grad-kurt 1026 → 178) with the sky field
  intact above.
- No LOD notch, no stipple residue in any settled still, no scatter edge —
  the lenses hunting the round's own mechanisms came back empty.
