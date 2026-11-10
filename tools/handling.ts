/**
 * HANDLING HARNESS — drives the real dynamics model in Node and measures the
 * behaviours a player complains about, so handling regressions are numbers
 * instead of opinions.
 *
 * Not part of the game bundle; run with `npx vite-node tools/handling.mjs`.
 */

import { VehicleDynamicsBody } from '../src/engine/VehicleDynamics';
import { CAR_CATALOG, createDefaultTuneForCar } from '../src/data/carCatalog';
import { WEATHER_PRESETS } from '../src/data/weatherCatalog';

const car = CAR_CATALOG.find((c) => c.id === 'fiat-uno-2005-raiz') ?? CAR_CATALOG[0];
const tune = createDefaultTuneForCar(car);
const weather = WEATHER_PRESETS[2];

function makeBody() {
  const b = new VehicleDynamicsBody(24);
  b.resetAt(0, 0, 0, 0, tune, weather.ambientTempC);
  return b;
}
const fwdSpeed = (b) => b.vx * Math.sin(b.headingRad) + b.vz * Math.cos(b.headingRad);

const baseParams = (over: Record<string, unknown> = {}) => ({
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
});

/** Accelerate to `targetKmh` on a straight, then report the state. */
function launch(targetKmh: number) {
  const b = makeBody();
  let t = 0;
  while (t < 40) {
    const kmh = Math.hypot(b.vx, b.vz) * 3.6;
    const p = baseParams({ throttle: kmh < targetKmh ? 1 : 0, brake: kmh > targetKmh + 2 ? 0.5 : 0 });
    b.step(p);
    t += p.dt;
    if (kmh > targetKmh - 1) break;
  }
  return b;
}

/** Step response: hold full lock at a given speed and report peak yaw + slip. */
function stepSteer(speedKmh: number, assist: 'casual' | 'pro' | 'hardcore_sim', steer = 1) {
  const b = launch(speedKmh);
  let maxYaw = 0;
  let maxBeta = 0;
  let spun = false;
  const heading0 = b.headingRad;
  for (let i = 0; i < 240; i++) {
    const kmh = Math.hypot(b.vx, b.vz) * 3.6;
    b.step(
      baseParams({
        assistMode: assist,
        steeringInput: steer,
        throttle: 0.35,
        brake: kmh > speedKmh + 6 ? 0.2 : 0,
      })
    );
    const beta = Math.atan2(b.vLat, Math.max(0.5, Math.abs(fwdSpeed(b)))) * (180 / Math.PI);
    maxYaw = Math.max(maxYaw, Math.abs(b.angularVelYaw));
    maxBeta = Math.max(maxBeta, Math.abs(beta));
    // Spin = the body slip diverges past 45 deg (the car is travelling sideways
    // while still rotating) or the car ends up going backwards. A full-lock
    // U-turn rotates the heading by 180 deg and is NOT a spin, so heading change
    // alone is a misleading metric.
    const fwd = fwdSpeed(b);
    if (Math.abs(beta) > 45) spun = true;
    if (fwd < -2) spun = true;
  }
  const latG = b.gForceLat;
  const wheels = b.wheels.map((w) => (w.slipAngleRad * 180) / Math.PI);
  return {
    maxYaw,
    maxBeta,
    spun,
    headingDeg: ((b.headingRad - heading0) * 180) / Math.PI,
    latG,
    wheels,
  };
}

/** Full-lock at speed with the handbrake: allowed to spin, but must recover. */
function handbrakeSpin() {
  const b = launch(70);
  for (let i = 0; i < 60; i++) {
    b.step(baseParams({ assistMode: 'pro', steeringInput: 1, handbrake: true, throttle: 0.2 }));
  }
  const yawAtRelease = b.angularVelYaw;
  // Release everything and let the body settle.
  for (let i = 0; i < 300; i++) b.step(baseParams({ assistMode: 'pro' }));
  return { yawAtRelease, yawAfter: b.angularVelYaw, vLatAfter: b.vLat };
}

const rows: string[] = [];
rows.push(`Car: ${car.name}`);
rows.push('');
rows.push('STEP STEER (240 frames = 4 s, 35% throttle, full lock)');
rows.push('speed  assist        peak yaw r/s  peak slip deg  heading change  spun?  latG     tyres');
for (const speed of [40, 80, 150]) {
  for (const assist of ['casual', 'pro', 'hardcore_sim'] as const) {
    const r = stepSteer(speed, assist);
    rows.push(
      `${String(speed).padStart(5)}  ${assist.padEnd(12)}  ${r.maxYaw.toFixed(2).padStart(12)}  ${r.maxBeta
        .toFixed(1)
        .padStart(13)}  ${r.headingDeg.toFixed(0).padStart(14)}  ${(r.spun ? 'YES' : 'no').padStart(5)}  ${r.latG
        .toFixed(2)
        .padStart(6)} g  slip F/R ${r.wheels[0].toFixed(0)}/${r.wheels[2].toFixed(0)}°`
    );
  }
}
// Violent input: full lock + full throttle at speed — where a FWD hatch spins.
rows.push('');
rows.push('POWER OVERSTEER TEST (60 km/h, full lock, 100% throttle, 3 s)');
rows.push('assist        peak slip deg  spun?  yaw end r/s');
for (const assist of ['casual', 'pro', 'hardcore_sim'] as const) {
  const b = launch(60);
  let maxBeta2 = 0;
  let spun2 = false;
  for (let i = 0; i < 180; i++) {
    b.step(baseParams({ assistMode: assist, steeringInput: 1, throttle: 1 }));
    const beta = Math.atan2(b.vLat, Math.max(0.5, Math.abs(fwdSpeed(b)))) * (180 / Math.PI);
    maxBeta2 = Math.max(maxBeta2, Math.abs(beta));
    if (Math.abs(beta) > 45 || fwdSpeed(b) < -2) spun2 = true;
  }
  rows.push(`${assist.padEnd(12)}  ${maxBeta2.toFixed(1).padStart(13)}  ${(spun2 ? 'YES' : 'no').padStart(5)}  ${b.angularVelYaw.toFixed(2).padStart(10)}`);
}

const hb = handbrakeSpin();
rows.push('');
rows.push(`HANDBRAKE: yaw at release ${hb.yawAtRelease.toFixed(2)} r/s → after 5 s ${hb.yawAfter.toFixed(3)} r/s (vLat ${hb.vLatAfter.toFixed(2)} m/s)`);
rows.push('');
rows.push('Judgement: a road car should peak near 0.9–1.4 r/s at 80 km/h with under 12° of body slip,');
rows.push('never spin on a step input in casual/pro, and settle to ~0 yaw after a handbrake flick.');
console.log(rows.join('\n'));


