/**
 * FIA START LIGHT SEQUENCE — the real "five red pairs" procedure
 * ==============================================================
 *
 * Replaces the anonymous 3.0 s `countdownSec` countdown with the procedure FIA
 * uses (FIA Sporting Regulations Art. 44 combined with the five-lamp start
 * mast):
 *
 *   1. Five lamp pairs illuminate in sequence, one pair every ~1.0 s.
 *   2. A random hold of 0.2 – 3.0 s keeps all five lit (this is what kills
 *      predictive jump-starts; the FIA leaves the hold to the starter
 *      operator's discretion).
 *   3. ALL lamps extinguish simultaneously — "lights out". There is no green
 *      lamp in the FIA procedure; the drivers launch on full-dark.
 *   4. Average human reaction is ~0.20 – 0.24 s; moving before the extinguish
 *      is a jump start.
 *
 * The class is pure logic (no three.js): the engine feeds it `dt` each frame,
 * reads `lampsLit` to drive the gantry lamp meshes + HUD, reads `phase` for
 * audio hooks, and reads `readyToMove` to gate player and bot integration.
 * Deterministic when a seed is supplied, which keeps the unit tests stable.
 */

export type StartPhase = 'sequence' | 'hold' | 'out';

export interface StartSequenceOptions {
  /** Seconds between successive lamp pairs. Default 0.9. */
  lightIntervalSec?: number;
  /** Number of lamp pairs. Default 5 (FIA). */
  lampPairs?: number;
  /** Random hold range in seconds once all lamps are lit. Default [0.2, 3.0]. */
  holdRangeSec?: [number, number];
  /** Optional RNG (seedable for tests). Default Math.random. */
  rng?: () => number;
}

export class StartSequence {
  readonly lampPairs: number;
  private readonly lightInterval: number;
  private readonly holdRange: [number, number];
  private readonly rng: () => number;

  private _phase: StartPhase = 'sequence';
  /** 0..lampPairs — how many pairs are currently lit. */
  private _lampsLit = 0;
  private elapsedInPhase = 0;
  private holdDuration: number;
  /** Wall-clock race time (s) at which the lamps went out. Set exactly once. */
  private _lightsOutSec: number | null = null;
  private _totalSec = 0;

  constructor(opts: StartSequenceOptions = {}) {
    this.lampPairs = opts.lampPairs ?? 5;
    this.lightInterval = opts.lightIntervalSec ?? 0.9;
    this.holdRange = opts.holdRangeSec ?? [0.2, 3.0];
    this.rng = opts.rng ?? Math.random;
    this.holdDuration = this.holdRange[0] + this.rng() * (this.holdRange[1] - this.holdRange[0]);
  }

  get lampsLit(): number {
    return this._lampsLit;
  }

  get phase(): StartPhase {
    return this._phase;
  }

  /** True once the lamps have extinguished — cars may move. */
  get readyToMove(): boolean {
    return this.phase === 'out';
  }

  /** Seconds of race time elapsed at lights-out, or null while still lit. */
  get lightsOutSec(): number | null {
    return this._lightsOutSec;
  }

  /** Total seconds from sequence start until lights-out (for lap timing). */
  get totalSec(): number {
    return this._totalSec;
  }

  /**
   * Advance the sequence. Returns true on the exact frame the lamps go out
   * (so the engine can latch lap timing and play the "lights out" audio cue).
   */
  public update(dt: number): boolean {
    this.elapsedInPhase += dt;
    this._totalSec += dt;

    if (this._phase === 'sequence') {
      const lit = Math.min(this.lampPairs, Math.floor(this.elapsedInPhase / this.lightInterval) + 1);
      this._lampsLit = lit;
      if (this._lampsLit >= this.lampPairs && this.elapsedInPhase >= (this.lampPairs - 1) * this.lightInterval) {
        this._phase = 'hold';
        this.elapsedInPhase = 0;
      }
      return false;
    }

    if (this._phase === 'hold') {
      this._lampsLit = this.lampPairs;
      if (this.elapsedInPhase >= this.holdDuration) {
        this._phase = 'out';
        this.elapsedInPhase = 0;
        this._lampsLit = 0;
        this._lightsOutSec = this._totalSec;
        return true;
      }
      return false;
    }

    return false;
  }
}
