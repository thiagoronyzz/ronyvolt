/**
 * CUSTOM MUSIC LIBRARY — "Minhas Músicas"
 * ----------------------------------------
 * Player-imported audio files (MP3/M4A/OGG/WAV/FLAC) stored on the device
 * itself via IndexedDB, so the playlist survives reloads and works offline.
 * The library is deliberately DOM-free except for IndexedDB: queue math lives
 * in pure functions so it can be unit-tested in Node.
 *
 * Fallback: when IndexedDB is unavailable (private browsing, very old
 * browsers) the library degrades to an in-memory map — files still play for
 * the session, they just don't persist.
 */

export interface CustomTrackMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: number;
}

export type PlayMode = 'sequential' | 'loop_one' | 'shuffle';

const DB_NAME = 'velocity-custom-music';
const STORE = 'tracks';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `t${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export class CustomMusicLibrary {
  private memory = new Map<string, { meta: CustomTrackMeta; blob: Blob }>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private openDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.openDb();
    if (!db) throw new Error('indexeddb-unavailable');
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const req = run(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  public async list(): Promise<CustomTrackMeta[]> {
    const db = await this.openDb();
    if (!db) {
      return [...this.memory.values()].map((v) => v.meta).sort((a, b) => a.addedAt - b.addedAt);
    }
    try {
      const all = await this.tx<CustomTrackMeta[]>('readonly', (s) => s.getAll());
      return (all ?? []).sort((a, b) => a.addedAt - b.addedAt);
    } catch {
      return [...this.memory.values()].map((v) => v.meta).sort((a, b) => a.addedAt - b.addedAt);
    }
  }

  public async add(file: Blob & { name?: string; type?: string }): Promise<CustomTrackMeta> {
    const meta: CustomTrackMeta = {
      id: newId(),
      name: file.name ?? 'Faixa importada',
      type: file.type ?? 'audio/mpeg',
      size: file.size ?? 0,
      addedAt: Date.now(),
    };
    const db = await this.openDb();
    if (!db) {
      this.memory.set(meta.id, { meta, blob: file });
      return meta;
    }
    try {
      await this.tx('readwrite', (s) => s.put({ ...meta, blob: file }));
    } catch {
      this.memory.set(meta.id, { meta, blob: file });
    }
    return meta;
  }

  public async getBlob(id: string): Promise<Blob | null> {
    const mem = this.memory.get(id);
    if (mem) return mem.blob;
    const db = await this.openDb();
    if (!db) return null;
    try {
      const rec = await this.tx<{ blob: Blob } | undefined>('readonly', (s) => s.get(id));
      return rec?.blob ?? null;
    } catch {
      return null;
    }
  }

  public async remove(id: string): Promise<void> {
    this.memory.delete(id);
    const db = await this.openDb();
    if (!db) return;
    try {
      await this.tx('readwrite', (s) => s.delete(id));
    } catch {
      // already gone — fine
    }
  }

  public async clear(): Promise<void> {
    this.memory.clear();
    const db = await this.openDb();
    if (!db) return;
    try {
      await this.tx('readwrite', (s) => s.clear());
    } catch {
      // ignore
    }
  }
}

export const customMusicLibrary = new CustomMusicLibrary();

/** Next queue index for natural track end / "next" button. Wraps around. */
export function nextIndex(current: number, count: number, mode: PlayMode, random: () => number = Math.random): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  if (mode === 'loop_one') return Math.max(0, Math.min(count - 1, current));
  if (mode === 'shuffle') {
    let n = Math.floor(random() * count);
    if (n === current) n = (n + 1) % count;
    return n;
  }
  return (current + 1) % count;
}

/** Previous queue index. Wraps around. */
export function prevIndex(current: number, count: number): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  return (current - 1 + count) % count;
}
