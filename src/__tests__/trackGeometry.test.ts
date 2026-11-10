import { describe, expect, it } from 'vitest';
import { TRACK_CATALOG } from '../data/trackCatalog';
import { buildTrackWorld } from '../tracks/TrackBuilder';

/**
 * TRACK GEOMETRY / COLLISION-CONTAINMENT TESTS
 * -------------------------------------------
 * The guardrail containment in the engine assumes a few invariants about the
 * generated circuit. If one of them breaks, the car either escapes the world
 * ("atravessa a parede") or gets snapped back violently ("trava/voa"). These
 * tests check the invariants directly against the real builder for a sample of
 * circuits, so a bad track can never reach the race.
 */


/**
 * The track builder bakes procedural canvas textures, which needs a 2D
 * context. Node has none, so every builder test stubs the minimum surface:
 * a no-op canvas whose context accepts any call and returns a chained proxy
 * for gradients/patterns. Nothing in these tests inspects pixels — the point is
 * the *geometry*, and the real textures are exercised in the browser build.
 */
function installCanvasStub(): void {
  if (typeof (globalThis as { document?: unknown }).document !== 'undefined') return;
  const makeCtx = (): CanvasRenderingContext2D => {
    const gradient = { addColorStop: () => undefined };
    // Own properties (font, fillStyle, canvas…) are read/written directly; any
    // *unknown* property resolves to a no-op function returning a gradient so
    // both `ctx.measureText(...)` and `ctx.createLinearGradient(...)` work.
    const target: Record<string, unknown> = {
      canvas: { width: 1, height: 1 },
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      getImageData: (x: number, y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createPattern: () => ({}),
      measureText: () => ({ width: 8 }),
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(t, prop) {
        if (typeof prop === 'symbol') return undefined;
        if (prop in t) return t[prop];
        return (...args: unknown[]) => {
          void args;
          return gradient;
        };
      },
      set(t, prop, value) {
        t[prop as string] = value;
        return true;
      },
    };
    return new Proxy(target, handler) as unknown as CanvasRenderingContext2D;
  };
  const makeCanvas = () => ({
    width: 1,
    height: 1,
    style: {},
    getContext: () => makeCtx(),
    toDataURL: () => 'data:image/png;base64,',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setAttribute: () => undefined,
  });
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? makeCanvas() : makeCanvas()),
    createElementNS: () => makeCanvas(),
  };
  (globalThis as unknown as { HTMLCanvasElement?: unknown }).HTMLCanvasElement = class {};
}

installCanvasStub();

const sample = [
  TRACK_CATALOG[0],
  TRACK_CATALOG[Math.floor(TRACK_CATALOG.length / 3)],
  TRACK_CATALOG[Math.floor((TRACK_CATALOG.length * 2) / 3)],
  TRACK_CATALOG[TRACK_CATALOG.length - 1],
];

describe('generated circuits are drivable', () => {
  it('produces a closed, finite centreline with a sensible length', () => {
    for (const track of sample) {
      const world = buildTrackWorld(track, 'quick_race');
      void (track as unknown as { id?: string }).id;
      expect(world.samplePoints.length).toBeGreaterThan(64);
      expect(world.totalLengthM).toBeGreaterThan(600);
      for (const p of world.samplePoints) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  it('keeps consecutive samples within a sane spacing (no teleporting track)', () => {
    const world = buildTrackWorld(sample[1], 'quick_race');
    const pts = world.samplePoints;
    let maxGap = 0;
    for (let i = 1; i < pts.length; i++) maxGap = Math.max(maxGap, pts[i].distanceTo(pts[i - 1]));
    // Samples are ~4 m apart; anything past 30 m means the curve folded.
    expect(maxGap).toBeLessThan(30);
  });

  it('never overlaps itself: distant points along the lap stay apart', () => {
    const world = buildTrackWorld(sample[1], 'quick_race');
    const pts = world.samplePoints;
    const n = pts.length;
    let worstOverlap = Infinity;
    for (let i = 0; i < n; i += 3) {
      for (let j = i + 12; j < n; j += 3) {
        // Ignore the seam between the end and the start of the lap.
        if (i < 12 && j > n - 12) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
        if (d < worstOverlap) worstOverlap = d;
      }
    }
    // Two parts of the circuit closer than the road width would let a car
    // "cut" through the barrier into the other straight.
    expect(worstOverlap).toBeGreaterThan(world.roadWidth * 0.9);
  });

  it('reports lateral offsets that make the containment band meaningful', () => {
    const world = buildTrackWorld(sample[2], 'quick_race');
    const p = world.samplePoints[10];
    const onTrack = world.sampleNearest(p.x, p.z);
    expect(onTrack.distance).toBeLessThan(30);
    expect(Math.abs(onTrack.lateralOffset)).toBeLessThan(2);
    // 40 m off to the side must read as far away, not as "on the racing line".
    const off = world.sampleNearest(p.x + 40, p.z + 40);
    expect(off.distance).toBeGreaterThan(10);
    expect(Math.abs(off.lateralOffset)).toBeGreaterThan(10);
  });

  it('survives a player-built track from the editor', () => {
    const custom = {
      name: 'Teste do Produtor',
      biome: 'sao_paulo' as const,
      roadWidth: 12,
      points: Array.from({ length: 10 }, (_, i) => ({
        x: Math.cos((i / 10) * Math.PI * 2) * 120,
        y: 0,
        z: Math.sin((i / 10) * Math.PI * 2) * 120,
      })),
    };
    const world = buildTrackWorld(sample[0], 'quick_race', 'GP', custom);
    expect(world.samplePoints.length).toBeGreaterThan(32);
    expect(Number.isFinite(world.totalLengthM)).toBe(true);
    expect(world.roadWidth).toBeCloseTo(12, 5);
  });
});
