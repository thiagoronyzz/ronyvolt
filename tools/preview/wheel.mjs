import * as THREE from 'three';
import { writePNG, collectTris, renderView } from './raster.mjs';
globalThis.document = { createElement: () => ({ width:0,height:0, getContext: () => new Proxy({}, { get: ()=>()=>({addColorStop(){}}), set: ()=>true }) }) };
const { buildWheel } = await import('../../src/cars/WheelBuilder.ts');
const mk = (c, r=0.5, m=0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const built = buildWheel({ radiusM: 0.32, widthM: 0.215, rimRadiusM: 0.2, spokes: 5, rimColor: '#c9ced8', sidewallAspect: 0.38, caliperColor: '#c1121f' },
  { tire: mk(0x2a2d33, 0.9), rim: mk(0xc9ced8, 0.2, 0.95), disc: mk(0x6a6f77, 0.35, 0.9), vane: mk(0x3a3d44,0.45,0.9), caliper: mk(0xc1121f,0.45,0.3), lug: mk(0xb8bec8,0.25,1) });
const g = new THREE.Group(); g.add(built.root);
const tris = collectTris(g, THREE);
console.log('tris', tris.length);
for (const [v,f] of [['front','/tmp/w_front.png'],['q34','/tmp/w_q34.png']]) {
  const { buf, width, height } = renderView(tris, { width: 700, height: 700, view: v, fovWorld: 0.85, THREE, bg:[0.12,0.13,0.15] });
  writePNG(f, width, height, buf);
}
