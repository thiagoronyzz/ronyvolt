import * as THREE from 'three';
import { CarSpec, CarTuneSetup, DamageState } from '../types/game';
import { STICKER_LIBRARY, WHEEL_CATALOG } from '../data/carCatalog';
import {
  BodyShape,
  buildBodyShell,
  BuiltBodyShell,
  exhaustTipGeometry,
  headlightAssembly,
  MATERIAL_SLOT,
  mirrorGeometry,
  roundedSlab,
  shapeForArchetype,
  sweptTube,
} from './CarBodyBuilder';
import { buildWheel } from './WheelBuilder';
import {
  alcantaraMaps,
  automotivePaintMaps,
  carbonFibreMaps,
  flameGradientTexture,
  grilleMeshTexture,
  headlightLensTexture,
  leatherMaps,
  roadGrimeTexture,
  studioStripTexture,
  taillightTexture,
  tireMaps,
  windGlassMaps,
} from '../world/proceduralTextures';

export interface BuiltCarRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  bodyPaintMat: THREE.MeshPhysicalMaterial;
  wheels: THREE.Group[]; // FL, FR, RL, RR
  frontWheelPivots: THREE.Group[]; // FL, FR steering pivots
  brakeGlowMats: THREE.MeshStandardMaterial[];
  doorLeftPivot: THREE.Group;
  doorRightPivot: THREE.Group;
  hoodPivot: THREE.Group;
  trunkPivot: THREE.Group;
  steeringWheelMesh: THREE.Group;
  pineTreePivot: THREE.Group | null;
  rcAntennaPivot: THREE.Group | null;
  flameLeft: THREE.Mesh;
  flameRight: THREE.Mesh;
  headlightCones: THREE.Mesh[];
  cfdGroup: THREE.Group;
  shieldBubbleMesh: THREE.Mesh;
  isGullwing: boolean;
  /** Exposed for the renderer so it can place contact shadows and LOD. */
  bodyShape: BodyShape;
  wheelRadiusM: number;
  updateRealtimeVisuals: (state: {
    dt: number;
    speedKmh: number;
    steering: number;
    wheelSpinRad: number;
    brakeTempC: number;
    engineTempC: number;
    backfireActive: boolean;
    nitroActive: boolean;
    doorsOpen: boolean;
    hoodOpen: boolean;
    trunkOpen: boolean;
    cfdVisible: boolean;
    bassEnergy: number;
    pitchRad: number;
    rollRad: number;
    headlightsOn: boolean;
    shieldActive: boolean;
    damage: DamageState;
  }) => void;
}

// ---------------------------------------------------------------------------
// Textures that depend on the individual car (plates, stickers)
// ---------------------------------------------------------------------------

function createLicensePlateTexture(tune: CarTuneSetup): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 168;
  const ctx = canvas.getContext('2d')!;

  const plate = (tune.plateText || 'UNO2E05').toUpperCase().slice(0, 7);

  if (tune.plateRegion === 'BR_MERCOSUL') {
    // Real Mercosul plate: white field, blue top band with BRASIL and the flag
    // block, black alphanumeric, and the vertical blue "Brasil" strip.
    ctx.fillStyle = '#f7f8fa';
    ctx.fillRect(0, 0, 512, 168);
    ctx.fillStyle = '#002f6c';
    ctx.fillRect(0, 0, 512, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('BRASIL', 16, 30);
    // Flag chip
    ctx.fillStyle = '#009c3b';
    ctx.fillRect(150, 10, 34, 22);
    ctx.fillStyle = '#ffdf00';
    ctx.beginPath();
    ctx.moveTo(167, 13);
    ctx.lineTo(181, 21);
    ctx.lineTo(167, 29);
    ctx.lineTo(153, 21);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#002776';
    ctx.beginPath();
    ctx.arc(167, 21, 5, 0, Math.PI * 2);
    ctx.fill();
    // Number field with the characteristic gap.
    ctx.fillStyle = '#101418';
    ctx.font = 'bold 74px "Arial Narrow", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${plate.slice(0, 3)}${plate.slice(3)}`, 280, 122);
    ctx.strokeStyle = `rgba(0,0,0,0.25)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, 510, 166);
  } else if (tune.plateRegion === 'JP_TOKYO') {
    ctx.fillStyle = '#f4f7f0';
    ctx.fillRect(0, 0, 512, 168);
    ctx.fillStyle = '#1b4332';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('品川 300', 256, 44);
    ctx.fillStyle = '#101418';
    ctx.font = 'bold 70px monospace';
    ctx.fillText(plate.slice(0, 7), 256, 128);
    ctx.strokeStyle = '#1b4332';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 164);
  } else if (tune.plateRegion === 'GALACTIC') {
    ctx.fillStyle = '#06010f';
    ctx.fillRect(0, 0, 512, 168);
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 160);
    ctx.fillStyle = '#00f5d4';
    ctx.font = 'bold 68px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(plate.slice(0, 7), 256, 112);
  } else {
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(0, 0, 512, 168);
    ctx.fillStyle = '#003399';
    ctx.fillRect(0, 0, 64, 168);
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 74px "Arial Narrow", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(plate.slice(0, 7), 290, 116);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createRearStickerTexture(stickerId: string): THREE.CanvasTexture | null {
  if (!stickerId || stickerId === 'none') return null;
  const sticker = STICKER_LIBRARY.find((s) => s.id === stickerId);
  if (!sticker) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 192);
  ctx.fillStyle = 'rgba(250,250,250,0.94)';
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 506, 186);
  ctx.fillStyle = '#15181f';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sticker.badge, 256, 76);
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(sticker.label.split('(')[0].trim().slice(0, 26), 256, 138);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// Shared material library (built once per finish, cached by key)
// ---------------------------------------------------------------------------

interface CarMaterialSet {
  paint: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  trim: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
}

const MATERIAL_CACHE = new Map<string, CarMaterialSet>();

function materialSetFor(car: CarSpec, tune: CarTuneSetup, envIntensity = 1): CarMaterialSet {
  const key = `${tune.paintColor}|${tune.paintFinish}|${car.id}`;
  const hit = MATERIAL_CACHE.get(key);
  if (hit) return hit;

  const isMatte = tune.paintFinish === 'matte_glitter';
  const finish = {
    metallic:
      tune.paintFinish === 'metallic' || tune.paintFinish === 'chameleon'
        ? 0.95
        : tune.paintFinish === 'pearlescent'
        ? 0.5
        : tune.paintFinish === 'matte_glitter'
        ? 0.4
        : 0.22,
    roughness: isMatte ? 0.62 : 0.16,
    clearcoat: isMatte ? 0.12 : 1,
    pearl: tune.paintFinish === 'pearlescent' || tune.paintFinish === 'chameleon',
    matte: isMatte,
  };
  const paintMaps = automotivePaintMaps(tune.paintColor, finish);

  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: paintMaps.albedo,
    normalMap: paintMaps.normalMap,
    normalScale: new THREE.Vector2(isMatte ? 0.55 : 0.32, isMatte ? 0.55 : 0.32),
    roughnessMap: paintMaps.roughnessMap,
    roughness: finish.roughness,
    metalness: finish.metallic,
    clearcoat: finish.clearcoat,
    clearcoatRoughness: 0.045,
    clearcoatNormalMap: paintMaps.normalMap,
    clearcoatNormalScale: new THREE.Vector2(0.14, 0.14),
    iridescence: tune.paintFinish === 'chameleon' ? 1 : tune.paintFinish === 'pearlescent' ? 0.55 : 0,
    iridescenceIOR: 1.42,
    iridescenceThicknessRange: [180, 540],
    envMapIntensity: envIntensity,
    vertexColors: true,
    emissive: tune.paintFinish === 'glow_dark' ? new THREE.Color(tune.paintColor) : new THREE.Color(0x000000),
    emissiveIntensity: tune.paintFinish === 'glow_dark' ? 0.32 : 0,
  });
  // Paint UVs are metric (one tile per 1.6 m); a 4.6 m car therefore wants the
  // flake tile to repeat ~3x, which the UV generator already handles.

  const glassMaps = windGlassMaps();
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a1016,
    metalness: 0,
    roughness: 0.035,
    roughnessMap: glassMaps.roughnessMap,
    normalMap: glassMaps.normalMap,
    normalScale: new THREE.Vector2(0.16, 0.16),
    transparent: true,
    opacity: 0.52,
    transmission: 0,
    ior: 1.52,
    reflectivity: 0.35,
    envMapIntensity: envIntensity * 1.4,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexColors: true,
  });

  const trim = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.08,
    envMapIntensity: envIntensity * 0.8,
  });

  const chrome = new THREE.MeshStandardMaterial({
    color: 0xdde3ec,
    roughness: 0.085,
    metalness: 1,
    envMapIntensity: envIntensity * 1.5,
  });

  const set = { paint, glass, trim, chrome };
  MATERIAL_CACHE.set(key, set);
  return set;
}

export function clearCarMaterialCache(): void {
  MATERIAL_CACHE.clear();
}

// ---------------------------------------------------------------------------
// Surface-hugging decals (racing stripes, shut lines)
// ---------------------------------------------------------------------------

/**
 * Builds a ribbon that follows the actual body surface, sampled from the loft.
 *
 * `vCentre` is a ring fraction on the section (0.5 = top centreline); the ribbon
 * spans `vHalfWidth` in the same units, and is lifted 1.5 mm along the surface
 * normal so it never z-fights. Because it is generated from the same section
 * function as the body, a stripe over the bonnet, windscreen and roof has no
 * gaps and no stepped edges — the classic failure of flat decal planes.
 */
function buildSurfaceRibbon(
  shell: BuiltBodyShell,
  probes: { uFrom: number; uTo: number },
  vCentre: number,
  vHalfWidth: number,
  liftM = 0.0015
): THREE.BufferGeometry | null {
  const steps = 96;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const probe = shell.lower.userData.probe as ((u: number, v: number) => THREE.Vector3) | undefined;
  if (!probe) return null;

  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const u = THREE.MathUtils.lerp(probes.uFrom, probes.uTo, f);
    const pA = probe(u, vCentre - vHalfWidth);
    const pB = probe(u, vCentre + vHalfWidth);
    // Outward direction: from the section's vertical axis.
    const lift = (p: THREE.Vector3) => {
      const n = new THREE.Vector3(p.x, p.y - shell.floorY * 0.5, 0);
      if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
      return p.clone().addScaledVector(n.normalize(), liftM);
    };
    const a = lift(pA);
    const b = lift(pB);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uvs.push(0, f * 8, 1, f * 8);
    if (i < steps) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Door shut lines.
 *
 * A real car's panel gaps are 4–6 mm wide and 15–25 mm deep, and they are the
 * strongest "this is a manufactured object" cue on the body — but they are also
 * the detail that, when missing, makes a surface look like a single moulded
 * shell. We model them as very thin dark ribbons sitting 0.4 mm proud, which
 * catches a shadow line at grazing angles.
 */
function buildShutLine(
  shell: BuiltBodyShell,
  uFixed: number,
  vFrom: number,
  vTo: number,
  width = 0.004
): THREE.BufferGeometry | null {
  const probe = shell.lower.userData.probe as ((u: number, v: number) => THREE.Vector3) | undefined;
  if (!probe) return null;
  const steps = 22;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = THREE.MathUtils.lerp(vFrom, vTo, i / steps);
    const uOff = width / Math.max(0.5, shell.length);
    const pA = probe(uFixed - uOff, v);
    const pB = probe(uFixed + uOff, v);
    positions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
    if (i < steps) {
      const b = i * 2;
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildCarMesh(car: CarSpec, tune: CarTuneSetup): BuiltCarRig {
  /**
   * Roll centre height. A car does not roll about its centre of mass: the body
   * rotates about the roll axis, which for a road car sits 60-140 mm above the
   * ground. Rolling about the wrong point makes the body swing sideways instead
   * of leaning, and makes one side of the car sink into the road.
   */
  const ROLL_CENTRE_Y = 0.11;
  /** Pitch axis: the body rotates about a line through the centre of mass. */
  const PITCH_CENTRE_Y = 0.55;
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  /**
   * Wheels live in their own group, attached to the root rather than to the
   * chassis.
   *
   * This is the single most visible cornering bug in a car renderer: if the
   * wheels are children of the rolling body, then every degree of body roll also
   * rolls the tyres, so the contact patch slides sideways, the wheels lift off
   * the road on the inside of the corner, and the car looks like it is leaning
   * on its rims. Real suspension keeps the wheel roughly perpendicular to the
   * road and lets the body move relative to it - which is the whole point of
   * having suspension.
   */
  const wheelGroup = new THREE.Group();
  root.add(chassisGroup, wheelGroup);

  const isRC = car.category === 'rc_revolt';
  const isF1 = car.archetype === 'f1_openwheel';
  const isTractor = car.archetype === 'farm_tractor';
  const isGullwing =
    car.archetype === 'gullwing_coupe' ||
    car.archetype === 'hypercar_aero' ||
    car.archetype === 'futuristic_concept';
  const isOpen = car.archetype === 'classic_1900_open' || car.archetype === 'classic_roadster';
  /**
   * A road car does not come out of the factory with a wing. The old build gave
   * every car a 16 cm-high two-strut wing because the default tune ships
   * `rearWingDeg: 7`, and that single detail - a shopping hatchback with a
   * time-attack wing - is one of the strongest "this is a video game" signals in
   * the whole scene. Wings are now limited to cars that would actually have one:
   * racing categories, and road cars whose own tune says the angle is aggressive.
   */
  const isRaceCar =
    car.category === 'formula_proto' ||
    car.archetype === 'lmp_prototype' ||
    car.archetype === 'rc_buggy' ||
    car.archetype === 'hypercar_aero' ||
    car.archetype === 'wedge_supercar';
  const wantsWing = isRaceCar
    ? true
    : car.category !== 'popular_br' && car.category !== 'classics' && (tune.rearWingDeg > 9 || tune.bodykit !== 'stock');

  // ---- Tyre size ----------------------------------------------------------
  // Dimensioned the way a tyre is actually sold: section width, aspect ratio,
  // rim diameter. The rolling radius derived from those numbers is what the
  // wheel arch is cut for, so the fit is exact rather than "close enough".
  const tireWidthMm = isRC ? 38 : isF1 ? 305 : isTractor ? 420 : car.horsepower > 450 ? 245 : 195;
  const wheelSizeInch = Math.min(24, Math.max(13, tune.wheelSizeInch));
  const aspectRatio = isF1 ? 40 : isTractor ? 70 : Math.max(30, Math.min(70, 60 - Math.floor((wheelSizeInch - 14) * 2.6)));
  const rimRadiusM = (wheelSizeInch * 25.4) / 2000;
  const sidewallM = (tireWidthMm / 1000) * (aspectRatio / 100);
  const tireRadiusM = rimRadiusM + sidewallM;
  const tireWidthM = tireWidthMm / 1000;

  // ---- Shape --------------------------------------------------------------
  const baseShape = shapeForArchetype(car.archetype);
  const bodykitWiden = tune.bodykit === 'stock' ? 1 : tune.bodykit === 'widebody_rb' ? 1.045 : 1.06;
  const shape: BodyShape = {
    ...baseShape,
    wheelRadius: tireRadiusM,
    width: baseShape.width * bodykitWiden,
    // Ride height changes are real: the body moves relative to the wheels.
    floor: baseShape.floor + (tune.rideHeightMm / 1000) * 0.55,
    noseTaper: baseShape.noseTaper,
    bodyTopY: baseShape.bodyTopY + (tune.rideHeightMm / 1000) * 0.55,
    cabin: baseShape.cabin
      ? {
          ...baseShape.cabin,
          roofY: baseShape.cabin.roofY + (tune.rideHeightMm / 1000) * 0.4,
          beltY: baseShape.cabin.beltY + (tune.rideHeightMm / 1000) * 0.4,
        }
      : null,
  };

  // ---- Materials ----------------------------------------------------------
  const mats = materialSetFor(car, tune);

  // ---- Shell --------------------------------------------------------------
  const shell = buildBodyShell(shape, {
    paint: mats.paint,
    glass: mats.glass,
    trim: mats.trim,
    chrome: mats.chrome,
  });
  // Expose the surface probe so decals can hug the body exactly.
  chassisGroup.add(shell.group);

  const wheelRadius = tireRadiusM;
  const hubY = tireRadiusM;

  // The shell is authored with y=0 on the ground, so the chassis group only
  // needs the suspension offset; pitch/roll are applied on top of it.
  chassisGroup.position.y = 0;

  // ---- Wheels -------------------------------------------------------------
  const tireMapsBaked = tireMaps();
  const tyreMat = new THREE.MeshPhysicalMaterial({
    color: 0x24262b,
    map: tireMapsBaked.albedo,
    normalMap: tireMapsBaked.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: tireMapsBaked.roughnessMap,
    roughness: 0.94,
    metalness: 0,
    clearcoat: 0.05,
    clearcoatRoughness: 0.75,
    envMapIntensity: 0.45,
  });
  const rimMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tune.wheelColor),
    metalness: 0.97,
    roughness: 0.13,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.35,
  });
  const discMat = new THREE.MeshStandardMaterial({
    color: 0x686d75,
    metalness: 0.94,
    roughness: 0.3,
    envMapIntensity: 1.1,
  });
  const vaneMat = new THREE.MeshStandardMaterial({ color: 0x35383e, metalness: 0.9, roughness: 0.5 });
  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xb31219,
    metalness: 0.4,
    roughness: 0.36,
  });
  const lugMat = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 1, roughness: 0.22 });

  const wheels: THREE.Group[] = [];
  const frontWheelPivots: THREE.Group[] = [];
  /** Per-wheel carriers, so the body attitude can be converted into travel. */
  const wheelMounts: { pivot: THREE.Group; baseY: number; x: number; z: number; camberRad: number }[] = [];
  const brakeGlowMats: THREE.MeshStandardMaterial[] = [discMat];

  // Track width.
  //
  // A tyre's outer sidewall sits flush with the arch lip on a road car, and
  // slightly inside it on a road-legal race car. The old formula put the
  // centreline 42% of the section width inboard of the *maximum* body width,
  // which leaves the tyre proud wherever the body tapers - so the wheels stuck
  // out of the flanks and the car looked like a toy with bolted-on tyres.
  const trackX = shape.width / 2 - tireWidthM * 0.5 - 0.008;
  const coords: [number, number, boolean][] = [
    [-trackX, shape.axleFrontZ, true],
    [trackX, shape.axleFrontZ, true],
    [-trackX, shape.axleRearZ, false],
    [trackX, shape.axleRearZ, false],
  ];

  coords.forEach(([wx, wz, isFront]) => {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, hubY, wz);

    const spec = WHEEL_CATALOG[Math.abs(tune.wheelModelIndex) % WHEEL_CATALOG.length];
    const built = buildWheel(
      {
        radiusM: tireRadiusM,
        sidewallM,
        widthM: tireWidthM,
        rimRadiusM,
        spokes: spec.spokes,
        aerodisc: spec.aerodisc,
        rimColor: tune.wheelColor,
        sidewallAspect: sidewallM / tireRadiusM,
        brakeScale: isF1 ? 0.82 : 0.74,
        caliperColor: '#b31219',
      },
      {
        tire: tyreMat,
        rim: rimMat,
        disc: discMat,
        vane: vaneMat,
        caliper: caliperMat,
        lug: lugMat,
      }
    );

    if (wx < 0) built.root.scale.x *= -1;

    const camberDeg = isFront ? tune.camberFrontDeg : tune.camberRearDeg;
    steerPivot.rotation.z = THREE.MathUtils.degToRad(wx < 0 ? -camberDeg : camberDeg);

    steerPivot.add(built.root);
    wheelGroup.add(steerPivot);
    wheels.push(built.spin);
    wheelMounts.push({ pivot: steerPivot, baseY: hubY, x: wx, z: wz, camberRad: steerPivot.rotation.z });
    if (isFront) frontWheelPivots.push(steerPivot);
  });

  // ---- Interior -----------------------------------------------------------
  const leather = leatherMaps(car.id === 'fiat-uno-2005-raiz' ? '#3b3a36' : '#22201d');
  const alcantara = alcantaraMaps('#1b1d21');
  const leatherMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: leather.albedo,
    normalMap: leather.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: leather.roughnessMap,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.28,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0x8a6b4f),
  });
  const dashMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: alcantara.albedo,
    normalMap: alcantara.normalMap,
    roughnessMap: alcantara.roughnessMap,
    roughness: 0.9,
    metalness: 0,
  });

  const cabinFrontZ = shape.cabin ? shape.cabin.frontBaseZ : shape.length * 0.1;
  const cabinRearZ = shape.cabin ? shape.cabin.rearBaseZ : -shape.length * 0.1;
  const cabinCentreZ = (cabinFrontZ + cabinRearZ) * 0.5;
  const beltY = shape.cabin ? shape.cabin.beltY : shape.shoulderY;
  const seatY = shape.floor + 0.06;

  // NOTE: the cockpit group is placed at the cabin centre, so every child uses
  // *body-space* z. The previous build subtracted the cabin centre a second
  // time on every dash/steering/console part, which pushed the whole dashboard
  // onto the bonnet and left the interior empty on every car in the catalog.
  const cockpitGroup = new THREE.Group();
  cockpitGroup.position.set(0, 0, cabinCentreZ);
  chassisGroup.add(cockpitGroup);

  // Seats: a squab and a backrest built from rounded extrusions. A bucket seat
  // has bolsters, and the bolsters are what read at a glance.
  const buildSeat = (x: number) => {
    const g = new THREE.Group();
    const squab = new THREE.Mesh(roundedSlab(0.46, 0.11, 0.5, 0.05, 8), leatherMat);
    squab.position.set(0, seatY + 0.09, 0.02);
    squab.rotation.x = -0.06;
    const back = new THREE.Mesh(roundedSlab(0.44, 0.56, 0.13, 0.06, 8), leatherMat);
    back.position.set(0, seatY + 0.34, -0.24);
    back.rotation.x = 0.22;
    const bolsterL = new THREE.Mesh(roundedSlab(0.075, 0.4, 0.44, 0.035, 6), leatherMat);
    bolsterL.position.set(-0.2, seatY + 0.2, -0.18);
    bolsterL.rotation.x = 0.22;
    const bolsterR = bolsterL.clone();
    bolsterR.position.x = 0.2;
    const headrest = new THREE.Mesh(roundedSlab(0.26, 0.16, 0.12, 0.05, 8), leatherMat);
    headrest.position.set(0, seatY + 0.68, -0.32);
    g.add(squab, back, bolsterL, bolsterR, headrest);
    g.position.x = x;
    return g;
  };
  cockpitGroup.add(buildSeat(-shape.width * 0.22));
  cockpitGroup.add(buildSeat(shape.width * 0.22));

  // Dashboard: a full-width slab that curves down at the ends, plus a binnacle.
  const dash = new THREE.Mesh(roundedSlab(shape.width * 0.8, 0.2, 0.34, 0.06, 8), dashMat);
  dash.position.set(0, beltY - 0.16, cabinFrontZ - 0.16);
  dash.rotation.x = -0.12;
  cockpitGroup.add(dash);

  const binnacle = new THREE.Mesh(roundedSlab(0.34, 0.12, 0.14, 0.045, 8), dashMat);
  binnacle.position.set(-shape.width * 0.2, beltY - 0.03, cabinFrontZ - 0.08);
  cockpitGroup.add(binnacle);

  // Gauge cluster: three round dials, not a glowing rectangle. Each is a lathe
  // bezel with an emissive face — this is what the camera sees from the cockpit.
  const clusterGroup = new THREE.Group();
  clusterGroup.position.set(-shape.width * 0.2, beltY - 0.02, cabinFrontZ - 0.15);
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.55, metalness: 0.4 });
  const faceMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c10,
    emissive: new THREE.Color(0x9ad4ff),
    emissiveIntensity: 0.55,
    roughness: 0.3,
  });
  for (let d = -1; d <= 1; d++) {
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 6, 20), bezelMat);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.048, 22), faceMat);
    bezel.position.x = d * 0.115;
    face.position.x = d * 0.115;
    face.position.z = -0.002;
    clusterGroup.add(bezel, face);
  }
  clusterGroup.rotation.x = -0.2;
  cockpitGroup.add(clusterGroup);

  // Steering wheel: a rim with a real cross-section, three spokes, and a column.
  const steeringWheelMesh = new THREE.Group();
  steeringWheelMesh.position.set(-shape.width * 0.19, beltY - 0.12, cabinFrontZ - 0.02);
  steeringWheelMesh.rotation.x = -0.42;
  const rimProfilePts: THREE.Vector2[] = [
    new THREE.Vector2(0.152, 0),
    new THREE.Vector2(0.166, 0.007),
    new THREE.Vector2(0.176, 0),
    new THREE.Vector2(0.166, -0.007),
  ];
  const wheelRim = new THREE.Mesh(
    new THREE.LatheGeometry(rimProfilePts, 40),
    new THREE.MeshPhysicalMaterial({
      color: 0x14161a,
      roughness: 0.5,
      metalness: 0.05,
      clearcoat: 0.4,
      clearcoatRoughness: 0.35,
    })
  );
  wheelRim.rotation.x = Math.PI / 2;
  steeringWheelMesh.add(wheelRim);
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.55, roughness: 0.4 });
  for (const a of [0, Math.PI * 0.66, Math.PI * 1.34]) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.14, 8), spokeMat);
    spoke.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.006);
    spoke.rotation.z = a - Math.PI / 2;
    steeringWheelMesh.add(spoke);
  }
  const hubDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.03, 20), spokeMat);
  hubDisc.rotation.x = Math.PI / 2;
  hubDisc.position.z = -0.012;
  steeringWheelMesh.add(hubDisc);
  const badge = new THREE.Mesh(
    new THREE.CircleGeometry(0.021, 18),
    new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.95, roughness: 0.25 })
  );
  badge.position.z = -0.029;
  steeringWheelMesh.add(badge);
  cockpitGroup.add(steeringWheelMesh);

  // Column.
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.22, 12), dashMat);
  column.rotation.x = Math.PI / 2 + 0.42;
  column.position.set(-shape.width * 0.19, beltY - 0.15, cabinFrontZ - 0.13);
  cockpitGroup.add(column);

  // Centre console with a gear lever and a handbrake — small, but they are what
  // you see once the camera is inside.
  const console3d = new THREE.Mesh(roundedSlab(0.2, 0.14, 0.62, 0.04, 6), dashMat);
  console3d.position.set(0, seatY + 0.05, cabinFrontZ - 0.3);
  cockpitGroup.add(console3d);
  const gearLever = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.16, 8), spokeMat);
  gearLever.position.set(0, seatY + 0.16, cabinFrontZ - 0.24);
  cockpitGroup.add(gearLever);
  const gearKnob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), leatherMat);
  gearKnob.position.set(0, seatY + 0.25, cabinFrontZ - 0.24);
  cockpitGroup.add(gearKnob);

  // Mirror: the inside mirror hangs from the header.
  const rearViewMirror = new THREE.Mesh(roundedSlab(0.24, 0.075, 0.03, 0.014, 6), dashMat);
  rearViewMirror.position.set(0, beltY + 0.34, cabinFrontZ + 0.02);
  cockpitGroup.add(rearViewMirror);

  // ---- Cheirinho de Pinho (kept — it is the game's signature) -------------
  let pineTreePivot: THREE.Group | null = null;
  if (tune.pineAirFreshener) {
    pineTreePivot = new THREE.Group();
    pineTreePivot.position.set(0, beltY + 0.36, cabinFrontZ + 0.08);
    const treeShape = new THREE.Shape();
    // A real pine-tree freshener silhouette: notched edges.
    treeShape.moveTo(0, 0.075);
    treeShape.lineTo(0.05, -0.02);
    treeShape.lineTo(0.022, -0.016);
    treeShape.lineTo(0.05, -0.06);
    treeShape.lineTo(0.012, -0.052);
    treeShape.lineTo(0.018, -0.085);
    treeShape.lineTo(-0.018, -0.085);
    treeShape.lineTo(-0.012, -0.052);
    treeShape.lineTo(-0.05, -0.06);
    treeShape.lineTo(-0.022, -0.016);
    treeShape.lineTo(-0.05, -0.02);
    treeShape.closePath();
    const pine = new THREE.Mesh(
      new THREE.ExtrudeGeometry(treeShape, { depth: 0.004, bevelEnabled: false, curveSegments: 4 }),
      new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.75 })
    );
    pine.position.y = -0.11;
    const string = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0012, 0.0012, 0.06, 4),
      new THREE.MeshStandardMaterial({ color: 0xd7d2c4 })
    );
    string.position.y = 0.0;
    pineTreePivot.add(pine, string);
    cockpitGroup.add(pineTreePivot);
  }

  // ---- RC whip antenna ----------------------------------------------------
  let rcAntennaPivot: THREE.Group | null = null;
  if (isRC) {
    rcAntennaPivot = new THREE.Group();
    rcAntennaPivot.position.set(-shape.width * 0.3, shape.shoulderY, -shape.length * 0.28);
    const whip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0022, 0.0034, 0.42, 6),
      new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 })
    );
    whip.position.y = 0.21;
    const flagTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffbe0b })
    );
    flagTip.position.y = 0.43;
    rcAntennaPivot.add(whip, flagTip);
    chassisGroup.add(rcAntennaPivot);
  }

  // ---- Doors / hood / trunk pivots (kept for the garage interactions) -----
  // The body is one continuous surface: doors are *inset* by a shut line rather
  // than separated into slabs, which is how the silhouette stays clean. The
  // pivots exist so the garage can still animate them.
  const doorLeftPivot = new THREE.Group();
  const doorRightPivot = new THREE.Group();
  chassisGroup.add(doorLeftPivot, doorRightPivot);

  const hoodPivot = new THREE.Group();
  hoodPivot.position.set(0, shape.shoulderY, shape.length * 0.16);
  chassisGroup.add(hoodPivot);
  const trunkPivot = new THREE.Group();
  trunkPivot.position.set(0, shape.deckY, -shape.length * 0.28);
  chassisGroup.add(trunkPivot);

  // ---- Shut lines (door gaps, hood, boot) ---------------------------------
  const shutMat = new THREE.MeshBasicMaterial({
    color: 0x05060a,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shutGroup = new THREE.Group();
  const probeRef = shell.lower.userData.probe as ((u: number, v: number) => THREE.Vector3) | undefined;
  if (probeRef) {
    const doorFrontU = 0.34;
    const doorRearU = 0.62;
    const sillV = 0.16;
    const beltV = 0.30;
    for (const [u, vA, vB] of [
      [doorFrontU, sillV, beltV],
      [doorRearU, sillV, beltV],
    ]) {
      const g = buildShutLine(shell, u, vA, vB, 0.005);
      if (g) shutGroup.add(new THREE.Mesh(g, shutMat));
      const g2 = buildShutLine(shell, u, 1 - vB, 1 - vA, 0.005);
      if (g2) shutGroup.add(new THREE.Mesh(g2, shutMat));
    }
    // Horizontal gap along the beltline between the doors.
    const beltLine = buildShutLine(shell, 0.34, 0.30, 0.30, 0.005);
    if (beltLine) shutGroup.add(new THREE.Mesh(beltLine, shutMat));
  }
  chassisGroup.add(shutGroup);

  // ---- Hood vents (real slats, not a sticker) ------------------------------
  if (car.horsepower > 380 && !isOpen && shape.hoodY > 0.6) {
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.5, metalness: 0.4 });
    for (let v = 0; v < 3; v++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(shape.width * 0.22, 0.012, 0.05), ventMat);
      slat.position.set(0, shape.hoodY + 0.004, shape.length * (0.24 + v * 0.035));
      slat.rotation.x = -0.06;
      chassisGroup.add(slat);
    }
  }

  // ---- Mirrors ------------------------------------------------------------
  const mirrorMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b0d10,
    roughness: 0.28,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(mirrorGeometry(), mats.paint);
    // Mounted on the glasshouse shoulder: the mirror head starts where the body
    // actually ends at that height, so the stem is 2 cm long, not 6.
    const shoulderX = shell.halfWidthAtZ(cabinFrontZ + 0.04);
    mirror.position.set(side * (shoulderX * 0.99 + 0.045), beltY + 0.09, cabinFrontZ + 0.04);
    mirror.scale.setScalar(1.0);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.036, 18), mirrorMat);
    glass.position.set(side * 0.004, 0, 0);
    glass.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    mirror.add(glass);
    chassisGroup.add(mirror);

    const stem = new THREE.Mesh(
      sweptTube(
        [
          { x: side * shoulderX * 0.97, y: beltY + 0.05, z: cabinFrontZ + 0.03 },
          { x: side * (shoulderX * 0.99 + 0.03), y: beltY + 0.08, z: cabinFrontZ + 0.04 },
        ],
        0.012,
        6
      ),
      mirrorMat
    );
    chassisGroup.add(stem);
  }

  // ---- Wipers -------------------------------------------------------------
  const wiperMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.8 });
  for (let w = 0; w < 2; w++) {
    const arm = new THREE.Mesh(
      sweptTube(
        [
          { x: -0.34 + w * 0.46, y: shape.hoodY + 0.02, z: cabinFrontZ + 0.05 },
          { x: -0.04 + w * 0.46, y: shape.hoodY + 0.06, z: cabinFrontZ - 0.1 },
        ],
        0.005,
        4
      ),
      wiperMat
    );
    if (shape.cabin) chassisGroup.add(arm);
  }

  // ---- Door handles -------------------------------------------------------
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c20,
    metalness: 0.25,
    roughness: 0.42,
  });
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(roundedSlab(0.1, 0.026, 0.03, 0.01, 6), handleMat);
    const handleZ = cabinCentreZ + 0.1;
    handle.position.set(side * (shell.halfWidthAtZ(handleZ) * 0.995), shape.shoulderY - 0.045, handleZ);
    handle.rotation.y = Math.PI / 2;
    chassisGroup.add(handle);
  }

  // ---- Front end: grille, splitter, headlights ---------------------------
  const grilleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grilleMeshTexture(),
    roughness: 0.55,
    metalness: 0.5,
    side: THREE.DoubleSide,
    alphaTest: 0.1,
  });
  const noseZ = shape.length * 0.5;
  if (!isOpen && !isF1) {
    // The grille sits in the nose, not in front of it: its z comes from the
    // surface probe and it is pulled 12 mm in, so the mesh reads as a recess.
    const gY = shape.floor + shape.hoodY * 0.34;
    const gW = Math.min(shape.width * 0.46, shell.halfWidthAtZ(noseZ - 0.3) * 1.05);
    const gZ = shell.surfaceZAt(gW * 0.45, gY, true) - 0.012;
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(gW, shape.hoodY * 0.19), grilleMat);
    grille.position.set(0, gY, gZ);
    grille.rotation.y = Math.PI;
    chassisGroup.add(grille);
    // Surround: a thin painted frame, which is what makes a grille look fitted.
    const surround = new THREE.Mesh(
      roundedSlab(gW * 1.06, shape.hoodY * 0.21, 0.03, 0.012, 6),
      new THREE.MeshStandardMaterial({ color: 0x0a0c0f, roughness: 0.55, metalness: 0.2 })
    );
    surround.position.set(0, gY, gZ - 0.012);
    chassisGroup.add(surround);
  }

  const hlColor =
    tune.headlightType === 'halogen_warm'
      ? 0xffe6b8
      : tune.headlightType === 'yellow_gt'
      ? 0xffd24a
      : tune.headlightType === 'led_matrix'
      ? 0xe8f4ff
      : 0xd9f0ff;
  const headlightCones: THREE.Mesh[] = [];
  const coneGeo = new THREE.ConeGeometry(1.5, 11, 18, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: hlColor,
    transparent: true,
    opacity: 0.055,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const hlWidth = shape.width * 0.26;
  const hlHeight = Math.max(0.06, shape.hoodY * 0.11);
  const { lens, reflector } = headlightAssembly(hlWidth, hlHeight, 0.055);
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2f8ff,
    roughness: 0.04,
    metalness: 0,
    transmission: 0.82,
    thickness: 0.03,
    ior: 1.5,
    transparent: true,
    opacity: 0.72,
    map: headlightLensTexture(),
    envMapIntensity: 1.6,
  });
  const reflectorMat = new THREE.MeshStandardMaterial({
    color: 0xdfe6ee,
    metalness: 1,
    roughness: 0.12,
    emissive: new THREE.Color(hlColor),
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  });

  for (const side of [-1, 1]) {
    const y = shape.floor + shape.hoodY * 0.42;
    // Position on the *actual* nose surface: a headlight is 25-30% of the way
    // out from the centreline, and at that x the nose has already narrowed, so
    // using `width/2` put the lamps outside the bodywork.
    const x = side * shell.halfWidthAtZ(noseZ - 0.25) * 0.62;
    const z = shell.surfaceZAt(x, y, true) - 0.004;
    const l = new THREE.Mesh(lens, lensMat);
    l.position.set(x, y, z);
    l.rotation.y = side > 0 ? 0.12 : -0.12;
    const r = new THREE.Mesh(reflector, reflectorMat);
    r.position.set(x, y, z - 0.008);
    r.rotation.y = side > 0 ? 0.12 : -0.12;
    chassisGroup.add(l, r);

    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(x, y - 0.05, z + 5.4);
    cone.visible = false;
    headlightCones.push(cone);
    chassisGroup.add(cone);
  }

  // ---- Tail lights --------------------------------------------------------
  //
  // These used to be two `PlaneGeometry` slabs 30 cm wide with a box bezel,
  // placed at `z = -length/2`, i.e. *outside* the body: because the body tapers
  // at the tail, the planes floated in mid-air as two black bricks. They are now
  // placed on the real tail surface and sized from the real tail width.
  const tailTex = taillightTexture();
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2a3c,
    map: tailTex,
    emissive: new THREE.Color(0xff1a2a),
    emissiveMap: tailTex,
    emissiveIntensity: 0.55,
    roughness: 0.18,
    metalness: 0.1,
    transparent: true,
    opacity: 0.95,
  });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x1a0407, roughness: 0.4 });
  const tailZ = -shape.length * 0.5 + 0.055;
  // Real width of the tail at lamp height, and how far back the surface sits.
  const tailHalf = Math.min(shape.width * 0.42, shell.halfWidthAtZ(tailZ) * 0.86);
  const lampH = Math.max(0.055, Math.min(0.13, (shape.deckY - shape.floor) * 0.2));
  const lampY = shape.deckY * 0.76;
  if (!isOpen) {
    for (const side of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.PlaneGeometry(tailHalf * 0.62, lampH), tailMat);
      tl.position.set(side * tailHalf * 0.52, lampY, tailZ - 0.005);
      tl.rotation.y = Math.PI;
      tl.rotation.x = -0.06;
      chassisGroup.add(tl);
      // Recessed housing: a shallow tray a few millimetres proud of the paint,
      // which is what gives the cluster a shadow line instead of a floating glow.
      const housing = new THREE.Mesh(roundedSlab(tailHalf * 0.7, lampH * 1.5, 0.03, 0.012, 6), brakeMat);
      housing.position.set(side * tailHalf * 0.52, lampY, tailZ + 0.012);
      chassisGroup.add(housing);
    }
    // Centre garnish bar: most modern hatches and saloons have one, and it ties
    // the two clusters into a single graphic.
    const garnish = new THREE.Mesh(
      roundedSlab(tailHalf * 0.42, lampH * 0.3, 0.022, 0.008, 5),
      new THREE.MeshStandardMaterial({ color: 0x14060a, roughness: 0.35, metalness: 0.3 })
    );
    garnish.position.set(0, lampY, tailZ + 0.004);
    chassisGroup.add(garnish);
  }

  // ---- Rear diffuser + exhausts ------------------------------------------
  const diffuser = new THREE.Mesh(
    roundedSlab(shape.width * 0.62, Math.max(0.05, shape.floor * 0.7), 0.14, 0.02, 6),
    new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.6, metalness: 0.3 })
  );
  diffuser.position.set(0, shape.floor + 0.03, -shape.length * 0.455);
  chassisGroup.add(diffuser);

  const exhaustMat = new THREE.MeshPhysicalMaterial({
    color: 0xc8ced8,
    metalness: 1,
    roughness: 0.16,
    clearcoat: 0.6,
  });
  const sootMat = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.95 });
  const exhaustCount = car.horsepower > 500 ? 4 : car.horsepower > 200 ? 2 : 1;
  const exhaustGeo = exhaustTipGeometry(0.042, 0.11);
  for (let e = 0; e < exhaustCount; e++) {
    const spread = exhaustCount === 1 ? 0 : (e - (exhaustCount - 1) / 2) * 0.17;
    const tip = new THREE.Mesh(exhaustGeo, exhaustMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(spread, shape.floor + 0.075, -shape.length * 0.5 + 0.04);
    const soot = new THREE.Mesh(new THREE.CircleGeometry(0.033, 16), sootMat);
    soot.position.set(spread, shape.floor + 0.075, -shape.length * 0.5 + 0.032);
    soot.rotation.y = Math.PI;
    chassisGroup.add(tip, soot);
  }

  // ---- Aero: rear wing and front splitter --------------------------------
  const carbon = carbonFibreMaps();
  const carbonMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: carbon.albedo,
    normalMap: carbon.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: carbon.roughnessMap,
    roughness: 0.34,
    metalness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });

  if (wantsWing) {
    const wingGroup = new THREE.Group();
    // Aerofoil: an extruded inverted aerofoil section with a real camber.
    const airfoil = new THREE.Shape();
    airfoil.moveTo(0, 0);
    airfoil.bezierCurveTo(0.12, 0.058, 0.34, 0.062, 0.5, 0.008);
    airfoil.bezierCurveTo(0.34, -0.014, 0.14, -0.012, 0, 0);
    const wingGeo = new THREE.ExtrudeGeometry(airfoil, {
      depth: shape.width * 0.92,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
      curveSegments: 12,
    });
    wingGeo.translate(-0.25, 0, -shape.width * 0.46);
    wingGeo.rotateY(Math.PI / 2);
    const wing = new THREE.Mesh(wingGeo, carbonMat);
    wing.position.set(0, shape.deckY + 0.16, -shape.length * 0.44);
    wing.rotation.z = THREE.MathUtils.degToRad(tune.rearWingDeg) * 0.6;
    wing.castShadow = true;
    wingGroup.add(wing);

    for (const side of [-1, 1]) {
      const plate = new THREE.Mesh(roundedSlab(0.02, 0.2, 0.34, 0.01, 6), carbonMat);
      plate.position.set(side * shape.width * 0.46, shape.deckY + 0.16, -shape.length * 0.44);
      wingGroup.add(plate);
      const strut = new THREE.Mesh(roundedSlab(0.026, 0.19, 0.06, 0.01, 6), carbonMat);
      strut.position.set(side * shape.width * 0.34, shape.deckY + 0.07, -shape.length * 0.44);
      wingGroup.add(strut);
    }
    chassisGroup.add(wingGroup);
  }

  if (isRaceCar || (tune.frontWingDeg > 8 && tune.bodykit !== 'stock')) {
    const noseHalf = shell.halfWidthAtZ(shape.length * 0.45);
    const splitter = new THREE.Mesh(
      roundedSlab(noseHalf * 2.04, 0.022, 0.2, 0.01, 8),
      carbonMat
    );
    // Height above the road, and set back so it tucks under the bumper instead
    // of sticking out in front of it like a shelf.
    splitter.position.set(0, shape.floor - 0.01, shape.length * 0.44);
    chassisGroup.add(splitter);
  }

  // Side skirts: a real part on widebody cars, and it anchors the lower body.
  if (tune.bodykit !== 'stock') {
    for (const side of [-1, 1]) {
      const skirt = new THREE.Mesh(roundedSlab(0.05, 0.08, shape.length * 0.42, 0.02, 6), carbonMat);
      skirt.position.set(side * shape.width * 0.5, shape.floor + 0.03, 0);
      chassisGroup.add(skirt);
    }
  }

  // ---- Livery stripes that follow the surface ----------------------------
  if (tune.liveryStripe === 'twin_racing' || tune.liveryStripe === 'offset_gt' || tune.liveryStripe === 'drift_tribal') {
    const stripeMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(tune.secondaryColor),
      roughness: 0.2,
      metalness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const centres = tune.liveryStripe === 'twin_racing' ? [0.468, 0.532] : tune.liveryStripe === 'offset_gt' ? [0.545] : [0.5];
    for (const c of centres) {
      const g = buildSurfaceRibbon(shell, { uFrom: 0.02, uTo: 0.98 }, c, tune.liveryStripe === 'offset_gt' ? 0.026 : 0.012);
      if (g) {
        const stripe = new THREE.Mesh(g, stripeMat);
        stripe.renderOrder = 1;
        chassisGroup.add(stripe);
      }
    }
  }

  if (tune.liveryStripe === 'sponsor_pro' || tune.liveryStripe === 'cyber_grid') {
    // Door-plane decal with the racing number, conformed by sampling the flank.
    const tex = createNumberRoundelTexture(tune);
    if (tex) {
      const mat = new THREE.MeshPhysicalMaterial({
        map: tex,
        transparent: true,
        roughness: 0.25,
        metalness: 0.1,
        clearcoat: 1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      for (const side of [-1, 1]) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.34), mat);
        plane.position.set(side * (shape.width * 0.5 + 0.002), shape.shoulderY - 0.08, cabinCentreZ + 0.16);
        plane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        chassisGroup.add(plane);
      }
    }
  }

  // ---- Plates ------------------------------------------------------------
  const plateTex = createLicensePlateTexture(tune);
  const plateMat = new THREE.MeshPhysicalMaterial({
    map: plateTex,
    roughness: 0.42,
    metalness: 0.05,
    clearcoat: 0.6,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 });
  // Mercosul plates are 400 x 130 mm. They are placed on the *real* bumper
  // surface: at 15 cm above the floor the body has already curved in, and
  // putting the plate at ±length/2 left it hanging in the air in front of the
  // nose (which is why it looked like a big white card floating over the road).
  const PLATE_W = 0.4;
  const PLATE_H = 0.13;
  const rearPlateY = shape.floor + 0.17;
  const rearPlateZ = shell.surfaceZAt(0, rearPlateY, false) - 0.004;
  const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_W, PLATE_H), plateMat);
  rearPlate.position.set(0, rearPlateY, rearPlateZ);
  rearPlate.rotation.y = Math.PI;
  const rearFrame = new THREE.Mesh(roundedSlab(PLATE_W + 0.03, PLATE_H + 0.03, 0.012, 0.012, 6), frameMat);
  rearFrame.position.set(0, rearPlateY, rearPlateZ + 0.006);
  chassisGroup.add(rearFrame, rearPlate);

  const frontPlateY = shape.floor + 0.16;
  const frontPlateZ = shell.surfaceZAt(0, frontPlateY, true) + 0.004;
  const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_W, PLATE_H), plateMat);
  frontPlate.position.set(0, frontPlateY, frontPlateZ);
  chassisGroup.add(frontPlate);

  // ---- Rear sticker (kept: "Família Feliz" is part of the game's identity) -
  const stickerTex = createRearStickerTexture(tune.stickerId);
  if (stickerTex && shape.cabin) {
    const stickerPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.112),
      new THREE.MeshPhysicalMaterial({
        map: stickerTex,
        transparent: true,
        roughness: 0.35,
        clearcoat: 0.8,
      })
    );
    stickerPlane.position.set(0, beltY + 0.13, cabinRearZ + 0.02);
    stickerPlane.rotation.y = Math.PI;
    stickerPlane.rotation.x = 0.28;
    chassisGroup.add(stickerPlane);
  }

  // ---- Uno roof ladder (signature easter egg) ----------------------------
  if (tune.unoRoofLadder && shape.cabin) {
    const ladder = new THREE.Group();
    const railGeo = new THREE.CylinderGeometry(0.014, 0.014, shape.length * 0.44, 8);
    railGeo.rotateX(Math.PI / 2);
    const railL = new THREE.Mesh(railGeo, new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.9, roughness: 0.3 }));
    railL.position.x = -0.26;
    const railR = railL.clone();
    railR.position.x = 0.26;
    ladder.add(railL, railR);
    for (let r = -4; r <= 4; r++) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.52, 8), railL.material);
      rung.rotation.z = Math.PI / 2;
      rung.position.z = r * 0.16;
      ladder.add(rung);
    }
    ladder.position.set(0, shape.cabin.roofY + 0.03, -0.05);
    chassisGroup.add(ladder);
  }

  // ---- Subwoofer "paredão" -----------------------------------------------
  if (tune.subwooferLevel !== 'stock') {
    const subGroup = new THREE.Group();
    const box = new THREE.Mesh(roundedSlab(shape.width * 0.6, 0.36, 0.4, 0.03, 6), carbonMat);
    box.position.set(0, shape.floor + 0.24, -shape.length * 0.3);
    subGroup.add(box);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.55, metalness: 0.2 });
    const surroundMat = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.6 });
    for (const dx of [-0.2, 0.2]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.06, 24, 1, true), coneMat);
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(dx, shape.floor + 0.24, -shape.length * 0.3 - 0.2);
      const surround = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.018, 8, 26), surroundMat);
      surround.position.copy(cone.position);
      surround.rotation.x = 0;
      subGroup.add(cone, surround);
    }
    chassisGroup.add(subGroup);
  }

  // ---- Underglow ---------------------------------------------------------
  if (tune.underglowEnabled) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(shape.width * 1.15, shape.length * 0.9),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(tune.underglowColor),
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.y = -shape.floor + 0.008;
    chassisGroup.add(glow);
  }

  // ---- Exhaust flames (gradient-mapped, not solid cones) -----------------
  const flameTex = flameGradientTexture(tune.afrMixture === 'lean_blue');
  const flameMat = new THREE.MeshBasicMaterial({
    map: flameTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const flameGeo = new THREE.ConeGeometry(0.075, 0.7, 12, 1, true);
  flameGeo.rotateX(-Math.PI / 2);
  const flameLeft = new THREE.Mesh(flameGeo, flameMat);
  flameLeft.position.set(-0.1, shape.floor + 0.07, -shape.length * 0.5 - 0.36);
  flameLeft.visible = false;
  const flameRight = flameLeft.clone();
  flameRight.position.x = 0.1;
  chassisGroup.add(flameLeft, flameRight);

  // ---- CFD streamlines ---------------------------------------------------
  const cfdGroup = new THREE.Group();
  cfdGroup.visible = false;
  for (let lane = -3; lane <= 3; lane++) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 26; s++) {
      const t = s / 26;
      const z = (0.5 - t) * (shape.length * 1.9);
      const overBody = Math.abs(z) < shape.length * 0.52;
      const lift = overBody
        ? Math.sin(((z + shape.length * 0.52) / (shape.length * 1.04)) * Math.PI) * (0.5 + tune.frontWingDeg * 0.008)
        : 0;
      const wake = z < -shape.length * 0.5 ? (-z - shape.length * 0.5) * (tune.rearWingDeg * 0.02) : 0;
      pts.push(new THREE.Vector3(lane * (shape.width * 0.22), shape.shoulderY * 0.5 + lift + wake, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    cfdGroup.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 36, 0.012, 6, false),
        new THREE.MeshBasicMaterial({
          color: Math.abs(lane) <= 1 ? 0x00f5d4 : 0x3a86ff,
          transparent: true,
          opacity: 0.7,
        })
      )
    );
  }
  root.add(cfdGroup);

  // ---- Re-Volt shield ----------------------------------------------------
  const shieldBubbleMesh = new THREE.Mesh(
    new THREE.SphereGeometry(shape.length * 0.6, 28, 20),
    new THREE.MeshPhysicalMaterial({
      color: 0x00bbf9,
      transparent: true,
      opacity: 0.16,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.6,
      iridescence: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  shieldBubbleMesh.position.y = shape.shoulderY * 0.8;
  shieldBubbleMesh.visible = false;
  root.add(shieldBubbleMesh);

  // ---- Runtime visuals ---------------------------------------------------
  const baseColorObj = new THREE.Color(tune.paintColor);
  const hotColorObj = new THREE.Color(tune.thermoHotColor);
  const initialPaintColor = new THREE.Color(0xffffff);
  void initialPaintColor;

  return {
    root,
    chassisGroup,
    bodyPaintMat: mats.paint,
    wheels,
    frontWheelPivots,
    brakeGlowMats,
    doorLeftPivot,
    doorRightPivot,
    hoodPivot,
    trunkPivot,
    steeringWheelMesh,
    pineTreePivot,
    rcAntennaPivot,
    flameLeft,
    flameRight,
    headlightCones,
    cfdGroup,
    shieldBubbleMesh,
    isGullwing,
    bodyShape: shape,
    wheelRadiusM: wheelRadius,
    updateRealtimeVisuals(state) {
      for (const w of wheels) w.rotation.x = state.wheelSpinRad;
      for (const fp of frontWheelPivots) fp.rotation.y = state.steering * 0.42;

      // ---- Suspension travel --------------------------------------------
      //
      // The wheels used to be bolted to the body, so the car leaned as one rigid
      // block and the tyres stayed perfectly perpendicular to it — the single
      // clearest "this is a toy" cue when cornering. Real corners have body roll
      // *and* the outside wheels compressing while the inside ones extend.
      //
      // Each wheel carrier gets a vertical offset from the body attitude. It is
      // the same roll/pitch decomposition the body uses, evaluated at that
      // wheel's position, so it is automatically consistent with what the shell
      // is doing.
      const rollTravel = Math.sin(state.rollRad);
      const pitchTravel = Math.sin(state.pitchRad);
      for (let i = 0; i < wheelMounts.length; i++) {
        const mount = wheelMounts[i];
        const target = -mount.x * rollTravel - mount.z * pitchTravel * 0.35;
        mount.pivot.position.y = mount.baseY + THREE.MathUtils.clamp(target, -0.07, 0.07);
        // Camber gain: a real double-wishbone or strut gains a few tenths of a
        // degree of negative camber as it compresses. It is small, but it is why
        // the outside front wheel looks planted in a photograph of a cornering
        // car rather than standing upright while the body leans over it.
        const side = Math.sign(mount.x) || 1;
        const compression = THREE.MathUtils.clamp(-target, -0.07, 0.07);
        mount.pivot.rotation.z = mount.camberRad - side * (compression * 0.55);
      }
      steeringWheelMesh.rotation.z = -state.steering * 1.9;

      const subShake =
        tune.subwooferLevel === 'paredao_treme_tudo'
          ? Math.sin(performance.now() * 0.065) * state.bassEnergy * 0.01
          : 0;

      // ---- Body attitude -------------------------------------------------
      //
      // BUG FIXED HERE: `chassisGroup.rotation.z` is a *roll*, but rotating the
      // group about its own origin (y = 0, the ground line) makes the whole body
      // pivot about the road surface. Every degree of roll therefore translated
      // the body sideways by ~ half its height, which is why the car looked like
      // it was sliding rather than leaning in corners, and why the inner side
      // sometimes clipped into the asphalt.
      //
      // The attitude is now applied about a real roll centre: rotate the group
      // about the origin, then translate it back so that the point at
      // (0, ROLL_CENTRE_Y, 0) stays fixed. That is the definition of a rotation
      // about an axis, and it is two lines of algebra.
      chassisGroup.rotation.x = state.pitchRad;
      chassisGroup.rotation.z = state.rollRad;
      chassisGroup.rotation.y = 0;
      // Rotating by roll about the origin moves the roll-centre point from
      // (0, py, 0) to (py*sinR, py*cosR, 0). Translating by the difference puts
      // that point back where it belongs, so the body leans about the roll axis
      // instead of sliding sideways.
      const roll = state.rollRad;
      const pitch = state.pitchRad;
      const axisY = ROLL_CENTRE_Y;
      const movedX = -axisY * Math.sin(roll);
      const movedY = axisY * Math.cos(roll) * Math.cos(pitch);
      chassisGroup.position.set(-movedX, axisY - movedY, 0);
      void subShake;

      if (pineTreePivot) {
        pineTreePivot.rotation.z = THREE.MathUtils.lerp(
          pineTreePivot.rotation.z,
          -state.rollRad * 5.5 + state.steering * 0.45,
          0.14
        );
        pineTreePivot.rotation.x = THREE.MathUtils.lerp(pineTreePivot.rotation.x, -state.pitchRad * 6.0, 0.14);
      }
      if (rcAntennaPivot) {
        rcAntennaPivot.rotation.x =
          -Math.min(0.6, state.speedKmh * 0.0035) + Math.sin(performance.now() * 0.02) * 0.06;
        rcAntennaPivot.rotation.z = state.steering * 0.3;
      }

      const glowFactor = THREE.MathUtils.clamp((state.brakeTempC - 260) / 580, 0, 1.8);
      for (const bm of brakeGlowMats) bm.emissiveIntensity = glowFactor;
      // The emissive colour has to be set or intensity has nothing to multiply.
      if (glowFactor > 0.001) {
        discMat.emissive.setHex(0xff3b00);
      } else {
        discMat.emissive.setHex(0x000000);
      }

      if (tune.paintFinish === 'thermochromic') {
        const heatT = THREE.MathUtils.clamp((state.engineTempC - 82) / 38, 0, 1);
        const mixed = baseColorObj.clone().lerp(hotColorObj, heatT);
        mats.paint.color.copy(mixed);
      }
      if (state.damage.paintCorrosion > 0.01) {
        mats.paint.roughness = Math.min(0.92, 0.16 + state.damage.paintCorrosion * 0.7);
        mats.paint.clearcoat = Math.max(0.05, 1 - state.damage.paintCorrosion);
      }

      const frontCrush = (state.damage.panelDeform.frontLeft + state.damage.panelDeform.frontRight) * 0.5;
      const sideSkew = state.damage.panelDeform.sideLeft - state.damage.panelDeform.sideRight;
      chassisGroup.scale.set(
        1 - Math.abs(sideSkew) * 0.06,
        1 + frontCrush * 0.03,
        1 - frontCrush * 0.08
      );

      const showFlames = state.backfireActive || state.nitroActive;
      flameLeft.visible = showFlames;
      flameRight.visible = showFlames;
      if (showFlames) {
        const fScale = state.nitroActive ? 1.5 + Math.random() * 0.4 : 0.7 + Math.random() * 0.5;
        flameLeft.scale.set(1, 1, fScale);
        flameRight.scale.set(1, 1, fScale);
      }

      const targetDoor = state.doorsOpen ? 1.0 : 0;
      if (isGullwing) {
        doorLeftPivot.rotation.z = THREE.MathUtils.lerp(doorLeftPivot.rotation.z, -targetDoor, 0.12);
        doorRightPivot.rotation.z = THREE.MathUtils.lerp(doorRightPivot.rotation.z, targetDoor, 0.12);
      } else {
        doorLeftPivot.rotation.y = THREE.MathUtils.lerp(doorLeftPivot.rotation.y, -targetDoor, 0.12);
        doorRightPivot.rotation.y = THREE.MathUtils.lerp(doorRightPivot.rotation.y, targetDoor, 0.12);
      }
      hoodPivot.rotation.x = THREE.MathUtils.lerp(hoodPivot.rotation.x, state.hoodOpen ? -0.8 : 0, 0.12);
      trunkPivot.rotation.x = THREE.MathUtils.lerp(trunkPivot.rotation.x, state.trunkOpen ? 0.8 : 0, 0.12);

      for (const c of headlightCones) c.visible = state.headlightsOn;
      cfdGroup.visible = state.cfdVisible;
      shieldBubbleMesh.visible = state.shieldActive;
      if (state.shieldActive) shieldBubbleMesh.rotation.y += state.dt * 1.4;
    },
  };
}

// ---------------------------------------------------------------------------
// Extra texture: door number roundel
// ---------------------------------------------------------------------------

function createNumberRoundelTexture(tune: CarTuneSetup): THREE.CanvasTexture | null {
  const num = tune.racingNumber.trim();
  if (!num) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 208;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 208);
  ctx.fillStyle = 'rgba(250,250,250,0.95)';
  ctx.beginPath();
  ctx.ellipse(128, 104, 118, 96, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#11151b';
  ctx.font = 'bold 132px "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num.slice(0, 3), 128, 110);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Exposed so tests can assert the shell really is a loft, not boxes. */
export function describeCarSurface(car: CarSpec, tune: CarTuneSetup): {
  triangles: number;
  stations: number;
  hasGlassGroups: boolean;
  materialSlots: number;
} {
  const rig = buildCarMesh(car, tune);
  let triangles = 0;
  let slots = 0;
  const stations = rig.bodyShape.stations;
  rig.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const idx = mesh.geometry.getIndex();
    if (idx) triangles += idx.count / 3;
    slots += mesh.geometry.groups.length;
  });
  return {
    triangles,
    stations,
    hasGlassGroups: slots > MATERIAL_SLOT.GLASS,
    materialSlots: slots,
  };
}

/** Kept for compatibility with older gallery code paths. */
export const STUDIO_ENV_TEXTURE = studioStripTexture;
