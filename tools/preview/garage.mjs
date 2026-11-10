// Garage inspection shot. Renders the actual buildGarageShowroom + buildCarMesh
// set from the engine's own orbit camera so we can see exactly what the player
// sees on the load screen.
// usage: npx vite-node tools/preview/garage.mjs -- <out.png> [yaw] [pitch] [dist] [tier]
import * as THREE from 'three';
import { writePNG } from './raster.mjs';
import { harvest, renderScene, atmosphere, V } from './scene.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const out = args[0] || '/tmp/garage.png';
const yaw = Number(args[1] ?? 0.55);
const pitch = Number(args[2] ?? 0.24);
const dist = Number(args[3] ?? 5.4);
const tier = Number(args[4] ?? 1);

const { CAR_CATALOG, createDefaultTuneForCar } = await import('../../src/data/carCatalog.ts');
const { buildCarMesh } = await import('../../src/cars/CarMeshBuilder.ts');
const { buildGarageShowroomV2 } = await import('../../src/tracks/GarageStudio.ts');

const car = CAR_CATALOG.find((c) => c.id === process.env.CAR) || CAR_CATALOG[0];
const rig = buildCarMesh(car, createDefaultTuneForCar(car));
rig.root.position.y = 0.115;
const built = buildGarageShowroomV2(tier, 3, []);
built.turntable.add(rig.root);
const root = new THREE.Group();
root.add(built.group);

const tris = harvest(root);
console.log('car:', car.name, 'tris:', tris.length);

const cx = Math.sin(yaw) * Math.cos(pitch) * dist;
const cy = Math.sin(pitch) * dist + 0.95;
const cz = Math.cos(yaw) * Math.cos(pitch) * dist;
const { buf, width, height } = renderScene(tris, {
  width: 1280,
  height: 720,
  ssaa: 2,
  camera: V(cx, cy, cz),
  lookAt: V(0, 0.62, 0),
  fov: 46,
  sunDir: V(-0.35, 0.9, 0.45),
  sunColor: new THREE.Color(0.88, 0.93, 1),
  sunIntensity: 0.75,
  sky: atmosphere(0x2c3440, 0x6b7482, V(-0.35, 0.9, 0.45), 0xdfe8f5, 0.55),
  exposure: 1.7,
});
writePNG(out, width, height, buf);
console.log('saved', out);
