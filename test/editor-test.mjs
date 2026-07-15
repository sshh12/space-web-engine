// test/editor-test.mjs — Phase E (round 25): the editor's pure laws.
// Taxonomy completeness (M5), closed-form diff classification, the
// λ-continuity solve, preflight-on-a-copy, templates/clone/delete, and the
// fuzz contract: random schema-valid edits never throw past preflight and
// never mutate their input; invalid edits always refuse by name.
import assert from 'node:assert/strict';
import { SYSTEM, AU } from '../src/core/recipe.js';
import { SOL_SYSTEM } from '../src/core/sol.js';
import {
  EDIT_CLASSES, BODY_KEY_CLASS, STAR_KEY_CLASS, SYSTEM_KEY_CLASS,
  assertEditTaxonomy, classifyEdit, preflightEditedSystem, withLambdaContinuity,
  hasSeasonalDecks, insolationMinLevel, makeBodyFromTemplate, cloneBody,
  addBody, deleteBody, reseedBody, TEMPLATE_CLASSES,
} from '../src/core/editor.js';
import { orbitalPhaseAt, bodyCenterInertial, frameState } from '../src/core/frames.js';
import { recipeHash } from '../src/core/system.js';
import { validateSpec } from '../src/scenespec.js';

let n = 0;
const ok = (v, m) => { assert.ok(v, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} (|${a} - ${b}| > ${tol})`); n++; };
const throwsNamed = (fn, re, m) => { assert.throws(fn, re, m); n++; };
const TAU = Math.PI * 2;
const wrap = (a) => { let x = a % TAU; if (x > Math.PI) x -= TAU; if (x < -Math.PI) x += TAU; return x; };
const stable = (v) => JSON.stringify(v, Object.keys(Object(v)).sort?.() && undefined);
const deep = (v) => JSON.stringify(v);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- 1. taxonomy completeness (M5: the table is asserted against the schema) ----
ok(assertEditTaxonomy(SYSTEM), 'taxonomy complete for demo');
ok(assertEditTaxonomy(SOL_SYSTEM), 'taxonomy complete for sol');
for (const klass of Object.values(BODY_KEY_CLASS)) ok(klass in EDIT_CLASSES, `body class '${klass}' declared`);
for (const klass of Object.values(STAR_KEY_CLASS)) ok(klass in EDIT_CLASSES, `star class '${klass}' declared`);
ok('bodies' in SYSTEM_KEY_CLASS && 'nodes' in SYSTEM_KEY_CLASS, 'system keys covered');
{
  const bad = structuredClone(SYSTEM);
  bad.bodies[0].sparkles = 1;
  throwsNamed(() => assertEditTaxonomy(bad), /sparkles.*no invalidation class/, 'unknown body key throws by name');
}

// ---- 2. classifyEdit: closed-form diff -> classes ----
{
  const a = structuredClone(SOL_SYSTEM), b = structuredClone(SOL_SYSTEM);
  eq(classifyEdit(a, b).scope, 'none', 'identical systems classify as none');

  b.bodies.find((x) => x.id === 'europa').palette.ice = [0.5, 0.6, 0.7];
  const plan = classifyEdit(a, b);
  eq(plan.scope, 'bodies', 'palette edit is per-body scope');
  eq(plan.bodies.size, 1, 'palette edit touches one body');
  ok(plan.bodies.get('europa').classes.has('look'), 'palette classes as look');
  eq(plan.env.size, 0, 'palette edit has no env cascade');
}
{
  const a = structuredClone(SOL_SYSTEM), b = structuredClone(SOL_SYSTEM);
  b.bodies.find((x) => x.id === 'tellus').orbit.e = 0.05;
  const plan = classifyEdit(a, b);
  ok(plan.bodies.get('tellus').classes.has('mechanics'), 'orbit edit classes as mechanics');
  eq(plan.scope, 'bodies', 'orbit edit stays per-body');
}
{
  // env cascade: a mechanics edit on the PARENT re-requests a storm-deck moon's
  // keyframes (its sunDirBF rides the parent chain) — synthetic witness.
  const mk = (over) => ({ id: 'p', parent: 'star', GM: 1, R: 1, orbit: { a: 1, periodDays: 1, phase0: 0 }, spin: { tiltDeg: 0, periodH: 1, phase0: 0 }, ...over });
  const moon = { ...mk({ id: 'm', parent: 'p' }), clouds: { keyframeH: 6, seed: 1, decks: [{ stormW: 1 }] } };
  const sysA = { id: 't', star: { GM: 1 }, bodies: [mk({}), structuredClone(moon)] };
  const sysB = structuredClone(sysA);
  sysB.bodies[0].orbit = { a: 2, periodDays: 1, phase0: 0 };
  const plan = classifyEdit(sysA, sysB);
  ok(plan.env.has('m'), 'storm-deck descendant enters the env set');
  eq(plan.bodies.size, 1, 'the moon itself is not an edited body');
}
{
  const a = structuredClone(SOL_SYSTEM), b = structuredClone(SOL_SYSTEM);
  b.bodies = b.bodies.filter((x) => x.id !== 'rhea');
  eq(classifyEdit(a, b).scope, 'system', 'membership removal is structural');
  eq(classifyEdit(a, b).membership.removed[0], 'rhea', 'removed member named');
}
{
  const a = structuredClone(SOL_SYSTEM), b = structuredClone(SOL_SYSTEM);
  b.bodies.find((x) => x.id === 'luna').parent = 'star';
  eq(classifyEdit(a, b).scope, 'system', 'parent change is structural');
}
{
  const a = structuredClone(SOL_SYSTEM), b = structuredClone(SOL_SYSTEM);
  b.validYears = 800;
  const plan = classifyEdit(a, b);
  eq(plan.scope, 'bodies', 'presentation-level system key still adopts the recipe');
  ok(plan.systemKeys.includes('validYears'), 'validYears named');
  b.star.irradianceAt1AU = 30;
  eq(classifyEdit(a, b).scope, 'system', 'star luminosity is structural');
}
{
  const a = structuredClone(SOL_SYSTEM), b = structuredClone(SOL_SYSTEM);
  b.bodies.find((x) => x.id === 'tellus').name = 'Terra';
  const plan = classifyEdit(a, b);
  ok(plan.bodies.get('tellus').classes.has('presentation'), 'rename is presentation');
  eq(plan.scope, 'bodies', 'rename stays per-body');
}

// helpers used by the engine dispatch
ok(hasSeasonalDecks(SOL_SYSTEM.bodies.find((b) => b.id === 'rubra')), 'rubra storm deck detected');
ok(!hasSeasonalDecks(SOL_SYSTEM.bodies.find((b) => b.id === 'tellus')), 'tellus decks are not seasonal');
eq(insolationMinLevel(SOL_SYSTEM.bodies.find((b) => b.id === 'tellus')), 0, 'tellus insolation contributes at band 0');
eq(insolationMinLevel(SOL_SYSTEM.bodies.find((b) => b.id === 'luna')), Infinity, 'luna has no insolation context');

// ---- 3. λ-continuity (the edit-continuity law) ----
{
  // legacy orbit: period edit at running t preserves the phase angle
  const a = structuredClone(SYSTEM), b = structuredClone(SYSTEM);
  const t = 1.7e7;
  b.bodies.find((x) => x.id === 'tellus').orbit.periodDays = 500;
  const c = withLambdaContinuity(a, b, t);
  const oldL = orbitalPhaseAt(a.bodies.find((x) => x.id === 'tellus'), t, a);
  const newL = orbitalPhaseAt(c.bodies.find((x) => x.id === 'tellus'), t, c);
  near(wrap(newL - oldL), 0, 1e-9, 'legacy period edit preserves mean longitude');
}
{
  // conic with secular rates: a, e and Ω edits at 5 random epochs
  const rand = mulberry32(20260713);
  for (let i = 0; i < 5; i++) {
    const t = (rand() - 0.5) * 40 * 365.25 * 86400;
    const a = structuredClone(SOL_SYSTEM), b = structuredClone(SOL_SYSTEM);
    const luna = b.bodies.find((x) => x.id === 'luna');
    luna.orbit.a *= 1 + rand() * 0.5;
    luna.orbit.e = 0.1 * rand();
    luna.orbit.OmegaDeg += 40 * (rand() - 0.5);
    const c = withLambdaContinuity(a, b, t);
    const oldL = orbitalPhaseAt(a.bodies.find((x) => x.id === 'luna'), t, a);
    const newL = orbitalPhaseAt(c.bodies.find((x) => x.id === 'luna'), t, c);
    near(wrap(newL - oldL), 0, 1e-9, `conic edit preserves λ under secular rates (draw ${i})`);
  }
}
{
  // geometric witness (non-tautological): circular zero-inclination orbit, a
  // doubled — the body's inertial DIRECTION is unchanged at the edit instant.
  const mk = (a) => ({
    id: 'w', parent: 'star', GM: 1e12, R: 1e6,
    orbit: { a, e: 0, iDeg: 0, OmegaDeg: 0, omegaDeg: 0, M0Deg: 111, epochS: 0, OmegaDotDegCy: 0, omegaDotDegCy: 0, frame: 'ecliptic' },
    spin: { tiltDeg: 0, periodH: 10, phase0: 0 },
  });
  const sysA = { id: 'w-sys', star: { GM: 1.3e20 }, bodies: [mk(2e11)] };
  const sysB = structuredClone(sysA); sysB.bodies[0].orbit.a = 4e11;
  const t = 9.9e6;
  const c = withLambdaContinuity(sysA, sysB, t);
  const p0 = bodyCenterInertial(sysA.bodies[0], t, [0, 0, 0], sysA);
  const p1 = bodyCenterInertial(c.bodies[0], t, [0, 0, 0], c);
  const len = (v) => Math.hypot(...v);
  const dot = (p0[0] * p1[0] + p0[1] * p1[1] + p0[2] * p1[2]) / (len(p0) * len(p1));
  ok(dot > 1 - 1e-9, 'circular a-edit preserves the inertial direction');
  near(len(p1) / len(p0), 2, 1e-9, 'radius steps to the new a (accepted, documented)');
}
{
  // parent GM edit changes every child's mean motion: children re-solve too
  const mk = (id, parent, orbit) => ({ id, parent, GM: 1e12, R: 1e6, orbit, spin: { tiltDeg: 0, periodH: 10, phase0: 0 } });
  const sysA = {
    id: 'g-sys', star: { GM: 1.3e20 },
    bodies: [
      mk('pl', 'star', { a: 2e11, e: 0.1, iDeg: 2, OmegaDeg: 10, omegaDeg: 20, M0Deg: 30, epochS: 0, OmegaDotDegCy: 0, omegaDotDegCy: 0, frame: 'ecliptic' }),
      mk('mo', 'pl', { a: 5e8, e: 0.02, iDeg: 1, OmegaDeg: 5, omegaDeg: 15, M0Deg: 25, epochS: 0, OmegaDotDegCy: 0, omegaDotDegCy: 0, frame: 'parentEq' }),
    ],
  };
  const sysB = structuredClone(sysA);
  sysB.bodies[0].GM = 4e12;
  const t = 3.3e6;
  const c = withLambdaContinuity(sysA, sysB, t);
  const oldL = orbitalPhaseAt(sysA.bodies[1], t, sysA);
  const newL = orbitalPhaseAt(c.bodies[1], t, c);
  near(wrap(newL - oldL), 0, 1e-9, 'parent GM edit re-solves the child λ');
  ok(c.bodies[1].orbit.M0Deg !== sysA.bodies[1].orbit.M0Deg, 'child M0 actually moved');
}
{
  // resonance members are the group's business — never re-solved
  const a = structuredClone(SOL_SYSTEM), b = structuredClone(SOL_SYSTEM);
  b.bodies.find((x) => x.id === 'iovis').GM *= 1.2;
  const c = withLambdaContinuity(a, b, 5e7);
  eq(deep(c.bodies.find((x) => x.id === 'europa').orbit),
    deep(b.bodies.find((x) => x.id === 'europa').orbit), 'resonance member orbit untouched');
}
{
  // barycenter: outer orbit AND relative orbit both preserve λ
  const t = 8.8e8;
  const a = structuredClone(SOL_SYSTEM), b = structuredClone(SOL_SYSTEM);
  const node = b.nodes.find((x) => x.id === 'pluto-navita');
  node.orbit.a *= 1.15;
  node.relativeOrbit.a *= 1.4;
  const c = withLambdaContinuity(a, b, t);
  const cNode = c.nodes.find((x) => x.id === 'pluto-navita');
  const pseudo = (sys, nd) => ({ id: nd.id, parent: nd.parent, orbit: nd.orbit });
  const oldOuter = orbitalPhaseAt(pseudo(a, a.nodes[0]), t, a);
  const newOuter = orbitalPhaseAt(pseudo(c, cNode), t, c);
  near(wrap(newOuter - oldOuter), 0, 1e-9, 'node outer orbit preserves λ');
  const oldRel = orbitalPhaseAt(a.bodies.find((x) => x.id === 'pluto'), t, a);
  const newRel = orbitalPhaseAt(c.bodies.find((x) => x.id === 'pluto'), t, c);
  near(wrap(newRel - oldRel), 0, 1e-9, 'relative orbit preserves the shared λ');
  ok(Number.isFinite(frameState('pluto-navita', t, c).origin[0]), 'edited node still resolves a frame');
}

// ---- 4. preflight: the copy law ----
{
  const input = structuredClone(SOL_SYSTEM);
  const before = deep(input);
  const out = preflightEditedSystem(input);
  eq(deep(input), before, 'preflight never mutates its input');
  ok(out !== input && out.bodies !== input.bodies, 'preflight returns a clone');
  out.bodies[0].name = 'mutated';
  eq(deep(input), before, 'mutating the result cannot reach the input');
}
throwsNamed(() => {
  const bad = structuredClone(SOL_SYSTEM);
  bad.bodies.find((b) => b.id === 'tellus').orbit.e = 1.2;
  preflightEditedSystem(bad);
}, /e must be in/, 'hyperbolic e refused by name');
throwsNamed(() => {
  const bad = structuredClone(SOL_SYSTEM);
  bad.bodies.find((b) => b.id === 'europa').orbit.a = 6.7e8;
  preflightEditedSystem(bad);
}, /resonance member and may not author a/, 'resonance a-authoring refused');
throwsNamed(() => {
  const bad = structuredClone(SOL_SYSTEM);
  bad.bodies[3].glitter = true;
  preflightEditedSystem(bad);
}, /glitter.*no invalidation class/, 'schema-closed world: unknown keys refused');
throwsNamed(() => {
  const bad = structuredClone(SOL_SYSTEM);
  bad.bodies = [];
  preflightEditedSystem(bad);
}, /at least one body|barycenter/, 'empty roster refused (mechanics validator reaches it first)');

// ---- 5. templates / clone / delete ----
for (const system of [SYSTEM, SOL_SYSTEM]) {
  for (const klass of TEMPLATE_CLASSES) {
    const body = makeBodyFromTemplate(system, klass, { id: `novus-${klass.replace(/[^a-z]/g, '')}` });
    const next = addBody(system, body);
    ok(next.bodies.some((b) => b.id === body.id), `${system.id}: ${klass} template adds a valid body`);
    ok(!body.orbit.resonance, `${klass} template never inherits resonance membership`);
    ok(!('skyHidden' in body), `${klass} template never inherits skyHidden`);
  }
}
{
  const body = makeBodyFromTemplate(SOL_SYSTEM, 'rocky', { id: 'novus' });
  const exemplar = SOL_SYSTEM.bodies.find((b) => b.id === 'luna');
  ok(body.processes[0].seed !== exemplar.processes[0].seed, 'template reseeds (a new world, not a copy)');
  const again = makeBodyFromTemplate(SOL_SYSTEM, 'rocky', { id: 'novus' });
  eq(deep(body), deep(again), 'templates are deterministic per id');
  throwsNamed(() => makeBodyFromTemplate(SOL_SYSTEM, 'rocky', { id: 'tellus' }), /already exists/, 'id collision refused');
  throwsNamed(() => makeBodyFromTemplate(SOL_SYSTEM, 'nebular', { id: 'x' }), /unknown template class/, 'unknown class refused');
}
{
  const moon = makeBodyFromTemplate(SOL_SYSTEM, 'icy-moon', { id: 'nova-luna', parent: 'tellus' });
  eq(moon.orbit.frame, 'parentEq', 'moon template references the parent plane');
  ok(moon.orbit.a > SOL_SYSTEM.bodies.find((b) => b.id === 'luna').orbit.a, 'moon template lands outside the outermost sibling');
  ok(addBody(SOL_SYSTEM, moon).bodies.some((b) => b.id === 'nova-luna'), 'moon template validates');
}
{
  const clone = cloneBody(SOL_SYSTEM, 'tellus', { id: 'tellus-b' });
  const next = addBody(SOL_SYSTEM, clone);
  ok(next.bodies.some((b) => b.id === 'tellus-b'), 'clone validates');
  near(clone.orbit.a / SOL_SYSTEM.bodies.find((b) => b.id === 'tellus').orbit.a, 1.18, 1e-9, 'clone nudges outward');
  const euClone = cloneBody(SOL_SYSTEM, 'europa', { id: 'europa-b' });
  ok(!euClone.orbit.resonance && euClone.orbit.a > 0, 'cloning a resonance member authors a explicit orbit');
  ok(addBody(SOL_SYSTEM, euClone).bodies.some((b) => b.id === 'europa-b'), 'resonance clone validates');
}
{
  throwsNamed(() => deleteBody(SOL_SYSTEM, 'tellus'), /has children.*luna/, 'orphan refusal names the children');
  const rep = deleteBody(SOL_SYSTEM, 'tellus', { orphans: 'reparent' });
  eq(rep.bodies.find((b) => b.id === 'luna').parent, 'star', 'reparent hands children to the grandparent');
  const cas = deleteBody(SOL_SYSTEM, 'tellus', { orphans: 'cascade' });
  ok(!cas.bodies.some((b) => b.id === 'luna'), 'cascade removes the subtree');
  throwsNamed(() => deleteBody(SOL_SYSTEM, 'pluto'), /barycenter/, 'barycenter member refuses');
  throwsNamed(() => deleteBody(SOL_SYSTEM, 'fornax'), /base of resonance/, 'resonance base refuses');
  ok(!deleteBody(SOL_SYSTEM, 'rhea').bodies.some((b) => b.id === 'rhea'), 'leaf delete is clean');
  ok(!deleteBody(SOL_SYSTEM, 'europa').bodies.some((b) => b.id === 'europa'), 'non-base resonance member delete is clean');
}

// ---- 6. fuzz: valid edits always pass preflight, invalid edits always refuse ----
{
  const rand = mulberry32(0xED17);
  const mutations = [
    (b, r) => { if (b.palette?.dust) b.palette.dust = b.palette.dust.map((v) => Math.min(1, Math.max(0, v + (r() - 0.5) * 0.2))); },
    (b, r) => { if (b.orbit && !b.orbit.resonance && b.orbit.e != null) b.orbit.e = Math.min(0.9, Math.max(0, b.orbit.e + (r() - 0.5) * 0.1)); },
    (b, r) => { if (b.orbit && !b.orbit.resonance && b.orbit.a) b.orbit.a *= 0.8 + r() * 0.5; },
    (b, r) => { if (b.orbit?.iDeg != null) b.orbit.iDeg = Math.max(0, Math.min(179, b.orbit.iDeg + (r() - 0.5) * 10)); },
    (b, r) => { for (const p of b.processes ?? []) if (typeof p.seed === 'number' && r() < 0.3) p.seed += 1 + Math.floor(r() * 100); },
    (b, r) => { b.GM *= 0.7 + r() * 0.8; },
    (b, r) => { if (b.brdf) b.brdf.rockRough = Math.min(1, Math.max(0.05, (b.brdf.rockRough ?? 0.5) + (r() - 0.5) * 0.3)); },
    (b, r) => { if (b.clouds?.decks?.[0]?.cov0 != null) b.clouds.decks[0].cov0 = Math.min(0.9, Math.max(0.05, b.clouds.decks[0].cov0 + (r() - 0.5) * 0.2)); },
    (b, r) => { if (b.seaLevel !== undefined && !b.figure) b.seaLevel = r() < 0.5 ? null : 0; },
    (b, r) => { b.name = `${b.name ?? b.id}~${Math.floor(r() * 100)}`; },
  ];
  let applied = 0;
  for (let i = 0; i < 150; i++) {
    const base = structuredClone(SOL_SYSTEM);
    const before = deep(base);
    const next = structuredClone(base);
    const body = next.bodies[Math.floor(rand() * next.bodies.length)];
    mutations[Math.floor(rand() * mutations.length)](body, rand);
    const out = preflightEditedSystem(next);            // must never throw
    const plan = classifyEdit(base, out);
    ok(['none', 'bodies', 'system'].includes(plan.scope), `fuzz ${i}: plan scope is legal`);
    for (const [, v] of plan.bodies) for (const c of v.classes) ok(c in EDIT_CLASSES, `fuzz ${i}: class '${c}' known`);
    eq(deep(base), before, `fuzz ${i}: inputs never mutate`);
    if (plan.scope !== 'none') applied++;
    // continuity never breaks validity either
    preflightEditedSystem(withLambdaContinuity(base, out, (rand() - 0.5) * 1e9));
    n++;
  }
  ok(applied > 100, `fuzz produced real edits (${applied}/150)`);

  const invalid = [
    (s) => { s.bodies.find((b) => b.id === 'tellus').orbit.e = 1.5; },
    (s) => { s.bodies.find((b) => b.id === 'luna').orbit.a = -1; },
    (s) => { s.bodies.find((b) => b.id === 'tellus').GM = 0; },
    (s) => { s.bodies.find((b) => b.id === 'rhea').wings = true; },
    (s) => { s.bodies.find((b) => b.id === 'europa').orbit.a = 1e9; },
    (s) => { s.bodies.find((b) => b.id === 'luna').parent = 'nonexistent'; },
    (s) => { s.bodies.find((b) => b.id === 'tellus').spin.periodH = -3; },
  ];
  for (let i = 0; i < invalid.length; i++) {
    const next = structuredClone(SOL_SYSTEM);
    invalid[i](next);
    throwsNamed(() => preflightEditedSystem(next), /.+/, `invalid edit ${i} refuses`);
  }
}

// ---- 7. reproducibility plumbing ----
{
  const json = JSON.parse(JSON.stringify(SOL_SYSTEM));
  eq(recipeHash(json), recipeHash(SOL_SYSTEM), 'JSON round-trip preserves the recipe hash');
  ok(validateSpec({ system: 'sol-system' }).ok, 'spec.system id string validates');
  ok(validateSpec({ system: json }).ok, 'spec.system inline payload validates');
  ok(!validateSpec({ system: 42 }).ok, 'spec.system rejects non-payload values');
  ok(!validateSpec({ system: { id: 'x' } }).ok, 'spec.system rejects a payload without bodies');
}
{
  // an edited payload keeps a distinct hash (the provenance the gates key on)
  const edited = structuredClone(SOL_SYSTEM);
  edited.bodies.find((b) => b.id === 'europa').palette.ice = [0.5, 0.6, 0.7];
  ok(recipeHash(edited) !== recipeHash(SOL_SYSTEM), 'edited system hashes differently');
}
{
  const b = structuredClone(SOL_SYSTEM.bodies.find((x) => x.id === 'tellus'));
  const seeds = b.processes.map((p) => p.seed);
  reseedBody(b, 100);
  ok(b.processes.every((p, i) => seeds[i] == null || p.seed === seeds[i] + 100), 'reseed offsets every seed');
}

console.log(`editor-test: ${n} checks passed`);
