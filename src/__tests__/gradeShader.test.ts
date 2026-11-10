import { describe, expect, it } from 'vitest';
import { GRADE_SHADER } from '../render/RealismRenderer';

describe('final color grade shader', () => {
  it('declares every configured uniform in the fragment shader', () => {
    for (const name of Object.keys(GRADE_SHADER.uniforms)) {
      expect(GRADE_SHADER.fragmentShader).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`));
    }
  });
});

import * as THREE from 'three';
import { applyLeafGlow } from '../world/Scenery';

describe('foliage shader', () => {
  it('declares its glow uniform before using it in the fragment shader', () => {
    const shader = {
      uniforms: {},
      fragmentShader: '#include <common>\nvoid main() {\n#include <dithering_fragment>\n}',
    } as Parameters<THREE.Material['onBeforeCompile']>[0];
    applyLeafGlow(shader);
    expect(shader.uniforms.uLeafGlow.value).toBe(0.45);
    expect(shader.fragmentShader).toContain('uniform float uLeafGlow;');
    expect(shader.fragmentShader.indexOf('uniform float uLeafGlow;')).toBeLessThan(shader.fragmentShader.indexOf('void main()'));
  });
});
