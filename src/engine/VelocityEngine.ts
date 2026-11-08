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
import { AssistMode, computeEffectiveCarStats, VehiclePhysicsBody } from './PacejkaPhysics';
import { buildCarMesh, BuiltCarRig } from '../cars/CarMeshBuilder';
import { buildGarageShowroom, buildTrackWorld, BuiltTrackWorld } from '../tracks/TrackBuilder';
import { CAR_CATALOG, createDefaultTuneForCar } from '../data/carCatalog';
import { BOT_ROSTER } from '../data/botRoster';
import { audioEngine } from '../audio/VelocityAudioEngine';

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
}

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
}

export class VelocityEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;

  private animFrameId: number | null = null;
  private lastPerfNow = performance.now();
  private elapsedSec = 0;

  private sceneMode: 'garage' | 'race' = 'garage';
  private isPaused = false;
  private psxRetroMode = false;

  // Garage Objects
  private garageTurntable: THREE.Group | null = null;
  private garageRig: BuiltCarRig | null = null;
  private garageOrbitYaw = 0.55;
  private garageOrbitPitch = 0.24;
  private garageZoomDist = 5.4;
  private garageDoorsOpen = false;
  private garageHoodOpen = false;
  private garageTrunkOpen = false;
  private garageCfdVisible = false;
  private garageSpotIntensity = 48;
  private garageSpots: THREE.SpotLight[] = [];
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
  private dynamicTimeSpeed = 0.04; // hours per real second
  private assistMode: AssistMode = 'pro';
  private damageEnabled = true;
  private tireWearEnabled = true;
  private fuelEnabled = true;
  private cameraView: CameraView = 'chase_near';

  private trackWorld: BuiltTrackWorld | null = null;
  private playerRig: BuiltCarRig | null = null;
  private playerBody = new VehiclePhysicsBody(24);
  private bots: BotRacerInstance[] = [];

  // Weather & Smoke Particles
  private precipPoints: THREE.Points | null = null;
  private smokeParticles: { mesh: THREE.Mesh; life: number; vx: number; vy: number; vz: number }[] = [];
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
  private countdownSec = 3.0;
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

    this.hemiLight = new THREE.HemisphereLight(0x90e0ef, 0x1e2430, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 2.4);
    this.sunLight.position.set(120, 180, 90);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 600;
    const d = 110;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    this.bindEvents();
    this.startLoop();
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      audioEngine.init();
      this.isDraggingOrbit = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    });
    window.addEventListener('pointerup', () => {
      this.isDraggingOrbit = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.isDraggingOrbit) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      if (this.sceneMode === 'garage') {
        this.garageOrbitYaw -= dx * 0.007;
        this.garageOrbitPitch = THREE.MathUtils.clamp(this.garageOrbitPitch + dy * 0.005, 0.04, 1.15);
      } else if (this.photoModeActive) {
        this.photoOrbitYaw -= dx * 0.007;
        this.photoOrbitPitch = THREE.MathUtils.clamp(this.photoOrbitPitch + dy * 0.005, -0.1, 1.35);
      }
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        if (this.sceneMode === 'garage') {
          this.garageZoomDist = THREE.MathUtils.clamp(this.garageZoomDist + e.deltaY * 0.004, 1.45, 11.5);
        } else if (this.photoModeActive) {
          this.photoDist = THREE.MathUtils.clamp(this.photoDist + e.deltaY * 0.006, 2.0, 35.0);
        }
      },
      { passive: true }
    );
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.setPsxRetroMode(this.psxRetroMode);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
      return;
    }
    audioEngine.init();
    const code = e.code;
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
    return next;
  }

  public getCameraView(): CameraView {
    return this.cameraView;
  }

  public setPsxRetroMode(enabled: boolean): void {
    this.psxRetroMode = enabled;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (enabled) {
      // Classic 1999 Re-Volt / PSX crisp low-res render target upscaled with nearest neighbor!
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(Math.max(320, Math.floor(w / 3.2)), Math.max(240, Math.floor(h / 3.2)), false);
      this.renderer.domElement.style.width = `${w}px`;
      this.renderer.domElement.style.height = `${h}px`;
      this.renderer.domElement.style.imageRendering = 'pixelated';
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(w, h, true);
      this.renderer.domElement.style.imageRendering = 'auto';
    }
  }

  // --- GARAGE MODE ---
  public enterGarage(params: {
    car: CarSpec;
    tune: CarTuneSetup;
    garageTier: 1 | 2 | 3;
    trophyCount: number;
    posters: SavedPoster[];
  }): void {
    this.sceneMode = 'garage';
    this.photoModeActive = false;
    this.currentCar = params.car;
    this.currentTune = params.tune;
    audioEngine.configureCar(params.car, params.tune);

    this.clearDynamicScene();
    this.scene.background = new THREE.Color(params.garageTier === 3 ? 0x070a14 : 0x10141d);
    this.scene.fog = new THREE.FogExp2(0x0b0e17, 0.025);
    this.hemiLight.intensity = 0.7;
    this.sunLight.intensity = 0.6;

    const built = buildGarageShowroom(params.garageTier, params.trophyCount, params.posters);
    this.scene.add(built.group);
    this.garageTurntable = built.turntable;
    this.garageSpots = built.spotLights;

    this.garageRig = buildCarMesh(params.car, params.tune);
    this.garageRig.root.position.y = 0.14;
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
      this.garageSpotIntensity = opts.spotIntensity;
      this.garageSpots.forEach((s) => (s.intensity = opts.spotIntensity!));
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
    audioEngine.init();
    this.sceneMode = 'race';
    this.isPaused = false;
    this.photoModeActive = false;
    this.raceFinished = false;

    this.currentCar = config.car;
    this.currentTune = config.tune;
    this.currentTrack = config.track;
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
      config.track,
      config.mode,
      config.layoutVariant ?? 'GP',
      config.customTrack
    );
    this.scene.add(this.trackWorld.group);

    // Place Player on Pole / Grid Slot
    const startPt = this.trackWorld.samplePoints[0];
    const startTan = this.trackWorld.sampleTangents[0];
    const startHeading = Math.atan2(startTan.x, startTan.z);

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
    const actualBots = config.mode === 'time_trial' ? 0 : config.mode === 'drag' ? 1 : config.botCount;
    const candidateCars = CAR_CATALOG.filter((c) => c.category === config.car.category);

    for (let i = 0; i < actualBots; i++) {
      const profile = BOT_ROSTER[(i * 7 + config.track.seed) % BOT_ROSTER.length];
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

      const startProg =
        config.mode === 'drag'
          ? 0.0
          : (0.012 * (i + 1)) % 0.9;
      const laneOff = config.mode === 'drag' ? 4.2 : ((i % 2 === 0 ? 1 : -1) * 3.1);

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
      });
    }

    // Build Weather Particle Cloud (Rain / Snow / Sand / Sakura / Acid Rain)
    this.buildWeatherParticles(config.weather);
    this.updateAtmosphereAndSky(0);

    // Reset counters
    this.playerLap = 1;
    this.lastSplineProgress = 0;
    this.countdownSec = 3.0;
    this.lapStartSec = this.elapsedSec + 3.0;
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
      nationality: config.track.country,
      relation: 'race_control',
      text: `Grid alinhado em ${config.track.name}! Clima: ${config.weather.name}. Prepare-se para a largada!`,
      lang: 'pt-BR',
    });
  }

  private buildWeatherParticles(weather: WeatherPreset): void {
    if (this.precipPoints) {
      this.scene.remove(this.precipPoints);
      this.precipPoints = null;
    }
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

    // Solar elevation curve: sunrise ~6h, zenith 12h, sunset ~18h
    const sunAngle = ((this.hourOfDay - 6) / 24) * Math.PI * 2;
    const sunElev = Math.sin(sunAngle);
    const dayFactor = THREE.MathUtils.clamp((sunElev + 0.18) / 0.55, 0.04, 1.0);
    const isGoldenHour = Math.abs(sunElev) < 0.26;

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

    this.scene.background = skyMix;
    this.scene.fog = new THREE.FogExp2(skyMix.getHex(), this.currentWeather.visibilityFog);

    this.sunLight.intensity = lightningFlash ? 6.5 : 0.2 + dayFactor * 2.4;
    this.sunLight.color.setHex(isGoldenHour ? 0xffae42 : dayFactor < 0.2 ? 0x6488ea : 0xfff5e4);
    this.hemiLight.intensity = 0.25 + dayFactor * 0.65;

    if (this.playerRig) {
      this.sunLight.position.set(
        this.playerBody.x + Math.cos(sunAngle) * 110,
        Math.max(25, Math.sin(sunAngle) * 160 + 40),
        this.playerBody.z + 75
      );
      this.sunLight.target.position.set(this.playerBody.x, this.playerBody.y, this.playerBody.z);
      this.sunLight.target.updateMatrixWorld();
    }
  }

  public recoverCarToTrack(): void {
    if (!this.trackWorld) return;
    const nearest = this.trackWorld.sampleNearest(this.playerBody.x, this.playerBody.z);
    const heading = Math.atan2(nearest.tangent.x, nearest.tangent.z);
    this.playerBody.x = nearest.point.x;
    this.playerBody.y = nearest.point.y;
    this.playerBody.z = nearest.point.z;
    this.playerBody.vx = 0;
    this.playerBody.vy = 0;
    this.playerBody.vz = 0;
    this.playerBody.headingRad = heading;
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

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  public setPhotoMode(active: boolean, opts?: { fov?: number; rollDeg?: number; hourOfDay?: number; exposure?: number }): void {
    this.photoModeActive = active;
    this.isPaused = active;
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
    }
  }

  public captureSnapshotDataUrl(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
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
    const keep = new Set<THREE.Object3D>([this.hemiLight, this.sunLight, this.sunLight.target]);
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
      const ch = this.scene.children[i];
      if (!keep.has(ch)) {
        this.scene.remove(ch);
      }
    }
    this.smokeParticles = [];
    this.activeProjectiles = [];
    this.precipPoints = null;
    this.ghostMesh = null;
  }

  private startLoop(): void {
    const tick = (now: number) => {
      this.animFrameId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.lastPerfNow) / 1000);
      this.lastPerfNow = now;
      if (!this.isPaused) {
        this.elapsedSec += dt;
      }

      if (this.sceneMode === 'garage') {
        this.stepGarage(dt);
      } else {
        this.stepRace(dt);
      }

      this.renderer.render(this.scene, this.camera);
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

    const cx = Math.sin(this.garageOrbitYaw) * Math.cos(this.garageOrbitPitch) * this.garageZoomDist;
    const cy = Math.sin(this.garageOrbitPitch) * this.garageZoomDist + 0.75;
    const cz = Math.cos(this.garageOrbitYaw) * Math.cos(this.garageOrbitPitch) * this.garageZoomDist;
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(0, 0.65, 0);
  }

  private stepRace(dt: number): void {
    if (!this.trackWorld || !this.playerRig) return;

    if (this.photoModeActive) {
      const px = this.playerBody.x + Math.sin(this.photoOrbitYaw) * Math.cos(this.photoOrbitPitch) * this.photoDist;
      const py = this.playerBody.y + Math.sin(this.photoOrbitPitch) * this.photoDist + 0.9;
      const pz = this.playerBody.z + Math.cos(this.photoOrbitYaw) * Math.cos(this.photoOrbitPitch) * this.photoDist;
      this.camera.position.set(px, py, pz);
      this.camera.lookAt(this.playerBody.x, this.playerBody.y + 0.65, this.playerBody.z);
      this.camera.rotation.z = THREE.MathUtils.degToRad(this.photoRollDeg);
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

    if (this.isPaused) {
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

    // Pre-race Countdown
    if (this.countdownSec > 0) {
      this.countdownSec = Math.max(0, this.countdownSec - dt);
    }

    // Gather Player Controls (Keyboard + Touch)
    const rawThrottle =
      this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : this.touchControls.throttle;
    const rawBrake =
      this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : this.touchControls.brake;
    const steerLeft = this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0;
    const steerRight = this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0;
    const rawSteer = steerLeft - steerRight || -this.touchControls.steer;
    const handbrake = this.keys.has('Space') || this.touchControls.handbrake;
    const nitroInput = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchControls.nitro;

    // Drag Reaction Time Measurement
    if (this.currentMode === 'drag' && this.countdownSec <= 0 && this.dragReactionMs === null && rawThrottle > 0.2) {
      this.dragReactionMs = Math.round(Math.random() * 45 + 95);
    }

    const canMove = this.countdownSec <= 0 && !this.raceFinished;
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
          this.isPaused = true;
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
          window.setTimeout(() => {
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
          window.setTimeout(() => {
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

    // Soft Guardrail Elastic Containment so player never falls into infinite void
    const maxAllowedOut = halfRoad + 7.5;
    if (Math.abs(nearest.lateralOffset) > maxAllowedOut && this.currentMode !== 'derby') {
      const rightX = nearest.tangent.z;
      const rightZ = -nearest.tangent.x;
      const sign = Math.sign(nearest.lateralOffset);
      this.playerBody.x = nearest.point.x - rightX * sign * (maxAllowedOut - 0.3);
      this.playerBody.z = nearest.point.z - rightZ * sign * (maxAllowedOut - 0.3);
      this.playerBody.vx *= 0.68;
      this.playerBody.vz *= 0.68;
      this.playerBody.applyImpact(speedKmh * 0.45, sign > 0 ? 'left' : 'right', this.damageEnabled);
      this.packageIntegrityPct = Math.max(0, this.packageIntegrityPct - 4);
      audioEngine.triggerCollision(0.45);
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

    // Tire Smoke & Rim Sparks Particles!
    if ((maxSlip > 0.28 && speedKmh > 25) || this.playerBody.wheels[0].punctured) {
      this.spawnTireSmokeOrSpark(this.playerBody.wheels[0].punctured);
    }
    this.updateParticlesAndDestructibles(dt, speedKmh);

    // Update Player 3D Mesh
    this.playerRig.root.position.set(this.playerBody.x, this.playerBody.y, this.playerBody.z);
    this.playerRig.root.rotation.y = this.playerBody.headingRad;
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
    };

    if (this.telemetryLog.length < 4500 && Math.floor(this.elapsedSec * 10) > this.telemetryLog.length) {
      this.telemetryLog.push(frame);
    }
    this.callbacks.onTelemetry(frame);
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

      // Compute curvature ahead to brake realistically for corners!
      const aheadProg = (b.splineProgress + 0.025) % 1;
      const pNow = this.trackWorld.curve.getTangentAt(b.splineProgress);
      const pAhead = this.trackWorld.curve.getTangentAt(aheadProg);
      const turnSharpness = 1 - Math.max(-1, Math.min(1, pNow.dot(pAhead)));

      const skillFactor = 0.72 + (b.profile.skill / 10) * 0.34;
      const weatherAdapt = 1 - (1 - this.currentWeather.gripMultiplier) * (1.2 - b.profile.adaptability * 0.06);
      const baseTopMs = Math.min(92, (b.carSpec.topSpeedKmh / 3.6) * 0.78 * skillFactor * weatherAdapt);
      const cornerCapMs = Math.max(17, baseTopMs * (1 - turnSharpness * 3.1));

      const desiredSpeed = canMove ? cornerCapMs : 0;
      b.speedMs += (desiredSpeed - b.speedMs) * Math.min(1, dt * 3.2);

      // Rivalry / Ally tactical lane behavior when near player!
      const distToPlayer = b.rig.root.position.distanceTo(this.playerRig!.root.position);
      if (distToPlayer < 24) {
        const playerNear = this.trackWorld.sampleNearest(this.playerBody.x, this.playerBody.z);
        if (b.rivalryScore >= 2 || b.isPolice || b.profile.aggression >= 8) {
          // Rival or Police tries to close the door / block player's lane!
          b.targetLaneOffset = THREE.MathUtils.clamp(playerNear.lateralOffset, -5, 5);
        } else if (b.rivalryScore <= -1 || b.profile.sportsmanship >= 8) {
          // Gentleman / Ally opens space cleanly!
          b.targetLaneOffset = playerNear.lateralOffset >= 0 ? -3.8 : 3.8;
        }
      } else if (Math.random() < dt * 0.3) {
        b.targetLaneOffset = (Math.random() - 0.5) * (this.trackWorld.roadWidth * 0.6);
      }

      b.laneOffset += (b.targetLaneOffset - b.laneOffset) * Math.min(1, dt * 2.5);

      const prevProg = b.splineProgress;
      b.splineProgress += (b.speedMs * dt) / Math.max(120, len);
      if (this.trackWorld.isClosedLoop) {
        if (b.splineProgress >= 1) {
          b.splineProgress -= 1;
          b.lap++;
        }
      } else {
        b.splineProgress = Math.min(0.995, b.splineProgress);
      }
      void prevProg;

      const pt = this.trackWorld.curve.getPointAt(b.splineProgress);
      const tan = this.trackWorld.curve.getTangentAt(b.splineProgress).normalize();
      const rightX = tan.z;
      const rightZ = -tan.x;

      const bx = pt.x - rightX * b.laneOffset;
      const bz = pt.z - rightZ * b.laneOffset;
      const heading = Math.atan2(tan.x, tan.z);

      b.rig.root.position.set(bx, pt.y, bz);
      b.rig.root.rotation.y = heading;

      b.rig.updateRealtimeVisuals({
        dt,
        speedKmh: b.speedMs * 3.6,
        steering: (b.targetLaneOffset - b.laneOffset) * 0.25,
        wheelSpinRad: this.elapsedSec * b.speedMs * 2.2,
        brakeTempC: turnSharpness > 0.04 ? 520 : 180,
        engineTempC: 94,
        backfireActive: turnSharpness > 0.06 && Math.random() < 0.2,
        nitroActive: false,
        doorsOpen: false,
        hoodOpen: false,
        trunkOpen: false,
        cfdVisible: false,
        bassEnergy: 0,
        pitchRad: 0,
        rollRad: 0,
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

      // Car-to-Car Collision, Rivalry System & Multiplayer Anti-Troll Analysis!
      if (distToPlayer < 2.95) {
        const pushX = this.playerBody.x - bx;
        const pushZ = this.playerBody.z - bz;
        const pLen = Math.max(0.1, Math.hypot(pushX, pushZ));
        this.playerBody.x += (pushX / pLen) * 0.95;
        this.playerBody.z += (pushZ / pLen) * 0.95;
        this.playerBody.vx *= 0.82;
        this.playerBody.vz *= 0.82;

        const impactKmh = Math.max(20, relSpeed);
        this.playerBody.applyImpact(impactKmh, 'front', this.damageEnabled && this.shieldTimer <= 0);
        this.packageIntegrityPct = Math.max(0, this.packageIntegrityPct - 9);
        audioEngine.triggerCollision(0.75);

        if (this.currentMode === 'derby') {
          b.health -= 34;
        }

        // Anti-Troll Detector in Multiplayer Mode: Did the player steer directly toward the bot?
        if (this.currentMode === 'multiplayer' && Math.abs(playerSteer) > 0.45 && playerSpeedKmh > 60) {
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
        if (this.elapsedSec - b.lastFlybyTime > 1.8) {
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

  private spawnTireSmokeOrSpark(isSpark: boolean): void {
    if (this.smokeParticles.length > 55) return;
    const smokeColor = isSpark
      ? 0xff9500
      : this.currentTune.tireCompound === 'drift'
      ? 0xff007f
      : 0xd8dee9;
    const m = new THREE.Mesh(
      isSpark ? new THREE.BoxGeometry(0.12, 0.12, 0.35) : new THREE.SphereGeometry(0.32, 6, 6),
      new THREE.MeshBasicMaterial({
        color: smokeColor,
        transparent: true,
        opacity: isSpark ? 0.95 : 0.42,
      })
    );
    const bx = this.playerBody.x - Math.sin(this.playerBody.headingRad) * 1.6 + (Math.random() - 0.5) * 1.2;
    const bz = this.playerBody.z - Math.cos(this.playerBody.headingRad) * 1.6 + (Math.random() - 0.5) * 1.2;
    m.position.set(bx, this.playerBody.y + 0.22, bz);
    this.scene.add(m);
    this.smokeParticles.push({
      mesh: m,
      life: isSpark ? 0.35 : 0.85,
      vx: (Math.random() - 0.5) * 2.5,
      vy: isSpark ? 3.5 : 1.4,
      vz: (Math.random() - 0.5) * 2.5,
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

    // Smoke & Sparks
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
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

    // Dynamic speed FOV sensation!
    const targetFov = 56 + Math.min(22, speedKmh * 0.065);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 6);
    this.camera.updateProjectionMatrix();
    this.camera.rotation.z = 0;

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
      this.camera.position.lerp(new THREE.Vector3(px - fx * 24 + 12, py + 19, pz - fz * 24 + 12), Math.min(1, dt * 5));
      this.camera.lookAt(px + fx * 6, py + 0.8, pz + fz * 6);
    } else {
      const dist = this.cameraView === 'chase_far' ? 8.6 : 6.1;
      const height = this.cameraView === 'chase_far' ? 3.2 : 2.25;
      const desired = new THREE.Vector3(px - fx * dist, py + height, pz - fz * dist);
      this.camera.position.lerp(desired, Math.min(1, dt * 11));
      this.camera.lookAt(px + fx * 6.5, py + 0.95, pz + fz * 6.5);
    }
  }

  public dispose(): void {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.renderer.dispose();
  }
}
