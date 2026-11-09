/**
 * DETERMINISTIC NOISE — the numerical bedrock of every procedural surface in
 * this project.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * "Looks like LEGO" is not only a geometry problem. A flat albedo with a flat
 * roughness is the other half of it: real paint, rubber, asphalt and foliage all
 * carry micro-detail at frequencies well above the triangle size, and that
 * micro-detail is what scatters light unevenly across a surface. Without it,
 * even a perfectly lofted body still reads as a plastic shell.
 *
 * Everything here is pure, allocation-light and deterministic: the same seed
 * always produces the same world, which is what lets the test-suite assert on
 * generated content and what keeps two clients in sync.
 */

/** 32-bit integer hash (Wang / xorshift mix). Deterministic, well-distributed. */
export function hash32(x: number, y = 0, z = 0, seed = 0): number {
  let h = (x | 0) * 0x27d4eb2d ^ (y | 0) * 0x165667b1 ^ (z | 0) * 0x9e3779b1 ^ seed * 0x85ebca6b;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash of a 2D lattice point → [0,1). */
export function hash2(x: number, y: number, seed = 0): number {
  return hash32(x, y, 0, seed) / 4294967296;
}

/** Hash of a 3D lattice point → [0,1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  return hash32(x, y, z, seed) / 4294967296;
}

/** Seeded PRNG (Lehmer / Park-Miller). Same seed → same sequence, always. */
export function seededRandom(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const smoothstep5 = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Value noise, 2D. Quintic interpolation (Perlin's 6t^5-15t^4+10t^3) rather
 * than cubic: the second derivative is continuous at the lattice, so when this
 * is differentiated to build a normal map the result has no visible grid lines.
 */
export function valueNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothstep5(x - xi);
  const yf = smoothstep5(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * xf;
  const bot = c + (d - c) * xf;
  return top + (bot - top) * yf;
}

/** Value noise, 3D. Used for volumetric-ish fields (terrain, foliage clumps). */
export function valueNoise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smoothstep5(x - xi);
  const yf = smoothstep5(y - yi);
  const zf = smoothstep5(z - zi);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * xf;
  const x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf;
  const x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf;
  const y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

/**
 * Fractal Brownian motion with per-octave rotation.
 *
 * The rotation matters: a plain 2x scale ladder produces axis-aligned streaks
 * that the eye reads as "repeated texture". Rotating each octave by ~37° hides
 * the lattice and costs nothing.
 */
export function fbm2(
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2.03,
  gain = 0.5,
  seed = 0
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = x;
  let py = y;
  const ca = Math.cos(0.6435);
  const sa = Math.sin(0.6435);
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(px, py, seed + o * 131);
    norm += amp;
    const nx = (px * ca - py * sa) * lacunarity;
    const ny = (px * sa + py * ca) * lacunarity;
    px = nx + 31.7;
    py = ny + 17.3;
    amp *= gain;
  }
  return sum / Math.max(1e-6, norm);
}

export function fbm3(
  x: number,
  y: number,
  z: number,
  octaves = 4,
  lacunarity = 2.07,
  gain = 0.5,
  seed = 0
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = x;
  let py = y;
  let pz = z;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise3(px, py, pz, seed + o * 71);
    norm += amp;
    px = px * lacunarity + 13.1;
    py = py * lacunarity + 7.7;
    pz = pz * lacunarity + 23.9;
    amp *= gain;
  }
  return sum / Math.max(1e-6, norm);
}

/**
 * Ridged multifractal — the FBM variant that produces creases instead of
 * clouds. Terrain and tree bark need creases; foliage and clouds need smooth.
 */
export function ridged2(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = x;
  let py = y;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(valueNoise2(px, py, seed + o * 57) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    px = px * 2.04 + 19.3;
    py = py * 2.04 + 5.1;
    amp *= 0.5;
  }
  return sum / Math.max(1e-6, norm);
}

/**
 * Worley / cellular noise — returns {f1, f2, cell} where f1 is the distance to
 * the nearest feature point, f2 to the second nearest, and `cell` a stable id
 * in [0,1) for the winning cell.
 *
 * This is the noise that makes aggregate in asphalt, pebbles, water droplets,
 * flaking paint and honeycomb patterns. Value noise cannot produce hard cell
 * boundaries; cellular can.
 */
export function worley2(
  x: number,
  y: number,
  seed = 0
): { f1: number; f2: number; cell: number } {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 1e9;
  let f2 = 1e9;
  let cell = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const px = cx + hash2(cx, cy, seed + 11);
      const py = cy + hash2(cx, cy, seed + 23);
      const dx = px - x;
      const dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        cell = hash2(cx, cy, seed + 37);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, cell };
}

/** Tileable version of `fbm2`: the field wraps exactly on `period` lattice cells. */
export function tileableFbm2(x: number, y: number, period: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = 1;
  let px = x;
  let py = y;
  for (let o = 0; o < octaves; o++) {
    const p = Math.max(1, Math.round(period * freq));
    const fx = (px * p) / period;
    const fy = (py * p) / period;
    const n =
      valueNoise2(fx, fy, seed + o * 91) * (1 - wrapT(fx, p)) * 0 +
      bilinearWrapped(fx, fy, p, seed + o * 91);
    sum += amp * n;
    norm += amp;
    px = x * (freq * 2.0);
    py = y * (freq * 2.0);
    freq *= 2.0;
    amp *= 0.5;
  }
  return sum / Math.max(1e-6, norm);
}

function wrapT(t: number, period: number): number {
  return t - Math.floor(t / period) * period;
}

function bilinearWrapped(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothstep5(x - xi);
  const yf = smoothstep5(y - yi);
  const w = (v: number) => ((v % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);
  const top = a + (b - a) * xf;
  const bot = c + (d - c) * xf;
  return top + (bot - top) * yf;
}

/**
 * Tileable cellular noise. Feature points are wrapped modulo `period` so the
 * aggregate in asphalt has no visible seam when the texture repeats.
 */
export function tileableWorley2(
  x: number,
  y: number,
  period: number,
  seed = 0
): { f1: number; f2: number; cell: number } {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 1e9;
  let f2 = 1e9;
  let cell = 0;
  const w = (v: number) => ((v % period) + period) % period;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const px = cx + hash2(w(cx), w(cy), seed + 11);
      const py = cy + hash2(w(cx), w(cy), seed + 23);
      const dx = px - x;
      const dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        cell = hash2(w(cx), w(cy), seed + 37);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, cell };
}

/** sRGB hex string → linear-ish [r,g,b] in 0..1 (used by texture bakers). */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Colour jitter in HSV-ish space: keeps a palette coherent while breaking uniformity. */
export function jitterColor(
  rgb: [number, number, number],
  amount: number,
  rng: () => number
): [number, number, number] {
  const k = 1 + (rng() - 0.5) * 2 * amount;
  const warm = (rng() - 0.5) * amount * 0.14;
  return [
    Math.min(1, Math.max(0, rgb[0] * k + warm)),
    Math.min(1, Math.max(0, rgb[1] * k)),
    Math.min(1, Math.max(0, rgb[2] * k - warm)),
  ];
}
