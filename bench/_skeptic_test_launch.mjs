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
console.log('launched, navigating...');
await page.goto('http://localhost:8131/planet.html?fast=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('dom loaded');
await new Promise(r => setTimeout(r, 3000));
const title = await page.title();
console.log('title', title);
await browser.close();
