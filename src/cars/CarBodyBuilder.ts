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

  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const z = -half + u * shape.length;
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

    stations.push({
      z,
      halfWidth: halfWidth + bulge,
      floorY: closedFloor + Math.max(archFront, archRear) * 0.02,
      shoulderY: profile(shoulderProfile, u) * (0.55 + 0.45 * endClosure),
      topY: closedTop,
      crown: shape.topCrown,
      rockerInset: shape.rockerInset,
      roundness: shape.sectionRoundness,
      archFront,
      archRear,
    });
  }
  return stations;
}

/**
 * One closed cross-section, sampled `rings` times.
 *
 * Construction: eight control points describe half the section (floor edge →
 * rocker → widest flank → shoulder → crown → centreline), mirrored, then a
 * closed Catmull-Rom resamples them. The `roundness` exponent shapes the
 * superellipse that the flank-to-crown transition follows:
 *
 *   t^(2/n) blends from round (n=2) through the soft "egg" of a hatchback
 *   (n≈3.4) to the slab-sided look of a muscle car (n≈4.5).
 */
function sectionPoints(st: Station, rings: number): { x: number; y: number }[] {
  const hw = st.halfWidth;
  const yb = st.floorY;
  const ys = st.shoulderY;
  const yt = Math.max(ys + 0.012, st.topY);
  const n = st.roundness;
  const rock = st.rockerInset;

  const height = yt - yb;
  const flankFrac = Math.min(0.92, Math.max(0.45, (ys - yb) / Math.max(0.05, height)));

  const ctrl: { x: number; y: number }[] = [];
  // Floor, from centreline outward.
  ctrl.push({ x: 0, y: yb });
  ctrl.push({ x: hw * 0.5, y: yb });
  // Rocker: pulled inward so the sill tucks under the doors.
  ctrl.push({ x: hw * 0.93 - rock, y: yb + height * 0.055 });
  // Flank, widest point.
  ctrl.push({ x: hw - rock * 0.35, y: yb + height * flankFrac });
  // Shoulder: rounds over into the bonnet/roof.
  ctrl.push({ x: hw * 0.965, y: ys });
  // Crown, thin toward the centreline with superellipse easing.
  const crownY = yt;
  const shoulderBend = Math.pow(0.82, 2 / Math.max(1.2, n));
  ctrl.push({ x: hw * shoulderBend, y: lerp(ys, crownY, 0.55) });
  ctrl.push({ x: hw * Math.pow(0.42, 2 / Math.max(1.2, n)), y: crownY });
  ctrl.push({ x: 0, y: crownY + st.crown });

  // Mirror (skip the duplicated centreline points) to close the loop.
  const loop: { x: number; y: number }[] = [...ctrl];
  for (let i = ctrl.length - 2; i >= 1; i--) {
    loop.push({ x: -ctrl[i].x, y: ctrl[i].y });
  }

  // Closed Catmull-Rom resample.
  const out: { x: number; y: number }[] = [];
  const m = loop.length;
  for (let k = 0; k < rings; k++) {
    const t = (k / rings) * m;
    const i1 = Math.floor(t) % m;
    const i2 = (i1 + 1) % m;
    const i0 = (i1 - 1 + m) % m;
    const i3 = (i2 + 1) % m;
    const f = t - Math.floor(t);
    const f2 = f * f;
    const f3 = f2 * f;
    const p0 = loop[i0];
    const p1 = loop[i1];
    const p2 = loop[i2];
    const p3 = loop[i3];
    const cr = (a: number, b: number, c: number, d: number) =>
      0.5 *
      (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
    out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) });
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
function carveArch(
  geometry: THREE.BufferGeometry,
  axleZ: number,
  hubY: number,
  radius: number,
  isRight: boolean
): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i];
    if (isRight ? x <= 0.02 : x >= -0.02) continue;
    const y = arr[i + 1];
    const z = arr[i + 2];
    const dz = z - axleZ;
    const dy = y - hubY;
    const r = Math.hypot(dz, dy);
    // Only the outer skin is carved; the floor and the crown are left alone.
    if (r > radius || y > hubY + radius * 0.92) continue;
    if (r < 1e-5) continue;
    const scale = radius / r;
    // Push onto the circle, then tuck the lip inward so it reads as a rolled
    // edge rather than a paper cut.
    const newDz = dz * scale;
    const newDy = dy * scale;
    arr[i + 2] = axleZ + newDz;
    arr[i + 1] = hubY + newDy;
    arr[i] = x * 0.97;
  }
  pos.needsUpdate = true;
}

function buildArchLiner(
  axleZ: number,
  hubY: number,
  radius: number,
  halfWidth: number,
  isRight: boolean
): THREE.BufferGeometry {
  const segs = 22;
  const span = 18;
  const positions: number[] = [];
  const indices: number[] = [];
  const xInner = (isRight ? 1 : -1) * (halfWidth * 0.52);
  const xOuter = (isRight ? 1 : -1) * (halfWidth * 0.995);
  for (let s = 0; s <= segs; s++) {
    // Slightly more than a half circle, so the liner meets the sill and the
    // shoulder instead of stopping in mid-air.
    const a = Math.PI * (0.02 + 0.96 * (s / segs));
    const z = axleZ - Math.cos(a) * radius;
    const y = hubY + Math.sin(a) * radius * 0.98;
    positions.push(xInner, y, z, xOuter, y, z);
  }
  for (let s = 0; s < segs; s++) {
    const b = s * 2;
    if (isRight) indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    else indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  void span;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
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
  const ringCount = 40;

  const lower = buildLoft(shape, { rings: ringCount, shape });

  // Carve arches on both flanks.
  const archR = shape.wheelRadius ? shape.wheelRadius * 1.075 : shape.archRadius;
  const hubY = shape.wheelRadius ? shape.wheelRadius : shape.archRadius * 0.98 + 0.02;
  carveArch(lower.geometry, shape.axleFrontZ, hubY, archR, true);
  carveArch(lower.geometry, shape.axleFrontZ, hubY, archR, false);
  carveArch(lower.geometry, shape.axleRearZ, hubY, archR, true);
  carveArch(lower.geometry, shape.axleRearZ, hubY, archR, false);
  lower.geometry.computeVertexNormals();
  lower.geometry.computeBoundingSphere();

  const lowerMat = [mats.paint, mats.glass, mats.trim, mats.chrome ?? mats.trim];
  const lowerMesh = new THREE.Mesh(lower.geometry, lowerMat);
  // The loft emits [paint, glass, trim, chrome] groups in that order already.
  for (const g of lower.groups) lowerMesh.geometry.addGroup(g.start, g.count, g.slot);
  lowerMesh.castShadow = true;
  lowerMesh.receiveShadow = true;
  // The decoded surface is exposed so decals (stripes, shut lines) can be
  // generated *on* the body rather than floating planes near it.
  lowerMesh.userData.probe = lower.probe;
  group.add(lowerMesh);

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
  const liners: THREE.Mesh[] = [];
  const halfW = shape.width / 2;
  for (const [axleZ, sign] of [
    [shape.axleFrontZ, 1],
    [shape.axleFrontZ, -1],
    [shape.axleRearZ, 1],
    [shape.axleRearZ, -1],
  ] as [number, number][]) {
    const geo = buildArchLiner(axleZ, hubY, archR, halfW, sign > 0);
    const mesh = new THREE.Mesh(geo, mats.trim);
    mesh.receiveShadow = true;
    liners.push(mesh);
    group.add(mesh);
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
