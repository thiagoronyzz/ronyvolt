import * as THREE from 'three';
import { BiomeTheme, CustomTrackData, GameMode, SavedPoster, TrackSpec } from '../types/game';
import {
  clonePhoto,
  getPhotographicAssetLibrary,
  photographicAssetsEnabled,
  tagPhotographicMaterial,
} from '../render/PhotographicAssets';
import { buildTerrainV2, terrainShapeFor } from '../world/Terrain';
import { buildForest } from '../world/Vegetation';
import {
  buildBuilding,
  buildDelineator,
  buildGrassBand,
  buildGuardrail,
  buildKmMarker,
  buildRoadSign,
  buildRockScatter,
  buildTerrain,
  buildTree,
  buildTreeLineBand,
  buildUtilityLine,
  paletteForBiome,
  TREE_SPECIES,
} from '../world/Scenery';

export interface DestructibleProp {
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hit: boolean;
  isHydrant: boolean;
  geyserTimer: number;
}

export interface HazardEntity {
  kind: 'sheep' | 'cat' | 'avalanche_boulder' | 'pothole' | 'puddle' | 'oil_slick' | 'powerup' | 'ramp' | 'delivery_zone';
  mesh: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  radius: number;
  phase: number;
  active: boolean;
}

export interface BuiltTrackWorld {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  samplePoints: THREE.Vector3[];
  sampleTangents: THREE.Vector3[];
  totalLengthM: number;
  roadWidth: number;
  isClosedLoop: boolean;
  /** The five start-lamp meshes hanging from the gantry beam (light order 0..4). */
  startLamps: THREE.Mesh[];
  roadMaterial?: THREE.MeshPhysicalMaterial;
  destructibles: DestructibleProp[];
  hazards: HazardEntity[];
  animatedProps: { obj: THREE.Object3D; update: (t: number, dt: number) => void }[];
  sampleNearest: (x: number, z: number) => {
    progress: number;
    point: THREE.Vector3;
    tangent: THREE.Vector3;
    lateralOffset: number;
    distance: number;
  };
}

/** Weighted species pick from the biome's palette. */
function pickSpecies(palette: ReturnType<typeof paletteForBiome>, rng: () => number): keyof typeof TREE_SPECIES {
  const total = palette.species.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [key, w] of palette.species) {
    r -= w;
    if (r <= 0) return key;
  }
  return palette.species[0][0];
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createRoadSurfaceTexture(biome: BiomeTheme): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (biome === 'rc_kitchen' || biome === 'rc_bathroom') {
    // Checkered glossy floor tiles!
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#e9ecef' : biome === 'rc_bathroom' ? '#90e0ef' : '#ced4da';
        ctx.fillRect(x * 64, y * 64, 64, 64);
      }
    }
  } else if (biome === 'amazon_jungle' || biome === 'sahara_desert' || biome === 'mars_colony') {
    ctx.fillStyle = biome === 'amazon_jungle' ? '#4a3728' : biome === 'mars_colony' ? '#7f2b1a' : '#b08968';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.16})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
    }
  } else if (biome === 'cloud_kingdom') {
    ctx.fillStyle = '#e0fbfc';
    ctx.fillRect(0, 0, 512, 512);
  } else {
    // Detailed Asphalt with aggregate grain, rubber racing line, and twin edge lines
    ctx.fillStyle = '#232730';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3500; i++) {
      const v = 28 + Math.floor(Math.random() * 26);
      ctx.fillStyle = `rgb(${v},${v},${v + 4})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    // Rubberized dark racing groove
    ctx.fillStyle = 'rgba(10,12,16,0.35)';
    ctx.fillRect(140, 0, 232, 512);
    // Edge lines
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(20, 0, 10, 512);
    ctx.fillRect(482, 0, 10, 512);
    // Dashed centerline
    ctx.fillStyle = 'rgba(255,209,102,0.75)';
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(252, y, 8, 34);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 75);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural asphalt detail maps.
 *
 * The base colour texture is per-biome, but a road with a constant roughness and
 * a flat normal has no *surface*: it reads as painted paper. Real asphalt is
 * defined by micro-detail the eye picks up at grazing angles — that is where the
 * light does its work.
 *
 * These maps are tileable, generated once, and applied with metric UVs (one tile
 * per road-width of travel), so the aggregate grain is the same physical size on
 * a 6 m kart track and a 20 m motorway.
 */
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function createAsphaltDetailMaps(): { normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const size = 256;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0;
      let amp = 0.55;
      let freq = 0.14;
      for (let o = 0; o < 3; o++) {
        h += valueNoise(x * freq, y * freq) * amp;
        amp *= 0.5;
        freq *= 2.1;
      }
      h += hash2(x, y) * 0.16; // aggregate chips
      heights[y * size + x] = h;
    }
  }

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nctx = normalCanvas.getContext('2d')!;
  const nimg = nctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const hl = heights[y * size + ((x - 1 + size) % size)];
      const hr = heights[y * size + ((x + 1) % size)];
      const hu = heights[((y - 1 + size) % size) * size + x];
      const hd = heights[((y + 1) % size) * size + x];
      const dx = (hr - hl) * 1.6;
      const dy = (hd - hu) * 1.6;
      const len = Math.hypot(dx, dy, 1);
      nimg.data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      nimg.data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      nimg.data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = 8;

  // Roughness: mostly rough aggregate with a smoother, rubbered-in racing
  // groove down the middle. This is why the racing line reads darker and
  // slightly glossier in real footage.
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d')!;
  const rimg = rctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const groove = Math.exp(-Math.pow((x / size - 0.5) / 0.16, 2));
      const noise = valueNoise(x * 0.09, y * 0.09) * 0.22 + hash2(x, y) * 0.08;
      const r = Math.round(Math.min(255, Math.max(0, (0.72 - groove * 0.26 + noise) * 255)));
      rimg.data[i] = r;
      rimg.data[i + 1] = r;
      rimg.data[i + 2] = r;
      rimg.data[i + 3] = 255;
    }
  }
  rctx.putImageData(rimg, 0, 0);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 8;

  return { normalMap, roughnessMap };
}


/** Custom circuits provide their own identity and environment, independent of
 * whichever catalogue track was selected before opening the editor. */
export function resolveTrackForWorld(track: TrackSpec, customData?: CustomTrackData | null): TrackSpec {
  if (!customData) return track;
  return {
    ...track,
    name: customData.name,
    biome: customData.biome,
    roadWidth: customData.roadWidth,
    gravityG: customData.biome === 'mars_colony' ? 0.38 : 1,
  };
}

export function buildTrackWorld(
  track: TrackSpec,
  mode: GameMode,
  layoutVariant: 'GP' | 'National' | 'Sprint' = 'GP',
  customData?: CustomTrackData | null
): BuiltTrackWorld {
  track = resolveTrackForWorld(track, customData);
  const group = new THREE.Group();
  let terrainHeightAt: (x: number, z: number) => number = () => -0.35;
  const rng = seededRandom(track.seed + (layoutVariant === 'National' ? 17 : layoutVariant === 'Sprint' ? 53 : 0));
  const roadWidth = customData?.roadWidth ?? (mode === 'drag' ? 18 : mode === 'derby' ? 95 : track.roadWidth);

  // 1. Generate Control Points for the Circuit / Strip / Arena
  const controlPts: THREE.Vector3[] = [];
  let isClosedLoop = true;

  if (mode === 'drag') {
    isClosedLoop = false;
    for (let i = 0; i <= 12; i++) {
      controlPts.push(new THREE.Vector3(0, 0, i * 85));
    }
  } else if (customData && customData.points.length >= 4) {
    for (const p of customData.points) {
      controlPts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
  } else {
    const numAnchors =
      layoutVariant === 'Sprint' ? 12 : layoutVariant === 'National' ? 16 : Math.min(24, Math.max(12, track.corners));
    const baseRadius = mode === 'derby' ? 85 : track.category === 'rc_revolt' ? 145 : 275;
    const elevScale = Math.min(26, track.elevationGainM * 0.09);

    for (let i = 0; i < numAnchors; i++) {
      const angle = (i / numAnchors) * Math.PI * 2;
      const radialMod =
        1 +
        0.32 * Math.sin(angle * 2 + rng() * 1.4) +
        0.18 * Math.cos(angle * 3 + rng() * 2.0) +
        (rng() - 0.5) * 0.16;
      const r = baseRadius * radialMod;
      const y =
        mode === 'derby'
          ? 0
          : Math.max(0, (Math.sin(angle * 2 + 0.6) * 0.5 + 0.5) * elevScale);
      controlPts.push(new THREE.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r));
    }
  }

  const curve = new THREE.CatmullRomCurve3(controlPts, isClosedLoop, 'catmullrom', 0.5);
  const sampleCount = isClosedLoop ? 480 : 160;
  const samplePoints: THREE.Vector3[] = [];
  const sampleTangents: THREE.Vector3[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const t = i / (isClosedLoop ? sampleCount : sampleCount - 1);
    samplePoints.push(curve.getPointAt(t));
    sampleTangents.push(curve.getTangentAt(t).normalize());
  }
  const totalLengthM = curve.getLength();
  const biomePalette = paletteForBiome(track.biome);

  // --- Landscape -----------------------------------------------------------
  // Two-tier terrain: an inner plate with metric detail carved for the road, and
  // a 6 km outer shell carrying the macro landform and ridgelines that give the
  // horizon its shape. The old build used a single 1.8 km plane with ±7 m of
  // noise, which is optically flat: it produced a razor-line horizon and no
  // shading structure at all.
  const landscape = buildTerrainV2(track.biome, samplePoints, roadWidth, track.seed);
  group.add(landscape.group);
  terrainHeightAt = landscape.heightAt;

  // Horizon vegetation band, tinted from the biome's own foliage so the Sahara
  // does not get a temperate forest on its skyline.
  const horizonShape = terrainShapeFor(track.biome);
  const bandCentre = new THREE.Vector3(0, 0, 0);
  const bandHue = new THREE.Color(biomePalette.foliage[0]).lerp(new THREE.Color(horizonShape.hazeHex), 0.18);
  group.add(
    buildTreeLineBand(
      bandCentre,
      2600,
      Math.max(26, horizonShape.ridgeAmp * 0.18),
      // Pass the palette through untouched except for the foliage tint, which
      // is what the band actually samples.
      { ...biomePalette, foliage: [`#${bandHue.getHexString()}`] } as typeof biomePalette,
      track.seed + 91
    )
  );

  // --- Forest: the actual vegetation --------------------------------------
  // The old build placed one full-detail tree every 6 spline samples, 8–32 m
  // from the centreline: the triangle cost of a real tree with the coverage of
  // a garden ornament. This scatters 3 LOD rings instead, so the verge, the
  // mid-field and the ridges are all covered.
  const isUrbanBiome =
    track.biome === 'neo_tokyo' ||
    track.biome === 'sao_paulo' ||
    track.biome === 'cyber_2099' ||
    track.biome === 'london_fog' ||
    track.biome === 'dubai_sky';
  const isDesertBiome = track.biome === 'sahara_desert' || track.biome === 'mars_colony' || track.biome === 'space_orbital';
  const isRcBiome = track.biome.startsWith('rc_');
  const forestDensity = isRcBiome ? 0 : isUrbanBiome ? 0.25 : isDesertBiome ? 0.18 : 1;
  if (forestDensity > 0) {
    const forest = buildForest(
      {
        count: Math.round((mode === 'derby' ? 1200 : 4200) * forestDensity),
        minRoadDist: roadWidth * 0.5 + (isUrbanBiome ? 12 : 6),
        maxRoadDist: 1200,
        radiusM: 1250,
        species: biomePalette.species,
        density: forestDensity,
        seed: track.seed + 417,
      },
      biomePalette,
      landscape.heightAt,
      landscape.distToRoad
    );
    group.add(forest.group);
  }


  // 2. Ground Plane by Biome
  const groundColors: Partial<Record<BiomeTheme, number>> = {
    interlagos_br: 0x2b5829,
    race_circuit: 0x284b28,
    neo_tokyo: 0x0b0e17,
    sao_paulo: 0x1e222a,
    dubai_sky: 0xc29b61,
    rio_coast: 0x1b6ca8,
    london_fog: 0x2b303a,
    snow_city: 0xdbe7f0,
    havana_vintage: 0x2a6f97,
    amazon_jungle: 0x1b4332,
    sahara_desert: 0xd4a373,
    norway_fjord: 0x1d3557,
    swiss_alps: 0xe2eafc,
    iceland_volcano: 0x1b1919,
    touge_sakura: 0x243b2c,
    scottish_sheep: 0x386641,
    grand_canyon: 0x9b3d22,
    cyber_2099: 0x090418,
    underwater_dome: 0x03254c,
    space_orbital: 0x020308,
    jurassic_island: 0x1e4d2b,
    cloud_kingdom: 0x90e0ef,
    mars_colony: 0x8c2f1b,
    wasteland_mad: 0x6f4e37,
    rc_kitchen: 0xd8d2c5,
    rc_garden_cat: 0x2d6a4f,
    rc_bedroom: 0x3d5a80,
    rc_bathroom: 0xcaf0f8,
    rc_supermarket: 0xadb5bd,
  };

  // Terrain: displaced, height-coloured, with real micro-detail. The old build
  // used a 4.2 km flat plane in one flat colour, which is why the road looked
  // like it was laid on a table.
  // The landscape is built *after* the road exists (see below) because it needs
  // the spline to carve the verge. Nothing between here and there needs it.


  // 3. Build Ribbon Road Geometry + Red/White (or Green/Yellow Interlagos!) Kerbs
  const roadPositions: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];
  const kerbPositions: number[] = [];
  const kerbColors: number[] = [];
  const kerbIndices: number[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const segCount = samplePoints.length;
  let cumDist = 0;

  for (let i = 0; i <= segCount; i++) {
    const idx = isClosedLoop ? i % segCount : Math.min(segCount - 1, i);
    const pt = samplePoints[idx];
    const tan = sampleTangents[idx];
    const right = new THREE.Vector3().crossVectors(tan, up).normalize();

    const halfW = roadWidth * 0.5;
    const leftEdge = pt.clone().addScaledVector(right, -halfW);
    const rightEdge = pt.clone().addScaledVector(right, halfW);

    roadPositions.push(leftEdge.x, leftEdge.y + 0.03, leftEdge.z);
    roadPositions.push(rightEdge.x, rightEdge.y + 0.03, rightEdge.z);

    // Metric UVs: v advances one full texture tile per road-width of travel.
    // Previously v was 0..1 across the whole lap, so on a 5 km circuit one texel
    // covered ~10 metres and every surface detail was smeared into mush.
    cumDist += i > 0 ? pt.distanceTo(samplePoints[Math.max(0, idx - 1)]) : 0;
    const vCoord = cumDist / Math.max(4, roadWidth);
    roadUvs.push(0, vCoord, 1, vCoord);

    // Kerbs along both edges
    const kerbW = 1.15;
    const kLL = leftEdge.clone().addScaledVector(right, -kerbW);
    const kRR = rightEdge.clone().addScaledVector(right, kerbW);

    kerbPositions.push(
      kLL.x, kLL.y + 0.05, kLL.z,
      leftEdge.x, leftEdge.y + 0.06, leftEdge.z,
      rightEdge.x, rightEdge.y + 0.06, rightEdge.z,
      kRR.x, kRR.y + 0.05, kRR.z
    );

    const alt = i % 2 === 0;
    const c1 = track.biome === 'interlagos_br' ? (alt ? [0.0, 0.62, 0.22] : [1.0, 0.84, 0.0]) : alt ? [0.88, 0.1, 0.14] : [0.95, 0.96, 0.98];
    for (let k = 0; k < 4; k++) {
      kerbColors.push(c1[0], c1[1], c1[2]);
    }

    if (i < segCount) {
      const rBase = i * 2;
      roadIndices.push(rBase, rBase + 1, rBase + 2, rBase + 1, rBase + 3, rBase + 2);

      const kBase = i * 4;
      kerbIndices.push(kBase, kBase + 1, kBase + 4, kBase + 1, kBase + 5, kBase + 4);
      kerbIndices.push(kBase + 2, kBase + 3, kBase + 6, kBase + 3, kBase + 7, kBase + 6);
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  // aoMap samples channel 1 (`uv1`) in three.js r152+. Same metric UVs, but
  // this lets the real-photograph ambient occlusion tile at its own scale.
  roadGeo.setAttribute('uv1', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();

  const baseRoadTex = createRoadSurfaceTexture(track.biome);
  baseRoadTex.wrapT = THREE.RepeatWrapping;
  baseRoadTex.wrapS = THREE.ClampToEdgeWrapping;
  baseRoadTex.anisotropy = 8;
  // BUG FIX (long-standing vertical streaking on every road):
  // createRoadSurfaceTexture() set repeat=(1,75) for the OLD UV scheme where v
  // ran 0..1 across the entire lap. The mesh now uses METRIC UVs
  // (v = distance / roadWidth), so 75 repeats became 75 tiles per ~12 m —
  // 16 cm per tile. The painted dashes and aggregate were minified into long
  // moiré streaks toward the horizon. One tile per road width is the correct
  // physical scale and matches every other road map.
  baseRoadTex.repeat.set(1, 1);
  const detail = createAsphaltDetailMaps();
  const glossyFloor = track.biome === 'neo_tokyo' || track.biome === 'rc_bathroom';

  // ── PHOTOGRAPHIC ASPHALT (realism pass #3) ──────────────────────────────
  // A photo of real aggregate carries spatial frequencies noise cannot fake:
  // crushed stone edges, binder pools, patch seams, paint worn into the grain.
  // Derived maps (Sobel normals, local-variance roughness, cavity AO) make it
  // react to the sun and headlights instead of looking like a printed decal.
  // Exotic biomes keep their procedural identity (tiles, sand, regolith).
  const photoBiome = ![
    'rc_kitchen', 'rc_bathroom', 'amazon_jungle', 'sahara_desert',
    'mars_colony', 'cloud_kingdom',
  ].includes(track.biome);
  const photos = photoBiome ? getPhotographicAssetLibrary() : null;
  const usePhotos = !!photos && !glossyFloor && photographicAssetsEnabled();
  let photoRoadMap: THREE.Texture | null = null;
  let photoRoadNormal: THREE.Texture | null = null;
  let photoRoadRoughness: THREE.Texture | null = null;
  let photoRoadAo: THREE.Texture | null = null;
  if (photos && !glossyFloor) {
    // u spans exactly one road width. The albedo photo already contains the
    // worn edge lines, amber dashes and twin rubber grooves at that scale.
    photoRoadMap = clonePhoto(photos.asphaltAlbedo, 1, 1);
    // All four maps share ONE UV transform: the normal, roughness and AO were
    // derived from this exact photograph, so their relief must line up with the
    // visible aggregate. One 1024² tile per road width is ~1.2 cm/texel on a
    // 12 m road — the physical scale of real aggregate, and coarse enough not
    // to alias into streaks at grazing angles.
    photoRoadNormal = clonePhoto(photos.asphaltNormal, 1, 1);
    photoRoadRoughness = clonePhoto(photos.asphaltRoughness, 1, 1);
    photoRoadAo = clonePhoto(photos.asphaltAo, 1, 1, 1);
  }
  const photographicRoad = usePhotos;
  let roadMap: THREE.Texture = usePhotos && photoRoadMap ? photoRoadMap : baseRoadTex;
  let roadNormal: THREE.Texture | null = glossyFloor ? null : usePhotos ? photoRoadNormal : detail.normalMap;
  let roadRoughness: THREE.Texture | null = glossyFloor ? null : usePhotos ? photoRoadRoughness : detail.roughnessMap;
  let roadAo: THREE.Texture | null = usePhotos ? photoRoadAo : null;
  let roadNormalScale = new THREE.Vector2(usePhotos ? 0.32 : 0.55, usePhotos ? 0.32 : 0.55);
  const roadMat = new THREE.MeshPhysicalMaterial({
    map: roadMap,
    normalMap: roadNormal,
    normalScale: roadNormalScale,
    roughnessMap: roadRoughness,
    roughness: glossyFloor ? 0.22 : photographicRoad ? 0.9 : 0.78,
    // Note: when the player A/B-toggles the photo pass at runtime only the
    // maps are swapped (see applyPhotographicMaps); roughness stays at the
    // photo value because it is a scalar, not a texture, and 0.9 still reads
    // correctly with the procedural roughnessMap (which is mostly ~0.72).
    aoMap: roadAo,
    aoMapIntensity: roadAo ? 0.62 : 1,
    metalness: track.biome === 'neo_tokyo' ? 0.35 : 0.02,
    // Wet asphalt is a water film over a rough substrate — which is exactly what
    // clearcoat models. Dry, it stays subtle so the aggregate still reads.
    clearcoat: glossyFloor ? 0.8 : 0.08,
    clearcoatRoughness: glossyFloor ? 0.06 : 0.5,
    // The photographic IBL is a real bright sky; at unity it lifts dark
    // bitumen toward silver. Damp the specular environment on photo asphalt.
    envMapIntensity: photographicRoad ? 0.62 : 1.0,
  });
  roadMat.userData.photographic = photographicRoad;
  if (photoRoadMap && photoRoadNormal && photoRoadRoughness) {
    tagPhotographicMaterial(
      roadMat,
      { map: photoRoadMap, normalMap: photoRoadNormal, roughnessMap: photoRoadRoughness, aoMap: photoRoadAo },
      { map: baseRoadTex, normalMap: detail.normalMap, roughnessMap: detail.roughnessMap, aoMap: null }
    );
  }
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const kerbGeo = new THREE.BufferGeometry();
  kerbGeo.setAttribute('position', new THREE.Float32BufferAttribute(kerbPositions, 3));
  kerbGeo.setAttribute('color', new THREE.Float32BufferAttribute(kerbColors, 3));
  kerbGeo.setIndex(kerbIndices);
  kerbGeo.computeVertexNormals();
  const kerbMesh = new THREE.Mesh(
    kerbGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  );
  group.add(kerbMesh);

  // 4. Start / Finish Gantry Banner & Lights
  const startPt = samplePoints[0];
  const startTan = sampleTangents[0];
  const startHeading = Math.atan2(startTan.x, startTan.z);

  const gantry = new THREE.Group();
  gantry.position.copy(startPt);
  gantry.rotation.y = startHeading;

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, metalness: 0.7, roughness: 0.3 });
  const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), pillarMat);
  pLeft.position.set(-roadWidth * 0.58, 3.75, 0);
  const pRight = pLeft.clone();
  pRight.position.x = roadWidth * 0.58;

  const bannerColor = track.biome === 'rc_bathroom' ? 0xffffff : 0xff2a54;
  const crossBeam = new THREE.Mesh(
    new THREE.BoxGeometry(roadWidth * 1.24, 1.35, 0.8),
    new THREE.MeshStandardMaterial({ color: bannerColor, emissive: bannerColor, emissiveIntensity: 0.25 })
  );
  crossBeam.position.set(0, 7.1, 0);
  gantry.add(pLeft, pRight, crossBeam);

  // ── FIA START LIGHTS (five red lamp pairs, hung from the start gantry) ──
  // Driven per-frame by VelocityEngine from the StartSequence state machine:
  // lamps 0,2,4,6,8 (left lamp of each pair) and 1,3,5,7,9 (right lamp).
  const startLamps: THREE.Mesh[] = [];
  {
    const lampGeo = new THREE.SphereGeometry(0.16, 14, 10);
    const lampHousingGeo = new THREE.BoxGeometry(0.52, 0.34, 0.18);
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.55, metalness: 0.35 });
    const spread = Math.min(roadWidth * 0.52, 5.2);
    for (let i = 0; i < 5; i++) {
      const x = -spread / 2 + (i * spread) / 4;
      const housing = new THREE.Mesh(lampHousingGeo, housingMat);
      housing.position.set(x, 6.28, 0);
      gantry.add(housing);
      for (const side of [-0.11, 0.11]) {
        // Each lamp starts dark; the engine lights them red for the hold,
        // then extinguishes ALL of them at once (FIA "lights out").
        const lampMat = new THREE.MeshStandardMaterial({
          color: 0x1a0505,
          emissive: 0xff1a1a,
          emissiveIntensity: 0.04,
          roughness: 0.35,
        });
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(x + side, 6.28, 0.115);
        lamp.userData.startLamp = startLamps.length;
        gantry.add(lamp);
        startLamps.push(lamp);
      }
    }
  }
  group.add(gantry);

  // 5. Populate Scenery, Spectators, Churrasco Smoke, Sheep, THE CAT, Destructibles & Power-Ups!
  const destructibles: DestructibleProp[] = [];
  const hazards: HazardEntity[] = [];
  const animatedProps: { obj: THREE.Object3D; update: (t: number, dt: number) => void }[] = [];

  const swayingTrees: { sway: (t: number, wind: number) => void; phase: number }[] = [];
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });

  const buildingColors = [0x1b263b, 0x240046, 0x0f172a, 0x2b2d42];
  const neonColors = [0x00f5d4, 0xff007f, 0xffbe0b, 0x3a86ff];

  for (let i = 6; i < segCount - 4; i += 6) {
    const pt = samplePoints[i];
    const tan = sampleTangents[i];
    const right = new THREE.Vector3().crossVectors(tan, up).normalize();
    const side = i % 12 === 0 ? 1 : -1;
    const distOut = roadWidth * 0.5 + 8 + rng() * 24;
    const propPos = pt.clone().addScaledVector(right, side * distOut);

    if (
      track.biome === 'neo_tokyo' ||
      track.biome === 'sao_paulo' ||
      track.biome === 'dubai_sky' ||
      track.biome === 'cyber_2099' ||
      track.biome === 'london_fog' ||
      track.biome === 'havana_vintage'
    ) {
      // Urban Skyscrapers / Colonial Buildings + Neon Billboards
      const bh = track.biome === 'havana_vintage' ? 9 + rng() * 8 : 22 + rng() * 68;
      const bw = 10 + rng() * 12;
      const bMat = new THREE.MeshStandardMaterial({
        color:
          track.biome === 'havana_vintage'
            ? [0xf4a261, 0x2ec4b6, 0xe9c46a, 0xe76f51][i % 4]
            : buildingColors[i % buildingColors.length],
        roughness: 0.4,
        metalness: 0.45,
      });
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw), bMat);
      const groundY = terrainHeightAt(propPos.x, propPos.z);
      bldg.position.set(propPos.x, groundY + bh * 0.5 - 1, propPos.z);
      group.add(bldg);

      if (track.biome === 'neo_tokyo' || track.biome === 'cyber_2099' || track.biome === 'sao_paulo') {
        const neonSign = new THREE.Mesh(
          new THREE.BoxGeometry(bw * 1.04, 2.2, bw * 1.04),
          new THREE.MeshBasicMaterial({ color: neonColors[i % neonColors.length] })
        );
        neonSign.position.set(propPos.x, groundY + Math.min(bh - 3, 12 + (i % 18)), propPos.z);
        group.add(neonSign);
      }
    } else if (track.category === 'rc_revolt') {
      // Giant Macro Household Props (Chairs, Soup Cans, Lego Blocks, Soap!)
      const giantColor = [0xe63946, 0xffbe0b, 0x00bbf9, 0x38b000][i % 4];
      const giantProp = new THREE.Mesh(
        track.biome === 'rc_supermarket'
          ? new THREE.CylinderGeometry(4.5, 4.5, 14, 16)
          : new THREE.BoxGeometry(9, 14, 9),
        new THREE.MeshStandardMaterial({ color: giantColor, roughness: 0.35 })
      );
      giantProp.position.set(propPos.x, terrainHeightAt(propPos.x, propPos.z) + 6.5, propPos.z);
      group.add(giantProp);
    } else if (track.biome === 'underwater_dome') {
      // Glass Arch Ring + Swimming Whale/Shark silhouettes!
      if (i % 18 === 0) {
        const archMesh = new THREE.Mesh(
          new THREE.TorusGeometry(roadWidth * 0.72, 0.35, 10, 24, Math.PI),
          new THREE.MeshBasicMaterial({ color: 0x48cae4, transparent: true, opacity: 0.45 })
        );
        archMesh.position.copy(pt);
        archMesh.rotation.y = Math.atan2(tan.x, tan.z);
        group.add(archMesh);
      }
    } else {
      // Botanical Trees / Dunes / Rocks / Grandstands
      if (i % 24 === 0 && (track.biome === 'interlagos_br' || track.biome === 'race_circuit')) {
        // Grandstand with animated colorful spectators!
        const stand = new THREE.Group();
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(22, 5, 7),
          new THREE.MeshStandardMaterial({ color: 0x334155 })
        );
        base.position.y = 2.5;
        stand.add(base);
        for (let f = -8; f <= 8; f += 2) {
          const fan = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 1.3, 0.6),
            new THREE.MeshBasicMaterial({ color: neonColors[(i + f + 20) % neonColors.length] })
          );
          fan.position.set(f, 5.6, 0);
          stand.add(fan);
        }
        stand.position.set(propPos.x, terrainHeightAt(propPos.x, propPos.z), propPos.z);
        stand.lookAt(pt.x, pt.y + 2, pt.z);
        group.add(stand);

        // INTERLAGOS CHURRASCO SMOKE ON THE HILLSIDE!
        if (track.hasChurrascoSmoke) {
          const smokePuff = new THREE.Mesh(
            new THREE.SphereGeometry(2.6, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.42 })
          );
          smokePuff.position.set(propPos.x, terrainHeightAt(propPos.x, propPos.z) + 6, propPos.z);
          group.add(smokePuff);
          const baseY = pt.y + 5;
          animatedProps.push({
            obj: smokePuff,
            update: (t) => {
              const cycle = (t * 0.6 + i) % 4;
              smokePuff.position.y = baseY + cycle * 3.8;
              smokePuff.scale.setScalar(0.8 + cycle * 0.55);
            },
          });
        }
      } else {
        // Real vegetation: a branching trunk with a noise-displaced canopy, in
        // one of several species weighted by the biome. The old cone-on-a-stick
        // was the single most "cartoon" object on the whole track.
        const speciesKey = pickSpecies(biomePalette, rng);
        const scale = 0.75 + rng() * 0.7;
        const tree = buildTree(speciesKey, biomePalette, track.seed + i * 13, scale);
        tree.group.position.set(propPos.x, terrainHeightAt(propPos.x, propPos.z), propPos.z);
        tree.group.rotation.y = rng() * Math.PI * 2;
        group.add(tree.group);
        swayingTrees.push({ sway: tree.sway, phase: rng() * 6.28 });
      }
    }

    // Destructible Cones & Fire Hydrants along road shoulders!
    if (i % 18 === 0) {
      const isHydrant = i % 54 === 0 && track.category === 'urban_fictional';
      const propGroup = new THREE.Group();
      const shoulderPos = pt.clone().addScaledVector(right, side * (roadWidth * 0.5 + 1.1));
      if (isHydrant) {
        const hyd = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.28, 0.85, 10),
          new THREE.MeshStandardMaterial({ color: 0xd90429, metalness: 0.4 })
        );
        hyd.position.y = 0.42;
        propGroup.add(hyd);
      } else {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.32, 0.78, 10),
          new THREE.MeshStandardMaterial({ color: 0xff6d00 })
        );
        cone.position.y = 0.39;
        propGroup.add(cone);
      }
      propGroup.position.copy(shoulderPos);
      group.add(propGroup);
      destructibles.push({
        mesh: propGroup,
        x: shoulderPos.x,
        y: shoulderPos.y,
        z: shoulderPos.z,
        vx: 0,
        vy: 0,
        vz: 0,
        hit: false,
        isHydrant,
        geyserTimer: 0,
      });
    }

    // Track Hazards & Mode Pickups!
    // 1. Scottish Highlands SHEEP (Respect Animals!)
    if (track.hasSheepHazard && i % 42 === 0) {
      const sheepGroup = new THREE.Group();
      const wool = new THREE.Mesh(
        new THREE.SphereGeometry(0.75, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.95 })
      );
      wool.position.y = 0.75;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x212529 })
      );
      head.position.set(0, 0.95, 0.68);
      sheepGroup.add(wool, head);
      const lanePos = pt.clone().addScaledVector(right, ((i % 3) - 1) * (roadWidth * 0.25));
      sheepGroup.position.copy(lanePos);
      group.add(sheepGroup);
      hazards.push({
        kind: 'sheep',
        mesh: sheepGroup,
        x: lanePos.x,
        y: lanePos.y,
        z: lanePos.z,
        radius: 1.35,
        phase: i,
        active: true,
      });
    }

    // 2. São Paulo Potholes (Buracos no Asfalto!)
    if (track.hasPotholes && i % 30 === 0) {
      const holePos = pt.clone().addScaledVector(right, (rng() - 0.5) * roadWidth * 0.65);
      const potholeMesh = new THREE.Mesh(
        new THREE.CircleGeometry(1.3, 14),
        new THREE.MeshBasicMaterial({ color: 0x0b0c10 })
      );
      potholeMesh.rotation.x = -Math.PI / 2;
      potholeMesh.position.set(holePos.x, holePos.y + 0.055, holePos.z);
      group.add(potholeMesh);
      hazards.push({
        kind: 'pothole',
        mesh: potholeMesh,
        x: holePos.x,
        y: holePos.y,
        z: holePos.z,
        radius: 1.35,
        phase: 0,
        active: true,
      });
    }

    // 3. Standing Water / Juice Puddles
    if ((track.biome === 'rc_kitchen' || track.biome === 'neo_tokyo') && i % 36 === 0) {
      const puddlePos = pt.clone().addScaledVector(right, (rng() - 0.5) * roadWidth * 0.55);
      const puddleColor = track.biome === 'rc_kitchen' ? 0xff9f1c : 0x3a86ff;
      const puddleMesh = new THREE.Mesh(
        new THREE.CircleGeometry(2.6, 18),
        new THREE.MeshPhysicalMaterial({
          color: puddleColor,
          roughness: 0.04,
          metalness: 0.85,
          transparent: true,
          opacity: 0.65,
        })
      );
      puddleMesh.rotation.x = -Math.PI / 2;
      puddleMesh.position.set(puddlePos.x, puddlePos.y + 0.052, puddlePos.z);
      group.add(puddleMesh);
      hazards.push({
        kind: 'puddle',
        mesh: puddleMesh,
        x: puddlePos.x,
        y: puddlePos.y,
        z: puddlePos.z,
        radius: 2.6,
        phase: 0,
        active: true,
      });
    }

    // 4. Re-Volt Legacy Floating Lightning Pickups!
    if ((mode === 'revolt_legacy' || track.category === 'rc_revolt') && i % 24 === 0) {
      const pickupPos = pt.clone().addScaledVector(right, ((i % 3) - 1) * (roadWidth * 0.24));
      const boltOrb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.85, 0),
        new THREE.MeshBasicMaterial({ color: 0xffbe0b, wireframe: false })
      );
      boltOrb.position.set(pickupPos.x, pickupPos.y + 1.15, pickupPos.z);
      group.add(boltOrb);
      hazards.push({
        kind: 'powerup',
        mesh: boltOrb,
        x: pickupPos.x,
        y: pickupPos.y,
        z: pickupPos.z,
        radius: 1.8,
        phase: i,
        active: true,
      });
      animatedProps.push({
        obj: boltOrb,
        update: (t) => {
          boltOrb.rotation.y = t * 2.8 + i;
          boltOrb.position.y = pickupPos.y + 1.15 + Math.sin(t * 3.5 + i) * 0.22;
        },
      });
    }

    // 5. Stunt Mode & RC Bathroom Soap Jump Ramps!
    if ((mode === 'stunt' && i % 30 === 0) || (track.biome === 'rc_bathroom' && i % 60 === 0)) {
      const rampColor = track.biome === 'rc_bathroom' ? 0xffafcc : 0xffbe0b;
      const rampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.5, 1.2, 7.5),
        new THREE.MeshStandardMaterial({ color: rampColor, roughness: 0.3 })
      );
      rampMesh.position.set(pt.x, pt.y + 0.35, pt.z);
      rampMesh.rotation.y = Math.atan2(tan.x, tan.z);
      rampMesh.rotation.x = -0.22;
      group.add(rampMesh);
      hazards.push({
        kind: 'ramp',
        mesh: rampMesh,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        radius: 3.6,
        phase: 0,
        active: true,
      });
    }

    // 6. Delivery Mode Glowing Drop Zones!
    if (mode === 'delivery' && i % 48 === 0) {
      const zoneRing = new THREE.Mesh(
        new THREE.CylinderGeometry(3.8, 3.8, 4.5, 20, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x06d6a0,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        })
      );
      zoneRing.position.set(pt.x, pt.y + 2.2, pt.z);
      group.add(zoneRing);
      hazards.push({
        kind: 'delivery_zone',
        mesh: zoneRing,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        radius: 4.2,
        phase: i,
        active: true,
      });
    }
  }

  // THE GIANT HOUSE CAT IN RC GARDEN ("COM O GATO!")
  if (track.hasHouseCat) {
    const catAnchor = samplePoints[Math.floor(segCount * 0.35)];
    const catGroup = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0xe07a5f, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(3.2, 6.5, 8, 16), furMat);
    body.rotation.x = Math.PI / 2;
    body.position.y = 4.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.8, 16, 16), furMat);
    head.position.set(0, 6.5, 4.8);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.1, 4), furMat);
    earL.position.set(-1.5, 8.9, 4.8);
    const earR = earL.clone();
    earR.position.x = 1.5;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x70e000 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 10), eyeMat);
    eyeL.position.set(-1.0, 6.9, 7.3);
    const eyeR = eyeL.clone();
    eyeR.position.x = 1.0;
    const paw = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 12), furMat);
    paw.position.set(0, 1.4, 7.8);
    catGroup.add(body, head, earL, earR, eyeL, eyeR, paw);
    catGroup.position.set(catAnchor.x + 8, catAnchor.y, catAnchor.z);
    catGroup.lookAt(catAnchor.x, catAnchor.y + 2, catAnchor.z);
    group.add(catGroup);

    animatedProps.push({
      obj: catGroup,
      update: (t) => {
        paw.position.x = Math.sin(t * 2.6) * 4.5;
        paw.position.y = 1.4 + Math.abs(Math.cos(t * 2.6)) * 2.2;
        head.rotation.z = Math.sin(t * 1.8) * 0.18;
      },
    });
    hazards.push({
      kind: 'cat',
      mesh: catGroup,
      x: catAnchor.x,
      y: catAnchor.y,
      z: catAnchor.z,
      radius: 3.2,
      phase: 0,
      active: true,
    });
  }

  // ---------------------------------------------------------------------
  // ROADSIDE DRESSING — guardrail, grass, posts, signs, rocks
  // ---------------------------------------------------------------------
  // The road needs a *corridor*: things that run parallel to it, at real
  // spacings, so the eye can read speed and scale. Without them the asphalt is a
  // ribbon floating in a field.
  const shoulderSides: { points: THREE.Vector3[]; side: THREE.Vector3[] }[] = [];
  const step = 3;
  for (const sign of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    const sds: THREE.Vector3[] = [];
    for (let i = 0; i < samplePoints.length; i += step) {
      const p = samplePoints[i];
      const t = sampleTangents[i];
      const right = new THREE.Vector3().crossVectors(t, up).normalize();
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
      sds.push(right.multiplyScalar(sign));
    }
    shoulderSides.push({ points: pts, side: sds });
  }

  if (biomePalette.hasGuardrail && mode !== 'derby') {
    for (const { points, side } of shoulderSides) {
      const rail = buildGuardrail(points, side, roadWidth * 0.5 + 1.6, 0.58);
      group.add(rail.group);
    }
  }

  if (mode !== 'derby') {
    for (const { points, side } of shoulderSides) {
      // Grass tufts in the corridor between the kerb and the tree line.
      const band = buildGrassBand(
        points,
        side,
        roadWidth * 0.5 + 1.2,
        biomePalette,
        track.category === 'rc_revolt' ? 240 : 1500,
        track.seed + 17,
        11
      );
      group.add(band);
    }
    // Loose stones on the shoulder.
    group.add(
      buildRockScatter(
        shoulderSides[0].points,
        shoulderSides[0].side,
        track.category === 'rc_revolt' ? 24 : 160,
        biomePalette,
        track.seed + 41
      )
    );
  }

  // Delineator posts every ~30 m, alternating sides — the cheapest possible
  // object, and one of the strongest distance cues when you are doing 200 km/h.
  if (mode !== 'derby' && track.category !== 'rc_revolt') {
    const postSpacing = 30;
    let acc = 0;
    for (let i = 1; i < samplePoints.length; i++) {
      acc += samplePoints[i].distanceTo(samplePoints[i - 1]);
      if (acc < postSpacing) continue;
      acc = 0;
      const leftSide = i % 2 === 0;
      const tan = sampleTangents[i];
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      const p = samplePoints[i].clone().addScaledVector(right, (leftSide ? 1 : -1) * (roadWidth * 0.5 + 1.0));
      const post = buildDelineator();
      post.position.set(p.x, p.y, p.z);
      post.rotation.y = Math.atan2(tan.x, tan.z);
      group.add(post);
    }
    // A couple of signs near the first corner, and kilometre pegs.
    const signSpots = [0.18, 0.55, 0.78];
    for (const f of signSpots) {
      const idx = Math.floor(f * samplePoints.length) % samplePoints.length;
      const p = samplePoints[idx];
      const tan = sampleTangents[idx];
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      const spot = p.clone().addScaledVector(right, -(roadWidth * 0.5 + 2.4));
      const sign = buildRoadSign(f < 0.3 ? 'curve' : f < 0.7 ? 'speed' : 'stop', f < 0.3 ? '⟳' : f < 0.7 ? '80' : 'STOP');
      sign.position.set(spot.x, terrainHeightAt(spot.x, spot.z), spot.z);
      sign.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI;
      group.add(sign);
      const km = buildKmMarker();
      km.position.set(p.x + right.x * (roadWidth * 0.5 + 1.5), p.y, p.z + right.z * (roadWidth * 0.5 + 1.5));
      group.add(km);
    }
  }

  if (biomePalette.hasPoles && mode !== 'derby') {
    group.add(buildUtilityLine(shoulderSides[1].points, shoulderSides[1].side, roadWidth * 0.5 + 9, track.seed + 5));
  }

  // Tree sway drives every crown in the scene from one loop.
  animatedProps.push({
    obj: group,
    update: (t) => {
      const wind = track.biome === 'sahara_desert' ? 0.9 : 0.45;
      for (const tr of swayingTrees) tr.sway(t + tr.phase, wind);
    },
  });

  // Orbital Earth / Jurassic T-Rex Landmarks!
  if (track.biome === 'space_orbital') {
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(180, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x0077b6, emissive: 0x023e8a, emissiveIntensity: 0.35 })
    );
    earth.position.set(0, -240, 0);
    group.add(earth);
    animatedProps.push({
      obj: earth,
      update: (_, dt) => {
        earth.rotation.y += dt * 0.05;
      },
    });
  }

  return {
    group,
    curve,
    samplePoints,
    sampleTangents,
    totalLengthM,
    roadWidth,
    isClosedLoop,
    startLamps,
    roadMaterial: roadMat,
    destructibles,
    hazards,
    animatedProps,
    sampleNearest(x: number, z: number) {
      let bestIdx = 0;
      let bestDistSq = Infinity;
      for (let i = 0; i < samplePoints.length; i++) {
        const dx = x - samplePoints[i].x;
        const dz = z - samplePoints[i].z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
      const pt = samplePoints[bestIdx];
      const tan = sampleTangents[bestIdx];
      const rightX = tan.z;
      const rightZ = -tan.x;
      const dx = x - pt.x;
      const dz = z - pt.z;
      const lateralOffset = (dx * (-rightX) + dz * (-rightZ));
      return {
        progress: bestIdx / samplePoints.length,
        point: pt,
        tangent: tan,
        lateralOffset,
        distance: Math.sqrt(bestDistSq),
      };
    },
  };
}

export function buildGarageShowroom(
  tier: 1 | 2 | 3,
  trophyCount: number,
  posters: SavedPoster[]
): { group: THREE.Group; turntable: THREE.Group; spotLights: THREE.SpotLight[] } {
  const group = new THREE.Group();

  const floorColor = tier === 1 ? 0x26292e : tier === 2 ? 0x161b24 : 0x0b0f19;
  const floorRough = tier === 1 ? 0.65 : tier === 2 ? 0.22 : 0.08;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(24, 48),
    new THREE.MeshStandardMaterial({
      color: floorColor,
      roughness: floorRough,
      metalness: tier === 3 ? 0.75 : 0.25,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Rotating Turntable Platform
  const turntable = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.8, 0.14, 48),
    new THREE.MeshStandardMaterial({
      color: tier === 3 ? 0x1d2436 : 0x1e222b,
      metalness: 0.8,
      roughness: 0.18,
    })
  );
  disc.position.y = 0.07;
  disc.receiveShadow = true;
  const neonRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.72, 0.045, 10, 64),
    new THREE.MeshBasicMaterial({
      color: tier === 1 ? 0xff9f1c : tier === 2 ? 0x00f5d4 : 0xffd60a,
    })
  );
  neonRing.rotation.x = Math.PI / 2;
  neonRing.position.y = 0.12;
  turntable.add(disc, neonRing);
  group.add(turntable);

  // Back Wall, Trophy Shelf & Framed Photo Mode Posters!
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(18, 6.5, 0.4),
    new THREE.MeshStandardMaterial({
      color: tier === 1 ? 0x343a40 : tier === 2 ? 0x1b263b : 0x101420,
      roughness: 0.6,
    })
  );
  backWall.position.set(0, 3.25, -7.8);
  group.add(backWall);

  // Trophy Shelf
  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(6.5, 0.12, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x495057, metalness: 0.6 })
  );
  shelf.position.set(-4.5, 2.2, -7.4);
  group.add(shelf);

  const visibleTrophies = Math.min(10, Math.max(1, trophyCount));
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.95, roughness: 0.12 });
  for (let t = 0; t < visibleTrophies; t++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.06, 0.42, 12), goldMat);
    cup.position.set(-7.2 + t * 0.58, 2.48, -7.4);
    group.add(cup);
  }

  // Photo Mode Posters framed on the Garage Wall!
  posters.slice(0, 3).forEach((poster, idx) => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load(poster.dataUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.45),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    frame.position.set(1.5 + idx * 2.75, 3.2, -7.56);
    group.add(frame);
  });

  // Adjustable Showroom Spotlights
  const spotLights: THREE.SpotLight[] = [];
  const spotPositions: [number, number, number][] = [
    [-5.5, 7.2, 5.5],
    [5.5, 7.2, 5.5],
    [0, 8.0, -5.5],
  ];
  spotPositions.forEach(([sx, sy, sz]) => {
    const sp = new THREE.SpotLight(0xffffff, 48, 28, Math.PI / 4, 0.45, 1);
    sp.position.set(sx, sy, sz);
    sp.castShadow = true;
    group.add(sp);
    spotLights.push(sp);
  });

  return { group, turntable, spotLights };
}
