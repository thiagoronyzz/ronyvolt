/**
 * GAME STATE RULES — pure predicates for the menu/race/pause/end state machine.
 * ---------------------------------------------------------------------------
 * The state machine itself lives in VelocityEngine, but the *decisions* it makes
 * (should a hidden tab pause the race? which effect does this surface emit?
 * how much does wet asphalt reduce grip?) are pure functions so they can be
 * unit-tested. Every branch here corresponds to a bug that was reported:
 *
 *  - the game kept simulating when the tab was hidden (car crashed into a wall
 *    while the player was in another window),
 *  - the race was paused *after* the finish line (result screen never appeared),
 *  - gravel and rain emitted the same smoke as dry asphalt.
 */

export type SceneMode = 'garage' | 'race';

export interface PauseContext {
  hidden: boolean;
  sceneMode: SceneMode;
  photoModeActive: boolean;
  terminated: boolean;
}

/** A hidden tab pauses a live race — never the garage, photo mode or the end screen. */
export function shouldPauseOnHide(ctx: PauseContext): boolean {
  return ctx.hidden && ctx.sceneMode === 'race' && !ctx.photoModeActive && !ctx.terminated;
}

/**
 * Can the simulation advance this frame? This is the single source of truth for
 * "is the world allowed to move", so pause can never be half-applied.
 */
export function canSimulate(ctx: {
  sceneMode: SceneMode;
  userPaused: boolean;
  terminated: boolean;
  photoModeActive: boolean;
}): boolean {
  if (ctx.terminated) return false;
  if (ctx.sceneMode === 'garage') return true; // showroom keeps breathing
  return !ctx.userPaused && !ctx.photoModeActive;
}

export type SurfaceName = 'asphalt' | 'gravel' | 'grass' | 'snow' | 'sand' | string;

export interface EffectTraits {
  particle: 'smoke' | 'dust' | 'spray' | 'snow';
  frictionScale: number;
  /** Multiplier on tire-screech volume (gravel does not screech, it crunches). */
  screech: number;
}

/**
 * Surface → effects/grip. Wetness (0..1) turns asphalt spray on and drops grip
 * progressively; it never goes below 55 % of dry grip, otherwise the car is
 * undriveable in the rain.
 */
export function effectTraits(surface: SurfaceName, wetness: number): EffectTraits {
  const wet = Math.max(0, Math.min(1, Number.isFinite(wetness) ? wetness : 0));
  switch (surface) {
    case 'gravel':
      return { particle: 'dust', frictionScale: 0.82 - wet * 0.12, screech: 0.25 };
    case 'grass':
      return { particle: 'dust', frictionScale: 0.72 - wet * 0.1, screech: 0.2 };
    case 'sand':
      return { particle: 'dust', frictionScale: 0.75 - wet * 0.15, screech: 0.2 };
    case 'snow':
      return { particle: 'snow', frictionScale: 0.6 - wet * 0.05, screech: 0.1 };
    default:
      if (wet > 0.35) {
        return {
          particle: 'spray',
          frictionScale: Math.max(0.55, 1 - wet * 0.45),
          screech: 0.8,
        };
      }
      return { particle: 'smoke', frictionScale: 1 - wet * 0.2, screech: 1 };
  }
}
