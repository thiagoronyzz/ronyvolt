import {
  CarSpec,
  CarTuneSetup,
  DamageState,
  EngineType,
  TireBrand,
  TireCompound,
  WeatherPreset,
  WheelTelemetry,
} from '../types/game';

export type AssistMode = 'casual' | 'pro' | 'hardcore_sim';

export interface EngineSwapProfile {
  type: EngineType;
  label: string;
  baseHp: number;
  baseTorqueNm: number;
  maxRpm: number;
  engineWeightKg: number;
}

export const ENGINE_SWAPS: EngineSwapProfile[] = [
  { type: 'model_t_i4', label: '1908 Ford Model T 2.9L L-Head (20cv)', baseHp: 22, baseTorqueNm: 110, maxRpm: 1800, engineWeightKg: 155 },
  { type: 'i4_econobox', label: '1.0 Fire / VHC Aspirado Econômico (70cv)', baseHp: 70, baseTorqueNm: 96, maxRpm: 6200, engineWeightKg: 82 },
  { type: 'i4_vtec_turbo', label: '2.0L K20 / AP Forged Turbo (420cv)', baseHp: 420, baseTorqueNm: 460, maxRpm: 8600, engineWeightKg: 138 },
  { type: 'flat6_gt3', label: '4.0L Boxer-6 Motorsport 9.000 RPM (540cv)', baseHp: 540, baseTorqueNm: 475, maxRpm: 9000, engineWeightKg: 175 },
  { type: 'v8_crossplane', label: '7.0L V8 Big-Block Supercharged (880cv)', baseHp: 880, baseTorqueNm: 980, maxRpm: 7200, engineWeightKg: 265 },
  { type: 'v10_screamer', label: '3.0L F1 V10 19.000 RPM Screamer (940cv)', baseHp: 940, baseTorqueNm: 520, maxRpm: 18500, engineWeightKg: 98 },
  { type: 'v12_italian', label: '6.5L V12 Aspirado Modena (860cv)', baseHp: 860, baseTorqueNm: 740, maxRpm: 9500, engineWeightKg: 235 },
  { type: 'w16_quadturbo', label: '8.0L W16 Quad-Turbo Hyper (1.600cv)', baseHp: 1600, baseTorqueNm: 1650, maxRpm: 7100, engineWeightKg: 400 },
  { type: 'ev_quadmotor', label: 'Quad-Motor Axial 1.600V Estado Sólido (1.950cv)', baseHp: 1950, baseTorqueNm: 2360, maxRpm: 16000, engineWeightKg: 340 },
  { type: 'rc_brushless', label: 'Motor RC Brushless 6S LiPo 42.000 RPM', baseHp: 9, baseTorqueNm: 14, maxRpm: 14000, engineWeightKg: 1 },
  { type: 'steam_boiler', label: 'Caldeira a Vapor de Latão Alta Pressão (450cv)', baseHp: 450, baseTorqueNm: 1300, maxRpm: 2600, engineWeightKg: 520 },
  { type: 'nuclear_turbine', label: 'Turbina de Fissão Compacta Cherenkov (3.500cv)', baseHp: 3500, baseTorqueNm: 3100, maxRpm: 15000, engineWeightKg: 390 },
];

const COMPOUND_PARAMS: Record<
  TireCompound,
  { peakD: number; stiffnessB: number; optTempC: number; wearRate: number; wetBonus: number }
> = {
  ultra_soft: { peakD: 1.36, stiffnessB: 12.0, optTempC: 92, wearRate: 1.85, wetBonus: 0.62 },
  soft: { peakD: 1.25, stiffnessB: 11.2, optTempC: 86, wearRate: 1.3, wetBonus: 0.7 },
  medium: { peakD: 1.14, stiffnessB: 10.2, optTempC: 80, wearRate: 0.85, wetBonus: 0.78 },
  hard: { peakD: 1.04, stiffnessB: 9.4, optTempC: 75, wearRate: 0.48, wetBonus: 0.74 },
  wet: { peakD: 0.98, stiffnessB: 8.8, optTempC: 52, wearRate: 1.1, wetBonus: 1.32 },
  intermediate: { peakD: 1.06, stiffnessB: 9.6, optTempC: 62, wearRate: 0.95, wetBonus: 1.16 },
  off_road: { peakD: 1.08, stiffnessB: 8.2, optTempC: 68, wearRate: 0.65, wetBonus: 1.12 },
  drift: { peakD: 0.86, stiffnessB: 7.4, optTempC: 95, wearRate: 1.45, wetBonus: 0.75 },
};

const BRAND_GRIP_MOD: Record<TireBrand, number> = {
  Michelin: 1.03,
  Pirelli: 1.04,
  Bridgestone: 1.02,
  Continental: 1.01,
  Goodyear: 1.02,
};

/**
 * Pacejka "Magic Formula" Tire Force Model:
 * y(x) = D * sin(C * atan(B*x - E*(B*x - atan(B*x))))
 */
export function pacejkaMagicFormula(
  slip: number,
  B: number,
  C: number,
  D: number,
  E: number
): number {
  const bx = B * slip;
  return D * Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
}

export function computeEffectiveCarStats(car: CarSpec, tune: CarTuneSetup): {
  effectiveHp: number;
  effectiveTorqueNm: number;
  effectiveWeightKg: number;
  maxRpm: number;
  cogHeightM: number;
  chassisOverloaded: boolean;
  clDownforce: number;
  cdDrag: number;
} {
  let hp = car.horsepower;
  let torque = car.torqueNm;
  let weight = car.weightKg + tune.fuelLoadLiters * 0.75;
  let maxRpm = 7200;

  const origProfile = ENGINE_SWAPS.find((e) => e.type === car.engineType) ?? ENGINE_SWAPS[1];
  maxRpm = origProfile.maxRpm;

  if (tune.engineSwap && tune.engineSwap !== car.engineType) {
    const swap = ENGINE_SWAPS.find((e) => e.type === tune.engineSwap) ?? origProfile;
    hp = swap.baseHp;
    torque = swap.baseTorqueNm;
    weight += swap.engineWeightKg - origProfile.engineWeightKg;
    maxRpm = swap.maxRpm;
  }

  // Forced Induction Multiplier
  const boostMult =
    tune.induction === 'na'
      ? 1.0
      : tune.induction === 'supercharger'
      ? 1.18 + tune.boostPsi * 0.014
      : tune.induction === 'turbo'
      ? 1.22 + tune.boostPsi * 0.018
      : 1.3 + tune.boostPsi * 0.022;

  hp *= boostMult;
  torque *= boostMult;

  if (tune.exhaustStyle === 'titanium_race') {
    hp *= 1.05;
    weight -= 12;
  } else if (tune.exhaustStyle === 'straight_pipe') {
    hp *= 1.04;
  } else if (tune.exhaustStyle === 'escapamento_furado') {
    hp *= 1.015; // Barulho psicológico de +50cv!
  }

  // Mythical Fiat Uno Roof Ladder Easter Egg!
  if (tune.unoRoofLadder) {
    hp += 220;
    torque += 240;
  }

  if (tune.subwooferLevel === 'paredao_treme_tudo') {
    weight += 145;
  } else if (tune.subwooferLevel === 'street_12in') {
    weight += 28;
  }

  const cogHeightM = Math.max(
    0.28,
    0.46 + tune.rideHeightMm * 0.001 + (weight > car.weightKg + 120 ? 0.09 : 0)
  );
  const chassisOverloaded = hp > car.horsepower * 3.5 && tune.springRateFrontNmm < 85;

  const clDownforce = car.aeroCl + tune.frontWingDeg * 0.045 + tune.rearWingDeg * 0.068 + (tune.bodykit === 'time_attack_aero' ? 0.85 : 0);
  const cdDrag = Math.max(0.18, car.aeroCd + tune.frontWingDeg * 0.004 + tune.rearWingDeg * 0.0065 + (tune.bodykit !== 'stock' ? 0.015 : 0));

  return {
    effectiveHp: Math.round(hp),
    effectiveTorqueNm: Math.round(torque),
    effectiveWeightKg: Math.max(1.2, Math.round(weight * 10) / 10),
    maxRpm,
    cogHeightM,
    chassisOverloaded,
    clDownforce,
    cdDrag,
  };
}

export function createInitialDamage(): DamageState {
  return {
    panelDeform: { frontLeft: 0, frontRight: 0, hood: 0, sideLeft: 0, sideRight: 0, rear: 0 },
    windshieldCracks: [],
    radiatorDamage: 0,
    suspensionDamage: 0,
    gearboxDamage: 0,
    oilLeakActive: false,
    engineHealth: 100,
    paintCorrosion: 0,
  };
}

export function createInitialWheels(ambientTempC: number): [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry] {
  const baseTemp = Math.max(20, ambientTempC + 18);
  const makeW = (): WheelTelemetry => ({
    tempInnerC: baseTemp + 3,
    tempMidC: baseTemp + 1,
    tempOuterC: baseTemp,
    pressurePsi: 29.5,
    wearPercent: 100,
    slipAngleRad: 0,
    slipRatio: 0,
    suspensionCompressionMm: 0,
    punctured: false,
  });
  return [makeW(), makeW(), makeW(), makeW()];
}

export class VehiclePhysicsBody {
  public x = 0;
  public y = 0;
  public z = 0;
  public headingRad = 0;
  public vx = 0; // world m/s
  public vz = 0; // world m/s
  public vy = 0;
  public angularVelYaw = 0;
  public pitchRad = 0;
  public rollRad = 0;
  public wheelSpinRad = 0;

  public rpm = 1000;
  public gear = 1;
  public shiftTimer = 0;
  public boostPsi = 0;
  public nitroRemainingKg = 5;
  public fuelLiters = 45;
  public engineTempC = 85;
  public oilTempC = 92;
  public brakeTempC = 120;
  public gForceLat = 0;
  public gForceLong = 0;
  public downforceN = 0;
  public dragN = 0;
  public backfireTimer = 0;

  public wheels: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry];
  public damage: DamageState;

  constructor(ambientTempC = 24) {
    this.wheels = createInitialWheels(ambientTempC);
    this.damage = createInitialDamage();
  }

  public resetAt(x: number, y: number, z: number, headingRad: number, tune: CarTuneSetup, ambientTempC: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.headingRad = headingRad;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.angularVelYaw = 0;
    this.pitchRad = 0;
    this.rollRad = 0;
    this.rpm = 1100;
    this.gear = 1;
    this.boostPsi = 0;
    this.nitroRemainingKg = tune.nitroCapacityKg;
    this.fuelLiters = tune.fuelLoadLiters;
    this.engineTempC = Math.max(65, ambientTempC + 60);
    this.oilTempC = this.engineTempC + 7;
    this.brakeTempC = Math.max(40, ambientTempC + 30);
    this.wheels = createInitialWheels(ambientTempC);
    this.damage = createInitialDamage();
  }

  public applyImpact(relSpeedKmh: number, localSide: 'front' | 'left' | 'right' | 'rear', damageEnabled: boolean): void {
    if (!damageEnabled || relSpeedKmh < 12) return;
    const norm = Math.min(1, (relSpeedKmh - 10) / 140);
    if (localSide === 'front') {
      this.damage.panelDeform.frontLeft = Math.min(1, this.damage.panelDeform.frontLeft + norm * 0.48);
      this.damage.panelDeform.frontRight = Math.min(1, this.damage.panelDeform.frontRight + norm * 0.48);
      this.damage.panelDeform.hood = Math.min(1, this.damage.panelDeform.hood + norm * 0.55);
      if (relSpeedKmh > 55) {
        this.damage.radiatorDamage = Math.min(1, this.damage.radiatorDamage + norm * 0.45);
        this.damage.windshieldCracks.push({
          u: 0.25 + Math.random() * 0.5,
          v: 0.25 + Math.random() * 0.5,
          severity: norm,
        });
      }
    } else if (localSide === 'left') {
      this.damage.panelDeform.sideLeft = Math.min(1, this.damage.panelDeform.sideLeft + norm * 0.52);
      this.damage.suspensionDamage = Math.min(1, this.damage.suspensionDamage + norm * 0.35);
      if (relSpeedKmh > 95 && Math.random() < 0.35) this.wheels[0].punctured = true;
    } else if (localSide === 'right') {
      this.damage.panelDeform.sideRight = Math.min(1, this.damage.panelDeform.sideRight + norm * 0.52);
      this.damage.suspensionDamage = Math.min(1, this.damage.suspensionDamage + norm * 0.35);
      if (relSpeedKmh > 95 && Math.random() < 0.35) this.wheels[1].punctured = true;
    } else {
      this.damage.panelDeform.rear = Math.min(1, this.damage.panelDeform.rear + norm * 0.48);
      if (relSpeedKmh > 80) this.damage.gearboxDamage = Math.min(1, this.damage.gearboxDamage + norm * 0.4);
    }

    this.damage.engineHealth = Math.max(15, this.damage.engineHealth - norm * 22);
    if (this.damage.engineHealth < 48) {
      this.damage.oilLeakActive = true;
    }
  }

  public step(params: {
    dt: number;
    car: CarSpec;
    tune: CarTuneSetup;
    weather: WeatherPreset;
    gravityG: number;
    surfaceGrip: number;
    onOilSlick: boolean;
    onPuddle: boolean;
    slipstreamFactor: number; // 0..1
    throttle: number;
    brake: number;
    handbrake: boolean;
    steeringInput: number; // -1..1
    nitroInput: boolean;
    shiftUpPulse: boolean;
    shiftDownPulse: boolean;
    assistMode: AssistMode;
    damageEnabled: boolean;
    tireWearEnabled: boolean;
    fuelConsumptionEnabled: boolean;
    turboStarBoost: number; // Re-Volt powerup multiplier
  }): { speedKmh: number; maxSlip: number } {
    const dt = Math.min(0.04, Math.max(0.001, params.dt));
    const stats = computeEffectiveCarStats(params.car, params.tune);
    const isRC = params.car.category === 'rc_revolt';

    // Forward & Lateral unit vectors in world XZ
    const fwdX = Math.sin(this.headingRad);
    const fwdZ = Math.cos(this.headingRad);
    const rightX = Math.cos(this.headingRad);
    const rightZ = -Math.sin(this.headingRad);

    let forwardSpeed = this.vx * fwdX + this.vz * fwdZ;
    let lateralSpeed = this.vx * rightX + this.vz * rightZ;
    const absSpeed = Math.hypot(this.vx, this.vz);
    const speedKmh = absSpeed * 3.6;

    // --- GEARBOX & SHIFTING ---
    if (this.shiftTimer > 0) this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    const ratios = params.tune.gearRatios;
    const gearCount = Math.max(3, Math.min(8, params.tune.gearCount));

    if (params.tune.transmission === 'manual' && params.assistMode === 'hardcore_sim') {
      if (params.shiftUpPulse && this.gear < gearCount) {
        this.gear++;
        this.shiftTimer = 0.14;
      } else if (params.shiftDownPulse && this.gear > -1) {
        this.gear = this.gear === 1 ? -1 : this.gear - 1;
        this.shiftTimer = 0.12;
        this.backfireTimer = 0.16;
      }
    } else {
      // Smart Automatic / Sequential / Dual-Clutch with manual override!
      if (params.shiftUpPulse && this.gear < gearCount) {
        this.gear++;
        this.shiftTimer = 0.07;
      } else if (params.shiftDownPulse && this.gear > 1) {
        this.gear--;
        this.shiftTimer = 0.07;
        this.backfireTimer = 0.14;
      } else if (params.brake > 0.5 && forwardSpeed < 0.8 && params.throttle < 0.1) {
        this.gear = -1;
      } else if (this.gear === -1 && params.throttle > 0.2 && forwardSpeed > -1.5) {
        this.gear = 1;
      } else if (this.gear >= 1 && this.shiftTimer <= 0) {
        if (this.rpm > stats.maxRpm * 0.92 && this.gear < gearCount) {
          this.gear++;
          this.shiftTimer = params.tune.transmission === 'dual_clutch' ? 0.035 : 0.09;
          this.backfireTimer = 0.12;
        } else if (this.rpm < stats.maxRpm * 0.44 && this.gear > 1 && speedKmh > 18) {
          this.gear--;
          this.shiftTimer = 0.06;
        }
      }
    }

    // Gearbox mechanical damage: skip broken 3rd gear if heavily damaged
    if (params.damageEnabled && this.damage.gearboxDamage > 0.65 && this.gear === 3) {
      this.gear = 4;
    }

    const activeRatio =
      this.gear === -1
        ? -3.1
        : ratios[Math.min(ratios.length - 1, Math.max(0, this.gear - 1))] ?? 1.2;
    const wheelRadiusM = isRC ? 0.14 : 0.33;
    const wheelRpm = (Math.abs(forwardSpeed) / (2 * Math.PI * wheelRadiusM)) * 60;
    const targetRpm = Math.max(
      900,
      Math.min(stats.maxRpm, wheelRpm * Math.abs(activeRatio) * params.tune.finalDrive + params.throttle * 950)
    );
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 14);

    // --- TURBO BOOST, NITRO & ENGINE THERMODYNAMICS ---
    const targetBoost =
      params.tune.induction === 'na'
        ? 0
        : params.throttle * params.tune.boostPsi * Math.min(1, this.rpm / (stats.maxRpm * 0.48));
    this.boostPsi += (targetBoost - this.boostPsi) * Math.min(1, dt * (params.tune.induction === 'supercharger' ? 12 : 4.8));

    let nitroPowerMult = 1.0;
    if (params.nitroInput && this.nitroRemainingKg > 0.02 && params.throttle > 0.4) {
      nitroPowerMult = 1.38;
      this.nitroRemainingKg = Math.max(0, this.nitroRemainingKg - dt * 0.65);
    }

    if (params.fuelConsumptionEnabled && this.fuelLiters > 0.2) {
      this.fuelLiters = Math.max(0.2, this.fuelLiters - dt * (0.012 + params.throttle * 0.048));
    }

    // Engine & Brake Thermals
    const coolingAir = absSpeed * 0.14;
    const heatIn = params.throttle * 5.2 + (params.damageEnabled ? this.damage.radiatorDamage * 9.5 : 0);
    this.engineTempC = Math.max(
      params.weather.ambientTempC + 45,
      Math.min(138, this.engineTempC + (heatIn - coolingAir * 0.25 - (this.engineTempC - 88) * 0.18) * dt)
    );
    this.oilTempC = this.engineTempC + 7;

    const overheatPenalty = this.engineTempC > 118 ? Math.max(0.55, 1 - (this.engineTempC - 118) * 0.022) : 1.0;
    const healthPenalty = params.damageEnabled ? 0.6 + (this.damage.engineHealth / 100) * 0.4 : 1.0;

    // Torque Curve bell shape peaking at ~72% RPM
    const rpmNorm = this.rpm / stats.maxRpm;
    const torqueCurve = 0.62 + 0.52 * Math.sin(Math.min(1, rpmNorm) * Math.PI * 0.88);
    const shiftCut = this.shiftTimer > 0 ? 0.15 : 1.0;

    // Aerodynamic Downforce & Drag (with Slipstream Drafting!)
    const airDensity = 1.225;
    const frontalArea = isRC ? 0.18 : 2.05;
    this.downforceN = 0.5 * airDensity * frontalArea * stats.clDownforce * absSpeed * absSpeed;
    const effectiveCd = stats.cdDrag * (1 - params.slipstreamFactor * 0.28);
    this.dragN = 0.5 * airDensity * frontalArea * effectiveCd * absSpeed * absSpeed;

    // --- PACEJKA TIRE GRIP & 4-WHEEL THERMALS ---
    const comp = COMPOUND_PARAMS[params.tune.tireCompound];
    const brandMod = BRAND_GRIP_MOD[params.tune.tireBrand];
    const wetness = Math.min(1, params.weather.wetness + (params.onPuddle ? 0.45 : 0));
    const wetFactor = 1 - wetness * (1 - comp.wetBonus * 0.52);
    const oilFactor = params.onOilSlick ? 0.36 : 1.0;

    let avgWearMod = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const slipHeat = (Math.abs(w.slipAngleRad) * 18 + Math.abs(w.slipRatio) * 14) * (absSpeed * 0.08);
      w.tempMidC = Math.max(params.weather.ambientTempC, Math.min(145, w.tempMidC + (slipHeat - (w.tempMidC - (params.weather.ambientTempC + 35)) * 0.08) * dt));
      w.tempInnerC = w.tempMidC + Math.abs(i < 2 ? params.tune.camberFrontDeg : params.tune.camberRearDeg) * 2.4;
      w.tempOuterC = w.tempMidC - 1.8;
      w.pressurePsi = Number((28.0 + (w.tempMidC - 25) * 0.065).toFixed(1));

      if (params.tireWearEnabled && absSpeed > 4) {
        const wearDelta = dt * comp.wearRate * (0.04 + Math.abs(w.slipAngleRad) * 0.35 + Math.abs(w.slipRatio) * 0.25);
        w.wearPercent = Math.max(0, w.wearPercent - wearDelta);
        if (w.wearPercent <= 2) w.punctured = true;
      }
      const tempWindow = 1 - Math.min(0.22, Math.abs(w.tempMidC - comp.optTempC) * 0.0032);
      const wearGrip = w.punctured ? 0.42 : 0.72 + (w.wearPercent / 100) * 0.28;
      avgWearMod += tempWindow * wearGrip * 0.25;
    }

    const totalGripD =
      params.car.baseGrip *
      comp.peakD *
      brandMod *
      params.surfaceGrip *
      params.weather.gripMultiplier *
      wetFactor *
      oilFactor *
      avgWearMod;

    // Normal Force (Mass * Gravity + Aero Downforce)
    const massKg = isRC ? 1200 : stats.effectiveWeightKg; // Scale RC physics force budget cleanly for macro tracks
    const normalForceN = massKg * (9.81 * params.gravityG) + this.downforceN;

    // Engine Drive Force & Braking Force
    const maxDriveForceN =
      ((stats.effectiveTorqueNm * torqueCurve * Math.abs(activeRatio) * params.tune.finalDrive * 0.88) /
        wheelRadiusM) *
      nitroPowerMult *
      params.turboStarBoost *
      overheatPenalty *
      healthPenalty *
      shiftCut;

    let driveForceN = 0;
    if (this.gear === -1) {
      driveForceN = -params.brake * maxDriveForceN * 0.55 + (params.throttle > 0.1 && forwardSpeed < -0.5 ? -params.throttle * maxDriveForceN * 0.5 : 0);
      if (params.throttle > 0.1 && forwardSpeed <= 0.5 && params.brake < 0.1) {
        driveForceN = -params.throttle * maxDriveForceN * 0.6;
      }
    } else {
      driveForceN = params.throttle * maxDriveForceN;
    }

    // Brake thermal & Brake Fade
    this.brakeTempC = Math.max(
      params.weather.ambientTempC + 20,
      Math.min(980, this.brakeTempC + (params.brake * absSpeed * 11.5 - (this.brakeTempC - 90) * (0.45 + absSpeed * 0.02)) * dt)
    );
    const brakeFade = this.brakeTempC > 780 ? 0.76 : 1.0;
    const maxBrakeForceN = normalForceN * totalGripD * 1.32 * brakeFade;
    const brakeForceN =
      forwardSpeed > 0.4
        ? -params.brake * maxBrakeForceN
        : forwardSpeed < -0.4 && params.throttle > 0.2
        ? params.throttle * maxBrakeForceN
        : 0;

    // Cap longitudinal tire traction via Pacejka peak
    const maxLongTractionN = normalForceN * totalGripD * 1.18;
    const rawLongForce = driveForceN + brakeForceN;
    const clampedLongForce = Math.max(-maxLongTractionN, Math.min(maxLongTractionN, rawLongForce));
    const longSlipRatio = maxLongTractionN > 1 ? Math.min(1.5, Math.abs(rawLongForce) / maxLongTractionN - 0.65) : 0;

    // Steering & Pacejka Lateral Cornering Force
    const speedSteerAtten =
      params.assistMode === 'casual'
        ? 1 / (1 + absSpeed * 0.022)
        : params.assistMode === 'pro'
        ? 1 / (1 + absSpeed * 0.018)
        : 1 / (1 + absSpeed * 0.014);

    // Alignment pull if punctured tire or bent suspension!
    const puncturePull =
      (this.wheels[0].punctured ? -0.14 : 0) +
      (this.wheels[1].punctured ? 0.14 : 0) +
      (params.damageEnabled ? this.damage.suspensionDamage * 0.06 : 0);

    const steerAngle = (params.steeringInput * 0.56 * speedSteerAtten) + puncturePull;
    const slipAngle = Math.atan2(lateralSpeed, Math.max(2.5, Math.abs(forwardSpeed)));

    // Pacejka lateral force opposing lateral velocity
    const handbrakeRearLoose = params.handbrake ? 0.42 : 1.0;
    const latForceNorm = pacejkaMagicFormula(-slipAngle, comp.stiffnessB, 1.45, totalGripD * handbrakeRearLoose, -0.4);
    const latRestoringForceN = latForceNorm * normalForceN;

    // Turning yaw rate from steering geometry + drift oversteer
    const wheelbaseM = isRC ? 1.8 : 2.68;
    const dirSign = forwardSpeed >= -0.2 ? 1 : -1;
    const targetYawRate = (Math.min(absSpeed, 88) / wheelbaseM) * Math.tan(steerAngle) * dirSign * (params.handbrake ? 1.48 : 1.12);
    const yawStiffness = params.assistMode === 'casual' ? 14 : params.assistMode === 'pro' ? 10.5 : 8.2;
    this.angularVelYaw += (targetYawRate - this.angularVelYaw) * Math.min(1, dt * yawStiffness);
    this.headingRad += this.angularVelYaw * dt;

    // Crosswind Aerodynamic Lateral Force (e.g., Patagonia 150 km/h gale!)
    const windMs = params.weather.windSpeedKmh / 3.6;
    const crosswindForceN = windMs > 8 ? 0.5 * 1.2 * 2.8 * windMs * windMs * Math.sin(params.weather.windAngleRad - this.headingRad) * 0.25 : 0;

    // Rolling resistance & Drag
    const rollingResN = -forwardSpeed * massKg * 0.09;
    const dragSignedN = -Math.sign(forwardSpeed) * this.dragN;

    const netForwardAccel = (clampedLongForce + dragSignedN + rollingResN) / massKg;
    const netLatAccel = (latRestoringForceN + crosswindForceN) / massKg - forwardSpeed * this.angularVelYaw * (params.handbrake ? 0.42 : 0.16);

    forwardSpeed += netForwardAccel * dt;
    lateralSpeed += netLatAccel * dt;

    // Stability damping so casual/pro never oscillates at rest
    const latDamp = params.handbrake ? 0.985 : params.assistMode === 'casual' ? 0.86 : params.assistMode === 'pro' ? 0.91 : 0.95;
    lateralSpeed *= Math.pow(latDamp, dt * 60);
    if (Math.abs(forwardSpeed) < 0.15 && params.throttle < 0.05 && params.brake > 0.1) {
      forwardSpeed = 0;
    }

    // Reconstruct world velocity
    const newFwdX = Math.sin(this.headingRad);
    const newFwdZ = Math.cos(this.headingRad);
    const newRightX = Math.cos(this.headingRad);
    const newRightZ = -Math.sin(this.headingRad);

    this.vx = newFwdX * forwardSpeed + newRightX * lateralSpeed;
    this.vz = newFwdZ * forwardSpeed + newRightZ * lateralSpeed;

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.wheelSpinRad += (forwardSpeed / wheelRadiusM) * dt;

    // G-Forces & Suspension Weight Transfer Pitch/Roll
    this.gForceLong = Number((netForwardAccel / 9.81).toFixed(2));
    this.gForceLat = Number(((forwardSpeed * this.angularVelYaw) / 9.81).toFixed(2));

    const springStiffnessFactor = 75 / Math.max(30, params.tune.springRateFrontNmm);
    const targetPitch = -this.gForceLong * 0.032 * springStiffnessFactor * (stats.cogHeightM / 0.46);
    const targetRoll = this.gForceLat * 0.045 * springStiffnessFactor * (stats.cogHeightM / 0.46);
    this.pitchRad += (Math.max(-0.14, Math.min(0.14, targetPitch)) - this.pitchRad) * Math.min(1, dt * 10);
    this.rollRad += (Math.max(-0.22, Math.min(0.22, targetRoll)) - this.rollRad) * Math.min(1, dt * 10);

    // Acid Rain Paint Corrosion (Cyber City 2099!) & Severe Hail Damage
    if (params.weather.precipitationType === 'acid_rain') {
      this.damage.paintCorrosion = Math.min(1, this.damage.paintCorrosion + dt * 0.018);
    } else if (params.weather.precipitationType === 'hail' && params.weather.precipitationIntensity > 0.8 && params.damageEnabled) {
      this.damage.engineHealth = Math.max(40, this.damage.engineHealth - dt * 0.25);
    }

    if (this.backfireTimer > 0) this.backfireTimer = Math.max(0, this.backfireTimer - dt);

    const maxSlip = Math.max(Math.abs(slipAngle) * 1.8, Math.max(0, longSlipRatio));
    for (let i = 0; i < 4; i++) {
      this.wheels[i].slipAngleRad = slipAngle;
      this.wheels[i].slipRatio = Math.max(0, longSlipRatio);
      this.wheels[i].suspensionCompressionMm = Number(((i < 2 ? -this.pitchRad : this.pitchRad) * 180).toFixed(1));
    }

    return { speedKmh: Math.abs(forwardSpeed) * 3.6, maxSlip };
  }
}
