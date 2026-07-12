import puppeteer from 'puppeteer';
import { readPNG, luminance } from './png.mjs';
import { writeFileSync } from 'node:fs';

const EXE = 'C:/Users/Shriv/.cache/puppeteer/chrome/win64-149.0.7827.22/chrome-win64/chrome.exe';
const URL = 'http://localhost:8131/planet.html?fast=1';

const spec = {
  clean: true, body: 'tellus', lat: -18, lon: -172, alt: 400000,
  phaseDeg: 94, faceSun: true, pitch: 52,
};

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--window-size=1280,780'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 780 });
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });

for (const cloudsVal of [true, false]) {
  const s = { ...spec, clouds: cloudsVal };
  const res = await page.evaluate((sp) => window.__shot(sp), s);
  console.log('clouds=' + cloudsVal, 'shot result:', JSON.stringify(res));
  const buf = await page.screenshot({ type: 'png' });
  const outPath = `bench/out/_live-loworbit-sunset-clouds-${cloudsVal}.png`;
  writeFileSync(outPath, buf);
  console.log('wrote', outPath);
}

await browser.close();
