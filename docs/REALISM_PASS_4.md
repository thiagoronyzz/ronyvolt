# REALISM PASS 4 — Race start & contact model

Status: **partially implemented, in-browser verification pending.**
Date: 2026-11-11. Branch: `arena/16bc7d3b-ronyvolt`.

This pass attacks the two bugs that made every race start feel fake, and the
collision model that made every side tap feel broken. Two of the four bugs from
the original report are addressed here; the other two are explicitly NOT in
this pass (see "Not done" below).

## What changed

### Fix 4 — Competition-mode start: real grid, real lights

**Before:** bots were scattered greedily ahead of progress 0 at
`(0.012 * (i + 1)) % 0.9` with a flat ±3.1 m lane — on Interlagos (4.309 km)
that is ~52 m between cars, nearly 600 m of field for 12 bots, and wrap-around
placement for larger grids. The release was an anonymous 3.0 s timer
(`countdownSec`) with no light semantics; drag reactions were measured from a
wall clock, bots launched the same frame as "go", and everyone drove off an
imaginary grid with no painted boxes.

**After:**

- `src/engine/raceGrid.ts` (new, pure math, unit-testable): FIA-style
  staggered 1×1 standing grid. Slots sit **8 m** apart (16 m row pitch per
  FIA Sporting Regulations Art. 35.4), pole closest to the line, lanes
  alternate starting from the racing-line side when the optimised line is
  known (`offsetM` of `RacingLineSample[0]`), lane offset contracts with road
  width so narrow/RC tracks don't put cars on the kerb, and the total grid
  span is capped at 30% of the lap so short circuits don't wrap the field.
- `src/engine/gridPaint.ts` (new, three.js): paints every grid box on the
  asphalt (outline + the 4 m longitudinal lead-out line on the box's outer
  side) as thin boxes lifted above the road ribbon with polygonOffset, so the
  formation reads as a real grid.
- `src/engine/startSequence.ts` (new, pure logic): the FIA "five red pairs"
  procedure — pairs illuminate one at a time (0.9 s), a random 0.2–3.0 s hold
  keeps all five lit, then ALL extinguish simultaneously (there is no green
  lamp in the FIA procedure). Distinguishes `sequence | hold | out`, tracks
  lights-out time for lap timing and bot reaction delays.
- Gantry start lamps (`TrackBuilder.ts`): five red lamp pairs hang from the
  start gantry beam; `VelocityEngine.updateGantryLamps()` drives their
  emissive intensity per frame. Audio: `triggerStartLamp()` per pair +
  `triggerLightsOut()` twin-thud at extinguish.
- Bots launch after a human-range reaction (0.22–0.46 s), never on the same
  frame as lights-out.
- Jump starts (throttle while the five pairs are lit) are flagged once:
  steward radio warning, anti-troll warning, 2 s drive limiter.
- HUD (`RaceHudAndPhotoMode.tsx`): five lamp pairs overlaid top-centre,
  driven from `LiveTelemetryFrame.startLightPhase` / `startLightsLit`
  (optional fields — existing frames/tests unaffected).
- `countdownSec` is gone; lap timing latches at lights-out
  (`lapStartSec = elapsedSec` on the extinguish frame). Drag reaction time is
  now measured from lights-out as well.

Grid placement note (honest limitation): real FIA grids sit *behind* the
start/finish line. Ours sits *ahead of* it (player anchored at progress 0,
bots 12 m+ ahead in slot order) because the lap-0 crossing semantics in
`checkLapAndFinish` anchor the player at the line. Moving the whole field
behind the line would change lap accounting for every mode and is deliberately
NOT bundled here.

### Fix 3 — Side-collision bugs

**Before:** car-vs-car used a 2.95 m centre-distance sphere. It fired far too
late head-on (touches at ~4.6 m) and far too early side-on, the player was
teleported 0.95 m regardless of approach angle, damage ALWAYS landed on the
front (`applyImpact(..., 'front')`), and everything (damage, package integrity,
radio, anti-troll) re-applied **every frame** the cars overlapped — a 2 s
scrape read as a 60-frame pile-up.

**After:** `src/engine/collision.ts` (new, pure math): oriented box-vs-box
contact on both cars' axes (half extents from `SHAPE_PRESETS[archetype]`),
minimum-penetration axis resolution (cheapest separating axis), separation
split 65/35 player/bot, damage zone classified from the impact direction in
the player's local frame (`front|left|right|rear`), damage rate-limited to one
event per 0.6 s per car pair (positional separation still applies every
frame). Anti-troll and rivalry escalation now trigger only on real damage
events.

## Verified

- `npx tsc --noEmit` — clean.
- `npm run test` — **121/121 green** (including smoke render of every car and
  circuit).
- Vite dev server transforms all new/changed modules (HTTP 200 through the
  dev pipeline).

## Not done (explicit)

- **Fix 1 — rear of the car renders transparent:** root cause identified
  (cabin loft is an open tube; PAINT/GLASS faces are single-sided so the far
  side of the shell is culled when viewed through the backlight; planned fix
  is an opaque rear-bulkhead/parcel-shelf/headliner set). Not implemented in
  this branch yet.
- **Fix 2 — some cars lean left:** not fixed in this branch yet. Confirmed
  defect found while investigating: all wheel cambers run POSITIVE (tops lean
  outward) because of a sign error in the steer-pivot camber assignment
  (`CarMeshBuilder.ts`, camber applies `-camberDeg` to the wrong side);
  correction planned together with the roll audit.
- **In-browser verification pending:** headless Chromium is unavailable in
  this sandbox, so the new start sequence, gantry lamps, HUD overlay, grid
  paint and contact behaviour have not been click-tested. The dev preview on
  port 5173 is the arbiter.
- The `docs/REALISM_PASS_4.md` reference in `raceGrid.ts` originally pointed
  at this file; it now exists, but nothing here claims more fidelity than the
  code delivers.
