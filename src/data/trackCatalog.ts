import { BiomeTheme, TrackCategory, TrackSpec } from '../types/game';

type TrackSeed = [
  id: string,
  name: string,
  country: string,
  biome: BiomeTheme,
  lengthKm: number,
  corners: number,
  difficulty: 1 | 2 | 3 | 4 | 5,
  grip: number,
  elev: number,
  weather: string,
  hour: number,
  desc: string,
  flags?: Partial<TrackSpec>
];

function makeTrack(cat: TrackCategory, idx: number, s: TrackSeed): TrackSpec {
  const [id, name, country, biome, lengthKm, corners, difficulty, surfaceGrip, elevationGainM, defaultWeatherId, defaultHour, description, flags] = s;
  return {
    id,
    name,
    country,
    category: cat,
    biome,
    lengthKm,
    corners,
    difficulty,
    surfaceGrip,
    gravityG: biome === 'space_orbital' ? 0.35 : biome === 'mars_colony' ? 0.38 : 1.0,
    elevationGainM,
    roadWidth: cat === 'rc_revolt' ? 11 : biome === 'touge_sakura' || biome === 'scottish_sheep' ? 11.5 : 15.5,
    seed: (idx + 1) * 7919 + id.length * 131,
    defaultWeatherId,
    defaultHour,
    description,
    ...flags,
  };
}

// A) 30 REAL CIRCUITS
const REAL_SEEDS: TrackSeed[] = [
  ['interlagos-gp', 'Autódromo José Carlos Pace — Interlagos', 'Brasil', 'interlagos_br', 4.309, 15, 4, 1.04, 43, 'clear-cumulus', 14.5, 'S do Senna, Subida dos Boxes e a galera no morro fazendo churrasco com fumaça visível!', { hasChurrascoSmoke: true }],
  ['nurburgring-nordschleife', 'Nürburgring Nordschleife 20.8km "Inferno Verde"', 'Alemanha', 'race_circuit', 20.832, 154, 5, 1.01, 300, 'clouds-stratus', 16.0, 'Cada zebra, Karussell inclinado e elevação da Eifel recriados.'],
  ['monaco-monte-carlo', 'Circuit de Monaco — Monte Carlo', 'Mônaco', 'rio_coast', 3.337, 19, 5, 0.99, 42, 'clear-zenith', 15.0, 'Guard-rails colados, Hairpin do Grand Hotel, túnel e iates no porto.'],
  ['spa-francorchamps', 'Circuit de Spa-Francorchamps', 'Bélgica', 'race_circuit', 7.004, 19, 5, 1.02, 102, 'rain-sunshower', 14.0, 'Eau Rouge, Raidillon e microclima imprevisível nas Ardenas.'],
  ['silverstone-gp', 'Silverstone Grand Prix Circuit', 'Reino Unido', 'race_circuit', 5.891, 18, 4, 1.03, 18, 'clouds-cumulonimbus', 13.5, 'Maggotts, Becketts e Chapel em altíssima velocidade.'],
  ['monza-temple', 'Autodromo Nazionale Monza — Templo da Velocidade', 'Itália', 'race_circuit', 5.793, 11, 3, 1.04, 14, 'clear-zenith', 15.5, 'Retas infinitas no vácuo, Variante Ascari e Curva Parabolica.'],
  ['suzuka-figure8', 'Suzuka International Racing Course', 'Japão', 'race_circuit', 5.807, 18, 5, 1.04, 40, 'clear-sakura-breeze', 15.0, 'Traçado em 8 único no mundo, Esses técnicos e lendária 130R.'],
  ['laguna-seca', 'WeatherTech Raceway Laguna Seca', 'EUA', 'sahara_desert', 3.602, 11, 4, 1.01, 55, 'clear-zenith', 16.5, 'O lendário Saca-Rolhas (Corkscrew) despencando 18 metros em curva cega.'],
  ['bathurst-panorama', 'Mount Panorama Circuit — Bathurst', 'Austrália', 'grand_canyon', 6.213, 23, 5, 1.0, 174, 'clear-cumulus', 11.0, 'Muros de concreto na montanha e Conrod Straight a 320 km/h.'],
  ['cota-austin', 'Circuit of the Americas (COTA)', 'EUA', 'race_circuit', 5.513, 20, 4, 1.03, 41, 'atmo-golden-magic', 17.5, 'Subida íngreme para a Curva 1 e torre panorâmica texana.'],
  ['daytona-oval-roval', 'Daytona International Speedway 24h', 'EUA', 'race_circuit', 5.729, 12, 3, 1.05, 12, 'atmo-golden-magic', 19.5, 'Super-banking de 31 graus com iluminação noturna de 24 Horas.'],
  ['indianapolis-brickyard', 'Indianapolis Motor Speedway', 'EUA', 'race_circuit', 4.023, 14, 3, 1.04, 6, 'clear-cumulus', 13.0, 'A faixa histórica de tijolos na linha de chegada.'],
  ['lemans-sarthe', 'Circuit des 24 Heures du Mans (La Sarthe)', 'França', 'race_circuit', 13.626, 38, 5, 1.02, 37, 'atmo-golden-magic', 20.5, 'Reta Mulsanne completa ao pôr do sol rumo à madrugada.'],
  ['brands-hatch', 'Brands Hatch GP Circuit', 'Reino Unido', 'race_circuit', 3.916, 9, 4, 1.01, 35, 'fog-morning-mist', 10.0, 'Paddock Hill Bend mergulhando entre bosques ingleses.'],
  ['mugello-tuscany', 'Autodromo Internazionale del Mugello', 'Itália', 'race_circuit', 5.245, 15, 4, 1.04, 41, 'clear-zenith', 16.0, 'Arrabbiata 1 e 2 encravadas nas colinas da Toscana.'],
  ['sepang-malaysia', 'Sepang International Circuit', 'Malásia', 'race_circuit', 5.543, 15, 4, 1.01, 22, 'rain-torrential', 16.0, 'Calor equatorial abafado e tempestades tropicais súbitas.'],
  ['yas-marina', 'Yas Marina Circuit Twilight', 'EAU', 'dubai_sky', 5.281, 16, 3, 1.04, 11, 'atmo-golden-magic', 18.5, 'Hotel iluminado em LED colorido mudando de cor sobre a pista.'],
  ['jeddah-corniche', 'Jeddah Corniche Street Circuit', 'Arábia Saudita', 'dubai_sky', 6.174, 27, 5, 1.03, 8, 'clear-zenith', 21.5, 'O circuito de rua mais veloz do planeta à beira do Mar Vermelho.'],
  ['imola-enzo-dino', 'Autodromo Enzo e Dino Ferrari — Imola', 'Itália', 'race_circuit', 4.909, 19, 4, 1.03, 34, 'clear-cirrus', 14.5, 'Tamburello, Acque Minerali e zebras agressivas clássicas.'],
  ['hungaroring-gp', 'Hungaroring', 'Hungria', 'race_circuit', 4.381, 14, 4, 1.0, 36, 'clear-heatwave', 15.0, 'Mônaco sem muros: sequência ininterrupta de curvas técnicas.'],
  ['zandvoort-dunes', 'Circuit Zandvoort', 'Holanda', 'rio_coast', 4.259, 14, 4, 1.02, 19, 'fog-coastal-salt', 14.0, 'Curvas Tarzan e Luyendyk inclinadas entre dunas do Mar do Norte.'],
  ['hockenheimring', 'Hockenheimring Baden-Württemberg', 'Alemanha', 'race_circuit', 4.574, 17, 3, 1.03, 12, 'clear-cumulus', 15.0, 'Arena Motodrom lotada com milhares de fãs vibrando.'],
  ['red-bull-ring', 'Red Bull Ring — Spielberg', 'Áustria', 'swiss_alps', 4.318, 10, 3, 1.04, 65, 'clear-crisp-autumn', 14.0, 'Frenagens em subida íngreme com os Alpes Estírios ao fundo.'],
  ['catalunya-barcelona', 'Circuit de Barcelona-Catalunya', 'Espanha', 'race_circuit', 4.657, 14, 3, 1.03, 30, 'clear-zenith', 14.5, 'Referência mundial de equilíbrio aerodinâmico de alta velocidade.'],
  ['shanghai-intl', 'Shanghai International Circuit', 'China', 'race_circuit', 5.451, 16, 4, 1.02, 14, 'clouds-stratus', 14.0, 'Curva 1 caracol infinita seguida de reta de 1,2 km.'],
  ['macau-guia-reserve', 'Circuito da Guia — Macau (Reserva Especial #1)', 'Macau', 'neo_tokyo', 6.12, 24, 5, 0.98, 32, 'clear-cirrus', 15.5, 'Curva Lisboa e Melco Hairpin onde só passa um carro por vez!'],
  ['fuji-speedway-reserve', 'Fuji Speedway (Reserva Especial #2)', 'Japão', 'touge_sakura', 4.563, 16, 4, 1.03, 40, 'clear-sakura-breeze', 16.0, 'Reta principal de 1,5 km sob a silhueta majestosa do Monte Fuji.'],
  ['sebring-bumps-reserve', 'Sebring International Raceway (Reserva Especial #3)', 'EUA', 'sao_paulo', 6.019, 17, 4, 0.95, 8, 'atmo-golden-magic', 18.5, 'Placas de concreto ásperas de aeroporto da 2ª Guerra testando a suspensão!'],
  ['tsukuba-timeattack-reserve', 'Tsukuba Circuit TC2000 (Reserva Especial #4)', 'Japão', 'race_circuit', 2.045, 8, 2, 1.05, 6, 'clear-crisp-autumn', 11.0, 'O santuário japonês do Time Attack para carros preparados.'],
  ['kyalami-gp-reserve', 'Kyalami Grand Prix Circuit (Reserva Especial #5)', 'África do Sul', 'race_circuit', 4.522, 16, 4, 1.02, 42, 'atmo-golden-magic', 17.0, 'Altitude elevada no Highveld sul-africano e pôr do sol dourado.'],
];

// B) 40 URBAN FICTIONAL CIRCUITS
const URBAN_HEROES: TrackSeed[] = [
  ['neo-tokyo-midnight', 'Neo Tokyo Midnight — Shibuya & Shuto Loop', 'Japão', 'neo_tokyo', 6.8, 22, 4, 0.94, 28, 'rain-moderate', 23.2, 'Hologramas gigantes, chuva constante refletindo neon no asfalto e hairpins de drift!'],
  ['sao-paulo-underground', 'São Paulo Underground — Paulista, Minhocão & Marginal', 'Brasil', 'sao_paulo', 7.4, 26, 5, 0.91, 68, 'rain-drizzle', 21.5, 'Av. Paulista, Minhocão, túneis, grafites, ambulantes torcendo e BURACOS REAIS no asfalto!', { hasPotholes: true }],
  ['dubai-skyline', 'Dubai Skyline — Skyway & Burj Helipad', 'EAU', 'dubai_sky', 6.9, 18, 4, 1.02, 110, 'extreme-sandstorm-light', 18.0, 'Viadutos suspensos entre arranha-céus, galeria envidraçada e trecho nas dunas.'],
  ['rio-favela-copacabana', 'Rio de Janeiro — Santa Teresa ao Aterro & Copacabana', 'Brasil', 'rio_coast', 6.1, 24, 4, 0.98, 95, 'atmo-carnaval-sun', 17.2, 'Ladeiras históricas descendo rumo à orla com Pão de Açúcar e Cristo ao horizonte.'],
  ['london-fog-chase', 'London Fog Chase — Westminster & Tower Bridge Jump', 'Reino Unido', 'london_fog', 5.5, 17, 4, 0.89, 16, 'fog-london-pea', 7.5, 'Neblina densa londrina e salto pela rampa da Tower Bridge entreaberta!'],
  ['mumbai-monsoon', 'Mumbai Monsoon — Marine Drive & Bazaar', 'Índia', 'sao_paulo', 5.2, 20, 5, 0.72, 18, 'rain-monsoon', 15.0, 'Chuva de monção torrencial, lâminas d’água, aquaplanagem e mercados coloridos.'],
  ['moscow-winter', 'Moscow Winter — Circuito Congelado de Inverno', 'Rússia', 'snow_city', 5.8, 16, 4, 0.62, 15, 'snow-moderate', 20.0, 'Avenidas largas cobertas de neve e curvas longas de drift no gelo.'],
  ['nyc-midnight-marathon', 'New York Midnight Marathon — Times Square & Brooklyn Bridge', 'EUA', 'neo_tokyo', 7.1, 21, 4, 0.99, 24, 'clear-zenith', 0.5, 'Painéis luminosos da Broadway, Central Park e túneis subterrâneos vibrando.'],
  ['havana-vintage', 'Havana Vintage — Malecón 1958', 'Cuba', 'havana_vintage', 4.9, 15, 3, 0.96, 14, 'atmo-golden-magic', 17.8, 'Prédios coloniais em tons pastel, maresia batendo no muro do Malecón e jazz latino.'],
  ['sydney-harbor', 'Sydney Harbor — Opera & Bridge Double-Deck', 'Austrália', 'rio_coast', 5.9, 18, 3, 1.03, 38, 'clear-zenith', 13.0, 'Passagem panorâmica pela baía, Harbour Bridge e orla com surfistas.'],
];

const URBAN_WORLD_CITIES: [string, string, BiomeTheme, string, number][] = [
  ['Cairo — Pirâmides & Corniche do Nilo', 'Egito', 'sahara_desert', 'extreme-sandstorm-light', 17.5],
  ['Bangkok — Tuk-Tuk Neon Chao Phraya', 'Tailândia', 'neo_tokyo', 'rain-thunderstorm', 22.0],
  ['Istambul — Ponte Intercontinental do Bósforo', 'Turquia', 'havana_vintage', 'atmo-golden-magic', 18.2],
  ['Roma — Paralelepípedos Imperiais & Fórum', 'Itália', 'havana_vintage', 'clear-zenith', 16.5],
  ['Paris — Champs-Élysées & Sena Noturno', 'França', 'london_fog', 'rain-light', 21.0],
  ['Berlim — Autobahn Urbana & Portão de Brandemburgo', 'Alemanha', 'sao_paulo', 'clouds-stratus', 23.0],
  ['Cidade do México — Reforma Altitude Sprint', 'México', 'havana_vintage', 'clear-cumulus', 15.0],
  ['Buenos Aires — Puerto Madero & 9 de Julio', 'Argentina', 'sao_paulo', 'clear-crisp-autumn', 18.0],
  ['Santiago — Costanera Cordilheira Run', 'Chile', 'swiss_alps', 'clear-zenith', 17.0],
  ['Lima — Penhascos de Miraflores', 'Peru', 'rio_coast', 'fog-coastal-salt', 16.0],
  ['Bogotá — Subida de Monserrate 2.600m', 'Colômbia', 'sao_paulo', 'rain-drizzle', 14.0],
  ['Seul — Gangnam Cyber Expressway', 'Coreia do Sul', 'neo_tokyo', 'rain-light', 22.5],
  ['Hong Kong — Victoria Peak & Kowloon Neon', 'Hong Kong', 'neo_tokyo', 'rain-moderate', 23.0],
  ['Singapura — Marina Bay Laser Circuit', 'Singapura', 'neo_tokyo', 'clear-zenith', 21.5],
  ['Jacarta — Sudirman Tropical Rush', 'Indonésia', 'sao_paulo', 'rain-heavy', 19.0],
  ['Marrakech — Medina & Muralhas Vermelhas', 'Marrocos', 'sahara_desert', 'clear-heatwave', 16.8],
  ['Lagos — Third Mainland Bridge Sprint', 'Nigéria', 'rio_coast', 'atmo-carnaval-sun', 15.5],
  ['Nairóbi — Savana Skyline Expressway', 'Quênia', 'sahara_desert', 'atmo-golden-magic', 17.3],
  ['Cape Town — Table Mountain Coastal Loop', 'África do Sul', 'rio_coast', 'clear-zenith', 16.0],
  ['Melbourne — Albert Park & Docklands', 'Austrália', 'rio_coast', 'clear-cirrus', 15.0],
  ['Toronto — CN Tower Gardiner Elevated', 'Canadá', 'sao_paulo', 'snow-flurries', 19.5],
  ['Vancouver — Stanley Park Sea-to-Sky', 'Canadá', 'norway_fjord', 'rain-light', 13.0],
  ['San Francisco — Ladeiras Saltitantes & Golden Gate', 'EUA', 'london_fog', 'fog-coastal-salt', 9.5],
  ['Las Vegas — Strip Neon 380 km/h', 'EUA', 'neo_tokyo', 'clear-zenith', 23.5],
  ['Miami — Ocean Drive Art Deco Sunset', 'EUA', 'rio_coast', 'atmo-golden-magic', 18.8],
  ['Chicago — Lower Wacker Tunnel Chase', 'EUA', 'sao_paulo', 'snow-flurries', 20.5],
  ['Amsterdã — Pontes dos Canais Estreitos', 'Holanda', 'london_fog', 'rain-sunshower', 14.5],
  ['Praga — Ponte Carlos & Castelo Gótico', 'Rep. Tcheca', 'london_fog', 'fog-morning-mist', 7.0],
  ['Viena — Ringstraße Sinfônica', 'Áustria', 'havana_vintage', 'clear-crisp-autumn', 16.0],
  ['Barcelona — Montjuïc Clássico Costeiro', 'Espanha', 'rio_coast', 'clear-zenith', 17.0],
];

URBAN_WORLD_CITIES.forEach((c, idx) => {
  URBAN_HEROES.push([
    `urban-${idx + 11}-${c[0].slice(0, 8).toLowerCase().replace(/[^a-z]/g, '')}`,
    c[0],
    c[1],
    c[2],
    4.6 + (idx % 5) * 0.55,
    14 + (idx % 10),
    ((idx % 3) + 3) as 3 | 4 | 5,
    0.97,
    22 + (idx % 6) * 12,
    c[3],
    c[4],
    `Circuito urbano completo em ${c[1]} com arquitetura regional fiel, pedestres reativos e tráfego contido.`,
  ]);
});

// C) 40 NATURAL / OFF-ROAD TRACKS
const NATURAL_HEROES: TrackSeed[] = [
  ['amazon-rainforest', 'Amazon Rainforest Trail — Travessia da Selva', 'Brasil', 'amazon_jungle', 7.2, 28, 5, 0.76, 48, 'fog-jungle-steam', 11.5, 'Trilha de lama densa, travessia de rios rasos, pontes de madeira e araras voando!'],
  ['sahara-desert-storm', 'Sahara Desert Storm — Dunas Erg Chebbi', 'Argélia/Marrocos', 'sahara_desert', 8.4, 19, 4, 0.72, 130, 'extreme-haboob-zero', 14.0, 'Dunas colossais, tempestade de areia Haboob cegante e oásis escondido.'],
  ['norwegian-fjords', 'Norwegian Fjords — Penhascos de Geiranger', 'Noruega', 'norway_fjord', 6.7, 24, 4, 0.88, 210, 'aurora-polar-night', 22.5, 'Estradas cravadas na rocha sobre fiordes profundos sob a Aurora Boreal!'],
  ['swiss-alps-avalanche', 'Swiss Alps Avalanche Run — Passo Furka', 'Suíça', 'swiss_alps', 6.5, 27, 5, 0.68, 285, 'snow-blizzard', 13.5, 'Risco ativo de AVALANCHE descendo a encosta na sua frente!', { hasAvalanche: true }],
  ['iceland-volcanic', 'Icelandic Volcanic Circuit — Fagradalsfjall', 'Islândia', 'iceland_volcano', 6.0, 21, 5, 0.81, 145, 'extreme-volcanic-ash', 20.0, 'Rios de lava incandescente, gêiseres em erupção e cinza vulcânica!'],
  ['australian-outback', 'Australian Outback — Red Center Sprint', 'Austrália', 'sahara_desert', 9.1, 14, 3, 0.79, 35, 'extreme-dust-outback', 15.5, 'Terra vermelha infinita, calor ondulante e poeira persistente.'],
  ['patagonia-wind-run', 'Patagonia Wind Run — Rajada Lateral 150 km/h', 'Argentina/Chile', 'norway_fjord', 7.8, 16, 4, 0.91, 90, 'extreme-patagonia-gale', 16.0, 'Vento cruzado brutal de 150 km/h empurrando o carro nas retas junto às geleiras!'],
  ['japanese-touge-akina', 'Japanese Mountain Touge — Monte Haruna / Sakura', 'Japão', 'touge_sakura', 5.6, 34, 5, 0.98, 320, 'clear-sakura-breeze', 23.5, 'Cinco hairpins consecutivas com sarjeta interna, cerejeiras e Eurobeat no talo!'],
  ['scottish-highlands-sheep', 'Scottish Highlands — Estrada das Ovelhas Sagradas', 'Escócia', 'scottish_sheep', 5.4, 22, 5, 0.9, 115, 'fog-morning-mist', 9.0, 'DESVIE DAS OVELHAS NA PISTA! Se encostar em uma ovelha, desclassificação imediata por respeito animal!', { hasSheepHazard: true }],
  ['grand-canyon-sprint', 'Grand Canyon Rim Sprint — Abismo do Colorado', 'EUA', 'grand_canyon', 7.5, 20, 5, 0.85, 190, 'atmo-golden-magic', 17.8, 'Sem guard-rail à beira de um precipício vermelho vertical.'],
];

const NATURAL_WONDERS: [string, string, BiomeTheme, string][] = [
  ['Floresta Negra (Schwarzwald Hochstraße)', 'Alemanha', 'amazon_jungle', 'fog-morning-mist'],
  ['Colinas de Ciprestes da Toscana', 'Itália', 'race_circuit', 'clear-zenith'],
  ['Rota 66 — Monument Valley Stretch', 'EUA', 'grand_canyon', 'clear-heatwave'],
  ['Costa Amalfitana — Penhascos do Tirreno', 'Itália', 'rio_coast', 'clear-zenith'],
  ['Great Ocean Road — Twelve Apostles', 'Austrália', 'rio_coast', 'fog-coastal-salt'],
  ['Ruta 40 — Quebrada de Humahuaca', 'Argentina', 'grand_canyon', 'clear-cumulus'],
  ['Karakoram Highway — Teto do Mundo 4.700m', 'Paquistão', 'swiss_alps', 'snow-flurries'],
  ['Estrada da Morte — Yungas Precipício', 'Bolívia', 'amazon_jungle', 'rain-heavy'],
  ['Trollstigen — Escada dos Trolls', 'Noruega', 'norway_fjord', 'rain-freezing-fjord'],
  ['Lago Baikal Congelado — Corrida Sobre o Gelo', 'Rússia', 'swiss_alps', 'snow-baikal-freeze'],
  ['Wadi Rum — Vale da Lua Vermelho', 'Jordânia', 'mars_colony', 'atmo-golden-magic'],
  ['Skeleton Coast — Dunas Encontrando o Atlântico', 'Namíbia', 'sahara_desert', 'fog-coastal-salt'],
  ['Ilha de Páscoa — Rapa Nui Moai Volcano', 'Chile', 'iceland_volcano', 'rain-sunshower'],
  ['Islândia Ring Road — Cachoeira Skógafoss', 'Islândia', 'norway_fjord', 'rain-double-rainbow'],
  ['Transilvânia — Transfăgărășan & Castelo Bran', 'Romênia', 'norway_fjord', 'fog-transylvania'],
  ['Passo dello Stelvio — As 48 Curvas Alpinas', 'Itália', 'swiss_alps', 'clear-crisp-autumn'],
  ['Himalaias — Passo Khardung La', 'Índia/Nepal', 'swiss_alps', 'snow-blizzard'],
  ['Serra do Rio do Rastro — 284 Curvas Iluminadas', 'Brasil', 'touge_sakura', 'fog-total-whiteout'],
  ['Chapada Diamantina — Vale do Pati Off-Road', 'Brasil', 'grand_canyon', 'rain-sunshower'],
  ['Lençóis Maranhenses — Lagoas Cristais & Dunas', 'Brasil', 'sahara_desert', 'clear-zenith'],
  ['Salar de Uyuni — Espelho Infinito de Água', 'Bolívia', 'cloud_kingdom', 'rain-double-rainbow'],
  ['Pikes Peak Hill Climb — Rumo às Nuvens', 'EUA', 'swiss_alps', 'clear-cirrus'],
  ['Tail of the Dragon — 318 Curvas em 18 km', 'EUA', 'amazon_jungle', 'clear-crisp-autumn'],
  ['Milford Sound — Fiordes da Ilha Sul', 'Nova Zelândia', 'norway_fjord', 'rain-moderate'],
  ['Monte Etna — Subida Siciliana de Basalto', 'Itália', 'iceland_volcano', 'extreme-volcanic-ash'],
  ['Cânion do Itaimbezinho — Aparados da Serra', 'Brasil', 'amazon_jungle', 'fog-morning-mist'],
  ['Rali dos Sertões — Jalapão Dourado', 'Brasil', 'sahara_desert', 'extreme-dust-outback'],
  ['Finlândia — 1000 Lagos Saltos de Cascalho', 'Finlândia', 'norway_fjord', 'clear-cumulus'],
  ['Córsega — 10.000 Curvas de Asfalto Abrasivo', 'França', 'rio_coast', 'clear-zenith'],
  ['Monte Quênia — Trilha Equatorial de Terra', 'Quênia', 'amazon_jungle', 'rain-sunshower'],
];

NATURAL_WONDERS.forEach((w, idx) => {
  NATURAL_HEROES.push([
    `nat-${idx + 11}-${w[0].slice(0, 8).toLowerCase().replace(/[^a-z]/g, '')}`,
    w[0],
    w[1],
    w[2],
    6.2 + (idx % 6) * 0.7,
    18 + (idx % 16),
    ((idx % 3) + 3) as 3 | 4 | 5,
    0.84,
    80 + (idx % 7) * 40,
    w[3],
    15.0,
    `Traçado natural lendário em ${w[1]} com flora endêmica, vento físico e terreno dinâmico.`,
  ]);
});

// D) 40 FANTASY / SCI-FI TRACKS
const FANTASY_HEROES: TrackSeed[] = [
  ['cyber-city-2099', 'Cyber City 2099 — Setor Chuva Ácida', 'Ano 2099', 'cyber_2099', 7.0, 20, 4, 0.92, 85, 'rain-acid-cyber', 23.8, 'Tráfego aéreo passando sobre a pista, mega-hologramas e chuva ácida que corrói o verniz!', { hasAcidRain: true }],
  ['volcano-island-core', 'Volcano Island — Caldeira Mutante de Magma', 'Oceano Ignis', 'iceland_volcano', 5.8, 18, 5, 0.89, 140, 'extreme-volcanic-ash', 21.0, 'Pontes basálticas cercadas por quedas de lava incandescente.'],
  ['underwater-tunnel', 'Underwater Abyssal Complex — Domo Mariana', 'Fossa Abissal', 'underwater_dome', 6.4, 16, 3, 1.04, 50, 'clear-zenith', 12.0, 'Túnel acrílico pressurizado no fundo do oceano com baleias e tubarões nadando acima!'],
  ['orbital-space-station', 'Orbital Space Station — Anel Lagrange (0.35g)', 'Órbita Baixa', 'space_orbital', 8.0, 14, 4, 1.0, 60, 'atmo-orbital-vacuum', 0.0, 'Gravidade reduzida de 0.35g com a Terra azul girando abaixo da pista!'],
  ['jurassic-valley', 'Jurassic Track — Vale do T-Rex', 'Ilha Cretácea', 'jurassic_island', 6.6, 19, 5, 0.83, 75, 'fog-jungle-steam', 16.5, 'Dinossauros colossais ao redor do traçado — não diminua o ritmo!'],
  ['cloud-kingdom', 'Cloud Kingdom — Estrada Cumulus 10.000m', 'Estratosfera', 'cloud_kingdom', 6.2, 15, 5, 0.96, 110, 'rain-double-rainbow', 10.5, 'Pista de nuvens condensadas e pontes de arco-íris sem guard-rail a 10 km de altitude!'],
  ['haunted-mansion', 'Haunted Mansion Circuit — Solar Espectral', 'Além-Véu', 'london_fog', 4.8, 23, 4, 0.88, 35, 'fog-transylvania', 0.0, 'Salões góticos gigantescos, candelabros flutuantes e trovoadas roxas.'],
  ['atlantis-gp', 'Atlantis Grand Prix — Colunas Bioluminescentes', 'Atlântida', 'underwater_dome', 6.1, 17, 4, 1.01, 45, 'aurora-polar-night', 22.0, 'Ruínas marmóreas submersas em domos de ar e corais luminosos.'],
  ['mars-colony-raceway', 'Mars Colony Raceway — Cratera Jezero (0.38g)', 'Marte', 'mars_colony', 7.7, 16, 4, 0.84, 95, 'extreme-mars-dust', 14.0, 'Gravidade marciana (0.38g): saltos três vezes mais longos e domos geodésicos humanos!'],
  ['wasteland-fury', 'Post-Apocalyptic Wasteland — Estrada da Fúria', 'Deserto Nuclear', 'wasteland_mad', 8.2, 15, 5, 0.79, 60, 'extreme-rad-storm', 17.5, 'Carcaças enferrujadas, torres de fogo e tempestades elétricas alaranjadas!'],
];

const FANTASY_THEMES: [string, BiomeTheme, string][] = [
  ['Reino Medieval — Muralhas do Dragão Vermelho', 'iceland_volcano', 'atmo-golden-magic'],
  ['Candy Kingdom — Autódromo de Chocolate & Caramelo', 'cloud_kingdom', 'atmo-carnaval-sun'],
  ['Motherboard GP — Dentro da Placa-Mãe RTX 9090', 'cyber_2099', 'atmo-orbital-vacuum'],
  ['Mundo Invertido — Gravidade Espelhada', 'cyber_2099', 'fog-transylvania'],
  ['Dimensão dos Espelhos de Cristal', 'cloud_kingdom', 'snow-baikal-freeze'],
  ['Arquipélago Anfíbio — Pontes Flutuantes', 'rio_coast', 'rain-sunshower'],
  ['Enseada dos Piratas — Galeões & Canhões', 'havana_vintage', 'rain-thunderstorm'],
  ['Egito Antigo — Rampas da Grande Pirâmide', 'sahara_desert', 'clear-heatwave'],
  ['Roma Antiga — Circus Maximus & Coliseu', 'sahara_desert', 'clear-zenith'],
  ['Metrópole Steampunk — Engrenagens de Latão', 'london_fog', 'fog-london-pea'],
  ['Cidade Noir 1947 — Chuva em Preto & Branco', 'london_fog', 'atmo-noir-bw'],
  ['Equalizer Highway — Mundo Musical Pulsante', 'cyber_2099', 'aurora-polar-night'],
  ['Forja dos Anões — Minas de Mithril', 'iceland_volcano', 'extreme-volcanic-ash'],
  ['Jardins Suspensos da Babilônia', 'amazon_jungle', 'atmo-golden-magic'],
  ['Estação Lunar Tycho (Baixa Gravidade)', 'space_orbital', 'atmo-orbital-vacuum'],
  ['Lua Europa de Júpiter — Cânions de Gelo Azul', 'swiss_alps', 'snow-baikal-freeze'],
  ['Asgard Bifrost — Ponte Cósmica', 'cloud_kingdom', 'aurora-polar-night'],
  [' Biblioteca Infinita de Babel', 'london_fog', 'clear-cirrus'],
  ['Relógio Cósmico Suíço Gigante', 'cyber_2099', 'atmo-golden-magic'],
  ['Vale Synthwave 1984 — Sol Gradeado Neon', 'neo_tokyo', 'atmo-golden-magic'],
  [' Labirinto de Minotauro em Creta', 'sahara_desert', 'clear-zenith'],
  ['Fábrica de Brinquedos de Natal Ártica', 'snow_city', 'christmas-snow'],
  ['Cânion de Ametista Gigante', 'mars_colony', 'aurora-polar-night'],
  ['Trem Expresso Transcontinental em Movimento', 'snow_city', 'snow-blizzard'],
  ['Porta-Aviões Nuclear Gigante no Pacífico', 'rio_coast', 'extreme-hurricane'],
  [' Plataforma de Petróleo em Tempestade', 'london_fog', 'rain-torrential'],
  ['Templo Maia Dourado de El Dorado', 'amazon_jungle', 'fog-jungle-steam'],
  ['Cidade Flutuante Zepelim', 'cloud_kingdom', 'clear-cumulus'],
  [' acelerador de Partículas Subterrâneo CERN', 'cyber_2099', 'atmo-orbital-vacuum'],
  ['Dimensão Voxel 16-Bit Neon', 'neo_tokyo', 'clear-zenith'],
];

FANTASY_THEMES.forEach((ft, idx) => {
  FANTASY_HEROES.push([
    `fan-${idx + 11}`,
    ft[0],
    'Universo Velocity',
    ft[1],
    5.8 + (idx % 5) * 0.6,
    15 + (idx % 10),
    ((idx % 3) + 3) as 3 | 4 | 5,
    0.95,
    70 + (idx % 5) * 25,
    ft[2],
    idx % 2 === 0 ? 22.0 : 16.0,
    `Cenário fantástico exclusivo com física ambiental dedicada e iluminação cinematográfica.`,
  ]);
});

// E) 30 RC RE-VOLT MACRO-SCALE TRACKS
const RC_HEROES: TrackSeed[] = [
  ['rc-kitchen-revolt', 'RC 01: A Cozinha Gigante (Poças de Suco & Migalhas)', 'Casa Macro 1:10', 'rc_kitchen', 1.85, 16, 3, 1.02, 8, 'clear-zenith', 10.5, 'Piso quadriculado brilhante, poças de suco de laranja, migalhas de biscoito gigantes, formigas e geladeira monumental!'],
  ['rc-garden-cat', 'RC 02: O Jardim & O GATO GIGANTE 4K', 'Quintal Macro 1:10', 'rc_garden_cat', 2.1, 18, 4, 0.86, 14, 'clear-cumulus', 15.0, 'Grama alta como floresta, mangueira de jardim, gnomo colossal e O GATO DA CASA espreitando seu carrinho!', { hasHouseCat: true }],
  ['rc-kids-bedroom', 'RC 03: O Quarto de Criança (Blocos Lego & Debaixo da Cama)', 'Casa Macro 1:10', 'rc_bedroom', 1.75, 15, 3, 1.0, 12, 'clear-zenith', 16.0, 'Blocos coloridos de montar como muros, livros como rampas e túnel escuro debaixo da cama!'],
  ['rc-office-desk', 'RC 04: O Escritório (Teclado Mecânico & Clips)', 'Mesa Macro 1:10', 'rc_bedroom', 1.6, 14, 3, 1.04, 9, 'clear-zenith', 20.0, 'Corra por cima de cadernos, réguas como pontes, canetas como postes e monitores acesos!'],
  ['rc-bathroom-soap', 'RC 05: O Banheiro (Rampa de Sabonete & Fita de Papel Higiênico!)', 'Casa Macro 1:10', 'rc_bathroom', 1.55, 14, 4, 0.78, 10, 'fog-jungle-steam', 9.0, 'Azulejos escorregadios, sabonete rosa como rampa de salto e chegada de papel higiênico!'],
  ['rc-supermarket', 'RC 06: Supermercado Toys & Latas (Homenagem Market 2)', 'Mercado Macro 1:10', 'rc_supermarket', 2.25, 17, 3, 1.03, 6, 'clear-zenith', 21.0, 'Corredores gigantes, latas empilhadas, freezer gelado e leitor de código de barras!'],
  ['rc-real-garage', 'RC 07: A Garagem Mecânica (Catedral Sob um Carro Real)', 'Oficina Macro 1:10', 'rc_kitchen', 1.9, 15, 4, 0.92, 7, 'atmo-golden-magic', 17.5, 'Chaves inglesas gigantes, manchas de óleo oceânicas e um supercarro escala 1:1 estacionado acima!'],
];

const RC_MORE = [
  'RC 08: Vizinhança Suburbana (Toys in the Hood Tribute)',
  'RC 09: Museu de História Natural (Entre Esqueletos de T-Rex!)',
  'RC 10: Navio Cruzeiro Toys Titanic Deck',
  'RC 11: Cidade Velho Oeste em Miniatura (Ghost Town)',
  'RC 12: Loja de Brinquedos Noturna (Toy World 1)',
  'RC 13: Loja de Brinquedos Espacial (Toy World 2)',
  'RC 14: Sótão Empoeirado de Madeira',
  'RC 15: Porão Misterioso da Caldeira',
  'RC 16: Calhas e Telhado de Cerâmica',
  'RC 17: Parquinho Infantil (Escorregador & Caixa de Areia)',
  'RC 18: Pet Shop (Aquários Gigantes & Ossos de Borracha)',
  'RC 19: Sala de Aula (Carteiras & Giz)',
  'RC 20: Laboratório Químico (Béqueres Borbulhantes)',
  'RC 21: Biblioteca Silenciosa (Labirinto de Enciclopédias)',
  'RC 22: Padaria Artesanal (Vapor Quente de Pão Francês!)',
  'RC 23: Pista de Boliche Neon (Desvie dos Pinos!)',
  'RC 24: Mesa de Sinuca Feltro Verde',
  'RC 25: Fliperama Arcade Anos 90',
  'RC 26: Estufa Botânica de Orquídeas',
  'RC 27: Pista de Skate Half-Pipe Macro',
  'RC 28: Castelo de Areia na Praia',
  'RC 29: Estacionamento de Shopping Subsolo',
  'RC 30: Maquete Ferroviária HO em Movimento',
];

RC_MORE.forEach((title, idx) => {
  const biomes: BiomeTheme[] = ['rc_kitchen', 'rc_garden_cat', 'rc_bedroom', 'rc_bathroom', 'rc_supermarket'];
  RC_HEROES.push([
    `rc-macro-${idx + 8}`,
    title,
    'Mundo RC 1:10',
    biomes[idx % biomes.length],
    1.65 + (idx % 5) * 0.2,
    13 + (idx % 7),
    ((idx % 3) + 2) as 2 | 3 | 4,
    0.98,
    8,
    'clear-zenith',
    14.0,
    'Cenário em escala macro 1:10 inspirado diretamente no clássico Re-Volt com objetos cotidianos colossais!',
    idx === 10 ? { hasHouseCat: true } : undefined,
  ]);
});

// F) 25 PRO ENGINEERED FICTIONAL CIRCUITS (Each with 3 Layouts: GP, National, Sprint!)
const PRO_ENG_NAMES = [
  ['Autódromo Internacional do Vale do Aço (Ipatinga GP)', 'Brasil'],
  ['Velocity Proving Grounds — Anel de Alta Velocidade', 'Alemanha'],
  ['Circuito Atlântico da Serra Verde', 'Portugal'],
  ['Kyoto Imperial Motorsport Park', 'Japão'],
  ['Nordic Midnight Sun Arena', 'Finlândia'],
  ['Apex Oasis Motorplex', 'Catar'],
  ['Silver Peak Elevation Circuit', 'Colorado, EUA'],
  ['Autodromo del Tirreno Sud', 'Itália'],
  ['Tasman Sea Windward Raceway', 'Nova Zelândia'],
  ['Andes Altitude International Circuit', 'Chile'],
  ['Bavaria Precision Test Track', 'Alemanha'],
  ['Celtic Coast Grand Prix Park', 'Irlanda'],
  ['Emerald Peninsula Raceway', 'Coreia do Sul'],
  ['Crown Jewel Endurance Ring', 'Reino Unido'],
  ['Solstice Twin-Bridge Circuit', 'Suécia'],
  ['Pampas Velocidad Autódromo', 'Argentina'],
  ['Red Rock Canyon Motor Speedway', 'Nevada, EUA'],
  ['Aegean Blue Horizon GP', 'Grécia'],
  ['Carpathian Crown International', 'Polônia'],
  ['Southern Cross Endurance Arena', 'Austrália'],
  [' Guanabara Bay International Autodrome', 'Brasil'],
  ['Hokkaido Snow & Tarmac Proving Ring', 'Japão'],
  ['Normandy Coastal Endurance Park', 'França'],
  ['Sonora High-Speed Bowl', 'México'],
  ['Velocity Final Boss Colosseum GP', 'Ilha Velocity'],
];

const PRO_SEEDS: TrackSeed[] = PRO_ENG_NAMES.map(([nm, country], idx) => [
  `pro-fictional-${idx + 1}`,
  nm.trim(),
  country,
  idx === 0 ? 'interlagos_br' : 'race_circuit',
  4.8 + (idx % 5) * 0.65,
  15 + (idx % 8),
  ((idx % 3) + 3) as 3 | 4 | 5,
  1.05,
  35 + (idx % 6) * 18,
  'clear-cumulus',
  15.0,
  `Circuito FIA Grau 1 projetado sob consultoria de engenharia de pistas com 3 layouts (GP, Nacional e Sprint), áreas de escape em brita/asfalto e pit lane animado.`,
  { layoutVariants: ['GP', 'National', 'Sprint'], hasChurrascoSmoke: idx === 0 },
]);

export const TRACK_CATALOG: TrackSpec[] = [
  ...REAL_SEEDS.map((s, i) => makeTrack('real_circuits', i, s)),
  ...URBAN_HEROES.map((s, i) => makeTrack('urban_fictional', i, s)),
  ...NATURAL_HEROES.map((s, i) => makeTrack('natural_offroad', i, s)),
  ...FANTASY_HEROES.map((s, i) => makeTrack('fantasy', i, s)),
  ...RC_HEROES.map((s, i) => makeTrack('rc_revolt', i, s)),
  ...PRO_SEEDS.map((s, i) => makeTrack('pro_engineered', i, s)),
];

export const TRACK_CATEGORY_LABELS: Record<TrackCategory, string> = {
  real_circuits: 'Circuitos Reais (30)',
  urban_fictional: 'Urbanos Globais (40)',
  natural_offroad: 'Naturais & Off-Road (40)',
  fantasy: 'Fantasiosos & Sci-Fi (40)',
  rc_revolt: 'Escala RC Re-Volt (30)',
  pro_engineered: 'Circuitos FIA Originais (25)',
};
