import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const EXE = 'C:/Users/Shriv/.cache/puppeteer/chrome/win64-149.0.7827.22/chrome-win64/chrome.exe';
const URL = 'http://localhost:8131/planet.html?fast=1';

const spec = {
  clean: true, body: 'tellus', lat: -18, lon: -172, alt: 400000,
  phaseDeg: 94, faceSun: true, pitch: 52,
};

const W = 1280, H = 780;
const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: 'new',
  protocolTimeout: 420000,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready && window.__ready(), { timeout: 240000, polling: 250 });

for (const cloudsVal of [true, false]) {
  const s = { ...spec, clouds: cloudsVal };
  const res = await page.evaluate((sp) => window.__shot(sp), s);
  console.log('clouds=' + cloudsVal, 'shot result:', JSON.stringify(res));
  await new Promise((r) => setTimeout(r, 350));
  const buf = await page.screenshot({ type: 'png' });
  const outPath = `bench/out/_live2-loworbit-sunset-clouds-${cloudsVal}.png`;
  writeFileSync(outPath, buf);
  console.log('wrote', outPath);
}

await browser.close();
