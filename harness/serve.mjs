// harness/serve.mjs — a persistent static server for interactive dev, reusing the
// SAME server renderShots spins up per run. Replaces `python -m http.server` (no
// Python dependency, cross-platform, one code path). Fixed port so bookmarks
// survive restarts; override with PORT=xxxx.
import { startServer } from './shots.mjs';

const port = +(process.env.PORT || 8131);
const { url, close } = await startServer(undefined, port);
console.log(`serving repo at ${url}`);
console.log(`open ${url}/apps/inspector.html   (or ${url}/planet.html pre-step-8)`);
console.log('Ctrl-C to stop.');
process.on('SIGINT', async () => { await close(); process.exit(0); });
