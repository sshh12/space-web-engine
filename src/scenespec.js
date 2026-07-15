// src/scenespec.js — SceneSpec, the universal currency (LAYOUT_ROADMAP §4).
//
// One flat object is simultaneously a bench scene, a bookmark, an F8 defect capture,
// a test fixture, and (later) a descent-sim initial condition and replay frame. This
// module owns its schema: the canonical DEFAULTS TABLE (defaults-as-data), the field
// taxonomy, and validation. It is PURE (no THREE, no DOM) so the Node harness imports
// the exact same schema the browser applies — one source of truth for "what is a
// legal scene and what does an omitted field mean".
//
// It is strictly the OBSERVATION spec (system, body, epoch/time, camera pose, view
// mode, camera settings). Dynamical entity state (craft, players) never merges in —
// a Situation references it alongside a spec (§4). This boundary is the cheap decision
// that prevents a format schism at the physics round.

/**
 * Canonical defaults. A spec is a flat partial override of this table; every field an
 * apply() does NOT find in the spec resets to the value here (round-3 season-leak law:
 * reset semantics are data, not a hand-maintained whitelist). Values match main.js's
 * __shot exactly so sourcing defaults from here is byte-compatible.
 * @typedef {Object} SceneSpec
 */
export const SPEC_DEFAULTS = Object.freeze({
  // --- world selection ---
  system: null,        // null = whatever the engine booted; a canonical id string
                       // ('demo-system'/'sol-system') resolves through the engine's
                       // registry; an INLINE RECIPE PAYLOAD (Phase E) reproduces an
                       // edited system headlessly — the same hash Phase 0 stamps
                       // into provenance identifies it
  // body has no table default: an omitted body keeps the current one (apply only
  // switches when spec.body is present). Named here for validation, resolved by apply.

  // --- epoch / time ---
  epochS: null,         // primary J2000-analog seconds; null resolves legacy views
  warp: 0,             // DECLARED warp (signed, ×real time). The Phase W capture
                       // law: representation selection is a pure function of this
                       // declared value at the pinned epoch — the clock itself
                       // stays frozen during capture, exactly as before.
  season: 0.15,        // orbital phase (round-3: this resets like everything else)
  // tday is intentionally STICKY in apply today (set only when present; phaseDeg
  // solves it). Documented quirk — a uniform reset is a behavior change registered
  // for the engine-extraction round, not made silently here.

  // --- camera pose (degrees / metres; cam.set consumes these) ---
  lat: 0, lon: 0, alt: null, yaw: 0, pitch: 0, roll: 0, free: false,
  fov: 55,

  // --- view / diagnostic mode ---
  mode: 0,             // MODES index or name: lit/albedo/normals/height/slope/ao/lod/shadow
  wire: false, debris: true, clouds: true, inset: false, clean: false,

  // --- camera ([camera] block, §10) ---
  exposure: 0, fixedEV: null, wb: 0, wbMode: 'scene', meter: 'center', grade: 0,
  lookAt: null,        // aim the main camera at another body (§11 companion shots)
});

// Solver fields: not stored state, but instructions apply() resolves into state
// (phaseDeg -> tday, faceSun -> yaw). lookAt lives in defaults (it is stored state).
export const SOLVER_FIELDS = Object.freeze(['phaseDeg', 'faceSun']);

// Control fields consumed by the harness/apply loop, not part of the observed state.
export const CONTROL_FIELDS = Object.freeze(['body', 'tday', 'waitMs']);

// Metadata carried on specs for humans/registry, ignored by apply.
export const META_FIELDS = Object.freeze(['note', 'name', 'v']);

const KNOWN = new Set([
  ...Object.keys(SPEC_DEFAULTS), ...SOLVER_FIELDS, ...CONTROL_FIELDS, ...META_FIELDS,
]);

/**
 * Validate a spec against the schema: every key is known, every overridden value
 * type-matches its default (where a default exists). Returns { ok, errors }.
 * @param {SceneSpec} spec
 */
export function validateSpec(spec) {
  const errors = [];
  if (spec == null || typeof spec !== 'object') return { ok: false, errors: ['spec is not an object'] };
  for (const k of Object.keys(spec)) {
    if (!KNOWN.has(k)) { errors.push(`unknown field: ${k}`); continue; }
    if (k === 'epochS' && spec[k] !== null && (typeof spec[k] !== 'number' || !Number.isFinite(spec[k]))) {
      errors.push('epochS must be a finite number|null'); continue;
    }
    if (['tday', 'waitMs', 'phaseDeg'].includes(k) && (typeof spec[k] !== 'number' || !Number.isFinite(spec[k]))) {
      errors.push(`${k} must be a finite number`); continue;
    }
    if (k === 'body' && typeof spec[k] !== 'string') { errors.push('body must be a string'); continue; }
    if (k === 'system' && spec[k] !== null) {
      const v = spec[k];
      const payload = typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.bodies) && typeof v.id === 'string';
      if (typeof v !== 'string' && !payload) errors.push('system must be null, a system id string, or an inline recipe payload ({ id, bodies, ... })');
      continue;
    }
    const def = SPEC_DEFAULTS[k];
    if (def == null) continue;                       // no typed default (body/tday/solvers/nullable)
    const want = typeof def, got = typeof spec[k];
    // mode accepts number OR string (index or name); everything else must match.
    if (k === 'mode') { if (got !== 'number' && got !== 'string') errors.push(`mode must be number|string, got ${got}`); continue; }
    if (spec[k] !== null && got !== want) errors.push(`${k}: expected ${want}, got ${got}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Fill a partial spec with canonical defaults (body/tday left to apply's sticky rules). */
export function withDefaults(spec = {}) {
  const out = { ...SPEC_DEFAULTS };
  for (const k of Object.keys(spec)) out[k] = spec[k];
  return out;
}

/** Apply reset semantics while preserving tday's documented sticky behavior. */
export function resolveSpec(spec = {}, sticky = {}) {
  /** @type {any} */
  const out = withDefaults(spec);
  if (spec.tday === undefined) {
    if (sticky.tday !== undefined) out.tday = sticky.tday;
    else delete out.tday;
  }
  return out;
}
