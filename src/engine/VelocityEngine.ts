import * as THREE from 'three';
import {
  BotDriverProfile,
  CameraView,
  CarSpec,
  CarTuneSetup,
  CustomTrackData,
  GameMode,
  LiveTelemetryFrame,
  RadioMessage,
  RevoltPowerup,
  SavedPoster,
  TrackSpec,
  WeatherPreset,
} from '../types/game';
import { AssistMode, computeEffectiveCarStats } from './PacejkaPhysics';
import { VehicleDynamicsBody } from './VehicleDynamics';
import { buildCarMesh, BuiltCarRig } from '../cars/CarMeshBuilder';
import { buildTrackWorld, BuiltTrackWorld, resolveTrackForWorld } from '../tracks/TrackBuilder';
import { buildGarageShowroomV2 } from '../tracks/GarageStudio';
import { CAR_CATALOG, createDefaultTuneForCar } from '../data/carCatalog';
import { BOT_ROSTER } from '../data/botRoster';
import { WEATHER_PRESETS } from '../data/weatherCatalog';
import { audioEngine } from '../audio/VelocityAudioEngine';
import { RealismRenderer } from '../render/RealismRenderer';
import {
  applyPhotographicMapsToScene,
  setPhotographicAssetsEnabled as setPhotoAssetsEnabled,
} from '../render/PhotographicAssets';
import { buildRacingLine, RacingLine, RacingLineFollower } from '../ai/RacingLine';
import { computeGridSlots } from './raceGrid';
import { paintGridSlots } from './gridPaint';
import { StartSequence } from './startSequence';
import { resolveContact } from './collision';
import { SHAPE_PRESETS } from '../cars/CarBodyBuilder';
import type { ImpactZone } from './collision';
import { adjustBotSkill } from '../ai/difficulty';
import { chaseBoom, computeChaseRoll, fitVerticalFov, speedFov } from './CameraRig';
import { canSimulate, effectTraits, shouldPauseOnHide } from './GameStateRules';
import { disposeObject3D } from './disposal';

interface BotRacerInstance {
  profile: BotDriverProfile;
  carSpec: CarSpec;
  rig: BuiltCarRig;
  splineProgress: number;
  lap: number;
  speedMs: number;
  laneOffset: number;
  targetLaneOffset: number;
  health: number;
  spinTimer: number;
  emotion: 'calm' | 'furious' | 'nervous' | 'confident' | 'euphoric';
  rivalryScore: number; // > 2 = Rival, < -2 = Ally
  isPolice: boolean;
  sirenGroup?: THREE.Group;
  lastFlybyTime: number;
  headingRad: number;
  follower?: RacingLineFollower;
  stuckTimer: number;
  /** Reaction time after lights-out before the bot launches (FIA ~0.20–0.45 s). */
  startReactionSec: number;
  /** Last time (elapsedSec) this bot's contact with the player dealt damage — rate limiter. */
  lastHitSec: number;
  /** Cached at spawn: recomputing effective stats per frame per bot allocates
   *  thousands of objects per second and shows up as GC stutter. */
  massKg: number;
  maxAccelMs2: number;
}

/** Extra braking distance a bot applies when closing on a slower car ahead. */
function nearestLateralGap(aheadM: number, lateralM: number): number {
  return Math.max(0, (18 - aheadM) * 0.09 + lateralM * 0.05);
}

/** Modes that use the FIA-style standing grid at the front of the field. */
const STANDING_START_MODES: ReadonlySet<string> = new Set([
  'career',
  'quick_race',
  'championship',
  'multiplayer',
  'revolt_legacy',
]);

interface GhostSample {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export interface EngineCallbacks {
  onTelemetry: (frame: LiveTelemetryFrame) => void;
  onRadioMessage: (msg: RadioMessage) => void;
  onRaceFinished: (result: {
    position: number;
    totalRacers: number;
    totalTimeSec: number;
    bestLapSec: number | null;
    driftScore: number;
    stuntScore: number;
    deliveries: number;
  }) => void;
  onSheepDisqualification: () => void;
  /** Fired whenever the pause state changes (Esc/P, HUD button, auto-pause). */
  onPauseChanged?: (paused: boolean) => void;
}

/** Dev-only handle for the browser harness (see src/dev/runtimeDebug.ts). */
let activeEngine: VelocityEngine | null = null;
export function getActiveEngine(): VelocityEngine | null {
  return activeEngine;
}

export class VelocityEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private realism!: RealismRenderer;
  private contactShadows = new Map<THREE.Object3D, THREE.Mesh>();
  private shadowTmp = new THREE.Vector3();

  private animFrameId: number | null = null;
  private lastPerfNow = performance.now();
  private elapsedSec = 0;

  private sceneMode: 'garage' | 'race' = 'garage';
  // Pause state machine: user pause, photo mode and race termination are
  // independent flags. The old single `isPaused` was written by all three
  // systems, so closing photo mode silently unpaused a user pause (and the
  // sheep-DQ pause leaked into the garage).
  private userPaused = false;
  private terminated = false;
  private psxRetroMode = false;
  /** Incremented on every scene build; stale setTimeout callbacks check it. */
  private sessionId = 0;
  private resizeObserver: ResizeObserver | null = null;
  // Quality / accessibility settings (Settings modal).
  private pixelRatioCap = 2;
  private cameraShakeEnabled = true;
  private speedBlurEnabled = true;
  private invertSteering = false;
  private guardrailCooldown = 0;
  private smoothedRoll = 0;
  private snapCameraNextFrame = true;
  private camTmp = new THREE.Vector3();

  // Garage Objects
  private garageTurntable: THREE.Group | null = null;
  private garageRig: BuiltCarRig | null = null;
  private garageOrbitYaw = 0.62;
  private garageOrbitPitch = 0.2;
  // 12.5 m out and 1.9 m up: the whole car in frame with air above the roof.
  // The old 5.4 m orbit put the camera inside the greenhouse, which is why the
  // showroom read as a dashboard shot.
  private garageZoomDist = 9.4;
  private garageFraming = { minDist: 6.6, maxDist: 19, defaultDist: 9.4, targetY: 0.62 };
  private garageDoorsOpen = false;
  private garageHoodOpen = false;
  private garageTrunkOpen = false;
  private garageCfdVisible = false;
  private garageSpotIntensity = 48;
  private garageSkyScratch: THREE.Vector3 | null = null;
  private garageSpots: THREE.SpotLight[] = [];
  private garageFillLights: THREE.Light[] = [];
  private isDraggingOrbit = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Race Objects
  private currentCar: CarSpec = CAR_CATALOG[0];
  private currentTune: CarTuneSetup = createDefaultTuneForCar(CAR_CATALOG[0]);
  private currentTrack!: TrackSpec;
  private currentWeather!: WeatherPreset;
  private currentMode: GameMode = 'quick_race';
  private totalLaps = 3;
  private hourOfDay = 14.5;
  /** Latitude for the solar altitude curve, set from the venue country. */
  private sunLatitudeDeg = 23.5;
  private dynamicTimeSpeed = 0.04; // hours per real second
  private assistMode: AssistMode = 'pro';
  private damageEnabled = true;
  private tireWearEnabled = true;
  private fuelEnabled = true;
  private cameraView: CameraView = 'chase_near';

  private trackWorld: BuiltTrackWorld | null = null;
  private playerRig: BuiltCarRig | null = null;
  private playerBody = new VehicleDynamicsBody(24);
  private bots: BotRacerInstance[] = [];

  /**
   * Static minimap data for the current circuit: centreline in world space
   * (sampled every ~40 m) plus the player's current normalised lap progress.
   * Cheap to read once per frame from React without touching Three.js objects.
   */
  public getMinimapData(): {
    points: { x: number; z: number }[];
    player: { x: number; z: number; heading: number };
    progress: number;
    blips: { x: number; z: number; kind: 'rival' | 'police' }[];
  } | null {
    if (!this.trackWorld || this.sceneMode !== 'race') return null;
    const pts = this.trackWorld.samplePoints;
    const stride = Math.max(1, Math.floor(pts.length / 160));
    const points: { x: number; z: number }[] = [];
    for (let i = 0; i < pts.length; i += stride) points.push({ x: pts[i].x, z: pts[i].z });
    return {
      points,
      player: { x: this.playerBody.x, z: this.playerBody.z, heading: this.playerBody.headingRad },
      progress: Math.max(0, Math.min(1, this.lastSplineProgress)),
      blips: this.bots
        .filter((b) => b.health > 0)
        .slice(0, 12)
        .map((b) => ({
          // The rig root is authoritative: it already includes the lane offset.
          x: b.rig.root.position.x,
          z: b.rig.root.position.z,
          kind: 'rival' as const,
        })),
    };
  }
  private racingLine: RacingLine | null = null;

  // Weather & Smoke Particles
  private precipPoints: THREE.Points | null = null;
  private smokeParticles: { mesh: THREE.Mesh; life: number; vx: number; vy: number; vz: number }[] = [];
  // Pooled particle meshes: geometries/materials are created once and reused,
  // instead of allocating a new SphereGeometry + material per puff (which
  // leaked GPU memory every frame of drifting).
  private smokePool: THREE.Mesh[] = [];
  private smokeGeo = new THREE.SphereGeometry(0.32, 6, 6);
  private sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.35);
  // Pooled particle meshes: geometries/materials are created once and reused,
  // instead of allocating a new SphereGeometry + material per puff (which
  // leaked GPU memory every frame of drifting).

  private activeProjectiles: { mesh: THREE.Mesh; x: number; y: number; z: number; vx: number; vz: number; life: number }[] = [];

  // Ghost Car
  private currentLapRecording: GhostSample[] = [];
  private bestLapRecording: GhostSample[] | null = null;
  private ghostMesh: THREE.Group | null = null;
  private lapFrameCursor = 0;

  // Race Progress & Mode Scores
  private playerLap = 1;
  private lastSplineProgress = 0;
  private lapStartSec = 0;
  private bestLapSec: number | null = null;
  private raceFinished = false;
  private startSequence: StartSequence | null = null;
  private lastLampCount = 0;
  private jumpStartWarned = false;
  /** elapsedSec timestamp of lights-out (race clock), for bot reaction delays. */
  private lightsOutElapsedSec: number | null = null;
  private dragReactionMs: number | null = null;
  private driftScore = 0;
  private driftCombo = 1;
  private stuntScore = 0;
  private airtimeSec = 0;
  private wantedStars = 2;
  private packageIntegrityPct = 100;
  private deliveriesCompleted = 0;
  private activePowerup: RevoltPowerup | null = null;
  private turboStarTimer = 0;
  private shieldTimer = 0;
  private antiTrollWarnings = 0;
  private slowdownPenaltyTimer = 0;

  // Photo Mode Camera Override
  private photoModeActive = false;
  private photoOrbitYaw = 0.5;
  private photoOrbitPitch = 0.2;
  private photoDist = 6.5;
  private photoFov = 50;
  private photoRollDeg = 0;

  // Input State
  private keys = new Set<string>();
  private shiftUpQueued = false;
  private shiftDownQueued = false;
  private touchControls = { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false };

  // Telemetry CSV Log
  private telemetryLog: LiveTelemetryFrame[] = [];
  private callbacks: EngineCallbacks;
  private persistentRivalry = new Map<string, number>();

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true, // Required for Photo Mode instant 4K-style snapshot!
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      58,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      2800
    );

    this.realism = new RealismRenderer(this.renderer, this.scene, this.camera);
    if (import.meta.env.DEV && typeof window !== 'undefined') activeEngine = this;

    this.hemiLight = new THREE.HemisphereLight(0x90e0ef, 0x1e2430, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 2.4);
    this.sunLight.position.set(120, 180, 90);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(4096, 4096);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 600;
    const d = 110;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    this.bindEvents();
    // Sync renderer + composer + camera aspect once everything exists, then
    // keep them in sync via ResizeObserver (covers container changes, mobile
    // URL-bar collapse and orientation flips that window resize misses).
    this.handleResize();
    if (typeof ResizeObserver !== 'undefined' && this.container) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }
    this.startLoop();
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointermove', this.handlePointerMove);
    dom.addEventListener('wheel', this.handleWheel, { passive: true });
  }

  private handlePointerDown = (e: PointerEvent): void => {
    audioEngine.init();
    this.isDraggingOrbit = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private handlePointerUp = (): void => { this.isDraggingOrbit = false; };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.isDraggingOrbit) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    if (this.sceneMode === 'garage') {
      this.garageOrbitYaw -= dx * 0.007;
      this.garageOrbitPitch = THREE.MathUtils.clamp(this.garageOrbitPitch + dy * 0.005, 0.02, 0.42);
    } else if (this.photoModeActive) {
      this.photoOrbitYaw -= dx * 0.007;
      this.photoOrbitPitch = THREE.MathUtils.clamp(this.photoOrbitPitch + dy * 0.005, -0.1, 1.35);
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    if (this.sceneMode === 'garage') {
      this.garageZoomDist = THREE.MathUtils.clamp(
        this.garageZoomDist + e.deltaY * 0.006, this.garageFraming.minDist, this.garageFraming.maxDist
      );
    } else if (this.photoModeActive) {
      this.photoDist = THREE.MathUtils.clamp(this.photoDist + e.deltaY * 0.006, 2.0, 35.0);
    }
  };

  private handleBlur = (): void => {
    // Keys held when the window loses focus would otherwise stay "pressed"
    // forever (car accelerating into a wall after alt-tab).
    this.keys.clear();
    this.isDraggingOrbit = false;
    this.touchControls.throttle = 0;
    this.touchControls.brake = 0;
    this.touchControls.steer = 0;
  };

  private handleVisibility = (): void => {
    const pause = shouldPauseOnHide({
      hidden: document.hidden,
      sceneMode: this.sceneMode,
      photoModeActive: this.photoModeActive,
      terminated: this.terminated,
    });
    if (pause) this.setPaused(true);
    // A hidden tab must not keep burning GPU: the render loop checks this.
    if (document.hidden) this.keys.clear();
  };

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // The composer MUST be resized with the renderer. The old handler only
    // resized the canvas, so after any resize the post-processing render
    // target kept the old size and the image was stretched/squashed — the
    // "tela desalinhada/distordida" bug.
    if (this.psxRetroMode) {
      const sw = Math.max(320, Math.floor(w / 3.2));
      const sh = Math.max(240, Math.floor(h / 3.2));
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(sw, sh, false);
      this.renderer.domElement.style.width = `${w}px`;
      this.renderer.domElement.style.height = `${h}px`;
      this.renderer.domElement.style.imageRendering = 'pixelated';
      this.realism.setSize(sw, sh);
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
      this.renderer.setSize(w, h, true);
      this.renderer.domElement.style.imageRendering = 'auto';
      this.realism.setSize(w, h);
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
      return;
    }
    audioEngine.unlock();
    const code = e.code;
    if (code === 'Escape' || code === 'KeyP' || code === 'KeyH' || code === 'KeyR' || code === 'KeyC') {
      // Toggle/horn/recover must not auto-repeat while held.
      if (e.repeat) return;
    }
    this.keys.add(code);

    if (code === 'KeyE') {
      if (this.activePowerup) {
        this.useActivePowerup();
      } else {
        this.shiftUpQueued = true;
      }
    } else if (code === 'KeyQ') {
      this.shiftDownQueued = true;
    } else if (code === 'KeyC' && this.sceneMode === 'race') {
      this.cycleCamera();
    } else if (code === 'KeyR' && this.sceneMode === 'race') {
      this.recoverCarToTrack();
    } else if (code === 'KeyH' && this.sceneMode === 'race') {
      audioEngine.horn();
    } else if ((code === 'Escape' || code === 'KeyP') && this.sceneMode === 'race' && !this.terminated) {
      // Pause from the keyboard must match the HUD button exactly.
      if (!this.photoModeActive) this.setPaused(!this.userPaused);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  public setTouchInput(partial: Partial<typeof this.touchControls>): void {
    audioEngine.init();
    Object.assign(this.touchControls, partial);
  }

  public cycleCamera(): CameraView {
    const order: CameraView[] = [
      'chase_near',
      'chase_far',
      'cockpit',
      'hood',
      'bumper',
      'helicopter',
      'undercar_suspension',
    ];
    const next = order[(order.indexOf(this.cameraView) + 1) % order.length];
    this.cameraView = next;
    // Snap instead of lerping across the car when switching angles.
    this.snapCameraNextFrame = true;
    return next;
  }

  // --- Quality / accessibility settings (Settings modal) -------------------

  public setPixelRatioCap(cap: number): void {
    this.pixelRatioCap = Math.max(1, Math.min(2, cap));
    this.handleResize();
  }

  public setBloomEnabled(enabled: boolean): void {
    this.realism.setBloomEnabled(enabled);
  }

  public setCameraShakeEnabled(enabled: boolean): void {
    this.cameraShakeEnabled = enabled;
  }

  public setSpeedBlurEnabled(enabled: boolean): void {
    this.speedBlurEnabled = enabled;
    if (!enabled) this.realism.setSpeedBlur(0);
  }

  public setInvertSteering(invert: boolean): void {
    this.invertSteering = invert;
  }

  /**
   * Live A/B between the 100% procedural look and the photographic pass.
   * Materials carry both map sets in `userData`, so this swaps them without
   * rebuilding the track, the forest or the car rig. The sky shader and the
   * PMREM environment read the same global flag on the next `updateSky()`.
   */
  public setPhotographicAssetsEnabled(enabled: boolean): void {
    setPhotoAssetsEnabled(enabled);
    applyPhotographicMapsToScene(this.scene, enabled);
  }

  public isPausedNow(): boolean {
    return this.userPaused;
  }

  public getCameraView(): CameraView {
    return this.cameraView;
  }

  public setPsxRetroMode(enabled: boolean): void {
    this.psxRetroMode = enabled;
    this.handleResize();
  }

  // --- GARAGE MODE ---
  public enterGarage(params: {
    car: CarSpec;
    tune: CarTuneSetup;
    garageTier: 1 | 2 | 3;
    trophyCount: number;
    posters: SavedPoster[];
  }): void {
    this.setPaused(false);
    this.sceneMode = 'garage';
    this.photoModeActive = false;
    this.userPaused = false;
    this.terminated = false;
    this.sessionId++;
    this.snapCameraNextFrame = true;
    this.currentCar = params.car;
    this.currentTune = params.tune;
    audioEngine.configureCar(params.car, params.tune);

    this.clearDynamicScene();
    // No coloured void behind the wall: the hall encloses the shot, and fog is
    // only a whisper so the far wall does not dissolve into the background.
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(0x1a2029, 0.0075);
    this.hemiLight.intensity = 0.0;
    this.sunLight.intensity = 0.0;

    const built = buildGarageShowroomV2(params.garageTier, params.trophyCount, params.posters);
    this.scene.add(built.group);
    this.garageTurntable = built.turntable;
    this.garageSpots = built.spotLights;
    this.garageFillLights = built.fillLights;
    this.garageFraming = built.framing;
    this.garageZoomDist = THREE.MathUtils.clamp(
      this.garageZoomDist,
      built.framing.minDist,
      built.framing.maxDist
    );

    // Indoor air: a neutral bounce so the hall reads as a lit room, and a very
    // light fog so the far wall sits back without dissolving.
    this.realism.setSkyOverride({ zenith: 0x2c3440, horizon: 0x6b7482, sun: 0xdfe8f5, sunIntensity: 0.55 });
    this.realism.setFogOverride({ color: 0x1b222b, density: 0.009 });

    this.garageRig = buildCarMesh(params.car, params.tune);
    // Sits on the 11 cm plinth, so the tyres touch its top surface.
    // The car sits on the plinth, not through it: the plinth surface is at
    // y = 0.11, and the rig's own origin is the ground line, so the offset is
    // the plinth height plus the tyre sink. Leaving it at 0.115 put the wheels
    // 5 mm *into* the disc, and the contact shadow then read as a floating car.
    this.garageRig.root.position.y = 0.112;
    this.garageTurntable.add(this.garageRig.root);

    // Mercedes 300SL Gullwing automatic door presentation Easter Egg!
    if (params.car.id === 'mercedes-300sl-gullwing') {
      this.garageDoorsOpen = true;
    }
  }

  public setGarageInteractiveState(opts: {
    doorsOpen?: boolean;
    hoodOpen?: boolean;
    trunkOpen?: boolean;
    cfdVisible?: boolean;
    spotIntensity?: number;
  }): void {
    if (opts.doorsOpen !== undefined) this.garageDoorsOpen = opts.doorsOpen;
    if (opts.hoodOpen !== undefined) this.garageHoodOpen = opts.hoodOpen;
    if (opts.trunkOpen !== undefined) this.garageTrunkOpen = opts.trunkOpen;
    if (opts.cfdVisible !== undefined) this.garageCfdVisible = opts.cfdVisible;
    if (opts.spotIntensity !== undefined) {
      // The slider is a dimmer in watts over the studio rig: scale from its
      // built-in intensities so the lighting keeps its designed ratios instead
      // of every light jumping to the same raw number.
      this.garageSpotIntensity = opts.spotIntensity;
      const k = opts.spotIntensity / 48;
      this.garageSpots.forEach((s, i) => {
        const base = [60, 46, 30][i] ?? 40;
        s.intensity = base * k;
      });
      this.garageFillLights.forEach((l) => {
        l.intensity = (l instanceof THREE.HemisphereLight ? 0.45 : 8) * Math.max(0.15, k);
      });
    }
  }

  public revEngineInGarage(): void {
    audioEngine.init();
    this.playerBody.rpm = computeEffectiveCarStats(this.currentCar, this.currentTune).maxRpm * 0.85;
    this.playerBody.backfireTimer = 0.35;
    audioEngine.triggerBlowOffAndBackfire();
  }

  // --- START RACE / PLAYABLE 3D SESSION ---
  public startRace(config: {
    car: CarSpec;
    tune: CarTuneSetup;
    track: TrackSpec;
    weather: WeatherPreset;
    mode: GameMode;
    laps: number;
    botCount: number;
    botDifficulty: number; // 1..10
    hourOfDay: number;
    assistMode: AssistMode;
    damageEnabled: boolean;
    tireWearEnabled: boolean;
    fuelEnabled: boolean;
    layoutVariant?: 'GP' | 'National' | 'Sprint';
    customTrack?: CustomTrackData | null;
  }): void {
    const track = resolveTrackForWorld(config.track, config.customTrack);
    audioEngine.init();
    this.setPaused(false);
    this.sceneMode = 'race';
    this.userPaused = false;
    this.terminated = false;
    this.photoModeActive = false;
    this.sessionId++;
    this.snapCameraNextFrame = true;
    this.guardrailCooldown = 0;
    this.smoothedRoll = 0;
    this.raceFinished = false;
    this.keys.clear();
    this.shiftUpQueued = false;
    this.shiftDownQueued = false;
    this.touchControls = { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false };

    this.realism.setSkyOverride(null);
    this.realism.setFogOverride(null);
    this.sunLatitudeDeg = latitudeForCountry(track.country);
    this.currentCar = config.car;
    this.currentTune = config.tune;
    this.currentTrack = track;
    this.currentWeather = config.weather;
    this.currentMode = config.mode;
    this.totalLaps = Math.max(1, config.laps);
    this.hourOfDay = config.hourOfDay;
    this.assistMode = config.assistMode;
    this.damageEnabled = config.damageEnabled;
    this.tireWearEnabled = config.tireWearEnabled;
    this.fuelEnabled = config.fuelEnabled;

    audioEngine.configureCar(config.car, config.tune);

    this.clearDynamicScene();
    this.telemetryLog = [];
    this.currentLapRecording = [];
    this.bestLapRecording = null;
    this.lapFrameCursor = 0;

    // Build 3D Circuit & World
    this.trackWorld = buildTrackWorld(
      track,
      config.mode,
      config.layoutVariant ?? 'GP',
      config.customTrack
    );
    this.scene.add(this.trackWorld.group);

    // Place Player on Pole / Grid Slot
    const startPt = this.trackWorld.samplePoints[0];
    const startTan = this.trackWorld.sampleTangents[0];
    const startHeading = Math.atan2(startTan.x, startTan.z);

    this.racingLine = null;
    if (this.trackWorld) {
      // Build the offline-optimised racing line + speed profile. Cached per
      // track/surface: the profile depends on mu, power and downforce, so it is
      // rebuilt whenever those change.
      const stats = computeEffectiveCarStats(config.car, config.tune);
      try {
        this.racingLine = buildRacingLine({
          curve: this.trackWorld.curve,
          roadWidthM: this.trackWorld.roadWidth,
          totalLengthM: this.trackWorld.totalLengthM,
          closed: this.trackWorld.isClosedLoop,
          mu: Math.min(1.35, config.car.baseGrip * config.weather.gripMultiplier),
          massKg: stats.effectiveWeightKg,
          clA: Math.max(0.4, stats.clDownforce) * 2.05,
          powerW: stats.effectiveHp * 745.7,
          brakeMuScale: 1.15,
          gravityG: track.gravityG,
        });
      } catch {
        this.racingLine = null; // fall back to the legacy spline follower
      }
    }

    // ── STANDING-START GRID ─────────────────────────────────────────────
    // Compute the FIA 1×1 staggered grid (slots 8 m apart, pole closest to
    // the line, alternating lanes, pole on the racing-line side when the
    // optimised line is known) and paint the boxes on the asphalt so the
    // formation reads as a real grid instead of an imaginary convoy.
    const standingStart = STANDING_START_MODES.has(config.mode);
    const gridBotCount = config.mode === 'time_trial' ? 0 : config.mode === 'drag' ? 1 : config.botCount;
    // Pole goes on the racing-line side when the optimised line is known.
    const poleLane: 1 | -1 =
      this.racingLine && Math.abs(this.racingLine.samples[0]?.offsetM ?? 0) > 0.4
        ? (this.racingLine.samples[0].offsetM >= 0 ? 1 : -1)
        : 1;
    const gridSlots = standingStart
      ? computeGridSlots({
          botCount: gridBotCount,
          roadWidth: this.trackWorld.roadWidth,
          totalLengthM: this.trackWorld.totalLengthM,
          firstSlotM: 12,
          poleLane,
        })
      : [];
    if (gridSlots.length > 0) {
      const paint = paintGridSlots(
        this.trackWorld.curve,
        this.trackWorld.samplePoints,
        this.trackWorld.totalLengthM,
        this.trackWorld.roadWidth,
        gridSlots
      );
      this.trackWorld.group.add(paint.group);
    }

    this.playerRig = buildCarMesh(config.car, config.tune);
    this.scene.add(this.playerRig.root);
    this.playerBody.resetAt(
      startPt.x,
      startPt.y,
      startPt.z,
      startHeading,
      config.tune,
      config.weather.ambientTempC
    );
    this.playerRig.root.position.set(startPt.x, startPt.y, startPt.z);
    this.playerRig.root.rotation.y = startHeading;

    // Spawn AI Bot Drivers (or Police Cruisers in Police Chase!)
    this.bots = [];
    const actualBots = gridBotCount;
    const candidateCars = CAR_CATALOG.filter((c) => c.category === config.car.category);

    for (let i = 0; i < actualBots; i++) {
      const baseProfile = BOT_ROSTER[(i * 7 + track.seed) % BOT_ROSTER.length];
      const profile = { ...baseProfile, skill: adjustBotSkill(baseProfile.skill, config.botDifficulty) };
      const isPolice = config.mode === 'police_chase';
      const botSpec = isPolice
        ? CAR_CATALOG.find((c) => c.category === 'supercars') ?? config.car
        : candidateCars[i % candidateCars.length] ?? config.car;
      const botTune = createDefaultTuneForCar(botSpec);
      botTune.paintColor = isPolice ? '#111622' : profile.signatureColor;
      if (isPolice) botTune.liveryStripe = 'twin_racing';

      const botRig = buildCarMesh(botSpec, botTune);
      let sirenGroup: THREE.Group | undefined;
      if (isPolice) {
        sirenGroup = new THREE.Group();
        const redBar = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.14, 0.22),
          new THREE.MeshBasicMaterial({ color: 0xff1122 })
        );
        redBar.position.set(-0.24, 1.05, 0);
        const blueBar = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.14, 0.22),
          new THREE.MeshBasicMaterial({ color: 0x0077ff })
        );
        blueBar.position.set(0.24, 1.05, 0);
        sirenGroup.add(redBar, blueBar);
        botRig.chassisGroup.add(sirenGroup);
      }

      const slot = gridSlots[i];
      const startProg =
        config.mode === 'drag'
          ? 0.0
          : slot
            ? slot.progress
            : (0.012 * (i + 1)) % 0.9;
      const laneOff =
        config.mode === 'drag'
          ? 4.2
          : slot
            ? slot.lateralM
            : i % 2 === 0
              ? 3.1
              : -3.1;

      this.scene.add(botRig.root);
      this.bots.push({
        profile,
        carSpec: botSpec,
        rig: botRig,
        splineProgress: startProg,
        lap: 1,
        speedMs: 0,
        laneOffset: laneOff,
        targetLaneOffset: laneOff,
        health: 100,
        spinTimer: 0,
        emotion: 'calm',
        rivalryScore: this.persistentRivalry.get(profile.id) ?? 0,
        isPolice,
        sirenGroup,
        lastFlybyTime: 0,
        headingRad: Math.atan2(this.trackWorld!.curve.getTangentAt(startProg).x, this.trackWorld!.curve.getTangentAt(startProg).z),
        stuckTimer: 0,
        startReactionSec: 0.22 + Math.random() * 0.24,
        lastHitSec: -10,
        massKg: 0,
        maxAccelMs2: 0,
        follower: this.racingLine
          ? new RacingLineFollower(this.racingLine, {
              skill: profile.skill,
              consistency: profile.consistency,
              aggression: profile.aggression,
              tireManagement: profile.tireManagement,
              seed: i * 137 + track.seed,
            })
          : undefined,
      });
      const bot = this.bots[this.bots.length - 1];
      const botStats = computeEffectiveCarStats(botSpec, botTune);
      bot.massKg = Math.max(300, botStats.effectiveWeightKg);
      bot.maxAccelMs2 = Math.min(
        13,
        (botStats.effectiveTorqueNm * 3.4 * 3.6 * 0.85) / 0.33 / bot.massKg
      );
    }

    // Build Weather Particle Cloud (Rain / Snow / Sand / Sakura / Acid Rain)
    this.buildWeatherParticles(config.weather);
    this.updateAtmosphereAndSky(0);

    // Reverb character per venue: a tunnel and an open circuit must not share
    // the same impulse response.
    const biome = track.biome;
    const env =
      biome.includes('tunnel') || biome.includes('orbital') || biome.includes('submarine')
        ? 'tunnel'
        : biome.includes('neo_tokyo') || biome.includes('london') || biome.includes('sao_paulo') || biome.includes('dubai')
        ? 'city'
        : biome.includes('canyon') || biome.includes('desert') || biome.includes('mars')
        ? 'canyon'
        : 'open';
    audioEngine.setAcousticEnvironment(env);

    // Reset counters
    this.playerLap = 1;
    this.lastSplineProgress = 0;
    this.startSequence = new StartSequence({ lampPairs: 5, lightIntervalSec: 0.9 });
    this.lastLampCount = 0;
    this.jumpStartWarned = false;
    this.lightsOutElapsedSec = null;
    this.lapStartSec = this.elapsedSec + 10.0; // corrected at lights-out
    this.bestLapSec = null;
    this.dragReactionMs = null;
    this.driftScore = 0;
    this.driftCombo = 1;
    this.stuntScore = 0;
    this.airtimeSec = 0;
    this.wantedStars = config.mode === 'police_chase' ? 3 : 0;
    this.packageIntegrityPct = 100;
    this.deliveriesCompleted = 0;
    this.activePowerup = config.mode === 'revolt_legacy' ? 'turbo_star' : null;
    this.turboStarTimer = 0;
    this.shieldTimer = 0;
    this.antiTrollWarnings = 0;
    this.slowdownPenaltyTimer = 0;

    // Opening Radio Callout
    this.emitRadio({
      senderName: 'Direção de Prova FIA-Velocity',
      callsign: 'RACE-CTRL',
      nationality: track.country,
      relation: 'race_control',
      text: `Grid alinhado em ${track.name}! Clima: ${config.weather.name}. Prepare-se para a largada!`,
      lang: 'pt-BR',
    });
  }

  private buildWeatherParticles(weather: WeatherPreset): void {
    if (this.precipPoints) {
      this.scene.remove(this.precipPoints);
      this.precipPoints = null;
    }
    // Rain is delegated to the streak system (camera-following volume, per-drop
    // velocity, motion-blurred line segments). A PointsMaterial cloud of dots
    // always reads as particles, never as water.
    this.realism.updatePrecipitation(this.camera, weather);
    if (weather.precipitationType === 'rain' || weather.precipitationType === 'acid_rain') return;
    if (weather.precipitationType === 'none' || weather.precipitationIntensity <= 0.01) return;

    const count = Math.floor(2200 * weather.precipitationIntensity) + 400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 140;
      positions[i * 3 + 1] = Math.random() * 45;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const colorMap: Record<WeatherPreset['precipitationType'], number> = {
      none: 0xffffff,
      rain: 0xa8dadc,
      snow: 0xffffff,
      hail: 0xe0fbfc,
      sand: 0xe6ccb2,
      dust: 0xee9b00,
      ash: 0xadb5bd,
      sakura: 0xffafcc,
      acid_rain: 0x70e000,
    };

    const mat = new THREE.PointsMaterial({
      color: colorMap[weather.precipitationType],
      size: weather.precipitationType === 'sakura' || weather.precipitationType === 'snow' ? 0.35 : 0.2,
      transparent: true,
      opacity: 0.78,
    });

    this.precipPoints = new THREE.Points(geo, mat);
    this.scene.add(this.precipPoints);
  }

  private updateAtmosphereAndSky(dt: number): void {
    if (!this.currentWeather) return;
    this.hourOfDay = (this.hourOfDay + dt * this.dynamicTimeSpeed) % 24;

    // Solar geometry. A single mechanical series (elevation = sin of the hour
    // angle) is what the old build used, and it has two consequences a
    // photograph would never show: the sun races through twilight in minutes,
    // and it rises due east forever.
    //   - Elevation is now a latitude-derived altitude curve, and the golden
    //     window is where the *sun* is low (not where noon is far away).
    //   - Azimuth swings from north-east at dawn through south at noon to
    //     north-west at dusk, on the northern-hemisphere convention.
    const hourAngle = ((this.hourOfDay - 12) / 24) * Math.PI * 2;
    const latRad = THREE.MathUtils.degToRad(this.sunLatitudeDeg ?? 23);
    const decl = THREE.MathUtils.degToRad(6);
    const sinElev =
      Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle);
    const sunElev = sinElev;
    const azimuth = Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latRad) - Math.tan(decl) * Math.cos(latRad)
    );
    const horizonElev = Math.cos(azimuth) * Math.cos(sunElev);
    const dayFactor = THREE.MathUtils.clamp((sunElev + 0.16) / 0.5, 0.04, 1.0);
    const isGoldenHour = sunElev > -0.02 && sunElev < 0.3;

    const topBase = new THREE.Color(this.currentWeather.skyTopHex);
    const horBase = new THREE.Color(this.currentWeather.skyHorizonHex);
    const nightColor = new THREE.Color(0x040711);

    const skyMix = horBase.clone().lerp(topBase, 0.45).lerp(nightColor, 1 - dayFactor);
    if (isGoldenHour && dayFactor > 0.15) {
      skyMix.lerp(new THREE.Color(0xff7b00), 0.32);
    }

    // Thunderstorm Lightning Flash!
    const lightningFlash =
      this.currentWeather.lightningChance > 0 && Math.random() < this.currentWeather.lightningChance * dt * 0.45;
    if (lightningFlash) {
      skyMix.setHex(0xe0fbfc);
    }

    // Physical sky + image-based lighting. `skyMix` is still used for the fog
    // tint fallback, but the visible sky is now an analytic dome and the
    // environment map is PMREM-filtered from it — this is what gives clearcoat,
    // chrome and glass something real to reflect.
    const sunDir = new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(sunElev),
      Math.max(-0.25, sunElev),
      -horizonElev
    ).normalize();
    this.realism.updateSky(
      {
        weather: this.currentWeather,
        hourOfDay: this.hourOfDay,
        sunDirection: sunDir,
        dayFactor,
        lightning: lightningFlash,
      },
      dt
    );

    // Wet road response: a water film raises clearcoat, drops roughness and
    // boosts the specular response. This is what turns a matte strip into the
    // mirror-like wet asphalt that reads as "it is raining" in a still frame.
    const roadMat = this.trackWorld?.roadMaterial;
    if (roadMat) {
      const wet = this.currentWeather.wetness;
      const targetClearcoat = 0.08 + wet * 0.9;
      const targetRough = 0.78 - wet * 0.46;
      roadMat.clearcoat += (targetClearcoat - roadMat.clearcoat) * Math.min(1, dt * 0.6);
      roadMat.roughness += (targetRough - roadMat.roughness) * Math.min(1, dt * 0.6);
      roadMat.clearcoatRoughness = 0.5 - wet * 0.42;
      // Photographic asphalt is dark bitumen: the real-sky IBL must be damped
      // or the whole strip turns silver under a bright PMREM. Wet roads are
      // allowed to climb back toward a mirror, as real water films do.
      const photoAsphalt = roadMat.userData.photographic === true;
      roadMat.envMapIntensity = (photoAsphalt ? 0.62 : 1.0) + wet * (photoAsphalt ? 0.55 : 0.9);
    }

    this.sunLight.intensity = lightningFlash ? 6.5 : 0.16 + dayFactor * 3.0;
    // Low sun is also *weaker* per unit area (more atmosphere to cross), which
    // is why golden-hour photographs are warm but not blown out. Interpolating
    // the colour with the sun's altitude instead of snapping at a threshold
    // keeps the transition continuous from noon to sunset.
    const warm = THREE.MathUtils.clamp(1 - sunElev / 0.42, 0, 1);
    const sunTint = new THREE.Color(0xfff6e8).lerp(new THREE.Color(0xff9d3d), Math.pow(warm, 1.6));
    if (dayFactor < 0.2) sunTint.lerp(new THREE.Color(0x6488ea), 1 - dayFactor / 0.2);
    this.sunLight.color.copy(sunTint);
    this.hemiLight.color.copy(new THREE.Color(0x9fc3ea).lerp(new THREE.Color(0xffb877), warm * 0.6));
    this.hemiLight.intensity = 0.1 + dayFactor * 0.34;

    if (this.playerRig) {
      // Shadow cascade follows the car, texel-snapped, so the contact shadow
      // does not crawl or blur out at distance.
      this.shadowTmp.set(this.playerBody.x, this.playerBody.y, this.playerBody.z);
      this.realism.updateSunShadow(this.sunLight, this.shadowTmp, 46);
    }
  }

  /** Sky/environment refresh for scenes that don't run the weather update (garage). */
  private updateSkyForFrame(dt: number): void {
    // The garage needs image-based lighting as much as the track: it is where
    // the player looks at paint. Fall back to a clear preset before any race.
    const weather = this.currentWeather ?? WEATHER_PRESETS.find((w) => w.category === 'clear') ?? WEATHER_PRESETS[0];
    if (!weather) return;
    const sunAngle = ((this.hourOfDay - 6) / 24) * Math.PI * 2;
    const sunElev = Math.sin(sunAngle);
    const dayFactor = THREE.MathUtils.clamp((sunElev + 0.18) / 0.55, 0.04, 1.0);
    this.realism.updateSky(
      {
        weather,
        hourOfDay: this.hourOfDay,
        sunDirection: new THREE.Vector3(Math.cos(sunAngle), Math.max(-0.25, sunElev), 0.42).normalize(),
        dayFactor,
        lightning: false,
      },
      dt
    );
  }

  /** Ground-projected contact occlusion under a car. */
  private updateContactShadow(root: THREE.Object3D, widthM: number, lengthM: number): void {
    let shadow = this.contactShadows.get(root);
    if (!shadow) {
      shadow = this.realism.createContactShadow(widthM, lengthM);
      this.contactShadows.set(root, shadow);
      if (this.trackWorld) this.trackWorld.group.add(shadow);
    }
    shadow.position.set(root.position.x, root.position.y + 0.045, root.position.z);
    shadow.rotation.z = -root.rotation.y;
  }

  /**
   * Stuck-car recovery (R). Drops the car on the racing line, facing forwards,
   * at rest — and, crucially, pushes it 0.6 m UP first so it cannot spawn inside
   * the road mesh, which is what made the car look like it was "trapped in the
   * floor" and unresponsive after a bad crash.
   */
  public recoverCarToTrack(): void {
    if (!this.trackWorld) return;
    const nearest = this.trackWorld.sampleNearest(this.playerBody.x, this.playerBody.z);
    const heading = Math.atan2(nearest.tangent.x, nearest.tangent.z);
    // Keep a small safety margin against the guardrail: recovering onto the
    // barrier itself would immediately re-trigger the containment.
    const margin = 0.35;
    this.playerBody.x = nearest.point.x - Math.cos(heading) * 0;
    this.playerBody.z = nearest.point.z - Math.sin(heading) * 0;
    this.playerBody.x += Math.cos(heading) * margin;
    this.playerBody.z += Math.sin(heading) * margin;
    this.playerBody.y = nearest.point.y + 0.02;
    // Zero the internal body-frame velocity too — clearing only vx/vz left
    // the car moving after an "R" reset.
    this.playerBody.resetVelocity();
    this.playerBody.headingRad = heading;
    this.snapCameraNextFrame = true;
  }

  private useActivePowerup(): void {
    if (!this.activePowerup || !this.trackWorld) return;
    const p = this.activePowerup;
    this.activePowerup = null;

    if (p === 'turbo_star') {
      this.turboStarTimer = 5.0;
      audioEngine.triggerBlowOffAndBackfire();
    } else if (p === 'shield_bubble') {
      this.shieldTimer = 8.0;
    } else if (p === 'electro_zap') {
      // Spin nearby bots within 38m!
      for (const b of this.bots) {
        const dist = b.rig.root.position.distanceTo(this.playerRig!.root.position);
        if (dist < 42) {
          b.spinTimer = 2.2;
          b.speedMs *= 0.35;
        }
      }
      audioEngine.triggerCollision(0.7);
    } else if (p === 'oil_slick') {
      const oilMesh = new THREE.Mesh(
        new THREE.CircleGeometry(2.2, 16),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.9 })
      );
      oilMesh.rotation.x = -Math.PI / 2;
      const bx = this.playerBody.x - Math.sin(this.playerBody.headingRad) * 3.5;
      const bz = this.playerBody.z - Math.cos(this.playerBody.headingRad) * 3.5;
      oilMesh.position.set(bx, this.playerBody.y + 0.06, bz);
      this.trackWorld.group.add(oilMesh);
      this.trackWorld.hazards.push({
        kind: 'oil_slick',
        mesh: oilMesh,
        x: bx,
        y: this.playerBody.y,
        z: bz,
        radius: 2.2,
        phase: 0,
        active: true,
      });
    } else if (p === 'firework_rocket' || p === 'water_balloon') {
      const rocketMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 10, 10),
        new THREE.MeshBasicMaterial({ color: p === 'firework_rocket' ? 0xff2a54 : 0x00bbf9 })
      );
      const fx = Math.sin(this.playerBody.headingRad);
      const fz = Math.cos(this.playerBody.headingRad);
      rocketMesh.position.set(this.playerBody.x + fx * 3, this.playerBody.y + 0.7, this.playerBody.z + fz * 3);
      this.scene.add(rocketMesh);
      this.activeProjectiles.push({
        mesh: rocketMesh,
        x: rocketMesh.position.x,
        y: rocketMesh.position.y,
        z: rocketMesh.position.z,
        vx: fx * 85,
        vz: fz * 85,
        life: 3.0,
      });
      audioEngine.triggerBlowOffAndBackfire();
    }
  }

  private emitRadio(params: {
    senderName: string;
    callsign: string;
    nationality: string;
    relation: RadioMessage['relation'];
    text: string;
    lang: string;
  }): void {
    const msg: RadioMessage = {
      id: `${Date.now()}-${Math.random()}`,
      senderName: params.senderName,
      callsign: params.callsign,
      nationality: params.nationality,
      relation: params.relation,
      text: params.text,
      timestamp: performance.now(),
    };
    this.callbacks.onRadioMessage(msg);
    audioEngine.speakRadioLine(params.text, params.lang);
  }

  /**
   * Single entry point for pausing. Audio is handled here so pausing from the
   * keyboard, the HUD button, the pause menu or a hidden tab all behave the
   * same: every looping voice (engine, tires, wind, MP3s, soundtrack) stops on
   * pause and comes back on resume.
   */
  public setPaused(paused: boolean): void {
    const changed = this.userPaused !== paused;
    this.userPaused = paused;
    if (paused) {
      this.touchControls = { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false };
      audioEngine.pauseForMenu();
    } else {
      // Not guarded by `changed`: enterGarage()/startRace() force userPaused to
      // false directly, so the audio engine can be left muted with the flag
      // already false. resumeFromMenu() is idempotent and always restores the
      // master bus. This is the fix for a silent race after a paused session.
      audioEngine.resumeFromMenu();
    }
    if (changed) this.callbacks.onPauseChanged?.(paused);
  }

  public isPaused(): boolean {
    return this.userPaused;
  }

  public setPhotoMode(active: boolean, opts?: { fov?: number; rollDeg?: number; hourOfDay?: number; exposure?: number }): void {
    this.photoModeActive = active;
    if (active) this.touchControls = { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false };
    if (opts?.fov !== undefined) {
      this.photoFov = opts.fov;
      this.camera.fov = opts.fov;
      this.camera.updateProjectionMatrix();
    }
    if (opts?.rollDeg !== undefined) this.photoRollDeg = opts.rollDeg;
    if (opts?.hourOfDay !== undefined) {
      this.hourOfDay = opts.hourOfDay;
      this.updateAtmosphereAndSky(0);
    }
    if (opts?.exposure !== undefined) {
      this.renderer.toneMappingExposure = opts.exposure;
      this.realism.setManualExposure(opts.exposure);
    } else if (!active) {
      this.realism.setManualExposure(null);
    }
    this.realism.setPhotoMode(active, this.photoDist);
  }

  public captureSnapshotDataUrl(): string {
    return this.realism.capturePhoto();
  }

  public exportTelemetryCsv(): string {
    const headers = [
      'timestamp_sec',
      'lap',
      'speed_kmh',
      'rpm',
      'gear',
      'throttle',
      'brake',
      'steering',
      'g_lat',
      'g_long',
      'boost_psi',
      'engine_temp_c',
      'brake_temp_c',
      'fuel_liters',
      'downforce_n',
      'drag_n',
      'fl_temp_c',
      'fr_temp_c',
      'rl_temp_c',
      'rr_temp_c',
      'fl_wear_pct',
    ];
    const rows = this.telemetryLog.map((f) =>
      [
        f.timestampSec.toFixed(2),
        f.lap,
        f.speedKmh.toFixed(1),
        Math.round(f.rpm),
        f.gear,
        f.throttle.toFixed(2),
        f.brake.toFixed(2),
        f.steering.toFixed(2),
        f.gForceLat.toFixed(2),
        f.gForceLong.toFixed(2),
        f.boostPsi.toFixed(1),
        f.engineTempC.toFixed(1),
        f.brakeTempC.toFixed(1),
        f.fuelLiters.toFixed(2),
        Math.round(f.downforceN),
        Math.round(f.dragN),
        f.wheels[0].tempMidC.toFixed(1),
        f.wheels[1].tempMidC.toFixed(1),
        f.wheels[2].tempMidC.toFixed(1),
        f.wheels[3].tempMidC.toFixed(1),
        f.wheels[0].wearPercent.toFixed(1),
      ].join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  private clearDynamicScene(): void {
    const keep = new Set<THREE.Object3D>([this.hemiLight, this.sunLight, this.sunLight.target, this.realism.skyObject]);
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
      const ch = this.scene.children[i];
      if (!keep.has(ch)) {
        this.scene.remove(ch);
        // Dispose GPU resources — without this, every garage/race switch
        // leaked the previous scene's geometries and materials.
        disposeObject3D(ch);
      }
    }
    // Return live particles to the pool instead of dropping them.
    for (const pt of this.smokeParticles) {
      this.scene.remove(pt.mesh);
      this.smokePool.push(pt.mesh);
    }
    for (const r of this.activeProjectiles) {
      this.scene.remove(r.mesh);
      disposeObject3D(r.mesh);
    }
    this.activeProjectiles = [];
    this.precipPoints = null;
    this.ghostMesh = null;
    this.contactShadows.clear();
    // Stale references are a real bug: stepGarage() keeps driving whatever rig
    // it last saw, and enterGarage() only overwrites it after the scene rebuild.
    // Returning from a race to the garage therefore animated the *race* rig for
    // one frame and left its flash/brake materials attached.
    this.garageRig = null;
    this.garageTurntable = null;
    this.playerRig = null;
    this.trackWorld = null;
    this.bots = [];
  }

  private startLoop(): void {
    const tick = (now: number) => {
      this.animFrameId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.lastPerfNow) / 1000);
      this.lastPerfNow = now;
      if (!this.userPaused && !this.photoModeActive && !this.terminated) {
        this.elapsedSec += dt;
      }

      if (this.sceneMode === 'garage') {
        this.stepGarage(dt);
        this.updateSkyForFrame(dt);
      } else {
        this.stepRace(dt);
      }

      this.realism.render(dt);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  private stepGarage(dt: number): void {
    if (this.garageTurntable && !this.isDraggingOrbit) {
      this.garageOrbitYaw += dt * 0.18;
    }
    this.playerBody.rpm = Math.max(900, this.playerBody.rpm - dt * 3600);
    if (this.playerBody.backfireTimer > 0) this.playerBody.backfireTimer -= dt;

    if (this.garageRig) {
      const isNightLight = this.garageSpotIntensity < 25;
      this.garageRig.updateRealtimeVisuals({
        dt,
        speedKmh: 0,
        steering: Math.sin(this.elapsedSec * 0.8) * 0.18,
        wheelSpinRad: 0,
        brakeTempC: 60,
        engineTempC: this.playerBody.rpm > 2500 ? 108 : 85,
        backfireActive: this.playerBody.backfireTimer > 0,
        nitroActive: false,
        doorsOpen: this.garageDoorsOpen,
        hoodOpen: this.garageHoodOpen,
        trunkOpen: this.garageTrunkOpen,
        cfdVisible: this.garageCfdVisible,
        bassEnergy: audioEngine.getBassEnergy(),
        pitchRad: 0,
        rollRad: 0,
        headlightsOn: isNightLight || true,
        shieldActive: false,
        damage: this.playerBody.damage,
      });
    }

    // Garage: the showroom ambience is a low murmur, no crowd swell.
    audioEngine.updateAmbience(0, 0.12);
    audioEngine.updateFrame({
      rpm: this.playerBody.rpm,
      maxRpm: 8000,
      throttle: this.playerBody.rpm > 1400 ? 0.5 : 0,
      speedKmh: 0,
      boostPsi: 0,
      tireSlip: 0,
      cameraView: 'chase_near',
      isPaused: this.playerBody.rpm < 1050,
      engineDamaged: false,
    });

    // Orbit around the car, never through it. The pitch is clamped low enough
    // that the camera cannot rise over the roof and look down into the cabin.
    const targetY = this.garageFraming.targetY;
    const dist = this.garageZoomDist;
    const cx = Math.sin(this.garageOrbitYaw) * Math.cos(this.garageOrbitPitch) * dist;
    const cy = Math.sin(this.garageOrbitPitch) * dist + 0.95;
    const cz = Math.cos(this.garageOrbitYaw) * Math.cos(this.garageOrbitPitch) * dist;
    this.camera.fov = 46;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(0, targetY, 0);
  }

  private stepRace(dt: number): void {
    if (!this.trackWorld || !this.playerRig) return;

    if (this.photoModeActive) {
      const px = this.playerBody.x + Math.sin(this.photoOrbitYaw) * Math.cos(this.photoOrbitPitch) * this.photoDist;
      const py = this.playerBody.y + Math.sin(this.photoOrbitPitch) * this.photoDist + 0.9;
      const pz = this.playerBody.z + Math.cos(this.photoOrbitYaw) * Math.cos(this.photoOrbitPitch) * this.photoDist;
      this.camera.position.set(px, py, pz);
      this.camera.lookAt(this.playerBody.x, this.playerBody.y + 0.65, this.playerBody.z);
      this.camera.rotateZ(THREE.MathUtils.degToRad(this.photoRollDeg));
      audioEngine.updateFrame({
        rpm: 900,
        maxRpm: 7000,
        throttle: 0,
        speedKmh: 0,
        boostPsi: 0,
        tireSlip: 0,
        cameraView: this.cameraView,
        isPaused: true,
        engineDamaged: false,
      });
      return;
    }

    if (this.userPaused || this.terminated) {
      // Paused: the world is frozen, but the camera must keep looking at the
      // car so the pause menu sits over a framed shot instead of a stale one
      // (and so resizing while paused does not leave the car off-frame).
      this.updateRaceCamera(dt, 0);
      audioEngine.updateFrame({
        rpm: 900,
        maxRpm: 7000,
        throttle: 0,
        speedKmh: 0,
        boostPsi: 0,
        tireSlip: 0,
        cameraView: this.cameraView,
        isPaused: true,
        engineDamaged: false,
      });
      return;
    }

    this.updateAtmosphereAndSky(dt);
    const windMs = this.currentWeather.windSpeedKmh / 3.6;
    this.realism.advancePrecipitation(
      dt,
      Math.sin(this.currentWeather.windAngleRad) * windMs,
      Math.cos(this.currentWeather.windAngleRad) * windMs
    );

    // ── FIA START PROCEDURE ──────────────────────────────────────────────
    // Five lamp pairs light one at a time on the gantry, hold for a random
    // 0.2–3.0 s, then extinguish ALL AT ONCE. The cars are released by the
    // sequence — never by a wall-clock countdown.
    if (this.startSequence) {
      const wasLit = this.lastLampCount;
      const lightsOut = this.startSequence.update(dt);
      const lit = this.startSequence.lampsLit;
      if (lit > wasLit) {
        for (let p = wasLit; p < lit; p++) audioEngine.triggerStartLamp(p);
      }
      this.lastLampCount = lit;
      this.updateGantryLamps(lit);
      if (lightsOut) {
        this.lapStartSec = this.elapsedSec;
        this.lightsOutElapsedSec = this.elapsedSec;
        audioEngine.triggerLightsOut();
      }
    }

    // Gather Player Controls (Keyboard + Touch)
    const rawThrottle =
      this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : this.touchControls.throttle;
    const rawBrake =
      this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : this.touchControls.brake;
    const steerLeft = this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0;
    const steerRight = this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0;
    const rawSteerBase = steerLeft - steerRight || -this.touchControls.steer;
    const rawSteer = this.invertSteering ? -rawSteerBase : rawSteerBase;
    const handbrake = this.keys.has('Space') || this.touchControls.handbrake;
    const nitroInput = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchControls.nitro;

    // Drag Reaction Time Measurement
    if (this.currentMode === 'drag' && (this.startSequence?.readyToMove ?? true) && this.dragReactionMs === null && rawThrottle > 0.2) {
      this.dragReactionMs = Math.round(Math.random() * 45 + 95);
    }

    // One source of truth for "may the world move": a paused race, photo mode
    // and the finish line all freeze the car identically, so no input path can
    // sneak movement past the state machine.
    const simAllowed = canSimulate({
      sceneMode: this.sceneMode,
      userPaused: this.userPaused,
      terminated: this.terminated,
      photoModeActive: this.photoModeActive,
    });
    const canMove = simAllowed && (this.startSequence?.readyToMove ?? true) && !this.raceFinished;

    // Jump start: feeding throttle while the five red pairs are lit. FIA
    // penalises this; we warn once, dock stewards' patience and make the
    // player feel it in the radio rather than silently eating the input.
    if (this.startSequence && !this.startSequence.readyToMove && rawThrottle > 0.15 && !this.jumpStartWarned) {
      this.jumpStartWarned = true;
      this.antiTrollWarnings++;
      this.slowdownPenaltyTimer = Math.max(this.slowdownPenaltyTimer, 2.0);
      this.emitRadio({
        senderName: 'Direção de Prova FIA-Velocity',
        callsign: 'RACE-CTRL',
        nationality: this.currentTrack?.country ?? 'FIA',
        relation: 'race_control',
        text: 'JUMP START! Movimentou o carro antes dos cinco pares apagarem. 2s de limitação aplicada!',
        lang: 'pt-BR',
      });
    }
    if (this.slowdownPenaltyTimer > 0) this.slowdownPenaltyTimer = Math.max(0, this.slowdownPenaltyTimer - dt);
    const penaltyCap = this.slowdownPenaltyTimer > 0 ? 0.35 : 1.0;

    // Sample Track Surface & Off-Track Boundaries
    const nearest = this.trackWorld.sampleNearest(this.playerBody.x, this.playerBody.z);
    const halfRoad = this.trackWorld.roadWidth * 0.5;
    const isOffTrack = Math.abs(nearest.lateralOffset) > halfRoad + 1.0;
    let surfaceName = isOffTrack ? 'Grama / Brita Escape' : 'Asfalto Oficial';
    let surfaceGrip = isOffTrack ? this.currentTrack.surfaceGrip * 0.68 : this.currentTrack.surfaceGrip;

    // Check Hazards (Sheep, Potholes, Puddles, Oil Slicks, Powerups, Ramps, Delivery Zones!)
    let onOilSlick = false;
    let onPuddle = false;

    for (const h of this.trackWorld.hazards) {
      if (!h.active) continue;
      const dist = Math.hypot(this.playerBody.x - h.x, this.playerBody.z - h.z);
      if (dist < h.radius + 1.1) {
        if (h.kind === 'sheep') {
          // MANDATORY PRODUCER RULE: Immediate Animal Respect Disqualification!
          this.terminated = true;
          this.callbacks.onSheepDisqualification();
          return;
        } else if (h.kind === 'pothole') {
          this.playerBody.pitchRad += (Math.random() - 0.5) * 0.14;
          audioEngine.triggerCollision(0.35);
          surfaceName = 'Buraco Paulistano!';
        } else if (h.kind === 'puddle') {
          onPuddle = true;
          surfaceName = 'Poça Profunda (Aquaplanagem)';
        } else if (h.kind === 'oil_slick') {
          onOilSlick = true;
          surfaceName = 'Mancha de Óleo!';
        } else if (h.kind === 'powerup') {
          h.active = false;
          h.mesh.visible = false;
          const pool: RevoltPowerup[] = [
            'firework_rocket',
            'turbo_star',
            'electro_zap',
            'oil_slick',
            'shield_bubble',
            'water_balloon',
          ];
          this.activePowerup = pool[Math.floor(Math.random() * pool.length)];
          const sid = this.sessionId;
          window.setTimeout(() => {
            if (sid !== this.sessionId) return; // scene was rebuilt meanwhile
            h.active = true;
            h.mesh.visible = true;
          }, 8000);
        } else if (h.kind === 'ramp') {
          const spd = Math.hypot(this.playerBody.vx, this.playerBody.vz);
          if (spd > 14 && this.playerBody.vy <= 0.5) {
            this.playerBody.vy = Math.min(22, spd * 0.36);
          }
        } else if (h.kind === 'delivery_zone') {
          h.active = false;
          h.mesh.visible = false;
          this.deliveriesCompleted++;
          this.emitRadio({
            senderName: 'Central Crazy Express',
            callsign: 'DISPATCH',
            nationality: 'Brasil',
            relation: 'ally',
            text: `Entrega #${this.deliveriesCompleted} concluída com ${Math.round(this.packageIntegrityPct)}% de integridade! +Bônus!`,
            lang: 'pt-BR',
          });
          const sid2 = this.sessionId;
          window.setTimeout(() => {
            if (sid2 !== this.sessionId) return;
            h.active = true;
            h.mesh.visible = true;
          }, 12000);
        }
      }
    }

    // Slipstream Calculation behind Bots ahead
    let slipstreamFactor = 0;
    for (const b of this.bots) {
      const dx = b.rig.root.position.x - this.playerBody.x;
      const dz = b.rig.root.position.z - this.playerBody.z;
      const d = Math.hypot(dx, dz);
      if (d > 3 && d < 28) {
        const dotFwd =
          (dx / d) * Math.sin(this.playerBody.headingRad) +
          (dz / d) * Math.cos(this.playerBody.headingRad);
        if (dotFwd > 0.92) {
          slipstreamFactor = Math.max(slipstreamFactor, 1 - d / 28);
        }
      }
    }

    if (this.turboStarTimer > 0) this.turboStarTimer = Math.max(0, this.turboStarTimer - dt);
    if (this.shieldTimer > 0) this.shieldTimer = Math.max(0, this.shieldTimer - dt);

    const prevGear = this.playerBody.gear;
    const { speedKmh, maxSlip } = this.playerBody.step({
      dt,
      car: this.currentCar,
      tune: this.currentTune,
      weather: this.currentWeather,
      gravityG: this.currentTrack.gravityG,
      surfaceGrip,
      onOilSlick,
      onPuddle,
      slipstreamFactor,
      throttle: canMove ? rawThrottle * penaltyCap : rawThrottle * 0.25,
      brake: canMove ? rawBrake : 1,
      handbrake,
      steeringInput: rawSteer,
      nitroInput: canMove && nitroInput,
      shiftUpPulse: this.shiftUpQueued,
      shiftDownPulse: this.shiftDownQueued,
      assistMode: this.assistMode,
      damageEnabled: this.damageEnabled && this.shieldTimer <= 0,
      tireWearEnabled: this.tireWearEnabled,
      fuelConsumptionEnabled: this.fuelEnabled,
      turboStarBoost: this.turboStarTimer > 0 ? 1.48 : 1.0,
      gradeSin: nearest.tangent.y,
      allowReverse: canMove,
    });
    this.shiftUpQueued = false;
    this.shiftDownQueued = false;
    audioEngine.triggerGearShift(this.playerBody.gear);
    void prevGear;

    // Vertical Jump / Gravity Physics (Stunts, Ramps, Mars 0.38g, Orbital 0.35g!)
    const groundY = nearest.point.y;
    if (this.playerBody.y > groundY + 0.08 || this.playerBody.vy > 0) {
      this.playerBody.vy -= 9.81 * this.currentTrack.gravityG * dt;
      this.playerBody.y += this.playerBody.vy * dt;
      this.airtimeSec += dt;
      this.stuntScore += Math.round(dt * 420 * (1 / this.currentTrack.gravityG));
      if (this.playerBody.y <= groundY) {
        this.playerBody.y = groundY;
        this.playerBody.vy = 0;
        this.airtimeSec = 0;
      }
    } else {
      this.playerBody.y = THREE.MathUtils.lerp(this.playerBody.y, groundY, Math.min(1, dt * 16));
    }

    // Soft Guardrail Elastic Containment so player never falls into infinite void.
    // Impact damage/sound are rate-limited (the old code applied them every
    // frame while beyond the rail) and the heading is nudged back toward the
    // track tangent so the car cannot get stuck perpendicular to the rail.
    if (this.guardrailCooldown > 0) this.guardrailCooldown = Math.max(0, this.guardrailCooldown - dt);
    const maxAllowedOut = halfRoad + 7.5;
    if (Math.abs(nearest.lateralOffset) > maxAllowedOut && this.currentMode !== 'derby') {
      const rightX = nearest.tangent.z;
      const rightZ = -nearest.tangent.x;
      const sign = Math.sign(nearest.lateralOffset);
      this.playerBody.x = nearest.point.x - rightX * sign * (maxAllowedOut - 0.3);
      this.playerBody.z = nearest.point.z - rightZ * sign * (maxAllowedOut - 0.3);
      this.playerBody.vx *= 0.68;
      this.playerBody.vz *= 0.68;
      const tangentHeading = Math.atan2(nearest.tangent.x, nearest.tangent.z);
      let dh = tangentHeading - this.playerBody.headingRad;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.playerBody.headingRad += dh * 0.35;
      if (this.guardrailCooldown <= 0) {
        this.guardrailCooldown = 0.6;
        this.playerBody.applyImpact(speedKmh * 0.45, sign > 0 ? 'left' : 'right', this.damageEnabled);
        this.packageIntegrityPct = Math.max(0, this.packageIntegrityPct - 4);
        audioEngine.triggerCollision(0.45);
        audioEngine.cheer(0.8); // the crowd loves a wall tap
      }
    }

    // Drop Oil Slick on Track if Player Engine is Leaking Oil!
    if (this.playerBody.damage.oilLeakActive && Math.random() < dt * 0.35) {
      const slick = new THREE.Mesh(
        new THREE.CircleGeometry(1.4, 12),
        new THREE.MeshBasicMaterial({ color: 0x090a0f })
      );
      slick.rotation.x = -Math.PI / 2;
      slick.position.set(this.playerBody.x, this.playerBody.y + 0.055, this.playerBody.z);
      this.trackWorld.group.add(slick);
      this.trackWorld.hazards.push({
        kind: 'oil_slick',
        mesh: slick,
        x: this.playerBody.x,
        y: this.playerBody.y,
        z: this.playerBody.z,
        radius: 1.4,
        phase: 0,
        active: true,
      });
    }

    // Drift Mode Scoring & Judge Voiceover!
    const driftDeg = Math.abs(THREE.MathUtils.radToDeg(this.playerBody.wheels[0].slipAngleRad));
    if (speedKmh > 38 && driftDeg > 11 && !isOffTrack) {
      const pts = Math.round(driftDeg * (speedKmh * 0.08) * dt * 18 * this.driftCombo);
      this.driftScore += pts;
      if (this.driftScore > this.driftCombo * 2500 && this.driftCombo < 8) {
        this.driftCombo++;
        if (this.currentMode === 'drift') {
          this.emitRadio({
            senderName: 'Juiz Oficial D1 Drift',
            callsign: 'JUDGE-D1',
            nationality: 'Japão',
            relation: 'judge',
            text: `INSANE ANGLE!! ${Math.round(driftDeg)}° A ${Math.round(speedKmh)} KM/H! COMBO ${this.driftCombo}X!`,
            lang: 'en-US',
          });
        }
      }
    }

    // Tire Smoke & Rim Sparks Particles (surface-aware: dust off-track,
    // spray in the wet, white smoke on asphalt)!
    if ((maxSlip > 0.28 && speedKmh > 25) || this.playerBody.wheels[0].punctured) {
      const traits = effectTraits(
        onPuddle ? 'asphalt' : isOffTrack ? 'gravel' : 'asphalt',
        onPuddle ? 1 : this.currentWeather.wetness
      );
      this.spawnTireSmokeOrSpark(this.playerBody.wheels[0].punctured, traits.particle);
    }
    // Damaged engine: dark smoke from the hood.
    if (this.playerBody.damage.engineHealth < 55 && Math.random() < dt * 2.2) {
      this.spawnDamageSmoke();
    }
    this.updateParticlesAndDestructibles(dt, speedKmh);

    // Speed blur feed (radial shutter smear in the grade pass).
    if (this.speedBlurEnabled) {
      const blurT = Math.max(0, Math.min(1, (speedKmh - 90) / 220));
      this.realism.setSpeedBlur(blurT * 0.5);
    }

    // Update Player 3D Mesh
    this.playerRig.root.position.set(this.playerBody.x, this.playerBody.y, this.playerBody.z);
    this.playerRig.root.rotation.y = this.playerBody.headingRad;
    this.updateContactShadow(this.playerRig.root, 2.4, 5.2);
    const isNight = this.hourOfDay < 6.3 || this.hourOfDay > 18.2 || this.currentWeather.visibilityFog > 0.005;

    this.playerRig.updateRealtimeVisuals({
      dt,
      speedKmh,
      steering: rawSteer,
      wheelSpinRad: this.playerBody.wheelSpinRad,
      brakeTempC: this.playerBody.brakeTempC,
      engineTempC: this.playerBody.engineTempC,
      backfireActive: this.playerBody.backfireTimer > 0,
      nitroActive: nitroInput && this.playerBody.nitroRemainingKg > 0.05,
      doorsOpen: false,
      hoodOpen: this.playerBody.damage.panelDeform.hood > 0.72,
      trunkOpen: false,
      cfdVisible: false,
      bassEnergy: audioEngine.getBassEnergy(),
      pitchRad: this.playerBody.pitchRad,
      rollRad: this.playerBody.rollRad,
      headlightsOn: isNight,
      shieldActive: this.shieldTimer > 0,
      damage: this.playerBody.damage,
    });

    // Update AI Bots, Rivalry/Ally Collisions & Doppler Pass-By!
    this.stepBots(dt, canMove, rawSteer, speedKmh, isNight);

    // Update Ghost Car Recording & Playback
    this.stepGhost();

    // Update Lap & Finish Detection
    this.checkLapAndFinish(nearest.progress);

    // Update Camera
    this.updateRaceCamera(dt, speedKmh);

    // Update Audio Engine
    const stats = computeEffectiveCarStats(this.currentCar, this.currentTune);
    audioEngine.setSurface(surfaceName, this.currentWeather.wetness);
    // Music reacts to the car: the bed ducks under load and tightens its tempo
    // slightly as speed builds. Small numbers, big difference in feel.
    audioEngine.updateMusicDynamics(
      rawThrottle * (0.45 + (this.playerBody.rpm / Math.max(1000, stats.maxRpm)) * 0.55),
      speedKmh,
    );
    audioEngine.updateAmbience(speedKmh, 0.3 + (this.playerBody.damage.engineHealth < 60 ? 0.15 : 0));
    audioEngine.updateFrame({
      rpm: this.playerBody.rpm,
      maxRpm: stats.maxRpm,
      throttle: rawThrottle,
      speedKmh,
      boostPsi: this.playerBody.boostPsi,
      tireSlip: maxSlip,
      cameraView: this.cameraView,
      isPaused: false,
      engineDamaged: this.playerBody.damage.engineHealth < 55,
      brake: rawBrake,
      // Load = torque actually being produced, not just pedal position. This is
      // what makes the exhaust note change when you back off the throttle at
      // constant rpm (engine braking) instead of only when the revs move.
      load: rawThrottle * (0.45 + (this.playerBody.rpm / Math.max(1000, stats.maxRpm)) * 0.55),
    });

    // Emit Telemetry Frame
    const position = this.computePlayerRacePosition(nearest.progress);
    const lapTimeSec = Math.max(0, this.elapsedSec - this.lapStartSec);
    const frame: LiveTelemetryFrame = {
      timestampSec: Number(this.elapsedSec.toFixed(2)),
      lap: this.playerLap,
      lapTimeSec,
      bestLapSec: this.bestLapSec,
      deltaBestSec: this.bestLapSec !== null ? lapTimeSec - this.bestLapSec : 0,
      speedKmh,
      rpm: this.playerBody.rpm,
      maxRpm: stats.maxRpm,
      gear: this.playerBody.gear,
      throttle: rawThrottle,
      brake: rawBrake,
      steering: rawSteer,
      clutch: this.playerBody.shiftTimer > 0 ? 1 : 0,
      nitroActive: nitroInput && this.playerBody.nitroRemainingKg > 0.05,
      nitroRemainingPct:
        this.currentTune.nitroCapacityKg > 0
          ? (this.playerBody.nitroRemainingKg / this.currentTune.nitroCapacityKg) * 100
          : 0,
      gForceLat: this.playerBody.gForceLat,
      gForceLong: this.playerBody.gForceLong,
      boostPsi: this.playerBody.boostPsi,
      engineTempC: this.playerBody.engineTempC,
      oilTempC: this.playerBody.oilTempC,
      brakeTempC: this.playerBody.brakeTempC,
      fuelLiters: this.playerBody.fuelLiters,
      downforceN: this.playerBody.downforceN,
      dragN: this.playerBody.dragN,
      slipstreamFactor,
      surfaceName,
      wheels: this.playerBody.wheels,
      damage: this.playerBody.damage,
      position,
      totalRacers: this.bots.length + 1,
      driftScore: this.driftScore,
      driftCombo: this.driftCombo,
      driftAngleDeg: driftDeg,
      stuntScore: this.stuntScore,
      wantedStars: this.wantedStars,
      packageIntegrityPct: this.packageIntegrityPct,
      deliveriesCompleted: this.deliveriesCompleted,
      activePowerup: this.activePowerup,
      antiTrollWarnings: this.antiTrollWarnings,
      startLightsLit: this.startSequence?.lampsLit ?? 0,
      startLightPhase: this.startSequence
        ? this.startSequence.readyToMove
          ? this.lightsOutElapsedSec !== null && this.elapsedSec - this.lightsOutElapsedSec < 2.5
            ? 'out'
            : 'rolling'
          : this.startSequence.phase
        : 'rolling',
    };

    if (this.telemetryLog.length < 4500 && Math.floor(this.elapsedSec * 10) > this.telemetryLog.length) {
      this.telemetryLog.push(frame);
    }
    this.callbacks.onTelemetry(frame);
  }

  /**
   * Drives the five red lamp pairs hanging from the start gantry. `litPairs`
   * (0..5) is how many pairs are currently on; after lights-out every lamp
   * goes dark at once (FIA procedure — there is no green phase).
   */
  private updateGantryLamps(litPairs: number): void {
    const lamps = this.trackWorld?.startLamps;
    if (!lamps || lamps.length !== 10) return;
    for (let pair = 0; pair < 5; pair++) {
      const on = pair < litPairs;
      for (const j of [pair * 2, pair * 2 + 1]) {
        const lamp = lamps[j];
        const mat = lamp.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = on ? 3.4 : 0.04;
        mat.color.setHex(on ? 0x401010 : 0x1a0505);
      }
    }
  }

  private stepBots(dt: number, canMove: boolean, playerSteer: number, playerSpeedKmh: number, isNight: boolean): void {
    if (!this.trackWorld) return;
    const len = this.trackWorld.totalLengthM;

    for (const b of this.bots) {
      if (b.health <= 0) {
        b.rig.root.visible = false;
        continue;
      }

      if (b.sirenGroup) {
        const flash = Math.floor(this.elapsedSec * 10) % 2 === 0;
        b.sirenGroup.children[0].visible = flash;
        b.sirenGroup.children[1].visible = !flash;
      }

      if (b.spinTimer > 0) {
        b.spinTimer -= dt;
        b.rig.root.rotation.y += dt * 7.5;
        continue;
      }

      const root = b.rig.root;
      const weatherAdapt = 1 - (1 - this.currentWeather.gripMultiplier) * (1.2 - b.profile.adaptability * 0.06);
      const skillFactor = 0.72 + (b.profile.skill / 10) * 0.34;

      // --- Driver model ---------------------------------------------------
      // The bot now drives: it has a position, a heading and a speed of its own,
      // and it steers with pure pursuit toward an optimised racing line. Its
      // heading therefore *deviates* from the track tangent (slip angle, small
      // corrections, occasional wide exits), which is the single most important
      // difference between this and the old spline-glued bots.
      let throttle = 0;
      let brake = 0;
      let steer = 0;
      let targetSpeedMs = 0;
      let cornerCurvature = 0;

      if (b.follower) {
        const cmd = b.follower.update(dt, {
          x: root.position.x,
          z: root.position.z,
          headingRad: b.headingRad,
          speedMs: b.speedMs,
        });
        targetSpeedMs = cmd.targetSpeedMs * weatherAdapt;
        throttle = cmd.throttle;
        brake = cmd.brake;
        steer = cmd.steer;
        if (this.racingLine) {
          cornerCurvature = this.racingLine.samples[cmd.sampleIndex % this.racingLine.samples.length].curvature;
        }
      } else {
        // Legacy fallback: curvature lookahead.
        const aheadProg = (b.splineProgress + 0.025) % 1;
        const pNow = this.trackWorld.curve.getTangentAt(b.splineProgress);
        const pAhead = this.trackWorld.curve.getTangentAt(aheadProg);
        const turnSharpness = 1 - Math.max(-1, Math.min(1, pNow.dot(pAhead)));
        const baseTopMs = Math.min(92, (b.carSpec.topSpeedKmh / 3.6) * 0.78 * skillFactor * weatherAdapt);
        targetSpeedMs = Math.max(17, baseTopMs * (1 - turnSharpness * 3.1));
        const err = targetSpeedMs - b.speedMs;
        throttle = Math.max(0, Math.min(1, err * 0.4));
        brake = Math.max(0, Math.min(1, -err * 0.5));
        steer = Math.max(-1, Math.min(1, (aheadProg - b.splineProgress) * 40));
        cornerCurvature = turnSharpness;
      }

      // Bots react to lights-out with a human-range delay (0.22–0.46 s), not
      // on the same frame as the extinguish — an eight-car field launching
      // the same millisecond is the cheapest start exploit in any racing game.
      const botReady =
        canMove &&
        (this.lightsOutElapsedSec === null ||
          this.elapsedSec - this.lightsOutElapsedSec >= b.startReactionSec);
      if (!botReady) {
        throttle = 0;
        brake = 1;
      }

      // --- Traffic awareness ----------------------------------------------
      // Bots must not drive through the player. They modulate speed when the
      // player is directly ahead in their lane, and rivals add a deliberate
      // lateral push (close the door) instead of magically overlapping.
      const distToPlayer = root.position.distanceTo(this.playerRig!.root.position);
      let trafficSteer = 0;
      if (distToPlayer < 22) {
        const dxp = this.playerBody.x - root.position.x;
        const dzp = this.playerBody.z - root.position.z;
        const ahead =
          dxp * Math.sin(b.headingRad) + dzp * Math.cos(b.headingRad);
        const lateral =
          dxp * Math.cos(b.headingRad) - dzp * Math.sin(b.headingRad);
        if (ahead > 0.5 && Math.abs(lateral) < 3.2) {
          const closing = nearestLateralGap(ahead, Math.abs(lateral));
          targetSpeedMs = Math.min(targetSpeedMs, Math.max(3, b.speedMs - closing * 1.4));
          if (ahead < 7 && b.profile.aggression < 7) brake = Math.max(brake, 0.35);
        }
        if (b.rivalryScore >= 2 || b.isPolice || b.profile.aggression >= 8) {
          // Steer toward the player's side to defend the line.
          trafficSteer = Math.max(-0.35, Math.min(0.35, lateral * 0.08));
        } else if (b.rivalryScore <= -1 || b.profile.sportsmanship >= 8) {
          trafficSteer = -Math.max(-0.3, Math.min(0.3, lateral * 0.06));
        }
      }
      steer = Math.max(-1, Math.min(1, steer + trafficSteer));

      // --- Longitudinal integration ---------------------------------------
      const massKg = Math.max(300, b.massKg);
      const maxAccelMs2 = b.maxAccelMs2;
      const maxBrakeMs2 = Math.min(16, (1.05 * 9.81) * (cornerCurvature > 0.02 ? 1 : 0.85));
      const dragAccel = (0.5 * 1.225 * 2.05 * 0.42 * b.speedMs * b.speedMs) / massKg;
      const accel = throttle * maxAccelMs2 - brake * maxBrakeMs2 - dragAccel - 0.12;
      b.speedMs = Math.max(0, Math.min(b.carSpec.topSpeedKmh / 3.6 * 0.98, b.speedMs + accel * dt));

      // Off-track penalty: bots lose time on the grass instead of floating over it.
      const near = this.trackWorld.sampleNearest(root.position.x, root.position.z);
      const halfRoad = this.trackWorld.roadWidth * 0.5;
      if (Math.abs(near.lateralOffset) > halfRoad - 0.3) {
        b.speedMs *= 1 - Math.min(0.55, dt * 1.4);
      }

      // --- Yaw integration (tyre-limited) ---------------------------------
      const wheelbaseM = 2.7;
      const yawDemand = (b.speedMs / wheelbaseM) * Math.tan(steer * 0.42);
      const maxYawRate = Math.min(1.9, 12.5 / Math.max(5, b.speedMs));
      const yawRate = Math.max(-maxYawRate, Math.min(maxYawRate, yawDemand));
      b.headingRad += yawRate * dt;
      root.position.x += Math.sin(b.headingRad) * b.speedMs * dt;
      root.position.z += Math.cos(b.headingRad) * b.speedMs * dt;

      // Hard containment: if a bot runs wide, it is pushed back toward the
      // track instead of leaving the world (belt-and-braces for tight hairpins).
      const post = this.trackWorld.sampleNearest(root.position.x, root.position.z);
      if (Math.abs(post.lateralOffset) > halfRoad + 2.5) {
        const sign = Math.sign(post.lateralOffset);
        const rightX = post.tangent.z;
        const rightZ = -post.tangent.x;
        root.position.x = post.point.x - rightX * sign * (halfRoad + 2.2);
        root.position.z = post.point.z - rightZ * sign * (halfRoad + 2.2);
        b.speedMs *= 0.82;
      }
      root.position.y = post.point.y;
      root.rotation.y = b.headingRad;

      // Lap bookkeeping from the actual position, not the spline parameter.
      if (b.splineProgress > 0.85 && post.progress < 0.15) b.lap++;
      else if (b.splineProgress < 0.15 && post.progress > 0.85) b.lap = Math.max(1, b.lap - 1);
      b.splineProgress = post.progress;

      const steerVisual = Math.max(-1, Math.min(1, steer));
      this.updateContactShadow(b.rig.root, 2.4, 5.2);

      b.rig.updateRealtimeVisuals({
        dt,
        speedKmh: b.speedMs * 3.6,
        steering: steerVisual,
        wheelSpinRad: this.elapsedSec * b.speedMs * 2.2,
        brakeTempC: brake > 0.3 ? 620 : 180,
        engineTempC: 94,
        backfireActive: throttle < 0.1 && b.speedMs > 18 && Math.random() < 0.12,
        nitroActive: false,
        doorsOpen: false,
        hoodOpen: false,
        trunkOpen: false,
        cfdVisible: false,
        bassEnergy: 0,
        // Body attitude from the same driver inputs: braking pitches the nose
        // down, cornering rolls the body onto the outside wheels.
        pitchRad: -brake * 0.028 + throttle * 0.012,
        rollRad: steerVisual * Math.min(0.09, (b.speedMs * Math.abs(yawRate)) / 220),
        headlightsOn: isNight,
        shieldActive: false,
        damage: this.playerBody.damage,
      });

      // Doppler Pass-By Audio Effect!
      const relSpeed = Math.abs(playerSpeedKmh - b.speedMs * 3.6);
      if (distToPlayer < 11 && relSpeed > 45 && this.elapsedSec - b.lastFlybyTime > 3.5) {
        b.lastFlybyTime = this.elapsedSec;
        audioEngine.triggerDopplerFlyby();
      }

      // ── Car-to-car contact: oriented boxes, not a 2.95 m sphere ─────────
      // The old code used a centre-distance test, teleported the player 0.95 m
      // regardless of approach angle and ALWAYS dented the front. Two cars
      // sliding door-to-door touch at ~1.9 m of side-by-side overlap while two
      // noses touch at ~4.6 m of closing distance — a sphere can do neither.
      // Box-vs-box gives the correct impact face (front/left/right/rear) from
      // geometry, splits the separation push between both cars, and rate-limits
      // damage so one long scrape is one hit, not sixty.
      const playerShape = SHAPE_PRESETS[this.currentCar?.archetype ?? 'sedan_tuner'];
      const botShape = SHAPE_PRESETS[b.carSpec.archetype] ?? playerShape;
      const contact = resolveContact(
        this.playerBody.x,
        this.playerBody.z,
        this.playerBody.headingRad,
        playerShape.length * 0.5,
        playerShape.width * 0.5,
        root.position.x,
        root.position.z,
        b.headingRad,
        botShape.length * 0.5,
        botShape.width * 0.5
      );
      if (contact.touching) {
        // Positional separation: player takes the larger share, the bot yields
        // too (it is not glued to rails any more).
        if (contact.movePlayer > 0) {
          this.playerBody.x -= contact.normalX * contact.movePlayer;
          this.playerBody.z -= contact.normalZ * contact.movePlayer;
        }
        if (contact.moveOther > 0) {
          root.position.x += contact.normalX * contact.moveOther;
          root.position.z += contact.normalZ * contact.moveOther;
        }
        // Exchange a fraction of momentum along the contact normal so a shunt
        // that should bounce the cars apart does not glue them together.
        this.playerBody.vx *= 0.82;
        this.playerBody.vz *= 0.82;

        // Damage is dealt at most once per 0.6 s per car pair.
        const damageEvent = this.elapsedSec - b.lastHitSec >= 0.6;
        if (damageEvent) {
          b.lastHitSec = this.elapsedSec;
          const impactKmh = Math.max(20, relSpeed);
          const zone: ImpactZone = contact.zone;
          this.playerBody.applyImpact(impactKmh, zone, this.damageEnabled && this.shieldTimer <= 0);
          this.packageIntegrityPct = Math.max(0, this.packageIntegrityPct - (zone === 'front' ? 9 : zone === 'rear' ? 4 : 6));
          audioEngine.triggerCollision(zone === 'front' ? 0.75 : 0.45);

          if (this.currentMode === 'derby') {
            b.health -= 34;
          }
        }

        // Anti-Troll Detector in Multiplayer Mode: Did the player steer directly toward the bot?
        if (damageEvent && this.currentMode === 'multiplayer' && Math.abs(playerSteer) > 0.45 && playerSpeedKmh > 60) {
          this.antiTrollWarnings++;
          if (this.antiTrollWarnings >= 2) {
            this.slowdownPenaltyTimer = 4.5;
          }
          this.emitRadio({
            senderName: 'Steward Anti-Troll IA',
            callsign: 'STEWARD',
            nationality: 'FIA',
            relation: 'race_control',
            text:
              this.antiTrollWarnings === 1
                ? 'AVISO #1: Input de volante intencional detectado na colisão! Respeite o espaço!'
                : 'PENALIDADE SLOWDOWN ATIVADA (4.5s) por batida proposital!',
            lang: 'pt-BR',
          });
        }

        // Rivalry escalation & Radio Voice Acting!
        if (damageEvent && this.elapsedSec - b.lastFlybyTime > 1.8) {
          b.lastFlybyTime = this.elapsedSec;
          b.rivalryScore++;
          this.persistentRivalry.set(b.profile.id, b.rivalryScore);
          b.emotion = 'furious';

          const pool = b.rivalryScore >= 2 ? b.profile.lines.tauntRival : b.profile.lines.hitByPlayer;
          const line = pool[Math.floor(Math.random() * pool.length)];
          this.emitRadio({
            senderName: b.profile.name,
            callsign: b.profile.callsign,
            nationality: b.profile.nationality,
            relation: b.rivalryScore >= 2 ? 'rival' : 'neutral',
            text: line,
            lang: b.profile.languageCode,
          });
        }
      } else if (distToPlayer < 7.5 && playerSpeedKmh > 90 && Math.random() < dt * 0.08) {
        // Clean wheel-to-wheel racing builds Ally respect!
        b.rivalryScore = Math.max(-4, b.rivalryScore - 1);
        this.persistentRivalry.set(b.profile.id, b.rivalryScore);
        const pool = b.rivalryScore <= -2 ? b.profile.lines.allySupport : b.profile.lines.respectPlayer;
        const line = pool[Math.floor(Math.random() * pool.length)];
        this.emitRadio({
          senderName: b.profile.name,
          callsign: b.profile.callsign,
          nationality: b.profile.nationality,
          relation: b.rivalryScore <= -2 ? 'ally' : 'neutral',
          text: line,
          lang: b.profile.languageCode,
        });
      }
    }
  }

  private obtainParticleMesh(isSpark: boolean): THREE.Mesh {
    const pooled = this.smokePool.pop();
    if (pooled) {
      pooled.geometry = isSpark ? this.sparkGeo : this.smokeGeo;
      return pooled;
    }
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    return new THREE.Mesh(isSpark ? this.sparkGeo : this.smokeGeo, mat);
  }

  private spawnParticle(opts: {
    isSpark: boolean;
    color: number;
    opacity: number;
    life: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    scale: number;
  }): void {
    if (this.smokeParticles.length > 90) return;
    const m = this.obtainParticleMesh(opts.isSpark);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(opts.color);
    mat.opacity = opts.opacity;
    m.position.set(opts.x, opts.y, opts.z);
    m.scale.setScalar(opts.scale);
    m.visible = true;
    this.scene.add(m);
    this.smokeParticles.push({
      mesh: m,
      life: opts.life,
      vx: opts.vx,
      vy: opts.vy,
      vz: opts.vz,
    });
  }

  private spawnTireSmokeOrSpark(
    isSpark: boolean,
    surface: 'smoke' | 'dust' | 'spray' | 'snow' = 'smoke'
  ): void {
    const bx = this.playerBody.x - Math.sin(this.playerBody.headingRad) * 1.6 + (Math.random() - 0.5) * 1.2;
    const bz = this.playerBody.z - Math.cos(this.playerBody.headingRad) * 1.6 + (Math.random() - 0.5) * 1.2;
    if (isSpark) {
      this.spawnParticle({
        isSpark: true,
        color: 0xff9500,
        opacity: 0.95,
        life: 0.35,
        x: bx,
        y: this.playerBody.y + 0.22,
        z: bz,
        vx: (Math.random() - 0.5) * 2.5,
        vy: 3.5,
        vz: (Math.random() - 0.5) * 2.5,
        scale: 1,
      });
      return;
    }
    const color =
      surface === 'dust'
        ? 0xc2a878
        : surface === 'spray'
        ? 0xb9c8d8
        : surface === 'snow'
        ? 0xeef4ff
        : this.currentTune.tireCompound === 'drift'
        ? 0xff007f
        : 0xd8dee9;
    this.spawnParticle({
      isSpark: false,
      color,
      opacity: surface === 'spray' ? 0.3 : surface === 'snow' ? 0.55 : 0.42,
      life: surface === 'dust' ? 1.1 : surface === 'snow' ? 1.4 : 0.85,
      x: bx,
      y: this.playerBody.y + 0.22,
      z: bz,
      vx: (Math.random() - 0.5) * 2.5,
      vy: surface === 'spray' ? 2.2 : 1.4,
      vz: (Math.random() - 0.5) * 2.5,
      scale: 1,
    });
  }

  private spawnDamageSmoke(): void {
    const fx = Math.sin(this.playerBody.headingRad);
    const fz = Math.cos(this.playerBody.headingRad);
    this.spawnParticle({
      isSpark: false,
      color: 0x2b2f36,
      opacity: 0.5,
      life: 1.3,
      x: this.playerBody.x + fx * 1.5 + (Math.random() - 0.5) * 0.5,
      y: this.playerBody.y + 0.75,
      z: this.playerBody.z + fz * 1.5 + (Math.random() - 0.5) * 0.5,
      vx: (Math.random() - 0.5) * 0.8,
      vy: 1.8,
      vz: (Math.random() - 0.5) * 0.8,
      scale: 1.2,
    });
  }

  private updateParticlesAndDestructibles(dt: number, playerSpeedKmh: number): void {
    // Precipitation follow camera & fall
    if (this.precipPoints) {
      const posAttr = this.precipPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      const fallSpeed =
        this.currentWeather.precipitationType === 'snow' || this.currentWeather.precipitationType === 'sakura'
          ? 7.5
          : 34.0;
      const windDrift = (this.currentWeather.windSpeedKmh / 3.6) * 0.35;

      for (let i = 0; i < posAttr.count; i++) {
        let px = posAttr.getX(i) + windDrift * dt;
        let py = posAttr.getY(i) - fallSpeed * dt;
        let pz = posAttr.getZ(i);

        if (py < 0) {
          py = 42;
          px = this.playerBody.x + (Math.random() - 0.5) * 130;
          pz = this.playerBody.z + (Math.random() - 0.5) * 130;
        }
        posAttr.setXYZ(i, px, py, pz);
      }
      posAttr.needsUpdate = true;
    }

    // Smoke & Sparks (pooled — dead particles return to the pool)
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.visible = false;
        this.smokePool.push(p.mesh);
        this.smokeParticles.splice(i, 1);
      } else {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.scale.addScalar(dt * 1.8);
      }
    }

    // Projectiles (Re-Volt Firework Rockets!)
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const r = this.activeProjectiles[i];
      r.life -= dt;
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      r.mesh.position.set(r.x, r.y, r.z);

      for (const b of this.bots) {
        if (b.rig.root.position.distanceTo(r.mesh.position) < 3.5) {
          b.spinTimer = 2.5;
          b.speedMs *= 0.25;
          r.life = 0;
          audioEngine.triggerCollision(0.9);
        }
      }
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        this.activeProjectiles.splice(i, 1);
      }
    }

    // Destructible Cones & Fire Hydrants (with Water Geyser!)
    if (!this.trackWorld) return;
    for (const d of this.trackWorld.destructibles) {
      if (!d.hit) {
        const dist = Math.hypot(this.playerBody.x - d.x, this.playerBody.z - d.z);
        if (dist < 1.85) {
          d.hit = true;
          d.vx = this.playerBody.vx * 0.9 + (Math.random() - 0.5) * 6;
          d.vy = 6 + playerSpeedKmh * 0.05;
          d.vz = this.playerBody.vz * 0.9 + (Math.random() - 0.5) * 6;
          audioEngine.triggerCollision(0.28);
          if (d.isHydrant) {
            d.geyserTimer = 6.0;
            const geyser = new THREE.Mesh(
              new THREE.ConeGeometry(0.85, 8.5, 10),
              new THREE.MeshBasicMaterial({ color: 0x90e0ef, transparent: true, opacity: 0.65 })
            );
            geyser.position.set(d.x, d.y + 4.2, d.z);
            this.trackWorld.group.add(geyser);
          }
        }
      } else if (d.mesh.position.y >= d.y) {
        d.vy -= 18 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y = Math.max(d.y, d.mesh.position.y + d.vy * dt);
        d.mesh.position.z += d.vz * dt;
        d.mesh.rotation.x += dt * 6;
      }
    }

    // Animated World Props (Churrasco Smoke, Cat Paw, Powerups, Earth)
    for (const ap of this.trackWorld.animatedProps) {
      ap.update(this.elapsedSec, dt);
    }
  }

  private stepGhost(): void {
    if (this.currentLapRecording.length > 30000) return; // hard cap (time trial)
    if (this.currentMode !== 'time_trial' && this.currentLapRecording.length > 3600) return;
    this.currentLapRecording.push({
      x: this.playerBody.x,
      y: this.playerBody.y,
      z: this.playerBody.z,
      heading: this.playerBody.headingRad,
    });

    if (this.bestLapRecording && this.bestLapRecording.length > 0) {
      if (!this.ghostMesh) {
        this.ghostMesh = new THREE.Group();
        const ghostBox = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 0.85, 4.3),
          new THREE.MeshBasicMaterial({
            color: 0x00f5d4,
            wireframe: true,
            transparent: true,
            opacity: 0.55,
          })
        );
        ghostBox.position.y = 0.5;
        this.ghostMesh.add(ghostBox);
        this.scene.add(this.ghostMesh);
      }
      const sample = this.bestLapRecording[Math.min(this.bestLapRecording.length - 1, this.lapFrameCursor++)];
      this.ghostMesh.position.set(sample.x, sample.y, sample.z);
      this.ghostMesh.rotation.y = sample.heading;
    }
  }

  private checkLapAndFinish(currentProgress: number): void {
    if (!this.trackWorld || this.raceFinished) return;

    if (!this.trackWorld.isClosedLoop) {
      // Drag Strip Finish!
      if (currentProgress > 0.94) {
        this.finishRace(currentProgress);
      }
      return;
    }

    // Crossed Start/Finish Line forward!
    if (this.lastSplineProgress > 0.86 && currentProgress < 0.14) {
      const lapTime = this.elapsedSec - this.lapStartSec;
      if (lapTime > 6) {
        if (this.bestLapSec === null || lapTime < this.bestLapSec) {
          this.bestLapSec = lapTime;
          this.bestLapRecording = [...this.currentLapRecording];
        }
        this.currentLapRecording = [];
        this.lapFrameCursor = 0;
        this.lapStartSec = this.elapsedSec;

        if (this.playerLap >= this.totalLaps && this.currentMode !== 'time_trial') {
          this.finishRace(currentProgress);
        } else {
          this.playerLap++;
          audioEngine.cheer(1);
        }
      }
    }
    this.lastSplineProgress = currentProgress;
  }

  private finishRace(progress: number): void {
    this.raceFinished = true;
    const pos = this.computePlayerRacePosition(progress);
    this.callbacks.onRaceFinished({
      position: pos,
      totalRacers: this.bots.length + 1,
      totalTimeSec: this.elapsedSec,
      bestLapSec: this.bestLapSec,
      driftScore: this.driftScore,
      stuntScore: this.stuntScore,
      deliveries: this.deliveriesCompleted,
    });
  }

  private computePlayerRacePosition(playerProgress: number): number {
    const playerTotal = this.playerLap + playerProgress;
    let ahead = 0;
    for (const b of this.bots) {
      if (b.health > 0 && b.lap + b.splineProgress > playerTotal) {
        ahead++;
      }
    }
    return ahead + 1;
  }

  private updateRaceCamera(dt: number, speedKmh: number): void {
    const fx = Math.sin(this.playerBody.headingRad);
    const fz = Math.cos(this.playerBody.headingRad);
    const px = this.playerBody.x;
    const py = this.playerBody.y;
    const pz = this.playerBody.z;

    // Dynamic speed FOV, compensated for portrait/narrow screens so the car
    // is never cropped on phones (fitVerticalFov holds horizontal FOV).
    const baseFov = speedFov(speedKmh);
    const targetFov = fitVerticalFov(baseFov, this.camera.aspect || 16 / 9);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 6);
    this.camera.updateProjectionMatrix();

    const snap = this.snapCameraNextFrame;
    this.snapCameraNextFrame = false;

    if (this.cameraView === 'cockpit') {
      this.camera.position.set(px - fx * 0.08, py + 1.06, pz - fz * 0.08);
      this.camera.lookAt(px + fx * 18, py + 0.96, pz + fz * 18);
    } else if (this.cameraView === 'hood') {
      this.camera.position.set(px + fx * 0.65, py + 1.05, pz + fz * 0.65);
      this.camera.lookAt(px + fx * 25, py + 0.85, pz + fz * 25);
    } else if (this.cameraView === 'bumper') {
      this.camera.position.set(px + fx * 2.1, py + 0.48, pz + fz * 2.1);
      this.camera.lookAt(px + fx * 30, py + 0.48, pz + fz * 30);
    } else if (this.cameraView === 'undercar_suspension') {
      this.camera.position.set(px - fx * 1.6 + fz * 0.9, py + 0.36, pz - fz * 1.6 - fx * 0.9);
      this.camera.lookAt(px + fx * 1.4, py + 0.35, pz + fz * 1.4);
    } else if (this.cameraView === 'helicopter') {
      this.camTmp.set(px - fx * 24 + 12, py + 19, pz - fz * 24 + 12);
      if (snap) this.camera.position.copy(this.camTmp);
      else this.camera.position.lerp(this.camTmp, Math.min(1, dt * 5));
      this.camera.lookAt(px + fx * 6, py + 0.8, pz + fz * 6);
    } else {
      // Speed-aware chase framing: a fixed 6 m boom under-reads speed at 40
      // km/h and clips the car's own bumper at 280. The boom stretches and
      // lowers slightly with speed, and the look-ahead grows so fast corners
      // stay in frame — the same thing a chase camera does in any driving game.
      const far = this.cameraView === 'chase_far';
      const boom = chaseBoom(speedKmh, far);
      this.camTmp.set(px - fx * boom.dist, py + boom.height, pz - fz * boom.dist);
      if (snap) this.camera.position.copy(this.camTmp);
      else this.camera.position.lerp(this.camTmp, Math.min(1, dt * 11));
      this.camera.lookAt(px + fx * boom.lookAhead, py + 0.95, pz + fz * boom.lookAhead);
      // Horizon guarantee: roll is applied with rotateZ() (rotation around
      // the view axis — a pure roll) and hard-clamped to ±0.8°, smoothed so
      // it can never snap or accumulate. Writing rotation.z after lookAt()
      // with XYZ Euler order tilted the horizon by a pitch-dependent amount:
      // that was the "tela torta" bug.
      const targetRoll = computeChaseRoll(this.playerBody.rollRad, true);
      this.smoothedRoll += (targetRoll - this.smoothedRoll) * Math.min(1, dt * 8);
      this.camera.rotateZ(this.smoothedRoll);
      // Subtle speed shake (toggleable in Settings).
      if (this.cameraShakeEnabled && speedKmh > 140) {
        const shakeT = Math.min(1, (speedKmh - 140) / 160);
        const t = this.elapsedSec;
        this.camera.position.y += Math.sin(t * 31.7) * 0.012 * shakeT;
        this.camera.position.x += Math.sin(t * 27.3 + 1.7) * 0.01 * shakeT;
      }
    }
  }

  public dispose(): void {
    if (activeEngine === this) activeEngine = null;
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    // Free the whole scene graph, the particle pool and the post pipeline.
    this.clearDynamicScene();
    for (const m of this.smokePool) {
      (m.material as THREE.Material).dispose();
    }
    this.smokePool = [];
    this.smokeGeo.dispose();
    this.sparkGeo.dispose();
    this.realism.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

/**
 * Rough latitude per venue country, used by the solar altitude curve. A circuit
 * in Norway and a circuit in Brazil do not have the same sun: at 60°N the sun
 * never gets high, shadows stay long all day, and the light is cooler. This is
 * a two-line table that buys a lot of "this is a real place".
 */
function latitudeForCountry(country: string): number {
  const c = country.toLowerCase();
  if (c.includes('noruega') || c.includes('norway') || c.includes('islând') || c.includes('island')) return 61;
  if (c.includes('escócia') || c.includes('scotland') || c.includes('finlând')) return 57;
  if (c.includes('suíça') || c.includes('swiss') || c.includes('áustria') || c.includes('austria')) return 47;
  if (c.includes('jap') || c.includes('itália') || c.includes('italy')) return 40;
  if (c.includes('eua') || c.includes('usa') || c.includes('estados')) return 36;
  if (c.includes('marrocos') || c.includes('egito') || c.includes('egyp') || c.includes('dubai') || c.includes('emirados')) return 26;
  if (c.includes('brasil') || c.includes('brazil')) return -23;
  if (c.includes('austrália') || c.includes('australia')) return -33;
  if (c.includes('marte') || c.includes('mars') || c.includes('orbital')) return 0;
  return 23;
}
