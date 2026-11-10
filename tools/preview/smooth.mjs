// Smooth-shaded turntable preview built on tools/preview/scene.mjs.
// usage: npx vite-node tools/preview/smooth.mjs -- <out.png> [yaw] [pitch] [dist] [carId]
import * as THREE from 'three';
import { writePNG } from './raster.mjs';
import { harvest, renderScene, atmosphere, V } from './scene.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const out = args[0] || '/tmp/smooth.png';
const yaw = Number(args[1] ?? 0.9);
const pitch = Number(args[2] ?? 0.22);
const dist = Number(args[3] ?? 7.4);
const carId = args[4] || '';

const { CAR_CATALOG, createDefaultTuneForCar } = await import('../../src/data/carCatalog.ts');
const { buildCarMesh } = await import('../../src/cars/CarMeshBuilder.ts');

const car = CAR_CATALOG.find((c) => c.id === carId) || CAR_CATALOG[0];
const tune = createDefaultTuneForCar(car);
const rig = buildCarMesh(car, tune);
rig.cfdGroup.visible = false;
rig.root.traverse((o) => { if (o.isLine || o.isLineSegments) o.visible = false; });
const root = new THREE.Group();
root.add(rig.root);

// Turntable floor
const floorGeo = new THREE.CircleGeometry(6, 48);
floorGeo.rotateX(-Math.PI / 2);
const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.55, metalness: 0.1 }));
floor.position.y = 0.001;
root.add(floor);

const only = process.env.ONLY || '';
const tris = harvest(root, { hide: (o) => {
  if (!only) return false;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (only === 'paint') return !(m && m.type === 'MeshPhysicalMaterial' && !m.transparent);
  return false;
} }).filter((t) => (only === 'opaque' ? t.opac >= 0.99 : true));
const cx = Math.sin(yaw) * Math.cos(pitch) * dist;
const cy = Math.sin(pitch) * dist + 0.85;
const cz = Math.cos(yaw) * Math.cos(pitch) * dist;
const sunDir = V(-0.45, 0.62, 0.64);
const { buf, width, height } = renderScene(tris, {
  width: 1280, height: 720, ssaa: 2,
  camera: V(cx, cy, cz), lookAt: V(0, 0.68, 0), fov: 36,
  sunDir,
  sunColor: new THREE.Color(1.0, 0.94, 0.86),
  sunIntensity: 1.5,
  sky: atmosphere(0x2f4a72, 0xd8cfc2, sunDir, 0xffe8cc, 0.85),
  exposure: 1.5,
  env: true,
});
writePNG(out, width, height, buf);
console.log('car:', car.name, 'tris:', tris.length, '->', out);
