import { beforeAll, describe, expect, it } from 'vitest';
import { CAR_CATALOG, createDefaultTuneForCar, WHEEL_CATALOG } from '../data/carCatalog';
import { ORIGINAL_HYPERCARS } from '../data/originalHypercars';
import { TRACK_CATALOG } from '../data/trackCatalog';
import { WEATHER_PRESETS } from '../data/weatherCatalog';
import { BOT_ROSTER } from '../data/botRoster';
import { CAREER_CHAPTERS } from '../data/careerChapters';
import {
  computeEffectiveCarStats,
  pacejkaMagicFormula,
  VehiclePhysicsBody,
} from '../engine/PacejkaPhysics';
import { buildCarMesh } from '../cars/CarMeshBuilder';
import { buildGarageShowroom, buildTrackWorld } from '../tracks/TrackBuilder';

beforeAll(() => {
  // Minimal DOM Canvas mock for procedural textures in Node test runner
  if (typeof document === 'undefined') {
    const fakeCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'center',
      textBaseline: 'middle',
      fillRect: () => {},
      clearRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      fillText: () => {},
      closePath: () => {},
      ellipse: () => {},
      quadraticCurveTo: () => {},
      bezierCurveTo: () => {},
      absarc: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      lineCap: 'round',
      lineJoin: 'round',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 10 }),
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => {},
      getImageData: (x: number, y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    };
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => ({
        width: 512,
        height: 512,
        getContext: () => fakeCtx,
      }),
    };
  }
});

describe('VELOCITY UNCHAINED — Validação Integral das Exigências do Produtor', () => {
  it('possui 888 carros jogáveis (>= 850) respeitando os mínimos de todas as 8 categorias', () => {
    expect(CAR_CATALOG.length).toBeGreaterThanOrEqual(850);

    const countByCat = (cat: string) => CAR_CATALOG.filter((c) => c.category === cat).length;
    expect(countByCat('classics')).toBeGreaterThanOrEqual(80);
    expect(countByCat('muscle')).toBeGreaterThanOrEqual(60);
    expect(countByCat('supercars')).toBeGreaterThanOrEqual(150);
    expect(countByCat('hyper_concepts')).toBeGreaterThanOrEqual(40);
    expect(countByCat('formula_proto')).toBeGreaterThanOrEqual(60);
    expect(countByCat('popular_br')).toBeGreaterThanOrEqual(80);
    expect(countByCat('exotic_easter')).toBeGreaterThanOrEqual(50);
    expect(countByCat('rc_revolt')).toBeGreaterThanOrEqual(40);

    const uno = CAR_CATALOG.find((c) => c.id === 'fiat-uno-2005-raiz');
    expect(uno).toBeDefined();
    expect(uno?.name).toContain('Fiat Uno Mille');

    const gt3rs = CAR_CATALOG.filter((c) => c.name.includes('911 GT3 RS'));
    expect(gt3rs.length).toBeGreaterThanOrEqual(8);
  });

  it('inclui 16 Hypercars 100% originais (>= 15) com lore e capítulos técnicos', () => {
    expect(ORIGINAL_HYPERCARS.length).toBeGreaterThanOrEqual(15);
    for (const car of ORIGINAL_HYPERCARS) {
      expect(car.lore).toBeDefined();
      expect(car.lore!.codexChapters.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('oferece 500 modelos de rodas distintos', () => {
    expect(WHEEL_CATALOG.length).toBe(500);
  });

  it('possui 205 pistas únicas (>= 200) nas 6 categorias, 47 climas, 200 bots e 25 capítulos', () => {
    expect(TRACK_CATALOG.length).toBeGreaterThanOrEqual(200);
    expect(TRACK_CATALOG.filter((t) => t.category === 'real_circuits').length).toBe(30);
    expect(TRACK_CATALOG.filter((t) => t.category === 'urban_fictional').length).toBe(40);
    expect(TRACK_CATALOG.filter((t) => t.category === 'natural_offroad').length).toBe(40);
    expect(TRACK_CATALOG.filter((t) => t.category === 'fantasy').length).toBe(40);
    expect(TRACK_CATALOG.filter((t) => t.category === 'rc_revolt').length).toBe(30);
    expect(TRACK_CATALOG.filter((t) => t.category === 'pro_engineered').length).toBeGreaterThanOrEqual(20);

    expect(WEATHER_PRESETS.length).toBe(47);
    expect(BOT_ROSTER.length).toBe(200);
    expect(CAREER_CHAPTERS.length).toBe(25);
  });

  it('calcula Pacejka Magic Formula, Swap V12 no Uno 2005, Escada no Teto e Dano FEA', () => {
    const uno = CAR_CATALOG.find((c) => c.id === 'fiat-uno-2005-raiz')!;
    const stockTune = createDefaultTuneForCar(uno);
    const stockStats = computeEffectiveCarStats(uno, stockTune);
    expect(stockStats.effectiveHp).toBe(55);
    expect(stockStats.chassisOverloaded).toBe(false);

    const v12UnoTune = {
      ...stockTune,
      engineSwap: 'v12_italian' as const,
      induction: 'twin_turbo' as const,
      boostPsi: 20,
      unoRoofLadder: true,
    };
    const v12Stats = computeEffectiveCarStats(uno, v12UnoTune);
    expect(v12Stats.effectiveHp).toBeGreaterThan(1200);
    expect(v12Stats.effectiveWeightKg).toBeGreaterThan(stockStats.effectiveWeightKg);
    expect(v12Stats.chassisOverloaded).toBe(true);

    const fPos = pacejkaMagicFormula(0.14, 10, 1.45, 1.2, -0.4);
    const fNeg = pacejkaMagicFormula(-0.14, 10, 1.45, 1.2, -0.4);
    expect(fPos).toBeGreaterThan(0.8);
    expect(fPos).toBeCloseTo(-fNeg, 5);

    const lowHit = new VehiclePhysicsBody(25);
    const highHit = new VehiclePhysicsBody(25);
    lowHit.applyImpact(30, 'front', true);
    highHit.applyImpact(120, 'front', true);
    expect(highHit.damage.panelDeform.hood).toBeGreaterThan(lowHit.damage.panelDeform.hood);
    expect(highHit.damage.windshieldCracks.length).toBeGreaterThan(0);
  });

  it('constrói malhas 3D de todos os arquétipos de carros, pistas especiais (O Gato, Ovelhas, Interlagos) e Garagem 3D sem erros', () => {
    const seenArchetypes = new Set<string>();
    for (const car of CAR_CATALOG) {
      if (seenArchetypes.has(car.archetype)) continue;
      seenArchetypes.add(car.archetype);
      const tune = createDefaultTuneForCar(car);
      tune.unoRoofLadder = true;
      tune.subwooferLevel = 'paredao_treme_tudo';
      const rig = buildCarMesh(car, tune);
      expect(rig.wheels.length).toBe(4);
    }
    expect(seenArchetypes.size).toBeGreaterThanOrEqual(18);

    // Build Interlagos, RC Garden with THE CAT, Scottish Highlands with Sheep, and Drag mode
    const interlagos = buildTrackWorld(TRACK_CATALOG[0], 'quick_race');
    expect(interlagos.totalLengthM).toBeGreaterThan(500);

    const rcGarden = TRACK_CATALOG.find((t) => t.id === 'rc-garden-cat')!;
    const builtCat = buildTrackWorld(rcGarden, 'revolt_legacy');
    expect(builtCat.hazards.some((h) => h.kind === 'cat')).toBe(true);
    expect(builtCat.hazards.some((h) => h.kind === 'powerup')).toBe(true);

    const scotland = TRACK_CATALOG.find((t) => t.id === 'scottish-highlands-sheep')!;
    const builtSheep = buildTrackWorld(scotland, 'quick_race');
    expect(builtSheep.hazards.some((h) => h.kind === 'sheep')).toBe(true);

    const showroom = buildGarageShowroom(3, 8, []);
    expect(showroom.spotLights.length).toBe(3);
  });
});
