import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYLIST, SOUNDTRACK, realiseChord, trackById } from '../audio/Soundtrack';

const QUALITIES = ['min', 'maj', 'min7', 'maj7', 'dom7', 'sus4', 'add9'];
const MODES = ['minor', 'major', 'dorian', 'mixolydian'];

describe('soundtrack catalogue', () => {
  it('every score is complete enough to be played', () => {
    expect(SOUNDTRACK.length).toBeGreaterThanOrEqual(8);
    for (const t of SOUNDTRACK) {
      expect(t.id).toMatch(/^[a-z0-9_]+$/);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.artist.length).toBeGreaterThan(0);
      expect(t.mood.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.bpm).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBeLessThanOrEqual(200);
      expect(MODES).toContain(t.mode);
      expect(t.energy).toBeGreaterThan(0);
      expect(t.energy).toBeLessThanOrEqual(1);
    }
  });

  it('has unique ids and a valid default playlist', () => {
    const ids = SOUNDTRACK.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_PLAYLIST.length).toBeGreaterThan(0);
    for (const id of DEFAULT_PLAYLIST) expect(trackById(id)).toBeTruthy();
  });

  it('progressions and arrangement are well formed', () => {
    for (const t of SOUNDTRACK) {
      expect(t.progression.length).toBeGreaterThanOrEqual(4);
      for (const entry of t.progression) {
        // Degrees are semitone roots within an octave.
        expect(entry.degree).toBeGreaterThanOrEqual(0);
        expect(entry.degree).toBeLessThanOrEqual(11);
        expect(QUALITIES).toContain(entry.quality);
      }
      expect(t.sections.length).toBeGreaterThanOrEqual(3);
      const totalBars = t.sections.reduce((s, x) => s + x.bars, 0);
      expect(totalBars).toBeGreaterThanOrEqual(8);
      for (const s of t.sections) expect(s.bars).toBeGreaterThan(0);
      expect(t.sections[0].name).toBe('intro');
      expect(t.sections[t.sections.length - 1].name).toBe('outro');
    }
  });
});

describe('realiseChord', () => {
  it('returns ascending MIDI tones inside a sane instrument range', () => {
    for (const t of SOUNDTRACK) {
      for (let bar = 0; bar < t.progression.length; bar++) {
        const { rootMidi, tones } = realiseChord(t, bar, 3);
        expect(Number.isFinite(rootMidi)).toBe(true);
        expect(rootMidi).toBeGreaterThan(24);
        expect(rootMidi).toBeLessThan(84);
        expect(tones.length).toBeGreaterThanOrEqual(3);
        for (let i = 0; i < tones.length; i++) {
          expect(Number.isInteger(tones[i])).toBe(true);
          if (i > 0) expect(tones[i]).toBeGreaterThan(tones[i - 1]);
        }
        // Root is always the lowest voice.
        expect(tones[0]).toBe(rootMidi);
      }
    }
  });

  it('honours the mode when choosing the third', () => {
    // A major-mode tonic chord must have a natural third (4 semitones), a
    // minor-mode tonic a flat third (3). This is the check that catches a
    // hardcoded third, which is what makes procedural music sound wrong.
    const majorTrack = SOUNDTRACK.find((t) => t.mode === 'major' && t.progression[0].degree === 0);
    const minorTrack = SOUNDTRACK.find((t) => t.mode === 'minor' && t.progression[0].degree === 0);
    if (majorTrack) {
      const { rootMidi, tones } = realiseChord(majorTrack, 0, 3);
      expect(tones[1] - rootMidi).toBe(4);
    }
    if (minorTrack) {
      const { rootMidi, tones } = realiseChord(minorTrack, 0, 3);
      expect(tones[1] - rootMidi).toBe(3);
    }
  });

  it('wraps around the progression instead of going out of range', () => {
    const t = SOUNDTRACK[0];
    const a = realiseChord(t, 0, 3);
    const b = realiseChord(t, t.progression.length, 3);
    expect(b).toEqual(a);
  });
});
