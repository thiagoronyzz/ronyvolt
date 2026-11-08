import React, { useEffect, useRef, useState } from 'react';
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
import {
  CinemaLut,
  LUT_CSS_FILTERS,
  PhotoModeStudio,
  RaceHud,
} from './components/RaceHudAndPhotoMode';
import { audioEngine, RADIO_STATIONS } from './audio/VelocityAudioEngine';

type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

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
    'none' | 'cars' | 'tuning' | 'tracks' | 'career' | 'editor' | 'companion'
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
      onTelemetry: (frame) => setTelemetryFrame(frame),
      onRadioMessage: (msg) => setRadioFeed((prev) => [...prev.slice(-8), msg]),
      onSheepDisqualification: () => setSheepDisqualified(true),
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

    setActiveModal('none');
    setRaceResult(null);
    setSheepDisqualified(false);
    setRadioFeed([]);
    setPhotoMode(false);
    setInRace(true);

    engineRef.current.startRace({
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

  const returnToGarage = () => {
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

      {/* ===================== 3D GARAGE SHOWROOM UI ===================== */}
      {!inRace && (
        <>
          {/* Top Producer Manifesto Header Bar */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: 52,
              background: 'linear-gradient(90deg, rgba(6,9,18,0.94), rgba(16,22,38,0.88))',
              borderBottom: '1px solid rgba(255,149,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 18px',
              zIndex: 30,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  background: 'linear-gradient(90deg, #ff3b30, #ff9500)',
                  padding: '4px 9px',
                  borderRadius: 6,
                  fontWeight: 900,
                  fontSize: 12,
                  letterSpacing: 1,
                }}
              >
                VELOCITY ENGINE v1.0
              </span>
              <div>
                <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0.8 }}>
                  VELOCITY UNCHAINED{' '}
                  <span style={{ fontSize: 11, color: '#ffbe0b', fontWeight: 700 }}>
                    • {CAR_CATALOG.length} Carros • {TRACK_CATALOG.length} Pistas • 47 Climas • 14 Modos
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ color: '#06d6a0', fontWeight: 900 }}>
                💰 V$ {credits.toLocaleString('pt-BR')}
              </span>
              <span style={{ color: '#ffbe0b', fontWeight: 800 }}>🏆 {trophyCount} Troféus</span>

              <select
                value={garageTier}
                onChange={(e) => setGarageTier(Number(e.target.value) as 1 | 2 | 3)}
                style={topChip}
                title="Evolução da Garagem 3D"
              >
                <option value={1}>🏚️ Nível 1: Galpão Raiz</option>
                <option value={2}>🔧 Nível 2: Oficina Pro</option>
                <option value={3}>💎 Nível 3: Showroom Mônaco</option>
              </select>

              <select
                value={colorblindMode}
                onChange={(e) => setColorblindMode(e.target.value as ColorblindMode)}
                style={topChip}
                title="Acessibilidade Visual (Seção 8.2)"
              >
                <option value="none">👁️ Cores Padrão</option>
                <option value="protanopia">👁️ Protanopia</option>
                <option value="deuteranopia">👁️ Deuteranopia</option>
                <option value="tritanopia">👁️ Tritanopia</option>
              </select>

              <button
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  audioEngine.setMuted(next);
                }}
                style={topChip}
              >
                {muted ? '🔇 Mudo' : '🔊 Áudio 3D'}
              </button>
            </div>
          </div>

          {/* Left Showroom Car Spec & Quick Legend Switcher */}
          <div
            style={{
              position: 'fixed',
              top: 66,
              left: 18,
              width: 'min(365px, 92vw)',
              background: 'rgba(8, 12, 24, 0.84)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.13)',
              borderRadius: 14,
              padding: 14,
              zIndex: 25,
            }}
          >
            <div style={{ fontSize: 10, color: '#ff9500', fontWeight: 800, letterSpacing: 1.3 }}>
              NA PLATAFORMA ROTATIVA 3D (ARRASTE E DÊ ZOOM!)
            </div>
            <h2 style={{ fontSize: 19, margin: '3px 0 4px' }}>{selectedCar.name}</h2>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
              {selectedCar.brand} ({selectedCar.year}) • {selectedCar.country} • Tração {selectedCar.drivetrain}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
              <div style={statCard}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>POTÊNCIA</span>
                <strong style={{ fontSize: 15, color: '#ffbe0b' }}>{selectedCar.horsepower} cv</strong>
              </div>
              <div style={statCard}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>0–100 KM/H</span>
                <strong style={{ fontSize: 15, color: '#00f5d4' }}>{selectedCar.zeroToHundredSec}s</strong>
              </div>
              <div style={statCard}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>MÁXIMA</span>
                <strong style={{ fontSize: 15 }}>{selectedCar.topSpeedKmh} km/h</strong>
              </div>
            </div>

            {/* Interactive 3D Inspection Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              <button
                onClick={() => {
                  const next = !doorsOpen;
                  setDoorsOpen(next);
                  engineRef.current?.setGarageInteractiveState({ doorsOpen: next });
                }}
                style={inspectBtn}
              >
                🚪 {doorsOpen ? 'Fechar Portas' : 'Abrir Portas'}
              </button>
              <button
                onClick={() => {
                  const next = !hoodOpen;
                  setHoodOpen(next);
                  engineRef.current?.setGarageInteractiveState({ hoodOpen: next });
                }}
                style={inspectBtn}
              >
                🔩 {hoodOpen ? 'Fechar Capô' : 'Ver Motor 3D'}
              </button>
              <button
                onClick={() => {
                  const next = !trunkOpen;
                  setTrunkOpen(next);
                  engineRef.current?.setGarageInteractiveState({ trunkOpen: next });
                }}
                style={inspectBtn}
              >
                🔊 {trunkOpen ? 'Fechar Mala' : 'Ver Som'}
              </button>
              <button
                onClick={() => engineRef.current?.revEngineInGarage()}
                style={{ ...inspectBtn, borderColor: '#ff3b30', color: '#ff9500' }}
              >
                🔥 LIGAR & CORTAR GIRO!
              </button>
              <button
                onClick={() => {
                  const next = !cfdVisible;
                  setCfdVisible(next);
                  engineRef.current?.setGarageInteractiveState({ cfdVisible: next });
                }}
                style={{ ...inspectBtn, borderColor: '#00f5d4', color: '#00f5d4' }}
              >
                🌬️ {cfdVisible ? 'CFD ON' : 'Fluxo CFD'}
              </button>
            </div>

            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 8 }}>
              💡 Refletores do Showroom: {spotIntensity}W
              <input
                type="range"
                min={8}
                max={95}
                value={spotIntensity}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSpotIntensity(v);
                  engineRef.current?.setGarageInteractiveState({ spotIntensity: v });
                }}
                style={{ width: '100%' }}
              />
            </label>

            {/* Quick Iconic Showcase Presets */}
            <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 800, marginBottom: 5 }}>
              ⚡ ATALHOS DE DESTAQUE DO PRODUTOR:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {[
                ['fiat-uno-2005-raiz', '🇧🇷 Uno 2005 s/ Ar'],
                ['orig-solis-tupa-x1', '🚀 Solis-Tupã MG'],
                ['mercedes-300sl-gullwing', '🦅 300SL Gullwing'],
                ['mclaren-mp4-4-senna', '🏆 Senna MP4/4'],
                ['revolt-toyeca-pro', '🕹️ Toyeca Re-Volt'],
                ['bugatti-chiron-300', '💎 Chiron 300+'],
              ].map(([cid, label]) => {
                const found = CAR_CATALOG.find((c) => c.id === cid);
                if (!found) return null;
                return (
                  <button
                    key={cid}
                    onClick={() => handleSelectCar(found)}
                    style={{
                      ...inspectBtn,
                      background: selectedCar.id === cid ? 'rgba(255,149,0,0.28)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Main Navigation Dock & Giant START Button */}
          <div
            style={{
              position: 'fixed',
              bottom: 18,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              background: 'rgba(7, 11, 22, 0.92)',
              backdropFilter: 'blur(14px)',
              padding: '10px 14px',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.16)',
              zIndex: 30,
              flexWrap: 'wrap',
              justifyContent: 'center',
              width: 'max-content',
              maxWidth: '96vw',
            }}
          >
            <button onClick={() => setActiveModal('cars')} style={dockBtn}>
              🚗 {CAR_CATALOG.length} Carros & Puzzles
            </button>
            <button onClick={() => setActiveModal('tuning')} style={dockBtn}>
              🔧 Customização & CFD
            </button>
            <button onClick={() => setActiveModal('tracks')} style={dockBtn}>
              🌍 {TRACK_CATALOG.length} Pistas & 47 Climas
            </button>
            <button onClick={() => setActiveModal('career')} style={dockBtn}>
              🎬 Carreira & 200 Bots
            </button>
            <button onClick={() => setActiveModal('editor')} style={dockBtn}>
              🛠️ Editor de Pistas
            </button>
            <button onClick={() => setActiveModal('companion')} style={dockBtn}>
              📱 Companion App
            </button>

            <button
              onClick={() => {
                const rcGarden = TRACK_CATALOG.find((t) => t.id === 'rc-garden-cat')!;
                const toyeca = CAR_CATALOG.find((c) => c.id === 'revolt-toyeca-pro')!;
                handleSelectCar(toyeca);
                setSelectedTrack(rcGarden);
                setSelectedMode('revolt_legacy');
                setTimeout(() => launchRaceSession({ track: rcGarden, mode: 'revolt_legacy', laps: 3 }), 30);
              }}
              style={{
                ...dockBtn,
                background: 'rgba(114, 9, 183, 0.45)',
                borderColor: '#b5179e',
              }}
            >
              🐱 Modo Re-Volt + O GATO!
            </button>

            <button
              onClick={() => launchRaceSession({ custom: null })}
              style={{
                padding: '12px 24px',
                borderRadius: 11,
                border: 'none',
                background: 'linear-gradient(90deg, #ff3b30, #ff9500)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: '0 0 26px rgba(255, 59, 48, 0.55)',
              }}
            >
              🚦 START — CORRER EM {selectedTrack.name.split('—')[0].trim().toUpperCase()}!
            </button>
          </div>
        </>
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
          onToggleImmersiveHud={() => setImmersiveNoHud((v) => !v)}
          onTogglePsxRetro={() => {
            const next = !psxRetro;
            setPsxRetro(next);
            engineRef.current?.setPsxRetroMode(next);
          }}
          onBackToGarage={returnToGarage}
          onTouchInput={(p) => engineRef.current?.setTouchInput(p)}
        />
      )}

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
            <div style={{ fontSize: 44 }}>🐑🛑</div>
            <h2 style={{ color: '#ef233c', margin: '8px 0' }}>
              CORRIDA ENCERRADA — RESPEITO AOS ANIMAIS!
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#e2e8f0', marginBottom: 18 }}>
              Você encostou em uma ovelha nas Terras Altas da Escócia! Conforme a cláusula inegociável da Seção 3.1-C do Produtor, o VELOCITY ENGINE recusa-se terminantemente a continuar qualquer corrida onde a fauna local não seja respeitada.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => launchRaceSession()} style={dockBtn}>
                🔄 Tentar Novamente Desviando com Carinho
              </button>
              <button onClick={returnToGarage} style={dockBtn}>
                🏠 Voltar à Garagem 3D
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Podium / Race Finish Screen */}
      {raceResult && (
        <div style={centerOverlay}>
          <div style={resultCard}>
            <div style={{ fontSize: 44 }}>
              {raceResult.position === 1 ? '🏆🥇' : raceResult.position <= 3 ? '🥈🍾' : '🏁'}
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
              <button onClick={() => launchRaceSession()} style={dockBtn}>
                🔁 Correr Revanche
              </button>
              <button
                onClick={returnToGarage}
                style={{
                  ...dockBtn,
                  background: 'linear-gradient(90deg, #ff3b30, #ff9500)',
                  border: 'none',
                }}
              >
                🏠 Celebrar na Garagem 3D
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

const topChip: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#fff',
  padding: '5px 9px',
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

const statCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 8,
  padding: '6px 8px',
  display: 'flex',
  flexDirection: 'column',
};

const inspectBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#f8fafc',
  padding: '5px 9px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
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
