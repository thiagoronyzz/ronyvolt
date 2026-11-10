// Headless capture harness: boots the Vite dev server build in Chromium with
// SwiftShader (software WebGL2) and screenshots the game so visual passes can
// actually be inspected instead of guessed at.
//
// usage: node tools/shoot.mjs <url> <outfile> [waitMs] [script.js]
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { writeFileSync } from 'fs';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const out = process.argv[3] || '/tmp/shot.png';
const waitMs = Number(process.argv[4] || 9000);
const scriptFile = process.argv[5];

const exe = await chromium.executablePath();
const browser = await puppeteer.launch({
  executablePath: exe,
  args: [
    ...chromium.args,
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--window-size=1280,800',
  ],
  headless: 'shell',
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await new Promise((r) => setTimeout(r, waitMs));

if (scriptFile) {
  const code = (await import('fs')).readFileSync(scriptFile, 'utf8');
  try {
    const res = await page.evaluate(code);
    if (res !== undefined) logs.push(`[eval] ${JSON.stringify(res)}`);
  } catch (e) {
    logs.push(`[evalerror] ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 2500));
}

await page.screenshot({ path: out });
console.log(logs.slice(0, 200).join('\n'));
console.log('--- saved', out);
await browser.close();
