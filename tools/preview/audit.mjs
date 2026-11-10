// Geometry audit across every archetype: bounding box, wheel-to-body
// interpenetration, ground clearance, wheelbase sanity. Prints a table so a
// proportion bug is visible without a GPU.
import * as THREE from 'three';
import './scene.mjs'; // installs the DOM shim

const { CAR_CATALOG, createDefaultTuneForCar } = await import('../../src/data/carCatalog.ts');
const { buildCarMesh } = await import('../../src/cars/CarMeshBuilder.ts');

const byArch = new Map();
for (const car of CAR_CATALOG) if (!byArch.has(car.archetype)) byArch.set(car.archetype, car);

const rows = [];
for (const [arch, car] of byArch) {
  let rig;
  try {
    rig = buildCarMesh(car, createDefaultTuneForCar(car));
  } catch (e) {
    rows.push([arch, 'BUILD FAILED', e.message]);
    continue;
  }
  rig.root.updateMatrixWorld(true);
  const body = rig.carriage || null;
  const box = new THREE.Box3().setFromObject(rig.root);
  const size = box.getSize(new THREE.Vector3());
  const wheelY = rig.wheels.map((w) => w.getWorldPosition(new THREE.Vector3()).y);
  const r = rig.wheelRadiusM;
  // What should the length be? Derived from the shape the builder asked for.
  const shapeLen = rig.bodyShape.length;
  const shapeWid = rig.bodyShape.width;
  rows.push([
    arch.padEnd(20),
    car.id.padEnd(24),
    `shape L${shapeLen.toFixed(2)} W${shapeWid.toFixed(2)}`,
    `box L${size.z.toFixed(2)} W${size.x.toFixed(2)} H${size.y.toFixed(2)}`,
    `wheelR ${r.toFixed(3)} y ${wheelY.map((v) => v.toFixed(2)).join(',')}`,
    `minY ${box.min.y.toFixed(2)} maxY ${box.max.y.toFixed(2)}`,
  ]);
  void body;
}
for (const r of rows) console.log(r.join(' | '));
