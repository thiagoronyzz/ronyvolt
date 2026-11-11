/**
 * RACE GRID — FIA-authentic standing-start formation
 * =================================================
 *
 * The pre-pass slotted bots at `0.012 * (i + 1)` of the lap with a flat ±3.1 m
 * lane offset, which scattered a 4.3 km Grand Prix grid over 570 m of track and
 * put cars ~12 m apart in *percentage* terms on huge circuits. On the grid a
 * player expects the whole field packed in front of them, like a real start.
 *
 * Real FIA grid mechanics (sourced, see docs/REALISM_PASS_4.md):
 *
 *   - The grid is a **staggered 1 × 1 formation** (FIA Sporting Regulations,
 *     Art. 35.4): cars alternate the left and right side of the box each slot.
 *   - The two slots of a row are separated along the track by **8 m**; rows are
 *     **16 m** apart (FIA: "the rows on the grid will be separated by 16
 *     metres", slots therefore sit every 8 m in staggered order).
 *   - Grid boxes are ~2 m wide painted outlines with a 4 m longitudinal lead-out
 *     line on the outside of each box so low drivers can judge alignment.
 *   - Each slot sits fully inside the painted box, clear of the kerbs — on
 *     narrower circuits the lane offset contracts with the road width.
 *
 * This module is pure math (no three.js) so both the track painter
 * (`TrackBuilder`) and the race director (`VelocityEngine`) place cars and
 * paint boxes from the SAME source of truth, and so it can be unit-tested.
 */

export interface GridSlot {
  /** 0-based slot index (0 = P1, the pole position, furthest ahead). */
  index: number;
  /** Distance in metres ahead of the start/finish line (progress 0). */
  distanceAheadM: number;
  /** Lateral offset in metres, positive = local +x of the track frame. */
  lateralM: number;
  /** Arc-length fraction of the lap, 0..1. */
  progress: number;
  /** Track-parameterised row (two slots per row). */
  row: number;
  /** Which side of the box this slot occupies: +1 local +x, -1 local -x. */
  lane: 1 | -1;
}

export interface GridLayoutOptions {
  botCount: number;
  /** Track road width in metres. */
  roadWidth: number;
  /** Total lap length in metres (CatmullRomCurve3.getLength()). */
  totalLengthM: number;
  /** Distance of P1 ahead of the start line, metres. Default 12 m. */
  firstSlotM?: number;
  /** Track-frame lateral offset of the boxes. Default from road width. */
  laneOffsetM?: number;
  /** Along-track distance between successive slots. Default 8 m (FIA). */
  slotSpacingM?: number;
  /**
   * Which lane P1 occupies: +1 local +x (driver's right at heading 0),
   * −1 local −x. The grid alternates from there. Real pole placings follow
   * the racing line into turn 1 — default +1 when unknown.
   */
  poleLane?: 1 | -1;
}

/**
 * Lateral offset of the grid boxes from the centreline. FIA leaves the lateral
 * placement to the circuit (it only fixes the 1×1 stagger and the 16 m row
 * pitch); real boxes hug ~25-30% of the half-width, wide enough to straddle
 * the racing line, narrow enough to sit on the asphalt. On narrow street /
 * RC circuits the offset contracts so a car at full lock never clips the kerb.
 */
export function gridLaneOffset(roadWidthM: number): number {
  const half = roadWidthM * 0.5;
  return Math.max(0.9, Math.min(2.05, half * 0.31));
}

/**
 * Computes the full standing-start grid. P1 (slot 0) is furthest ahead of the
 * line; the player starts behind the field at the line (the classic underdog
 * career start). Slots advance 8 m apart, alternating lanes; each two-slot
 * pair forms a row (P1/P2 = row 1, 16 m row pitch as in the FIA regs).
 */
export function computeGridSlots(opts: GridLayoutOptions): GridSlot[] {
  const first = opts.firstSlotM ?? 12;
  let spacing = opts.slotSpacingM ?? 8;
  const maxSpan = Math.max(8, opts.totalLengthM * 0.3);
  if (first + Math.max(0, opts.botCount - 1) * spacing > maxSpan) {
    spacing = Math.max(4, (maxSpan - first) / Math.max(1, opts.botCount - 1));
  }
  const lane = opts.laneOffsetM ?? gridLaneOffset(opts.roadWidth);
  const len = Math.max(1, opts.totalLengthM);
  const poleLane = opts.poleLane ?? 1;
  const slots: GridSlot[] = [];
  for (let i = 0; i < Math.max(0, opts.botCount); i++) {
    const distanceAheadM = first + i * spacing;
    const row = Math.floor(i / 2);
    const laneSign: 1 | -1 = i % 2 === 0 ? poleLane : poleLane === 1 ? -1 : 1;
    slots.push({
      index: i,
      distanceAheadM,
      lateralM: laneSign * lane,
      progress: (distanceAheadM % len) / len,
      row,
      lane: laneSign,
    });
  }
  return slots;
}

/**
 * Painted box geometry for a slot, in track-frame coordinates relative to the
 * slot centre: rectangle outline strips + the 4 m lead-out line on the outside
 * of the box (FIA: the line extends longitudinally on the outer side so the
 * driver can align from a low cockpit). All units in metres; the caller maps
 * them onto the road ribbon.
 */
export interface GridBoxPaint {
  /** Centreline-parallel outline strips, [lateralOffsetFromSlot, alongStart, alongEnd, halfWidth]. */
  ribbons: { lateral: number; fromAlong: number; toAlong: number; halfWidth: number }[];
}

export function gridBoxPaint(slot: GridSlot, boxWidthM = 2.4, boxLengthM = 5.0): GridBoxPaint {
  const hw = boxWidthM * 0.5;
  const hl = boxLengthM * 0.5;
  const line = 0.11; // painted line half-width (a ~22 cm line)
  const ribbons: GridBoxPaint['ribbons'] = [
    // Two side lines (full length)
    { lateral: -hw, fromAlong: -hl, toAlong: hl, halfWidth: line },
    { lateral: hw, fromAlong: -hl, toAlong: hl, halfWidth: line },
    // Front line
    { lateral: 0, fromAlong: hl, toAlong: hl + 2 * line, halfWidth: hw + line },
    // Rear line
    { lateral: 0, fromAlong: -hl - 2 * line, toAlong: -hl, halfWidth: hw + line },
  ];
  // 4 m lead-out line on the outside of the box (away from the centreline)
  const outside = slot.lane > 0 ? hw + 0.28 : -(hw + 0.28);
  ribbons.push({ lateral: outside, fromAlong: -hl, toAlong: hl + 4.0, halfWidth: line });
  return { ribbons };
}
