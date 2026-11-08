import { BotDriverProfile, CarCategory } from '../types/game';

interface NationTemplate {
  country: string;
  lang: BotDriverProfile['languageCode'];
  firstNames: string[];
  lastNames: string[];
  callsigns: string[];
  lines: BotDriverProfile['lines'];
}

const NATION_TEMPLATES: NationTemplate[] = [
  {
    country: 'Brasil',
    lang: 'pt-BR',
    firstNames: ['Rafael', 'Lucas', 'Beatriz', 'Caio', 'Mariana', 'Bruno', 'Camila', 'Rodrigo', 'Larissa', 'Gustavo'],
    lastNames: ['Mendes', 'Almeida', 'Fontes', 'Azevedo', 'Nogueira', 'Silveira', 'Barros', 'Monteiro', 'Tavares', 'Siqueira'],
    callsigns: ['TROVÃO-BR', 'INTERLAGOS', 'CURVA-1', 'VALE-AÇO', ' SAMBA-APEX'],
    lines: {
      weather: [
        'Essa chuva tá virando piscina olímpica! Segura no braço!',
        'Pista escorregadia demais, hoje separa piloto de passageiro!',
      ],
      hitByPlayer: [
        'EI! CUIDADO AÍ, MALUCO! Meu retrovisor não é para-choque!',
        'Tá achando que é carrinho de bate-bate?! Olha a freada!',
      ],
      overtake: [
        'PASSOU POR FORA! CHUPA ESSA MANGA!',
        'Tchau querido, nos vemos no pódio!',
      ],
      frustration: [
        'NÃO É POSSÍVEL, MEU PNEU FRITOU DE NOVO?!',
        'Perdi o ponto de tangência, que vacilo!',
      ],
      respectPlayer: [
        'Esse piloto manda muito bem no traçado limpo!',
        'Boa disputa roda a roda, respeito máximo!',
      ],
      tauntRival: [
        'Olha quem apareceu no meu retrovisor... tenta não bater em mim dessa vez!',
        'Hoje você não passa nem com escada no teto!',
      ],
      allySupport: [
        'Pode ir por dentro, parceiro! Tô segurando o pelotão atrás!',
        'Vácuo liberado pra você na reta, crava o pé!',
      ],
    },
  },
  {
    country: 'Japão',
    lang: 'ja-JP',
    firstNames: ['Kenji', 'Haruka', 'Takumi', 'Ren', 'Aoi', 'Daiki', 'Sora', 'Yuki', 'Kaito', 'Mei'],
    lastNames: ['Takahashi', 'Sato', 'Nakamura', 'Kobayashi', 'Watanabe', 'Ito', 'Yamamoto', 'Saito', 'Kuroda', 'Fujimoto'],
    callsigns: ['AKINA-86', 'MIDNIGHT-Z', 'WANGAN', 'RAIJU', 'SAKURA-GT'],
    lines: {
      weather: [
        'Ame ga hidoi... [Essa chuva está pesada, vou ajustar o ponto de frenagem!]',
        'Kiri ga fukai na... [Neblina densa, guiando pelo som do motor!]',
      ],
      hitByPlayer: [
        'Abunai daro!! [Ei, isso foi perigoso demais! Mantenha sua linha!]',
        'Nani suru nda! [O que pensa que está fazendo na minha lateral?!]',
      ],
      overtake: [
        'Kansei Dorifuto!! [Ultrapassagem limpa pela sarjeta interna!]',
        'Osaki ni! [Ficou pra trás na saída de curva!]',
      ],
      frustration: [
        'Shimatta! Taiya ga...! [Droga, meus pneus passaram do limite térmico!]',
        'Masaka... [Não acredito que espalhei nessa hairpin!]',
      ],
      respectPlayer: [
        'Hayai... honmono da! [Rápido demais... esse piloto é legítimo!]',
        'Subarashii rain-dori! [Traçado impecável!]',
      ],
      tauntRival: [
        'Mata omae ka... kondo koso makeru na! [Você de novo... hoje não terá chance!]',
        'Backmirror no ten ni shite yaru! [Vou te transformar num ponto no retrovisor!]',
      ],
      allySupport: [
        'Ike! Usiro wa makasero! [Vai na frente! Eu cubro a retaguarda!]',
        'Slipstream wo tsukae! [Use meu vácuo agora!]',
      ],
    },
  },
  {
    country: 'Itália',
    lang: 'it-IT',
    firstNames: ['Lorenzo', 'Giulia', 'Matteo', 'Chiara', 'Alessandro', 'Sofia', 'Marco', 'Elena', 'Luca', 'Valentina'],
    lastNames: ['Rossi', 'Bellini', 'Marchetti', 'Conti', 'Moretti', 'Rizzo', 'Lombardi', 'Ferrari-Corsi', 'Galli', 'De Luca'],
    callsigns: ['MODENA-V12', 'MONZA-RED', 'TRICOLORE', 'IMOLA', 'SCUDERIA'],
    lines: {
      weather: [
        'Mamma mia, che diluvio! [Que dilúvio! Pista sem aderência nenhuma!]',
        'Asfalto freddo oggi, scaldate le gomme! [Asfalto gelado, aqueçam os pneus!]',
      ],
      hitByPlayer: [
        'Ma sei pazzo?! Guarda dove vai! [Ficou louco?! Olha por onde anda!]',
        'La mia vernice nuova! [Minha pintura nova, seu animal!]',
      ],
      overtake: [
        'Ciao bello! Ci vediamo al traguardo! [Tchau querido, nos vemos na bandeirada!]',
        'Sorpasso capolavoro! [Ultrapassagem obra-prima!]',
      ],
      frustration: [
        'Incredibile, il cambio strattona! [Inacreditável, o câmbio está falhando!]',
        'Ho perso il posteriore! [Perdi a traseira na zebra!]',
      ],
      respectPlayer: [
        'Che pilota fantastico! [Que piloto fantástico, duelo limpo!]',
        'Stile puro in staccata! [Estilo puro na freada!]',
      ],
      tauntRival: [
        'Eccoti di nuovo... stavolta ti chiudo la porta! [Você outra vez... hoje fecho a porta!]',
        'Mangia la mia polvere! [Coma minha poeira!]',
      ],
      allySupport: [
        'Passa pure amico, ti copro io! [Pode passar amigo, eu te protejo!]',
        'Prendi la mia scia sul rettilineo! [Pega meu vácuo no retão!]',
      ],
    },
  },
  {
    country: 'Alemanha',
    lang: 'de-DE',
    firstNames: ['Lukas', 'Hannah', 'Maximilian', 'Lena', 'Felix', 'Klara', 'Jonas', 'Frida', 'Sebastian', 'Greta'],
    lastNames: ['Weber', 'Schneider', 'Becker', 'Hoffmann', 'Richter', 'Vogel', 'Wagner', 'Krämer', 'Brandt', 'Berger'],
    callsigns: ['EIFEL-MEISTER', 'AUTOBAHN', 'APEX-NULL', 'KARUSSELL', 'SILBER'],
    lines: {
      weather: ['Aquaplaning-Gefahr in Sektor 2! [Risco de aquaplanagem no setor 2!]'],
      hitByPlayer: ['Wahnsinniger! Lass mir Platz! [Louco! Deixe espaço na curva!]'],
      overtake: ['Präzise wie ein Uhrwerk vorbei! [Passando com precisão cirúrgica!]'],
      frustration: ['Reifentemperatur kritisch! [Temperatura crítica nos pneus!]'],
      respectPlayer: ['Sauberes Manöver, Respekt! [Manobra limpa, respeito!]'],
      tauntRival: ['Diesmal kommst du nicht vorbei! [Dessa vez você não passa!]'],
      allySupport: ['Fahr vorbei, ich halte sie auf! [Passe, eu seguro eles!]'],
    },
  },
  {
    country: 'EUA / UK',
    lang: 'en-US',
    firstNames: ['Cole', 'Chloe', 'Logan', 'Maya', 'Tanner', 'Zoe', 'Lewis', 'Nigel', 'Evelyn', 'Jaxon'],
    lastNames: ['Vance', 'Sterling', 'Callahan', 'Hawkins', 'Crawford', 'Mercer', 'Hamilton-Cross', 'buttonwood', 'Brooks', 'Wheeler'],
    callsigns: ['THUNDERBOLT', 'SLINGSHOT', 'REDLINE', 'APEX-HOUND', 'NITRO-KID'],
    lines: {
      weather: ['Grip is dropping fast out here, watch the puddles!'],
      hitByPlayer: ['HEY! Rubbing is racing, not wrecking my quarter panel!'],
      overtake: ['Slingshot engaged — see ya in the mirror!'],
      frustration: ['No way, front tires are completely grained!'],
      respectPlayer: ['Wheel-to-wheel perfection! That driver can wheel it!'],
      tauntRival: ['Look who showed up... try hitting the brakes instead of me this time!'],
      allySupport: ['Door is wide open buddy, take the inside line!'],
    },
  },
  {
    country: 'Espanha / LatAm',
    lang: 'es-ES',
    firstNames: ['Mateo', 'Valeria', 'Diego', 'Camila', 'Santiago', 'Lucía', 'Javier', 'Elena', 'Facundo', 'Jimena'],
    lastNames: ['Montoya', 'Morales', 'Castillo', 'Herrera', 'Ortega', 'Delgado', 'Rojas', 'Navarro', 'Peralta', 'Vargas'],
    callsigns: ['TORMENTA', 'CÓNDOR', 'FUEGO-GT', 'AL-LÍMITE', 'RAYO'],
    lines: {
      weather: ['¡Qué tormenta! El asfalto parece jabón!'],
      hitByPlayer: ['¡Oye cuidado! ¡Respeta la trazada!'],
      overtake: ['¡Por afuera y frenando tarde, vamoooos!'],
      frustration: ['¡No puede ser, perdí tracción a la salida!'],
      respectPlayer: ['¡Qué maniobra tan limpia, mis respetos!'],
      tauntRival: ['Otra vez tú... ¡hoy no me vas a empujar!'],
      allySupport: ['¡Adelante amigo, te doy rebufo en la recta!'],
    },
  },
  {
    country: 'França',
    lang: 'fr-FR',
    firstNames: ['Pierre', 'Camille', 'Théo', 'Léa', 'Antoine', 'Manon', 'Julien', 'Chloé', 'Romain', 'Inès'],
    lastNames: ['Moreau', 'Laurent', 'Lefèvre', 'Bernard', 'Dubois', 'Chevalier', 'Renaud', 'Fontaine', 'Mercier', 'Blanc'],
    callsigns: ['SARTHE-24', 'MISTRAL', 'CHICANE', 'BLEU-GP', 'ÉCLAIR'],
    lines: {
      weather: ['La piste est détrempée, attention au freinage! [Pista encharcada, atenção na freada!]'],
      hitByPlayer: ['Mais ça va pas?! Garde ta ligne! [Ficou maluco?! Mantenha sua linha!]'],
      overtake: ['Magnifique dépassement à la corde! [Bela ultrapassagem no apex!]'],
      frustration: ['Mes pneus arrière sont morts! [Meus pneus traseiros já eram!]'],
      respectPlayer: ['Quel pilotage propre, bravo! [Que pilotagem limpa, bravo!]'],
      tauntRival: ['Encore toi?! Tu ne passeras pas! [Você de novo?! Não vai passar!]'],
      allySupport: ['Vas-y mon ami, je te protège! [Vai meu amigo, eu te protejo!]'],
    },
  },
];

const CATEGORIES: CarCategory[] = [
  'popular_br',
  'classics',
  'muscle',
  'supercars',
  'hyper_concepts',
  'formula_proto',
  'exotic_easter',
  'rc_revolt',
];

const PERSONALITY_BIOS = [
  'Ex-mecânico de kartódromo que aprendeu a frear no último centímetro na chuva.',
  'Prodígio de simuladores neurais contratado direto para carros de turismo.',
  'Veterano implacável das 24 Horas de Nürburgring conhecido pela frieza absoluta.',
  'Lenda underground das madrugadas urbanas que nunca levanta o pé em curvas cegas.',
  'Engenheira de telemetria que calcula desgaste térmico de pneu volta a volta.',
  'Piloto acrobático impulsivo: rápido como um raio, mas destrói pneus em 4 voltas.',
  'Cavalheiro das pistas clássicas — dá espaço limpo, mas jamais perdoa jogo sujo.',
  'Especialista em rally de montanha capaz de dançar no gelo e no cascalho.',
];

const COLORS = ['#ef233c', '#3a86ff', '#ffbe0b', '#06d6a0', '#8338ec', '#fb5607', '#00bbf9', '#f72585'];

export const BOT_ROSTER: BotDriverProfile[] = Array.from({ length: 200 }, (_, i) => {
  const nat = NATION_TEMPLATES[i % NATION_TEMPLATES.length];
  const fn = nat.firstNames[Math.floor(i / NATION_TEMPLATES.length) % nat.firstNames.length];
  const ln = nat.lastNames[(i * 3) % nat.lastNames.length];
  const callsign = `${nat.callsigns[i % nat.callsigns.length]}-${String(i + 1).padStart(2, '0')}`;
  const aggression = ((i * 7) % 10) + 1;
  const skill = ((i * 3 + 4) % 10) + 1;
  const sportsmanship = Math.max(1, 11 - aggression);

  return {
    id: `bot-${i + 1}`,
    name: `${fn} ${ln}`,
    callsign,
    nationality: nat.country,
    languageCode: nat.lang,
    bio: PERSONALITY_BIOS[i % PERSONALITY_BIOS.length],
    aggression,
    skill,
    tireManagement: ((i * 5 + 2) % 10) + 1,
    overtakeBravery: ((i * 9 + 1) % 10) + 1,
    pressureComposure: ((i * 4 + 3) % 10) + 1,
    consistency: ((i * 6 + 2) % 10) + 1,
    adaptability: ((i * 8 + 1) % 10) + 1,
    sportsmanship,
    favoriteCategory: CATEGORIES[i % CATEGORIES.length],
    signatureColor: COLORS[i % COLORS.length],
    lines: nat.lines,
  };
});
