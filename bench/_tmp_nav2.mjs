import puppeteer from 'puppeteer';
const launch = {
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', '--window-size=960,600'],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
};
const t0 = Date.now();
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
let reqCount = 0, respCount = 0;
page.on('request', r => { reqCount++; if (reqCount < 5 || reqCount % 20 === 0) console.log('REQ', reqCount, r.url()); });
page.on('response', r => { respCount++; });
page.on('requestfailed', r => console.log('FAILED', r.url(), r.failure()?.errorText));
page.on('console', m => console.log('PAGE:', m.text().slice(0,200)));
page.on('pageerror', e => console.log('PAGEERROR', e.message));
console.log('navigating (domcontentloaded)...');
try {
  await page.goto('http://localhost:8131/planet.html?fast=1', { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('DOMContentLoaded at', Date.now()-t0, 'reqs', reqCount, 'resp', respCount);
} catch (e) { console.log('dcl error', e.message, 'reqs so far', reqCount, 'resp', respCount); }
await new Promise(r => setTimeout(r, 15000));
console.log('after 15s more: reqs', reqCount, 'resp', respCount);
await browser.close();
