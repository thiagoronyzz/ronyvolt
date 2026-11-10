import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeObject3D } from '../engine/disposal';

describe('disposeObject3D', () => {
  it('disposes geometry and material of every descendant', () => {
    const root = new THREE.Group();
    const child = new THREE.Group();
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const meshB = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    child.add(meshA);
    root.add(child, meshB);

    const geoSpyA = vi.spyOn(meshA.geometry, 'dispose');
    const matSpyA = vi.spyOn(meshA.material as THREE.Material, 'dispose');
    const geoSpyB = vi.spyOn(meshB.geometry, 'dispose');

    disposeObject3D(root);

    expect(geoSpyA).toHaveBeenCalled();
    expect(matSpyA).toHaveBeenCalled();
    expect(geoSpyB).toHaveBeenCalled();
  });

  it('handles material arrays and empty groups without throwing', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]
    );
    root.add(mesh);
    expect(() => disposeObject3D(root)).not.toThrow();
    expect(() => disposeObject3D(new THREE.Group())).not.toThrow();
  });
});
