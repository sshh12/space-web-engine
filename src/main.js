// Inspector binding. The renderer and harness contract live in createEngine().
import { createEngine } from './engine.js';
import { SOL_SYSTEM } from './core/sol.js';

const canvas = document.getElementById('c');
const system = new URL(location.href).searchParams.get('system') === 'sol' ? SOL_SYSTEM : undefined;
// Phase E: the canonical registry lets a spec.system id string select a shipped
// system; inline payloads (edited systems) need no registry.
window.__engine = createEngine(canvas, { system, systems: { [SOL_SYSTEM.id]: SOL_SYSTEM } });
