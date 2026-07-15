// shaders.js — all GLSL. One shared chunk (atmosphere integral, tonemap, detail noise)
// is concatenated into every material so the sky pass, terrain aerial perspective,
// ocean and debris all evaluate the SAME functions (CONCEPT §8: a view's appearance
// must not depend on the altitude — or the pass — rendering it).
//
// Written GLSL1-style (varying/gl_FragColor): three r160 compiles everything as
// GLSL ES 3.00 on WebGL2 with compat defines, so texelFetch/uint ops are available.

// ---------------------------------------------------------------------------
export const COMMON = /* glsl */ `
  precision highp float;
  precision highp int;
  #ifndef PI
  #define PI 3.14159265359
  #endif

  uniform vec3  uSunDir;      // body-fixed, unit
  uniform vec3  uSunRad;      // irradiance at this body (relative radiance units)
  uniform vec3  uCamPos;      // camera, planet-centered body-fixed meters (f32 ok here)
  uniform float uPlanetR;
  uniform float uExposure;
  uniform float uHasAtm;
  uniform float uAtmTop, uHr, uHm;
  uniform vec3  uMieG;        // per-wavelength forward lobe (the MER blue aureole is data)
  uniform vec3  uBetaR, uBetaM, uBetaA, uAirglow; // uBetaA: absorption (dust eats blue)
  uniform float uSunAngR;     // sun angular radius (penumbra width, sun disc)
  uniform float uRefrac;      // recipe refractivity (n-1) at the datum; 0 = none
  // stratospheric ozone: tent-profile absorber (Chappuis band) — peak beta /m,
  // shell center + half-width. The blue twilight zenith lives here.
  uniform vec3  uBetaO3;
  uniform float uOzH, uOzW;
  // multiple scattering (Phase 1): per-recipe Psi(mu_s, sqrt(h/top)) as a
  // 32-knot uniform curve (8 sun-elevation knots x 4 altitude rows), built in
  // atmolut.js — NEVER a camera-metered proxy. A texture LUT here proved
  // per-pixel unstable on SwiftShader under draw-call pressure (round-2 dash
  // defect); knot curves in uniforms are the same discipline as uAmb/octVal.
  uniform vec3 uMsK[32];
  // eclipse & transit machinery (Phase 1): companions as sun-disc occluders
  uniform int   uNumOcc;
  uniform vec3  uOccPos[3];   // body-fixed meters
  uniform float uOccR[3];     // occluder radius (m)
  uniform vec3  uOccAnn[3];   // refracted-annulus tint (copper); zero if airless
  // metre-scale shadows (Phase 1, §10: shadow maps scoped to m-km, camera-local
  // presentation aid — the world stays pure). Render-space (camera-relative).
  uniform mat4  uShadowMat;
  uniform sampler2D uShadowMap;
  uniform float uShadowOn;
  uniform float uShadowTexel;  // world meters per shadow texel (normal offset)

  float localShadow(vec3 pw, vec3 n){
    if (uShadowOn < 0.5) return 1.0;
    // normal-offset sampling: grazing sun + finite texels self-shadow into
    // acne speckle without it (round-2 probe). (Round 9 tried a slope-scaled
    // bias here for grazing acne, but it posterized the low-res map into a
    // blocky black/white band at macro/near range on BOTH Luna and Rubra
    // (round-9 panel) — and it was not the fix for the leopard carpet (that is
    // direct-term meso-facet self-shadow, addressed by the airless fill), so it
    // was reverted. A smooth-kernel / footprint-matched map is round-11 work.)
    pw += n * (uShadowTexel * 2.5);
    vec4 sc = uShadowMat * vec4(pw, 1.0);
    vec3 q = sc.xyz / sc.w * 0.5 + 0.5;
    if (q.z <= 0.0 || q.z >= 1.0) return 1.0;
    float s = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(i == 1 || i == 3 ? 1.0 : -1.0, i >= 2 ? 1.0 : -1.0) * (0.75 / 1024.0);
      s += texture2D(uShadowMap, q.xy + o).r < q.z - 2.5e-4 ? 0.0 : 1.0;
    }
    // fade at the map edge so the coverage boundary never draws a line
    float edge = smoothstep(0.01, 0.08, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)));
    // round 14 (joint/shadow grazing moiré AA, §7): when a pixel's footprint
    // spans more than ~1.5 map texels, the 4-tap binary pattern is pure
    // aliasing energy — fold the term to 1 and hand the mean to the baked
    // horizon-octant field through the caller's min() (the octant field IS
    // the footprint-matched shadow). fwidth is fragment-only: the stars
    // VERTEX shader splices this COMMON too, so the fold is guarded.
    #ifndef VERT_STAGE
      float ftex = length(fwidth(q.xy)) * 1024.0;
      edge *= 1.0 - smoothstep(1.5, 3.0, ftex);
    #endif
    return mix(1.0, s * 0.25, edge);
  }
  // stream-in crossfade stipple (Phase M): interleaved gradient noise on the
  // PIXEL grid. Screen-anchored on purpose — a fading child and its co-drawn
  // parent evaluate the SAME value at the same pixel, so "child keeps h < f,
  // parent keeps h >= f" is an exact partition: no double-draw, no z-fight,
  // no alpha sort. (A world-anchored hash cannot guarantee the partition:
  // parent and child carry different 4096 m snap origins.)
  float ignoise(vec2 px){
    return fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
  }
  // sky-ambient curve: irradiance vs the SAMPLE's sin(sun elevation) — 8 knots
  // evaluated per frame from the same JS integral. Replaces the v0 camera-metered
  // global (which painted daytime ambient onto the night side: view-dependent
  // lighting, the terminator-split defect). Knots at sinEl =
  // -0.35 -0.18 -0.08 0.0 0.08 0.25 0.55 1.0 (dense near the terminator).
  uniform vec3  uAmb[8];
  // per-body BRDF params (recipe data — Phase 1b):
  //   uBrdfA = (regolithW, surgeHs, surgeB0, iceSSS)
  //   uBrdfB = (iceSpec, iceRough, rockSpec, rockRough)
  uniform vec4  uBrdfA, uBrdfB;
  uniform float uTimeS;       // world time mod 4096 s (time-field looks, grain)
  // planetshine (§10 night-side pack): the dominant companion's disc radiance
  uniform vec3  uShineDir, uShineRad;
  uniform int   uMode;        // 0 lit 1 albedo 2 normals 3 height 4 slope 5 ao 6 lod 7 shadow
  // radians per pixel (per pass: FOV/viewport aware) — promoted to COMMON in
  // round 15: the cloud deck integrator's footprint-matched LOD needs it in
  // every splice, including the stars VERTEX shader
  uniform float uPixAng;

  // MS row evaluators: fixed-base variants (no dynamic uniform-array indexing —
  // the octVal landmine). Knots at the same sinEl positions as skyAmbAt.
  #define MS_ROW(NAME, R) \
    vec3 NAME(float s){ \
      return s < 0.0 \
        ? (s < -0.18 ? mix(uMsK[R], uMsK[R+1], clamp((s + 0.35) / 0.17, 0.0, 1.0)) \
           : s < -0.08 ? mix(uMsK[R+1], uMsK[R+2], (s + 0.18) / 0.10) \
           : mix(uMsK[R+2], uMsK[R+3], (s + 0.08) / 0.08)) \
        : (s < 0.08 ? mix(uMsK[R+3], uMsK[R+4], s / 0.08) \
           : s < 0.25 ? mix(uMsK[R+4], uMsK[R+5], (s - 0.08) / 0.17) \
           : s < 0.55 ? mix(uMsK[R+5], uMsK[R+6], (s - 0.25) / 0.30) \
           : mix(uMsK[R+6], uMsK[R+7], clamp((s - 0.55) / 0.45, 0.0, 1.0))); \
    }
  MS_ROW(msRow0, 0)
  MS_ROW(msRow1, 8)
  MS_ROW(msRow2, 16)
  MS_ROW(msRow3, 24)
  // v = sqrt(h/top); rows sit at v = 0.125, 0.375, 0.625, 0.875
  vec3 msAt(float s, float v){
    float f = clamp((v - 0.125) * 4.0, 0.0, 2.9999);
    vec3 lo, hi;
    if (f < 1.0)      { lo = msRow0(s); hi = msRow1(s); }
    else if (f < 2.0) { lo = msRow1(s); hi = msRow2(s); }
    else              { lo = msRow2(s); hi = msRow3(s); }
    return mix(lo, hi, fract(f));
  }

  vec3 skyAmbAt(float s){
    return s < 0.0
      ? (s < -0.18 ? mix(uAmb[0], uAmb[1], clamp((s + 0.35) / 0.17, 0.0, 1.0))
         : s < -0.08 ? mix(uAmb[1], uAmb[2], (s + 0.18) / 0.10)
         : mix(uAmb[2], uAmb[3], (s + 0.08) / 0.08))
      : (s < 0.08 ? mix(uAmb[3], uAmb[4], s / 0.08)
         : s < 0.25 ? mix(uAmb[4], uAmb[5], (s - 0.08) / 0.17)
         : s < 0.55 ? mix(uAmb[5], uAmb[6], (s - 0.25) / 0.30)
         : mix(uAmb[6], uAmb[7], clamp((s - 0.55) / 0.45, 0.0, 1.0)));
  }

  // horizon octant lookup by continuous index k in [0,8) (no dynamic array
  // indexing, no out params — the ANGLE landmines). Shared by terrain AND the
  // rock pass: everything standing on a tile reads the same baked shadows.
  float octVal(vec4 a, vec4 b, float k){
    k = mod(k, 8.0);
    return k < 3.5 ? (k < 1.5 ? (k < 0.5 ? a.x : a.y) : (k < 2.5 ? a.z : a.w))
                   : (k < 5.5 ? (k < 4.5 ? b.x : b.y) : (k < 6.5 ? b.z : b.w));
  }

  // Lommel-Seeliger diffuse kernel with a Hapke-lite shadow-hiding opposition
  // surge, blended toward Lambert by regolithW (recipe). mu0/mu are n·L and n·V,
  // phg the phase angle. Normalized so full-face (mu0=mu=1) matches Lambert.
  float brdfDiffuse(float mu0, float mu, float phg){
    // Hapke shadow-hiding profile B(phg) in [0,1] (1 at exact opposition)
    float B = 1.0 / (1.0 + tan(max(phg, 1e-4) * 0.5) / max(uBrdfA.y, 1e-4));
    // opposition surge with a filmic shoulder (round 9): the raw 1 + B0·B peaks
    // at 1+B0 (2x for full-surge regolith) and drove near-opposition / high-sun
    // regolith past clip on airless bodies — the round-8 panel's Luna-macro
    // "featureless white" that blocked all ground-law judgement. The saturating
    // form caps the boost so sunlit regolith lands below 1.0, while keeping the
    // surge monotone in phase and still peaked at opposition (full-Moon flatness
    // survives). uBrdfA.z is B0, uBrdfA.y the shadow-hiding angular width.
    float surge = 1.0 + uBrdfA.z * B / (1.0 + 0.5 * uBrdfA.z * B);
    float ls = mu0 * 2.0 / max(mu0 + mu, 0.02);
    return mix(mu0, ls * surge, uBrdfA.x);
  }

  // microfacet lobe (GGX + Smith, Fresnel folded into the caller's weight)
  float ggxSpec(vec3 n, vec3 v, vec3 l, float rough){
    vec3 h = normalize(v + l);
    float a = max(rough * rough, 1e-3);
    float a2 = a * a;
    float nh = max(dot(n, h), 0.0);
    float D = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
    float nl = max(dot(n, l), 0.0), nv = max(dot(n, v), 0.05);
    float k = a * 0.5;
    float G = (nl / (nl * (1.0 - k) + k)) * (nv / (nv * (1.0 - k) + k));
    return D * G * nl / max(4.0 * nv, 0.1);
  }

  // -- camera / tonemap (CONCEPT §10: exposure belongs to the camera) --
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
  vec3 lin2srgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }

  // -- geometry --
  vec2 raySphere(vec3 ro, vec3 rd, float r){
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r*r;
    float d = b*b - c;
    if (d < 0.0) return vec2(1e18, -1e18);
    float s = sqrt(d);
    return vec2(-b - s, -b + s);
  }

  // -- round 17, §11 figure generality: the recipe's reference shape, GLSL twin
  //    of figure.js. FIG_MODE is a COMPILE-TIME define (materials are rebuilt
  //    per body), so mode 0 emits literally the legacy expressions — zero new
  //    runtime branches in any legacy program (the byte-identity gate). Figure
  //    bodies are airless/dry this round (assertFigureRecipe), so only the
  //    airless paths below ever compile with FIG_MODE != 0. --
  #ifndef FIG_MODE
  #define FIG_MODE 0
  #endif
  #if FIG_MODE == 1
  uniform vec3 uFigAxes;
  #endif
  #if FIG_MODE == 2
  uniform vec3 uLobeC0; uniform vec3 uLobeA0;
  uniform vec3 uLobeC1; uniform vec3 uLobeA1;
  uniform float uNeckK;
  float lobeS(vec3 p, vec3 c, vec3 ax){
    vec3 u = (p - c) / ax;
    float F = dot(u, u) - 1.0;
    vec3 g = 2.0 * (p - c) / (ax * ax);
    return F / max(length(g), 1e-12);
  }
  #endif
  // signed level value: sign-exact everywhere; first-order altitude near the
  // surface (the CPU's figAlt normalization is not needed for the gates below)
  float figS(vec3 p){
  #if FIG_MODE == 0
    return length(p) - uPlanetR;
  #elif FIG_MODE == 1
    vec3 u = p / uFigAxes;
    float F = dot(u, u) - 1.0;
    vec3 g = 2.0 * p / (uFigAxes * uFigAxes);
    return F / max(length(g), 1e-12);
  #else
    float a = lobeS(p, uLobeC0, uLobeA0);
    float b = lobeS(p, uLobeC1, uLobeA1);
    float h = max(uNeckK - abs(a - b), 0.0) / uNeckK;
    return min(a, b) - h * h * uNeckK * 0.25;
  #endif
  }
  // the local vertical: unit gradient of the level set (radial on a sphere)
  vec3 figUpDir(vec3 p){
  #if FIG_MODE == 0
    return normalize(p);
  #elif FIG_MODE == 1
    return normalize(p / (uFigAxes * uFigAxes));
  #else
    // CENTRAL-DIFFERENCE of figS — the same construction the CPU figGrad uses,
    // so the fragment vertical EQUALS the baked m̂ (the post-impl panel
    // measured the raw-gradient mix 21° off at the neck, and even the analytic
    // unit-gradient smin blend keeps ~7° inside the bridge where the per-lobe
    // gradients are not unit). Six extra figS evals, mode-2 fragments only.
    float e = uNeckK * 2.5e-4;
    vec3 g = vec3(
      figS(p + vec3(e, 0.0, 0.0)) - figS(p - vec3(e, 0.0, 0.0)),
      figS(p + vec3(0.0, e, 0.0)) - figS(p - vec3(0.0, e, 0.0)),
      figS(p + vec3(0.0, 0.0, e)) - figS(p - vec3(0.0, 0.0, e)));
    return normalize(g);
  #endif
  }
  #if FIG_MODE != 0
  // near root of the ray/figure hit (sunken by k), <0 = miss. Full quadratic —
  // the scaled direction is NOT unit (panel: the reduced raySphere form is
  // wrong by up to the axis ratio when reused affinely).
  float rayEllNear(vec3 ro, vec3 rd, vec3 c, vec3 ax){
    vec3 o = (ro - c) / ax;
    vec3 d = rd / ax;
    float A = dot(d, d);
    float B = dot(o, d);
    float C = dot(o, o) - 1.0;
    float disc = B * B - A * C;
    if (disc < 0.0) return -1.0;
    return (-B - sqrt(disc)) / A;
  }
  float figRayHit(vec3 ro, vec3 rd){
  #if FIG_MODE == 1
    return rayEllNear(ro, rd, vec3(0.0), uFigAxes * 0.9995);
  #else
    float t0 = rayEllNear(ro, rd, uLobeC0, uLobeA0 * 0.9995);
    float t1 = rayEllNear(ro, rd, uLobeC1, uLobeA1 * 0.9995);
    return (t0 > 0.0 && t1 > 0.0) ? min(t0, t1) : max(t0, t1);
  #endif
  }
  #endif

  // -- closed-form optical depth (Chapman function, Schueler's approximation):
  //    meters of datum-density path for scale height H from radius r along a ray
  //    with cos(zenith) = cosChi. Replaces the 4-step sun-OD march (more accurate,
  //    no loop). JS twin: atmolut.js chapmanOD — keep identical. --
  float chapmanOD(float H, float r, float cosChi){
    float X = uPlanetR / H;
    float h = max(r - uPlanetR, 0.0) / H;
    float c = sqrt(1.5707963 * (X + h));
    float up = c / ((c - 1.0) * abs(cosChi) + 1.0) * exp(-h);
    if (cosChi >= 0.0) return H * up;
    float sinChi = sqrt(max(1.0 - cosChi * cosChi, 0.0));
    float xt = (X + h) * sinChi;
    float ht = max(xt - X, -30.0);
    float c0 = sqrt(1.5707963 * max(xt, 1e-3));
    return H * (2.0 * exp(-ht) * c0 - up);
  }

  // slant-path multiplier for the ozone shell: vertical column x the secant of
  // the crossing angle at shell height, capped at the grazing chord. Analytic —
  // the sun path has no march to fold a tent profile into (JS twin: atmolut.js).
  float ozoneSec(float r, float cosChi){
    if (uOzW <= 0.0) return 0.0;
    float Rs = uPlanetR + uOzH;
    float st = r * sqrt(max(1.0 - cosChi * cosChi, 0.0));  // tangent radius
    if (r >= Rs && (cosChi >= 0.0 || st >= Rs)) return 0.0;
    float sec = min(Rs / sqrt(max(Rs * Rs - st * st, 1.0)), 30.0);
    return (r < Rs ? 1.0 : 2.0) * sec;
  }

  // visible fraction of the sun disc (angular radius rs) behind an occluder disc
  // (radius ro) at angular separation d — the analytic lens overlap. Smooth in d:
  // this IS the penumbra profile, no ad-hoc softening.
  float discVis(float d, float rs, float ro){
    if (d >= rs + ro) return 1.0;
    if (d + min(rs, ro) <= max(rs, ro)) return ro >= rs ? 0.0 : 1.0 - (ro * ro) / (rs * rs);
    float d2 = d * d, rs2 = rs * rs, ro2 = ro * ro;
    float a1 = acos(clamp((d2 + rs2 - ro2) / (2.0 * d * rs), -1.0, 1.0));
    float a2 = acos(clamp((d2 + ro2 - rs2) / (2.0 * d * ro), -1.0, 1.0));
    float root = sqrt(max((-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro), 0.0));
    float lens = rs2 * a1 + ro2 * a2 - 0.5 * root;
    return clamp(1.0 - lens / (PI * rs2), 0.0, 1.0);
  }

  // -- transmittance toward the sun from a planet-centered point. One function,
  //    every consumer: terrain, ocean, rocks, and each step of the integral —
  //    so transit shadows darken the ground AND the air column (§8/§10). --
  vec3 sunTransmit(vec3 p){
    // soft planet-limb shadow (finite-disc penumbra stand-in for the self-limb)
    float b = dot(-p, uSunDir);
    float soft = 1.0;
  #if FIG_MODE == 0
    if (b > 0.0) {
      float per = length(p + uSunDir * b) - uPlanetR;
      soft = smoothstep(-uPlanetR * 0.002, uPlanetR * 0.006, per);
    }
  #elif FIG_MODE == 1
    // closest approach solved in axis-scaled space (exact for the ellipsoid —
    // the sphere's b lands off-surface by up to the axis ratio; panel)
    {
      vec3 ps = p / uFigAxes;
      vec3 ds = uSunDir / uFigAxes;
      float bs = -dot(ps, ds) / dot(ds, ds);
      if (bs > 0.0) {
        float per = figS(p + uSunDir * bs);
        soft = smoothstep(-uPlanetR * 0.002, uPlanetR * 0.006, per);
      }
    }
  #else
    // lobes: MUTUAL LOBE SHADOWING falls out of the one occlusion slot (§10) —
    // a fixed 8-tap min-S march along the sun ray. The march starts strictly
    // PAST the local surface (t0 ≥ neckK·0.75 ≫ the asserted relief budget) so
    // a daylit point never self-shadows on its own figS=0 (panel KILLER); only
    // the far limb / the OTHER lobe can drive min-S negative.
    if (b > 0.0) {
      float t0 = uNeckK * 0.75;
      // the occluder must lie within the BODY's span — an unbounded 2·b march
      // stretched both the taps and the penumbra with camera distance
      // (post-impl panel: position-varying, unphysically wide shadows)
      float span = length(uLobeC1 - uLobeC0) + uLobeA0.x + uLobeA1.x;
      float tEx = min(2.0 * b + uNeckK, span * 2.0);
      if (tEx > t0) {
        float mS = 1.0e9;
        for (int i = 0; i < 8; i++) {
          float t = t0 + (tEx - t0) * (float(i) + 0.5) * 0.125;
          mS = min(mS, figS(p + uSunDir * t));
        }
        // penumbra: a fixed physical width (~neckK/7) with a tap-spacing
        // floor so the 8-tap march never binarizes into speckle (first light)
        float pw = max(uNeckK * 0.15, (tEx - t0) * 0.09);
        soft = smoothstep(-0.5 * pw, pw, mS);
      }
    }
  #endif
    // eclipse machinery (Phase 1): analytic sun x occluder overlap + copper annulus
    float vis = 1.0;
    vec3 ann = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      if (i >= uNumOcc) break;
      vec3 dO = uOccPos[i] - p;
      float dl = max(length(dO), 1.0);
      float co = dot(dO, uSunDir) / dl;
      if (co <= 0.0) continue;                      // occluder behind the sun ray
      float ro = asin(clamp(uOccR[i] / dl, 0.0, 1.0));
      float d = acos(clamp(co, -1.0, 1.0));
      float v = discVis(d, uSunAngR, ro);
      vis = min(vis, v);
      // refracted-annulus source: the occluder's atmosphere bends a ring of
      // reddened sunlight into the umbra (tint is recipe physics, atmolut.js)
      ann += uOccAnn[i] * (1.0 - v) * (1.0 - smoothstep(ro * 0.6, ro * 1.8, d));
    }
    float g = soft * vis;
    if (uHasAtm < 0.5) return vec3(g) + ann;
    float r = max(length(p), 1.0);
    float cosChi = dot(p, uSunDir) / r;
    float odR = chapmanOD(uHr, r, cosChi);
    float odM = chapmanOD(uHm, r, cosChi);
    vec3 od = uBetaR * odR + (uBetaM + uBetaA) * odM
            + uBetaO3 * (uOzW * ozoneSec(r, cosChi));
    vec3 T = exp(-min(od, vec3(80.0)));
    return (vec3(g) + ann) * T;
  }

  // -- THE scattering integral is spliced inline below (see scatterInline):
  //    ANGLE/SwiftShader silently mis-compiles GLSL functions with out-vec3
  //    parameters to zeros (verified by bisection), so no out-param functions. --
  #ifndef ATM_STEPS
  #define ATM_STEPS 14
  #endif
  // cloud deck march taps ride the same compile-time budget knob
  #if ATM_STEPS < 10
  #define CLOUD_STEPS 6
  #else
  #define CLOUD_STEPS 10
  #endif

  // -- deterministic detail noise (CONCEPT §7): periodic lattice so the 4096 m
  //    double-precision snap rebase is seamless; scales must be 4096/2^k --
  float vhash(ivec3 p, int s){
    uint h = uint(p.x) * 0x27d4eb2du ^ uint(p.y) * 0x165667b1u
           ^ uint(p.z) * 0x9e3779b1u ^ uint(s)  * 0x85ebca6bu;
    h = (h ^ (h >> 15)) * 0x85ebca6bu;
    h = (h ^ (h >> 13)) * 0xc2b2ae35u;
    return float(h ^ (h >> 16)) * (1.0 / 4294967296.0);
  }
  float vnoise(vec3 p, int period, int seed){
    ivec3 ip = ivec3(floor(p));
    vec3 f = fract(p);
    vec3 u = f*f*f*(f*(f*6.0-15.0)+10.0);
    ivec3 M = ivec3(period - 1);
    float c000 = vhash((ip + ivec3(0,0,0)) & M, seed), c100 = vhash((ip + ivec3(1,0,0)) & M, seed);
    float c010 = vhash((ip + ivec3(0,1,0)) & M, seed), c110 = vhash((ip + ivec3(1,1,0)) & M, seed);
    float c001 = vhash((ip + ivec3(0,0,1)) & M, seed), c101 = vhash((ip + ivec3(1,0,1)) & M, seed);
    float c011 = vhash((ip + ivec3(0,1,1)) & M, seed), c111 = vhash((ip + ivec3(1,1,1)) & M, seed);
    float x00 = mix(c000, c100, u.x), x10 = mix(c010, c110, u.x);
    float x01 = mix(c001, c101, u.x), x11 = mix(c011, c111, u.x);
    return 2.0 * mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z) - 1.0;
  }
  // -- NON-periodic value noise (round 13): the UN-wrapped twin of vnoise —
  //    calls vhash on the raw sign-correct lattice, reproducing mathx.noise3
  //    bit-for-bit (integer hash exact; f32 trilerp negligible at the low fold
  //    frequencies used here). Unlocks the in-shader strata fold + temp wobble
  //    so G2 strata-in-plan registers to the baked ledges and the Whittaker
  //    biome temperature matches procContext's closed form (§5). --
  float noise3(vec3 p, int seed){
    ivec3 ip = ivec3(floor(p));
    vec3 f = fract(p);
    vec3 u = f*f*f*(f*(f*6.0-15.0)+10.0);
    float c000 = vhash(ip + ivec3(0,0,0), seed), c100 = vhash(ip + ivec3(1,0,0), seed);
    float c010 = vhash(ip + ivec3(0,1,0), seed), c110 = vhash(ip + ivec3(1,1,0), seed);
    float c001 = vhash(ip + ivec3(0,0,1), seed), c101 = vhash(ip + ivec3(1,0,1), seed);
    float c011 = vhash(ip + ivec3(0,1,1), seed), c111 = vhash(ip + ivec3(1,1,1), seed);
    float x00 = mix(c000, c100, u.x), x10 = mix(c010, c110, u.x);
    float x01 = mix(c001, c101, u.x), x11 = mix(c011, c111, u.x);
    return 2.0 * mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z) - 1.0;
  }
  // fBm of noise3 — a VERBATIM port of mathx.fbm3 (3 octaves, the strata-fold
  // caller): running-sum normalization (NOT /1), octave lattice rotation
  // (+i·17.17, −i·9.3, +i·3.7, seed+i), lacunarity 2.02, gain 0.5, a0 0.5.
  float fbm3(vec3 p, int seed){
    float a = 0.5, f = 1.0, sum = 0.0, norm = 0.0;
    for (int i = 0; i < 3; i++){
      sum += a * noise3(vec3(p.x*f + float(i)*17.17, p.y*f - float(i)*9.3, p.z*f + float(i)*3.7), seed + i);
      norm += a; a *= 0.5; f *= 2.02;
    }
    return sum / norm;
  }
  // seasonal volatile cap (round 13): render-time frost weight = pure fn of
  // (position latitude, closed-form subsolar declination). sSun = uSunDir.y is
  // spin-invariant (spin ∥ +Y) ⇒ purely seasonal. winter>0 in the hemisphere
  // tilted AWAY from the sun, so the cap advances equatorward each winter and
  // retreats each summer. fp = (latOn, latFull, seasonK) in sin(lat) units.
  // ONE helper shared by the ground (TERRAIN_FRAG) and the companion disc
  // (SKY_FRAG) so §11 disc/ground agreement holds by construction.
  float seasonalFrost(float sinLat, float sSun, vec3 fp){
    float winter = -sinLat * sSun;
    return smoothstep(fp.x, fp.y, abs(sinLat) + fp.z * winter);
  }

  // ---- Phase 4 clouds core (round 15). CONCEPT §8: coverage is a FIELD (a
  // 256x128 equirect per body-slot x deck, cloudcore.js — the JS twin), volume
  // is a LOOK (the deck integrator in the scattering integral). Time is a pure
  // input: keyframes lerp by uCloudLerp (fixed interpolation), advection is a
  // closed-form drift of the SAMPLE direction about the spin axis (phase
  // computed in double on the CPU). uCloudDecks == 0 (airless Luna, or the
  // bench clouds:false lever) short-circuits everything to exact identity. ----
  uniform highp sampler2DArray uCloudMap; // R,G = cov,type at k; B,A = at k+1
  uniform int   uCloudDecks;     // OWN body deck count (0 = off)
  uniform float uCloudLerp;      // keyframe frac for the own body
  uniform float uCloudMuClamp;   // grazing-sun clamp shared by shadow AND rungs (K3)
  uniform vec4  uCloudDeckA[2];  // (baseM, thickM, sigmaK, texture layer)
  uniform vec4  uCloudDeckB[2];  // (driftPhase, detailAmp, detailFreq, ambW)
  uniform vec3  uCloudAlb[2];    // deck single-scatter albedo

  // ---- Phase 4 EMISSION pack (round 16, §8 "the recipe may add emission (aurora,
  // airglow)"; §10 night pack). Added to a SEPARATE emis accumulator inside
  // scatterInline (never inscat — the star contrast gate reads inscat: a bright
  // oval must not wink out the stars across it; panel aurora-star-gate). Drowned
  // by DAY through the camera exposure servo — no day-gate (the airglow contract). ----
  uniform vec3  uAuroraAxis;                 // magnetic dipole axis, body-fixed
  uniform vec3  uAuroraColLo, uAuroraColHi;  // green (lower) + red (upper); .g<=0 disables the band
  uniform float uAuroraLatS, uAuroraWS;      // oval sin-latitude centre + width
  uniform vec2  uAuroraH;                     // (lower, upper) shell heights above datum, m
  uniform vec2  uAuroraPhase;                 // (curtain drift offset [wraps at the vnoise period], substorm pulse [0,1])
  uniform vec3  uLightCol;                    // lightning flash radiance; zero disables
  uniform float uLightRate;                   // fraction of cells flashing per bucket
  uniform float uLightFreq;                   // convective-cell lattice frequency
  uniform vec2  uLightBucket;                 // (per-bucket seed, frac-through-bucket) — CPU, unwrapped t
  // one raster tap for deck d at world direction dir, explicit LOD only —
  // textureLod so the stars VERTEX splice and fragments agree, and so the
  // FIELD never reads screen derivatives (§5/K9: LOD comes from ray geometry;
  // the sun-shadow tap is always LOD 0 — a ground point's shade must not
  // depend on the camera).
  vec4 cloudTap(vec3 dir, int d, float lod){
    float ph = -6.2831853 * uCloudDeckB[d].x;
    float cs = cos(ph), sn = sin(ph);
    vec3 dd = vec3(cs * dir.x - sn * dir.z, dir.y, sn * dir.x + cs * dir.z);
    vec2 uv = vec2(atan(dd.z, dd.x) / 6.2831853 + 0.5,
                   asin(clamp(dd.y, -1.0, 1.0)) / 3.14159265 + 0.5);
    return textureLod(uCloudMap, vec3(uv, uCloudDeckA[d].w), lod);
  }
  float cloudCovOf(vec4 tap){ return mix(tap.r, tap.b, uCloudLerp); }
  float cloudTypeOf(vec4 tap){ return mix(tap.g, tap.a, uCloudLerp); }

  // normalized vertical profile over a deck: x = (alt-base)/thick. Mean over
  // [0,1] is EXACTLY 1 and H(x) = x²(3-2x) is its antiderivative — ONE column
  // law shared by the shadow, the march and the fold (pre-code panel F2: an
  // unnormalized bump makes the seen cloud thinner than the shadow it casts).
  float cloudH(float x){ x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
  float cloudh(float x){ x = clamp(x, 0.0, 1.0); return 6.0 * x * (1.0 - x); }

  // cloud shadow: transmittance of COVERAGE along the sun ray from
  // planet-centred p — never the rendered cloud (§8), no detail octaves. One
  // tap per deck at the mid-shell crossing: adequate because uCloudMuClamp
  // bounds the modeled slant path to ~thick/muClamp ≪ one raster texel.
  // Multiplies in the §10 occlusion slot next to sunTransmit at every
  // consumer, INCLUDING each in-scatter step — crepuscular rays for free.
  float cloudShade(vec3 p){
    if (uCloudDecks == 0) return 1.0;
    float r = length(p);
    float T = 1.0;
    for (int d = 0; d < 2; d++){
      if (d >= uCloudDecks) break;
      float base = uCloudDeckA[d].x, thick = uCloudDeckA[d].y;
      if (r >= uPlanetR + base + thick) continue;
      float Rmid = uPlanetR + base + 0.5 * thick;
      float b = dot(p, uSunDir);
      float disc = b * b - (r * r - Rmid * Rmid);
      if (disc <= 0.0) continue;
      float tH = -b + sqrt(disc);
      if (tH <= 0.0) continue;
      vec3 q = normalize(p + uSunDir * tH);
      float cov = cloudCovOf(cloudTap(q, d, 0.0));
      float mu = max(dot(q, uSunDir), uCloudMuClamp);
      float x0 = clamp((r - uPlanetR - base) / thick, 0.0, 1.0);
      T *= exp(-uCloudDeckA[d].z * cov * (1.0 - cloudH(x0)) * thick / mu);
    }
    return T;
  }

  // dual-lobe HG phase for the volume look (forward silver lining + soft
  // backscatter), normalized to integrate to 1 over the sphere. g1/w were
  // softened round-15 post-panel: the 0.72 lobe's sunward spike blew the
  // loworbit limb to structureless white under the AE.
  float cloudPhase(float mu){
    float g1 = 0.62, g2 = -0.25, w = 0.55;
    float d1 = 1.0 + g1 * g1 - 2.0 * g1 * mu;
    float d2 = 1.0 + g2 * g2 - 2.0 * g2 * mu;
    float h1 = (1.0 - g1 * g1) / (12.566371 * pow(max(d1, 1e-4), 1.5));
    float h2 = (1.0 - g2 * g2) / (12.566371 * pow(max(d2, 1e-4), 1.5));
    return w * h1 + (1.0 - w) * h2;
  }

  // overcast downlight (round-15 panel: cloud shadows saturated to pixel-hard
  // BLACK): the direct flux the shadow removed re-emerges below the deck as
  // diffuse cloud-base light — real overcast is gray, not black. Energy is
  // BOUNDED by the blocked flux ((1-csh)·mu0, one albedo-ish factor 0.12
  // for the downward half minus absorption): redistribution, never conjured.
  // Consumers add it to their ambient with the same /PI radiance convention.
  vec3 cloudFill(vec3 p, float csh){
    if (uCloudDecks == 0) return vec3(0.0);
    float mu0 = max(dot(normalize(p), uSunDir), 0.0);
    return uSunRad * ((1.0 - csh) * mu0 * 0.12);
  }

  // HDR pipeline (Phase 1 round 2, [camera] after radiance per CONCEPT §10):
  // materials output LINEAR radiance into a half-float target; exposure, bloom,
  // tonemap and grain all live in the post pass. PRE_EXP keeps the sun disc
  // under half-float max (post multiplies it back out).
  #define PRE_EXP 0.015625
  vec3 cameraOut(vec3 radiance){
    return radiance * PRE_EXP;
  }

  #ifndef VERT_STAGE
  // screen-derivative bump: perturb n by the gradient of height field h (Schueler)
  // (fragment-only: dFdx/dFdy do not exist in vertex shaders)
  vec3 bumpNormal(vec3 n, vec3 pos, float h, float scale){
    vec3 dpx = dFdx(pos), dpy = dFdy(pos);
    float dhx = dFdx(h), dhy = dFdy(h);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    if (abs(det) < 1e-12) return n;
    return normalize(n - scale * (r1 * dhx + r2 * dhy) / det);
  }
  #endif
`;

// THE scattering integral (single scattering, Rayleigh + Mie), spliced inline into
// every consumer with caller-chosen variable names — one source of truth (§8), no
// out-param GLSL functions (driver bug, see COMMON). Declares `trans` and `inscat`.
const scatterInline = (ro, rd, tmax, trans, inscat, emis) => /* glsl */ `
    vec3 ${trans} = vec3(1.0);
    vec3 ${inscat} = vec3(0.0);
    ${emis ? `vec3 ${emis} = vec3(0.0);` : ''}
    {
      vec2 _sh = raySphere(${ro}, ${rd}, uPlanetR + uAtmTop);
      float _t0 = max(_sh.x, 0.0), _t1 = min(_sh.y, ${tmax});
      // ---- Phase 4 cloud decks (round 15): a participating shell INSIDE the
      // one integral, so every material that marches air marches cloud — no
      // compositing seam, and the star splice's extinction occludes stars.
      // ONE estimator, no rung thresholds: CLOUD_STEPS taps over the first
      // ≤8 deck-thicknesses of the crossing, then the remainder and the far
      // limb re-entry each fold as 3 taps at footprint-matched LOD — distance
      // changes the quadrature and the tap LOD (§7 fold), never the integrand
      // (cov·h·detail with h EXACTLY mean-1 and detail EXACTLY mean-1). ----
      float _dkTr0 = 1.0, _dkTr1 = 1.0;
      vec3 _dkS0 = vec3(0.0), _dkS1 = vec3(0.0);
      float _dkMid0 = 1.0e12, _dkMid1 = 1.0e12;
      if (uHasAtm > 0.5 && _t1 > _t0 && uCloudDecks > 0) {
        float _cph = cloudPhase(dot(${rd}, uSunDir));
        for (int _d = 0; _d < 2; _d++) {
          if (_d >= uCloudDecks) break;
          float _base = uCloudDeckA[_d].x, _thk = uCloudDeckA[_d].y, _sigK = uCloudDeckA[_d].z;
          vec2 _so = raySphere(${ro}, ${rd}, uPlanetR + _base + _thk);
          float _s0 = max(_so.x, 0.0), _s1 = min(_so.y, _t1);
          if (_s1 <= _s0) continue;
          vec2 _si = raySphere(${ro}, ${rd}, uPlanetR + _base);
          float _r0 = 0.0, _r1 = -1.0;
          if (_si.y > _si.x && _si.y > 0.0) {
            if (_si.x > 0.0) { _r0 = max(_si.y, 0.0); _r1 = _s1; _s1 = min(_s1, _si.x); }
            else { _s0 = max(_si.y, 0.0); }
          }
          if (_s1 <= _s0 && _r1 <= _r0) continue;
          float _M = min(_s1 - _s0, 8.0 * _thk);
          // occlusion midpoint anchors to whichever segment carries the deck's
          // optical depth: when the NEAR slab is pinched empty and the FAR split
          // (_r0.._r1) holds the material (grazing rays inside a high/thick deck —
          // Venus's 48-70 km slab from alt∈[48,70) km), use _r0 so the deck doesn't
          // occlude near-camera air in FRONT of it (panel venus-deck-breakout).
          // _r1<=_r0 (no far split — every Tellus/Rubra pose) keeps the old value.
          // gate the far-anchor override on the NEAR slab actually being pinched
          // empty (post-panel: the far-split-exists test alone fires on ordinary
          // Tellus/Rubra limb rays too, not just Venus's inside-deck case — that
          // broke limb byte-identity). Now byte-identical for every non-pinched pose.
          float _dkMidD = (_s1 - _s0 < 1.0 && _r1 > _r0) ? _r0 : _s0 + 0.5 * _M;
          _dkMid0 = _d == 0 ? _dkMidD : _dkMid0;
          _dkMid1 = _d == 1 ? _dkMidD : _dkMid1;
          float _Td = 1.0; vec3 _Sd = vec3(0.0);
          float _dsd = _M / float(CLOUD_STEPS);
          if (_s1 > _s0) for (int _i = 0; _i < CLOUD_STEPS; _i++) {
            float _tc = _s0 + _M * ((float(_i) + 0.5) / float(CLOUD_STEPS));
            vec3 _pp = ${ro} + ${rd} * _tc;
            float _rr = length(_pp);
            vec3 _pd = _pp / _rr;
            float _x = clamp((_rr - uPlanetR - _base) / _thk, 0.0, 1.0);
            // footprint-matched LOD from RAY GEOMETRY only (§5/K9): the pixel
            // chord at range projected onto the SHELL — divided by the ray's
            // obliquity to the radial (round-15 panel headline: at grazing
            // orbital incidence the surface footprint stretches ~4x and the
            // detail octave sampled sub-Nyquist rendered as per-pixel static)
            float _ob = max(abs(dot(${rd}, _pd)), 0.2);
            float _fa = uPixAng * _tc / (_rr * _ob);
            float _lod = clamp(log2(max(_fa * 81.487, 1.0)), 0.0, 6.0);
            vec4 _tp = cloudTap(_pd, _d, _lod);
            float _cov = cloudCovOf(_tp);
            if (_cov > 0.002) {
              float _det = 1.0;
              float _covE = _cov;
              #ifndef VERT_STAGE
              // sub-raster detail look (§7): mean-1 (detailAmp <= 1, fbm3 in
              // [-1,1] — no clamp), type-shaped, FOLDED to its mean on ITS
              // OWN wavelength: the obliquity-true footprint vs the base
              // wavelength, saturating BY a quarter wavelength (Nyquist with
              // margin — the 0.5 onset left a sub-Nyquist static window at
              // grazing orbit). Skipped in the star vertex splice.
              float _wlB = _rr / max(uCloudDeckB[_d].z, 1.0);
              float _dw = uCloudDeckB[_d].y * (0.35 + 0.65 * cloudTypeOf(_tp))
                        * (1.0 - smoothstep(0.08 * _wlB, 0.25 * _wlB, _fa * _rr));
              if (_dw > 0.003) {
                float _phd = -6.2831853 * uCloudDeckB[_d].x;
                vec3 _ddir = vec3(cos(_phd) * _pd.x - sin(_phd) * _pd.z, _pd.y,
                                  sin(_phd) * _pd.x + cos(_phd) * _pd.z);
                _det = 1.0 + _dw * fbm3(_ddir * uCloudDeckB[_d].z + vec3(0.0, _x * 2.31, 0.0), 4243);
                // edge fractalization (nadir witness: a near-binary field's
                // coverage boundary reads as a 78-km texel STAIRCASE):
                // re-threshold the stored bimodal cov with the SAME detail
                // noise as a symmetric window offset — interiors (0/1)
                // untouched, boundaries carve at detail scale, mean-neutral
                // to first order (monotone remap, zero-mean noise). The
                // SHADOW and the JS twins keep the raw coverage law — this
                // is the volume look's own edge, never the field.
                float _fb = clamp((_det - 1.0) / max(_dw, 1e-3), -1.0, 1.0);
                _covE = smoothstep(0.35 + 0.3 * _fb, 0.65 + 0.3 * _fb, _cov);
              }
              #endif
              float _od = _sigK * _covE * cloudh(_x) * _det * _dsd;
              // per-tap sun term: the shared coverage shadow law from inside
              // the deck (cloudShade — deck-on-deck + mean column), CORRECTED
              // by the local detail so the within-deck self-shadow is
              // exp(-od·det): thin columns glow, thick ones core-shadow. The
              // GROUND shade stays coverage-only (CONCEPT §8 "never the
              // rendered cloud") — this is the volume LOOK's own light.
              float _mus = max(dot(_pd, uSunDir), uCloudMuClamp);
              vec3 _sun = sunTransmit(_pp) * cloudShade(_pp)
                        * exp(-(_det - 1.0) * _sigK * _cov * (1.0 - cloudH(_x)) * _thk / _mus);
              // dual-lobe HG carries the silver lining; the mu0-shaped
              // quasi-Lambert term is the multiple-scatter reflectance a
              // single-scatter phase cannot give (clouds are white because of
              // MS): 0.22 ~ albedo 0.7/pi, calibrated against sunlit ground
              float _ph = _cph + 0.22 * max(dot(_pd, uSunDir), 0.0);
              vec3 _src = uCloudAlb[_d] * (uSunRad * _sun * _ph
                          + skyAmbAt(dot(_pd, uSunDir)) * uCloudDeckB[_d].w
                          + uShineRad * 0.08);
              _Sd += _Td * (1.0 - exp(-_od)) * _src;
              _Td *= exp(-_od);
            }
            if (_Td < 0.02) break;
          }
          // remainder (taps 0-2) + far limb re-entry (taps 3-5): the same
          // estimator at 3-tap quadrature, LOD floored at the tap spacing —
          // the Jensen-correct fold (mean of exp over taps, never exp of a
          // single midpoint sample on a long varying-coverage path)
          float _R0 = _s0 + _M;
          for (int _i = 0; _i < 6; _i++) {
            if (_Td < 0.02) break;
            float _a = _i < 3 ? _R0 : _r0;
            float _b = _i < 3 ? _s1 : _r1;
            if (_b <= _a + 1.0) continue;
            float _dr = (_b - _a) / 3.0;
            float _tc = _a + _dr * (float(_i < 3 ? _i : _i - 3) + 0.5);
            vec3 _pp = ${ro} + ${rd} * _tc;
            float _rr = length(_pp);
            vec3 _pd = _pp / _rr;
            float _x = clamp((_rr - uPlanetR - _base) / _thk, 0.0, 1.0);
            float _ob2 = max(abs(dot(${rd}, _pd)), 0.2);
            float _fa = max(uPixAng * _tc / _ob2, 0.5 * _dr) / _rr;
            float _lod = clamp(log2(max(_fa * 81.487, 1.0)), 0.0, 6.0);
            float _cov = cloudCovOf(cloudTap(_pd, _d, _lod));
            if (_cov > 0.002) {
              float _od = _sigK * _cov * cloudh(_x) * _dr;
              vec3 _sun = sunTransmit(_pp) * cloudShade(_pp);
              float _ph = _cph + 0.22 * max(dot(_pd, uSunDir), 0.0);
              vec3 _src = uCloudAlb[_d] * (uSunRad * _sun * _ph
                          + skyAmbAt(dot(_pd, uSunDir)) * uCloudDeckB[_d].w
                          + uShineRad * 0.08);
              _Sd += _Td * (1.0 - exp(-_od)) * _src;
              _Td *= exp(-_od);
            }
          }
          _dkTr0 = _d == 0 ? _Td : _dkTr0;
          _dkTr1 = _d == 1 ? _Td : _dkTr1;
          _dkS0 = _d == 0 ? _Sd : _dkS0;
          _dkS1 = _d == 1 ? _Sd : _dkS1;
        }
      }
      vec3 _TvDk0 = vec3(-1.0), _TvDk1 = vec3(-1.0);
      if (uHasAtm > 0.5 && _t1 > _t0) {
        // perigee-clustered quadrature: uniform steps undersample the exponential
        // density on long grazing rays (concentric twilight arcs at low ATM_STEPS)
        // — cluster samples quadratically toward the ray's closest approach to the
        // planet, where the mass is. Deterministic; no jitter noise.
        float _tp = clamp(-dot(${ro}, ${rd}), _t0, _t1);
        float _sp = clamp((_tp - _t0) / max(_t1 - _t0, 1e-6), 0.0, 1.0);
        float _tPrev = _t0;
        float _odR = 0.0, _odM = 0.0, _odO = 0.0;
        float _csh = 1.0;
        vec3 _sumR = vec3(0.0), _sumM = vec3(0.0), _sumMS = vec3(0.0);
        for (int _i = 0; _i < ATM_STEPS; _i++) {
          float _u = (float(_i) + 1.0) / float(ATM_STEPS);
          float _tCur;
          if (_u < _sp && _sp > 1e-4) { float _w = 1.0 - _u / _sp; _tCur = _tp + (_t0 - _tp) * _w * _w; }
          else if (_sp < 0.9999) { float _v = (_u - _sp) / (1.0 - _sp); _tCur = _tp + (_t1 - _tp) * _v * _v; }
          else _tCur = _t1;
          float _dsi = _tCur - _tPrev;
          float _tm = 0.5 * (_tCur + _tPrev);
          vec3 _p = ${ro} + ${rd} * _tm;
          _tPrev = _tCur;
          float _h = max(length(_p) - uPlanetR, 0.0);
          float _dR = exp(-_h / uHr) * _dsi, _dM = exp(-_h / uHm) * _dsi;
          _odR += _dR; _odM += _dM;
          if (uOzW > 0.0) _odO += max(0.0, 1.0 - abs(_h - uOzH) / uOzW) * _dsi;
          vec3 _Tv = exp(-(uBetaR * _odR + (uBetaM + uBetaA) * _odM + uBetaO3 * _odO));
          // cloud shadow on the air column (crepuscular structure): the same
          // coverage-along-the-sun-ray factor every surface uses, at stride 2
          // (hold-and-reuse — panel H2: the per-step tax is the real bill)
          if ((_i & 1) == 0) _csh = cloudShade(_p);
          vec3 _Ts = sunTransmit(_p) * _csh;
          // in-scatter born BEHIND a deck is extinguished by it; capture the
          // air transmittance AT each deck for the deck's own scatter term
          float _dkA = (_tm > _dkMid0 ? _dkTr0 : 1.0) * (_tm > _dkMid1 ? _dkTr1 : 1.0);
          if (_TvDk0.r < 0.0 && _tm > _dkMid0) _TvDk0 = _Tv;
          if (_TvDk1.r < 0.0 && _tm > _dkMid1) _TvDk1 = _Tv;
          _sumR += _dR * _Tv * _Ts * _dkA;
          _sumM += _dM * _Tv * _Ts * _dkA;
          // multiple scattering done right (Phase 1): Psi(mu_s, h) from the
          // per-recipe Hillaire knot curve — keyed on the SAMPLE's sun
          // geometry, never the camera. Isotropic: no phase term, Psi carries it.
          float _mus = dot(normalize(_p), uSunDir);
          vec3 _psi = msAt(_mus, sqrt(clamp(_h / uAtmTop, 0.0, 1.0)));
          _sumMS += _psi * (uBetaR * _dR + uBetaM * _dM) * _Tv * _dkA;
        }
        ${trans} = exp(-(uBetaR * _odR + (uBetaM + uBetaA) * _odM + uBetaO3 * _odO));
        float _mu = dot(${rd}, uSunDir);
        float _phR = 3.0 / (16.0 * PI) * (1.0 + _mu * _mu);
        // per-wavelength forward lobe: big-grain dust diffracts blue into a
        // tighter cone (the MER blue aureole) — recipe data, not a paint job
        vec3 _g = uMieG, _g2 = _g * _g;
        vec3 _phM = 3.0 / (8.0 * PI) * ((1.0 - _g2) * (1.0 + _mu * _mu))
                   / ((2.0 + _g2) * pow(max(1.0 + _g2 - 2.0 * _g * _mu, vec3(1e-4)), vec3(1.5)));
        ${inscat} = uSunRad * (_phR * uBetaR * _sumR + _phM * uBetaM * _sumM + _sumMS);
        // airglow lives in a thin upper shell, not the whole column (§10):
        // emission ~ path length through the shell -> a limb ring, not a disc glow
        vec2 _shHi = raySphere(${ro}, ${rd}, uPlanetR + uAtmTop * 0.95);
        vec2 _shLo = raySphere(${ro}, ${rd}, uPlanetR + uAtmTop * 0.72);
        float _agHi = max(0.0, min(_shHi.y, _t1) - max(_shHi.x, _t0));
        float _agLo = max(0.0, min(_shLo.y, _t1) - max(_shLo.x, _t0));
        // NO banding structure: at the meter's night exposure clamp the
        // modulation posterizes into the exact green blob field of the user's
        // defect chain — a smooth shell is what a working-exposure camera sees
        // (banded airglow needs minutes of tracked exposure; round-3 finding)
        ${inscat} += uAirglow * clamp((_agHi - _agLo) / (uAtmTop * 0.5), 0.0, 8.0);
      }
      // ---- composite the deck(s) into the ray: the deck's own scatter
      // arrives through the air in front of it (and through a nearer deck);
      // everything behind a deck — air in-scatter (handled per-step above),
      // the surface, the sun/companion discs and the STARS (they read this
      // same trans) — extinguishes through it. No-op identity at 0 decks. ----
      if (_TvDk0.r < 0.0) _TvDk0 = ${trans};
      if (_TvDk1.r < 0.0) _TvDk1 = ${trans};
      ${inscat} += _TvDk0 * _dkS0 * (_dkMid0 <= _dkMid1 ? 1.0 : _dkTr1)
                 + _TvDk1 * _dkS1 * (_dkMid1 <  _dkMid0 ? 1.0 : _dkTr0);
      // capture the AIR-only transmittance BEFORE the deck fold: emission is
      // occluded PER-CROSSING by _dkOcc, so multiplying by the deck-folded trans
      // too would double-attenuate it (post-panel emission-double-attenuation).
      ${emis ? `vec3 _emTr = ${trans};` : ''}
      ${trans} *= _dkTr0 * _dkTr1;
${emis ? `
      // ==== §8/§10 recipe EMISSION (round 16) — aurora + lightning ====
      // UNCONDITIONAL scope (NOT the uHasAtm/_t1>_t0 branch): the orbital limb arc
      // sits above uAtmTop so that branch would drop it (panel aurora-atm-gate).
      // ${trans} is vec3(1) if the atmosphere wasn't crossed. Deck occlusion is
      // PER-CROSSING via the _dkMid ordering test (a deck BEHIND the aurora from
      // orbit must NOT darken it — panel aurora-dkTr), matching the atm loop's _dkA.
      // presence gate on ANY channel (post-panel: a red-dominant band has small
      // .g and would be silently dropped by a green-only test)
      if (max(uAuroraColLo.r, max(uAuroraColLo.g, uAuroraColLo.b)) > 0.0
       || max(uAuroraColHi.r, max(uAuroraColHi.g, uAuroraColHi.b)) > 0.0) {
        for (int _bnd = 0; _bnd < 2; _bnd++) {
          vec3 _acol = _bnd == 0 ? uAuroraColLo : uAuroraColHi;
          if (max(_acol.r, max(_acol.g, _acol.b)) <= 0.0) continue;
          float _ah = _bnd == 0 ? uAuroraH.x : uAuroraH.y;
          vec2 _shA = raySphere(${ro}, ${rd}, uPlanetR + _ah);
          for (int _k = 0; _k < 2; _k++) {
            float _tc = _k == 0 ? _shA.x : _shA.y;
            if (_tc > 0.0 && _tc < ${tmax}) {
              vec3 _upA = normalize(${ro} + ${rd} * _tc);
              float _s = abs(dot(_upA, uAuroraAxis));
              // explicit square, not pow(x,2) — pow(x<0,y) is UB in GLSL ES 3.0
              // (the base goes negative over most of the shell); post-panel fix
              float _q = (_s - uAuroraLatS) / uAuroraWS;
              float _band = exp(-_q * _q);
              // curtain rays drifting in closed-form time: the offset wraps at the
              // vnoise period (4096) so it is seamless — never uTimeS·k (panel wrap-seam)
              float _curt = 0.4 + 0.9 * vnoise(_upA * 60.0 + vec3(0.0, uAuroraPhase.x, 0.0), 4096, 933);
              float _dkOcc = (_tc > _dkMid0 ? _dkTr0 : 1.0) * (_tc > _dkMid1 ? _dkTr1 : 1.0);
              ${emis} += _emTr * _dkOcc * _acol * _band * max(_curt, 0.0) * uAuroraPhase.y;
            }
          }
        }
      }
      // lightning: transient flashes in convective (high-cov) cells, ONE post-loop
      // add at the near deck (path-length-independent; panel lightning-per-tap REFUTED).
      // Bucket seed + frac are CPU-computed from UNWRAPPED t (no 4096 seam); the cell
      // hash keys on body-fixed direction (§9). Drowned by day like all emission.
      if (uLightRate > 0.0 && uCloudDecks > 0 && _dkMid0 < ${tmax}) {
        vec3 _lp = ${ro} + ${rd} * _dkMid0; vec3 _ld = normalize(_lp);
        ivec3 _cell = ivec3(floor(_ld * uLightFreq + uLightBucket.x));
        if (vhash(_cell, 917) < uLightRate) {
          float _lcov = cloudCovOf(cloudTap(_ld, 0, 1.0));
          float _flash = exp(-uLightBucket.y * 6.0) * smoothstep(0.4, 0.8, _lcov);
          // the flash is sourced WITHIN deck 0, so deck 0's own transmittance must
          // not self-suppress it; only a NEARER deck 1 occludes it (post-panel).
          float _ltOcc = _dkMid1 < _dkMid0 ? _dkTr1 : 1.0;
          ${emis} += _emTr * _ltOcc * uLightCol * _flash;
        }
      }
` : ''}
    }
`;

// ---------------------------------------------------------------------------
export const TERRAIN_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uPixAng;
  attribute float aHeight;
  attribute float aHeight0;   // parent-surface height (geomorph source, Phase M)
  attribute vec2 aNormS;      // oct-encoded SMOOTH normal (meso band removed)
  #ifndef FIG_MODE
  #define FIG_MODE 0
  #endif
  #if FIG_MODE != 0
  attribute vec2 aFigN;       // baked displacement direction m̂ (round 17): the
                              // geomorph morph axis MUST equal the bake's anchor
                              // axis or a morphing child leaves its parent's
                              // surface (T-junction cracks — panel)
  #endif
  uniform vec3 uDetailOffset; // tileCenter - 4096m-snapped origin (double-exact on CPU)
  uniform vec3 uTileCtr;      // tile center (direction use only: f32 is fine)
  uniform float uMorphAmp;    // relief*2^(-0.8*level)/TAU_AMP, metres (see tiles.js)
  varying vec3 vWorld;        // camera-relative body-fixed
  varying vec3 vNormal;
  varying vec3 vDetail;
  varying vec2 vUv;
  varying float vHeight;
  varying vec2 vFold;         // meso-band folded share (x: ~4 m octave, y: ~1 m)
  vec3 octDec(vec2 e){
    vec3 v = vec3(e.x, e.y, 1.0 - abs(e.x) - abs(e.y));
    if (v.z < 0.0) v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
    return normalize(v);
  }
  void main(){
    vUv = uv;
    vHeight = aHeight;
    vDetail = uDetailOffset + position; // frozen pre-morph: micro detail must not swim
    // per-vertex geomorph (Phase M, CDLOD): morph is a PURE function of the
    // vertex's own camera distance and the tile's level constant, so adjacent
    // tiles agree along any shared edge by construction — the per-tile-scalar
    // notch (register row: "a scalar cannot satisfy both sides") is impossible.
    // Band-l content ramps in over d in [S(l-1), S(l)] where S(l) is the pure
    // amplitude split distance; the split metric only ever splits EARLIER than
    // S (silhouette boost, texel term), which lands children at morph 0 =
    // exactly their parent's surface. New bands arrive at TAU_AMP px by
    // construction (§4 "blend in"; §1 sanctions geomorphing by name).
    vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
    float dCam = max(length(wp0), 1.0);
    float s1 = uMorphAmp / uPixAng;         // S(l-1): birth distance of this band
    float s0 = s1 * 0.574349;               // S(l) = S(l-1) * 2^-0.8: completion
    float morph = clamp((s1 - dCam) / max(s1 - s0, 1.0), 0.0, 1.0);
  #if FIG_MODE != 0
    vec3 pos = position + octDec(aFigN) * (mix(aHeight0, aHeight, morph) - aHeight);
  #else
    vec3 pos = position + normalize(uTileCtr + position) * (mix(aHeight0, aHeight, morph) - aHeight);
  #endif
    // Phase M filtered normals (§7 variance-preserving, the water LEAN fold's
    // terrain edition): as the meso band's PROJECTED wavelength collapses
    // toward the pixel grid — distance and grazing-view compression both
    // shrink it — the mesh normal folds toward the smooth (undisplaced)
    // normal, and the folded share's slope variance re-enters the BRDF in the
    // fragment (σ shoulder on mu0 + Toksvig roughness). This is the TRUE-cause
    // fix for the grazing meso-facet carpet (three misattributed fixes; the
    // round-9 mode diagnostics finally pinned it on the direct term).
    vec3 nOwn = normal;
    float nv = max(dot(nOwn, -wp0 / dCam), 0.06); // grazing view compression
    float projPx = 4.0 * nv / (dCam * uPixAng);   // ~4 m octave, projected px
    vFold.x = 1.0 - smoothstep(2.5, 7.0, projPx);
    vFold.y = 1.0 - smoothstep(2.5, 7.0, projPx * 0.25); // ~1 m octave folds 4x sooner
    vNormal = mix(nOwn, octDec(aNormS), vFold.x);
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`;

export const TERRAIN_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  __COMMON__
  // the field atlas (Phase 2 checkpoint): RGBA16F array texture, one binding,
  // layers packed by bakecore's ATLAS manifest — L0 rock/ice/ao/rockDensity,
  // L1-L2 horizon octants, L3 mare/veg/hgt/flow, L4 fresh/moist/uplift.
  // 16-bit retires the 8-bit dither bridge and the quantization-floor terms.
  uniform highp sampler2DArray uAtlas;
  uniform vec3 uFaceU, uFaceV;   // face grid axes — the octants' azimuth frame
  uniform vec3 uBounceAlb;       // body-mean ground albedo (one-bounce fill light)
  uniform vec3 uColMare;         // albedo-province palette (maria / dark plains)
  uniform vec3 uFreshTint;       // G6 freshness: fresh-surface albedo multiplier
  uniform vec3 uColDust, uColDustVar, uColRock, uColIce, uColVeg, uColVegVar;
  uniform vec3 uColLinea, uColTholin; // round 18 cryo albedo (Europa fracture, Pluto tholin)
  uniform float uSeaLevel;       // 1e9 when no ocean
  uniform float uHRange;         // height-mode normalization
  uniform vec3 uLevelTint;
  // ground-law look params (round 8, all recipe data — body.ground):
  // G1 joint tessellation + G4 sand-routing agents
  uniform float uJointS;         // joint lattice cell size, m (0.25/0.5/1/2 only)
  uniform float uJointK;         // jointing strength (0 = law off for this body)
  uniform float uJointAng;       // plate angularity (euclidean -> rotated manhattan)
  uniform float uJointTab;       // fracture agent: 1 = tabular bedded flagstone
                                 // (tectonic/thermal joints), 0 = equant impact
                                 // shatter (no oriented sets, no coplanar tops,
                                 // softened gardened grooves) — the round-8
                                 // panel's two-body gate FAIL fix: the LOOK
                                 // diverges per body, not just the knobs
  uniform int   uJointP;         // lattice wrap period = 4096 / uJointS
  uniform float uWindA;          // G4 routing-agent heading, rad from north
  uniform float uRipK;           // ripple strength (0 on windless bodies)
  uniform float uPavK;           // bedrock-pavement exposure on fines-poor flats
  // round 12 (Phase 2 oriented structure): G1 joints align to the closed-form
  // stress frame where the baked stress magnitude is strong; the consequence-
  // chain albedo derives scour/mantle provinces from wind x elevation x age
  uniform float uStressAlign;    // joint-orientation coupling strength
  uniform vec3  uSwellAxis;      // degree-2 swell axis (re-derived JS-side)
  uniform float uScourK, uMantleK;
  uniform vec3  uScourTint, uMantleTint;
  uniform vec2  uMantleAlt;      // mantling altitude ramp (m)
  // round 13 (Phase 2 mechanical residue): appearance over the round-12 fields.
  // Whittaker biomes v2 — climate recomputed in-shader for the biome-class pick
  // (uClimTemp = (tempEq, tempPole, lapse); uClimSeed = context seed) with a
  // cold/warm biome palette (temperate = uColVeg/uColVegVar); uWhitK gates it.
  uniform vec3  uClimTemp;
  uniform int   uClimSeed;
  uniform vec3  uBiomeCold, uBiomeWarm;
  uniform float uWhitK;
  // seasonal volatile cap (fp = latOn, latFull, seasonK in sin-lat units)
  uniform float uFrostK;
  uniform vec3  uFrostTint, uFrostP;
  // G2 strata-in-plan: fold params from recipe (bedT0, foldAmp, foldF, seed);
  // gate = (lo, hi, fieldSel: 0 uplift F4.b, 1 mare F2.r)
  uniform float uStrataK, uStrataAmp;
  uniform vec4  uStrataFold;
  uniform vec3  uStrataGate;
  // space weathering from age (airless maturity: fresh × slope immature veneer)
  uniform float uWeatherK, uWeatherSlope;
  uniform vec3  uWeatherTint;
  // wetness (moisture-driven ground darkening + gloss; folds the shoreline band)
  uniform float uWetDark, uWetGloss;
  // crater-scale lee streaks (finer wind-vector consumer)
  uniform float uStreakK;
  // material texture stacks v2 (round 10, §7 amplification): a shared 4-archetype
  // detail atlas (R albedo, G relief, B roughness, A cavity/AO), the recipe's
  // per-material layer picks, world scale (m/repeat) and amplitude
  uniform highp sampler2DArray uMatStack;
  uniform float uMatFines, uMatRock, uMatIce, uMatScale, uMatAmp;
  // stream-in crossfade (Phase M): a fresh tile stipples IN over uFadeIn while
  // its parent is co-drawn stippling OUT per child quadrant (uFadeOut) — the
  // ignoise partition guarantees exactly one of the pair owns each pixel
  uniform float uFadeIn;      // 1 = settled (default); <1 while dissolving in
  uniform vec4  uFadeOut;     // per-quadrant [x0y0, x1y0, x0y1, x1y1] child fades
  // scatter hand-down conservation (Phase M, §7): the projected-area share of
  // the clast population that is INSTANCE-resolved at this pixel must leave the
  // ground's rockDensity detail — today the two double-count (register row).
  // uRockDist = (sizeMin, sizeMax-sizeMin, 1/A0) for sizes s(u) = m + a*u^3;
  // uRockOn gates tiles that build instances; uRockFloor is the tile's build
  // size floor (coarse tiles instance only their large population).
  uniform vec3  uRockDist;
  uniform float uRockOn, uRockFloor;
  uniform float uMesoRamp;    // meso-band onset share (σ shoulder sizing, Phase M)
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vDetail;
  varying vec2 vUv;
  varying float vHeight;
  varying vec2 vFold;         // meso-band folded share (4 m, 1 m octaves)

  // G1 (round 8): the fracture network is a first-class field. What reads as
  // "rocks" in rover panoramas is mostly IN-PLACE jointed bedrock: pavements
  // of angular plates with coplanar tops, joints filled with sand, whole
  // surfaces tessellated by two or three crack orientations. Implemented as a
  // cellular (nearest-site) field on an AXIS-ALIGNED integer lattice — any
  // rotated lattice coordinate would break the 4096 m detail-snap wrap and
  // seam at tile edges — with the joint-set ORIENTATION carried by the
  // distance METRIC instead: rotating a metric is a continuous function of
  // position, so it is snap-safe by construction. uJointTab picks the
  // fracture AGENT: 1 = oriented tabular sets (tectonic flagstone), 0 =
  // isotropic equant shatter (impact breccia) — same lattice, divergent look.
  // Returns (metres-to-joint-line, F1 site hash, F2 site hash); the caller
  // owns crack AA (§7) and plate merging.
  vec3 plates(vec3 q, vec3 d1, vec3 d2, vec3 up){
    ivec3 iq = ivec3(floor(q));
    ivec3 M = ivec3(uJointP - 1);
    float F1 = 1e9, F2 = 1e9, id = 0.0, id2 = 0.0;
    for (int dz = -1; dz <= 1; dz++)
    for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++){
      ivec3 cc = iq + ivec3(dx, dy, dz);
      float h = vhash(cc & M, 141);
      vec3 site = vec3(cc) + fract(h * vec3(37.13, 173.71, 913.17)) * 0.8 + 0.1;
      vec3 dv = q - site;
      // anisotropic rotated-manhattan metric: at tab=1 plates elongate along
      // d1 and compress vertically (bedded flagstone); at tab=0 the weights
      // go isotropic — angular but equant, no false bedding on breccia
      float dm = abs(dot(dv, d1)) * mix(1.0, 0.8,  uJointTab)
               + abs(dot(dv, d2)) * mix(1.0, 1.15, uJointTab)
               + abs(dot(dv, up)) * mix(1.0, 1.5,  uJointTab);
      float d = mix(length(dv), dm, uJointAng);
      if (d < F1) { F2 = F1; F1 = d; id = h; }
      else if (d < F2) { F2 = d; id2 = h; }
    }
    return vec3((F2 - F1) * uJointS, id, id2);
  }

  // material texture stacks v2 (§7): sample the per-material detail atlas at the
  // body-fixed position p, projected into the (e, n) tangent plane and §7-ANTI-
  // TILED by a CONTINUOUS low-frequency rotation + offset — a per-cell discrete
  // rotation would seam at cell edges, a smooth field has none — so the ~cm atlas
  // has no lattice repeat to lock onto. Mipmapped hardware trilinear does the
  // mean-preserving sub-pixel fold. Returns the raw texel (albedo, relief,
  // roughness, cavity), each ~0.5-centred.
  vec4 sampleMat(vec3 p, vec3 e, vec3 nax, float layer){
    vec2 uv0 = vec2(dot(p, e), dot(p, nax)) / uMatScale;
    float ang = 6.28318530718 * vnoise(p * (1.0 / 48.0), 64, 971);
    float ca = cos(ang), sa = sin(ang);
    vec2 off = vec2(vnoise(p * (1.0 / 40.0), 64, 972), vnoise(p * (1.0 / 37.0), 64, 973));
    vec2 uv = mat2(ca, -sa, sa, ca) * uv0 + off * 4.0;
    return texture(uMatStack, vec3(uv, layer));
  }

  void main(){
    #include <logdepthbuf_fragment>
    // stream-in crossfade stipple (Phase M): complementary partition with the
    // co-drawn parent/child — see ignoise() in COMMON
    if (uFadeIn < 1.0 || dot(uFadeOut, vec4(1.0)) > 0.0) {
      float hSt = ignoise(gl_FragCoord.xy);
      if (hSt >= uFadeIn) discard;
      vec2 qSt = step(vec2(0.5), vUv);
      float fo = mix(mix(uFadeOut.x, uFadeOut.y, qSt.x), mix(uFadeOut.z, uFadeOut.w, qSt.x), qSt.y);
      if (hSt < fo) discard;
    }
    // deeply submerged terrain is invisible under the (now shallow-transparent)
    // ocean; discarding it kills ocean/seabed log-depth fighting at orbital
    // distances while the visible shallows keep their seabed (Phase M shoreline)
    if (uMode <= 1 && uSeaLevel < 1e8 && vHeight < uSeaLevel - 7.0) discard;
    vec2 tuv = (vUv * 64.0 + 6.5) / 77.0;
    vec4 F  = texture(uAtlas, vec3(tuv, 0.0)); // rock, ice, ao, rockDensity
    vec4 F2 = texture(uAtlas, vec3(tuv, 3.0)); // mare, veg, hgt, flow
    vec4 F4 = texture(uAtlas, vec3(tuv, 4.0)); // fresh, moist, uplift, fines
    vec4 F5 = texture(uAtlas, vec3(tuv, 5.0)); // windX, windY, windZ, windExpo
    vec4 F6 = texture(uAtlas, vec3(tuv, 6.0)); // stress, youth, lineaAlb, tholinAlb
    vec3 pPC = vWorld + uCamPos;               // planet-centered (~0.5 m err: fine here)
    // round 17: the local vertical is the figure's level-set gradient — slope,
    // the ground-law tangent frames and sinEl all hang off it. FIG_MODE 0
    // compiles to exactly normalize(pPC) (legacy byte-identity).
    vec3 up = figUpDir(pPC);
    vec3 nGeo = normalize(vNormal);
    float slope = 1.0 - clamp(dot(nGeo, up), 0.0, 1.0);
    // tangent frame for the ground-law looks (G1 joint sets, G4 wind routing);
    // pole guard keeps the cross finite at |up.y| -> 1
    vec3 tpole = abs(up.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 east = normalize(cross(tpole, up));
    vec3 north = normalize(cross(up, east));

    // -- baked horizon field: cast shadows + bounce view factor (Phase 1a) --
    vec4 HA = texture(uAtlas, vec3(tuv, 1.0));
    vec4 HB = texture(uAtlas, vec3(tuv, 2.0));
    vec3 gu = normalize(uFaceU - up * dot(up, uFaceU));
    vec3 gv = normalize(uFaceV - up * dot(up, uFaceV));
    vec3 sunT = uSunDir - up * dot(up, uSunDir);
    float az = atan(dot(sunT, gv), dot(sunT, gu));
    float oc = fract(az / 6.28318530718) * 8.0;        // continuous octant coord
    float o0 = floor(oc);
    float sHor = mix(octVal(HA, HB, o0), octVal(HA, HB, o0 + 1.0), oc - o0);
    float sinEl = dot(uSunDir, up);
    // penumbra: sun disc + a floor for the octant interpolation (16-bit killed
    // the QUANTIZATION floor, but 8-direction azimuth blending still facets —
    // 0.003 posterized small shadows to hard black, round-3 panel)
    float pen = uSunAngR * 1.6 + 0.006;
    float shadow = smoothstep(sHor - pen, sHor + pen, sinEl);
    // terrain view factor from the same octants — the one-bounce fill light that
    // makes airless shadows readable (Apollo tell; roadmap "photo tour" item)
    float gndV = clamp((HA.x + HA.y + HA.z + HA.w + HB.x + HB.y + HB.z + HB.w) * 0.125, 0.0, 1.0);

    // -- ground plan L2/L3: ONE micro-relief function drives geometry (the CPU
    //    meso-displacement band on deep tiles), normals, and material
    //    compositing. Every octave footprint-fades to its mean when sub-pixel
    //    (§7); the vnoise lattice/seeds match mathx.vnoise3 bit-for-bit. --
    float fw = length(fwidth(vDetail));
    float f1 = 1.0 - smoothstep(2.0, 8.0, fw);   // ~4 m meso octave (displaced band)
    float f3 = 1.0 - smoothstep(0.1, 0.4, fw);   // 0.125 m octave (ripple band)
    // scatter hand-down conservation (Phase M): where clasts are RESOLVED as
    // instances, their share of the rockDensity budget leaves the ground detail
    // — distance chooses representation, never doubles it (§7). share = the
    // projected-area fraction of sizes above the resolve threshold s* ~ 2 px
    // (the instances' own fold key), closed form for s(u) = m + a*u^3. The 0.6
    // split leaves the sub-instanceable (< sizeMin) gravel continuum with the
    // ground texture — instances never carried it. Benign at tile boundaries:
    // share ~ 0 wherever a neighbour tile couldn't build instances anyway.
    float rockDetail = max(F.r, F.a);
    if (uRockOn > 0.5) {
      float sstar = max(2.4 * fw, uRockFloor); // 2.2 px fold × mean jitter
      float wRes = clamp(pow(max((sstar - uRockDist.x) / uRockDist.y, 0.0), 1.0 / 3.0), 0.0, 1.0);
      float w4 = wRes * wRes * wRes * wRes;
      float Aw = uRockDist.x * uRockDist.x * (1.0 - wRes)
               + 0.5 * uRockDist.x * uRockDist.y * (1.0 - w4)
               + (uRockDist.y * uRockDist.y / 7.0) * (1.0 - w4 * wRes * wRes * wRes);
      float share = clamp(Aw * uRockDist.z, 0.0, 1.0);
      rockDetail = max(F.r, F.a * (1.0 - 0.6 * share));
    }
    float rockAmp = 0.35 + 0.65 * rockDetail;
    float rockW = max(F.r, smoothstep(0.30, 0.55, slope));
    // G5 "erosion wins" on supply-starved flats (recipe pavK: aeolian scour on
    // Rubra, rare gardened exposures on Luna): flat, fines-poor ground reads
    // as beveled bedrock pavement in regional patches — the substrate G1
    // tessellates into plates. Where fines exist, sand wins (swales stay soft).
    if (uPavK > 0.001) {
      // patch mask folds to its MEAN when the 64 m pattern goes sub-pixel
      // (§7) — pavement is real macro albedo, so it persists to orbit as a
      // uniform term instead of aliasing as shimmer
      float pMask = smoothstep(0.1, 0.6, 0.5 + 0.5 * vnoise(vDetail * (1.0 / 64.0), 64, 149));
      float fP = 1.0 - smoothstep(30.0, 120.0, length(fwidth(vDetail)));
      float pav = uPavK * (1.0 - smoothstep(0.03, 0.20, F4.a))
                * (1.0 - smoothstep(0.05, 0.16, slope))
                * mix(0.45, pMask, fP);
      rockW = max(rockW, 0.85 * pav);
    }
    // the meso relief the mesh displaced, re-evaluated as the compositing GUIDE
    // — micro albedo correlates with meso geometry (L3 rule (a): fines settle
    // in hollows, never on crests), which is what makes texture read as substance
    float meso = f1 > 0.0 ? vnoise(vDetail * 0.25, 1024, 501) * 0.72
                          + vnoise(vDetail, 4096, 503) * 0.28 : 0.0;
    // per-material micro shape from the baked detail STACKS (round 10, §7):
    // exposed rock is CREASED (basalt/duricrust crack networks), fines finely
    // turned, ice granular — sampled from the per-material atlas, hash-rotated so
    // the ~cm detail has no repeat, blended fines<->rock<->ice by the same weights
    // the albedo composite uses. Replaces the round-6 value-noise crease octaves;
    // the mipmapped fetch folds to the flat mean when sub-pixel (no shimmer).
    vec4 mFines = sampleMat(vDetail, east, north, uMatFines);
    vec4 mRock  = sampleMat(vDetail, east, north, uMatRock);
    vec4 matTex = mix(mFines, mRock, rockW);
    matTex = mix(matTex, sampleMat(vDetail, east, north, uMatIce), F.g);
    // TWO fades. matA (albedo/roughness/AO) holds to the ~0.5-2 m band. matN (the
    // relief -> bump normal) folds out FASTER: a bumped normal DIFFERENTIATES the
    // texture, so it aliases at grazing long before the albedo does (the round-9
    // airless-carpet mechanism) — hold the micro-relief to the near field and let
    // the co-registered albedo/roughness carry the substance farther out.
    // AIRLESS gate. The harsh unfilled sun binarizes ANY micro-detail into a
    // pepper carpet (round-9 lesson); the round-10 panel caught the material stack
    // ADDING a comb+pepper to the Luna near-field floor — both the relief (self-
    // shadow) and the albedo texture (grazing isotropic-mip aliasing). So on
    // airless bodies the WHOLE stack is gated well down (its substance is marginal
    // there anyway — regolith fines are near-flat), leaving the registered
    // pre-existing meso carpet as the only residual (Phase-M round 11). Filled
    // bodies keep the full stack, where the fill light tolerates the detail.
    float matA = uMatAmp * (1.0 - smoothstep(0.5, 2.0, fw)) * mix(0.4, 1.0, uHasAtm);
    float matN = uMatAmp * (1.0 - smoothstep(0.15, 0.7, fw)) * mix(0.15, 1.0, uHasAtm);
    float dH = 0.32 * matN * (matTex.y - 0.5);
    // a light per-material fine grain restores intra-plate texture in the mid
    // field: the material-stack relief folds fast, and without a grain term the
    // Rubra duricrust plates read as flat "plastic panels" (round-10 panel). Zero
    // on airless (uHasAtm) so it cannot re-pepper the airless frame.
    if (f3 > 0.0 && uHasAtm > 0.5) {
      float ng = vnoise(vDetail * 8.0, 32768, 103);
      dH += 0.03 * f3 * mix(ng, (0.5 - abs(ng)) * 1.5, rockW);
    }
    // G4 sand routing (round 8, v2): sand presence = f(curvature, wind,
    // upslope supply). The macro SUPPLY is the baked catena fines field (G5:
    // hollows accumulate what crests shed — a real upslope integral, not
    // noise); the micro term pools those fines into the hollows of the same
    // relief the geometry displaced. Folds to its MEAN far away (0.38 = the
    // smoothstep's expectation), never to zero. Agent is recipe data: wind on
    // Rubra/Tellus, gardening/creep pooling alone on Luna.
    float fines = F4.a;
    // steepened fines->supply (round-8 panel: catena contrast died beyond the
    // near field on dust plains — the response was too shallow): a narrower,
    // steeper ramp so crater-floor fines PONDS carry supply where crests do not
    float supply = clamp((1.0 - 0.7 * rockW) * (1.0 - smoothstep(0.10, 0.35, slope))
                 * (0.3 + 1.75 * smoothstep(0.02, 0.25, fines)), 0.0, 1.0);
    float fill = supply * mix(0.38, smoothstep(0.05, -0.30, meso), f1);
    // -- G1 jointing: exposed bedrock is in-place and fractured -- plate
    //    tessellation with sand-filled joints (G4 crack-fill: the fill mask IS
    //    the sand system, so joints inherit dust albedo + burial for free)
    float fJ = 1.0 - smoothstep(0.5 * uJointS, 2.5 * uJointS, fw);
    float jw = uJointK * rockW * fJ;
    vec3 jnt = vec3(0.0, 0.0, 0.0);
    if (jw > 0.004) {
      // regional set rotation: hash, ALIGNED to the round-12 stress frame
      // where the baked stress magnitude is strong (register row: joint
      // orientation couples to the real stress field). The prior is the
      // closed-form swell-radial direction; the orientation enters plates()
      // through the continuous anisotropic METRIC, so it stays snap-safe
      // (the round-8 law: rotate the metric, never the lattice).
      float th = 1.5708 * vnoise(vDetail * (1.0 / 256.0), 16, 131);
      if (uStressAlign > 0.001) {
        float sq = dot(up, uSwellAxis);
        vec3 tsw = uSwellAxis * sign(sq) - up * abs(sq);
        float tl = length(tsw);
        if (tl > 0.08) {
          vec3 er = -tsw / tl;
          float thS = atan(dot(er, north), dot(er, east));
          th = mix(th, thS, uStressAlign * smoothstep(0.12, 0.45, abs(F6.r)));
        }
      }
      vec3 d1 = cos(th) * east + sin(th) * north;
      vec3 d2 = cross(up, d1);
      vec3 pj = plates(vDetail * (1.0 / uJointS), d1, d2, up);
      // block-size hierarchy (round-8 panel: one site per cell = monodisperse
      // mud-crack net): a symmetric hash of the two nearest sites ERASES ~a
      // third of the joints, merging neighbour cells into larger polyomino
      // blocks — a size distribution instead of a single-scale lattice
      float mrg = step(fract((pj.y + pj.z) * 719.13 + pj.y * pj.z * 397.7), 0.34);
      // §7 crack AA: a 0.12·S groove narrower than the pixel footprint widens
      // to the footprint and FOLDS its amplitude (energy-conserving) — a
      // sub-pixel joint must soften into the mean, never alias into
      // black/white pixel stairs (first probe's tell)
      float cwj = max(0.12 * uJointS, 1.4 * fw);
      float crack = (1.0 - smoothstep(0.0, cwj, pj.x)) * min(1.0, (0.12 * uJointS) / cwj)
                  * (1.0 - mrg);
      float interior = smoothstep(0.10 * uJointS, 0.30 * uJointS, pj.x);
      // round 14 (grazing moiré AA, §7): the ZERO-MEAN carriers — per-plate
      // tone, the coplanar-top damp, the groove bump — fold to their means on
      // a STRICTER footprint gate than the block itself: at fw ≈ S (plates
      // ~pixel-sized, the maximum-aliasing band) the old fJ still passed 84%
      // of their amplitude, and multiplied against the metre-shadow stipple
      // at grazing view they beat into the registered cross-hatch. The crack
      // term keeps its energy-conserving fold above (pavement macro albedo
      // persists — it is a MEAN term, not a carrier).
      float fJc = 1.0 - smoothstep(0.3 * uJointS, 0.9 * uJointS, fw);
      jnt = vec3(crack, (pj.y * 2.0 - 1.0) * fJc, interior);
      fill = max(fill, jw * crack * (0.35 + 0.65 * supply));
      // coplanar plate tops on TABULAR bodies only: bedded flagstone tops go
      // flat; impact-shattered breccia keeps its rough surface (uJointTab —
      // what separates "fractured pavement" from "painted cracks", without
      // making every body read as the same pavement)
      dH = mix(dH, dH * 0.25, jw * interior * uJointTab * fJc);
      // joint grooves recess where sand has not filled them (filled joints
      // brighten toward dust via the fill path instead of shadow-darkening);
      // gardened low-tab grooves are softened, boundaries read tone-first
      dH -= 0.14 * jw * crack * fJc * (1.0 - 0.9 * fill) * mix(0.5, 1.0, uJointTab);
    }
    dH *= 1.0 - 0.65 * fill;                     // pooled fines bury micro relief
    // -- G4 ripples: ribboned trains confined to sand accumulations (bedform
    //    amplitude keys on supply — dunes live where sand CAN accumulate);
    //    crest phase is a continuous sin along the wind heading (snap-safe:
    //    no rotated lattice), wobbled + patch-modulated by axis-aligned noise
    if (uRipK * fill > 0.004 && f3 > 0.0) {
      // wind heading: the baked [global] wind vector when present (round 12
      // — ripples rotate with the dune field around orography, nesting the
      // sub-raster octave under the baked bedforms coherently), else the
      // recipe scalar heading; the calm-point guard falls back too
      vec3 wt5 = F5.xyz - up * dot(F5.xyz, up);
      vec3 wd = dot(wt5, wt5) > 0.0025 ? normalize(wt5)
              : normalize(north * cos(uWindA) + east * sin(uWindA));
      // (Round 9 tried an anisotropic train envelope stretched along the wind to
      // read as directional trains; it sampled the wrapped vnoise on a stretched
      // 2D lattice and produced a DIAMOND cross-hatch (round-9 panel) — reverted.
      // Coherent along-wind trains need a 1D noise or a real bedform system,
      // Phase-2 "coherent bedform systems" (round 12).)
      float ph = dot(vDetail, wd) * 4.0;         // ~0.25 m wavelength
      float rip = sin(6.28318 * ph + 2.2 * vnoise(vDetail * 0.5, 2048, 127));
      float trains = 0.5 + 0.5 * vnoise(vDetail * 0.125, 512, 133);
      dH += 0.05 * uRipK * f3 * fill * rip * trains;
    }
    vec3 n = bumpNormal(nGeo, vWorld, dH * rockAmp, 1.0);

    // -- albedo: material composite; pooled fines COVER rock by height-blend
    //    (sand fills the lows of a rock face — the linear lerp is the game
    //    tell, L3 rule (b)) --
    float fMac = 1.0 - smoothstep(10.0, 40.0, fw);
    float macro = 0.5 + 0.5 * fMac * vnoise(vDetail * (1.0/32.0), 128, 107);
    vec3 dust = mix(uColDust, uColDustVar, macro);
    rockW *= 1.0 - 0.85 * fill;
    vec3 albedo = mix(dust, uColRock, rockW);
    // G2 strata-in-plan (round 13): expose depth-layered beds in map view.
    // Recompute procStrata's fold IN-shader (fbm3 + the recipe fold params match
    // the bake bit-for-bit) and modulate tone by fold-frame elevation band, so
    // quasi-horizontal strata read on beveled canyon walls / mesa flanks. Gated
    // by slope (bands show where erosion cuts across the beds), the SAME recipe
    // gate field the bake uses (uplift F4.b / mare F2.r), a footprint gate (D2:
    // tone only where the ledge relief is actually in the mesh — no colour-
    // without-relief at coarse LOD), and uStrataK. Fades toward no tint (mean-
    // preserving, §7). No new baked field; LOD-free by construction (§5).
    if (uStrataK > 0.001) {
      float gv = uStrataGate.z < 0.5 ? F4.b : F2.r;
      float bedT = uStrataFold.x;
      float strataVis = smoothstep(uStrataGate.x, uStrataGate.y, gv)
                      * smoothstep(0.10, 0.30, slope)
                      * (1.0 - smoothstep(0.6 * bedT, 2.5 * bedT, fw)) * uStrataK;
      if (strataVis > 0.002) {
        int sseed = int(uStrataFold.w) + 500;
        float g = uStrataFold.y * fbm3(up * uStrataFold.z, sseed);
        int bed = int(floor((vHeight - g) / bedT));
        float tone = vhash(ivec3(bed, 0, 0), sseed + 200);
        albedo *= 1.0 + uStrataAmp * (tone - 0.5) * strataVis;
      }
    }
    // per-plate tone variance (G1): adjacent plates weather as individuals —
    // uniform-toned "cracked paint" is the tell this line kills (0.16, ungated
    // by the interior mask: the round-8 panel measured ±9%·interior as
    // near-invisible against the joint shadows)
    albedo *= 1.0 + 0.16 * jw * jnt.y * (1.0 - fill);
    // cross-scale coherence: crevices hold settled fines AND shadow — one
    // relief, three consequences (geometry, composition, tone)
    float crev = clamp(-dH * 8.0, 0.0, 1.0) * rockAmp * rockW;
    albedo = mix(albedo, dust, 0.4 * crev);
    albedo *= 1.0 - 0.28 * crev;
    // fines ponds (round-8 panel: catena invisible on pure-dust plains): a subtle
    // brightening where the baked fines field pools on flats with no rock, so
    // crater-floor sand ponds read as smoother/lighter patches than the coarse
    // lag around them (real: fresh accumulated fines are brighter + smoother)
    albedo *= 1.0 + 0.08 * smoothstep(0.3, 0.7, fines) * (1.0 - rockW);
    // vegetation: the BAKED biome field (Phase 2) — temperature x [global]
    // advected moisture with wide ecotones, rain shadows and riparian
    // corridors included. The shader keeps only the per-pixel terms: slope
    // and rock suppression, the beach gap, and the §7 fine-scale breakup
    // (macro geography must never come from render-time noise again).
    float veg = F2.g;
    veg *= (1.0 - rockW) * (1.0 - smoothstep(0.22, 0.42, slope));
    if (uSeaLevel < 1e8) veg *= smoothstep(uSeaLevel + 2.0, uSeaLevel + 14.0, vHeight);
    float fVeg = 1.0 - smoothstep(30.0, 130.0, fw); // mean-preserving fade (§7)
    float vPatch = smoothstep(-0.35, 0.35, vnoise(vDetail * (1.0/128.0), 32, 121)); // ("patch" is reserved)
    veg *= 0.45 + 0.55 * mix(0.5, vPatch, fVeg);
    // Whittaker biomes v2 (round 13): the biome CLASS colour is picked by
    // temperature x moisture with WIDE smooth ecotones (fixes the last
    // salt-and-pepper: steppe/taiga/desert palette classes). Temperature is
    // recomputed in-shader from the climate context — procContext's exact
    // closed form (up.y = sin lat, vHeight, the noise3 wobble), colour-only and
    // LOD-free (§5); the baked veg still owns density + geography. Temperate
    // = uColVeg/uColVegVar; cold (taiga/tundra) + warm (savanna/dry steppe) are
    // recipe palette. Gated by uWhitK — inert (and finite) where veg=0.
    vec3 vegCol = mix(uColVeg, uColVegVar, macro);
    if (uWhitK > 0.001) {
      float sB = up.y;
      float temp = uClimTemp.x + (uClimTemp.y - uClimTemp.x) * sB * sB
                 - max(vHeight, 0.0) * uClimTemp.z + 2.5 * noise3(up * 3.0, uClimSeed);
      // TWO Whittaker axes: temperature sets the GREEN shade (cold taiga ->
      // temperate -> warm deep-green tropics), and ARIDITY (low moisture)
      // desaturates toward the dry-steppe/savanna TAN — NOT temperature (hot+wet
      // must stay lush green, only hot+DRY goes tan). Wide smooth ecotones.
      float coldW = 1.0 - smoothstep(-4.0, 8.0, temp);
      float warmW = smoothstep(13.0, 26.0, temp);
      // round 14 (near-field texel fade, §7 magnification side): the steep
      // class remap turns bilinear moisture diamonds into blocky ecotone
      // stipple when one atlas texel spans many pixels — widen the remap
      // symmetrically about its centre (mean-preserving to first order) as
      // the texel magnifies. Key = screen texel footprint only (LOD-free).
      float tpxM = length(fwidth(tuv)) * 77.0;   // atlas texels per pixel
      float magW = 1.0 - smoothstep(0.03, 0.12, tpxM); // 1 = heavily magnified (extreme near-field only)
      float kM = 1.0 + 2.0 * magW;
      float dry = 1.0 - smoothstep(0.21 - 0.09 * kM, 0.21 + 0.09 * kM, F4.g);  // Tellus moisture scale (wet≈0.31)
      vec3 green = mix(mix(uColVeg, uColVegVar, warmW * (0.6 + 0.4 * macro)), uBiomeCold, coldW);
      vegCol = mix(green, uBiomeWarm, dry * (1.0 - coldW) * 0.85);
    }
    albedo = mix(albedo, vegCol, veg * 0.9);
    // river channels: trunk flow darkens the valley floor (wet soil/riparian
    // shade — honest until Water v2 puts a level set in the channel). Fades
    // with footprint like every sub-pixel octave (§7): a channel narrower than
    // a pixel must fold into the mean, or it reads as a constant-width
    // cartographic stroke from orbit (round-3 panel, CONFIRMED sev3)
    float river = smoothstep(0.55, 0.85, F2.a) * (1.0 - smoothstep(400.0, 2400.0, fw));
    albedo *= 1.0 - 0.22 * river;
    // albedo provinces (maria / dark plains): decoupled from relief, under the ice
    albedo = mix(albedo, uColMare * (0.9 + 0.2 * macro), F2.r);
    // consequence-chain albedo (round 12): wind-scoured YOUNG basalt darkens
    // (Syrtis-class provinces emerge where windExpo and youth coincide over
    // the lowlands), sheltered lee + high plateaus mantle bright (Tharsis/
    // Arabia dust); crater lee streaks fall out of windExpo's lobes for
    // free. Mirrors bakeDiscMap's disc-scale block EXACTLY (§11 agreement).
    if (uScourK + uMantleK > 0.001) {
      float scour = smoothstep(0.05, 0.5, F5.w) * (0.3 + 0.7 * F6.g);
      float mant = clamp(smoothstep(0.05, 0.6, -F5.w)
                 + smoothstep(uMantleAlt.x, uMantleAlt.y, vHeight), 0.0, 1.0) * (1.0 - scour);
      albedo *= mix(vec3(1.0), uScourTint, uScourK * scour);
      albedo = mix(albedo, uMantleTint, uMantleK * mant * 0.5);
    }
    // crater-scale lee streaks (round 13, R2): a FINER wind-vector consumer than
    // the province-scale scour above — light/dark albedo lineations combed ALONG
    // the [global] wind (1D across-wind noise ⇒ streaks run downwind, no round-9
    // cross-hatch), strongest in the exposure lobes, footprint-faded (§7 mean-
    // preserving). uStreakK per wind body; windless Luna (F5≈0) stays silent.
    if (uStreakK > 0.001 && dot(F5.xyz, F5.xyz) > 0.02) {
      vec3 wts = normalize(F5.xyz - up * dot(F5.xyz, up));
      float vAcross = dot(vDetail, cross(up, wts));
      float streak = vnoise(vec3(vAcross * 0.008, 0.0, 0.0), 4096, 311)
                   + 0.5 * vnoise(vec3(vAcross * 0.026, 0.0, 0.0), 4096, 313);
      float lee = 0.35 + 0.65 * smoothstep(0.02, 0.5, abs(F5.w));
      albedo *= 1.0 + uStreakK * 0.11 * streak * lee * (1.0 - smoothstep(120.0, 900.0, fw));
    }
    // G6 freshness veneer (crater overhaul): young surfaces — ejecta rays, fresh
    // interiors — tint toward the recipe's fresh albedo (brighter immature
    // regolith on Luna, darker dust-free rock on Rubra). Rays overlay the maria
    // (real stratigraphy: Tycho's rays cross them) and sit under the ice.
    float freshW = clamp(F4.r, 0.0, 1.0);
    albedo *= mix(vec3(1.0), uFreshTint, freshW);
    // space weathering from age (round 13, G6): airless regolith matures dark/
    // red on gardened flats; freshly-exposed STEEP faces and fresh crater rays
    // (the fresh field — youth is mare-only on Luna, so keying on youth would
    // bake to a constant, D0) stay immature/bright. slope gives the real spatial
    // variance; the term is ~mean-neutral (steep bright balances flat dark) so
    // the whole-disc average is unchanged. Gated by uWeatherK (Tellus/Rubra 0).
    if (uWeatherK > 0.001) {
      // immature = fresh rays, fresh sand FILL (bright fines in joints/hollows —
      // a young deposit, must not be maturity-darkened: round-13 panel caught
      // the pavement's bright crack network muting into a joint-lattice grid),
      // and freshly-exposed steep faces. Everything else is gardened + matures.
      float immature = max(max(freshW, fill), uWeatherSlope * smoothstep(0.15, 0.5, slope));
      albedo *= mix(vec3(1.0), uWeatherTint, uWeatherK * (1.0 - immature));
    }
    albedo = mix(albedo, uColIce, F.g);
    // round 18 cryo albedo — AFTER the ice mix (else the ice≈1 cryo bodies erase
    // it). lineaAlb = the ruddy Europa fracture network (F6.z), tholinAlb = the
    // dark Pluto province (F6.w). Both fields are EXACTLY 0.0 for every legacy
    // body ⇒ mix(albedo, uCol*, 0.0) = albedo, byte-identical (no gate needed).
    albedo = mix(albedo, uColLinea, F6.z);
    albedo = mix(albedo, uColTholin, F6.w);
    // seasonal volatile cap (round 13): render-time frost overlay = pure fn of
    // latitude x closed-form subsolar declination (uSunDir.y is spin-invariant ⇒
    // purely seasonal). The winter-hemisphere cap advances equatorward and
    // retreats in summer — the top whole-disc cue (Rubra CO2, Tellus snow). Sits
    // ON terrain, over the permanent ice cleanly (x(1-F.g), no double-bright).
    // uFrostK gates it (Luna airless = 0). Shares seasonalFrost() with the
    // companion disc (SKY_FRAG) so §11 disc/ground agreement holds by form.
    if (uFrostK > 0.001) {
      float frost = seasonalFrost(up.y, uSunDir.y, uFrostP) * (1.0 - F.g);
      albedo = mix(albedo, uFrostTint, uFrostK * frost);
    }
    // material-stack albedo + cavity (round 10): CO-REGISTERED with the relief
    // sampled above, so crevices read darker and grain tracks shape — substance,
    // not the old flat speckle. Buried (fills) fade it; matA folds it to the mean.
    albedo *= 1.0 + 0.55 * matA * (matTex.x - 0.5) * (1.0 - 0.7 * fill);
    albedo *= mix(1.0, 0.4 + 0.6 * matTex.w, 0.45 * matA * (1.0 - fill));
    // wetness (round 13): moisture darkens + glosses the ground; the Tellus
    // shoreline band (sea-gated) FOLDS into the same wet path (D9 — not a second
    // multiplier). Dry bodies (moist=0, no sea, uWetDark=0) are byte-identical
    // (negative control). The gloss half feeds the BRDF spec below via wet.
    // round 14: same magnification widening as the biome class remap (the
    // wetness edge is the other F4.g stipple source at extreme near field)
    float tpxW = length(fwidth(tuv)) * 77.0;
    float kW = 1.0 + 2.0 * (1.0 - smoothstep(0.03, 0.12, tpxW));
    float wet = uWetDark > 0.0 ? smoothstep(0.625 - 0.225 * kW, 0.625 + 0.225 * kW, F4.g) : 0.0;
    if (uSeaLevel < 1e8 && vHeight < uSeaLevel + 1.5 && vHeight > uSeaLevel - 4.0) wet = max(wet, 0.7);
    albedo *= 1.0 - uWetDark * wet;

    // -- diagnostics modes --
    if (uMode == 1) { gl_FragColor = vec4(lin2srgb(albedo), 1.0); return; }
    if (uMode == 2) {
      // tangent-frame normals (east,north,up -> RGB): world-space normals collapse
      // to one hue per longitude and hide relief (critique panel)
      vec3 e = normalize(cross(vec3(0.0, 1.0, 0.0), up));
      vec3 nn = normalize(cross(up, e));
      vec3 nl = vec3(dot(n, e), dot(n, nn), dot(n, up));
      gl_FragColor = vec4(nl * 0.5 + 0.5, 1.0); return;
    }
    if (uMode == 3) {
      float g = clamp(vHeight / uHRange * 0.5 + 0.5, 0.0, 1.0);
      gl_FragColor = vec4(vec3(g), 1.0); return;
    }
    if (uMode == 4) {
      float s = pow(clamp(slope * 6.0, 0.0, 1.0), 0.6);
      gl_FragColor = vec4(mix(vec3(0.05,0.07,0.1), vec3(1.0,0.55,0.1), s), 1.0); return;
    }
    if (uMode == 5) { gl_FragColor = vec4(vec3(F.b), 1.0); return; }
    if (uMode == 6) {
      float nl = 0.4 + 0.6 * max(dot(nGeo, uSunDir), 0.0);
      gl_FragColor = vec4(lin2srgb(uLevelTint * nl), 1.0); return;
    }
    if (uMode == 7) { gl_FragColor = vec4(vec3(shadow * (0.25 + 0.75 * max(sinEl, 0.0))), 1.0); return; }
    // round-15 diagnostics (probe-only, no UI button): 8 = the cloud-shadow
    // factor at this ground point; 9 = deck-0 coverage at this point's own
    // direction — GPU-side witnesses for the alignment readback probe
    // (panel F3-bench: a JS-vs-JS assert alone is a near-tautology)
    if (uMode == 8) { gl_FragColor = vec4(vec3(cloudShade(pPC)), 1.0); return; }
    if (uMode == 9) {
      float c9 = uCloudDecks > 0 ? cloudCovOf(cloudTap(normalize(pPC), 0, 0.0)) : 0.0;
      gl_FragColor = vec4(vec3(c9), 1.0); return;
    }

    // -- lit: one radiometric budget (§10), material BRDFs from the recipe (1b) --
    // metre-scale map composites with the baked horizon field by MIN — where
    // both capture the same ridge, product would double-darken (register row)
    shadow = min(shadow, localShadow(vWorld, nGeo));
    // cloud shadow (round 15): coverage along the sun ray, the §10 slot —
    // folded into TsRaw so direct, bounce AND the airless gate inherit it
    float cshT = cloudShade(pPC);
    vec3 TsRaw = sunTransmit(pPC) * cshT;
    vec3 Ts = TsRaw * shadow;                  // horizon field gates direct sun
    vec3 V = -normalize(vWorld);
    // Phase M filtered normals, response half: the folded meso share's slope
    // variance becomes a Gaussian shoulder on the direct term — E[max(µ,0)]
    // over the sub-footprint facet distribution instead of a hard clamp, so
    // the terminator-grazing facet field stops binarizing into the registered
    // black-pepper/checker carpet. h(x) = (x + sqrt(x² + 0.637))/2 matches
    // E[max] at 0 (0.399σ) and both tails; σ from the exact mesoDisp
    // amplitudes (scattercore twin) × the folded share. Near field: vFold→0
    // ⇒ σ→0 ⇒ bit-exact max(µ0, 0) — resolved facets stay honestly bimodal.
    float mesoA1 = uMesoRamp * (0.05 + 0.3 * rockAmp);   // ~4 m octave amplitude
    float mesoA2 = uMesoRamp * (0.02 + 0.12 * rockAmp);  // ~1 m octave
    float sigF = 0.6 * sqrt(vFold.x * mesoA1 * mesoA1 * 2.467
                          + vFold.y * mesoA2 * mesoA2 * 39.48); // (2π/λ)² slope var
    float mu0 = dot(n, uSunDir);
    mu0 = sigF > 1e-4 ? sigF * 0.5 * (mu0 / sigF + sqrt(mu0 * mu0 / (sigF * sigF) + 0.637))
                      : max(mu0, 0.0);
    float muV = max(dot(n, V), 0.0);
    float phg = acos(clamp(dot(uSunDir, V), -1.0, 1.0));
    float kd = brdfDiffuse(mu0, muV, phg);
    // ice/snow translucency: wrap-lit subsurface term fills its own shadows
    float wrap = clamp((dot(n, uSunDir) + 0.5) / 1.5, 0.0, 1.0);
    kd = mix(kd, wrap, F.g * uBrdfA.w * 0.7);
    vec3 direct = uSunRad * Ts * kd / PI;
    // enclosed points see less sky and more sunlit terrain: one field, two terms
    vec3 ambient = skyAmbAt(sinEl) * F.b * (0.55 + 0.45 * dot(n, up)) * (1.0 - 0.8 * gndV);
    // airless: the isotropic floor IS the sunlit-neighbour fill, so it must
    // COLLAPSE when the sun is occluded — else the eclipse umbra stays daytime-
    // lit and washes out the copper ring (round-9 panel: lunar-eclipse-ground
    // read as bright noon). Gate by the sun visibility carried in TsRaw
    // (soft·vis on airless; ~0 in the umbra), so the direct+bounce copper wins.
    if (uHasAtm < 0.5) ambient *= max(TsRaw.r, max(TsRaw.g, TsRaw.b));
    // sunlit-neighbour bounce (round-9 airless-fill row): the one-bounce fill
    // from lit terrain the point sees (gndV view factor). On airless bodies this
    // is the DOMINANT fill (no sky), so it carries more weight (0.7 vs 0.45).
    // The gate is smoothstep(sinEl), NOT max(sinEl,0): the OLD linear factor sent
    // the fill to ~0 exactly at grazing sun, so the meso relief's away-facing
    // facets self-shadowed to pure black — the "leopard-spot / black-pepper"
    // carpet. But a facet's sunlit NEIGHBOURS are bright whenever the sun is up,
    // grazing or not, so the fill should saturate once the sun clears the horizon
    // and only vanish through the terminator into true night.
    float bounceK = mix(0.45, 0.7, 1.0 - uHasAtm);
    float lit = smoothstep(-0.05, 0.15, sinEl);
    vec3 bounce = uBounceAlb * uSunRad * TsRaw * lit * gndV * bounceK / PI;
    // planetshine: the companion's disc radiance lights the night side (§10) —
    // earthshine on Luna, moonlight on Tellus, from the same radiance budget
    vec3 shine = uShineRad * max(dot(n, uShineDir), 0.0) / PI;
    // overcast downlight (round 15): the shadowed flux returns as diffuse
    // cloud-base light — shadows read overcast-gray, never black
    vec3 col = albedo * (direct + ambient + bounce + shine + cloudFill(pPC, cshT) / PI);
    // microfacet lobes: ice facets and exposed rock faces (Fresnel in the weights)
    // wet soil gets a specular lobe (round 13 wetness): moist ground that is
    // neither ice nor bare rock still glints — the gloss half of the wet path
    float specW = F.g * uBrdfB.x + rockW * (1.0 - F.g) * uBrdfB.z
                + uWetGloss * wet * (1.0 - F.g) * (1.0 - rockW);
    if (specW > 0.001) {
      // spatially-varying roughness (round 10): the material stack's roughness
      // channel modulates the recipe's per-material base — polished faces glint,
      // fractured crevices go matte — folding to the recipe scalar at distance
      float specRough = mix(uBrdfB.w, uBrdfB.y, F.g);
      specRough = clamp(specRough * mix(1.0, 0.55 + 0.9 * matTex.z, matA), 0.04, 1.0);
      // Toksvig half of the meso fold: folded facet variance widens the lobe
      specRough = min(sqrt(specRough * specRough + 2.0 * sigF * sigF), 1.0);
      specRough = clamp(specRough * (1.0 - 0.6 * wet), 0.04, 1.0);   // wet = glossier
      col += uSunRad * Ts * ggxSpec(n, V, uSunDir, specRough) * specW;
    }

    // -- aerial perspective IS the sky integral applied to terrain (§8) --
    float dist = max(length(vWorld), 1.0);
    vec3 ard = vWorld / dist;
    ${scatterInline('uCamPos', 'ard', 'dist', 'aTr', 'aIns', 'aEmis')}
    // aEmis (aurora/lightning) is self-attenuated inside scatterInline (its own
    // trans + per-crossing deck occlusion) — add it AFTER the terrain's own aTr
    // extinction, not through it (it is emitted between camera and ground).
    col = col * aTr + aIns + aEmis;
    gl_FragColor = vec4(cameraOut(col), 1.0);
  }
`;

// ---------------------------------------------------------------------------
export const SKY_VERT = /* glsl */ `
  uniform mat4 uInvProj;
  varying vec3 vRay;
  void main(){
    // unproject the NEAR plane (z=-1): the far plane collapses to w=0 in float32
    // when far/near is huge — the §1 "never through float32" rule, in clip space
    vec4 vp = uInvProj * vec4(position.xy, -1.0, 1.0);
    // view->world via the transpose of viewMatrix's rotation (camera sits at origin)
    vRay = transpose(mat3(viewMatrix)) * (vp.xyz / vp.w);
    gl_Position = vec4(position.xy, 0.999999, 1.0);
  }
`;

export const SKY_FRAG = /* glsl */ `
  __COMMON__
  // body-fixed -> inertial rotation as columns (star backdrop rotates — §9)
  uniform vec3 uB2I0, uB2I1, uB2I2;
  uniform int uNumBodies;
  uniform vec3 uBodyDir[8];
  uniform float uBodyAngR[8];
  uniform vec3 uBodyCol[8];     // star color * irradiance-at-that-body / pi
  uniform vec3 uBodySun[8];
  uniform highp sampler2DArray uBodyAtlas; // 256x128 equirect albedo, one LAYER per body (§11 v2; round 16)
  uniform vec3 uBodyR0[8], uBodyR1[8], uBodyR2[8]; // rows: our-BF -> target-BF
  uniform float uBodyRowV[8];   // atlas LAYER (id -> layer) per visible slot
  uniform float uBodyDiscLoaded[8];
  uniform vec3 uBodyFlatAlb[8];
  // seasonal cap on companion discs (round 13): per-body frost strength/params/
  // tint; the subsolar declination comes from dot(uBodyR1[i], uBodySun[i])
  uniform float uBodyFrostK[8];
  uniform vec3  uBodyFrostP[8];   // (latOn, latFull, seasonK), sin-lat units
  uniform vec3  uBodyFrostCol[8];
  // round 17: render-time disc haze veil (atmosphere.discHaze — Titan); K=0
  // for every other body, and mix(a,b,0)=a exactly, so legacy discs are
  // byte-identical without a manifest re-pin
  uniform float uBodyHazeK[8];
  uniform vec3  uBodyHazeCol[8];
  // Phase 4 §11 (round 15): the companion's own cloud decks — the SAME
  // equirect field (uCloudMap layers) and alpha law, evaluated in the
  // TARGET's own frame at ITS drift phase and keyframe frac (the
  // seasonalFrost precedent: disc and ground agree by form)
  uniform float uBodyCloudN[8];    // deck count per body slot
  uniform vec4  uBodyCloudA[16];   // slot=body*2+deck: (driftPhase, 2·sigma·thick, layer, frac)
  uniform vec3  uBodyCloudAlb[8];
  // round 18 — Phase 6 giant + ring. RUNTIME per-slot gates (uBodyGiant/uBodyRing
  // default 0 ⇒ every legacy companion disc is byte-identical). Phase C carries
  // one giant/ring profile per resolved slot. Ring radii
  // are ANGULAR (R·mult/dist, CPU-double) so no 1e9 m cancellation; the ring
  // normal is uBodyR1[i] (target +Y in our frame — NOT the y-column; pre-code fix).
  uniform float uBodyGiant[8];
  uniform float uBodyRing[8];
  uniform vec4  uGiantBand[64];    // slot*8 + knot
  uniform int   uGiantBandN[8];
  uniform float uGiantLimbExp[8], uGiantLimbK[8];
  uniform vec4  uGiantStorm[8];
  uniform vec3  uGiantStormCol[8];
  uniform vec4  uGiantHex[8];
  uniform vec3  uGiantHexCol[8];
  uniform float uRingInner[8], uRingOuter[8];
  uniform float uRingRp[8];              // the planet's own EXACT ratio R/dist (post-impl ring-1:
                                         // the shadow/occlusion tests must share the annulus scale,
                                         // not uBodyAngR=atan(R/D) which is ~0.08% off the ratio)
  uniform vec4  uRingGap[32];      // slot*4 + gap
  uniform vec3  uRingCol[8];
  uniform float uRingTau[8], uRingFsG[8];
  // aurora/lightning/city uniforms now live in COMMON (round 16): the emission
  // moved into scatterInline so terrain/ocean carry it too, not just the sky.
  varying vec3 vRay;

  // round 18 giant: synthesize the banded disc colour live from the recipe
  // profile (differential rotation + storm + hexagon are closed-form time, so
  // the disc cannot be a static baked atlas). Fixed 8-knot unrolled blend (no
  // dynamic index), explicit squares (never pow(signed,2)). nB = the disc point's
  // unit normal in the giant's OWN body frame (nB.y = sin-lat).
  vec3 giantBandCol(vec3 nB, int slot) {
    float sinLat = clamp(nB.y, -1.0, 1.0);
    vec3 acc = vec3(0.0); float wsum = 0.0;
    for (int k = 0; k < 8; k++) {
      if (k >= uGiantBandN[slot]) break;
      vec4 gb = uGiantBand[slot * 8 + k];
      float dd = (sinLat - gb.x) / 0.55;
      float w = max(0.0, 1.0 - dd * dd);   // smooth triangular-square weight
      w = w * w;
      acc += w * gb.yzw; wsum += w;
    }
    vec3 band = wsum > 1e-4 ? acc / wsum : vec3(0.6);
    float lon = atan(nB.z, nB.x);
    // ONE storm oval, drifting rigidly at its latitude's rate (uGiantStorm.w is
    // the CPU-double phase; the longitude delta is angularly wrapped so the oval
    // never tears at the ±π seam — the pre-code drift-wrap findings)
    vec4 gst = uGiantStorm[slot];
    float dlon = lon - (gst.x + gst.w);
    dlon -= 6.2831853 * floor(dlon / 6.2831853 + 0.5);
    float dlat = sinLat - gst.y;
    float sw = gst.z * 1.8, sh = gst.z;
    float sg = exp(-(dlon * dlon) / (2.0 * sw * sw) - (dlat * dlat) / (2.0 * sh * sh));
    band = mix(band, uGiantStormCol[slot], 0.8 * sg);
    // polar hexagon: wavenumber-6 standing wave near the pole (drifts rigidly)
    vec4 gh = uGiantHex[slot];
    float hexW = gh.y > 1e-5 ? smoothstep(gh.x, 1.0, sinLat) : 0.0;
    if (hexW > 0.001) {
      float hx = 0.5 + 0.5 * cos(6.0 * (lon - gh.z));
      band = mix(band, uGiantHexCol[slot], hexW * (0.35 + gh.y * 6.0 * hx));
    }
    return band;
  }

  void main(){
    vec3 rd = normalize(vRay);
    vec3 ro = uCamPos;
  #if FIG_MODE == 0
    vec2 pg = raySphere(ro, rd, uPlanetR);
    // celestial occlusion uses a slightly sunken sphere: the datum horizon sits a
    // touch above the visible one, which would wrongly eat stars near the horizon
    vec2 pgC = raySphere(ro, rd, uPlanetR * 0.9995);
    bool ground = pgC.x > 0.0 && pgC.y > 0.0;
    float tmax = (pg.x > 0.0 && pg.y > 0.0) ? pg.x : 1e12;
  #else
    // figure bodies (airless): the sunken-figure test gates the sun/companion
    // block; tmax is moot with no atmosphere. Terrain depth overdraws any
    // sliver the sunken test misses (the same inscribed-conservative logic the
    // legacy 0.9995 sphere uses).
    bool ground = figRayHit(ro, rd) > 0.0;
    float tmax = 1.0e12;
  #endif
    ${scatterInline('ro', 'rd', 'tmax', 'trans', 'inscat', 'skyEmis')}
    if (uMode >= 2 && uMode <= 7) { // diagnostics: neutral dark sky, no distraction
      gl_FragColor = vec4(vec3(0.03), 1.0); return;
    }
    // aurora + lightning now live INSIDE scatterInline (round 16): dual-band, per-
    // crossing deck occlusion, in the SEPARATE skyEmis accumulator so they never
    // feed the star contrast gate. Off-disc AND over-disc reach come free (the
    // terrain/ocean splices carry the same skyEmis). Drowned by day via exposure.
    vec3 col = inscat + skyEmis;

    if (!ground) {
      // atmospheric refraction (Phase 1, [sky][recipe]): near-horizon pixels are
      // lifted images of lower true directions — remap the apparent ray before
      // aiming at the sun/companion discs. Deflection = recipe refractivity x
      // local density x a Bennett elevation profile; the flattened setting sun
      // is the derivative of that curve, not an authored squash.
      vec3 rdS = rd;
      float rc = max(length(ro), 1.0);
      if (uRefrac > 0.0 && rc - uPlanetR < uAtmTop * 2.0) {
        vec3 upC = ro / rc;
        float sinE = clamp(dot(rd, upC), -1.0, 1.0);
        float eDeg = degrees(asin(sinE));
        {
          // Bennett bend, always computed but FADED to zero across 6-10° (no hard
          // eDeg<8 branch discontinuity) and with the apparent ray FLOORED just
          // below the true horizon (panel venus-refrac-deadband: Venus n-1~0.015 is
          // 50x Earth's, so the raw formula bends a ray tens of degrees below the
          // horizon and opens an unrenderable elevation dead-band). Both guards are
          // no-ops for Earth/Mars (their delta stays ≪ the floor and vanishes above
          // ~8° anyway); only Venus's extreme refractivity reaches them.
          float ec = max(eDeg, -1.5);
          float dens = exp(-max(rc - uPlanetR, 0.0) / uHr);
          float delta = max(uRefrac * dens / tan(radians(ec + 7.31 / (ec + 4.4))), 0.0);
          // SATURATE the bend itself (post-panel: flooring only the RESULT left a
          // flat apparent-elevation dead-zone where many true elevations collapse to
          // −2°). Capping delta at a few degrees keeps e2 STRICTLY monotone in eDeg
          // with no flat band; Earth/Mars (delta < 1°) never reach the cap → no-op.
          delta = min(delta, radians(4.0)) * (1.0 - smoothstep(6.0, 10.0, eDeg));
          float e2 = asin(sinE) - delta;
          vec3 hz = normalize(rd - upC * sinE + vec3(1e-9));
          rdS = normalize(hz * cos(e2) + upC * sin(e2));
        }
      }
      // sun: catalogue flux through the same camera, drowned or not by exposure (§10)
      float ang = acos(clamp(dot(rdS, uSunDir), -1.0, 1.0));
      vec3 sunDisc = vec3(0.0);
      float effR = max(uSunAngR, uPixAng * 1.5);
      if (ang < effR) {
        float u2 = clamp(ang / effR, 0.0, 1.0);
        float limb = 0.4 + 0.6 * sqrt(max(1.0 - u2 * u2, 0.0));
        float scale = (uSunAngR / effR); scale *= scale;
        sunDisc = uSunRad * scale * limb / (PI * uSunAngR * uSunAngR) * PI;
      }
      // thin inline PSF core only — the wide halo is the post pass's bloom now;
      // keeping the old broad kernel doubles the veil and floods night frames
      vec3 glare = uSunRad * (1e-4 / (ang * ang + 1e-4)) * exp(-ang * 25.0);
      float sunPix = 1.0;  // per-pixel occlusion: the eclipse crescent's shape
      float visCam = 1.0;  // disc-integrated visibility: dims the veiling glare

      // other bodies: the representation ladder above the quadtree (§11 v2) —
      // disc albedo from the root-tile-baked equirect atlas in the TARGET's
      // body-fixed frame (it spins with its own ephemeris), shaded by the same
      // regolith photometry as terrain (L-S + surge: full-phase flat, correct
      // phase curve — a moon at 20 px shows its maria, never a white ball),
      // energy-preserving point below a pixel. Texture sampled in uniform flow
      // (derivatives inside a varying branch are undefined — ANGLE landmine).
      for (int i = 0; i < 8; i++) {
        if (i >= uNumBodies) break;
        float bAng = acos(clamp(dot(rdS, uBodyDir[i]), -1.0, 1.0));
        float eR = max(uBodyAngR[i], uPixAng * 1.5);
        float mu = clamp(bAng / eR, 0.0, 1.0);
        vec3 perp = normalize(rdS - uBodyDir[i] * dot(rdS, uBodyDir[i]) + vec3(1e-9));
        vec3 nS = normalize(perp * mu - uBodyDir[i] * sqrt(max(1.0 - mu * mu, 0.0)));
        vec3 nB = vec3(dot(uBodyR0[i], nS), dot(uBodyR1[i], nS), dot(uBodyR2[i], nS));
        vec2 buv = vec2(atan(nB.z, nB.x) / (2.0 * PI) + 0.5,
                        asin(clamp(nB.y, -1.0, 1.0)) / PI + 0.5);
        vec3 mapAlb = mix(uBodyFlatAlb[i], texture(uBodyAtlas, vec3(buv, uBodyRowV[i])).rgb, uBodyDiscLoaded[i]);
        // round 17 forward-queue (Titan §11 disc haze): a RENDER-time veil over
        // the baked ground albedo — the §11 disc agrees with the haze-tinted
        // far point without touching the manifest-pinned disc bytes. K=0 for
        // every body that doesn't declare atmosphere.discHaze (mix(a,b,0)=a
        // exactly — legacy byte-identical).
        mapAlb = mix(mapAlb, uBodyHazeCol[i], uBodyHazeK[i]);
        // seasonal cap on the companion disc (round 13, D1): the OTHER body's
        // OWN-frame subsolar declination = dot(uBodyR1[i], uBodySun[i]) (uBodySun
        // is in OUR frame; uBodyR1's row maps it into the target's Y — free,
        // spin-invariant). nB.y is the disc point's own-frame sin(lat). Same
        // seasonalFrost() the ground uses ⇒ §11 disc/ground agreement by form.
        if (uBodyFrostK[i] > 0.001) {
          float fr = seasonalFrost(nB.y, dot(uBodyR1[i], uBodySun[i]), uBodyFrostP[i]);
          mapAlb = mix(mapAlb, uBodyFrostCol[i], uBodyFrostK[i] * fr);
        }
        // round 18 giant: SELECT the live banded synthesis (the atlas tap above
        // stays unconditional — uniform flow, derivatives defined; the pre-code
        // atlas-texture-varying-flow note). mapAlb unchanged for non-giant slots.
        if (uBodyGiant[i] > 0.5) mapAlb = giantBandCol(nB, i);
        // eclipse (Phase 1): a companion in front of the sun blocks its disc
        // per-pixel (the crescent is geometry) and its integrated fraction
        // (dims the glare); an atmosphere-bearing occluder wears the copper
        // sunset ring at its limb — the same annulus that lights the umbra.
        if (bAng < uBodyAngR[i]) sunPix = 0.0;
        visCam = min(visCam, discVis(acos(clamp(dot(uBodyDir[i], uSunDir), -1.0, 1.0)), uSunAngR, uBodyAngR[i]));
        if (i < 3 && uOccAnn[i].r > 0.0 && visCam < 0.999) {
          float _rq = (bAng - uBodyAngR[i]) / max(uBodyAngR[i] * 0.06, uPixAng);
          float ringA = exp(-_rq * _rq); // explicit square (pow(x<0,2) is GLSL ES UB)
          col += trans * uSunRad * uOccAnn[i] * ringA * (1.0 - visCam);
        }
        if (bAng < eR) {
          float mu0 = max(dot(nS, uBodySun[i]), 0.0);
          float muv = max(dot(nS, -rdS), 0.0);
          float gph = acos(clamp(dot(uBodySun[i], -rdS), -1.0, 1.0));
          float kd = mu0 * 2.0 / max(mu0 + muv, 0.02)
                   * (1.0 + 0.35 / (1.0 + tan(max(gph, 1e-4) * 0.5) / 0.055));
          // round 18 giant limb darkening: strong deck-like emission-angle
          // falloff. pow(max(muv,1e-4), exp) — never pow(0)=NaN on SwiftShader;
          // exp>0 asserted at load. Replaces the regolith surge on the giant slot.
          if (uBodyGiant[i] > 0.5)
            kd = mu0 * mix(1.0, pow(max(muv, 1e-4), uGiantLimbExp[i]), uGiantLimbK[i]);
          // ring SHADOW BAND on the disc (A4 mutual shadow — the near-edge-on
          // money element). Target frame, unit-R (never uPlanetR = the RENDERED
          // body). Hard boolean gate: at Saturn equinox sT.y→0 the cast lands off
          // the annulus ⇒ no shadow, no NaN (the pre-code sT.y-floor finding).
          if (uBodyRing[i] > 0.5) {
            vec3 sT = normalize(vec3(dot(uBodyR0[i], uBodySun[i]), dot(uBodyR1[i], uBodySun[i]), dot(uBodyR2[i], uBodySun[i])));
            float syC = abs(sT.y) < 0.03 ? (sT.y < 0.0 ? -0.03 : 0.03) : sT.y;
            float ts = -nB.y / syC;
            if (ts > 0.0) {
              vec3 q = nB + ts * sT;
              float rr = length(q.xz) * uRingRp[i];  // unit-R → the EXACT R/D ratio (matches uRingInner)
              if (rr >= uRingInner[i] && rr <= uRingOuter[i]) {
                float sop = uRingTau[i];
                for (int gk = 0; gk < 4; gk++) {
                  vec4 rg = uRingGap[i * 4 + gk];
                  float nt = rg.w * smoothstep(rg.y, 0.0, abs(rr - rg.x));
                  sop *= 1.0 - rg.z * nt;
                }
                kd *= exp(-sop * 1.2);
              }
            }
          }
          // §11 clouds on the companion disc (round 15): the SAME equirect
          // field at the target's own drift phase/keyframe frac, the same
          // 1-exp(-2·sigma·cov·thick) alpha law as planetshine; the cloud
          // fraction shades with the CLOUD phase function + an MS floor
          // (panel H2 — never the ground's regolith kd), footprint-matched
          // LOD from disc geometry (panel F4; textureLod, uniform flow).
          float aC = 0.0;
          if (uBodyCloudN[i] > 0.5) {
            float lodD = clamp(log2(max(uPixAng / max(uBodyAngR[i] * 0.0122718, 1e-7), 1.0)), 0.0, 5.0);
            for (int d = 0; d < 2; d++) {
              if (d >= int(uBodyCloudN[i] + 0.5)) break;
              vec4 ca = uBodyCloudA[i * 2 + d];
              float ph = -6.2831853 * ca.x;
              vec3 db = vec3(cos(ph) * nB.x - sin(ph) * nB.z, nB.y,
                             sin(ph) * nB.x + cos(ph) * nB.z);
              vec2 cuv = vec2(atan(db.z, db.x) / 6.2831853 + 0.5,
                              asin(clamp(db.y, -1.0, 1.0)) / 3.14159265 + 0.5);
              vec4 tp = textureLod(uCloudMap, vec3(cuv, ca.z), lodD);
              float cov = mix(tp.r, tp.b, ca.w);
              aC = aC + (1.0 - aC) * (1.0 - exp(-ca.y * cov));
            }
          }
          float kdC = (12.566371 * cloudPhase(dot(rdS, uBodySun[i])) + 0.35)
                    * (mu0 * 2.0 / max(mu0 + muv, 0.02));
          float scale = (uBodyAngR[i] / eR); scale *= scale;
          col += trans * uBodyCol[i] * mix(mapAlb * kd, uBodyCloudAlb[i] * kdC, aC) * scale;
        }
        // round 18 — the RING annulus (Phase 6), a radial test OUTSIDE the disc.
        // All in units of body distance D (factored out ⇒ no 1e9 m cancellation).
        // Ring plane normal = uBodyR1[i] (target +Y in our frame). The pose keeps
        // rdS·n̂ = sin(opening) ≠ 0 (a few degrees open — the driver adjudication),
        // so τ is well-conditioned; the floor is defensive.
        if (uBodyRing[i] > 0.5) {
          vec3 nHat = uBodyR1[i], cHat = uBodyDir[i];
          float rdn = dot(rdS, nHat);
          float rdnC = abs(rdn) < 0.02 ? (rdn < 0.0 ? -0.02 : 0.02) : rdn;
          float tau = dot(cHat, nHat) / rdnC;      // ring hit distance / D
          vec3 rvec = tau * rdS - cHat;            // in-plane offset / D (O(1) — no cancellation)
          float rNorm = length(rvec);
          if (tau > 0.0 && rNorm >= uRingInner[i] && rNorm <= uRingOuter[i]) {
            float op = uRingTau[i];
            for (int gk = 0; gk < 4; gk++) {       // ≤4 gap notches, unrolled (no dyn index)
              vec4 rg = uRingGap[i * 4 + gk];
              float nt = rg.w * smoothstep(rg.y, 0.0, abs(rNorm - rg.x));
              op *= 1.0 - rg.z * nt;
            }
            float graze = clamp(1.0 / max(abs(rdn), 0.05), 1.0, 6.0);  // edge-on path length
            float opac = 1.0 - exp(-op * graze * 0.7);
            // forward-scatter HG lobe (backlit flare): peaks when the sun is
            // behind the ring from the viewer (dot(rdS, uBodySun[i]) → 1)
            float ph = dot(rdS, uBodySun[i]);
            float g = uRingFsG[i], gd = 1.0 + g * g - 2.0 * g * ph;
            float hgL = (1.0 - g * g) / max(gd * sqrt(max(gd, 1e-4)), 1e-3);
            // planet shadow on the ring (target frame, units of D): parallel-ray
            // cylinder — shadowed on the anti-sun side within the planet radius
            vec3 qT = vec3(dot(uBodyR0[i], rvec), dot(uBodyR1[i], rvec), dot(uBodyR2[i], rvec));
            vec3 sT = normalize(vec3(dot(uBodyR0[i], uBodySun[i]), dot(uBodyR1[i], uBodySun[i]), dot(uBodyR2[i], uBodySun[i])));
            float qs = dot(qT, sT);
            float lit = qs < 0.0 ? smoothstep(uRingRp[i] * 0.96, uRingRp[i] * 1.10, length(qT - qs * sT)) : 1.0;
            // front/back vs the planet: occluded where the ring passes BEHIND the
            // sphere near-surface (compare τ to the sphere depth /D — exact R/D ratio)
            float frontVis = 1.0;
            if (bAng < uBodyAngR[i]) {
              float sb = sin(bAng);
              float dsph = cos(bAng) - sqrt(max(uRingRp[i] * uRingRp[i] - sb * sb, 0.0));
              frontVis = tau < dsph ? 1.0 : 0.0;
            }
            col += frontVis * trans * uBodyCol[i] * uRingCol[i] * (0.4 + 0.22 * hgL) * lit * clamp(opac, 0.0, 1.0);
          }
        }
      }
      col += trans * (sunDisc * sunPix + glare * visCam);

      // Integrated starlight: PURE STARS (user direction, round 2). The analytic
      // Milky Way band + zodiacal lobe read as gray vnoise clouds at night
      // exposure no matter how they were tuned — the galactic band now lives in
      // the star CATALOG's disc-population density (stars.js), which is what a
      // camera actually resolves. The roadmap's radiance-map form can return
      // later as data, never as noise.
    }
    gl_FragColor = vec4(cameraOut(col), 1.0);
  }
`;

// ---------------------------------------------------------------------------
export const OCEAN_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform vec3 uTileCenter;     // f32 approx, direction only
  uniform vec3 uDetailOffset;   // snapped body-fixed offset (same scheme as terrain)
  uniform vec3 uWaveDirs[16];
  uniform float uWaveK[16];
  uniform float uWavePhase[16]; // k*dot(center,dir) + omega*t, CPU doubles per tile
  uniform float uWaveAmp[16];
  uniform float uVertSpacing;
  varying vec3 vWorld;
  varying vec3 vUp;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vDetail;
  void main(){
    vLocal = position;
    vDetail = uDetailOffset + position;
    vUv = uv;
    vec3 up = normalize(uTileCenter + position);
    vUp = up;
    vec3 pos = position;
    for (int i = 0; i < 16; i++) {
      // geometric only when resolvable (§12 ladder) — SMOOTH ramp, not a per-tile
      // boolean: the boolean quilted wave amplitude along tile borders (Phase M)
      float lambda = 2.0 * PI_V / uWaveK[i];
      float wgt = smoothstep(2.0 * uVertSpacing, 6.0 * uVertSpacing, lambda);
      if (wgt > 0.001) {
        float ph = uWavePhase[i] + uWaveK[i] * dot(position, uWaveDirs[i]);
        pos += up * (uWaveAmp[i] * sin(ph)) * wgt;
      }
    }
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`.replace(/PI_V/g, '3.14159265359');

export const OCEAN_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  __COMMON__
  uniform vec3 uWaveDirs[16];
  uniform float uWaveK[16];
  uniform float uWavePhase[16];
  uniform float uWaveAmp[16];
  uniform vec3 uColShallow, uColDeep, uColDust;
  // per-pixel bathymetry from the field atlas's hgt channel: the 33x33
  // per-vertex depth mix printed a soft blue CHECKERBOARD from orbit
  // (round-2 panel) — depth is a field, so sample it like one
  uniform highp sampler2DArray uAtlas;
  uniform float uSeaLevel;
  // Water v2 [recipe]: Cox-Munk glitter strength, shoaling-surf strength + slope
  // gain, river-mouth sediment turbidity
  uniform float uGlitter, uSurf, uSurfK, uTurbidity;
  // stream-in crossfade (Phase M): same complementary stipple as the terrain —
  // the per-tile bathymetry colour sharpening crossfades instead of popping
  uniform float uFadeIn;
  uniform vec4  uFadeOut;
  varying vec3 vWorld;
  varying vec3 vUp;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vDetail;

  void main(){
    #include <logdepthbuf_fragment>
    if (uMode >= 3 && uMode <= 7) discard;   // diagnostics show the bare fields
    // round-15 witnesses (probe-only): 8 = cloud shade, 9 = deck-0 coverage —
    // the deck-eye pose is over WATER, so the readback needs them here too
    if (uMode == 8) { gl_FragColor = vec4(vec3(cloudShade(vWorld + uCamPos)), 1.0); return; }
    if (uMode == 9) {
      float c9o = uCloudDecks > 0 ? cloudCovOf(cloudTap(normalize(vWorld + uCamPos), 0, 0.0)) : 0.0;
      gl_FragColor = vec4(vec3(c9o), 1.0); return;
    }
    if (uFadeIn < 1.0 || dot(uFadeOut, vec4(1.0)) > 0.0) {
      float hSt = ignoise(gl_FragCoord.xy);
      if (hSt >= uFadeIn) discard;
      vec2 qSt = step(vec2(0.5), vUv);
      float fo = mix(mix(uFadeOut.x, uFadeOut.y, qSt.x), mix(uFadeOut.z, uFadeOut.w, qSt.x), qSt.y);
      if (hSt < fo) discard;
    }
    vec3 up = normalize(vUp);
    float fwp = length(fwidth(vLocal));

    // wave normal: analytic gradient of the same spectrum; sub-pixel octaves fold
    // into ROUGHNESS VARIANCE (LEAN-style moment folding, Phase M) so the orbit
    // glint is the tail of the eye-level waves (§12) and the fold is stable under
    // motion — wide fade ramps, variance (not amplitude) accumulation
    vec3 grad = vec3(0.0);
    float foldVar = 0.0;
    for (int i = 0; i < 16; i++) {
      float lambda = 2.0 * PI / uWaveK[i];
      float ph = uWavePhase[i] + uWaveK[i] * dot(vLocal, uWaveDirs[i]);
      vec3 dT = uWaveDirs[i] - up * dot(uWaveDirs[i], up);
      float res = 1.0 - smoothstep(lambda * 0.08, lambda * 0.8, fwp);
      float sk = uWaveAmp[i] * uWaveK[i]; // slope amplitude of this octave
      grad += dT * (sk * cos(ph)) * res;
      foldVar += 0.5 * sk * sk * (1.0 - res);
    }
    vec3 n = normalize(up - grad);
    vec2 tuv = (vUv * 64.0 + 6.5) / 77.0;
    float depth = max(uSeaLevel - texture(uAtlas, vec3(tuv, 3.0)).b, 0.0);

    vec3 base = mix(uColShallow, uColDeep, 1.0 - exp(-depth * 0.10));
    base = mix(uColDust * 0.55, base, 1.0 - exp(-depth * 0.9)); // sand through shallows
    // sediment plumes (round 10): turbid discharge where a river's [global] flow
    // field meets shallow sea — densest at the mouth, thinning offshore; the
    // sediment tint is the body's own soil colour (a look over the flow channel)
    float flow = texture(uAtlas, vec3(tuv, 3.0)).a;
    float plume = uTurbidity * smoothstep(0.45, 0.9, flow) * (1.0 - smoothstep(2.0, 60.0, depth));
    base = mix(base, uColDust * 0.6 + vec3(0.02, 0.03, 0.02), clamp(0.6 * plume, 0.0, 0.7));

    if (uMode == 1) { gl_FragColor = vec4(lin2srgb(base), 1.0); return; }
    if (uMode == 2) { gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); return; }

    vec3 pPC = vWorld + uCamPos;
    vec3 V = -normalize(vWorld);
    float cosV = clamp(dot(n, V), 0.0, 1.0);
    float fres = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);

    // cloud shadow on the sea (round 15): the ocean has no other shadow
    // wiring — the anchor board's shadows-on-the-water live entirely here
    float cshO = cloudShade(pPC);
    vec3 Ts = sunTransmit(pPC) * cshO;
    vec3 skyAmb = skyAmbAt(dot(up, uSunDir)); // the SAMPLE's sun elevation (1b)
    vec3 col = base * (skyAmb + uSunRad * Ts * max(dot(up, uSunDir), 0.0) * 0.25 / PI
                     + uShineRad * max(dot(n, uShineDir), 0.0) / PI
                     + cloudFill(pPC, cshO) / PI);

    // sun glint: roughness² = base² + folded slope variance (moment-preserving).
    // clamp keeps the distant lobe a broad-but-BRIGHT ellipse (critique: water
    // must read stops brighter than land, never Lambertian)
    float a2 = clamp(2.2e-4 + foldVar * 2.0, 2.2e-4, 0.05);
    vec3 H = normalize(V + uSunDir);
    float nh = max(dot(n, H), 0.0);
    float D = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
    col += uSunRad * Ts * D * fres * max(dot(n, uSunDir), 0.0) / (4.0 * max(cosV, 0.05));
    // Cox-Munk glitter (round 10): the smooth lobe above is the sub-pixel MEAN of
    // the facet field; near the camera those facets RESOLVE into discrete sun
    // flashes. A sparse high-frequency facet field jitters the mirror test and
    // sharpens it — sparks fire only where a micro-facet's slope hits the sun —
    // and the whole term folds out (resFine) to the smooth lobe at range, so the
    // orbit glint stays its seamless tail (§12 variance-preserving hand-down).
    float resFine = 1.0 - smoothstep(0.03, 0.35, fwp);
    if (uGlitter > 0.001 && resFine > 0.001) {
      float fa = vnoise(vDetail * 5.3, 8192, 617);
      float fb = vnoise(vDetail * 9.7 + 3.7, 8192, 619);
      float nhF = clamp(nh + 0.05 * (fa + fb), 0.0, 1.0);           // per-facet jitter
      float spark = pow(nhF, 220.0) * pow(clamp(0.55 + 1.6 * fa * fb, 0.0, 1.0), 5.0);
      col += uSunRad * Ts * fres * uGlitter * spark * resFine * 2.5 * max(dot(up, uSunDir), 0.0);
    }
    col += skyAmb * fres * (0.6 + 0.8 * pow(1.0 - cosV, 2.0)); // sky mirror, graze-boosted
    // depth-and-SLOPE-driven surf (round 10): breakers form where the seabed
    // SHOALS steeply (two bathymetry taps give the seabed gradient), not at a
    // fixed distance ring; the foam line rides the dominant swell crest running
    // shoreward. Wet-foam persists at the waterline; surf fades out at range so
    // the moving crest cannot twinkle when the coastal strip is sub-pixel.
    float e = 2.0 / 77.0;
    float h0 = texture(uAtlas, vec3(tuv, 3.0)).b;
    float hu = texture(uAtlas, vec3(tuv + vec2(e, 0.0), 3.0)).b - h0;
    float hv = texture(uAtlas, vec3(tuv + vec2(0.0, e), 3.0)).b - h0;
    float shoal = clamp(length(vec2(hu, hv)) * uSurfK, 0.0, 1.0);   // steep-bottom mask
    float swPh = uWavePhase[0] + uWaveK[0] * dot(vLocal, uWaveDirs[0]);
    float crest = smoothstep(0.2, 0.95, sin(swPh));                 // swell crest front
    // the static shoal-driven surf persists to distance (real whitecaps read from
    // far off); only the MOVING crest modulation folds out (crestFade) so a
    // sub-pixel coastal strip cannot twinkle under the swell's motion
    float crestFade = 1.0 - smoothstep(0.5, 4.0, fwp);
    float surf = uSurf * (1.0 - smoothstep(0.5, 16.0, depth)) * (0.3 + 0.9 * shoal) * (0.4 + 0.6 * crest * crestFade);
    float foamSh = 1.0 - smoothstep(0.1, 0.9, depth);               // wet shoreline
    float foam = clamp(max(foamSh, surf) * (0.35 + 0.5 * vnoise(vDetail * 0.5, 4096, 113)), 0.0, 0.7);
    col = mix(col, vec3(0.75) * (skyAmb + uSunRad * Ts * 0.4 / PI), foam);

    float dist = max(length(vWorld), 1.0);
    vec3 ard = vWorld / dist;
    ${scatterInline('uCamPos', 'ard', 'dist', 'aTr', 'aIns', 'aEmis')}
    col = col * aTr + aIns + aEmis; // aurora/lightning over the night sea (§10)
    // shoreline soft blend (Phase M): shallow water goes transparent over the
    // seabed instead of meeting a discard edge; foam and Fresnel keep opacity
    float alphaSh = clamp(1.0 - exp(-(depth + 0.12) * 1.9), 0.0, 1.0);
    float alphaO = clamp(max(alphaSh, 0.1) + fres * 0.7 + foam * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(cameraOut(col), alphaO);
  }
`;

// ---------------------------------------------------------------------------
export const ROCK_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uPixAng;
  attribute vec3 aDir;        // the vertex's sculpt direction (limit-map domain)
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vObj;          // rock-local position (stable material-detail domain)
  varying vec3 vDir;
  varying vec2 vTuv;          // owner-tile uv (horizon-field atlas sampling)
  varying vec3 vIm0, vIm1, vIm2; // instance basis (map normal -> world)
  varying float vShade;
  varying float vFade;
  varying float vSeed;        // lattice-hash seed: a fact of the planet, not of the draw
  varying float vBurial;
  void main(){
    vec3 p = position;
    vec3 n = normal;
    float fade = 1.0;
    vObj = position;
    vDir = aDir;
    #ifdef USE_INSTANCING
      // per-instance seed/burial/uv ride the matrix bottom row (scattercore):
      // those elements never enter (M*v).xyz or mat3(M) — transform untouched
      vSeed = instanceMatrix[0].w;
      vBurial = instanceMatrix[1].w;
      float pk = instanceMatrix[2].w;   // owner-tile uv, 11 bits per axis
      vTuv = vec2(floor(pk / 2048.0), mod(pk, 2048.0)) * (1.0 / 2047.0);
      vIm0 = instanceMatrix[0].xyz; vIm1 = instanceMatrix[1].xyz; vIm2 = instanceMatrix[2].xyz;
      p = (instanceMatrix * vec4(p, 1.0)).xyz;
      n = normalize(mat3(instanceMatrix) * n);
      vShade = 0.75 + 0.5 * fract(vSeed * 7.31);
      // distance chooses representation, never membership (§7): each instance
      // folds by its own SCREEN FOOTPRINT with a hash-jittered threshold — small
      // clasts fold first, boulders persist much farther, and there is no radius
      // edge to see. The folded budget lives in the ground's rockDensity detail.
      // BINARY per instance, not a per-pixel dither: a dense swarm of partially
      // faded sub-pixel rocks tiled the screen with the hash pattern (round-5
      // moire carpet); below ~2 px there is nothing for a crossfade to smooth.
      vec4 wpi = modelMatrix * vec4(p, 1.0);
      float dist = max(length(wpi.xyz), 1.0);
      float sizeM = length(instanceMatrix[0].xyz);
      float footPx = sizeM / (dist * uPixAng);
      float jit = 0.7 + 0.8 * fract(vSeed * 13.7);
      // fold at 2.2 px (was 1.8): the round-11 conservation share hands the
      // sub-fold population's budget to the ground's rockDensity detail, so
      // the honest fold point rises off the bare-pixel floor
      fade = footPx > 2.2 * jit ? 1.0 : 0.0;
    #else
      vShade = 1.0; vSeed = 0.5; vBurial = 0.3;
      vTuv = vec2(0.5);
      vIm0 = vec3(1.0, 0.0, 0.0); vIm1 = vec3(0.0, 1.0, 0.0); vIm2 = vec3(0.0, 0.0, 1.0);
    #endif
    vFade = fade;
    vNormal = n;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    gl_Position = fade <= 0.001 ? vec4(2.0, 2.0, 2.0, 0.0) : projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`;

export const ROCK_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  __COMMON__
  uniform vec3 uColRock;
  uniform vec3 uColDust;
  uniform vec3 uBounceAlb;
  uniform highp sampler2DArray uAtlas;    // OWNER tile's field atlas (per-tile clone)
  uniform highp sampler2DArray uRockMap;  // limit-surface normal+cavity octahedra
  uniform float uVar;                     // map layer = archetype*VARIANTS+variant
  uniform float uRockFade;                // build-arrival dissolve (Phase M): a
                                          // tile's rock batch stipples in over a
                                          // few frames instead of popping whole
  uniform vec3 uFaceU, uFaceV;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vObj;
  varying vec3 vDir;
  varying vec2 vTuv;
  varying vec3 vIm0, vIm1, vIm2;
  varying float vShade;
  varying float vFade;
  varying float vSeed;
  varying float vBurial;
  // octahedral encode — JS twin: rockcore octaDir (the map bake)
  vec2 octaUv(vec3 d){
    d /= (abs(d.x) + abs(d.y) + abs(d.z));
    vec2 p = d.z >= 0.0 ? d.xy
      : (1.0 - abs(d.yx)) * vec2(d.x >= 0.0 ? 1.0 : -1.0, d.y >= 0.0 ? 1.0 : -1.0);
    return p * 0.5 + 0.5;
  }
  void main(){
    #include <logdepthbuf_fragment>
    if (vFade < 0.5) discard; // binary footprint fold (vertex-jittered per instance)
    if (uRockFade < 1.0 && ignoise(gl_FragCoord.xy) >= uRockFade) discard;
    vec3 pPC = vWorld + uCamPos;
    vec3 up = normalize(pPC);
    // limit-surface detail (4b residue, done honestly): the sculpt is a closed
    // form, so the baked octahedral map carries its EXACT high-res normal +
    // cavity at any mesh LOD — facet interiors shade as the true rock surface
    vec4 rm = texture(uRockMap, vec3(octaUv(normalize(vDir)), uVar));
    vec3 nl = rm.xyz * 2.0 - 1.0;
    vec3 n = normalize(vIm0 * nl.x + vIm1 * nl.y + vIm2 * nl.z);
    float cav = rm.a;
    // material detail (ground plan L3): mottle keys on rock-LOCAL coords +
    // the lattice seed — world coords lose fp32 precision at planet radius, and
    // gl_InstanceID would repaint the rock whenever its owning tile rebuilds.
    // Amplitude kept mild: harsh airless exposure binarizes strong mottle.
    float dOff = vSeed * 61.0;
    float mot = 0.9 + 0.16 * vnoise(vObj * 5.0 + dOff, 4096, 233)
              + 0.06 * vnoise(vObj * 17.0 + dOff, 4096, 379);
    vec3 albedo = uColRock * vShade * clamp(mot, 0.6, 1.2);
    // G6 dust patina: fines settle on up-facing surfaces AND in crevices (the
    // cavity term — cross-scale coherence, same rule as the ground's cracks);
    // older (deeper-buried) rocks wear more of the body's tone
    float pat = (0.25 + 0.6 * vBurial) * smoothstep(0.05, 0.85, dot(n, up))
              * (0.55 + 0.45 * vnoise(vObj * 3.0 + dOff, 4096, 61))
              + 0.35 * cav * (0.3 + 0.7 * vBurial);
    albedo = mix(albedo, uColDust, clamp(pat, 0.0, 0.65));
    albedo *= 1.0 - 0.30 * cav;               // crevices hold shadow
    // contact AO: the base of a rock sits in its own light well (layer-4 fusion)
    float ao = 0.45 + 0.55 * smoothstep(-0.55, 0.25, vObj.y);
    if (uMode == 1) { gl_FragColor = vec4(lin2srgb(albedo), 1.0); return; }
    if (uMode == 2) { gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); return; }
    // -- lighting: the SAME answer as the ground the rock stands on. Baked
    //    horizon-field shadows + view factor sampled from the OWNER tile's
    //    atlas at the instance's uv (register row: bright gray boulders
    //    floated inside terrain shadows — two representations disagreeing) --
    vec2 tuv = (vTuv * 64.0 + 6.5) / 77.0;
    vec4 HA = texture(uAtlas, vec3(tuv, 1.0));
    vec4 HB = texture(uAtlas, vec3(tuv, 2.0));
    vec3 gu = normalize(uFaceU - up * dot(up, uFaceU));
    vec3 gv = normalize(uFaceV - up * dot(up, uFaceV));
    vec3 sunT = uSunDir - up * dot(up, uSunDir);
    float az = atan(dot(sunT, gv), dot(sunT, gu));
    float oc = fract(az / 6.28318530718) * 8.0;
    float o0 = floor(oc);
    float sHor = mix(octVal(HA, HB, o0), octVal(HA, HB, o0 + 1.0), oc - o0);
    float sinEl = dot(uSunDir, up);
    float pen = uSunAngR * 1.6 + 0.006;
    float shadow = smoothstep(sHor - pen, sHor + pen, sinEl);
    float gndV = clamp((HA.x + HA.y + HA.z + HA.w + HB.x + HB.y + HB.z + HB.w) * 0.125, 0.0, 1.0);
    // metre-scale map composites by MIN, exactly like the terrain (§10)
    shadow = min(shadow, localShadow(vWorld, n));
    // same BRDF library as the terrain — a rock is terrain that happens to be
    // convex; its own shading model would read as a prop (ground plan 4b)
    vec3 V = -normalize(vWorld);
    float mu0 = max(dot(n, uSunDir), 0.0);
    float muV = max(dot(n, V), 0.0);
    float phg = acos(clamp(dot(uSunDir, V), -1.0, 1.0));
    float cshR = cloudShade(pPC);
    vec3 TsRaw = sunTransmit(pPC) * cshR;
    vec3 direct = uSunRad * TsRaw * shadow * brdfDiffuse(mu0, muV, phg) / PI;
    // enclosed rocks see less sky, more sunlit terrain — the terrain's two
    // ambient terms, verbatim (one field, one lighting answer)
    vec3 ambient = skyAmbAt(sinEl) * (0.45 + 0.4 * dot(n, up)) * ao * (1.0 - 0.8 * gndV);
    // airless ambient collapses under an eclipse occluder (same as the terrain)
    if (uHasAtm < 0.5) ambient *= max(TsRaw.r, max(TsRaw.g, TsRaw.b));
    // sunlit-neighbour bounce (round-9 airless-fill row): dominant fill on airless
    // bodies (no sky) — same smoothstep grazing gate as the terrain the rock
    // stands on (linear max(sinEl,0) died at grazing sun -> pure-black facets)
    float bounceK = mix(0.45, 0.7, 1.0 - uHasAtm);
    vec3 bounce = uBounceAlb * uSunRad * TsRaw * smoothstep(-0.05, 0.15, sinEl) * gndV * bounceK / PI;
    vec3 shine = uShineRad * max(dot(n, uShineDir), 0.0) / PI;
    gl_FragColor = vec4(cameraOut(albedo * (direct * (0.75 + 0.25 * ao) + ambient + bounce + shine + cloudFill(pPC, cshR) / PI)), 1.0);
  }
`;

// ---------------------------------------------------------------------------
// round 14 — the IMPOSTOR rung (mesh -> impostor -> roughness, CONCEPT §7's
// ladder sentence finally built). One camera-facing quad per resolvable rock
// or formation on the band tiles below each population's minTileLevel; the
// fragment intersects the pixel ray with the closed-form HULL (octahedral
// normal+radius map baked in FIT space from the finest-LOD mesh — squash, fit
// and displacement carried by construction, panel K1) in the instance's OWN
// anisotropic frame (panel M1: a normalized sphere proxy flattens slab
// lighting), and shades with ROCK_FRAG's MEAN terms — sub-pixel modulations
// (mottle, patina noise, contact AO) fold to their means at 2-6 px, per §7.
// Depth is the quad plane (error <= hull radius, sub-precision at band range;
// stars still occlude correctly). Not a shadow caster: the band sits beyond
// the metre-shadow box, and localShadow is provably 1 there — both omissions
// are shared with the mesh rung's own behaviour at that range.
export const IMPOSTOR_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uPixAng;
  attribute float aVar;    // hull-map layer = archetype*VARIANTS+variant
  attribute float aHullR;  // fit-space max radius (alpha denormalizer)
  varying vec3 vWorld;
  varying vec3 vCtr;       // instance centre (camera-relative)
  varying vec3 vBi0, vBi1, vBi2; // world -> fit-space rows (inverse basis)
  varying vec3 vBc0, vBc1, vBc2; // fit -> world columns (normal transform src)
  varying vec2 vTuv;
  varying float vVar;
  varying float vHullR;
  varying float vFade;
  varying float vSeed;
  varying float vBurial;
  varying float vShade;
  void main(){
    vSeed = instanceMatrix[0].w;
    vBurial = instanceMatrix[1].w;
    float pk = instanceMatrix[2].w;
    vTuv = vec2(floor(pk / 2048.0), mod(pk, 2048.0)) * (1.0 / 2047.0);
    vVar = aVar;
    vHullR = aHullR;
    vShade = 0.75 + 0.5 * fract(vSeed * 7.31);
    mat3 M = mat3(modelMatrix);
    vec3 B0 = M * instanceMatrix[0].xyz;
    vec3 B1 = M * instanceMatrix[1].xyz;
    vec3 B2 = M * instanceMatrix[2].xyz;
    vBc0 = B0; vBc1 = B1; vBc2 = B2;
    // orthogonal-but-scaled basis: inverse rows = columns / |column|^2
    vBi0 = B0 / dot(B0, B0);
    vBi1 = B1 / dot(B1, B1);
    vBi2 = B2 / dot(B2, B2);
    vec3 ctr = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    vCtr = ctr;
    // the SAME per-instance binary footprint fold as the mesh rung
    float dist = max(length(ctr), 1.0);
    float sizeM = length(instanceMatrix[0].xyz);
    float footPx = sizeM / (dist * uPixAng);
    float jit = 0.7 + 0.8 * fract(vSeed * 13.7);
    float fade = footPx > 2.2 * jit ? 1.0 : 0.0;
    vFade = fade;
    // camera-facing quad sized to the conservative hull bound
    float bound = aHullR * max(length(B0), max(length(B1), length(B2))) * 1.1;
    vec3 V = -normalize(ctr);
    vec3 upA = normalize(B1);
    vec3 rgt = normalize(cross(upA, V) + vec3(1e-6));
    vec3 qup = cross(V, rgt);
    vec3 wp = ctr + (position.x * rgt + position.y * qup) * 2.0 * bound;
    vWorld = wp;
    gl_Position = fade <= 0.001 ? vec4(2.0, 2.0, 2.0, 0.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

export const IMPOSTOR_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  __COMMON__
  uniform vec3 uColRock;
  uniform vec3 uColDust;
  uniform vec3 uBounceAlb;
  uniform highp sampler2DArray uAtlas;   // OWNER band tile's field atlas
  uniform highp sampler2DArray uHullMap; // fit-space normal + radius octahedra
  uniform float uRockFade;
  uniform vec3 uFaceU, uFaceV;
  varying vec3 vWorld;
  varying vec3 vCtr;
  varying vec3 vBi0, vBi1, vBi2;
  varying vec3 vBc0, vBc1, vBc2;
  varying vec2 vTuv;
  varying float vVar;
  varying float vHullR;
  varying float vFade;
  varying float vSeed;
  varying float vBurial;
  varying float vShade;
  vec2 octaUvI(vec3 d){
    d /= (abs(d.x) + abs(d.y) + abs(d.z));
    vec2 p = d.z >= 0.0 ? d.xy
      : (1.0 - abs(d.yx)) * vec2(d.x >= 0.0 ? 1.0 : -1.0, d.y >= 0.0 ? 1.0 : -1.0);
    return p * 0.5 + 0.5;
  }
  float hullRad(vec3 d){
    return texture(uHullMap, vec3(octaUvI(d), vVar)).a * vHullR;
  }
  void main(){
    #include <logdepthbuf_fragment>
    if (vFade < 0.5) discard;
    if (uRockFade < 1.0 && ignoise(gl_FragCoord.xy) >= uRockFade) discard;
    // the pixel ray in FIT space (the hull map's domain): the instance's own
    // anisotropic frame — slab squash lives in the map, placement scales in
    // the basis, both honoured exactly (M1)
    vec3 dW = normalize(vWorld);
    vec3 ro = vec3(dot(vBi0, -vCtr), dot(vBi1, -vCtr), dot(vBi2, -vCtr));
    vec3 rdRaw = vec3(dot(vBi0, dW), dot(vBi1, dW), dot(vBi2, dW));
    float rdL = length(rdRaw);
    vec3 rd = rdRaw / max(rdL, 1e-9);
    // bounding sphere of the hull in fit space
    float R = vHullR;
    float b = dot(ro, rd);
    float c = dot(ro, ro) - R * R;
    float disc = b * b - c;
    if (disc <= 0.0) discard;
    float sq = sqrt(disc);
    float t0 = -b - sq, t1 = -b + sq;
    // march the chord at 6 fixed samples; first sign change of
    // f(t) = |p| - hull(|p| dir) localizes the surface — deterministic,
    // ample at the band's 2-6 px footprint
    float tPrev = t0;
    vec3 pPrev = ro + rd * t0;
    float fPrev = length(pPrev) - hullRad(normalize(pPrev));
    float tHit = -1.0;
    for (int i = 1; i <= 6; i++) {
      float t = mix(t0, t1, float(i) / 6.0);
      vec3 p = ro + rd * t;
      float f = length(p) - hullRad(normalize(p));
      if (fPrev > 0.0 && f <= 0.0 && tHit < 0.0) {
        tHit = mix(tPrev, t, fPrev / max(fPrev - f, 1e-6));
      }
      tPrev = t; fPrev = f; pPrev = p;
    }
    if (tHit < 0.0) discard;
    vec3 pFit = ro + rd * tHit;
    vec3 dFit = normalize(pFit);
    vec4 hm = texture(uHullMap, vec3(octaUvI(dFit), vVar));
    vec3 nl = hm.xyz * 2.0 - 1.0;
    // normal transform under the inverse-transpose of the fit->world map
    vec3 n = normalize(vBi0 * nl.x + vBi1 * nl.y + vBi2 * nl.z);
    vec3 pW = vCtr + vBc0 * pFit.x + vBc1 * pFit.y + vBc2 * pFit.z;
    vec3 pPC = pW + uCamPos;
    vec3 up = normalize(pPC);
    // ROCK_FRAG's terms at their MEANS (mottle 0.9, patina noise 0.55,
    // contact AO 0.85 — sub-pixel at this rung, §7 fold not approximation)
    vec3 albedo = uColRock * vShade * 0.9;
    float pat = (0.25 + 0.6 * vBurial) * smoothstep(0.05, 0.85, dot(n, up)) * 0.55;
    albedo = mix(albedo, uColDust, clamp(pat, 0.0, 0.65));
    if (uMode == 1) { gl_FragColor = vec4(lin2srgb(albedo), 1.0); return; }
    if (uMode == 2) { gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); return; }
    vec2 tuv = (vTuv * 64.0 + 6.5) / 77.0;
    vec4 HA = texture(uAtlas, vec3(tuv, 1.0));
    vec4 HB = texture(uAtlas, vec3(tuv, 2.0));
    vec3 gu = normalize(uFaceU - up * dot(up, uFaceU));
    vec3 gv = normalize(uFaceV - up * dot(up, uFaceV));
    vec3 sunT = uSunDir - up * dot(up, uSunDir);
    float az = atan(dot(sunT, gv), dot(sunT, gu));
    float oc = fract(az / 6.28318530718) * 8.0;
    float o0 = floor(oc);
    float sHor = mix(octVal(HA, HB, o0), octVal(HA, HB, o0 + 1.0), oc - o0);
    float sinEl = dot(uSunDir, up);
    float pen = uSunAngR * 1.6 + 0.006;
    float shadow = smoothstep(sHor - pen, sHor + pen, sinEl);
    float gndV = clamp((HA.x + HA.y + HA.z + HA.w + HB.x + HB.y + HB.z + HB.w) * 0.125, 0.0, 1.0);
    // localShadow omitted: the band starts beyond the metre-shadow box, where
    // the map's edge fade returns 1 identically — same answer, fewer taps
    vec3 V = -normalize(pW);
    float mu0 = max(dot(n, uSunDir), 0.0);
    float muV = max(dot(n, V), 0.0);
    float phg = acos(clamp(dot(uSunDir, V), -1.0, 1.0));
    float cshR = cloudShade(pPC);
    vec3 TsRaw = sunTransmit(pPC) * cshR;
    vec3 direct = uSunRad * TsRaw * shadow * brdfDiffuse(mu0, muV, phg) / PI;
    float ao = 0.85;
    vec3 ambient = skyAmbAt(sinEl) * (0.45 + 0.4 * dot(n, up)) * ao * (1.0 - 0.8 * gndV);
    if (uHasAtm < 0.5) ambient *= max(TsRaw.r, max(TsRaw.g, TsRaw.b));
    float bounceK = mix(0.45, 0.7, 1.0 - uHasAtm);
    vec3 bounce = uBounceAlb * uSunRad * TsRaw * smoothstep(-0.05, 0.15, sinEl) * gndV * bounceK / PI;
    vec3 shine = uShineRad * max(dot(n, uShineDir), 0.0) / PI;
    gl_FragColor = vec4(cameraOut(albedo * (direct * (0.75 + 0.25 * ao) + ambient + bounce + shine + cloudFill(pPC, cshR) / PI)), 1.0);
  }
`;

// ---------------------------------------------------------------------------
// round 14 — FORMATIONS (ground plan L5): terrain that happens to overhang.
// ROCK_VERT's instance decode with mesh normals + baked per-vertex AO (the
// under-overhang darkening the tile atlas cannot know), and ROCK_FRAG's
// lighting with the strata BED TONE recomputed from the SAME recipe octave
// family the bake stamps — selected by footprint at formation scale (panel
// K2: the country-rock bedT0 path is untouched; a hoodoo reads its beds from
// the finest octaves + one §7 sub-octave, so bedding crosses the formation).
export const FORM_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uPixAng;
  attribute float aAO;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vObj;
  varying vec2 vTuv;
  varying float vShade;
  varying float vFade;
  varying float vSeed;
  varying float vBurial;
  varying float vAO;
  void main(){
    vec3 p = position;
    vec3 n = normal;
    float fade = 1.0;
    vObj = position;
    vAO = aAO;
    #ifdef USE_INSTANCING
      vSeed = instanceMatrix[0].w;
      vBurial = instanceMatrix[1].w;
      float pk = instanceMatrix[2].w;
      vTuv = vec2(floor(pk / 2048.0), mod(pk, 2048.0)) * (1.0 / 2047.0);
      p = (instanceMatrix * vec4(p, 1.0)).xyz;
      n = normalize(mat3(instanceMatrix) * n);
      vShade = 0.72 + 0.26 * fract(vSeed * 7.31); // panel: lit faces ran ~2x the host terrain
      vec4 wpi = modelMatrix * vec4(p, 1.0);
      float dist = max(length(wpi.xyz), 1.0);
      float sizeM = length(instanceMatrix[0].xyz);
      float footPx = sizeM / (dist * uPixAng);
      float jit = 0.7 + 0.8 * fract(vSeed * 13.7);
      fade = footPx > 2.2 * jit ? 1.0 : 0.0;
    #else
      vShade = 1.0; vSeed = 0.5; vBurial = 0.1; vTuv = vec2(0.5);
    #endif
    vFade = fade;
    vNormal = n;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    gl_Position = fade <= 0.001 ? vec4(2.0, 2.0, 2.0, 0.0) : projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`;

export const FORM_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  __COMMON__
  uniform vec3 uColRock;
  uniform vec3 uColDust;
  uniform vec3 uBounceAlb;
  uniform highp sampler2DArray uAtlas;
  uniform float uRockFade;
  uniform vec3 uFaceU, uFaceV;
  uniform vec4 uFormBed;   // bedT0, bedLac, octaves, strata seed
  uniform vec2 uFormFold;  // foldAmp, foldF
  uniform float uBodyR;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vObj;
  varying vec2 vTuv;
  varying float vShade;
  varying float vFade;
  varying float vSeed;
  varying float vBurial;
  varying float vAO;
  void main(){
    #include <logdepthbuf_fragment>
    if (vFade < 0.5) discard;
    if (uRockFade < 1.0 && ignoise(gl_FragCoord.xy) >= uRockFade) discard;
    vec3 pPC = vWorld + uCamPos;
    vec3 up = normalize(pPC);
    vec3 n = normalize(vNormal);
    // base albedo: rock body + mild object-space mottle (rocks' convention)
    float dOff = vSeed * 61.0;
    float mot = 0.92 + 0.12 * vnoise(vObj * 4.0 + dOff, 4096, 233);
    vec3 albedo = uColRock * vShade * clamp(mot, 0.7, 1.15);
    // K2 — bed tone from the recipe strata octave family, at FORMATION scale:
    // the two finest baked octaves + one §7 sub-octave, each footprint-faded
    // by its own thickness (the country-rock bedT0 block is untouched)
    float elev = length(pPC) - uBodyR;
    int fseed = int(uFormBed.w);
    float g = uFormFold.x * fbm3(up * uFormFold.y, fseed + 500);
    float fw = length(fwidth(vWorld));
    float toneAcc = 0.0;
    for (int k = 0; k < 3; k++) {
      float bedT = uFormBed.x * pow(uFormBed.y, uFormBed.z - 1.0 + float(k));
      float fB = 1.0 - smoothstep(0.6 * bedT, 2.5 * bedT, fw);
      if (fB <= 0.001) continue;
      int bed = int(floor((elev - g) / bedT));
      float tone = vhash(ivec3(bed, k + 3, 0), fseed + 700);
      toneAcc += (tone - 0.5) * fB * (k == 2 ? 0.7 : 1.0); // sub-octave tapered
    }
    albedo *= 1.0 + 0.32 * toneAcc; // panel: +-0.07 effective was invisible at lit-face luminance
    // dust settles on flats + in the baked concavities (vAO doubles as the
    // crevice weight — cross-scale coherence, the rocks' cavity rule)
    float pat = (0.3 + 0.5 * vBurial) * smoothstep(0.15, 0.9, dot(n, up))
      + 0.4 * (1.0 - vAO);
    albedo = mix(albedo, uColDust, clamp(pat, 0.0, 0.6));
    // contact AO at the base + the baked overhang AO
    float ao = (0.45 + 0.55 * smoothstep(-0.52, 0.1, vObj.y)) * vAO;
    if (uMode == 1) { gl_FragColor = vec4(lin2srgb(albedo), 1.0); return; }
    if (uMode == 2) { gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); return; }
    vec2 tuv = (vTuv * 64.0 + 6.5) / 77.0;
    vec4 HA = texture(uAtlas, vec3(tuv, 1.0));
    vec4 HB = texture(uAtlas, vec3(tuv, 2.0));
    vec3 gu = normalize(uFaceU - up * dot(up, uFaceU));
    vec3 gv = normalize(uFaceV - up * dot(up, uFaceV));
    vec3 sunT = uSunDir - up * dot(up, uSunDir);
    float az = atan(dot(sunT, gv), dot(sunT, gu));
    float oc = fract(az / 6.28318530718) * 8.0;
    float o0 = floor(oc);
    float sHor = mix(octVal(HA, HB, o0), octVal(HA, HB, o0 + 1.0), oc - o0);
    float sinEl = dot(uSunDir, up);
    float pen = uSunAngR * 1.6 + 0.006;
    float shadow = smoothstep(sHor - pen, sHor + pen, sinEl);
    float gndV = clamp((HA.x + HA.y + HA.z + HA.w + HB.x + HB.y + HB.z + HB.w) * 0.125, 0.0, 1.0);
    shadow = min(shadow, localShadow(vWorld, n));
    vec3 V = -normalize(vWorld);
    float mu0 = max(dot(n, uSunDir), 0.0);
    float muV = max(dot(n, V), 0.0);
    float phg = acos(clamp(dot(uSunDir, V), -1.0, 1.0));
    float cshR = cloudShade(pPC);
    vec3 TsRaw = sunTransmit(pPC) * cshR;
    vec3 direct = uSunRad * TsRaw * shadow * brdfDiffuse(mu0, muV, phg) / PI;
    // baked overhang AO gates BOTH ambient and bounce: the underside of an
    // arch must not read open-sky bright (the scene-28 tell)
    vec3 ambient = skyAmbAt(sinEl) * (0.45 + 0.4 * dot(n, up)) * ao * (1.0 - 0.8 * gndV);
    if (uHasAtm < 0.5) ambient *= max(TsRaw.r, max(TsRaw.g, TsRaw.b));
    float bounceK = mix(0.45, 0.7, 1.0 - uHasAtm);
    vec3 bounce = uBounceAlb * uSunRad * TsRaw * smoothstep(-0.05, 0.15, sinEl) * gndV * bounceK * vAO / PI;
    vec3 shine = uShineRad * max(dot(n, uShineDir), 0.0) / PI;
    gl_FragColor = vec4(cameraOut(albedo * (direct * (0.75 + 0.25 * ao) + ambient + bounce + shine + cloudFill(pPC, cshR) / PI)), 1.0);
  }
`;

// ---------------------------------------------------------------------------
// metre-scale shadow pass: bare depth-only material rendered from a sun-aligned
// ortho camera over the debris band. Deliberately NO log-depth chunks — the
// log encoding degenerates under an orthographic projection (w == 1 for every
// vertex), which would flatten the whole map to one depth.
export const DEPTH_VERT = /* glsl */ `
  uniform float uPixAng;
  void main(){
    vec3 p = position;
    #ifdef USE_INSTANCING
      p = (instanceMatrix * vec4(p, 1.0)).xyz;
      // SAME binary footprint fold as ROCK_VERT: a folded-out rock must not
      // cast a shadow — sub-threshold casters printed fields of disembodied
      // shadow blobs with no visible geometry (round-5 panel, sev 5).
      // Positions are main-camera-relative even in this pass (applyCamera).
      vec4 wpi = modelMatrix * vec4(p, 1.0);
      float footPx = length(instanceMatrix[0].xyz) / (max(length(wpi.xyz), 1.0) * uPixAng);
      float jit = 0.7 + 0.8 * fract(instanceMatrix[0].w * 13.7);
      if (footPx <= 2.2 * jit) { gl_Position = vec4(2.0, 2.0, 2.0, 0.0); return; }
    #endif
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;
export const DEPTH_FRAG = /* glsl */ `
  precision highp float;
  void main(){ gl_FragColor = vec4(1.0); }
`;

// ---------------------------------------------------------------------------
export const WIRE_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main(){
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;
export const WIRE_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  precision highp float;
  uniform vec3 uColor;
  void main(){
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(uColor, 0.35);
  }
`;

// ---------------------------------------------------------------------------
// the physical camera (Phase 1, [camera]): one post pass over the HDR target —
// exposure, energy-conserving PSF bloom, ACES, sRGB, sensor grain. Diagnostics
// (uMode != 0) pass through untouched (materials already wrote display values).
export const POST_VERT = /* glsl */ `
  void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const POST_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uScene;
  uniform sampler2D uBloom;
  uniform vec2 uRes;         // full target size (gl_FragCoord -> uv)
  uniform float uExposure;
  uniform float uBloomW;     // energy fraction diverted into the PSF halo
  uniform float uBloomN;     // 1 / accumulated chain levels (mean normalization)
  uniform float uTimeS;
  uniform int uMode;
  uniform vec3 uWB;          // white balance tint (photo mode; default 1,1,1 = identity)
  uniform float uGrade;      // film grade amount (photo mode; default 0 = neutral)
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
  vec3 lin2srgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
  float phash(ivec3 p){
    uint h = uint(p.x) * 0x27d4eb2du ^ uint(p.y) * 0x165667b1u ^ uint(p.z) * 0x9e3779b1u;
    h = (h ^ (h >> 15)) * 0x85ebca6bu;
    return float(h ^ (h >> 16)) * (1.0 / 4294967296.0);
  }
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 s = texture2D(uScene, uv).rgb;
    if (uMode != 0) { gl_FragColor = vec4(s, 1.0); return; }
    // PSF bloom: mean-preserving mix — bright pixels lose exactly the energy
    // their halo gains (a lens spreads light, it does not create it)
    vec3 hdr = uBloomW > 0.0 ? mix(s, texture2D(uBloom, uv).rgb * uBloomN, uBloomW) : s;
    // white balance: a camera tint applied to radiance before the tone curve
    // ([camera] per §10). uWB=(1,1,1) is exact identity — sentinels unaffected.
    hdr *= uWB;
    vec3 c = lin2srgb(aces(hdr * 64.0 * uExposure));
    // film grade (photo mode): an optional S-curve + mild saturation lift; a named
    // [camera] look. uGrade=0 skips the branch entirely (bit-identical passthrough).
    if (uGrade != 0.0) {
      vec3 sc = c * c * (3.0 - 2.0 * c);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 sat = mix(vec3(l), c, 1.15);
      c = mix(c, mix(sc, sat, 0.5), clamp(uGrade, 0.0, 1.0));
    }
    // sensor grain ([camera]): deterministic hash of (pixel, frame time),
    // amplitude scales with effective ISO — night frames grain up
    float g = phash(ivec3(ivec2(gl_FragCoord.xy), int(mod(uTimeS * 60.0, 997.0)))) - 0.5;
    c += g * 0.0046 * clamp(log2(1.0 + uExposure), 0.2, 3.0);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export const BLOOM_DOWN_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uSrc;
  uniform vec2 uTexel;      // 1 / source size
  uniform vec2 uRes;        // destination size
  uniform float uKnee;      // first level only: (64*exposure)/24 — see below
  void main(){
    // 13-tap downsample (CoD:AW): the 5-tap box turned bright cores into
    // squircles after a few octaves (round-2 panel finding); this stays round
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 a = texture2D(uSrc, uv + uTexel * vec2(-2.0, -2.0)).rgb;
    vec3 b = texture2D(uSrc, uv + uTexel * vec2( 0.0, -2.0)).rgb;
    vec3 c = texture2D(uSrc, uv + uTexel * vec2( 2.0, -2.0)).rgb;
    vec3 d = texture2D(uSrc, uv + uTexel * vec2(-2.0,  0.0)).rgb;
    vec3 e = texture2D(uSrc, uv).rgb;
    vec3 f = texture2D(uSrc, uv + uTexel * vec2( 2.0,  0.0)).rgb;
    vec3 g = texture2D(uSrc, uv + uTexel * vec2(-2.0,  2.0)).rgb;
    vec3 h = texture2D(uSrc, uv + uTexel * vec2( 0.0,  2.0)).rgb;
    vec3 i = texture2D(uSrc, uv + uTexel * vec2( 2.0,  2.0)).rgb;
    vec3 j = texture2D(uSrc, uv + uTexel * vec2(-1.0, -1.0)).rgb;
    vec3 k = texture2D(uSrc, uv + uTexel * vec2( 1.0, -1.0)).rgb;
    vec3 l = texture2D(uSrc, uv + uTexel * vec2(-1.0,  1.0)).rgb;
    vec3 m = texture2D(uSrc, uv + uTexel * vec2( 1.0,  1.0)).rgb;
    vec3 s = (j + k + l + m) * 0.125
           + (a + c + g + i) * 0.03125
           + (b + d + f + h) * 0.0625
           + e * 0.125;
    // exposed-space knee (Karis-style, first level only): a source 5 orders
    // above the scene otherwise CLIPS the halo, and a clipped halo wears the
    // deep-mip texel's upscaled square shape no matter the filter. Compressed,
    // the pyramid halo stays below saturation and the round inline glare owns
    // the core.
    if (uKnee > 0.0) s /= 1.0 + max(s.r, max(s.g, s.b)) * uKnee;
    gl_FragColor = vec4(s, 1.0);
  }
`;

export const BLOOM_UP_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uSrc;   // coarser level (tent-filtered up)
  uniform sampler2D uSrc2;  // this level's downsample (accumulate)
  uniform vec2 uTexel;      // 1 / source (coarser) size
  uniform vec2 uRes;        // destination size
  uniform float uDecay;     // per-level halo falloff (wider rings carry less)
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 s =
        texture2D(uSrc, uv + uTexel * vec2(-1.0, -1.0)).rgb
      + texture2D(uSrc, uv + uTexel * vec2( 1.0, -1.0)).rgb
      + texture2D(uSrc, uv + uTexel * vec2(-1.0,  1.0)).rgb
      + texture2D(uSrc, uv + uTexel * vec2( 1.0,  1.0)).rgb
      + 2.0 * (texture2D(uSrc, uv + uTexel * vec2(-1.0, 0.0)).rgb
             + texture2D(uSrc, uv + uTexel * vec2( 1.0, 0.0)).rgb
             + texture2D(uSrc, uv + uTexel * vec2(0.0, -1.0)).rgb
             + texture2D(uSrc, uv + uTexel * vec2(0.0,  1.0)).rgb)
      + 4.0 * texture2D(uSrc, uv).rgb;
    gl_FragColor = vec4(s * (uDecay / 16.0) + texture2D(uSrc2, uv).rgb, 1.0);
  }
`;

// steps must be baked in as a compile-time constant (see ATM_STEPS note above).
// vertex: true marks vertex-stage splices (no dFdx there).
export const withCommon = (src, steps = 14, { vertex = false, fig = 0 } = {}) =>
  src.replace('__COMMON__',
    `#define ATM_STEPS ${steps | 0}\n#define FIG_MODE ${fig | 0}\n${vertex ? '#define VERT_STAGE\n' : ''}` + COMMON);

// the one scattering integral, exported for consumers outside this module (the
// star layer's vertex shader needs trans along the star ray — same source text)
export const SCATTER_FOR_STARS = scatterInline('uCamPos', 'rd', '1.0e12', 'trans', 'inscat');
