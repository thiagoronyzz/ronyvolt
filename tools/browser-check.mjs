/**
 * RUNTIME VALIDATION of the MP3-on-the-road bug + photographic A/B capture.
 *
 * Boots the real Vite dev server in headless Chromium (SwiftShader WebGL2),
 * imports a real WAV through the real file picker, presses the real play
 * button, closes the modal, starts a real race and checks that the same audio
 * element is still playing with an advancing currentTime. Then screenshots the
 * race with and without the photographic pass.
 *
 * usage:
 *   LD_LIBRARY_PATH=/tmp/chromium-root/lib:/tmp/chromium-root \
 *   node tools/browser-check.mjs [photo|plain] [outfile]
 */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import fs from 'fs';
import path from 'path';

const MODE = process.argv[2] || 'photo';
const OUT = process.argv[3] || `/home/user/ronyvolt/docs/preview/browser-race-${MODE}.png`;
const VISUAL_ONLY = process.argv[4] === 'visual';
const URL = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const TONE = '/tmp/velocity-browser-tone.wav';

// 1 s of 440 Hz mono PCM16 — a real decodable audio file for the file picker.
function writeTone() {
  const rate = 8000;
  const n = rate * 30; // 30 s, so currentTime must advance during the race
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  fs.writeFileSync(TONE, buf);
}
writeTone();

try {
  await chromium.font();
} catch { /* fonts are optional in the sandbox */ }
const exe = await chromium.executablePath();
const browser = await puppeteer.launch({
  executablePath: exe,
  args: [
    ...chromium.args,
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,800',
  ],
  headless: 'shell',
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});

const logs = [];
const page = await browser.newPage();
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};

async function clickText(text) {
  const found = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, summary, a')];
    const el = els.find((e) => (e.textContent || '').toLowerCase().includes(t.toLowerCase()));
    if (!el) return false;
    el.click();
    return true;
  }, text);
  if (!found) throw new Error(`button not found: ${text}`);
  await sleep(450);
}

try {
  if (MODE === 'plain') {
    await page.evaluateOnNewDocument(() => {
      try {
        const raw = localStorage.getItem('velocity_settings_v1');
        const s = raw ? JSON.parse(raw) : {};
        localStorage.setItem('velocity_settings_v1', JSON.stringify({ ...s, photographicAssets: false }));
      } catch { /* origin not ready yet; the flag is optional for A/B */ }
    });
  }

  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await sleep(7000);

  // --- Photographic assets actually fetched? ------------------------------
  results.photoRequests = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((r) => r.name.includes('/assets/photos/generated/'))
      .map((r) => r.name.split('/').pop())
  );

  if (VISUAL_ONLY) {
    await clickText('CORRER');
    await sleep(11000);
    results.inRace = await page.evaluate(() => {
      const d = window.__velocity;
      const photos = d?.photos();
      return {
        photosEnabled: photos?.enabled,
        photosLoaded: photos?.loaded,
        photoErrors: photos?.errors,
        menuPaused: d?.audioEngine.isMenuPaused(),
        canvases: document.querySelectorAll('canvas').length,
      };
    });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.screenshot({ path: OUT });
    results.screenshot = OUT;
    console.log(JSON.stringify(results, null, 2));
    console.log('--- console (last 40) ---');
    console.log(logs.slice(-40).join('\n'));
    await browser.close();
    process.exit(0);
  }

  // --- Open "Mais → Música → Minhas Músicas" ------------------------------
  await clickText('Mais');
  await clickText('Música');
  await clickText('Minhas Músicas');
  await sleep(600);

  const input = await page.$('input[type="file"][accept^="audio"]');
  if (!input) throw new Error('MP3 file input not found');
  await input.uploadFile(TONE);
  await sleep(1600);

  results.afterImport = await page.evaluate(() => {
    const d = window.__velocity;
    if (!d) return { error: 'runtime debug handle missing' };
    return {
      views: d.customMusicMedia.getViews().map((v) => ({ name: v.name, hasUrl: !!v.url })),
      queue: d.customMusicPlayer.getState(),
    };
  });

  // --- Press the real orange play button in the MP3 panel -----------------
  const played = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const play = btns.find((b) => (b.getAttribute('title') || '') === 'Tocar' && b.disabled === false);
    if (!play) return false;
    play.click();
    return true;
  });
  results.playButtonClicked = played;
  await sleep(1400);

  results.afterPlay = await page.evaluate(() => {
    const d = window.__velocity;
    if (!d) return { error: 'runtime debug handle missing' };
    const s = d.customMusicPlayer.getState();
    return { ...s, station: d.audioEngine.getStation(), mode: d.audioEngine.getMusicMode() };
  });

  // --- Close the modal and START THE RACE ---------------------------------
  await page.evaluate(() => {
    const close = [...document.querySelectorAll('button')].find((b) => b.getAttribute('title') === 'Fechar' || (b.textContent || '').trim() === '✕');
    close?.click();
  });
  await sleep(500);
  await clickText('CORRER');
  await sleep(11000);

  results.inRace = await page.evaluate(() => {
    const d = window.__velocity;
    if (!d) return { error: 'runtime debug handle missing' };
    const s = d.customMusicPlayer.getState();
    const photos = d.photos();
    return {
      ...s,
      station: d.audioEngine.getStation(),
      menuPaused: d.audioEngine.isMenuPaused(),
      photosEnabled: photos.enabled,
      photosLoaded: photos.loaded,
      photoErrors: photos.errors,
      canvases: document.querySelectorAll('canvas').length,
    };
  });
  await sleep(1500);
  results.currentTimeLater = await page.evaluate(() => {
    const d = window.__velocity;
    return d ? d.customMusicPlayer.getState().currentTime : -1;
  });
  results.audioAdvancedOnRoad =
    results.inRace.playing === true &&
    results.inRace.station === 'custom_usb' &&
    results.currentTimeLater > results.inRace.currentTime + 0.2;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT });
  results.screenshot = OUT;
} catch (e) {
  results.error = e instanceof Error ? e.message : String(e);
  try { await page.screenshot({ path: OUT }); } catch { /* ignore */ }
}

console.log(JSON.stringify(results, null, 2));
console.log('--- console (last 40) ---');
console.log(logs.slice(-40).join('\n'));
await browser.close();
