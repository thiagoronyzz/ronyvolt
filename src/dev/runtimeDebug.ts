/**
 * DEV-ONLY RUNTIME PROBE
 * ======================
 * The browser harness (`tools/browser-check.mjs`) needs to read the *same*
 * module singletons the app uses. Importing `/src/audio/...` from the page is
 * unreliable under Vite HMR: edited modules get a `?t=<timestamp>` URL, so a
 * bare dynamic import silently creates a second instance with an empty queue.
 * This file is imported by `main.tsx` (same module graph as the app) and
 * publishes read-only handles on `window` — stripped from production builds by
 * `import.meta.env.DEV`.
 */
import { audioEngine } from '../audio/VelocityAudioEngine';
import { customMusicMedia } from '../audio/CustomMusicMedia';
import { customMusicPlayer } from '../audio/CustomMusicPlayer';
import {
  photographicAssetErrors,
  photographicAssetsEnabled,
  photographicAssetsLoaded,
} from '../render/PhotographicAssets';
import { getActiveEngine, VelocityEngine } from '../engine/VelocityEngine';

export interface VelocityRuntimeDebug {
  audioEngine: typeof audioEngine;
  customMusicMedia: typeof customMusicMedia;
  customMusicPlayer: typeof customMusicPlayer;
  photos: () => {
    enabled: boolean;
    loaded: boolean;
    errors: string[];
  };
  engine: () => VelocityEngine | null;
}

declare global {
  interface Window {
    __velocity?: VelocityRuntimeDebug;
  }
}

export function installRuntimeDebug(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  window.__velocity = {
    audioEngine,
    customMusicMedia,
    customMusicPlayer,
    photos: () => ({
      enabled: photographicAssetsEnabled(),
      loaded: photographicAssetsLoaded(),
      errors: photographicAssetErrors(),
    }),
    engine: () => getActiveEngine(),
  };
}
