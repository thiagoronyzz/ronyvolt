import { CarArchetype, CarCategory, CarSpec, CarTuneSetup, EngineType } from '../types/game';
import { ORIGINAL_HYPERCARS } from './originalHypercars';

const HISTORICAL_MUSCLE_PALETTES = [
  { name: 'Plum Crazy Purple', hex: '#6a1b9a' },
  { name: 'Sublime Lime Green', hex: '#76ff03' },
  { name: 'Hemi Orange', hex: '#ff5722' },
  { name: 'Tuxedo Black Stripes', hex: '#14171f' },
  { name: 'Wimbledon White', hex: '#f4f3ee' },
  { name: 'Grabber Blue', hex: '#0091ea' },
  { name: 'Hugger Orange', hex: '#ff6d00' },
];

const STANDARD_PALETTES = [
  { name: 'Rosso Corsa', hex: '#d40000' },
  { name: 'British Racing Green', hex: '#004225' },
  { name: 'Silver Arrow Metallic', hex: '#bfc7d5' },
  { name: 'Midnight Sapphire', hex: '#0d2b6b' },
  { name: 'Giallo Modena', hex: '#ffd000' },
  { name: 'Pearl White', hex: '#f5f7fa' },
];

type CompactSeed = [
  name: string,
  brand: string,
  year: number,
  country: string,
  archetype: CarArchetype,
  engine: EngineType,
  disp: number,
  hp: number,
  weight: number,
  drive: 'RWD' | 'FWD' | 'AWD',
  color: string,
  features?: string[]
];

function buildSpec(
  category: CarCategory,
  idx: number,
  seed: CompactSeed,
  extra?: Partial<CarSpec>
): CarSpec {
  const [name, brand, year, country, archetype, engineType, displacementL, horsepower, weightKg, drivetrain, defaultColor, specialFeatures] = seed;
  const pwrRatio = horsepower / Math.max(weightKg, 150);
  const topSpeedKmh = Math.round(
    category === 'rc_revolt'
      ? Math.min(145, 52 + horsepower * 14)
      : Math.min(590, 95 + Math.pow(horsepower, 0.56) * 14.2)
  );
  const zeroToHundredSec = Number(
    Math.max(1.35, Math.min(28.5, 4.9 / Math.pow(Math.max(pwrRatio, 0.025), 0.62))).toFixed(2)
  );
  const torqueNm = Math.round(
    engineType === 'ev_quadmotor'
      ? horsepower * 1.18
      : engineType === 'v8_crossplane'
      ? horsepower * 1.15
      : engineType === 'v10_screamer'
      ? horsepower * 0.78
      : horsepower * 0.96
  );
  const baseGrip =
    category === 'formula_proto'
      ? 1.48
      : category === 'hyper_concepts'
      ? 1.38
      : category === 'supercars'
      ? 1.26
      : category === 'rc_revolt'
      ? 1.34
      : category === 'popular_br'
      ? 0.96
      : 1.06;

  return {
    id: extra?.id ?? `${category}-${idx}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    brand,
    year,
    country,
    category,
    archetype,
    engineType,
    displacementL,
    horsepower,
    torqueNm,
    weightKg,
    topSpeedKmh,
    zeroToHundredSec,
    drivetrain,
    baseGrip,
    aeroCl: category === 'formula_proto' ? 3.8 : category === 'supercars' ? 1.85 : 0.65,
    aeroCd: category === 'formula_proto' ? 0.42 : category === 'popular_br' ? 0.35 : 0.29,
    priceCredits:
      category === 'popular_br'
        ? 8500 + idx * 950
        : category === 'rc_revolt'
        ? 4500 + idx * 600
        : Math.round(horsepower * 420 + (2030 - Math.min(year, 2025)) * 350),
    defaultColor,
    historicalColors: category === 'muscle' ? HISTORICAL_MUSCLE_PALETTES : STANDARD_PALETTES,
    specialFeatures,
    ...extra,
  };
}

// 1. CLASSICS (1900-1969) — 105 vehicles
const CLASSICS_HEROES: CompactSeed[] = [
  ['Ford Model T Touring', 'Ford', 1908, 'EUA', 'classic_1900_open', 'model_t_i4', 2.9, 20, 540, 'RWD', '#16181d', ['Áudio autêntico 4-cil baixa compressão', 'Partida a manivela', 'Rodas raiadas de madeira']],
  ['Jaguar E-Type Series 1 3.8', 'Jaguar', 1961, 'Reino Unido', 'classic_roadster', 'v12_italian', 3.8, 265, 1220, 'RWD', '#004225', ['Capô longo articulado frontal', 'Interior couro Connolly']],
  ['Chevrolet Bel Air Sport Coupe', 'Chevrolet', 1957, 'EUA', 'muscle_fastback', 'v8_crossplane', 4.6, 283, 1560, 'RWD', '#00b4d8', ['Rabos-de-peixe cromados', 'Pintura bicolor anos 50']],
  ['Volkswagen Fusca Käfer Split-Window', 'Volkswagen', 1938, 'Alemanha', 'classic_beetle', 'i4_econobox', 1.0, 25, 730, 'RWD', '#2b2d42', ['Janela traseira bipartida original']],
  ['Volkswagen Fusca Oval Window 1200', 'Volkswagen', 1955, 'Alemanha', 'classic_beetle', 'i4_econobox', 1.2, 36, 740, 'RWD', '#74c69d'],
  ['Volkswagen Fusca 1300 Clássico', 'Volkswagen', 1967, 'Brasil', 'classic_beetle', 'i4_econobox', 1.3, 46, 780, 'RWD', '#0077b6'],
  ['Volkswagen Fusca 1500 Fuscão', 'Volkswagen', 1969, 'Brasil', 'classic_beetle', 'i4_econobox', 1.5, 52, 800, 'RWD', '#d62828'],
  ['Ferrari 250 GTO Scaglietti', 'Ferrari', 1962, 'Itália', 'classic_roadster', 'v12_italian', 3.0, 300, 880, 'RWD', '#d90429', ['Colombo V12 6 carburadores Weber']],
  ['Aston Martin DB5 Silver Birch (Agente Secreto)', 'Aston Martin', 1963, 'Reino Unido', 'gullwing_coupe', 'v12_italian', 4.0, 282, 1465, 'RWD', '#adb5bd', ['Easter Egg: Placa rotativa, cortina de fumaça e assento ejetor']],
  ['Porsche 356 "No. 1" Gmünd', 'Porsche', 1948, 'Alemanha', 'classic_beetle', 'flat6_gt3', 1.1, 40, 585, 'RWD', '#ced4da'],
  ['Mercedes-Benz 300SL Gullwing', 'Mercedes-Benz', 1954, 'Alemanha', 'gullwing_coupe', 'flat6_gt3', 3.0, 215, 1295, 'RWD', '#c0c5ce', ['Portas Asa-de-Gaivota animadas na Garagem 3D!']],
  ['Shelby Cobra 427 S/C', 'Shelby', 1965, 'EUA', 'classic_roadster', 'v8_crossplane', 7.0, 485, 1068, 'RWD', '#023e8a', ['Side-pipes cromados incandescentes']],
  ['Pontiac GTO Tri-Power', 'Pontiac', 1964, 'EUA', 'muscle_fastback', 'v8_crossplane', 6.4, 348, 1590, 'RWD', '#9b2226'],
  ['Bugatti Type 35B Grand Prix', 'Bugatti', 1927, 'França', 'classic_1900_open', 'i4_vtec_turbo', 2.3, 140, 750, 'RWD', '#0077b6'],
  ['Alfa Romeo 33 Stradale', 'Alfa Romeo', 1967, 'Itália', 'gullwing_coupe', 'v8_crossplane', 2.0, 230, 700, 'RWD', '#d00000'],
  ['Lamborghini Miura P400 SV', 'Lamborghini', 1969, 'Itália', 'wedge_supercar', 'v12_italian', 3.9, 385, 1245, 'RWD', '#ffbe0b'],
  ['Ford GT40 Mk I Gulf', 'Ford', 1966, 'EUA', 'wedge_supercar', 'v8_crossplane', 4.7, 390, 1080, 'RWD', '#48bfe3'],
  ['Toyota 2000GT', 'Toyota', 1967, 'Japão', 'classic_roadster', 'flat6_gt3', 2.0, 150, 1120, 'RWD', '#f8f9fa'],
  ['Citroën DS 21 Pallas', 'Citroën', 1965, 'França', 'sedan_tuner', 'i4_econobox', 2.2, 109, 1320, 'FWD', '#52b788'],
  ['Mini Cooper S 1275 MkI', 'Mini', 1964, 'Reino Unido', 'boxy_hatch_uno', 'i4_econobox', 1.3, 76, 650, 'FWD', '#e63946'],
  ['Bentley 4½ Litre Blower', 'Bentley', 1929, 'Reino Unido', 'classic_1900_open', 'v8_crossplane', 4.4, 240, 1750, 'RWD', '#1b4332'],
  ['Duesenberg Model SJ', 'Duesenberg', 1932, 'EUA', 'classic_1900_open', 'v8_crossplane', 6.9, 320, 2300, 'RWD', '#7f5539'],
  ['Auto Union Type C V16', 'Auto Union', 1936, 'Alemanha', 'classic_1900_open', 'v12_italian', 6.0, 520, 824, 'RWD', '#ced4da'],
  ['Maserati 250F', 'Maserati', 1957, 'Itália', 'classic_1900_open', 'flat6_gt3', 2.5, 270, 630, 'RWD', '#c1121f'],
  ['Chevrolet Corvette C1 Fuelie', 'Chevrolet', 1958, 'EUA', 'classic_roadster', 'v8_crossplane', 4.6, 290, 1380, 'RWD', '#e63946'],
  ['Chevrolet Corvette C2 Sting Ray Split-Window', 'Chevrolet', 1963, 'EUA', 'gullwing_coupe', 'v8_crossplane', 5.4, 360, 1410, 'RWD', '#1d3557'],
  ['BMW 507 Roadster', 'BMW', 1957, 'Alemanha', 'classic_roadster', 'v8_crossplane', 3.2, 150, 1330, 'RWD', '#f1faee'],
  ['Ferrari 275 GTB/4', 'Ferrari', 1966, 'Itália', 'classic_roadster', 'v12_italian', 3.3, 300, 1100, 'RWD', '#e63946'],
  ['Cadillac Eldorado Biarritz', 'Cadillac', 1959, 'EUA', 'muscle_fastback', 'v8_crossplane', 6.4, 345, 2290, 'RWD', '#ffafcc'],
  ['Willys Interlagos Berlineta', 'Willys-Overland', 1964, 'Brasil', 'classic_roadster', 'i4_econobox', 1.0, 70, 535, 'RWD', '#ffd166'],
];

const CLASSICS_SERIES_MODELS = [
  ['Alfa Romeo 8C 2900B', 'Alfa Romeo', 1938, 'Itália', 'classic_1900_open', 'v8_crossplane'],
  ['Talbot-Lago T150-C SS', 'Talbot-Lago', 1937, 'França', 'gullwing_coupe', 'flat6_gt3'],
  ['Cord 812 Supercharged', 'Cord', 1937, 'EUA', 'classic_1900_open', 'v8_crossplane'],
  ['Tucker 48 Torpedo', 'Tucker', 1948, 'EUA', 'muscle_fastback', 'flat6_gt3'],
  ['Hudson Hornet Twin H-Power', 'Hudson', 1952, 'EUA', 'muscle_fastback', 'flat6_gt3'],
  ['Lancia Aurelia B24 Spider', 'Lancia', 1955, 'Itália', 'classic_roadster', 'flat6_gt3'],
  ['Austin-Healey 3000 MkIII', 'Austin-Healey', 1964, 'Reino Unido', 'classic_roadster', 'flat6_gt3'],
  ['Triumph TR4 IRS', 'Triumph', 1965, 'Reino Unido', 'classic_roadster', 'i4_econobox'],
  ['Lotus Elan Sprint 1600', 'Lotus', 1966, 'Reino Unido', 'classic_roadster', 'i4_vtec_turbo'],
  ['Karmann-Ghia TC 1500', 'Volkswagen', 1967, 'Brasil', 'classic_beetle', 'i4_econobox'],
  ['DKW-Vemag Malzoni GT', 'Puma/DKW', 1966, 'Brasil', 'gullwing_coupe', 'i4_econobox'],
  ['Simca Chambord Tufão', 'Simca', 1963, 'Brasil', 'sedan_tuner', 'v8_crossplane'],
  ['FNM JK 2000', 'FNM', 1965, 'Brasil', 'sedan_tuner', 'i4_econobox'],
  ['Iso Grifo GL 365', 'Iso Rivolta', 1967, 'Itália', 'muscle_fastback', 'v8_crossplane'],
  ['Bizzarrini 5300 GT Strada', 'Bizzarrini', 1966, 'Itália', 'wedge_supercar', 'v8_crossplane'],
] as const;

for (let i = 0; i < 75; i++) {
  const base = CLASSICS_SERIES_MODELS[i % CLASSICS_SERIES_MODELS.length];
  const yrOffset = Math.floor(i / CLASSICS_SERIES_MODELS.length);
  const suffix = ['Corsa', 'Speciale', 'Touring', 'Le Mans', 'Clubsport'][yrOffset % 5];
  CLASSICS_HEROES.push([
    `${base[0]} ${suffix} '${(base[2] + yrOffset) % 100}`,
    base[1],
    Math.min(1969, base[2] + yrOffset),
    base[3],
    base[4] as CarArchetype,
    base[5] as EngineType,
    2.4 + (i % 5) * 0.6,
    95 + (i % 9) * 28,
    820 + (i % 7) * 90,
    'RWD',
    STANDARD_PALETTES[i % STANDARD_PALETTES.length].hex,
  ]);
}

// 2. MUSCLE CARS (1970-1989) — 85 vehicles
const MUSCLE_HEROES: CompactSeed[] = [
  ['Dodge Challenger R/T 426 Hemi', 'Dodge', 1970, 'EUA', 'muscle_fastback', 'v8_crossplane', 7.0, 425, 1690, 'RWD', '#6a1b9a', ['Shaker Hood vibrando com torque']],
  ['Chevrolet Camaro Z28 RS', 'Chevrolet', 1970, 'EUA', 'muscle_fastback', 'v8_crossplane', 5.7, 360, 1560, 'RWD', '#ff6d00'],
  ['Ford Mustang Boss 429', 'Ford', 1969, 'EUA', 'muscle_fastback', 'v8_crossplane', 7.0, 375, 1755, 'RWD', '#14171f', ['Homologação NASCAR Semi-Hemi']],
  ['Plymouth Hemi Barracuda', 'Plymouth', 1971, 'EUA', 'muscle_fastback', 'v8_crossplane', 7.0, 425, 1680, 'RWD', '#76ff03'],
  ['Pontiac Firebird Trans Am Screaming Chicken', 'Pontiac', 1977, 'EUA', 'muscle_fastback', 'v8_crossplane', 6.6, 200, 1650, 'RWD', '#111111', ['Águia dourada no capô + T-Top']],
  ['Buick GNX Grand National', 'Buick', 1987, 'EUA', 'muscle_fastback', 'v8_crossplane', 3.8, 300, 1610, 'RWD', '#0a0a0c', ['Darth Vader Turbo V6']],
  ['Chevrolet Chevelle SS 454 LS6', 'Chevrolet', 1970, 'EUA', 'muscle_fastback', 'v8_crossplane', 7.4, 450, 1730, 'RWD', '#d90429'],
  ['Ford Maverick GT 302 V8 Quadrijet', 'Ford', 1974, 'Brasil', 'muscle_fastback', 'v8_crossplane', 4.9, 197, 1390, 'RWD', '#ff5722', ['Lenda de Interlagos Divisão 3']],
  ['Chevrolet Opala SS6 4100', 'Chevrolet', 1976, 'Brasil', 'muscle_fastback', 'flat6_gt3', 4.1, 171, 1265, 'RWD', '#f4a261', ['6 Canecos 250-S']],
  ['Dodge Charger R/T 318 Brasileiro', 'Dodge', 1975, 'Brasil', 'muscle_fastback', 'v8_crossplane', 5.2, 215, 1510, 'RWD', '#e63946'],
  ['Plymouth Superbird 440 Six Barrel', 'Plymouth', 1970, 'EUA', 'muscle_fastback', 'v8_crossplane', 7.2, 390, 1740, 'RWD', '#0091ea', ['Asa gigante NASCAR']],
  ['Oldsmobile 442 W-30', 'Oldsmobile', 1970, 'EUA', 'muscle_fastback', 'v8_crossplane', 7.5, 370, 1710, 'RWD', '#c1121f'],
  ['AMC Javelin AMX 401', 'AMC', 1971, 'EUA', 'muscle_fastback', 'v8_crossplane', 6.6, 330, 1560, 'RWD', '#ffbe0b'],
  ['Holden Torana A9X SS Hatchback', 'Holden', 1977, 'Austrália', 'muscle_fastback', 'v8_crossplane', 5.0, 260, 1280, 'RWD', '#f8f9fa'],
  ['Ford Falcon XB GT Hardtop', 'Ford Austrália', 1973, 'Austrália', 'muscle_fastback', 'v8_crossplane', 5.8, 300, 1580, 'RWD', '#16181d'],
];

const MUSCLE_BASES = [
  ['Dodge Coronet Super Bee', 'Dodge', 'EUA'],
  ['Mercury Cougar Eliminator', 'Mercury', 'EUA'],
  ['Chevrolet Nova Yenko Deuce', 'Chevrolet', 'EUA'],
  ['Ford Torino Cobra Jet 429', 'Ford', 'EUA'],
  ['Pontiac GTO Judge Ram Air IV', 'Pontiac', 'EUA'],
  ['Chevrolet Monte Carlo SS Aerocoupe', 'Chevrolet', 'EUA'],
  ['Ford Mustang Foxbody SVT Cobra', 'Ford', 'EUA'],
  ['Chevrolet Camaro IROC-Z 5.7', 'Chevrolet', 'EUA'],
  ['Dodge Dart SE 318', 'Dodge', 'Brasil'],
  ['Chevrolet Opala Diplomata 4.1/S', 'Chevrolet', 'Brasil'],
] as const;

for (let i = 0; i < 70; i++) {
  const b = MUSCLE_BASES[i % MUSCLE_BASES.length];
  const yr = 1970 + (i % 20);
  const pkg = ['Stage I', '4-Speed Hurst', 'Drag Pack', 'Street Machine', 'Trans-Am Spec', 'Big Block', 'HO'][i % 7];
  MUSCLE_HEROES.push([
    `${b[0]} ${pkg} '${yr % 100}`,
    b[1],
    yr,
    b[2],
    'muscle_fastback',
    'v8_crossplane',
    5.0 + (i % 6) * 0.4,
    245 + (i % 8) * 32,
    1420 + (i % 6) * 55,
    'RWD',
    HISTORICAL_MUSCLE_PALETTES[i % HISTORICAL_MUSCLE_PALETTES.length].hex,
  ]);
}

// 3. MODERN SUPERCARS (1990-present) — 215 vehicles
const SUPERCARS_HEROES: CompactSeed[] = [
  ['Bugatti Veyron 16.4 Super Sport', 'Bugatti', 2010, 'França', 'hypercar_aero', 'w16_quadturbo', 8.0, 1200, 1888, 'AWD', '#ff6b00'],
  ['Bugatti Chiron Super Sport 300+', 'Bugatti', 2021, 'França', 'hypercar_aero', 'w16_quadturbo', 8.0, 1600, 1978, 'AWD', '#0077b6'],
  ['Bugatti Bolide Track-Only', 'Bugatti', 2024, 'França', 'hypercar_aero', 'w16_quadturbo', 8.0, 1850, 1450, 'AWD', '#00b4d8'],
  ['Bugatti W16 Mistral', 'Bugatti', 2024, 'França', 'hypercar_aero', 'w16_quadturbo', 8.0, 1600, 1960, 'AWD', '#ffd60a'],
  ['Bugatti Tourbillon V16 Hybrid', 'Bugatti', 2026, 'França', 'hypercar_aero', 'v12_italian', 8.3, 1800, 1995, 'AWD', '#48cae4'],
  ['McLaren F1', 'McLaren', 1994, 'Reino Unido', 'wedge_supercar', 'v12_italian', 6.1, 627, 1138, 'RWD', '#ff8800', ['Cofre do motor banhado a ouro 24k', 'Assento central']],
  ['McLaren P1', 'McLaren', 2014, 'Reino Unido', 'hypercar_aero', 'v8_crossplane', 3.8, 916, 1450, 'RWD', '#ffb703'],
  ['McLaren Senna', 'McLaren', 2019, 'Reino Unido', 'hypercar_aero', 'v8_crossplane', 4.0, 800, 1198, 'RWD', '#2a9d8f', ['Homenagem a Ayrton Senna — 800 kgf downforce']],
  ['McLaren Speedtail', 'McLaren', 2020, 'Reino Unido', 'hypercar_aero', 'v8_crossplane', 4.0, 1070, 1430, 'RWD', '#90e0ef'],
  ['McLaren Solus GT', 'McLaren', 2023, 'Reino Unido', 'lmp_prototype', 'v10_screamer', 5.2, 840, 1000, 'RWD', '#fb8500'],
  ['McLaren W1', 'McLaren', 2025, 'Reino Unido', 'hypercar_aero', 'v8_crossplane', 4.0, 1275, 1399, 'RWD', '#ff6d00'],
  ['Ferrari LaFerrari', 'Ferrari', 2014, 'Itália', 'hypercar_aero', 'v12_italian', 6.3, 963, 1370, 'RWD', '#d90429'],
  ['Ferrari SF90 Stradale Assetto Fiorano', 'Ferrari', 2021, 'Itália', 'hypercar_aero', 'v8_crossplane', 4.0, 1000, 1570, 'AWD', '#e63946'],
  ['Ferrari F40', 'Ferrari', 1990, 'Itália', 'wedge_supercar', 'v8_crossplane', 2.9, 478, 1100, 'RWD', '#d00000', ['Kevlar exposto + Twin IHI Turbos']],
  ['Ferrari F50', 'Ferrari', 1995, 'Itália', 'wedge_supercar', 'v12_italian', 4.7, 520, 1230, 'RWD', '#d90429'],
  ['Ferrari Enzo', 'Ferrari', 2003, 'Itália', 'hypercar_aero', 'v12_italian', 6.0, 660, 1255, 'RWD', '#d00000'],
  ['Ferrari Daytona SP3', 'Ferrari', 2023, 'Itália', 'hypercar_aero', 'v12_italian', 6.5, 840, 1485, 'RWD', '#c1121f'],
  ['Ferrari 296 GTB', 'Ferrari', 2023, 'Itália', 'modern_gt', 'flat6_gt3', 3.0, 830, 1470, 'RWD', '#ffbe0b'],
  ['Ferrari F80', 'Ferrari', 2025, 'Itália', 'hypercar_aero', 'flat6_gt3', 3.0, 1200, 1525, 'AWD', '#d90429'],
  ['Lamborghini Aventador SVJ', 'Lamborghini', 2019, 'Itália', 'wedge_supercar', 'v12_italian', 6.5, 770, 1525, 'AWD', '#38b000'],
  ['Lamborghini Huracán STO', 'Lamborghini', 2021, 'Itália', 'wedge_supercar', 'v10_screamer', 5.2, 640, 1339, 'RWD', '#00b4d8'],
  ['Lamborghini Revuelto', 'Lamborghini', 2024, 'Itália', 'wedge_supercar', 'v12_italian', 6.5, 1015, 1772, 'AWD', '#ff6d00'],
  ['Lamborghini Countach LPI 800-4', 'Lamborghini', 2022, 'Itália', 'wedge_supercar', 'v12_italian', 6.5, 814, 1595, 'AWD', '#f8f9fa'],
  ['Lamborghini Diablo SV', 'Lamborghini', 1998, 'Itália', 'wedge_supercar', 'v12_italian', 5.7, 530, 1530, 'RWD', '#ffd60a'],
  ['Koenigsegg Jesko Absolut', 'Koenigsegg', 2023, 'Suécia', 'hypercar_aero', 'v8_crossplane', 5.0, 1600, 1390, 'RWD', '#adb5bd'],
  ['Koenigsegg Agera RS', 'Koenigsegg', 2017, 'Suécia', 'hypercar_aero', 'v8_crossplane', 5.0, 1360, 1395, 'RWD', '#d90429'],
  ['Koenigsegg Gemera HV8', 'Koenigsegg', 2024, 'Suécia', 'hypercar_aero', 'v8_crossplane', 5.0, 2300, 1950, 'AWD', '#4ea8de'],
  ['Koenigsegg CC850', 'Koenigsegg', 2023, 'Suécia', 'hypercar_aero', 'v8_crossplane', 5.0, 1385, 1385, 'RWD', '#ced4da'],
  ['Koenigsegg Regera', 'Koenigsegg', 2018, 'Suécia', 'hypercar_aero', 'v8_crossplane', 5.0, 1500, 1590, 'RWD', '#7209b7'],
  ['Pagani Huayra BC Roadster', 'Pagani', 2020, 'Itália', 'hypercar_aero', 'v12_italian', 6.0, 800, 1250, 'RWD', '#adb5bd'],
  ['Pagani Zonda R Revolucion', 'Pagani', 2013, 'Itália', 'hypercar_aero', 'v12_italian', 6.0, 800, 1070, 'RWD', '#212529'],
  ['Pagani Utopia', 'Pagani', 2023, 'Itália', 'hypercar_aero', 'v12_italian', 6.0, 864, 1280, 'RWD', '#e9d8a6'],
  // ALL 8+ Generations of Porsche 911 GT3 RS explicitly requested!
  ['Porsche 911 GT3 RS (996.2 Gen 1)', 'Porsche', 2003, 'Alemanha', 'modern_gt', 'flat6_gt3', 3.6, 381, 1360, 'RWD', '#f8f9fa'],
  ['Porsche 911 GT3 RS (997.1 Gen 2)', 'Porsche', 2006, 'Alemanha', 'modern_gt', 'flat6_gt3', 3.6, 415, 1375, 'RWD', '#ff6d00'],
  ['Porsche 911 GT3 RS 3.8 (997.2 Gen 3)', 'Porsche', 2010, 'Alemanha', 'modern_gt', 'flat6_gt3', 3.8, 450, 1370, 'RWD', '#495057'],
  ['Porsche 911 GT3 RS 4.0 (997.2 Gen 4 Mezger)', 'Porsche', 2011, 'Alemanha', 'modern_gt', 'flat6_gt3', 4.0, 500, 1360, 'RWD', '#ffffff'],
  ['Porsche 911 GT3 RS (991.1 Gen 5)', 'Porsche', 2015, 'Alemanha', 'modern_gt', 'flat6_gt3', 4.0, 500, 1420, 'RWD', '#7209b7'],
  ['Porsche 911 GT3 RS Weissach (991.2 Gen 6)', 'Porsche', 2018, 'Alemanha', 'modern_gt', 'flat6_gt3', 4.0, 520, 1430, 'RWD', '#38b000'],
  ['Porsche 911 GT3 RS DRS (992.1 Gen 7)', 'Porsche', 2023, 'Alemanha', 'modern_gt', 'flat6_gt3', 4.0, 525, 1450, 'RWD', '#e63946'],
  ['Porsche 911 GT3 RS Manthey Kit (992.2 Gen 8)', 'Porsche', 2025, 'Alemanha', 'modern_gt', 'flat6_gt3', 4.0, 535, 1440, 'RWD', '#00bbf9'],
  ['Porsche 918 Spyder Weissach', 'Porsche', 2015, 'Alemanha', 'hypercar_aero', 'v8_crossplane', 4.6, 887, 1634, 'AWD', '#ced4da'],
  ['Porsche Carrera GT V10', 'Porsche', 2004, 'Alemanha', 'wedge_supercar', 'v10_screamer', 5.7, 612, 1380, 'RWD', '#adb5bd'],
  ['Rimac Nevera Time Attack', 'Rimac', 2023, 'Croácia', 'hypercar_aero', 'ev_quadmotor', 0.0, 1914, 2150, 'AWD', '#00f5d4'],
  ['SSC Tuatara Striker', 'SSC North America', 2022, 'EUA', 'hypercar_aero', 'v8_crossplane', 5.9, 1750, 1247, 'RWD', '#e63946'],
  ['Hennessey Venom F5 Revolution', 'Hennessey', 2023, 'EUA', 'hypercar_aero', 'v8_crossplane', 6.6, 1817, 1360, 'RWD', '#ffd60a'],
  ['Aston Martin Valkyrie AMR Pro', 'Aston Martin', 2023, 'Reino Unido', 'hypercar_aero', 'v12_italian', 6.5, 1160, 1030, 'RWD', '#007f5f'],
  ['Aston Martin Valhalla', 'Aston Martin', 2025, 'Reino Unido', 'hypercar_aero', 'v8_crossplane', 4.0, 1012, 1550, 'AWD', '#2ec4b6'],
  ['Aston Martin One-77', 'Aston Martin', 2011, 'Reino Unido', 'modern_gt', 'v12_italian', 7.3, 750, 1630, 'RWD', '#495057'],
];

const SUPERCAR_FAMILIES = [
  ['Nissan GT-R NISMO (R35)', 'Nissan', 'Japão', 'modern_gt', 'flat6_gt3', 3.8, 600, 1720, 'AWD'],
  ['Nissan Skyline GT-R V-Spec II (R34)', 'Nissan', 'Japão', 'sedan_tuner', 'flat6_gt3', 2.6, 330, 1560, 'AWD'],
  ['Honda NSX-R (NA2)', 'Honda', 'Japão', 'wedge_supercar', 'flat6_gt3', 3.2, 290, 1270, 'RWD'],
  ['Lexus LFA Nürburgring Package', 'Lexus', 'Japão', 'modern_gt', 'v10_screamer', 4.8, 571, 1480, 'RWD'],
  ['Dodge Viper ACR Extreme', 'Dodge', 'EUA', 'modern_gt', 'v10_screamer', 8.4, 645, 1530, 'RWD'],
  ['Chevrolet Corvette C8 ZR1', 'Chevrolet', 'EUA', 'wedge_supercar', 'v8_crossplane', 5.5, 1064, 1660, 'RWD'],
  ['Ford GT Carbon Series', 'Ford', 'EUA', 'hypercar_aero', 'flat6_gt3', 3.5, 660, 1385, 'RWD'],
  ['Mercedes-AMG ONE', 'Mercedes-AMG', 'Alemanha', 'hypercar_aero', 'flat6_gt3', 1.6, 1063, 1695, 'AWD'],
  ['Mercedes-Benz CLK GTR Straßenversion', 'Mercedes-Benz', 'Alemanha', 'hypercar_aero', 'v12_italian', 6.9, 612, 1440, 'RWD'],
  ['Gordon Murray T.50 Fan Car', 'GMA', 'Reino Unido', 'hypercar_aero', 'v12_italian', 3.9, 663, 986, 'RWD'],
  ['Audi R8 V10 GT RWD', 'Audi', 'Alemanha', 'wedge_supercar', 'v10_screamer', 5.2, 620, 1570, 'RWD'],
  ['BMW M4 CSL', 'BMW', 'Alemanha', 'modern_gt', 'flat6_gt3', 3.0, 550, 1625, 'RWD'],
  ['Jaguar XJ220S TWR', 'Jaguar', 'Reino Unido', 'wedge_supercar', 'flat6_gt3', 3.5, 680, 1080, 'RWD'],
  ['Saleen S7 Twin Turbo', 'Saleen', 'EUA', 'wedge_supercar', 'v8_crossplane', 7.0, 750, 1338, 'RWD'],
  ['Maserati MC12 Stradale', 'Maserati', 'Itália', 'hypercar_aero', 'v12_italian', 6.0, 630, 1335, 'RWD'],
  ['Lotus Evija', 'Lotus', 'Reino Unido', 'hypercar_aero', 'ev_quadmotor', 0.0, 2011, 1887, 'AWD'],
  ['Pininfarina Battista', 'Pininfarina', 'Itália', 'hypercar_aero', 'ev_quadmotor', 0.0, 1900, 2060, 'AWD'],
] as const;

while (SUPERCARS_HEROES.length < 215) {
  const idx = SUPERCARS_HEROES.length;
  const f = SUPERCAR_FAMILIES[idx % SUPERCAR_FAMILIES.length];
  const trim = ['Coupe', 'Spider', 'Competizione', 'GT2 Stradale', 'Black Series', 'SV', 'Performante', 'LT', 'CS', 'Final Edition'][Math.floor(idx / SUPERCAR_FAMILIES.length) % 10];
  const yr = 1992 + (idx % 34);
  SUPERCARS_HEROES.push([
    `${f[0]} ${trim} '${yr % 100}`,
    f[1],
    yr,
    f[2],
    f[3] as CarArchetype,
    f[4] as EngineType,
    f[5],
    f[6] + (idx % 5) * 25,
    f[7] - (idx % 4) * 18,
    f[8] as 'RWD' | 'AWD',
    STANDARD_PALETTES[idx % STANDARD_PALETTES.length].hex,
  ]);
}

// 4. HYPERCAR CONCEPTS & PROTOTYPES — 40 real concepts + 16 Original Hypercars = 56 vehicles
const CONCEPT_SEEDS: CompactSeed[] = [
  ['Mercedes-Benz Vision AVTR', 'Mercedes-Benz', 2020, 'Alemanha', 'futuristic_concept', 'ev_quadmotor', 0.0, 476, 1680, 'AWD', '#00f5d4', ['33 flaps biônicos traseiros', 'Direção esférica crab-walk']],
  ['BMW Vision Next 100', 'BMW', 2016, 'Alemanha', 'futuristic_concept', 'ev_quadmotor', 0.0, 800, 1350, 'AWD', '#ffb703', ['Alive Geometry em escamas móveis']],
  ['Audi Skysphere Concept', 'Audi', 2021, 'Alemanha', 'futuristic_concept', 'ev_quadmotor', 0.0, 632, 1800, 'RWD', '#48cae4', ['Entre-eixos variável motorizado']],
  ['Lamborghini Terzo Millennio', 'Lamborghini', 2017, 'Itália', 'futuristic_concept', 'ev_quadmotor', 0.0, 1400, 1280, 'AWD', '#38b000', ['Supercapacitores autorregenerativos']],
  ['Ferrari Vision Gran Turismo', 'Ferrari', 2022, 'Itália', 'futuristic_concept', 'flat6_gt3', 3.0, 1356, 1250, 'AWD', '#d90429'],
  ['Nissan Concept 2020 Vision GT', 'Nissan', 2015, 'Japão', 'futuristic_concept', 'flat6_gt3', 3.8, 1100, 1420, 'AWD', '#e63946'],
  ['Porsche Mission X Concept', 'Porsche', 2023, 'Alemanha', 'futuristic_concept', 'ev_quadmotor', 0.0, 1520, 1450, 'AWD', '#d4a373'],
  ['Bugatti Vision Gran Turismo', 'Bugatti', 2015, 'França', 'futuristic_concept', 'w16_quadturbo', 8.0, 1650, 1720, 'AWD', '#0077b6'],
  ['Mazda RX-Vision GT3 Concept', 'Mazda', 2020, 'Japão', 'futuristic_concept', 'v10_screamer', 2.6, 570, 1250, 'RWD', '#c1121f'],
  ['McLaren Ultimate Vision GT', 'McLaren', 2017, 'Reino Unido', 'futuristic_concept', 'v8_crossplane', 4.0, 1150, 1000, 'AWD', '#fb8500'],
  ['Peugeot Onyx Copper Concept', 'Peugeot', 2012, 'França', 'futuristic_concept', 'v8_crossplane', 3.7, 680, 1100, 'RWD', '#b87333'],
  ['Citroën GT by Citroën V8', 'Citroën', 2008, 'França', 'futuristic_concept', 'v8_crossplane', 5.4, 646, 1400, 'RWD', '#f8f9fa'],
  ['Lamborghini Egoista Monoposto', 'Lamborghini', 2013, 'Itália', 'futuristic_concept', 'v10_screamer', 5.2, 600, 950, 'AWD', '#adb5bd'],
  ['Lamborghini Lanzador Ultra-GT', 'Lamborghini', 2024, 'Itália', 'futuristic_concept', 'ev_quadmotor', 0.0, 1360, 2100, 'AWD', '#0096c7'],
  ['Renault Trezor Concept', 'Renault', 2016, 'França', 'futuristic_concept', 'ev_quadmotor', 0.0, 350, 1600, 'RWD', '#ced4da'],
  ['DS X E-Tense Asymmetric', 'DS Automobiles', 2018, 'França', 'futuristic_concept', 'ev_quadmotor', 0.0, 1360, 1520, 'AWD', '#023e8a'],
  ['Cadillac Cien V12 Concept', 'Cadillac', 2002, 'EUA', 'futuristic_concept', 'v12_italian', 7.5, 750, 1450, 'RWD', '#adb5bd'],
  ['Chrysler ME Four-Twelve', 'Chrysler', 2004, 'EUA', 'futuristic_concept', 'v12_italian', 6.0, 850, 1310, 'RWD', '#6c757d'],
  ['Ford GT90 Quad-Turbo V12', 'Ford', 1995, 'EUA', 'futuristic_concept', 'v12_italian', 5.9, 720, 1451, 'RWD', '#ffffff'],
  ['Volkswagen W12 Nardò Concept', 'Volkswagen', 2001, 'Alemanha', 'wedge_supercar', 'w16_quadturbo', 6.0, 600, 1200, 'RWD', '#ff7b00'],
];

while (CONCEPT_SEEDS.length < 40) {
  const i = CONCEPT_SEEDS.length;
  const makers = ['Genesis X Gran Berlinetta', 'Jaguar Vision GT SV', 'Alpine Alpenglow Hy6', 'Hyundai N Vision 74 Hydrogen', 'Italdesign Zerouno Duerta', 'Pininfarina Teorema', 'Polestar Synergy', 'Czinger 21C V Max', 'Delage D12 Speedster', 'Apollo Intensa Emozione'];
  CONCEPT_SEEDS.push([
    `${makers[i % makers.length]} Proto-${i}`,
    makers[i % makers.length].split(' ')[0],
    2022 + (i % 5),
    'Global',
    'futuristic_concept',
    i % 2 === 0 ? 'ev_quadmotor' : 'v12_italian',
    i % 2 === 0 ? 0.0 : 6.2,
    1120 + (i % 7) * 140,
    1180 + (i % 5) * 60,
    'AWD',
    STANDARD_PALETTES[i % STANDARD_PALETTES.length].hex,
  ]);
}

// 5. FORMULA, LE MANS, NASCAR, RALLY, DTM, SUPER GT & TOURING — 115 vehicles
const FORMULA_SEEDS: CompactSeed[] = [
  ['McLaren MP4/4 #12 (Tributo Ayrton Senna 1988)', 'McLaren-Honda', 1988, 'Reino Unido/Brasil', 'f1_openwheel', 'flat6_gt3', 1.5, 685, 540, 'RWD', '#e63946', ['Campeão Mundial 1988 — Turbo Honda V6']],
  ['McLaren MP4/6 V12 #1 (Tributo Senna Interlagos 1991)', 'McLaren-Honda', 1991, 'Reino Unido/Brasil', 'f1_openwheel', 'v12_italian', 3.5, 725, 505, 'RWD', '#d90429', ['Vitória épica só com a 6ª marcha em Interlagos!']],
  ['Lotus 97T #12 Estoril Rain Master', 'Lotus-Renault', 1985, 'Reino Unido', 'f1_openwheel', 'flat6_gt3', 1.5, 850, 540, 'RWD', '#14171f', ['Pintura Preta e Dourada Clássica']],
  ['Ferrari F2004 #1 (Tributo Michael Schumacher)', 'Scuderia Ferrari', 2004, 'Itália', 'f1_openwheel', 'v10_screamer', 3.0, 920, 605, 'RWD', '#d90429', ['V10 19.000 RPM mais rápido da história']],
  ['Mercedes-AMG F1 W11 EQ Performance #44 (Tributo Hamilton)', 'Mercedes-AMG F1', 2020, 'Alemanha/UK', 'f1_openwheel', 'flat6_gt3', 1.6, 1025, 746, 'RWD', '#161a1d', ['Sistema DAS + Recorde absoluto de poles']],
  ['Mercedes-Benz W196 Monoposto (Era 1950s)', 'Mercedes-Benz', 1954, 'Alemanha', 'f1_openwheel', 'v8_crossplane', 2.5, 290, 700, 'RWD', '#ced4da'],
  ['Lotus 49 Cosworth DFV (Era 1960s)', 'Team Lotus', 1967, 'Reino Unido', 'f1_openwheel', 'v8_crossplane', 3.0, 410, 500, 'RWD', '#004225'],
  ['Ferrari 312T2 (Era 1970s)', 'Scuderia Ferrari', 1976, 'Itália', 'f1_openwheel', 'v12_italian', 3.0, 500, 575, 'RWD', '#d90429'],
  ['Williams FW14B Active Suspension (Era 1990s)', 'Williams-Renault', 1992, 'Reino Unido', 'f1_openwheel', 'v10_screamer', 3.5, 760, 505, 'RWD', '#0077b6'],
  ['Brawn GP BGP 001 (Era 2000s)', 'Brawn GP', 2009, 'Reino Unido', 'f1_openwheel', 'v8_crossplane', 2.4, 750, 605, 'RWD', '#f8f9fa'],
  ['Red Bull RB9 V8 Blown Diffuser (Era 2010s)', 'Red Bull Racing', 2013, 'Áustria', 'f1_openwheel', 'v8_crossplane', 2.4, 760, 642, 'RWD', '#1d3557'],
  ['Red Bull RB19 Ground Effect (Era 2020s)', 'Red Bull Racing', 2023, 'Áustria', 'f1_openwheel', 'flat6_gt3', 1.6, 1010, 798, 'RWD', '#03045e'],
  // Le Mans Prototypes
  ['Mazda 787B Quad-Rotor #55 (LMP Legend)', 'Mazda', 1991, 'Japão', 'lmp_prototype', 'v10_screamer', 2.6, 700, 830, 'RWD', '#fb8500'],
  ['Porsche 919 Hybrid Evo (LMP1 Unlimited)', 'Porsche', 2018, 'Alemanha', 'lmp_prototype', 'i4_vtec_turbo', 2.0, 1160, 849, 'AWD', '#f8f9fa'],
  ['Audi R18 e-tron quattro (LMP1)', 'Audi Sport', 2014, 'Alemanha', 'lmp_prototype', 'flat6_gt3', 4.0, 830, 870, 'AWD', '#adb5bd'],
  ['Oreca 07 Gibson V8 (LMP2)', 'Oreca', 2021, 'França', 'lmp_prototype', 'v8_crossplane', 4.2, 603, 930, 'RWD', '#0096c7'],
  ['Ferrari 499P Le Mans Winner (LMH)', 'Ferrari AF Corse', 2023, 'Itália', 'lmp_prototype', 'flat6_gt3', 3.0, 680, 1030, 'AWD', '#d90429'],
  ['Toyota GR010 Hybrid (LMH)', 'Toyota Gazoo', 2023, 'Japão', 'lmp_prototype', 'flat6_gt3', 3.5, 680, 1040, 'AWD', '#e63946'],
  ['Porsche 963 Penske (LMDh)', 'Porsche', 2024, 'Alemanha', 'lmp_prototype', 'v8_crossplane', 4.6, 680, 1030, 'RWD', '#ffffff'],
  ['Cadillac V-Series.R V8 (LMDh)', 'Cadillac Racing', 2024, 'EUA', 'lmp_prototype', 'v8_crossplane', 5.5, 680, 1030, 'RWD', '#ffd60a'],
  // Group B & WRC Rally
  ['Lancia Delta S4 Grupo B Twincharged', 'Lancia Martini', 1986, 'Itália', 'rally_hatch', 'i4_vtec_turbo', 1.8, 550, 890, 'AWD', '#f8f9fa', ['Turbo + Supercharger simultâneos']],
  ['Audi Sport Quattro S1 E2 Pike’s Peak', 'Audi Sport', 1985, 'Alemanha', 'rally_hatch', 'i4_vtec_turbo', 2.1, 598, 1090, 'AWD', '#ffd60a', ['5 Cilindros com chirps de wastegate']],
  ['Peugeot 205 Turbo 16 Evo 2 Grupo B', 'Peugeot Talbot', 1986, 'França', 'rally_hatch', 'i4_vtec_turbo', 1.8, 500, 910, 'AWD', '#ffffff'],
  ['Ford RS200 Evolution Grupo B', 'Ford Motorsport', 1986, 'Reino Unido', 'rally_hatch', 'i4_vtec_turbo', 2.1, 580, 1050, 'AWD', '#e9ecef'],
  ['Subaru Impreza 22B WRC98', 'Subaru', 1998, 'Japão', 'sedan_tuner', 'i4_vtec_turbo', 2.2, 320, 1230, 'AWD', '#0077b6'],
  ['Mitsubishi Lancer Evolution VI Tommi Mäkinen', 'Mitsubishi', 2000, 'Japão', 'sedan_tuner', 'i4_vtec_turbo', 2.0, 315, 1360, 'AWD', '#d90429'],
  ['Toyota GR Yaris Rally1 Hybrid WRC', 'Toyota Gazoo', 2024, 'Japão', 'rally_hatch', 'i4_vtec_turbo', 1.6, 500, 1260, 'AWD', '#14171f'],
  // DTM, Super GT, Stock Car Brasil, NASCAR
  ['Mercedes-Benz 190E 2.5-16 Evo II DTM', 'Mercedes-AMG', 1992, 'Alemanha', 'sedan_tuner', 'i4_vtec_turbo', 2.5, 373, 980, 'RWD', '#212529'],
  ['Alfa Romeo 155 V6 TI DTM', 'Alfa Corse', 1993, 'Itália', 'sedan_tuner', 'v10_screamer', 2.5, 420, 1060, 'AWD', '#d90429'],
  ['Nissan Skyline GT-R Calsonic GT500 (Super GT)', 'Nissan NISMO', 1999, 'Japão', 'modern_gt', 'flat6_gt3', 2.7, 500, 1100, 'RWD', '#0096c7'],
  ['Toyota Castrol Supra GT500 (JGTC)', 'Toyota TOM’S', 1997, 'Japão', 'modern_gt', 'i4_vtec_turbo', 2.1, 493, 1100, 'RWD', '#f8f9fa'],
  ['Honda NSX-GT Type S GT500', 'Honda HRC', 2023, 'Japão', 'hypercar_aero', 'i4_vtec_turbo', 2.0, 650, 1020, 'RWD', '#ff5722'],
  ['Chevrolet Cruze Stock Car Pro Series Brasil', 'Stock Car Brasil', 2024, 'Brasil', 'sedan_tuner', 'v8_crossplane', 6.8, 550, 1320, 'RWD', '#ffd60a', ['Push-to-Pass Oficial Interlagos']],
  ['Toyota Corolla Stock Car Pro Series Brasil', 'Stock Car Brasil', 2024, 'Brasil', 'sedan_tuner', 'v8_crossplane', 6.8, 550, 1320, 'RWD', '#e63946'],
  ['Chevrolet Opala Stock Car 1979 Inaugural', 'Stock Car Brasil', 1979, 'Brasil', 'muscle_fastback', 'flat6_gt3', 4.1, 230, 1180, 'RWD', '#2a9d8f'],
];

// Add 12 NASCAR eras + Touring / GT3 / Formula cars to reach 115
for (let n = 0; n < 12; n++) {
  const eras = [
    ['Hudson Hornet NASCAR Grand National', 1953, 185],
    ['Plymouth Superbird #43 Petty Tribute', 1970, 580],
    ['Chevrolet Monte Carlo Wrangler Cup', 1984, 620],
    ['Chevrolet Lumina Stock Cup', 1991, 660],
    ['Chevrolet Monte Carlo SS Gen-4', 1998, 720],
    ['Ford Taurus NASCAR Cup', 2003, 770],
    ['Dodge Charger Car of Tomorrow', 2009, 830],
    ['Toyota Camry Gen-6 Cup', 2015, 850],
    ['Ford Mustang Dark Horse Next-Gen Cup', 2024, 670],
    ['Chevrolet Camaro ZL1 Garage 56 Le Mans', 2023, 750],
    ['Pontiac Grand Prix NASCAR', 1988, 640],
    ['Buick Regal Grand National NASCAR', 1982, 600],
  ][n];
  FORMULA_SEEDS.push([
    eras[0] as string,
    'NASCAR Legend',
    eras[1] as number,
    'EUA',
    'muscle_fastback',
    'v8_crossplane',
    5.8,
    eras[2] as number,
    1490,
    'RWD',
    HISTORICAL_MUSCLE_PALETTES[n % HISTORICAL_MUSCLE_PALETTES.length].hex,
  ]);
}

while (FORMULA_SEEDS.length < 115) {
  const i = FORMULA_SEEDS.length;
  const series = [
    ['Volvo 850 Estate BTCC Perua de Pista', 'Volvo', 1994, 'Suécia', 'rally_hatch', 'i4_vtec_turbo', 2.0, 290, 975, 'FWD'],
    ['Renault Laguna Williams BTCC', 'Renault', 1997, 'França', 'sedan_tuner', 'i4_vtec_turbo', 2.0, 310, 975, 'FWD'],
    ['Lynk & Co 03 TCR WTCR Champion', 'Lynk & Co', 2022, 'Suécia/China', 'sedan_tuner', 'i4_vtec_turbo', 2.0, 350, 1265, 'FWD'],
    ['Hyundai Elantra N TCR WTCR', 'Hyundai N', 2023, 'Coreia do Sul', 'sedan_tuner', 'i4_vtec_turbo', 2.0, 350, 1265, 'FWD'],
    ['BMW M4 GT3 Nürburgring 24h', 'BMW M Motorsport', 2024, 'Alemanha', 'modern_gt', 'flat6_gt3', 3.0, 590, 1300, 'RWD'],
    ['Porsche 911 GT3 R "Grello" (992)', 'Manthey EMA', 2024, 'Alemanha', 'modern_gt', 'flat6_gt3', 4.2, 565, 1250, 'RWD'],
    ['Dallara IR-18 IndyCar Oval Spec', 'IndyCar', 2024, 'EUA', 'f1_openwheel', 'flat6_gt3', 2.2, 720, 740, 'RWD'],
    ['Formula E Gen3 Evo AWD', 'FIA Formula E', 2025, 'Global', 'f1_openwheel', 'ev_quadmotor', 0.0, 476, 840, 'AWD'],
  ][i % 8];
  FORMULA_SEEDS.push([
    `${series[0]} #${14 + i}`,
    series[1] as string,
    series[2] as number,
    series[3] as string,
    series[4] as CarArchetype,
    series[5] as EngineType,
    series[6] as number,
    series[7] as number,
    series[8] as number,
    series[9] as 'RWD' | 'FWD' | 'AWD',
    STANDARD_PALETTES[i % STANDARD_PALETTES.length].hex,
  ]);
}

// 6. POPULAR / EVERYDAY CARS — 142 vehicles (HEADLINED BY FIAT UNO 2005!)
const POPULAR_SEEDS: CompactSeed[] = [
  [
    'Fiat Uno Mille Fire 1.0 (Sem Ar-Condicionado)',
    'Fiat',
    2005,
    'Brasil',
    'boxy_hatch_uno',
    'i4_econobox',
    1.0,
    55,
    810,
    'FWD',
    '#f8f9fa',
    [
      'Painel rachado de sol autenticamente modelado',
      'Cheirinho de Pinho balançando no retrovisor',
      'Adesivo "Família Feliz" no vidro traseiro',
      'Opção de Escada da Firma no Teto (+mito de velocidade) e Swap V12!',
    ],
  ],
  [
    'Volkswagen Gol Quadrado GTS 1.8 AP',
    'Volkswagen',
    1988,
    'Brasil',
    'boxy_hatch_uno',
    'i4_vtec_turbo',
    1.8,
    99,
    960,
    'FWD',
    '#d90429',
    ['Motor AP lendário', 'Opção de Paredão de Som Automotivo que treme a lataria inteira!'],
  ],
  [
    'Chevrolet Celta 1.0 VHC Super',
    'Chevrolet',
    2003,
    'Brasil',
    'boxy_hatch_uno',
    'i4_econobox',
    1.0,
    70,
    860,
    'FWD',
    '#adb5bd',
    ['Opção exclusiva de Escapamento Furado na oficina!'],
  ],
  [
    'Fiat Palio Weekend Adventure Locker 1.8',
    'Fiat',
    2004,
    'Brasil',
    'rally_hatch',
    'i4_econobox',
    1.8,
    103,
    1170,
    'FWD',
    '#386641',
    ['Para-choques parrudos com quebra-mato'],
  ],
  ['Renault Clio 1.6 16V Privilegé', 'Renault', 2001, 'França/Brasil', 'boxy_hatch_uno', 'i4_econobox', 1.6, 110, 995, 'FWD', '#0077b6'],
  [
    'Peugeot 206 1.6 Quiksilver (Chora Boy Edition)',
    'Peugeot',
    2004,
    'França/Brasil',
    'boxy_hatch_uno',
    'i4_econobox',
    1.6,
    110,
    1025,
    'FWD',
    '#bfc7d5',
    ['Suspensão a rosca/ar até raspar faísca no chão'],
  ],
  ['Ford Ka 1.0 Endura "Joaninha"', 'Ford', 1998, 'Brasil', 'boxy_hatch_uno', 'i4_econobox', 1.0, 53, 875, 'FWD', '#7209b7'],
  ['Citroën C3 Exclusive 1.6 (Adesivo Caveira)', 'Citroën', 2006, 'França/Brasil', 'boxy_hatch_uno', 'i4_econobox', 1.6, 110, 1065, 'FWD', '#14171f'],
  ['Fiat Marea Turbo 2.0 20V Fivetech', 'Fiat', 2001, 'Brasil', 'sedan_tuner', 'i4_vtec_turbo', 2.0, 182, 1310, 'FWD', '#023e8a', ['Ronco de 5 cilindros absurdo — cuidado com a temperatura!']],
  ['Honda Civic Si VTi (EG6 5ª Ger)', 'Honda', 1993, 'Japão', 'boxy_hatch_uno', 'i4_vtec_turbo', 1.6, 160, 1040, 'FWD', '#d90429'],
  ['Honda Civic Type R / Si (EK9 6ª Ger)', 'Honda', 1998, 'Japão', 'boxy_hatch_uno', 'i4_vtec_turbo', 1.6, 185, 1090, 'FWD', '#ffffff'],
  ['Honda Civic Si K20Z3 Nacional (FA5 8ª Ger)', 'Honda', 2008, 'Brasil', 'sedan_tuner', 'i4_vtec_turbo', 2.0, 192, 1322, 'FWD', '#e63946', ['VTEC abre a 6.000 RPM até 8.400 RPM!']],
  ['Honda Civic Si Coupe 1.5T (10ª Ger)', 'Honda', 2019, 'EUA/Japão', 'sedan_tuner', 'i4_vtec_turbo', 1.5, 208, 1315, 'FWD', '#38b000'],
  ['Honda Civic Type R FL5 (11ª Ger)', 'Honda', 2024, 'Japão', 'sedan_tuner', 'i4_vtec_turbo', 2.0, 315, 1430, 'FWD', '#f8f9fa'],
  ['Toyota Corolla AE86 Sprinter Trueno GT-Apex', 'Toyota', 1985, 'Japão', 'sedan_tuner', 'i4_vtec_turbo', 1.6, 130, 940, 'RWD', '#f8f9fa', ['Entrega de Tofu aprovada nas montanhas']],
  ['Toyota Corolla XEi 1.8 "Brad Pitt"', 'Toyota', 2004, 'Brasil', 'sedan_tuner', 'i4_econobox', 1.8, 136, 1185, 'FWD', '#ced4da'],
  ['Toyota Corolla Altis 2.0 "Vovôrola Indestrutível"', 'Toyota', 2015, 'Brasil', 'sedan_tuner', 'i4_econobox', 2.0, 154, 1295, 'FWD', '#adb5bd'],
  ['Toyota GR Corolla Circuit Edition', 'Toyota', 2024, 'Japão', 'rally_hatch', 'i4_vtec_turbo', 1.6, 304, 1475, 'AWD', '#d90429'],
  ['Chevrolet Chevette Tubarão 1.4', 'Chevrolet', 1976, 'Brasil', 'sedan_tuner', 'i4_econobox', 1.4, 68, 880, 'RWD', '#fb8500'],
  ['Chevrolet Monza Classic SE 2.0 Tubarão', 'Chevrolet', 1992, 'Brasil', 'sedan_tuner', 'i4_econobox', 2.0, 116, 1130, 'FWD', '#6a040f'],
  ['Chevrolet Kadett GSi Conversível', 'Chevrolet', 1993, 'Brasil', 'boxy_hatch_uno', 'i4_econobox', 2.0, 121, 1080, 'FWD', '#ffd60a'],
  ['Volkswagen Santana Executiva 2000i', 'Volkswagen', 1990, 'Brasil', 'sedan_tuner', 'i4_econobox', 2.0, 125, 1160, 'FWD', '#2b2d42'],
  ['Volkswagen Fusca Série Ouro Itamar', 'Volkswagen', 1996, 'Brasil', 'classic_beetle', 'i4_econobox', 1.6, 58, 800, 'RWD', '#52b788'],
  ['Volkswagen Brasília 1600 Dupla Carburação', 'Volkswagen', 1979, 'Brasil', 'boxy_hatch_uno', 'i4_econobox', 1.6, 65, 890, 'RWD', '#ffd166'],
  ['Ford Escort XR3 2.0i Conversível', 'Ford', 1994, 'Brasil', 'boxy_hatch_uno', 'i4_econobox', 2.0, 116, 1110, 'FWD', '#e63946'],
  ['Fiat Uno Turbo i.e. 1.4', 'Fiat', 1995, 'Brasil', 'boxy_hatch_uno', 'i4_vtec_turbo', 1.4, 118, 975, 'FWD', '#d90429'],
  ['Fiat Tempra Turbo Stile', 'Fiat', 1996, 'Brasil', 'sedan_tuner', 'i4_vtec_turbo', 2.0, 165, 1275, 'FWD', '#1d3557'],
  ['Renault Sandero R.S. 2.0 Racing Spirit', 'Renault', 2020, 'Brasil', 'boxy_hatch_uno', 'i4_vtec_turbo', 2.0, 150, 1161, 'FWD', '#14171f'],
  ['Volkswagen Up! TSI Move ("Tampa Preta")', 'Volkswagen', 2018, 'Brasil', 'boxy_hatch_uno', 'i4_vtec_turbo', 1.0, 105, 951, 'FWD', '#ffffff', ['Terror dos esportivos na Marginal']],
  ['Hyundai HB20 1.6 Copa', 'Hyundai', 2016, 'Brasil', 'boxy_hatch_uno', 'i4_econobox', 1.6, 128, 1040, 'FWD', '#0077b6'],
];

const EVERYDAY_FAMILIES = [
  ['Volkswagen Gol G3 1.0 16V Turbo', 'Volkswagen', 'Brasil', 'boxy_hatch_uno', 'FWD'],
  ['Chevrolet Corsa Wind 1.0 EFI', 'Chevrolet', 'Brasil', 'boxy_hatch_uno', 'FWD'],
  ['Chevrolet Astra GSi 2.0 16V', 'Chevrolet', 'Brasil', 'boxy_hatch_uno', 'FWD'],
  ['Chevrolet Vectra CD 2.2 16V', 'Chevrolet', 'Brasil', 'sedan_tuner', 'FWD'],
  ['Chevrolet Omega Suprema CD 4.1', 'Chevrolet', 'Brasil', 'rally_hatch', 'RWD'],
  ['Volkswagen Saveiro Surf 1.8', 'Volkswagen', 'Brasil', 'boxy_hatch_uno', 'FWD'],
  ['Volkswagen Parati GLS 1.8S', 'Volkswagen', 'Brasil', 'rally_hatch', 'FWD'],
  ['Fiat Punto T-Jet 1.4 Turbo', 'Fiat', 'Brasil', 'boxy_hatch_uno', 'FWD'],
  ['Ford Fiesta RS1600 Rocam', 'Ford', 'Brasil', 'boxy_hatch_uno', 'FWD'],
  ['Mazda MX-5 Miata NA 1.8', 'Mazda', 'Japão', 'classic_roadster', 'RWD'],
  ['Volkswagen Golf GTI Mk4 1.8T', 'Volkswagen', 'Alemanha', 'boxy_hatch_uno', 'FWD'],
  ['Suzuki Cappuccino Kei Turbo', 'Suzuki', 'Japão', 'classic_roadster', 'RWD'],
] as const;

while (POPULAR_SEEDS.length < 142) {
  const i = POPULAR_SEEDS.length;
  const f = EVERYDAY_FAMILIES[i % EVERYDAY_FAMILIES.length];
  const yr = 1990 + (i % 34);
  const ver = ['GL', 'CLi', 'ELX', 'Sport', 'Completaço', 'Básico Firma', 'Rebaixado Aro 17', 'Stage 2'][i % 8];
  POPULAR_SEEDS.push([
    `${f[0]} ${ver} '${yr % 100}`,
    f[1],
    yr,
    f[2],
    f[3] as CarArchetype,
    i % 4 === 0 ? 'i4_vtec_turbo' : 'i4_econobox',
    1.0 + (i % 5) * 0.25,
    68 + (i % 7) * 18,
    910 + (i % 6) * 55,
    f[4] as 'FWD' | 'RWD',
    STANDARD_PALETTES[i % STANDARD_PALETTES.length].hex,
  ]);
}

// 7. EXOTIC / SPECIAL / EASTER EGGS — 90 vehicles (with secret unlock puzzles!)
interface ExoticDef {
  seed: CompactSeed;
  hint: string;
  code: string;
}

const EXOTIC_HEROES: ExoticDef[] = [
  {
    seed: ['Atom-X Fission Streamliner (Foguete Nuclear)', 'Los Alamos Speedworks', 2026, 'Ficcional', 'rocket_streamliner', 'nuclear_turbine', 0.0, 4800, 1450, 'RWD', '#00f5d4', ['Reator Cherenkov azul brilhante + empuxo térmico']],
    hint: 'Some os números atômicos do Urânio (92) e Plutônio (94) seguidos de RPM.',
    code: '186RPM',
  },
  {
    seed: ['Ashanti Mahogany GT (Carro 100% Madeira Artesanal)', 'Kumasi Woodcraft', 2023, 'Gana', 'classic_roadster', 'v8_crossplane', 3.5, 290, 1120, 'RWD', '#8d5524', ['Esculpido à mão em mogno africano envernizado']],
    hint: 'Capital histórica artesanal Ashanti em maiúsculas.',
    code: 'KUMASI',
  },
  {
    seed: ['Brunel Dreadnought Steampunk (Caldeira a Vapor)', 'Royal Brass Works', 1899, 'Reino Unido', 'classic_1900_open', 'steam_boiler', 12.0, 410, 2100, 'RWD', '#b87333', ['Chaminé de cobre cuspindo vapor pressurizado e engrenagens aparentes']],
    hint: 'Pressão máxima em PSI: escreva VAPOR1899.',
    code: 'VAPOR1899',
  },
  {
    seed: ['Kusanagi 2099 Spinner (Cyberpunk Neon)', 'Tyrell-Neo Mobility', 2099, 'Neo Tokyo', 'futuristic_concept', 'ev_quadmotor', 0.0, 1650, 1340, 'AWD', '#ff007f', ['Barras de neon holográfico 360°']],
    hint: 'O ano da pista cyberpunk onde chove ácido.',
    code: 'CYBER2099',
  },
  {
    seed: ['DMC-88 Chrono-Flux Stainless (Modificações Temporais)', 'OutaTime Lab', 1981, 'EUA', 'gullwing_coupe', 'nuclear_turbine', 2.8, 880, 1390, 'RWD', '#ced4da', ['Aço inox escovado + trilhas de plasma aos 142 km/h (88 mph)!']],
    hint: 'Qual velocidade em MPH ativa o salto temporal?',
    code: '88MPH',
  },
  {
    seed: ['Gotham Nocturne Tumbler V12 (Vigilante Noturno)', 'Arkham Defense', 2024, 'EUA', 'hypercar_aero', 'nuclear_turbine', 6.2, 1250, 2250, 'AWD', '#101216', ['Blindagem furtiva angular + pós-combustor traseiro']],
    hint: 'O cavaleiro da meia-noite: digite SOMBRA.',
    code: 'SOMBRA',
  },
  {
    seed: ['Pedra-Móvel Brontossauro (Movido a Pés!)', 'Pedregulho Motors', -10000, 'Pangeia', 'classic_1900_open', 'i4_econobox', 0.5, 42, 680, 'RWD', '#d4a373', ['Rodas de granito maciço e teto de couro pré-histórico']],
    hint: 'Grito clássico da Idade da Pedra: YABBA.',
    code: 'YABBA',
  },
  {
    seed: ['Carrinho de Supermercado Atacadão V8 Twin-Turbo', 'HiperCompras Racing', 2025, 'Brasil', 'shopping_cart', 'v8_crossplane', 5.0, 620, 310, 'RWD', '#e63946', ['Grade cromada de arame + rodinha dianteira que treme a 300 km/h!']],
    hint: 'Corredor de ofertas relâmpago: OFERTA99.',
    code: 'OFERTA99',
  },
  {
    seed: ['Sofá Chesterfield Couro com Motor V8 Big-Block', 'Sala de Estar Tuning', 2022, 'Reino Unido', 'v8_sofa', 'v8_crossplane', 7.4, 540, 520, 'RWD', '#6f1d1b', ['Almofadas macias, abajur lateral e volante de bandeja de pizza']],
    hint: 'Onde fica o controle remoto perdido? ALMOFADA.',
    code: 'ALMOFADA',
  },
  {
    seed: ['Geladeira Frost-Free Duplex Biturbo Inox', 'EletroFrio Motorsport', 2025, 'Brasil', 'turbo_fridge', 'i4_vtec_turbo', 2.5, 750, 440, 'AWD', '#dfe7fd', ['Intercooler literalmente a -18°C + pinguim na capota!']],
    hint: 'Temperatura ideal do freezer: MENOS18.',
    code: 'MENOS18',
  },
  {
    seed: ['Cama King-Size Motorizada Ortopédica V10', 'Bons Sonhos Competição', 2025, 'Brasil', 'racing_bed', 'v10_screamer', 5.0, 820, 590, 'AWD', '#7209b7', ['Exclusiva piada oficial para corridas noturnas — piloto corre debaixo do edredom!']],
    hint: 'Ideal para corridas noturnas: SONECA.',
    code: 'SONECA',
  },
  {
    seed: ['Tanque Blindado M1- Drift Spec 2000cv (Lagartas de Kevlar)', 'Iron Tread Racing', 2026, 'Global', 'battle_tank', 'nuclear_turbine', 27.0, 2000, 9800, 'AWD', '#4a5759', ['Lagartas articuladas de alta velocidade + torre aerodinâmica']],
    hint: 'Código blindado: LAGARTA2000.',
    code: 'LAGARTA2000',
  },
  {
    seed: ['Ônibus Escolar Amarelo com Turbina J79 de Caça', 'Excursão Supersônica', 2024, 'EUA', 'jet_bus', 'nuclear_turbine', 18.0, 3200, 5400, 'RWD', '#ffb703', ['Chama de 6 metros pelo fundo do corredor escolar!']],
    hint: 'Nunca mais chegue atrasado na aula: RECREIO.',
    code: 'RECREIO',
  },
  {
    seed: ['Caminhão de Sorvete Demoníaco "Casquinha do Caos"', 'Gelato Infernal', 1986, 'Ficcional', 'ice_cream_truck', 'v8_crossplane', 6.6, 890, 2450, 'RWD', '#ffafcc', ['Casquinha gigante no teto + jingle distorcido assustador']],
    hint: 'Sabor proibido: CASQUINHA.',
    code: 'CASQUINHA',
  },
  {
    seed: ['Trator Agrícola 2000cv Pull-Spec Tri-Turbo', 'AgroTorque Extreme', 2025, 'Brasil', 'farm_tractor', 'v8_crossplane', 14.0, 2000, 3100, 'RWD', '#38b000', ['Pneus agrícolas gigantes + empinada de largada']],
    hint: 'Força bruta do campo: SAFRA2000.',
    code: 'SAFRA2000',
  },
  {
    seed: ['Kombi Hippie "Paz & Boxer" com Motor Porsche 911 Turbo', 'Oficina Flower Power', 1974, 'Brasil/Alemanha', 'ice_cream_truck', 'flat6_gt3', 3.8, 650, 1290, 'RWD', '#2ec4b6', ['Pintura psicodélica + Boxer Biturbo refrigerado a água escondido atrás']],
    hint: 'Paz, amor e seis cilindros contrapostos: KOMBI911.',
    code: 'KOMBI911',
  },
  {
    seed: ['Bicicleta Barra-Forte Motorizada 2-Tempos Nitro', 'Grau & Corte Lab', 2024, 'Brasil', 'shopping_cart', 'rc_brushless', 0.08, 95, 68, 'RWD', '#d90429', ['Competindo de igual pra igual com Bugattis — equilíbrio é com o Game Designer!']],
    hint: 'Duas rodas e muita coragem: BARRAFORTE.',
    code: 'BARRAFORTE',
  },
];

while (EXOTIC_HEROES.length < 90) {
  const i = EXOTIC_HEROES.length;
  const wildBases: [string, CarArchetype, EngineType, number, number, string][] = [
    ['Cortador de Grama Honda V-Twin 1000cc', 'farm_tractor', 'i4_vtec_turbo', 210, 240, '#d90429'],
    ['Banheira Vitoriana de Ferro Fundido Turbo', 'v8_sofa', 'i4_vtec_turbo', 380, 350, '#f8f9fa'],
    ['Empilhadeira de Galpão Drift Spec 2JZ', 'turbo_fridge', 'flat6_gt3', 680, 1450, '#ffb703'],
    ['Carro-Salsicha Gigante Aerodinâmico', 'rocket_streamliner', 'v8_crossplane', 520, 1600, '#fb8500'],
    ['Rover Lunar Apollo Overclocked', 'rc_buggy', 'ev_quadmotor', 450, 420, '#ced4da'],
    ['Trenó a Jato de Natal Mk-XII', 'rocket_streamliner', 'nuclear_turbine', 1500, 780, '#c1121f'],
    ['Carrinho de Bate-Bate de Parque Alta Tensão', 'classic_beetle', 'ev_quadmotor', 390, 360, '#7209b7'],
    ['Gôndola Veneziana Anfíbia V12', 'classic_1900_open', 'v12_italian', 700, 920, '#14171f'],
    ['Máquina de Lavar Centrífuga 15.000 RPM', 'turbo_fridge', 'ev_quadmotor', 610, 390, '#4cc9f0'],
    ['Piano de Cauda de Concerto Motorizado', 'v8_sofa', 'v10_screamer', 590, 620, '#111111'],
  ];
  const wb = wildBases[i % wildBases.length];
  EXOTIC_HEROES.push({
    seed: [
      `${wb[0]} Edição #${i}`,
      'Velocity Lab Secret',
      2026,
      'Secreto',
      wb[1],
      wb[2],
      3.0,
      wb[3] + (i % 6) * 45,
      wb[4],
      'AWD',
      wb[5],
      ['Easter Egg Desbloqueável com Puzzle'],
    ],
    hint: `Enigma Secreto #${i}: digite SEGREDO${i} no terminal de Easter Eggs.`,
    code: `SEGREDO${i}`,
  });
}

// 8. RC CARS — RE-VOLT DIRECT HOMAGE — 80 vehicles
const RC_SEEDS: CompactSeed[] = [
  ['RC Bandit (Tributo Clássico 1999)', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 4.2, 1.8, 'AWD', '#e63946', ['Antena flexível com física', 'Escala 1:10 Macro']],
  ['Toyeca Pro-Brushless 6S (Rei do Re-Volt)', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 6.8, 1.6, 'AWD', '#d90429', ['Lenda absoluta da classe Pro RC']],
  ['Adeon GT-RC', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 6.4, 1.7, 'AWD', '#ff0054'],
  ['Cougar Twin-LiPo', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 6.6, 1.65, 'AWD', '#0077b6'],
  ['Humma Rally-RC', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 6.2, 1.75, 'AWD', '#ffd60a'],
  ['Zipper Turbo Pocket', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 5.5, 1.4, 'RWD', '#38b000'],
  ['Panga Monster-RC', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 5.9, 2.6, 'AWD', '#7209b7'],
  ['Volken Turbo Buggy', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 4.9, 1.7, 'RWD', '#00bbf9'],
  ['Dust Mite Micro-Buggy', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 3.8, 1.3, 'RWD', '#fb8500'],
  ['Sprinter XL Glow-Plug Nitro', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.02, 5.2, 1.9, 'AWD', '#2ec4b6'],
  ['Col. Moss Jeep-RC', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 4.5, 2.2, 'AWD', '#386641'],
  ['Bertha Ballistics Heavy-RC', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 5.1, 2.8, 'AWD', '#495057'],
  ['Pest Control Van-RC', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 4.7, 2.3, 'RWD', '#f4a261'],
  ['Rotor Invertible RC (Roda de Cabeça pra Baixo!)', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 6.0, 2.1, 'AWD', '#ffbe0b'],
  ['Clockwork Corda Mecânica Dourado', 'Acclaim-Volt RC', 1999, 'Re-Volt Legacy', 'rc_buggy', 'rc_brushless', 0.0, 4.0, 1.1, 'RWD', '#ffd700'],
];

while (RC_SEEDS.length < 80) {
  const i = RC_SEEDS.length;
  const rcSeries = [
    'Tamiya Grasshopper Tribute',
    'Kyosho Inferno MP10 Nitro 1:8',
    'Traxxas X-O1 160km/h Brushless',
    'Yokomo YD-2SXIII Drift RC',
    'Arrma Felony 6S BLX Street Bash',
    'Losi 5IVE-T 1:5 Gas Short Course',
    'Mini-Z AWD Touge Micro 1:28',
    'Schumacher Cat L1R Pro Buggy',
  ];
  const baseName = rcSeries[i % rcSeries.length];
  RC_SEEDS.push([
    `${baseName} Spec-${i}`,
    'Velocity RC Lab',
    2020 + (i % 7),
    'Macro-RC',
    'rc_buggy',
    'rc_brushless',
    0.0,
    4.2 + (i % 6) * 0.65,
    1.5 + (i % 4) * 0.25,
    i % 3 === 0 ? 'RWD' : 'AWD',
    STANDARD_PALETTES[i % STANDARD_PALETTES.length].hex,
    ['Antena oscilante com física + Bateria LiPo de alta descarga'],
  ]);
}

export const CAR_CATALOG: CarSpec[] = [
  // Put Fiat Uno 2005 first in Popular or easy lookup; let's preserve category ordering while keeping Uno iconic!
  ...POPULAR_SEEDS.map((s, idx) =>
    buildSpec('popular_br', idx, s, idx === 0 ? { id: 'fiat-uno-2005-raiz' } : undefined)
  ),
  ...CLASSICS_HEROES.map((s, idx) =>
    buildSpec(
      'classics',
      idx,
      s,
      idx === 0
        ? { id: 'ford-model-t-1908' }
        : idx === 10
        ? { id: 'mercedes-300sl-gullwing' }
        : undefined
    )
  ),
  ...MUSCLE_HEROES.map((s, idx) => buildSpec('muscle', idx, s)),
  ...SUPERCARS_HEROES.map((s, idx) =>
    buildSpec('supercars', idx, s, idx === 1 ? { id: 'bugatti-chiron-300' } : undefined)
  ),
  ...ORIGINAL_HYPERCARS,
  ...CONCEPT_SEEDS.map((s, idx) => buildSpec('hyper_concepts', idx + 100, s)),
  ...FORMULA_SEEDS.map((s, idx) =>
    buildSpec('formula_proto', idx, s, idx === 0 ? { id: 'mclaren-mp4-4-senna' } : undefined)
  ),
  ...EXOTIC_HEROES.map((e, idx) =>
    buildSpec('exotic_easter', idx, e.seed, {
      easterEggPuzzleHint: e.hint,
      secretUnlockCode: e.code,
    })
  ),
  ...RC_SEEDS.map((s, idx) =>
    buildSpec('rc_revolt', idx, s, idx === 1 ? { id: 'revolt-toyeca-pro' } : undefined)
  ),
];

export const CATEGORY_LABELS: Record<CarCategory, string> = {
  popular_br: 'Populares & Lendas de Rua',
  classics: 'Clássicos (1900–1969)',
  muscle: 'Muscle Cars (1970–1989)',
  supercars: 'Supercars Modernos',
  hyper_concepts: 'Hypercars Conceituais & Originais',
  formula_proto: 'Fórmula, Le Mans & Rally',
  exotic_easter: 'Exóticos & Easter Eggs',
  rc_revolt: 'Controle Remoto (Re-Volt)',
};

// 500 Distinct Wheel Rim Models
const WHEEL_BRANDS = [
  'BBS',
  'Volk Rays',
  'Enkei',
  'HRE',
  'Forgeline',
  'Rotiform',
  'Work',
  'OZ Racing',
  'Weld Racing',
  'Fifteen52',
  'SSR',
  'Advan',
  'Vossen',
  'Brixton Forged',
  'OEM Clássica BR',
];

const WHEEL_STYLES = [
  'RS Mesh',
  'LM Forged',
  'TE37 Saga',
  'RPF1 Type-II',
  'P101 Monoblock',
  'GS1R Track',
  'LAS-R Aerodisc',
  'Meister S1 3P',
  'Superturismo WRC',
  'RT-S Beadlock',
  'Turbomac',
  'Professor SP1',
  'GT Beyond',
  'Orbital Gomão',
  'Ferro Preta Raiz',
];

export interface WheelModelSpec {
  index: number;
  name: string;
  brand: string;
  spokes: number;
  deepDish: boolean;
  aerodisc: boolean;
  weightDeltaKg: number;
}

export const WHEEL_CATALOG: WheelModelSpec[] = Array.from({ length: 500 }, (_, i) => {
  const brand = WHEEL_BRANDS[i % WHEEL_BRANDS.length];
  const style = WHEEL_STYLES[Math.floor(i / WHEEL_BRANDS.length) % WHEEL_STYLES.length];
  const rev = Math.floor(i / (WHEEL_BRANDS.length * 5)) + 1;
  return {
    index: i,
    name: `${brand} ${style} Mk.${rev} #${String(i + 1).padStart(3, '0')}`,
    brand,
    spokes: 5 + (i % 11),
    deepDish: i % 3 === 0,
    aerodisc: i % 9 === 0,
    weightDeltaKg: -4 + (i % 7),
  };
});

export const STICKER_LIBRARY = [
  { id: 'familia_feliz', label: 'Família Feliz (Clássico Vidro Traseiro)', badge: '👨‍👩‍👧‍👦🐕' },
  { id: 'caveira', label: 'Caveira Tuning Noturna', badge: '💀🔥' },
  { id: 'escada_firma', label: 'A Serviço da Telecom — Velocidade da Luz', badge: '🪜⚡' },
  { id: 'foi_deus', label: 'Foi Deus Que Me Deu / Nunca Foi Sorte', badge: '🙏✨' },
  { id: 'revolt_bolt', label: 'Re-Volt 1999 Lightning Legacy', badge: '⚡🏎️' },
  { id: 'churrasco_club', label: 'Amigos do Churrasco na Curva do Laranjinha', badge: '🥩🔥' },
  { id: 'nurburgring', label: '20.832m Nordschleife Certified', badge: '🏁🇩🇪' },
  { id: 'touge_akina', label: 'Fujiwara Tofu Delivery Spec', badge: '⛰️🇯🇵' },
  { id: 'ipatinga_aco', label: 'Vale do Aço 2000cv Club — MG', badge: '⚙️🇧🇷' },
  { id: 'none', label: 'Sem Adesivo', badge: '—' },
];

export function createDefaultTuneForCar(car: CarSpec): CarTuneSetup {
  const isUno = car.id === 'fiat-uno-2005-raiz';
  const isGol = car.name.includes('Gol Quadrado');
  const isCelta = car.name.includes('Celta');
  const gearCount = car.engineType === 'ev_quadmotor' || car.engineType === 'rc_brushless' ? 4 : car.category === 'formula_proto' ? 7 : isUno ? 5 : 6;
  const defaultRatios = [3.45, 2.28, 1.68, 1.31, 1.06, 0.88, 0.75, 0.66].slice(0, gearCount);

  return {
    engineSwap: null,
    induction: car.engineType.includes('turbo') ? 'twin_turbo' : 'na',
    boostPsi: car.engineType.includes('turbo') ? 18 : 0,
    nitroCapacityKg: 5,
    afrMixture: 'stoich',
    exhaustStyle: isCelta ? 'escapamento_furado' : 'oem',
    transmission: car.category === 'formula_proto' ? 'sequential' : 'manual',
    gearCount,
    finalDrive: 3.73,
    gearRatios: defaultRatios,
    springRateFrontNmm: car.category === 'formula_proto' ? 140 : 65,
    springRateRearNmm: car.category === 'formula_proto' ? 150 : 62,
    damperComp: 6,
    damperRebound: 7,
    rideHeightMm: 0,
    camberFrontDeg: -2.2,
    camberRearDeg: -1.6,
    toeDeg: 0.1,
    frontWingDeg: car.category === 'formula_proto' ? 14 : 5,
    rearWingDeg: car.category === 'formula_proto' ? 18 : 7,
    brakeBiasFront: 0.58,
    fuelLoadLiters: 45,
    paintColor: car.defaultColor,
    secondaryColor: '#111622',
    paintFinish: car.category === 'hyper_concepts' ? 'chameleon' : 'clearcoat_gloss',
    thermoHotColor: '#ffbe0b',
    liveryStripe: car.category === 'muscle' ? 'twin_racing' : 'none',
    racingNumber: isUno ? '01' : '77',
    stickerId: isUno ? 'familia_feliz' : 'none',
    bodykit: 'stock',
    wheelModelIndex: isUno ? 14 : isGol ? 13 : 2,
    wheelSizeInch: car.category === 'rc_revolt' ? 13 : isUno ? 13 : 19,
    wheelOffsetMm: 0,
    wheelColor: isUno ? '#22262e' : '#d8dee9',
    tireBrand: 'Pirelli',
    tireCompound: car.category === 'popular_br' ? 'medium' : 'soft',
    headlightType: car.year < 1995 ? 'halogen_warm' : 'led_matrix',
    underglowColor: '#00f5d4',
    underglowEnabled: car.name.includes('Cyberpunk') || car.name.includes('206'),
    plateRegion: car.country.includes('Brasil') ? 'BR_MERCOSUL' : car.country.includes('Japão') ? 'JP_TOKYO' : 'EU_DE',
    plateText: isUno ? 'UNO2E05' : 'VEL2026',
    subwooferLevel: isGol ? 'paredao_treme_tudo' : 'stock',
    unoRoofLadder: false,
    pineAirFreshener: isUno,
  };
}
