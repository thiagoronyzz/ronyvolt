// Track/world inspection: builds the real track world and renders a
// driver-eye view down the road so the landscape can be judged.
// usage: npx vite-node tools/preview/track.mjs -- out.png [trackIndex] [hour]
import * as THREE from 'three';
import { writePNG } from './raster.mjs';
import { harvest, renderScene, atmosphere, V } from './scene.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const out = args[0] || '/tmp/track.png';
const trackIdx = Number(args[1] ?? 0);
const hour = Number(args[2] ?? 15);

const { TRACK_CATALOG } = await import('../../src/data/trackCatalog.ts');
const { WEATHER_PRESETS } = await import('../../src/data/weatherCatalog.ts');
const { buildTrackWorld } = await import('../../src/tracks/TrackBuilder.ts');
const { CAR_CATALOG, createDefaultTuneForCar } = await import('../../src/data/carCatalog.ts');
const { buildCarMesh } = await import('../../src/cars/CarMeshBuilder.ts');

const track = TRACK_CATALOG[trackIdx];
const weather = WEATHER_PRESETS[2];
const world = buildTrackWorld(track, 'quick_race', 'GP', null);
const root = new THREE.Group();
root.add(world.group);

// Place the car a few hundred metres in, on the racing line.
const i = 60;
const p = world.samplePoints[i];
const t = world.sampleTangents[i];
const car = CAR_CATALOG[0];
const rig = buildCarMesh(car, createDefaultTuneForCar(car));
rig.root.position.set(p.x, p.y, p.z);
rig.root.rotation.y = Math.atan2(t.x, t.z);
root.add(rig.root);

const tris = harvest(root);
console.log('track:', track.name, 'tris:', tris.length);

// Golden-hour sun matching the reference photo.
const sunEl = 0.16;
const sunAz = 2.5;
const sunDir = V(Math.cos(sunAz) * Math.cos(sunEl), Math.sin(sunEl), Math.sin(sunAz) * Math.cos(sunEl));
const horizonCol = 0xffb070, zenithCol = 0x2a5a9e;
const { buf, width, height } = renderScene(tris, {
  width: 1280, height: 720, ssaa: 2,
  camera: V(p.x - t.x * 12 - t.z * 2.2, p.y + 2.2, p.z - t.z * 12 + t.x * 2.2),
  lookAt: V(p.x + t.x * 40, p.y + 1.4, p.z + t.z * 40),
  fov: 48,
  sunDir, sunColor: new THREE.Color(0xffcf9a), sunIntensity: 2.2,
  sky: atmosphere(zenithCol, horizonCol, sunDir, 0xffd9a0, 1),
  fog: { color: new THREE.Color(0xd9a882), density: 0.6 },
  exposure: 1.0,
});
writePNG(out, width, height, buf);
console.log('saved', out);
