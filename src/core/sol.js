// Phase S: the deliverable fictional Sol-analog. Existing surface recipes are
// cloned from demo; new worlds are data-only retunings of shipped families.

import {
  SYSTEM, AU, assertPaletteRecipe, assertFigureRecipe,
  assertGiantRecipe, assertRingRecipe,
} from './recipe.js';
import { assertMechanicsSystem } from './mechanics.js';
import { assertBeltSystem, assertComaRecipe } from './smallbody.js';

const clone = (value) => structuredClone(value);
const demo = new Map(SYSTEM.bodies.map((body) => [body.id, body]));
const take = (id) => clone(demo.get(id));
const conic = (aAU, e, iDeg, OmegaDeg, omegaDeg, M0Deg, rates = {}) => ({
  a: aAU * AU, e, iDeg, OmegaDeg, omegaDeg, M0Deg, epochS: 0,
  OmegaDotDegCy: rates.node ?? 0, omegaDotDegCy: rates.apse ?? 0, frame: 'ecliptic',
});
const moonOrbit = (a, e, iDeg, OmegaDeg, omegaDeg, M0Deg, rates = {}, frame = 'parentEq') => ({
  a, e, iDeg, OmegaDeg, omegaDeg, M0Deg, epochS: 0,
  OmegaDotDegCy: rates.node ?? 0, omegaDotDegCy: rates.apse ?? 0, frame,
});
const spin = (poleLonDeg, poleLatDeg, periodH, extra = {}) => ({
  poleLonDeg, poleLatDeg, periodH, phase0: 0, meridianDeg: 0, ...extra,
});
const lockedSpin = (poleLonDeg, poleLatDeg, ratio = 1) => ({
  poleLonDeg, poleLatDeg, locked: true, lockRatio: ratio, phase0: 0, meridianDeg: 0,
});

function reseed(body, offset) {
  for (const p of body.processes ?? []) if (typeof p.seed === 'number') p.seed += offset;
  if (body.clouds?.seed != null) body.clouds.seed += offset;
  return body;
}

function configure(body, values) {
  Object.assign(body, values);
  delete body.skyHidden;
  return body;
}

function addInsolation(body) {
  if (body.parent !== 'star' || !(body.orbit?.a > 0)) return body;
  const context = body.processes?.find((p) => p.type === 'context');
  if (context) context.insolation = {
    referenceA: body.orbit.a,
    referenceObliquityDeg: valuesObliquity(body),
    orbitResponseC: 55,
    latitudeResponseC: 5,
  };
  return body;
}

function valuesObliquity(body) {
  // The authored pole latitude is measured in the engine's ecliptic frame. This
  // reference freezes the initial climate while making later axis edits visible.
  return Math.abs(90 - Math.abs(body.spin.poleLatDeg ?? (90 - (body.spin.tiltDeg ?? 0))));
}

function airless(id, name, template, values, palette, seed) {
  const b = reseed(take(template), seed);
  configure(b, { id, name, atmosphere: null, seaLevel: null, ...values });
  delete b.clouds;
  if (palette) {
    b.discAlbedo = palette.dust;
    b.palette = { ...b.palette, ...palette };
  }
  return b;
}

function giant(id, name, values, bands, seed, rings = null) {
  const b = reseed(take('saturn'), seed);
  configure(b, { id, name, ...values });
  b.giant.bands = bands.map(([s, c]) => ({ s, c }));
  if (rings) b.rings = rings; else delete b.rings;
  b.palette.dust = clone(bands[Math.floor(bands.length / 2)][1]);
  b.palette.rock = clone(b.palette.dust);
  b.discAlbedo = clone(b.palette.dust);
  return b;
}

const cinis = airless('cinis', 'Cinis (Mercury analog)', 'luna', {
  parent: 'star', GM: 2.2032e13, R: 2_439_700,
  orbit: conic(0.387099, 0.20563, 7.005, 48.331, 29.125, 174.796, { node: -0.1253, apse: 0.285 }),
  spin: lockedSpin(281.0, -89.966, [3, 2]), maxBakeLevel: 17,
  camera: { lon: 110, lat: 8, alt: 5_000_000 },
}, { dust: [0.39, 0.37, 0.34], dustVar: [0.48, 0.46, 0.42], rock: [0.31, 0.30, 0.29] }, 1000);
cinis.processes.splice(2, 0, { type: 'strata', levels: [7, 14], bedT0: 520, bedLac: 0.5, octaves: 4, foldAmp: 5000, foldF: 4, hardBias: 0.55, amp: 0.55, seed: 1097 });

const venus = configure(take('venus'), {
  parent: 'star', orbit: conic(0.723336, 0.00678, 3.3947, 76.680, 54.852, 50.115, { node: -0.278, apse: 0.057 }),
  spin: spin(272.76, 87.36, 5832.5),
});
const tellus = configure(take('tellus'), {
  parent: 'star', orbit: conic(1.000003, 0.01671, 0.0001, 0, 102.937, 357.517, { apse: 0.323 }),
  spin: spin(0, -66.56, 23.934),
});
const luna = configure(take('luna'), {
  parent: 'tellus', orbit: moonOrbit(384_400_000, 0.0549, 5.145, 125.08, 318.15, 115.365, { node: -1935.5, apse: 4067.6 }, 'ecliptic'),
  spin: lockedSpin(0, -83.3),
});
const rubra = configure(take('rubra'), {
  parent: 'star', orbit: conic(1.52371, 0.09339, 1.8506, 49.558, 286.502, 19.373, { node: -0.293, apse: 0.444 }),
  spin: spin(317.68, -64.81, 24.623),
});

const timor = airless('timor', 'Timor (Phobos analog)', 'vesta', {
  parent: 'rubra', GM: 7.11e5, R: 11_100,
  figure: { type: 'ellipsoid', axes: [13_500, 11_000, 9_000], reliefBudget: 700 },
  orbit: moonOrbit(9_376_000, 0.0151, 1.08, 164.9, 150.1, 20), spin: lockedSpin(317.68, -64.81),
  maxBakeLevel: 10, camera: { lon: 0, lat: 10, alt: 35_000 },
}, { dust: [0.20, 0.18, 0.16], dustVar: [0.25, 0.22, 0.19], rock: [0.16, 0.15, 0.14] }, 1100);
const pavor = airless('pavor', 'Pavor (Deimos analog)', 'vesta', {
  parent: 'rubra', GM: 9.6e4, R: 6_200,
  figure: { type: 'ellipsoid', axes: [7_800, 6_000, 5_100], reliefBudget: 420 },
  orbit: moonOrbit(23_463_000, 0.0003, 1.79, 147.4, 260.7, 90), spin: lockedSpin(317.68, -64.81),
  maxBakeLevel: 9, camera: { lon: 0, lat: 10, alt: 24_000 },
}, { dust: [0.25, 0.22, 0.20], dustVar: [0.29, 0.26, 0.23], rock: [0.19, 0.18, 0.17] }, 1200);
// Vesta's shipped family includes a 250 km Rheasilvia datum and kilometre-scale
// relief. Retune those absolute knobs for 6–11 km moonlets; retaining them would
// violate the figure relief budget and turn the discs into radial spikes.
for (const [body, coarse, detail, complexR] of [[timor, 320, 75, 1400], [pavor, 180, 42, 800]]) {
  for (const p of body.processes) {
    if (p.type === 'continents') p.amp = coarse;
    if (p.type === 'fbmBand' && p.levels[0] < 10) p.amp = detail;
    if (p.type === 'craters') {
      delete p.basins; p.depthK = .18; p.complexR = complexR; p.density = .32;
    }
  }
}

const iovis = giant('iovis', 'Iovis (Jupiter analog)', {
  parent: 'star', GM: 1.26686534e17, R: 69_911_000,
  orbit: conic(5.202887, 0.04839, 1.304, 100.464, 273.867, 20.020, { node: 0.205, apse: 0.213 }),
  spin: spin(268.06, -87.05, 9.925), camera: { lon: 0, lat: 0, alt: 260_000_000 },
}, [
  [-.95, [.30, .20, .14]], [-.68, [.86, .66, .42]], [-.38, [.34, .20, .13]],
  [-.12, [.94, .72, .43]], [.13, [.38, .22, .14]], [.40, [.90, .68, .43]],
  [.70, [.28, .18, .14]], [.94, [.76, .58, .42]],
], 1300);
iovis.giant.storm = { lon: 1.05, lat: -0.38, r: 0.16, c: [0.72, 0.23, 0.12] };
iovis.giant.limbExp = 0.45;

const resonanceOrbit = (ratio, phaseDeg, e, iDeg, OmegaDeg, omegaDeg) => ({
  e, iDeg, OmegaDeg, omegaDeg, epochS: 0, frame: 'parentEq',
  OmegaDotDegCy: 0, omegaDotDegCy: 0,
  resonance: { group: 'laplace-iovis', ratio, phaseDeg },
});
const fornax = airless('fornax', 'Fornax (Io analog)', 'luna', {
  parent: 'iovis', GM: 5.9599e12, R: 1_821_600,
  orbit: resonanceOrbit(4, 0, 0.0041, 0.04, 0, 84), spin: lockedSpin(268.06, -87.05),
  camera: { lon: 30, lat: 0, alt: 3_500_000 },
}, { dust: [0.78, 0.63, 0.20], dustVar: [0.94, 0.78, 0.27], rock: [0.36, 0.18, 0.08], ice: [0.91, 0.72, 0.24] }, 1400);
fornax.processes.splice(2, 0, { type: 'provinces', levels: [2, 3], fillHi: 450, fillLo: -250, bias: 0.05, flatten: 0.1, seed: 1491 });
const europa = configure(take('europa'), {
  parent: 'iovis', orbit: resonanceOrbit(2, 180, 0.009, 0.47, 0, 88.97), spin: lockedSpin(268.06, -87.05),
});
const sulcus = airless('sulcus', 'Sulcus (Ganymede analog)', 'europa', {
  parent: 'iovis', GM: 9.8878e12, R: 2_634_100,
  orbit: resonanceOrbit(1, 0, 0.0013, 0.20, 0, 192.4), spin: lockedSpin(268.06, -87.05),
  camera: { lon: 155, lat: 8, alt: 5_000_000 },
}, { dust: [0.42, 0.39, 0.36], dustVar: [0.52, 0.49, 0.45], rock: [0.29, 0.27, 0.26], ice: [0.72, 0.76, 0.82], linea: [0.28, 0.24, 0.22] }, 1500);
const vetus = airless('vetus', 'Vetus (Callisto analog)', 'pluto', {
  parent: 'iovis', GM: 7.1793e12, R: 2_410_300,
  orbit: moonOrbit(1_882_700_000, 0.0074, 0.28, 0, 52.6, 330), spin: lockedSpin(268.06, -87.05),
  camera: { lon: 30, lat: 15, alt: 4_500_000 },
}, { dust: [0.20, 0.17, 0.15], dustVar: [0.26, 0.22, 0.18], rock: [0.14, 0.13, 0.12], ice: [0.54, 0.57, 0.61], tholin: [0.10, 0.055, 0.035] }, 1600);
vetus.processes = vetus.processes.filter((p) => !['glacier', 'polygons', 'sublimation'].includes(p.type));

const saturn = configure(take('saturn'), {
  parent: 'star', orbit: conic(9.536676, 0.05386, 2.485, 113.665, 339.392, 317.020, { node: -0.289, apse: -0.134 }),
  spin: spin(40.59, -63.27, 10.656),
});
const candor = airless('candor', 'Candor (Enceladus analog)', 'europa', {
  parent: 'saturn', GM: 7.210e9, R: 252_100,
  orbit: moonOrbit(237_948_000, 0.0047, 0.01, 0, 119.5, 10), spin: lockedSpin(40.59, -63.27),
  maxBakeLevel: 14, camera: { lon: 275, lat: -30, alt: 500_000 },
}, { dust: [0.84, 0.87, 0.92], dustVar: [0.93, 0.95, 0.98], rock: [0.64, 0.68, 0.74], ice: [0.94, 0.97, 1.0], linea: [0.57, 0.65, 0.75] }, 1700);
const rhea = airless('rhea', 'Rhea (cratered ice analog)', 'luna', {
  parent: 'saturn', GM: 1.5394e11, R: 763_800,
  orbit: moonOrbit(527_108_000, 0.001, 0.35, 0, 241, 210), spin: lockedSpin(40.59, -63.27),
  maxBakeLevel: 15, camera: { lon: 20, lat: 10, alt: 1_500_000 },
}, { dust: [0.58, 0.59, 0.61], dustVar: [0.68, 0.69, 0.72], rock: [0.42, 0.43, 0.45], ice: [0.83, 0.86, 0.91] }, 1800);
const titan = configure(take('titan'), {
  parent: 'saturn', orbit: moonOrbit(1_221_870_000, 0.0288, 0.35, 0, 186.6, 120), spin: lockedSpin(40.59, -63.27),
});
const ianus = airless('ianus', 'Ianus (Iapetus analog)', 'pluto', {
  parent: 'saturn', GM: 1.205e11, R: 734_500,
  orbit: moonOrbit(3_560_820_000, 0.0283, 15.47, 81.1, 271.6, 70, {}, 'ecliptic'), spin: lockedSpin(40.59, -63.27),
  maxBakeLevel: 15, camera: { lon: 55, lat: 8, alt: 1_400_000 },
}, { dust: [0.52, 0.49, 0.44], dustVar: [0.65, 0.61, 0.54], rock: [0.38, 0.34, 0.29], ice: [0.80, 0.83, 0.86], tholin: [0.08, 0.045, 0.025] }, 1900);
ianus.processes = ianus.processes.filter((p) => !['glacier', 'polygons', 'sublimation'].includes(p.type));

const faintRings = { inner: 1.64, outer: 2.02, gaps: [{ r: 1.84, w: .015, depth: .7 }], col: [.38, .46, .48], tau: .22, fscatterG: .25 };
const caelus = giant('caelus', 'Caelus (Uranus analog)', {
  parent: 'star', GM: 5.793939e15, R: 25_362_000,
  orbit: conic(19.189165, 0.04726, 0.773, 74.006, 96.998, 142.238, { node: 0.042, apse: 0.272 }),
  spin: spin(257.31, 7.77, 17.24), camera: { lon: 0, lat: 0, alt: 100_000_000 },
}, [[-.95,[.38,.60,.61]],[-.6,[.48,.70,.70]],[-.2,[.54,.75,.74]],[.2,[.51,.72,.72]],[.6,[.44,.66,.67]],[.95,[.36,.58,.61]]], 2000, faintRings);
caelus.giant.storm = { lon: 2.4, lat: .45, r: .08, c: [.66,.78,.76] };
caelus.giant.hexagon = { latOn: .92, amp: 0, c: [.4,.6,.62] };

const uranian = (id, name, template, GM, R, a, e, inc, phase, palette, seed) => airless(id, name, template, {
  parent: 'caelus', GM, R, orbit: moonOrbit(a, e, inc, 0, 0, phase), spin: lockedSpin(257.31, 7.77),
  maxBakeLevel: 14, camera: { lon: 30, lat: 10, alt: R * 2.2 },
}, palette, seed);
const ruina = uranian('ruina', 'Ruina (Miranda analog)', 'europa', 4.319e9, 235_800, 129_390_000, .0013, 4.34, 20,
  { dust:[.47,.48,.50],dustVar:[.62,.63,.66],rock:[.34,.35,.37],ice:[.77,.80,.85],linea:[.30,.31,.34] }, 2100);
const aeria = uranian('aeria', 'Aeria (Ariel analog)', 'luna', 8.346e10, 578_900, 190_900_000, .0012, .04, 85,
  { dust:[.55,.56,.58],dustVar:[.65,.67,.70],rock:[.40,.41,.43],ice:[.79,.82,.87] }, 2200);
const umbra = uranian('umbra', 'Umbra (Umbriel analog)', 'luna', 8.510e10, 584_700, 266_000_000, .0039, .13, 150,
  { dust:[.23,.23,.24],dustVar:[.31,.31,.33],rock:[.18,.18,.19],ice:[.49,.51,.55] }, 2300);
const titania = uranian('titania', 'Titania (ice moon analog)', 'luna', 2.269e11, 788_900, 435_910_000, .0011, .08, 225,
  { dust:[.42,.42,.44],dustVar:[.54,.54,.57],rock:[.31,.31,.33],ice:[.68,.71,.76] }, 2400);
const oberon = uranian('oberon', 'Oberon (outer ice moon analog)', 'luna', 2.053e11, 761_400, 583_520_000, .0014, .07, 300,
  { dust:[.31,.30,.31],dustVar:[.40,.39,.41],rock:[.23,.22,.23],ice:[.57,.59,.63] }, 2500);

const pontus = giant('pontus', 'Pontus (Neptune analog)', {
  parent: 'star', GM: 6.836529e15, R: 24_622_000,
  orbit: conic(30.069923, 0.00859, 1.770, 131.784, 273.187, 256.228, { node: -0.005, apse: -0.006 }),
  spin: spin(299.36, -61.79, 16.11), camera: { lon: 0, lat: 0, alt: 96_000_000 },
}, [[-.95,[.08,.22,.48]],[-.62,[.12,.34,.68]],[-.25,[.16,.43,.78]],[.1,[.12,.37,.73]],[.46,[.18,.47,.80]],[.78,[.10,.30,.62]],[.95,[.07,.20,.46]]], 2600);
pontus.giant.storm = { lon: 1.6, lat: -.35, r: .15, c: [.035,.06,.16] };
pontus.giant.hexagon = { latOn: .9, amp: 0, c: [.1,.3,.65] };
const errans = airless('errans', 'Errans (Triton analog)', 'pluto', {
  parent: 'pontus', GM: 1.4276e12, R: 1_353_400,
  orbit: moonOrbit(354_759_000, .000016, 156.865, 177.6, 0, 40), spin: lockedSpin(299.36, -61.79),
  camera: { lon: 145, lat: 5, alt: 2_600_000 },
}, { dust:[.58,.49,.45],dustVar:[.67,.57,.52],rock:[.41,.35,.33],ice:[.83,.86,.89],tholin:[.23,.09,.07] }, 2700);

const vesta = configure(take('vesta'), {
  parent: 'star', orbit: conic(2.361, .0887, 7.14, 103.8, 151.2, 20), spin: spin(309.0, -48.0, 5.342),
});
const ordo = airless('ordo', 'Ordo (Ceres analog)', 'luna', {
  parent: 'star', GM: 6.26325e10, R: 469_700,
  orbit: conic(2.7675, .0758, 10.59, 80.3, 73.6, 95), spin: spin(291.4, -85.0, 9.074),
  maxBakeLevel: 15, camera: { lon: 20, lat: 15, alt: 950_000 },
}, { dust:[.30,.29,.28],dustVar:[.37,.36,.34],rock:[.22,.21,.20],ice:[.72,.75,.78] }, 2800);
ordo.palette.freshTint = [2.4, 2.25, 1.9];
Object.assign(ordo.processes.find((p) => p.type === 'craters'), { rayK: 1.2, rayAge: .35, rayReach: 4 });

const pluto = configure(take('pluto'), { parent: 'pluto-navita', spin: lockedSpin(132.99, 32.53) });
delete pluto.orbit;
const navita = airless('navita', 'Navita (Charon analog)', 'pluto', {
  parent: 'pluto-navita', GM: 1.0588e11, R: 606_000, spin: lockedSpin(132.99, 32.53),
  maxBakeLevel: 14, camera: { lon: 20, lat: 62, alt: 1_100_000 },
}, { dust:[.42,.40,.39],dustVar:[.51,.49,.47],rock:[.31,.30,.29],ice:[.72,.74,.77],tholin:[.20,.07,.055],linea:[.30,.28,.27] }, 2900);
delete navita.orbit;
navita.processes = navita.processes.filter((p) => !['glacier', 'polygons', 'sublimation'].includes(p.type));
for (const p of navita.processes) if (p.type === 'tholin') Object.assign(p, { placement: 'polar', capLatDeg: 52, capSoftDeg: 10 });
if (!navita.processes.some((p) => p.type === 'lineae')) {
  navita.processes.splice(3, 0, { type: 'lineae', levels: [2, 12], ridgeLevel: 6, seed: 2993,
    families: [{ pole: [.3,.9,.2], lam: .13, phase: .2, amp: 110, albK: .35, warp: .08, fade: .8 }] });
}

// Phase B: the comet — real-analog Halley elements on the K1 machinery with
// the comet solver class (e = 0.967 exceeds KEPLER_E_MAX by design; the orbit
// opts into orbit.solver = 'comet'). The nucleus is the vesta figure family at
// bilobed-kilometre scale (the timor/pavor retune law); the coma/tail is an
// authored emission look consumed by the point tier and the system view.
const cometa = airless('cometa', 'Cometa (Halley analog)', 'vesta', {
  parent: 'star', GM: 15, R: 5_500,
  figure: { type: 'ellipsoid', axes: [7_700, 4_400, 4_000], reliefBudget: 450 },
  orbit: { ...conic(17.834, 0.96714, 162.262, 58.42, 111.33, 38.38), solver: 'comet' },
  spin: spin(65, 24, 52.8), maxBakeLevel: 10,
  camera: { lon: 0, lat: 12, alt: 22_000 },
  coma: { rOnAU: 3, strength: 6e-7, tailAU: 0.35, color: [0.62, 0.78, 1.0] },
}, { dust: [0.10, 0.095, 0.088], dustVar: [0.15, 0.14, 0.125], rock: [0.075, 0.07, 0.066], ice: [0.52, 0.55, 0.60] }, 3000);
// Vesta's absolute knobs retuned for a 5 km nucleus (the timor/pavor law:
// keeping the 250 km basin datum or kilometre relief violates the figure
// budget and turns the disc into radial spikes).
for (const p of cometa.processes) {
  if (p.type === 'continents') p.amp = 240;
  if (p.type === 'fbmBand' && p.levels[0] < 10) p.amp = 32;
  if (p.type === 'craters') { delete p.basins; p.depthK = .16; p.complexR = 520; p.density = .3; }
}

const haumea = configure(take('haumea'), {
  parent: 'star', orbit: conic(43.218, .1913, 28.19, 121.9, 239.0, 205), spin: spin(285, -77, 3.915),
});
const arrokoth = configure(take('arrokoth'), {
  parent: 'star', orbit: conic(44.58, .037, 2.45, 158.9, 174.5, 316), spin: spin(317, 29, 15.92),
});

const bodies = [
  cinis, venus, tellus, luna, rubra, timor, pavor,
  iovis, fornax, europa, sulcus, vetus,
  saturn, candor, rhea, titan, ianus,
  caelus, ruina, aeria, umbra, titania, oberon,
  pontus, errans, vesta, ordo, pluto, navita, haumea, arrokoth, cometa,
];
for (const body of bodies) addInsolation(body);

// Phase B: belts as §7 scatter over an orbital density field — pure data. The
// Kirkwood gaps are density rows at the iovis resonances; the orbital-cell law
// (smallbody.js) renders the emptier cells, nothing is special-cased.
const belts = [
  { id: 'main-belt', name: 'Main belt', cells: 6144,
    aInner: 2.06 * AU, aOuter: 3.30 * AU, eMax: 0.22, iSigmaDeg: 8,
    seed: 4001, albedo: [0.13, 0.12, 0.11], minR: 500, maxR: 120_000,
    gaps: [
      { a: 2.502 * AU, w: 0.045 * AU, depth: 0.92 },  // 3:1
      { a: 2.825 * AU, w: 0.035 * AU, depth: 0.85 },  // 5:2
      { a: 2.958 * AU, w: 0.030 * AU, depth: 0.80 },  // 7:3
      { a: 3.279 * AU, w: 0.050 * AU, depth: 0.95 },  // 2:1
    ] },
  { id: 'kuiper-belt', name: 'Kuiper belt', cells: 4096,
    aInner: 42 * AU, aOuter: 48 * AU, eMax: 0.12, iSigmaDeg: 4,
    seed: 4002, albedo: [0.09, 0.08, 0.085], minR: 5_000, maxR: 600_000 },
];

export const SOL_SYSTEM = {
  id: 'sol-system', validYears: 5000, star: clone(SYSTEM.star),
  resonances: [{ id: 'laplace-iovis', baseBody: 'fornax', baseA: 421_700_000 }],
  nodes: [{
    id: 'pluto-navita', type: 'barycenter', parent: 'star', primary: 'pluto', secondary: 'navita',
    orbit: conic(39.482, .2488, 17.16, 110.30, 113.76, 14.86, { node: -.011, apse: .004 }),
    relativeOrbit: moonOrbit(19_596_000, .0002, 0, 0, 0, 0, {}, 'parentEq'),
  }],
  belts,
  bodies,
};

export const SOL_ADDED_BODY_IDS = Object.freeze(bodies.map((b) => b.id).filter((id) => !demo.has(id)));
export const SOL_REPIN_DELTA = Object.freeze({
  changedBodies: Object.freeze(bodies.map((b) => b.id).filter((id) => demo.has(id))),
  addedBodies: SOL_ADDED_BODY_IDS,
  orbitBakeConsumers: Object.freeze(bodies.filter((b) => b.clouds?.decks?.some((d) => (d.stormW ?? 0) || (d.hoodAmp ?? 0))).map((b) => b.id)),
  insolationBodies: Object.freeze(bodies.filter((b) => b.processes?.some((p) => p.type === 'context' && p.insolation)).map((b) => b.id)),
});

assertMechanicsSystem(SOL_SYSTEM);
assertBeltSystem(SOL_SYSTEM);
for (const body of SOL_SYSTEM.bodies) {
  assertPaletteRecipe(body); assertFigureRecipe(body); assertGiantRecipe(body); assertRingRecipe(body);
  assertComaRecipe(body);
}
