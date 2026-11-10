/**
 * GPU resource disposal.
 * --------------------
 * `clearDynamicScene()` used to `scene.remove()` every dynamic child without
 * disposing anything. Each garage visit rebuilds the showroom + car and each
 * race rebuilds the track + up to 12 bot cars, so geometries and materials
 * accumulated on the GPU for the whole session — the classic slow FPS decay
 * after a few races. This helper walks a subtree and disposes geometry and
 * material. Textures are deliberately NOT disposed: several procedural
 * textures are shared across builds (contact-shadow blob, road maps) and
 * disposing a shared texture would break the next scene.
 */

import * as THREE from 'three';

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) {
      for (const m of material) m.dispose();
    } else if (material) {
      material.dispose();
    }
  });
}
