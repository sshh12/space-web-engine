import { createEngine } from './engine.js';
import { SOL_SYSTEM } from './core/sol.js';
import { detentWarp, detentIndexOf, warpLabel, calendarOf, isExtrapolated } from './core/warp.js';
// Phase E: the editor panel — a modest UI over the rigorous mutation path.
// Every commit builds a NEXT system from a fresh clone and hands it to
// __editSystem (preflight → λ-continuity → classify → invalidate); the panel
// itself holds no authority over the live recipe.
import { makeBodyFromTemplate, cloneBody, deleteBody, reseedBody, TEMPLATE_CLASSES } from './core/editor.js';

const canvas = document.querySelector('#c');
const markersEl = document.querySelector('#markers'), tooltip = document.querySelector('#tooltip');
const status = document.querySelector('#status'), bodiesEl = document.querySelector('#bodies');
const warp = document.querySelector('#warp'), epoch = document.querySelector('#epoch');
const warpLabelEl = document.querySelector('#warp-label'), scrub = document.querySelector('#scrub');
const nowBtn = document.querySelector('#now-btn'), extrap = document.querySelector('#extrap');
const major = new Set(['cinis', 'venus', 'tellus', 'rubra', 'iovis', 'saturn', 'caelus', 'pontus', 'pluto']);
const dots = new Map();

window.__engine = createEngine(canvas, { system: SOL_SYSTEM, viewClass: 'system' });
const engine = window.__engine;

function tint(body) {
  const a = body.discAlbedo ?? [0.4, 0.4, 0.4];
  return `rgb(${a.map((v) => Math.round(Math.min(v * 330 + 38, 255))).join(',')})`;
}
function buildList(filter = '') {
  bodiesEl.innerHTML = '';
  const q = filter.trim().toLowerCase();
  for (const body of window.__editorSystem().bodies) {
    if (q && !`${body.id} ${body.name}`.toLowerCase().includes(q)) continue;
    const b = document.createElement('button'); b.className = 'body'; b.style.setProperty('--dot', tint(body));
    b.innerHTML = `<span class="dot"></span><span>${body.name}</span><small>${body.parent === 'star' ? 'planet' : 'moon'}</small>`;
    b.onclick = () => engine.travelTo(body.id); bodiesEl.append(b);
  }
}
buildList(); document.querySelector('#search').oninput = (e) => buildList(e.target.value);

// Phase W clock: signed log warp detents (pause ∥ ±1 s/s … ±decade/s), an
// epoch jog scrub, the calendar readout and the "now" reset. The slider sets
// BOTH the integration rate and the declared warp — the [time-field] policy
// (core/warp.js) selects each subsystem's representation from the latter.
warp.oninput = () => {
  const w = detentWarp(+warp.value);
  engine.state.speed = engine.state.warp = w;
  warpLabelEl.textContent = warpLabel(w);
};
let scrubLast = 0;
scrub.oninput = () => { engine.state.epochS += (+scrub.value - scrubLast) * 43200; scrubLast = +scrub.value; };
scrub.onchange = () => { scrub.value = '0'; scrubLast = 0; };
nowBtn.onclick = () => { engine.state.epochS = 0; };
document.querySelector('#system-btn').onclick = () => engine.enterSystemView('star');

addEventListener('navmarkers', (e) => {
  const alive = new Set(), occupied = [], cx = innerWidth / 2, cy = innerHeight / 2;
  for (const m of e.detail) {
    alive.add(m.id); let el = dots.get(m.id);
    if (!el) {
      el = document.createElement('span'); el.className = `marker ${m.moon ? 'moon' : ''} ${major.has(m.id) || m.id === 'star' ? 'major' : ''}`;
      el.dataset.name = m.name; markersEl.append(el); dots.set(m.id, el);
    }
    el.hidden = m.hidden; el.style.transform = `translate(${m.x}px,${m.y}px)`;
    const candidate = el.classList.contains('major') && (m.id === 'star' || Math.hypot(m.x - cx, m.y - cy) > 58);
    const collision = occupied.some((p) => Math.abs(p.x - m.x) < 105 && Math.abs(p.y - m.y) < 15);
    const showLabel = candidate && !collision;
    el.classList.toggle('label-hidden', !showLabel); if (showLabel) occupied.push(m);
  }
  for (const [id, el] of dots) if (!alive.has(id)) { el.remove(); dots.delete(id); }
});
addEventListener('navhover', (e) => {
  const m = e.detail; tooltip.style.display = m ? 'block' : 'none';
  if (m) { tooltip.textContent = m.name; tooltip.style.left = `${m.x + 12}px`; tooltip.style.top = `${m.y + 12}px`; }
});
addEventListener('travelstate', (e) => {
  status.textContent = e.detail.active ? `Travelling to ${e.detail.bodyId}…` : `Arrived at ${e.detail.bodyId}`;
});
addEventListener('viewclasschange', (e) => {
  const system = e.detail.viewClass === 'system'; markersEl.hidden = !system;
  status.textContent = system ? 'System view · true scale' : `Orbiting ${e.detail.hostId} · return to system any time`;
  document.querySelector('#crumb').textContent = `SOL / ${system ? 'SYSTEM VIEW' : e.detail.hostId.toUpperCase()}`;
});

// ---------------------------------------------------------------------------
// Phase E editor panel
// ---------------------------------------------------------------------------
const ed = (id) => document.querySelector(id);
const editor = ed('#editor'), edTree = ed('#ed-tree'), edForm = ed('#ed-form'), edMsg = ed('#ed-msg');
let edSel = 'star';
const disabledProcs = new Map(); // bodyId -> [{index, proc}] session-local toggle memory

ed('#edit-btn').onclick = () => { editor.classList.add('open'); edRefresh(); };
ed('#ed-close').onclick = () => editor.classList.remove('open');

function say(text, ok = false) { edMsg.textContent = text; edMsg.className = ok ? 'ok' : ''; }

function apply(next, note = 'applied') {
  try {
    const r = window.__editSystem(next);
    localStorage.setItem('swe-system-draft', JSON.stringify(window.__editorSystem()));
    const touched = Object.entries(r.bodies).map(([id, v]) => `${id}: ${v.classes.join('+')}`).join('; ');
    say(`${note} — scope ${r.scope}${touched ? ` (${touched})` : ''} · ${r.identity.recipeHash}`, true);
    buildList(); edRefresh();
    return true;
  } catch (e) {
    say(String(e?.message ?? e)); // preflight refused: the live world is unchanged
    return false;
  }
}

function edRefresh() {
  const sys = window.__editorSystem();
  ed('#ed-hash').textContent = `${sys.id} @ ${window.__system().recipeHash}`;
  // body tree grouped by parent (star roots first, then each parent's children)
  edTree.innerHTML = '';
  const mk = (id, label, cls = '') => {
    const b = document.createElement('button');
    b.textContent = label; b.className = `${cls} ${id === edSel ? 'sel' : ''}`;
    b.onclick = () => { edSel = id; edRefresh(); };
    edTree.append(b);
  };
  mk('star', `☀ ${sys.star.name ?? 'star'}`);
  const kids = (pid) => sys.bodies.filter((b) => b.parent === pid);
  const walk = (pid, depth) => {
    for (const b of kids(pid)) {
      mk(b.id, b.name ?? b.id, depth ? 'moon' : '');
      walk(b.id, depth + 1);
      for (const n of sys.nodes ?? []) if (n.parent === b.id) walk(n.id, depth + 1);
    }
  };
  walk('star', 0);
  for (const n of sys.nodes ?? []) if (n.parent === 'star') { mk(n.id, `◌ ${n.id}`, 'moon'); walk(n.id, 1); }
  edFormBuild(sys);
}

// one numeric/text/color row; commit-on-change builds a fresh next system
function row(label, value, commit, type = 'number') {
  const l = document.createElement('label');
  const span = document.createElement('span'); span.textContent = label;
  const input = document.createElement('input');
  input.type = type; if (type === 'number') input.step = 'any';
  if (type === 'color') input.value = value; else input.value = value ?? '';
  input.onchange = () => {
    const sys = window.__editorSystem();
    const v = type === 'number' ? (input.value === '' ? null : +input.value) : input.value;
    commit(sys, v);
    apply(sys, label);
  };
  l.append(span, input);
  return l;
}
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const unhex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const h3 = (t) => { const e = document.createElement('h3'); e.textContent = t; return e; };

function edFormBuild(sys) {
  edForm.innerHTML = '';
  if (edSel === 'star') {
    edForm.append(h3('Star'));
    edForm.append(row('luminosity', sys.star.irradianceAt1AU, (s, v) => { s.star.irradianceAt1AU = v; }));
    edForm.append(row('radius m', sys.star.radius, (s, v) => { s.star.radius = v; }));
    edForm.append(row('GM', sys.star.GM, (s, v) => { s.star.GM = v; }));
    edForm.append(row('color', hex(sys.star.color ?? [1, 1, 1]), (s, v) => { s.star.color = unhex(v); }, 'color'));
    return;
  }
  const body = sys.bodies.find((b) => b.id === edSel);
  if (!body) { edForm.append(h3(`${edSel} (barycenter node — edit via JSON import)`)); return; }
  const B = (s) => s.bodies.find((b) => b.id === edSel);
  edForm.append(h3(`Identity — ${body.id}`));
  edForm.append(row('name', body.name, (s, v) => { B(s).name = v; }, 'text'));
  edForm.append(row('GM', body.GM, (s, v) => { B(s).GM = v; }));
  edForm.append(row('R m', body.R, (s, v) => { B(s).R = v; }));
  edForm.append(row('sea level m', body.seaLevel, (s, v) => { B(s).seaLevel = v; }));

  if (body.orbit) {
    edForm.append(h3('Orbit'));
    const O = (s) => B(s).orbit;
    if (body.orbit.resonance) {
      const note = document.createElement('div'); note.className = 'sub';
      note.textContent = `resonance member '${body.orbit.resonance.group}' — a and phase derive from the group`;
      edForm.append(note);
      edForm.append(row('e', body.orbit.e, (s, v) => { O(s).e = v; }));
      edForm.append(row('i°', body.orbit.iDeg, (s, v) => { O(s).iDeg = v; }));
    } else if ('periodDays' in body.orbit) {
      edForm.append(row('a m', body.orbit.a, (s, v) => { O(s).a = v; }));
      edForm.append(row('period d', body.orbit.periodDays, (s, v) => { O(s).periodDays = v; }));
    } else {
      edForm.append(row('a m', body.orbit.a, (s, v) => { O(s).a = v; }));
      edForm.append(row('e', body.orbit.e, (s, v) => { O(s).e = v; }));
      edForm.append(row('i°', body.orbit.iDeg, (s, v) => { O(s).iDeg = v; }));
      edForm.append(row('Ω°', body.orbit.OmegaDeg, (s, v) => { O(s).OmegaDeg = v; }));
      edForm.append(row('ω°', body.orbit.omegaDeg, (s, v) => { O(s).omegaDeg = v; }));
      edForm.append(row('Ω̇ °/cy', body.orbit.OmegaDotDegCy ?? 0, (s, v) => { O(s).OmegaDotDegCy = v; }));
      edForm.append(row('ω̇ °/cy', body.orbit.omegaDotDegCy ?? 0, (s, v) => { O(s).omegaDotDegCy = v; }));
    }
  }
  if (body.spin) {
    edForm.append(h3('Spin'));
    const S = (s) => B(s).spin;
    if ('tiltDeg' in body.spin) {
      edForm.append(row('tilt°', body.spin.tiltDeg, (s, v) => { S(s).tiltDeg = v; }));
      edForm.append(row('period h', body.spin.periodH, (s, v) => { S(s).periodH = v; }));
    } else {
      edForm.append(row('pole lon°', body.spin.poleLonDeg, (s, v) => { S(s).poleLonDeg = v; }));
      edForm.append(row('pole lat°', body.spin.poleLatDeg, (s, v) => { S(s).poleLatDeg = v; }));
      if (body.spin.periodH != null) edForm.append(row('period h', body.spin.periodH, (s, v) => { S(s).periodH = v; }));
    }
  }
  if (body.palette) {
    edForm.append(h3('Palette'));
    for (const key of Object.keys(body.palette)) {
      const c = body.palette[key];
      if (!Array.isArray(c) || c.length !== 3) continue;
      edForm.append(row(key, hex(c.map((v) => Math.min(v, 1))), (s, v) => { B(s).palette[key] = unhex(v); }, 'color'));
    }
    if (body.discAlbedo) edForm.append(row('discAlbedo', hex(body.discAlbedo), (s, v) => { B(s).discAlbedo = unhex(v); }, 'color'));
  }
  if (body.processes) {
    edForm.append(h3('Processes'));
    const off = disabledProcs.get(body.id) ?? [];
    const list = document.createElement('div');
    body.processes.forEach((p, i) => {
      const rowEl = document.createElement('div'); rowEl.className = 'proc';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
      cb.onchange = () => {
        const sys = window.__editorSystem();
        const removed = B(sys).processes.splice(i, 1)[0];
        disabledProcs.set(body.id, [...(disabledProcs.get(body.id) ?? []), { index: i, proc: removed }]);
        apply(sys, `${p.type} off`);
      };
      const name = document.createElement('span'); name.textContent = `${p.type} [${p.levels?.join('–') ?? ''}]`;
      const seed = document.createElement('input'); seed.type = 'number'; seed.step = '1'; seed.value = p.seed ?? '';
      seed.disabled = p.seed == null;
      seed.onchange = () => { const sys = window.__editorSystem(); B(sys).processes[i].seed = +seed.value; apply(sys, `${p.type} seed`); };
      rowEl.append(cb, name, seed); list.append(rowEl);
    });
    off.forEach((entry, j) => {
      const rowEl = document.createElement('div'); rowEl.className = 'proc';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = false;
      cb.onchange = () => {
        const sys = window.__editorSystem();
        B(sys).processes.splice(Math.min(entry.index, B(sys).processes.length), 0, entry.proc);
        disabledProcs.set(body.id, off.filter((_, k) => k !== j));
        apply(sys, `${entry.proc.type} on`);
      };
      const name = document.createElement('span'); name.textContent = `${entry.proc.type} (off)`;
      rowEl.append(cb, name, document.createElement('span')); list.append(rowEl);
    });
    edForm.append(list);
  }
}

// structural actions share one tiny inline form (no prompt(): headless-safe)
function inlineForm(fields, onSubmit) {
  edForm.innerHTML = '';
  edForm.append(h3('New body'));
  const values = {};
  for (const f of fields) {
    if (f.options) {
      const l = document.createElement('label');
      const span = document.createElement('span'); span.textContent = f.label;
      const sel = document.createElement('select');
      for (const o of f.options) { const opt = document.createElement('option'); opt.value = opt.textContent = o; sel.append(opt); }
      sel.value = f.value ?? f.options[0];
      values[f.key] = sel.value; sel.onchange = () => { values[f.key] = sel.value; };
      l.append(span, sel); edForm.append(l);
    } else {
      values[f.key] = f.value ?? '';
      edForm.append(row(f.label, f.value ?? '', (s, v) => {}, f.type ?? 'text'));
      const input = edForm.lastChild.querySelector('input');
      input.onchange = () => { values[f.key] = f.type === 'number' ? +input.value : input.value; };
    }
  }
  const go = document.createElement('button'); go.textContent = 'Create';
  go.onclick = () => onSubmit(values);
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
  cancel.onclick = () => edRefresh();
  edForm.append(go, cancel);
}

ed('#ed-add').onclick = () => {
  const sys = window.__editorSystem();
  const parents = ['star', ...sys.bodies.filter((b) => b.parent === 'star' && b.orbit).map((b) => b.id)];
  inlineForm([
    { key: 'klass', label: 'template', options: [...TEMPLATE_CLASSES] },
    { key: 'id', label: 'id', type: 'text', value: 'novus' },
    { key: 'parent', label: 'parent', options: parents, value: 'star' },
  ], (v) => {
    try {
      const s = window.__editorSystem();
      s.bodies.push(makeBodyFromTemplate(s, v.klass, { id: v.id, parent: v.parent }));
      if (apply(s, `add ${v.id}`)) edSel = v.id;
      edRefresh();
    } catch (e) { say(String(e?.message ?? e)); }
  });
};
ed('#ed-clone').onclick = () => {
  if (edSel === 'star') return say('select a body to clone');
  inlineForm([{ key: 'id', label: 'new id', type: 'text', value: `${edSel}-b` }], (v) => {
    try {
      const s = window.__editorSystem();
      s.bodies.push(cloneBody(s, edSel, { id: v.id }));
      if (apply(s, `clone ${edSel} → ${v.id}`)) edSel = v.id;
      edRefresh();
    } catch (e) { say(String(e?.message ?? e)); }
  });
};
ed('#ed-reseed').onclick = () => {
  if (edSel === 'star') return say('select a body to reseed');
  const s = window.__editorSystem();
  reseedBody(s.bodies.find((b) => b.id === edSel), 7777);
  apply(s, `reseed ${edSel}`);
};
ed('#ed-delete').onclick = () => {
  if (edSel === 'star') return say('the star stays');
  try {
    const next = deleteBody(window.__editorSystem(), edSel);
    if (apply(next, `delete ${edSel}`)) edSel = 'star';
  } catch (e) {
    say(String(e?.message ?? e));
    if (String(e?.message).includes('has children')) {
      const re = document.createElement('button'); re.textContent = 'Re-parent children';
      re.onclick = () => { const n = deleteBody(window.__editorSystem(), edSel, { orphans: 'reparent' }); if (apply(n, `delete ${edSel} (reparent)`)) edSel = 'star'; };
      const ca = document.createElement('button'); ca.textContent = 'Delete subtree';
      ca.onclick = () => { const n = deleteBody(window.__editorSystem(), edSel, { orphans: 'cascade' }); if (apply(n, `delete ${edSel} (cascade)`)) edSel = 'star'; };
      edMsg.append(document.createElement('br'), re, ca);
    }
  }
};
ed('#ed-export').onclick = () => {
  const data = JSON.stringify(window.__editorSystem(), null, 1);
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
  a.download = `${window.__system().id}-${window.__system().recipeHash}.json`;
  a.click();
};
ed('#ed-import').onclick = () => ed('#ed-file').click();
ed('#ed-file').onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try { apply(JSON.parse(await file.text()), `import ${file.name}`); }
  catch (err) { say(String(err?.message ?? err)); }
  e.target.value = '';
};

function uiTick() {
  epoch.textContent = calendarOf(engine.state.epochS).text;
  extrap.style.display = isExtrapolated(engine.state.epochS, SOL_SYSTEM) ? 'inline' : 'none';
  if (document.activeElement !== warp) {
    const idx = detentIndexOf(engine.state.warp);
    if (detentWarp(idx) === engine.state.warp) { warp.value = String(idx); warpLabelEl.textContent = warpLabel(engine.state.warp); }
    else warpLabelEl.textContent = warpLabel(engine.state.warp);
  }
  if (engine.state.viewClass === 'system' && !engine.state.travel && engine.state.ready) status.textContent = 'System view · true scale · click a world to travel';
  requestAnimationFrame(uiTick);
}
uiTick();
