import puppeteer from 'puppeteer';
const launch = {
  headless: 'new',
  protocolTimeout: 420000,
  executablePath: 'C:/Users/Shriv/.cache/puppeteer/chrome/win64-149.0.7827.22/chrome-win64/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,780'],
};
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
page.on('requestfailed', r => console.log('REQFAIL', r.url(), r.failure()));
page.on('response', r => console.log('RESP', r.status(), r.url()));
console.log('launched, navigating to about:blank first...');
await page.goto('about:blank', { timeout: 10000 });
console.log('about:blank ok');
try {
  await page.goto('http://localhost:8131/planet.html?fast=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log('dom loaded');
} catch (e) {
  console.log('goto failed:', e.message);
}
await new Promise(r => setTimeout(r, 2000));
await browser.close();
console.log('done');
