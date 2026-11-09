/**
 * PROCEDURAL PBR TEXTURE FACTORY
 * ==============================
 *
 * No external assets ship with this project: every pixel is generated at
 * runtime. That constraint is fine for realism *if* the maps are physically
 * motivated, and catastrophic if they are "noise with a colour multiplied on".
 *
 * The rule followed throughout this file:
 *
 *   1. Build a HEIGHT FIELD first (a scalar function of surface coordinates in
 *      physical units: millimetres, metres).
 *   2. Derive the NORMAL MAP from that height field by central differences, so
 *      the bump direction is always consistent with the colour/rubber/stone.
 *   3. Derive ROUGHNESS from a *different* channel of the same field (or an
 *      independent one), because real surfaces do not get bumpy and glossy
 *      together. Asphalt aggregate is both lighter and rougher; the bitumen
 *      between the stones is darker and glossier. Coupling these two is the
 *      difference between "texture" and "material".
 *   4. Derive AO for cavities (tread grooves, brick mortises, weave valleys).
 *
 * Everything is cached by key: a car built from 12 materials must not re-bake
 * 12 megabytes of pixels every time the garage is reopened.
 */

import * as THREE from 'three';
import {
  fbm2,
  hash2,
  hexToRgb,
  jitterColor,
  seededRandom,
  tileableFbm2,
  tileableWorley2,
  valueNoise2,
} from './noise';

type Ctx2D = CanvasRenderingContext2D;

const TEXTURE_CACHE = new Map<string, unknown>();

export function clearTextureCache(): void {
  for (const v of TEXTURE_CACHE.values()) {
    if (v && typeof (v as { dispose?: () => void }).dispose === 'function') {
      (v as { dispose: () => void }).dispose();
    }
  }
  TEXTURE_CACHE.clear();
}

export function textureCacheSize(): number {
  return TEXTURE_CACHE.size;
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  try {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  } catch {
    return null;
  }
}

function ctx2d(canvas: HTMLCanvasElement): Ctx2D | null {
  try {
    return canvas.getContext('2d', { willReadFrequently: false }) as Ctx2D | null;
  } catch {
    return null;
  }
}

/** Final texture setup shared by every bake: sRGB flag, mipmaps, anisotropy. */
function finish(
  canvas: HTMLCanvasElement,
  opts: { srgb: boolean; repeat?: [number, number]; anisotropy?: number }
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.anisotropy = opts.anisotropy ?? 8;
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 1x1 fallback so materials never carry `null` maps in headless/test builds. */
function solidTexture(hex: string, srgb = true): THREE.CanvasTexture {
  const c = makeCanvas(2, 2);
  if (c) {
    const g = ctx2d(c);
    if (g) {
      g.fillStyle = hex;
      g.fillRect(0, 0, 2, 2);
      return finish(c, { srgb });
    }
  }
  const data = new Uint8Array([128, 128, 128, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex as unknown as THREE.CanvasTexture;
}

/**
 * Runs a per-pixel shader into an ImageData.
 *
 * `fn(u, v, px, py)` returns [r, g, b, a] in 0..255 (sRGB-encoded output).
 * Kept as a plain JS loop on purpose: this code also has to run in the Node
 * test runner where there is no GPU and no OffscreenCanvas.
 *
 * `tileable` wraps the sampling coordinates so the result can be repeated
 * without a seam — the single most common giveaway of a procedural texture.
 */
function bake(
  w: number,
  h: number,
  fn: (u: number, v: number) => [number, number, number, number],
  opts: { srgb: boolean; repeat?: [number, number] }
): THREE.CanvasTexture {
  const canvas = makeCanvas(w, h);
  if (!canvas) return solidTexture('#808080', opts.srgb);
  const g = ctx2d(canvas);
  if (!g) return solidTexture('#808080', opts.srgb);
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const c = fn(u, v);
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = c[3];
    }
  }
  g.putImageData(img, 0, 0);
  return finish(canvas, opts);
}

/**
 * Bakes a scalar height field into THREE maps at once.
 *
 * Normal derivation uses a Sobel operator with horizontal wrap, and the slope
 * is scaled by `strength / texelSize` so that the resulting bump *angle* is
 * independent of texture resolution. That is the detail that keeps a 256 px and
 * a 1024 px bake of the same surface looking like the same surface.
 */
function bakeHeightSet(
  w: number,
  h: number,
  heightFn: (u: number, v: number) => number,
  opts: {
    strength: number;
    roughnessFn?: (u: number, v: number) => number;
    aoStrength?: number;
    aniso?: number;
  }
): { normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture | null; aoMap: THREE.CanvasTexture | null } {
  const canvas = makeCanvas(w, h);
  const g = canvas ? ctx2d(canvas) : null;
  if (!canvas || !g) {
    return {
      normalMap: solidTexture('#8080ff', false),
      roughnessMap: null,
      aoMap: null,
    };
  }

  const field = new Float32Array(w * h);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const s = heightFn(u, v);
      field[y * w + x] = s;
      if (s < min) min = s;
      if (s > max) max = s;
    }
  }
  const span = Math.max(1e-6, max - min);

  // Normal map
  const nimg = g.createImageData(w, h);
  const nd = nimg.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = field[y * w + ((x - 1 + w) % w)];
      const r = field[y * w + ((x + 1) % w)];
      const u = field[((y - 1 + h) % h) * w + x];
      const dn = field[((y + 1) % h) * w + x];
      // Sobel gradient in height units, then normalised into a unit normal.
      const dx = (r - l) * opts.strength;
      const dy = (dn - u) * opts.strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      nd[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      nd[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      nd[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      nd[i + 3] = 255;
    }
  }
  g.putImageData(nimg, 0, 0);
  const normalMap = finish(canvas, { srgb: false });

  let roughnessMap: THREE.CanvasTexture | null = null;
  if (opts.roughnessFn) {
    roughnessMap = bake(
      w,
      h,
      (u, v) => {
        const r = Math.round(Math.min(1, Math.max(0, opts.roughnessFn!(u, v))) * 255);
        return [r, r, r, 255];
      },
      { srgb: false }
    );
  }

  let aoMap: THREE.CanvasTexture | null = null;
  if (opts.aoStrength && opts.aoStrength > 0) {
    aoMap = bake(
      w,
      h,
      (u, v) => {
        // Cavity AO: compare the local height with a wide blur of its
        // neighbourhood. Anything below the local average is in a pit.
        const xi = Math.floor(u * w);
        const yi = Math.floor(v * h);
        const centre = field[yi * w + xi];
        let sum = 0;
        let n = 0;
        for (let dy = -6; dy <= 6; dy += 3) {
          for (let dx = -6; dx <= 6; dx += 3) {
            const sx = (xi + dx + w) % w;
            const sy = (yi + dy + h) % h;
            sum += field[sy * w + sx];
            n++;
          }
        }
        const local = sum / n;
        const cavity = Math.min(1, Math.max(0, (centre - local) / span));
        const ao = 1 - (1 - cavity) * opts.aoStrength!;
        const c = Math.round(Math.min(1, Math.max(0, ao)) * 255);
        return [c, c, c, 255];
      },
      { srgb: false }
    );
  }

  return { normalMap, roughnessMap, aoMap };
}

function cached<T>(key: string, make: () => T): T {
  const hit = TEXTURE_CACHE.get(key);
  if (hit) return hit as T;
  const value = make();
  TEXTURE_CACHE.set(key, value);
  return value;
}

// ---------------------------------------------------------------------------
// AUTOMOTIVE PAINT
// ---------------------------------------------------------------------------

export interface PaintFinishOptions {
  metallic: number; // 0..1 — flake density
  roughness: number; // base roughness of the clearcoat-adjacent layer
  clearcoat: number;
  pearl: boolean;
  matte: boolean;
}

/**
 * Paint surface maps.
 *
 * A car's paint is three physical layers, and each one produces a different
 * artefact that the eye is trained on:
 *
 *  - The **base coat**: metallic flakes suspended in binder. At grazing angles
 *    they sparkle; head-on they nearly vanish. We model that as a
 *    normal-perturbation whose *amplitude* is tied to the view angle by the
 *    renderer's fresnel, so we bake the flake as high-frequency normal detail
 *    and let the BRDF do the rest.
 *  - The **clear coat**: a ~40 µm varnish layer. It is *not* perfectly smooth —
 *    it has "orange peel", a low-frequency waviness from the drying process.
 *    Orange peel is the single most recognisable paint cue in a photograph,
 *    because it makes reflections of straight edges (a door gap, a window
 *    frame) wiggle.
 *  - The **defects**: swirl marks from washing, a stone chip or two, dust.
 */
export function automotivePaintMaps(
  colorHex: string,
  finish: PaintFinishOptions
): {
  albedo: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture | null;
} {
  const key = `paint:${colorHex}:${finish.metallic.toFixed(2)}:${finish.roughness.toFixed(2)}:${finish.matte}`;
  return cached(key, () => {
    const [br, bg, bb] = hexToRgb(colorHex);
    const rng = seededRandom(
      Math.floor(br * 9127) * 37 + Math.floor(bg * 4513) * 13 + Math.floor(bb * 2711)
    );

    // --- albedo: base tint + flake distribution + very subtle mottling ------
    const albedo = bake(
      512,
      512,
      (u, v) => {
        const X = u * 512;
        const Y = v * 512;
        // Large-scale mottling: real paint is never one flat value over 4 m².
        const mott = tileableFbm2(X / 128, Y / 128, 4, 3, 17) - 0.5;
        // Flakes: tiny bright points, density from the finish.
        const flake = tileableWorley2(X / 9, Y / 9, 57, 91);
        const flakeBright = Math.pow(1 - Math.min(1, flake.f1 * 1.6), 3) * finish.metallic;
        // Pearl: a slow interference-like hue shift, not a rainbow.
        const pearl = finish.pearl ? (tileableFbm2(X / 64, Y / 64, 8, 3, 5) - 0.5) * 0.18 : 0;
        const k = 1 + mott * 0.06 + flakeBright * 0.42 + pearl;
        const r = Math.min(255, Math.max(0, Math.round(Math.pow(br * k, 1.0) * 255)));
        const g = Math.min(255, Math.max(0, Math.round(Math.pow(bg * k, 1.0) * 255)));
        const b = Math.min(255, Math.max(0, Math.round(Math.pow(bb * k * (1 + pearl * 0.5), 1.0) * 255)));
        return [r, g, b, 255];
      },
      { srgb: true }
    );

    // --- height: orange peel (low freq) + flakes (high freq) + swirls --------
    const { normalMap, roughnessMap } = bakeHeightSet(
      512,
      512,
      (u, v) => {
        const X = u * 512;
        const Y = v * 512;
        // Orange peel: ~4 mm wavelength features. 512px ≈ 25 cm ⇒ ~50 cells.
        const peel = tileableFbm2(X / 26, Y / 26, 19, 3, 3);
        // Flake: sub-millimetre bumps.
        const fl = tileableWorley2(X / 9, Y / 9, 57, 91);
        const flakeH = Math.pow(1 - Math.min(1, fl.f1 * 1.5), 2) * finish.metallic;
        // Wash swirls: long, shallow, random-direction scratches.
        const swirl = Math.sin((X * 0.09 + Y * 0.03 + tileableFbm2(X / 90, Y / 90, 6, 2, 71) * 14)) * 0.5 + 0.5;
        const swirlGain = finish.matte ? 0 : 0.05;
        return peel * 1.0 + flakeH * (finish.matte ? 0.15 : 0.55) + swirl * swirlGain;
      },
      {
        strength: finish.matte ? 0.4 : 1.15,
        roughnessFn: (u, v) => {
          const X = u * 512;
          const Y = v * 512;
          if (finish.matte) {
            const n = tileableFbm2(X / 32, Y / 32, 16, 3, 41);
            return 0.62 + n * 0.22;
          }
          // Clear coat is uniformly glossy, but orange peel valleys collect a
          // whisper of dust and read very slightly rougher.
          const peel = tileableFbm2(X / 26, Y / 26, 19, 3, 3);
          const swirl = Math.abs(Math.sin((X * 0.09 + Y * 0.03) * 1.0)) * 0.06;
          return finish.roughness + (peel - 0.5) * 0.05 + swirl * 0.35;
        },
      }
    );
    void rng;
    return { albedo, normalMap, roughnessMap };
  });
}

// ---------------------------------------------------------------------------
// CARBON FIBRE
// ---------------------------------------------------------------------------

/**
 * 2x2 twill carbon weave.
 *
 * The tell of a fake carbon texture is a checkerboard. A real twill is a
 * diagonal over-under pattern where each tow is a rounded band — the highlight
 * runs along the tow, not across the cell. We get that by computing a rounded
 * cross-section per tow and building height from it, so the normal map has the
 * anisotropic sheen for free.
 */
export function carbonFibreMaps(): {
  albedo: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  return cached('carbon', () => {
    const w = 512;
    const tow = 16; // pixels per tow
    const weaveAt = (u: number, v: number) => {
      const X = u * w;
      const Y = v * w;
      const cx = Math.floor(X / tow);
      const cy = Math.floor(Y / tow);
      // 2x2 twill: the over/under alternates every two cells on a diagonal.
      const over = ((cx + cy) % 4) < 2;
      const fx = (X % tow) / tow;
      const fy = (Y % tow) / tow;
      // Rounded tow cross-section (sine profile) along the direction of the tow.
      const cross = over ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
      return { over, cross, fx, fy };
    };

    const albedo = bake(
      w,
      w,
      (u, v) => {
        const { over, cross } = weaveAt(u, v);
        // Unidirectional light absorption: a tow catches light along its axis.
        const base = over ? 0.085 : 0.052;
        const k = base + cross * 0.055;
        const r = Math.round(k * 255);
        return [r, r, Math.round(r * 1.06), 255];
      },
      { srgb: true }
    );

    const { normalMap, roughnessMap } = bakeHeightSet(
      w,
      w,
      (u, v) => {
        const { cross, fx, fy } = weaveAt(u, v);
        // Fine fibre strands inside each tow.
        const strand = Math.sin((fx * 7 + fy * 3) * Math.PI * 2) * 0.06;
        return cross + strand;
      },
      {
        strength: 2.6,
        roughnessFn: (u, v) => {
          const { cross } = weaveAt(u, v);
          // The crest of each tow is polished by the mould; the valleys hold resin.
          return 0.34 - cross * 0.16;
        },
        aoStrength: 0.35,
      }
    );

    return { albedo, normalMap, roughnessMap: roughnessMap! };
  });
}

// ---------------------------------------------------------------------------
// TYRE RUBBER
// ---------------------------------------------------------------------------

/**
 * Tyre maps: sidewall on UV0 band 0, tread on the rest.
 *
 * A tyre is not a black cylinder. It has:
 *  - a **tread pattern** of circumferential grooves + lateral sipes that
 *    produce a very specific, repeated normal/AO signature;
 *  - a **sidewall** with a raised lettering band and the bead ring;
 *  - a **shoulder** where tread wraps around with progressive block rounding;
 *  - **dust/brake-dust** that collects in the grooves and lightens them.
 */
export function tireMaps(compoundRoughness = 0.82): {
  albedo: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  return cached(`tire:${compoundRoughness.toFixed(2)}`, () => {
    const w = 512;
    const h = 512;

    // Tread block field. u = around the circumference, v = across the tread.
    const tread = (u: number, v: number) => {
      const U = u * 8; // 8 blocks around per tile
      const V = v;
      const blockU = U % 1;
      // Four circumferential grooves at fixed fractions across the tread.
      const grooves = [0.14, 0.38, 0.62, 0.86];
      let inGroove = 0;
      for (const gv of grooves) {
        const d = Math.abs(V - gv);
        inGroove = Math.max(inGroove, Math.max(0, 1 - d / 0.035));
      }
      // Lateral sipes: staggered every other row, the way a real asymmetric
      // pattern is laid out (this is what makes the pattern read as designed
      // rather than as a grid).
      const row = Math.floor(U);
      const offset = row % 2 === 0 ? 0.0 : 0.5;
      const sip = Math.abs(((blockU + offset) % 1) - 0.5);
      const inSipe = Math.max(0, 1 - (0.5 - sip) / 0.06) * (Math.abs(V - 0.5) > 0.12 ? 1 : 0.35);
      return Math.max(inGroove, inSipe * 0.8);
    };

    const albedo = bake(
      w,
      h,
      (u, v) => {
        const g = tread(u, v);
        const grain = tileableFbm2(u * 190, v * 190, 190, 2, 3);
        // Grooves collect dust and read lighter than the polished block faces.
        const k = 0.115 - g * 0.045 + grain * 0.045;
        const c = Math.round(Math.min(1, Math.max(0, k)) * 255);
        return [c, c, Math.round(c * 1.02), 255];
      },
      { srgb: true }
    );

    const { normalMap, roughnessMap, aoMap } = bakeHeightSet(
      w,
      h,
      (u, v) => {
        const g = tread(u, v);
        const grain = tileableFbm2(u * 260, v * 260, 260, 3, 9);
        // Blocks are crowned: sin across the block gives the rounded top.
        return (1 - g) * 1.0 + grain * 0.18;
      },
      {
        strength: 3.4,
        roughnessFn: (u, v) => {
          const g = tread(u, v);
          // Worn block faces are slightly glossier; grooves are matte and dusty.
          return compoundRoughness + g * 0.1 - 0.03;
        },
        aoStrength: 0.55,
      }
    );
    void aoMap;
    return { albedo, normalMap, roughnessMap: roughnessMap! };
  });
}

// ---------------------------------------------------------------------------
// INTERIOR MATERIALS
// ---------------------------------------------------------------------------

/** Pebbled leather: perlin-grained hides with stitch rows and a satin sheen. */
export function leatherMaps(colorHex: string): {
  albedo: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  return cached(`leather:${colorHex}`, () => {
    const [r0, g0, b0] = hexToRgb(colorHex);
    const w = 512;
    const albedo = bake(
      w,
      w,
      (u, v) => {
        const cells = tileableWorley2(u * 90, v * 90, 90, 21);
        const crease = 1 - Math.min(1, (cells.f2 - cells.f1) * 5);
        const grain = tileableFbm2(u * 200, v * 200, 200, 3, 4);
        const k = 0.82 + grain * 0.24 - crease * 0.24;
        return [
          Math.round(Math.min(1, r0 * k) * 255),
          Math.round(Math.min(1, g0 * k) * 255),
          Math.round(Math.min(1, b0 * k) * 255),
          255,
        ];
      },
      { srgb: true }
    );
    const { normalMap, roughnessMap } = bakeHeightSet(
      w,
      w,
      (u, v) => {
        const cells = tileableWorley2(u * 90, v * 90, 90, 21);
        const crease = 1 - Math.min(1, (cells.f2 - cells.f1) * 5);
        return (1 - crease) * 0.7 + tileableFbm2(u * 220, v * 220, 220, 3, 8) * 0.3;
      },
      {
        strength: 1.8,
        roughnessFn: (u, v) => {
          const cells = tileableWorley2(u * 90, v * 90, 90, 21);
          const crease = 1 - Math.min(1, (cells.f2 - cells.f1) * 5);
          return 0.52 + crease * 0.26;
        },
        aoStrength: 0.4,
      }
    );
    return { albedo, normalMap, roughnessMap: roughnessMap! };
  });
}

/** Achromatic alcantara / suede: matte, fibrous, with a directional nap. */
export function alcantaraMaps(colorHex: string): {
  albedo: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  return cached(`alcantara:${colorHex}`, () => {
    const [r0, g0, b0] = hexToRgb(colorHex);
    const w = 256;
    const albedo = bake(
      w,
      w,
      (u, v) => {
        const nap = tileableFbm2(u * 140, v * 60, 140, 3, 12);
        const k = 0.86 + nap * 0.2;
        return [
          Math.round(Math.min(1, r0 * k) * 255),
          Math.round(Math.min(1, g0 * k) * 255),
          Math.round(Math.min(1, b0 * k) * 255),
          255,
        ];
      },
      { srgb: true }
    );
    const { normalMap, roughnessMap } = bakeHeightSet(
      w,
      w,
      (u, v) => tileableFbm2(u * 150, v * 68, 150, 4, 12),
      {
        strength: 1.2,
        roughnessFn: (u, v) => 0.86 + tileableFbm2(u * 40, v * 40, 40, 2, 3) * 0.09,
      }
    );
    return { albedo, normalMap, roughnessMap: roughnessMap! };
  });
}

// ---------------------------------------------------------------------------
// GLASS
// ---------------------------------------------------------------------------

/**
 * Dirty glass for windscreens.
 *
 * Clean glass is invisible, and therefore free; dirty glass is what sells a
 * windscreen in a still frame. Three superimposed defect layers:
 *  - a calcified water-spot film near the top and corners (low frequency),
 *  - wiper arcs (concentric, centred on the bottom third),
 *  - fine road grit on the lower band where the wipers never reach.
 */
export function windGlassMaps(): {
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  alphaMap: THREE.CanvasTexture;
} {
  return cached('glass', () => {
    const w = 512;
    const spots = (u: number, v: number) => {
      // Water spots: small cellular rings, the dried-mineral kind.
      const c = tileableWorley2(u * 46, v * 46, 46, 63);
      const ring = Math.max(0, 1 - Math.abs(c.f1 - 0.34) * 12);
      return ring;
    };
    const wiperArc = (u: number, v: number) => {
      const cx = 0.5;
      const cy = 1.12;
      const dx = u - cx;
      const dy = v - cy;
      const r = Math.hypot(dx, dy);
      // Three arcs: the swept band is cleaner than the rest.
      const band = Math.exp(-Math.pow((r - 0.62) / 0.055, 2)) * 0.55;
      const band2 = Math.exp(-Math.pow((r - 0.74) / 0.05, 2)) * 0.35;
      return band + band2;
    };
    const grit = (u: number, v: number) => {
      const lower = Math.max(0, v - 0.78) / 0.22;
      return tileableFbm2(u * 120, v * 120, 120, 3, 33) * lower;
    };

    const { normalMap } = bakeHeightSet(
      w,
      w,
      (u, v) => spots(u, v) * 0.6 + grit(u, v) * 0.8,
      { strength: 0.5 }
    );

    const roughnessMap = bake(
      w,
      w,
      (u, v) => {
        const r = 0.02 + spots(u, v) * 0.3 + grit(u, v) * 0.45 - wiperArc(u, v) * 0.012;
        const c = Math.round(Math.min(1, Math.max(0, r)) * 255);
        return [c, c, c, 255];
      },
      { srgb: false }
    );

    // Alpha: dust also slightly fogs the glass, which reads at grazing angles.
    const alphaMap = bake(
      w,
      w,
      (u, v) => {
        const a = 0.02 + spots(u, v) * 0.13 + grit(u, v) * 0.2;
        const c = Math.round(Math.min(1, Math.max(0, a)) * 255);
        return [c, c, c, 255];
      },
      { srgb: false }
    );

    return { roughnessMap, normalMap, alphaMap };
  });
}

// ---------------------------------------------------------------------------
// WORLD SURFACES
// ---------------------------------------------------------------------------

/**
 * Asphalt: aggregate in three size classes over a bitumen binder, with
 * longitudinal wheel-track polish and hairline cracks.
 *
 * `trackWear` is the fraction of the tile occupied by polished wheel paths
 * (0 = a fresh motorway lane, 1 = a hot racing line).
 */
export function asphaltMaps(trackWear = 0.5): {
  albedo: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  aoMap: THREE.CanvasTexture;
} {
  return cached(`asphalt:${trackWear.toFixed(2)}`, () => {
    const w = 512;

    const aggregate = (u: number, v: number) => {
      // Three classes: 20 mm chips, 6 mm chips, 1.5 mm sand.
      const big = tileableWorley2(u * 16, v * 16, 16, 3);
      const mid = tileableWorley2(u * 44, v * 44, 44, 7);
      const fine = tileableWorley2(u * 130, v * 130, 130, 19);
      const chipBig = Math.pow(1 - Math.min(1, big.f1 * 1.7), 2) * 0.5;
      const chipMid = Math.pow(1 - Math.min(1, mid.f1 * 1.8), 2) * 0.32;
      const chipFine = Math.pow(1 - Math.min(1, fine.f1 * 2.0), 2) * 0.18;
      return chipBig + chipMid + chipFine;
    };

    const wheelTrackPolish = (u: number) => {
      // Two wheel paths per lane at ~ ±0.22 of the tile width.
      const left = Math.exp(-Math.pow((u - 0.22) / 0.075, 2));
      const right = Math.exp(-Math.pow((u - 0.78) / 0.075, 2));
      return (left + right) * trackWear;
    };

    const crack = (u: number, v: number) => {
      // Cracks follow a ridged field, so they branch instead of forming a grid.
      const a = tileableFbm2(u * 7, v * 7, 7, 4, 47);
      const b = tileableFbm2(u * 13, v * 13, 13, 3, 53);
      const ridge = Math.abs(a - b);
      return Math.max(0, 1 - ridge / 0.018);
    };

    const albedo = bake(
      w,
      w,
      (u, v) => {
        const agg = aggregate(u, v);
        const polish = wheelTrackPolish(u);
        const ck = crack(u, v);
        // Fresh chips are light grey, bitumen is near-black, the polished wheel
        // path darkens (rubber transfer) and slightly blue-shifts.
        let k = 0.09 + agg * 0.30;
        k *= 1 - polish * 0.35;
        k *= 1 - ck * 0.5;
        const grain = tileableFbm2(u * 300, v * 300, 300, 2, 71) * 0.06;
        k += grain;
        const r = Math.round(Math.min(1, Math.max(0, k)) * 255);
        const g = Math.round(Math.min(1, Math.max(0, k * 0.99)) * 255);
        const b = Math.round(Math.min(1, Math.max(0, k * 1.02)) * 255);
        return [r, g, b, 255];
      },
      { srgb: true }
    );

    const { normalMap, roughnessMap, aoMap } = bakeHeightSet(
      w,
      w,
      (u, v) => aggregate(u, v) * 1.0 - crack(u, v) * 0.9,
      {
        strength: 2.2,
        roughnessFn: (u, v) => {
          const polish = wheelTrackPolish(u);
          // Chip faces are rough; polished rubbered asphalt is noticeably glossier
          // (this is why wet wheel paths mirror the sky first).
          return 0.86 - polish * 0.3 + (1 - aggregate(u, v)) * 0.06;
        },
        aoStrength: 0.6,
      }
    );

    return { albedo, normalMap, roughnessMap: roughnessMap!, aoMap: aoMap! };
  });
}

/** Poured concrete with control joints, stains and a fine broom finish. */
export function concreteMaps(): {
  albedo: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  return cached('concrete', () => {
    const w = 256;
    const albedo = bake(
      w,
      w,
      (u, v) => {
        const n = tileableFbm2(u * 24, v * 24, 24, 4, 5);
        const grit = tileableFbm2(u * 180, v * 180, 180, 2, 9);
        const stain = Math.pow(tileableFbm2(u * 5, v * 5, 5, 3, 13), 3) * 0.5;
        const k = 0.55 + n * 0.16 + grit * 0.08 - stain * 0.2;
        const c = Math.round(Math.min(1, Math.max(0, k)) * 255);
        return [c, Math.round(c * 0.99), Math.round(c * 0.96), 255];
      },
      { srgb: true }
    );
    const { normalMap, roughnessMap } = bakeHeightSet(
      w,
      w,
      (u, v) => tileableFbm2(u * 180, v * 180, 180, 3, 9) * 0.6 + tileableFbm2(u * 20, v * 20, 20, 3, 5) * 0.4,
      { strength: 1.1, roughnessFn: (u, v) => 0.72 + tileableFbm2(u * 30, v * 30, 30, 2, 2) * 0.16 }
    );
    return { albedo, normalMap, roughnessMap: roughnessMap! };
  });
}

/** Tree bark: deep vertical ridges (ridged noise) + lichen patches. */
export function barkMaps(): {
  albedo: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  return cached('bark', () => {
    const w = 256;
    const ridge = (u: number, v: number) => {
      // Squash U so ridges run vertically up the trunk.
      const n = tileableFbm2(u * 26, v * 4, 26, 4, 61);
      const r = 1 - Math.abs(n * 2 - 1);
      return Math.pow(r, 2.2);
    };
    const albedo = bake(
      w,
      w,
      (u, v) => {
        const r = ridge(u, v);
        const lichen = Math.pow(tileableFbm2(u * 8, v * 8, 8, 3, 29), 2.5);
        const base = [0.20, 0.16, 0.12];
        const lichenCol = [0.36, 0.42, 0.30];
        const k = 0.55 + r * 0.55;
        return [
          Math.round(Math.min(1, base[0] * k * (1 - lichen) + lichenCol[0] * lichen) * 255),
          Math.round(Math.min(1, base[1] * k * (1 - lichen) + lichenCol[1] * lichen) * 255),
          Math.round(Math.min(1, base[2] * k * (1 - lichen) + lichenCol[2] * lichen) * 255),
          255,
        ];
      },
      { srgb: true }
    );
    const { normalMap, roughnessMap } = bakeHeightSet(
      w,
      w,
      ridge,
      { strength: 3.2, roughnessFn: (u, v) => 0.86 + ridge(u, v) * 0.08, aoStrength: 0.6 }
    );
    return { albedo, normalMap, roughnessMap: roughnessMap! };
  });
}

/**
 * Foliage card: an alpha-cutout of leaf clusters.
 *
 * Real trees in real-time renderers are cards with alpha-tested leaf shapes, so
 * that is what we do — but the card must be built from actual leaf silhouettes
 * (ellipses with a midrib notch), not from noise-thresholded blobs, or the
 * canopy reads as a fuzzy ball.
 */
export function foliageCardTexture(
  hex: string,
  kind: 'broadleaf' | 'conifer' | 'blossom' | 'autumn'
): THREE.CanvasTexture {
  return cached(`foliage:${hex}:${kind}`, () => {
    const size = 256;
    const canvas = makeCanvas(size, size);
    const g = canvas ? ctx2d(canvas) : null;
    if (!canvas || !g) return solidTexture(hex, true);

    g.clearRect(0, 0, size, size);
    const rng = seededRandom(hex.length * 977 + kind.length * 311);
    const [r, gg, b] = hexToRgb(hex);

    const leafCount = kind === 'conifer' ? 46 : kind === 'blossom' ? 70 : 58;
    for (let i = 0; i < leafCount; i++) {
      // Distribute leaves in a cluster: denser at the centre, sparse at the rim.
      const ang = rng() * Math.PI * 2;
      const rad = Math.pow(rng(), 0.62) * size * 0.44;
      const x = size / 2 + Math.cos(ang) * rad;
      const y = size / 2 + Math.sin(ang) * rad * 0.9;
      const tint = jitterColor([r, gg, b], 0.22, rng);

      if (kind === 'conifer') {
        // Needles: thin tapered strokes radiating from the branch.
        const len = 10 + rng() * 20;
        const dir = rng() * Math.PI * 2;
        g.strokeStyle = `rgba(${Math.round(tint[0] * 255)},${Math.round(tint[1] * 255)},${Math.round(tint[2] * 255)},${0.75 + rng() * 0.25})`;
        g.lineWidth = 1.2 + rng() * 1.1;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(dir) * len, y + Math.sin(dir) * len);
        g.stroke();
      } else {
        // Broadleaf: a rotated ellipse with a slightly folded midrib.
        const lw = kind === 'blossom' ? 6 + rng() * 5 : 7 + rng() * 9;
        const lh = lw * (0.55 + rng() * 0.3);
        const rot = rng() * Math.PI * 2;
        g.save();
        g.translate(x, y);
        g.rotate(rot);
        g.beginPath();
        g.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
        const alpha = 0.68 + rng() * 0.32;
        g.fillStyle = `rgba(${Math.round(tint[0] * 255)},${Math.round(tint[1] * 255)},${Math.round(tint[2] * 255)},${alpha})`;
        g.fill();
        // Midrib catches light differently — a dark line through the leaf.
        g.strokeStyle = `rgba(${Math.round(tint[0] * 120)},${Math.round(tint[1] * 120)},${Math.round(tint[2] * 120)},0.55)`;
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(-lw, 0);
        g.lineTo(lw, 0);
        g.stroke();
        g.restore();
      }
    }
    const tex = finish(canvas, { srgb: true });
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/** Grass tuft card: blades with tapered tips, alpha cut out. */
export function grassCardTexture(hex: string): THREE.CanvasTexture {
  return cached(`grass:${hex}`, () => {
    const size = 128;
    const canvas = makeCanvas(size, size);
    const g = canvas ? ctx2d(canvas) : null;
    if (!canvas || !g) return solidTexture(hex, true);
    g.clearRect(0, 0, size, size);
    const rng = seededRandom(hex.length * 7331);
    const [r, gg, b] = hexToRgb(hex);
    const blades = 26;
    for (let i = 0; i < blades; i++) {
      const baseX = size * 0.5 + (rng() - 0.5) * size * 0.7;
      const h = size * (0.45 + rng() * 0.5);
      const curve = (rng() - 0.5) * size * 0.45;
      const tipX = baseX + curve;
      const tipY = size - h;
      const wdt = 1.6 + rng() * 2.2;
      const tint = jitterColor([r, gg, b], 0.28, rng);
      g.fillStyle = `rgba(${Math.round(tint[0] * 255)},${Math.round(tint[1] * 255)},${Math.round(tint[2] * 255)},0.95)`;
      g.beginPath();
      g.moveTo(baseX - wdt, size);
      g.quadraticCurveTo(baseX - wdt * 0.4 + curve * 0.4, size - h * 0.5, tipX, tipY);
      g.quadraticCurveTo(baseX + wdt * 0.4 + curve * 0.4, size - h * 0.5, baseX + wdt, size);
      g.closePath();
      g.fill();
    }
    const tex = finish(canvas, { srgb: true });
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/**
 * Ground / terrain detail. Tiles slowly, used with a huge repeat, so the
 * important property is that it has *no* recognisable feature: only a
 * distribution of small stones and grass clumps.
 */
export function groundDetailMaps(baseHex: string): {
  albedo: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  return cached(`ground:${baseHex}`, () => {
    const w = 256;
    const [r0, g0, b0] = hexToRgb(baseHex);
    const clump = (u: number, v: number) => {
      const c = tileableWorley2(u * 26, v * 26, 26, 17);
      return Math.pow(1 - Math.min(1, c.f1 * 1.6), 2);
    };
    const albedo = bake(
      w,
      w,
      (u, v) => {
        const n = tileableFbm2(u * 30, v * 30, 30, 4, 23);
        const c = clump(u, v);
        const k = 0.8 + n * 0.3 - c * 0.18;
        return [
          Math.round(Math.min(1, r0 * k) * 255),
          Math.round(Math.min(1, g0 * k) * 255),
          Math.round(Math.min(1, b0 * k) * 255),
          255,
        ];
      },
      { srgb: true }
    );
    const { normalMap, roughnessMap } = bakeHeightSet(
      w,
      w,
      (u, v) => clump(u, v) * 0.7 + tileableFbm2(u * 70, v * 70, 70, 3, 5) * 0.3,
      { strength: 1.4, roughnessFn: () => 0.93 }
    );
    return { albedo, normalMap, roughnessMap: roughnessMap! };
  });
}

/** Sky-ish studio environment strip for the garage (kept procedural, cheap). */
export function studioStripTexture(): THREE.CanvasTexture {
  return cached('studio-strip', () => {
    const w = 512;
    return bake(
      w,
      w / 4,
      (u, v) => {
        // Long soft boxes: the classic automotive studio reflection.
        const boxA = Math.exp(-Math.pow((u - 0.24) / 0.10, 2)) * Math.exp(-Math.pow((v - 0.45) / 0.16, 2));
        const boxB = Math.exp(-Math.pow((u - 0.62) / 0.14, 2)) * Math.exp(-Math.pow((v - 0.38) / 0.12, 2));
        const boxC = Math.exp(-Math.pow((u - 0.86) / 0.05, 2)) * Math.exp(-Math.pow((v - 0.55) / 0.2, 2));
        const top = Math.exp(-Math.pow((v - 0.06) / 0.05, 2)) * 0.7;
        const k = 0.05 + boxA * 1.5 + boxB * 1.1 + boxC * 1.35 + top;
        const c = Math.round(Math.min(1, k) * 255);
        return [c, c, Math.round(c * 0.99), 255];
      },
      { srgb: true }
    );
  });
}

/**
 * Exhaust-flame / hot-gas gradient, used by the flame cones.
 * Real exhaust flame is blue at the root (complete combustion) and orange at the
 * tip (soot incandescence) — painting it as a solid orange cone is the single
 * most "video game" element on a car.
 */
export function flameGradientTexture(lean: boolean): THREE.CanvasTexture {
  return cached(`flame:${lean}`, () => {
    const w = 128;
    const canvas = makeCanvas(w, w);
    const g = canvas ? ctx2d(canvas) : null;
    if (!canvas || !g) return solidTexture(lean ? '#2ea8ff' : '#ff8a2b', true);
    const grd = g.createLinearGradient(0, w, 0, 0);
    if (lean) {
      grd.addColorStop(0, 'rgba(120,200,255,0.95)');
      grd.addColorStop(0.35, 'rgba(60,130,255,0.7)');
      grd.addColorStop(0.75, 'rgba(190,120,60,0.35)');
      grd.addColorStop(1, 'rgba(255,140,60,0)');
    } else {
      grd.addColorStop(0, 'rgba(255,235,190,0.95)');
      grd.addColorStop(0.3, 'rgba(255,150,40,0.75)');
      grd.addColorStop(0.7, 'rgba(220,60,10,0.3)');
      grd.addColorStop(1, 'rgba(120,20,0,0)');
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
    const tex = finish(canvas, { srgb: true });
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/** Headlight lens: a finely ribbed fresnel pattern with a hot spot. */
export function headlightLensTexture(): THREE.CanvasTexture {
  return cached('headlight-lens', () => bake(
    128,
    128,
    (u, v) => {
      const dx = u - 0.5;
      const dy = v - 0.5;
      const r = Math.hypot(dx, dy);
      const rib = Math.sin(r * 150) * 0.5 + 0.5;
      const hotspot = Math.exp(-Math.pow(r / 0.12, 2));
      const k = 0.25 + rib * 0.15 + hotspot * 0.9;
      const c = Math.round(Math.min(1, k) * 255);
      return [c, c, c, 255];
    },
    { srgb: true }
  ));
}

/**
 * Taillight lens: the modern LED "signature" is a set of thin light guides, not
 * a solid red slab. This bakes one guide pattern that all cars share.
 */
export function taillightTexture(): THREE.CanvasTexture {
  return cached('taillight', () => bake(
    128,
    64,
    (u, v) => {
      const g1 = Math.exp(-Math.pow((v - 0.34) / 0.06, 2));
      const g2 = Math.exp(-Math.pow((v - 0.68) / 0.04, 2)) * (0.5 + 0.5 * Math.sin(u * 46));
      const k = 0.12 + g1 * 0.9 + g2 * 0.55;
      return [Math.round(Math.min(1, k) * 255), Math.round(Math.min(1, k * 0.12) * 255), Math.round(Math.min(1, k * 0.16) * 255), 255];
    },
    { srgb: true }
  ));
}

/** Grille mesh: hexagonal cells (honeycomb), used on intakes and radiators. */
export function grilleMeshTexture(): THREE.CanvasTexture {
  return cached('grille', () => {
    const w = 128;
    const canvas = makeCanvas(w, w);
    const g = canvas ? ctx2d(canvas) : null;
    if (!canvas || !g) return solidTexture('#15171c', true);
    g.fillStyle = '#000000';
    g.fillRect(0, 0, w, w);
    const cellW = 16;
    const cellH = 14;
    for (let row = -1; row < w / cellH + 1; row++) {
      for (let col = -1; col < w / cellW + 1; col++) {
        const cx = col * cellW + (row % 2 ? cellW / 2 : 0);
        const cy = row * cellH;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = cx + Math.cos(a) * (cellW * 0.46);
          const py = cy + Math.sin(a) * (cellH * 0.46);
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        // The cell is a hole: leave it transparent-ish dark, and paint the walls.
        g.strokeStyle = `rgba(${40 + hash2(col, row) * 26},${42 + hash2(col, row) * 26},${48 + hash2(col, row) * 26},1)`;
        g.lineWidth = 3;
        g.stroke();
      }
    }
    const tex = finish(canvas, { srgb: true });
    return tex;
  });
}

/** Dust/dirt overlay used to blend the bottom of bodywork into the ground. */
export function roadGrimeTexture(): THREE.CanvasTexture {
  return cached('grime', () => {
    const w = 256;
    const canvas = makeCanvas(w, w);
    const g = canvas ? ctx2d(canvas) : null;
    if (!canvas || !g) return solidTexture('#3a3226', false);
    const img = g.createImageData(w, w);
    for (let y = 0; y < w; y++) {
      const v = y / w;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        // Grime accumulates at the bottom and in the wheel arches; it splashes
        // upward in streaks, which is what a muddy road actually does.
        const streak = tileableFbm2(u * 40, v * 6, 40, 3, 3);
        const base = Math.pow(v, 2.2) * 0.8 + Math.pow(streak, 3) * Math.pow(v, 0.7) * 0.6;
        const a = Math.round(Math.min(1, Math.max(0, base)) * 255);
        const i = (y * w + x) * 4;
        img.data[i] = 62;
        img.data[i + 1] = 54;
        img.data[i + 2] = 42;
        img.data[i + 3] = a;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = finish(canvas, { srgb: true });
    return tex;
  });
}

/** Small helper for UI code paths and tests that only need a colour texture. */
export function flatTexture(hex: string): THREE.CanvasTexture {
  return cached(`flat:${hex}`, () => solidTexture(hex, true));
}

/** Unused-but-public probe used by tests to prove determinism of the bakes. */
export function sampleNoiseForTest(x: number, y: number, seed = 0): number {
  return valueNoise2(x, y, seed);
}

/** Exposed for the scenery builder: a cheap 1D edge mask used for grass borders. */
export function grassBorderMask(t: number): number {
  return Math.max(0, Math.min(1, fbm2(t * 8, 3.1, 3, 2.03, 0.5, 7) * 1.6 - 0.2));
}
