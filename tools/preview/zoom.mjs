import * as THREE from 'three';
import { writePNG, collectTris, renderView } from './raster.mjs';
const mkCtx = () => new Proxy({}, {
  get: (t, k) => {
    if (k === 'createImageData' || k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray((w||x) * (h||y) * 4), width: w||x, height: h||y });
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
const rig = buildCarMesh(car, tune);
// hide helper lines (CFD) so they don't clutter
rig.cfdGroup.visible = false;
rig.root.traverse((o) => { if (o.isLine || o.isLineSegments) o.visible = false; });
const tris = collectTris(rig.root, THREE);
const view = process.argv[3] || 'side';
const zoom = Number(process.argv[4] || 2.4);
const out = process.argv[5] || `/tmp/zoom_${wanted}_${view}.png`;
const { buf, width, height } = renderView(tris, { width: 1280, height: 760, view, THREE, zoom, bg: [0.12, 0.13, 0.15] });
writePNG(out, width, height, buf);
console.log('wrote', out, 'tris', tris.length);
