import React, { useEffect, useRef, useState } from 'react';
import {
  Car,
  Clapperboard,
  DoorOpen,
  Flag,
  Flame,
  Globe,
  Hammer,
  Home,
  Music2,
  Play,
  RotateCcw,
  Settings,
  ShieldAlert,
  Smartphone,
  Speaker,
  Volume2,
  VolumeX,
  Trophy,
  Wallet,
  Wind,
  Wrench,
} from 'lucide-react';
import {
  CameraView,
  CareerChapter,
  CareerChoice,
  CarSpec,
  CarTuneSetup,
  CustomTrackData,
  GameMode,
  LiveTelemetryFrame,
  RadioMessage,
  SavedPoster,
  TrackSpec,
  WeatherPreset,
} from './types/game';
import { CAR_CATALOG, createDefaultTuneForCar } from './data/carCatalog';
import { TRACK_CATALOG } from './data/trackCatalog';
import { WEATHER_PRESETS } from './data/weatherCatalog';
import { VelocityEngine } from './engine/VelocityEngine';
import { AssistMode } from './engine/PacejkaPhysics';
import { TuningCathedralModal } from './components/TuningCathedralModal';
import { CarVaultModal } from './components/CarVaultModal';
import { TrackGlobeModal } from './components/TrackGlobeModal';
import { CareerStoryPanel } from './components/CareerStoryPanel';
import { TrackEditorModal } from './components/TrackEditorModal';
import { CompanionAppModal, TelemetryOverlay } from './components/TelemetryAndCompanion';
import { SoundtrackModal } from './components/SoundtrackModal';
import {
  CinemaLut,
  LUT_CSS_FILTERS,
  PhotoModeStudio,
  RaceHud,
} from './components/RaceHudAndPhotoMode';
import { audioEngine, RADIO_STATIONS } from './audio/VelocityAudioEngine';
import { customMusicMedia } from './audio/CustomMusicMedia';
import { GameSettings, SettingsModal } from './components/SettingsModal';
import { PhotoCreditsModal } from './components/PhotoCreditsModal';
import { setPhotographicAssetsEnabled } from './render/PhotographicAssets';
import { PauseMenu } from './components/PauseMenu';
import { ScreenVeil } from './components/ScreenVeil';

type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

const SETTINGS_KEY = 'velocity_settings_v1';

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 1,
  engineVolume: 1,
  sfxVolume: 1,
  musicVolume: 0.85,
  customVolume: 0.8,
  muted: false,
  pixelRatioCap: 2,
  bloomEnabled: true,
  cameraShakeEnabled: true,
  speedBlurEnabled: true,
  invertSteering: false,
  colorblindMode: 'none',
  photographicAssets: true,
};

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const coarse = window.matchMedia?.('(pointer: coarse)').matches;
      return coarse ? { ...DEFAULT_SETTINGS, pixelRatioCap: 1 } : DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const DEFAULT_CUSTOM_TRACK: CustomTrackData = {
  name: 'Circuito Autoral Velocity #01',
  biome: 'interlagos_br',
  roadWidth: 16,
  points: [
    { x: 0, y: 0, z: -220 },
    { x: 210, y: 8, z: -140 },
    { x: 250, y: 16, z: 90 },
    { x: 90, y: 12, z: 230 },
    { x: -160, y: 6, z: 200 },
    { x: -240, y: 0, z: -20 },
  ],
};

export const App: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VelocityEngine | null>(null);
  const raceConfigRef = useRef<Parameters<VelocityEngine['startRace']>[0] | null>(null);

  // Core Game Progression & Economy (100% Ethical — Zero Microtransactions)
  const [credits, setCredits] = useState(65000);
  const [reputation, setReputation] = useState(120);
  const [morality, setMorality] = useState(50);
  const [driverName, setDriverName] = useState('Piloto Lenda BR');
  const [driverPersona, setDriverPersona] = useState<'fair_play' | 'showman' | 'implacavel'>('fair_play');
  const [garageTier, setGarageTier] = useState<1 | 2 | 3>(1);
  const [trophyCount, setTrophyCount] = useState(2);
  const [posters, setPosters] = useState<SavedPoster[]>([]);

  const [ownedCarIds, setOwnedCarIds] = useState<Set<string>>(
    () =>
      new Set([
        'fiat-uno-2005-raiz',
        'orig-solis-tupa-x1',
        'mclaren-mp4-4-senna',
        'mercedes-300sl-gullwing',
        'revolt-toyeca-pro',
        'bugatti-chiron-300',
      ])
  );
  const [unlockedEasterIds, setUnlockedEasterIds] = useState<Set<string>>(() => new Set());
  const [producerUnlockAll, setProducerUnlockAll] = useState(true);

  const [selectedCar, setSelectedCar] = useState<CarSpec>(() => CAR_CATALOG[0]);
  const [tunesByCar, setTunesByCar] = useState<Record<string, CarTuneSetup>>(() => ({
    [CAR_CATALOG[0].id]: createDefaultTuneForCar(CAR_CATALOG[0]),
  }));

  // Track, Weather & Mode Config
  const [selectedTrack, setSelectedTrack] = useState<TrackSpec>(() => TRACK_CATALOG[0]); // Interlagos!
  const [selectedWeather, setSelectedWeather] = useState<WeatherPreset>(() => WEATHER_PRESETS[2]);
  const [selectedMode, setSelectedMode] = useState<GameMode>('quick_race');
  const [laps, setLaps] = useState(3);
  const [botCount, setBotCount] = useState(11);
  const [botDifficulty, setBotDifficulty] = useState(6);
  const [hourOfDay, setHourOfDay] = useState(15.0);
  const [assistMode, setAssistMode] = useState<AssistMode>('pro');
  const [damageEnabled, setDamageEnabled] = useState(true);
  const [tireWearEnabled, setTireWearEnabled] = useState(true);
  const [fuelEnabled, setFuelEnabled] = useState(true);
  const [layoutVariant, setLayoutVariant] = useState<'GP' | 'National' | 'Sprint'>('GP');
  const [customTrack, setCustomTrack] = useState<CustomTrackData | null>(null);

  // Career Chapters
  const [completedChapters, setCompletedChapters] = useState<Set<number>>(() => new Set());
  const [chosenCareerOptions, setChosenCareerOptions] = useState<Record<number, string>>({});
  const [activeCareerChapter, setActiveCareerChapter] = useState<number | null>(null);

  // Scene & UI Modals
  const [inRace, setInRace] = useState(false);
  const [activeModal, setActiveModal] = useState<
    'none' | 'cars' | 'tuning' | 'tracks' | 'career' | 'editor' | 'companion' | 'soundtrack'
  >('none');

  // Garage Interactive State
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [hoodOpen, setHoodOpen] = useState(false);
  const [trunkOpen, setTrunkOpen] = useState(false);
  const [cfdVisible, setCfdVisible] = useState(false);
  const [spotIntensity, setSpotIntensity] = useState(48);

  // Live Race HUD, Telemetry, Radio, Photo & Accessibility
  const [telemetryFrame, setTelemetryFrame] = useState<LiveTelemetryFrame | null>(null);
  const [radioFeed, setRadioFeed] = useState<RadioMessage[]>([]);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [immersiveNoHud, setImmersiveNoHud] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView>('chase_near');
  const [psxRetro, setPsxRetro] = useState(false);
  const [muted, setMuted] = useState(false);
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>('none');
  const [paused, setPaused] = useState(false);
  const [minimapData, setMinimapData] = useState<ReturnType<
    NonNullable<typeof engineRef.current>['getMinimapData']
  >>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPhotoCredits, setShowPhotoCredits] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);

  // Photo Mode Studio
  const [photoMode, setPhotoMode] = useState(false);
  const [photoLut, setPhotoLut] = useState<CinemaLut>('kodak_portra');
  const [photoFov, setPhotoFov] = useState(46);
  const [photoRoll, setPhotoRoll] = useState(0);
  const [photoExposure, setPhotoExposure] = useState(1.15);
  const [photoVignette, setPhotoVignette] = useState(0.35);

  // End-of-Race & Sheep Disqualification Screens
  const [raceResult, setRaceResult] = useState<{
    position: number;
    totalRacers: number;
    totalTimeSec: number;
    bestLapSec: number | null;
    driftScore: number;
    stuntScore: number;
    deliveries: number;
    earnedCredits: number;
  } | null>(null);
  const [sheepDisqualified, setSheepDisqualified] = useState(false);

  const activeTune = tunesByCar[selectedCar.id] ?? createDefaultTuneForCar(selectedCar);

  // Initialize 3D Velocity Engine once
  useEffect(() => {
    if (!viewportRef.current) return;
    const engine = new VelocityEngine(viewportRef.current, {
      onTelemetry: (frame) => {
        setTelemetryFrame(frame);
        const currentCamera = engineRef.current?.getCameraView();
        if (currentCamera) setCameraView(currentCamera);
        // One read per telemetry tick: the map is static geometry plus live
        // points, so there is no reason to re-read it every animation frame.
        setMinimapData(engineRef.current?.getMinimapData() ?? null);
      },
      onRadioMessage: (msg) => setRadioFeed((prev) => [...prev.slice(-8), msg]),
      onSheepDisqualification: () => setSheepDisqualified(true),
      onPauseChanged: (p) => setPaused(p),
      onRaceFinished: (res) => {
        const podiumBonus = res.position === 1 ? 35000 : res.position <= 3 ? 20000 : 8500;
        const styleBonus = Math.round(res.driftScore * 0.4 + res.stuntScore * 0.5 + res.deliveries * 4500);
        const earned = podiumBonus + styleBonus;
        setCredits((c) => c + earned);
        if (res.position <= 3) setTrophyCount((t) => t + 1);
        setRaceResult({ ...res, earnedCredits: earned });
      },
    });
    engineRef.current = engine;

    engine.enterGarage({
      car: selectedCar,
      tune: activeTune,
      garageTier,
      trophyCount,
      posters,
    });

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply + persist settings (audio buses, render quality, steering).
  // First real user gesture: browsers only unlock audio from an input event.
  // One listener, removed immediately, so the MP3 player and the engine come
  // alive on the first click/tap instead of staying silent.
  useEffect(() => {
    // Restore the imported MP3 queue on startup. Without this the HUD's
    // mini-player only worked if the player had opened the music modal first.
    void customMusicMedia.refresh().catch(() => {});
    const unlock = () => {
      audioEngine.unlock();
      audioEngine.retryPendingCustomPlayback();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable — settings still apply for the session
    }
    audioEngine.setMuted(settings.muted);
    audioEngine.setMasterVolume(settings.masterVolume);
    audioEngine.setEngineVolume(settings.engineVolume);
    audioEngine.setSfxVolume(settings.sfxVolume);
    audioEngine.setMusicVolume(settings.musicVolume);
    audioEngine.setCustomVolume(settings.customVolume);
    // Photographic PBR pass: apply the global flag even when no engine exists
    // yet, then swap the maps of the live scene in one traversal.
    const photoPass = settings.photographicAssets !== false;
    setPhotographicAssetsEnabled(photoPass);
    engineRef.current?.setPhotographicAssetsEnabled(photoPass);
    setMuted(settings.muted);
    setColorblindMode(settings.colorblindMode);
    const engine = engineRef.current;
    if (engine) {
      engine.setPixelRatioCap(settings.pixelRatioCap);
      engine.setBloomEnabled(settings.bloomEnabled);
      engine.setCameraShakeEnabled(settings.cameraShakeEnabled);
      engine.setSpeedBlurEnabled(settings.speedBlurEnabled);
      engine.setInvertSteering(settings.invertSteering);
    }
  }, [settings]);

  // Refresh 3D Garage whenever car, tune, garage tier, or posters change while in Garage
  useEffect(() => {
    if (!inRace && engineRef.current) {
      engineRef.current.enterGarage({
        car: selectedCar,
        tune: activeTune,
        garageTier,
        trophyCount,
        posters,
      });
    }
  }, [selectedCar, activeTune, garageTier, trophyCount, posters, inRace]);

  // A showroom rebuild replaces the lights and car rig; restore the controls
  // to the new objects instead of leaving the UI and scene out of sync.
  useEffect(() => {
    if (!inRace) engineRef.current?.setGarageInteractiveState({ doorsOpen, hoodOpen, trunkOpen, cfdVisible, spotIntensity });
  }, [inRace, selectedCar, activeTune, garageTier, trophyCount, posters, doorsOpen, hoodOpen, trunkOpen, cfdVisible, spotIntensity]);

  const handleSelectCar = (car: CarSpec) => {
    setSelectedCar(car);
    if (!tunesByCar[car.id]) {
      setTunesByCar((prev) => ({ ...prev, [car.id]: createDefaultTuneForCar(car) }));
    }
    setDoorsOpen(car.id === 'mercedes-300sl-gullwing');
    setHoodOpen(false);
    setTrunkOpen(false);
  };

  const launchRaceSession = (override?: {
    track?: TrackSpec;
    mode?: GameMode;
    laps?: number;
    custom?: CustomTrackData | null;
  }) => {
    if (!engineRef.current) return;
    const tr = override?.track ?? selectedTrack;
    const md = override?.mode ?? selectedMode;
    const lp = override?.laps ?? laps;
    const w = WEATHER_PRESETS.find((x) => x.id === tr.defaultWeatherId) ?? selectedWeather;

    if (override?.track) {
      setSelectedTrack(tr);
      setSelectedWeather(w);
    }
    if (override?.mode) setSelectedMode(md);
    if (override?.laps !== undefined) setLaps(lp);

    startRaceSession({
      car: selectedCar,
      tune: activeTune,
      track: tr,
      weather: override?.track ? w : selectedWeather,
      mode: md,
      laps: lp,
      botCount,
      botDifficulty,
      hourOfDay,
      assistMode,
      damageEnabled,
      tireWearEnabled,
      fuelEnabled,
      layoutVariant,
      customTrack: override?.custom !== undefined ? override.custom : customTrack,
    });
  };

  const startRaceSession = (config: Parameters<VelocityEngine['startRace']>[0]) => {
    const engine = engineRef.current;
    if (!engine) return;
    raceConfigRef.current = config;
    setActiveModal('none');
    setRaceResult(null);
    setSheepDisqualified(false);
    setRadioFeed([]);
    setTelemetryFrame(null);
    setMinimapData(null);
    setPhotoMode(false);
    setPaused(false);
    setInRace(true);
    engine.startRace(config);
    setCameraView(engine.getCameraView());
  };

  const restartRaceSession = () => {
    if (raceConfigRef.current) startRaceSession(raceConfigRef.current);
  };

  const returnToGarage = () => {
    engineRef.current?.setPaused(false);
    setPaused(false);
    setInRace(false);
    setPhotoMode(false);
    setRaceResult(null);
    setSheepDisqualified(false);
    if (activeCareerChapter !== null && raceResult && raceResult.position <= 3) {
      setCompletedChapters((prev) => new Set(prev).add(activeCareerChapter));
      if (activeCareerChapter >= 5 && garageTier < 2) setGarageTier(2);
      if (activeCareerChapter >= 18 && garageTier < 3) setGarageTier(3);
    }
    setActiveCareerChapter(null);
  };

  const accessibilityFilter =
    colorblindMode === 'protanopia'
      ? 'hue-rotate(18deg) saturate(1.15)'
      : colorblindMode === 'deuteranopia'
      ? 'hue-rotate(-22deg) contrast(1.08)'
      : colorblindMode === 'tritanopia'
      ? 'sepia(0.22) saturate(1.3)'
      : '';

  const combinedCanvasFilter = [
    photoMode ? LUT_CSS_FILTERS[photoLut] : '',
    accessibilityFilter,
  ]
    .filter(Boolean)
    .join(' ') || 'none';

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Smooth transition between garage / race / result */}
      <ScreenVeil
        screenKey={inRace ? (raceResult ? 'result' : 'race') : 'garage'}
        label={
          inRace
            ? raceResult
              ? 'Bandeirada final'
              : `${selectedTrack.name.split('—')[0].trim()} • ${selectedMode === 'drift' ? 'Drift' : 'Corrida'}`
            : 'Garagem'
        }
      />
      {/* Live 3D VELOCITY ENGINE WebGL2 Canvas */}
      <div
        ref={viewportRef}
        style={{
          position: 'absolute',
          inset: 0,
          filter: combinedCanvasFilter,
        }}
      />

      {/* Photo Mode Bokeh Vignette Overlay */}
      {photoMode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            boxShadow: `inset 0 0 160px rgba(0,0,0,${photoVignette})`,
            zIndex: 20,
          }}
        />
      )}

      {/* Garage navigation leaves the car and studio visible. */}
      {!inRace && (
        <div className="garage-ui">
          <header className="garage-header">
            <div className="garage-brand">R<span>-</span>volt <small>RACING</small></div>
            <div className="garage-header-actions">
              <span className="garage-balance"><Wallet size={15} /> V$ {credits.toLocaleString('pt-BR')}</span>
              <button className="garage-icon" onClick={() => setSettings((s) => ({ ...s, muted: !s.muted }))} aria-label={muted ? 'Ativar áudio' : 'Silenciar áudio'} title={muted ? 'Ativar áudio' : 'Silenciar áudio'}>
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <button className="garage-icon" onClick={() => setShowSettings(true)} aria-label="Configurações" title="Configurações"><Settings size={17} /></button>
            </div>
          </header>

          <section className="garage-car-card" aria-label="Carro selecionado">
            <div className="garage-eyebrow">SUA GARAGEM <span> / </span> CARRO ATUAL</div>
            <h1>{selectedCar.name}</h1>
            <p>{selectedCar.brand} · {selectedCar.year} · {selectedCar.drivetrain}</p>
            <div className="garage-stats">
              <div><span>POTÊNCIA</span><strong>{selectedCar.horsepower} <small>cv</small></strong></div>
              <div><span>0–100 KM/H</span><strong>{selectedCar.zeroToHundredSec} <small>s</small></strong></div>
              <div><span>MÁXIMA</span><strong>{selectedCar.topSpeedKmh} <small>km/h</small></strong></div>
            </div>
            <button className="garage-text-button" onClick={() => setActiveModal('cars')}>Trocar de carro <span>→</span></button>
            <details className="garage-details">
              <summary>Inspecionar carro</summary>
              <div className="garage-inspection">
                <button onClick={() => { const next = !doorsOpen; setDoorsOpen(next); engineRef.current?.setGarageInteractiveState({ doorsOpen: next }); }}><DoorOpen size={14} /> {doorsOpen ? 'Fechar portas' : 'Abrir portas'}</button>
                <button onClick={() => { const next = !hoodOpen; setHoodOpen(next); engineRef.current?.setGarageInteractiveState({ hoodOpen: next }); }}><Wrench size={14} /> {hoodOpen ? 'Fechar capô' : 'Abrir capô'}</button>
                <button onClick={() => { const next = !trunkOpen; setTrunkOpen(next); engineRef.current?.setGarageInteractiveState({ trunkOpen: next }); }}><Speaker size={14} /> {trunkOpen ? 'Fechar mala' : 'Abrir mala'}</button>
                <button onClick={() => engineRef.current?.revEngineInGarage()}><Flame size={14} /> Acelerar motor</button>
                <button onClick={() => { const next = !cfdVisible; setCfdVisible(next); engineRef.current?.setGarageInteractiveState({ cfdVisible: next }); }}><Wind size={14} /> {cfdVisible ? 'Desligar CFD' : 'Fluxo CFD'}</button>
                <label>Iluminação: {spotIntensity}W<input type="range" min={8} max={95} value={spotIntensity} onChange={(e) => { const v = Number(e.target.value); setSpotIntensity(v); engineRef.current?.setGarageInteractiveState({ spotIntensity: v }); }} /></label>
                <label>Garagem<select value={garageTier} onChange={(e) => setGarageTier(Number(e.target.value) as 1 | 2 | 3)}><option value={1}>Galpão</option><option value={2}>Oficina Pro</option><option value={3}>Showroom Mônaco</option></select></label>
              </div>
            </details>
          </section>

          <div className="garage-hint">ARRASTE PARA GIRAR <span>·</span> ROLE PARA APROXIMAR</div>
          <nav className="garage-nav" aria-label="Menu principal">
            <div className="garage-nav-links">
              <button onClick={() => setActiveModal('cars')}><Car size={17} /> Carros</button>
              <button onClick={() => setActiveModal('tuning')}><Wrench size={17} /> Preparação</button>
              <button onClick={() => setActiveModal('tracks')}><Globe size={17} /> Pistas</button>
              <button onClick={() => setActiveModal('career')}><Clapperboard size={17} /> Carreira</button>
              <details className="garage-more">
                <summary>Mais <span>⌃</span></summary>
                <div className="garage-more-menu">
                  <button onClick={() => setActiveModal('editor')}><Hammer size={16} /> Editor de pistas</button>
                  <button onClick={() => setActiveModal('soundtrack')}><Music2 size={16} /> Música</button>
                  <button onClick={() => setActiveModal('companion')}><Smartphone size={16} /> Companion</button>
                </div>
              </details>
            </div>
            <div className="garage-race">
              <div><span>PRÓXIMA CORRIDA</span><strong>{selectedTrack.name.split('—')[0].trim()}</strong></div>
              <button className="garage-start" onClick={() => launchRaceSession({ custom: null })}><Play size={16} fill="currentColor" /> CORRER</button>
            </div>
          </nav>
        </div>
      )}

      {/* ===================== GARAGE / GLOBAL MODALS ===================== */}
      {activeModal === 'cars' && (
        <CarVaultModal
          selectedCar={selectedCar}
          ownedIds={ownedCarIds}
          unlockedEasterIds={unlockedEasterIds}
          producerUnlockAll={producerUnlockAll}
          credits={credits}
          onToggleProducerUnlockAll={() => setProducerUnlockAll((p) => !p)}
          onSelectCar={handleSelectCar}
          onBuyCar={(car) => {
            if (credits >= car.priceCredits) {
              setCredits((c) => c - car.priceCredits);
              setOwnedCarIds((prev) => new Set(prev).add(car.id));
              handleSelectCar(car);
            }
          }}
          onSubmitSecretCode={(code) => {
            const match = CAR_CATALOG.find(
              (c) => c.secretUnlockCode && c.secretUnlockCode.toUpperCase() === code.trim().toUpperCase()
            );
            if (!match) return `Código "${code}" inválido. Confira a dica de puzzle no cartão do veículo!`;
            setUnlockedEasterIds((prev) => new Set(prev).add(match.id));
            handleSelectCar(match);
            return `DESBLOQUEADO! "${match.name}" agora está na sua Garagem 3D!`;
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'tuning' && (
        <TuningCathedralModal
          car={selectedCar}
          tune={activeTune}
          cfdVisible={cfdVisible}
          onToggleCfd={(vis) => {
            setCfdVisible(vis);
            engineRef.current?.setGarageInteractiveState({ cfdVisible: vis });
          }}
          onChangeTune={(next) =>
            setTunesByCar((prev) => ({
              ...prev,
              [selectedCar.id]: next,
            }))
          }
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'tracks' && (
        <TrackGlobeModal
          selectedTrack={selectedTrack}
          selectedWeather={selectedWeather}
          selectedMode={selectedMode}
          laps={laps}
          botCount={botCount}
          botDifficulty={botDifficulty}
          hourOfDay={hourOfDay}
          assistMode={assistMode}
          damageEnabled={damageEnabled}
          tireWearEnabled={tireWearEnabled}
          fuelEnabled={fuelEnabled}
          layoutVariant={layoutVariant}
          onUpdateConfig={(p) => {
            if (p.track) setSelectedTrack(p.track);
            if (p.weather) setSelectedWeather(p.weather);
            if (p.mode) setSelectedMode(p.mode);
            if (p.laps !== undefined) setLaps(p.laps);
            if (p.botCount !== undefined) setBotCount(p.botCount);
            if (p.botDifficulty !== undefined) setBotDifficulty(p.botDifficulty);
            if (p.hourOfDay !== undefined) setHourOfDay(p.hourOfDay);
            if (p.assistMode) setAssistMode(p.assistMode);
            if (p.damageEnabled !== undefined) setDamageEnabled(p.damageEnabled);
            if (p.tireWearEnabled !== undefined) setTireWearEnabled(p.tireWearEnabled);
            if (p.fuelEnabled !== undefined) setFuelEnabled(p.fuelEnabled);
            if (p.layoutVariant) setLayoutVariant(p.layoutVariant);
          }}
          onLaunchRace={() => launchRaceSession({ custom: null })}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'career' && (
        <CareerStoryPanel
          completedChapters={completedChapters}
          chosenOptions={chosenCareerOptions}
          driverName={driverName}
          driverPersona={driverPersona}
          reputation={reputation}
          morality={morality}
          onUpdateDriver={(nm, per) => {
            setDriverName(nm);
            setDriverPersona(per);
          }}
          onMakeChoice={(chNum, choice: CareerChoice) => {
            if (chosenCareerOptions[chNum]) return;
            setChosenCareerOptions((prev) => ({ ...prev, [chNum]: choice.id }));
            setCredits((c) => Math.max(0, c + choice.creditsDelta));
            setReputation((r) => r + choice.reputationDelta);
            setMorality((m) => m + choice.moralityDelta);
          }}
          onStartChapterRace={(chap: CareerChapter) => {
            const tr = TRACK_CATALOG.find((t) => t.id === chap.trackId) ?? TRACK_CATALOG[0];
            setSelectedTrack(tr);
            setSelectedMode(chap.mode);
            setLaps(chap.laps);
            setActiveCareerChapter(chap.chapterNumber);
            launchRaceSession({ track: tr, mode: chap.mode, laps: chap.laps, custom: null });
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'editor' && (
        <TrackEditorModal
          initialData={customTrack ?? DEFAULT_CUSTOM_TRACK}
          onTestTrack={(data) => {
            setCustomTrack(data);
            launchRaceSession({ custom: data, mode: 'quick_race', laps: 3 });
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'soundtrack' && <SoundtrackModal onClose={() => setActiveModal('none')} />}

      {activeModal === 'companion' && (
        <CompanionAppModal
          frame={telemetryFrame}
          credits={credits}
          carName={selectedCar.name}
          onEarnMiniGameCredits={(amt) => setCredits((c) => c + amt)}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* ===================== LIVE 3D RACE HUD & OVERLAYS ===================== */}
      {inRace && telemetryFrame && !photoMode && (
        <RaceHud
          frame={telemetryFrame}
          mode={selectedMode}
          totalLaps={laps}
          cameraView={cameraView}
          immersiveNoHud={immersiveNoHud}
          psxRetro={psxRetro}
          radioFeed={radioFeed}
          onCycleCamera={() => {
            if (engineRef.current) {
              setCameraView(engineRef.current.cycleCamera());
            }
          }}
          onToggleTelemetry={() => setShowTelemetry((s) => !s)}
          onTogglePhotoMode={() => {
            setPhotoMode(true);
            engineRef.current?.setPhotoMode(true, {
              fov: photoFov,
              rollDeg: photoRoll,
              exposure: photoExposure,
            });
          }}
          onToggleImmersiveHud={() => {
            engineRef.current?.setTouchInput({ throttle: 0, brake: 0, steer: 0 });
            setImmersiveNoHud((v) => !v);
          }}
          onTogglePsxRetro={() => {
            const next = !psxRetro;
            setPsxRetro(next);
            engineRef.current?.setPsxRetroMode(next);
          }}
          onBackToGarage={returnToGarage}
          onTogglePause={() => engineRef.current?.setPaused(!paused)}
          onHorn={() => audioEngine.horn()}
          minimap={minimapData}
          onTouchInput={(p) => engineRef.current?.setTouchInput(p)}
        />
      )}

      {/* Pause menu */}
      {inRace && paused && !photoMode && !raceResult && !sheepDisqualified && (
        <PauseMenu
          onResume={() => engineRef.current?.setPaused(false)}
          onRestart={restartRaceSession}
          onQuit={returnToGarage}
        />
      )}

      {/* Settings */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
          onShowPhotoCredits={() => setShowPhotoCredits(true)}
        />
      )}

      {showPhotoCredits && <PhotoCreditsModal onClose={() => setShowPhotoCredits(false)} />}

      {inRace && showTelemetry && telemetryFrame && !photoMode && (
        <TelemetryOverlay
          frame={telemetryFrame}
          onExportCsv={() => {
            if (!engineRef.current) return;
            const csv = engineRef.current.exportTelemetryCsv();
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `velocity_telemetry_${selectedTrack.id}.csv`;
            a.click();
          }}
          onClose={() => setShowTelemetry(false)}
        />
      )}

      {inRace && photoMode && (
        <PhotoModeStudio
          lut={photoLut}
          fov={photoFov}
          rollDeg={photoRoll}
          exposure={photoExposure}
          hourOfDay={hourOfDay}
          grainOpacity={0.1}
          vignetteStrength={photoVignette}
          onChange={(n) => {
            if (n.lut) setPhotoLut(n.lut);
            if (n.fov !== undefined) setPhotoFov(n.fov);
            if (n.rollDeg !== undefined) setPhotoRoll(n.rollDeg);
            if (n.exposure !== undefined) setPhotoExposure(n.exposure);
            if (n.hourOfDay !== undefined) setHourOfDay(n.hourOfDay);
            if (n.vignetteStrength !== undefined) setPhotoVignette(n.vignetteStrength);
            engineRef.current?.setPhotoMode(true, {
              fov: n.fov ?? photoFov,
              rollDeg: n.rollDeg ?? photoRoll,
              hourOfDay: n.hourOfDay,
              exposure: n.exposure ?? photoExposure,
            });
          }}
          onDownloadPng={() => {
            if (!engineRef.current) return;
            const url = engineRef.current.captureSnapshotDataUrl();
            const a = document.createElement('a');
            a.href = url;
            a.download = `velocity_photo_${Date.now()}.png`;
            a.click();
          }}
          onSaveToGarageWall={() => {
            if (!engineRef.current) return;
            const url = engineRef.current.captureSnapshotDataUrl();
            setPosters((prev) => [
              {
                id: String(Date.now()),
                title: `${selectedCar.name} @ ${selectedTrack.name}`,
                dataUrl: url,
                carName: selectedCar.name,
                trackName: selectedTrack.name,
              },
              ...prev,
            ]);
          }}
          onClose={() => {
            setPhotoMode(false);
            engineRef.current?.setPhotoMode(false);
          }}
        />
      )}

      {/* Mandatory Scottish Highlands Sheep Disqualification Screen! */}
      {sheepDisqualified && (
        <div style={centerOverlay}>
          <div style={{ ...resultCard, borderColor: '#ef233c' }}>
            <div className="vu-result-badge" style={{ borderColor: 'rgba(239,35,60,0.5)' }}>
              <ShieldAlert size={34} color="#ef233c" />
            </div>
            <h2 style={{ color: '#ef233c', margin: '8px 0' }}>
              CORRIDA ENCERRADA — RESPEITO AOS ANIMAIS!
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#e2e8f0', marginBottom: 18 }}>
              Você encostou em uma ovelha nas Terras Altas da Escócia! Conforme a cláusula inegociável da Seção 3.1-C do Produtor, o VELOCITY ENGINE recusa-se terminantemente a continuar qualquer corrida onde a fauna local não seja respeitada.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={restartRaceSession} style={dockBtn}>
                <RotateCcw size={15} /> Tentar novamente desviando
              </button>
              <button onClick={returnToGarage} style={dockBtn}>
                <Home size={15} /> Voltar à garagem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Podium / Race Finish Screen */}
      {raceResult && (
        <div style={centerOverlay}>
          <div style={resultCard}>
            <div
              className="vu-result-badge"
              style={{
                borderColor:
                  raceResult.position === 1
                    ? 'rgba(255,190,11,0.55)'
                    : 'rgba(255,255,255,0.18)',
              }}
            >
              {raceResult.position === 1 ? (
                <Trophy size={34} color="#ffbe0b" />
              ) : (
                <Flag size={34} color={raceResult.position <= 3 ? '#cbd5e1' : '#94a3b8'} />
              )}
            </div>
            <h2 style={{ margin: '6px 0' }}>
              BANDEIRADA FINAL — {raceResult.position}º LUGAR DE {raceResult.totalRacers}!
            </h2>
            <div style={{ fontSize: 14, color: '#00f5d4', fontWeight: 800, marginBottom: 12 }}>
              Recompensa Limpa Creditada: +V$ {raceResult.earnedCredits.toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 16, lineHeight: 1.7 }}>
              <div>Tempo Total: {raceResult.totalTimeSec.toFixed(2)}s</div>
              {raceResult.bestLapSec && <div>Melhor Volta: {raceResult.bestLapSec.toFixed(2)}s</div>}
              {raceResult.driftScore > 0 && <div>Pontuação Drift: {raceResult.driftScore.toLocaleString('pt-BR')} pts</div>}
              {raceResult.stuntScore > 0 && <div>Estilo Acrobacias: {raceResult.stuntScore.toLocaleString('pt-BR')} pts</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={restartRaceSession} style={dockBtn}>
                <RotateCcw size={15} /> Correr revanche
              </button>
              <button
                onClick={returnToGarage}
                style={{
                  ...dockBtn,
                  background: 'linear-gradient(90deg, #ff3b30, #ff9500)',
                  border: 'none',
                }}
              >
                <Home size={15} /> Celebrar na garagem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden quick-reference for radio stations initialization */}
      <div style={{ display: 'none' }}>{RADIO_STATIONS.length}</div>
    </div>
  );
};

const dockBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff',
  padding: '10px 14px',
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontFamily: 'inherit',
};

const centerOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(4, 7, 16, 0.85)',
  backdropFilter: 'blur(10px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 90,
  padding: 20,
};

const resultCard: React.CSSProperties = {
  maxWidth: 480,
  width: '100%',
  background: '#0d1426',
  border: '2px solid #ffbe0b',
  borderRadius: 18,
  padding: 26,
  textAlign: 'center',
};
