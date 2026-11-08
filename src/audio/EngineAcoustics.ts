/**
 * ENGINE ACOUSTICS — firing-order additive synthesis, exhaust resonance,
 * convolution reverb, surface-specific tyre noise and Doppler pass-bys.
 *
 * DIAGNOSIS OF THE v1 ENGINE SOUND
 * --------------------------------
 * v1 used three oscillators whose base frequency was an arbitrary map
 * (`36 + rpmNorm * 185` for a V12, `28 + rpmNorm * 145` for a V8). That is not
 * how an engine radiates sound, and the ear detects the error immediately even
 * when the listener cannot name it:
 *
 *  1. The fundamental of an engine is the *firing frequency*:
 *         f = (rpm / 60) * (cylinders / 2)          [4-stroke]
 *     A V8 at 3000 rpm fires at 200 Hz, an inline-4 at 100 Hz. Pick anything
 *     else and every gear change lands on the wrong pitch, so the car never
 *     "sounds like it pulls".
 *  2. The timbre is a harmonic series of that firing frequency, shaped by the
 *     exhaust and intake resonances. A sawtooth + triangle + sine gives three
 *     fixed partials; a real engine gives 15-20 partials with a load-dependent
 *     spectral tilt. That tilt is why an engine "opens up" on throttle.
 *  3. Cross-plane V8s fire unevenly (two cylinders 90° apart), producing a
 *     strong half-order component: the classic burble. Without it, a V8 sounds
 *     like a 4-cylinder with a lower note.
 *  4. There was no convolution reverb, so a car in a tunnel sounded exactly
 *     like a car in a field. Environments are most of what "being there" means.
 *  5. Tyre noise was a single bandpass at 1350 Hz. Asphalt, gravel, wet and
 *     kerb have entirely different spectra and transient behaviour.
 *  6. No Doppler. A fly-by without pitch shift reads as someone turning a
 *     volume knob down.
 *
 * WHAT THIS MODULE DOES
 * ---------------------
 *  - Firing-frequency oscillator bank with a custom PeriodicWave per engine
 *    architecture (harmonic amplitudes + phase, tuned per cylinder count).
 *  - Half-order oscillator for cross-plane / uneven-fire engines.
 *  - Exhaust path: soft saturation (waveshaper) -> resonant lowpass whose
 *    cutoff tracks throttle and rpm (this is the "opening up" cue) -> body.
 *  - Intake broadband noise gated by throttle, band-limited near the firing
 *    harmonic — the induction roar that dominates at part throttle.
 *  - Procedural convolution impulse response built per environment (tunnel,
 *    canyon, city, open) with early reflections and exponential decay.
 *  - Surface-aware rolling noise and a slip-driven squeal whose pitch rises
 *    with slip velocity (real squeal is a stick-slip oscillation, not noise).
 *  - Doppler pass-by voice with physically-derived approach/recede ratios.
 */

import { EngineType } from '../types/game';

const SPEED_OF_SOUND = 343;

export interface EngineArchitecture {
  cylinders: number;
  /** Uneven firing (cross-plane V8, big-cam V8): excites half-order. */
  crossPlane: boolean;
  /** Relative amplitude of the half-order component. */
  halfOrderGain: number;
  /** Spectral tilt exponent: lower = brighter/more aggressive. */
  harmonicTilt: number;
  /** Exhaust resonance centre as a multiple of firing frequency. */
  exhaustResonanceMul: number;
  /** Overall loudness scale. */
  loudness: number;
  /** Electric drivetrain: no combustion harmonics, only whine + inverter. */
  electric: boolean;
  /** Number of pole pairs, for electric motor whine. */
  polePairs: number;
}

export function engineArchitecture(type: EngineType): EngineArchitecture {
  switch (type) {
    case 'model_t_i4':
      return {
        cylinders: 4,
        crossPlane: false,
        halfOrderGain: 0.12,
        harmonicTilt: 1.35,
        exhaustResonanceMul: 2.2,
        loudness: 0.5,
        electric: false,
        polePairs: 0,
      };
    case 'i4_econobox':
      return {
        cylinders: 4,
        crossPlane: false,
        halfOrderGain: 0.1,
        harmonicTilt: 1.1,
        exhaustResonanceMul: 2.6,
        loudness: 0.55,
        electric: false,
        polePairs: 0,
      };
    case 'i4_vtec_turbo':
      return {
        cylinders: 4,
        crossPlane: false,
        halfOrderGain: 0.16,
        harmonicTilt: 0.86,
        exhaustResonanceMul: 3.1,
        loudness: 0.85,
        electric: false,
        polePairs: 0,
      };
    case 'flat6_gt3':
      return {
        cylinders: 6,
        crossPlane: false,
        halfOrderGain: 0.2,
        harmonicTilt: 0.78,
        exhaustResonanceMul: 3.4,
        loudness: 0.95,
        electric: false,
        polePairs: 0,
      };
    case 'v8_crossplane':
      return {
        cylinders: 8,
        crossPlane: true,
        halfOrderGain: 0.55,
        harmonicTilt: 1.0,
        exhaustResonanceMul: 1.9,
        loudness: 1.05,
        electric: false,
        polePairs: 0,
      };
    case 'v10_screamer':
      return {
        cylinders: 10,
        crossPlane: false,
        halfOrderGain: 0.08,
        harmonicTilt: 0.62,
        exhaustResonanceMul: 4.2,
        loudness: 0.98,
        electric: false,
        polePairs: 0,
      };
    case 'v12_italian':
      return {
        cylinders: 12,
        crossPlane: false,
        halfOrderGain: 0.12,
        harmonicTilt: 0.58,
        exhaustResonanceMul: 4.6,
        loudness: 1.0,
        electric: false,
        polePairs: 0,
      };
    case 'w16_quadturbo':
      return {
        cylinders: 16,
        crossPlane: false,
        halfOrderGain: 0.18,
        harmonicTilt: 0.9,
        exhaustResonanceMul: 2.4,
        loudness: 0.9,
        electric: false,
        polePairs: 0,
      };
    case 'ev_quadmotor':
      return {
        cylinders: 0,
        crossPlane: false,
        halfOrderGain: 0,
        harmonicTilt: 0.4,
        exhaustResonanceMul: 1,
        loudness: 0.55,
        electric: true,
        polePairs: 4,
      };
    case 'rc_brushless':
      return {
        cylinders: 0,
        crossPlane: false,
        halfOrderGain: 0,
        harmonicTilt: 0.35,
        exhaustResonanceMul: 1,
        loudness: 0.42,
        electric: true,
        polePairs: 2,
      };
    case 'steam_boiler':
      return {
        cylinders: 2,
        crossPlane: false,
        halfOrderGain: 0.3,
        harmonicTilt: 1.6,
        exhaustResonanceMul: 1.4,
        loudness: 0.8,
        electric: false,
        polePairs: 0,
      };
    case 'nuclear_turbine':
      return {
        cylinders: 0,
        crossPlane: false,
        halfOrderGain: 0,
        harmonicTilt: 0.3,
        exhaustResonanceMul: 1,
        loudness: 0.7,
        electric: true,
        polePairs: 6,
      };
    default:
      return {
        cylinders: 4,
        crossPlane: false,
        halfOrderGain: 0.12,
        harmonicTilt: 1.0,
        exhaustResonanceMul: 2.6,
        loudness: 0.6,
        electric: false,
        polePairs: 0,
      };
  }
}

/** Firing frequency in Hz for a 4-stroke engine (0 for electric machines). */
export function firingFrequencyHz(rpm: number, architecture: EngineArchitecture): number {
  if (architecture.electric || architecture.cylinders === 0) {
    // Electrical whine: mechanical rpm x pole pairs.
    return Math.max(20, (rpm / 60) * architecture.polePairs);
  }
  return Math.max(8, (rpm / 60) * (architecture.cylinders / 2));
}

/** Harmonic amplitude vector for a PeriodicWave. */
export function harmonicAmplitudes(architecture: EngineArchitecture, harmonics = 24): Float32Array {
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    // Combustion pressure pulses are impulse-like: amplitudes fall ~1/n^tilt but
    // with a resonant boost near the exhaust tuning order.
    const base = 1 / Math.pow(n, architecture.harmonicTilt);
    const resonance = Math.exp(-Math.pow(n - architecture.exhaustResonanceMul, 2) / 2.2) * 0.55;
    imag[n] = base + resonance;
  }
  return imag;
}

/**
 * Doppler pitch ratio for a source approaching (positive relative velocity) or
 * receding. This is the exact non-relativistic formula, not a stylistic ramp.
 */
export function dopplerRatio(relativeVelocityMs: number): number {
  // f_obs/f_src = c / (c - v) for a source moving toward the listener (v > 0).
  const v = Math.max(-120, Math.min(120, relativeVelocityMs));
  return SPEED_OF_SOUND / (SPEED_OF_SOUND - v);
}

export interface AcousticUpdate {
  rpm: number;
  maxRpm: number;
  throttle: number;
  load: number; // 0..1 engine load (throttle x boost)
  speedKmh: number;
  slip: number; // 0..1+ tyre slip magnitude
  brake: number;
  wetness: number;
  surface: 'asphalt' | 'kerb' | 'grass' | 'gravel' | 'snow' | 'wet';
  cockpit: boolean;
  paused: boolean;
}

export type AcousticEnvironment = 'open' | 'tunnel' | 'canyon' | 'city';

export class EngineAcoustics {
  private ctx: AudioContext;
  private out: GainNode;

  private firingOsc: OscillatorNode;
  private firingGain: GainNode;
  private halfOsc: OscillatorNode;
  private halfGain: GainNode;
  private upperOsc: OscillatorNode;
  private upperGain: GainNode;

  private saturation: WaveShaperNode;
  private exhaustFilter: BiquadFilterNode;
  private exhaustBody: BiquadFilterNode;
  private intakeFilter: BiquadFilterNode;
  private intakeGain: GainNode;
  private intakeNoise: AudioBufferSourceNode;

  private rollFilter: BiquadFilterNode;
  private rollGain: GainNode;
  private squealFilter: BiquadFilterNode;
  private squealGain: GainNode;
  private surfaceNoise: AudioBufferSourceNode;

  private windFilter: BiquadFilterNode;
  private windGain: GainNode;
  private windNoise: AudioBufferSourceNode;

  private dry: GainNode;
  private wet: GainNode;
  private convolver: ConvolverNode;

  private noiseBuffer: AudioBuffer;
  private architecture: EngineArchitecture;
  private currentEnvironment: AcousticEnvironment = 'open';
  private lastThrottle = 0;
  private enabled = true;

  constructor(ctx: AudioContext, destination: AudioNode, engineType: EngineType) {
    this.ctx = ctx;
    this.architecture = engineArchitecture(engineType);
    this.noiseBuffer = this.createNoiseBuffer(3);

    this.out = ctx.createGain();
    this.out.gain.value = 0.9;

    // --- Reverb bus -------------------------------------------------------
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 0.92;
    this.wet.gain.value = 0.08;
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.createImpulseResponse(1.6, 0.35);
    this.dry.connect(this.out);
    this.wet.connect(this.convolver);
    this.convolver.connect(this.out);
    this.out.connect(destination);

    // --- Exhaust chain ----------------------------------------------------
    this.firingOsc = ctx.createOscillator();
    this.firingOsc.type = 'sawtooth';
    this.firingGain = ctx.createGain();
    this.firingGain.gain.value = 0.35;

    this.halfOsc = ctx.createOscillator();
    this.halfOsc.type = 'square';
    this.halfGain = ctx.createGain();
    this.halfGain.gain.value = 0.06;

    this.upperOsc = ctx.createOscillator();
    this.upperOsc.type = 'sawtooth';
    this.upperGain = ctx.createGain();
    this.upperGain.gain.value = 0.05;

    this.saturation = ctx.createWaveShaper();
    this.saturation.curve = this.createSaturationCurve(2.2);
    this.saturation.oversample = '2x';

    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = 'lowpass';
    this.exhaustFilter.frequency.value = 900;
    this.exhaustFilter.Q.value = 3.2;

    this.exhaustBody = ctx.createBiquadFilter();
    this.exhaustBody.type = 'peaking';
    this.exhaustBody.frequency.value = 220;
    this.exhaustBody.Q.value = 1.1;
    this.exhaustBody.gain.value = 5;

    this.firingOsc.connect(this.firingGain).connect(this.saturation);
    this.halfOsc.connect(this.halfGain).connect(this.saturation);
    this.upperOsc.connect(this.upperGain).connect(this.saturation);
    this.saturation.connect(this.exhaustFilter);
    this.exhaustFilter.connect(this.exhaustBody);
    this.exhaustBody.connect(this.dry);
    this.exhaustBody.connect(this.wet);

    // --- Intake -----------------------------------------------------------
    this.intakeNoise = ctx.createBufferSource();
    this.intakeNoise.buffer = this.noiseBuffer;
    this.intakeNoise.loop = true;
    this.intakeFilter = ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.value = 480;
    this.intakeFilter.Q.value = 1.4;
    this.intakeGain = ctx.createGain();
    this.intakeGain.gain.value = 0;
    this.intakeNoise.connect(this.intakeFilter).connect(this.intakeGain);
    this.intakeGain.connect(this.dry);

    // --- Rolling / surface noise -----------------------------------------
    this.surfaceNoise = ctx.createBufferSource();
    this.surfaceNoise.buffer = this.noiseBuffer;
    this.surfaceNoise.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 1100;
    this.rollFilter.Q.value = 0.9;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    this.surfaceNoise.connect(this.rollFilter).connect(this.rollGain);
    this.rollGain.connect(this.dry);

    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 900;
    this.squealFilter.Q.value = 11;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.surfaceNoise.connect(this.squealFilter).connect(this.squealGain);
    this.squealGain.connect(this.dry);
    this.squealGain.connect(this.wet);

    // --- Wind -------------------------------------------------------------
    this.windNoise = ctx.createBufferSource();
    this.windNoise.buffer = this.noiseBuffer;
    this.windNoise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windNoise.connect(this.windFilter).connect(this.windGain);
    this.windGain.connect(this.dry);

    this.firingOsc.start();
    this.halfOsc.start();
    this.upperOsc.start();
    this.intakeNoise.start();
    this.surfaceNoise.start();
    this.windNoise.start();

    this.applyArchitecture(engineType);
  }

  public setEngine(type: EngineType): void {
    this.architecture = engineArchitecture(type);
    this.applyArchitecture(type);
  }

  private applyArchitecture(type: EngineType): void {
    const arch = this.architecture;
    const imag = harmonicAmplitudes(arch, 24);
    const real = new Float32Array(imag.length);
    if (!arch.electric) {
      const wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
      this.firingOsc.setPeriodicWave(wave);
    } else {
      this.firingOsc.type = 'sine';
    }
    this.halfGain.gain.value = arch.halfOrderGain * 0.35;
    this.upperGain.gain.value = (arch.electric ? 0.02 : 0.09) * arch.loudness;
    this.intakeGain.gain.value = 0;
    void type;
  }

  /** Sets reverb character. Rebuilding the IR is cheap (a few ms). */
  public setEnvironment(env: AcousticEnvironment): void {
    if (env === this.currentEnvironment) return;
    this.currentEnvironment = env;
    const cfg: Record<AcousticEnvironment, { decay: number; early: number; wet: number; damp: number }> = {
      open: { decay: 0.55, early: 0.18, wet: 0.05, damp: 3200 },
      city: { decay: 1.1, early: 0.28, wet: 0.12, damp: 2400 },
      canyon: { decay: 2.0, early: 0.42, wet: 0.2, damp: 1800 },
      tunnel: { decay: 2.8, early: 0.55, wet: 0.3, damp: 1200 },
    };
    const c = cfg[env];
    this.convolver.buffer = this.createImpulseResponse(c.decay, c.early, c.damp);
    this.wet.gain.setTargetAtTime(c.wet, this.ctx.currentTime, 0.2);
    this.dry.gain.setTargetAtTime(1 - c.wet * 0.55, this.ctx.currentTime, 0.2);
  }

  public update(p: AcousticUpdate): void {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    if (p.paused) {
      this.out.gain.setTargetAtTime(0.0, now, 0.12);
      return;
    }
    this.out.gain.setTargetAtTime(0.9, now, 0.08);

    const arch = this.architecture;
    const fFire = firingFrequencyHz(p.rpm, arch);
    const throttle = Math.max(0, Math.min(1, p.throttle));
    const load = Math.max(0, Math.min(1, p.load));

    // --- Pitch ------------------------------------------------------------
    // setTargetAtTime with a short constant avoids zipper noise but is fast
    // enough that gear changes still read as instant.
    this.firingOsc.frequency.setTargetAtTime(fFire, now, 0.012);
    this.halfOsc.frequency.setTargetAtTime(fFire * 0.5, now, 0.012);
    this.upperOsc.frequency.setTargetAtTime(fFire * 2.02, now, 0.012);

    // --- Loudness & brightness -------------------------------------------
    // Closed throttle = engine braking, quieter and darker. The spectral tilt
    // with load is the difference between "revving" and "pulling".
    const idleFloor = 0.055;
    const amp = (idleFloor + throttle * 0.42 + load * 0.16) * arch.loudness;
    this.firingGain.gain.setTargetAtTime(amp, now, 0.03);
    this.halfGain.gain.setTargetAtTime(arch.halfOrderGain * amp * 0.55, now, 0.03);
    this.upperGain.gain.setTargetAtTime(amp * (0.12 + throttle * 0.2), now, 0.03);

    // Exhaust cutoff follows rpm and throttle: at 1000 rpm the engine is a dull
    // thud; at 8000 rpm with the throttle open it is a bright scream.
    const cutoff = 240 + fFire * (2.2 + throttle * 5.5) + load * 900;
    this.exhaustFilter.frequency.setTargetAtTime(Math.min(16000, cutoff), now, 0.05);
    this.exhaustFilter.Q.setTargetAtTime(1.6 + throttle * 2.6, now, 0.05);
    this.exhaustBody.frequency.setTargetAtTime(
      Math.min(1400, Math.max(90, fFire * arch.exhaustResonanceMul)),
      now,
      0.05
    );

    // --- Intake -----------------------------------------------------------
    const intakeLevel = (throttle * 0.055 + load * 0.035) * arch.loudness;
    this.intakeGain.gain.setTargetAtTime(intakeLevel, now, 0.05);
    this.intakeFilter.frequency.setTargetAtTime(
      Math.min(6000, 300 + fFire * 3.5 + throttle * 700),
      now,
      0.06
    );
    this.intakeFilter.Q.setTargetAtTime(0.9 + throttle * 1.4, now, 0.06);

    // --- Surface rolling noise -------------------------------------------
    // Spectrum per surface, with speed as the amplitude driver (rolling noise
    // rises with speed, not with slip).
    const surfaceCfg: Record<AcousticUpdate['surface'], { freq: number; q: number; gain: number }> = {
      asphalt: { freq: 1050, q: 0.75, gain: 0.032 },
      wet: { freq: 2600, q: 0.5, gain: 0.075 },
      kerb: { freq: 420, q: 1.6, gain: 0.06 },
      gravel: { freq: 3200, q: 0.55, gain: 0.1 },
      grass: { freq: 850, q: 0.7, gain: 0.055 },
      snow: { freq: 620, q: 0.45, gain: 0.05 },
    };
    const sc = surfaceCfg[p.surface] ?? surfaceCfg.asphalt;
    const speedNorm = Math.min(1, p.speedKmh / 220);
    this.rollFilter.frequency.setTargetAtTime(sc.freq * (0.8 + speedNorm * 0.6), now, 0.08);
    this.rollFilter.Q.setTargetAtTime(sc.q, now, 0.08);
    this.rollGain.gain.setTargetAtTime(sc.gain * speedNorm * (1 + p.wetness * 0.8), now, 0.08);

    // --- Squeal -----------------------------------------------------------
    // Real squeal is a stick-slip oscillation whose frequency rises with slip
    // velocity; modelling it as a swept resonant peak rather than "more noise"
    // is what separates a tyre from a hiss.
    const squeal = Math.max(0, Math.min(1, (p.slip - 0.16) * 1.6));
    this.squealGain.gain.setTargetAtTime(squeal * 0.11, now, 0.05);
    this.squealFilter.frequency.setTargetAtTime(
      680 + Math.min(1100, p.slip * 620) + speedNorm * 180,
      now,
      0.06
    );
    this.squealFilter.Q.setTargetAtTime(9 + squeal * 8, now, 0.06);

    // --- Wind -------------------------------------------------------------
    // Aerodynamic noise ~ v^2.7 in practice (turbulent boundary layer), not v^2.
    const windNorm = Math.pow(Math.min(1, p.speedKmh / 340), 2.7);
    this.windGain.gain.setTargetAtTime(windNorm * 0.075, now, 0.12);
    this.windFilter.frequency.setTargetAtTime(420 + windNorm * 2400, now, 0.15);

    // --- Cabin ------------------------------------------------------------
    // In the cockpit the high orders are absorbed by trim and the driver hears
    // mostly the 100-300 Hz body. Outside, the full spectrum is audible.
    const cabinCut = p.cockpit ? 1500 : 16000;
    this.dry.gain.setTargetAtTime(p.cockpit ? 0.62 : 0.92, now, 0.15);
    this.exhaustFilter.frequency.setTargetAtTime(
      Math.min(cabinCut, cutoff),
      now,
      0.08
    );

    // Lift-off overrun: unburnt fuel ignites in the hot exhaust. Fast decay
    // transient, not a loop.
    if (this.lastThrottle > 0.55 && throttle < 0.12 && p.rpm > p.maxRpm * 0.45) {
      this.triggerOverrunPop(p.rpm / p.maxRpm);
    }
    this.lastThrottle = throttle;
  }

  /** Gear shift: torque cut + mechanical clack, pitched by the new gear. */
  public triggerShift(gear: number): void {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 240 + Math.min(6, Math.abs(gear)) * 55;
    filter.Q.value = 2.2;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.05);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.07);
    osc.connect(filter).connect(g).connect(this.dry);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  private triggerOverrunPop(rpmNorm: number): void {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380 + rpmNorm * 900;
    bp.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(bp).connect(g).connect(this.dry);
    src.connect(g);
    src.start(now, Math.random() * 2, 0.1);
  }

  /**
   * Doppler pass-by for a car overtaking the listener.
   *
   * The pitch ratio comes from c/(c ± v) using the *relative* speed, so a
   * 300 km/h prototype shifts ~25% — which is why real pass-bys sound so
   * violent compared to the "fade out" most games use.
   */
  public passBy(relativeSpeedMs: number, pan = 0): void {
    const now = this.ctx.currentTime;
    const f0 = Math.max(60, firingFrequencyHz(6000, this.architecture));
    const approach = dopplerRatio(Math.abs(relativeSpeedMs));
    const recede = dopplerRatio(-Math.abs(relativeSpeedMs));

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4200;
    filter.Q.value = 1.2;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    osc.frequency.setValueAtTime(f0 * approach, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * recede, now + 0.9);

    // Distance attenuation: inverse-square-ish, with a short plateau at the
    // closest point. A linear fade is instantly recognisable as fake.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    osc.connect(filter).connect(panner).connect(gain);
    gain.connect(this.dry);
    gain.connect(this.wet);
    osc.start(now);
    osc.stop(now + 1.05);
  }

  public setMuted(muted: boolean): void {
    this.enabled = !muted;
    if (muted) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  public dispose(): void {
    try {
      this.firingOsc.stop();
      this.halfOsc.stop();
      this.upperOsc.stop();
      this.intakeNoise.stop();
      this.surfaceNoise.stop();
      this.windNoise.stop();
      this.out.disconnect();
    } catch {
      /* already stopped */
    }
  }

  // --- DSP helpers ---------------------------------------------------------

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Pink-ish noise via a simple one-pole lowpass on white noise. Pink noise is
    // a much better match for wind and rolling noise than white (which hisses).
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
    }
    return buf;
  }

  private createSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 4096;
    const curve = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      // Asymmetric soft clip: exhaust is a pressure wave, and its positive and
      // negative halves do not saturate symmetrically. That asymmetry generates
      // the even-order harmonics which give an engine its "growl".
      const bias = 0.18;
      curve[i] = Math.tanh((x + bias) * amount) - Math.tanh(bias * amount);
    }
    return curve;
  }

  private createImpulseResponse(decaySec: number, earlyStrength: number, dampingHz = 2400): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * decaySec));
    const buf = this.ctx.createBuffer(2, len, rate);
    // Early reflections at physically plausible delays for a 40-80 m space.
    const earlyDelays = [0.011, 0.019, 0.031, 0.047, 0.061].map((d) => Math.floor(d * rate));
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      const damp = Math.min(0.5, dampingHz / rate);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Exponentially decaying noise, spectrally darkened over time (air and
        // surface absorption are frequency dependent — high frequencies die first).
        const decay = Math.pow(1 - t, 2.4);
        const n = (Math.random() * 2 - 1) * decay;
        lp += (n - lp) * damp;
        data[i] = lp * 0.6;
      }
      for (const d of earlyDelays) {
        const idx = d + (ch === 0 ? 0 : 37);
        if (idx < len) data[idx] += earlyStrength * (Math.random() * 0.6 + 0.4);
      }
    }
    return buf;
  }
}
