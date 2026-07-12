import puppeteer from 'puppeteer';
const launch = {
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--ignore-gpu-blocklist', '--window-size=960,600'],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
};
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
const pending = new Map();
page.on('request', r => { pending.set(r.url(), Date.now()); });
page.on('requestfinished', r => { pending.delete(r.url()); });
page.on('requestfailed', r => { pending.delete(r.url()); console.log('FAILED', r.url(), r.failure()?.errorText); });
try {
  await page.goto('http://localhost:8131/planet.html?fast=1', { waitUntil: 'load', timeout: 15000 });
  console.log('loaded OK');
} catch (e) {
  console.log('nav error:', e.message);
}
console.log('--- still pending ---');
for (const [url, t] of pending) console.log(url);
await browser.close();
