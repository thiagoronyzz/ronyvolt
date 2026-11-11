/**
 * CAR CONTACT SOLVER — side hits, rear-enders and head-on shunts
 * ==============================================================
 *
 * The old car-vs-car code in `VelocityEngine.stepBots` had three defects that
 * together produced every "bateu na lateral e bugou" report:
 *
 *   1. **Sphere overlap.** A fixed `distToPlayer < 2.95` test treats both cars
 *      as 2.95 m balls. Two cars sliding door-to-door at 90° incidence touch at
 *      ~3.6 m centre distance (half-length 2.3 m + half-length 2.3 m minus the
 *      overlap), while a head-on touches at ~4.6 m — the sphere fired far too
 *      late head-on and far too early side-on, and it could never tell a scrape
 *      from a square hit.
 *   2. **Damage always applied to the FRONT.** `applyImpact(..., 'front')`
 *      regardless of geometry, so a side scrape dented the hood, cracked the
 *      windscreen and radiated the radiator.
 *   3. **No rate limiting.** Damage, package-integrity loss, radio spam and the
 *      0.95 m teleport push were re-applied EVERY FRAME for as long as the
 *      cars overlapped — a single 2-second scrape read as a 60-frame pileup.
 *
 * This module is the single source of truth for contact geometry. It is pure
 * math (no three.js) so it can be unit-tested and reused for bot-vs-bot.
 *
 * Model: a car is an **oriented box** (half-length `hl`, half-width `hw`) and
 * each contact is solved as *box vs box* using the separating-axis-ish
 * projection of the closest box corners — accurate enough at these sizes and
 * vastly better than a sphere. The positional correction is split between both
 * bodies (the player takes the larger share, bots yield too) and the damage
 * zone comes from the impact direction in the *player's* local frame.
 */

export type ImpactZone = 'front' | 'left' | 'right' | 'rear';

/** Local frame of the player's car: +x is the car's local x axis, +z forward. */
export interface LocalFrame {
  fwdX: number;
  fwdZ: number;
  rightX: number;
  rightZ: number;
}

export function localFrame(headingRad: number): LocalFrame {
  return {
    fwdX: Math.sin(headingRad),
    fwdZ: Math.cos(headingRad),
    rightX: Math.cos(headingRad),
    rightZ: -Math.sin(headingRad),
  };
}

/** Displacement of the obstacle from the player, in the player's local frame. */
export function toLocal(dx: number, dz: number, frame: LocalFrame): { fwd: number; side: number } {
  return {
    fwd: dx * frame.fwdX + dz * frame.fwdZ,
    side: dx * frame.rightX + dz * frame.rightZ,
  };
}

/**
 * Which side of the player's car contacted the obstacle, from geometry alone.
 * Quadrant split at 45° between the longitudinal and lateral axes — the same
 * convention the guardrail uses (`sign > 0 → 'left'`, with local +x = the
 * car's left side in this engine's frame).
 */
export function detectImpactZone(dx: number, dz: number, playerHeadingRad: number): ImpactZone {
  const f = localFrame(playerHeadingRad);
  const { fwd, side } = toLocal(dx, dz, f);
  if (Math.abs(fwd) >= Math.abs(side)) return fwd >= 0 ? 'front' : 'rear';
  return side >= 0 ? 'left' : 'right';
}

export interface BoxContact {
  /** Centre-to-centre distance (m). */
  distance: number;
  /** Unit vector from player → other car, world frame. */
  normalX: number;
  normalZ: number;
  /** Overlap depth (m) along the minimum-penetration axis. 0 = no contact. */
  overlap: number;
  /**
   * Pre-signed min-translation direction: moving the player by
   * `-(pushX,pushZ) * overlap` and the other car by `+(pushX,pushZ) * overlap`
   * separates the boxes along the cheapest axis. (normalX/Z is the
   * centre-to-centre direction, kept for diagnostics.)
   */
  pushX: number;
  pushZ: number;
}

/**
 * Box-vs-box contact test using axis projections on the union of both
 * cars' axes plus the two diagonal edge-normal candidates. For axis-aligned-ish
 * cars this is exact; at non-zero yaw it slightly overestimates separation,
 * which is conservative (we under-report rather than tunnel).
 *
 * Returns `overlap = 0` when separated.
 */
export function boxBoxContact(
  ax: number, az: number, aHeading: number, aHalfL: number, aHalfW: number,
  bx: number, bz: number, bHeading: number, bHalfL: number, bHalfW: number
): BoxContact {
  const dx = bx - ax;
  const dz = bz - az;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) {
    return { distance: 0, normalX: 0, normalZ: 1, overlap: aHalfL + bHalfL, pushX: 0, pushZ: 1 };
  }
  const nx = dx / distance;
  const nz = dz / distance;

  // Candidate axes: both cars' forward and lateral axes.
  const axes: [number, number][] = [];
  for (const h of [aHeading, bHeading]) {
    axes.push([Math.sin(h), Math.cos(h)]);
    axes.push([Math.cos(h), -Math.sin(h)]);
  }
  // Project both boxes onto each axis; track the deepest penetration.
  let minPenetration = Infinity;
  let pushX = nx;
  let pushZ = nz;
  for (const [ux, uz] of axes) {
    const t = dx * ux + dz * uz;
    const aExtent = aHalfL * Math.abs(ux * Math.sin(aHeading) + uz * Math.cos(aHeading)) +
                    aHalfW * Math.abs(ux * Math.cos(aHeading) - uz * Math.sin(aHeading));
    const bExtent = bHalfL * Math.abs(ux * Math.sin(bHeading) + uz * Math.cos(bHeading)) +
                    bHalfW * Math.abs(ux * Math.cos(bHeading) - uz * Math.sin(bHeading));
    const penetration = aExtent + bExtent - Math.abs(t);
    if (penetration <= 0) {
      return { distance, normalX: nx, normalZ: nz, overlap: 0, pushX: nx, pushZ: nz };
    }
    if (penetration < minPenetration) {
      minPenetration = penetration;
      // Sign so that +(push) points from the player toward the other car.
      const sign = t >= 0 ? 1 : -1;
      pushX = ux * sign;
      pushZ = uz * sign;
    }
  }
  return { distance, normalX: nx, normalZ: nz, overlap: minPenetration, pushX, pushZ };
}

export interface ContactResolution {
  /** How far to move the player along (normalX, normalZ). */
  movePlayer: number;
  /** How far to move the other car in the opposite direction. */
  moveOther: number;
  /** Unit vector along which to push the bodies apart (player ← other). */
  normalX: number;
  normalZ: number;
  /** The impact zone for damage purposes. */
  zone: ImpactZone;
  /** True when the boxes actually touch. */
  touching: boolean;
}

/**
 * Solves a contact: pushes both cars apart by the penetration depth (split
 * 65/35 in favour of moving the player — bots keep their line where possible,
 * but never interpenetrate), and classifies the impact zone from the contact
 * point in the player's frame.
 */
export function resolveContact(
  playerX: number, playerZ: number, playerHeading: number,
  playerHalfL: number, playerHalfW: number,
  otherX: number, otherZ: number, otherHeading: number,
  otherHalfL: number, otherHalfW: number
): ContactResolution {
  const c = boxBoxContact(
    playerX, playerZ, playerHeading, playerHalfL, playerHalfW,
    otherX, otherZ, otherHeading, otherHalfL, otherHalfW
  );
  const zone = detectImpactZone(otherX - playerX, otherZ - playerZ, playerHeading);
  if (c.overlap <= 0) {
    return { movePlayer: 0, moveOther: 0, normalX: c.pushX, normalZ: c.pushZ, zone, touching: false };
  }
  // Player is pushed opposite the push direction; the other car goes with it.
  return {
    movePlayer: c.overlap * 0.65,
    moveOther: c.overlap * 0.35,
    normalX: c.pushX,
    normalZ: c.pushZ,
    zone,
    touching: true,
  };
}
