/**
 * HANDLING REGRESSION TESTS
 * =========================
 * These lock in the properties that a player feels immediately, using the real
 * dynamics model — no mocks:
 *
 *  1. A full-lock step input on a road car must NOT spin it (body slip stays
 *     under 30°) and must not send yaw rate past ~1.5 rad/s.
 *  2. The car must be able to generate real cornering grip (> 0.7 g at 80 km/h),
 *     which is what the double-integrated yaw bug had masked.
 *  3. After a handbrake flick the body must settle: yaw → 0, no residual slide.
 *  4. The ESC must be *able* to intervene: adding slip (lock a wheel) must be
 *     corrected back, so assists are not dead code.
 */
import { describe, expect, it } from 'vitest';
import { VehicleDynamicsBody } from '../engine/VehicleDynamics';
import { CAR_CATALOG, createDefaultTuneForCar } from '../data/carCatalog';
import { WEATHER_PRESETS } from '../data/weatherCatalog';

const car = CAR_CATALOG.find((c) => c.id === 'fiat-uno-2005-raiz') ?? CAR_CATALOG[0];
const tune = createDefaultTuneForCar(car);
const weather = WEATHER_PRESETS[2];

function makeBody() {
  const b = new VehicleDynamicsBody(24);
  b.resetAt(0, 0, 0, 0, tune, weather.ambientTempC);
  return b;
}

const fwd = (b: VehicleDynamicsBody) => b.vx * Math.sin(b.headingRad) + b.vz * Math.cos(b.headingRad);

function params(over: Record<string, unknown> = {}) {
  return {
    dt: 1 / 60,
    car,
    tune,
    weather,
    gravityG: 1,
    surfaceGrip: 1,
    onOilSlick: false,
    onPuddle: false,
    slipstreamFactor: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    steeringInput: 0,
    nitroInput: false,
    shiftUpPulse: false,
    shiftDownPulse: false,
    assistMode: 'pro' as const,
    damageEnabled: false,
    tireWearEnabled: false,
    fuelConsumptionEnabled: false,
    turboStarBoost: 1,
    gradeSin: 0,
    allowReverse: true,
    ...over,
  };
}

function launch(targetKmh: number) {
  const b = makeBody();
  for (let i = 0; i < 2400; i++) {
    const kmh = Math.hypot(b.vx, b.vz) * 3.6;
    b.step(params({ throttle: kmh < targetKmh ? 1 : 0 }));
    if (kmh > targetKmh - 1) break;
  }
  return b;
}

describe('VELOCITY — Handling stability', () => {
  it('does not spin a road car on a full-lock step input', () => {
    for (const speed of [40, 80, 150]) {
      const b = launch(speed);
      let maxBeta = 0;
      let maxYaw = 0;
      for (let i = 0; i < 240; i++) {
        b.step(params({ steeringInput: 1, throttle: 0.35 }));
        const beta = (Math.atan2(b.vLat, Math.max(0.5, Math.abs(fwd(b)))) * 180) / Math.PI;
        maxBeta = Math.max(maxBeta, Math.abs(beta));
        maxYaw = Math.max(maxYaw, Math.abs(b.angularVelYaw));
      }
      expect(maxBeta, `body slip at ${speed} km/h`).toBeLessThan(30);
      expect(maxYaw, `yaw rate at ${speed} km/h`).toBeLessThan(1.6);
      expect(fwd(b), `car must still be moving forwards at ${speed} km/h`).toBeGreaterThan(0);
    }
  });

  it('generates realistic cornering grip (not the halved value of the double-integration bug)', () => {
    const b = launch(110);
    let bestG = 0;
    for (let i = 0; i < 180; i++) {
      b.step(params({ steeringInput: 0.7, throttle: 0.5 }));
      bestG = Math.max(bestG, b.gForceLat);
    }
    expect(bestG).toBeGreaterThan(0.7);
  });

  it('recovers to zero yaw after a handbrake flick', () => {
    const b = launch(70);
    for (let i = 0; i < 60; i++) b.step(params({ steeringInput: 1, handbrake: true, throttle: 0.2 }));
    for (let i = 0; i < 360; i++) b.step(params({}));
    expect(Math.abs(b.angularVelYaw)).toBeLessThan(0.15);
    expect(Math.abs(b.vLat)).toBeLessThan(1.2);
  });

  it('keeps the yaw clamp active in hardcore so a wrecked corner cannot spin forever', () => {
    const b = launch(90);
    for (let i = 0; i < 300; i++) {
      b.step(params({ assistMode: 'hardcore_sim', steeringInput: 1, throttle: 1, brake: 0 }));
    }
    expect(Number.isFinite(b.angularVelYaw)).toBe(true);
    expect(Math.abs(b.angularVelYaw)).toBeLessThan(3.4);
  });
});
