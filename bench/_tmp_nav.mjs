import puppeteer from 'puppeteer';
const launch = {
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', '--window-size=960,600'],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
};
const t0 = Date.now();
const browser = await puppeteer.launch(launch);
console.log('launched', Date.now()-t0);
const page = await browser.newPage();
page.on('console', m => console.log('PAGE:', m.text()));
page.on('requestfailed', r => console.log('FAILED REQ:', r.url(), r.failure()?.errorText));
console.log('navigating...');
await page.goto('http://localhost:8131/planet.html?fast=1', { waitUntil: 'load', timeout: 30000 });
console.log('loaded', Date.now()-t0);
await browser.close();
