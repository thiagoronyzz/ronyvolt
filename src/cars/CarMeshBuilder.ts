import * as THREE from 'three';
import { CarSpec, CarTuneSetup, DamageState } from '../types/game';
import { STICKER_LIBRARY, WHEEL_CATALOG } from '../data/carCatalog';

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

function createLiveryCanvasTexture(car: CarSpec, tune: CarTuneSetup): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = tune.paintColor;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle metallic micro-flake noise
  if (tune.paintFinish === 'metallic' || tune.paintFinish === 'matte_glitter') {
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
  }

  // Stripes
  ctx.fillStyle = tune.secondaryColor;
  if (tune.liveryStripe === 'twin_racing') {
    ctx.fillRect(205, 0, 38, 512);
    ctx.fillRect(269, 0, 38, 512);
  } else if (tune.liveryStripe === 'offset_gt') {
    ctx.fillRect(130, 0, 56, 512);
    ctx.fillStyle = '#ffbe0b';
    ctx.fillRect(194, 0, 14, 512);
  } else if (tune.liveryStripe === 'cyber_grid') {
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 4;
    for (let y = 0; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
  } else if (tune.liveryStripe === 'sponsor_pro') {
    ctx.fillRect(0, 210, 512, 92);
  }

  // Racing number roundel
  if (tune.racingNumber.trim().length > 0 && tune.liveryStripe !== 'none') {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(256, 256, 66, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0e14';
    ctx.font = 'bold 68px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tune.racingNumber.slice(0, 3), 256, 260);
  }

  void car;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLicensePlateTexture(tune: CarTuneSetup): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 84;
  const ctx = canvas.getContext('2d')!;

  if (tune.plateRegion === 'BR_MERCOSUL') {
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, 256, 84);
    ctx.fillStyle = '#003399';
    ctx.fillRect(0, 0, 256, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BRASIL', 128, 16);
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 40px monospace';
    ctx.fillText((tune.plateText || 'UNO2E05').toUpperCase().slice(0, 7), 128, 66);
  } else if (tune.plateRegion === 'JP_TOKYO') {
    ctx.fillStyle = '#f4f7f0';
    ctx.fillRect(0, 0, 256, 84);
    ctx.fillStyle = '#1b4332';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('品川 300', 128, 26);
    ctx.font = 'bold 36px monospace';
    ctx.fillText((tune.plateText || '86-99').toUpperCase().slice(0, 7), 128, 68);
  } else if (tune.plateRegion === 'GALACTIC') {
    ctx.fillStyle = '#10002b';
    ctx.fillRect(0, 0, 256, 84);
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 5;
    ctx.strokeRect(2, 2, 252, 80);
    ctx.fillStyle = '#00f5d4';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText((tune.plateText || 'X-2099').toUpperCase().slice(0, 7), 128, 56);
  } else {
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(0, 0, 256, 84);
    ctx.fillStyle = '#003399';
    ctx.fillRect(0, 0, 32, 84);
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.fillText((tune.plateText || 'VEL2026').toUpperCase().slice(0, 7), 140, 56);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRearStickerTexture(stickerId: string): THREE.CanvasTexture | null {
  if (!stickerId || stickerId === 'none') return null;
  const sticker = STICKER_LIBRARY.find((s) => s.id === stickerId);
  if (!sticker) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 96);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(8, 12, 240, 72);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 12, 240, 72);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(sticker.badge, 128, 44);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(sticker.label.split('(')[0].trim().slice(0, 24), 128, 72);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCarMesh(car: CarSpec, tune: CarTuneSetup): BuiltCarRig {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  const isRC = car.category === 'rc_revolt';
  const scaleFactor = isRC ? 0.72 : 1.0;
  root.scale.setScalar(scaleFactor);

  // PBR Automotive Clearcoat / Iridescent / Matte Paint Material
  const liveryTex = createLiveryCanvasTexture(car, tune);
  const bodyPaintMat = new THREE.MeshPhysicalMaterial({
    map: liveryTex,
    color: new THREE.Color('#ffffff'),
    metalness: tune.paintFinish === 'metallic' || tune.paintFinish === 'chameleon' ? 0.78 : 0.32,
    roughness: tune.paintFinish === 'matte_glitter' ? 0.62 : 0.14,
    clearcoat: tune.paintFinish === 'matte_glitter' ? 0.15 : 1.0,
    clearcoatRoughness: 0.06,
    iridescence: tune.paintFinish === 'chameleon' || tune.paintFinish === 'pearlescent' ? 1.0 : 0.0,
    iridescenceIOR: 1.45,
    emissive: tune.paintFinish === 'glow_dark' ? new THREE.Color(tune.paintColor) : new THREE.Color('#000000'),
    emissiveIntensity: tune.paintFinish === 'glow_dark' ? 0.35 : 0.0,
  });

  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.38, metalness: 0.45 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.12, metalness: 0.94 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    transparent: true,
    opacity: 0.56,
    roughness: 0.05,
    metalness: 0.1,
    transmission: 0.4,
  });
  const interiorLeatherMat = new THREE.MeshStandardMaterial({
    color: car.id === 'fiat-uno-2005-raiz' ? 0x3b3f46 : 0x1c1917,
    roughness: 0.78,
  });

  const rideOffsetM = (tune.rideHeightMm / 1000) * 0.8;
  chassisGroup.position.y = 0.42 + rideOffsetM;

  // Dimensions by archetype
  const arch = car.archetype;
  const isF1 = arch === 'f1_openwheel';
  const isGullwing = arch === 'gullwing_coupe' || arch === 'hypercar_aero' || arch === 'futuristic_concept';
  const width =
    arch === 'battle_tank'
      ? 2.5
      : arch === 'shopping_cart'
      ? 1.15
      : tune.bodykit !== 'stock'
      ? 2.08
      : 1.92;
  const length =
    arch === 'jet_bus'
      ? 5.8
      : arch === 'rocket_streamliner'
      ? 5.4
      : arch === 'boxy_hatch_uno' || arch === 'classic_beetle' || arch === 'shopping_cart'
      ? 3.75
      : 4.55;

  // --- SPECIALTY & STANDARD BODY BUILDERS ---
  if (arch === 'shopping_cart') {
    // Wire-frame chrome shopping cart + giant V8 engine inside!
    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.85, 1.85),
      new THREE.MeshStandardMaterial({ color: 0xd8dee9, metalness: 0.9, roughness: 0.2, wireframe: true })
    );
    basket.position.set(0, 0.52, 0);
    chassisGroup.add(basket);
    const redHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.15, 12), new THREE.MeshStandardMaterial({ color: 0xe63946 }));
    redHandle.rotation.z = Math.PI / 2;
    redHandle.position.set(0, 0.98, -0.95);
    chassisGroup.add(redHandle);
    const v8Block = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.8), chromeMat);
    v8Block.position.set(0, 0.45, 0.25);
    chassisGroup.add(v8Block);
  } else if (arch === 'v8_sofa') {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 1.5), bodyPaintMat);
    seatBase.position.set(0, 0.22, -0.1);
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.85, 0.38), bodyPaintMat);
    backrest.position.set(0, 0.62, -0.72);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 1.5), bodyPaintMat);
    armL.position.set(-0.95, 0.45, -0.1);
    const armR = armL.clone();
    armR.position.x = 0.95;
    const blower = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.75), chromeMat);
    blower.position.set(0, 0.55, 0.75);
    chassisGroup.add(seatBase, backrest, armL, armR, blower);
  } else if (arch === 'turbo_fridge') {
    const fridgeBody = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.85, 1.65), bodyPaintMat);
    fridgeBody.position.set(0, 0.85, 0);
    fridgeBody.rotation.x = 0.18;
    const handle1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.65, 0.08), chromeMat);
    handle1.position.set(0.55, 1.0, 0.86);
    chassisGroup.add(fridgeBody, handle1);
  } else if (arch === 'racing_bed') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.32, 2.8), carbonMat);
    frame.position.set(0, 0.18, 0);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.28, 2.6), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
    mattress.position.set(0, 0.42, 0);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.3, 1.8), bodyPaintMat);
    blanket.position.set(0, 0.45, 0.35);
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.95, 0.18), carbonMat);
    headboard.position.set(0, 0.68, -1.35);
    chassisGroup.add(frame, mattress, blanket, headboard);
  } else if (arch === 'battle_tank') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.68, 4.6), bodyPaintMat);
    hull.position.set(0, 0.38, 0);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.48, 8), bodyPaintMat);
    turret.position.set(0, 0.9, -0.2);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.8, 12), carbonMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.92, 1.5);
    chassisGroup.add(hull, turret, barrel);
  } else if (arch === 'jet_bus' || arch === 'ice_cream_truck') {
    const boxVan = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.55, arch === 'jet_bus' ? 5.6 : 4.2), bodyPaintMat);
    boxVan.position.set(0, 0.82, 0);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.62, 0.1), glassMat);
    windshield.position.set(0, 1.12, (arch === 'jet_bus' ? 2.81 : 2.11));
    chassisGroup.add(boxVan, windshield);
    if (arch === 'jet_bus') {
      const jetNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.62, 1.4, 16), chromeMat);
      jetNozzle.rotation.x = Math.PI / 2;
      jetNozzle.position.set(0, 0.72, -3.1);
      chassisGroup.add(jetNozzle);
    } else {
      // Giant ice cream cone on roof!
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.95, 14), new THREE.MeshStandardMaterial({ color: 0xd4a373 }));
      cone.position.set(0, 2.0, 0.2);
      cone.rotation.x = -0.4;
      const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffafcc }));
      scoop.position.set(0, 2.38, 0.36);
      chassisGroup.add(cone, scoop);
    }
  } else if (isF1) {
    // Open-wheel Formula silhouette
    const monocoque = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.44, 3.8), bodyPaintMat);
    monocoque.position.set(0, 0.26, 0.2);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.35, 4), bodyPaintMat);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.z = Math.PI / 4;
    nose.position.set(0, 0.18, 2.4);
    const sidepods = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.38, 1.85), bodyPaintMat);
    sidepods.position.set(0, 0.24, -0.15);
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.06, 0.42), carbonMat);
    frontWing.position.set(0, 0.06, 2.75);
    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.38), bodyPaintMat);
    rearWing.position.set(0, 0.78, -2.05);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 18, Math.PI), carbonMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 0.56, 0.35);
    chassisGroup.add(monocoque, nose, sidepods, frontWing, rearWing, halo);
  } else {
    // Sculpted Multi-Segment Production / Supercar / Hatch / Classic Chassis
    const lowerHeight = arch === 'hypercar_aero' || arch === 'futuristic_concept' || arch === 'wedge_supercar' ? 0.38 : 0.48;
    const cabinHeight =
      arch === 'boxy_hatch_uno' || arch === 'rally_hatch'
        ? 0.56
        : arch === 'classic_1900_open' || arch === 'classic_roadster'
        ? 0.22
        : 0.42;

    const mainLower = new THREE.Mesh(new THREE.BoxGeometry(width, lowerHeight, length), bodyPaintMat);
    mainLower.position.set(0, lowerHeight * 0.5 + 0.06, 0);
    mainLower.castShadow = true;
    mainLower.receiveShadow = true;
    chassisGroup.add(mainLower);

    // Sculpted sloped nose
    const noseSlope = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.96, lowerHeight * 0.72, length * 0.26),
      bodyPaintMat
    );
    noseSlope.position.set(0, lowerHeight * 0.38 + 0.05, length * 0.42);
    noseSlope.rotation.x = 0.16;
    chassisGroup.add(noseSlope);

    // Widebody Fender Flares
    if (tune.bodykit !== 'stock') {
      const flareGeo = new THREE.BoxGeometry(width + 0.18, 0.26, 0.92);
      const flareFront = new THREE.Mesh(flareGeo, tune.bodykit === 'mansory_carbon' ? carbonMat : bodyPaintMat);
      flareFront.position.set(0, 0.24, length * 0.29);
      const flareRear = flareFront.clone();
      flareRear.position.z = -length * 0.29;
      chassisGroup.add(flareFront, flareRear);
    }

    // Cabin Greenhouse & Glass
    if (arch !== 'classic_1900_open') {
      const cabinLen = arch === 'boxy_hatch_uno' || arch === 'rally_hatch' ? length * 0.58 : length * 0.44;
      const cabinZ = arch === 'boxy_hatch_uno' ? -0.22 : -0.08;
      const roofMesh = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.82, cabinHeight, cabinLen),
        glassMat
      );
      roofMesh.position.set(0, lowerHeight + cabinHeight * 0.5 + 0.02, cabinZ);
      chassisGroup.add(roofMesh);

      const roofCap = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.8, 0.06, cabinLen * 0.78),
        tune.bodykit === 'mansory_carbon' ? carbonMat : bodyPaintMat
      );
      roofCap.position.set(0, lowerHeight + cabinHeight + 0.03, cabinZ - 0.05);
      chassisGroup.add(roofCap);

      // FIAT UNO ROOF LADDER ("Escada da Firma no Teto")!
      if (tune.unoRoofLadder || car.id === 'fiat-uno-2005-raiz' && tune.stickerId === 'escada_firma') {
        const ladderGroup = new THREE.Group();
        const railGeo = new THREE.BoxGeometry(0.05, 0.06, length * 0.92);
        const railL = new THREE.Mesh(railGeo, chromeMat);
        railL.position.x = -0.32;
        const railR = railL.clone();
        railR.position.x = 0.32;
        ladderGroup.add(railL, railR);
        for (let r = -5; r <= 5; r++) {
          const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.64, 8), chromeMat);
          rung.rotation.z = Math.PI / 2;
          rung.position.z = r * 0.28;
          ladderGroup.add(rung);
        }
        ladderGroup.position.set(0, lowerHeight + cabinHeight + 0.14, -0.05);
        chassisGroup.add(ladderGroup);
      }

      // Rear Window Sticker ("Família Feliz", "Caveira", etc.)
      const stickerTex = createRearStickerTexture(tune.stickerId);
      if (stickerTex) {
        const stickerPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.72, 0.26),
          new THREE.MeshBasicMaterial({ map: stickerTex, transparent: true })
        );
        stickerPlane.position.set(0, lowerHeight + cabinHeight * 0.55, cabinZ - cabinLen * 0.51);
        stickerPlane.rotation.y = Math.PI;
        chassisGroup.add(stickerPlane);
      }
    }
  }

  // --- MODELED INTERIOR COCKPIT (Seats, Cracked/Sport Dash, Steering Wheel, Pine Air Freshener!) ---
  const cockpitGroup = new THREE.Group();
  cockpitGroup.position.set(0, 0.38, 0.05);
  chassisGroup.add(cockpitGroup);

  const seatLeft = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.45), interiorLeatherMat);
  seatLeft.position.set(-0.38, 0.14, -0.18);
  const seatRight = seatLeft.clone();
  seatRight.position.x = 0.38;
  const dashMesh = new THREE.Mesh(new THREE.BoxGeometry(width * 0.76, 0.24, 0.36), interiorLeatherMat);
  dashMesh.position.set(0, 0.26, 0.52);
  cockpitGroup.add(seatLeft, seatRight, dashMesh);

  // Digital/Analog Glowing Gauge Cluster
  const clusterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x00f5d4 })
  );
  clusterMesh.position.set(-0.36, 0.32, 0.33);
  clusterMesh.rotation.y = Math.PI;
  cockpitGroup.add(clusterMesh);

  const steeringWheelMesh = new THREE.Group();
  steeringWheelMesh.position.set(-0.36, 0.3, 0.22);
  const wheelTorus = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.022, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 })
  );
  const topMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 0.04, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xff2a54 })
  );
  topMarker.position.y = 0.15;
  steeringWheelMesh.add(wheelTorus, topMarker);
  cockpitGroup.add(steeringWheelMesh);

  // Cheirinho de Pinho (Swinging Pine Tree Air Freshener!)
  let pineTreePivot: THREE.Group | null = null;
  if (tune.pineAirFreshener) {
    pineTreePivot = new THREE.Group();
    pineTreePivot.position.set(0, 0.58, 0.42);
    const pineCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.16, 4),
      new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.7 })
    );
    pineCone.position.y = -0.09;
    pineTreePivot.add(pineCone);
    cockpitGroup.add(pineTreePivot);
  }

  // RC Flexible Whip Antenna (Re-Volt Homage!)
  let rcAntennaPivot: THREE.Group | null = null;
  if (isRC) {
    rcAntennaPivot = new THREE.Group();
    rcAntennaPivot.position.set(-0.35, 0.52, -0.85);
    const whip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.016, 1.55, 6),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    whip.position.y = 0.77;
    const flagTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffbe0b })
    );
    flagTip.position.y = 1.55;
    rcAntennaPivot.add(whip, flagTip);
    chassisGroup.add(rcAntennaPivot);
  }

  // --- INTERACTIVE DOORS, HOOD (WITH 3D ENGINE!) & TRUNK (WITH PAREDÃO SUBWOOFER!) ---
  const doorLeftPivot = new THREE.Group();
  doorLeftPivot.position.set(-width * 0.5, isGullwing ? 0.85 : 0.35, 0.35);
  const doorPanelL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 1.05), bodyPaintMat);
  doorPanelL.position.set(0, isGullwing ? -0.35 : 0, -0.45);
  doorLeftPivot.add(doorPanelL);

  const doorRightPivot = new THREE.Group();
  doorRightPivot.position.set(width * 0.5, isGullwing ? 0.85 : 0.35, 0.35);
  const doorPanelR = doorPanelL.clone();
  doorRightPivot.add(doorPanelR);
  chassisGroup.add(doorLeftPivot, doorRightPivot);

  // Engine Bay + Opening Hood
  const engineBlockMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.36, 0.68),
    tune.engineSwap === 'nuclear_turbine' || car.engineType === 'nuclear_turbine'
      ? new THREE.MeshStandardMaterial({ color: 0x00f5d4, emissive: 0x00bbf9, emissiveIntensity: 0.9 })
      : chromeMat
  );
  engineBlockMesh.position.set(0, 0.34, length * 0.28);
  chassisGroup.add(engineBlockMesh);

  const hoodPivot = new THREE.Group();
  hoodPivot.position.set(0, 0.54, length * 0.12);
  const hoodMesh = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 0.05, length * 0.28), bodyPaintMat);
  hoodMesh.position.set(0, 0.02, length * 0.15);
  hoodPivot.add(hoodMesh);
  chassisGroup.add(hoodPivot);

  // Trunk + Paredão de Som Subwoofer
  const trunkPivot = new THREE.Group();
  trunkPivot.position.set(0, 0.56, -length * 0.24);
  const trunkLid = new THREE.Mesh(new THREE.BoxGeometry(width * 0.84, 0.05, length * 0.22), bodyPaintMat);
  trunkLid.position.set(0, 0, -length * 0.11);
  trunkPivot.add(trunkLid);
  chassisGroup.add(trunkPivot);

  if (tune.subwooferLevel !== 'stock') {
    const subBox = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.42, 0.45), carbonMat);
    subBox.position.set(0, 0.38, -length * 0.34);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff0054, emissive: 0x550018 });
    const wooferL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.1, 16), coneMat);
    wooferL.rotation.x = Math.PI / 2;
    wooferL.position.set(-0.26, 0.4, -length * 0.34 - 0.22);
    const wooferR = wooferL.clone();
    wooferR.position.x = 0.26;
    chassisGroup.add(subBox, wooferL, wooferR);
  }

  // Aero Wing & Splitter (Angle adjusts visually with tune.rearWingDeg!)
  if (tune.rearWingDeg > 2 || tune.bodykit === 'time_attack_aero' || car.aeroCl > 1.5) {
    const wingBlade = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.02, 0.05, 0.34),
      carbonMat
    );
    wingBlade.position.set(0, 0.82, -length * 0.46);
    wingBlade.rotation.x = THREE.MathUtils.degToRad(tune.rearWingDeg);
    const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.18), carbonMat);
    strutL.position.set(-width * 0.32, 0.64, -length * 0.45);
    const strutR = strutL.clone();
    strutR.position.x = width * 0.32;
    chassisGroup.add(wingBlade, strutL, strutR);
  }

  if (tune.frontWingDeg > 2 || tune.bodykit !== 'stock') {
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(width * 1.03, 0.04, 0.32), carbonMat);
    splitter.position.set(0, 0.08, length * 0.49);
    chassisGroup.add(splitter);
  }

  // Headlights, Taillights & Volumetric Cones
  const hlColor =
    tune.headlightType === 'halogen_warm'
      ? 0xffe599
      : tune.headlightType === 'yellow_gt'
      ? 0xffd000
      : 0xdff6ff;
  const hlMat = new THREE.MeshBasicMaterial({ color: hlColor });
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });

  const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.06), hlMat);
  hlL.position.set(-width * 0.34, 0.32, length * 0.502);
  const hlR = hlL.clone();
  hlR.position.x = width * 0.34;

  const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tlMat);
  tlL.position.set(-width * 0.33, 0.35, -length * 0.502);
  const tlR = tlL.clone();
  tlR.position.x = width * 0.33;
  chassisGroup.add(hlL, hlR, tlL, tlR);

  const coneGeo = new THREE.ConeGeometry(1.4, 9.5, 16, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: hlColor,
    transparent: true,
    opacity: 0.11,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const coneL = new THREE.Mesh(coneGeo, coneMat);
  coneL.rotation.x = -Math.PI / 2;
  coneL.position.set(-width * 0.34, 0.24, length * 0.5 + 4.8);
  const coneR = coneL.clone();
  coneR.position.x = width * 0.34;
  chassisGroup.add(coneL, coneR);

  // License Plate (Rear & Front)
  const plateTex = createLicensePlateTexture(tune);
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
  const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.17), plateMat);
  rearPlate.position.set(0, 0.22, -length * 0.505);
  rearPlate.rotation.y = Math.PI;
  chassisGroup.add(rearPlate);

  // Underglow Neon
  if (tune.underglowEnabled) {
    const glowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 1.05, length * 0.88),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(tune.underglowColor),
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    glowPlane.rotation.x = Math.PI / 2;
    glowPlane.position.y = -0.34;
    chassisGroup.add(glowPlane);
  }

  // AFR-Colored Exhaust Flames (Rich = Orange/Yellow, Lean/Nitro = Blue Plasma!)
  const flameColor = tune.afrMixture === 'lean_blue' ? 0x00bbf9 : 0xff6d00;
  const flameMat = new THREE.MeshBasicMaterial({
    color: flameColor,
    transparent: true,
    opacity: 0.9,
  });
  const flameGeo = new THREE.ConeGeometry(0.11, 0.85, 8);
  flameGeo.rotateX(-Math.PI / 2);
  const flameLeft = new THREE.Mesh(flameGeo, flameMat);
  flameLeft.position.set(-0.42, 0.16, -length * 0.5 - 0.38);
  flameLeft.visible = false;
  const flameRight = flameLeft.clone();
  flameRight.position.x = 0.42;
  chassisGroup.add(flameLeft, flameRight);

  // --- 4 WHEELS, SPOKES FROM 500-WHEEL CATALOG, CAMBER, OFFSET & GLOWING BRAKE DISCS ---
  const wheelSpec = WHEEL_CATALOG[tune.wheelModelIndex % WHEEL_CATALOG.length];
  const rimRadius = 0.24 + ((tune.wheelSizeInch - 13) / 11) * 0.12;
  const tireRadius = arch === 'farm_tractor' ? 0.62 : Math.max(0.31, rimRadius + 0.08);
  const tireWidth = isF1 ? 0.38 : 0.29;
  const offsetM = tune.wheelOffsetMm / 1000;

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tune.wheelColor),
    metalness: 0.86,
    roughness: 0.18,
  });

  const wheels: THREE.Group[] = [];
  const frontWheelPivots: THREE.Group[] = [];
  const brakeGlowMats: THREE.MeshStandardMaterial[] = [];

  const wheelCoords: [number, number, boolean][] = [
    [-width * 0.5 - offsetM, length * 0.31, true],
    [width * 0.5 + offsetM, length * 0.31, true],
    [-width * 0.5 - offsetM, -length * 0.31, false],
    [width * 0.5 + offsetM, -length * 0.31, false],
  ];

  wheelCoords.forEach(([wx, wz, isFront], idx) => {
    const steerPivot = new THREE.Group();
    const r = arch === 'farm_tractor' && isFront ? 0.35 : tireRadius;
    steerPivot.position.set(wx, r, wz);

    // Apply Front/Rear Camber Angle!
    const camberDeg = isFront ? tune.camberFrontDeg : tune.camberRearDeg;
    steerPivot.rotation.z = THREE.MathUtils.degToRad(wx < 0 ? -camberDeg : camberDeg);

    // Glowing Brake Rotor inside wheel hub
    const brakeGlowMat = new THREE.MeshStandardMaterial({
      color: 0x555b66,
      metalness: 0.8,
      roughness: 0.35,
      emissive: new THREE.Color(0xff3300),
      emissiveIntensity: 0,
    });
    brakeGlowMats.push(brakeGlowMat);
    const brakeRotor = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.78, rimRadius * 0.78, 0.04, 18), brakeGlowMat);
    brakeRotor.rotation.z = Math.PI / 2;
    steerPivot.add(brakeRotor);

    const spinGroup = new THREE.Group();
    const tireMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tireWidth, 24), tireMat);
    tireMesh.rotation.z = Math.PI / 2;
    tireMesh.castShadow = true;
    spinGroup.add(tireMesh);

    const rimBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(rimRadius, rimRadius, tireWidth + 0.015, 20),
      rimMat
    );
    rimBarrel.rotation.z = Math.PI / 2;
    spinGroup.add(rimBarrel);

    if (!wheelSpec.aerodisc) {
      for (let s = 0; s < wheelSpec.spokes; s++) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(tireWidth + 0.024, rimRadius * 1.85, 0.028),
          rimMat
        );
        spoke.rotation.x = (s / wheelSpec.spokes) * Math.PI;
        spinGroup.add(spoke);
      }
    }

    steerPivot.add(spinGroup);
    root.add(steerPivot);
    wheels.push(spinGroup);
    if (isFront) frontWheelPivots.push(steerPivot);
    void idx;
  });

  // --- CFD WIND TUNNEL STREAMLINES ---
  const cfdGroup = new THREE.Group();
  cfdGroup.visible = false;
  for (let lane = -3; lane <= 3; lane++) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 24; s++) {
      const t = s / 24;
      const z = (0.5 - t) * (length * 1.85);
      const overCar = Math.abs(z) < length * 0.52;
      const archLift = overCar
        ? Math.sin(((z + length * 0.52) / (length * 1.04)) * Math.PI) * (0.95 + tune.frontWingDeg * 0.01)
        : 0;
      const wakeKick = z < -length * 0.5 ? (-z - length * 0.5) * (tune.rearWingDeg * 0.022) : 0;
      pts.push(new THREE.Vector3(lane * (width * 0.24), 0.35 + archLift + wakeKick, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.018, 6, false);
    const cfdMat = new THREE.MeshBasicMaterial({
      color: Math.abs(lane) <= 1 ? 0x00f5d4 : 0x3a86ff,
      transparent: true,
      opacity: 0.78,
    });
    cfdGroup.add(new THREE.Mesh(tubeGeo, cfdMat));
  }
  root.add(cfdGroup);

  // Re-Volt Shield Bubble Power-Up Mesh
  const shieldBubbleMesh = new THREE.Mesh(
    new THREE.SphereGeometry(length * 0.64, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0x00bbf9,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    })
  );
  shieldBubbleMesh.position.y = 0.7;
  shieldBubbleMesh.visible = false;
  root.add(shieldBubbleMesh);

  const baseColorObj = new THREE.Color(tune.paintColor);
  const hotColorObj = new THREE.Color(tune.thermoHotColor);

  return {
    root,
    chassisGroup,
    bodyPaintMat,
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
    headlightCones: [coneL, coneR],
    cfdGroup,
    shieldBubbleMesh,
    isGullwing,
    updateRealtimeVisuals(state) {
      // Wheel spin & steering
      for (const w of wheels) {
        w.rotation.x = state.wheelSpinRad;
      }
      for (const fp of frontWheelPivots) {
        fp.rotation.y = state.steering * 0.52;
      }
      steeringWheelMesh.rotation.z = -state.steering * 2.1;

      // Body pitch, roll & subwoofer Paredão shake!
      const subShake =
        tune.subwooferLevel === 'paredao_treme_tudo'
          ? Math.sin(performance.now() * 0.065) * state.bassEnergy * 0.032
          : 0;
      chassisGroup.rotation.x = state.pitchRad + subShake * 0.3;
      chassisGroup.rotation.z = state.rollRad;
      chassisGroup.position.y = 0.42 + rideOffsetM + Math.abs(subShake);

      // Swinging Cheirinho de Pinho & RC Antenna physics
      if (pineTreePivot) {
        pineTreePivot.rotation.z = THREE.MathUtils.lerp(pineTreePivot.rotation.z, -state.rollRad * 4.5 + state.steering * 0.4, 0.15);
        pineTreePivot.rotation.x = THREE.MathUtils.lerp(pineTreePivot.rotation.x, -state.pitchRad * 5.0, 0.15);
      }
      if (rcAntennaPivot) {
        rcAntennaPivot.rotation.x = -Math.min(0.65, state.speedKmh * 0.004) + Math.sin(performance.now() * 0.02) * 0.08;
        rcAntennaPivot.rotation.z = state.steering * 0.35;
      }

      // Brake disc incandescence above 280°C!
      const glowFactor = THREE.MathUtils.clamp((state.brakeTempC - 260) / 580, 0, 1.8);
      for (const bm of brakeGlowMats) {
        bm.emissiveIntensity = glowFactor;
      }

      // Thermochromic Paint (shifts color with engine mechanical heat!) & Acid Rain Corrosion
      if (tune.paintFinish === 'thermochromic') {
        const heatT = THREE.MathUtils.clamp((state.engineTempC - 82) / 38, 0, 1);
        const mixed = baseColorObj.clone().lerp(hotColorObj, heatT);
        bodyPaintMat.color.copy(mixed);
      }
      if (state.damage.paintCorrosion > 0.01) {
        bodyPaintMat.roughness = Math.min(0.92, 0.14 + state.damage.paintCorrosion * 0.75);
      }

      // FEA Visual Panel Deformation (compress/skew chassis subtly as damage accumulates)
      const frontCrush = (state.damage.panelDeform.frontLeft + state.damage.panelDeform.frontRight) * 0.5;
      const sideSkew = state.damage.panelDeform.sideLeft - state.damage.panelDeform.sideRight;
      chassisGroup.scale.set(
        1 - Math.abs(sideSkew) * 0.08,
        1 + frontCrush * 0.05,
        1 - frontCrush * 0.12
      );

      // Exhaust Backfire / Nitro Flames
      const showFlames = state.backfireActive || state.nitroActive;
      flameLeft.visible = showFlames;
      flameRight.visible = showFlames;
      if (showFlames) {
        const fScale = state.nitroActive ? 1.55 + Math.random() * 0.35 : 0.75 + Math.random() * 0.5;
        flameLeft.scale.set(1, 1, fScale);
        flameRight.scale.set(1, 1, fScale);
        (flameLeft.material as THREE.MeshBasicMaterial).color.setHex(
          state.nitroActive || tune.afrMixture === 'lean_blue' ? 0x00d4ff : 0xff7b00
        );
      }

      // Interactive Garage Doors, Hood & Trunk
      const targetDoor = state.doorsOpen ? 1.05 : 0;
      if (isGullwing) {
        doorLeftPivot.rotation.z = THREE.MathUtils.lerp(doorLeftPivot.rotation.z, -targetDoor, 0.12);
        doorRightPivot.rotation.z = THREE.MathUtils.lerp(doorRightPivot.rotation.z, targetDoor, 0.12);
      } else {
        doorLeftPivot.rotation.y = THREE.MathUtils.lerp(doorLeftPivot.rotation.y, -targetDoor, 0.12);
        doorRightPivot.rotation.y = THREE.MathUtils.lerp(doorRightPivot.rotation.y, targetDoor, 0.12);
      }
      hoodPivot.rotation.x = THREE.MathUtils.lerp(hoodPivot.rotation.x, state.hoodOpen ? -0.85 : 0, 0.12);
      trunkPivot.rotation.x = THREE.MathUtils.lerp(trunkPivot.rotation.x, state.trunkOpen ? 0.85 : 0, 0.12);

      coneL.visible = state.headlightsOn;
      coneR.visible = state.headlightsOn;
      cfdGroup.visible = state.cfdVisible;
      shieldBubbleMesh.visible = state.shieldActive;
      if (state.shieldActive) {
        shieldBubbleMesh.rotation.y += state.dt * 1.6;
      }
    },
  };
}
