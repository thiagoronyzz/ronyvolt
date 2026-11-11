/**
 * CUSTOM MUSIC MEDIA — persistent object-URL ownership
 * ===================================================
 *
 * WHY THIS FILE EXISTS (the "play does nothing" bug)
 * --------------------------------------------------
 * The old `CustomMusicPanel` created `blob:` URLs for imported tracks and
 * revoked ALL of them in its React cleanup. The panel is mounted only while the
 * "Minhas Músicas" tab is visible: closing the modal, switching to the game
 * soundtrack tab, or starting a race unmounted it. The queue inside
 * `CustomMusicPlayer` kept pointing at URLs that were already revoked, so:
 *
 *   - pressing play on the first click often loaded a dead URL;
 *   - a track already buffered could play once, then `ended` advanced to a
 *     revoked URL and the music died on the road;
 *   - React 18 StrictMode mounted the panel twice, creating two competing sets
 *     of URLs and leaving half of them leaked.
 *
 * Object URLs are therefore owned by this module-level singleton, NOT by a
 * React component. They live for as long as the track is in the library and are
 * revoked only when the track is removed (or on explicit teardown). Every
 * refresh is serialised, so two concurrent refreshes cannot create duplicate
 * URLs for the same blob.
 */

import { customMusicLibrary, CustomTrackMeta } from './CustomMusicLibrary';
import { customMusicPlayer, CustomQueueTrack } from './CustomMusicPlayer';

export interface CustomTrackView extends CustomTrackMeta {
  /** Blob URL, or null when the stored blob could not be read. */
  url: string | null;
}

type Listener = (views: CustomTrackView[]) => void;

function canCreateObjectUrls(): boolean {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

class CustomMusicMedia {
  private urls = new Map<string, string>();
  private views: CustomTrackView[] = [];
  private listeners = new Set<Listener>();
  /** Serial queue: a refresh requested during another one runs afterwards. */
  private queue: Promise<CustomTrackView[]> = Promise.resolve([]);

  public getViews(): CustomTrackView[] {
    return this.views;
  }

  public getUrl(id: string): string | null {
    return this.urls.get(id) ?? null;
  }

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.views);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snapshot = this.getViews();
    for (const fn of this.listeners) fn(snapshot);
  }

  /**
   * Re-reads the library, creates URLs only for new ids, revokes URLs of ids
   * that disappeared, and pushes the resulting queue to the player. Safe to
   * call from several components at the same time.
   */
  public refresh(): Promise<CustomTrackView[]> {
    this.queue = this.queue
      .catch(() => [])
      .then(() => this.doRefresh());
    return this.queue;
  }

  private async doRefresh(): Promise<CustomTrackView[]> {
    const list = await customMusicLibrary.list();
    const next = new Map<string, string>();

    for (const meta of list) {
      const existing = this.urls.get(meta.id);
      if (existing) {
        next.set(meta.id, existing);
        continue;
      }
      const blob = await customMusicLibrary.getBlob(meta.id);
      if (blob && canCreateObjectUrls()) {
        next.set(meta.id, URL.createObjectURL(blob));
      }
    }

    // Only URLs whose tracks were actually removed are revoked. A playing
    // element keeps its URL across modal close / tab switch / race start.
    for (const [id, url] of this.urls) {
      if (!next.has(id) && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }
    this.urls = next;

    this.views = list.map((meta) => ({ ...meta, url: next.get(meta.id) ?? null }));
    const queue: CustomQueueTrack[] = this.views
      .filter((v): v is CustomTrackView & { url: string } => v.url !== null)
      .map((v) => ({ id: v.id, name: v.name, url: v.url }));
    customMusicPlayer.setTracks(queue);
    this.emit();
    return this.getViews();
  }

  public async addFiles(files: FileList | File[]): Promise<CustomTrackView[]> {
    for (const file of [...files]) {
      await customMusicLibrary.add(file);
    }
    return this.refresh();
  }

  public async remove(id: string): Promise<CustomTrackView[]> {
    await customMusicLibrary.remove(id);
    return this.refresh();
  }

  public async clear(): Promise<CustomTrackView[]> {
    await customMusicLibrary.clear();
    return this.refresh();
  }

  /** Full teardown (tests / page unload helper). Not used on modal unmount. */
  public dispose(): void {
    if (typeof URL.revokeObjectURL === 'function') {
      for (const url of this.urls.values()) URL.revokeObjectURL(url);
    }
    this.urls.clear();
    this.views = [];
    this.listeners.clear();
    this.queue = Promise.resolve([]);
    customMusicPlayer.setTracks([]);
  }
}

export const customMusicMedia = new CustomMusicMedia();
