import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  steam_id: text('steam_id').unique().notNull(),
  display_name: text('display_name'),
  avatar_url: text('avatar_url'),
  profile_url: text('profile_url'),
  country_code: text('country_code'),
  last_login: integer('last_login'),
  ignored_tags: text('ignored_tags'), // JSON array of ignored tag names
  created_at: integer('created_at').default(sql`(unixepoch())`),
});

export const games = sqliteTable('games', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  short_desc: text('short_desc'),
  header_image: text('header_image'),
  genres: text('genres'),
  tags: text('tags'),
  release_date: text('release_date'),
  price_cents: integer('price_cents'),
  price_currency: text('price_currency'),
  review_score: integer('review_score'),
  review_count: integer('review_count'),
  developers: text('developers'),
  publishers: text('publishers'),
  platforms: text('platforms'),
  detailed_desc: text('detailed_desc'),
  cached_at: integer('cached_at'),
});

export const user_games = sqliteTable('user_games', {
  user_id: integer('user_id').references(() => users.id),
  game_id: integer('game_id').references(() => games.id),
  playtime_mins: integer('playtime_mins').default(0),
  last_played: integer('last_played'),
  from_wishlist: integer('from_wishlist').default(0),
  synced_at: integer('synced_at'),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.game_id] }),
  index('user_games_user_id_idx').on(table.user_id),
]);

export const swipe_history = sqliteTable('swipe_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  game_id: integer('game_id').references(() => games.id).notNull(),
  decision: text('decision').notNull(),
  swiped_at: integer('swiped_at').default(sql`(unixepoch())`),
}, (table) => [
  uniqueIndex('swipe_user_game_idx').on(table.user_id, table.game_id),
  index('swipe_history_user_id_idx').on(table.user_id),
]);

export const taste_profiles = sqliteTable('taste_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull().unique(),
  genre_scores: text('genre_scores'),
  tag_scores: text('tag_scores'),
  price_pref: text('price_pref'),
  playtime_pref: text('playtime_pref'),
  ai_summary: text('ai_summary'),
  updated_at: integer('updated_at'),
});

export const recommendations = sqliteTable('recommendations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  game_id: integer('game_id').references(() => games.id).notNull(),
  score: real('score'),
  ai_explanation: text('ai_explanation'),
  generated_at: integer('generated_at'),
  dismissed: integer('dismissed').default(0),
  source: text('source').default('heuristic'), // 'ai' or 'heuristic'
}, (table) => [
  uniqueIndex('rec_user_game_idx').on(table.user_id, table.game_id),
  index('recommendations_user_score_idx').on(table.user_id, table.score),
]);

export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  game_id: integer('game_id').references(() => games.id).notNull(),
  created_at: integer('created_at').default(sql`(unixepoch())`),
}, (table) => [
  uniqueIndex('bookmark_user_game_idx').on(table.user_id, table.game_id),
]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id).notNull(),
  expires_at: integer('expires_at').notNull(),
});

export const sync_states = sqliteTable('sync_states', {
  user_id: integer('user_id').primaryKey().references(() => users.id),
  state: text('state').notNull(), // JSON-serialized SyncState
  started_at: integer('started_at'),
  completed_at: integer('completed_at'),
});

export const profile_snapshots = sqliteTable('profile_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  genre_scores: text('genre_scores'), // JSON
  tag_scores: text('tag_scores'), // JSON
  total_games: integer('total_games').default(0),
  total_playtime_hours: integer('total_playtime_hours').default(0),
  created_at: integer('created_at').default(sql`(unixepoch())`),
}, (table) => [
  index('profile_snapshots_user_idx').on(table.user_id),
]);

export const ai_summary_history = sqliteTable('ai_summary_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  summary: text('summary').notNull(),
  created_at: integer('created_at').default(sql`(unixepoch())`),
}, (table) => [
  index('ai_summary_history_user_idx').on(table.user_id),
]);

export const backlog_order = sqliteTable('backlog_order', {
  user_id: integer('user_id').references(() => users.id).notNull(),
  game_id: integer('game_id').references(() => games.id).notNull(),
  position: integer('position').notNull(),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.game_id] }),
]);

// ── Phase 4 tables ──────────────────────────────────────────────────────────

export const collections = sqliteTable('collections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#8b5cf6'),
  icon: text('icon').default('fa-folder'),
  created_at: integer('created_at').default(sql`(unixepoch())`),
}, (table) => [
  index('collections_user_idx').on(table.user_id),
]);

export const collection_games = sqliteTable('collection_games', {
  collection_id: integer('collection_id').references(() => collections.id).notNull(),
  game_id: integer('game_id').references(() => games.id).notNull(),
  added_at: integer('added_at').default(sql`(unixepoch())`),
}, (table) => [
  primaryKey({ columns: [table.collection_id, table.game_id] }),
]);

export const game_notes = sqliteTable('game_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  game_id: integer('game_id').references(() => games.id).notNull(),
  content: text('content').notNull(),
  updated_at: integer('updated_at').default(sql`(unixepoch())`),
}, (table) => [
  uniqueIndex('game_notes_user_game_idx').on(table.user_id, table.game_id),
]);

export const game_status = sqliteTable('game_status', {
  user_id: integer('user_id').references(() => users.id).notNull(),
  game_id: integer('game_id').references(() => games.id).notNull(),
  status: text('status').notNull(), // 'playing' | 'completed' | 'abandoned' | 'plan_to_play'
  started_at: integer('started_at'),
  completed_at: integer('completed_at'),
  updated_at: integer('updated_at').default(sql`(unixepoch())`),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.game_id] }),
]);

export const user_settings = sqliteTable('user_settings', {
  user_id: integer('user_id').primaryKey().references(() => users.id),
  theme: text('theme').default('dark'), // 'dark' | 'light'
  backup_dir: text('backup_dir'),
  backup_interval_hours: integer('backup_interval_hours').default(24),
  last_backup_at: integer('last_backup_at'),
  ollama_url: text('ollama_url'),
  ollama_model: text('ollama_model'),
  cache_ttl_seconds: integer('cache_ttl_seconds'),
  language: text('language').default('en'),
  keyboard_shortcuts: text('keyboard_shortcuts'), // JSON
  updated_at: integer('updated_at').default(sql`(unixepoch())`),
});

export const chat_messages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  created_at: integer('created_at').default(sql`(unixepoch())`),
}, (table) => [
  index('chat_messages_user_idx').on(table.user_id),
]);

export const auto_categories = sqliteTable('auto_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  game_id: integer('game_id').references(() => games.id).notNull(),
  category: text('category').notNull(),
  confidence: real('confidence'),
  categorized_at: integer('categorized_at').default(sql`(unixepoch())`),
}, (table) => [
  uniqueIndex('auto_cat_user_game_idx').on(table.user_id, table.game_id),
  index('auto_cat_user_idx').on(table.user_id),
]);

export const price_alerts = sqliteTable('price_alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  game_id: integer('game_id').references(() => games.id).notNull(),
  target_price_cents: integer('target_price_cents'),
  current_price_cents: integer('current_price_cents'),
  last_checked: integer('last_checked'),
  alerted: integer('alerted').default(0),
  created_at: integer('created_at').default(sql`(unixepoch())`),
}, (table) => [
  uniqueIndex('price_alert_user_game_idx').on(table.user_id, table.game_id),
  index('price_alerts_user_idx').on(table.user_id),
]);

export const publisher_blacklist = sqliteTable('publisher_blacklist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(), // publisher or developer name
  type: text('type').default('publisher'), // 'publisher' | 'developer'
  created_at: integer('created_at').default(sql`(unixepoch())`),
}, (table) => [
  uniqueIndex('blacklist_user_name_idx').on(table.user_id, table.name),
]);
