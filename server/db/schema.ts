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
