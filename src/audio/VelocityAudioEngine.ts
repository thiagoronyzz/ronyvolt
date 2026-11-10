import { CameraView, CarSpec, CarTuneSetup, EngineType } from '../types/game';
import { AcousticEnvironment, EngineAcoustics } from './EngineAcoustics';
import { soundtrackPlayer } from './SoundtrackPlayer';
import { DEFAULT_PLAYLIST } from './Soundtrack';
import { customMusicPlayer } from './CustomMusicPlayer';

export interface RadioStationSpec {
  id: string;
  name: string;
  genre: string;
  djName: string;
  bpm: number;
}

export const RADIO_STATIONS: RadioStationSpec[] = [
  { id: 'off', name: 'Rádio Desligado (Puro Motor)', genre: 'Motor Puro', djName: '—', bpm: 0 },
  { id: 'soundtrack', name: 'TRILHA VELOCITY (ORIGINAL)', genre: 'Trilha Original do Jogo', djName: 'Velocity Studio', bpm: 128 },
  { id: 'eurobeat', name: '98.6 TOUGE EUROBEAT FM', genre: 'Eurobeat / Drift', djName: 'DJ Takumi', bpm: 158 },
  { id: 'bossa_mpb', name: '101.4 IPANEMA BOSSA & MPB', genre: 'Bossa Nova / Tom Digital', djName: 'DJ Vinícius', bpm: 112 },
  { id: 'synthwave', name: '2099 NEO TOKYO SYNTH FM', genre: 'Synthwave / Outrun', djName: 'AI Kusanagi', bpm: 124 },
  { id: 'dnb', name: '174 NITRO DRUM & BASS', genre: 'Neurofunk / Breakbeat', djName: 'MC Apex', bpm: 172 },
  { id: 'revolt_chip', name: '1999 RE-VOLT SYMPHONY', genre: 'Chiptune + Orquestra', djName: 'Tio Volt', bpm: 142 },
  { id: 'rock_metal', name: '66.6 V8 HEAVY GARAGE', genre: 'Rock / Heavy Riff', djName: 'Mad Rusty', bpm: 136 },
  { id: 'custom_usb', name: 'PEN-DRIVE / SOM AUTOMOTIVO MP3', genre: 'Suas Músicas Importadas', djName: 'Seu Pen-Drive', bpm: 128 },
];

export class VelocityAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private cabinFilter: BiquadFilterNode | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;
  private tireNoiseGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  // Track ambience: crowd murmur + wind, both independent of the engine voice.
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private ambienceWindGain: GainNode | null = null;
  private crowdExcitement = 0;

  private musicGain: GainNode | null = null;
  private bassAnalyser: AnalyserNode | null = null;
  // Independent buses so the player can balance engine / SFX / soundtrack /
  // imported MP3s separately (Settings → Áudio).
  private engineBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private customGain: GainNode | null = null;
  private engineVolume = 1;
  private sfxVolume = 1;
  private customVolume = 0.8;
  private masterVolume = 1;
  private menuPaused = false;
  private musicPausedByMenu = false;
  private wasSoundtrackPlaying = false;
  private wasCustomPlaying = false;
  private customAudioEl: HTMLAudioElement | null = null;
  private customMediaNode: MediaElementAudioSourceNode | null = null;

  private isMuted = false;
  private currentStationId = 'soundtrack';
  private stepTimer: number | null = null;
  private stepIndex = 0;
  private lastThrottle = 0;
  private lastGear = 1;
  private currentEngineType: EngineType = 'i4_econobox';
  private isDemonicIceCream = false;
  private escapamentoFurado = false;
  private acoustics: EngineAcoustics | null = null;
  private currentSurface: 'asphalt' | 'kerb' | 'grass' | 'gravel' | 'snow' | 'wet' = 'asphalt';
  private currentWetness = 0;

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.42;
    this.masterGain.connect(this.ctx.destination);

    // Cabin / Environment filter
    this.cabinFilter = this.ctx.createBiquadFilter();
    this.cabinFilter.type = 'lowpass';
    this.cabinFilter.frequency.value = 4800;
    this.cabinFilter.connect(this.masterGain);

    // Engine bank
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineGain.connect(this.cabinFilter);

    this.oscPrimary = this.ctx.createOscillator();
    this.oscHarmonic = this.ctx.createOscillator();
    this.oscSub = this.ctx.createOscillator();

    this.oscPrimary.type = 'sawtooth';
    this.oscHarmonic.type = 'triangle';
    this.oscSub.type = 'sine';

    const g1 = this.ctx.createGain();
    g1.gain.value = 0.45;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.3;
    const gSub = this.ctx.createGain();
    gSub.gain.value = 0.4;

    this.oscPrimary.connect(g1).connect(this.engineGain);
    this.oscHarmonic.connect(g2).connect(this.engineGain);
    this.oscSub.connect(gSub).connect(this.engineGain);

    this.oscPrimary.start();
    this.oscHarmonic.start();
    this.oscSub.start();

    // Turbo spool oscillator
    this.turboOsc = this.ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.value = 1800;
    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turboOsc.connect(this.turboGain).connect(this.cabinFilter);
    this.turboOsc.start();

    // White noise buffer for tire screech & aerodynamic wind
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const tireNoise = this.ctx.createBufferSource();
    tireNoise.buffer = noiseBuffer;
    tireNoise.loop = true;
    const tireBand = this.ctx.createBiquadFilter();
    tireBand.type = 'bandpass';
    tireBand.frequency.value = 1350;
    tireBand.Q.value = 4.5;
    this.tireNoiseGain = this.ctx.createGain();
    this.tireNoiseGain.gain.value = 0;
    tireNoise.connect(tireBand).connect(this.tireNoiseGain).connect(this.masterGain);
    tireNoise.start();

    const windNoise = this.ctx.createBufferSource();
    windNoise.buffer = noiseBuffer;
    windNoise.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 1.1;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    windNoise.connect(windFilter).connect(this.windGain).connect(this.masterGain);
    windNoise.start();

    // ---- Track ambience: crowd + wind -------------------------------------
    // Two filtered noise layers under everything else. The crowd rises with
    // speed and with overtakes/crashes (cheer()), the wind follows speed — the
    // two things a TV broadcast of a race never lacks.
    const crowdNoise = this.ctx.createBufferSource();
    crowdNoise.buffer = noiseBuffer;
    crowdNoise.loop = true;
    this.crowdFilter = this.ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.frequency.value = 700;
    this.crowdFilter.Q.value = 0.8;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0;
    crowdNoise.connect(this.crowdFilter).connect(this.crowdGain).connect(this.masterGain);
    crowdNoise.start();

    const ambWind = this.ctx.createBufferSource();
    ambWind.buffer = noiseBuffer;
    ambWind.loop = true;
    const ambWindFilter = this.ctx.createBiquadFilter();
    ambWindFilter.type = 'highpass';
    ambWindFilter.frequency.value = 900;
    this.ambienceWindGain = this.ctx.createGain();
    this.ambienceWindGain.gain.value = 0;
    ambWind.connect(ambWindFilter).connect(this.ambienceWindGain).connect(this.masterGain);
    ambWind.start();

    // Independent buses: engine, SFX, soundtrack synth, imported MP3s.
    this.engineBus = this.ctx.createGain();
    this.engineBus.gain.value = this.engineVolume;
    this.engineBus.connect(this.masterGain);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.masterGain);

    // Music & Bass Analyser for Subwoofer Chassis Shake!
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.25;
    this.bassAnalyser = this.ctx.createAnalyser();
    this.bassAnalyser.fftSize = 64;
    this.musicGain.connect(this.bassAnalyser);
    this.bassAnalyser.connect(this.masterGain);

    // Imported MP3s: own gain (own volume), tapped into the same analyser so
    // the subwoofer chassis-shake easter egg reacts to the player's music too.
    this.customGain = this.ctx.createGain();
    this.customGain.gain.value = this.customVolume;
    this.customGain.connect(this.bassAnalyser);
    customMusicPlayer.attach(this.ctx, this.customGain);
    customMusicPlayer.setVolume(this.customVolume);

    // Original soundtrack: a real sequencer with a look-ahead scheduler, its own
    // per-instrument envelopes and a side-chain duck. It plays through the same
    // music bus, so the bass analyser (and the chassis-shake easter egg) still
    // see it.
    const firstAttach = !soundtrackPlayer.isAttached;
    soundtrackPlayer.attach(this.ctx, this.musicGain, noiseBuffer);
    if (firstAttach) soundtrackPlayer.setPlaylist(DEFAULT_PLAYLIST);
    if (this.currentStationId === 'soundtrack') soundtrackPlayer.ensurePlaying();

    // Firing-order acoustic model replaces the three-oscillator bank below.
    // The old bank is kept instantiated (it is referenced by other features)
    // but its gain stays at zero: two engine sounds layered is worse than one.
    // Engine voice goes through engineBus so its volume is independent.
    this.acoustics = new EngineAcoustics(this.ctx, this.engineBus ?? this.masterGain, this.currentEngineType);

  }

  public setAcousticEnvironment(env: AcousticEnvironment): void {
    this.acoustics?.setEnvironment(env);
  }

  public setSurface(surfaceName: string, wetness: number): void {
    this.currentWetness = wetness;
    if (wetness > 0.45) {
      this.currentSurface = 'wet';
      return;
    }
    if (surfaceName.includes('Grama')) this.currentSurface = 'grass';
    else if (surfaceName.includes('Brita')) this.currentSurface = 'gravel';
    else if (surfaceName.includes('Neve')) this.currentSurface = 'snow';
    else if (surfaceName.includes('Zebra') || surfaceName.includes('Kerb')) this.currentSurface = 'kerb';
    else this.currentSurface = 'asphalt';
  }

  public configureCar(car: CarSpec, tune: CarTuneSetup): void {
    this.currentEngineType = tune.engineSwap ?? car.engineType;
    this.isDemonicIceCream = car.name.includes('Sorvete Demoníaco');
    this.escapamentoFurado = tune.exhaustStyle === 'escapamento_furado';
    this.acoustics?.setEngine(this.currentEngineType);
    if (!this.oscPrimary || !this.oscHarmonic) return;

    if (this.currentEngineType === 'ev_quadmotor' || this.currentEngineType === 'rc_brushless') {
      this.oscPrimary.type = 'sine';
      this.oscHarmonic.type = 'triangle';
    } else if (this.currentEngineType === 'v8_crossplane' || this.escapamentoFurado) {
      this.oscPrimary.type = 'sawtooth';
      this.oscHarmonic.type = 'square';
    } else {
      this.oscPrimary.type = 'sawtooth';
      this.oscHarmonic.type = 'triangle';
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.applyMasterGain();
  }

  /** Overall volume (0..1), independent of mute. */
  public setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    this.applyMasterGain();
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  private applyMasterGain(): void {
    if (!this.masterGain || !this.ctx) return;
    const target = this.isMuted || this.menuPaused ? 0 : 0.42 * this.masterVolume;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  /**
   * Resume the AudioContext. Browsers only allow this from a user gesture, so
   * the app calls it on the first pointer/key event — otherwise the engine,
   * the soundtrack and imported MP3s stay silent until the player happens to
   * press a control that starts audio.
   */
  public unlock(): void {
    if (!this.ctx) {
      this.init();
      return;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // --- Independent volume buses (Settings → Áudio) -------------------------

  public setEngineVolume(v: number): void {
    this.engineVolume = Math.max(0, Math.min(1.5, v));
    if (this.engineBus && this.ctx) {
      this.engineBus.gain.setTargetAtTime(this.engineVolume, this.ctx.currentTime, 0.05);
    }
  }

  public getEngineVolume(): number {
    return this.engineVolume;
  }

  public setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1.5, v));
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setCustomVolume(v: number): void {
    this.customVolume = Math.max(0, Math.min(1, v));
    customMusicPlayer.setVolume(this.customVolume);
  }

  public getCustomVolume(): number {
    return this.customVolume;
  }

  /** Dual-tone horn (buzina): two detuned fundamentals with a fast attack. */
  public horn(): void {
    if (!this.ctx || !this.sfxBus || this.isMuted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    const dur = 0.45;
    for (const freq of [392, 494]) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.055, now + 0.015);
      g.gain.setValueAtTime(0.055, now + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(g).connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Pause everything looping (engine, tires, wind, music). Called from the game
   * pause state machine so a paused race is actually silent, and resumed
   * exactly where it stopped — pausing and unpausing used to leave the engine
   * note and the music bed running under the pause menu.
   */
  /**
   * Track ambience level, called every frame. `crowd` 0..1 is the base murmur
   * (grandstands near the line), `speed` 0..1 adds wind and a little crowd
   * swell as the car passes the crowd at speed.
   */
  public updateAmbience(speedKmh: number, crowdBase = 0.35): void {
    if (!this.ctx || !this.crowdGain || !this.ambienceWindGain) return;
    const now = this.ctx.currentTime;
    const speed = Math.max(0, Math.min(1, speedKmh / 280));
    this.crowdExcitement = Math.max(0, this.crowdExcitement - 0.6 * (1 / 60));
    const crowd = Math.min(1, crowdBase * (0.55 + speed * 0.5) + this.crowdExcitement);
    this.crowdGain.gain.setTargetAtTime(this.isMuted ? 0 : crowd * 0.085, now, 0.25);
    this.ambienceWindGain.gain.setTargetAtTime(this.isMuted ? 0 : speed * speed * 0.05, now, 0.2);
    if (this.crowdFilter) {
      this.crowdFilter.frequency.setTargetAtTime(620 + crowd * 520 + speed * 160, now, 0.3);
    }
  }

  /** Crowd reacts: overtake, crash, drift combo, finish line. */
  public cheer(intensity = 1): void {
    this.crowdExcitement = Math.min(1.2, this.crowdExcitement + 0.35 * intensity);
  }

  public pauseForMenu(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.menuPaused = true;
    // Duck the whole mix instead of stopping nodes: no click, no rebuild cost.
    this.masterGain?.gain.setTargetAtTime(0, now, 0.08);
    this.wasSoundtrackPlaying = soundtrackPlayer.isPlaying;
    soundtrackPlayer.pause();
    this.wasCustomPlaying = customMusicPlayer.getState().playing;
    customMusicPlayer.pause();
    this.musicPausedByMenu = true;
  }

  /**
   * Called from the first real user gesture. If an imported MP3 was requested
   * before the context unlocked, actually start it now — otherwise the player
   * presses play in the garage, hears nothing until the race starts, and
   * concludes the feature is broken.
   */
  public retryPendingCustomPlayback(): void {
    if (this.currentStationId !== 'custom_usb') return;
    customMusicPlayer.resumeIfLoaded();
  }

  public resumeFromMenu(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.menuPaused = false;
    this.applyMasterGain();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicPausedByMenu) {
      if (this.wasCustomPlaying) customMusicPlayer.play();
      else if (this.wasSoundtrackPlaying) soundtrackPlayer.ensurePlaying();
      this.musicPausedByMenu = false;
    }
  }

  public isMenuPaused(): boolean {
    return this.menuPaused;
  }

  /** Which music source is driving the car: synth soundtrack or imported MP3s. */
  public getMusicMode(): 'game' | 'mine' {
    return this.currentStationId === 'custom_usb' ? 'mine' : 'game';
  }

  public setMusicMode(mode: 'game' | 'mine'): void {
    this.setStation(mode === 'mine' ? 'custom_usb' : 'soundtrack');
  }

  public setStation(stationId: string): void {
    // Any gesture from the UI should be enough to unblock audio on browsers
    // that start an AudioContext in the "suspended" state.
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.currentStationId = stationId;
    // Imported MP3s ("Minhas Músicas") play only on the custom_usb station;
    // every other station pauses them so two beds never overlap.
    if (stationId === 'custom_usb') {
      customMusicPlayer.play();
    } else {
      customMusicPlayer.pause();
    }
    // New soundtrack path: `track:<id>` plays one original composition and
    // `soundtrack` plays the player's playlist. The legacy chiptune stations
    // stay available, so nothing that used to work stops working.
    if (stationId === 'off') {
      soundtrackPlayer.stop();
    } else if (stationId === 'soundtrack') {
      soundtrackPlayer.play();
    } else if (stationId.startsWith('track:')) {
      soundtrackPlayer.play(stationId.slice(6));
    } else if (stationId === 'custom_usb') {
      soundtrackPlayer.stop();
    } else {
      // Legacy station: silence the sequenced soundtrack so two beds never
      // overlap, and let the old 16-step sequencer run.
      soundtrackPlayer.stop();
    }
    this.startRadioSequencer();
  }

  /** True when the synth soundtrack is actually sounding right now. */
  public isSoundtrackPlaying(): boolean {
    return this.currentStationId === 'soundtrack' && soundtrackPlayer.isPlaying;
  }

  /** Resume the synth soundtrack where it stopped (no rewind). */
  public resumeSoundtrack(): void {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.currentStationId = 'soundtrack';
    soundtrackPlayer.ensurePlaying();
  }

  /** Pause the synth soundtrack, keeping the position. */
  public pauseSoundtrack(): void {
    soundtrackPlayer.pause();
  }

  /** Playlist controls surfaced by the garage player UI. */
  public setPlaylist(ids: string[]): void {
    soundtrackPlayer.setPlaylist(ids);
    if (this.currentStationId === 'soundtrack') soundtrackPlayer.play();
  }

  public getPlaylist(): string[] {
    return soundtrackPlayer.getPlaylist();
  }

  public soundtrackNext(): string | null {
    soundtrackPlayer.next();
    this.currentStationId = 'soundtrack';
    return soundtrackPlayer.currentTrack?.id ?? null;
  }

  public soundtrackPrevious(): string | null {
    soundtrackPlayer.previous();
    this.currentStationId = 'soundtrack';
    return soundtrackPlayer.currentTrack?.id ?? null;
  }

  public setMusicVolume(v: number): void {
    soundtrackPlayer.setVolume(v);
    if (this.musicGain && this.ctx) {
      // The old sequencer shared this bus; keep it audible but proportional.
      this.musicGain.gain.setTargetAtTime(0.25 * Math.max(0.3, v), this.ctx.currentTime, 0.1);
    }
  }

  public getMusicVolume(): number {
    return soundtrackPlayer.getVolume();
  }

  /** What the soundtrack is playing right now (null when silent). */
  public getNowPlaying(): { id: string; title: string } | null {
    const t = soundtrackPlayer.currentTrack;
    if (!t || !soundtrackPlayer.isPlaying) return null;
    return { id: t.id, title: t.title };
  }

  /**
   * Plays one soundtrack track. Audio needs a user gesture on most browsers,
   * so this is the entry point every UI button should use rather than calling
   * the player directly.
   */
  public playTrack(trackId: string): void {
    if (!this.ctx) {
      this.init();
      if (!this.ctx) return;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.currentStationId = 'soundtrack';
    // Track launched from the list: make it the head of the playlist so
    // "next"/"previous" walk the catalogue from there.
    const rest = soundtrackPlayer.getPlaylist().filter((id) => id !== trackId);
    soundtrackPlayer.setPlaylist([trackId, ...rest]);
    soundtrackPlayer.play(trackId);
  }

  public getStation(): string {
    return this.currentStationId;
  }

  public loadCustomMusicFile(file: File): void {
    this.init();
    if (!this.ctx || !this.musicGain) return;
    const url = URL.createObjectURL(file);
    if (!this.customAudioEl) {
      this.customAudioEl = new Audio();
      this.customAudioEl.loop = true;
      this.customMediaNode = this.ctx.createMediaElementSource(this.customAudioEl);
      this.customMediaNode.connect(this.musicGain);
    }
    this.customAudioEl.src = url;
    this.setStation('custom_usb');
  }

  /**
   * Called every frame by the engine loop: feeds the music side-chain and the
   * subtle tempo-with-speed stretch. Keeping it here means the soundtrack
   * responds to what the car is doing, which is what makes it feel live.
   */
  public updateMusicDynamics(load: number, speedKmh: number): void {
    soundtrackPlayer.setEngineLoad(load);
    soundtrackPlayer.setSpeedTempo(speedKmh);
  }

  private bassData: Uint8Array<ArrayBuffer> | null = null;

  public getBassEnergy(): number {
    if (!this.bassAnalyser || this.currentStationId === 'off') return 0;
    if (!this.bassData || this.bassData.length !== this.bassAnalyser.frequencyBinCount) {
      this.bassData = new Uint8Array(this.bassAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    }
    this.bassAnalyser.getByteFrequencyData(this.bassData);
    const lowSum = (this.bassData[0] + this.bassData[1] + this.bassData[2] + this.bassData[3]) / (4 * 255);
    return lowSum;
  }

  public updateFrame(params: {
    rpm: number;
    maxRpm: number;
    throttle: number;
    speedKmh: number;
    boostPsi: number;
    tireSlip: number;
    cameraView: CameraView;
    isPaused: boolean;
    engineDamaged: boolean;
    brake?: number;
    load?: number;
  }): void {
    if (!this.ctx || !this.engineGain || !this.oscPrimary || !this.oscHarmonic || !this.oscSub) return;
    const now = this.ctx.currentTime;

    // --- Firing-order acoustic model (primary engine voice) ---------------
    if (this.acoustics) {
      const rpmNorm = Math.max(0.05, Math.min(1, params.rpm / Math.max(1000, params.maxRpm)));
      this.acoustics.update({
        rpm: params.rpm,
        maxRpm: params.maxRpm,
        throttle: params.throttle,
        load: params.load ?? params.throttle * (0.55 + rpmNorm * 0.45),
        speedKmh: params.speedKmh,
        slip: params.tireSlip,
        brake: params.brake ?? 0,
        wetness: this.currentWetness,
        surface: this.currentSurface,
        cockpit: params.cameraView === 'cockpit',
        paused: params.isPaused || this.isMuted,
      });
      // Blow-off detection is still handled here because it depends on boost.
      if (this.lastThrottle > 0.65 && params.throttle < 0.15 && params.boostPsi > 6) {
        this.triggerBlowOffAndBackfire();
      }
      this.lastThrottle = params.throttle;
      // Silence the legacy bank explicitly.
      this.engineGain.gain.setTargetAtTime(0, now, 0.05);
      if (this.tireNoiseGain) this.tireNoiseGain.gain.setTargetAtTime(0, now, 0.05);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    if (params.isPaused || this.isMuted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      if (this.tireNoiseGain) this.tireNoiseGain.gain.setTargetAtTime(0, now, 0.06);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    // Base frequency by engine architecture
    const rpmNorm = Math.max(0.08, params.rpm / Math.max(1000, params.maxRpm));
    let baseHz = 36 + rpmNorm * 185;
    let harmonicMult = 2.0;

    switch (this.currentEngineType) {
      case 'model_t_i4':
        baseHz = 18 + rpmNorm * 58 + Math.sin(now * 22) * 3;
        harmonicMult = 1.5;
        break;
      case 'v8_crossplane':
        baseHz = 28 + rpmNorm * 145;
        harmonicMult = 1.5;
        break;
      case 'v10_screamer':
        baseHz = 55 + rpmNorm * 340;
        harmonicMult = 2.5;
        break;
      case 'v12_italian':
        baseHz = 48 + rpmNorm * 290;
        harmonicMult = 3.0;
        break;
      case 'ev_quadmotor':
        baseHz = 110 + rpmNorm * 620;
        harmonicMult = 2.02;
        break;
      case 'rc_brushless':
        baseHz = 190 + rpmNorm * 940;
        harmonicMult = 1.98;
        break;
      case 'nuclear_turbine':
        baseHz = 95 + rpmNorm * 520;
        harmonicMult = 1.41;
        break;
      default:
        baseHz = 38 + rpmNorm * 205;
        harmonicMult = this.escapamentoFurado ? 1.75 : 2.0;
    }

    if (params.engineDamaged) {
      baseHz += Math.sin(now * 37) * 9;
    }

    this.oscPrimary.frequency.setTargetAtTime(baseHz, now, 0.03);
    this.oscHarmonic.frequency.setTargetAtTime(baseHz * harmonicMult, now, 0.03);
    this.oscSub.frequency.setTargetAtTime(baseHz * 0.5, now, 0.03);

    const loadVol = 0.09 + params.throttle * 0.14 + rpmNorm * 0.08 + (this.escapamentoFurado ? 0.07 : 0);
    this.engineGain.gain.setTargetAtTime(loadVol, now, 0.04);

    // Cockpit interior muffling vs exterior crispness
    if (this.cabinFilter) {
      const cutoff = params.cameraView === 'cockpit' ? 1450 : 5800;
      this.cabinFilter.frequency.setTargetAtTime(cutoff, now, 0.08);
    }

    // Turbo spool & Blow-Off Valve (PSSSHHH!) on sudden throttle lift
    if (this.turboOsc && this.turboGain) {
      const boostNorm = Math.max(0, params.boostPsi / 30);
      this.turboOsc.frequency.setTargetAtTime(1600 + boostNorm * 3200, now, 0.05);
      this.turboGain.gain.setTargetAtTime(boostNorm * 0.045, now, 0.05);

      if (this.lastThrottle > 0.65 && params.throttle < 0.15 && params.boostPsi > 6) {
        this.triggerBlowOffAndBackfire();
      }
    }
    this.lastThrottle = params.throttle;

    // Tire screech from Pacejka slip
    if (this.tireNoiseGain) {
      const slipSound = params.speedKmh > 12 && params.tireSlip > 0.18
        ? Math.min(0.18, (params.tireSlip - 0.18) * 0.26)
        : 0;
      this.tireNoiseGain.gain.setTargetAtTime(slipSound, now, 0.04);
    }

    // Wind rush proportional to speed squared
    if (this.windGain) {
      const windLevel = Math.min(0.14, Math.pow(params.speedKmh / 360, 2) * 0.14);
      this.windGain.gain.setTargetAtTime(windLevel, now, 0.08);
    }
  }

  public triggerGearShift(newGear: number): void {
    if (newGear === this.lastGear || !this.ctx || !this.masterGain || this.isMuted) return;
    this.lastGear = newGear;
    this.acoustics?.triggerShift(newGear);
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.055);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(g).connect(this.sfxBus ?? this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public triggerBlowOffAndBackfire(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    // PSSSHHH high-passed burst
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2900, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.18);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(g).connect(this.sfxBus ?? this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);

    // Exhaust pop!
    const pop = this.ctx.createOscillator();
    const pg = this.ctx.createGain();
    pop.type = 'square';
    pop.frequency.setValueAtTime(115, now + 0.08);
    pop.frequency.exponentialRampToValueAtTime(32, now + 0.16);
    pg.gain.setValueAtTime(0.18, now + 0.08);
    pg.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    pop.connect(pg).connect(this.sfxBus ?? this.masterGain);
    pop.start(now + 0.08);
    pop.stop(now + 0.18);
  }

  public triggerCollision(intensity: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140 + intensity * 60, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.24);
    g.gain.setValueAtTime(Math.min(0.35, 0.08 + intensity * 0.22), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g).connect(this.sfxBus ?? this.masterGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public triggerDopplerFlyby(relativeSpeedMs = 30, pan = 0): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    if (this.acoustics) {
      this.acoustics.passBy(relativeSpeedMs, pan);
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    // Classic NNNNEEEEEOOOOUUUUMMM Doppler drop!
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(145, now + 0.45);
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.14, now + 0.18);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
    osc.connect(g).connect(this.sfxBus ?? this.masterGain);
    osc.start(now);
    osc.stop(now + 0.48);
  }

  public speakRadioLine(text: string, lang: string): void {
    if (this.isMuted) return;
    // Short radio walkie-talkie beep
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      const beep = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      beep.frequency.value = 1240;
      g.gain.setValueAtTime(0.05, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      beep.connect(g).connect(this.sfxBus ?? this.masterGain);
      beep.start(now);
      beep.stop(now + 0.08);
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const cleanText = text.replace(/\[.*?\]/g, '').trim();
        const utter = new SpeechSynthesisUtterance(cleanText);
        utter.lang = lang;
        utter.rate = 1.08;
        utter.volume = 0.55;
        window.speechSynthesis.speak(utter);
      } catch {
        // Ignore speech synthesis errors on restricted browsers
      }
    }
  }

  private startRadioSequencer(): void {
    if (this.stepTimer !== null) {
      window.clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    if (
      this.currentStationId === 'off' ||
      this.currentStationId === 'custom_usb' ||
      this.currentStationId === 'soundtrack' ||
      this.currentStationId.startsWith('track:')
    )
      return;

    const station = RADIO_STATIONS.find((s) => s.id === this.currentStationId) ?? RADIO_STATIONS[1];
    const stepMs = Math.round((60000 / station.bpm) / 2);

    this.stepTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.isMuted || this.ctx.state !== 'running') return;
      this.playSequencerStep(this.currentStationId, this.stepIndex++);
    }, stepMs);
  }

  private playSequencerStep(stationId: string, step: number): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;

    // Demonic Ice Cream Truck override Easter Egg!
    if (this.isDemonicIceCream) {
      const creepyNotes = [523.25, 659.25, 783.99, 739.99, 622.25, 493.88, 466.16, 392.0];
      const freq = creepyNotes[step % creepyNotes.length] * (step % 7 === 0 ? 0.94 : 1.0);
      this.playSynthNote(freq, 0.22, 'triangle', 0.12);
      return;
    }

    const s = step % 16;
    if (stationId === 'eurobeat') {
      const bassNotes = [110, 110, 220, 110, 130.8, 130.8, 261.6, 130.8, 146.8, 146.8, 293.6, 146.8, 164.8, 146.8, 130.8, 98];
      this.playSynthNote(bassNotes[s], 0.14, 'sawtooth', 0.13);
      if (s % 2 === 0) {
        const brass = [440, 523.25, 659.25, 587.33, 523.25, 659.25, 783.99, 659.25];
        this.playSynthNote(brass[(s / 2) % 8], 0.16, 'sawtooth', 0.08);
      }
    } else if (stationId === 'bossa_mpb') {
      // Warm nylon-like Bossa Nova groove (Dm9 -> G13 -> Cmaj9 -> A7b13)
      const roots = [146.83, 98.0, 130.81, 110.0];
      const chordIdx = Math.floor((step % 32) / 8);
      if (s === 0 || s === 3 || s === 6 || s === 10 || s === 12) {
        this.playSynthNote(roots[chordIdx], 0.28, 'sine', 0.16);
        this.playSynthNote(roots[chordIdx] * 1.5, 0.22, 'triangle', 0.07);
        this.playSynthNote(roots[chordIdx] * 1.875, 0.22, 'sine', 0.06);
      }
    } else if (stationId === 'synthwave') {
      const arp = [130.81, 164.81, 196.0, 246.94, 261.63, 246.94, 196.0, 164.81];
      this.playSynthNote(arp[s % 8], 0.18, 'sawtooth', 0.09);
      if (s % 4 === 0) this.playSynthNote(65.41, 0.35, 'triangle', 0.18);
    } else if (stationId === 'dnb') {
      if (s === 0 || s === 10) this.playSynthNote(55, 0.18, 'sine', 0.24);
      if (s === 4 || s === 12) this.playSynthNote(185, 0.09, 'square', 0.1);
      if (s === 7 || s === 15) this.playSynthNote(73.4, 0.22, 'sawtooth', 0.12);
    } else if (stationId === 'revolt_chip') {
      const chip = [329.6, 392.0, 493.9, 659.3, 587.3, 493.9, 392.0, 440.0];
      this.playSynthNote(chip[s % 8], 0.11, 'square', 0.09);
      if (s % 4 === 0) this.playSynthNote(chip[s % 8] * 0.5, 0.28, 'triangle', 0.11);
    } else {
      const riff = [82.41, 82.41, 98.0, 82.41, 110.0, 103.8, 98.0, 73.42];
      this.playSynthNote(riff[s % 8], 0.18, 'sawtooth', 0.12);
    }
    void now;
  }

  private playSynthNote(freq: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g).connect(this.musicGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }
}

export const audioEngine = new VelocityAudioEngine();
