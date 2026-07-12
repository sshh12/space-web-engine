// harness/shots.mjs — renderShots(): THE one capture path (LAYOUT_ROADMAP §6.1).
//
// Everything that drives a browser goes through here: the bench gate, motion runs,
// the foolrate panel, and every ad-hoc agent probe. It owns four things the defect
// register proved must live in one place, not be re-written per probe:
//   - the browser lifecycle (SwiftShader flags, Chrome-pin repair, protocolTimeout);
//   - an EPHEMERAL static server (free port per run) so there is no "did you start
//     python -m http.server" failure mode and parallel runs get port isolation;
//   - a page pool with recycle-after-K (round-4 OOM: a long single-page sweep leaks
//     state) and unsettled/errored → one fresh-page retry → then FAIL LOUD;
//   - engine-agnostic result records { name, png, settled, ms, errors, provenance } —
//     no page/browser handle ever escapes, so a future Node+WebGPU backend can
//     replace Puppeteer inside this file alone.
//
// A shot is { name, spec, ...tags } for a still, or { name, frames:[spec,...], ...tags }
// for a sequence (a Situation timeline expanded to concrete specs by the caller).
// renderShots also accepts a Situation { start, timeline:[specOverride,...] } directly.
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { resolve, join, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

export const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css',
  '.bin': 'application/octet-stream', '.map': 'application/json',
};

// Minimal static server rooted at the repo — resolves /planet.html, /src/**, /cache/**.
// Blocks path traversal; anything outside ROOT is 403. Returns { url, close }.
// Exported so `harness/serve.mjs` can expose it for interactive dev (no Python).
export function startServer(root = ROOT, port = 0) {
  return new Promise((res) => {
    const srv = createServer((req, resp) => {
      try {
        const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const path = normalize(join(root, rel));
        if (!path.startsWith(root)) { resp.writeHead(403).end('forbidden'); return; }
        const st = statSync(path);
        const file = st.isDirectory() ? join(path, 'index.html') : path;
        const body = readFileSync(file);
        resp.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        resp.end(body);
      } catch { resp.writeHead(404).end('not found'); }
    });
    srv.listen(port, '127.0.0.1', () => {
      const { port } = srv.address();
      res({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => srv.close(r)) });
    });
  });
}

// Chrome-pin repair (register round 17): puppeteer's declared Chrome may be broken on
// a host while a newer cached one works. Order: explicit env override → newest in the
// local puppeteer cache → bundled default. No hardcoded machine path.
function chromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    const dir = join(homedir(), '.cache', 'puppeteer', 'chrome');
    const vers = readdirSync(dir).filter((d) => d.startsWith('win64-') || d.startsWith('linux-') || d.startsWith('mac'))
      .sort((a, b) => parseFloat(b.split('-')[1]) - parseFloat(a.split('-')[1]));
    if (vers.length) {
      const sub = vers[0].startsWith('win64-') ? ['chrome-win64', 'chrome.exe']
        : vers[0].startsWith('mac') ? ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing']
          : ['chrome-linux64', 'chrome'];
      return join(dir, vers[0], ...sub);
    }
  } catch { /* fall through to bundled default */ }
  return undefined;
}

function gitCommit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return null; }
}

// Normalize the input to a flat shot list. Accepts an array of shots or a Situation.
function toShots(input) {
  if (Array.isArray(input)) return input;
  if (input && input.start && Array.isArray(input.timeline)) {
    const frames = input.timeline.map((ov) => ({ ...input.start, ...ov }));
    return [{ name: input.name || 'situation', frames, tier: input.tier }];
  }
  throw new Error('renderShots: input must be an array of shots or a { start, timeline } Situation');
}

/**
 * Render a set of shots headless and return engine-agnostic records.
 * @param {Array|Object} input  array of shots, or a Situation { start, timeline }
 * @param {Object} [opts]
 *   parallel  number of concurrent pages (default 1)
 *   out       output dir for stills + records.json (default harness/out)
 *   page      page path to load (default 'planet.html')
 *   url       full URL override (else built from the ephemeral server + page)
 *   fast      append ?fast=1 (default true — SwiftShader honesty)
 *   retries   fresh-page retries on unsettled/error (default 1)
 *   seed      recorded in provenance (control date-seed, if any)
 *   w,h,dpr   viewport (default 1280x780 @1)
 *   recycle   recycle a page after this many shots (default 12)
 * @returns {Promise<Array>} records [{ name, png, pngs?, settled, ms, errors, provenance }]
 */
export async function renderShots(input, opts = {}) {
  const {
    parallel = 1, out = resolve(ROOT, 'harness/out'), page: pagePath = 'planet.html',
    fast = true, retries = 1, seed = null, w = 1280, h = 780, dpr = 1, recycle = 12, quiet = false,
  } = opts;
  const shots = toShots(input);
  const stills = resolve(out, 'stills');
  mkdirSync(stills, { recursive: true });

  const server = opts.url ? null : await startServer();
  const url = opts.url || `${server.url}/${pagePath}${fast ? '?fast=1' : ''}`;
  const provenance = { backend: 'swiftshader', fast, dpr, seed, commit: gitCommit() };
  const log = (...a) => { if (!quiet) console.log(...a); };

  const launch = {
    headless: 'new', protocolTimeout: 420000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--ignore-gpu-blocklist', `--window-size=${w},${h}`],
  };
  const exe = chromePath();
  if (exe) launch.executablePath = exe;
  const browser = await puppeteer.launch(launch);

  // A cold page's __ready waits for the first full bake; under N-way SwiftShader
  // contention that can be slow, so give it room and one retry before giving up.
  async function freshPage() {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      let p;
      try {
        p = await browser.newPage();
        await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
        await p.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
        await p.waitForFunction(() => window.__ready && window.__ready(), { timeout: 300000, polling: 250 });
        return p;
      } catch (e) {
        lastErr = e;
        try { if (p) await p.close(); } catch { /* already gone */ }
      }
    }
    throw lastErr;
  }

  // Capture one spec on `page`: apply, settle, screenshot to `file`, drain page errors.
  async function capture(page, spec, file) {
    const res = await page.evaluate((s) => window.__shot(s), spec);
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: file });
    const errors = await page.evaluate(() => (window.__pageErrors ?? []).splice(0));
    return { settled: res ? res.settled !== false : true, ms: res ? res.ms : null, errors };
  }

  const records = new Array(shots.length);
  let qi = 0;
  const flush = () => writeFileSync(resolve(out, 'records.json'),
    JSON.stringify(records.filter(Boolean).map((r) => ({ ...r, provenance })), null, 1));

  async function worker() {
    let page = await freshPage();
    let since = 0;
    for (;;) {
      const idx = qi++;                       // atomic in single-threaded JS (no await between)
      if (idx >= shots.length) break;
      const shot = shots[idx];
      const t0 = Date.now();
      const rec = { name: shot.name, ...('frames' in shot ? { pngs: [] } : { png: '' }), settled: true, ms: 0, errors: [] };
      try {
        if ('frames' in shot) {
          for (let f = 0; f < shot.frames.length; f++) {
            const file = resolve(stills, `${shot.name}-${String(f).padStart(3, '0')}.png`);
            const c = await capture(page, shot.frames[f], file);
            rec.pngs.push(file); rec.settled &&= c.settled; rec.errors.push(...c.errors);
          }
        } else {
          const file = resolve(stills, shot.name + '.png');
          let c = await capture(page, shot.spec, file);
          for (let r = 0; !c.settled && r < retries; r++) {
            log(`  UNSETTLED ${shot.name} (${c.ms} ms) — retry on fresh page`);
            await page.close(); page = await freshPage(); since = 0;
            c = await capture(page, shot.spec, file);
          }
          rec.png = file; rec.settled = c.settled; rec.ms = c.ms; rec.errors = c.errors;
        }
      } catch (e) {
        rec.errors.push('driver: ' + String(e).split('\n')[0]);
        rec.settled = false;
        try { await page.close(); } catch { /* already gone */ }
        page = await freshPage(); since = 0;
      }
      // carry tags forward (disk/noLimb/expected/tier) untouched for the scorer
      for (const k of ['disk', 'noLimb', 'expected', 'tier']) if (k in shot) rec[k] = shot[k];
      records[idx] = rec;
      flush();
      const bad = rec.errors.length ? ' ERR' : rec.settled ? '' : ' UNSETTLED';
      log(`${shot.name}  ${((Date.now() - t0) / 1000).toFixed(1)}s${bad}`);
      if (++since >= recycle) { await page.close(); page = await freshPage(); since = 0; }
    }
    await page.close();
  }

  await Promise.all(Array.from({ length: Math.max(1, parallel) }, () => worker()));
  await browser.close();
  if (server) await server.close();

  const out2 = records.filter(Boolean).map((r) => ({ ...r, provenance }));
  const broken = out2.filter((r) => r.errors.length).length;
  const unsettled = out2.filter((r) => !r.settled).length;
  if (broken) console.error(`\n${broken} shot(s) had PAGE ERRORS — their stills must not be scored`);
  if (unsettled) console.error(`${unsettled} shot(s) captured UNSETTLED after retry — metrics untrustworthy`);
  return out2;
}

// CLI: node harness/shots.mjs <specfile.json> [outDir] — quick sweep, no scoring.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const specFile = process.argv[2];
  const outDir = process.argv[3] ? resolve(process.argv[3]) : resolve(ROOT, 'harness/out');
  if (!specFile) { console.error('usage: node harness/shots.mjs <specfile.json> [outDir]'); process.exit(1); }
  const specs = JSON.parse(readFileSync(resolve(specFile), 'utf8'));
  const shots = specs.map((s, i) => ('spec' in s ? s : { name: s.name || `shot-${i}`, spec: s, disk: !!s.disk }));
  const recs = await renderShots(shots, { out: outDir, parallel: +(process.env.PARALLEL || 1) });
  const bad = recs.filter((r) => r.errors.length || !r.settled).length;
  console.log(`\n${recs.length} shots -> ${outDir}  (${bad} bad)`);
  process.exit(bad ? 1 : 0);
}
