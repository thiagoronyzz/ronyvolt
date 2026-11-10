import { describe, expect, it } from 'vitest';
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Minimap } from '../components/Minimap';
import { PauseMenu } from '../components/PauseMenu';
import { SettingsModal, GameSettings } from '../components/SettingsModal';

/**
 * UI RENDERING TESTS
 * ------------------
 * These render the real components to static markup (no jsdom needed) and
 * assert the things that were reported as broken: the HUD map drawing the real
 * circuit, the settings menu exposing audio/graphics/controls, and the pause
 * menu offering resume/restart/quit. They also fail if an emoji sneaks back
 * into a control label.
 */

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;

const track = Array.from({ length: 24 }, (_, i) => ({
  x: Math.cos((i / 24) * Math.PI * 2) * 180 + 40,
  z: Math.sin((i / 24) * Math.PI * 2) * 95 - 12,
}));

describe('Minimap', () => {
  it('draws the circuit as an SVG path scaled to the viewBox', () => {
    const html = renderToStaticMarkup(
      React.createElement(Minimap, {
        points: track,
        player: { x: 220, z: -12, heading: Math.PI / 2 },
        progress: 0.42,
        blips: [{ x: 100, z: 0, kind: 'rival' }],
      })
    );
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox="0 0 100 100"');
    expect((html.match(/M[\d.]+,[\d.]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('42%');
    // Player marker is rotated, rival marker is drawn.
    expect(html).toContain('rotate(');
    expect(html).toContain('<circle');
  });

  it('renders nothing for an empty track instead of throwing', () => {
    const html = renderToStaticMarkup(
      React.createElement(Minimap, {
        points: [],
        player: { x: 0, z: 0, heading: 0 },
        progress: 0,
      })
    );
    expect(html).toBe('');
  });
});

describe('SettingsModal', () => {
  const settings: GameSettings = {
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
  };

  const html = renderToStaticMarkup(
    React.createElement(SettingsModal, { settings, onChange: () => {}, onClose: () => {} })
  );

  it('has audio, graphics, controls and accessibility sections', () => {
    expect(html).toContain('Áudio');
    expect(html).toContain('Gráficos');
    expect(html).toContain('Controles');
    expect(html).toContain('Acessibilidade');
  });

  it('exposes independent volume sliders including imported MP3s', () => {
    expect(html).toMatch(/Motor/);
    expect(html).toMatch(/Efeitos/);
    expect(html).toMatch(/Trilha do jogo/);
    expect(html).toMatch(/Minhas músicas \(MP3\)/);
    expect((html.match(/type="range"/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('keeps the design-system classes and no emoji labels', () => {
    expect(html).toContain('vu-modal');
    expect(html).toContain('vu-overlay');
    expect(EMOJI.test(html)).toBe(false);
  });
});

describe('PauseMenu', () => {
  it('offers resume, restart and quit', () => {
    const html = renderToStaticMarkup(
      React.createElement(PauseMenu, { onResume: () => {}, onRestart: () => {}, onQuit: () => {} })
    );
    expect(html).toContain('Continuar correndo');
    expect(html).toContain('Reiniciar corrida');
    expect(html).toContain('Voltar para a garagem');
    expect(EMOJI.test(html)).toBe(false);
  });
});

describe('design system stylesheet', () => {
  const css = readFileSync(resolve(__dirname, '../ui/game.css'), 'utf8');

  it('defines the shared tokens used by every panel', () => {
    for (const token of ['--vu-accent', '--vu-panel', '--vu-border', '--vu-font', '--vu-mono']) {
      expect(css).toContain(token);
    }
  });

  it('keeps the HUD inside the screen at small sizes', () => {
    expect(css).toContain('.hud-topbar');
    expect(css).toContain('.hud-tacho');
    expect(css).toContain('.hud-map');
    expect(css).toContain('.hud-miniplayer');
    expect(css).toMatch(/@media \(max-width: 760px\)/);
    expect(css).toMatch(/@media \(max-height: 520px\)/);
    expect(css).toMatch(/@media \(max-width: 520px\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('never rotates or skews a full-screen layer (the "tela torta" class of bug)', () => {
    // Any transform on the root/overlay stack must be a translate/scale only.
    const bad = css.match(/\.(vu-overlay|vu-modal|hud-[a-z-]+)[^{]*{[^}]*(rotate|skew)[^}]*}/g);
    expect(bad).toBeNull();
  });
});
