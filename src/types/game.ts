export type CarCategory =
  | 'classics'
  | 'muscle'
  | 'supercars'
  | 'hyper_concepts'
  | 'formula_proto'
  | 'popular_br'
  | 'exotic_easter'
  | 'rc_revolt';

export type CarArchetype =
  | 'classic_1900_open'
  | 'classic_beetle'
  | 'gullwing_coupe'
  | 'classic_roadster'
  | 'muscle_fastback'
  | 'wedge_supercar'
  | 'modern_gt'
  | 'hypercar_aero'
  | 'futuristic_concept'
  | 'f1_openwheel'
  | 'lmp_prototype'
  | 'rally_hatch'
  | 'boxy_hatch_uno'
  | 'sedan_tuner'
  | 'rc_buggy'
  | 'shopping_cart'
  | 'v8_sofa'
  | 'turbo_fridge'
  | 'racing_bed'
  | 'battle_tank'
  | 'jet_bus'
  | 'ice_cream_truck'
  | 'farm_tractor'
  | 'rocket_streamliner';

export type EngineType =
  | 'model_t_i4'
  | 'i4_econobox'
  | 'i4_vtec_turbo'
  | 'flat6_gt3'
  | 'v8_crossplane'
  | 'v10_screamer'
  | 'v12_italian'
  | 'w16_quadturbo'
  | 'ev_quadmotor'
  | 'rc_brushless'
  | 'steam_boiler'
  | 'nuclear_turbine';

export type PaintFinish =
  | 'clearcoat_gloss'
  | 'metallic'
  | 'matte_glitter'
  | 'pearlescent'
  | 'chameleon'
  | 'thermochromic'
  | 'glow_dark';

export type TireBrand = 'Michelin' | 'Pirelli' | 'Bridgestone' | 'Continental' | 'Goodyear';

export type TireCompound =
  | 'ultra_soft'
  | 'soft'
  | 'medium'
  | 'hard'
  | 'wet'
  | 'intermediate'
  | 'off_road'
  | 'drift';

export type TransmissionType = 'manual' | 'sequential' | 'automatic' | 'cvt' | 'dual_clutch';

export type PlateRegion = 'BR_MERCOSUL' | 'JP_TOKYO' | 'EU_DE' | 'US_CA' | 'UK_LDN' | 'GALACTIC';

export interface OriginalHypercarLore {
  manufacturer: string;
  foundedYear: number;
  headquarters: string;
  chiefDesigner: string;
  designPhilosophy: string;
  aerodynamicSecret: string;
  powertrainArchitecture: string;
  historicalBackstory: string;
  codexChapters: { title: string; content: string }[];
}

export interface CarSpec {
  id: string;
  name: string;
  brand: string;
  year: number;
  country: string;
  category: CarCategory;
  archetype: CarArchetype;
  engineType: EngineType;
  displacementL: number;
  horsepower: number;
  torqueNm: number;
  weightKg: number;
  topSpeedKmh: number;
  zeroToHundredSec: number;
  drivetrain: 'RWD' | 'FWD' | 'AWD';
  baseGrip: number;
  aeroCl: number;
  aeroCd: number;
  priceCredits: number;
  defaultColor: string;
  historicalColors: { name: string; hex: string }[];
  specialFeatures?: string[];
  easterEggPuzzleHint?: string;
  secretUnlockCode?: string;
  isOriginalHypercar?: boolean;
  lore?: OriginalHypercarLore;
}

export interface CarTuneSetup {
  engineSwap: EngineType | null;
  induction: 'na' | 'turbo' | 'twin_turbo' | 'supercharger';
  boostPsi: number;
  nitroCapacityKg: number;
  afrMixture: 'lean_blue' | 'stoich' | 'rich_orange';
  exhaustStyle: 'oem' | 'titanium_race' | 'straight_pipe' | 'escapamento_furado';
  transmission: TransmissionType;
  gearCount: number; // 3 to 8
  finalDrive: number;
  gearRatios: number[];
  springRateFrontNmm: number;
  springRateRearNmm: number;
  damperComp: number;
  damperRebound: number;
  rideHeightMm: number; // -60 to +80
  camberFrontDeg: number;
  camberRearDeg: number;
  toeDeg: number;
  frontWingDeg: number;
  rearWingDeg: number;
  brakeBiasFront: number; // 0.45 to 0.75
  fuelLoadLiters: number; // 10 to 100
  paintColor: string;
  secondaryColor: string;
  paintFinish: PaintFinish;
  thermoHotColor: string;
  liveryStripe: 'none' | 'twin_racing' | 'offset_gt' | 'drift_tribal' | 'sponsor_pro' | 'cyber_grid';
  racingNumber: string;
  stickerId: string; // e.g., 'familia_feliz', 'caveira', 'turbo_snail', 'revolt_bolt', 'churrasco_club'
  bodykit: 'stock' | 'widebody_rb' | 'liberty_walk' | 'mansory_carbon' | 'time_attack_aero';
  wheelModelIndex: number; // 0..499
  wheelSizeInch: number; // 13..24
  wheelOffsetMm: number;
  wheelColor: string;
  tireBrand: TireBrand;
  tireCompound: TireCompound;
  headlightType: 'halogen_warm' | 'xenon_ice' | 'led_matrix' | 'yellow_gt';
  underglowColor: string;
  underglowEnabled: boolean;
  plateRegion: PlateRegion;
  plateText: string;
  subwooferLevel: 'stock' | 'street_12in' | 'paredao_treme_tudo';
  unoRoofLadder: boolean;
  pineAirFreshener: boolean;
}

export type TrackCategory =
  | 'real_circuits'
  | 'urban_fictional'
  | 'natural_offroad'
  | 'fantasy'
  | 'rc_revolt'
  | 'pro_engineered';

export type BiomeTheme =
  | 'race_circuit'
  | 'interlagos_br'
  | 'neo_tokyo'
  | 'sao_paulo'
  | 'dubai_sky'
  | 'rio_coast'
  | 'london_fog'
  | 'snow_city'
  | 'havana_vintage'
  | 'amazon_jungle'
  | 'sahara_desert'
  | 'norway_fjord'
  | 'swiss_alps'
  | 'iceland_volcano'
  | 'touge_sakura'
  | 'scottish_sheep'
  | 'grand_canyon'
  | 'cyber_2099'
  | 'underwater_dome'
  | 'space_orbital'
  | 'jurassic_island'
  | 'cloud_kingdom'
  | 'mars_colony'
  | 'wasteland_mad'
  | 'rc_kitchen'
  | 'rc_garden_cat'
  | 'rc_bedroom'
  | 'rc_bathroom'
  | 'rc_supermarket';

export interface TrackSpec {
  id: string;
  name: string;
  country: string;
  category: TrackCategory;
  biome: BiomeTheme;
  lengthKm: number;
  corners: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  surfaceGrip: number;
  gravityG: number; // 1.0 Earth, 0.38 Mars, 0.35 Orbital
  elevationGainM: number;
  roadWidth: number;
  seed: number;
  defaultWeatherId: string;
  defaultHour: number;
  hasSheepHazard?: boolean;
  hasHouseCat?: boolean;
  hasAvalanche?: boolean;
  hasAcidRain?: boolean;
  hasPotholes?: boolean;
  hasChurrascoSmoke?: boolean;
  layoutVariants?: ('GP' | 'National' | 'Sprint')[];
  description: string;
}

export interface WeatherPreset {
  id: string;
  name: string;
  category: 'clear' | 'rain' | 'snow' | 'fog' | 'extreme' | 'atmospheric';
  gripMultiplier: number;
  visibilityFog: number;
  precipitationType: 'none' | 'rain' | 'snow' | 'hail' | 'sand' | 'dust' | 'ash' | 'sakura' | 'acid_rain';
  precipitationIntensity: number; // 0..1
  windSpeedKmh: number;
  windAngleRad: number;
  wetness: number; // 0..1
  ambientTempC: number;
  lightningChance: number;
  rainbowLevel: 0 | 1 | 2;
  auroraActive: boolean;
  skyTopHex: string;
  skyHorizonHex: string;
}

export interface BotDriverProfile {
  id: string;
  name: string;
  callsign: string;
  nationality: string;
  languageCode: 'pt-BR' | 'en-US' | 'ja-JP' | 'it-IT' | 'es-ES' | 'de-DE' | 'fr-FR';
  bio: string;
  aggression: number; // 1-10
  skill: number; // 1-10
  tireManagement: number; // 1-10
  overtakeBravery: number; // 1-10
  pressureComposure: number; // 1-10
  consistency: number; // 1-10
  adaptability: number; // 1-10
  sportsmanship: number; // 1-10
  favoriteCategory: CarCategory;
  signatureColor: string;
  lines: {
    weather: string[];
    hitByPlayer: string[];
    overtake: string[];
    frustration: string[];
    respectPlayer: string[];
    tauntRival: string[];
    allySupport: string[];
  };
}

export type GameMode =
  | 'career'
  | 'quick_race'
  | 'championship'
  | 'time_trial'
  | 'multiplayer'
  | 'photo'
  | 'track_editor'
  | 'revolt_legacy'
  | 'derby'
  | 'drift'
  | 'drag'
  | 'police_chase'
  | 'delivery'
  | 'stunt';

export type CameraView =
  | 'chase_near'
  | 'chase_far'
  | 'hood'
  | 'cockpit'
  | 'bumper'
  | 'helicopter'
  | 'undercar_suspension';

export interface WheelTelemetry {
  tempInnerC: number;
  tempMidC: number;
  tempOuterC: number;
  pressurePsi: number;
  wearPercent: number; // 100 = fresh, 0 = blown
  slipAngleRad: number;
  slipRatio: number;
  suspensionCompressionMm: number;
  punctured: boolean;
}

export interface DamageState {
  panelDeform: {
    frontLeft: number;
    frontRight: number;
    hood: number;
    sideLeft: number;
    sideRight: number;
    rear: number;
  };
  windshieldCracks: { u: number; v: number; severity: number }[];
  radiatorDamage: number; // 0..1
  suspensionDamage: number; // 0..1
  gearboxDamage: number; // 0..1
  oilLeakActive: boolean;
  engineHealth: number; // 0..100
  paintCorrosion: number; // 0..1
}

export interface LiveTelemetryFrame {
  timestampSec: number;
  lap: number;
  lapTimeSec: number;
  bestLapSec: number | null;
  deltaBestSec: number;
  speedKmh: number;
  rpm: number;
  maxRpm: number;
  gear: number; // -1 = R, 0 = N, 1..8
  throttle: number;
  brake: number;
  steering: number;
  clutch: number;
  nitroActive: boolean;
  nitroRemainingPct: number;
  gForceLat: number;
  gForceLong: number;
  boostPsi: number;
  engineTempC: number;
  oilTempC: number;
  brakeTempC: number;
  fuelLiters: number;
  downforceN: number;
  dragN: number;
  slipstreamFactor: number;
  surfaceName: string;
  wheels: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry];
  damage: DamageState;
  position: number;
  totalRacers: number;
  driftScore: number;
  driftCombo: number;
  driftAngleDeg: number;
  stuntScore: number;
  wantedStars: number;
  packageIntegrityPct: number;
  deliveriesCompleted: number;
  activePowerup: RevoltPowerup | null;
  antiTrollWarnings: number;
}

export type RevoltPowerup =
  | 'firework_rocket'
  | 'water_balloon'
  | 'oil_slick'
  | 'turbo_star'
  | 'electro_zap'
  | 'shield_bubble';

export interface RadioMessage {
  id: string;
  senderName: string;
  callsign: string;
  nationality: string;
  relation: 'neutral' | 'rival' | 'ally' | 'race_control' | 'judge' | 'police';
  text: string;
  timestamp: number;
}

export interface CareerChoice {
  id: string;
  label: string;
  consequenceText: string;
  creditsDelta: number;
  reputationDelta: number;
  moralityDelta: number;
}

export interface CareerChapter {
  chapterNumber: number;
  title: string;
  subtitle: string;
  cutsceneDirectorNote: string;
  characterSpeaker: string;
  characterRole: string;
  dialogue: string;
  trackId: string;
  recommendedCategory: CarCategory;
  mode: GameMode;
  laps: number;
  rewardCredits: number;
  choices: CareerChoice[];
}

export interface CustomTrackData {
  name: string;
  biome: BiomeTheme;
  roadWidth: number;
  points: { x: number; y: number; z: number }[];
}

export interface SavedPoster {
  id: string;
  title: string;
  dataUrl: string;
  carName: string;
  trackName: string;
}
