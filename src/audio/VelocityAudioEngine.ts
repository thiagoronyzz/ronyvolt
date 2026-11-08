import { CameraView, CarSpec, CarTuneSetup, EngineType } from '../types/game';

export interface RadioStationSpec {
  id: string;
  name: string;
  genre: string;
  djName: string;
  bpm: number;
}

export const RADIO_STATIONS: RadioStationSpec[] = [
  { id: 'off', name: 'Rádio Desligado (Puro Motor)', genre: 'Motor Puro', djName: '—', bpm: 0 },
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

  private musicGain: GainNode | null = null;
  private bassAnalyser: AnalyserNode | null = null;
  private customAudioEl: HTMLAudioElement | null = null;
  private customMediaNode: MediaElementAudioSourceNode | null = null;

  private isMuted = false;
  private currentStationId = 'eurobeat';
  private stepTimer: number | null = null;
  private stepIndex = 0;
  private lastThrottle = 0;
  private lastGear = 1;
  private currentEngineType: EngineType = 'i4_econobox';
  private isDemonicIceCream = false;
  private escapamentoFurado = false;

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

    // Music & Bass Analyser for Subwoofer Chassis Shake!
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.25;
    this.bassAnalyser = this.ctx.createAnalyser();
    this.bassAnalyser.fftSize = 64;
    this.musicGain.connect(this.bassAnalyser);
    this.bassAnalyser.connect(this.masterGain);

    this.startRadioSequencer();
  }

  public configureCar(car: CarSpec, tune: CarTuneSetup): void {
    this.currentEngineType = tune.engineSwap ?? car.engineType;
    this.isDemonicIceCream = car.name.includes('Sorvete Demoníaco');
    this.escapamentoFurado = tune.exhaustStyle === 'escapamento_furado';
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
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.05);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setStation(stationId: string): void {
    this.currentStationId = stationId;
    if (this.customAudioEl) {
      if (stationId === 'custom_usb') {
        this.customAudioEl.play().catch(() => {});
      } else {
        this.customAudioEl.pause();
      }
    }
    this.startRadioSequencer();
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

  public getBassEnergy(): number {
    if (!this.bassAnalyser || this.currentStationId === 'off') return 0;
    const arr = new Uint8Array(this.bassAnalyser.frequencyBinCount);
    this.bassAnalyser.getByteFrequencyData(arr);
    const lowSum = (arr[0] + arr[1] + arr[2] + arr[3]) / (4 * 255);
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
  }): void {
    if (!this.ctx || !this.engineGain || !this.oscPrimary || !this.oscHarmonic || !this.oscSub) return;
    const now = this.ctx.currentTime;

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
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.055);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(g).connect(this.masterGain);
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
    osc.connect(g).connect(this.masterGain);
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
    pop.connect(pg).connect(this.masterGain);
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
    osc.connect(g).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public triggerDopplerFlyby(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
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
    osc.connect(g).connect(this.masterGain);
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
      beep.connect(g).connect(this.masterGain);
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
    if (this.currentStationId === 'off' || this.currentStationId === 'custom_usb') return;

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
