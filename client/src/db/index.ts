// Client-side SQLite via sql.js (WASM).
// Loads existing DB from OPFS on startup; creates fresh if none.
// Exports persistDb() (debounced 500ms) and resetDb().

import initSqlJs, { type Database } from 'sql.js';
import { CREATE_TABLES_SQL, MIGRATIONS_SQL } from './schema';

let db: Database | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const OPFS_DIR = 'gamedna';
const OPFS_FILE = 'gamedna.db';

async function getOpfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

async function readFromOpfs(): Promise<Uint8Array | null> {
  try {
    const dir = await getOpfsDir();
    const fileHandle = await dir.getFileHandle(OPFS_FILE);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return buffer.byteLength > 0 ? new Uint8Array(buffer) : null;
  } catch {
    return null; // File doesn't exist yet
  }
}

async function writeToOpfs(data: Uint8Array): Promise<void> {
  const dir = await getOpfsDir();
  const fileHandle = await dir.getFileHandle(OPFS_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data as unknown as BufferSource);
  await writable.close();
}

export async function initDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: () => '/sql-wasm.wasm',
  });

  const existing = await readFromOpfs();
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

/** Debounced persist — call after every write. Coalesces rapid writes into a single OPFS write. */
export function persistDb(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (!db) return;
    try {
      const data = db.export();
      await writeToOpfs(data);
    } catch (e) {
      console.error('[db] Failed to persist to OPFS:', e);
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
  await writeToOpfs(data);
}

/** Reset database — clears OPFS and creates fresh. */
export async function resetDb(): Promise<Database> {
  if (db) {
    db.close();
    db = null;
  }

  try {
    const dir = await getOpfsDir();
    await dir.removeEntry(OPFS_FILE);
  } catch {
    // File may not exist
  }

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

// Persist before page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (db) {
      // Best-effort sync persist
      try {
        const data = db.export();
        // Use sync XHR-like approach via OPFS sync access handle if available
        // Fallback: the debounced persist should have already saved recent changes
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
