import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * LOAD RESILIENCE / LEAK AUDIT
 * ---------------------------
 * Static guards for the two classes of bug that made the game freeze or slow
 * down over time. They are code-level assertions on the real sources, so they
 * fail the build if the pattern is reintroduced.
 */

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('memory / GPU resource discipline', () => {
  const engine = read('engine/VelocityEngine.ts');

  it('disposes vehicles, composer and renderer on teardown', () => {
    expect(engine).toMatch(/disposeObject3D/);
    expect(engine).toMatch(/this\.realism\.dispose\(\)/);
    expect(engine).toMatch(/this\.renderer\.dispose\(\)/);
    expect(engine).toMatch(/this\.resizeObserver\?\.disconnect\(\)/);
  });

  it('returns particles to a pool instead of allocating one per frame', () => {
    expect(engine).toMatch(/obtainParticleMesh/);
    expect(engine).toMatch(/smokePool/);
    // No per-puff geometry allocation inside the spawn path.
    const spawn = engine.slice(engine.indexOf('private spawnParticle'), engine.indexOf('private spawnParticle') + 1600);
    expect(spawn).not.toMatch(/new THREE\.SphereGeometry/);
  });

  it('caps unbounded telemetry/recording buffers', () => {
    expect(engine).toMatch(/telemetryLog\.length < 4500/);
    expect(engine).toMatch(/30000/);
  });

  it('removes every global listener it installs', () => {
    for (const listener of ['keydown', 'resize', 'orientationchange', 'blur', 'visibilitychange']) {
      const added = engine.includes(`addEventListener('${listener}'`);
      const removed = engine.includes(`removeEventListener('${listener}'`);
      if (added) expect(removed, `listener ${listener} must be removed`).toBe(true);
    }
  });
});

describe('resize / composer synchronization', () => {
  const engine = read('engine/VelocityEngine.ts');

  it('resizes the post-processing composer together with the renderer', () => {
    const handler = engine.slice(engine.indexOf('private handleResize'), engine.indexOf('private handleResize') + 1600);
    expect(handler).toMatch(/this\.realism\.setSize/);
    expect(handler).toMatch(/this\.camera\.aspect = w \/ h/);
    expect(handler).toMatch(/this\.camera\.updateProjectionMatrix\(\)/);
  });

  it('observes the container, not just the window', () => {
    expect(engine).toMatch(/new ResizeObserver/);
    expect(engine).toMatch(/resizeObserver\.observe\(this\.container\)/);
  });
});

describe('audio lifecycle', () => {
  const audio = read('audio/VelocityAudioEngine.ts');

  it('has one entry point per concern: unlock, pause, resume', () => {
    expect(audio).toMatch(/public unlock\(\)/);
    expect(audio).toMatch(/public pauseForMenu\(\)/);
    expect(audio).toMatch(/public resumeFromMenu\(\)/);
  });

  it('keeps engine / sfx / music / mp3 on separate buses', () => {
    for (const bus of ['engineBus', 'sfxBus', 'musicGain', 'customGain']) {
      expect(audio).toContain(bus);
    }
    expect(audio).toMatch(/public setEngineVolume/);
    expect(audio).toMatch(/public setSfxVolume/);
    expect(audio).toMatch(/public setMusicVolume/);
    expect(audio).toMatch(/public setCustomVolume/);
  });
});
