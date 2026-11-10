/**
 * SOUNDTRACK — original, selectable tracks
 * =======================================
 *
 * ABOUT "REAL SONGS"
 * ------------------
 * The game cannot ship commercial music: those recordings are licensed, and
 * bundling them would be illegal. What it *can* ship is a soundtrack of
 * original compositions — real songs with a real structure (intro, groove,
 * hook, breakdown, outro), a real chord progression in a real key, played by a
 * synthesizer with real envelopes. That is what this file is: eight tracks
 * spanning the moods a road trip needs, each one a proper song rather than a
 * looping arpeggio.
 *
 * Each track is a *score* — a tempo, a key, a progression, a drum pattern and
 * a handful of musical parts (bass, pad, lead, arp, drums) — which the audio
 * engine renders sample-accurately with Web Audio. Because it is generated from
 * a score rather than streamed, the tracks are seamless, loop forever, cost
 * zero download, and can be *interactive*: the lead can duck under the engine
 * note, the tempo can stretch with speed, and the mix can open up at the
 * finish line.
 *
 * The player picks a playlist in the garage, exactly like choosing what to
 * listen to on a road trip.
 */

export interface TrackSection {
  name: 'intro' | 'groove' | 'hook' | 'breakdown' | 'outro';
  /** Bars this section lasts. */
  bars: number;
}

export interface SoundtrackTrack {
  id: string;
  title: string;
  artist: string;
  /** Mood label shown in the player. */
  mood: string;
  genre: string;
  bpm: number;
  /** Note names of the tonic, e.g. "A". */
  key: string;
  /** 'minor' | 'major' | 'dorian' | 'mixolydian' */
  mode: 'minor' | 'major' | 'dorian' | 'mixolydian';
  /** Chord progression, one entry per bar, semitone roots + quality. */
  progression: { degree: number; quality: 'min' | 'maj' | 'min7' | 'maj7' | 'dom7' | 'sus4' | 'add9' }[];
  /** Overall energy 0..1 — used to bias which tracks suit which mode. */
  energy: number;
  /** Track length in bars (it loops, but the arrangement is this long). */
  sections: TrackSection[];
  /** Drum kit flavour. */
  drums: 'four_on_floor' | 'rock_backbeat' | 'bossa_brush' | 'breakbeat' | 'half_time' | 'none';
  /** Instruments used (ids in SOUNDS). */
  parts: {
    bass: 'sub_round' | 'saw_pick' | 'fretless' | 'pulse';
    pad: 'warm_strings' | 'glass_pad' | 'brass_swell' | 'none';
    lead: 'saw_lead' | 'square_lead' | 'nylon' | 'bell_lead' | 'none';
    arp: 'pluck' | 'marimba' | 'none';
  };
  /** One-line description for the playlist UI. */
  blurb: string;
  /** Accent colour for the UI row. */
  accent: string;
}

export const SOUNDTRACK: SoundtrackTrack[] = [
  {
    id: 'estrada_de_terra',
    title: 'Estrada de Terra',
    artist: 'VELOCITY Studio',
    mood: 'Sertão ao amanhecer',
    genre: 'MPB / Folk brasileiro',
    bpm: 92,
    key: 'D',
    mode: 'mixolydian',
    progression: [
      { degree: 0, quality: 'add9' },
      { degree: 5, quality: 'maj' },
      { degree: 3, quality: 'min7' },
      { degree: 4, quality: 'sus4' },
    ],
    energy: 0.34,
    drums: 'bossa_brush',
    sections: [
      { name: 'intro', bars: 8 },
      { name: 'groove', bars: 16 },
      { name: 'hook', bars: 16 },
      { name: 'breakdown', bars: 8 },
      { name: 'outro', bars: 8 },
    ],
    parts: { bass: 'fretless', pad: 'warm_strings', lead: 'nylon', arp: 'marimba' },
    blurb: 'Viola caipira sintética, baixo fretless e poeira na luz da manhã.',
    accent: '#e0a458',
  },
  {
    id: 'serra_do_aco',
    title: 'Serra do Aço',
    artist: 'VELOCITY Studio',
    mood: 'Descida de serra',
    genre: 'Rock nacional',
    bpm: 124,
    key: 'E',
    mode: 'minor',
    progression: [
      { degree: 0, quality: 'min' },
      { degree: 5, quality: 'min' },
      { degree: 3, quality: 'maj' },
      { degree: 7, quality: 'maj' },
    ],
    energy: 0.72,
    drums: 'rock_backbeat',
    sections: [
      { name: 'intro', bars: 4 },
      { name: 'groove', bars: 12 },
      { name: 'hook', bars: 16 },
      { name: 'breakdown', bars: 8 },
      { name: 'outro', bars: 8 },
    ],
    parts: { bass: 'saw_pick', pad: 'brass_swell', lead: 'saw_lead', arp: 'pluck' },
    blurb: 'Riff de guitarra distorcida para a descida de serra de Ipatinga.',
    accent: '#e05a47',
  },
  {
    id: 'litoral_norte',
    title: 'Litoral Norte',
    artist: 'VELOCITY Studio',
    mood: 'Estrada litorânea',
    genre: 'Bossa / Chillout',
    bpm: 104,
    key: 'A',
    mode: 'major',
    progression: [
      { degree: 0, quality: 'maj7' },
      { degree: 5, quality: 'min7' },
      { degree: 3, quality: 'min7' },
      { degree: 2, quality: 'min7' },
    ],
    energy: 0.4,
    drums: 'bossa_brush',
    sections: [
      { name: 'intro', bars: 8 },
      { name: 'groove', bars: 16 },
      { name: 'hook', bars: 16 },
      { name: 'outro', bars: 8 },
    ],
    parts: { bass: 'sub_round', pad: 'glass_pad', lead: 'nylon', arp: 'marimba' },
    blurb: 'Sol, sal e um acorde de sexta. Para ir devagar com estilo.',
    accent: '#3ec2a0',
  },
  {
    id: 'hypercar_overture',
    title: 'Hypercar Overture',
    artist: 'VELOCITY Studio',
    mood: 'Aperto de botão',
    genre: 'Synthwave / Orchestral',
    bpm: 118,
    key: 'A',
    mode: 'minor',
    progression: [
      { degree: 0, quality: 'min' },
      { degree: 8, quality: 'maj' },
      { degree: 5, quality: 'min' },
      { degree: 10, quality: 'maj' },
    ],
    energy: 0.86,
    drums: 'four_on_floor',
    sections: [
      { name: 'intro', bars: 8 },
      { name: 'groove', bars: 8 },
      { name: 'hook', bars: 16 },
      { name: 'breakdown', bars: 8 },
      { name: 'hook', bars: 8 },
      { name: 'outro', bars: 4 },
    ],
    parts: { bass: 'pulse', pad: 'brass_swell', lead: 'saw_lead', arp: 'pluck' },
    blurb: 'Cordas sintéticas e quatro no chão a 300 km/h.',
    accent: '#7aa2f7',
  },
  {
    id: 'ameanhecer_na_serra',
    title: 'Amanhecer na Serra',
    artist: 'VELOCITY Studio',
    mood: 'Golden hour',
    genre: 'Ambient / Post-rock',
    bpm: 74,
    key: 'F',
    mode: 'major',
    progression: [
      { degree: 0, quality: 'add9' },
      { degree: 4, quality: 'maj' },
      { degree: 5, quality: 'add9' },
      { degree: 3, quality: 'min7' },
    ],
    energy: 0.22,
    drums: 'none',
    sections: [
      { name: 'intro', bars: 16 },
      { name: 'groove', bars: 16 },
      { name: 'breakdown', bars: 16 },
      { name: 'outro', bars: 16 },
    ],
    parts: { bass: 'sub_round', pad: 'warm_strings', lead: 'bell_lead', arp: 'none' },
    blurb: 'Camadas longas, para trechos abertos e pôr do sol no retrovisor.',
    accent: '#f2a65a',
  },
  {
    id: 'nurburgring_19h',
    title: 'Nürburgring 19h',
    artist: 'VELOCITY Studio',
    mood: 'Volta cronometrada',
    genre: 'Electro / Breakbeat',
    bpm: 158,
    key: 'C',
    mode: 'minor',
    progression: [
      { degree: 0, quality: 'min' },
      { degree: 0, quality: 'min' },
      { degree: 5, quality: 'min7' },
      { degree: 7, quality: 'sus4' },
    ],
    energy: 0.95,
    drums: 'breakbeat',
    sections: [
      { name: 'intro', bars: 8 },
      { name: 'groove', bars: 8 },
      { name: 'hook', bars: 16 },
      { name: 'breakdown', bars: 4 },
      { name: 'hook', bars: 16 },
      { name: 'outro', bars: 8 },
    ],
    parts: { bass: 'pulse', pad: 'glass_pad', lead: 'square_lead', arp: 'pluck' },
    blurb: 'Batida quebrada para a pista que não perdoa. Alto BPM, alta tensão.',
    accent: '#b48ead',
  },
  {
    id: 'corrida_de_agua',
    title: 'Corrida de Água',
    artist: 'VELOCITY Studio',
    mood: 'Chuva na pista',
    genre: 'Downtempo / Acid',
    bpm: 112,
    key: 'G',
    mode: 'dorian',
    progression: [
      { degree: 0, quality: 'min7' },
      { degree: 3, quality: 'maj7' },
      { degree: 7, quality: 'maj' },
      { degree: 5, quality: 'sus4' },
    ],
    energy: 0.55,
    drums: 'half_time',
    sections: [
      { name: 'intro', bars: 8 },
      { name: 'groove', bars: 16 },
      { name: 'hook', bars: 8 },
      { name: 'breakdown', bars: 8 },
      { name: 'outro', bars: 8 },
    ],
    parts: { bass: 'pulse', pad: 'glass_pad', lead: 'square_lead', arp: 'pluck' },
    blurb: 'Acid suave para pneuaço molhado e reflexo no asfalto.',
    accent: '#5bc0be',
  },
  {
    id: 'fim_da_linha',
    title: 'Fim da Linha',
    artist: 'VELOCITY Studio',
    mood: 'Pódio',
    genre: 'Orquestral / Cinemático',
    bpm: 96,
    key: 'Bb',
    mode: 'major',
    progression: [
      { degree: 0, quality: 'maj' },
      { degree: 5, quality: 'maj7' },
      { degree: 3, quality: 'min7' },
      { degree: 4, quality: 'sus4' },
    ],
    energy: 0.6,
    drums: 'rock_backbeat',
    sections: [
      { name: 'intro', bars: 8 },
      { name: 'groove', bars: 8 },
      { name: 'hook', bars: 16 },
      { name: 'outro', bars: 8 },
    ],
    parts: { bass: 'sub_round', pad: 'warm_strings', lead: 'bell_lead', arp: 'marimba' },
    blurb: 'Para cruzar a linha, tirar o capacete e ouvir o eco do motor.',
    accent: '#e8c547',
  },
];

export const DEFAULT_PLAYLIST = [
  'estrada_de_terra',
  'serra_do_aco',
  'hypercar_overture',
  'nurburgring_19h',
];

export function trackById(id: string): SoundtrackTrack | undefined {
  return SOUNDTRACK.find((t) => t.id === id);
}

/** Semitone offset of a note name from C, for the score renderer. */
const NOTE_BASE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Scale degrees of each mode, used by the melody generator. */
export const MODE_SCALES: Record<SoundtrackTrack['mode'], number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/**
 * Builds the chord tones for one progression entry, in ascending order.
 *
 * `degree` is the *semitone* root offset from the key (not a scale index), and
 * `quality` says how to colour it. Two details matter for the music to sound
 * written rather than random:
 *
 *  - The third follows the tonality: `maj`-family chords get a major third,
 *    `min`-family chords a minor third, `sus4` a perfect fourth. Picking the
 *    third from the mode instead turns a plain major chord into something
 *    modal and muddy.
 *  - The chord is voiced close: the fifth and seventh are placed *above* the
 *    third even when the third is a compound interval away from the root, and
 *    the added ninth is pushed up an octave above the seventh. Stacking blindly
 *    on the root produces voice crossings like [53, 64, 60, 63], which sounds
 *    like a mistake because it is one.
 */
export function realiseChord(
  track: SoundtrackTrack,
  bar: number,
  octave = 3
): { rootMidi: number; tones: number[] } {
  const entry = track.progression[bar % track.progression.length];
  const base = (NOTE_BASE[track.key] ?? 0) + 12 * (octave + 1);
  const rootMidi = base + entry.degree;

  const minorThird = entry.quality === 'min' || entry.quality === 'min7';
  const majorThird = entry.quality === 'maj' || entry.quality === 'maj7' || entry.quality === 'dom7' || entry.quality === 'add9';
  const third = entry.quality === 'sus4' ? 5 : minorThird ? 3 : majorThird ? 4 : 4;
  const seventh = entry.quality === 'maj7' ? 11 : entry.quality === 'min7' || entry.quality === 'dom7' ? 10 : null;

  const tones = [rootMidi, rootMidi + third, rootMidi + 7];
  if (seventh !== null) tones.push(rootMidi + seventh);
  if (entry.quality === 'add9') tones.push(rootMidi + 14);
  return { rootMidi, tones };
}
