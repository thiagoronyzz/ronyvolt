/**
 * CUSTOM MUSIC PLAYER — queue playback for player-imported files
 * ============================================================
 *
 * Owns ONE HTMLAudioElement, optionally routed through WebAudio (so it shares
 * the music analyser and the engine duck) with its own gain node. The element
 * is created lazily on the first play/attach call: browsers block audio before
 * a user gesture, and the old build returned silently from `play()` whenever
 * `attach()` had not run yet — the other half of the "cliquei e nada acontece"
 * report.
 *
 * Fixes in this version:
 *  - `play()` works even before `audioEngine.init()` (direct output fallback).
 *  - A suspended AudioContext is resumed on every play, not only on the very
 *    first global gesture.
 *  - `play()` rejects with AbortError when a second play changes `src` in the
 *    same tick; stale rejections are ignored instead of flipping the UI to
 *    "paused" while the second track is actually playing.
 *  - Media errors are surfaced with a human-readable message instead of being
 *    swallowed by an empty `catch`.
 *  - A pending play blocked by autoplay policy is retried on the next gesture.
 *  - Time / duration are published so the HUD can show real progress.
 */

import { nextIndex, prevIndex, PlayMode } from './CustomMusicLibrary';

export interface CustomQueueTrack {
  id: string;
  name: string;
  url: string;
}

export type CustomPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error';

export interface CustomPlayerState {
  index: number;
  playing: boolean;
  trackId: string | null;
  trackName: string | null;
  mode: PlayMode;
  volume: number;
  count: number;
  status: CustomPlaybackStatus;
  error: string | null;
  currentTime: number;
  duration: number;
}

type Listener = (state: CustomPlayerState) => void;

function describeMediaError(code: number | undefined, name?: string): string {
  switch (code) {
    case 1:
      return 'Reprodução abortada pelo navegador.';
    case 2:
      return 'Falha de rede ao ler o arquivo importado.';
    case 3:
      return 'Este formato de áudio não é suportado pelo navegador.';
    case 4:
      return 'Arquivo de áudio corrompido ou em formato não suportado.';
    default:
      return name ? `Não foi possível tocar a faixa (${name}).` : 'Não foi possível tocar a faixa.';
  }
}

export class CustomMusicPlayer {
  private el: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private sourceContext: AudioContext | null = null;
  private gain: GainNode | null = null;
  private ctx: AudioContext | null = null;
  private destination: AudioNode | null = null;

  private tracks: CustomQueueTrack[] = [];
  private index = -1;
  private playing = false;
  /** User intent. Stays true through the transient `pause` fired by load(). */
  private desiredPlaying = false;
  /** A play() blocked by autoplay policy, waiting for the next real gesture. */
  private pendingPlay = false;
  private mode: PlayMode = 'sequential';
  private volume = 0.8;
  private status: CustomPlaybackStatus = 'idle';
  private error: string | null = null;
  private currentTime = 0;
  private duration = 0;
  private playToken = 0;
  private listeners = new Set<Listener>();

  /** Route the element through WebAudio. Safe to call repeatedly. */
  public attach(ctx: AudioContext, destination: AudioNode): void {
    const contextChanged = this.sourceContext !== null && this.sourceContext !== ctx;
    if (contextChanged) {
      // createMediaElementSource() can only be called once per element. If the
      // context was recreated (HMR / reset), rebuild the element and resume the
      // same queue position instead of leaving a permanently silent node.
      const wasPlaying = this.desiredPlaying;
      const resumeIndex = this.index;
      this.el?.pause();
      try {
        this.sourceNode?.disconnect();
        this.gain?.disconnect();
      } catch {
        /* already disconnected */
      }
      this.sourceNode = null;
      this.gain = null;
      this.sourceContext = null;
      this.el = null;
      this.ctx = ctx;
      this.destination = destination;
      this.ensureElement();
      this.routeToWebAudio();
      if (wasPlaying && resumeIndex >= 0) this.play(resumeIndex);
      return;
    }

    this.ctx = ctx;
    this.destination = destination;
    this.ensureElement();
    this.routeToWebAudio();
  }

  private ensureElement(): HTMLAudioElement | null {
    if (this.el) return this.el;
    if (typeof Audio === 'undefined') return null;

    const el = new Audio();
    el.preload = 'auto';
    el.volume = 1;

    const markPlaying = () => {
      if (!this.desiredPlaying) return;
      this.playing = true;
      this.pendingPlay = false;
      this.status = 'playing';
      this.error = null;
      this.emit();
    };
    el.addEventListener('play', markPlaying);
    // A looping/short track can go ended → waiting → playing without a new
    // 'play' event. Without this the UI stayed stuck on "carregando…" forever.
    el.addEventListener('playing', markPlaying);
    el.addEventListener('pause', () => {
      this.playing = false;
      // load() fires a transient pause; keep the intent so the UI does not
      // flash "paused" while the new track is being prepared.
      this.status = this.desiredPlaying ? 'loading' : 'paused';
      this.emit();
    });
    el.addEventListener('ended', () => this.handleEnded());
    el.addEventListener('waiting', () => {
      if (this.desiredPlaying) {
        this.status = 'loading';
        this.emit();
      }
    });
    el.addEventListener('loadedmetadata', () => {
      this.duration = Number.isFinite(el.duration) ? el.duration : 0;
      this.emit();
    });
    el.addEventListener('durationchange', () => {
      this.duration = Number.isFinite(el.duration) ? el.duration : 0;
    });
    el.addEventListener('timeupdate', () => {
      this.currentTime = Number.isFinite(el.currentTime) ? el.currentTime : 0;
      // 4 Hz is enough for a progress bar; the game already runs at 60 fps.
      if (Math.floor(this.currentTime * 4) !== Math.floor((this.currentTime - 0.26) * 4)) this.emit();
    });
    el.addEventListener('error', () => {
      this.playing = false;
      this.desiredPlaying = false;
      this.pendingPlay = false;
      this.status = 'error';
      this.error = describeMediaError(el.error?.code);
      this.emit();
    });

    this.el = el;
    return el;
  }

  private routeToWebAudio(): void {
    if (!this.ctx || !this.destination || !this.el || this.sourceNode) return;
    try {
      this.sourceNode = this.ctx.createMediaElementSource(this.el);
      this.sourceContext = this.ctx;
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.sourceNode.connect(this.gain).connect(this.destination);
      // WebAudio owns the level now; keeping el.volume < 1 double-attenuates.
      this.el.volume = 1;
    } catch {
      // The element is already routed (or MediaElementSource is unsupported):
      // fall back to direct output so playback still works.
      this.sourceNode = null;
      this.gain = null;
      this.sourceContext = null;
      if (this.el) this.el.volume = this.volume;
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
      status: this.status,
      error: this.error,
      currentTime: this.currentTime,
      duration: this.duration,
    };
  }

  /** Replace the queue. Keeps playing the same track id if still present. */
  public setTracks(tracks: CustomQueueTrack[]): void {
    const currentId = this.index >= 0 ? this.tracks[this.index]?.id : null;
    this.tracks = [...tracks];
    if (currentId) {
      const at = this.tracks.findIndex((t) => t.id === currentId);
      this.index = at;
      if (at === -1) this.stopElement();
    } else {
      this.index = -1;
    }
    if (this.tracks.length === 0) {
      this.status = 'idle';
      this.playing = false;
      this.desiredPlaying = false;
      this.pendingPlay = false;
      this.currentTime = 0;
      this.duration = 0;
    }
    this.emit();
  }

  private stopElement(): void {
    if (!this.el) return;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    this.playing = false;
    this.desiredPlaying = false;
    this.pendingPlay = false;
    this.currentTime = 0;
    this.duration = 0;
    this.status = 'paused';
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
    // When routed through WebAudio the element stays at unity; otherwise the
    // element itself is the only volume control.
    if (this.el) this.el.volume = this.sourceNode ? 1 : this.volume;
    this.emit();
  }

  public getVolume(): number {
    return this.volume;
  }

  public play(index?: number): void {
    const el = this.ensureElement();
    if (!el || this.tracks.length === 0) return;
    const target = index !== undefined ? index : this.index >= 0 ? this.index : 0;
    if (target < 0 || target >= this.tracks.length) return;
    const track = this.tracks[target];

    this.desiredPlaying = true;
    this.pendingPlay = true;
    this.error = null;
    const token = ++this.playToken;

    if (this.index !== target || el.getAttribute('src') !== track.url) {
      this.index = target;
      this.currentTime = 0;
      this.duration = 0;
      el.src = track.url;
      el.load();
    }
    this.status = 'loading';

    // A click is a user gesture: resume here too, not only in the app-wide
    // first-gesture listener (which may have fired on a different control).
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const promise = el.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch((err: unknown) => {
        if (token !== this.playToken || !this.desiredPlaying) return; // superseded
        const name = err instanceof Error ? err.name : '';
        if (name === 'AbortError') return; // a newer play() replaced this src
        this.playing = false;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          this.status = 'blocked';
          this.pendingPlay = true; // a spurious 'play' event may have cleared it
          this.error = 'Toque novamente para liberar o áudio do navegador.';
        } else {
          this.status = 'error';
          this.error = describeMediaError(undefined, name);
        }
        this.emit();
      });
    }
    this.emit();
  }

  public pause(): void {
    this.desiredPlaying = false;
    this.pendingPlay = false;
    this.playToken++;
    this.el?.pause();
    this.status = 'paused';
    this.emit();
  }

  public toggle(): void {
    if (this.desiredPlaying || this.playing) this.pause();
    else this.play();
  }

  /**
   * Retries a play that was blocked by autoplay policy. Called from the app's
   * first real gesture. Does NOT resume a track the user explicitly paused.
   */
  public resumeIfLoaded(): void {
    if (!this.pendingPlay || this.tracks.length === 0) {
      if (this.ctx && this.ctx.state === 'suspended' && this.desiredPlaying) {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    this.play();
  }

  public next(): void {
    if (this.tracks.length === 0) return;
    this.play(nextIndex(this.index, this.tracks.length, this.mode));
  }

  public previous(): void {
    if (this.tracks.length === 0) return;
    this.play(prevIndex(this.index, this.tracks.length));
  }

  public seek(fraction: number): void {
    if (!this.el || this.duration <= 0) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    this.el.currentTime = clamped * this.duration;
    this.currentTime = this.el.currentTime;
    this.emit();
  }

  private handleEnded(): void {
    if (this.mode === 'loop_one') {
      if (this.el) this.el.currentTime = 0;
      this.play(this.index);
      return;
    }
    this.next();
  }

  /** Stop and release the element (full teardown). */
  public dispose(): void {
    this.stopElement();
    this.listeners.clear();
  }
}

export const customMusicPlayer = new CustomMusicPlayer();
