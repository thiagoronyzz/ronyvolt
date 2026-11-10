/**
 * SOUNDTRACK PLAYER — the sequencer that turns a score into sound
 * ==============================================================
 *
 * DESIGN NOTES (why it sounds like music and not like a ringtone)
 * ---------------------------------------------------------------
 *  Web Audio's `setInterval` loop that the old build used has three defects that
 *  are audible immediately:
 *
 *   1. **Jitter.** `setInterval` fires on the main thread, so a frame hitch moves
 *      the next note. The groove wobbles. Every schedule here goes through a
 *      look-ahead scheduler: a 25 ms timer queues notes 120 ms ahead against
 *      `AudioContext.currentTime`, which is sample-locked. Notes never wobble.
 *   2. **No envelope.** A raw oscillator fading out linearly sounds like a
 *      beep. Every voice below has an ADSR (or an exponential pluck) plus a
 *      filter envelope, which is what gives a bass "pluck" its attack transient
 *      and a pad its slow bloom.
 *   3. **No arrangement.** One 16-step pattern repeated forever is a test tone.
 *      Each track here is a *score* with an intro, groove, hook, breakdown and
 *      outro; the hook introduces the lead, the breakdown drops the drums, and
 *      the whole thing re-enters. That is what a listener perceives as a song.
 *
 * The player also exposes an "engine duck": when the car's exhaust note is loud
 * (high load), the music bed side-chains down a few dB, exactly like a car
 * stereo being overwhelmed by the engine. That small detail is a large part of
 * why the mix feels recorded rather than layered.
 */

import {
  SoundtrackTrack,
  midiToFreq,
  realiseChord,
  trackById,
} from './Soundtrack';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;

/**
 * A stereo drum kit built from noise and sine bodies — a synthesized 808/909-ish
 * kit. Kick, snare (noise + body), hat (filtered noise), brush (bandpassed
 * noise swell) and rim.
 */
class DrumKit {
  constructor(
    private ctx: AudioContext,
    private noise: AudioBuffer,
    private out: AudioNode
  ) {}

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  kick(t: number, gain = 0.9): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(148, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.36);
  }

  snare(t: number, gain = 0.5): void {
    const n = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(bp).connect(g).connect(this.out);
    n.start(t);
    n.stop(t + 0.2);
    const body = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(196, t);
    body.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    bg.gain.setValueAtTime(gain * 0.55, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    body.connect(bg).connect(this.out);
    body.start(t);
    body.stop(t + 0.12);
  }

  hat(t: number, gain = 0.16, open = false): void {
    const n = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + (open ? 0.26 : 0.055));
    n.connect(hp).connect(g).connect(this.out);
    n.start(t);
    n.stop(t + (open ? 0.3 : 0.08));
  }

  brush(t: number, gain = 0.12): void {
    const n = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.18);
    n.connect(bp).connect(g).connect(this.out);
    n.start(t);
    n.stop(t + 0.22);
  }

  rim(t: number, gain = 0.2): void {
    const n = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.045);
    n.connect(bp).connect(g).connect(this.out);
    n.start(t);
    n.stop(t + 0.06);
  }
}

export class SoundtrackPlayer {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private duck: GainNode | null = null;
  // ReturnType<typeof setInterval> keeps this working both in the browser and
  // under the Node-based offline checker in tools/soundcheck.ts.
  private timer: ReturnType<typeof setInterval> | null = null;
  private noise: AudioBuffer | null = null;
  private kit: DrumKit | null = null;

  private track: SoundtrackTrack | null = null;
  private playlist: string[] = [];
  private playlistIndex = 0;

  /** Scheduling state, in beats. */
  private nextEventBeat = 0;
  private startTime = 0;
  private stepIndex = 0;
  private bar = 0;
  private sectionIdx = 0;
  private sectionStartBar = 0;
  private playing = false;
  private gain = 0.85;
  private tempoScale = 1;

  public attach(ctx: AudioContext, destination: AudioNode, noiseBuffer: AudioBuffer): void {
    this.ctx = ctx;
    this.noise = noiseBuffer;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.gain;
    // Side-chain duck node: the engine pulls this down via setEngineLoad().
    this.duck = ctx.createGain();
    this.duck.gain.value = 1;
    this.bus.connect(this.duck).connect(destination);
    this.kit = new DrumKit(ctx, noiseBuffer, this.bus);
  }

  public setVolume(v: number): void {
    this.gain = Math.max(0, Math.min(1, v));
    if (this.bus) this.bus.gain.value = this.gain;
  }

  public getVolume(): number {
    return this.gain;
  }

  /** True while audio nodes exist, i.e. before init() there is nothing to play. */
  public get isAttached(): boolean {
    return this.ctx !== null && this.bus !== null;
  }

  /**
   * Called by the audio engine after the bus exists. Starts the playlist only
   * once (init() is re-entrant) and only from a user gesture, which is what
   * browsers require anyway.
   */
  public ensurePlaying(): void {
    if (!this.isAttached || this.playing) return;
    this.play();
  }

  /**
   * Side-chain: the music bed drops up to 6 dB as engine load rises. Called
   * every frame with 0..1.
   */
  public setEngineLoad(load: number): void {
    if (!this.duck || !this.ctx) return;
    const target = 1 - Math.min(0.4, load * 0.4);
    this.duck.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  /**
   * Tempo slightly stretches with speed: a chase, not a metronome.
   *
   * Changing the tempo changes the beat-to-second mapping, so the anchor has to
   * be moved too, otherwise every event already queued would slide in time and
   * the groove would stutter whenever you touched the throttle. Rebasing keeps
   * the playhead exactly where it is and only affects how fast it moves on.
   */
  public setSpeedTempo(kmh: number): void {
    const next = 1 + Math.min(0.08, Math.max(0, kmh) / 300 * 0.08);
    if (Math.abs(next - this.tempoScale) < 0.0005) return;
    if (this.ctx && this.track && this.playing) {
      const oldSecPerBeat = 60 / this.track.bpm / this.tempoScale;
      const elapsedBeats = Math.max(0, (this.ctx.currentTime - this.startTime) / oldSecPerBeat);
      const newSecPerBeat = 60 / this.track.bpm / next;
      this.startTime = this.ctx.currentTime - elapsedBeats * newSecPerBeat;
    }
    this.tempoScale = next;
  }

  public get isPlaying(): boolean {
    return this.playing;
  }

  public get currentTrack(): SoundtrackTrack | null {
    return this.track;
  }

  public setPlaylist(ids: string[]): void {
    this.playlist = ids.filter((id) => !!trackById(id));
    if (this.playlist.length === 0) this.playlist = ['estrada_de_terra'];
    this.playlistIndex = 0;
  }

  public getPlaylist(): string[] {
    return [...this.playlist];
  }

  /** Starts a specific track, or the first of the playlist. */
  public play(trackId?: string): void {
    if (!this.ctx || !this.bus) return;
    const id = trackId ?? this.playlist[this.playlistIndex] ?? 'estrada_de_terra';
    const t = trackById(id);
    if (!t) return;
    this.track = t;
    this.bar = 0;
    this.stepIndex = 0;
    this.sectionIdx = 0;
    this.sectionStartBar = 0;
    this.nextEventBeat = 0;
    this.startTime = this.ctx.currentTime + 0.08;
    this.playing = true;
    this.startScheduler();
  }

  public stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.track = null;
  }

  public next(): void {
    if (this.playlist.length === 0) return;
    if (!this.isAttached) return;
    this.playlistIndex = (this.playlistIndex + 1) % this.playlist.length;
    this.play(this.playlist[this.playlistIndex]);
  }

  public previous(): void {
    if (this.playlist.length === 0) return;
    if (!this.isAttached) return;
    this.playlistIndex = (this.playlistIndex - 1 + this.playlist.length) % this.playlist.length;
    this.play(this.playlist[this.playlistIndex]);
  }

  private startScheduler(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
    this.tick();
  }

  /**
   * Look-ahead scheduler. Queues everything that falls inside the next
   * SCHEDULE_AHEAD_S window against the audio clock, which is the difference
   * between a groove and a stutter.
   */
  private tick(): void {
    if (!this.ctx || !this.playing || !this.track || !this.bus) return;
    const t = this.track;
    const secPerBeat = (60 / t.bpm) / this.tempoScale;
    const until = this.ctx.currentTime + SCHEDULE_AHEAD_S;

    let guard = 0;
    while (this.startTime + this.nextEventBeat * secPerBeat < until && guard < 64) {
      guard++;
      const when = this.startTime + this.nextEventBeat * secPerBeat;
      this.scheduleStep(t, this.stepIndex, when, secPerBeat);
      this.stepIndex++;
      this.nextEventBeat += 0.5; // 8th-note grid
      if (this.stepIndex % 8 === 0) {
        this.bar++;
        const totalBars = t.sections.reduce((s, x) => s + x.bars, 0);
        if (this.bar >= totalBars) {
          // Loop the arrangement; advance the playlist every other pass.
          this.bar = 0;
          this.sectionIdx = 0;
          this.sectionStartBar = 0;
          this.playlistIndex = (this.playlistIndex + 1) % Math.max(1, this.playlist.length);
          const nextId = this.playlist[this.playlistIndex];
          const nt = nextId ? trackById(nextId) : null;
          if (nt) {
            this.track = nt;
            this.startTime = when;
            this.nextEventBeat = 0;
            this.stepIndex = 0;
          }
        } else {
          while (
            this.sectionIdx < t.sections.length - 1 &&
            this.bar >= this.sectionStartBar + t.sections[this.sectionIdx].bars
          ) {
            this.sectionStartBar += t.sections[this.sectionIdx].bars;
            this.sectionIdx++;
          }
        }
      }
    }
  }

  private currentSection(): SoundtrackTrack['sections'][number] | null {
    const t = this.track;
    if (!t) return null;
    return t.sections[Math.min(this.sectionIdx, t.sections.length - 1)] ?? null;
  }

  private scheduleStep(t: SoundtrackTrack, step: number, when: number, secPerBeat: number): void {
    if (!this.ctx) return;
    const section = this.currentSection();
    const isHook = section?.name === 'hook';
    const isBreak = section?.name === 'breakdown';
    const isIntro = section?.name === 'intro';
    const bar = this.bar;
    const inBarStep = step % 8; // 8 eighth notes per bar
    const { tones, rootMidi } = realiseChord(t, bar, 3);

    // --- Drums -------------------------------------------------------------
    const drumGain = isBreak ? 0 : isIntro ? 0.55 : 1;
    if (this.kit && drumGain > 0 && t.drums !== 'none') {
      const g = drumGain * 0.85;
      switch (t.drums) {
        case 'four_on_floor':
          if (inBarStep % 2 === 0) this.kit.kick(when, g);
          if (inBarStep === 2 || inBarStep === 6) this.kit.snare(when, g * 0.45);
          if (inBarStep % 2 === 1) this.kit.hat(when, g * 0.18);
          break;
        case 'rock_backbeat':
          if (inBarStep === 0 || inBarStep === 3 || inBarStep === 4) this.kit.kick(when, g);
          if (inBarStep === 2 || inBarStep === 6) this.kit.snare(when, g * 0.6);
          this.kit.hat(when, g * (inBarStep % 2 ? 0.13 : 0.2));
          break;
        case 'bossa_brush':
          if (inBarStep === 0 || inBarStep === 5) this.kit.kick(when, g * 0.55);
          if (inBarStep === 1 || inBarStep === 3 || inBarStep === 6) this.kit.brush(when, g * 0.22);
          if (inBarStep === 2 || inBarStep === 7) this.kit.rim(when, g * 0.16);
          break;
        case 'breakbeat':
          if (inBarStep === 0 || inBarStep === 3 || inBarStep === 6) this.kit.kick(when, g);
          if (inBarStep === 2 || inBarStep === 5) this.kit.snare(when, g * 0.5);
          this.kit.hat(when, g * 0.15, inBarStep === 7);
          break;
        case 'half_time':
          if (inBarStep === 0) this.kit.kick(when, g);
          if (inBarStep === 4) this.kit.snare(when, g * 0.6);
          if (inBarStep % 2 === 1) this.kit.hat(when, g * 0.1);
          break;
        default:
          break;
      }
    }

    // --- Bass: root on the downbeat, with an eighth-note push --------------
    if (inBarStep === 0 || inBarStep === 3 || inBarStep === 5) {
      const dur = t.parts.bass === 'pulse' ? 0.14 : 0.42;
      this.bass(t.parts.bass, midiToFreq(rootMidi - 12), when, dur, isBreak ? 0.5 : 1);
    }

    // --- Pad: one chord per bar, held -------------------------------------
    if (inBarStep === 0 && t.parts.pad !== 'none') {
      const barSec = secPerBeat * 4;
      this.pad(t.parts.pad, tones.map(midiToFreq), when, barSec * 0.98, isBreak ? 1.15 : 1);
    }

    // --- Arp: eighth-note figure that only appears in the hook ------------
    if (isHook && t.parts.arp !== 'none' && inBarStep % 1 === 0) {
      const idx = (inBarStep * 3) % tones.length;
      this.pluck(t.parts.arp, midiToFreq(tones[idx] + 12), when, 0.2);
    }

    // --- Lead: the melody. Only in hook/outro; rests elsewhere -----------
    const leadOn = isHook || section?.name === 'outro';
    if (leadOn && t.parts.lead !== 'none') {
      const melody = this.melodyFor(t, bar, inBarStep, tones);
      if (melody !== null) {
        this.lead(t.parts.lead, midiToFreq(melody), when, secPerBeat * 0.9, isBreak ? 0 : 1);
      }
    }
  }

  /**
   * A deterministic melody generator: the hook is a *motif* (a repeated
   * rhythmic shape over the chord tones) transposed with the progression, which
   * is how a listener remembers a song. Random notes are not a melody.
   */
  private melodyFor(t: SoundtrackTrack, bar: number, inBarStep: number, tones: number[]): number | null {
    const pattern = [0, -1, 2, -1, 1, 0, -1, 3];
    const gate = [1, 0, 1, 0, 1, 1, 0, 1];
    if (gate[inBarStep] === 0) return null;
    const idx = Math.abs(pattern[inBarStep]) % tones.length;
    const octaveShift = bar % 4 === 3 ? 12 : 0;
    // Structural variation: every other phrase the motif drops a third.
    const phraseShift = Math.floor(bar / 2) % 2 === 0 ? 0 : -2;
    return tones[idx] + 12 + octaveShift + phraseShift;
  }

  // --- Voices ---------------------------------------------------------------

  private bass(kind: SoundtrackTrack['parts']['bass'], freq: number, t: number, dur: number, amp = 1): void {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = kind === 'saw_pick' ? 6 : 1.2;
    lp.frequency.setValueAtTime(kind === 'fretless' ? 420 : 900, t);
    lp.frequency.exponentialRampToValueAtTime(kind === 'saw_pick' ? 320 : 180, t + dur);
    osc.type = kind === 'sub_round' ? 'sine' : kind === 'fretless' ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq / 2, t);
    const subG = ctx.createGain();
    subG.gain.value = kind === 'sub_round' ? 0.5 : 0.22;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32 * amp, t + 0.012);
    g.gain.setTargetAtTime(0.2 * amp, t + 0.05, 0.18);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(lp);
    sub.connect(subG).connect(lp);
    lp.connect(g).connect(this.bus);
    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  private pad(kind: SoundtrackTrack['parts']['pad'], freqs: number[], t: number, dur: number, amp = 1): void {
    if (!this.ctx || !this.bus || kind === 'none') return;
    const ctx = this.ctx;
    for (const f of freqs) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(kind === 'glass_pad' ? 5200 : 1800, t);
        lp.Q.value = 0.6;
        o.type = kind === 'glass_pad' ? 'triangle' : kind === 'brass_swell' ? 'sawtooth' : 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.detune.value = detune;
        // Slow bloom: 200 ms attack for strings, 60 ms for glass.
        const attack = kind === 'glass_pad' ? 0.06 : 0.24;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.055 * amp, t + attack);
        g.gain.setTargetAtTime(0.045 * amp, t + attack + 0.05, dur * 0.35);
        g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
        o.connect(lp).connect(g).connect(this.bus);
        o.start(t);
        o.stop(t + dur + 0.08);
      }
    }
  }

  private pluck(kind: 'pluck' | 'marimba', freq: number, t: number, dur: number): void {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    o.type = kind === 'marimba' ? 'sine' : 'square';
    o.frequency.setValueAtTime(freq, t);
    if (kind === 'marimba') {
      // Marimba = a sine with a fast filter sweep and a strong odd partial.
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.14);
    } else {
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.1);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(kind === 'marimba' ? 0.1 : 0.075, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private lead(
    kind: SoundtrackTrack['parts']['lead'],
    freq: number,
    t: number,
    dur: number,
    amp = 1
  ): void {
    if (!this.ctx || !this.bus || kind === 'none' || amp <= 0) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2.4;
    lp.frequency.setValueAtTime(kind === 'bell_lead' ? 5200 : 3000, t);
    lp.frequency.exponentialRampToValueAtTime(kind === 'bell_lead' ? 2400 : 1500, t + dur);
    o.type = kind === 'nylon' ? 'triangle' : kind === 'bell_lead' ? 'sine' : 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 2.005, t);
    const g2 = ctx.createGain();
    g2.gain.value = kind === 'bell_lead' ? 0.35 : 0.12;
    const peak = kind === 'saw_lead' ? 0.14 : 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak * amp, t + 0.02);
    g.gain.setTargetAtTime(peak * 0.7 * amp, t + 0.05, dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    // A touch of vibrato on sustained notes, like a player's hand.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.2;
    lfoGain.gain.value = freq * 0.006;
    lfo.connect(lfoGain).connect(o.frequency);
    o.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(this.bus);
    o.start(t);
    o2.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }
}

export const soundtrackPlayer = new SoundtrackPlayer();
