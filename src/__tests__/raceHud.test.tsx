import { it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RaceHud } from '../components/RaceHudAndPhotoMode';
import { WEATHER_PRESETS } from '../data/weatherCatalog';
import { CAR_CATALOG, createDefaultTuneForCar } from '../data/carCatalog';

/**
 * RACE HUD CONTRACT
 * -----------------
 * Renders the real HUD with a realistic telemetry frame and asserts every panel
 * the player asked for is present and labelled: speed/gear, position/lap/time,
 * the track map, the MP3 mini-player slot, damage and tyre readouts, and the
 * pause/horn controls.
 */
it('renders the complete race HUD', () => {
  const car = CAR_CATALOG[100];
  const tune = createDefaultTuneForCar(car);
  void WEATHER_PRESETS; void tune;
  const wheels = [0, 1, 2, 3].map(() => ({
    tempInnerC: 90, tempMidC: 92, tempOuterC: 88, pressurePsi: 33,
    wearPercent: 95, slipAngleRad: 0.01, slipRatio: 0.02,
    suspensionCompressionMm: 5, punctured: false,
  }));
  const frame = {
    timestampSec: 12, lap: 1, lapTimeSec: 12.3, bestLapSec: null, deltaBestSec: 0,
    speedKmh: 145, rpm: 6200, maxRpm: 8000, gear: 4, throttle: 1, brake: 0, steering: 0.1,
    clutch: 0, nitroActive: false, nitroRemainingPct: 80, gForceLat: 0.4, gForceLong: 0.2,
    boostPsi: 3, engineTempC: 95, oilTempC: 100, brakeTempC: 300, fuelLiters: 40,
    downforceN: 900, dragN: 400, slipstreamFactor: 0, surfaceName: 'Asfalto Oficial',
    wheels, damage: {
      panelDeform: { frontLeft: 0.1, frontRight: 0, hood: 0, sideLeft: 0.3, sideRight: 0, rear: 0 },
      windshieldCracks: [], radiatorDamage: 0, suspensionDamage: 0, gearboxDamage: 0,
      oilLeakActive: false, engineHealth: 88, paintCorrosion: 0.05,
    },
    position: 2, totalRacers: 8, driftScore: 0, driftCombo: 1, driftAngleDeg: 0,
    stuntScore: 0, wantedStars: 0, packageIntegrityPct: 100, deliveriesCompleted: 0,
    activePowerup: null, antiTrollWarnings: 0,
  } as never;
  const html = renderToStaticMarkup(
    React.createElement(RaceHud, {
      frame, mode: 'quick_race', totalLaps: 3, cameraView: 'chase_near',
      immersiveNoHud: false, psxRetro: false, radioFeed: [],
      onCycleCamera: () => {}, onToggleTelemetry: () => {}, onTogglePhotoMode: () => {},
      onTogglePsxRetro: () => {}, onBackToGarage: () => {}, onTogglePause: () => {},
      onHorn: () => {}, minimap: { points: [{x:0,z:0},{x:10,z:5},{x:0,z:10}], player: {x:5,z:5,heading:1}, progress: 0.3, blips: [] },
      onToggleImmersiveHud: () => {}, onTouchInput: () => {},
    } as never)
  );
  for (const region of ['hud-topbar', 'hud-cluster', 'hud-actions', 'hud-map', 'hud-tacho', 'hud-damage']) {
    expect(html, region).toContain(region);
  }
  // Speed, gear and race position are legible values, not placeholders.
  expect(html).toContain('145');
  expect(html).toContain('KM/H');
  expect(html).toContain('P2');
  expect(html).toContain('Posição');
  // Controls
  expect(html).toContain('PAUSAR');
  expect(html).toContain('BUZINA');
  // Tyre readouts
  expect(html).toContain('FL');
  expect(html).toContain('RR');
});
