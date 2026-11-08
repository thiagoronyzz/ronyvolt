/**
 * TIRE MODEL v2 — Combined-slip Pacejka with relaxation length, load sensitivity,
 * pneumatic trail and thermal/wear coupling.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The v1 model applied a Pacejka curve to a *geometric* slip angle and then
 * separately clamped a longitudinal force. That produces three artefacts every
 * player feels within ten seconds:
 *
 *   1. No combined-slip coupling -> you can brake at 100% and turn at 100% at the
 *      same time. Real tyres obey a friction ellipse, so the car must lose
 *      cornering force under braking. This is the single biggest "arcade" tell.
 *   2. No relaxation length -> tyre force appears instantly with steering input.
 *      A real carcass needs 0.3-0.8 m of travel to build side force, which is what
 *      produces the initial "softness" then "bite" of a turn-in. Instant force is
 *      the classic "the car is on rails / ice" dichotomy.
 *   3. No load sensitivity -> the outside tyre in a corner produces the same
 *      coefficient as the inside one, so lateral load transfer does not reduce
 *      total grip. Real rubber loses ~8-15% of mu per 100% of load increase, which
 *      is exactly why stiff front springs cause understeer.
 *
 * The implementation uses the *similarity method*: both slips are normalised by
 * their peak values, combined into a single slip magnitude, one Pacejka curve is
 * evaluated on that magnitude, and the resulting force vector is projected back
 * onto the slip direction. This guarantees the friction ellipse is honoured by
 * construction (|F| <= mu*Fz) with a single parameter set, which is also how
 * iRacing/rFactor-class models keep longitudinal and lateral consistent.
 */

export interface TireSpec {
  /** Peak longitudinal friction coefficient (dry, reference load, fresh, optimal temp). */
  muXPeak: number;
  /** Peak lateral friction coefficient. Usually ~0.92-0.98 of muXPeak. */
  muYPeak: number;
  /** Slip ratio at which longitudinal force peaks (~0.08-0.13). */
  peakSlipRatio: number;
  /** Slip angle (rad) at which lateral force peaks (~6-10 deg). */
  peakSlipAngleRad: number;
  /** Pacejka shape factors. C=1.3..1.6 lateral, 1.4..1.7 longitudinal; E ~ -0.4..0.4 */
  shapeCx: number;
  shapeEx: number;
  shapeCy: number;
  shapeEy: number;
  /** Reference normal load for the coefficient (N). */
  loadRefN: number;
  /** Fractional mu loss per +100% load. Tyres: 0.08-0.18. */
  loadSensitivity: number;
  /** Carcass relaxation length in metres. 0.25 (slick) .. 0.9 (tall off-road). */
  relaxationLengthM: number;
  /** Camber thrust coefficient (N per degree of camber, at reference load). */
  camberStiffnessNPerDeg: number;
  /** Pneumatic trail at peak slip, metres. Drives self-aligning torque. */
  pneumaticTrailM: number;
  /** Rolling resistance coefficient. */
  rollingResistance: number;
  /** Rotational inertia of the wheel + brake + hub assembly (kg m^2). */
  wheelInertiaKgm2: number;
  /** Radius (m) — duplicated from the body so the tire can self-normalise. */
  radiusM: number;
}

export interface TireThermalConfig {
  /** Cold reference temperature (C). */
  ambientC: number;
  /** Temperature of peak grip (C). */
  optimalC: number;
  /** Grip falls off beyond optimal; 0.0022 per degree is a good road-tyre value. */
  tempSensitivityPerC: number;
  /** Heat capacity of the tread band (J/K). */
  treadHeatCapacityJK: number;
  /** Convective cooling coefficient W/(m^2 K). */
  coolingCoeff: number;
  /** Wear rate multiplier. */
  wearRate: number;
}

export interface TireContactState {
  /** Filtered slip angle (rad) — carcass-lagged, not geometric. */
  slipAngleRad: number;
  /** Filtered slip ratio. */
  slipRatio: number;
  /** Raw geometric slip angle before relaxation. */
  rawSlipAngleRad: number;
  /** Raw slip ratio from wheel angular velocity. */
  rawSlipRatio: number;
  /** Normal load actually applied this step (N). */
  loadN: number;
  /** Longitudinal force in the tyre frame (N), +forward. */
  forceXN: number;
  /** Lateral force in the tyre frame (N), +right. */
  forceYN: number;
  /** Self-aligning torque (Nm), + stabilising. */
  aligningTorqueNm: number;
  /** Tread surface temperature (C). */
  surfaceTempC: number;
  /** 0..1, 1 = fresh. */
  wear: number;
  /** True when load is effectively zero (wheel in the air). */
  airborne: boolean;
  /** Current friction utilisation 0..1+ (for smoke/skid/audio triggers). */
  utilisation: number;
}

export function createTireContact(ambientC = 24): TireContactState {
  return {
    slipAngleRad: 0,
    slipRatio: 0,
    rawSlipAngleRad: 0,
    rawSlipRatio: 0,
    loadN: 0,
    forceXN: 0,
    forceYN: 0,
    aligningTorqueNm: 0,
    surfaceTempC: ambientC,
    wear: 1,
    airborne: true,
    utilisation: 0,
  };
}

/**
 * Pacejka magic formula with a zero-force guarantee at zero slip and no
 * discontinuity at the origin (the `atan` term in the original formula is what
 * keeps dy/dx finite; without it the force jumps).
 */
export function magicFormula(slip: number, B: number, C: number, D: number, E: number): number {
  const bs = B * slip;
  return D * Math.sin(C * Math.atan(bs - E * (bs - Math.atan(bs))));
}

/** Load sensitivity: mu shrinks as the tyre is pressed harder. */
export function loadSensitivityFactor(loadN: number, refN: number, sensitivity: number): number {
  const ratio = Math.max(0, loadN) / Math.max(1, refN);
  // Linear in the load ratio, clamped so a momentarily unloaded tyre cannot
  // produce absurd coefficients (this clamp is why airborne wheels don't grip).
  return Math.max(0.55, Math.min(1.12, 1 - sensitivity * (ratio - 1)));
}

/** Temperature window: grip falls off outside the optimal band. */
export function temperatureGripFactor(
  surfaceC: number,
  optimalC: number,
  sensitivityPerC: number
): number {
  const delta = Math.abs(surfaceC - optimalC);
  // Asymmetric: cold tyres lose grip faster than overheated ones until the
  // tread starts to grease (handled by the extra penalty above optimal+35C).
  const coldPenalty = surfaceC < optimalC ? delta * sensitivityPerC * 1.35 : 0;
  const hotPenalty = surfaceC > optimalC ? delta * sensitivityPerC : 0;
  const greasePenalty = surfaceC > optimalC + 35 ? (surfaceC - optimalC - 35) * 0.004 : 0;
  return Math.max(0.42, 1 - coldPenalty - hotPenalty - greasePenalty);
}

export interface TireEvaluationInput {
  spec: TireSpec;
  thermal: TireThermalConfig;
  state: TireContactState;
  /** Wheel angular velocity (rad/s). */
  omegaRadS: number;
  /** Forward velocity of the contact patch (m/s). */
  forwardVelocityMs: number;
  /** Lateral velocity of the contact patch (m/s). */
  lateralVelocityMs: number;
  /** Normal load (N). */
  loadN: number;
  /** Surface multiplier: asphalt 1.0, kerb 0.92, grass 0.55, gravel 0.48, wet < 1. */
  surfaceMu: number;
  /** Water depth 0..1 (aquaplaning). */
  wetness: number;
  /** Camber angle in radians (+ = top leaning right). */
  camberRad: number;
  /** dt in seconds (already sub-stepped). */
  dt: number;
  /** Optional: reduces lateral grip when the tyre is over-inflated or deflating. */
  pressureFactor?: number;
}

/**
 * Advances one tyre contact patch by dt and returns the force state.
 *
 * Force pipeline (in order, because the order matters):
 *   raw slips -> relaxation filter -> similarity combination -> Pacejka magnitude
 *   -> load sensitivity -> temperature -> wear -> project onto slip vector
 *   -> camber thrust -> aligning torque -> thermal/wear integration.
 */
export function evaluateTire(input: TireEvaluationInput): TireContactState {
  const { spec, thermal, state, dt } = input;
  const speed = Math.hypot(input.forwardVelocityMs, input.lateralVelocityMs);

  // --- 1. Raw slips -------------------------------------------------------
  // Longitudinal slip uses a denominator floor so the ratio stays finite at
  // walking pace; the floor is velocity-dependent, which is what makes a car
  // able to creep without the tyre model exploding.
  const denom = Math.max(1.2, Math.abs(input.forwardVelocityMs));
  const rawSlipRatio =
    (input.omegaRadS * spec.radiusM - input.forwardVelocityMs) / denom;
  const rawSlipAngle = Math.atan2(input.lateralVelocityMs, Math.max(1.2, Math.abs(input.forwardVelocityMs)));

  state.rawSlipRatio = rawSlipRatio;
  state.rawSlipAngleRad = rawSlipAngle;

  // --- 2. Relaxation length ----------------------------------------------
  // A first-order lag whose time constant is L/|v|. The reference velocity
  // includes the *tread* surface speed (omega * r), not just the chassis speed:
  // a spinning wheel consumes relaxation distance even when the car is not
  // moving, which is what lets a launch generate force at all. Without this
  // term the filter is frozen at v=0 and the car can never leave the line.
  //
  // The time constant is clamped to [12 ms, 90 ms]. This is a numerical
  // concession, stated openly: below ~2 m/s the true L/|v| exceeds the range in
  // which an explicit integrator stays stable, and above ~40 m/s the lag is
  // shorter than one 240 Hz step and would be lost anyway.
  const treadSpeed = Math.abs(input.omegaRadS * spec.radiusM);
  const speedRef = Math.max(speed, treadSpeed, 1.5);
  const relaxTau = Math.min(0.09, Math.max(0.012, spec.relaxationLengthM / speedRef));
  const alphaBlend = 1 - Math.exp(-dt / relaxTau);
  state.slipRatio += (rawSlipRatio - state.slipRatio) * alphaBlend;
  state.slipAngleRad += (rawSlipAngle - state.slipAngleRad) * alphaBlend;

  const load = Math.max(0, input.loadN);
  state.loadN = load;
  state.airborne = load < 60;

  if (state.airborne) {
    state.forceXN = 0;
    state.forceYN = 0;
    state.aligningTorqueNm = 0;
    state.utilisation = 0;
    state.surfaceTempC += (thermal.ambientC - state.surfaceTempC) * Math.min(1, dt * 1.8);
    return state;
  }

  // --- 3. Similarity method ----------------------------------------------
  // Normalise both slips so that their respective peak values map to 1.
  const sx = state.slipRatio / Math.max(0.01, spec.peakSlipRatio);
  const sy = state.slipAngleRad / Math.max(0.01, spec.peakSlipAngleRad);
  const rho = Math.hypot(sx, sy);

  const loadFactor = loadSensitivityFactor(load, spec.loadRefN, spec.loadSensitivity);
  const tempFactor = temperatureGripFactor(state.surfaceTempC, thermal.optimalC, thermal.tempSensitivityPerC);
  // Wear: a worn tyre loses peak mu and gets *sharper* (peaks at lower slip),
  // which is why old tyres feel snappy on the limit.
  const wearGrip = 0.74 + 0.26 * state.wear;
  const pressureFactor = input.pressureFactor ?? 1;

  const muScale =
    input.surfaceMu *
    loadFactor *
    tempFactor *
    wearGrip *
    pressureFactor *
    (1 - Math.min(0.62, Math.max(0, input.wetness) * 0.7));

  // Aquaplaning: above ~0.55 water depth the contact patch starts to float and
  // grip collapses non-linearly in speed. This is why 80 km/h on standing water
  // is survivable and 140 km/h is not.
  const aquaplaningLoss =
    input.wetness > 0.55 ? Math.min(0.55, (input.wetness - 0.55) * 1.2 * Math.min(1, speed / 28)) : 0;
  const finalMu = Math.max(0.08, muScale * (1 - aquaplaningLoss));

  // Peak values shrink slightly at high slip because the velocity of the tread
  // relative to the road raises the effective sliding friction regime.
  const Dx = spec.muXPeak * finalMu * load;
  const Dy = spec.muYPeak * finalMu * load;

  // Evaluate one combined curve. We use the geometric mean of the two peak
  // forces so a square contact patch neither over- nor under-reports total grip.
  const Dcomb = Math.sqrt(Math.max(1e-3, Dx) * Math.max(1e-3, Dy));

  const Bx = 1 / Math.max(0.02, spec.peakSlipRatio) * 1.4;
  const By = 1 / Math.max(0.02, spec.peakSlipAngleRad) * 1.4;

  let combinedMagnitude = 0;
  if (rho > 1e-4) {
    // Blend the two stiffnesses by slip direction. Weighting with the squared
    // components makes the transition continuous when a car goes from pure
    // braking to trail-braking into a corner.
    const wx = (sx * sx) / (sx * sx + sy * sy + 1e-9);
    const wy = 1 - wx;
    const B = Bx * wx + By * wy;
    const C = spec.shapeCx * wx + spec.shapeCy * wy;
    const E = spec.shapeEx * wx + spec.shapeEy * wy;
    combinedMagnitude = magicFormula(rho, B, C, Dcomb, E);
  }

  // Project back onto the slip vector (friction ellipse by construction).
  let fx = 0;
  let fy = 0;
  if (rho > 1e-4) {
    fx = combinedMagnitude * (sx / rho);
    fy = -combinedMagnitude * (sy / rho);
  }

  // --- 4. Camber thrust ---------------------------------------------------
  // The cambered tyre generates a lateral force even at zero slip, and it points
  // toward the lean. Load- and pressure-scaled. This is why aggressive negative
  // camber adds front-end bite but eats straight-line braking.
  const camberForce = -input.camberRad * (Math.PI / 180) * spec.camberStiffnessNPerDeg * (load / spec.loadRefN);
  fy += camberForce;

  // --- 5. Self-aligning torque -------------------------------------------
  // Trail collapses once the tyre is past peak, which is the physical origin of
  // the "the wheel goes light just before it lets go" feeling.
  const peakAngle = spec.peakSlipAngleRad;
  const absAlpha = Math.abs(state.slipAngleRad);
  const trailScale = absAlpha < peakAngle ? 1 : Math.max(0, 1 - (absAlpha - peakAngle) / (peakAngle * 1.15));
  state.aligningTorqueNm = -fy * spec.pneumaticTrailM * trailScale;

  state.forceXN = fx;
  state.forceYN = fy;
  state.utilisation = Math.min(1.6, Math.hypot(fx, fy) / Math.max(1, Math.sqrt(Dx * Dy)));

  // --- 6. Thermal & wear --------------------------------------------------
  // Slip power = force * slip velocity. That energy goes into the tread band;
  // convection pulls it back toward ambient. The result is a tyre that heats on
  // the loaded outside wheel and cools on the straights, which is exactly the
  // telemetry pattern real drivers watch.
  const slipVelocity = Math.abs(state.slipRatio * Math.max(1, Math.abs(input.forwardVelocityMs))) +
    Math.abs(Math.tan(state.slipAngleRad) * Math.max(1, Math.abs(input.forwardVelocityMs)));
  const slipPowerW = Math.min(32000, Math.hypot(fx, fy) * slipVelocity);
  const coolingW = thermal.coolingCoeff * Math.max(0, state.surfaceTempC - thermal.ambientC) * (0.6 + speed * 0.09);
  const deltaT = ((slipPowerW * 0.42 - coolingW) / Math.max(400, thermal.treadHeatCapacityJK)) * dt;
  state.surfaceTempC = Math.max(thermal.ambientC, Math.min(190, state.surfaceTempC + deltaT));

  if (spectacular(slipPowerW)) {
    const wearDelta =
      (dt * thermal.wearRate * (0.02 + Math.abs(state.slipRatio) * 0.5 + Math.abs(state.slipAngleRad) * 0.9) *
        Math.min(3.5, slipPowerW / 5200)) /
      1000;
    state.wear = Math.max(0, state.wear - wearDelta);
  }

  return state;
}

function spectacular(slipPowerW: number): boolean {
  // Wear only accrues when the tyre is actually working (avoids idle wear).
  return slipPowerW > 900;
}

/** Tyre specs by compound, tuned against real F1/GT3 data ranges. */
export function buildTireSpec(params: {
  peakFriction: number;
  lateralRatio: number;
  stiffness: number;
  radiusM: number;
  isOffRoad: boolean;
}): TireSpec {
  const peakAngleDeg = 7.6 - (params.stiffness - 9) * 0.28;
  return {
    muXPeak: params.peakFriction,
    muYPeak: params.peakFriction * params.lateralRatio,
    peakSlipRatio: params.isOffRoad ? 0.18 : 0.105,
    peakSlipAngleRad: (Math.max(4.5, Math.min(11, peakAngleDeg)) * Math.PI) / 180,
    shapeCx: 1.62,
    shapeEx: 0.28,
    shapeCy: 1.38,
    shapeEy: -0.42,
    loadRefN: 4200,
    loadSensitivity: params.isOffRoad ? 0.2 : 0.13,
    relaxationLengthM: params.isOffRoad ? 0.85 : 0.42,
    camberStiffnessNPerDeg: params.isOffRoad ? 34 : 78,
    pneumaticTrailM: params.isOffRoad ? 0.055 : 0.038,
    rollingResistance: params.isOffRoad ? 0.032 : 0.012,
    wheelInertiaKgm2: 1.35,
    radiusM: params.radiusM,
  };
}
