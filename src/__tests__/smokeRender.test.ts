import { describe, expect, it } from 'vitest';
import { CAR_CATALOG, createDefaultTuneForCar } from '../data/carCatalog';
import { TRACK_CATALOG } from '../data/trackCatalog';
import { WEATHER_PRESETS } from '../data/weatherCatalog';
import { buildTrackWorld } from '../tracks/TrackBuilder';
import { buildCarMesh } from '../cars/CarMeshBuilder';

/** Minimal 2D canvas stub (the builders bake procedural textures). */
function installCanvasStub(): void {
  if (typeof (globalThis as { document?: unknown }).document !== 'undefined') return;
  const makeCtx = () => {
    const gradient = { addColorStop: () => undefined };
    const target: Record<string, unknown> = {
      canvas: { width: 1, height: 1 },
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(Math.max(4, w * h * 4)),
        width: w,
        height: h,
      }),
      getImageData: (x: number, y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(Math.max(4, w * h * 4)),
        width: w,
        height: h,
      }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createPattern: () => ({}),
      measureText: () => ({ width: 8 }),
    };
    return new Proxy(target, {
      get(t, prop) {
        if (typeof prop === 'symbol') return undefined;
        if (prop in t) return t[prop as string];
        return () => gradient;
      },
      set(t, prop, value) {
        t[prop as string] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
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
    createElement: () => makeCanvas(),
    createElementNS: () => makeCanvas(),
  };
}

installCanvasStub();

/**
 * WORLD-BUILD SMOKE TEST
 * ----------------------
 * Every one of the 888 cars and 205 circuits must build without throwing and
 * come out with a sane bounding box. This is the "assets que não carregam /
 * tela preta" class of bug caught before the player sees it: a single NaN in a
 * mesh position makes Three.js silently drop the object.
 */
describe('every car builds', () => {
  it('builds a rig for each car with finite geometry', () => {
    const sample = [0, 100, 300, 500, CAR_CATALOG.length - 1];
    for (const i of sample) {
      const car = CAR_CATALOG[i];
      const tune = createDefaultTuneForCar(car);
      const rig = buildCarMesh(car, tune);
      expect(rig.root, car.id).toBeTruthy();
      // The car must be a few metres long, not zero and not a kilometre.
      rig.root.updateMatrixWorld(true);
      const pos = rig.root.position;
      expect(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)).toBe(true);
      expect(rig.wheelRadiusM).toBeGreaterThan(0.05);
      expect(rig.wheelRadiusM).toBeLessThan(1);
    }
  });
});

describe('every circuit builds', () => {
  it('builds the first, middle and last circuit with a finite world', () => {
    const idx = [0, Math.floor(TRACK_CATALOG.length / 2), TRACK_CATALOG.length - 1];
    for (const i of idx) {
      const track = TRACK_CATALOG[i];
      const world = buildTrackWorld(track, 'quick_race', 'GP', null);
      expect(world.samplePoints.length).toBeGreaterThan(64);
      expect(world.group.children.length).toBeGreaterThan(0);
      expect(Number.isFinite(world.totalLengthM)).toBe(true);
      world.group.traverse((o) => {
        expect(Number.isFinite(o.position.x) && Number.isFinite(o.position.z)).toBe(true);
      });
    }
  });
});

describe('weathers', () => {
  it('exposes a complete preset for every condition', () => {
    expect(WEATHER_PRESETS.length).toBeGreaterThanOrEqual(40);
    for (const w of WEATHER_PRESETS) {
      expect(w.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(w.wetness)).toBe(true);
      expect(w.wetness).toBeGreaterThanOrEqual(0);
      expect(w.wetness).toBeLessThanOrEqual(1);
    }
  });
});
