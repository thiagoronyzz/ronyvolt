import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomMusicPlayer } from '../audio/CustomMusicPlayer';
import { customMusicMedia } from '../audio/CustomMusicMedia';
import { customMusicLibrary } from '../audio/CustomMusicLibrary';
import { customMusicPlayer } from '../audio/CustomMusicPlayer';
import { VelocityAudioEngine } from '../audio/VelocityAudioEngine';

/**
 * Regression tests for "clico no play e nada acontece".
 *
 * No jsdom / no audio device: a small HTMLAudioElement + AudioContext double
 * reproduces the browser contract (user-gesture resume, AbortError when src
 * changes, media errors, blob URL lifetime).
 */

type Handler = (...args: unknown[]) => void;

class FakeAudio {
  static instances: FakeAudio[] = [];
  private handlers = new Map<string, Set<Handler>>();
  private srcAttr: string | null = null;
  public preload = '';
  public volume = 1;
  public currentTime = 0;
  public duration = 0;
  public paused = true;
  public error: { code: number } | null = null;
  public playCount = 0;
  public loadCount = 0;
  public pending: { resolve: () => void; reject: (e: unknown) => void }[] = [];

  constructor() {
    FakeAudio.instances.push(this);
  }

  addEventListener(type: string, fn: Handler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Handler): void {
    this.handlers.get(type)?.delete(fn);
  }
  dispatch(type: string): void {
    for (const fn of this.handlers.get(type) ?? []) fn();
  }
  setAttribute(name: string, value: string): void {
    if (name === 'src') this.srcAttr = value;
  }
  removeAttribute(name: string): void {
    if (name === 'src') this.srcAttr = null;
  }
  getAttribute(name: string): string | null {
    return name === 'src' ? this.srcAttr : null;
  }
  get src(): string {
    return this.srcAttr ?? '';
  }
  set src(value: string) {
    this.srcAttr = value;
  }
  load(): void {
    this.loadCount++;
    this.paused = true;
    this.dispatch('pause');
  }
  play(): Promise<void> {
    this.playCount++;
    this.paused = false;
    let settle!: { resolve: () => void; reject: (e: unknown) => void };
    const p = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
      this.pending.push(settle);
    });
    Promise.resolve().then(() => {
      if (!this.paused) {
        this.dispatch('play');
        settle.resolve();
      }
    });
    return p;
  }
  pause(): void {
    this.paused = true;
    this.dispatch('pause');
  }
}

class FakeNode {
  connect<T>(dst: T): T {
    return dst;
  }
  disconnect(): void {}
}
class FakeGain extends FakeNode {
  gain = { value: 0, setTargetAtTime: vi.fn() };
}
class FakeAudioContext {
  state = 'suspended';
  currentTime = 1;
  destination = new FakeNode() as unknown as AudioNode;
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  createMediaElementSource = vi.fn(() => new FakeNode());
  createGain = vi.fn(() => new FakeGain());
}

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let urlCounter = 0;
const createdUrls: string[] = [];
const revokedUrls: string[] = [];

beforeEach(async () => {
  FakeAudio.instances = [];
  urlCounter = 0;
  createdUrls.length = 0;
  revokedUrls.length = 0;
  await customMusicLibrary.clear();
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:test-${++urlCounter}`;
    createdUrls.push(u);
    return u;
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn((u: string) => {
    revokedUrls.push(u);
  }) as unknown as typeof URL.revokeObjectURL;
  vi.stubGlobal('Audio', FakeAudio);
  customMusicMedia.dispose();
  customMusicPlayer.setTracks([]);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  customMusicMedia.dispose();
  customMusicPlayer.setTracks([]);
  await customMusicLibrary.clear();
});

const queue = [
  { id: 'a', name: 'Faixa A.mp3', url: 'blob:test-a' },
  { id: 'b', name: 'Faixa B.mp3', url: 'blob:test-b' },
];

describe('CustomMusicPlayer', () => {
  it('plays even when attach() was never called (direct-output fallback)', async () => {
    const p = new CustomMusicPlayer();
    p.setTracks(queue);
    p.play(0);
    expect(FakeAudio.instances.length).toBe(1);
    expect(FakeAudio.instances[0].playCount).toBe(1);
    expect(FakeAudio.instances[0].src).toBe('blob:test-a');
    await Promise.resolve();
    expect(p.getState().playing).toBe(true);
    expect(p.getState().status).toBe('playing');
  });

  it('resumes a suspended AudioContext on play and routes through WebAudio', async () => {
    const p = new CustomMusicPlayer();
    const ctx = new FakeAudioContext();
    p.attach(ctx as unknown as AudioContext, new FakeNode() as unknown as AudioNode);
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
    p.setTracks(queue);
    p.play(1);
    expect(ctx.resume).toHaveBeenCalled();
    await Promise.resolve();
    expect(p.getState().trackId).toBe('b');
  });

  it('ignores a stale AbortError when a newer play() replaced the src', async () => {
    const p = new CustomMusicPlayer();
    p.setTracks(queue);
    p.play(0);
    p.play(1);
    const el = FakeAudio.instances[0];
    el.pending[0].reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(p.getState().index).toBe(1);
    expect(p.getState().status).not.toBe('error');
    expect(p.getState().error).toBeNull();
  });

  it('surfaces media errors with a readable message', () => {
    const p = new CustomMusicPlayer();
    p.setTracks(queue);
    p.play(0);
    const el = FakeAudio.instances[0];
    el.error = { code: 4 };
    el.dispatch('error');
    expect(p.getState().status).toBe('error');
    expect(p.getState().error).toContain('corrompido');
  });

  it('retries only a pending autoplay-blocked play, never an explicit pause', async () => {
    const p = new CustomMusicPlayer();
    p.setTracks(queue);
    p.play(0);
    const el = FakeAudio.instances[0];
    // Simulate a real autoplay rejection: no 'play' event ever fires.
    el.paused = true;
    el.pending[0].reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    await Promise.resolve();
    expect(p.getState().status).toBe('blocked');
    p.resumeIfLoaded();
    expect(el.playCount).toBe(2);

    p.pause();
    const countAfterPause = el.playCount;
    p.resumeIfLoaded();
    expect(el.playCount).toBe(countAfterPause);
  });
});

describe('CustomMusicMedia', () => {
  it('keeps object URLs alive across refreshes, and revokes only removed tracks', async () => {
    const a = new File(['aaa'], 'A.mp3', { type: 'audio/mpeg' });
    const b = new File(['bbb'], 'B.mp3', { type: 'audio/mpeg' });
    const ma = await customMusicLibrary.add(a);
    const first = await customMusicMedia.refresh();
    expect(first.length).toBe(1);
    const urlA = first[0].url;
    expect(urlA).toBeTruthy();

    await customMusicLibrary.add(b);
    const second = await customMusicMedia.refresh();
    // The old panel revoked this URL on unmount; here it must be identical.
    expect(second.find((v) => v.id === ma.id)?.url).toBe(urlA);
    expect(revokedUrls).toHaveLength(0);
    expect(createdUrls).toHaveLength(2);

    await customMusicLibrary.remove(ma.id);
    await customMusicMedia.refresh();
    expect(revokedUrls).toContain(urlA);
  });

  it('serialises concurrent refreshes instead of creating duplicate URLs', async () => {
    await customMusicLibrary.add(new File(['x'], 'X.mp3', { type: 'audio/mpeg' }));
    await Promise.all([customMusicMedia.refresh(), customMusicMedia.refresh(), customMusicMedia.refresh()]);
    expect(createdUrls).toHaveLength(1);
    expect(customMusicMedia.getViews()).toHaveLength(1);
  });
});

describe('VelocityAudioEngine custom music entry points', () => {
  it('playCustom() sets the station and calls play() exactly once', () => {
    customMusicPlayer.setTracks(queue);
    const engine = new VelocityAudioEngine();
    vi.spyOn(engine, 'init').mockImplementation(() => {});
    engine.playCustom(1);
    expect(engine.getStation()).toBe('custom_usb');
    expect(FakeAudio.instances.length).toBeLessThanOrEqual(1);
    expect(customMusicPlayer.getState().index).toBe(1);
  });

  it('resumeFromMenu() restores the master bus even when the pause flag was stale', () => {
    const engine = new VelocityAudioEngine();
    const setTargetAtTime = vi.fn();
    const internals = engine as unknown as {
      ctx: { currentTime: number; state: string };
      masterGain: { gain: { setTargetAtTime: typeof setTargetAtTime } };
      masterVolume: number;
      isMuted: boolean;
    };
    internals.ctx = { currentTime: 3, state: 'running' };
    internals.masterGain = { gain: { setTargetAtTime } };
    internals.masterVolume = 1;
    internals.isMuted = false;
    engine.resumeFromMenu();
    expect(setTargetAtTime).toHaveBeenLastCalledWith(0.42, 3, 0.05);
    expect(engine.isMenuPaused()).toBe(false);
  });

  it('a play click restores a master bus muted by a stale pause flag', () => {
    customMusicPlayer.setTracks(queue);
    const engine = new VelocityAudioEngine();
    vi.spyOn(engine, 'init').mockImplementation(() => {});
    const setTargetAtTime = vi.fn();
    const internals = engine as unknown as {
      ctx: { currentTime: number; state: string };
      masterGain: { gain: { setTargetAtTime: typeof setTargetAtTime } };
      masterVolume: number;
      isMuted: boolean;
      menuPaused: boolean;
      musicPausedByMenu: boolean;
      wasCustomPlaying: boolean;
      wasSoundtrackPlaying: boolean;
    };
    internals.ctx = { currentTime: 7, state: 'running' };
    internals.masterGain = { gain: { setTargetAtTime } };
    internals.masterVolume = 1;
    internals.isMuted = false;
    // Simulate: pause menu → garage → new race, then the player presses play.
    internals.menuPaused = true;
    internals.musicPausedByMenu = true;
    internals.wasCustomPlaying = true;
    internals.wasSoundtrackPlaying = false;
    // The player singleton keeps its HTMLAudioElement across tests, so read
    // its play counter directly instead of assuming a fresh element.
    const el = (customMusicPlayer as unknown as { el: FakeAudio | null }).el;
    const before = el?.playCount ?? 0;
    engine.customToggle();
    expect(engine.isMenuPaused()).toBe(false);
    expect(setTargetAtTime).toHaveBeenLastCalledWith(0.42, 7, 0.05);
    expect(customMusicPlayer.getState().status).toBe('loading');
    expect(el?.playCount).toBe(before + 1);
  });

  it('an explicit pause is not resurrected when the pause menu closes', () => {
    customMusicPlayer.setTracks(queue);
    const engine = new VelocityAudioEngine();
    vi.spyOn(engine, 'init').mockImplementation(() => {});
    const internals = engine as unknown as {
      ctx: { currentTime: number; state: string };
      masterGain: { gain: { setTargetAtTime: ReturnType<typeof vi.fn> } };
      musicPausedByMenu: boolean;
      wasCustomPlaying: boolean;
    };
    internals.ctx = { currentTime: 1, state: 'running' };
    internals.masterGain = { gain: { setTargetAtTime: vi.fn() } };
    internals.musicPausedByMenu = true;
    internals.wasCustomPlaying = true;
    engine.customToggle(); // play
    engine.customToggle(); // explicit pause
    expect(internals.wasCustomPlaying).toBe(false);
    expect(internals.musicPausedByMenu).toBe(false);
    engine.resumeFromMenu();
    expect(customMusicPlayer.getState().playing).toBe(false);
  });
});
