// Client-side SQLite schema — mirrors server/db/schema.ts minus sessions and sync_states,
// plus a local_config table for onboarding/settings.

// All CREATE TABLE statements as raw SQL for sql.js initialization.
// We use raw SQL here because sql.js doesn't use Drizzle for DDL.

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  steam_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  profile_url TEXT,
  country_code TEXT,
  last_login INTEGER,
  blacklisted_tags TEXT,
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
  price_currency TEXT,
  review_score INTEGER,
  review_count INTEGER,
  developers TEXT,
  publishers TEXT,
  platforms TEXT,
  detailed_desc TEXT,
  screenshots TEXT,
  movies TEXT,
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
CREATE INDEX IF NOT EXISTS user_games_user_id_idx ON user_games(user_id);

CREATE TABLE IF NOT EXISTS swipe_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  decision TEXT NOT NULL,
  swiped_at INTEGER DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS swipe_user_game_idx ON swipe_history(user_id, game_id);
CREATE INDEX IF NOT EXISTS swipe_history_user_id_idx ON swipe_history(user_id);

CREATE TABLE IF NOT EXISTS taste_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
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
  dismissed INTEGER DEFAULT 0,
  source TEXT DEFAULT 'heuristic'
);
CREATE UNIQUE INDEX IF NOT EXISTS rec_user_game_idx ON recommendations(user_id, game_id);
CREATE INDEX IF NOT EXISTS recommendations_user_score_idx ON recommendations(user_id, score);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS bookmark_user_game_idx ON bookmarks(user_id, game_id);

CREATE TABLE IF NOT EXISTS profile_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  genre_scores TEXT,
  tag_scores TEXT,
  total_games INTEGER DEFAULT 0,
  total_playtime_hours INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS profile_snapshots_user_idx ON profile_snapshots(user_id);

CREATE TABLE IF NOT EXISTS ai_summary_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  summary TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS ai_summary_history_user_idx ON ai_summary_history(user_id);

CREATE TABLE IF NOT EXISTS backlog_order (
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#8b5cf6',
  icon TEXT DEFAULT 'fa-folder',
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS collections_user_idx ON collections(user_id);

CREATE TABLE IF NOT EXISTS collection_games (
  collection_id INTEGER NOT NULL REFERENCES collections(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  added_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (collection_id, game_id)
);

CREATE TABLE IF NOT EXISTS game_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  content TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS game_notes_user_game_idx ON game_notes(user_id, game_id);

CREATE TABLE IF NOT EXISTS game_status (
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  status TEXT NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, game_id)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  theme TEXT DEFAULT 'dark',
  backup_dir TEXT,
  backup_interval_hours INTEGER DEFAULT 24,
  last_backup_at INTEGER,
  ollama_url TEXT,
  ollama_model TEXT,
  cache_ttl_seconds INTEGER,
  language TEXT DEFAULT 'en',
  keyboard_shortcuts TEXT,
  explanation_template TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS chat_messages_user_idx ON chat_messages(user_id);

CREATE TABLE IF NOT EXISTS auto_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  category TEXT NOT NULL,
  confidence REAL,
  categorized_at INTEGER DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS auto_cat_user_game_idx ON auto_categories(user_id, game_id);
CREATE INDEX IF NOT EXISTS auto_cat_user_idx ON auto_categories(user_id);

CREATE TABLE IF NOT EXISTS price_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  target_price_cents INTEGER,
  current_price_cents INTEGER,
  last_checked INTEGER,
  alerted INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS price_alert_user_game_idx ON price_alerts(user_id, game_id);
CREATE INDEX IF NOT EXISTS price_alerts_user_idx ON price_alerts(user_id);

CREATE TABLE IF NOT EXISTS publisher_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'publisher',
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS blacklist_user_name_idx ON publisher_blacklist(user_id, name);

-- Local-only table for app configuration (not in server schema)
CREATE TABLE IF NOT EXISTS local_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  steam_id TEXT,
  steam_api_key_encrypted TEXT,
  steam_api_key_iv TEXT,
  steam_api_key_salt TEXT,
  display_name TEXT,
  avatar_url TEXT,
  profile_url TEXT,
  country_code TEXT,
  ai_provider TEXT DEFAULT 'webllm',
  ollama_url TEXT DEFAULT 'http://localhost:11434',
  ollama_model TEXT DEFAULT 'llama3.1:8b',
  webllm_model TEXT DEFAULT 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  setup_complete INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
`;

// Incremental migrations for existing databases (ALTER TABLE is safe to retry — SQLite errors on duplicate columns)
export const MIGRATIONS_SQL = [
  `ALTER TABLE user_settings ADD COLUMN explanation_template TEXT`,
  `ALTER TABLE games ADD COLUMN screenshots TEXT`,
  `ALTER TABLE games ADD COLUMN movies TEXT`,
  `ALTER TABLE users RENAME COLUMN ignored_tags TO blacklisted_tags`,
];
