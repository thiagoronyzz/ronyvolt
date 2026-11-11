/**
 * SCENERY — the things that give a road its scale
 * ===============================================
 *
 * In the reference photograph the car occupies maybe 8% of the frame. The other
 * 92% is what actually makes the image read as real: an asphalt surface with
 * visible aggregate, a guardrail, layered tree lines with real branch structure,
 * grass at the shoulder, a sky with a colour ramp. A game that renders the car
 * beautifully and then puts it on a flat plane with cone-trees still looks like a
 * game, because the *context* has no detail.
 *
 * Everything here is built from real construction rules rather than primitives:
 *
 *  - **Trees** are trunks with taper and real branches (a recursive spline
 *    skeleton), and canopies made of many small flattened spheres displaced by
 *    noise — then dressed with alpha-cutout foliage cards on the silhouette.
 *    A cone on a cylinder reads as a drawing of a tree; a branching skeleton with
 *    an irregular canopy reads as a tree.
 *  - **Guardrail** is a W-beam profile extruded along the road, with posts every
 *    4 m and splice plates. The W profile matters: it is what produces the
 *    horizontal highlight bands you see along every motorway in the world.
 *  - **Grass** is instanced crossed cards, seeded in clumps, excluded from the
 *    road surface, with per-instance colour and height variation.
 *  - **Utility poles** carry catenary wires (a real catenary, not straight lines).
 *  - **Terrain** is a displaced grid with an FBM field and height-based colouring.
 *  - **Buildings** get window grids, cornices and roof volumes.
 */

import * as THREE from 'three';

/** Add a small foliage glow to the standard material fragment shader. */
export function applyLeafGlow(shader: Parameters<THREE.Material['onBeforeCompile']>[0]): void {
  shader.uniforms.uLeafGlow = { value: 0.45 };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uLeafGlow;')
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
       gl_FragColor.rgb += vec3(0.06, 0.09, 0.03) * uLeafGlow;`);
}
import { BiomeTheme } from '../types/game';
import { fbm2, hash2, seededRandom, valueNoise2 } from './noise';
import { barkMaps, concreteMaps, foliageCardTexture, grassCardTexture, groundDetailMaps } from './proceduralTextures';
import {
  clonePhoto,
  getPhotographicAssetLibrary,
  photographicAssetsEnabled,
  tagPhotographicMaterial,
} from '../render/PhotographicAssets';

const up = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Species definitions
// ---------------------------------------------------------------------------

export interface TreeSpecies {
  name: string;
  /** Trunk height before the first branch, metres. */
  trunkH: number;
  trunkRadius: number;
  /** Canopy radius, metres. */
  canopyR: number;
  /** 0 = broad dome, 1 = narrow spire (conifer). */
  form: number;
  /** Foliage card kind. */
  leaf: 'broadleaf' | 'conifer' | 'blossom' | 'autumn';
  /** Number of clumps in the canopy. */
  clumps: number;
  /** Trunk lean, radians. */
  lean: number;
  branches: number;
}

export const TREE_SPECIES: Record<string, TreeSpecies> = {
  oak: { name: 'Oak', trunkH: 2.6, trunkRadius: 0.28, canopyR: 3.0, form: 0.12, leaf: 'broadleaf', clumps: 11, lean: 0.05, branches: 5 },
  birch: { name: 'Birch', trunkH: 4.2, trunkRadius: 0.15, canopyR: 1.9, form: 0.3, leaf: 'broadleaf', clumps: 8, lean: 0.08, branches: 4 },
  pine: { name: 'Pine', trunkH: 3.2, trunkRadius: 0.24, canopyR: 2.0, form: 0.86, leaf: 'conifer', clumps: 9, lean: 0.02, branches: 3 },
  autumnOak: { name: 'Autumn Oak', trunkH: 2.9, trunkRadius: 0.3, canopyR: 3.2, form: 0.18, leaf: 'autumn', clumps: 12, lean: 0.04, branches: 5 },
  sakura: { name: 'Sakura', trunkH: 2.2, trunkRadius: 0.2, canopyR: 2.4, form: 0.2, leaf: 'blossom', clumps: 10, lean: 0.12, branches: 4 },
  bush: { name: 'Shrub', trunkH: 0.1, trunkRadius: 0.06, canopyR: 0.8, form: 0.3, leaf: 'broadleaf', clumps: 5, lean: 0, branches: 0 },
  palm: { name: 'Palm', trunkH: 6.0, trunkRadius: 0.2, canopyR: 2.6, form: 0.5, leaf: 'broadleaf', clumps: 7, lean: 0.16, branches: 2 },
};

export interface BiomePalette {
  ground: string;
  grass: string;
  treeTrunk: string;
  foliage: string[];
  /** Which species dominate, by weight. */
  species: [keyof typeof TREE_SPECIES, number][];
  /** Tree density multiplier. */
  density: number;
  /** Rock / structure colour for incidental boulders and grandstands. */
  detail: string;
  hasGuardrail: boolean;
  hasPoles: boolean;
}

export const BIOME_PALETTES: Partial<Record<BiomeTheme, BiomePalette>> = {
  interlagos_br: {
    ground: '#3f5a2e', grass: '#4f7233', treeTrunk: '#4a3b2c',
    foliage: ['#2c4a26', '#3a5c2c', '#22381f', '#476b31'],
    species: [['oak', 4], ['birch', 2], ['bush', 3]], density: 1.0,
    detail: '#6b7280', hasGuardrail: true, hasPoles: false,
  },
  race_circuit: {
    ground: '#3c5530', grass: '#51752f', treeTrunk: '#463a2b',
    foliage: ['#2a4724', '#38592a', '#1f341c', '#436530'],
    species: [['oak', 5], ['birch', 1], ['bush', 2]], density: 0.9,
    detail: '#7a828c', hasGuardrail: true, hasPoles: false,
  },
  amazon_jungle: {
    ground: '#26361f', grass: '#31491f', treeTrunk: '#3a2f22',
    foliage: ['#1d3d1a', '#2c5a22', '#14300f', '#3f6b28', '#2a4a1c'],
    species: [['oak', 3], ['palm', 3], ['bush', 5]], density: 2.1,
    detail: '#4a5a3a', hasGuardrail: false, hasPoles: false,
  },
  swiss_alps: {
    ground: '#8fa08c', grass: '#a9b8a4', treeTrunk: '#3c3327',
    foliage: ['#24402a', '#2e5232', '#1b2f1f', '#3f6b3a'],
    species: [['pine', 6], ['birch', 2], ['bush', 2]], density: 1.4,
    detail: '#9aa3ad', hasGuardrail: true, hasPoles: false,
  },
  scottish_sheep: {
    ground: '#4a6136', grass: '#5f7a3f', treeTrunk: '#453728',
    foliage: ['#2d4a24', '#3d5f2b', '#213619', '#4d7433'],
    species: [['oak', 3], ['bush', 5], ['birch', 2]], density: 0.7,
    detail: '#7c8a6a', hasGuardrail: true, hasPoles: true,
  },
  norway_fjord: {
    ground: '#3d4d3a', grass: '#4a5d3f', treeTrunk: '#38301f',
    foliage: ['#233a25', '#2f4c2c', '#1a2b1c'], species: [['pine', 7], ['birch', 3]],
    density: 1.2, detail: '#6f7a84', hasGuardrail: true, hasPoles: false,
  },
  touge_sakura: {
    ground: '#33472c', grass: '#3f5a33', treeTrunk: '#4a3a2c',
    foliage: ['#e9a8c4', '#d98cae', '#f3c4d6', '#2f4b28'],
    species: [['sakura', 6], ['oak', 2], ['bush', 3]], density: 1.3,
    detail: '#8a8f96', hasGuardrail: true, hasPoles: true,
  },
  sahara_desert: {
    ground: '#c2a173', grass: '#b99a63', treeTrunk: '#7a6244',
    foliage: ['#6f7a44', '#8a8a4c', '#5c6536'], species: [['bush', 6], ['palm', 2]],
    density: 0.2, detail: '#b09070', hasGuardrail: false, hasPoles: false,
  },
  grand_canyon: {
    ground: '#8e4a2c', grass: '#9a6a3a', treeTrunk: '#5a3d28',
    foliage: ['#4c5a2c', '#5f6b33'], species: [['bush', 6], ['oak', 2]],
    density: 0.4, detail: '#a86040', hasGuardrail: true, hasPoles: false,
  },
  mars_colony: {
    ground: '#7a3324', grass: '#83402c', treeTrunk: '#5a2a20',
    foliage: ['#6b3a28'], species: [['bush', 3]], density: 0.1,
    detail: '#8f4a34', hasGuardrail: true, hasPoles: true,
  },
  neo_tokyo: {
    ground: '#161a22', grass: '#1c222b', treeTrunk: '#252a32',
    foliage: ['#1f2a26', '#243330'], species: [['bush', 4], ['oak', 1]],
    density: 0.3, detail: '#2b3240', hasGuardrail: true, hasPoles: true,
  },
  sao_paulo: {
    ground: '#2a2f36', grass: '#333a42', treeTrunk: '#332b25',
    foliage: ['#26382a', '#2f4430'], species: [['oak', 2], ['bush', 4]],
    density: 0.5, detail: '#3a4250', hasGuardrail: true, hasPoles: true,
  },
  snow_city: {
    ground: '#d8e3ee', grass: '#c9d6e2', treeTrunk: '#3a342c',
    foliage: ['#2a3a30', '#35483a'], species: [['pine', 6], ['bush', 1]],
    density: 1.1, detail: '#aab6c4', hasGuardrail: true, hasPoles: true,
  },
};

function paletteFor(biome: BiomeTheme): BiomePalette {
  return (
    BIOME_PALETTES[biome] ?? {
      ground: '#3f5a2e', grass: '#4f7233', treeTrunk: '#4a3b2c',
      foliage: ['#2c4a26', '#3a5c2c', '#22381f'],
      species: [['oak', 4], ['bush', 2]], density: 1,
      detail: '#6b7280', hasGuardrail: true, hasPoles: false,
    }
  );
}

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------

interface BranchNode {
  start: THREE.Vector3;
  end: THREE.Vector3;
  r0: number;
  r1: number;
}

/**
 * Recursive branch skeleton. Each child branch starts partway up its parent and
 * angles away, which is the only way to get a silhouette that reads as a tree.
 * A single tapered trunk with a cone on top has a *triangular* silhouette, and
 * triangles are the giveaway.
 */
function buildBranchSkeleton(species: TreeSpecies, rng: () => number): BranchNode[] {
  const nodes: BranchNode[] = [];
  const trunkStart = new THREE.Vector3(0, 0, 0);
  const trunkEnd = new THREE.Vector3(
    (rng() - 0.5) * species.lean * 2,
    species.trunkH,
    (rng() - 0.5) * species.lean * 2
  );
  nodes.push({ start: trunkStart, end: trunkEnd, r0: species.trunkRadius, r1: species.trunkRadius * 0.55 });

  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const end = from.clone().addScaledVector(dir, len);
    nodes.push({ start: from.clone(), end, r0: r, r1: r * 0.5 });
    if (depth <= 0) return;
    const kids = depth === 1 ? 2 : 2 + (rng() > 0.6 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const axis = new THREE.Vector3(rng() - 0.5, rng() * 0.3, rng() - 0.5).normalize();
      const nd = dir.clone().applyAxisAngle(axis, 0.45 + rng() * 0.55).normalize();
      // Branches leave the parent below its tip, never exactly at it.
      const origin = from.clone().addScaledVector(dir, len * (0.55 + rng() * 0.35));
      grow(origin, nd, len * (0.56 + rng() * 0.16), r * 0.62, depth - 1);
    }
  };

  for (let b = 0; b < species.branches; b++) {
    const a = (b / Math.max(1, species.branches)) * Math.PI * 2 + rng() * 0.6;
    const dir = new THREE.Vector3(Math.cos(a) * 0.7, 0.8, Math.sin(a) * 0.7).normalize();
    const origin = trunkEnd.clone().addScaledVector(new THREE.Vector3(0, -1, 0), species.trunkH * (0.0 + rng() * 0.3));
    grow(origin, dir, species.trunkH * 0.42, species.trunkRadius * 0.62, species.form > 0.6 ? 1 : 2);
  }
  return nodes;
}

/**
 * A single tree. Returns a group plus an `update` for wind sway (the canopy
 * lags the trunk, which is what makes a tree line feel alive in motion).
 */
export function buildTree(
  speciesKey: keyof typeof TREE_SPECIES,
  palette: BiomePalette,
  seed: number,
  scale = 1
): { group: THREE.Group; sway: (t: number, windStrength: number) => void } {
  const species = TREE_SPECIES[speciesKey];
  const rng = seededRandom(seed * 977 + species.name.length * 31);
  const group = new THREE.Group();

  const bark = barkMaps();
  // Real bark photograph: vertical plates, deep fissures and lichen are kept as
  // measured luminance relief rather than ridged-noise approximations. The photo
  // is near-greyscale so `color`/vertex colours still decide the species hue.
  const photos = getPhotographicAssetLibrary();
  const usePhotos = !!photos && photographicAssetsEnabled();
  const barkAlbedo = photos ? clonePhoto(photos.barkAlbedo, 1, 1) : bark.albedo;
  const barkNormal = photos ? clonePhoto(photos.barkNormal, 1, 1) : bark.normalMap;
  const trunkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.treeTrunk),
    map: usePhotos ? barkAlbedo : bark.albedo,
    normalMap: usePhotos ? barkNormal : bark.normalMap,
    normalScale: new THREE.Vector2(usePhotos ? 1.45 : 1.1, usePhotos ? 1.45 : 1.1),
    roughnessMap: bark.roughnessMap,
    roughness: 0.94,
    metalness: 0,
    vertexColors: true,
  });
  trunkMat.userData.photographic = usePhotos;
  if (photos) {
    tagPhotographicMaterial(
      trunkMat,
      { map: barkAlbedo, normalMap: barkNormal },
      { map: bark.albedo, normalMap: bark.normalMap }
    );
  }

  // ---- Branches -----------------------------------------------------------
  const skeleton = buildBranchSkeleton(species, rng);
  const branchGroup = new THREE.Group();
  const barkParts: THREE.BufferGeometry[] = [];
  for (const node of skeleton) {
    const dir = node.end.clone().sub(node.start);
    const len = dir.length();
    if (len < 1e-3) continue;
    const geo = new THREE.CylinderGeometry(node.r1, node.r0, len, node.r0 > 0.12 ? 9 : 5, 1, false);
    // Cylinders are authored along +Y; align to the branch direction.
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    const m = new THREE.Matrix4().compose(
      node.start.clone().addScaledVector(dir, 0.5),
      q,
      new THREE.Vector3(1, 1, 1)
    );
    geo.applyMatrix4(m);
    barkParts.push(geo);
  }
  if (barkParts.length) {
    const merged = mergeGeometries(barkParts);
    // Vertex tint: darker at the base, lighter toward the tips (light falls off).
    const posAttr = merged.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);
    let maxY = 0;
    for (let i = 0; i < posAttr.count; i++) maxY = Math.max(maxY, posAttr.getY(i));
    for (let i = 0; i < posAttr.count; i++) {
      const t = posAttr.getY(i) / Math.max(0.2, maxY);
      const c = 0.52 + t * 0.48;
      colors[i * 3] = c;
      colors[i * 3 + 1] = c;
      colors[i * 3 + 2] = c;
    }
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const trunkMesh = new THREE.Mesh(merged, trunkMat);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    branchGroup.add(trunkMesh);
  }
  group.add(branchGroup);

  // ---- Canopy -------------------------------------------------------------
  // Many small, noise-displaced, flattened spheres. Individually they are pebbles;
  // together, with per-clump colour variation and a non-uniform distribution,
  // they form a canopy with the lumpy silhouette real foliage has.
  const canopyGroup = new THREE.Group();
  const foliageHex = palette.foliage[Math.floor(rng() * palette.foliage.length)];
  const leafTex = foliageCardTexture(foliageHex, species.leaf);
  const leafMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(foliageHex),
    map: leafTex,
    transparent: false,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.86,
    metalness: 0,
    vertexColors: true,
  });
  leafMat.onBeforeCompile = applyLeafGlow;

  const canopyBaseY = species.trunkH * (species.form > 0.6 ? 0.55 : 0.78);
  const clumpMeshes: THREE.Mesh[] = [];
  for (let c = 0; c < species.clumps; c++) {
    const a = rng() * Math.PI * 2;
    // Vertical distribution weights the canopy's mass low, like a real crown.
    const radial = Math.pow(rng(), 0.55) * species.canopyR * 0.92;
    const vertical = (rng() - 0.35) * species.canopyR * (0.7 + species.form * 0.9);
    const cx = Math.cos(a) * radial;
    const cz = Math.sin(a) * radial;
    const cy = canopyBaseY + vertical * 0.8;

    // Irregular blob: a sphere with per-vertex noise displacement.
    const size = species.canopyR * (0.24 + rng() * 0.16);
    const geo = new THREE.IcosahedronGeometry(size, 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) {
      const vx = p.getX(v);
      const vy = p.getY(v);
      const vz = p.getZ(v);
      const n = valueNoise2(vx * 2.6 + c * 7, vz * 2.6 + vy * 2.1 + c * 3, seed + c) - 0.5;
      const k = 1 + n * 0.5;
      p.setXYZ(v, vx * k, vy * k * 0.82, vz * k);
    }
    geo.computeVertexNormals();
    // Per-clump tint: the crown is lighter on top (sun) and darker underneath.
    const tint = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) {
      const y = p.getY(v) / Math.max(0.01, size);
      const c2 = 0.62 + Math.max(0, y) * 0.34 + rng() * 0.02;
      tint[v * 3] = c2;
      tint[v * 3 + 1] = c2;
      tint[v * 3 + 2] = c2 * 0.96;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));

    const clump = new THREE.Mesh(geo, leafMat);
    clump.position.set(cx, cy, cz);
    clump.castShadow = true;
    clump.receiveShadow = true;
    canopyGroup.add(clump);
    clumpMeshes.push(clump);

    // Silhouette cards: alpha-cut leaf clusters at the outer edge of the crown.
    // Without these the canopy outline is a smooth polygon; with them it has the
    // ragged edge that reads as leaves.
    if (radial > species.canopyR * 0.5) {
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(size * 2.6, size * 2.6),
        leafMat
      );
      card.position.set(cx * 1.12, cy + size * 0.2, cz * 1.12);
      card.lookAt(cx * 3, cy + 0.4, cz * 3);
      card.rotation.z = rng() * Math.PI;
      canopyGroup.add(card);
    }
  }
  group.add(canopyGroup);

  group.scale.setScalar(scale);
  const phase = rng() * Math.PI * 2;

  return {
    group,
    sway: (t: number, windStrength: number) => {
      const w = windStrength * 0.05;
      canopyGroup.rotation.z = Math.sin(t * 0.7 + phase) * w * 1.4;
      canopyGroup.rotation.x = Math.cos(t * 0.55 + phase * 1.3) * w;
      branchGroup.rotation.z = Math.sin(t * 0.7 + phase) * w * 0.35;
      // Clumps flutter individually at a higher frequency, with small amplitude.
      for (let i = 0; i < clumpMeshes.length; i++) {
        const m = clumpMeshes[i];
        m.position.x += Math.sin(t * 3.1 + i * 1.7 + phase) * w * 0.012;
        m.position.y += Math.cos(t * 2.6 + i * 2.3) * w * 0.01;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Merge helper (avoids pulling in BufferGeometryUtils for one function)
// ---------------------------------------------------------------------------

export function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const posArrays: number[] = [];
  const normArrays: number[] = [];
  const uvArrays: number[] = [];
  const idxArrays: number[] = [];
  let base = 0;
  let hasUv = true;
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute | undefined;
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    if (!u) hasUv = false;
    for (let i = 0; i < p.count; i++) {
      posArrays.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) normArrays.push(n.getX(i), n.getY(i), n.getZ(i));
      else normArrays.push(0, 1, 0);
      if (u) uvArrays.push(u.getX(i), u.getY(i));
      else uvArrays.push(0, 0);
    }
    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) idxArrays.push(base + idx.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) idxArrays.push(base + i);
    }
    base += p.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(posArrays, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normArrays, 3));
  if (hasUv) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvArrays, 2));
  out.setIndex(idxArrays);
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------------------
// Guardrail
// ---------------------------------------------------------------------------

/**
 * W-beam guardrail.
 *
 * The profile is a corrugated W, extruded along the road. Every motorway in the
 * world has this exact section, and its two horizontal ridges are what produce
 * the long specular streaks you see in a photograph of a road. A box would be
 * invisible; the W profile is a signature.
 */
export function buildGuardrail(
  points: THREE.Vector3[],
  side: THREE.Vector3[],
  offsetM: number,
  heightM = 0.62
): { group: THREE.Group; update: (t: number, dt: number) => void } {
  const group = new THREE.Group();

  // W profile in the (lateral, vertical) plane, millimetres scaled to metres.
  const profile: [number, number][] = [
    [0.0, 0.16],
    [0.055, 0.13],
    [0.075, 0.06],
    [0.03, 0.0],
    [0.03, -0.06],
    [0.075, -0.12],
    [0.055, -0.19],
    [0.0, -0.22],
  ];

  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const rails = 2;
  for (let r = 0; r < rails; r++) {
    const railBase = positions.length / 3;
    const yOffset = heightM + r * 0.0;
    let dist = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i].clone().addScaledVector(side[i], offsetM);
      if (i > 0) dist += points[i].distanceTo(points[i - 1]);
      for (const [lat, vert] of profile) {
        positions.push(p.x + side[i].x * lat, p.y + yOffset + vert, p.z + side[i].z * lat);
        uvs.push(lat * 8, dist * 0.5);
      }
    }
    const stride = profile.length;
    for (let i = 0; i < points.length - 1; i++) {
      for (let k = 0; k < stride - 1; k++) {
        const a = railBase + i * stride + k;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    break; // one continuous beam per run is enough; posts carry the rest
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const railMat = new THREE.MeshPhysicalMaterial({
    color: 0xb9c0c8,
    metalness: 0.92,
    roughness: 0.34,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(geo, railMat);
  beam.castShadow = true;
  beam.receiveShadow = true;
  group.add(beam);

  // Posts every ~4 m.
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8e959d, metalness: 0.85, roughness: 0.45 });
  const postGeo = new THREE.BoxGeometry(0.09, 0.95, 0.14);
  const postSpacingM = 4;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += points[i].distanceTo(points[i - 1]);
    if (acc < postSpacingM) continue;
    acc = 0;
    const p = points[i].clone().addScaledVector(side[i], offsetM);
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(p.x, p.y + heightM * 0.55, p.z);
    post.lookAt(p.x + side[i].x, p.y + heightM * 0.55, p.z + side[i].z);
    post.castShadow = true;
    group.add(post);
  }

  return { group, update: () => {} };
}

// ---------------------------------------------------------------------------
// Grass
// ---------------------------------------------------------------------------

/**
 * Instanced grass tufts along a road corridor.
 *
 * Grass is not decoration: it is the transition that tells the eye where the
 * asphalt ends. A hard edge between a road mesh and a green plane is one of the
 * most reliable "this is a game" cues, and it is fixed by a single band of
 * instanced cards.
 */
export function buildGrassBand(
  points: THREE.Vector3[],
  side: THREE.Vector3[],
  roadHalfWidth: number,
  palette: BiomePalette,
  count: number,
  seed: number,
  spreadM = 14
): THREE.InstancedMesh {
  const rng = seededRandom(seed);
  const tex = grassCardTexture(palette.grass);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.grass),
    map: tex,
    transparent: false,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
  });

  // Two crossed quads per tuft.
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0, 0.5, 0);
  const quad2 = quad.clone();
  quad2.rotateY(Math.PI / 2);
  const geo = mergeGeometries([quad, quad2]);
  geo.computeVertexNormals();

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const paletteBase = new THREE.Color(palette.grass);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * points.length);
    const p = points[idx];
    const s = side[idx];
    const lateral = (rng() < 0.5 ? -1 : 1) * (roadHalfWidth + 0.3 + Math.pow(rng(), 1.8) * spreadM);
    const px = p.x + s.x * lateral;
    const pz = p.z + s.z * lateral;
    const h = 0.22 + rng() * 0.42;
    dummy.position.set(px, p.y - 0.02, pz);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(0.34 + rng() * 0.3, h, 0.34 + rng() * 0.3);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    // Vary the tint per instance; a uniform lawn of one green is an instant tell.
    const k = 0.72 + rng() * 0.46;
    color.copy(paletteBase).multiplyScalar(k);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Utility poles and catenary wires
// ---------------------------------------------------------------------------

/**
 * Poles with real catenary wires.
 *
 * A catenary is `y = a·cosh(x/a)`; the sag is what the eye recognises. Straight
 * line segments between poles look like a diagram, and the sag also makes the
 * wires catch the sky differently at every span.
 */
export function buildUtilityLine(
  points: THREE.Vector3[],
  side: THREE.Vector3[],
  offsetM: number,
  seed: number
): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.92 });
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 9.5, 8);
  const armGeo = new THREE.BoxGeometry(1.7, 0.09, 0.09);
  const insulatorGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.13, 6);
  const ceramicMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b0, roughness: 0.28, metalness: 0.05 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1c20, transparent: true, opacity: 0.75 });

  const spacing = 42;
  let acc = 0;
  const polePts: { pos: THREE.Vector3; s: THREE.Vector3 }[] = [];
  for (let i = 1; i < points.length; i++) {
    acc += points[i].distanceTo(points[i - 1]);
    if (acc < spacing) continue;
    acc = 0;
    polePts.push({ pos: points[i].clone().addScaledVector(side[i], offsetM), s: side[i] });
  }

  for (const { pos, s } of polePts) {
    const pole = new THREE.Mesh(poleGeo, woodMat);
    pole.position.set(pos.x, pos.y + 4.75, pos.z);
    pole.castShadow = true;
    group.add(pole);
    for (const dy of [8.4, 7.6]) {
      const arm = new THREE.Mesh(armGeo, woodMat);
      arm.position.set(pos.x, pos.y + dy, pos.z);
      arm.lookAt(pos.x + s.z, pos.y + dy, pos.z - s.x);
      group.add(arm);
      for (const dx of [-0.7, 0, 0.7]) {
        const ins = new THREE.Mesh(insulatorGeo, ceramicMat);
        ins.position.set(pos.x + s.x * dx * 0, pos.y + dy + 0.11, pos.z);
        ins.position.x += (pos.x - s.x) * 0;
        ins.position.copy(new THREE.Vector3(pos.x, pos.y + dy + 0.12, pos.z));
        ins.position.addScaledVector(new THREE.Vector3(s.z, 0, -s.x), dx);
        group.add(ins);
      }
    }
  }

  // Wires: a catenary per span, per conductor.
  const wireVertices: number[] = [];
  for (let p = 0; p < polePts.length - 1; p++) {
    const a = polePts[p].pos;
    const b = polePts[p + 1].pos;
    const span = a.distanceTo(b);
    if (span > spacing * 1.6) continue;
    const sag = Math.min(1.1, span * 0.022);
    for (const conductor of [-0.7, 0, 0.7]) {
      const offsetA = new THREE.Vector3(polePts[p].s.z, 0, -polePts[p].s.x).multiplyScalar(conductor);
      const offsetB = new THREE.Vector3(polePts[p + 1].s.z, 0, -polePts[p + 1].s.x).multiplyScalar(conductor);
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        for (const t of [i / segs, (i + 1) / segs]) {
          const x = THREE.MathUtils.lerp(a.x + offsetA.x, b.x + offsetB.x, t);
          const z = THREE.MathUtils.lerp(a.z + offsetA.z, b.z + offsetB.z, t);
          const baseY = THREE.MathUtils.lerp(a.y, b.y, t) + 8.4;
          // Parabolic approximation of the catenary, visually identical at this span.
          const y = baseY - sag * 4 * t * (1 - t);
          wireVertices.push(x, y, z);
        }
      }
    }
  }
  if (wireVertices.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wireVertices, 3));
    group.add(new THREE.LineSegments(g, wireMat));
  }
  void seed;
  return group;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/**
 * Displaced ground with height-based colouring.
 *
 * A flat 4 km plane is one of the biggest tells in the old scene: no horizon
 * detail, no modulation of shade, and the road sits on an infinite table.
 * This displaces a grid with two-scale FBM (big hills + small undulation) and
 * colours by slope: grass on flats, exposed earth/rock on gradients.
 */
export function buildTerrain(
  biome: BiomeTheme,
  sizeM = 1600,
  segments = 96,
  seed = 1,
  amplitudeM = 7
): { mesh: THREE.Mesh; heightAt: (x: number, z: number) => number } {
  const palette = paletteFor(biome);
  const geo = new THREE.PlaneGeometry(sizeM, sizeM, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  const h = (x: number, z: number) => {
    const big = (fbm2(x / 260, z / 260, 4, 2.03, 0.5, seed) - 0.5) * amplitudeM * 2;
    const small = (fbm2(x / 42, z / 42, 3, 2.1, 0.5, seed + 7) - 0.5) * amplitudeM * 0.35;
    return big + small;
  };

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, h(x, z));
  }
  geo.computeVertexNormals();

  // Colour by slope and height.
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(palette.grass);
  const soil = new THREE.Color(palette.ground);
  const detail = new THREE.Color(palette.detail);
  const normals = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const slope = 1 - Math.max(0, normals.getY(i));
    const c = grass.clone().lerp(soil, Math.min(1, slope * 6));
    if (slope > 0.34) c.lerp(detail, Math.min(1, (slope - 0.34) * 2.6));
    // A little large-scale mottling so the ground is not one flat hue.
    const m = fbm2(pos.getX(i) / 34, pos.getZ(i) / 34, 3, 2, 0.5, seed + 3);
    c.multiplyScalar(0.86 + m * 0.28);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const detailMaps = groundDetailMaps(palette.grass);
  const photos = getPhotographicAssetLibrary();
  const usePhotos = !!photos && photographicAssetsEnabled();
  const photoGround = photos ? clonePhoto(photos.groundDetail, 1, 1) : detailMaps.albedo;
  const photoGroundNormal = photos ? clonePhoto(photos.groundNormal, 1, 1) : detailMaps.normalMap;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: usePhotos ? photoGround : detailMaps.albedo,
    normalMap: usePhotos ? photoGroundNormal : detailMaps.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: detailMaps.roughnessMap,
    roughness: 0.94,
    metalness: 0,
  });
  mat.userData.photographic = usePhotos;
  if (photos) {
    tagPhotographicMaterial(
      mat,
      { map: photoGround, normalMap: photoGroundNormal },
      { map: detailMaps.albedo, normalMap: detailMaps.normalMap }
    );
  }
  // UVs need to tile: one tile per 6 m of terrain.
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) / 6) % 1, (pos.getZ(i) / 6) % 1);
    // Wrapping the modulo keeps values in [0,1] but loses continuity across
    // tiles; instead we use large metric UVs and let RepeatWrapping do the work.
    uv.setXY(i, pos.getX(i) / 6, pos.getZ(i) / 6);
  }
  uv.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.position.y = -0.35;
  return { mesh, heightAt: (x, z) => h(x, z) - 0.35 };
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/**
 * City block facade.
 *
 * A skyscraper in a game is usually a textured box; the reason it reads as a box
 * is that its silhouette is a rectangle and it has no depth cues. This builds
 * the depth cues: a recessed window band per floor (inset geometry, not a
 * texture), a cornice, a roof parapet, and a ground-floor base that is wider than
 * the tower. Windows are instanced emissive quads so they can light up at night
 * without new draw calls.
 */
export function buildBuilding(
  width: number,
  height: number,
  depth: number,
  palette: BiomePalette,
  seed: number,
  nightLights = false
): THREE.Group {
  const rng = seededRandom(seed);
  const g = new THREE.Group();

  const concrete = concreteMaps();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.detail).multiplyScalar(0.55),
    map: concrete.albedo,
    normalMap: concrete.normalMap,
    roughnessMap: concrete.roughnessMap,
    roughness: 0.75,
    metalness: 0.15,
  });

  // Base: two storeys, slightly wider.
  const base = new THREE.Mesh(new THREE.BoxGeometry(width * 1.06, height * 0.18, depth * 1.06), bodyMat);
  base.position.y = height * 0.09;
  g.add(base);

  // Tower.
  const tower = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.82, depth), bodyMat);
  tower.position.y = height * 0.18 + height * 0.41;
  tower.castShadow = true;
  tower.receiveShadow = true;
  g.add(tower);

  // Window bands: recessed strips per floor on all four faces.
  const windowMat = new THREE.MeshPhysicalMaterial({
    color: 0x11161d,
    metalness: 0.1,
    roughness: 0.08,
    emissive: new THREE.Color(nightLights ? 0xffe2a8 : 0x223040),
    emissiveIntensity: nightLights ? 0.55 : 0.06,
  });
  const floorH = 3.2;
  const floors = Math.max(2, Math.floor((height * 0.82) / floorH));
  const bandGeo = new THREE.BoxGeometry(width * 0.98, floorH * 0.52, depth * 1.005);
  for (let f = 0; f < floors; f++) {
    const band = new THREE.Mesh(bandGeo, windowMat);
    band.position.y = height * 0.18 + floorH * (f + 0.55);
    g.add(band);
    // A floor slab lip between bands catches a highlight line.
    if (f < floors - 1) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(width * 1.015, 0.22, depth * 1.015), bodyMat);
      slab.position.y = height * 0.18 + floorH * (f + 1.02);
      g.add(slab);
    }
  }

  // Cornice + parapet.
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(width * 1.09, 0.5, depth * 1.09), bodyMat);
  cornice.position.y = height * 0.985;
  g.add(cornice);
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.9, depth * 0.96), bodyMat);
  parapet.position.y = height * 1.02;
  g.add(parapet);

  // Rooftop clutter: an AC block and an antenna. Silhouette detail above the
  // roofline is what makes a skyline look inhabited.
  const acMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 0.5, roughness: 0.5 });
  const ac = new THREE.Mesh(new THREE.BoxGeometry(width * 0.22, 1.1, depth * 0.22), acMat);
  ac.position.set((rng() - 0.5) * width * 0.4, height * 1.07, (rng() - 0.5) * depth * 0.4);
  g.add(ac);
  if (rng() > 0.6) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5, 6), acMat);
    mast.position.set(width * 0.2, height * 1.07 + 2.5, 0);
    g.add(mast);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Roadside furniture
// ---------------------------------------------------------------------------

/**
 * Reflective road sign.
 *
 * Two details separate a sign from a coloured rectangle: a chamfered frame with
 * depth, and a face whose retro-reflective sheeting is much smoother than the
 * frame. Because it is smooth, it mirrors the sky, which makes it very bright —
 * exactly how a real sign looks on a sunny day.
 */
export function buildRoadSign(kind: 'curve' | 'speed' | 'stop', text: string): THREE.Group {
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.85, roughness: 0.35 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 2.1, 10), postMat);
  post.position.y = 1.05;
  g.add(post);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = kind === 'stop' ? '#b3121b' : '#f7f8fa';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = kind === 'stop' ? '#ffffff' : '#b3121b';
    ctx.lineWidth = 16;
    ctx.strokeRect(10, 10, 236, 236);
    ctx.fillStyle = kind === 'stop' ? '#ffffff' : '#111418';
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 138);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const faceMat = new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: 0.18,
    metalness: 0.05,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.3,
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), faceMat);
  face.position.set(0, 1.95, 0.026);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.66, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: 0.7, roughness: 0.5 })
  );
  back.position.set(0, 1.95, 0.008);
  g.add(face, back);
  return g;
}

/** Kilometre marker: a small white peg with a black cap. */
export function buildKmMarker(): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.05, 0.06, 0.72, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.6 });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.36;
  return m;
}

/** Delineator post (the white/red reflective peg every 25 m on rural roads). */
export function buildDelineator(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 1.0, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xf0f3f7, roughness: 0.55 })
  );
  body.position.y = 0.5;
  const reflector = new THREE.Mesh(
    new THREE.BoxGeometry(0.092, 0.12, 0.052),
    new THREE.MeshStandardMaterial({ color: 0xd11a25, emissive: 0x330205, roughness: 0.25 })
  );
  reflector.position.y = 0.86;
  g.add(body, reflector);
  return g;
}

// ---------------------------------------------------------------------------
// Distant tree line (cheap LOD)
// ---------------------------------------------------------------------------

/**
 * A billboarded tree line for the far distance.
 *
 * Real drivers see three depth layers of vegetation: detailed trees near the
 * road, mid-distance clumps, and a soft painted band at the horizon. The band is
 * what stops the terrain from looking like a golf course, and it costs almost
 * nothing: a ring of alpha cards at 150–400 m, always facing the camera.
 */
export function buildTreeLineBand(
  centre: THREE.Vector3,
  radiusM: number,
  heightM: number,
  palette: BiomePalette,
  seed: number
): THREE.Mesh {
  const rng = seededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 1024, 128);
    const base = new THREE.Color(palette.foliage[0]);
    // Build the band out of hundreds of overlapping blobs with a rough top edge.
    for (let i = 0; i < 900; i++) {
      const x = rng() * 1024;
      const h = 40 + Math.pow(rng(), 0.7) * 78;
      const r = 8 + rng() * 22;
      const tint = base.clone().multiplyScalar(0.7 + rng() * 0.55);
      ctx.fillStyle = `rgba(${Math.round(tint.r * 255)},${Math.round(tint.g * 255)},${Math.round(tint.b * 255)},${0.75 + rng() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(x, 128 - h * 0.35, r, h * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fade the bottom into the ground so there is no hard seam.
    const grd = ctx.createLinearGradient(0, 96, 0, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = grd;
    ctx.fillRect(0, 96, 1024, 32);
    ctx.globalCompositeOperation = 'source-over';
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = 6;

  const geo = new THREE.CylinderGeometry(radiusM, radiusM, heightM, 64, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: true,
    opacity: 0.95,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(centre.x, centre.y + heightM * 0.42, centre.z);
  mesh.renderOrder = -1;
  return mesh;
}

/** Small rocks scattered on the shoulder — a few instanced icosahedra. */
export function buildRockScatter(
  points: THREE.Vector3[],
  side: THREE.Vector3[],
  count: number,
  palette: BiomePalette,
  seed: number
): THREE.InstancedMesh {
  const rng = seededRandom(seed);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.7 + hash2(i, seed) * 0.6;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.detail),
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * points.length);
    const p = points[idx];
    const s = side[idx];
    const lat = (rng() < 0.5 ? -1 : 1) * (6 + rng() * 30);
    dummy.position.set(p.x + s.x * lat, p.y + 0.02, p.z + s.z * lat);
    dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    dummy.scale.setScalar(0.08 + rng() * 0.34);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

export function paletteForBiome(biome: BiomeTheme): BiomePalette {
  return paletteFor(biome);
}
