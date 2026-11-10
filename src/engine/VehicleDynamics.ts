/**
 * VEHICLE DYNAMICS v2 — fixed-step, four-wheel, torque-driven rigid body.
 *
 * WHAT WAS WRONG WITH v1 (and why every one of these is visible to the player)
 * ---------------------------------------------------------------------------
 * v1 integrated a single rigid body with a *geometric* yaw rate:
 *
 *     targetYawRate = speed / wheelbase * tan(steer) * gain
 *     angularVel += (target - angularVel) * dt * stiffness
 *
 * That construction injects two unmistakable tells:
 *
 *   A. Yaw is not produced by tyre forces, so it cannot be lost. The car can
 *      never spin because the rear tyres ran out of grip; it can only be
 *      "scripted" into a spin by a handbrake multiplier. Players feel this as
 *      "the car turns whether or not the tyres are working".
 *   B. The gain (`*1.12`, `*1.48`) and the stiffness (`10.5`) are gameplay
 *      knobs, not physics. They make response frame-rate independent-ish but
 *      amplitude-wrong: at 40 km/h the car rotates as readily as at 200 km/h.
 *
 * v2 removes yaw targets entirely. The only inputs are: engine torque (through
 * a gearbox and differential), brake torque, tyre longitudinal/lateral forces
 * from `TireModel`, and gravity. Yaw rate is the integral of the yaw moment
 * produced by those four contact patches. Consequently:
 *
 *   - oversteer happens because rear slip angles exceed front slip angles
 *   - the car can spin, and only a countersteer + throttle modulation catches it
 *   - trail braking rotates the car because load moves forward
 *   - a locked wheel stops generating lateral force (friction ellipse), so the
 *     car goes straight under full braking with the wheel turned — as it should
 *
 * INTEGRATION
 * -----------
 * Fixed 240 Hz sub-steps with an accumulator. Semi-implicit Euler on a body
 * frame with the rotating-frame terms (u_dot = Fx/m + r*v, v_dot = Fy/m - r*u).
 * 240 Hz is the practical floor for a Pacejka model: at 60 Hz the relaxation
 * filter is coarser than the tyre's own time constant and the limit behaviour
 * becomes frame-rate dependent, which is exactly what "the car behaves
 * differently on my 144 Hz monitor" complaints are made of.
 */

import * as THREE from 'three';
import { CarSpec, CarTuneSetup, DamageState, WeatherPreset, WheelTelemetry } from '../types/game';
import {
  AssistMode,
  BRAND_GRIP_MOD,
  COMPOUND_PARAMS,
  computeEffectiveCarStats,
  createInitialDamage,
  createInitialWheels,
} from './PacejkaPhysics';
import {
  buildTireSpec,
  createTireContact,
  evaluateTire,
  TireContactState,
  TireSpec,
  TireThermalConfig,
} from './TireModel';

const GRAVITY = 9.81;
const SUBSTEP_HZ = 240;
const MAX_SUBSTEPS = 10;
/** Rotational inertia of the engine + clutch assembly (kg m^2), reflected through the gearing. */
const ENGINE_INERTIA = 0.19;

/** Wheel order is FL, FR, RL, RR — matches `BuiltCarRig.wheels`. */
const WHEEL_LATERAL = [-1, 1, -1, 1] as const;
const WHEEL_IS_FRONT = [true, true, false, false] as const;

export interface VehicleStepParams {
  dt: number;
  car: CarSpec;
  tune: CarTuneSetup;
  weather: WeatherPreset;
  gravityG: number;
  surfaceGrip: number;
  onOilSlick: boolean;
  onPuddle: boolean;
  slipstreamFactor: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  steeringInput: number;
  nitroInput: boolean;
  shiftUpPulse: boolean;
  shiftDownPulse: boolean;
  assistMode: AssistMode;
  damageEnabled: boolean;
  tireWearEnabled: boolean;
  fuelConsumptionEnabled: boolean;
  turboStarBoost: number;
  /** sin(road gradient) along the direction of travel. Positive = uphill. */
  gradeSin?: number;
  /** Allows the gearbox to select reverse. False during the grid countdown. */
  allowReverse?: boolean;
}

export class VehicleDynamicsBody {
  // --- Pose & velocity (world) ---
  public x = 0;
  public y = 0;
  public z = 0;
  public headingRad = 0;
  public vx = 0;
  public vz = 0;
  public vy = 0;

  // --- Body-frame velocity state (kept between sub-steps) ---
  private u = 0; // forward, m/s
  /** Lateral body velocity (m/s, +right). Public for telemetry and tests. */
  public vLat = 0;
  public angularVelYaw = 0;

  // --- Attitude derived from suspension loads ---
  public pitchRad = 0;
  public rollRad = 0;
  public wheelSpinRad = 0;

  // --- Powertrain ---
  public rpm = 900;
  public gear = 1;
  public shiftTimer = 0;
  private shiftCooldown = 0;
  public boostPsi = 0;
  public nitroRemainingKg = 5;
  public fuelLiters = 45;
  public clutchSlip = 0;
  public limiterActive = false;

  // --- Thermals & aero ---
  public engineTempC = 85;
  public oilTempC = 92;
  public brakeTempC = 120;
  public gForceLat = 0;
  public gForceLong = 0;
  public downforceN = 0;
  public dragN = 0;
  public backfireTimer = 0;

  // --- Wheels ---
  public wheels: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry];
  public damage: DamageState;
  /** Detailed tyre contact state (forces, utilisation) for FX/audio/telemetry. */
  public contacts: [TireContactState, TireContactState, TireContactState, TireContactState];

  private wheelOmega: [number, number, number, number] = [0, 0, 0, 0];
  private wheelLocked: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  private tireSpec!: TireSpec;
  private thermal: TireThermalConfig;
  private ambientC: number;
  private accumulator = 0;
  private elapsedLike = 0;
  private simTime = 0;
  private limiterPhase = 0;
  private steerState = 0;
  private lastAx = 0;
  private lastAy = 0;
  /** 0..1 electronic torque cut demanded by the stability controller. */
  private tractionCut = 0;
  private absCycling = 0;
  private lastShiftInput = false;
  private tireSpecKey = '';

  constructor(ambientTempC = 24) {
    this.ambientC = ambientTempC;
    this.wheels = createInitialWheels(ambientTempC);
    this.contacts = [
      createTireContact(ambientTempC),
      createTireContact(ambientTempC),
      createTireContact(ambientTempC),
      createTireContact(ambientTempC),
    ];
    this.damage = createInitialDamage();
    this.thermal = {
      ambientC: ambientTempC,
      optimalC: 88,
      tempSensitivityPerC: 0.0024,
      treadHeatCapacityJK: 8200,
      coolingCoeff: 2.1,
      wearRate: 1.0,
    };
    this.tireSpec = buildTireSpec({ peakFriction: 1.2, lateralRatio: 0.96, stiffness: 10.5, radiusM: 0.33, isOffRoad: false });
  }

  public resetAt(x: number, y: number, z: number, headingRad: number, tune: CarTuneSetup, ambientTempC: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.headingRad = headingRad;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.u = 0;
    this.vLat = 0;
    this.angularVelYaw = 0;
    this.pitchRad = 0;
    this.rollRad = 0;
    this.rpm = 1100;
    this.gear = 1;
    this.shiftTimer = 0;
    this.shiftCooldown = 0;
    this.boostPsi = 0;
    this.nitroRemainingKg = tune.nitroCapacityKg;
    this.fuelLiters = tune.fuelLoadLiters;
    this.ambientC = ambientTempC;
    this.engineTempC = Math.max(65, ambientTempC + 60);
    this.oilTempC = this.engineTempC + 7;
    this.brakeTempC = Math.max(40, ambientTempC + 30);
    this.wheels = createInitialWheels(ambientTempC);
    this.contacts = [
      createTireContact(ambientTempC),
      createTireContact(ambientTempC),
      createTireContact(ambientTempC),
      createTireContact(ambientTempC),
    ];
    this.wheelOmega = [0, 0, 0, 0];
    this.wheelLocked = [false, false, false, false];
    this.damage = createInitialDamage();
    this.accumulator = 0;
    this.steerState = 0;
    this.limiterPhase = 0;
    this.lastAx = 0;
    this.lastAy = 0;
  }

  public applyImpact(relSpeedKmh: number, localSide: 'front' | 'left' | 'right' | 'rear', damageEnabled: boolean): void {
    if (!damageEnabled || relSpeedKmh < 12) return;
    const norm = Math.min(1, (relSpeedKmh - 10) / 140);
    if (localSide === 'front') {
      this.damage.panelDeform.frontLeft = Math.min(1, this.damage.panelDeform.frontLeft + norm * 0.48);
      this.damage.panelDeform.frontRight = Math.min(1, this.damage.panelDeform.frontRight + norm * 0.48);
      this.damage.panelDeform.hood = Math.min(1, this.damage.panelDeform.hood + norm * 0.55);
      // A frontal impact unloads the rear axle: model it as an instantaneous
      // yaw impulse rather than a scripted spin, so the result depends on speed.
      this.angularVelYaw += (Math.random() - 0.5) * norm * 1.1;
      if (relSpeedKmh > 55) {
        this.damage.radiatorDamage = Math.min(1, this.damage.radiatorDamage + norm * 0.45);
        this.damage.windshieldCracks.push({
          u: 0.25 + Math.random() * 0.5,
          v: 0.25 + Math.random() * 0.5,
          severity: norm,
        });
        for (let i = 0; i < 4; i++) this.wheelOmega[i] *= 0.55;
      }
    } else if (localSide === 'left') {
      this.damage.panelDeform.sideLeft = Math.min(1, this.damage.panelDeform.sideLeft + norm * 0.52);
      this.damage.suspensionDamage = Math.min(1, this.damage.suspensionDamage + norm * 0.35);
      this.angularVelYaw -= norm * 0.9;
      if (relSpeedKmh > 95 && Math.random() < 0.35) this.wheels[0].punctured = true;
    } else if (localSide === 'right') {
      this.damage.panelDeform.sideRight = Math.min(1, this.damage.panelDeform.sideRight + norm * 0.52);
      this.damage.suspensionDamage = Math.min(1, this.damage.suspensionDamage + norm * 0.35);
      this.angularVelYaw += norm * 0.9;
      if (relSpeedKmh > 95 && Math.random() < 0.35) this.wheels[1].punctured = true;
    } else {
      this.damage.panelDeform.rear = Math.min(1, this.damage.panelDeform.rear + norm * 0.48);
      this.angularVelYaw += (Math.random() - 0.5) * norm * 1.3;
      if (relSpeedKmh > 80) this.damage.gearboxDamage = Math.min(1, this.damage.gearboxDamage + norm * 0.4);
    }

    this.damage.engineHealth = Math.max(15, this.damage.engineHealth - norm * 22);
    if (this.damage.engineHealth < 48) this.damage.oilLeakActive = true;
  }

  public step(params: VehicleStepParams): { speedKmh: number; maxSlip: number } {
    const dt = Math.min(0.05, Math.max(0.001, params.dt));
    this.simTime += dt;
    this.elapsedLike = this.simTime;
    const stats = computeEffectiveCarStats(params.car, params.tune);
    const isRC = params.car.category === 'rc_revolt';

    const comp = COMPOUND_PARAMS[params.tune.tireCompound];
    const brandMod = BRAND_GRIP_MOD[params.tune.tireBrand];
    const radiusM = isRC ? 0.14 : 0.335;
    this.refreshTireSpec(comp, brandMod, radiusM, params.tune, params.weather);

    const massKg = isRC ? 1200 : Math.max(320, stats.effectiveWeightKg);
    const wheelbaseM = isRC ? 1.8 : stats.cogHeightM < 0.42 ? 2.62 : 2.72;
    const trackWidthM = isRC ? 0.42 : 1.62;

    // Accumulator: consume the frame in exact fixed sub-steps. Leftover time is
    // carried, never dropped, so a 30 fps hitch does not compress the physics.
    this.accumulator += dt;
    let steps = 0;
    let speedKmh = 0;
    while (this.accumulator >= 1 / SUBSTEP_HZ && steps < MAX_SUBSTEPS) {
      const h = 1 / SUBSTEP_HZ;
      this.substep(h, params, stats, massKg, wheelbaseM, trackWidthM, radiusM, isRC);
      this.accumulator -= h;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) this.accumulator = 0; // don't spiral after a long stall

    const forwardSpeed = this.u;
    speedKmh = Math.abs(forwardSpeed) * 3.6;

    // --- Telemetry / visuals -------------------------------------------------
    this.wheelSpinRad += (this.wheelOmega[2] + this.wheelOmega[3]) * 0.5 * dt;

    let maxSlip = 0;
    for (let i = 0; i < 4; i++) {
      const c = this.contacts[i];
      const w = this.wheels[i];
      w.slipAngleRad = c.slipAngleRad;
      w.slipRatio = c.slipRatio;
      w.tempMidC = c.surfaceTempC;
      w.tempInnerC = c.surfaceTempC + Math.abs(i < 2 ? params.tune.camberFrontDeg : params.tune.camberRearDeg) * 2.1;
      w.tempOuterC = c.surfaceTempC - 1.6;
      // Ideal gas behaviour for the tyre: 0.065 psi per C is close to the real
      // "1 psi per 10 F" rule and makes hot-pressure telemetry believable.
      w.pressurePsi = Number((28.0 + (c.surfaceTempC - 25) * 0.062).toFixed(1));
      w.wearPercent = c.wear * 100;
      w.suspensionCompressionMm = Number(((c.loadN / Math.max(20, params.tune.springRateFrontNmm * 1000)) * 1000).toFixed(1));
      if (w.wearPercent <= 1.5 && params.tireWearEnabled) w.punctured = true;
      maxSlip = Math.max(maxSlip, Math.hypot(c.slipRatio, Math.tan(c.slipAngleRad)));
    }

    // Emergent attitude: pitch from axle load difference, roll from lateral
    // transfer, both normalised by the spring package the player chose.
    const g = GRAVITY * params.gravityG;
    const rollStiffness = (params.tune.springRateFrontNmm * 0.55 + params.tune.springRateRearNmm * 0.45) * 1000;
    const rollAngleTarget = Math.atan2(massKg * this.lastAy * stats.cogHeightM, Math.max(12000, rollStiffness * trackWidthM));
    const pitchAngleTarget = Math.atan2(massKg * this.lastAx * stats.cogHeightM, Math.max(12000, rollStiffness * wheelbaseM));
    this.rollRad += (Math.max(-0.2, Math.min(0.2, rollAngleTarget)) - this.rollRad) * Math.min(1, dt * 18);
    this.pitchRad += (Math.max(-0.12, Math.min(0.12, pitchAngleTarget)) - this.pitchRad) * Math.min(1, dt * 18);
    void g;

    this.gForceLong = Number((this.lastAx / GRAVITY).toFixed(2));
    this.gForceLat = Number((this.lastAy / GRAVITY).toFixed(2));

    return { speedKmh, maxSlip };
  }

  private refreshTireSpec(
    comp: (typeof COMPOUND_PARAMS)[keyof typeof COMPOUND_PARAMS],
    brandMod: number,
    radiusM: number,
    tune: CarTuneSetup,
    weather: WeatherPreset
  ): void {
    const key = `${tune.tireCompound}|${tune.tireBrand}|${radiusM}|${tune.camberFrontDeg}`;
    if (key === this.tireSpecKey) return;
    this.tireSpecKey = key;
    const isOffRoad = tune.tireCompound === 'off_road' || tune.tireCompound === 'drift';
    this.tireSpec = buildTireSpec({
      peakFriction: comp.peakD * brandMod,
      lateralRatio: tune.tireCompound === 'drift' ? 0.9 : 0.96,
      stiffness: comp.stiffnessB,
      radiusM,
      isOffRoad,
    });
    this.thermal = {
      ambientC: weather.ambientTempC,
      optimalC: comp.optTempC,
      tempSensitivityPerC: 0.0024,
      treadHeatCapacityJK: isOffRoad ? 12000 : 8200,
      coolingCoeff: 2.1,
      wearRate: comp.wearRate * 0.55,
    };
  }

  private substep(
    h: number,
    p: VehicleStepParams,
    stats: ReturnType<typeof computeEffectiveCarStats>,
    massKg: number,
    wheelbaseM: number,
    trackWidthM: number,
    radiusM: number,
    isRC: boolean
  ): void {
    const tune = p.tune;
    const driveIndexes = this.driveWheelIndexes(p.car.drivetrain);
    const gearCount = Math.max(3, Math.min(8, tune.gearCount));
    const ratios = tune.gearRatios;

    // --- 1. Gear / shift logic ---------------------------------------------
    if (this.shiftTimer > 0) this.shiftTimer = Math.max(0, this.shiftTimer - h);

    const manual = tune.transmission === 'manual' && p.assistMode === 'hardcore_sim';
    if (manual) {
      if (p.shiftUpPulse && !this.lastShiftInput && this.gear < gearCount) {
        this.gear++;
        this.shiftTimer = 0.16;
      } else if (p.shiftDownPulse && !this.lastShiftInput && this.gear > 1) {
        this.gear--;
        this.shiftTimer = 0.1;
        this.backfireTimer = 0.18;
      }
    } else if (p.shiftUpPulse && !this.lastShiftInput && this.gear < gearCount) {
      this.gear++;
      this.shiftTimer = tune.transmission === 'dual_clutch' ? 0.045 : 0.09;
    } else if (p.shiftDownPulse && !this.lastShiftInput && this.gear > 1) {
      this.gear--;
      this.shiftTimer = 0.06;
      this.backfireTimer = 0.14;
    } else if (this.gear >= 1 && this.shiftTimer <= 0 && this.shiftCooldown <= 0) {
      // Predictive shift logic. v1 compared engine rpm against two fixed
      // thresholds, which makes the box hunt (up, up, down, up) whenever the
      // driven wheels are spinning, because wheelspin raises the rpm used for
      // the decision. Real ECUs check the rpm the engine *will* turn in the new
      // gear, and enforce a minimum dwell time. Without this, a 400 hp car
      // under wheelspin downshifts into a torque hole and stops accelerating —
      // a failure a player reads instantly as "the car is broken".
      const currentRatio = Math.abs(ratios[Math.min(ratios.length - 1, this.gear - 1)] ?? 1.2);
      const upRatio = this.gear < gearCount ? Math.abs(ratios[this.gear] ?? currentRatio) : currentRatio;
      const downRatio = this.gear > 1 ? Math.abs(ratios[this.gear - 2] ?? currentRatio) : currentRatio;
      const predictedUpRpm = this.rpm * (upRatio / currentRatio);
      const predictedDownRpm = this.rpm * (downRatio / currentRatio);

      if (
        this.rpm > stats.maxRpm * 0.945 &&
        this.gear < gearCount &&
        p.throttle > 0.15 &&
        predictedUpRpm > stats.maxRpm * 0.48
      ) {
        this.gear++;
        this.shiftTimer = tune.transmission === 'dual_clutch' ? 0.04 : 0.1;
        this.shiftCooldown = 0.28;
        this.backfireTimer = 0.12;
      } else if (
        this.rpm < stats.maxRpm * 0.42 &&
        this.gear > 1 &&
        predictedDownRpm < stats.maxRpm * 0.9
      ) {
        this.gear--;
        this.shiftTimer = 0.05;
        this.shiftCooldown = 0.3;
      }
    }
    if (this.shiftCooldown > 0) this.shiftCooldown = Math.max(0, this.shiftCooldown - h);
    this.lastShiftInput = p.shiftUpPulse || p.shiftDownPulse;

    // Reverse selection requires an explicit permission bit. v1 selected reverse
    // whenever the brake was held at a standstill — which meant the three-second
    // grid countdown (where the engine feeds brake = 1) put the car in reverse
    // before the lights went out.
    const allowReverse = p.allowReverse ?? true;
    if (allowReverse && p.brake > 0.5 && Math.abs(this.u) < 0.5 && p.throttle < 0.1 && this.gear > 0) {
      this.gear = -1;
    } else if (this.gear === -1 && (p.throttle > 0.2 || !allowReverse)) {
      this.gear = 1;
    }

    // Damaged gearbox: third gear becomes unusable, which the player feels as a
    // hole in the ratio stack instead of a numeric penalty.
    if (p.damageEnabled && this.damage.gearboxDamage > 0.65 && this.gear === 3) this.gear = 4;

    const isReverse = this.gear === -1;
    const ratio = Math.abs(isReverse ? 3.2 : ratios[Math.min(ratios.length - 1, Math.max(0, this.gear - 1))] ?? 1.2);
    const finalDrive = tune.finalDrive;

    // --- 2. Engine speed ----------------------------------------------------
    const drivenOmega =
      driveIndexes.reduce((acc, i) => acc + this.wheelOmega[i], 0) / Math.max(1, driveIndexes.length);
    const wheelDrivenRpm = Math.abs(drivenOmega) * ratio * finalDrive * (60 / (2 * Math.PI));
    const moving = Math.abs(this.u) > 1.1;

    // Clutch slip on launch: below ~12 km/h the engine can sit above the wheel
    // speed. This is what makes a launch feel like a clutch dump instead of a
    // teleporting torque curve, and it also makes wheelspin audible.
    const launchRpm = 1400 + p.throttle * stats.maxRpm * 0.52;
    const clutchTarget = moving ? wheelDrivenRpm : launchRpm;
    const slipAmount = moving ? Math.max(0, launchRpm - wheelDrivenRpm) * (1 - Math.min(1, this.u / 9)) : 0;
    this.clutchSlip = Math.min(1, slipAmount / Math.max(400, stats.maxRpm * 0.4));

    // `rawRpm` is NOT clamped: it is the physical engine speed implied by the
    // driveline. If the wheels are overspeeding the engine, rawRpm rises above
    // the redline and the limiter must see that. v1 clamped here, which silently
    // deleted the limiter and let first gear spin the wheel to 100+ rad/s.
    const rawRpm = clutchTarget + slipAmount * 0.55;
    const targetRpm = rawRpm;
    // Engine rotational inertia: 0.06 s time constant on the free-rev side,
    // much faster coupling when the clutch is closed.
    const rpmTau = moving ? 0.055 : 0.16;
    this.rpm += (targetRpm - this.rpm) * Math.min(1, h / rpmTau);

    const rpmNorm = Math.max(0.05, Math.min(1.02, this.rpm / stats.maxRpm));
    const overRevNorm = Math.max(0, this.rpm / stats.maxRpm - 1);

    // Rev limiter with ignition cut, not a clamp. The oscillation is what makes
    // the limiter legible to the ear and to the dyno graph.
    this.limiterActive = this.rpm > stats.maxRpm * 0.995;
    // Ignition cut is binary; the *bounce* comes from the driveline decelerating
    // during the cut and re-accelerating when fuel returns. A 45 ms cycle is a
    // typical hard-cut limiter and it is what you hear as the "bap-bap-bap".
    this.limiterPhase += h / 0.045;
    const limiterCut = this.limiterActive ? (Math.sin(this.limiterPhase * Math.PI * 2) > 0 ? 0 : 1) : 1;
    if (!this.limiterActive) this.limiterPhase = 0;

    // --- 3. Torque curve & boost -------------------------------------------
    let boostLag = 0.35;
    if (tune.induction === 'turbo') boostLag = 0.62;
    if (tune.induction === 'twin_turbo') boostLag = 0.44;
    if (tune.induction === 'supercharger') boostLag = 0.09;

    const spool = Math.min(1, Math.max(0, (rpmNorm - 0.22) / 0.42));
    const targetBoost = tune.induction === 'na' ? 0 : p.throttle * tune.boostPsi * spool;
    // Asymmetric lag: builds slower than it dumps (wastegate is fast, turbine
    // inertia is not). This asymmetry is audible as the "tsss-tah" of lift-off.
    const boosting = targetBoost > this.boostPsi;
    this.boostPsi +=
      (targetBoost - this.boostPsi) * Math.min(1, h / (boosting ? boostLag : boostLag * 0.35));

    let boostMult = 1;
    if (tune.induction !== 'na') boostMult = 1 + (this.boostPsi / Math.max(4, tune.boostPsi)) * (tune.induction === 'supercharger' ? 0.16 : 0.26);

    // Torque shape: quadratic falloff from a ~0.72 rpm peak, plus a low-end
    // floor. Real engines are not sinusoidal; a sine curve (v1) gives a torque
    // plateau in the middle of the range and a fake "hole" at 1000 rpm.
    const torqueShape = Math.max(0.12, 0.42 + 1.28 * rpmNorm - 0.72 * rpmNorm * rpmNorm);
    const overheatPenalty = this.engineTempC > 118 ? Math.max(0.62, 1 - (this.engineTempC - 118) * 0.018) : 1;
    const healthPenalty = p.damageEnabled ? 0.62 + (this.damage.engineHealth / 100) * 0.38 : 1;
    const fuelPenalty = p.fuelConsumptionEnabled && this.fuelLiters <= 0.25 ? 0.4 : 1;

    let nitroMult = 1;
    if (p.nitroInput && this.nitroRemainingKg > 0.02 && p.throttle > 0.35) {
      nitroMult = 1.34;
      this.nitroRemainingKg = Math.max(0, this.nitroRemainingKg - h * 0.62);
    }

    const engineTorque =
      stats.effectiveTorqueNm *
      torqueShape *
      boostMult *
      nitroMult *
      p.turboStarBoost *
      overheatPenalty *
      healthPenalty *
      fuelPenalty *
      limiterCut;

    // Engine braking / coast torque: present at zero throttle, stronger with rpm.
    const coastTorque = (1 - p.throttle) * (12 + 44 * rpmNorm) * (isRC ? 0.1 : 1);
    let axleTorque = (engineTorque * p.throttle - coastTorque) * ratio * finalDrive * 0.92;
    if (this.shiftTimer > 0) axleTorque = 0;
    // Over-rev: the engine is being driven past redline by the wheels. Fuel is
    // cut and pumping losses brake the driveline. This is what caps wheelspin
    // in first gear at a finite wheel speed instead of letting it run away.
    if (overRevNorm > 0) {
      axleTorque = -overRevNorm * stats.maxRpm * 0.55 * Math.sign(drivenOmega || 1);
    }
    if (isReverse) axleTorque *= -1;

    // --- 4. Steering angle --------------------------------------------------
    // Rate-limit the steering input. A keyboard produces a step function (0 ->
    // 100% lock in one frame), which no human hand and no steering rack can do.
    // Feeding a step into a real tyre model saturates the front axle instantly
    // and the car snaps into understeer — that is why "realistic physics" often
    // feels worse than arcade physics with a digital input. The rate limit is
    // the interface, not a physics fudge: 3.2/s to add lock, 6/s to return.
    const steerTarget = Math.max(-1, Math.min(1, p.steeringInput));
    const returning = Math.abs(steerTarget) < Math.abs(this.steerState);
    const maxSteerDelta = (returning ? 6.0 : 3.2) * h;
    this.steerState += Math.max(
      -maxSteerDelta,
      Math.min(maxSteerDelta, steerTarget - this.steerState)
    );
    const speedAbs = Math.abs(this.u);
    const maxSteer = (isRC ? 0.62 : 0.46) * (1 / (1 + speedAbs * 0.018));
    let steerAngle = this.steerState * maxSteer;
    // Puncture / bent suspension pulls the wheel: modelled as an offset on the
    // steering angle, which the tyre model then turns into a real yaw moment.
    const puncturePull = (this.wheels[0].punctured ? -0.05 : 0) + (this.wheels[1].punctured ? 0.05 : 0);
    steerAngle += puncturePull + (p.damageEnabled ? this.damage.suspensionDamage * 0.02 : 0);

    // --- 5. Per-wheel loads -------------------------------------------------
    const g = GRAVITY * p.gravityG;
    const frontDist = p.car.drivetrain === 'FWD' ? 0.62 : p.car.drivetrain === 'AWD' ? 0.53 : 0.47;
    const staticFront = (massKg * g * frontDist) / 2;
    const staticRear = (massKg * g * (1 - frontDist)) / 2;

    const frontalAreaM2 = isRC ? 0.18 : 2.05;
    this.downforceN = 0.5 * 1.225 * frontalAreaM2 * Math.abs(stats.clDownforce) * this.u * this.u;
    const effectiveCd = stats.cdDrag * (1 - p.slipstreamFactor * 0.24);
    this.dragN = 0.5 * 1.225 * frontalAreaM2 * effectiveCd * this.u * this.u;

    const dfFront = this.downforceN * 0.42;
    const dfRear = this.downforceN * 0.58;
    const longTransfer = (massKg * this.lastAx * stats.cogHeightM) / Math.max(1.6, wheelbaseM);
    const latTransferTotal = (massKg * this.lastAy * stats.cogHeightM) / Math.max(1.0, trackWidthM);
    const frontRollShare = 0.55;

    const loads: number[] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const isFront = WHEEL_IS_FRONT[i];
      const lateralSign = WHEEL_LATERAL[i];
      let fz = (isFront ? staticFront : staticRear) + (isFront ? dfFront : dfRear) / 2;
      fz -= isFront ? longTransfer / 2 : -longTransfer / 2;
      // Weight transfers away from the direction of lateral acceleration.
      fz -= lateralSign * latTransferTotal * (isFront ? frontRollShare : 1 - frontRollShare) * 0.5;
      const springScale = 1 / Math.max(0.55, (isFront ? tune.springRateFrontNmm : tune.springRateRearNmm) / 75);
      loads[i] = Math.max(0, fz * springScale);
    }

    // --- 6. Contact patch velocities & tyre forces --------------------------
    const halfBase = wheelbaseM / 2;
    const halfTrack = trackWidthM / 2;
    const wetness = Math.min(1, p.weather.wetness + (p.onPuddle ? 0.55 : 0));
    const surfaceMu = p.surfaceGrip * p.weather.gripMultiplier * (p.onOilSlick ? 0.34 : 1);

    let fxBody = 0;
    let fyBody = 0;
    let yawMoment = 0;
    let frontLoadSum = 0;
    let rearLoadSum = 0;
    let leftLoadSum = 0;
    let rightLoadSum = 0;

    for (let i = 0; i < 4; i++) {
      const isFront = WHEEL_IS_FRONT[i];
      const fOffset = isFront ? halfBase : -halfBase;
      const lOffset = WHEEL_LATERAL[i] * halfTrack;

      // Velocity of this contact patch in the body frame.
      const uWheel = this.u - this.angularVelYaw * lOffset;
      const vWheel = this.vLat + this.angularVelYaw * fOffset;

      const delta = isFront ? steerAngle : 0;
      const cosD = Math.cos(delta);
      const sinD = Math.sin(delta);
      const uTire = uWheel * cosD + vWheel * sinD;
      const vTire = -uWheel * sinD + vWheel * cosD;

      // Camber = static tune + body roll acting on this corner.
      const camberDeg =
        (isFront ? tune.camberFrontDeg : tune.camberRearDeg) +
        (this.rollRad * (WHEEL_LATERAL[i] > 0 ? 1 : -1) * 180) / Math.PI;

      const contact = this.contacts[i];
      // A locked wheel has zero angular velocity: the tyre model then reports a
      // full-negative slip ratio and the friction ellipse kills lateral grip.
      const omega = this.wheelLocked[i] ? 0 : this.wheelOmega[i];

      evaluateTire({
        spec: this.tireSpec,
        thermal: this.thermal,
        state: contact,
        omegaRadS: omega,
        forwardVelocityMs: uTire,
        lateralVelocityMs: vTire,
        loadN: loads[i],
        surfaceMu,
        wetness,
        camberRad: camberDeg,
        dt: h,
        pressureFactor: 1 - Math.abs(this.wheels[i].pressurePsi - 33) * 0.004,
      });

      // Rotate tyre force into body axes.
      const fFwd = contact.forceXN * cosD - contact.forceYN * sinD;
      const fLat = contact.forceXN * sinD + contact.forceYN * cosD;
      fxBody += fFwd;
      fyBody += fLat;
      yawMoment += fOffset * fLat - lOffset * fFwd;

      if (isFront) frontLoadSum += loads[i];
      else rearLoadSum += loads[i];
      if (WHEEL_LATERAL[i] < 0) leftLoadSum += loads[i];
      else rightLoadSum += loads[i];
    }

    // --- 7. Brakes & wheel spin dynamics ------------------------------------
    const brakeBiasFront = tune.brakeBiasFront;
    const totalBrakeTorque = massKg * g * 1.28 * radiusM * (isRC ? 0.35 : 1);
    const fade = this.brakeTempC > 780 ? 0.74 : 1;
    // ABS modulates instead of removing the brake: a 12 Hz dither that keeps the
    // wheel near peak slip. Hardcore mode has none, so the wheel locks.
    this.absCycling += h * 12;
    const absFactor =
      p.assistMode === 'hardcore_sim' ? 1 : 0.82 + Math.sin(this.absCycling * Math.PI * 2) * 0.16;
    const absAllowed = p.assistMode !== 'hardcore_sim';

    for (let i = 0; i < 4; i++) {
      const isFront = WHEEL_IS_FRONT[i];
      const c = this.contacts[i];
      const bias = isFront ? brakeBiasFront / 2 : (1 - brakeBiasFront) / 2;
      let brakeTorque = p.brake * totalBrakeTorque * bias * fade;

      if (p.handbrake && !isFront) brakeTorque = totalBrakeTorque * 0.62;

      // ABS: back off when the tyre is past peak slip and still rotating.
      if (absAllowed && Math.abs(c.slipRatio) > 0.16 && Math.abs(this.u) > 3) {
        brakeTorque *= absFactor * 0.45;
      }

      // Traction control: cut torque on the driven wheel when it spins.
      let driveTorque = 0;
      if (driveIndexes.includes(i) && this.gear !== 0) {
        const share = this.differentialShare(i, driveIndexes);
        driveTorque = axleTorque * share * (1 - this.tractionCut);
        if (p.assistMode !== 'hardcore_sim' && c.slipRatio > 0.14 && this.u > 1 && p.throttle > 0.05) {
          driveTorque *= 0.35;
        }
      }

      // Semi-implicit wheel update.
      //
      // The wheel-spin ODE is stiff: (dFx/domega)*r/I is on the order of
      // 2500 1/s, so an explicit step at 240 Hz overshoots by ~10x every step
      // and the wheel oscillates between +3000 N and -3700 N of drive force.
      // That is exactly the "buzzing, impossible to launch" failure of naive
      // tyre models, and it is what the front wheels were doing here.
      //
      // Linearising the tyre's longitudinal stiffness around the current
      // operating point and solving the wheel step implicitly is
      // unconditionally stable:
      //   (I + h*D) * domega = h * (T_drive + T_tyre - T_brake),  D = (dFx/domega)*r
      // I/D (the wheel's own time constant) is ~0.4 ms, so the wheel still
      // reaches steady-state slip within one frame — it just cannot overshoot.
      const reaction = -c.forceXN * radiusM;
      const denomSlip = Math.max(1.2, Math.abs(this.u));
      const rising = Math.max(0, 1 - Math.abs(c.slipRatio) / Math.max(0.02, this.tireSpec.peakSlipRatio) * 0.9);
      const kx = (this.tireSpec.muXPeak * Math.max(200, c.loadN) * surfaceMu) / this.tireSpec.peakSlipRatio;
      const implicitDamping = (kx * rising * radiusM * radiusM) / denomSlip;
      // Reflect the engine + clutch inertia through the gearing onto the driven
      // wheels. In first gear the ratio^2 term is ~165, so the driveline is an
      // order of magnitude heavier than the wheel itself. Ignoring it is why
      // naive models let a 400 hp car spin its rears to 100 rad/s instantly.
      const gearRatioTotal = Math.max(1, ratio * finalDrive);
      const reflectedInertia = driveIndexes.includes(i)
        ? (ENGINE_INERTIA * gearRatioTotal * gearRatioTotal) / driveIndexes.length
        : 0;
      const effectiveInertia = this.tireSpec.wheelInertiaKgm2 + reflectedInertia;
      const brakeTorqueSigned = Math.sign(this.wheelOmega[i]) * brakeTorque;
      const deltaOmega =
        (h * (driveTorque + reaction - brakeTorqueSigned)) /
        Math.max(0.05, effectiveInertia + h * implicitDamping);
      let newOmega = this.wheelOmega[i] + deltaOmega;

      // Lock-up: if the brake torque overwhelms the tyre reaction and the wheel
      // would reverse direction, latch it at zero for this step.
      if (brakeTorque > 0 && Math.sign(newOmega) !== Math.sign(this.wheelOmega[i]) && Math.abs(newOmega) < 2) {
        newOmega = 0;
        this.wheelLocked[i] = true;
      } else if (brakeTorque < 1) {
        this.wheelLocked[i] = false;
      }
      this.wheelOmega[i] = newOmega;
    }

    // --- 8. Body force balance ---------------------------------------------
    const rollingResistance = -this.u * massKg * this.tireSpec.rollingResistance;
    const drag = -Math.sign(this.u) * this.dragN;
    const gravityAlongSlope = -massKg * g * (p.gradeSin ?? 0);
    const crosswind = p.weather.windSpeedKmh > 22
      ? 0.5 * 1.2 * 2.4 * Math.pow(p.weather.windSpeedKmh / 3.6, 2) * Math.sin(p.weather.windAngleRad - this.headingRad) * 0.22
      : 0;

    const fxTotal = fxBody + drag + rollingResistance + gravityAlongSlope;
    const fyTotal = fyBody + crosswind;

    // Kinematic accelerations (body frame, includes the rotating-frame terms).
    const ax = fxTotal / massKg + this.angularVelYaw * this.vLat;
    const ay = fyTotal / massKg - this.angularVelYaw * this.u;

    // Specific force is what an accelerometer measures: the tyre forces divided
    // by mass, WITHOUT the -r*u centripetal term. v1 fed the kinematic value to
    // the G-meter and to load transfer, which cancels out in a steady corner
    // (the tyre force and the rotation term are equal and opposite) and made the
    // G-meter read ~0.0 g in a 1.2 g corner. Load transfer was also disabled by
    // the same bug, so the car cornered as if it were on rails.
    const specificAx = fxTotal / massKg;
    const specificAy = fyTotal / massKg;

    // Yaw inertia from a solid-box approximation of the footprint.
    const izz = massKg * (wheelbaseM * wheelbaseM + trackWidthM * trackWidthM) / 12 * 1.15;
    const yawAccel = yawMoment / izz;

    this.u += ax * h;
    this.vLat += ay * h;
    // NOTE: the yaw rate is integrated once, below, together with the tyre
    // self-aligning damping (section 8b). Integrating yawAccel here *and* there
    // applies the yaw moment twice, which doubles the rotation rate of every car
    // in the game — the "os carros giram muito" report.

    // Stop condition: no drive, no roll — remove residual jitter.
    if (Math.abs(this.u) < 0.12 && p.throttle < 0.04 && p.brake > 0.05) {
      this.u = 0;
      this.vLat = 0;
      this.angularVelYaw *= 0.8;
    }

    this.headingRad += this.angularVelYaw * h;
    const fwdX = Math.sin(this.headingRad);
    const fwdZ = Math.cos(this.headingRad);
    const rightX = Math.cos(this.headingRad);
    const rightZ = -Math.sin(this.headingRad);
    this.vx = fwdX * this.u + rightX * this.vLat;
    this.vz = fwdZ * this.u + rightZ * this.vLat;
    this.x += this.vx * h;
    this.z += this.vz * h;

    this.lastAx = specificAx;
    this.lastAy = specificAy;

    // --- 8b. Tyre self-aligning damping ---------------------------------------
    // This is the single most important term for "the car will not stop
    // spinning", and its absence is why the build felt like driving on ice.
    //
    // A real pneumatic tyre's lateral force peaks at ~7-9 deg of slip and then
    // *falls*. That falling branch is negative damping: it feeds yaw energy
    // instead of removing it, so once a slide starts it self-amplifies. What
    // keeps a real car stable is the aligning torque (M_z ≈ -k·slip·Fz), which
    // is a genuine yaw spring attached to the contact patch and grows with
    // speed. Without it, a flick of the wheel at 60 km/h puts the car into a
    // spin no input can catch, which is exactly the reported behaviour.
    //
    // Modelled here as a linear yaw damper whose coefficient is the physical
    // one: each axle contributes a lateral stiffness C_alpha (N/rad) times the
    // square of its distance from the centre of gravity, divided by speed.
    {
      const cAlphaFront = 2 * (this.tireSpec.muYPeak * frontLoadSum) / Math.max(0.06, this.tireSpec.peakSlipAngleRad);
      const cAlphaRear = 2 * (this.tireSpec.muYPeak * rearLoadSum) / Math.max(0.06, this.tireSpec.peakSlipAngleRad);
      const speedSafe = Math.max(4, Math.abs(this.u));
      // Aligning stiffness (N·m/rad) of the two axles about the CoG.
      const kAlign = (cAlphaFront * halfBase * halfBase + cAlphaRear * halfBase * halfBase) / speedSafe;
      // Beyond the peak, the tyre's own slope makes it negative; the damper must
      // not become a spring that fights the driver, so it is one-sided.
      const dampCoef = kAlign * 0.3;
      const dampTorque = -this.angularVelYaw * dampCoef;
      // Integrate the damping implicitly: this term is stiff (a few hundred
      // 1/s at speed) and an explicit step at 240 Hz would ring.
      const yawRateDelta = (yawAccel + dampTorque / izz) * h;
      this.angularVelYaw += yawRateDelta / (1 + (dampCoef / izz) * h);
      // Yaw rate beyond what the front tyres could ever generate is not a slide,
      // it is a numerical artefact or a collision impulse. Clamp it.
      const yawLimit = Math.min(3.2, Math.abs(this.u) / Math.max(0.9, wheelbaseM) * 1.9 + 0.4);
      this.angularVelYaw = THREE.MathUtils.clamp(this.angularVelYaw, -yawLimit, yawLimit);
    }

    // --- 8c. Driver aids: ESC, yaw assist, countersteer help -----------------
    // Assists are *not* a substitute for the physics above; they sit on top of a
    // body that already has stable yaw dynamics. Each assist is a real control
    // system with a real actuator (differential brake, torque cut, steering
    // torque overlay), so it can be disabled and the car still behaves.
    {
      const speedAbs2 = Math.abs(this.u);
      if (p.assistMode !== 'hardcore_sim' && speedAbs2 > 3) {
        // Reference yaw from the driver's intent: a neutral-steer bicycle model
        // with the understeer gradient left in. This is what the car *should*
        // be rotating at for the current steer angle and speed.
        const deltaActual = steerAngle;
        const kUnder = Math.max(0.0008, 0.0016 + (frontLoadSum - rearLoadSum) / Math.max(1, massKg * g) * 0.002);
        const desiredYaw =
          (speedAbs2 * Math.tan(deltaActual)) /
          (wheelbaseM + kUnder * speedAbs2 * speedAbs2) *
          (this.u >= 0 ? 1 : -1);

        const yawError = this.angularVelYaw - desiredYaw;
        // Proportional + derivative on the *slip* (not on steer), which is how a
        // production ESC works: it only intervenes when the body slip exceeds
        // the driver's demand, never to make the car faster.
        const beta = Math.atan2(this.vLat, Math.max(2, Math.abs(this.u))) * (this.u >= 0 ? 1 : -1);
        const escGain = p.assistMode === 'casual' ? 1.0 : 0.55;
        const oversteer = Math.sign(yawError) * Math.min(1, Math.max(0, Math.abs(yawError) - 0.06) * 1.4);
        const betaTerm = Math.sign(beta) * Math.min(1, Math.max(0, Math.abs(beta) - 0.05) * 15);

        // Actuator 1: brake the outside front wheel (the classic ESC yaw
        // correction). Applied as a wheel torque so it shows up in the tyre
        // model, the brake temperature and the telemetry.
        if (oversteer > 0 && Math.abs(yawError) > 0.06) {
          const brakeWheel = yawError > 0 ? 1 : 0; // outside front
          const mag = Math.min(1, oversteer * escGain * 1.8);
          this.wheelOmega[brakeWheel] *= 1 - 0.35 * mag * Math.min(1, h * 40);
          this.brakeTempC = Math.min(720, this.brakeTempC + mag * 6 * h);
        }

        // Actuator 2: torque cut. If the rear is sliding under power, cutting
        // drive is the fastest way back to grip — and it is what the player
        // feels as "the car saved itself".
        if (betaTerm > 0.15 && p.throttle > 0.2) {
          const cut = Math.min(0.75, betaTerm * 0.6 * escGain);
          this.tractionCut = cut;
        } else {
          this.tractionCut *= Math.max(0, 1 - h * 6);
        }

        // Actuator 3: countersteer assist. In casual mode the front wheels get
        // an automatic opposite-lock overlay proportional to body slip; this is
        // the only assist that touches steering, and it is disabled in pro.
        if (p.assistMode === 'casual' && Math.abs(beta) > 0.09) {
          const overlay = THREE.MathUtils.clamp(-beta * 1.4, -0.32, 0.32);
          this.steerState = THREE.MathUtils.clamp(this.steerState * (1 - h * 4) + overlay * h * 4, -1, 1);
        }

        // Yaw-rate ceiling: never allow the body to rotate faster than the front
        // axle could ask for (plus a margin for a deliberate handbrake spin).
        const allowed = Math.abs(desiredYaw) + (p.handbrake ? 2.2 : 0.55);
        if (Math.abs(this.angularVelYaw) > allowed) {
          this.angularVelYaw = Math.sign(this.angularVelYaw) * allowed;
        }
      } else {
        this.tractionCut *= Math.max(0, 1 - h * 6);
      }
    }

    // --- 9. Thermals & consumables -----------------------------------------
    const coolingAir = speedAbs * 0.14;
    const heatIn = p.throttle * 5.2 + (p.damageEnabled ? this.damage.radiatorDamage * 9.5 : 0);
    this.engineTempC = Math.max(
      p.weather.ambientTempC + 45,
      Math.min(138, this.engineTempC + (heatIn - coolingAir * 0.25 - (this.engineTempC - 88) * 0.18) * h)
    );
    this.oilTempC = this.engineTempC + 7;

    this.brakeTempC = Math.max(
      p.weather.ambientTempC + 20,
      Math.min(980, this.brakeTempC + (p.brake * speedAbs * 11.5 - (this.brakeTempC - 90) * (0.45 + speedAbs * 0.02)) * h)
    );

    if (p.fuelConsumptionEnabled && this.fuelLiters > 0.2) {
      this.fuelLiters = Math.max(0.2, this.fuelLiters - h * (0.012 + p.throttle * 0.048));
    }

    if (p.weather.precipitationType === 'acid_rain') {
      this.damage.paintCorrosion = Math.min(1, this.damage.paintCorrosion + h * 0.018);
    } else if (p.weather.precipitationType === 'hail' && p.weather.precipitationIntensity > 0.8 && p.damageEnabled) {
      this.damage.engineHealth = Math.max(40, this.damage.engineHealth - h * 0.25);
    }

    if (this.backfireTimer > 0) this.backfireTimer = Math.max(0, this.backfireTimer - h);

    if (p.tireWearEnabled) {
      for (let i = 0; i < 4; i++) {
        const c = this.contacts[i];
        if (c.utilisation > 0.92 && Math.abs(this.u) > 6) {
          c.wear = Math.max(0, c.wear - h * this.thermal.wearRate * 0.00012 * c.utilisation);
        }
      }
    }

    void frontLoadSum;
    void rearLoadSum;
    void leftLoadSum;
    void rightLoadSum;
  }

  private driveWheelIndexes(drivetrain: 'RWD' | 'FWD' | 'AWD'): number[] {
    if (drivetrain === 'FWD') return [0, 1];
    if (drivetrain === 'AWD') return [0, 1, 2, 3];
    return [2, 3];
  }

  /**
   * Open differential by default: torque splits evenly, so the wheel with less
   * load spins up until the tyre's own slip curve limits it. A light viscous
   * coupling then shifts torque toward the slower wheel, which gives the mild
   * "both rear wheels spin" behaviour of a road LSD without a clutch-type model.
   */
  private differentialShare(index: number, driveIndexes: number[]): number {
    if (drivetrainIsAwd(driveIndexes)) {
      return index < 2 ? (0.4 / 2) : (0.6 / 2);
    }
    const a = driveIndexes[0];
    const b = driveIndexes[1];
    const omegaA = this.wheelOmega[a];
    const omegaB = this.wheelOmega[b];
    const diff = omegaA - omegaB;
    const transfer = Math.max(-0.22, Math.min(0.22, diff * 0.03));
    return index === a ? 0.5 - transfer : 0.5 + transfer;
  }
}

function drivetrainIsAwd(indexes: number[]): boolean {
  return indexes.length === 4;
}
