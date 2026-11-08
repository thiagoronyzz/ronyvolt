import { describe, expect, it } from 'vitest';
import { CAR_CATALOG, createDefaultTuneForCar } from '../data/carCatalog';
import { WEATHER_PRESETS } from '../data/weatherCatalog';
import { VehicleDynamicsBody } from '../engine/VehicleDynamics';
import { buildTireSpec, createTireContact, evaluateTire } from '../engine/TireModel';
import { computeEffectiveCarStats } from '../engine/PacejkaPhysics';

const clear = WEATHER_PRESETS.find((w) => w.category === 'clear')!;

function makeBody(carIndex = 100) {
  const car = CAR_CATALOG[carIndex];
  const tune = createDefaultTuneForCar(car);
  const body = new VehicleDynamicsBody(24);
  body.resetAt(0, 0, 0, 0, tune, 24);
  return { car, tune, body };
}

function run(
  body: VehicleDynamicsBody,
  car: ReturnType<typeof makeBody>['car'],
  tune: ReturnType<typeof makeBody>['tune'],
  seconds: number,
  input: { throttle: number; brake: number; steer: number; handbrake?: boolean }
) {
  const frames = Math.round(seconds * 60);
  let speed = 0;
  for (let i = 0; i < frames; i++) {
    const r = body.step({
      dt: 1 / 60,
      car,
      tune,
      weather: clear,
      gravityG: 1,
      surfaceGrip: 1.0,
      onOilSlick: false,
      onPuddle: false,
      slipstreamFactor: 0,
      throttle: input.throttle,
      brake: input.brake,
      handbrake: input.handbrake ?? false,
      steeringInput: input.steer,
      nitroInput: false,
      shiftUpPulse: false,
      shiftDownPulse: false,
      assistMode: 'pro',
      damageEnabled: false,
      tireWearEnabled: false,
      fuelConsumptionEnabled: false,
      turboStarBoost: 1,
    });
    speed = r.speedKmh;
  }
  return speed;
}

describe('TIRE MODEL — physical invariants', () => {
  const spec = buildTireSpec({ peakFriction: 1.2, lateralRatio: 0.96, stiffness: 10.5, radiusM: 0.33, isOffRoad: false });
  const thermal = {
    ambientC: 24,
    optimalC: 88,
    tempSensitivityPerC: 0.0024,
    treadHeatCapacityJK: 8200,
    coolingCoeff: 2.1,
    wearRate: 1,
  };

  it('never exceeds the friction ellipse', () => {
    for (const ratio of [0, 0.05, 0.1, 0.3]) {
      for (const alphaDeg of [0, 2, 5, 9, 20]) {
        const state = createTireContact(24);
        state.surfaceTempC = 88;
        for (let i = 0; i < 240; i++) {
          evaluateTire({
            spec,
            thermal,
            state,
            omegaRadS: (30 * (1 + ratio)) / spec.radiusM,
            forwardVelocityMs: 30,
            lateralVelocityMs: Math.tan((alphaDeg * Math.PI) / 180) * 30,
            loadN: 4200,
            surfaceMu: 1,
            wetness: 0,
            camberRad: 0,
            dt: 1 / 240,
          });
        }
        const magnitude = Math.hypot(state.forceXN, state.forceYN);
        const ceiling = 1.2 * 1.2 * 4200 * 1.12; // mu * mu_y * Fz * max load factor
        expect(magnitude).toBeLessThanOrEqual(ceiling);
        expect(Number.isFinite(state.forceXN)).toBe(true);
      }
    }
  });

  it('respects load sensitivity: two tyres at half load make more total grip than one at full load', () => {
    const measure = (loadN: number) => {
      const state = createTireContact(24);
      state.surfaceTempC = 88;
      for (let i = 0; i < 240; i++) {
        evaluateTire({
          spec,
          thermal,
          state,
          omegaRadS: 30 / spec.radiusM,
          forwardVelocityMs: 30,
          lateralVelocityMs: Math.tan((7 * Math.PI) / 180) * 30,
          loadN,
          surfaceMu: 1,
          wetness: 0,
          camberRad: 0,
          dt: 1 / 240,
        });
      }
      return Math.abs(state.forceYN);
    };
    const full = measure(8000);
    const halves = measure(4000) * 2;
    expect(halves).toBeGreaterThan(full);
  });

  it('has a relaxation lag: force after one 1 ms step at 8 m/s is far below steady state', () => {
    const state = createTireContact(24);
    state.surfaceTempC = 88;
    evaluateTire({
      spec,
      thermal,
      state,
      omegaRadS: 8 / spec.radiusM,
      forwardVelocityMs: 8,
      lateralVelocityMs: 1.5,
      loadN: 4200,
      surfaceMu: 1,
      wetness: 0,
      camberRad: 0,
      dt: 1 / 1000,
    });
    const first = Math.abs(state.forceYN);
    for (let i = 0; i < 400; i++) {
      evaluateTire({
        spec,
        thermal,
        state,
        omegaRadS: 8 / spec.radiusM,
        forwardVelocityMs: 8,
        lateralVelocityMs: 1.5,
        loadN: 4200,
        surfaceMu: 1,
        wetness: 0,
        camberRad: 0,
        dt: 1 / 240,
      });
    }
    expect(first).toBeLessThan(Math.abs(state.forceYN) * 0.5);
  });

  it('loses lateral grip when combined with heavy longitudinal slip (friction ellipse in practice)', () => {
    const lateralOnly = (() => {
      const state = createTireContact(24);
      state.surfaceTempC = 88;
      for (let i = 0; i < 300; i++) {
        evaluateTire({
          spec,
          thermal,
          state,
          omegaRadS: 30 / spec.radiusM,
          forwardVelocityMs: 30,
          lateralVelocityMs: 3.5,
          loadN: 4200,
          surfaceMu: 1,
          wetness: 0,
          camberRad: 0,
          dt: 1 / 240,
        });
      }
      return Math.abs(state.forceYN);
    })();

    const braked = (() => {
      const state = createTireContact(24);
      state.surfaceTempC = 88;
      for (let i = 0; i < 300; i++) {
        evaluateTire({
          spec,
          thermal,
          state,
          omegaRadS: 0, // wheel locked -> 100% longitudinal slip
          forwardVelocityMs: 30,
          lateralVelocityMs: 3.5,
          loadN: 4200,
          surfaceMu: 1,
          wetness: 0,
          camberRad: 0,
          dt: 1 / 240,
        });
      }
      return Math.abs(state.forceYN);
    })();

    expect(braked).toBeLessThan(lateralOnly * 0.55);
  });
});

describe('VEHICLE DYNAMICS — behaviour a player can feel', () => {
  it('accelerates and does not produce NaN', () => {
    const { car, tune, body } = makeBody();
    const speed = run(body, car, tune, 6, { throttle: 1, brake: 0, steer: 0 });
    expect(Number.isFinite(speed)).toBe(true);
    expect(speed).toBeGreaterThan(55);
  });

  it('stays below a plausible top speed for the car class', () => {
    const { car, tune, body } = makeBody();
    const speed = run(body, car, tune, 45, { throttle: 1, brake: 0, steer: 0 });
    expect(speed).toBeGreaterThan(car.topSpeedKmh * 0.4);
    expect(speed).toBeLessThan(car.topSpeedKmh * 1.45);
  });

  it('builds lateral g under sustained steering and stays finite', () => {
    const { car, tune, body } = makeBody();
    run(body, car, tune, 4, { throttle: 1, brake: 0, steer: 0 });
    run(body, car, tune, 2.0, { throttle: 0.55, brake: 0, steer: 0.8 });
    expect(Math.abs(body.gForceLat)).toBeGreaterThan(0.35);
    expect(Math.abs(body.gForceLat)).toBeLessThan(3.2);
    expect(Number.isFinite(body.x)).toBe(true);
  });

  it('spins or stalls when the rear is provoked with the handbrake, proving yaw comes from tyres', () => {
    const { car, tune, body } = makeBody();
    run(body, car, tune, 4, { throttle: 1, brake: 0, steer: 0 });
    const before = body.headingRad;
    run(body, car, tune, 1.2, { throttle: 1, brake: 0, steer: 0.9, handbrake: true });
    expect(Math.abs(body.headingRad - before)).toBeGreaterThan(0.15);
  });

  it('loses speed when braking hard', () => {
    const { car, tune, body } = makeBody();
    run(body, car, tune, 5, { throttle: 1, brake: 0, steer: 0 });
    const before = Math.hypot(body.vx, body.vz);
    run(body, car, tune, 1.5, { throttle: 0, brake: 1, steer: 0 });
    const after = Math.hypot(body.vx, body.vz);
    expect(after).toBeLessThan(before);
  });

  it('computes effective stats consistently for the same car and tune', () => {
    const car = CAR_CATALOG[42];
    const tune = createDefaultTuneForCar(car);
    const a = computeEffectiveCarStats(car, tune);
    const b = computeEffectiveCarStats(car, tune);
    expect(a.effectiveWeightKg).toBe(b.effectiveWeightKg);
    expect(a.maxRpm).toBe(b.maxRpm);
  });
});

describe('AI — racing line and speed profile', () => {
  it('straightens the line, respects the road width and produces a braking profile', async () => {
    const { buildRacingLine } = await import('../ai/RacingLine');
    const THREE = await import('three');
    // A circuit with one hairpin and a long straight.
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 260),
      new THREE.Vector3(60, 0, 320),
      new THREE.Vector3(160, 0, 300),
      new THREE.Vector3(180, 0, 220),
      new THREE.Vector3(120, 0, 180),
      new THREE.Vector3(40, 0, 120),
      new THREE.Vector3(0, 0, 60),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const line = buildRacingLine({
      curve,
      roadWidthM: 12,
      totalLengthM: curve.getLength(),
      closed: true,
      mu: 1.2,
      massKg: 1300,
      clA: 2.6,
      powerW: 600000,
      brakeMuScale: 1.15,
      gravityG: 1,
    });

    expect(line.samples.length).toBeGreaterThan(40);
    // Every point must be within the usable road width.
    for (const s of line.samples) {
      expect(Math.abs(s.offsetM)).toBeLessThanOrEqual(6.01);
      expect(Number.isFinite(s.targetSpeedMs)).toBe(true);
      expect(s.targetSpeedMs).toBeGreaterThan(0);
    }
    // The hairpin must be slower than the straight.
    const speeds = line.samples.map((s) => s.targetSpeedMs);
    const curvatures = line.samples.map((s) => s.curvature);
    const maxCurvIdx = curvatures.indexOf(Math.max(...curvatures));
    const minCurvIdx = curvatures.indexOf(Math.min(...curvatures));
    expect(speeds[maxCurvIdx]).toBeLessThan(speeds[minCurvIdx]);
    // The line must use the width: some offset should be meaningfully non-zero.
    expect(Math.max(...line.samples.map((s) => Math.abs(s.offsetM)))).toBeGreaterThan(0.5);
  });

  it('gives different drivers different lines and inputs (no cloned robots)', async () => {
    const { buildRacingLine, RacingLineFollower } = await import('../ai/RacingLine');
    const THREE = await import('three');
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 200),
      new THREE.Vector3(80, 0, 260),
      new THREE.Vector3(160, 0, 200),
      new THREE.Vector3(160, 0, 80),
      new THREE.Vector3(80, 0, 20),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const line = buildRacingLine({
      curve,
      roadWidthM: 12,
      totalLengthM: curve.getLength(),
      closed: true,
      mu: 1.15,
      massKg: 1400,
      clA: 2.2,
      powerW: 500000,
      brakeMuScale: 1.1,
      gravityG: 1,
    });

    const a = new RacingLineFollower(line, { skill: 9, consistency: 9, aggression: 5, tireManagement: 7, seed: 11 });
    const b = new RacingLineFollower(line, { skill: 4, consistency: 3, aggression: 9, tireManagement: 3, seed: 99 });
    const s = line.samples[0];
    const state = { x: s.x, z: s.z, headingRad: Math.atan2(s.tangentX, s.tangentZ), speedMs: 40 };
    let steerA = 0;
    let steerB = 0;
    for (let i = 0; i < 240; i++) {
      steerA = a.update(1 / 60, state).steer;
      steerB = b.update(1 / 60, state).steer;
    }
    expect(Number.isFinite(steerA)).toBe(true);
    expect(Math.abs(steerA - steerB)).toBeGreaterThan(0.0001);
  });
});

describe('AUDIO — engine acoustics are derived from physics, not taste', () => {
  it('computes firing frequency from rpm and cylinder count (4-stroke)', async () => {
    const { engineArchitecture, firingFrequencyHz } = await import('../audio/EngineAcoustics');
    const v8 = engineArchitecture('v8_crossplane');
    // A V8 at 3000 rpm fires 4 times per revolution of the crank per 2 revs:
    // 3000/60 * 8/2 = 200 Hz.
    expect(firingFrequencyHz(3000, v8)).toBeCloseTo(200, 5);
    const i4 = engineArchitecture('i4_econobox');
    expect(firingFrequencyHz(3000, i4)).toBeCloseTo(100, 5);
    const v12 = engineArchitecture('v12_italian');
    expect(firingFrequencyHz(6000, v12)).toBeCloseTo(600, 5);
    // Frequency must scale linearly with rpm — that is what makes gear changes
    // land on the correct pitch.
    expect(firingFrequencyHz(6000, v8) / firingFrequencyHz(3000, v8)).toBeCloseTo(2, 5);
  });

  it('marks electric drivetrains as non-combustion and gives them pole-pair whine', async () => {
    const { engineArchitecture, firingFrequencyHz } = await import('../audio/EngineAcoustics');
    const ev = engineArchitecture('ev_quadmotor');
    expect(ev.electric).toBe(true);
    expect(ev.polePairs).toBeGreaterThan(0);
    expect(firingFrequencyHz(12000, ev)).toBeGreaterThan(500);
  });

  it('produces a monotonically decaying harmonic series with an exhaust resonance bump', async () => {
    const { engineArchitecture, harmonicAmplitudes } = await import('../audio/EngineAcoustics');
    const v10 = engineArchitecture('v10_screamer');
    const amps = harmonicAmplitudes(v10, 20);
    expect(amps[1]).toBeGreaterThan(amps[2]);
    expect(amps[2]).toBeGreaterThan(amps[10]);
    // The resonance term must produce a local maximum somewhere in the spectrum.
    const resonanceIdx = Math.round(v10.exhaustResonanceMul);
    expect(amps[resonanceIdx]).toBeGreaterThan(amps[resonanceIdx - 2]);
  });

  it('uses the physical Doppler formula: approaching is higher, receding is lower', async () => {
    const { dopplerRatio } = await import('../audio/EngineAcoustics');
    const approaching = dopplerRatio(80);
    const receding = dopplerRatio(-80);
    expect(approaching).toBeGreaterThan(1);
    expect(receding).toBeLessThan(1);
    // c/(c-v): at 80 m/s this is 343/263.
    expect(approaching).toBeCloseTo(343 / 263, 4);
    expect(receding).toBeCloseTo(343 / 423, 4);
  });
});
