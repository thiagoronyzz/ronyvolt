/**
 * CUSTOM MUSIC PLAYER — queue playback for player-imported files.
 * ---------------------------------------------------------------
 * Owns a single HTMLAudioElement routed through WebAudio (so it shares the
 * music bus, the bass analyser and the engine duck) with its OWN gain node,
 * so "Minhas Músicas" volume is independent from the engine and SFX.
 *
 * The element is created lazily on the first user gesture (browsers block
 * audio before that). Object URLs are created from library blobs and revoked
 * when tracks are removed or replaced — the previous build created a URL per
 * file and never revoked it.
 */

import { nextIndex, prevIndex, PlayMode } from './CustomMusicLibrary';

export interface CustomQueueTrack {
  id: string;
  name: string;
  url: string;
}

export interface CustomPlayerState {
  index: number;
  playing: boolean;
  trackId: string | null;
  trackName: string | null;
  mode: PlayMode;
  volume: number;
  count: number;
}

type Listener = (state: CustomPlayerState) => void;

export class CustomMusicPlayer {
  private el: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private ctx: AudioContext | null = null;

  private tracks: CustomQueueTrack[] = [];
  private index = -1;
  private playing = false;
  private mode: PlayMode = 'sequential';
  private volume = 0.8;
  private listeners = new Set<Listener>();

  /** Route the element through WebAudio. Safe to call repeatedly. */
  public attach(ctx: AudioContext, destination: AudioNode): void {
    this.ctx = ctx;
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = 'auto';
      this.el.addEventListener('ended', () => this.handleEnded());
      this.el.addEventListener('play', () => {
        this.playing = true;
        this.emit();
      });
      this.el.addEventListener('pause', () => {
        this.playing = false;
        this.emit();
      });
    }
    if (!this.sourceNode) {
      try {
        this.sourceNode = ctx.createMediaElementSource(this.el);
        this.gain = ctx.createGain();
        this.gain.gain.value = this.volume;
        this.sourceNode.connect(this.gain).connect(destination);
      } catch {
        // Element already routed (e.g. after a context re-init) — play direct.
        this.sourceNode = null;
        this.gain = null;
      }
    }
  }

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const s = this.getState();
    for (const fn of this.listeners) fn(s);
  }

  public getState(): CustomPlayerState {
    const t = this.index >= 0 && this.index < this.tracks.length ? this.tracks[this.index] : null;
    return {
      index: this.index,
      playing: this.playing,
      trackId: t?.id ?? null,
      trackName: t?.name ?? null,
      mode: this.mode,
      volume: this.volume,
      count: this.tracks.length,
    };
  }

  /** Replace the queue. Keeps playing the same track id if still present. */
  public setTracks(tracks: CustomQueueTrack[]): void {
    const currentId = this.index >= 0 ? this.tracks[this.index]?.id : null;
    this.tracks = [...tracks];
    if (currentId) {
      const at = this.tracks.findIndex((t) => t.id === currentId);
      this.index = at;
      if (at === -1 && this.el) {
        this.el.pause();
        this.el.removeAttribute('src');
        this.el.load();
        this.playing = false;
      }
    } else {
      this.index = -1;
    }
    this.emit();
  }

  public setMode(mode: PlayMode): void {
    this.mode = mode;
    this.emit();
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
    // The element stays at unity: routing it through WebAudio already gives us
    // the gain node, and lowering el.volume as well double-attenuates (80 %
    // became 64 %, 50 % became 25 % — a volume slider that did not match its
    // label).
    if (this.el) this.el.volume = 1;
    this.emit();
  }

  public getVolume(): number {
    return this.volume;
  }

  public play(index?: number): void {
    if (!this.el || this.tracks.length === 0) return;
    const target = index !== undefined ? index : this.index >= 0 ? this.index : 0;
    if (target < 0 || target >= this.tracks.length) return;
    const track = this.tracks[target];
    if (this.index !== target || this.el.getAttribute('src') !== track.url) {
      this.index = target;
      this.el.src = track.url;
      this.el.load();
    }
    this.el.play().catch(() => {
      this.playing = false;
      this.emit();
    });
    this.emit();
  }

  public pause(): void {
    this.el?.pause();
  }

  public toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /**
   * Browsers block `play()` until a user gesture unlocked the AudioContext.
   * If the first attempt was rejected, the element is already loaded — this
   * retries it from the next real user interaction (HUD button, pause menu).
   */
  public resumeIfLoaded(): void {
    if (!this.el || this.tracks.length === 0) return;
    if (this.index < 0) return;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.playing) {
      this.el.play().catch(() => {
        this.playing = false;
        this.emit();
      });
    }
  }

  public next(): void {
    if (this.tracks.length === 0) return;
    this.play(nextIndex(this.index, this.tracks.length, this.mode));
  }

  public previous(): void {
    if (this.tracks.length === 0) return;
    this.play(prevIndex(this.index, this.tracks.length));
  }

  private handleEnded(): void {
    if (this.mode === 'loop_one') {
      this.play(this.index);
      return;
    }
    this.next();
  }

  /** Stop and release the element (used on full teardown). */
  public dispose(): void {
    this.el?.pause();
    this.el?.removeAttribute('src');
    this.el?.load();
    this.listeners.clear();
  }
}

export const customMusicPlayer = new CustomMusicPlayer();
