/**
 * CAMERA RIG — pure framing math for the race camera.
 * ---------------------------------------------------
 * Extracted from VelocityEngine so the horizon-level guarantee and the
 * portrait-screen compensation can be unit-tested without a WebGL context.
 *
 * The two defects this module exists to prevent:
 *
 *  1. "Tela torta" (tilted screen). The chase camera used to write
 *     `camera.rotation.z` directly after `lookAt()`. With Three.js' default
 *     XYZ Euler order that is *not* a pure roll around the view axis once the
 *     camera is pitched, so the horizon tilted by an amount that varied with
 *     the corner — and the clamp allowed ±2.6°, which reads as a crooked
 *     screen. The fix is twofold: apply the roll with `camera.rotateZ()`
 *     (rotation around the camera's local Z, i.e. the view axis) and clamp
 *     the magnitude to ±0.8° so the horizon can never visibly tilt.
 *
 *  2. Portrait / narrow screens. A fixed vertical FOV keeps the horizontal
 *     field of view proportional to the aspect ratio, so on a portrait phone
 *     the car is cropped on both sides. `fitVerticalFov` holds the
 *     *horizontal* FOV constant instead, widening the vertical FOV as the
 *     aspect shrinks.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export const REFERENCE_ASPECT = 16 / 9;

/** Maximum chase-camera roll, in radians (~0.8°). The horizon stays level. */
export const MAX_CHASE_ROLL_RAD = 0.014;

/**
 * Vertical FOV (degrees) that preserves the horizontal FOV of `baseFovDeg`
 * measured at the reference 16:9 aspect. On wider screens the vertical FOV
 * shrinks slightly; on portrait screens it grows so the car is never cropped.
 *
 * 96° vertical is the ceiling: a 9:16 phone with a 100° horizontal field is
 * already a fisheye, and going further is what made the old build look
 * distorted. On such a screen the vertical FOV cap wins and a little width is
 * traded away — the alternative (upscaling the vertical FOV without limit) is
 * nauseating in a racing game.
 */
export function fitVerticalFov(baseFovDeg: number, aspect: number): number {
  const safeAspect = Math.max(0.4, Math.min(3.2, aspect || REFERENCE_ASPECT));
  const halfTanV = Math.tan((baseFovDeg / 2) * DEG2RAD);
  const halfTanH = halfTanV * REFERENCE_ASPECT;
  const fittedHalfV = Math.atan(halfTanH / safeAspect);
  const fitted = fittedHalfV * 2 * RAD2DEG;
  return Math.max(baseFovDeg, Math.min(MAX_VERTICAL_FOV_DEG, fitted));
}

/** Hard ceiling for the compensated vertical FOV (degrees). */
export const MAX_VERTICAL_FOV_DEG = 96;

/** Horizontal FOV (degrees) produced by a vertical FOV at a given aspect. */
export function horizontalFov(vFovDeg: number, aspect: number): number {
  const safeAspect = Math.max(0.05, aspect || REFERENCE_ASPECT);
  return 2 * Math.atan(Math.tan((vFovDeg / 2) * DEG2RAD) * safeAspect) * RAD2DEG;
}

/**
 * Chase-camera roll from body roll. Returns a signed angle in radians whose
 * magnitude is hard-clamped to MAX_CHASE_ROLL_RAD. When `enabled` is false
 * (or the body roll is not finite) the horizon is exactly level: 0.
 */
export function computeChaseRoll(rollRad: number, enabled: boolean): number {
  if (!enabled || !Number.isFinite(rollRad)) return 0;
  const roll = -rollRad * 0.1;
  const clamped = Math.max(-MAX_CHASE_ROLL_RAD, Math.min(MAX_CHASE_ROLL_RAD, roll));
  return clamped === 0 ? 0 : clamped; // normalize -0
}

/**
 * Speed-aware chase boom. The boom stretches and rises slightly with speed
 * and the look-ahead grows so fast corners stay in frame.
 */
export function chaseBoom(
  speedKmh: number,
  far: boolean
): { dist: number; height: number; lookAhead: number } {
  const speedT = Math.max(0, Math.min(1, speedKmh / 260));
  const dist = (far ? 8.6 : 6.1) + speedT * (far ? 2.4 : 1.9);
  const height = (far ? 3.2 : 2.25) + speedT * 0.35;
  const lookAhead = 6.5 + speedT * 7.5;
  return { dist, height, lookAhead };
}

/**
 * Dynamic speed FOV (degrees) for the chase cameras: a gentle widening with
 * speed that sells velocity without the tunnel-vision of a wide lens.
 */
export function speedFov(speedKmh: number): number {
  return 56 + Math.min(22, Math.max(0, speedKmh) * 0.065);
}
