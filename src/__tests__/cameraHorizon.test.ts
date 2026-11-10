import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  chaseBoom,
  computeChaseRoll,
  fitVerticalFov,
  horizontalFov,
  MAX_CHASE_ROLL_RAD,
  MAX_VERTICAL_FOV_DEG,
  speedFov,
} from '../engine/CameraRig';

/**
 * CAMERA / HORIZON REGRESSION TESTS
 * --------------------------------
 * These exist because the reported bug was "a tela fica torta" (the screen is
 * crooked) during the race. The cause was writing `camera.rotation.z` after
 * `lookAt()`: with Three.js' default XYZ Euler order that is *not* a rotation
 * around the view axis, so once the camera was pitched the horizon tilted by a
 * pitch-dependent amount that changed from corner to corner.
 *
 * The tests reconstruct the exact race framing (chase boom, look-at target,
 * roll) and project a horizon line through the camera, measuring the screen
 * slope. They fail on the old implementation and pass on the current one.
 */

/** Rebuilds the race chase camera for a given body roll (deg). */
function buildChaseCamera(rollDeg: number, apply: 'euler' | 'rotate') {
  const speed = 180;
  const boom = chaseBoom(speed, false);
  const fov = speedFov(speed);
  const cam = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 800);
  // Car at origin heading +Z.
  cam.position.set(0, boom.height, -boom.dist);
  cam.lookAt(new THREE.Vector3(0, 0.95, boom.lookAhead));
  cam.updateMatrixWorld(true);

  const rollRad = THREE.MathUtils.degToRad(rollDeg);
  if (apply === 'euler') cam.rotation.z = rollRad;
  else if (apply === 'rotate') cam.rotateZ(rollRad);
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  return cam;
}

/** Projects two points on the horizon (far away, same height) to NDC. */
function horizonSlopeDeg(cam: THREE.PerspectiveCamera): number {
  const left = new THREE.Vector3(-240, cam.position.y, 240).project(cam);
  const right = new THREE.Vector3(240, cam.position.y, 240).project(cam);
  // NDC is anisotropic: x spans 2 units over the full width, y over the full
  // height. Convert to pixels (dx * aspect) before taking the angle, otherwise
  // a true 2° roll would read as 3.5° on a 16:9 screen. A camera looking down
  // +Z puts world -X on the right, so the span is taken absolutely.
  const dx = Math.abs(right.x - left.x) * cam.aspect;
  const dy = right.y - left.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

describe('tela torta (crooked screen) regression', () => {
  it('Euler rotation.z tilts the horizon once the camera is pitched (the old bug)', () => {
    const slope = horizonSlopeDeg(buildChaseCamera(30, 'euler'));
    // The old code allowed a ±30° body roll straight into rotation.z after
    // lookAt(); the horizon slope is not even the same sign/size as the input.
    expect(Math.abs(slope)).toBeGreaterThan(10);
  });

  it('rotateZ produces a true view-axis roll: slope == requested roll', () => {
    const slope = horizonSlopeDeg(buildChaseCamera(2, 'rotate'));
    expect(Math.abs(slope)).toBeGreaterThan(1.9);
    expect(Math.abs(slope)).toBeLessThan(2.1);
  });

  it('the shipped roll clamp keeps the horizon visually level (<= 0.81°)', () => {
    const clamped = computeChaseRoll(0.6, true); // extreme body roll
    expect(Math.abs(clamped)).toBeLessThanOrEqual(MAX_CHASE_ROLL_RAD + 1e-12);
    const slope = horizonSlopeDeg(
      buildChaseCamera(THREE.MathUtils.radToDeg(clamped), 'rotate')
    );
    expect(Math.abs(slope)).toBeLessThanOrEqual(0.81);
  });

  it('is level (exactly 0) when shake/roll is disabled', () => {
    expect(computeChaseRoll(0.4, false)).toBe(0);
    expect(Object.is(computeChaseRoll(0.4, false), -0)).toBe(false);
  });

  it('produces a finite, level horizon for degenerate inputs', () => {
    expect(computeChaseRoll(Number.NaN, true)).toBe(0);
    expect(computeChaseRoll(Number.POSITIVE_INFINITY, true)).toBe(0);
  });
});

describe('camera framing under different viewports', () => {
  const aspects = [
    ['ultrawide 21:9', 21 / 9],
    ['16:9', 16 / 9],
    ['16:10 laptop', 16 / 10],
    ['4:3 tablet', 4 / 3],
    ['portrait phone', 9 / 16],
    ['square', 1],
  ] as const;

  it('keeps the whole car inside the frame on every aspect ratio', () => {
    // Real geometry: a 2 m wide car 6 m in front of the camera, both front
    // corners. Regression guard for "o carro fica cortado" on phones.
    const halfWidth = 1.0;
    for (const [name, aspect] of aspects) {
      const cam = buildChaseCamera(0, 'rotate');
      cam.fov = fitVerticalFov(speedFov(180), aspect);
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
      const left = new THREE.Vector3(-halfWidth, 0.4, 6).project(cam);
      const right = new THREE.Vector3(halfWidth, 0.4, 6).project(cam);
      expect(Math.abs(left.x), `${name}: left corner inside frame`).toBeLessThan(0.95);
      expect(Math.abs(right.x), `${name}: right corner inside frame`).toBeLessThan(0.95);
      // The compensated FOV is also never narrower than the un-compensated one.
      expect(fitVerticalFov(speedFov(180), aspect)).toBeGreaterThanOrEqual(speedFov(180));
      // Ultrawide legitimately reaches ~115° horizontally; the guard is that
      // the *vertical* FOV (what makes a lens look fisheye) stays capped.
      expect(horizontalFov(cam.fov, aspect)).toBeLessThan(122);
      expect(cam.fov).toBeLessThanOrEqual(MAX_VERTICAL_FOV_DEG);
    }
  });

  it('keeps the horizon level on every aspect ratio', () => {
    for (const [name, aspect] of aspects) {
      const cam = buildChaseCamera(0, 'rotate');
      cam.fov = fitVerticalFov(speedFov(180), aspect);
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
      expect(Math.abs(horizonSlopeDeg(cam)), `${name} horizon`).toBeLessThan(0.02);
    }
  });

  it('keeps roll framing stable through a corner (no accumulating tilt)', () => {
    let last = 0;
    for (let i = 0; i < 240; i++) {
      const target = computeChaseRoll(Math.sin(i / 20) * 0.5, true);
      last += (target - last) * 0.12; // engine smoothing
      expect(Math.abs(last)).toBeLessThanOrEqual(MAX_CHASE_ROLL_RAD + 1e-9);
    }
  });
});
