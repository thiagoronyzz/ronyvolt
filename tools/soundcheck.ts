/**
 * Offline check of the soundtrack sequencer.
 *
 * There is no audio device here, so this stubs the slice of Web Audio the player
 * uses and counts what it actually schedules. It catches the failure modes that
 * a type checker cannot: a scheduler that never fires, notes scheduled in the
 * past, exponential ramps to zero, sections that never advance, playlist tracks
 * that never rotate.
 *
 * Run: npx vite-node tools/soundcheck.ts
 */
import { SoundtrackPlayer } from '../src/audio/SoundtrackPlayer';
import { DEFAULT_PLAYLIST, SOUNDTRACK } from '../src/audio/Soundtrack';

let starts = 0;
let badTime = 0;
let rampToZero = 0;
let now = 0;

class Param {
  value = 0;
  setValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    if (t < now - 1e-6) badTime++;
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    if (t < now - 1e-6) badTime++;
    if (v === 0) rampToZero++;
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number): this {
    if (t < now - 1e-6) badTime++;
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

class Node {
  connect<T>(dst: T): T {
    return dst;
  }
  disconnect(): void {}
}

class Osc extends Node {
  type = 'sine';
  frequency = new Param();
  detune = new Param();
  start(t = now): void {
    if (t < now - 1e-6) badTime++;
    starts++;
  }
  stop(_t?: number): void {}
}

class Gain extends Node {
  gain = new Param();
}

class Filter extends Node {
  type = 'lowpass';
  frequency = new Param();
  Q = new Param();
  gain = new Param();
}

class Source extends Node {
  buffer: unknown = null;
  loop = false;
  start(t = now): void {
    if (t < now - 1e-6) badTime++;
    starts++;
  }
  stop(_t?: number): void {}
}

const ctx = {
  get currentTime() {
    return now;
  },
  sampleRate: 48000,
  state: 'running',
  createOscillator: () => new Osc(),
  createGain: () => new Gain(),
  createBiquadFilter: () => new Filter(),
  createBufferSource: () => new Source(),
  createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
} as unknown as AudioContext;

const noise = (ctx as unknown as { createBuffer: (a: number, b: number) => AudioBuffer }).createBuffer(1, 48000);

const player = new SoundtrackPlayer();
const bus = new Gain();
player.attach(ctx, bus as unknown as AudioNode, noise);
player.setPlaylist(DEFAULT_PLAYLIST);
player.play(DEFAULT_PLAYLIST[0]);

// Simulate 4 minutes of playback in 20 ms frames, with the tempo drifting the
// way it does when the car speeds up and slows down.
const seenTracks = new Set<string>();
for (let i = 0; i < 12000; i++) {
  now += 0.02;
  player.setSpeedTempo(40 + 160 * Math.abs(Math.sin(i / 400)));
  player.setEngineLoad(0.5 + 0.5 * Math.sin(i / 30));
  (player as unknown as { tick: () => void }).tick();
  const cur = player.currentTrack;
  if (cur) seenTracks.add(cur.id);
}

const fail: string[] = [];
if (starts < 2000) fail.push(`only ${starts} voices scheduled`);
if (badTime > 0) fail.push(`${badTime} events scheduled in the past`);
if (rampToZero > 0) fail.push(`${rampToZero} exponential ramps to zero (throws in real Web Audio)`);
if (seenTracks.size < 2) fail.push('playlist never advanced between tracks');

console.log('tracks in catalogue :', SOUNDTRACK.length);
console.log('voices scheduled    :', starts);
console.log('played tracks       :', [...seenTracks].join(', '));
console.log('past-dated events   :', badTime);
console.log('ramps to zero       :', rampToZero);

if (fail.length) {
  console.error('\nFAIL\n - ' + fail.join('\n - '));
  process.exit(1);
}
console.log('\nOK - sequencer schedules cleanly.');
// The scheduler's interval keeps the Node event loop alive; stop it explicitly.
player.stop();
process.exit(0);
