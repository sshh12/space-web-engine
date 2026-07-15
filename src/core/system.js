// Stable, realm-independent system identity for baselines and SceneSpecs.

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

export function recipeHash(system) {
  const s = canonical(system);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function systemIdentity(system) {
  return Object.freeze({ id: system.id, recipeHash: recipeHash(system) });
}

export function sameRunProvenance(a, b) {
  return !!a && !!b && a.backend === b.backend && a.fast === b.fast
    && a.system?.id === b.system?.id
    && a.system?.recipeHash === b.system?.recipeHash;
}

