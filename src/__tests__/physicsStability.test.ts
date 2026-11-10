import { describe, expect, it } from 'vitest';
import { CAR_CATALOG, createDefaultTuneForCar } from '../data/carCatalog';
import { WEATHER_PRESETS } from '../data/weatherCatalog';
import { VehicleDynamicsBody } from '../engine/VehicleDynamics';

/**
 * PHYSICS STABILITY / CONTAINMENT TESTS
 * ------------------------------------
 * Reported symptoms: the car "voa" (flies), "trava" (locks up), "desliza sem
 * controle" (uncontrolled slide) and "atravessa a parede" after a crash.
 *
 * These run the real 240 Hz solver for long inputs — full throttle, handbrake
 * at speed, wall impacts, long stalls — and assert the invariants the contain
 * code relies on: no NaN, no vertical launch, bounded speed, and a body that
 * settles after an impact instead of spinning forever.
 */

const clear = WEATHER_PRESETS.find((w) => w.category === 'clear')!;
const car = CAR_CATALOG[120];
const tune = createDefaultTuneForCar(car);

function body() {
  const b = new VehicleDynamicsBody(42);
  b.resetAt(0, 0, 0, 0, tune, 22);
  return b;
}

function drive(
  b: VehicleDynamicsBody,
  seconds: number,
  input: { throttle?: number; brake?: number; steer?: number; handbrake?: boolean },
  dt = 1 / 60
) {
  const frames = Math.round(seconds / dt);
  let last = { speedKmh: 0, maxSlip: 0 };
  for (let i = 0; i < frames; i++) {
    last = b.step({
      dt,
      car,
      tune,
      weather: clear,
      gravityG: 1,
      surfaceGrip: 1.0,
      onOilSlick: false,
      onPuddle: false,
      slipstreamFactor: 0,
      throttle: input.throttle ?? 0,
      brake: input.brake ?? 0,
      handbrake: input.handbrake ?? false,
      steeringInput: input.steer ?? 0,
      nitroInput: false,
      shiftUpPulse: false,
      shiftDownPulse: false,
      assistMode: 'pro',
      damageEnabled: true,
      tireWearEnabled: false,
      fuelConsumptionEnabled: false,
      turboStarBoost: 1,
    });
  }
  return last;
}

const finite = (b: VehicleDynamicsBody) =>
  [b.x, b.y, b.z, b.vx, b.vy, b.vz, b.headingRad, b.rpm].every((n) => Number.isFinite(n));

describe('solver never produces an unstable car', () => {
  it('stays finite and grounded at full throttle for 20 s', () => {
    const b = body();
    drive(b, 20, { throttle: 1 });
    expect(finite(b)).toBe(true);
    // Never launches: the body must stay within a metre of the road surface,
    // and the speed must be physically plausible for a road car.
    expect(Math.abs(b.y)).toBeLessThan(1.0);
    expect(Math.abs(b.vz)).toBeLessThan(120); // ~430 km/h ceiling
    expect(Math.abs(b.vy)).toBeLessThan(3);
  });

  it('survives a 30 fps hitch (large dt) without exploding', () => {
    const b = body();
    drive(b, 6, { throttle: 1 }, 1 / 15);
    expect(finite(b)).toBe(true);
    expect(Math.abs(b.vz)).toBeLessThan(120);
  });

  it('settles after a handbrake spin instead of spinning forever', () => {
    const b = body();
    drive(b, 8, { throttle: 1 });
    drive(b, 1.2, { throttle: 0.2, steer: 1, handbrake: true });
    const spinSpeed = Math.abs(b.vz);
    // Release everything: a stable car must slow down, not keep yawing.
    drive(b, 6, {});
    expect(finite(b)).toBe(true);
    expect(Math.abs(b.vz)).toBeLessThan(spinSpeed + 1);
    expect(Math.abs(b.vz)).toBeLessThan(2);
  });

  it('absorbs a hard wall impact and comes back restable', () => {
    const b = body();
    drive(b, 5, { throttle: 1 });
    const before = Math.abs(b.vz);
    b.applyImpact(180, 'front', true);
    expect(finite(b)).toBe(true);
    // The impact must cost speed (energy absorbed), not add it.
    expect(Math.abs(b.vz)).toBeLessThanOrEqual(before + 0.5);
    drive(b, 3, {});
    expect(finite(b)).toBe(true);
    expect(Math.abs(b.vz)).toBeLessThan(5);
  });

  it('recovers from a velocity reset (the R key) without sliding on its own', () => {
    const b = body();
    drive(b, 4, { throttle: 1 });
    b.resetVelocity();
    drive(b, 3, {});
    expect(finite(b)).toBe(true);
    expect(Math.abs(b.vz)).toBeLessThan(1.5);
  });

  it('does not creep when no pedal is pressed at standstill', () => {
    const b = body();
    drive(b, 4, {});
    expect(Math.abs(b.vz)).toBeLessThan(0.5);
    expect(Math.abs(b.x)).toBeLessThan(0.5);
  });
});
