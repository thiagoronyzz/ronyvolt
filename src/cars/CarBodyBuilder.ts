/**
 * CAR BODY BUILDER — continuous lofted surfaces instead of stacked boxes
 * =====================================================================
 *
 * THE PROBLEM
 * -----------
 * The previous builder assembled a car from `BoxGeometry` primitives: a lower
 * box, a nose box, a roof box, a glass cube. Every one of those introduces:
 *
 *   - four 90° edges per box, where the normal flips discontinuously. A
 *     discontinuous normal is a discontinuous reflection, so instead of a
 *     highlight *sliding* along the flank you get a hard line where the light
 *     steps. The eye reads that line instantly as "assembled from parts".
 *   - axis-aligned faces, which means the specular lobe is a single hard
 *     rectangle. Car paint in a photo has a long, curved, soft gradient.
 *   - no tumblehome, no shoulder, no fender bulge, no plan-view taper. A real
 *     car is narrower at the nose, widest at the B-pillar, and its glasshouse
 *     leans inward at the top. Without those the silhouette is a rectangle, and
 *     a rectangle is the single strongest "toy" signal in a car image.
 *
 * THE APPROACH
 * ------------
 * A car body is a *loft*: a series of cross-sections swept along the length,
 * with the sections varying smoothly. That is how every production model is
 * surfaced, and it is the only approach that yields C1 continuity — the property
 * that makes light travel along the surface instead of snapping at edges.
 *
 *   1. `BodyShape` describes a vehicle in the terms a designer would use:
 *      overall length/width/height, wheelbase, belt line, hood and deck heights,
 *      nose droop, plan taper, fender bulge, and the glasshouse volume.
 *
 *   2. `stationAt(u)` turns that into N cross-sections. Each section is a
 *      closed 2D curve in the (x, y) plane: floor → rocker → flank → shoulder →
 *      hood/roof crown → mirrored. It is built from a *superellipse-blended*
 *      Catmull-Rom through 8 control points, which is what rounds the shoulder
 *      (the corner where a real car's flank meets its hood).
 *
 *   3. The glasshouse is a *second* complete loft, inset from the body by the
 *      real glass thickness, degenerate at both ends. Because it collapses to
 *      the beltline at the windscreen base and again at the rear screen base, the
 *      windscreen and backlight fall out of the same surface for free — no
 *      separate slab, and no seam where a slab would meet the roof.
 *
 *   4. Wheel arches are carved by pushing body vertices radially onto the arch
 *      circle and dropping an inner liner behind them, so the tyre genuinely
 *      sits *inside* the body instead of poking through a hole in it.
 *
 *   5. Material regions (paint / glass / trim) are emitted as index groups on
 *      one geometry. The silhouette is continuous; only the shading model
 *      changes across the beltline — exactly like the real thing.
 *
 * Continuity is then guaranteed at the shading stage too: vertices are shared
 * along the loft grid, so normals are area-weighted averages across every
 * station and section boundary.
 */

import * as THREE from 'three';
import { CarArchetype } from '../types/game';

// ---------------------------------------------------------------------------
// Shape description
// ---------------------------------------------------------------------------

export interface Glasshouse {
  /** z (car space, +z = forward) where the windscreen base sits. */
  frontBaseZ: number;
  /** z where the roof leading edge sits. */
  frontTopZ: number;
  /** z where the roof trailing edge sits. */
  rearTopZ: number;
  /** z where the backlight base sits. */
  rearBaseZ: number;
  /** Roof height above the ground. */
  roofY: number;
  /** Roof width as a fraction of the body half-width at the B-pillar. */
  roofWidthScale: number;
  /** How much the glass leans inward at the top (tumblehome), metres per side. */
  tumblehome: number;
  /** Height of the beltline (bottom of the glass). */
  beltY: number;
  /** 1 = upright SUV/pickup, 0 = fast, low coupe. Controls pillar rake bias. */
  upright: number;
}

export interface BodyShape {
  /** Exact rolling radius of the tyre that will be fitted. Drives the arch. */
  wheelRadius?: number;
  /** Total length, metres. */
  length: number;
  /** Maximum body width (excluding mirrors), metres. */
  width: number;
  /** Ground clearance to the underside of the body, metres. */
  floor: number;
  /** Height of the top of the bonnet at the leading edge. */
  hoodY: number;
  /** Height of the rear deck (boot lid / tailgate top). */
  deckY: number;
  /** Height of the widest point of the flank (belt line of the lower body). */
  shoulderY: number;
  /** Front axle z. */
  axleFrontZ: number;
  /** Rear axle z. */
  axleRearZ: number;
  /** Radius of the wheel arch cut-out. */
  archRadius: number;
  /** How much the body flares outward over the wheels, metres. */
  fenderBulge: number;
  /** Plan-view narrowing at the nose (fraction of half-width). */
  noseTaper: number;
  /** Plan-view narrowing at the tail. */
  tailTaper: number;
  /** Section roundness exponent: 2 = round, 6 = slab-sided. */
  sectionRoundness: number;
  /** Crown of the bonnet/deck above the shoulder (metres). */
  topCrown: number;
  /**
   * Radius of the shoulder crease, metres. Small (5-12 mm) = crisp, modern;
   * large (40-80 mm) = soft, pre-war. This is what a designer calls the
   * "character line radius" and it is the difference between a car that reads
   * photographic and one that reads as a smoothed blob.
   */
  creaseRadius?: number;
  /** Fender crown: how far the haunch bulges past the door surface, metres. */
  fenderCrown?: number;
  /** How much the rocker is pulled in under the doors. */
  rockerInset: number;
  /** Number of loft stations; more = smoother but heavier. */
  stations: number;
  /** The glasshouse, or null for open cars / single-seaters. */
  cabin: Glasshouse | null;
  /** True for open-wheel cars (no body between the wheels). */
  openWheel?: boolean;
  /** Optional: total body height used for the top-centre cap. */
  bodyTopY: number;
}

const lerp = THREE.MathUtils.lerp;

/**
 * Catmull-Rom through scalar control points [[u, y], ...] sorted by u.
 * Tangents are computed with a centripetal-ish scheme and clamped at the ends,
 * which avoids the overshoot that makes a bonnet line wobble.
 */
export function profile(points: [number, number][], u: number): number {
  const n = points.length;
  if (n === 0) return 0;
  if (u <= points[0][0]) return points[0][1];
  if (u >= points[n - 1][0]) return points[n - 1][1];
  let i = 0;
  while (i < n - 2 && u > points[i + 1][0]) i++;
  const [u0, v0] = points[Math.max(0, i - 1)];
  const [u1, v1] = points[i];
  const [u2, v2] = points[i + 1];
  const [u3, v3] = points[Math.min(n - 1, i + 2)];
  const t = (u - u1) / Math.max(1e-6, u2 - u1);
  const t2 = t * t;
  const t3 = t2 * t;
  // Uniform Catmull-Rom basis.
  const m1 = 0.5 * (v2 - v0);
  const m2 = 0.5 * (v3 - v1);
  void u0;
  void u3;
  return (
    (2 * t3 - 3 * t2 + 1) * v1 +
    (t3 - 2 * t2 + t) * m1 +
    (-2 * t3 + 3 * t2) * v2 +
    (t3 - t2) * m2
  );
}

/** Smooth 0→1 ramp, used for taper and bulge envelopes. */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
}

function gaussian(x: number, sigma: number): number {
  return Math.exp(-(x * x) / (2 * sigma * sigma));
}

// ---------------------------------------------------------------------------
// Archetype presets
// ---------------------------------------------------------------------------

/**
 * Every archetype is a real proportion set, not a randomisation. These numbers
 * come from published dimensions of the classes the archetypes represent:
 * a B-segment hatchback is ~3.75 m long, 1.55 m tall, 2.35 m wheelbase; a
 * mid-engine hypercar is ~4.7 m long, 1.1 m tall with a 2.7 m wheelbase.
 */
export const SHAPE_PRESETS: Record<CarArchetype, BodyShape> = {
  boxy_hatch_uno: {
    length: 3.75,
    width: 1.57,
    floor: 0.19,
    hoodY: 0.86,
    deckY: 0.96,
    shoulderY: 0.74,
    axleFrontZ: 1.18,
    axleRearZ: -1.19,
    archRadius: 0.44,
    fenderBulge: 0.022,
    noseTaper: 0.13,
    tailTaper: 0.07,
    sectionRoundness: 3.4,
    topCrown: 0.02,
    rockerInset: 0.035,
    stations: 22,
    cabin: {
      frontBaseZ: 0.46,
      frontTopZ: -0.02,
      rearTopZ: -1.14,
      rearBaseZ: -1.52,
      roofY: 1.42,
      roofWidthScale: 0.9,
      tumblehome: 0.055,
      beltY: 0.88,
      upright: 0.86,
    },
    bodyTopY: 1.42,
  },
  rally_hatch: {
    length: 4.02,
    width: 1.78,
    floor: 0.22,
    hoodY: 0.9,
    deckY: 1.0,
    shoulderY: 0.78,
    axleFrontZ: 1.28,
    axleRearZ: -1.27,
    archRadius: 0.47,
    fenderBulge: 0.055,
    noseTaper: 0.1,
    tailTaper: 0.06,
    sectionRoundness: 3.6,
    topCrown: 0.024,
    rockerInset: 0.04,
    stations: 22,
    cabin: {
      frontBaseZ: 0.52,
      frontTopZ: 0.04,
      rearTopZ: -1.18,
      rearBaseZ: -1.6,
      roofY: 1.44,
      roofWidthScale: 0.88,
      tumblehome: 0.07,
      beltY: 0.9,
      upright: 0.8,
    },
    bodyTopY: 1.44,
  },
  sedan_tuner: {
    length: 4.62,
    width: 1.8,
    floor: 0.16,
    hoodY: 0.82,
    deckY: 0.92,
    shoulderY: 0.72,
    axleFrontZ: 1.42,
    axleRearZ: -1.38,
    archRadius: 0.45,
    fenderBulge: 0.03,
    noseTaper: 0.12,
    tailTaper: 0.09,
    sectionRoundness: 3.2,
    topCrown: 0.028,
    rockerInset: 0.045,
    stations: 24,
    cabin: {
      frontBaseZ: 0.72,
      frontTopZ: 0.1,
      rearTopZ: -0.98,
      rearBaseZ: -1.42,
      roofY: 1.36,
      roofWidthScale: 0.85,
      tumblehome: 0.1,
      beltY: 0.84,
      upright: 0.45,
    },
    bodyTopY: 1.36,
  },
  modern_gt: {
    length: 4.72,
    width: 1.94,
    floor: 0.14,
    hoodY: 0.78,
    deckY: 0.88,
    shoulderY: 0.7,
    axleFrontZ: 1.44,
    axleRearZ: -1.4,
    archRadius: 0.46,
    fenderBulge: 0.034,
    noseTaper: 0.14,
    tailTaper: 0.1,
    sectionRoundness: 3,
    topCrown: 0.03,
    rockerInset: 0.05,
    stations: 24,
    cabin: {
      frontBaseZ: 0.76,
      frontTopZ: 0.06,
      rearTopZ: -1.02,
      rearBaseZ: -1.48,
      roofY: 1.28,
      roofWidthScale: 0.82,
      tumblehome: 0.12,
      beltY: 0.8,
      upright: 0.35,
    },
    bodyTopY: 1.28,
  },
  muscle_fastback: {
    length: 4.95,
    width: 1.94,
    floor: 0.15,
    hoodY: 0.85,
    deckY: 0.95,
    shoulderY: 0.72,
    axleFrontZ: 1.5,
    axleRearZ: -1.44,
    archRadius: 0.48,
    fenderBulge: 0.04,
    noseTaper: 0.08,
    tailTaper: 0.06,
    sectionRoundness: 4.2,
    topCrown: 0.02,
    rockerInset: 0.03,
    stations: 24,
    cabin: {
      frontBaseZ: 0.62,
      frontTopZ: -0.06,
      rearTopZ: -1.12,
      rearBaseZ: -1.88,
      roofY: 1.34,
      roofWidthScale: 0.84,
      tumblehome: 0.09,
      beltY: 0.86,
      upright: 0.4,
    },
    bodyTopY: 1.34,
  },
  wedge_supercar: {
    length: 4.52,
    width: 1.98,
    floor: 0.1,
    hoodY: 0.62,
    deckY: 0.78,
    shoulderY: 0.6,
    axleFrontZ: 1.34,
    axleRearZ: -1.28,
    archRadius: 0.45,
    fenderBulge: 0.05,
    noseTaper: 0.2,
    tailTaper: 0.08,
    sectionRoundness: 2.6,
    topCrown: 0.035,
    rockerInset: 0.06,
    stations: 26,
    cabin: {
      frontBaseZ: 0.78,
      frontTopZ: 0.0,
      rearTopZ: -0.78,
      rearBaseZ: -1.24,
      roofY: 1.12,
      roofWidthScale: 0.78,
      tumblehome: 0.14,
      beltY: 0.7,
      upright: 0.12,
    },
    bodyTopY: 1.12,
  },
  hypercar_aero: {
    length: 4.7,
    width: 2.02,
    floor: 0.09,
    hoodY: 0.58,
    deckY: 0.82,
    shoulderY: 0.58,
    axleFrontZ: 1.38,
    axleRearZ: -1.32,
    archRadius: 0.46,
    fenderBulge: 0.06,
    noseTaper: 0.22,
    tailTaper: 0.1,
    sectionRoundness: 2.5,
    topCrown: 0.04,
    rockerInset: 0.07,
    stations: 26,
    cabin: {
      frontBaseZ: 0.86,
      frontTopZ: 0.06,
      rearTopZ: -0.74,
      rearBaseZ: -1.16,
      roofY: 1.08,
      roofWidthScale: 0.76,
      tumblehome: 0.16,
      beltY: 0.68,
      upright: 0.1,
    },
    bodyTopY: 1.08,
  },
  futuristic_concept: {
    length: 4.86,
    width: 2.06,
    floor: 0.09,
    hoodY: 0.6,
    deckY: 0.84,
    shoulderY: 0.6,
    axleFrontZ: 1.44,
    axleRearZ: -1.38,
    archRadius: 0.47,
    fenderBulge: 0.062,
    noseTaper: 0.24,
    tailTaper: 0.12,
    sectionRoundness: 2.3,
    topCrown: 0.042,
    rockerInset: 0.075,
    stations: 28,
    cabin: {
      frontBaseZ: 0.9,
      frontTopZ: 0.08,
      rearTopZ: -0.8,
      rearBaseZ: -1.22,
      roofY: 1.1,
      roofWidthScale: 0.74,
      tumblehome: 0.17,
      beltY: 0.7,
      upright: 0.08,
    },
    bodyTopY: 1.1,
  },
  lmp_prototype: {
    length: 4.9,
    width: 2.0,
    floor: 0.08,
    hoodY: 0.58,
    deckY: 0.72,
    shoulderY: 0.56,
    axleFrontZ: 1.46,
    axleRearZ: -1.4,
    archRadius: 0.46,
    fenderBulge: 0.07,
    noseTaper: 0.26,
    tailTaper: 0.09,
    sectionRoundness: 2.4,
    topCrown: 0.04,
    rockerInset: 0.06,
    stations: 28,
    cabin: {
      frontBaseZ: 1.0,
      frontTopZ: 0.2,
      rearTopZ: -0.6,
      rearBaseZ: -1.1,
      roofY: 1.02,
      roofWidthScale: 0.66,
      tumblehome: 0.14,
      beltY: 0.66,
      upright: 0.2,
    },
    bodyTopY: 1.02,
  },
  gullwing_coupe: {
    length: 4.52,
    width: 1.79,
    floor: 0.17,
    hoodY: 0.86,
    deckY: 0.9,
    shoulderY: 0.74,
    axleFrontZ: 1.2,
    axleRearZ: -1.14,
    archRadius: 0.44,
    fenderBulge: 0.03,
    noseTaper: 0.14,
    tailTaper: 0.1,
    sectionRoundness: 3.1,
    topCrown: 0.03,
    rockerInset: 0.04,
    stations: 24,
    cabin: {
      frontBaseZ: 0.58,
      frontTopZ: -0.02,
      rearTopZ: -0.96,
      rearBaseZ: -1.42,
      roofY: 1.3,
      roofWidthScale: 0.82,
      tumblehome: 0.11,
      beltY: 0.86,
      upright: 0.3,
    },
    bodyTopY: 1.3,
  },
  classic_roadster: {
    length: 4.3,
    width: 1.66,
    floor: 0.2,
    hoodY: 0.94,
    deckY: 0.9,
    shoulderY: 0.78,
    axleFrontZ: 1.24,
    axleRearZ: -1.16,
    archRadius: 0.44,
    fenderBulge: 0.045,
    noseTaper: 0.16,
    tailTaper: 0.12,
    sectionRoundness: 2.8,
    topCrown: 0.04,
    rockerInset: 0.03,
    stations: 22,
    cabin: null,
    bodyTopY: 0.94,
  },
  classic_1900_open: {
    length: 3.6,
    width: 1.68,
    floor: 0.3,
    hoodY: 1.05,
    deckY: 0.95,
    shoulderY: 0.86,
    axleFrontZ: 1.24,
    axleRearZ: -1.14,
    archRadius: 0.5,
    fenderBulge: 0.01,
    noseTaper: 0.05,
    tailTaper: 0.05,
    sectionRoundness: 4,
    topCrown: 0.05,
    rockerInset: 0.01,
    stations: 20,
    cabin: null,
    bodyTopY: 1.05,
  },
  classic_beetle: {
    length: 4.08,
    width: 1.55,
    floor: 0.18,
    hoodY: 0.82,
    deckY: 0.84,
    shoulderY: 0.72,
    axleFrontZ: 1.2,
    axleRearZ: -1.2,
    archRadius: 0.45,
    fenderBulge: 0.065,
    noseTaper: 0.2,
    tailTaper: 0.18,
    sectionRoundness: 2.2,
    topCrown: 0.045,
    rockerInset: 0.02,
    stations: 24,
    cabin: {
      frontBaseZ: 0.48,
      frontTopZ: 0.06,
      rearTopZ: -0.94,
      rearBaseZ: -1.3,
      roofY: 1.32,
      roofWidthScale: 0.86,
      tumblehome: 0.07,
      beltY: 0.84,
      upright: 0.7,
    },
    bodyTopY: 1.32,
  },
  f1_openwheel: {
    length: 5.4,
    width: 2.0,
    floor: 0.06,
    hoodY: 0.5,
    deckY: 0.6,
    shoulderY: 0.48,
    axleFrontZ: 1.72,
    axleRearZ: -1.62,
    archRadius: 0.34,
    fenderBulge: 0,
    noseTaper: 0.6,
    tailTaper: 0.5,
    sectionRoundness: 2,
    topCrown: 0.05,
    rockerInset: 0.02,
    stations: 24,
    cabin: null,
    openWheel: true,
    bodyTopY: 0.9,
  },
  rc_buggy: {
    length: 0.42,
    width: 0.24,
    floor: 0.03,
    hoodY: 0.1,
    deckY: 0.12,
    shoulderY: 0.09,
    axleFrontZ: 0.14,
    axleRearZ: -0.14,
    archRadius: 0.06,
    fenderBulge: 0.008,
    noseTaper: 0.16,
    tailTaper: 0.1,
    sectionRoundness: 3,
    topCrown: 0.008,
    rockerInset: 0.006,
    stations: 18,
    cabin: {
      frontBaseZ: 0.07,
      frontTopZ: 0.0,
      rearTopZ: -0.12,
      rearBaseZ: -0.18,
      roofY: 0.17,
      roofWidthScale: 0.82,
      tumblehome: 0.012,
      beltY: 0.1,
      upright: 0.5,
    },
    bodyTopY: 0.17,
  },
  farm_tractor: {
    length: 3.6,
    width: 1.9,
    floor: 0.55,
    hoodY: 1.55,
    deckY: 1.5,
    shoulderY: 1.4,
    axleFrontZ: 1.3,
    axleRearZ: -1.1,
    archRadius: 0.85,
    fenderBulge: 0.02,
    noseTaper: 0.18,
    tailTaper: 0.05,
    sectionRoundness: 4.6,
    topCrown: 0.02,
    rockerInset: 0.01,
    stations: 16,
    cabin: null,
    bodyTopY: 1.55,
  },
  // The deliberately absurd archetypes keep their silhouette, but get real
  // surfacing so they no longer read as boxes either.
  shopping_cart: {
    length: 1.05,
    width: 0.62,
    floor: 0.12,
    hoodY: 0.48,
    deckY: 0.5,
    shoulderY: 0.42,
    axleFrontZ: 0.34,
    axleRearZ: -0.34,
    archRadius: 0.1,
    fenderBulge: 0,
    noseTaper: 0.1,
    tailTaper: 0.1,
    sectionRoundness: 4.8,
    topCrown: 0.01,
    rockerInset: 0.01,
    stations: 10,
    cabin: null,
    bodyTopY: 0.5,
  },
  v8_sofa: {
    length: 2.2,
    width: 1.05,
    floor: 0.1,
    hoodY: 0.45,
    deckY: 0.5,
    shoulderY: 0.4,
    axleFrontZ: 0.7,
    axleRearZ: -0.7,
    archRadius: 0.14,
    fenderBulge: 0.01,
    noseTaper: 0.02,
    tailTaper: 0.02,
    sectionRoundness: 5,
    topCrown: 0.01,
    rockerInset: 0.01,
    stations: 10,
    cabin: null,
    bodyTopY: 0.5,
  },
  turbo_fridge: {
    length: 1.7,
    width: 0.75,
    floor: 0.1,
    hoodY: 0.95,
    deckY: 0.95,
    shoulderY: 0.86,
    axleFrontZ: 0.55,
    axleRearZ: -0.55,
    archRadius: 0.13,
    fenderBulge: 0.005,
    noseTaper: 0.01,
    tailTaper: 0.01,
    sectionRoundness: 5.2,
    topCrown: 0.01,
    rockerInset: 0.01,
    stations: 8,
    cabin: null,
    bodyTopY: 0.95,
  },
  racing_bed: {
    length: 2.9,
    width: 2.05,
    floor: 0.1,
    hoodY: 0.5,
    deckY: 0.6,
    shoulderY: 0.45,
    axleFrontZ: 0.9,
    axleRearZ: -0.9,
    archRadius: 0.14,
    fenderBulge: 0.01,
    noseTaper: 0.02,
    tailTaper: 0.02,
    sectionRoundness: 5,
    topCrown: 0.01,
    rockerInset: 0.01,
    stations: 10,
    cabin: null,
    bodyTopY: 0.6,
  },
  battle_tank: {
    length: 4.6,
    width: 2.5,
    floor: 0.16,
    hoodY: 0.9,
    deckY: 0.9,
    shoulderY: 0.8,
    axleFrontZ: 1.5,
    axleRearZ: -1.5,
    archRadius: 0.5,
    fenderBulge: 0.02,
    noseTaper: 0.05,
    tailTaper: 0.03,
    sectionRoundness: 5.4,
    topCrown: 0.01,
    rockerInset: 0.02,
    stations: 12,
    cabin: null,
    bodyTopY: 0.9,
  },
  jet_bus: {
    length: 5.8,
    width: 2.15,
    floor: 0.24,
    hoodY: 1.7,
    deckY: 1.7,
    shoulderY: 1.5,
    axleFrontZ: 1.9,
    axleRearZ: -1.7,
    archRadius: 0.5,
    fenderBulge: 0.01,
    noseTaper: 0.06,
    tailTaper: 0.02,
    sectionRoundness: 4.6,
    topCrown: 0.02,
    rockerInset: 0.02,
    stations: 14,
    cabin: null,
    bodyTopY: 1.7,
  },
  ice_cream_truck: {
    length: 4.4,
    width: 2.1,
    floor: 0.24,
    hoodY: 1.6,
    deckY: 1.6,
    shoulderY: 1.4,
    axleFrontZ: 1.5,
    axleRearZ: -1.4,
    archRadius: 0.5,
    fenderBulge: 0.01,
    noseTaper: 0.08,
    tailTaper: 0.03,
    sectionRoundness: 4.4,
    topCrown: 0.02,
    rockerInset: 0.02,
    stations: 12,
    cabin: null,
    bodyTopY: 1.6,
  },
  rocket_streamliner: {
    length: 5.4,
    width: 1.5,
    floor: 0.14,
    hoodY: 0.62,
    deckY: 0.66,
    shoulderY: 0.56,
    axleFrontZ: 1.6,
    axleRearZ: -1.6,
    archRadius: 0.4,
    fenderBulge: 0.02,
    noseTaper: 0.42,
    tailTaper: 0.34,
    sectionRoundness: 2.1,
    topCrown: 0.06,
    rockerInset: 0.02,
    stations: 24,
    cabin: {
      frontBaseZ: 0.5,
      frontTopZ: -0.1,
      rearTopZ: -0.9,
      rearBaseZ: -1.5,
      roofY: 1.02,
      roofWidthScale: 0.8,
      tumblehome: 0.05,
      beltY: 0.62,
      upright: 0.5,
    },
    bodyTopY: 1.02,
  },
};

/** Which archetypes are open-wheel / need no cabin cap. */
export function shapeForArchetype(arch: CarArchetype): BodyShape {
  return SHAPE_PRESETS[arch] ?? SHAPE_PRESETS.sedan_tuner;
}

// ---------------------------------------------------------------------------
// Section generation
// ---------------------------------------------------------------------------

interface Station {
  z: number;
  halfWidth: number;
  floorY: number;
  shoulderY: number;
  topY: number;
  crown: number;
  rockerInset: number;
  roundness: number;
  /** Shoulder crease radius at this station (metres). */
  creaseRadius: number;
  /** Fender crown bulge at this station (metres). */
  fenderCrown: number;
  /** Bonnet/deck panel crown (metres). */
  topCrown: number;
  /** 0..1: how much of the arch cut applies at this station. */
  archFront: number;
  archRear: number;
}

function buildStations(shape: BodyShape): Station[] {
  const n = Math.max(6, shape.stations);
  const half = shape.length / 2;
  const stations: Station[] = [];

  // Plan-view taper: widest around the B-pillar (~u 0.45), narrowing at both
  // ends. A linear taper looks like a wedge; this uses smoothstep shoulders so
  // the profile has the subtle "hip" every real car has over the rear wheel.
  const widthProfile: [number, number][] = [
    [0.0, 1 - shape.tailTaper],
    [0.1, 1 - shape.tailTaper * 0.72],
    [0.24, 1 - shape.tailTaper * 0.18],
    [0.42, 1.0],
    [0.6, 1 - (shape.tailTaper + shape.noseTaper) * 0.12],
    [0.76, 1 - shape.noseTaper * 0.45],
    [0.9, 1 - shape.noseTaper * 0.78],
    [1.0, 1 - shape.noseTaper],
  ];

  // Upper surface: bonnet rising from the nose, scuttle step, then (for cars
  // with a cabin) the deck/boot. Values are absolute Y.
  const topProfile: [number, number][] = [
    [0.0, shape.deckY * 0.94],
    [0.06, shape.deckY * 0.99],
    [0.2, shape.deckY],
    [0.34, lerp(shape.deckY, shape.hoodY, 0.55)],
    [0.5, shape.hoodY * 1.02],
    [0.72, shape.hoodY],
    [0.86, shape.hoodY * 0.955],
    [0.94, shape.hoodY * 0.9],
    [1.0, shape.hoodY * 0.86],
  ];

  // The flank height (shoulder) tracks the top but sits a fixed distance below,
  // increasing slightly at the ends where the body closes down.
  const shoulderProfile: [number, number][] = [
    [0.0, shape.shoulderY * 0.94],
    [0.12, shape.shoulderY],
    [0.5, shape.shoulderY * 1.005],
    [0.82, shape.shoulderY],
    [1.0, shape.shoulderY * 0.93],
  ];

  // Station placement.
  //
  // Uniform spacing puts most of the surface resolution in the middle of the
  // doors and leaves the wheel arches - the two places the eye actually reads -
  // with a handful of sections. Worse, the arch cut is decided per triangle, so
  // too few stations along z makes the opening polygonal no matter how many
  // rings the section has.
  //
  // So the stations are placed in *world z*: a coarse distribution along the
  // body plus a guaranteed dense band of stations straddling each axle, which
  // is what makes the arch a circle.
  const zSet = new Set<number>();
  const addZ = (z: number) => {
    const clamped = Math.max(-half, Math.min(half, z));
    zSet.add(Math.round(clamped * 1e4) / 1e4);
  };
  const uniform = Math.max(6, n - 13);
  for (let i = 0; i < uniform; i++) addZ(-half + (i / (uniform - 1)) * shape.length);
  for (const axleZ of [shape.axleFrontZ, shape.axleRearZ]) {
    const span = shape.wheelRadius ? shape.wheelRadius * 1.5 : shape.archRadius * 1.5;
    // 11 stations across the arch: ~5 inside the opening and 3 either side, so
    // the cut edge lands within a couple of centimetres of the true circle.
    for (let i = 0; i <= 10; i++) addZ(axleZ - span + (i / 10) * span * 2);
  }
  const stationsZ = [...zSet].sort((a, b) => a - b);
  const stationsU = stationsZ.map((z) => (z + half) / shape.length);

  for (let i = 0; i < stationsZ.length; i++) {
    const u = stationsU[i];
    const z = stationsZ[i];
    const wf = profile(widthProfile, u);
    const halfWidth = (shape.width / 2) * wf;
    const topY = profile(topProfile, u);

    // The nose and tail tumble down: the body's leading edge is well below the
    // bonnet crown. Without this the front bumper is a vertical wall.
    const noseDrop = smoothstep(0.9, 1.0, u) * (shape.hoodY * 0.22);
    const tailDrop = smoothstep(0.0, 0.08, u) * 0;
    const topYAdj = topY - noseDrop - tailDrop;

    // Wheel-arch envelope at this station (0..1).
    const dzF = Math.abs(z - shape.axleFrontZ);
    const dzR = Math.abs(z - shape.axleRearZ);
    const archSpan = shape.archRadius * 1.15;
    const archFront = 1 - smoothstep(archSpan * 0.72, archSpan * 1.25, dzF);
    const archRear = 1 - smoothstep(archSpan * 0.72, archSpan * 1.25, dzR);

    // Fender bulge: body flares over the arches. This is *the* shape cue that
    // separates a car from a slab, and it is why we compute it per station
    // rather than per section.
    const bulge = shape.fenderBulge * (0.35 + 0.65 * Math.max(archFront, archRear));
    // End closure: the last 4% of the length at each end shrinks vertically so
    // the shell rounds off into a bumper instead of ending as a cut-off tube.
    const endClosure =
      1 - 0.42 * (smoothstep(0.955, 1.0, u) + (1 - smoothstep(0.0, 0.045, u)) * 0.9);
    const closedTop = topYAdj - (topYAdj - profile(shoulderProfile, u)) * (1 - endClosure);
    const closedFloor = shape.floor + (topYAdj - shape.floor) * (1 - endClosure) * 0.34;

    // Panel crown: real bonnets and decks are crowned across their width so the
    // sheet does not drum. It fades toward both ends, where the panel meets the
    // bumper radius and has to be nearly flat.
    const endFade = smoothstep(0, 0.1, u) * smoothstep(0, 0.07, 1 - u);
    const panelCrown = shape.topCrown * (0.45 + 0.55 * endFade);

    // Shoulder crease: crisper along the doors, softer where the body rolls
    // into the bumpers at each end.
    const creaseBase = shape.creaseRadius ?? 0.018;
    const creaseRadius = creaseBase * (1 + 1.6 * (1 - endFade));

    // Fender crown peaks over the axles - that hip over the rear wheel is the
    // most recognisable "car" shape cue in a three-quarter photo.
    const axlePeak = Math.max(archFront, archRear);
    const fenderCrown = (shape.fenderCrown ?? 0.012) * (0.25 + 0.75 * axlePeak) * endFade;

    stations.push({
      z,
      halfWidth: halfWidth + bulge,
      floorY: closedFloor + Math.max(archFront, archRear) * 0.02,
      shoulderY: profile(shoulderProfile, u) * (0.55 + 0.45 * endClosure),
      topY: closedTop,
      crown: shape.topCrown,
      rockerInset: shape.rockerInset,
      roundness: shape.sectionRoundness,
      creaseRadius,
      fenderCrown,
      topCrown: panelCrown,
      archFront,
      archRear,
    });
  }
  return stations;
}

/**
 * One closed cross-section, sampled `rings` times.
 *
 * WHY THIS IS NOT A SUPERELLIPSE ANY MORE
 * ---------------------------------------
 * The previous section was a single closed loop through eight control points,
 * resampled with a closed Catmull-Rom. It produced a perfectly smooth
 * "soap bar": no crease at the shoulder, no flat bonnet, no fender crown. That
 * is exactly the plastic look the realism pass is meant to kill, because a real
 * car's section is a *sequence of surfaces with different curvature* that meet
 * at deliberate lines:
 *
 *   floor ──(rocker tuck)── flank ──(fender crown)── shoulder crease ──
 *   ── haunch ── bonnet/deck plane (slightly crowned) ── centreline
 *
 * So the section is now generated as explicit segments:
 *
 *  - **Flank**: a superellipse blend from vertical at the rocker to the widest
 *    point at `shoulderY`. Its exponent is still per-archetype (a hatchback is
 *    soft, a muscle car is slab-sided).
 *  - **Fender crown**: a small outward bulge whose magnitude comes from the
 *    station (it peaks over the axles), which is what makes a car's hips read
 *    from three-quarters.
 *  - **Shoulder crease**: a *tangent discontinuity*. That crease catches a
 *    highlight line in a photo, and its absence is the single biggest reason a
 *    render reads as CG. The crease radius is controlled per archetype, so a
 *    1930s roadster gets a soft roll and a 1990s hatch gets a crisp edge.
 *  - **Bonnet/deck plane**: nearly flat, with a gentle crown across the width
 *    (real panels are never flat, they are crowned so they do not drum).
 *
 * The returned ring is ordered consistently (start at the top centreline, go
 * down the right flank, across the floor, up the left flank) so the loft can
 * assign material bands and the decal probe can address a ring fraction.
 */
function sectionPoints(st: Station, rings: number): { x: number; y: number }[] {
  const hw = Math.max(0.05, st.halfWidth);
  const yb = st.floorY;
  const ys = Math.max(yb + 0.03, st.shoulderY);
  const yt = Math.max(ys + 0.008, st.topY);
  const n = Math.max(1.6, st.roundness);
  const rock = st.rockerInset;
  const crease = Math.max(0.004, st.creaseRadius);
  const crown = st.crown;
  const upperCrown = st.topCrown;

  const h = yt - yb;
  const flankTop = Math.min(0.94, Math.max(0.42, (ys - yb) / Math.max(0.05, h)));

  // --- Half-section control points, right side, top → bottom --------------
  type P = { x: number; y: number; sharp?: boolean };
  const ctrl: P[] = [];

  // Top centreline. `upperCrown` is the panel crown (2-6 cm on a real car).
  ctrl.push({ x: 0, y: yt + upperCrown });

  // Bonnet/deck plane: a broad, shallow arc. The 0.55 point is where the panel
  // has fallen about a third of the crown; keeping it high is what makes the
  // bonnet look *flat* instead of domed.
  const planeEdgeX = hw * Math.pow(0.5, 2 / n) * 0.98;
  ctrl.push({ x: planeEdgeX * 0.55, y: yt + upperCrown * 0.52 });
  ctrl.push({ x: planeEdgeX, y: yt });

  // Shoulder: the crease. The point just below it is intentionally square to
  // the points above so the Catmull-Rom produces a tangent break here.
  ctrl.push({ x: hw * 0.985, y: ys + crease * 0.25, sharp: true });

  // Fender crown / haunch: widest point, slightly below the shoulder.
  const crownY = yb + h * flankTop;
  ctrl.push({ x: hw + st.fenderCrown, y: crownY });

  // Flank: superellipse from the widest point down to the rocker. Sampled
  // rather than hand-placed, because this is where the "softness" of the car
  // lives and it must vary with the archetype exponent.
  const flankSegs = 4;
  for (let i = 1; i <= flankSegs; i++) {
    const t = i / (flankSegs + 1);
    const y = crownY - (crownY - (yb + h * 0.055)) * t;
    // Superellipse: x stays near hw for most of the drop, then tucks in.
    const ease = Math.pow(t, 2 / n);
    const x = hw * (1 - 0.055 * ease) - rock * Math.pow(t, 1.4);
    ctrl.push({ x, y });
  }

  // Rocker: pulled in under the doors.
  ctrl.push({ x: hw * 0.9 - rock, y: yb + h * 0.035 });
  // Floor edge, then centreline.
  ctrl.push({ x: hw * 0.62, y: yb });
  ctrl.push({ x: 0, y: yb });

  // --- Build the closed loop -------------------------------------------------
  // We resample each segment individually so the crease stays a crease: a
  // single global Catmull-Rom would round it away. Segments flagged `sharp`
  // get a straight line into the corner and out of it.
  const loop: { x: number; y: number }[] = [];
  const pushSeg = (a: P, b: P, count: number, sharpStart: boolean, sharpEnd: boolean) => {
    for (let i = 0; i < count; i++) {
      const t = i / count;
      // Catmull-Rom is evaluated globally further down; here we only reserve
      // sample slots, so this function exists to keep the loop readable.
      void a; void b; void t; void sharpStart; void sharpEnd;
    }
  };
  void pushSeg;
  void loop;

  // Mirror the control polygon into a closed ring: right side top→bottom, then
  // left side bottom→top. Sharp points keep their duplicates so the Catmull-
  // Rom does not smooth them across the seam.
  const ring: P[] = [];
  for (const p of ctrl) ring.push(p);
  for (let i = ctrl.length - 2; i >= 1; i--) ring.push({ x: -ctrl[i].x, y: ctrl[i].y });
  // Close the loop back to the start (the centreline point is shared).
  const out: { x: number; y: number }[] = [];
  const m = ring.length;
  for (let k = 0; k < rings; k++) {
    const t = (k / rings) * m;
    const i1 = Math.floor(t) % m;
    const i2 = (i1 + 1) % m;
    const i0 = (i1 - 1 + m) % m;
    const i3 = (i2 + 1) % m;
    const f = t - Math.floor(t);
    const f2 = f * f;
    const f3 = f2 * f;
    const p0 = ring[i0];
    const p1 = ring[i1];
    const p2 = ring[i2];
    const p3 = ring[i3];
    // Clamp tangents at sharp (crease) vertices: m1/m2 become one-sided, so the
    // curve arrives and leaves linearly and the normal turns abruptly. This is
    // the crease.
    const sharp1 = !!p1.sharp;
    const sharp2 = !!p2.sharp;
    const m1x = sharp1 ? p2.x - p1.x : 0.5 * (p2.x - p0.x);
    const m1y = sharp1 ? p2.y - p1.y : 0.5 * (p2.y - p0.y);
    const m2x = sharp2 ? p2.x - p1.x : 0.5 * (p3.x - p1.x);
    const m2y = sharp2 ? p2.y - p1.y : 0.5 * (p3.y - p1.y);
    const cr = (b: number, m1: number, c: number, m2: number) =>
      (2 * f3 - 3 * f2 + 1) * b +
      (f3 - 2 * f2 + f) * m1 +
      (-2 * f3 + 3 * f2) * c +
      (f3 - f2) * m2;
    out.push({ x: cr(p1.x, m1x, p2.x, m2x), y: cr(p1.y, m1y, p2.y, m2y) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry assembly
// ---------------------------------------------------------------------------

export const MATERIAL_SLOT = { PAINT: 0, GLASS: 1, TRIM: 2, CHROME: 3 } as const;

export interface LoftResult {
  geometry: THREE.BufferGeometry;
  groups: { slot: number; start: number; count: number }[];
  /** Sampled outside surface points, for mounting accessories (mirrors etc). */
  probe: (u: number, v: number) => THREE.Vector3;
  stations: Station[];
}

interface LoftOptions {
  rings: number;
  glasshouse?: boolean;
  shape: BodyShape;
  /** Ring-fraction bands that should be shaded as glass (glasshouse only). */
  glassRegions?: { from: number; to: number }[];
}

/**
 * Builds the lofted body shell.
 *
 * Index groups are accumulated per material slot and concatenated at the end,
 * which keeps three.js to three draw calls per car regardless of the ring count.
 */
function buildLoft(shape: BodyShape, opts: LoftOptions): LoftResult {
  const stations = buildStations(shape);
  const rings = opts.rings;
  const cols = stations.length;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indexArrays: number[][] = [[], [], [], []];
  const indices = indexArrays;

  // Vertices are emitted on a grid so normals weld naturally across stations.
  const sectionCache: { x: number; y: number }[][] = stations.map((s) => sectionPoints(s, rings));

  for (let i = 0; i < cols; i++) {
    const st = stations[i];
    const pts = sectionCache[i];
    const u = cols > 1 ? i / (cols - 1) : 0;
    for (let k = 0; k < rings; k++) {
      const p = pts[k];
      positions.push(p.x, p.y, st.z);
      // Metric UVs: one texture tile per 1.6 m of surface, so paint flake size
      // is independent of the car's dimensions.
      uvs.push((k / rings) * 2.0, u * (shape.length / 1.6));
    }
  }

  const at = (i: number, k: number) => i * rings + (k % rings);
  const optGlassBelt = opts.glasshouse ? shape.cabin?.beltY ?? shape.shoulderY : 0;
  const optGlassRoof = opts.glasshouse ? shape.cabin?.roofY ?? shape.bodyTopY : 0;

  for (let i = 0; i < cols - 1; i++) {
    const stA = stations[i];
    const stMid = stations[i];
    for (let k = 0; k < rings; k++) {
      const k2 = (k + 1) % rings;
      const a = at(i, k);
      const b = at(i, k2);
      const c = at(i + 1, k);
      const d = at(i + 1, k2);
      // Winding chosen so the outward normal points away from the body axis.
      // The body shell is a single painted surface; all glazing lives on the
      // dedicated cabin loft, so every quad here is paint.
      const slot: number = MATERIAL_SLOT.PAINT;
      indices[slot].push(a, c, b, b, c, d);
    }
  }

  // --- End caps -----------------------------------------------------------
  // The loft is a tube; without a cap the nose and tail are open and you can
  // see straight into the model. A triangle fan around the section's centroid
  // closes each end. The stations at the extremes have already been shrunk by
  // the end-closure envelope, so the cap is a small, rounded face rather than a
  // full-height wall — which is what a bumper actually looks like from outside.
  for (const [idx, flip] of [
    [0, false],
    [cols - 1, true],
  ] as [number, boolean][]) {
    const st = stations[idx];
    const pts = sectionCache[idx];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
      cz += st.z;
    }
    const n = pts.length;
    cx /= n;
    cy /= n;
    cz /= n;
    const centreIdx = positions.length / 3;
    positions.push(cx, cy, cz);
    uvs.push(0.5, 0.5);
    for (let k = 0; k < rings; k++) {
      const a = idx * rings + k;
      const b = idx * rings + ((k + 1) % rings);
      // The cabin's end caps are the windscreen and backlight bases, so they
      // belong to the glass slot; the body's caps are bumper faces.
      const slot = opts.glasshouse ? MATERIAL_SLOT.GLASS : MATERIAL_SLOT.PAINT;
      if (flip) indices[slot].push(centreIdx, a, b);
      else indices[slot].push(centreIdx, b, a);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  // --- Vertex tint: the road-dirt gradient ---------------------------------
  // Every car in the real world is darker at the sills, inside the wheel arches
  // and behind the wheels than it is at waist height. This is not a decal: it is
  // a property of the surface, so it must follow the body through every pose and
  // through panel deformation. Baking it into a vertex colour attribute gives
  // exactly that, for free, with no extra draw call.
  const tint = new Float32Array(positions.length);
  const floorY = shape.floor;
  const shoulderY = shape.shoulderY;
  for (let i = 0; i < positions.length; i += 3) {
    const x = Math.abs(positions[i]);
    const y = positions[i + 1];
    const z = positions[i + 2];
    let brightness = 1;
    // Sill / lower-body dust: strong at the floor, gone by mid-flank.
    const low = 1 - Math.min(1, Math.max(0, (y - floorY) / Math.max(0.05, shoulderY - floorY)));
    brightness -= Math.pow(low, 1.7) * 0.34;
    // Wheel-arch shadowing: dirt is thrown up behind each wheel.
    for (const axle of [shape.axleFrontZ, shape.axleRearZ]) {
      const d = Math.abs(z - axle);
      if (d < shape.archRadius * 2.1 && y < shoulderY) {
        brightness -= Math.max(0, 1 - d / (shape.archRadius * 2.1)) * 0.1;
      }
    }
    // A little vertical grime banding from road spray, strongest at the sill.
    brightness -= (Math.sin(z * 7.3 + x * 3.1) * 0.5 + 0.5) * Math.pow(low, 2.4) * 0.05;
    // Slight overall occlusion under the arches, where light cannot reach.
    const inArch = y < floorY + 0.06 ? 0.9 : 1.0;
    const c = Math.max(0.32, Math.min(1, brightness)) * inArch;
    tint[i] = c;
    tint[i + 1] = c * 0.995;
    tint[i + 2] = c * 0.985;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));

  const groups: { slot: number; start: number; count: number }[] = [];
  const allIdx: number[] = [];
  for (let slot = 0; slot < indices.length; slot++) {
    if (indices[slot].length === 0) continue;
    groups.push({ slot, start: allIdx.length, count: indices[slot].length });
    for (const v of indices[slot]) allIdx.push(v);
  }
  geometry.setIndex(allIdx);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const probe = (u: number, v: number): THREE.Vector3 => {
    const fi = THREE.MathUtils.clamp(u, 0, 1) * (cols - 1);
    const i0 = Math.min(cols - 1, Math.floor(fi));
    const i1 = Math.min(cols - 1, i0 + 1);
    const f = fi - i0;
    const kf = ((v % 1) + 1) % 1 * rings;
    const k0 = Math.floor(kf) % rings;
    const k1 = (k0 + 1) % rings;
    const kfFrac = kf - Math.floor(kf);
    const p00 = sectionCache[i0][k0];
    const p01 = sectionCache[i0][k1];
    const p10 = sectionCache[i1][k0];
    const p11 = sectionCache[i1][k1];
    const x = lerp(lerp(p00.x, p01.x, kfFrac), lerp(p10.x, p11.x, kfFrac), f);
    const y = lerp(lerp(p00.y, p01.y, kfFrac), lerp(p10.y, p11.y, kfFrac), f);
    const z = lerp(stations[i0].z, stations[i1].z, f);
    return new THREE.Vector3(x, y, z);
  };

  return { geometry, groups, probe, stations };
}

/**
 * Glasshouse stations.
 *
 * The section is *degenerate* (zero height) at both ends, so the same loft
 * produces the windscreen and the backlight as ordinary quads. This is why the
 * screen-to-roof junction has no seam: it is literally the same surface.
 */
/**
 * Cabin loft.
 *
 * The cabin is NOT the body loft with a different material: it is its own
 * surface, because a real glasshouse has a different section entirely. It is a
 * "dome" that sits on the beltline: two flanks that tumble home toward the
 * centreline, a shallow-crowned roof between them, and an open underside that is
 * buried inside the body.
 *
 * Constructing it with an explicit, fixed ring layout is what allows exact
 * material assignment later: rings 0..nSide are the left glazing, the next nRoof
 * are the roof (paint) or the screen (glass, in the end zones), and the last
 * nSide are the right glazing. No heuristic classification, no stair-stepping.
 *
 * The section collapses to the beltline at both ends (t → 0), which is what
 * turns the same surface into the windscreen and the backlight.
 */
const CABIN_RINGS_SIDE = 9;
const CABIN_RINGS_ROOF = 14;

function cabinSection(
  halfWidth: number,
  beltY: number,
  roofY: number,
  tumblehome: number,
  crown: number
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const tw = Math.max(0.015, halfWidth - tumblehome);
  const h = Math.max(0, roofY - beltY);

  // Left flank: from the belt, leaning in as it rises. A small outward bow keeps
  // the glass from being a flat plane (real side glass is never perfectly flat).
  for (let i = 0; i < CABIN_RINGS_SIDE; i++) {
    const t = i / CABIN_RINGS_SIDE;
    const x = -halfWidth + (halfWidth - tw) * Math.pow(t, 0.78);
    const bow = Math.sin(t * Math.PI) * h * 0.012;
    pts.push({ x: x - bow, y: beltY + h * t });
  }
  // Roof: a shallow arc from left to right, crowned at the centre.
  for (let i = 0; i <= CABIN_RINGS_ROOF; i++) {
    const t = i / CABIN_RINGS_ROOF;
    const x = -tw + 2 * tw * t;
    const y = roofY + crown * Math.sin(t * Math.PI);
    pts.push({ x, y });
  }
  // Right flank, mirrored.
  for (let i = 1; i < CABIN_RINGS_SIDE; i++) {
    const t = 1 - i / CABIN_RINGS_SIDE;
    const x = halfWidth - (halfWidth - tw) * Math.pow(t, 0.78);
    const bow = Math.sin(t * Math.PI) * h * 0.012;
    pts.push({ x: x + bow, y: beltY + h * t });
  }
  return pts;
}

const CABIN_RING_COUNT = CABIN_RINGS_SIDE * 2 + CABIN_RINGS_ROOF + 1;

/**
 * Builds the cabin geometry with exact material regions.
 *
 * `zones` are [zStart, zEnd, tStart, tEnd, kind] where kind decides whether the
 * roof rings of that zone are glazing (screens) or paint (the roof panel).
 */
function buildCabinLoft(shape: BodyShape): LoftResult {
  const cab = shape.cabin!;
  const bodyStations = buildStations(shape);
  const halfWidthAt = (z: number) => {
    // Interpolate the body's plan width at this z, so the glasshouse always sits
    // inside the body it belongs to instead of floating wider than the doors.
    for (let i = 0; i < bodyStations.length - 1; i++) {
      const a = bodyStations[i];
      const b = bodyStations[i + 1];
      if (z >= a.z && z <= b.z) {
        const f = (z - a.z) / Math.max(1e-6, b.z - a.z);
        return lerp(a.halfWidth, b.halfWidth, f) * 0.9;
      }
    }
    return bodyStations[bodyStations.length - 1].halfWidth * 0.9;
  };

  type Zone = { from: number; to: number; tFrom: number; tTo: number; glassTop: boolean };
  const zones: Zone[] = [
    // Backlight: rises from the rear screen base to the rear of the roof.
    { from: cab.rearBaseZ, to: cab.rearTopZ, tFrom: 0, tTo: 1, glassTop: true },
    // Roof panel.
    { from: cab.rearTopZ, to: cab.frontTopZ, tFrom: 1, tTo: 1, glassTop: false },
    // Windscreen: falls from the front of the roof to the scuttle.
    { from: cab.frontTopZ, to: cab.frontBaseZ, tFrom: 1, tTo: 0, glassTop: true },
  ];

  const perZone = 5;
  const stations: Zone[] & { z: number; halfWidth: number; beltY: number; roofY: number }[] = [];
  void stations;

  const rows: { z: number; hw: number; beltY: number; roofY: number; roofIsGlass: boolean }[] = [];
  for (const zone of zones) {
    for (let i = 0; i <= perZone; i++) {
      // Skip the duplicated station where two zones meet.
      if (i === 0 && rows.length > 0) continue;
      const f = i / perZone;
      const z = lerp(zone.from, zone.to, f);
      const t = lerp(zone.tFrom, zone.tTo, f);
      // Smoothstep the height ramp so the screen-to-roof transition is a fillet
      // rather than a crease.
      const ts = t * t * (3 - 2 * t);
      const hw = halfWidthAt(z);
      rows.push({
        z,
        hw,
        beltY: cab.beltY,
        roofY: lerp(cab.beltY + 0.004, cab.roofY, ts),
        roofIsGlass: zone.glassTop,
      });
    }
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indexArrays: number[][] = [[], [], [], []];
  const ringCount = CABIN_RING_COUNT;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const t = (r.roofY - r.beltY) / Math.max(1e-6, cab.roofY - cab.beltY);
    const hw = r.hw * lerp(1.0, 0.985, t);
    const th = cab.tumblehome * (0.35 + 0.65 * t);
    const sec = cabinSection(hw, r.beltY, r.roofY, th, 0.012 * t + 0.004);
    for (let k = 0; k < ringCount; k++) {
      const p = sec[k % sec.length];
      positions.push(p.x, p.y, r.z);
      uvs.push((k / ringCount) * 2.2, (i / Math.max(1, rows.length - 1)) * (shape.length / 1.4));
    }
  }

  const at2 = (i: number, k: number) => i * ringCount + (k % ringCount);
  const RING_SIDE_L = CABIN_RINGS_SIDE * 2 + CABIN_RINGS_ROOF + 1; // full loop length
  void RING_SIDE_L;

  for (let i = 0; i < rows.length - 1; i++) {
    const roofIsGlass = rows[i].roofIsGlass && rows[i + 1].roofIsGlass;
    for (let k = 0; k < ringCount; k++) {
      let slot: number = MATERIAL_SLOT.PAINT;
      const isRoofRing = k >= CABIN_RINGS_SIDE && k <= CABIN_RINGS_SIDE + CABIN_RINGS_ROOF;
      const isGlassRing = k < CABIN_RINGS_SIDE || k > CABIN_RINGS_SIDE + CABIN_RINGS_ROOF;
      if (isRoofRing && roofIsGlass) slot = MATERIAL_SLOT.GLASS;
      else if (isGlassRing) slot = MATERIAL_SLOT.GLASS;
      else slot = MATERIAL_SLOT.PAINT;

      // A-pillar / C-pillar: the two rings either side of the roof boundary stay
      // painted through the screen zones, which is what gives the pillars their
      // width. Real pillars are 60–90 mm of solid body between the glass edges.
      const distToRoofEdge = Math.min(
        Math.abs(k - CABIN_RINGS_SIDE),
        Math.abs(k - (CABIN_RINGS_SIDE + CABIN_RINGS_ROOF))
      );
      if (distToRoofEdge <= 2 && slot === MATERIAL_SLOT.GLASS) slot = MATERIAL_SLOT.PAINT;

      const a = at2(i, k);
      const b = at2(i, k + 1);
      const c = at2(i + 1, k);
      const d = at2(i + 1, k + 1);
      indexArrays[slot].push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const tint = new Float32Array(positions.length).fill(1);
  geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));

  const groups: { slot: number; start: number; count: number }[] = [];
  const allIdx: number[] = [];
  for (let slot = 0; slot < indexArrays.length; slot++) {
    if (indexArrays[slot].length === 0) continue;
    groups.push({ slot, start: allIdx.length, count: indexArrays[slot].length });
    for (const v of indexArrays[slot]) allIdx.push(v);
  }
  geometry.setIndex(allIdx);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const probe = (u: number, v: number): THREE.Vector3 => {
    const fi = THREE.MathUtils.clamp(u, 0, 1) * (rows.length - 1);
    const i0 = Math.min(rows.length - 1, Math.floor(fi));
    const f = fi - i0;
    const r = rows[i0];
    const sec = cabinSection(r.hw, r.beltY, r.roofY, cab.tumblehome, 0.012);
    const kf = ((v % 1) + 1) % 1 * ringCount;
    const p = sec[Math.floor(kf) % sec.length];
    return new THREE.Vector3(p.x, p.y, r.z + f * 0);
  };

  return { geometry, groups, probe, stations: [] };
}

// ---------------------------------------------------------------------------
// Wheel arch carving
// ---------------------------------------------------------------------------

/**
 * Carves arches into a lofted shell and builds the inner liner.
 *
 * `direction` is +1 for the right flank, -1 for the left. Vertices whose
 * (z - axleZ, y - hubY) radius is inside the arch are projected onto the arch
 * circle and pulled slightly inward, which opens a genuine cavity in the
 * sheet metal. The liner is a half-tube of the same radius that closes it off
 * in dark plastic, so you can see *into* the arch the way you can on a real car.
 */
/**
 * Removes the shell faces that fall inside a wheel arch.
 *
 * WHY CUT, INSTEAD OF DEFORM
 * --------------------------
 * Deforming vertices onto the arch circle (what the previous build did) cannot
 * produce a circular opening, because the deformation is applied to a grid that
 * was not laid out along that circle: the ring samples land wherever they land.
 * The result is a keyhole with four corners, and no amount of extra resolution
 * hides it, because the corners are a topological property of the deformation.
 *
 * Cutting the triangles and covering the ragged edge with a modelled arch lip is
 * how production game cars are built: the opening is a real circle, and the lip
 * is a real surface with its own thickness and its own highlight.
 */
function cutArch(
  geometry: THREE.BufferGeometry,
  axleZ: number,
  hubY: number,
  radius: number,
  isRight: boolean,
  floorClampY = 0,
  archSink = 0
): void {
  const pos = geometry.attributes.position;
  const index = geometry.getIndex();
  if (!index) return;
  const keep: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const floorY = floorClampY;
  const deepInside = (x: number, y: number, z: number): boolean => {
    if (isRight ? x < 0.02 : x > -0.02) return false;
    if (y < floorY) return false;
    const r = Math.hypot(z - axleZ, y - (hubY - archSink));
    return r < radius * 0.80;
  };
  const inside = (x: number, y: number, z: number): boolean => {
    if (isRight ? x < 0.02 : x > -0.02) return false;
    // Never cut into the underbody. An arch opening that runs all the way under
    // the car turns into a jagged skirt of leftover floor triangles (which is
    // exactly the artefact that made the old arches look like torn paper), and
    // it would expose the floor pan. Stopping the cut a few millimetres above
    // the floor line leaves a straight sill edge, which is what a real car has.
    if (y < floorY) return false;
    const dz = z - axleZ;
    const dy = y - (hubY - archSink);
    return Math.hypot(dz, dy) < radius;
  };
  for (let i = 0; i < index.count; i += 3) {
    const i0 = index.getX(i);
    const i1 = index.getX(i + 1);
    const i2 = index.getX(i + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    // A face is removed when its centroid is inside the arch, *and* when any of
    // its vertices is deep inside. The second test matters: a kept face with one
    // vertex far inside the circle would later be snapped onto the rim and turn
    // into a long spike, which is the "comb" of teeth that appeared along the
    // sill in the previous pass.
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    const cz = (a.z + b.z + c.z) / 3;
    if (inside(cx, cy, cz)) continue;
    if (deepInside(a.x, a.y, a.z) || deepInside(b.x, b.y, b.z) || deepInside(c.x, c.y, c.z)) continue;
    keep.push(i0, i1, i2);
  }
  // Snap the leftover boundary vertices onto the exact arch circle.
  //
  // Removing whole triangles leaves an edge made of straight chords that can sit
  // a third of a triangle inside the true circle, so the opening is a polygon,
  // not a circle. Every vertex that is still referenced by a kept face and lies
  // inside the circle is therefore projected radially onto it: the fringe
  // triangles then reach exactly to the circle, and their edges are radial, so
  // the visible outline is a true arc.
  const referenced = new Uint8Array(pos.count);
  for (const i of keep) referenced[i] = 1;
  for (let i = 0; i < pos.count; i++) {
    if (!referenced[i]) continue;
    const x = pos.getX(i);
    if (isRight ? x < 0.02 : x > -0.02) continue;
    const y = pos.getY(i);
    if (y < floorY) continue;
    const z = pos.getZ(i);
    const dz = z - axleZ;
    const dy = y - (hubY - archSink);
    const r = Math.hypot(dz, dy);
    // Vertices in the outer fringe are pulled out to the rim; ones deeper than
    // that belong to faces that were already removed and must be left where they
    // are (they are not referenced by any kept face).
    if (r < 1e-5 || r >= radius || y > hubY + radius * 1.02) continue;
    const k = radius / r;
    pos.setY(i, hubY - archSink + dy * k);
    pos.setZ(i, axleZ + dz * k);
  }
  pos.needsUpdate = true;

  geometry.setIndex(keep);
  // Groups are rebuilt by the caller; the shell is a single paint region.
  geometry.clearGroups();
  geometry.addGroup(0, keep.length, MATERIAL_SLOT.PAINT);
}

/**
 * The arch opening: a flared painted lip plus a dark wheel well.
 *
 * Three problems have to be solved at once here, and each one needs its own
 * surface:
 *
 *  1. The cut edge of the shell is jagged (it is a triangle cut, so its edge can
 *     be up to one triangle away from the true circle). The **lip** therefore
 *     has a larger radius than the opening (R*1.13) and sits 8 mm proud of the
 *     body, so it physically covers the cut.
 *  2. Behind the opening there must be a *well*, not a window into the opposite
 *     flank. The **well** is a cylinder closed at the inner end, dark and
 *     unlit — exactly what you see inside a real arch.
 *  3. The lip has to follow the actual skin, which tucks in at the rocker and
 *     flares at the shoulder. It asks `skinXAt` for the real surface width at
 *     every point instead of assuming a vertical wall.
 */
function buildArchOpening(
  axleZ: number,
  hubY: number,
  radius: number,
  halfWidth: number,
  isRight: boolean,
  skinXAt: (z: number, y: number) => number = () => halfWidth,
  floorY = 0
): { lip: THREE.BufferGeometry; well: THREE.BufferGeometry } {
  const segs = 40;
  const sign = isRight ? 1 : -1;
  const rLipOuter = radius * 1.13;
  const rLipInner = radius * 0.96;
  const lipBands = 3;
  const wellBands = 3;

  const mk = (p: number[], i: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(i);
    g.computeVertexNormals();
    return g;
  };

  const lipP: number[] = [];
  const lipI: number[] = [];
  // The sweep stops at the sill: an arch that continues below the floor line
  // pokes out under the car and reads as a fringe of teeth along the rocker.
  const sillY = floorY + 0.006;
  const ring = (rad: number, xFor: (z: number, y: number) => number) => {
    for (let s = 0; s <= segs; s++) {
      const a = Math.PI * (-0.08 + 1.16 * (s / segs));
      const z = axleZ - Math.cos(a) * rad;
      const y = Math.max(sillY, hubY + Math.sin(a) * rad);
      lipP.push(xFor(z, y), y, z);
    }
  };
  for (let b = 0; b < lipBands; b++) {
    const t = b / (lipBands - 1);
    const rad = lerp(rLipOuter, rLipInner, t);
    // Out at the skin, then roll down into the well over 5 cm.
    ring(rad, (z, y) => sign * (skinXAt(z, y) + 0.008 - 0.055 * Math.pow(t, 0.55)));
  }
  for (let b = 0; b < lipBands - 1; b++) {
    for (let s = 0; s < segs; s++) {
      const i0 = b * (segs + 1) + s;
      const i1 = i0 + 1;
      const i2 = i0 + (segs + 1);
      const i3 = i2 + 1;
      if (isRight) lipI.push(i0, i2, i1, i1, i2, i3);
      else lipI.push(i0, i1, i2, i1, i3, i2);
    }
  }

  // Well: a tube from just inside the lip to the inner wall, then a cap. Dark
  // trim material, so it reads as shadow rather than as a hole.
  const wellP: number[] = [];
  const wellI: number[] = [];
  const xStart = sign * (halfWidth - 0.05);
  const xEnd = sign * (halfWidth * 0.42);
  const wellSegs = 24;
  for (let b = 0; b < wellBands; b++) {
    const t = b / (wellBands - 1);
    const x = lerp(xStart, xEnd, t);
    const rad = radius * lerp(0.96, 0.9, t);
    for (let s = 0; s <= wellSegs; s++) {
      const a = Math.PI * (-0.02 + 1.04 * (s / wellSegs));
      wellP.push(x, Math.max(floorY + 0.004, hubY + Math.sin(a) * rad), axleZ - Math.cos(a) * rad);
    }
  }
  for (let b = 0; b < wellBands - 1; b++) {
    for (let s = 0; s < wellSegs; s++) {
      const i0 = b * (wellSegs + 1) + s;
      const i1 = i0 + 1;
      const i2 = i0 + (wellSegs + 1);
      const i3 = i2 + 1;
      if (isRight) wellI.push(i0, i1, i2, i1, i3, i2);
      else wellI.push(i0, i2, i1, i1, i2, i3);
    }
  }
  // Inner wall cap: a fan closing the far end of the tube.
  const lastRow = (wellBands - 1) * (wellSegs + 1);
  const capCentre = wellP.length / 3;
  wellP.push(xEnd, hubY, axleZ);
  for (let s = 0; s < wellSegs; s++) {
    const a = lastRow + s;
    const b2 = lastRow + s + 1;
    if (isRight) wellI.push(capCentre, b2, a);
    else wellI.push(capCentre, a, b2);
  }

  return { lip: mk(lipP, lipI), well: mk(wellP, wellI) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuiltBodyShell {
  group: THREE.Group;
  lower: THREE.Mesh;
  shape: BodyShape;
  cabin: THREE.Mesh | null;
  liners: THREE.Mesh[];
  /** Geometric helpers for mounting accessories. */
  halfWidth: number;
  length: number;
  cabinFrontZ: number;
  cabinRearZ: number;
  roofY: number;
  hoodY: number;
  deckY: number;
  shoulderY: number;
  floorY: number;
  axleFrontZ: number;
  axleRearZ: number;
  archRadius: number;
  wheelRadius: number;
  /**
   * Half-width of the *painted surface* at a given z, in metres.
   *
   * Every bolt-on part (lamps, plate, grille, diffuser) has to sit on this
   * number rather than on `width/2`, because a body narrows hard at the bumpers:
   * a tail lamp sized from the maximum width sticks out of the tail by 10 cm and
   * reads as a black brick glued to the back of the car, which is exactly what
   * the old build did.
   */
  halfWidthAtZ: (z: number) => number;
  /** Surface point at (u along the body, v around the section). */
  probe: (u: number, v: number) => THREE.Vector3;
  /**
   * z of the body surface at a given (x, y), approaching from the front (+) or
   * the rear (-). Returns the outermost z whose cross-section contains the
   * point. This is what lets lamps, grilles and plates sit *on* the nose,
   * instead of being placed at ±length/2 where the body has already tapered
   * away and floating in mid-air.
   */
  surfaceZAt: (x: number, y: number, fromFront?: boolean) => number;
}

export interface BodyMaterials {
  paint: THREE.Material;
  glass: THREE.Material;
  trim: THREE.Material;
  chrome?: THREE.Material;
}

/**
 * Builds the complete painted shell for a shape, with arches carved and liners
 * installed. Returns a group already positioned so y=0 is the ground.
 */
export function buildBodyShell(shape: BodyShape, mats: BodyMaterials): BuiltBodyShell {
  const group = new THREE.Group();
  // Ring resolution: the wheel arch is carved out of this grid, so the ring
  // count *is* the arch's polygon count. 40 left the arch lip with ~6 samples
  // per quadrant, which is why it read as a jagged box instead of an opening.
  const ringCount = 80;

  const lower = buildLoft(shape, { rings: ringCount, shape });

  // Open the wheel arches: the shell faces inside each arch are removed and
  // replaced by a modelled lip + liner, so the opening is a real circle with a
  // real edge instead of a keyhole dent.
  const archR = shape.wheelRadius ? shape.wheelRadius * 1.085 : shape.archRadius;
  const hubY = shape.wheelRadius ? shape.wheelRadius : shape.archRadius * 0.98 + 0.02;
  const halfWidth = shape.width / 2;
  const archGeos: { lip: THREE.BufferGeometry; well: THREE.BufferGeometry }[] = [];
  // Skin probe: builds the exact cross-section used by the loft at this z and
  // returns its outermost x at the given height. Without this the arch lip is a
  // vertical arc that pokes out of the tucked rocker and floats off the flank.
  const stationsForWidth = lower.stations;
  const skinXAt = (z: number, y: number): number => {
    let stA = stationsForWidth[0];
    let stB = stationsForWidth[0];
    let f = 0;
    for (let i = 0; i < stationsForWidth.length - 1; i++) {
      const a = stationsForWidth[i];
      const b = stationsForWidth[i + 1];
      if (z >= a.z && z <= b.z) {
        stA = a;
        stB = b;
        f = (z - a.z) / Math.max(1e-6, b.z - a.z);
        break;
      }
      stA = stationsForWidth[stationsForWidth.length - 1];
      stB = stA;
    }
    const blend = (k: 'halfWidth' | 'floorY' | 'shoulderY' | 'topY' | 'crown' | 'rockerInset' | 'roundness' | 'creaseRadius' | 'fenderCrown' | 'topCrown'): number =>
      THREE.MathUtils.lerp(
        stA[k] as number,
        stB[k] as number,
        f
      );
    const st: Station = {
      z,
      halfWidth: blend('halfWidth'),
      floorY: blend('floorY'),
      shoulderY: blend('shoulderY'),
      topY: blend('topY'),
      crown: blend('crown'),
      rockerInset: blend('rockerInset'),
      roundness: blend('roundness'),
      creaseRadius: blend('creaseRadius'),
      fenderCrown: blend('fenderCrown'),
      topCrown: blend('topCrown'),
      archFront: 0,
      archRear: 0,
    };
    // Sample the section and take the WIDEST x within a small band around the
    // requested height. A nearest-point search cannot be used here: near the
    // sill and the floor the section is nearly horizontal, so x is
    // multivalued and "nearest y" jumps between the flank and the floor edge,
    // which made the arch lip oscillate and tear.
    const pts = sectionPoints(st, 200);
    const band = 0.05;
    let bestX = 0;
    for (const p of pts) {
      if (p.x <= 0) continue;
      if (Math.abs(p.y - y) > band) continue;
      if (p.x > bestX) bestX = p.x;
    }
    return bestX > 0 ? bestX : st.halfWidth;
  };
  const openings: [number, boolean][] = [
    [shape.axleFrontZ, true],
    [shape.axleFrontZ, false],
    [shape.axleRearZ, true],
    [shape.axleRearZ, false],
  ];
  // The shell surface is deliberately NOT cut.
  //
  // Cutting a circular opening out of a quad grid always leaves a polygonal,
  // slightly ragged edge, and every attempt to repair it (snapping the fringe
  // vertices onto the circle, overlapping it with a lip) moves the raggedness
  // rather than removing it. The result is the "sawtooth" silhouette that was
  // visible along the sill.
  //
  // Production cars solve this by not cutting at all: the painted flank stays
  // closed, and the arch is built as a flared lip ring plus a dark tub that sit
  // *on* the surface. The tyre then fills the ring, and the gap between the
  // tyre and the lip is in shadow, which is what the eye reads as an opening.
  // The advantage is that the body remains a single watertight C1 surface.
  lower.geometry.computeVertexNormals();
  lower.geometry.computeBoundingSphere();

  // The wheel well is seen from outside, so its *inner* surface faces the
  // camera. A double-sided dark material means the winding of the tube can never
  // show as a bright sliver, which is what the single-sided version did.
  const wellMat = (mats.trim as THREE.MeshStandardMaterial).clone();
  wellMat.side = THREE.DoubleSide;
  wellMat.color = new THREE.Color(0x0a0b0d);

  const lowerMat = [mats.paint, mats.glass, mats.trim, mats.chrome ?? mats.trim];
  const lowerMesh = new THREE.Mesh(lower.geometry, lowerMat);
  // The loft emits [paint, glass, trim, chrome] groups in that order already.
  for (const g of lower.groups) lowerMesh.geometry.addGroup(g.start, g.count, g.slot);
  lowerMesh.castShadow = true;
  lowerMesh.receiveShadow = true;
  // The decoded surface is exposed so decals (stripes, shut lines) can be
  // generated *on* the body rather than floating planes near it.
  lowerMesh.userData.probe = lower.probe;
  lowerMesh.material = lowerMat;
  group.add(lowerMesh);

  // Arch lips: one painted lip + one dark liner per wheel. They sit exactly on
  // the cut, so the shell's cut edge is never visible.
  for (const [axleZ, right] of openings) {
    const built = buildArchOpening(axleZ, hubY, archR, halfWidth, right, skinXAt, shape.floor);
    archGeos.push(built);
    const lip = new THREE.Mesh(built.lip, mats.paint);
    lip.castShadow = true;
    lip.receiveShadow = true;
    const well = new THREE.Mesh(built.well, wellMat);
    well.receiveShadow = true;
    group.add(lip, well);
  }

  // ---- Glasshouse ---------------------------------------------------------
  let cabinMesh: THREE.Mesh | null = null;
  if (shape.cabin) {
    const cab = buildCabinLoft(shape);
    cabinMesh = new THREE.Mesh(cab.geometry, lowerMat);
    for (const g of cab.groups) cabinMesh.geometry.addGroup(g.start, g.count, g.slot);
    cabinMesh.castShadow = true;
    cabinMesh.receiveShadow = true;
    // Reveal the probe so decals and accessories can hug the glass surface too.
    cabinMesh.userData.probe = cab.probe;
    group.add(cabinMesh);
  }

  // ---- Arch liners --------------------------------------------------------
  // The well geometry is the liner now; it is kept in the returned list so the
  // renderer can still tweak it (and so nothing that reads `liners` breaks).
  const liners: THREE.Mesh[] = [];
  const halfW = shape.width / 2;
  for (const child of group.children) {
    const m = child as THREE.Mesh;
    if (m.isMesh && m.material === mats.trim) liners.push(m);
  }

  const cab = shape.cabin;
  return {
    group,
    lower: lowerMesh,
    shape,
    cabin: cabinMesh,
    liners,
    halfWidth: halfW,
    length: shape.length,
    cabinFrontZ: cab ? cab.frontBaseZ : 0,
    cabinRearZ: cab ? cab.rearBaseZ : 0,
    roofY: cab ? cab.roofY : shape.bodyTopY,
    hoodY: shape.hoodY,
    deckY: shape.deckY,
    shoulderY: shape.shoulderY,
    floorY: shape.floor,
    axleFrontZ: shape.axleFrontZ,
    axleRearZ: shape.axleRearZ,
    archRadius: archR,
    wheelRadius: shape.wheelRadius ?? archR,
    halfWidthAtZ: (z: number) => skinXAt(z, (shape.shoulderY ?? 0.7)),
    probe: lower.probe,
    surfaceZAt: (x: number, y: number, fromFront = true) => {
      const target = Math.abs(x);
      const ordered = fromFront ? [...stationsForWidth].reverse() : [...stationsForWidth];
      for (const st of ordered) {
        const p = sectionPoints(st, 64);
        let widest = 0;
        for (const q of p) {
          if (q.x <= 0) continue;
          if (Math.abs(q.y - y) > 0.02) continue;
          if (q.x > widest) widest = q.x;
        }
        if (widest >= target) return st.z;
      }
      return fromFront ? shape.length / 2 : -shape.length / 2;
    },
  };
}

// ---------------------------------------------------------------------------
// Small accessory geometry — all built by revolution/extrusion, never boxes
// ---------------------------------------------------------------------------

/** A rounded, tapered extrusion used for bumpers, splitters, side skirts. */
export function roundedSlab(
  width: number,
  height: number,
  depth: number,
  radius: number,
  segs = 12
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, Math.min(w, h) * 0.95);
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: r * 0.35,
    bevelSize: r * 0.35,
    bevelSegments: Math.max(2, Math.floor(segs / 4)),
    curveSegments: segs,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Rear-view mirror: the housing is a lofted pocket, not a cube. Real mirrors are
 * three surfaces meeting at a crease, and they read as such in silhouette.
 */
export function mirrorGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const segs = 10;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    // Cross-section: a rounded teardrop, narrow at the inboard end.
    const r = 0.028 + 0.02 * Math.sin(t * Math.PI);
    pts.push(new THREE.Vector2(Math.max(0.004, r), -0.052 + t * 0.104));
  }
  const geo = new THREE.LatheGeometry(pts, 14);
  geo.scale(1, 1, 0.72);
  geo.computeVertexNormals();
  return geo;
}

/** Exhaust tip: rolled double-wall tube with an inner soot cone. */
export function exhaustTipGeometry(radius: number, length: number): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(radius * 0.86, 0),
    new THREE.Vector2(radius, 0),
    new THREE.Vector2(radius * 1.02, length * 0.86),
    new THREE.Vector2(radius * 0.94, length),
    new THREE.Vector2(radius * 0.82, length),
    new THREE.Vector2(radius * 0.8, length * 0.1),
    new THREE.Vector2(radius * 0.86, 0),
  ];
  const geo = new THREE.LatheGeometry(profile, 20);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Headlight lens with a sculpted reflector behind it.
 *
 * The reason headlights look fake in games is that they are usually a plane with
 * an emissive material. Real ones have a *depth*: the lens is a shallow
 * elliptical dome, and behind it the reflector is a parabolic dish whose inner
 * surface is what you actually see (a hot spot plus a ring). Both are modelled.
 */
export function headlightAssembly(
  width: number,
  height: number,
  depth: number
): { lens: THREE.BufferGeometry; reflector: THREE.BufferGeometry } {
  const lensPts: THREE.Vector2[] = [];
  const segs = 9;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    // Parabolic dome: flatter in the middle, curving at the rim.
    lensPts.push(new THREE.Vector2((width / 2) * (1 - t * t * 0.98), depth * (1 - Math.pow(t, 3.2))));
  }
  // Lathe revolves around Y with the profile's x as radius; rotate so the axis
  // of revolution becomes +Z (the direction the lamp points) and squash the
  // circular cross-section into the lamp's aspect ratio.
  const lens = new THREE.LatheGeometry(lensPts, 26);
  lens.rotateX(Math.PI / 2);
  lens.scale(1, height / Math.max(1e-4, width), 1);
  lens.computeVertexNormals();

  const refPts: THREE.Vector2[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    refPts.push(new THREE.Vector2((width / 2) * 0.92 * t, depth * 0.4 * (t * t) - depth * 0.42));
  }
  const reflector = new THREE.LatheGeometry(refPts, 26);
  reflector.rotateX(Math.PI / 2);
  reflector.scale(1, height / Math.max(1e-4, width), 1);
  reflector.computeVertexNormals();
  return { lens, reflector };
}

/**
 * Door mirror stem: a swept tube. Also used for wiper arms and antennae, which
 * are the small details that make a car feel instrumented rather than sculpted.
 */
export function sweptTube(
  points: { x: number; y: number; z: number }[],
  radius: number,
  radialSegs = 6
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
  return new THREE.TubeGeometry(curve, Math.max(4, points.length * 3), radius, radialSegs, false);
}
