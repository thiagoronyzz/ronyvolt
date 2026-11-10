import { describe, expect, it } from 'vitest';
import {
  chaseBoom,
  computeChaseRoll,
  fitVerticalFov,
  MAX_CHASE_ROLL_RAD,
  REFERENCE_ASPECT,
  speedFov,
} from '../engine/CameraRig';

describe('fitVerticalFov — portrait compensation', () => {
  it('keeps the base FOV at the reference 16:9 aspect', () => {
    expect(fitVerticalFov(60, REFERENCE_ASPECT)).toBeCloseTo(60, 6);
  });

  it('widens the vertical FOV on portrait screens so the car is not cropped', () => {
    const portrait = fitVerticalFov(60, 9 / 16);
    expect(portrait).toBeGreaterThan(60);
    expect(portrait).toBeLessThanOrEqual(96);
  });

  it('never goes below the base FOV on ultrawide screens', () => {
    expect(fitVerticalFov(60, 32 / 9)).toBe(60);
  });

  it('is monotonic: narrower aspect => wider vertical FOV', () => {
    const a = fitVerticalFov(60, 1.4);
    const b = fitVerticalFov(60, 1.2);
    const c = fitVerticalFov(60, 1.0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('survives degenerate aspect values', () => {
    expect(Number.isFinite(fitVerticalFov(60, 0))).toBe(true);
    expect(Number.isFinite(fitVerticalFov(60, NaN))).toBe(true);
  });
});

describe('computeChaseRoll — horizon guarantee', () => {
  it('returns exactly 0 when disabled (level horizon)', () => {
    expect(computeChaseRoll(0.2, false)).toBe(0);
    expect(computeChaseRoll(-0.2, false)).toBe(0);
  });

  it('never exceeds ±0.8° even under extreme body roll', () => {
    expect(Math.abs(computeChaseRoll(10, true))).toBeLessThanOrEqual(MAX_CHASE_ROLL_RAD);
    expect(Math.abs(computeChaseRoll(-10, true))).toBeLessThanOrEqual(MAX_CHASE_ROLL_RAD);
    expect(MAX_CHASE_ROLL_RAD).toBeLessThan(0.02); // ~1.1° hard ceiling
  });

  it('is 0 for zero body roll and finite for NaN input', () => {
    expect(computeChaseRoll(0, true)).toBe(0);
    expect(computeChaseRoll(NaN, true)).toBe(0);
  });
});

describe('chaseBoom / speedFov', () => {
  it('boom stretches with speed and look-ahead grows', () => {
    const slow = chaseBoom(40, false);
    const fast = chaseBoom(280, false);
    expect(fast.dist).toBeGreaterThan(slow.dist);
    expect(fast.lookAhead).toBeGreaterThan(slow.lookAhead);
  });

  it('far boom is longer and higher than near', () => {
    const near = chaseBoom(120, false);
    const far = chaseBoom(120, true);
    expect(far.dist).toBeGreaterThan(near.dist);
    expect(far.height).toBeGreaterThan(near.height);
  });

  it('speed FOV widens gently and clamps', () => {
    expect(speedFov(0)).toBe(56);
    expect(speedFov(300)).toBeLessThanOrEqual(78);
    expect(speedFov(-50)).toBe(56);
  });
});
