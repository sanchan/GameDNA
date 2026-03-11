import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const dbPath = process.env.DATABASE_URL || './data/gamedna.db';
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

// Auto-create tables on startup
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    steam_id TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    profile_url TEXT,
    last_login INTEGER,
    ignored_tags TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    short_desc TEXT,
    header_image TEXT,
    genres TEXT,
    tags TEXT,
    release_date TEXT,
    price_cents INTEGER,
    review_score INTEGER,
    review_count INTEGER,
    developers TEXT,
    publishers TEXT,
    platforms TEXT,
    detailed_desc TEXT,
    cached_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS user_games (
    user_id INTEGER REFERENCES users(id),
    game_id INTEGER REFERENCES games(id),
    playtime_mins INTEGER DEFAULT 0,
    last_played INTEGER,
    from_wishlist INTEGER DEFAULT 0,
    synced_at INTEGER,
    PRIMARY KEY (user_id, game_id)
  );

  CREATE TABLE IF NOT EXISTS swipe_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    game_id INTEGER NOT NULL REFERENCES games(id),
    decision TEXT NOT NULL,
    swiped_at INTEGER DEFAULT (unixepoch())
  );

  CREATE UNIQUE INDEX IF NOT EXISTS swipe_user_game_idx ON swipe_history (user_id, game_id);
  CREATE INDEX IF NOT EXISTS swipe_history_user_id_idx ON swipe_history (user_id);
  CREATE INDEX IF NOT EXISTS user_games_user_id_idx ON user_games (user_id);

  CREATE TABLE IF NOT EXISTS taste_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    genre_scores TEXT,
    tag_scores TEXT,
    price_pref TEXT,
    playtime_pref TEXT,
    ai_summary TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    game_id INTEGER NOT NULL REFERENCES games(id),
    score REAL,
    ai_explanation TEXT,
    generated_at INTEGER,
    dismissed INTEGER DEFAULT 0
  );

  CREATE UNIQUE INDEX IF NOT EXISTS rec_user_game_idx ON recommendations (user_id, game_id);
  CREATE INDEX IF NOT EXISTS recommendations_user_score_idx ON recommendations (user_id, score);

  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    game_id INTEGER NOT NULL REFERENCES games(id),
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE UNIQUE INDEX IF NOT EXISTS bookmark_user_game_idx ON bookmarks (user_id, game_id);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL
  );
`);

// Migrations for existing databases
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN ignored_tags TEXT`);
} catch {
  // Column already exists
}

export const db = drizzle(sqlite, { schema });
export { schema };
