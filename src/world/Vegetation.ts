/**
 * VEGETATION — instanced, layered, biome-correct tree cover
 * ========================================================
 *
 * DIAGNOSIS
 * ---------
 * The build had excellent *tree geometry* (a branching trunk with a
 * noise-displaced canopy, see `Scenery.buildTree`) and almost no trees: one
 * every six spline samples, `roadWidth/2 + 8` to `roadWidth/2 + 32` metres from
 * the centreline, so roughly one tree per 40 m of road on one side only. The
 * result was the worst of both worlds — the poly budget of a real tree, and the
 * coverage of a lawn ornament. Photographs of any real road have trees *at* the
 * verge in places, a mid-ground thicket, and a treeline on every ridge.
 *
 * WHAT THIS FILE DOES
 * -------------------
 * A single `InstancedMesh` per species, per LOD ring, drawn from a Poisson-ish
 * scatter that is rejected against the road:
 *
 *   - **LOD0 (≤ 110 m)**: full branching skeleton, 3 species, casts shadows.
 *   - **LOD1 (110–420 m)**: a merged, faceted canopy with a trunk, no branches.
 *   - **LOD2 (420 m +)**: a three-card impostor, which at that range is
 *     indistinguishable from the full tree and costs 6 triangles.
 *
 * Density is biome-driven, so the Amazon is a wall of green, the Sahara has
 * sparse thorn scrub, and the Alps has a conifer line with a treeless snow line
 * above it. Every instance is tinted per-instance, because a forest of one
 * green is a tell in exactly the same way a lawn is.
 */

import * as THREE from 'three';
import { BiomePalette } from './Scenery';
import { foliageCardTexture, barkMaps } from './proceduralTextures';
import { seededRandom, fbm2 } from './noise';

export interface TreeScatterOptions {
  /** Total instances across all rings. */
  count: number;
  /** Keep instances at least this far from the road centreline. */
  minRoadDist: number;
  /** …and no further than this. */
  maxRoadDist: number;
  /** Everything beyond `radiusM` from the origin is skipped (fog eats it). */
  radiusM: number;
  /** Species weights, e.g. [['pine', 4], ['birch', 1]]. */
  species: [string, number][];
  /** 0..1 — how bushy vs. how tall. */
  density?: number;
  seed: number;
}

interface SpeciesRecipe {
  trunkH: number;
  trunkR: number;
  canopyR: number;
  canopyH: number;
  /** 0 broad dome → 1 narrow spire. */
  form: number;
  leaf: 'broadleaf' | 'conifer' | 'blossom' | 'autumn';
  clumps: number;
}

const RECIPES: Record<string, SpeciesRecipe> = {
  oak: { trunkH: 2.8, trunkR: 0.3, canopyR: 3.1, canopyH: 4.6, form: 0.14, leaf: 'broadleaf', clumps: 7 },
  birch: { trunkH: 4.6, trunkR: 0.16, canopyR: 1.9, canopyH: 4.2, form: 0.3, leaf: 'broadleaf', clumps: 7 },
  pine: { trunkH: 3.4, trunkR: 0.24, canopyR: 1.9, canopyH: 7.2, form: 0.88, leaf: 'conifer', clumps: 8 },
  autumnOak: { trunkH: 3.0, trunkR: 0.3, canopyR: 3.2, canopyH: 4.8, form: 0.18, leaf: 'autumn', clumps: 9 },
  sakura: { trunkH: 2.2, trunkR: 0.2, canopyR: 2.4, canopyH: 3.4, form: 0.2, leaf: 'blossom', clumps: 8 },
  bush: { trunkH: 0.15, trunkR: 0.07, canopyR: 0.9, canopyH: 1.1, form: 0.28, leaf: 'broadleaf', clumps: 5 },
  palm: { trunkH: 6.4, trunkR: 0.2, canopyR: 2.8, canopyH: 2.2, form: 0.5, leaf: 'broadleaf', clumps: 7 },
};

/** LOD0: trunk + a few real branches + a lumpy canopy of ellipsoids. */
function buildTreeLOD0(recipe: SpeciesRecipe, foliageHex: string, seed: number): THREE.Group {
  const rng = seededRandom(seed);
  const g = new THREE.Group();
  const barkM = barkMaps();
  const bark = new THREE.MeshStandardMaterial({
    color: 0x4b3f31,
    roughness: 0.94,
    metalness: 0,
    map: barkM.albedo,
    normalMap: barkM.normalMap,
    roughnessMap: barkM.roughnessMap,
  });

  // Trunk: a tapered, slightly bent 8-sided tube.
  const trunkGeo = new THREE.CylinderGeometry(recipe.trunkR * 0.55, recipe.trunkR, recipe.trunkH, 8, 3);
  const tp = trunkGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const t = Math.max(0, (y + recipe.trunkH / 2) / recipe.trunkH);
    tp.setX(i, tp.getX(i) + Math.sin(t * 2.4 + seed) * 0.06 * t);
    tp.setZ(i, tp.getZ(i) + Math.cos(t * 1.8 + seed) * 0.05 * t);
  }
  trunkGeo.translate(0, recipe.trunkH / 2, 0);
  trunkGeo.computeVertexNormals();
  const trunk = new THREE.Mesh(trunkGeo, bark);
  trunk.castShadow = true;
  g.add(trunk);

  // Branches: real splines, two per tree on the big species.
  const branchCount = recipe.trunkH > 2 ? 3 : 1;
  for (let b = 0; b < branchCount; b++) {
    const a = (b / branchCount) * Math.PI * 2 + rng();
    const y0 = recipe.trunkH * (0.55 + rng() * 0.3);
    const len = recipe.canopyR * (0.55 + rng() * 0.35);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, y0, 0),
      new THREE.Vector3(Math.cos(a) * len * 0.45, y0 + len * 0.42, Math.sin(a) * len * 0.45),
      new THREE.Vector3(Math.cos(a) * len, y0 + len * 0.55, Math.sin(a) * len),
    ]);
    const br = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 4, recipe.trunkR * 0.34, 5, false),
      bark
    );
    br.castShadow = true;
    g.add(br);
  }

  // Canopy: overlapping flattened ellipsoids, tinted per-clump. A single sphere
  // reads as a lollipop; the union of 5–11 gives the broken silhouette that the
  // eye reads as leaves.
  const leafMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(foliageHex),
    roughness: 0.88,
    metalness: 0,
    flatShading: false,
  });
  const cy = recipe.trunkH + recipe.canopyH * 0.42;
  const clumpGeo = new THREE.IcosahedronGeometry(1, 2);
  const mergeable: THREE.BufferGeometry[] = [];
  for (let c = 0; c < recipe.clumps; c++) {
    const a = rng() * Math.PI * 2;
    const rad = Math.pow(rng(), 0.6) * recipe.canopyR * 0.62;
    const yy = cy + (rng() - 0.4) * recipe.canopyH * 0.45;
    const s = recipe.canopyR * (0.34 + rng() * 0.3);
    const geo = clumpGeo.clone();
    geo.scale(s, s * (0.62 + recipe.form * 0.7), s);
    geo.translate(Math.cos(a) * rad, yy - cy, Math.sin(a) * rad);
    mergeable.push(geo);
  }
  const merged = mergeBufferGeometry(mergeable);
  const canopy = new THREE.Mesh(merged, leafMat);
  canopy.position.y = cy;
  canopy.castShadow = true;
  g.add(canopy);

  return g;
}

/** LOD1: trunk cylinder + one 16-face canopy shell. ~120 triangles. */
function buildTreeLOD1(recipe: SpeciesRecipe, foliageHex: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(recipe.trunkR * 0.6, recipe.trunkR, recipe.trunkH, 5, 1);
  trunk.translate(0, recipe.trunkH / 2, 0);
  parts.push(colourise(trunk, '#4b3f31'));

  const canopy = new THREE.IcosahedronGeometry(recipe.canopyR, 1);
  const cp = canopy.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) {
    const y = cp.getY(i);
    cp.setY(i, y * (recipe.canopyH / (recipe.canopyR * 2)) * (1 + recipe.form * 0.6));
    cp.setX(i, cp.getX(i) * (1 + (Math.sin(i * 1.7) * 0.14)));
  }
  canopy.translate(0, recipe.trunkH + recipe.canopyH * 0.42, 0);
  parts.push(colourise(canopy, foliageHex));
  return mergeBufferGeometry(parts);
}

/** LOD2: three crossed impostor cards. 6 triangles. */
function buildTreeLOD2(recipe: SpeciesRecipe, foliageHex: string): THREE.Group {
  const g = new THREE.Group();
  const tex = foliageCardTexture(foliageHex, recipe.leaf);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    transparent: false,
  });
  const h = recipe.trunkH + recipe.canopyH;
  const w = recipe.canopyR * 2.1;
  for (let i = 0; i < 3; i++) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    card.rotation.y = (i / 3) * Math.PI;
    card.position.y = h * 0.5;
    g.add(card);
  }
  return g;
}

/** Minimal geometry merge that keeps a colour attribute (no BufferGeometryUtils dep). */
function mergeBufferGeometry(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    const c = g.attributes.color as THREE.BufferAttribute | undefined;
    pos.set(p.array as Float32Array, vo * 3);
    nrm.set(n.array as Float32Array, vo * 3);
    if (u) uv.set(u.array as Float32Array, vo * 2);
    if (c) col.set(c.array as Float32Array, vo * 3);
    const index = g.index;
    if (index) {
      for (let i = 0; i < index.count; i++) idx[io + i] = index.getX(i) + vo;
      io += index.count;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = i + vo;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function colourise(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}

/**
 * Scatters tree cover in three LOD rings around the circuit.
 *
 * Returns a group the caller adds to the world. Each ring is one InstancedMesh
 * per species, so 3 species × 3 rings = 9 draw calls for a forest.
 */
export function buildForest(
  opts: TreeScatterOptions,
  palette: BiomePalette,
  heightAt: (x: number, z: number) => number,
  distToRoad: (x: number, z: number) => number
): { group: THREE.Group; treeCount: number } {
  const group = new THREE.Group();
  const rng = seededRandom(opts.seed);
  const speciesList = opts.species;

  // Pre-build the geometry per species per LOD (once, not per instance).
  const speciesKeys = speciesList.map(([k]) => k).filter((k) => RECIPES[k]);
  const recipes = speciesKeys.map((k) => RECIPES[k]);
  const foliage = speciesKeys.map((k, i) => palette.foliage[i % palette.foliage.length]);

  const lod0: THREE.Group[] = recipes.map((r, i) => buildTreeLOD0(r, foliage[i], opts.seed + i));
  const lod1 = recipes.map((r, i) => buildTreeLOD1(r, foliage[i]));
  const lod2 = recipes.map((r, i) => buildTreeLOD2(r, foliage[i]));

  // Bucket instances by (lod, species) so each bucket becomes one InstancedMesh.
  const buckets: { entries: THREE.Matrix4[]; colors: THREE.Color[] }[][] = [[], [], []];

  const dummy = new THREE.Object3D();
  const target = opts.count;
  let placed = 0;
  let guard = 0;
  const density = opts.density ?? 1;

  while (placed < target && guard < target * 40) {
    guard++;
    // Bias the radius distribution so the near field is dense but the far field
    // still gets filled (sqrt gives uniform area coverage).
    const rOuter = Math.sqrt(rng()) * opts.radiusM;
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * rOuter;
    const z = Math.sin(a) * rOuter;
    const dRoad = distToRoad(x, z);
    if (dRoad < opts.minRoadDist || dRoad > opts.maxRoadDist) continue;

    // Clumping: forests have clearings. fbm at ~120 m decides where the woods is.
    const clump = fbm2(x / 130, z / 130, 3, 2.03, 0.5, opts.seed + 5);
    if (clump < 0.34 && rng() > 0.12 * density) continue;

    // Pick a species by weight.
    let pick = 0;
    const total = speciesList.reduce((s, [, w]) => s + w, 0);
    let ticket = rng() * total;
    for (let i = 0; i < speciesList.length; i++) {
      ticket -= speciesList[i][1];
      if (ticket <= 0) {
        pick = i;
        break;
      }
    }
    if (!recipes[pick]) continue;

    const lod = rOuter < 110 ? 0 : rOuter < 420 ? 1 : 2;
    const scale = (lod === 0 ? 0.8 : 0.9) + rng() * (lod === 0 ? 0.75 : 1.15);
    dummy.position.set(x, heightAt(x, z) - 0.05, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();

    let bucket = buckets[lod][pick];
    if (!bucket) {
      bucket = { entries: [], colors: [] };
      buckets[lod][pick] = bucket;
    }
    bucket.entries.push(dummy.matrix.clone());
    // The instance colour multiplies the geometry's own vertex colour, which
    // already carries the foliage hue. Tinting with the *hue* again squares it
    // and every tree in the forest renders nearly black — so this is a neutral
    // brightness/hue-drift jitter only.
    const jitter = 0.78 + rng() * 0.44;
    bucket.colors.push(
      new THREE.Color(jitter * (0.94 + rng() * 0.12), jitter, jitter * (0.92 + rng() * 0.12))
    );
    placed++;
  }

  let total = 0;
  for (let lod = 0; lod < 3; lod++) {
    for (let s = 0; s < recipes.length; s++) {
      const b = buckets[lod][s];
      if (!b || b.entries.length === 0) continue;
      if (lod === 0) {
        // LOD0 is a group of meshes; flatten it into one geometry with material
        // groups (bark, foliage) so instancing is still a single draw call per
        // material. Rather than build a bespoke merger here we instance the
        // canopy-only shell at LOD0 as well and keep the full tree for the
        // nearest ring as a real mesh via InstancedMesh of a merged geo.
        const flat = flattenGroup(lod0[s]);
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.88,
          metalness: 0,
        });
        const im = new THREE.InstancedMesh(flat, mat, b.entries.length);
        // Near trees get real shadows; instanced shadow maps at 4 species
        // eventually cost more than they are worth, so only ring 0 casts.
        im.castShadow = true;
        im.receiveShadow = true;
        b.entries.forEach((m, i) => {
          im.setMatrixAt(i, m);
          im.setColorAt(i, b.colors[i]);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        group.add(im);
        total += b.entries.length;
      } else if (lod === 1) {
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
        const im = new THREE.InstancedMesh(lod1[s], mat, b.entries.length);
        im.castShadow = false;
        im.receiveShadow = true;
        b.entries.forEach((m, i) => {
          im.setMatrixAt(i, m);
          im.setColorAt(i, b.colors[i]);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        group.add(im);
        total += b.entries.length;
      } else {
        // Cards: instance each card orientation separately by baking a 3-card
        // merged geometry per species.
        const cards = mergeCards(lod2[s], recipes[s]);
        const mat = new THREE.MeshStandardMaterial({
          map: foliageCardTexture(foliage[s], recipes[s].leaf),
          alphaTest: 0.42,
          side: THREE.DoubleSide,
          roughness: 0.9,
          metalness: 0,
          vertexColors: true,
        });
        const im = new THREE.InstancedMesh(cards, mat, b.entries.length);
        im.castShadow = false;
        b.entries.forEach((m, i) => {
          im.setMatrixAt(i, m);
          im.setColorAt(i, b.colors[i]);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        group.add(im);
        total += b.entries.length;
      }
    }
  }

  return { group, treeCount: total };
}

function flattenGroup(g: THREE.Group): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh !== true) return;
    const mesh = o as THREE.Mesh;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const hex = mat.color ? `#${mat.color.getHexString()}` : '#4b3f31';
    geos.push(colourise(geo, hex));
  });
  return mergeBufferGeometry(geos);
}

function mergeCards(cardGroup: THREE.Group, recipe: SpeciesRecipe): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  cardGroup.updateMatrixWorld(true);
  cardGroup.traverse((o) => {
    if ((o as THREE.Mesh).isMesh !== true) return;
    const mesh = o as THREE.Mesh;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    const h = recipe.trunkH + recipe.canopyH;
    geos.push(colourise(geo, '#ffffff'));
    // Move the card pivot to the base so instances sit on the ground.
    void h;
  });
  return mergeBufferGeometry(geos);
}
