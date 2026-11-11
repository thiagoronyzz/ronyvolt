/**
 * GRID PAINT — FIA standing-start boxes, painted on the asphalt
 * =============================================================
 *
 * The Painted grid used to be absent entirely: cars appeared ahead of the
 * line with no road paint, which made the "starting slot" imaginary. Real
 * circuits paint the full 1×1 staggered grid plus a longitudinal lead-out
 * line beside every box (used from a low cockpit to align).
 *
 * This module lays down, for every grid slot:
 *   - the rectangular box outline (two fuselage lines + front/rear lines),
 *   - the 4 m lead-out line on the OUTSIDE of the box (away from the
 *     centreline),
 *
 * as thin boxes lifted a couple of centimetres above the road ribbon so
 * they never z-fight the asphalt. Paint is a slightly translucent off-white
 * (ISO road paint yellows with age and rubber).
 */
import * as THREE from 'three';
import { computeGridSlots, gridBoxPaint, GridSlot } from './raceGrid';

export interface GridPaintResult {
  group: THREE.Group;
  slotCount: number;
}

export function paintGridSlots(
  curve: THREE.CatmullRomCurve3,
  samplePoints: THREE.Vector3[],
  totalLengthM: number,
  roadWidth: number,
  slots: GridSlot[],
): GridPaintResult {
  const group = new THREE.Group();
  group.name = 'grid_paint';

  const paintMat = new THREE.MeshStandardMaterial({
    color: 0xf4f1e6,
    roughness: 0.75,
    metalness: 0.0,
    transparent: true,
    opacity: 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const segCount = samplePoints.length;
  const pointAt = (distAheadM: number): { pt: THREE.Vector3; tangent: THREE.Vector3 } => {
    const len = Math.max(1, totalLengthM);
    const progress = ((distAheadM % len) + len) % len / len;
    // Use the sampled polyline for stability (cheap, and matches the ribbon road).
    const f = progress * segCount;
    const i0 = Math.floor(f) % segCount;
    const i1 = (i0 + 1) % segCount;
    const t = f - Math.floor(f);
    const pt = samplePoints[i0].clone().lerp(samplePoints[i1], t);
    const tangent = curve.getTangentAt(THREE.MathUtils.clamp(progress, 0.0005, 0.9995)).normalize();
    return { pt, tangent };
  };

  for (const slot of slots) {
    const { pt, tangent } = pointAt(slot.distanceAheadM);
    const heading = Math.atan2(tangent.x, tangent.z);
    const right = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    const frame = new THREE.Group();
    frame.position.copy(pt);
    frame.position.y = pt.y + 0.048;
    frame.rotation.y = heading;

    const { ribbons } = gridBoxPaint(slot);
    for (const r of ribbons) {
      const along = (r.fromAlong + r.toAlong) * 0.5;
      const length = Math.abs(r.toAlong - r.fromAlong);
      const width = r.halfWidth * 2;
      // Local frame: +z = race direction, +x = local right; the frame itself
      // sits at the slot centre (pt + right * slot.lateralM), so children are
      // placed relative to the box centre.
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, length), paintMat);
      mesh.position.set(r.lateral, 0, along);
      mesh.receiveShadow = true;
      frame.add(mesh);
    }
    frame.position.addScaledVector(right, slot.lateralM);
    group.add(frame);
  }

  return { group, slotCount: slots.length };
}

export { computeGridSlots };
