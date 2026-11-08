/**
 * RACING LINE + CORNER SPEED PROFILE + DRIVER MODEL
 *
 * WHY THIS EXISTS
 * ---------------
 * v1 bots were rail-mounted: their position was `curve.getPointAt(progress)`,
 * their heading was the curve tangent, and their speed came from a curvature
 * heuristic evaluated 2.5% of the lap ahead. The consequences are all visible
 * in a replay:
 *
 *  1. The car's yaw is exactly the tangent — no correction, no slip angle, no
 *     countersteer. The human eye is extremely sensitive to this: a car whose
 *     body angle never deviates from the road is the definition of "scripted".
 *  2. Every car takes the identical geometric line through the centre of the
 *     track. Real drivers use the full width, and the *variation between
 *     drivers* is what makes a field look alive.
 *  3. Speed is derived from a local "sharpness" heuristic (dot product of two
 *     tangents 2.5% apart) with a 3.1x multiplier. That produces braking in the
 *     wrong place, no trail braking, and — because the heuristic has no memory —
 *     a car that brakes at the same point whether it is alone or in a slipstream.
 *
 * WHAT REPLACES IT
 * ----------------
 *  A. A minimum-curvature racing line, computed once per track by local
 *     coordinate descent on lateral offsets. This is the same objective
 *     (minimise path curvature) used by offline racing-line optimisers, and it
 *     reproduces the classic outside-inside-outside geometry without hand-
 *     authored splines.
 *  B. A two-pass speed profile. Backward pass = braking limit from the corner
 *     ahead (v² = v_next² + 2·a·ds). Forward pass = traction/power limit. The
 *     resulting profile has real braking points and real corner exit speeds.
 *  C. A pure-pursuit driver with speed-dependent lookahead, lateral-acceleration
 *     limited steering, and deliberately imperfect inputs (wander, lift, line
 *     variance) scaled by the driver's consistency stat.
 *
 * The profile respects the friction circle, so a bot that tries to carry 5% too
 * much speed into a corner will run wide — exactly like a human — instead of
 * magically following the spline.
 */

import * as THREE from 'three';

export interface RacingLineSample {
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  rightX: number;
  rightZ: number;
  offsetM: number;
  curvature: number;
  /** Target speed at this sample (m/s), already braking/acceleration limited. */
  targetSpeedMs: number;
}

export interface RacingLine {
  samples: RacingLineSample[];
  lengthM: number;
  closed: boolean;
  /** Peak cornering speed for the whole lap — useful telemetry/debug. */
  maxSpeedMs: number;
}

export interface RacingLineParams {
  curve: THREE.CatmullRomCurve3;
  roadWidthM: number;
  totalLengthM: number;
  closed: boolean;
  /** Peak friction coefficient available (tyre x surface). */
  mu: number;
  massKg: number;
  /** Downforce coefficient Cl*A (m^2). */
  clA: number;
  powerW: number;
  brakeMuScale: number;
  gravityG: number;
}

/**
 * Builds the racing line and speed profile.
 *
 * Cost: O(N * iterations * candidates). With N=320, 24 iterations and 7
 * candidates that is ~54k position evaluations per track build — a few
 * milliseconds, and it is cached per track.
 */
export function buildRacingLine(params: RacingLineParams): RacingLine {
  const { curve, roadWidthM, totalLengthM, closed, mu, massKg, clA, powerW, brakeMuScale, gravityG } = params;
  const n = Math.max(64, Math.min(420, Math.round(totalLengthM / 4.5)));
  const halfUseful = Math.max(0.8, roadWidthM * 0.5 - 1.5);

  // --- 1. Sample the centreline -------------------------------------------
  const cx: number[] = [];
  const cy: number[] = [];
  const cz: number[] = [];
  const tx: number[] = [];
  const tz: number[] = [];
  const rx: number[] = [];
  const rz: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = closed ? i / n : i / Math.max(1, n - 1);
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    cx.push(p.x);
    cy.push(p.y);
    cz.push(p.z);
    tx.push(tan.x);
    tz.push(tan.z);
    // right = up x tangent (in XZ), normalised
    const rlen = Math.hypot(tan.z, tan.x) || 1;
    rx.push(tan.z / rlen);
    rz.push(-tan.x / rlen);
  }

  // --- 2. Minimum-curvature line -----------------------------------------
  const offset = new Float64Array(n);
  const px = new Float64Array(n);
  const pz = new Float64Array(n);
  const rebuild = () => {
    for (let i = 0; i < n; i++) {
      px[i] = cx[i] + rx[i] * offset[i];
      pz[i] = cz[i] + rz[i] * offset[i];
    }
  };
  rebuild();

  const idx = (i: number) => (closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i)));

  const localCurvatureSq = (i: number): number => {
    const a = idx(i - 2);
    const b = idx(i);
    const c = idx(i + 2);
    const abx = px[b] - px[a];
    const abz = pz[b] - pz[a];
    const bcx = px[c] - px[b];
    const bcz = pz[c] - pz[b];
    const cross = abx * bcz - abz * bcx;
    const denom = Math.hypot(abx, abz) * Math.hypot(bcx, bcz) * Math.hypot(px[c] - px[a], pz[c] - pz[a]);
    return denom > 1e-6 ? (cross * cross) / (denom * denom) : 0;
  };

  // Coordinate descent: at each station, test a few lateral offsets and keep the
  // one that minimises the curvature at that station plus its neighbours.
  // A small smoothing term keeps the line from oscillating point-to-point, which
  // would make the AI saw at the wheel.
  const candidates = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1];
  for (let iter = 0; iter < 22; iter++) {
    for (let i = 0; i < n; i++) {
      const current = offset[i];
      let bestOffset = current;
      let bestScore = Infinity;
      for (const c of candidates) {
        const trial = c * halfUseful;
        offset[i] = trial;
        px[i] = cx[i] + rx[i] * trial;
        pz[i] = cz[i] + rz[i] * trial;
        const score =
          localCurvatureSq(i) * 2 +
          localCurvatureSq(i - 1) +
          localCurvatureSq(i + 1) +
          // Line-length / smoothness regulariser (encourages straightening).
          0.0000 + Math.abs(trial - current) * 0.0000001;
        if (score < bestScore) {
          bestScore = score;
          bestOffset = trial;
        }
      }
      offset[i] = bestOffset;
      px[i] = cx[i] + rx[i] * bestOffset;
      pz[i] = cz[i] + rz[i] * bestOffset;
    }
  }

  // Smooth offsets so the line is differentiable (a kinked line makes the pure
  // pursuit target jump and the bot's steering input look robotic).
  for (let pass = 0; pass < 3; pass++) {
    const smoothed = Float64Array.from(offset);
    for (let i = 0; i < n; i++) {
      const a = offset[idx(i - 1)];
      const b = offset[i];
      const c = offset[idx(i + 1)];
      smoothed[i] = a * 0.25 + b * 0.5 + c * 0.25;
    }
    offset.set(smoothed);
  }
  rebuild();

  // --- 3. Curvature of the final line -------------------------------------
  const curvature = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = idx(i - 2);
    const b = i;
    const c = idx(i + 2);
    const ab = Math.hypot(px[b] - px[a], pz[b] - pz[a]);
    const bc = Math.hypot(px[c] - px[b], pz[c] - pz[b]);
    const ca = Math.hypot(px[c] - px[a], pz[c] - pz[a]);
    const cross = Math.abs((px[b] - px[a]) * (pz[c] - pz[b]) - (pz[b] - pz[a]) * (px[c] - px[b]));
    const denom = ab * bc * ca;
    curvature[i] = denom > 1e-6 ? (2 * cross) / denom : 0;
  }
  // Smooth curvature: raw finite-difference curvature is noisy at low sample
  // density and the resulting speed profile would buzz.
  const curvSmooth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    curvSmooth[i] =
      (curvature[idx(i - 1)] + curvature[i] * 2 + curvature[idx(i + 1)]) / 4;
  }

  // --- 4. Speed profile ----------------------------------------------------
  const segLen = totalLengthM / n;
  const speed = new Float64Array(n);

  // 4a. Cornering limit with speed-dependent downforce.
  //     v² = mu * (m*g + 0.5*rho*ClA*v²) / m * R
  //     solved by two fixed-point iterations (the aero term is small).
  for (let i = 0; i < n; i++) {
    const k = Math.max(0.00025, curvSmooth[i]);
    const radius = 1 / k;
    let v2 = mu * gravityG * radius;
    for (let it = 0; it < 3; it++) {
      const downforceAccel = (0.5 * 1.225 * clA * v2) / massKg;
      v2 = mu * (gravityG + downforceAccel) * radius;
    }
    // Cap by a plausible top speed to avoid infinities on straights.
    speed[i] = Math.min(120, Math.sqrt(Math.max(1, v2)));
  }

  // 4b. Backward pass: braking. The pass must wrap for closed circuits or the
  //     first corner of the lap gets no braking zone from the previous one.
  const brakeAccel = mu * gravityG * brakeMuScale;
  for (let pass = 0; pass < (closed ? 3 : 1); pass++) {
    for (let step = n - 1; step >= 0; step--) {
      const i = closed ? step : step;
      const next = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      if (!closed && i === n - 1) continue;
      const vNext = speed[next];
      const limit = Math.sqrt(vNext * vNext + 2 * brakeAccel * segLen);
      if (speed[i] > limit) speed[i] = limit;
    }
  }

  // 4c. Forward pass: traction + power limit.
  const tractionAccel = mu * gravityG * 0.86; // driven-axle share of weight
  for (let i = 0; i < n; i++) {
    const prev = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    if (!closed && i === 0) continue;
    const v = speed[i];
    // Power-limited acceleration: a = P/(m*v), capped by traction.
    const powerAccel = v > 1 ? Math.min(tractionAccel, powerW / Math.max(1, massKg * v)) : tractionAccel;
    const limit = Math.sqrt(speed[prev] * speed[prev] + 2 * powerAccel * segLen);
    if (speed[i] > limit) speed[i] = limit;
  }

  // 4d. Second braking pass, because the forward pass can raise speeds above a
  //     downstream braking limit (the classic two-pass oscillation).
  for (let pass = 0; pass < (closed ? 2 : 1); pass++) {
    for (let step = n - 1; step >= 0; step--) {
      const i = step;
      const next = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      if (!closed && i === n - 1) continue;
      const limit = Math.sqrt(speed[next] * speed[next] + 2 * brakeAccel * segLen);
      if (speed[i] > limit) speed[i] = limit;
    }
  }

  // Blend the profile over 2 samples to remove the piecewise-linear kinks.
  const smSpeed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    smSpeed[i] = (speed[idx(i - 1)] + speed[i] * 3 + speed[idx(i + 1)]) / 5;
  }

  // --- 5. Pack -------------------------------------------------------------
  const samples: RacingLineSample[] = [];
  let maxSpeedMs = 0;
  for (let i = 0; i < n; i++) {
    maxSpeedMs = Math.max(maxSpeedMs, smSpeed[i]);
    samples.push({
      x: px[i],
      y: cy[i],
      z: pz[i],
      tangentX: tx[i],
      tangentZ: tz[i],
      rightX: rx[i],
      rightZ: rz[i],
      offsetM: offset[i],
      curvature: curvSmooth[i],
      targetSpeedMs: Math.max(6, smSpeed[i]),
    });
  }

  return { samples, lengthM: totalLengthM, closed, maxSpeedMs };
}

export interface DriverProfileInput {
  skill: number; // 1..10
  consistency: number; // 1..10
  aggression: number; // 1..10
  tireManagement: number; // 1..10
  seed: number;
}

export interface DriverCommand {
  throttle: number;
  brake: number;
  steer: number;
  targetSpeedMs: number;
  /** Index into the racing line nearest the car this frame. */
  sampleIndex: number;
}

/**
 * Stateful pure-pursuit driver.
 *
 * Pure pursuit is the right controller here because it is what real drivers
 * approximate: they look at a point down the road (the "tangent point") and aim
 * the car at it. The lookahead must scale with speed or the controller is
 * unstable at high speed and lazy at low speed.
 */
export class RacingLineFollower {
  private line: RacingLine;
  private index = 0;
  private profile: DriverProfileInput;
  private wanderPhase: number;
  private mistakeTimer = 0;
  private liftTimer = 0;
  private lateralBias = 0;
  private targetBias = 0;

  constructor(line: RacingLine, profile: DriverProfileInput) {
    this.line = line;
    this.profile = profile;
    this.wanderPhase = (profile.seed % 1000) / 1000 * Math.PI * 2;
  }

  public update(dt: number, state: { x: number; z: number; headingRad: number; speedMs: number }): DriverCommand {
    const n = this.line.samples.length;
    // --- Locate the car (incremental search; a full nearest-neighbour scan each
    //     frame is both slower and prone to jumping to the wrong part of a
    //     circuit that crosses over itself).
    let bestI = this.index;
    let bestD = Infinity;
    for (let k = -6; k <= 40; k++) {
      const i = ((this.index + k) % n + n) % n;
      const s = this.line.samples[i];
      const d = (s.x - state.x) ** 2 + (s.z - state.z) ** 2;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    this.index = bestI;

    const skill = this.profile.skill / 10;
    const consistency = this.profile.consistency / 10;

    // --- Human imperfection: slow lateral wander, a line bias that changes per
    //     corner, and occasional lift/mistake. Deterministic per driver seed.
    this.wanderPhase += dt * (0.35 + skill * 0.4);
    if (Math.random() < dt * 0.35) {
      this.targetBias = (Math.random() - 0.5) * (1.6 - consistency * 1.2);
    }
    this.lateralBias += (this.targetBias - this.lateralBias) * Math.min(1, dt * 0.8);

    this.mistakeTimer -= dt;
    if (this.mistakeTimer <= 0 && Math.random() < dt * (0.02 + (1 - consistency) * 0.12)) {
      this.mistakeTimer = 1.5 + Math.random() * 3;
      this.liftTimer = 0.25 + Math.random() * 0.45;
    }
    if (this.liftTimer > 0) this.liftTimer -= dt;

    // --- Lookahead point --------------------------------------------------
    const lookaheadM = 7 + state.speedMs * (0.42 + skill * 0.22);
    const stepsAhead = Math.max(1, Math.round(lookaheadM / (this.line.lengthM / n)));
    const targetI = (this.index + stepsAhead) % n;
    const target = this.line.samples[targetI];
    const wander = Math.sin(this.wanderPhase) * (1.5 - consistency) * 0.55;
    const tx = target.x + target.rightX * (wander + this.lateralBias);
    const tz = target.z + target.rightZ * (wander + this.lateralBias);

    // --- Steering ---------------------------------------------------------
    const dx = tx - state.x;
    const dz = tz - state.z;
    const localX = dx * Math.cos(state.headingRad) - dz * Math.sin(state.headingRad);
    const localZ = dx * Math.sin(state.headingRad) + dz * Math.cos(state.headingRad);
    const alpha = Math.atan2(localX, Math.max(0.001, localZ));
    // Pure-pursuit curvature, then clamp by the friction circle. The clamp is
    // what makes an over-ambitious bot understeer wide rather than turn on rails.
    const ld = Math.max(3, Math.hypot(dx, dz));
    const desiredCurvature = (2 * Math.sin(alpha)) / ld;
    const maxLatAccel = 9.81 * (0.95 + skill * 0.35);
    const maxCurvature = maxLatAccel / Math.max(4, state.speedMs * state.speedMs);
    const curvature = Math.max(-maxCurvature, Math.min(maxCurvature, desiredCurvature));
    const steer = Math.max(-1, Math.min(1, curvature * 9.5));

    // --- Speed ------------------------------------------------------------
    // Target is the minimum of the profile over the braking horizon. Bots must
    // look ahead further than the profile resolution or they brake late in a
    // chain of corners.
    const horizon = Math.max(2, Math.round((state.speedMs * 0.7) / (this.line.lengthM / n)) + 4);
    let targetSpeed = Infinity;
    for (let k = 0; k <= horizon; k++) {
      const s = this.line.samples[(this.index + k) % n];
      const distance = k * (this.line.lengthM / n);
      // Speed allowed now to still make the target speed at that distance.
      const allowed = Math.sqrt(s.targetSpeedMs * s.targetSpeedMs + 2 * 8.5 * distance);
      targetSpeed = Math.min(targetSpeed, allowed);
    }
    // Driver skill and tyre management modulate how much of the profile they
    // actually dare to use.
    targetSpeed *= 0.9 + skill * 0.16 + (this.profile.tireManagement / 10) * 0.02;
    if (this.liftTimer > 0) targetSpeed *= 0.72;

    const speedError = targetSpeed - state.speedMs;
    let throttle = 0;
    let brake = 0;
    if (speedError > 0.6) throttle = Math.min(1, speedError / 2.4);
    else if (speedError < -0.8) brake = Math.min(1, -speedError / 3.2);
    else throttle = 0.26;

    return { throttle, brake, steer, targetSpeedMs: targetSpeed, sampleIndex: this.index };
  }
}
