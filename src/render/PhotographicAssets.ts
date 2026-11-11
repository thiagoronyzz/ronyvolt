/**
 * PHOTOGRAPHIC ASSETS — real photographs inside the WebGL pipeline
 * ==============================================================
 *
 * Until this pass the game was 100% procedural. Every "asphalt", "bark",
 * "cloud" and "headlight" was noise drawn into a canvas. That has a hard
 * ceiling: noise has no measured aggregate, no real cloud shape, no real
 * paint reflection. This module loads the derived PBR maps generated from the
 * photographs in `public/assets/photos/` (see CREDITS.md) and hands them to
 * the track, terrain, trees, car lights, sky dome, PMREM environment and
 * horizon band.
 *
 * Design constraints:
 *  - Loading is lazy and DOM-guarded, so Vitest / CPU preview tools (no DOM,
 *    no GPU) still import every module and fall back to procedural textures.
 *  - A single LoadingManager reports when everything is on the GPU; a failed
 *    fetch never throws into the render loop.
 *  - Textures are shared and intentionally NOT disposed by
 *    `disposeObject3D()` (same convention as the procedural cache).
 *  - One toggle lets the player A/B the photographic pass against the old
 *    procedural look.
 */

import * as THREE from 'three';

export const PHOTO_BASE = '/assets/photos/generated/';

export const PHOTO_ASSET_FILES = [
  'asphalt_albedo.jpg',
  'asphalt_clean.jpg',
  'asphalt_normal.png',
  'asphalt_roughness.png',
  'asphalt_ao.png',
  'ground_detail.jpg',
  'ground_normal.png',
  'bark_albedo.jpg',
  'bark_normal.png',
  'sky_day.jpg',
  'sky_night.jpg',
  'environment_day.jpg',
  'environment_night.jpg',
  'horizon_day.png',
  'car_probe.png',
  'headlight.jpg',
  'taillight.jpg',
] as const;

export type PhotoAssetFile = (typeof PHOTO_ASSET_FILES)[number];

export interface PhotoCredit {
  file: string;
  label: string;
  author: string;
  license: string;
  url: string;
}

/** Also shown in the in-game "Referências fotográficas" window. */
export const PHOTO_CREDITS: PhotoCredit[] = [
  {
    file: 'asphalt-public-domain.jpg',
    label: 'Asfalto real (domínio público)',
    author: 'John Harvey / Wikimedia Commons',
    license: 'Domínio público',
    url: 'https://commons.wikimedia.org/wiki/File:Asphalt_high_resolution_texture.jpg',
  },
  {
    file: 'road-guardrail-unsplash.jpg',
    label: 'Estrada, guardrail e céu',
    author: 'David Magalhães / Unsplash',
    license: 'Unsplash License',
    url: 'https://unsplash.com/photos/a-curved-road-with-a-guardrail-under-a-blue-sky-AiGsgfJQSME',
  },
  {
    file: 'car-gtr-front-unsplash.jpg',
    label: 'Carro real — faróis e pintura',
    author: "Jack O'Hara / Unsplash",
    license: 'Unsplash License',
    url: 'https://unsplash.com/photos/orange-sports-car-on-road-_lD8Ejrx3nA',
  },
  {
    file: 'car-bmw-rear-unsplash.jpg',
    label: 'Carro real — lanternas',
    author: 'Unsplash',
    license: 'Unsplash License',
    url: 'https://unsplash.com/photos/black-car-on-road-during-daytime-xFgL8xGIGpk',
  },
  {
    file: 'car-porsche-sunset-unsplash.jpg',
    label: 'Carro em estrada ao entardecer',
    author: 'Jack White / Unsplash',
    license: 'Unsplash License',
    url: 'https://unsplash.com/photos/a-car-driving-down-a-road-with-a-sunset-in-the-background-pkvecakeQjo',
  },
  {
    file: 'grass-unsplash.jpg',
    label: 'Grama real',
    author: 'Unsplash',
    license: 'Unsplash License',
    url: 'https://unsplash.com/photos/topview-of-grass-lawn-QSIq9ncQkzY',
  },
  {
    file: 'bark-public-domain.jpg',
    label: 'Casca de árvore real',
    author: 'Photos Public Domain',
    license: 'Domínio público',
    url: 'https://www.photos-public-domain.com/2010/12/31/tree-bark-texture/',
  },
  {
    file: 'night-sky-eso.jpg',
    label: 'Céu noturno 360° (Via Láctea)',
    author: 'ESO/H.H. Heyer, CC BY 4.0',
    license: 'CC BY 4.0 — atribuição obrigatória',
    url: 'https://commons.wikimedia.org/wiki/File:360-degree_Panorama_of_the_Southern_Sky.jpg',
  },
];

export interface PhotographicAssets {
  asphaltAlbedo: THREE.Texture;
  asphaltClean: THREE.Texture;
  asphaltNormal: THREE.Texture;
  asphaltRoughness: THREE.Texture;
  asphaltAo: THREE.Texture;
  groundDetail: THREE.Texture;
  groundNormal: THREE.Texture;
  barkAlbedo: THREE.Texture;
  barkNormal: THREE.Texture;
  skyDay: THREE.Texture;
  skyNight: THREE.Texture;
  environmentDay: THREE.Texture;
  environmentNight: THREE.Texture;
  horizonDay: THREE.Texture;
  carProbe: THREE.Texture;
  headlight: THREE.Texture;
  taillight: THREE.Texture;
}

interface LoadOptions {
  srgb?: boolean;
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
  flipY?: boolean;
  repeat?: [number, number];
}

let cache: PhotographicAssets | null = null;
let readyPromise: Promise<void> | null = null;
let enabled = true;
let loaded = false;
const failedUrls: string[] = [];

export function photoAssetUrl(file: PhotoAssetFile): string {
  return `${PHOTO_BASE}${file}`;
}

/** Small centre-cropped thumbnail for the credits window (never downloads the
 *  multi-megabyte original just to render a 240 px card). */
export function photoThumbUrl(file: string): string {
  return `${PHOTO_BASE}thumbs/${file}`;
}

/**
 * Clones created before the JPEG/PNG has decoded. They share the Source, so a
 * single `needsUpdate` on load uploads all of them; deferring it avoids twelve
 * "Texture marked for update but no image data found" warnings on the first
 * frames of every race.
 */
const pendingClones = new WeakMap<THREE.Source, Set<THREE.Texture>>();

/**
 * Three's `Texture.repeat` lives on the texture, so a shared texture cannot be
 * used at two different physical scales. `clone()` shares the decoded Image
 * (no extra GPU upload) but gives us an independent UV matrix. Every material
 * that wants a photo map at its own metric scale must use this.
 */
export function clonePhoto(
  tex: THREE.Texture,
  repeatX = 1,
  repeatY = 1,
  channel = 0
): THREE.Texture {
  const copy = tex.clone();
  copy.wrapS = tex.wrapS;
  copy.wrapT = tex.wrapT;
  copy.colorSpace = tex.colorSpace;
  copy.flipY = tex.flipY;
  copy.anisotropy = tex.anisotropy;
  copy.channel = channel;
  copy.repeat.set(repeatX, repeatY);
  if (tex.image) {
    copy.needsUpdate = true;
  } else {
    copy.version = 0; // Texture.copy() marked it for update prematurely
    let pending = pendingClones.get(tex.source);
    if (!pending) {
      pending = new Set();
      pendingClones.set(tex.source, pending);
    }
    pending.add(copy);
  }
  return copy;
}

export function photographicAssetsAvailable(): boolean {
  // The CPU preview harness (`tools/preview/scene.mjs`) installs a canvas-like
  // `document` and a bare `window`, but has no Image loader, no network and no
  // WebGL. `window.location` is the reliable discriminator for a real browser.
  return (
    typeof document !== 'undefined' &&
    typeof window !== 'undefined' &&
    typeof window.location !== 'undefined' &&
    typeof Image !== 'undefined' &&
    typeof document.createElementNS === 'function'
  );
}

export function setPhotographicAssetsEnabled(value: boolean): void {
  enabled = value;
}

export function photographicAssetsEnabled(): boolean {
  return enabled;
}

export function photographicAssetsLoaded(): boolean {
  return loaded;
}

export function photographicAssetErrors(): string[] {
  return [...failedUrls];
}

/**
 * Resolves after every photographic texture has been decoded (or failed).
 * The render loop never awaits it: TextureLoader returns usable Texture
 * objects immediately and Three uploads them when the images arrive.
 */
export function photographicAssetsReady(): Promise<void> {
  if (readyPromise) return readyPromise;
  if (!photographicAssetsAvailable()) {
    readyPromise = Promise.resolve();
    return readyPromise;
  }
  getPhotographicAssetLibrary();
  return readyPromise ?? Promise.resolve();
}

function makeTexture(manager: THREE.LoadingManager, file: PhotoAssetFile, opts: LoadOptions = {}): THREE.Texture {
  const tex = new THREE.TextureLoader(manager).load(photoAssetUrl(file), (t) => {
    t.needsUpdate = true;
    const pending = pendingClones.get(t.source);
    if (pending) {
      for (const clone of pending) clone.needsUpdate = true;
      pending.clear();
    }
  });
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = opts.wrapS ?? THREE.RepeatWrapping;
  tex.wrapT = opts.wrapT ?? THREE.RepeatWrapping;
  // A road is seen at a grazing angle: without a full mip chain and the highest
  // anisotropic filtering the renderer supports, a 1024² aggregate photograph
  // minifies into long moiré streaks toward the horizon. Be explicit rather
  // than relying on driver defaults (software WebGL in particular).
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  if (opts.flipY !== undefined) tex.flipY = opts.flipY;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  return tex;
}

/**
 * World builders use this variant: they always need BOTH the photographic and
 * the procedural map sets, so the A/B toggle in Settings can swap materials in
 * a live scene without rebuilding the whole track.
 */
export function getPhotographicAssetLibrary(): PhotographicAssets | null {
  if (!photographicAssetsAvailable()) return null;
  if (cache) return cache;

  const manager = new THREE.LoadingManager();
  readyPromise = new Promise<void>((resolve) => {
    manager.onLoad = () => {
      loaded = true;
      resolve();
    };
    manager.onError = (url) => {
      failedUrls.push(url);
    };
  });

  const tiled = { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping } as const;
  // Equirectangular convention used by both the sky shader and three's PMREM
  // equirectangular converter: with the default flipY=true, v=1 is the TOP of
  // the photograph (zenith) and v=0 the bottom (horizon / ground hemisphere).
  const spherical = { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping } as const;
  const linear = { srgb: false, ...tiled } as const;

  cache = {
    asphaltAlbedo: makeTexture(manager, 'asphalt_albedo.jpg', { ...tiled, wrapS: THREE.ClampToEdgeWrapping }),
    asphaltClean: makeTexture(manager, 'asphalt_clean.jpg', tiled),
    asphaltNormal: makeTexture(manager, 'asphalt_normal.png', linear),
    asphaltRoughness: makeTexture(manager, 'asphalt_roughness.png', linear),
    asphaltAo: makeTexture(manager, 'asphalt_ao.png', linear),
    groundDetail: makeTexture(manager, 'ground_detail.jpg', tiled),
    groundNormal: makeTexture(manager, 'ground_normal.png', linear),
    barkAlbedo: makeTexture(manager, 'bark_albedo.jpg', tiled),
    barkNormal: makeTexture(manager, 'bark_normal.png', linear),
    skyDay: makeTexture(manager, 'sky_day.jpg', spherical),
    skyNight: makeTexture(manager, 'sky_night.jpg', spherical),
    // Equirectangular probes for PMREM. `mapping` tells PMREM how to read them;
    // these are real cloud/road/car photographs, not a generated gradient.
    environmentDay: makeTexture(manager, 'environment_day.jpg', { ...spherical, srgb: true }),
    environmentNight: makeTexture(manager, 'environment_night.jpg', { ...spherical, srgb: true }),
    horizonDay: makeTexture(manager, 'horizon_day.png', { ...tiled, wrapT: THREE.ClampToEdgeWrapping, repeat: [3, 1] }),
    carProbe: makeTexture(manager, 'car_probe.png', { ...tiled, wrapT: THREE.ClampToEdgeWrapping, repeat: [2, 1] }),
    headlight: makeTexture(manager, 'headlight.jpg', { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }),
    taillight: makeTexture(manager, 'taillight.jpg', { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }),
  };
  cache.environmentDay.mapping = THREE.EquirectangularReflectionMapping;
  cache.environmentNight.mapping = THREE.EquirectangularReflectionMapping;
  return cache;
}

/** Enabled-aware accessor used by the renderer (sky shader + PMREM). */
export function getPhotographicAssets(): PhotographicAssets | null {
  return enabled ? getPhotographicAssetLibrary() : null;
}

// ---------------------------------------------------------------------------
// Live A/B: every material carries both map sets in userData
// ---------------------------------------------------------------------------

export type PhotoMapKey =
  | 'map'
  | 'normalMap'
  | 'roughnessMap'
  | 'aoMap'
  | 'emissiveMap'
  | 'alphaMap';

export type PhotoMapSet = Partial<Record<PhotoMapKey, THREE.Texture | null>>;

/**
 * Registers the photographic and procedural variants on the material itself.
 * Keeping them on the material (instead of a module-level registry) means no
 * strong references outlive the scene and disposal works exactly as before.
 */
export function tagPhotographicMaterial(
  mat: THREE.Material,
  photo: PhotoMapSet,
  procedural: PhotoMapSet
): void {
  mat.userData.photoMaps = photo;
  mat.userData.proceduralMaps = procedural;
  mat.userData.photographic = true;
}

/** Returns true when the material had a registered pair. */
export function applyPhotographicMaps(mat: THREE.Material, usePhotos: boolean): boolean {
  const photo = mat.userData.photoMaps as PhotoMapSet | undefined;
  const procedural = mat.userData.proceduralMaps as PhotoMapSet | undefined;
  if (!photo || !procedural) return false;
  const target = usePhotos ? photo : procedural;
  const rec = mat as unknown as Record<PhotoMapKey, THREE.Texture | null>;
  let changed = false;
  for (const key of Object.keys(target) as PhotoMapKey[]) {
    const next = target[key] ?? null;
    if (rec[key] !== next) {
      rec[key] = next;
      changed = true;
    }
  }
  if (changed) mat.needsUpdate = true;
  // The engine reads this flag every frame to scale wet-road IBL.
  mat.userData.photographic = usePhotos;
  return true;
}

/** A/B toggle: walks the live scene, no track rebuild required. */
export function applyPhotographicMapsToScene(root: THREE.Object3D, usePhotos: boolean): number {
  let count = 0;
  const seen = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const mats = mesh.material;
    if (!mats) return;
    const list = Array.isArray(mats) ? mats : [mats];
    for (const m of list) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (applyPhotographicMaps(m, usePhotos)) count++;
    }
  });
  return count;
}

/** Test/teardown helper: forces a fresh manager on the next access. */
export function resetPhotographicAssetsForTest(): void {
  cache = null;
  readyPromise = null;
  loaded = false;
  failedUrls.length = 0;
  enabled = true;
}
