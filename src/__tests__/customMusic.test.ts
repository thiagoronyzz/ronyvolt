import { describe, expect, it } from 'vitest';
import { CustomMusicLibrary, nextIndex, prevIndex } from '../audio/CustomMusicLibrary';

describe('queue index math', () => {
  it('sequential wraps around the end', () => {
    expect(nextIndex(0, 3, 'sequential')).toBe(1);
    expect(nextIndex(2, 3, 'sequential')).toBe(0);
  });

  it('previous wraps around the start', () => {
    expect(prevIndex(0, 3)).toBe(2);
    expect(prevIndex(2, 3)).toBe(1);
  });

  it('loop_one stays on the current track', () => {
    expect(nextIndex(1, 5, 'loop_one')).toBe(1);
  });

  it('shuffle never repeats the current track and stays in range', () => {
    for (let i = 0; i < 200; i++) {
      const n = nextIndex(2, 4, 'shuffle', () => Math.random());
      expect(n).not.toBe(2);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(4);
    }
  });

  it('empty and single-track queues are safe', () => {
    expect(nextIndex(0, 0, 'sequential')).toBe(-1);
    expect(prevIndex(0, 0)).toBe(-1);
    expect(nextIndex(0, 1, 'sequential')).toBe(0);
    expect(prevIndex(0, 1)).toBe(0);
  });
});

describe('CustomMusicLibrary (in-memory fallback in Node)', () => {
  it('adds, lists, reads and removes tracks', async () => {
    const lib = new CustomMusicLibrary();
    const blob = new File(['fake-mp3-bytes'], 'Minha Faixa.mp3', { type: 'audio/mpeg' });
    const meta = await lib.add(blob);

    expect(meta.name).toBe('Minha Faixa.mp3');
    expect(meta.size).toBe(blob.size);

    const listed = await lib.list();
    expect(listed.some((t) => t.id === meta.id)).toBe(true);

    const read = await lib.getBlob(meta.id);
    expect(read).not.toBeNull();
    expect(read!.size).toBe(blob.size);

    await lib.remove(meta.id);
    expect((await lib.list()).some((t) => t.id === meta.id)).toBe(false);
    expect(await lib.getBlob(meta.id)).toBeNull();
  });
});
