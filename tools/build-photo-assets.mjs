/**
 * BUILD PHOTOGRAPHIC ASSETS
 * =========================
 * Offline derivation of PBR maps from REAL photographs. Run once with:
 *
 *     npm run assets:photos
 *
 * Inputs:  assets/photos/source/*.jpg  (see assets/photos/CREDITS.md)
 * Outputs: public/assets/photos/generated/*  + docs/preview/photographic-assets.png
 *
 * No AI imagery, no stock render, no raster editor: a pure-JS JPEG/PNG pipeline
 * crops, mirror-tiles (so textures repeat without seams), measures luminance as
 * a height field, and bakes Sobel normals / variance roughness / AO from it.
 * That is what turns a flat photo into a light-reactive surface in WebGL.
 */
import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const ROOT = process.cwd();
// Originals are build inputs, NOT shipped in the Vite public directory: the
// browser only needs the derived maps and the 480x300 credit thumbnails.
const SRC = path.join(ROOT, 'assets/photos/source');
const OUT = path.join(ROOT, 'public/assets/photos/generated');
const PREVIEW = path.join(ROOT, 'docs/preview/photographic-assets.png');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(PREVIEW), { recursive: true });

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function decodeJpeg(file) {
  const im = jpeg.decode(fs.readFileSync(file), { useTArray: true, formatAsRGBA: true });
  return { width: im.width, height: im.height, data: new Uint8ClampedArray(im.data) };
}
function encodeJpeg(im, quality = 86) {
  return jpeg.encode({ data: Buffer.from(im.data), width: im.width, height: im.height }, quality).data;
}
function encodePng(im) {
  return PNG.sync.write({ width: im.width, height: im.height, data: Buffer.from(im.data) });
}
function writeJpeg(name, im, quality = 86) {
  fs.writeFileSync(path.join(OUT, name), encodeJpeg(im, quality));
  return { name, bytes: fs.statSync(path.join(OUT, name)).size };
}
function writePng(name, im) {
  fs.writeFileSync(path.join(OUT, name), encodePng(im));
  return { name, bytes: fs.statSync(path.join(OUT, name)).size };
}
function blank(w, h, rgba = [0, 0, 0, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { width: w, height: h, data };
}
function px(im, x, y) {
  const i = (y * im.width + x) * 4;
  return [im.data[i], im.data[i + 1], im.data[i + 2], im.data[i + 3]];
}
function setPx(im, x, y, c) {
  const i = (y * im.width + x) * 4;
  im.data[i] = c[0];
  im.data[i + 1] = c[1];
  im.data[i + 2] = c[2];
  im.data[i + 3] = c[3] ?? 255;
}
function crop(im, fx, fy, fw, fh) {
  const x = Math.round(im.width * fx);
  const y = Math.round(im.height * fy);
  const w = Math.round(im.width * fw);
  const h = Math.round(im.height * fh);
  const out = blank(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const sx = clamp(x + i, 0, im.width - 1);
      const sy = clamp(y + j, 0, im.height - 1);
      setPx(out, i, j, px(im, sx, sy));
    }
  }
  return out;
}
/** Bilinear resize with clamped edges. */
function resize(im, w, h) {
  const out = blank(w, h);
  const sx = im.width / w;
  const sy = im.height / h;
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    const y0 = Math.floor(fy);
    const y1 = Math.min(im.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      const x0 = Math.floor(fx);
      const x1 = Math.min(im.width - 1, x0 + 1);
      const wx = fx - x0;
      const c00 = px(im, clamp(x0, 0, im.width - 1), clamp(y0, 0, im.height - 1));
      const c10 = px(im, x1, clamp(y0, 0, im.height - 1));
      const c01 = px(im, clamp(x0, 0, im.width - 1), y1);
      const c11 = px(im, x1, y1);
      const c = [0, 0, 0, 255];
      for (let k = 0; k < 3; k++) {
        const a = lerp(c00[k], c10[k], wx);
        const b = lerp(c01[k], c11[k], wx);
        c[k] = lerp(a, b, wy);
      }
      setPx(out, x, y, c);
    }
  }
  return out;
}
/**
 * Mirror quilting: take a centre square, then sample a 2x2 mirrored mosaic from
 * its middle. All four edges become mirror-continuous, so RepeatWrapping has no
 * visible seam. This is the standard "make a photo tileable" trick used for
 * scanned surfaces.
 */
function mirrorTile(im, size = 1024) {
  const min = Math.min(im.width, im.height);
  const c = crop(im, (im.width - min) / 2 / im.width, (im.height - min) / 2 / im.height, min / im.width, min / im.height);
  const sq = resize(c, size, size);
  const out = blank(size, size);
  const sample = (u, v) => {
    let x = ((u % (2 * size)) + 2 * size) % (2 * size);
    let y = ((v % (2 * size)) + 2 * size) % (2 * size);
    const qx = Math.floor(x / size);
    const qy = Math.floor(y / size);
    let lx = x % size;
    let ly = y % size;
    if (qx === 1) lx = size - 1 - lx;
    if (qy === 1) ly = size - 1 - ly;
    return px(sq, lx, ly);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) setPx(out, x, y, sample(size / 2 + x, size / 2 + y));
  }
  return out;
}
/** Horizontal mirror mosaic: left and right edges match exactly. */
function horizontalSeamless(im, w, h) {
  const r = resize(im, w, h);
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xx = w / 2 + x;
      const sxp = xx < w ? xx : 2 * w - 1 - xx;
      setPx(out, x, y, px(r, Math.floor(sxp), y));
    }
  }
  return out;
}
function desaturate(im, amount) {
  for (let i = 0; i < im.width * im.height; i++) {
    const o = i * 4;
    const l = 0.299 * im.data[o] + 0.587 * im.data[o + 1] + 0.114 * im.data[o + 2];
    im.data[o] = lerp(im.data[o], l, amount);
    im.data[o + 1] = lerp(im.data[o + 1], l, amount);
    im.data[o + 2] = lerp(im.data[o + 2], l, amount);
  }
  return im;
}
function heightField(im) {
  const w = im.width;
  const h = im.height;
  const raw = new Float32Array(w * h);
  let mean = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const l = (0.299 * im.data[o] + 0.587 * im.data[o + 1] + 0.114 * im.data[o + 2]) / 255;
    raw[i] = l;
    mean += l;
  }
  mean /= w * h;
  let variance = 0;
  for (let i = 0; i < w * h; i++) variance += (raw[i] - mean) ** 2;
  const std = Math.max(0.04, Math.sqrt(variance / (w * h)));
  for (let i = 0; i < w * h; i++) raw[i] = clamp((raw[i] - mean) / (std * 2.4) + 0.5, 0, 1);
  return { w, h, raw };
}
function normalMap(field, strength = 2.2) {
  const { w, h, raw } = field;
  const out = blank(w, h);
  const at = (x, y) => raw[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel, wrapped so the result is tileable too.
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br - tl - 2 * l - bl) * strength;
      const dy = (bl + 2 * b + br - tl - 2 * t - tr) * strength;
      const nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      setPx(out, x, y, [
        Math.round((nx / len * 0.5 + 0.5) * 255),
        Math.round((ny / len * 0.5 + 0.5) * 255),
        Math.round((nz / len * 0.5 + 0.5) * 255),
        255,
      ]);
    }
  }
  return out;
}
function roughnessMap(field, base = 0.82, spread = 0.16) {
  const { w, h, raw } = field;
  const out = blank(w, h);
  const at = (x, y) => raw[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Local variance = micro-roughness. Smooth binder stays slightly glossier.
      let m = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) m += at(x + i, y + j);
      m /= 25;
      let v = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) v += (at(x + i, y + j) - m) ** 2;
      v = Math.sqrt(v / 25);
      const rough = clamp(base + (v - 0.12) * spread * 3 - (0.5 - at(x, y)) * 0.08, 0.45, 1);
      const c = Math.round(rough * 255);
      setPx(out, x, y, [c, c, c, 255]);
    }
  }
  return out;
}
function aoMap(field) {
  const { w, h, raw } = field;
  const out = blank(w, h);
  const at = (x, y) => raw[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) m += at(x + i, y + j);
      m /= 169;
      const occ = clamp(0.72 + at(x, y) * 0.34 - (m - 0.5) * 0.25, 0.55, 1);
      const c = Math.round(occ * 255);
      setPx(out, x, y, [c, c, c, 255]);
    }
  }
  return out;
}
function drawRoadMarkings(im) {
  const w = im.width, h = im.height;
  const period = 128, dash = 74;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = px(im, x, y);
      const u = x / w;
      // Rubbered-in racing groove, two wheel paths, darker and a touch bluer.
      const groove = Math.exp(-(((u - 0.31) / 0.085) ** 2)) + Math.exp(-(((u - 0.69) / 0.085) ** 2));
      let r = c[0] * (1 - groove * 0.2);
      let g = c[1] * (1 - groove * 0.2);
      let b = c[2] * (1 - groove * 0.16);
      // Worn white edge lines (paint follows the aggregate, not flat paper).
      const edge = (u > 0.045 && u < 0.062) || (u > 0.938 && u < 0.955);
      if (edge) {
        const wear = 0.72 + 0.28 * ((Math.sin(y * 0.19 + x * 0.31) + 1) / 2);
        r = lerp(r, 228, 0.82 * wear);
        g = lerp(g, 230, 0.82 * wear);
        b = lerp(b, 226, 0.82 * wear);
      }
      // Dashed amber centreline. Period divides the tile height -> tileable.
      if (u > 0.496 && u < 0.504 && y % period < dash) {
        const wear = 0.74 + 0.26 * ((Math.sin(y * 0.23) + 1) / 2);
        r = lerp(r, 236, 0.86 * wear);
        g = lerp(g, 178, 0.86 * wear);
        b = lerp(b, 74, 0.86 * wear);
      }
      setPx(im, x, y, [r, g, b, 255]);
    }
  }
  return im;
}
function alphaRamp(im, top = 0.18, bottom = 0.18, maxAlpha = 1) {
  const h = im.height;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    let a = 1;
    if (v < top) a = v / top;
    else if (v > 1 - bottom) a = (1 - v) / bottom;
    a = clamp(a, 0, 1) * maxAlpha;
    for (let x = 0; x < im.width; x++) {
      const c = px(im, x, y);
      setPx(im, x, y, [c[0], c[1], c[2], Math.round(a * 255)]);
    }
  }
  return im;
}
function tint(im, r, g, b, amount) {
  for (let i = 0; i < im.width * im.height; i++) {
    const o = i * 4;
    im.data[o] = lerp(im.data[o], r, amount);
    im.data[o + 1] = lerp(im.data[o + 1], g, amount);
    im.data[o + 2] = lerp(im.data[o + 2], b, amount);
  }
  return im;
}

const outputs = [];
const log = (label) => console.log('  ✓', label);

// ---------------------------------------------------------------------------
// 1. ASPHALT — real aggregate + derived microrelief + painted markings
// ---------------------------------------------------------------------------
{
  const src = decodeJpeg(path.join(SRC, 'asphalt-public-domain.jpg'));
  const tile = mirrorTile(src, 1024);
  // The public-domain source was photographed under a hard, bright light: its
  // aggregate averages ~0.62 luminance. Real road asphalt is dark charcoal
  // (~0.16–0.25 sRGB), and using the raw photograph makes the track look like
  // white gravel. Keep the *measured* aggregate contrast, scale the albedo to
  // physical road values and add the slight cool cast of bitumen binder.
  const clean = { width: tile.width, height: tile.height, data: new Uint8ClampedArray(tile.data) };
  for (let i = 0; i < clean.width * clean.height; i++) {
    const o = i * 4;
    clean.data[o] = clamp(clean.data[o] * 0.34, 0, 255);
    clean.data[o + 1] = clamp(clean.data[o + 1] * 0.36, 0, 255);
    clean.data[o + 2] = clamp(clean.data[o + 2] * 0.40, 0, 255);
  }
  outputs.push(writeJpeg('asphalt_clean.jpg', clean, 88));
  // A low normal strength is deliberate: Sobel on a 1024² aggregate photo is
  // extremely high-frequency, and a strong normal produces specular streaking
  // along the road's vanishing direction (microfacet aliasing).
  const field = heightField(clean);
  outputs.push(writePng('asphalt_normal.png', normalMap(field, 0.85)));
  outputs.push(writePng('asphalt_roughness.png', roughnessMap(field, 0.84, 0.14)));
  outputs.push(writePng('asphalt_ao.png', aoMap(field)));
  const albedo = { width: clean.width, height: clean.height, data: new Uint8ClampedArray(clean.data) };
  drawRoadMarkings(albedo);
  outputs.push(writeJpeg('asphalt_albedo.jpg', albedo, 90));
  log('asphalt: albedo + normal + roughness + AO');
}

// ---------------------------------------------------------------------------
// 2. GROUND — real turf, desaturated so biome vertex colours still control hue
// ---------------------------------------------------------------------------
{
  const src = decodeJpeg(path.join(SRC, 'grass-unsplash.jpg'));
  const tile = desaturate(mirrorTile(src, 1024), 0.72);
  // Lift the grey detail so multiplying by a green vertex colour does not crush it.
  for (let i = 0; i < tile.width * tile.height; i++) {
    const o = i * 4;
    const l = 0.299 * tile.data[o] + 0.587 * tile.data[o + 1] + 0.114 * tile.data[o + 2];
    const k = clamp(0.62 + l / 255 * 0.55, 0, 1) * 255;
    tile.data[o] = tile.data[o + 1] = tile.data[o + 2] = k;
  }
  outputs.push(writeJpeg('ground_detail.jpg', tile, 88));
  outputs.push(writePng('ground_normal.png', normalMap(heightField(tile), 1.35)));
  log('ground: real grass detail + normal');
}

// ---------------------------------------------------------------------------
// 3. BARK — public-domain close-up, real ridge relief
// ---------------------------------------------------------------------------
{
  const src = decodeJpeg(path.join(SRC, 'bark-public-domain.jpg'));
  const tile = desaturate(mirrorTile(src, 1024), 0.32);
  outputs.push(writeJpeg('bark_albedo.jpg', tile, 88));
  outputs.push(writePng('bark_normal.png', normalMap(heightField(tile), 3.0)));
  log('bark: photo albedo + ridge normal');
}

// ---------------------------------------------------------------------------
// 4. SKY / HORIZON / LIGHT PROBE — real clouds, real guardrail, real car scene
// ---------------------------------------------------------------------------
{
  const road = decodeJpeg(path.join(SRC, 'road-guardrail-unsplash.jpg'));
  const skyCrop = crop(road, 0, 0, 1, 0.55);
  outputs.push(writeJpeg('sky_day.jpg', horizontalSeamless(skyCrop, 2048, 1024), 88));

  const horizon = alphaRamp(horizontalSeamless(crop(road, 0, 0.43, 1, 0.34), 2048, 512), 0.22, 0.2, 1);
  outputs.push(writePng('horizon_day.png', horizon));

  const porsche = decodeJpeg(path.join(SRC, 'car-porsche-sunset-unsplash.jpg'));
  const probe = alphaRamp(horizontalSeamless(crop(porsche, 0, 0.28, 1, 0.42), 2048, 512), 0.24, 0.24, 0.72);
  outputs.push(writePng('car_probe.png', tint(probe, 120, 90, 80, 0.08)));
  log('sky / horizon / car light probe');
}

// ---------------------------------------------------------------------------
// 5. NIGHT SKY — real 360° ESO panorama, stretched into a hemisphere band
// ---------------------------------------------------------------------------
{
  const eso = decodeJpeg(path.join(SRC, 'night-sky-eso.jpg'));
  const upper = resize(eso, 2048, 512);
  const out = blank(2048, 1024, [5, 7, 15, 255]);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 2048; x++) setPx(out, x, y, px(upper, x, y));
  }
  // Dark ground hemisphere with a faint horizon glow.
  for (let y = 512; y < 1024; y++) {
    const t = (y - 512) / 512;
    const glow = Math.exp(-t * 9) * 16;
    for (let x = 0; x < 2048; x++) setPx(out, x, y, [5 + glow, 7 + glow * 0.8, 15 + glow * 0.6, 255]);
  }
  outputs.push(writeJpeg('sky_night.jpg', out, 88));
  log('night sky: ESO/H.H. Heyer CC BY 4.0');
}

// ---------------------------------------------------------------------------
// 6. ENVIRONMENT PROBES (equirectangular IBL) — real sky + real road/car
// ---------------------------------------------------------------------------
{
  const daySky = decodeJpeg(path.join(OUT, 'sky_day.jpg'));
  const nightSky = decodeJpeg(path.join(OUT, 'sky_night.jpg'));
  const asphalt = decodeJpeg(path.join(OUT, 'asphalt_clean.jpg'));
  const probePng = PNG.sync.read(fs.readFileSync(path.join(OUT, 'car_probe.png')));
  const probe = { width: probePng.width, height: probePng.height, data: new Uint8ClampedArray(probePng.data) };

  const buildEnv = (sky, warm, night) => {
    const W = 2048, H = 1024;
    const out = blank(W, H, [6, 9, 16, 255]);
    const skyHalf = resize(sky, W, H / 2);
    const ground = resize(asphalt, W, H / 2);
    const probeHalf = resize(probe, W, H / 2);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      for (let x = 0; x < W; x++) {
        let c;
        if (y < H / 2) {
          c = px(skyHalf, x, y);
          // Slight horizon brightening (real skies have more optical depth there).
          const nearHorizon = Math.exp(-Math.abs(v - 0.5) * 14) * 0.14;
          c = [c[0] * (1 + nearHorizon), c[1] * (1 + nearHorizon), c[2] * (1 + nearHorizon), 255];
        } else {
          const gy = y - H / 2;
          const g = px(ground, x, gy);
          const p = px(probeHalf, x, gy);
          // Real photographed car/road colours bleed into the lower hemisphere:
          // that is what a polished bonnet actually reflects.
          const pa = (p[3] / 255) * warm;
          const darken = night ? 0.16 : 0.42;
          c = [
            lerp(g[0] * darken, p[0] * 0.55, pa),
            lerp(g[1] * darken, p[1] * 0.55, pa),
            lerp(g[2] * darken, p[2] * 0.55, pa),
            255,
          ];
          // Warm horizon bounce fades into dark tarmac toward the nadir.
          const bounce = Math.exp(-(((v - 0.5) / 0.09) ** 2)) * (night ? 12 : 34) * warm;
          c = [c[0] + bounce, c[1] + bounce * 0.72, c[2] + bounce * 0.42, 255];
        }
        setPx(out, x, y, c);
      }
    }
    return out;
  };
  outputs.push(writeJpeg('environment_day.jpg', buildEnv(daySky, 1, false), 88));
  outputs.push(writeJpeg('environment_night.jpg', buildEnv(nightSky, 0.35, true), 88));
  log('IBL probes: real clouds + real road/car reflections (day & night)');
}

// ---------------------------------------------------------------------------
// 7. REAL CAR DETAILS — headlight / taillight crops from the photos
// ---------------------------------------------------------------------------
{
  const gtr = decodeJpeg(path.join(SRC, 'car-gtr-front-unsplash.jpg'));
  // Tight crop on the right-hand GT-R projector + LED daytime running light:
  // the internal reflectors, cyan lens tint and DRL strip are what a real
  // headlight shows through its glass — a procedural fresnel pattern cannot.
  const head = resize(crop(gtr, 0.385, 0.565, 0.145, 0.062), 512, 256);
  outputs.push(writeJpeg('headlight.jpg', head, 92));
  const bmw = decodeJpeg(path.join(SRC, 'car-bmw-rear-unsplash.jpg'));
  // Tight crop on the right BMW LED light guide.
  const tail = resize(crop(bmw, 0.805, 0.385, 0.075, 0.085), 512, 256);
  outputs.push(writeJpeg('taillight.jpg', tail, 92));
  log('car details: headlight + taillight');
}

// ---------------------------------------------------------------------------
// 8. CREDIT THUMBNAILS — the in-game credits window must NOT download 3 MB
// ---------------------------------------------------------------------------
{
  const THUMBS = path.join(OUT, 'thumbs');
  fs.mkdirSync(THUMBS, { recursive: true });
  const creditFiles = [
    'asphalt-public-domain.jpg', 'road-guardrail-unsplash.jpg',
    'car-gtr-front-unsplash.jpg', 'car-bmw-rear-unsplash.jpg',
    'car-porsche-sunset-unsplash.jpg', 'grass-unsplash.jpg',
    'bark-public-domain.jpg', 'night-sky-eso.jpg',
  ];
  const ratio = 480 / 300;
  for (const file of creditFiles) {
    const im = decodeJpeg(path.join(SRC, file));
    let cw = im.width;
    let ch = Math.round(cw / ratio);
    if (ch > im.height) { ch = im.height; cw = Math.round(ch * ratio); }
    const centred = crop(
      im,
      (im.width - cw) / 2 / im.width,
      (im.height - ch) / 2 / im.height,
      cw / im.width,
      ch / im.height
    );
    const thumb = resize(centred, 480, 300);
    fs.writeFileSync(path.join(THUMBS, file), encodeJpeg(thumb, 82));
  }
  log('8 credit thumbnails (480x300, ~40 KB total instead of 9 MB)');
}

// ---------------------------------------------------------------------------
// 9. CONTACT SHEET — visual inspection of the whole photographic pass
// ---------------------------------------------------------------------------
{
  const cells = [
    ['FOTO: asfalto real', path.join(SRC, 'asphalt-public-domain.jpg'), 'jpg'],
    ['MAPA: albedo + faixas', path.join(OUT, 'asphalt_albedo.jpg'), 'jpg'],
    ['MAPA: normal do agregado', path.join(OUT, 'asphalt_normal.png'), 'png'],
    ['FOTO: estrada / guardrail', path.join(SRC, 'road-guardrail-unsplash.jpg'), 'jpg'],
    ['CÉU: nuvens reais', path.join(OUT, 'sky_day.jpg'), 'jpg'],
    ['HORIZONTE: foto real', path.join(OUT, 'horizon_day.png'), 'png'],
    ['FOTO: carro real (GT-R)', path.join(SRC, 'car-gtr-front-unsplash.jpg'), 'jpg'],
    ['FOTO: carro real (911)', path.join(SRC, 'car-porsche-sunset-unsplash.jpg'), 'jpg'],
    ['DETALHE: farol real', path.join(OUT, 'headlight.jpg'), 'jpg'],
    ['FOTO: grama real', path.join(SRC, 'grass-unsplash.jpg'), 'jpg'],
    ['FOTO: casca real', path.join(SRC, 'bark-public-domain.jpg'), 'jpg'],
    ['IBL: ceu + carro real', path.join(OUT, 'environment_day.jpg'), 'jpg'],
    ['IBL: noite ESO', path.join(OUT, 'environment_night.jpg'), 'jpg'],
    ['DETALHE: lanterna real', path.join(OUT, 'taillight.jpg'), 'jpg'],
    ['FOTO: BMW real', path.join(SRC, 'car-bmw-rear-unsplash.jpg'), 'jpg'],
  ];
  const CW = 400, CH = 250, COLS = 3;
  const sheet = blank(CW * COLS, CH * Math.ceil(cells.length / COLS), [10, 13, 20, 255]);
  for (let n = 0; n < cells.length; n++) {
    const [, file, kind] = cells[n];
    let im;
    if (kind === 'jpg') im = decodeJpeg(file);
    else {
      const p = PNG.sync.read(fs.readFileSync(file));
      im = { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) };
    }
    const fit = resize(im, CW - 12, CH - 44);
    const ox = (n % COLS) * CW + 6;
    const oy = Math.floor(n / COLS) * CH + 34;
    for (let y = 0; y < fit.height; y++) {
      for (let x = 0; x < fit.width; x++) {
        const c = px(fit, x, y);
        // Composite alpha over the dark card background.
        const bg = px(sheet, ox + x, oy + y);
        const a = c[3] / 255;
        setPx(sheet, ox + x, oy + y, [
          lerp(bg[0], c[0], a), lerp(bg[1], c[1], a), lerp(bg[2], c[2], a), 255,
        ]);
      }
    }
    // Simple 5x7 bitmap font for the label (keeps the tool dependency-free).
    const glyphs = {
      A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'],
      C: ['01111','10000','10000','10000','10000','10000','01111'], D: ['11110','10001','10001','10001','10001','10001','11110'],
      E: ['11111','10000','10000','11110','10000','10000','11111'], F: ['11111','10000','10000','11110','10000','10000','10000'],
      G: ['01111','10000','10000','10111','10001','10001','01111'], H: ['10001','10001','10001','11111','10001','10001','10001'],
      I: ['11111','00100','00100','00100','00100','00100','11111'], J: ['00111','00010','00010','00010','10010','10010','01100'],
      K: ['10001','10010','10100','11000','10100','10010','10001'], L: ['10000','10000','10000','10000','10000','10000','11111'],
      M: ['10001','11011','10101','10101','10001','10001','10001'], N: ['10001','11001','10101','10011','10001','10001','10001'],
      O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'],
      Q: ['01110','10001','10001','10001','10101','10010','01101'], R: ['11110','10001','10001','11110','10100','10010','10001'],
      S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'],
      U: ['10001','10001','10001','10001','10001','10001','01110'], V: ['10001','10001','10001','10001','10001','01010','00100'],
      W: ['10001','10001','10001','10101','10101','11011','10001'], X: ['10001','10001','01010','00100','01010','10001','10001'],
      Y: ['10001','10001','01010','00100','00100','00100','00100'], Z: ['11111','00001','00010','00100','01000','10000','11111'],
      '0': ['01110','10001','10011','10101','11001','10001','01110'], '1': ['00100','01100','00100','00100','00100','00100','01110'],
      '2': ['01110','10001','00001','00010','00100','01000','11111'], '3': ['11110','00001','00001','01110','00001','00001','11110'],
      '4': ['00010','00110','01010','10010','11111','00010','00010'], '5': ['11111','10000','10000','11110','00001','00001','11110'],
      '6': ['00110','01000','10000','11110','10001','10001','01110'], '7': ['11111','00001','00010','00100','01000','01000','01000'],
      '8': ['01110','10001','10001','01110','10001','10001','01110'], '9': ['01110','10001','10001','01111','00001','00010','01100'],
      ':': ['00000','00100','00100','00000','00100','00100','00000'], '-': ['00000','00000','00000','11111','00000','00000','00000'],
      '/': ['00001','00001','00010','00100','01000','10000','10000'], '+': ['00000','00100','00100','11111','00100','00100','00000'],
      ' ': ['00000','00000','00000','00000','00000','00000','00000'], '.': ['00000','00000','00000','00000','00000','00100','00100'],
      '(': ['00010','00100','01000','01000','01000','00100','00010'], ')': ['01000','00100','00010','00010','00010','00100','01000'],
      'É': ['11111','00100','00100','11110','10000','10000','11111'], 'Á': ['01110','10001','11111','10001','10001','10001','10001'],
      'Ã': ['10101','01110','10001','11111','10001','10001','10001'], 'Ç': ['01111','10000','10000','10000','10000','10000','01111'],
      'Ê': ['11111','00100','00100','11110','00100','00100','11111'], 'Ô': ['00100','01110','10001','10001','10001','10001','01110'],
      'Ó': ['00100','01110','10001','10001','10001','10001','01110'], 'Í': ['00100','11111','00100','00100','00100','00100','11111'],
    };
    const label = cells[n][0].toUpperCase().replace(/[ÀÁÂÃÄ]/g, 'A').replace(/[ÈÉÊË]/g, 'E').replace(/[ÌÍÎÏ]/g, 'I')
      .replace(/[ÒÓÔÕÖ]/g, 'O').replace(/[ÙÚÛÜ]/g, 'U').replace(/Ç/g, 'C');
    let cursor = (n % COLS) * CW + 8;
    for (const ch of label) {
      const g = glyphs[ch] ?? glyphs[' '];
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (g[gy][gx] === '1') {
            for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
              const xx = cursor + gx * 2 + dx, yy = Math.floor(n / COLS) * CH + 8 + gy * 2 + dy;
              if (xx < sheet.width && yy < sheet.height) setPx(sheet, xx, yy, [255, 149, 0, 255]);
            }
          }
        }
      }
      cursor += 12;
    }
  }
  fs.writeFileSync(PREVIEW, encodePng(sheet));
  log('contact sheet → docs/preview/photographic-assets.png');
}

fs.writeFileSync(
  path.join(OUT, 'manifest.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), files: outputs }, null, 2) + '\n'
);
console.log(`\n${outputs.length} derived files written to ${path.relative(ROOT, OUT)}`);
