/**
 * LANDSCAPE — macro landform, ridgelines, biome-correct horizons
 * ==============================================================
 *
 * DIAGNOSIS
 * ---------
 * Every circuit in the build used one flat plane, 1800 m across, displaced by a
 * 260 m-wavelength noise field with ±7 m of amplitude and a *planar* UV grid.
 * Three things follow from that, and all three are visible in a screenshot:
 *
 *  1. **No horizon of any kind.** At 7 m of relief over 1.8 km the ground is
 *     optically flat: it meets the sky in a razor line at eye height, like a
 *     golf course, and there is nothing between the road and that line. Real
 *     roads curve: the ground rises and falls, and a ridgeline or a bank of
 *     trees always interrupts the horizon.
 *  2. **Flat lighting.** A plane with ±7 m of bumps gets almost the same sun
 *     angle everywhere, so the terrain has no shading structure at all beyond
 *     the noise in its albedo. Real landscapes read as shapes because the sun
 *     rakes across one side of a hill and shadows the other.
 *  3. **The same landscape everywhere.** The horizon band used the *first*
 *     foliage colour of the palette, so the Sahara had green trees on its
 *     skyline and the snow circuits had a temperate forest.
 *
 * WHAT THIS FILE DOES
 * -------------------
 *  - A **two-tier terrain**: a detailed inner plate (the drivable surround,
 *    metric UVs, real aggregate detail) and a huge outer shell (4.6 km) carrying
 *    macro landforms. The outer shell is what produces horizon shape.
 *  - **Ridgelines** built from an angular *feature* field: a few directional
 *    ridges, elevated by a smooth mask, so the skyline has named hills instead
 *    of noise. Amplitude is per-biome: 260 m in the Alps, 40 m in the Delta.
 *  - **Slope-based geology**: bedrock on steep ground (with a rock normal map),
 *    scree at the base of slopes, grass on flats, and a blend band that follows
 *    the actual normal. This is what gives hills their readable shape.
 *  - **Aerial perspective**: terrain vertex colour is mixed toward the horizon
 *    tint with distance, which is what makes distant hills recede. Fog alone
 *    cannot do this — it needs the far ground to *lighten and desaturate*,
 *    which is the single strongest depth cue in any landscape photograph.
 */

import * as THREE from 'three';
import { BiomeTheme } from '../types/game';
import { fbm2, hash2, seededRandom } from './noise';
import { groundDetailMaps, terrainRockMaps } from './proceduralTextures';
import {
  clonePhoto,
  getPhotographicAssetLibrary,
  photographicAssetsEnabled,
  tagPhotographicMaterial,
} from '../render/PhotographicAssets';

export interface TerrainShape {
  /** Amplitude of the macro landform, metres. */
  macroAmp: number;
  /** Wavelength of the macro landform, metres (large = gentle plains). */
  macroScale: number;
  /** Amplitude of the hills that make the horizon, metres. */
  ridgeAmp: number;
  /** How rugged the ground is at 40–120 m, metres. */
  reliefAmp: number;
  /** Wavelength of the ridge feature field, metres. Bigger = further hills. */
  ridgeScale: number;
  /** Vegetation tint blended into the ground. */
  grassHex: string;
  /** Dry / bare-soil tint. */
  soilHex: string;
  /** Bedrock tint, used on steep slopes. */
  rockHex: string;
  /** Horizon haze tint that far ground fades into. */
  hazeHex: string;
}

const DESERT: Partial<TerrainShape> = {
  macroAmp: 16, macroScale: 620, ridgeAmp: 44, reliefAmp: 4, ridgeScale: 1500,
  grassHex: '#b59263', soilHex: '#c8a274', rockHex: '#8a6a49', hazeHex: '#e8c9a0',
};
const ALPINE: Partial<TerrainShape> = {
  macroAmp: 40, macroScale: 700, ridgeAmp: 175, reliefAmp: 12, ridgeScale: 1500,
  grassHex: '#6b7c58', soilHex: '#8d8574', rockHex: '#6e7076', hazeHex: '#c9d6e2',
};
const JUNGLE: Partial<TerrainShape> = {
  macroAmp: 26, macroScale: 420, ridgeAmp: 105, reliefAmp: 8, ridgeScale: 1300,
  grassHex: '#33501f', soilHex: '#4a3a25', rockHex: '#4d5348', hazeHex: '#b9cbb0',
};
const URBAN: Partial<TerrainShape> = {
  macroAmp: 6, macroScale: 800, ridgeAmp: 14, reliefAmp: 1.8, ridgeScale: 1800,
  grassHex: '#4b5548', soilHex: '#5a5b5c', rockHex: '#565b63', hazeHex: '#c3ccd8',
};
const PLATEAU: Partial<TerrainShape> = {
  macroAmp: 34, macroScale: 520, ridgeAmp: 140, reliefAmp: 9, ridgeScale: 1400,
  grassHex: '#8c6a4a', soilHex: '#a8814f', rockHex: '#8f5b3c', hazeHex: '#e0b394',
};
const COAST: Partial<TerrainShape> = {
  macroAmp: 20, macroScale: 560, ridgeAmp: 78, reliefAmp: 5.5, ridgeScale: 1500,
  grassHex: '#3f6b3a', soilHex: '#6d6a4a', rockHex: '#6b6a63', hazeHex: '#cfe0e8',
};

const TEMPLATE: Record<string, Partial<TerrainShape>> = {
  interlagos_br: COAST, race_circuit: COAST,
  amazon_jungle: JUNGLE, jurassic_island: JUNGLE,
  swiss_alps: ALPINE, norway_fjord: ALPINE, iceland_volcano: ALPINE, cloud_kingdom: ALPINE,
  sahara_desert: DESERT, dubai_sky: { ...DESERT, ridgeAmp: 45 }, mars_colony: { ...DESERT, rockHex: '#8c3f24', soilHex: '#a44a2a', grassHex: '#8c3f24', hazeHex: '#d9805c' },
  grand_canyon: PLATEAU, wasteland_mad: PLATEAU,
  neo_tokyo: URBAN, sao_paulo: URBAN, london_fog: URBAN, cyber_2099: URBAN, snow_city: { ...URBAN, grassHex: '#d9e6f2', soilHex: '#c2d0dd', hazeHex: '#e8f1fa' },
  rio_coast: COAST, havana_vintage: COAST, touge_sakura: COAST, scottish_sheep: COAST,
  underwater_dome: { ...COAST, hazeHex: '#2a5f8a', grassHex: '#2b4a5a' },
  space_orbital: { ...DESERT, macroAmp: 3, ridgeAmp: 6, reliefAmp: 0.5, grassHex: '#2a2e38', soilHex: '#333842', rockHex: '#3a4049', hazeHex: '#8fa6c4' },
  rc_kitchen: URBAN, rc_garden_cat: JUNGLE, rc_bedroom: URBAN, rc_bathroom: URBAN, rc_supermarket: URBAN,
};

export function terrainShapeFor(biome: BiomeTheme, scaleHint = 1): TerrainShape {
  const t = TEMPLATE[biome] ?? COAST;
  const shape: TerrainShape = {
    macroAmp: 22, macroScale: 560, ridgeAmp: 60, reliefAmp: 5, ridgeScale: 1500,
    grassHex: '#3f5a2e', soilHex: '#4d4636', rockHex: '#6b6a63', hazeHex: '#c8d4dd',
    ...t,
  } as TerrainShape;
  const rc = biome.startsWith('rc_');
  const k = rc ? 0.02 : 1;
  return {
    ...shape,
    macroAmp: shape.macroAmp * k * scaleHint,
    macroScale: Math.max(40, shape.macroScale * (rc ? 0.03 : 1)),
    ridgeAmp: shape.ridgeAmp * k * scaleHint,
    reliefAmp: shape.reliefAmp * k,
    ridgeScale: shape.ridgeScale,
  };
}

/**
 * The height field. Deterministic and cheap enough to call per-vertex and later
 * per-wheel, which is required: the visual mesh and the physics height must be
 * the same function or the car floats or sinks on hills.
 */
export function makeHeightField(
  shape: TerrainShape,
  seed: number,
  /** Optional 0..1 envelope: how much landform is allowed at a point. */
  envelope?: (x: number, z: number) => number
): (x: number, z: number) => number {
  return (x: number, z: number) => {
    const env = envelope ? envelope(x, z) : 1;
    // Macro: long, slow swell of the land.
    const macro =
      (fbm2(x / shape.macroScale, z / shape.macroScale, 4, 2.03, 0.5, seed) - 0.5) * shape.macroAmp * 2;
    // Relief: what a car actually drives over.
    const relief =
      (fbm2(x / 68, z / 68, 3, 2.1, 0.5, seed + 7) - 0.5) * shape.reliefAmp * 2 +
      (fbm2(x / 17, z / 17, 2, 2.2, 0.5, seed + 13) - 0.5) * shape.reliefAmp * 0.22;
    // Ridges: angular features that make a skyline. Built from a warped
    // "distance to a set of lines" field, then squared so the crest is sharp
    // and the flanks are long — the profile of a real ridge.
    let ridge = 0;
    {
      let acc = 0;
      for (let i = 0; i < 4; i++) {
        const ang = hash2(i * 13 + seed, 3) * Math.PI * 2;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const warp = (fbm2(x / 900, z / 900, 3, 2.0, 0.5, seed + i) - 0.5) * 520;
        const d = Math.abs((x * ca + z * sa + warp) / shape.ridgeScale);
        acc += Math.pow(Math.max(0, 1 - (d % 1)), 2.4);
      }
      ridge = (acc / 4) * shape.ridgeAmp;
    }
    // The envelope is what keeps a circuit from being built inside a canyon:
    // landform amplitude grows with distance from the racing surface, so the
    // verge is gentle and the mountains are where mountains belong.
    return relief * Math.max(0.35, env) + (macro + ridge) * env;
  };
}

export interface BuiltTerrain {
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  /** Lateral distance to the racing surface, metres (raster-interpolated). */
  distToRoad: (x: number, z: number) => number;
}

/**
 * Builds the landscape as three cooperating meshes:
 *
 *  1. `near`  — 1.4 km, 300² grid (≈4.7 m cells), metric UVs, full detail,
 *               receives shadows, carries the slope/geology colouring.
 *  2. `far`   — 6.0 km, 180² grid (≈33 m cells), same height field including
 *               ridges, heavily hazed, no shadows. This is the horizon.
 *  3. `bank`  — a low berm that follows the road so the verge has a shape.
 */
export function buildTerrainV2(
  biome: BiomeTheme,
  roadPoints: THREE.Vector3[],
  roadWidth: number,
  seed: number
): BuiltTerrain {
  const shape = terrainShapeFor(biome);
  const group = new THREE.Group();

  // --- Distance-to-road field ---------------------------------------------
  // Every terrain query needs "how far is the racing surface from here", both
  // for the carve and for the amplitude envelope. A brute-force scan of a 300²
  // grid against ~120 road samples is 10 M distance tests — fine once, but not
  // per-frame. A coarse distance raster (256²) + bilinear interpolation is
  // within a few metres, which is all a landscape needs.
  const rasterSize = 256;
  const rasterSpan = 3400;
  const raster = new Float32Array(rasterSize * rasterSize);
  // Nearest road elevation, so the carve follows the circuit up and down. Without
  // this the terrain is flattened toward y = 0 and every elevated section of the
  // lap floats in mid-air over its own verge.
  const rasterY = new Float32Array(rasterSize * rasterSize);
  const rStep = rasterSpan / rasterSize;
  const roadSamples = roadPoints.filter((_, i) => i % 2 === 0);
  {
    const coarse: THREE.Vector3[] = [];
    const stride = Math.max(1, Math.floor(roadSamples.length / 90));
    for (let i = 0; i < roadSamples.length; i += stride) coarse.push(roadSamples[i]);
    for (let j = 0; j < rasterSize; j++) {
      const z = -rasterSpan / 2 + (j + 0.5) * rStep;
      for (let i = 0; i < rasterSize; i++) {
        const x = -rasterSpan / 2 + (i + 0.5) * rStep;
        let best = 1e12;
        let bestY = 0;
        for (const p of coarse) {
          const dx = p.x - x;
          const dz = p.z - z;
          const d = dx * dx + dz * dz;
          if (d < best) {
            best = d;
            bestY = p.y;
          }
        }
        raster[j * rasterSize + i] = Math.sqrt(best);
        rasterY[j * rasterSize + i] = bestY;
      }
    }
  }
  const distToRoad = (x: number, z: number): number => {
    const fx = THREE.MathUtils.clamp((x + rasterSpan / 2) / rStep - 0.5, 0, rasterSize - 1.001);
    const fz = THREE.MathUtils.clamp((z + rasterSpan / 2) / rStep - 0.5, 0, rasterSize - 1.001);
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fz);
    const tx = fx - i0;
    const tz = fz - j0;
    const a = raster[j0 * rasterSize + i0];
    const b = raster[j0 * rasterSize + i0 + 1];
    const c = raster[(j0 + 1) * rasterSize + i0];
    const d = raster[(j0 + 1) * rasterSize + i0 + 1];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), tz);
  };
  const roadElevationAt = (x: number, z: number): number => {
    const fx = THREE.MathUtils.clamp((x + rasterSpan / 2) / rStep - 0.5, 0, rasterSize - 1.001);
    const fz = THREE.MathUtils.clamp((z + rasterSpan / 2) / rStep - 0.5, 0, rasterSize - 1.001);
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fz);
    const tx = fx - i0;
    const tz = fz - j0;
    const a = rasterY[j0 * rasterSize + i0];
    const b = rasterY[j0 * rasterSize + i0 + 1];
    const c = rasterY[(j0 + 1) * rasterSize + i0];
    const d = rasterY[(j0 + 1) * rasterSize + i0 + 1];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), tz);
  };

  // Envelope: how much landform is allowed at a distance from the road. The
  // ramp length scales with the biome's own relief — a 175 m alpine wall that
  // starts 60 m from the guardrail is a canyon, not a valley. Low-relief biomes
  // (the Delta, city plains) start closing in almost immediately.
  const envStart = 22 + shape.ridgeAmp * 0.55;
  const envRamp = 110 + shape.ridgeAmp * 0.95;
  const envelope = (x: number, z: number): number => {
    const d = distToRoad(x, z);
    const t = THREE.MathUtils.clamp((d - envStart) / envRamp, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };

  const heightAt = makeHeightField(shape, seed, envelope);
  const nearMask = distToRoad;
  const carveRadius = roadWidth * 0.5 + 3.2;

  const makePlane = (
    size: number,
    segments: number,
    withRoadCarve: boolean,
    hazeStart: number,
    hazeEnd: number,
    cellDetail: number
  ): { mesh: THREE.Mesh; heights: Float32Array } => {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = heightAt(x, z);
      if (withRoadCarve) {
        // Blend the natural ground toward the *road's own* elevation inside the
        // verge, then back up to the natural landform beyond it. Blending toward
        // zero instead is what makes an elevated corner float.
        const d = nearMask(x, z);
        const roadY = roadElevationAt(x, z);
        if (d < carveRadius + 26) {
          const t = THREE.MathUtils.clamp((d - carveRadius) / 26, 0, 1);
          const blend = t * t * (3 - 2 * t);
          y = THREE.MathUtils.lerp(roadY - 0.22, y, blend);
        } else if (d < carveRadius + 90) {
          // Verge berm: the shoulder lifts a little then settles, which is what
          // stops the road from looking inlaid on a billiard table.
          const t = (d - carveRadius - 26) / 64;
          const roadBlend = 1 - THREE.MathUtils.clamp(t, 0, 1);
          y = THREE.MathUtils.lerp(y, roadY - 0.22, roadBlend * 0.55);
          y += Math.sin(THREE.MathUtils.clamp(t, 0, 1) * Math.PI) * 0.5;
        }
      }
      pos.setY(i, y);
      heights[i] = y;
    }
    geo.computeVertexNormals();

    // --- Colour: geology by slope, then aerial perspective by distance ------
    const colors = new Float32Array(pos.count * 3);
    const normals = geo.attributes.normal as THREE.BufferAttribute;
    const grass = new THREE.Color(shape.grassHex);
    const soil = new THREE.Color(shape.soilHex);
    const rock = new THREE.Color(shape.rockHex);
    const haze = new THREE.Color(shape.hazeHex);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const slope = 1 - Math.max(0, normals.getY(i));
      // Flats are vegetation, mid slopes are soil, steep walls are bedrock.
      c.copy(grass);
      c.lerp(soil, THREE.MathUtils.clamp(slope * 4.2, 0, 1));
      if (slope > 0.22) c.lerp(rock, THREE.MathUtils.clamp((slope - 0.22) * 3.4, 0, 1));
      // Two-scale mottling: patchiness at 30 m, grain at 3 m.
      const m1 = fbm2(x / 34, z / 34, 3, 2.0, 0.5, seed + 3);
      const m2 = fbm2(x / 4.5, z / 4.5, 2, 2.2, 0.5, seed + 21);
      c.multiplyScalar(0.82 + m1 * 0.3 + (m2 - 0.5) * 0.1);
      // Snow above a snow line, if this biome has one.
      if (shape.ridgeAmp > 150) {
        const snowLine = shape.ridgeAmp * 0.62;
        const alt = heights[i];
        if (alt > snowLine) {
          const t = THREE.MathUtils.clamp((alt - snowLine) / (shape.macroAmp + shape.ridgeAmp - snowLine), 0, 0.92);
          c.lerp(new THREE.Color('#eef3f8'), t * (1 - slope * 1.4));
        }
      }
      // Aerial perspective: the far field lightens and takes the haze tint.
      const dist = Math.hypot(x, z);
      // Aerial perspective is exponential, not linear, and it saturates around
      // 0.6: distant ridges never become pure sky, they stay slightly darker.
      const a = (1 - Math.exp(-Math.pow(dist / hazeEnd, 1.6))) * 0.62;
      c.lerp(haze, Math.min(0.62, a));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Metric UVs. A planar grid warped by no UV at all would stretch the detail
    // map across the whole plane; one tile per 7 m keeps the aggregate readable.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, pos.getX(i) / (7 / cellDetail), pos.getZ(i) / (7 / cellDetail));
    }
    uv.needsUpdate = true;

    const detailMaps = groundDetailMaps(shape.grassHex);
    const rockMaps = terrainRockMaps();
    // Photographic pass: a real turf close-up replaces the noise albedo. It is
    // deliberately near-greyscale so the biome's vertex-coloured geology still
    // controls hue (Amazon green, Sahara ochre, Mars rust). Its Sobel normal
    // carries the actual blade/clump relief on the near plate; the distant
    // shell keeps the procedural rock normal because at 1–4 km fracture lines
    // matter more than individual blades.
    const photos = getPhotographicAssetLibrary();
    const isNearPlate = cellDetail >= 1;
    const photoMap = photos ? clonePhoto(photos.groundDetail, 1, 1) : detailMaps.albedo;
    const photoNormal = photos && isNearPlate ? clonePhoto(photos.groundNormal, 1, 1) : rockMaps.normalMap;
    const usePhotos = !!photos && photographicAssetsEnabled();
    const groundMap = usePhotos ? photoMap : detailMaps.albedo;
    const groundNormal = usePhotos ? photoNormal : rockMaps.normalMap;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: groundMap,
      normalMap: groundNormal,
      normalScale: new THREE.Vector2(usePhotos && isNearPlate ? 0.5 : 0.35, usePhotos && isNearPlate ? 0.5 : 0.35),
      roughnessMap: rockMaps.roughnessMap,
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.55,
    });
    mat.userData.photographic = usePhotos;
    if (photos) {
      tagPhotographicMaterial(
        mat,
        { map: photoMap, normalMap: photoNormal },
        { map: detailMaps.albedo, normalMap: rockMaps.normalMap }
      );
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return { mesh, heights };
  };

  // Inner plate: the drivable surround, carved for the road.
  const near = makePlane(1600, 360, true, 700, 2600, 1);
  group.add(near.mesh);

  // Outer shell: the horizon. No carve, coarse cells, heavy haze.
  const far = makePlane(6800, 240, false, 400, 4400, 0.5);
  far.mesh.position.y = -0.06;
  group.add(far.mesh);

  const sampleHeight = (x: number, z: number) => heightAt(x, z);

  return { group, heightAt: sampleHeight, distToRoad };
}
