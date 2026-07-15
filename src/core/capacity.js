// Phase C capacity/protocol contracts. Pure JS so Node tests, the renderer and
// the worker use the same counts rather than maintaining parallel magic numbers.

export const MAX_BODY_SLOTS = 8;
export const MAX_ECLIPSE_OCCLUDERS = 3;
export const MAX_GIANT_BANDS = 8;
export const MAX_RING_GAPS = 4;

// Default-uniform-block declaration budget for the Phase-C sky program.
// The per-slot giant/ring profiles intentionally exceed WebGL's portable 224
// minimum; the boot assert measures the actual device limit and names the
// registered float-texture fallback instead of compiling a partial program.
export const SKY_UNIFORM_VECTORS = 512;
export const SKY_UNIFORM_HEADROOM = 64;

// Worker-side decoded bake cache. A tile is ~673 KiB in the current manifest.
// 336 shared tiles ~= 221 MiB, below the measured ~243 MiB allocation cliff.
// The foreground body may consume 300; inactive bodies retain six roots each.
export const WORKER_TILE_BUDGET = 336;
export const FOREGROUND_TILE_FLOOR = 300;
export const BACKGROUND_TILE_FLOOR = 6;
export const MAX_WARM_BAKERS = 1 + Math.floor((WORKER_TILE_BUDGET - FOREGROUND_TILE_FLOOR) / BACKGROUND_TILE_FLOOR);

export function assertSkyUniformBudget(maxFragmentUniformVectors) {
  if (!Number.isInteger(maxFragmentUniformVectors) || maxFragmentUniformVectors <= 0) {
    throw new Error('capacity: gl.MAX_FRAGMENT_UNIFORM_VECTORS must be a positive integer');
  }
  const need = SKY_UNIFORM_VECTORS + SKY_UNIFORM_HEADROOM;
  if (maxFragmentUniformVectors < need) {
    throw new Error(`capacity: sky uniform block needs ${SKY_UNIFORM_VECTORS} vectors + ${SKY_UNIFORM_HEADROOM} headroom, device exposes ${maxFragmentUniformVectors}; use the registered float-texture slot fallback`);
  }
  return { used: SKY_UNIFORM_VECTORS, headroom: maxFragmentUniformVectors - SKY_UNIFORM_VECTORS };
}

export function makeBodyLayerMap(system) {
  if (!system || !Array.isArray(system.bodies)) throw new Error('capacity: system.bodies must be an array');
  const out = new Map();
  for (let i = 0; i < system.bodies.length; i++) {
    const id = system.bodies[i]?.id;
    if (typeof id !== 'string' || !id) throw new Error(`capacity: body at index ${i} needs a non-empty id`);
    if (out.has(id)) throw new Error(`capacity: duplicate body id '${id}' cannot map to one atlas layer`);
    out.set(id, i);
  }
  return out;
}

export function layerForBody(layerMap, id) {
  const layer = layerMap.get(id);
  if (layer === undefined) throw new Error(`capacity: body '${id}' has no atlas layer in the loaded system`);
  return layer;
}

export function assertStructuredCloneSafe(system) {
  try {
    const cloned = structuredClone(system);
    if (cloned === system || cloned?.bodies === system.bodies) throw new Error('clone retained source identity');
  } catch (err) {
    throw new Error(`capacity: system recipe is not structured-clone-safe: ${err?.message ?? err}`);
  }
  return true;
}

// Largest angular discs occupy the resolved slots. Everything else remains a
// member of the point tier; no system member can disappear due to slot pressure.
export function assignBodyRepresentations(others, maxSlots = MAX_BODY_SLOTS) {
  if (!Number.isInteger(maxSlots) || maxSlots < 0) throw new Error('capacity: maxSlots must be a non-negative integer');
  const ordered = [...others].sort((a, b) => (b.angRadius - a.angRadius) || String(a.body?.id ?? a.id).localeCompare(String(b.body?.id ?? b.id)));
  return { resolved: ordered.slice(0, maxSlots), points: ordered.slice(maxSlots) };
}

// Mean-preserving hand-down shared by the resolved-disc and point paths.
// For a Lambert sphere, disc-integrated reflected flux is proportional to
// irradiance * mean albedo * angular-radius^2 * 2/3.
export function discIntegratedFlux(irradiance, discAlbedo, angularRadius) {
  const mean = Array.isArray(discAlbedo)
    ? (discAlbedo[0] + discAlbedo[1] + discAlbedo[2]) / 3
    : discAlbedo;
  return irradiance * mean * angularRadius * angularRadius * (2 / 3);
}

export function makeGenerationFence(initial = 0) {
  let generation = initial;
  return Object.freeze({
    current: () => generation,
    bump: () => ++generation,
    stamp: (message) => ({ ...message, generation }),
    accepts: (message) => message?.generation === generation,
  });
}

// Small stable priority queue for boot JIT work. Lower numeric priority wins;
// sequence preserves recipe order for deterministic runs and baselines.
export function makeJitQueue() {
  let sequence = 0;
  const jobs = [];
  return {
    push(job, priority = 10) { jobs.push({ job, priority, sequence: sequence++ }); },
    shift() {
      if (!jobs.length) return undefined;
      jobs.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
      return jobs.shift().job;
    },
    clear() { jobs.length = 0; },
    get length() { return jobs.length; },
  };
}

export function assertCoVisibleSet(bodies) {
  if (bodies.length > MAX_BODY_SLOTS) {
    throw new Error(`capacity: co-visible resolved set has ${bodies.length} bodies, maximum is MAX_BODY_SLOTS=${MAX_BODY_SLOTS}`);
  }
  return true;
}
