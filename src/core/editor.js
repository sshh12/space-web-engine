// editor.js — Phase E [editor]: the recipe mutation path's pure laws.
//
// The editor never mutates the live system. An edit produces a NEW recipe; this
// module owns (1) the invalidation taxonomy — every recipe datum classed by the
// cost of honoring its change, asserted complete against the shipped schema at
// module load (M5: counts are data, and so are schemas) — (2) classifyEdit(),
// the closed-form diff → invalidation-class map the engine dispatches on,
// (3) preflightEditedSystem(), the full assert battery run against a copy
// BEFORE the live world is touched (the dispose-then-brick law, user-facing),
// (4) the edit-continuity law — elements edited at running t re-solve their
// epoch anomaly so the body's current MEAN LONGITUDE is preserved at the edit
// instant (radial steps when a/e change are accepted and documented), and
// (5) the modest structural helpers: family templates, add/clone/delete.
//
// PURE core (no THREE/DOM/Date/random) — the Node fuzz suite and the browser
// panel consume the identical laws.

import {
  SYSTEM, assertPaletteRecipe, assertFigureRecipe, assertGiantRecipe,
  assertRingRecipe, assertGiantSystem, assertRingSystem,
} from './recipe.js';
import { assertMechanicsSystem, isLegacyOrbit } from './mechanics.js';
import { assertStructuredCloneSafe, makeBodyLayerMap } from './capacity.js';
import { assertBeltSystem, assertComaRecipe } from './smallbody.js';
import { assertCloudRecipe } from './cloudcore.js';
import { figOf, figPreflight } from './figure.js';
import { orbitalPhaseAt } from './frames.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const wrapPi = (a) => { let x = a % TAU; if (x > Math.PI) x -= TAU; if (x < -Math.PI) x += TAU; return x; };

// ---------------------------------------------------------------------------
// 1. The invalidation taxonomy (the published table — docs/EDITOR.md mirrors it)
// ---------------------------------------------------------------------------

/** Class name -> the mechanism the engine runs for it (documentation-as-data). */
export const EDIT_CLASSES = Object.freeze({
  presentation: 'labels / default poses / visibility hints — zero invalidation, menu re-label at most',
  look: 'render-side re-bind: material + sky + LUT uniforms rebuilt, disc map re-baked from the warm tile cache; worker tile bytes untouched',
  clouds: 'cloud keyframe (or Phase W mean) rasters re-requested; deck/lightning uniforms re-bound',
  mechanics: 'frames re-derive closed-form (free); storm/hood cloud keyframes re-request for the edited body AND its descendants; insolation-context bands re-bake where authored',
  processes: 'band-selective tile re-bake from the shallowest changed band (invalidationLevel) + disc re-bake',
  rebuild: 'full body rebuild: worker baker dropped, asset packs regenerated, coarse residency dropped, tiles/disc re-baked',
  system: 'structural: the full setSystem preflight/teardown path (membership, identity, frame-tree shape, star, nodes, resonances)',
});

/** Every body recipe datum, classed. A key absent here is a schema violation. */
export const BODY_KEY_CLASS = Object.freeze({
  id: 'system', parent: 'system',
  name: 'presentation', camera: 'presentation', skyHidden: 'presentation',
  GM: 'mechanics', orbit: 'mechanics', spin: 'mechanics',
  processes: 'processes',
  clouds: 'clouds',
  palette: 'look', discAlbedo: 'look', brdf: 'look', atmosphere: 'look',
  water: 'look', ground: 'look', matStack: 'look', seasonalCap: 'look',
  ambientAlbedo: 'look', giant: 'look', rings: 'look',
  // Phase B: the coma/tail is a pure emission look — consumed by the point
  // tier's flux hand-down and the system view, never by any bake input.
  coma: 'look',
  // R changes tile geometry AND the bake's face arc; seaLevel/figure/rocks/
  // formations are bake inputs (bakecore reads seaLevel at :743, rockCell at
  // :1989); maxBakeLevel changes the ladder depth.
  R: 'rebuild', seaLevel: 'rebuild', figure: 'rebuild', maxBakeLevel: 'rebuild',
  rocks: 'rebuild', formations: 'rebuild',
});

/** Star data: everything but the label takes the structural path (rare edits,
 * global consequences — irradiance/GM/radius feed every body's lighting/n). */
export const STAR_KEY_CLASS = Object.freeze({
  name: 'presentation', GM: 'system', radius: 'system',
  irradianceAt1AU: 'system', color: 'system',
});

/** System-level data. 'bodies'/'star' recurse into the tables above. */
export const SYSTEM_KEY_CLASS = Object.freeze({
  id: 'system', validYears: 'presentation',
  star: 'per-key', bodies: 'per-body', nodes: 'system', resonances: 'system',
  // Phase B: belts regenerate their instanced buffers on the setSystem path —
  // system-scope by decree (rare edits, whole-annulus consequences).
  belts: 'system',
});

/** M5: the taxonomy is complete against a system's actual schema — every key of
 * every body (and the star, and the system) has a declared class. Throws by name. */
export function assertEditTaxonomy(system) {
  for (const key of Object.keys(system)) {
    if (!(key in SYSTEM_KEY_CLASS)) throw new Error(`editor: system key '${key}' has no invalidation class`);
  }
  for (const key of Object.keys(system.star ?? {})) {
    if (!(key in STAR_KEY_CLASS)) throw new Error(`editor: star key '${key}' has no invalidation class`);
  }
  for (const body of system.bodies ?? []) {
    for (const key of Object.keys(body)) {
      if (!(key in BODY_KEY_CLASS)) throw new Error(`editor: body '${body.id}' key '${key}' has no invalidation class`);
    }
  }
  const classes = new Set(Object.keys(EDIT_CLASSES));
  for (const [key, klass] of [...Object.entries(BODY_KEY_CLASS), ...Object.entries(STAR_KEY_CLASS)]) {
    if (!classes.has(klass)) throw new Error(`editor: key '${key}' maps to unknown class '${klass}'`);
  }
  return true;
}
// Module-load assert on the shipped demo schema (sol is asserted by its suite
// and by preflightEditedSystem on every edited payload).
assertEditTaxonomy(SYSTEM);

// ---------------------------------------------------------------------------
// 2. classifyEdit — closed-form diff -> invalidation classes (never metrics)
// ---------------------------------------------------------------------------

function stableStr(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStr).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStr(v[k])).join(',') + '}';
}

/** Bodies whose cloud keyframes consume the ephemeris (seasonSamplerFor's gate). */
export function hasSeasonalDecks(body) {
  return !!body.clouds?.decks?.some((d) => (d.stormW ?? 0) !== 0 || (d.hoodAmp ?? 0) !== 0);
}

/** The shallowest bake band an insolation-bearing context contributes at, or Infinity. */
export function insolationMinLevel(body) {
  let lvl = Infinity;
  for (const p of body.processes ?? []) {
    if (p.type === 'context' && p.insolation) lvl = Math.min(lvl, p.levels?.[0] ?? 0);
  }
  return lvl;
}

/**
 * Diff two validated systems into the invalidation plan the engine dispatches on.
 * Returns { scope, systemKeys, membership, bodies, env }:
 *  - scope: 'none' | 'bodies' (per-body dispatch) | 'system' (full setSystem)
 *  - bodies: Map<id, { keys: string[], classes: Set<string> }> for edited bodies
 *  - env: Set<id> — descendants of mechanics-edited bodies whose seasonal cloud
 *    keyframes read the parent chain (sunDirBF) and must re-request.
 */
export function classifyEdit(oldSystem, newSystem) {
  const out = { scope: 'none', systemKeys: [], membership: { added: [], removed: [] }, bodies: new Map(), env: new Set() };
  let structural = false;

  for (const key of new Set([...Object.keys(oldSystem), ...Object.keys(newSystem)])) {
    if (key === 'bodies') continue;
    if (stableStr(oldSystem[key]) === stableStr(newSystem[key])) continue;
    out.systemKeys.push(key);
    if (key === 'star') {
      for (const sk of new Set([...Object.keys(oldSystem.star ?? {}), ...Object.keys(newSystem.star ?? {})])) {
        if (stableStr(oldSystem.star?.[sk]) !== stableStr(newSystem.star?.[sk]) && STAR_KEY_CLASS[sk] !== 'presentation') structural = true;
      }
    } else if (SYSTEM_KEY_CLASS[key] !== 'presentation') structural = true;
  }

  const oldById = new Map((oldSystem.bodies ?? []).map((b) => [b.id, b]));
  const newById = new Map((newSystem.bodies ?? []).map((b) => [b.id, b]));
  for (const id of oldById.keys()) if (!newById.has(id)) { out.membership.removed.push(id); structural = true; }
  for (const id of newById.keys()) if (!oldById.has(id)) { out.membership.added.push(id); structural = true; }

  for (const [id, next] of newById) {
    const prev = oldById.get(id);
    if (!prev) continue;
    const keys = [], classes = new Set();
    for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      if (stableStr(prev[key]) === stableStr(next[key])) continue;
      const klass = BODY_KEY_CLASS[key];
      if (!klass) throw new Error(`editor: body '${id}' key '${key}' has no invalidation class`);
      keys.push(key); classes.add(klass);
      if (klass === 'system') structural = true;
    }
    if (keys.length) out.bodies.set(id, { keys, classes });
  }

  // Mechanics cascade: a body's sunDirBF rides its parent chain, so seasonal
  // (storm/hood) cloud keyframes of every DESCENDANT of a mechanics-edited
  // body are stale. Baked insolation reads only the body's OWN orbit/spin —
  // no cascade there.
  const parentOf = new Map((newSystem.bodies ?? []).map((b) => [b.id, b.parent]));
  for (const node of newSystem.nodes ?? []) parentOf.set(node.id, node.parent);
  const descendsFrom = (id, ancestor) => {
    for (let cur = parentOf.get(id); cur; cur = parentOf.get(cur)) if (cur === ancestor) return true;
    return false;
  };
  for (const [editedId, { classes }] of out.bodies) {
    if (!classes.has('mechanics')) continue;
    for (const body of newSystem.bodies) {
      if (body.id !== editedId && descendsFrom(body.id, editedId) && hasSeasonalDecks(body)) out.env.add(body.id);
    }
  }

  if (structural) out.scope = 'system';
  // presentation-level system keys (validYears, star.name) still need the new
  // recipe adopted — 'bodies' scope with an empty body map is exactly that.
  else if (out.bodies.size || out.env.size || out.systemKeys.length) out.scope = 'bodies';
  return out;
}

// ---------------------------------------------------------------------------
// 3. Preflight — the full assert battery against a copy, never the live world
// ---------------------------------------------------------------------------

/**
 * Validate an edited system completely. Runs on a CLONE of the payload and
 * returns it; the input is never mutated and the live system is never touched.
 * Throws by name on the first violation (in-panel report, world unchanged).
 */
export function preflightEditedSystem(system) {
  const next = structuredClone(system);
  assertStructuredCloneSafe(next);
  assertEditTaxonomy(next);
  assertMechanicsSystem(next);
  if (!next.bodies.length) throw new Error('editor: a renderable system needs at least one body');
  makeBodyLayerMap(next);
  assertGiantSystem(next); assertRingSystem(next);
  assertBeltSystem(next);
  for (const body of next.bodies) {
    assertPaletteRecipe(body); assertFigureRecipe(body);
    assertGiantRecipe(body); assertRingRecipe(body);
    assertComaRecipe(body);
    if (body.clouds) assertCloudRecipe(body);
    const fig = figOf(body);
    if (fig) figPreflight(fig, body.id, body.figure.reliefBudget, 800);
  }
  return next;
}

// ---------------------------------------------------------------------------
// 4. The edit-continuity law (λ-preservation at the edit instant)
// ---------------------------------------------------------------------------

// Solve the epoch-anomaly field so the (linear-in-M0) mean longitude of `probe`
// equals targetLambda at t. orbitalPhaseAt is exactly linear in M0Deg/phase0,
// so one zero-probe evaluation inverts it — the same frames.js resolution the
// renderer uses, never a re-derivation.
function solveEpochAnomaly(orbit, targetLambda, probeLambdaAtZero) {
  if (isLegacyOrbit(orbit)) return { ...orbit, phase0: wrapPi(targetLambda - probeLambdaAtZero) };
  return { ...orbit, M0Deg: wrapPi(targetLambda - probeLambdaAtZero) / DEG };
}

/**
 * The edit-continuity law: for every body (and barycenter node) whose RESOLVED
 * mean longitude at epochS would change under the edit — element edits, parent
 * GM edits, star GM edits all qualify — re-solve M0Deg/phase0 so the current
 * mean longitude is preserved at the edit instant. The orbit reshapes around
 * where the body IS. Radial position may still step when a/e change (accepted,
 * documented). Resonance members are skipped: their phase is group data and the
 * pinned resonant argument already holds under element edits.
 * Returns a patched clone of nextSystem.
 */
export function withLambdaContinuity(oldSystem, nextSystem, epochS) {
  const out = structuredClone(nextSystem);
  const oldById = new Map(oldSystem.bodies.map((b) => [b.id, b]));

  for (const body of out.bodies) {
    const prev = oldById.get(body.id);
    if (!prev?.orbit || !body.orbit || body.orbit.resonance) continue;
    const lambdaOld = orbitalPhaseAt(prev, epochS, oldSystem);
    const lambdaNew = orbitalPhaseAt(body, epochS, out);
    if (Math.abs(wrapPi(lambdaNew - lambdaOld)) < 1e-12) continue;
    const zeroKey = isLegacyOrbit(body.orbit) ? { phase0: 0 } : { M0Deg: 0 };
    const probe = { ...body, orbit: { ...body.orbit, ...zeroKey } };
    body.orbit = solveEpochAnomaly(body.orbit, lambdaOld, orbitalPhaseAt(probe, epochS, out));
  }

  for (const node of out.nodes ?? []) {
    const prev = (oldSystem.nodes ?? []).find((n) => n.id === node.id);
    if (!prev) continue;
    // outer orbit: frames resolves node.orbit through the same pseudo-body
    // proxy (frames.js nodeState) — probe it identically.
    if (node.orbit && prev.orbit && !isNaN(epochS)) {
      const asBody = (sys, n, orbit) => ({ id: n.id, parent: n.parent, orbit });
      const lambdaOld = orbitalPhaseAt(asBody(oldSystem, prev, prev.orbit), epochS, oldSystem);
      const lambdaNew = orbitalPhaseAt(asBody(out, node, node.orbit), epochS, out);
      if (Math.abs(wrapPi(lambdaNew - lambdaOld)) > 1e-12) {
        const zeroKey = isLegacyOrbit(node.orbit) ? { phase0: 0 } : { M0Deg: 0 };
        const probeLambda = orbitalPhaseAt(asBody(out, node, { ...node.orbit, ...zeroKey }), epochS, out);
        node.orbit = solveEpochAnomaly(node.orbit, lambdaOld, probeLambda);
      }
    }
    // relative orbit: a member's orbitalPhaseAt resolves it (shared M law) —
    // probe through the primary member so μ = GM_p + GM_s stays frames' own.
    if (node.relativeOrbit && prev.relativeOrbit) {
      const oldPrimary = oldById.get(prev.primary);
      const newPrimary = out.bodies.find((b) => b.id === node.primary);
      if (!oldPrimary || !newPrimary) continue;
      const lambdaOld = orbitalPhaseAt(oldPrimary, epochS, oldSystem);
      const lambdaNew = orbitalPhaseAt(newPrimary, epochS, out);
      if (Math.abs(wrapPi(lambdaNew - lambdaOld)) > 1e-12) {
        const zeroKey = isLegacyOrbit(node.relativeOrbit) ? { phase0: 0 } : { M0Deg: 0 };
        node.relativeOrbit = { ...node.relativeOrbit, ...zeroKey };
        const probeLambda = orbitalPhaseAt(newPrimary, epochS, out);
        node.relativeOrbit = solveEpochAnomaly(node.relativeOrbit, lambdaOld, probeLambda);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. Structural helpers: templates, add/clone/delete (modest by decree)
// ---------------------------------------------------------------------------

const idHash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

/** Family templates select an exemplar FROM the loaded system (reuse-first law:
 * a new body is a data retuning of a shipped family, never a new mechanism). */
export const TEMPLATE_CLASSES = Object.freeze(['rocky', 'icy-moon', 'giant', 'figure']);

function templateExemplar(system, klass) {
  const bodies = system.bodies;
  const prefer = (ids, predicate) =>
    ids.map((id) => bodies.find((b) => b.id === id)).find((b) => b && b.orbit)
    ?? bodies.find((b) => b.orbit && predicate(b));
  const pick = {
    rocky: () => prefer(['luna', 'cinis'], (b) => !b.giant && !b.figure && !b.atmosphere && b.processes?.length),
    'icy-moon': () => prefer(['europa', 'rhea', 'candor'], (b) => !b.giant && !b.figure && b.parent !== 'star' && !!b.palette?.ice),
    giant: () => prefer(['iovis', 'saturn'], (b) => !!b.giant),
    figure: () => prefer(['vesta', 'timor'], (b) => !!b.figure),
  }[klass];
  if (!pick) throw new Error(`editor: unknown template class '${klass}' (${TEMPLATE_CLASSES.join('/')})`);
  const exemplar = pick();
  if (!exemplar) throw new Error(`editor: system has no '${klass}' family exemplar to clone`);
  return exemplar;
}

/**
 * Build a new body from a family template of the loaded system. Deterministic:
 * seeds offset by an id hash (same id -> same world). The orbit is authored
 * fresh (circularish conic in the parent's plane); resonance membership and
 * skyHidden never survive the clone; an insolation context re-references the
 * new orbit so the created climate matches where the body was put.
 */
export function makeBodyFromTemplate(system, klass, { id, name, parent = 'star', aM = null } = {}) {
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('editor: template body needs a lowercase id');
  if (system.bodies.some((b) => b.id === id) || (system.nodes ?? []).some((n) => n.id === id) || id === 'star') {
    throw new Error(`editor: id '${id}' already exists`);
  }
  const parentBody = parent === 'star' ? null : system.bodies.find((b) => b.id === parent);
  if (parent !== 'star' && !parentBody) throw new Error(`editor: template parent '${parent}' is not a body`);
  const exemplar = templateExemplar(system, klass);
  const body = structuredClone(exemplar);
  const h = idHash(id);
  body.id = id; body.name = name ?? id;
  body.parent = parent;
  delete body.skyHidden;
  // fresh orbit: outside the outermost same-parent sibling, near-circular,
  // gently inclined, epoch angles spread deterministically by the id hash
  const siblings = system.bodies.filter((b) => b.parent === parent && b.orbit?.a > 0);
  const a = aM ?? (siblings.length
    ? 1.35 * Math.max(...siblings.map((b) => b.orbit.a))
    : (parentBody ? parentBody.R * 20 : 1.5e11));
  body.orbit = {
    a, e: 0.02, iDeg: 1.2, OmegaDeg: h % 360, omegaDeg: (h >> 9) % 360, M0Deg: (h >> 18) % 360,
    epochS: 0, OmegaDotDegCy: 0, omegaDotDegCy: 0,
    frame: parent === 'star' ? 'ecliptic' : 'parentEq',
  };
  // a resonance exemplar (europa) may not carry its membership out of the group
  delete body.orbit.resonance;
  // reseed the whole process/cloud stack so the new world LOOKS new (jointTab law:
  // same family, different knobs must yield a different world)
  reseedBody(body, 100000 + (h % 900000));
  // the frozen climate reference follows the authored orbit (sol.js addInsolation law)
  for (const p of body.processes ?? []) {
    if (p.type === 'context' && p.insolation) p.insolation = { ...p.insolation, referenceA: a };
  }
  return body;
}

/** Deterministically offset every seed a body carries (in place; returns body).
 * The in-app reseed control and template creation share this one law. */
export function reseedBody(body, offset) {
  for (const p of body.processes ?? []) if (typeof p.seed === 'number') p.seed += offset;
  if (body.clouds?.seed != null) body.clouds.seed += offset;
  if (body.rocks?.seed != null) body.rocks.seed += offset;
  if (body.formations?.seed != null) body.formations.seed += offset;
  return body;
}

/** Clone an existing body under a new id: reseeded, orbit nudged outward,
 * resonance membership and skyHidden stripped (they are group/system data). */
export function cloneBody(system, sourceId, { id, name, aM = null } = {}) {
  const source = system.bodies.find((b) => b.id === sourceId);
  if (!source) throw new Error(`editor: no body '${sourceId}' to clone`);
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('editor: clone needs a lowercase id');
  if (system.bodies.some((b) => b.id === id) || (system.nodes ?? []).some((n) => n.id === id) || id === 'star') {
    throw new Error(`editor: id '${id}' already exists`);
  }
  if (!source.orbit) throw new Error(`editor: '${sourceId}' is a barycenter member — clone is not defined for it`);
  const body = structuredClone(source);
  const h = idHash(id);
  body.id = id; body.name = name ?? id;
  delete body.skyHidden;
  if (body.orbit.resonance) {
    // a clone leaves the resonance group: author the derived a explicitly
    const baseA = (system.resonances ?? []).find((g) => g.id === body.orbit.resonance.group)?.baseA;
    const a = aM ?? (baseA > 0 ? 2.6 * baseA : 1e9);
    body.orbit = { a, e: 0.01, iDeg: 0.5, OmegaDeg: h % 360, omegaDeg: (h >> 9) % 360, M0Deg: (h >> 18) % 360,
      epochS: 0, OmegaDotDegCy: 0, omegaDotDegCy: 0, frame: 'parentEq' };
  } else if (isLegacyOrbit(body.orbit)) {
    body.orbit = { ...body.orbit, a: aM ?? body.orbit.a * 1.18, phase0: (h % 628) / 100 };
  } else {
    body.orbit = { ...body.orbit, a: aM ?? body.orbit.a * 1.18, M0Deg: (h >> 18) % 360 };
  }
  reseedBody(body, 100000 + (h % 900000));
  for (const p of body.processes ?? []) {
    if (p.type === 'context' && p.insolation) p.insolation = { ...p.insolation, referenceA: body.orbit.a };
  }
  return body;
}

/** Add a validated body: returns a NEW system (the input is untouched). */
export function addBody(system, body) {
  const next = structuredClone(system);
  next.bodies.push(structuredClone(body));
  return preflightEditedSystem(next);
}

/**
 * Delete a body, guarding orphans: 'refuse' (default) throws naming children;
 * 'reparent' re-parents children to the deleted body's parent; 'cascade'
 * deletes the subtree. Barycenter members and resonance base bodies refuse
 * always (the validator would reject the result anyway — refuse with a better name).
 */
export function deleteBody(system, id, { orphans = 'refuse' } = {}) {
  const next = structuredClone(system);
  const body = next.bodies.find((b) => b.id === id);
  if (!body) throw new Error(`editor: no body '${id}'`);
  for (const node of next.nodes ?? []) {
    if (node.primary === id || node.secondary === id) throw new Error(`editor: '${id}' is a member of barycenter '${node.id}' — delete or edit the node instead`);
  }
  for (const group of next.resonances ?? []) {
    if (group.baseBody === id) throw new Error(`editor: '${id}' is the base of resonance group '${group.id}' — dissolve the group first`);
  }
  const children = next.bodies.filter((b) => b.parent === id).map((b) => b.id);
  const childNodes = (next.nodes ?? []).filter((n) => n.parent === id).map((n) => n.id);
  if ((children.length || childNodes.length) && orphans === 'refuse') {
    throw new Error(`editor: '${id}' has children (${[...children, ...childNodes].join(', ')}) — choose reparent or cascade`);
  }
  if (orphans === 'reparent') {
    for (const b of next.bodies) if (b.parent === id) b.parent = body.parent;
    for (const n of next.nodes ?? []) if (n.parent === id) n.parent = body.parent;
  } else if (orphans === 'cascade') {
    const doomed = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const b of next.bodies) if (!doomed.has(b.id) && doomed.has(b.parent)) { doomed.add(b.id); grew = true; }
      for (const n of next.nodes ?? []) if (!doomed.has(n.id) && doomed.has(n.parent)) { doomed.add(n.id); grew = true; }
    }
    // a cascaded barycenter takes its members with it
    for (const n of next.nodes ?? []) if (doomed.has(n.id)) { doomed.add(n.primary); doomed.add(n.secondary); }
    next.bodies = next.bodies.filter((b) => !doomed.has(b.id));
    next.nodes = (next.nodes ?? []).filter((n) => !doomed.has(n.id));
    return preflightEditedSystem(next);
  }
  next.bodies = next.bodies.filter((b) => b.id !== id);
  return preflightEditedSystem(next);
}
