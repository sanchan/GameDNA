// Client-side SQLite via sql.js (WASM).
// Loads existing DB from OPFS (web) or AppData (Tauri) on startup; creates fresh if none.
// Exports persistDb() (debounced 500ms) and resetDb().

import initSqlJs, { type Database } from 'sql.js';
import { CREATE_TABLES_SQL, MIGRATIONS_SQL } from './schema';

let db: Database | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const OPFS_DIR = 'gamedna';
const OPFS_FILE = 'gamedna.db';
const TAURI_DB_PATH = 'gamedna.db';

// ── Storage backend abstraction ──────────────────────────────────────────────

async function readStorage(): Promise<Uint8Array | null> {
  if (IS_TAURI) {
    try {
      const { readFile, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      const fileExists = await exists(TAURI_DB_PATH, { baseDir: BaseDirectory.AppData });
      if (!fileExists) return null;
      const data = await readFile(TAURI_DB_PATH, { baseDir: BaseDirectory.AppData });
      return data.byteLength > 0 ? data : null;
    } catch {
      return null;
    }
  }
  // Web: OPFS
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const fileHandle = await dir.getFileHandle(OPFS_FILE);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return buffer.byteLength > 0 ? new Uint8Array(buffer) : null;
  } catch {
    return null;
  }
}

async function writeStorage(data: Uint8Array): Promise<void> {
  if (IS_TAURI) {
    const { writeFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    // Ensure AppData dir exists
    try {
      await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
    } catch {
      // Already exists
    }
    await writeFile(TAURI_DB_PATH, data, { baseDir: BaseDirectory.AppData });
    return;
  }
  // Web: OPFS
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
  const fileHandle = await dir.getFileHandle(OPFS_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data as unknown as BufferSource);
  await writable.close();
}

async function removeStorage(): Promise<void> {
  if (IS_TAURI) {
    try {
      const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
      await remove(TAURI_DB_PATH, { baseDir: BaseDirectory.AppData });
    } catch {
      // File may not exist
    }
    return;
  }
  // Web: OPFS
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    await dir.removeEntry(OPFS_FILE);
  } catch {
    // File may not exist
  }
}

// ── DB lifecycle ─────────────────────────────────────────────────────────────

export async function initDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: () => '/sql-wasm.wasm',
  });

  const existing = await readStorage();
  if (existing) {
    db = new SQL.Database(existing);
    // Run CREATE IF NOT EXISTS to add any new tables from schema updates
    db.run(CREATE_TABLES_SQL);
    // Run incremental migrations (ALTER TABLE etc.) — ignore errors for already-applied ones
    for (const sql of MIGRATIONS_SQL) {
      try { db.run(sql); } catch { /* column already exists */ }
    }
  } else {
    db = new SQL.Database();
    db.run('PRAGMA journal_mode=WAL;');
    db.run('PRAGMA foreign_keys=ON;');
    db.run(CREATE_TABLES_SQL);
  }

  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

/** Debounced persist — call after every write. Coalesces rapid writes into a single write. */
export function persistDb(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (!db) return;
    try {
      const data = db.export();
      await writeStorage(data);
    } catch (e) {
      console.error('[db] Failed to persist:', e);
    }
  }, 500);
}

/** Force immediate persist (for use before page unload). */
export async function persistDbNow(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!db) return;
  const data = db.export();
  await writeStorage(data);
}

/** Reset database — clears storage and creates fresh. */
export async function resetDb(): Promise<Database> {
  if (db) {
    db.close();
    db = null;
  }

  await removeStorage();
  return initDb();
}

/** Export DB as Uint8Array for download/backup. */
export function exportDb(): Uint8Array {
  return getDb().export();
}

/** Import DB from Uint8Array (replaces current). */
export async function importDb(data: Uint8Array): Promise<Database> {
  if (db) {
    db.close();
    db = null;
  }

  const SQL = await initSqlJs({
    locateFile: () => '/sql-wasm.wasm',
  });

  db = new SQL.Database(data);
  // Ensure schema is up to date
  db.run(CREATE_TABLES_SQL);
  await persistDbNow();
  return db;
}

// Persist before page unload (best-effort, web only — Tauri uses async fs)
if (typeof window !== 'undefined' && !IS_TAURI) {
  window.addEventListener('beforeunload', () => {
    if (db) {
      try {
        const data = db.export();
        navigator.storage.getDirectory().then(async (root) => {
          const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
          const fh = await dir.getFileHandle(OPFS_FILE, { create: true });
          const writable = await fh.createWritable();
          await writable.write(data as unknown as BufferSource);
          await writable.close();
        }).catch(() => {});
      } catch {
        // Best effort
      }
    }
  });
}
