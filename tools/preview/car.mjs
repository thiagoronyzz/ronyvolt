import * as THREE from 'three';
import { writePNG, collectTris, renderView } from './raster.mjs';

// --- minimal DOM shim for CanvasTexture generation -------------------------
const mkCtx = () => new Proxy({}, {
  get: (t, k) => {
    if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: mkCtx, style: {} }) };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.window = globalThis.window || {};

const { CAR_CATALOG, createDefaultTuneForCar } = await import('../../src/data/carCatalog.ts');
const { buildCarMesh } = await import('../../src/cars/CarMeshBuilder.ts');

const wanted = process.argv[2] || 'Uno';
const car = CAR_CATALOG.find((c) => c.name.includes(wanted)) || CAR_CATALOG[0];
const tune = createDefaultTuneForCar(car);
console.log('car:', car.name, car.archetype);
const rig = buildCarMesh(car, tune);

const views = (process.argv[3] || 'side,front,q34,top').split(',');
for (const view of views) {
  const tris = collectTris(rig.root, THREE);
  const { buf, width, height } = renderView(tris, { width: 1280, height: 760, view, THREE, bg: [0.16, 0.17, 0.19] });
  writePNG(`/tmp/car_${wanted}_${view}.png`, width, height, buf);
}
console.log('tris', collectTris(rig.root, THREE).length);
