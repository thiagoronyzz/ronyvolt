import { describe, expect, it, vi } from 'vitest';
import { VelocityAudioEngine } from '../audio/VelocityAudioEngine';
import { TRACK_CATALOG } from '../data/trackCatalog';
import { resolveTrackForWorld } from '../tracks/TrackBuilder';
import type { CustomTrackData } from '../types/game';

describe('race editor configuration', () => {
  it('uses the custom name, biome, width and gravity without modifying the catalogue track', () => {
    const base = TRACK_CATALOG[0];
    const custom: CustomTrackData = {
      name: 'Minha pista', biome: 'mars_colony', roadWidth: 19,
      points: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 0, z: 100 }, { x: 0, y: 0, z: 100 }],
    };
    const result = resolveTrackForWorld(base, custom);
    expect(result).toMatchObject({ name: 'Minha pista', biome: 'mars_colony', roadWidth: 19, gravityG: 0.38 });
    expect(base.name).not.toBe(custom.name);
    expect(resolveTrackForWorld(base, null)).toBe(base);
    expect(resolveTrackForWorld(base, { ...custom, biome: 'neo_tokyo' }).gravityG).toBe(1);
  });
});

describe('master audio controls', () => {
  it('applies and clamps volume, and mute does not discard the chosen volume', () => {
    const audio = new VelocityAudioEngine();
    const setTargetAtTime = vi.fn();
    const internals = audio as unknown as { ctx: { currentTime: number }; masterGain: { gain: { setTargetAtTime: typeof setTargetAtTime } } };
    internals.ctx = { currentTime: 10 };
    internals.masterGain = { gain: { setTargetAtTime } };
    audio.setMasterVolume(0.5);
    expect(setTargetAtTime).toHaveBeenLastCalledWith(0.21, 10, 0.05);
    audio.setMuted(true);
    expect(setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.05);
    audio.setMuted(false);
    expect(setTargetAtTime).toHaveBeenLastCalledWith(0.21, 10, 0.05);
    audio.setMasterVolume(5);
    expect(audio.getMasterVolume()).toBe(1);
  });
});

import { adjustBotSkill } from '../ai/difficulty';

describe('bot difficulty', () => {
  it('changes skill around the default level and stays within the valid range', () => {
    expect(adjustBotSkill(6, 6)).toBe(6);
    expect(adjustBotSkill(6, 1)).toBeLessThan(6);
    expect(adjustBotSkill(6, 10)).toBeGreaterThan(6);
    expect(adjustBotSkill(1, 1)).toBe(1);
    expect(adjustBotSkill(10, 10)).toBe(10);
  });
});
