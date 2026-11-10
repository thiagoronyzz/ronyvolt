// Multi-car, multi-view contact sheet for visual regression of car geometry.
// usage: npx vite-node tools/preview/carsheet.mjs -- out.png id1,id2 views
import * as THREE from 'three';
import { writePNG } from './raster.mjs';
import { harvest, renderScene, atmosphere, V } from './scene.mjs';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const out = args[0] || '/tmp/sheet.png';
const ids = (args[1] || 'fiat-uno-2005-raiz').split(',');
const views = (args[2] || 'q34,side,rear').split(',');

const { CAR_CATALOG, createDefaultTuneForCar } = await import('../../src/data/carCatalog.ts');
const { buildCarMesh } = await import('../../src/cars/CarMeshBuilder.ts');

const W = 480, H = 300;
const cols = views.length, rows = ids.length;
const canvas = Buffer.alloc(W * cols * H * rows * 4, 255);

const dirs = {
  side: V(1, 0.06, 0.0),
  q34: V(0.75, 0.32, 0.9),
  qrear: V(-0.8, 0.3, -0.95),
  front: V(0.05, 0.1, 1),
  rear: V(0.02, 0.1, -1),
  top: V(0.01, 1, 0.02),
};

ids.forEach((id, ry) => {
  const car = CAR_CATALOG.find((c) => c.id === id) || CAR_CATALOG[0];
  const rig = buildCarMesh(car, createDefaultTuneForCar(car));
  rig.cfdGroup.removeFromParent();
  rig.shieldBubbleMesh.removeFromParent();
  rig.root.updateMatrixWorld(true);
  const allTris = harvest(rig.root);
  const box = new THREE.Box3();
  for (const t of allTris) box.expandByPoint(t.a);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() * 0.5;
  views.forEach((v, cx) => {
    const tris = allTris;
    const view = dirs[v] || dirs.q34;
    const cam = centre.clone().addScaledVector(view.clone().normalize(), radius * 2.6);
    const { buf, width, height } = renderScene(tris, {
      width: W, height: H, ssaa: 2,
      camera: cam, lookAt: centre, fov: 34,
      sunDir: V(-0.45, 0.6, 0.65), sunColor: new THREE.Color(1, 0.96, 0.9), sunIntensity: 2.3,
      sky: atmosphere(0x8fb6e8, 0xd7e6f5, V(-0.45, 0.6, 0.65), 0xfff3dd, 1),
      exposure: 1.0,
    });
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const s = (y * W + x) * 4, d = ((ry * H + y) * W * cols + cx * W + x) * 4;
        canvas[d] = buf[s]; canvas[d + 1] = buf[s + 1]; canvas[d + 2] = buf[s + 2]; canvas[d + 3] = 255;
      }
  });
  console.log(id, 'box', box.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(2)));
});
writePNG(out, W * cols, H * rows, canvas);
console.log('saved', out);
