/**
 * GARAGE & STUDIO — the room the player spends the most time looking at
 * ====================================================================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The old showroom was a 24 m dark disc, a 18 m flat wall and a 3.6 m turntable
 * seen from a 5.4 m orbit with a 50° lens. At that distance the camera sat
 * *inside* the car: the roof line crossed the top of the frame and the whole
 * value of the screen was the dashboard, the seats and the inside of the
 * windscreen. The producer's note — "no galpão eu não quero ver o interior dos
 * carros, quero ver por fora" — is not a preference about camera angles, it is
 * the symptom of a set that is too small for the shot.
 *
 * A showroom is a *stage*. What makes a car photograph read as real is the
 * context built around it:
 *
 *   - a floor with a material (polished concrete with real reflection loss),
 *     a parking-line marking and a drain channel, so the eye has a metric ruler;
 *   - a back wall far enough away to be *behind* the car with air, with a
 *     chevron stripe and service doors for scale;
 *   - light from a large area: skylights with visible mullions, so the paint
 *     gets a soft, shaped highlight instead of a three-point studio cone;
 *   - foreground/background separation (columns, a mezzanine, clutter on
 *     shelves) so the car sits *in* a space instead of floating in void.
 *
 * Everything here is procedural: boxes, lofts and canvas textures, no assets.
 */

import * as THREE from 'three';
import { fbm2, seededRandom } from '../world/noise';
import { concreteMaps } from '../world/proceduralTextures';

export interface BuiltGarageShowroom {
  group: THREE.Group;
  turntable: THREE.Group;
  spotLights: THREE.SpotLight[];
  /** Rect area-ish fills used for the paint highlights (kept for uniform dimming). */
  fillLights: THREE.Light[];
  /** Suggested orbit camera envelope for this room, in metres. */
  framing: { minDist: number; maxDist: number; defaultDist: number; targetY: number };
}

/** Polished-concrete floor map: aggregate, expansion joints, tyre polish. */
function floorMaps(tier: 1 | 2 | 3): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D | null;
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d') as unknown as CanvasRenderingContext2D | null;

  const img = ctx && ctx.createImageData ? ctx.createImageData(size, size) : null;
  const rimg = rctx && rctx.createImageData ? rctx.createImageData(size, size) : null;

  const base = tier === 1 ? [0.155, 0.158, 0.163] : tier === 2 ? [0.12, 0.128, 0.14] : [0.085, 0.09, 0.102];
  const rng = seededRandom(7331 + tier * 97);

  if (img && rimg) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        // Aggregate: three octaves of value noise, like exposed stone chips.
        const grain = fbm2(u * 240, v * 240, 4, 2.03, 0.5, 11);
        const blotch = fbm2(u * 9, v * 9, 5, 2.03, 0.5, 29);
        // Expansion joints every 6 m (the tile repeats over 12 m, so 2 lines).
        const jx = Math.min(u * size % (size / 2), size / 2 - (u * size % (size / 2)));
        const jy = Math.min(v * size % (size / 2), size / 2 - (v * size % (size / 2)));
        const joint = Math.min(jx, jy) < 2.2 ? 0.55 : 1;
        // Tyre polish: an elliptical worn patch where cars have scrubbed.
        const dx = u - 0.5;
        const dy = v - 0.5;
        const wear = Math.exp(-((dx * dx) / 0.05 + (dy * dy) / 0.14)) * 0.55;
        const k = (0.82 + grain * 0.3 + (blotch - 0.5) * 0.22) * joint;
        const i = (y * size + x) * 4;
        img.data[i] = Math.min(255, base[0] * k * 255);
        img.data[i + 1] = Math.min(255, base[1] * k * 255);
        img.data[i + 2] = Math.min(255, base[2] * k * 255);
        img.data[i + 3] = 255;
        // Roughness: 0 = mirror (tyre polish), 255 = matte. T1 is a working
        // garage (matte), T3 is a delivery bay (polished, near mirror).
        const floorRough = tier === 1 ? 0.62 : tier === 2 ? 0.3 : 0.12;
        const r = Math.max(0.03, Math.min(1, floorRough + (grain - 0.5) * 0.16 - wear * 0.5 + (1 - joint) * 0.3));
        rimg.data[i] = r * 255;
        rimg.data[i + 1] = r * 255;
        rimg.data[i + 2] = r * 255;
        rimg.data[i + 3] = 255;
      }
    }
    ctx!.putImageData(img, 0, 0);
    rctx!.putImageData(rimg, 0, 0);
  }
  void rng;

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  map.anisotropy = 8;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 3);
  roughnessMap.anisotropy = 8;
  return { map, roughnessMap };
}

/** Painted chevron / hazard band used on the back wall of a workshop. */
function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D | null;
  if (ctx && ctx.fillRect) {
    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#e8b23a';
    for (let i = -128; i < 640; i += 96) {
      ctx.beginPath();
      ctx.moveTo(i, 128);
      ctx.lineTo(i + 48, 128);
      ctx.lineTo(i + 96, 0);
      ctx.lineTo(i + 48, 0);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * A workshop hall sized for a car photograph: 34 m x 26 m of floor, 9 m to the
 * trusses, skylights overhead, a service wall behind and a mezzanine on one
 * side. The car sits on a low plinth in the middle, and the default camera sits
 * 13 m away at 1.9 m height — far enough that the whole car fits comfortably in
 * a 50° frame with air above it, which is what "visto por fora" means.
 */
export function buildGarageShowroomV2(
  tier: 1 | 2 | 3,
  trophyCount: number,
  posters: { dataUrl: string }[]
): BuiltGarageShowroom {
  const group = new THREE.Group();
  const rng = seededRandom(4242 + tier * 13);

  // --- Materials -----------------------------------------------------------
  const floorM = floorMaps(tier);
  const floorMat = new THREE.MeshPhysicalMaterial({
    map: floorM.map,
    roughnessMap: floorM.roughnessMap,
    roughness: 1.0,
    metalness: 0.0,
    clearcoat: tier === 3 ? 0.85 : tier === 2 ? 0.5 : 0.12,
    clearcoatRoughness: tier === 3 ? 0.06 : tier === 2 ? 0.16 : 0.4,
    envMapIntensity: tier === 3 ? 1.15 : 0.85,
  });

  const wallMaps = concreteMaps();
  const wallMat = new THREE.MeshStandardMaterial({
    color: tier === 1 ? 0xb9b3a6 : tier === 2 ? 0x99a0ab : 0x7d8795,
    map: wallMaps.albedo,
    normalMap: wallMaps.normalMap,
    roughnessMap: wallMaps.roughnessMap,
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.6,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x2a3038,
    metalness: 0.85,
    roughness: 0.42,
    envMapIntensity: 0.9,
  });
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x1b2028, metalness: 0.7, roughness: 0.5 });

  // --- Floor ---------------------------------------------------------------
  // The hall must enclose the whole orbit envelope (max zoom 22 m) in every
  // direction, otherwise the camera swings past the wall and the shot is a car
  // floating in a blue void — the exact failure the old showroom had.
  const HALL_W = 46;
  const HALL_L = 42;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_L), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Parking / alignment lines: a metric ruler on the floor.
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xe8e2d4,
    roughness: 0.7,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const lineGeo = new THREE.PlaneGeometry(0.1, 6.4);
  for (const side of [-1, 1]) {
    const l = new THREE.Mesh(lineGeo, lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(side * 2.15, 0.004, 0);
    group.add(l);
  }
  const frontLine = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.1), lineMat);
  frontLine.rotation.x = -Math.PI / 2;
  frontLine.position.set(0, 0.004, 5.2);
  group.add(frontLine);

  // Drain channel down the middle of the bay.
  const drain = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.05, HALL_L * 0.8),
    new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.55, metalness: 0.6 })
  );
  drain.position.set(-9.5, 0.005, 0);
  group.add(drain);

  // --- Walls ---------------------------------------------------------------
  const wallH = 9;
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, wallH), wallMat);
  backWall.position.set(0, wallH / 2, -HALL_L / 2);
  backWall.receiveShadow = true;
  group.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(HALL_L, wallH), wallMat);
  leftWall.position.set(-HALL_W / 2, wallH / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  group.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(HALL_L, wallH), wallMat);
  rightWall.position.set(HALL_W / 2, wallH / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  group.add(rightWall);

  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, wallH), wallMat);
  frontWall.position.set(0, wallH / 2, HALL_L / 2);
  frontWall.rotation.y = Math.PI;
  frontWall.receiveShadow = true;
  group.add(frontWall);

  // Roll-up door on the front wall, open onto a bright apron: this is the light
  // source the room "breathes" from, and it explains why the floor is brighter
  // near the mouth of the bay.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 6.2),
    new THREE.MeshBasicMaterial({ color: 0xdfe7f2 })
  );
  apron.position.set(-9, 3.1, HALL_L / 2 - 0.06);
  apron.rotation.y = Math.PI;
  group.add(apron);
  const apronFrame = new THREE.Mesh(new THREE.BoxGeometry(7.9, 6.5, 0.18), steelMat);
  apronFrame.position.set(-9, 3.2, HALL_L / 2 - 0.02);
  group.add(apronFrame);

  // Hazard band + brand chevron on the back wall.
  const chevMat = new THREE.MeshStandardMaterial({
    map: chevronTexture(),
    roughness: 0.75,
    metalness: 0.05,
  });
  const chevBand = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, 0.55), chevMat);
  chevBand.position.set(0, 1.1, -HALL_L / 2 + 0.02);
  group.add(chevBand);

  // Wall cladding ribs: vertical seams every 2 m break the flat plane.
  const ribGeo = new THREE.BoxGeometry(0.05, wallH, 0.07);
  for (let x = -HALL_W / 2 + 2; x < HALL_W / 2; x += 2) {
    const rib = new THREE.Mesh(ribGeo, new THREE.MeshStandardMaterial({ color: 0x5f6670, metalness: 0.5, roughness: 0.6 }));
    rib.position.set(x, wallH / 2, -HALL_L / 2 + 0.04);
    group.add(rib);
  }

  // Service roller doors, which give the wall a scale reference and a light trap.
  for (const dx of [-9.5, 9.5]) {
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 5.0),
      new THREE.MeshStandardMaterial({ color: tier === 3 ? 0x2b3a4a : 0x4a4f57, roughness: 0.6, metalness: 0.35 })
    );
    door.position.set(dx, 2.5, -HALL_L / 2 + 0.04);
    group.add(door);
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(5.3, 0.12, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x1d2127, metalness: 0.6, roughness: 0.5 })
    );
    for (let y = 0.5; y < 5; y += 0.55) {
      const s = slat.clone();
      s.position.set(dx, y, -HALL_L / 2 + 0.08);
      group.add(s);
    }
  }

  // --- Roof + skylights ----------------------------------------------------
  // The roof is a real surface with openings, so the light in the room has a
  // visible source: mullioned skylights that also reflect in the paint.
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c333d, roughness: 0.7, metalness: 0.3 });
  const baySpacing = 4.4;
  for (let z = -HALL_L / 2 + baySpacing; z < HALL_L / 2; z += baySpacing) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, 0.28, 0.22), trussMat);
    beam.position.set(0, wallH, z);
    group.add(beam);
  }
  for (let x = -HALL_W / 2 + baySpacing; x < HALL_W / 2; x += baySpacing) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, HALL_L), trussMat);
    beam.position.set(x, wallH, 0);
    group.add(beam);
  }
  // Roof panels between the trusses, with gaps over the car for skylight.
  const skylightMat = new THREE.MeshPhysicalMaterial({
    color: 0xdfe9f5,
    emissive: new THREE.Color(0xcfe0f2),
    emissiveIntensity: 0.55,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  for (let x = -HALL_W / 2 + baySpacing / 2; x < HALL_W / 2; x += baySpacing) {
    for (let z = -HALL_L / 2 + baySpacing / 2; z < HALL_L / 2; z += baySpacing) {
      const overCar = Math.abs(x) < 7 && Math.abs(z) < 6;
      if (overCar) {
        const sky = new THREE.Mesh(new THREE.PlaneGeometry(baySpacing - 0.3, baySpacing - 0.3), skylightMat);
        sky.rotation.x = Math.PI / 2;
        sky.position.set(x, wallH - 0.02, z);
        group.add(sky);
      } else {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(baySpacing - 0.3, baySpacing - 0.3), roofMat);
        panel.rotation.x = Math.PI / 2;
        panel.position.set(x, wallH - 0.02, z);
        group.add(panel);
      }
    }
  }

  // --- Turntable plinth ----------------------------------------------------
  // Deliberately low (11 cm) and wide: a plinth, not a stage. A tall disc reads
  // as a cake stand and lifts the car off its own contact shadow.
  const turntable = new THREE.Group();
  const plinthMat = new THREE.MeshPhysicalMaterial({
    color: tier === 1 ? 0x6b6b68 : tier === 2 ? 0x54595f : 0x3e444d,
    metalness: 0.3,
    roughness: tier === 3 ? 0.16 : 0.34,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.75, 0.11, 64), plinthMat);
  plinth.position.y = 0.055;
  plinth.receiveShadow = true;
  turntable.add(plinth);
  const ringMat = new THREE.MeshStandardMaterial({
    color: tier === 1 ? 0xd9a02a : tier === 2 ? 0x22d3c5 : 0xe8c547,
    emissive: tier === 1 ? 0x3a2600 : tier === 2 ? 0x03302c : 0x332400,
    emissiveIntensity: 0.8,
    metalness: 0.6,
    roughness: 0.3,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.62, 0.028, 8, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.112;
  turntable.add(ring);
  // Radial tick marks: 24 stations, so rotation is legible.
  const tickMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ae, roughness: 0.6, metalness: 0.4 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 6 === 0 ? 0.5 : 0.26, 0.004, 0.05), tickMat);
    tick.position.set(Math.cos(a) * 4.1, 0.113, Math.sin(a) * 4.1);
    tick.rotation.y = -a;
    turntable.add(tick);
  }
  group.add(turntable);

  // --- Mezzanine / office glass -------------------------------------------
  const mezz = new THREE.Mesh(new THREE.BoxGeometry(HALL_W * 0.52, 0.25, 4.2), steelMat);
  mezz.position.set(-HALL_W * 0.22, 3.4, -HALL_L / 2 + 2.3);
  group.add(mezz);
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(HALL_W * 0.52, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.7, roughness: 0.35 })
  );
  rail.position.set(-HALL_W * 0.22, 4.45, -HALL_L / 2 + 4.4);
  group.add(rail);
  for (let x = -HALL_W * 0.46; x < 0.4; x += 1.6) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), steelMat);
    post.position.set(x, 3.95, -HALL_L / 2 + 4.4);
    group.add(post);
  }
  const officeGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.2),
    new THREE.MeshPhysicalMaterial({
      color: 0x9fc6e0,
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.35,
      envMapIntensity: 1.4,
    })
  );
  officeGlass.position.set(-12, 4.7, -HALL_L / 2 + 0.1);
  group.add(officeGlass);

  // --- Trophy cabinet + tool wall -----------------------------------------
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.3, 0.6), steelMat);
  cabinet.position.set(-11.6, 1.15, -HALL_L / 2 + 0.55);
  group.add(cabinet);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd45e, metalness: 1, roughness: 0.16 });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xd7dde6, metalness: 1, roughness: 0.2 });
  const visibleTrophies = Math.min(12, Math.max(1, trophyCount));
  for (let t = 0; t < visibleTrophies; t++) {
    const shelf = Math.floor(t / 4);
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.055, 0.36, 14),
      t % 3 === 0 ? goldMat : silverMat
    );
    cup.position.set(-13.4 + (t % 4) * 1.15, 0.6 + shelf * 0.72, -HALL_L / 2 + 0.9);
    group.add(cup);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.24), steelMat);
    base.position.set(cup.position.x, cup.position.y - 0.23, cup.position.z);
    group.add(base);
  }

  // Tool wall: pegboard with tool silhouettes — reads as a real workshop.
  const peg = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.9, metalness: 0.1 })
  );
  peg.position.set(10.5, 2.3, -HALL_L / 2 + 0.06);
  group.add(peg);
  for (let t = 0; t < 16; t++) {
    const w = 0.07 + rng() * 0.05;
    const h = 0.4 + rng() * 0.75;
    const tool = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), steelMat);
    tool.position.set(7.9 + (t % 8) * 0.72, 1.7 + Math.floor(t / 8) * 1.1, -HALL_L / 2 + 0.11);
    group.add(tool);
  }

  // Tool chests / tyres stacked along the right wall — clutter that anchors scale.
  for (let i = 0; i < 6; i++) {
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.0 + rng() * 0.5, 0.7),
      new THREE.MeshStandardMaterial({
        color: [0xb03a2e, 0x1f6f8b, 0xb8860b][i % 3],
        roughness: 0.45,
        metalness: 0.5,
      })
    );
    chest.position.set(HALL_W / 2 - 1.2, 0.55 + rng() * 0.2, -8 + i * 3.1);
    chest.rotation.y = -Math.PI / 2;
    group.add(chest);
  }
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.92 });
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3 - (i % 2); j++) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 8, 20), tyreMat);
      tyre.rotation.x = Math.PI / 2;
      tyre.position.set(-13 + i * 0.78, 0.14 + j * 0.27, 8.5);
      group.add(tyre);
    }
  }

  // --- Photo posters -------------------------------------------------------
  posters.slice(0, 3).forEach((poster, idx) => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load(poster.dataUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.56),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0 })
    );
    frame.position.set(2.2 + idx * 3.0, 3.5, -HALL_L / 2 + 0.09);
    group.add(frame);
    const border = new THREE.Mesh(
      new THREE.BoxGeometry(2.74, 1.7, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x0f1216, roughness: 0.6 })
    );
    border.position.set(frame.position.x, frame.position.y, -HALL_L / 2 + 0.05);
    group.add(border);
  });

  // --- Lights --------------------------------------------------------------
  // Soft key from the skylights, then two shaped strip highlights (thin, tall
  // and to the side, like a studio softbox) so the clearcoat gets a *line*
  // rather than a dot. A car photographed with only point lights looks plastic
  // because plastic is exactly what a point highlight reveals.
  const spotLights: THREE.SpotLight[] = [];
  const fillLights: THREE.Light[] = [];

  const skylightWash = new THREE.SpotLight(0xf2f7ff, 60, 40, Math.PI * 0.34, 1.0, 1.4);
  skylightWash.position.set(-2, 8.4, 4);
  skylightWash.target.position.set(0, 0.6, 0);
  skylightWash.castShadow = true;
  skylightWash.shadow.mapSize.set(2048, 2048);
  skylightWash.shadow.bias = -0.0006;
  skylightWash.shadow.normalBias = 0.02;
  group.add(skylightWash, skylightWash.target);
  spotLights.push(skylightWash);

  const rim = new THREE.SpotLight(0xdfeaff, 46, 34, Math.PI * 0.3, 0.9, 1.5);
  rim.position.set(6.5, 7.4, -7.5);
  rim.target.position.set(0, 0.7, 0);
  group.add(rim, rim.target);
  spotLights.push(rim);

  const front = new THREE.SpotLight(0xfff4e6, 30, 30, Math.PI * 0.4, 0.95, 1.5);
  front.position.set(2.5, 6.2, 9.5);
  front.target.position.set(0, 0.5, 0);
  group.add(front, front.target);
  spotLights.push(front);

  // Studio strip "softboxes": emissive panels + a matching RectAreaLight would
  // be ideal, but RectAreaLight forces a shader recompile per material; instead
  // two long thin emissive bars at 2.6 m height supply the visible specular
  // streak through the environment map and read as practical fixtures.
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 7.5), stripMat);
    bar.position.set(side * 3.6, 5.4, 0);
    group.add(bar);
    const glow = new THREE.PointLight(0xeaf3ff, 8, 16, 2);
    glow.position.set(side * 3.6, 5.3, 0);
    group.add(glow);
    fillLights.push(glow);
  }

  const ambient = new THREE.HemisphereLight(0xdfeaff, 0x30343c, 0.45);
  group.add(ambient);
  fillLights.push(ambient);

  return {
    group,
    turntable,
    spotLights,
    fillLights,
    framing: { minDist: 6.6, maxDist: 19, defaultDist: 9.4, targetY: 0.62 },
  };
}
