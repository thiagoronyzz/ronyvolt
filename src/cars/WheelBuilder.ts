/**
 * WHEEL BUILDER — lathe-profiled tyre, forged rim, brake hardware
 * ===============================================================
 *
 * A wheel is the single most scrutinised object on a car. It is close to the
 * camera, it is circular (so any faceting is instant), and it has a lot of
 * high-frequency structure that the eye uses to judge resolution.
 *
 * The old builder used `CylinderGeometry` for both the tyre and the rim, which
 * produces a barrel: a constant-radius tube with a flat face. A real tyre is a
 * *profile*:
 *
 *        ┌────────── tread (crowned, with circumferential grooves)
 *       ╱            ╲
 *      │   shoulder   │      ← progressive radius falloff, this is what makes
 *      │   sidewall   │        the tyre look inflated rather than turned
 *       ╲            ╱
 *        └── bead ──┘        ← the tyre pinches onto the rim lip
 *
 * So the tyre here is a LatheGeometry of that profile, with the tread band
 * getting a dedicated UV island so the tread texture wraps around the
 * circumference exactly once per revolution rather than being smeared.
 *
 * The rim is a separate lathe (barrel + lip + dish) plus *extruded* spokes:
 * boxes with bevels, tapered along their length and dished. Extruded spokes
 * catch a specular streak down their spine; flat boxes do not.
 *
 * Finally, brake hardware: a vented disc means *two* faces with a visible gap
 * and internal vanes, and the caliper straddles the disc — you can see it
 * through the spokes, and that depth cue is a big part of why real wheels read.
 */

import * as THREE from 'three';
import { WHEEL_CATALOG } from '../data/carCatalog';

export interface WheelBuildOptions {
  radiusM: number;
  /** Optional explicit sidewall height, so a 185/60R14 fits exactly. */
  sidewallM?: number;
  widthM: number;
  rimRadiusM: number;
  /** Spoke count from the catalogue. */
  spokes: number;
  /** Optional aero disc that covers the spokes (time-attack look). */
  aerodisc?: boolean;
  /** Rim colour. */
  rimColor: string;
  /** Tyre sidewall aspect: 0.3 (low profile) … 0.5 (fat). */
  sidewallAspect: number;
  /** Brake disc radius as a fraction of rim radius. */
  brakeScale?: number;
  /** Calliper colour, e.g. "Brembo red". */
  caliperColor?: string;
}

export interface BuiltWheel {
  /** Whole wheel, axis along X. Spin it around X. */
  root: THREE.Group;
  /** Group that carries tyre + rim; rotate this for wheel spin. */
  spin: THREE.Group;
  /** Calliper + disc; disc spins with `spin`, calliper does not. */
  brakeDisc: THREE.Object3D;
  calliper: THREE.Object3D;
  materials: {
    tire: THREE.Material;
    rim: THREE.Material;
    disc: THREE.Material;
    caliper: THREE.Material;
  };
}

/**
 * Tyre cross-section in the (radius, half-width) plane, from the inner bead to
 * the outer bead. Values are normalised 0..1 of the tyre radius so the same
 * profile serves a 13" Uno tyre and a 24" hypercar rim.
 */
function tireProfile(aspect: number, rimFraction: number): THREE.Vector2[] {
  const R = 1;
  const rimR = rimFraction;
  const halfW = 0.5;
  const pts: THREE.Vector2[] = [];
  // Section width bulges slightly below mid-height on a loaded tyre, but only
  // by a few percent — the "balloon" look comes from overstating this.
  const bulge = 1 + aspect * 0.035;

  // Bead seat.
  pts.push(new THREE.Vector2(rimR * 0.995, -halfW * 0.84));
  // Sidewall: mostly straight with a gentle outward bow, then the shoulder.
  pts.push(new THREE.Vector2(rimR + (R - rimR) * 0.22, -halfW * 0.98 * bulge));
  pts.push(new THREE.Vector2(rimR + (R - rimR) * 0.52, -halfW * 0.985 * bulge));
  pts.push(new THREE.Vector2(rimR + (R - rimR) * 0.8, -halfW * 0.955));
  // Shoulder: a short, tight radius. This is the difference between a tyre and
  // a donut: the transition occupies ~12% of the width, not 40%.
  pts.push(new THREE.Vector2(R * 0.968, -halfW * 0.895));
  pts.push(new THREE.Vector2(R * 0.991, -halfW * 0.845));
  pts.push(new THREE.Vector2(R * 0.9995, -halfW * 0.79));
  // Tread: essentially flat, crowned by only 0.6% of the radius.
  pts.push(new THREE.Vector2(R * 1.0, -halfW * 0.55));
  pts.push(new THREE.Vector2(R * 1.002, -halfW * 0.18));
  pts.push(new THREE.Vector2(R * 1.002, halfW * 0.18));
  pts.push(new THREE.Vector2(R * 1.0, halfW * 0.55));
  pts.push(new THREE.Vector2(R * 0.9995, halfW * 0.79));
  pts.push(new THREE.Vector2(R * 0.991, halfW * 0.845));
  pts.push(new THREE.Vector2(R * 0.968, halfW * 0.895));
  pts.push(new THREE.Vector2(rimR + (R - rimR) * 0.8, halfW * 0.955));
  pts.push(new THREE.Vector2(rimR + (R - rimR) * 0.52, halfW * 0.985 * bulge));
  pts.push(new THREE.Vector2(rimR + (R - rimR) * 0.22, halfW * 0.98 * bulge));
  pts.push(new THREE.Vector2(rimR * 0.995, halfW * 0.84));
  return pts;
}

/**
 * Rim cross-section: lip → barrel → drop centre → back lip. The "dish" (how
 * deep the centre sits relative to the outer lip) is what gives a wheel its
 * face profile, and it is the difference between a hubcap and a wheel.
 */
function rimProfile(rimFraction: number): THREE.Vector2[] {
  const halfW = 0.5;
  const r = rimFraction;
  // Open at both ends: outer lip -> barrel -> drop centre -> inner lip. The
  // face of the wheel is built by the spokes and hub, not by a closed lathe,
  // so you can see the brake disc through it exactly as on a real wheel.
  return [
    new THREE.Vector2(r * 0.94, -halfW * 0.86),
    new THREE.Vector2(r * 1.0, -halfW * 0.8),
    new THREE.Vector2(r * 1.0, -halfW * 0.6),
    new THREE.Vector2(r * 0.93, -halfW * 0.34),
    new THREE.Vector2(r * 0.9, -halfW * 0.1),
    new THREE.Vector2(r * 0.9, halfW * 0.06),
    new THREE.Vector2(r * 0.94, halfW * 0.3),
    new THREE.Vector2(r * 1.0, halfW * 0.6),
    new THREE.Vector2(r * 1.0, halfW * 0.8),
    new THREE.Vector2(r * 0.96, halfW * 0.87),
  ];
}

/**
 * One spoke, built as an explicit tapered prism in WHEEL coordinates:
 *   +X = outboard (axle direction), Y/Z = the wheel plane.
 *
 * Building the vertices directly (rather than extruding a 2D shape and then
 * rotating it into place) removes a whole class of orientation bugs and lets us
 * put the taper and the dish exactly where a forged spoke has them: wide and
 * deep at the hub, thin and shallow at the lip.
 */
function spokePrism(
  innerR: number,
  outerR: number,
  wInner: number,
  wOuter: number,
  tInner: number,
  tOuter: number,
  dish: number,
  faceX: number
): THREE.BufferGeometry {
  const pos: number[] = [];
  const push = (r: number, w: number, t: number, xOff: number) => {
    // 4 corners: radially outward is +Y in local space; we place each spoke by
    // rotating the whole mesh about X, so local +Y means "toward the rim".
    const x = faceX + xOff;
    pos.push(x, r, -w * 0.5); // 0: outer face, left
    pos.push(x, r, w * 0.5); // 1: outer face, right
    pos.push(x - t, r, -w * 0.42); // 2: back face, left
    pos.push(x - t, r, w * 0.42); // 3: back face, right
  };
  push(innerR, wInner, tInner, 0);
  push(outerR, wOuter, tOuter, -dish);

  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => {
    idx.push(a, b, c, b, d, c);
  };
  // [0..3] hub ring, [4..7] rim ring
  quad(0, 4, 1, 5); // outboard face
  quad(3, 7, 2, 6); // inboard face
  quad(0, 2, 4, 6); // left flank
  quad(1, 5, 3, 7); // right flank
  quad(4, 6, 5, 7); // rim end cap

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Vented brake disc: two friction faces, a hub, and 24 internal vanes. */
function brakeDiscGeometry(radius: number, thickness: number, mats: THREE.Material[]): THREE.Group {
  const g = new THREE.Group();
  const faceGeo = new THREE.CylinderGeometry(radius, radius, thickness * 0.22, 32, 1, false);
  faceGeo.rotateZ(Math.PI / 2);
  const inner = new THREE.Mesh(faceGeo, mats[0]);
  const outer = new THREE.Mesh(faceGeo.clone(), mats[0]);
  inner.position.x = -thickness * 0.34;
  outer.position.x = thickness * 0.34;
  g.add(inner, outer);

  // Vanes: the gap between the two faces. Seen through spokes, this reads as
  // "vented disc" instantly.
  const vaneCount = 24;
  const vaneGeo = new THREE.BoxGeometry(thickness * 0.6, radius * 0.62, radius * 0.045);
  for (let i = 0; i < vaneCount; i++) {
    const a = (i / vaneCount) * Math.PI * 2;
    const m = new THREE.Mesh(vaneGeo, mats[1]);
    m.position.set(0, Math.cos(a) * radius * 0.62, Math.sin(a) * radius * 0.62);
    m.rotation.x = -a;
    g.add(m);
  }

  // Hub / bell.
  const hubGeo = new THREE.CylinderGeometry(radius * 0.42, radius * 0.46, thickness * 1.5, 20);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, mats[0]);
  g.add(hub);
  return g;
}

/**
 * Brake calliper: an arc of thick-walled tube that wraps around the disc rim.
 *
 * Built by rotating a torus *in its own plane* first and then standing it up
 * into the wheel plane, so the arc always spans the same clock position
 * regardless of wheel size. A block bridges the two halves over the disc.
 */
function caliperGeometry(radius: number, width: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const arc = 0.46;
  const startAngle = Math.PI * 0.5;

  const torusGeo = new THREE.TorusGeometry(radius, width * 0.17, 8, 14, arc);
  // Torus lies in XY; rotate within its own plane to place it, then stand it up
  // so its axis becomes the wheel axle (X).
  torusGeo.rotateZ(startAngle);
  torusGeo.rotateY(Math.PI / 2);
  const body = new THREE.Mesh(torusGeo, material);
  body.castShadow = true;
  g.add(body);

  // Bridge block straddling the disc, at the middle of the arc.
  const midA = startAngle + arc / 2;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(width * 0.62, radius * 0.2, width * 0.42), material);
  bridge.position.set(0, Math.cos(midA) * radius, Math.sin(midA) * radius);
  bridge.rotation.x = -midA;
  bridge.castShadow = true;
  g.add(bridge);

  // Piston housings on the outboard side, where they are visible through the
  // spokes — the detail that makes a calliper read as machined rather than cast.
  for (let p = -1; p <= 1; p += 2) {
    const a = midA + p * 0.18;
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.075, radius * 0.075, width * 0.26, 10), material);
    piston.rotation.z = Math.PI / 2;
    piston.position.set(width * 0.2, Math.cos(a) * radius, Math.sin(a) * radius);
    g.add(piston);
  }
  return g;
}

/**
 * Builds one wheel. All dimensions in metres; the returned root is centred at
 * the hub with the axle along +X (so it works on both sides after mirroring).
 */
export function buildWheel(
  opts: WheelBuildOptions,
  materials: {
    tire: THREE.Material;
    rim: THREE.Material;
    disc: THREE.Material;
    vane: THREE.Material;
    caliper: THREE.Material;
    lug: THREE.Material;
  }
): BuiltWheel {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);

  const R = opts.radiusM;
  const W = opts.widthM;
  const rimFraction = Math.max(0.5, Math.min(0.88, opts.rimRadiusM / Math.max(0.05, R)));
  const sidewallRatio = opts.sidewallM !== undefined ? opts.sidewallM / R : opts.sidewallAspect;
  // The rim lip sits at +X: that is the *outer* face of the wheel on the right
  // side of the car. `buildCarMesh` mirrors the whole assembly for the left.
  const faceX = W * 0.42;

  // ---- Tyre ---------------------------------------------------------------
  const profile = tireProfile(sidewallRatio, rimFraction).map(
    (p) => new THREE.Vector2(p.x * R, p.y * W)
  );
  const tyreGeo = new THREE.LatheGeometry(profile, 48);
  tyreGeo.rotateZ(Math.PI / 2);

  // UV remap so the tread texture wraps once around the circumference and maps
  // across the tread band, instead of being smeared over the whole lathe.
  const uv = tyreGeo.attributes.uv as THREE.BufferAttribute;
  const uvArr = uv.array as Float32Array;
  const pos = tyreGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const yPos = pos.getY(i);
    const xPos = pos.getX(i);
    const zPos = pos.getZ(i);
    const across = (xPos / Math.max(1e-4, W)) * 0.5 + 0.5;
    const around = Math.atan2(zPos, yPos) / (Math.PI * 2) + 0.5;
    uvArr[i * 2] = across;
    uvArr[i * 2 + 1] = around * 6;
  }
  uv.needsUpdate = true;
  tyreGeo.computeVertexNormals();

  const tyreMesh = new THREE.Mesh(tyreGeo, materials.tire);
  tyreMesh.castShadow = true;
  tyreMesh.receiveShadow = true;
  spin.add(tyreMesh);

  // ---- Rim barrel (open) --------------------------------------------------
  const rimPts = rimProfile(rimFraction).map((p) => new THREE.Vector2(p.x * R, p.y * W));
  const rimGeo = new THREE.LatheGeometry(rimPts, 48);
  rimGeo.rotateZ(Math.PI / 2);
  const rimBarrel = new THREE.Mesh(
    rimGeo,
    new THREE.MeshStandardMaterial({
      color: (materials.rim as THREE.MeshPhysicalMaterial).color,
      metalness: 0.96,
      roughness: 0.16,
      side: THREE.DoubleSide,
    })
  );
  rimBarrel.castShadow = true;
  spin.add(rimBarrel);

  // ---- Spokes -------------------------------------------------------------
  const spokeCount = Math.max(4, Math.min(20, opts.spokes));
  const hubRadius = rimFraction * R * 0.3;
  const spokeInnerR = hubRadius * 0.82;
  const spokeOuterR = rimFraction * R * 0.97;
  const pitch = (Math.PI * 2 * spokeInnerR) / spokeCount;
  const wInner = pitch * 0.52;
  const wOuter = pitch * 0.3;
  const tInner = W * 0.2;
  const tOuter = W * 0.11;
  const dish = W * 0.13;
  const spokeGeo = spokePrism(spokeInnerR, spokeOuterR, wInner, wOuter, tInner, tOuter, dish, faceX);

  if (!opts.aerodisc) {
    for (let sIdx = 0; sIdx < spokeCount; sIdx++) {
      const a = (sIdx / spokeCount) * Math.PI * 2;
      const m = new THREE.Mesh(spokeGeo, materials.rim);
      m.rotation.x = a;
      m.castShadow = true;
      spin.add(m);
      // Second, narrower spoke offset by half a pitch: the classic "twin five"
      // forged look, and it fills the rim face the way a real wheel is filled.
      if (spokeCount <= 10) {
        const m2 = new THREE.Mesh(spokeGeo, materials.rim);
        m2.rotation.x = a + Math.PI / spokeCount;
        m2.scale.set(0.8, 1, 0.62);
        spin.add(m2);
      }
    }
  } else {
    const discGeo = new THREE.CylinderGeometry(rimFraction * R * 0.94, rimFraction * R * 0.94, W * 0.05, 40);
    discGeo.rotateZ(Math.PI / 2);
    const d = new THREE.Mesh(discGeo, materials.rim);
    d.position.x = faceX - W * 0.1;
    spin.add(d);
  }

  // Hub face with a machine finish: a shallow dish, a raised centre, and lugs.
  const hubGeo = new THREE.CylinderGeometry(hubRadius * 1.08, hubRadius * 1.02, W * 0.14, 28);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, materials.rim);
  hub.position.x = faceX - W * 0.1;
  spin.add(hub);

  const lugGeo = new THREE.CylinderGeometry(hubRadius * 0.1, hubRadius * 0.1, W * 0.1, 6);
  lugGeo.rotateZ(Math.PI / 2);
  const lugs = hubRadius > 0.03 ? 6 : 4;
  for (let l = 0; l < lugs; l++) {
    const a = (l / lugs) * Math.PI * 2 + 0.35;
    const m = new THREE.Mesh(lugGeo, materials.lug);
    m.position.set(faceX - W * 0.03, Math.cos(a) * hubRadius * 0.7, Math.sin(a) * hubRadius * 0.7);
    spin.add(m);
  }
  const capGeo = new THREE.CylinderGeometry(hubRadius * 0.34, hubRadius * 0.36, W * 0.16, 22);
  capGeo.rotateZ(Math.PI / 2);
  const cap = new THREE.Mesh(capGeo, materials.rim);
  cap.position.x = faceX - W * 0.04;
  spin.add(cap);

  // ---- Brakes -------------------------------------------------------------
  const brakeR = (opts.brakeScale ?? 0.72) * rimFraction * R;
  const disc = brakeDiscGeometry(brakeR, W * 0.42, [materials.disc, materials.vane]);
  disc.position.x = -W * 0.02;
  // The disc spins; the calliper does not.
  spin.add(disc);

  const caliperHolder = new THREE.Group();
  const caliperBody = caliperGeometry(brakeR * 0.98, W * 0.42, materials.caliper);
  caliperBody.position.x = -W * 0.02;
  caliperBody.rotation.z = 0.2;
  caliperHolder.add(caliperBody);
  root.add(caliperHolder);

  return {
    root,
    spin,
    brakeDisc: disc,
    calliper: caliperHolder,
    materials: {
      tire: materials.tire,
      rim: materials.rim,
      disc: materials.disc,
      caliper: materials.caliper,
    },
  };
}

/** Convenience: pick a catalogue entry and build a wheel from a size in inches. */
export function buildWheelFromSpec(params: {
  wheelModelIndex: number;
  wheelSizeInch: number;
  tireWidthMm: number;
  aspectRatio: number;
  rimColorHex: string;
  caliperColorHex: string;
  isF1?: boolean;
  isTractor?: boolean;
}, materials: Parameters<typeof buildWheel>[1]): BuiltWheel {
  const spec = WHEEL_CATALOG[Math.abs(params.wheelModelIndex) % WHEEL_CATALOG.length];
  const rimRadiusM = (params.wheelSizeInch * 0.0254) / 2;
  const sidewallM = (params.tireWidthMm / 1000) * (params.aspectRatio / 100);
  const radiusM = rimRadiusM + sidewallM;
  const widthM = params.tireWidthMm / 1000;
  return buildWheel(
    {
      radiusM: params.isTractor ? radiusM * 1.35 : radiusM,
      widthM: params.isF1 ? widthM * 1.25 : widthM,
      rimRadiusM: params.isTractor ? rimRadiusM * 0.7 : rimRadiusM,
      spokes: spec.spokes,
      aerodisc: spec.aerodisc,
      rimColor: params.rimColorHex,
      sidewallAspect: Math.min(0.6, Math.max(0.18, sidewallM / Math.max(0.05, radiusM))),
      brakeScale: params.isF1 ? 0.86 : 0.76,
      caliperColor: params.caliperColorHex,
    },
    materials
  );
}
