import puppeteer from 'puppeteer';
const launch = {
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', '--window-size=960,600'],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
};
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
const t0 = Date.now();
try {
  const resp = await page.goto('https://unpkg.com/three@0.160.0/build/three.module.js', { waitUntil: 'load', timeout: 15000 });
  console.log('status', resp.status(), 'ms', Date.now()-t0);
} catch (e) { console.log('ERROR', e.message, 'ms', Date.now()-t0); }
try {
  const resp2 = await page.goto('https://example.com', { waitUntil: 'load', timeout: 15000 });
  console.log('example.com status', resp2.status());
} catch(e) { console.log('example.com ERROR', e.message); }
await browser.close();
