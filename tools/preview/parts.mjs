import * as THREE from 'three';
import { writePNG, collectTris, renderView } from './raster.mjs';
const mkCtx = () => new Proxy({}, { get: (t,k) => {
  if (k==='createImageData') return (w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h});
  if (k==='getImageData') return (x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h});
  if (k==='createRadialGradient'||k==='createLinearGradient') return ()=>({addColorStop(){}});
  if (k==='measureText') return ()=>({width:10});
  return ()=>{};
}, set: ()=>true });
globalThis.document = { createElement: () => ({ width:0, height:0, getContext: mkCtx, style:{} }) };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
const { CAR_CATALOG, createDefaultTuneForCar } = await import('../../src/data/carCatalog.ts');
const { buildCarMesh } = await import('../../src/cars/CarMeshBuilder.ts');

const name = process.argv[2] || 'Uno';
const car = CAR_CATALOG.find(c => c.name.includes(name)) || CAR_CATALOG[0];
const rig = buildCarMesh(car, createDefaultTuneForCar(car));
const meshes = [];
rig.root.traverse(o => { if (o.isMesh) meshes.push(o); });
const lower = meshes[0], cabin = meshes[1];

function shot(vis, view, file, zoom=1.0, yOff=0) {
  meshes.forEach(m => m.visible = vis.includes(m));
  const grp = new THREE.Group();
  const tris = collectTris(rig.root, THREE);
  const { buf, width, height } = renderView(tris, { width: 1100, height: 400, view, fovWorld: 5.2, zoom, THREE, camY: yOff, bg: [0.10,0.11,0.13] });
  writePNG(file, width, height, buf);
}
shot([lower], 'side', '/tmp/p_lower_side.png');
shot([cabin], 'side', '/tmp/p_cabin_side.png');
shot([lower], 'front', '/tmp/p_lower_front.png');
shot([cabin], 'front', '/tmp/p_cabin_front.png');
shot([lower, cabin], 'side', '/tmp/p_both_side.png');
shot([lower, cabin], 'q34', '/tmp/p_both_q34.png');
console.log('ok');
