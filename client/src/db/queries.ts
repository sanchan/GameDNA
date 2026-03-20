// Consolidated DB operations for client-side SQLite.
// Every write calls persistDb().

import { getDb, persistDb } from './index';
import { encryptApiKey, decryptApiKey, getDevicePassphrase, getLegacyDevicePassphrase } from './crypto';
import type {
  Game, User, TasteProfile, Recommendation, GamingDNA, SwipeDecision,
  Collection, GameNote, GameStatusType, GameStatusEntry, UserSettings,
  ChatMessage, AutoCategory, PriceAlert, PublisherBlacklist,
  DashboardStats, ProfileSnapshot, AiSummaryEntry, DiscoveryFilters,
  DiscoveryMode,
} from '../../../shared/types';
import { config } from '../services/config';
import { DEFAULT_BLACKLISTED_TAGS, getBlacklistedTagsSet } from '../services/tag-filter';

// ── Helpers ─────────────────────────────────────────────────────────────────

function run(sql: string, params?: unknown[]): void {
  getDb().run(sql, params as any[]);
  persistDb();
}

function get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined {
  const stmt = getDb().prepare(sql);
  if (params) stmt.bind(params as any[]);
  const result = stmt.step() ? (stmt.getAsObject() as T) : undefined;
  stmt.free();
  return result;
}

function all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
  const results: T[] = [];
  const stmt = getDb().prepare(sql);
  if (params) stmt.bind(params as any[]);
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function parseJson<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string' || !val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function weightedMatch(gameItems: string[], profileMap: Map<string, number>): number {
  if (profileMap.size === 0) return 0;
  let matched = 0;
  for (const item of gameItems) {
    const score = profileMap.get(item.toLowerCase());
    if (score !== undefined && score > 0) matched += score;
  }
  const totalWeight = Array.from(profileMap.values()).reduce((s, v) => s + Math.max(v, 0), 0);
  return totalWeight > 0 ? matched / totalWeight : 0;
}

function dbGameToGame(row: Record<string, unknown>): Game {
  return {
    id: row.id as number,
    name: row.name as string,
    shortDesc: (row.short_desc as string) ?? null,
    headerImage: (row.header_image as string) ?? null,
    genres: parseJson<string[]>(row.genres, []),
    tags: parseJson<string[]>(row.tags, []),
    releaseDate: (row.release_date as string) ?? null,
    priceCents: (row.price_cents as number) ?? null,
    priceCurrency: (row.price_currency as string) ?? null,
    reviewScore: (row.review_score as number) ?? null,
    reviewCount: (row.review_count as number) ?? null,
    developers: parseJson<string[]>(row.developers, []),
    publishers: parseJson<string[]>(row.publishers, []),
    platforms: parseJson(row.platforms, { windows: false, mac: false, linux: false }),
    screenshots: parseJson<{ thumbnail: string; full: string }[]>(row.screenshots, []),
    movies: parseJson<{ thumbnail: string; webm480: string; webmMax: string }[]>(row.movies, []),
  };
}

// ── Local Config ────────────────────────────────────────────────────────────

export interface LocalConfig {
  steamId: string | null;
  steamApiKey: string | null; // decrypted
  displayName: string | null;
  customDisplayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  countryCode: string | null;
  aiProvider: 'ollama' | 'webllm';
  ollamaUrl: string;
  ollamaModel: string;
  webllmModel: string;
  setupComplete: boolean;
}

export async function getLocalConfig(): Promise<LocalConfig> {
  const row = get<Record<string, unknown>>('SELECT * FROM local_config WHERE id = 1');
  if (!row) {
    return {
      steamId: null, steamApiKey: null, displayName: null, customDisplayName: null, avatarUrl: null,
      profileUrl: null, countryCode: null,
      aiProvider: 'webllm', ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.1:8b', webllmModel: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      setupComplete: false,
    };
  }

  let steamApiKey: string | null = null;
  if (row.steam_api_key_encrypted && row.steam_api_key_iv && row.steam_api_key_salt) {
    const encrypted = row.steam_api_key_encrypted as string;
    const iv = row.steam_api_key_iv as string;
    const salt = row.steam_api_key_salt as string;

    // Try current passphrase first
    try {
      steamApiKey = await decryptApiKey(encrypted, iv, salt, getDevicePassphrase());
    } catch {
      // Try legacy passphrase (included userAgent which changes on browser updates)
      try {
        steamApiKey = await decryptApiKey(encrypted, iv, salt, getLegacyDevicePassphrase());
        // Re-encrypt with stable passphrase so future loads succeed
        const reEncrypted = await encryptApiKey(steamApiKey, getDevicePassphrase());
        getDb().run(
          'UPDATE local_config SET steam_api_key_encrypted = ?, steam_api_key_iv = ?, steam_api_key_salt = ? WHERE id = 1',
          [reEncrypted.encrypted, reEncrypted.iv, reEncrypted.salt] as any[],
        );
        persistDb();
        console.info('[config] Migrated API key to stable passphrase');
      } catch {
        console.warn('[config] Failed to decrypt API key — please re-enter it in Settings');
      }
    }
  }

  return {
    steamId: (row.steam_id as string) ?? null,
    steamApiKey,
    displayName: (row.display_name as string) ?? null,
    customDisplayName: (row.custom_display_name as string) ?? null,
    avatarUrl: (row.avatar_url as string) ?? null,
    profileUrl: (row.profile_url as string) ?? null,
    countryCode: (row.country_code as string) ?? null,
    aiProvider: (row.ai_provider as 'ollama' | 'webllm') ?? 'webllm',
    ollamaUrl: (row.ollama_url as string) ?? 'http://localhost:11434',
    ollamaModel: (row.ollama_model as string) ?? 'llama3.1:8b',
    webllmModel: (row.webllm_model as string) ?? 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    setupComplete: !!(row.setup_complete),
  };
}

export async function saveLocalConfig(updates: Partial<{
  steamId: string;
  steamApiKey: string;
  displayName: string;
  customDisplayName: string | null;
  avatarUrl: string;
  profileUrl: string;
  countryCode: string;
  aiProvider: string;
  ollamaUrl: string;
  ollamaModel: string;
  webllmModel: string;
  setupComplete: boolean;
}>): Promise<void> {
  const existing = get('SELECT id FROM local_config WHERE id = 1');

  let encFields: { encrypted?: string; iv?: string; salt?: string } = {};
  if (updates.steamApiKey !== undefined) {
    const result = await encryptApiKey(updates.steamApiKey, getDevicePassphrase());
    encFields = { encrypted: result.encrypted, iv: result.iv, salt: result.salt };
  }

  if (!existing) {
    getDb().run(`INSERT INTO local_config (id, steam_id, steam_api_key_encrypted, steam_api_key_iv, steam_api_key_salt,
      display_name, avatar_url, profile_url, country_code, ai_provider, ollama_url, ollama_model, webllm_model,
      setup_complete, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      updates.steamId ?? null,
      encFields.encrypted ?? null, encFields.iv ?? null, encFields.salt ?? null,
      updates.displayName ?? null, updates.avatarUrl ?? null, updates.profileUrl ?? null,
      updates.countryCode ?? null, updates.aiProvider ?? 'webllm',
      updates.ollamaUrl ?? 'http://localhost:11434', updates.ollamaModel ?? 'llama3.1:8b',
      updates.webllmModel ?? 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      updates.setupComplete ? 1 : 0, nowUnix(),
    ] as any[]);
  } else {
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (updates.steamId !== undefined) { sets.push('steam_id = ?'); vals.push(updates.steamId); }
    if (updates.steamApiKey !== undefined) {
      sets.push('steam_api_key_encrypted = ?, steam_api_key_iv = ?, steam_api_key_salt = ?');
      vals.push(encFields.encrypted, encFields.iv, encFields.salt);
    }
    if (updates.displayName !== undefined) { sets.push('display_name = ?'); vals.push(updates.displayName); }
    if (updates.customDisplayName !== undefined) { sets.push('custom_display_name = ?'); vals.push(updates.customDisplayName); }
    if (updates.avatarUrl !== undefined) { sets.push('avatar_url = ?'); vals.push(updates.avatarUrl); }
    if (updates.profileUrl !== undefined) { sets.push('profile_url = ?'); vals.push(updates.profileUrl); }
    if (updates.countryCode !== undefined) { sets.push('country_code = ?'); vals.push(updates.countryCode); }
    if (updates.aiProvider !== undefined) { sets.push('ai_provider = ?'); vals.push(updates.aiProvider); }
    if (updates.ollamaUrl !== undefined) { sets.push('ollama_url = ?'); vals.push(updates.ollamaUrl); }
    if (updates.ollamaModel !== undefined) { sets.push('ollama_model = ?'); vals.push(updates.ollamaModel); }
    if (updates.webllmModel !== undefined) { sets.push('webllm_model = ?'); vals.push(updates.webllmModel); }
    if (updates.setupComplete !== undefined) { sets.push('setup_complete = ?'); vals.push(updates.setupComplete ? 1 : 0); }

    sets.push('updated_at = ?');
    vals.push(nowUnix());
    vals.push(1); // WHERE id = 1

    getDb().run(`UPDATE local_config SET ${sets.join(', ')} WHERE id = ?`, vals as any[]);
  }

  persistDb();
}

/** Update only AI-related config fields. */
export function updateConfig(updates: {
  aiProvider?: string | null;
  ollamaUrl?: string | null;
  ollamaModel?: string | null;
  webllmModel?: string | null;
}): void {
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (updates.aiProvider !== undefined) { sets.push('ai_provider = ?'); vals.push(updates.aiProvider); }
  if (updates.ollamaUrl !== undefined) { sets.push('ollama_url = ?'); vals.push(updates.ollamaUrl); }
  if (updates.ollamaModel !== undefined) { sets.push('ollama_model = ?'); vals.push(updates.ollamaModel); }
  if (updates.webllmModel !== undefined) { sets.push('webllm_model = ?'); vals.push(updates.webllmModel); }

  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  vals.push(nowUnix());
  vals.push(1); // WHERE id = 1

  getDb().run(`UPDATE local_config SET ${sets.join(', ')} WHERE id = ?`, vals as any[]);
  persistDb();
}

// ── User Management ─────────────────────────────────────────────────────────

/** Ensure a user row exists for the configured steam_id; return userId. */
export function ensureUser(steamId: string, displayName?: string, avatarUrl?: string, profileUrl?: string, countryCode?: string): number {
  const existing = get<{ id: number }>('SELECT id FROM users WHERE steam_id = ?', [steamId]);
  if (existing) {
    if (displayName || avatarUrl) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (displayName) { sets.push('display_name = ?'); vals.push(displayName); }
      if (avatarUrl) { sets.push('avatar_url = ?'); vals.push(avatarUrl); }
      if (profileUrl) { sets.push('profile_url = ?'); vals.push(profileUrl); }
      if (countryCode) { sets.push('country_code = ?'); vals.push(countryCode); }
      sets.push('last_login = ?'); vals.push(nowUnix());
      vals.push(existing.id);
      getDb().run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals as any[]);
      persistDb();
    }
    return existing.id;
  }

  getDb().run(
    'INSERT INTO users (steam_id, display_name, avatar_url, profile_url, country_code, last_login, blacklisted_tags) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [steamId, displayName ?? null, avatarUrl ?? null, profileUrl ?? null, countryCode ?? null, nowUnix(), JSON.stringify(DEFAULT_BLACKLISTED_TAGS)] as any[],
  );
  persistDb();
  const row = get<{ id: number }>('SELECT id FROM users WHERE steam_id = ?', [steamId]);
  return row!.id;
}

export function getUser(userId: number): User | null {
  const row = get<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [userId]);
  if (!row) return null;
  const configRow = get<Record<string, unknown>>('SELECT custom_display_name FROM local_config WHERE id = 1');
  const customName = configRow?.custom_display_name as string | undefined;
  return {
    id: row.id as number,
    steamId: row.steam_id as string,
    displayName: customName || ((row.display_name as string) ?? null),
    avatarUrl: (row.avatar_url as string) ?? null,
    profileUrl: (row.profile_url as string) ?? null,
  };
}

// ── Games ───────────────────────────────────────────────────────────────────

export function upsertGame(game: { id: number; name: string; [key: string]: unknown }): void {
  const now = nowUnix();
  getDb().run(
    `INSERT INTO games (id, name, short_desc, header_image, genres, tags, release_date, price_cents, price_currency, review_score, review_count, developers, publishers, platforms, screenshots, movies, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, short_desc=excluded.short_desc, header_image=excluded.header_image,
       genres=excluded.genres, tags=excluded.tags, release_date=excluded.release_date,
       price_cents=excluded.price_cents, price_currency=excluded.price_currency,
       review_score=excluded.review_score, review_count=excluded.review_count,
       developers=excluded.developers, publishers=excluded.publishers,
       platforms=excluded.platforms, screenshots=excluded.screenshots,
       movies=excluded.movies, cached_at=excluded.cached_at`,
    [
      game.id, game.name,
      (game.short_desc ?? game.short_description ?? null) as any,
      (game.header_image ?? null) as any,
      typeof game.genres === 'string' ? game.genres : JSON.stringify(game.genres ?? []),
      typeof game.tags === 'string' ? game.tags : JSON.stringify(game.tags ?? []),
      (game.release_date ?? null) as any,
      (game.price_cents ?? null) as any,
      (game.price_currency ?? null) as any,
      (game.review_score ?? game.metacritic_score ?? null) as any,
      (game.review_count ?? null) as any,
      typeof game.developers === 'string' ? game.developers : JSON.stringify(game.developers ?? []),
      typeof game.publishers === 'string' ? game.publishers : JSON.stringify(game.publishers ?? []),
      typeof game.platforms === 'string' ? game.platforms : JSON.stringify(game.platforms ?? {}),
      typeof game.screenshots === 'string' ? game.screenshots : JSON.stringify(game.screenshots ?? []),
      typeof game.movies === 'string' ? game.movies : JSON.stringify(game.movies ?? []),
      now,
    ] as any[],
  );
  persistDb();
}

export function upsertGameStub(appid: number, name: string): void {
  getDb().run(
    'INSERT INTO games (id, name, cached_at) VALUES (?, ?, 0) ON CONFLICT(id) DO NOTHING',
    [appid, name] as any[],
  );
  // Don't persist here — bulk inserts will persist after batch
}

export function getGame(appid: number): Game | null {
  const row = get<Record<string, unknown>>('SELECT * FROM games WHERE id = ?', [appid]);
  return row ? dbGameToGame(row) : null;
}

export function getGameRaw(appid: number): Record<string, unknown> | undefined {
  return get('SELECT * FROM games WHERE id = ?', [appid]);
}

export function isCacheFresh(appid: number): boolean {
  const row = get<{ cached_at: number }>('SELECT cached_at FROM games WHERE id = ?', [appid]);
  if (!row || !row.cached_at) return false;
  return nowUnix() - row.cached_at < config.cacheTtlSeconds;
}

export function getAllCachedGameIds(): number[] {
  const rows = all<{ id: number }>('SELECT id FROM games WHERE cached_at > 0');
  return rows.map((r) => r.id);
}

export function getStaleAppIds(appids: number[]): number[] {
  if (appids.length === 0) return [];
  const threshold = nowUnix() - config.cacheTtlSeconds;
  const freshIds = new Set<number>();

  // Process in chunks for SQLite variable limits
  for (let i = 0; i < appids.length; i += config.sqlChunkSize) {
    const chunk = appids.slice(i, i + config.sqlChunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = all<{ id: number }>(
      `SELECT id FROM games WHERE id IN (${placeholders}) AND cached_at > ?`,
      [...chunk, threshold],
    );
    for (const r of rows) freshIds.add(r.id);
  }

  return appids.filter((id) => !freshIds.has(id));
}

export function searchGames(query: string, limit = 20): Game[] {
  const rows = all<Record<string, unknown>>(
    'SELECT * FROM games WHERE name LIKE ? ORDER BY review_count DESC LIMIT ?',
    [`%${query}%`, limit],
  );
  return rows.map(dbGameToGame);
}

// ── User Games ──────────────────────────────────────────────────────────────

export function upsertUserGame(userId: number, gameId: number, playtimeMins: number, lastPlayed?: number | null, fromWishlist?: boolean): void {
  getDb().run(
    `INSERT INTO user_games (user_id, game_id, playtime_mins, last_played, from_wishlist, synced_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, game_id) DO UPDATE SET
       playtime_mins=excluded.playtime_mins, last_played=excluded.last_played,
       from_wishlist=excluded.from_wishlist, synced_at=excluded.synced_at`,
    [userId, gameId, playtimeMins, lastPlayed ?? null, fromWishlist ? 1 : 0, nowUnix()] as any[],
  );
  // Don't persist here — bulk inserts will persist after batch
}

export function getUserGameIds(userId: number): number[] {
  return all<{ game_id: number }>('SELECT game_id FROM user_games WHERE user_id = ?', [userId])
    .map((r) => r.game_id);
}

export function getUserGamesCount(userId: number): number {
  const row = get<{ c: number }>('SELECT count(*) as c FROM user_games WHERE user_id = ?', [userId]);
  return row?.c ?? 0;
}

// ── Swipe History ───────────────────────────────────────────────────────────

export function recordSwipe(userId: number, gameId: number, decision: SwipeDecision): void {
  const existing = get<{ id: number; decision: string }>('SELECT id, decision FROM swipe_history WHERE user_id = ? AND game_id = ?', [userId, gameId]);
  if (existing) {
    run('UPDATE swipe_history SET decision = ?, swiped_at = ? WHERE id = ?', [decision, nowUnix(), existing.id]);
  } else {
    run('INSERT INTO swipe_history (user_id, game_id, decision, swiped_at) VALUES (?, ?, ?, ?)', [userId, gameId, decision, nowUnix()]);
  }
}

export function importSwipe(userId: number, gameId: number, decision: SwipeDecision, swipedAt: number): boolean {
  const existing = get<{ id: number; decision: string; swiped_at: number }>(
    'SELECT id, decision, swiped_at FROM swipe_history WHERE user_id = ? AND game_id = ?',
    [userId, gameId],
  );
  if (existing) {
    if (swipedAt > existing.swiped_at) {
      run('UPDATE swipe_history SET decision = ?, swiped_at = ? WHERE id = ?', [decision, swipedAt, existing.id]);
      return true;
    }
    return false;
  }
  run('INSERT INTO swipe_history (user_id, game_id, decision, swiped_at) VALUES (?, ?, ?, ?)', [userId, gameId, decision, swipedAt]);
  return true;
}

export function undoLastSwipe(userId: number): { gameId: number; decision: string; game: Game | null } | null {
  const last = get<{ id: number; game_id: number; decision: string }>(
    'SELECT id, game_id, decision FROM swipe_history WHERE user_id = ? ORDER BY swiped_at DESC LIMIT 1',
    [userId],
  );
  if (!last) return null;

  const game = getGame(last.game_id);
  run('DELETE FROM swipe_history WHERE id = ?', [last.id]);
  return { gameId: last.game_id, decision: last.decision, game };
}

export function getSwipedIds(userId: number): number[] {
  return all<{ game_id: number }>('SELECT game_id FROM swipe_history WHERE user_id = ?', [userId])
    .map((r) => r.game_id);
}

export function getSwipedNoIds(userId: number): number[] {
  return all<{ game_id: number }>(
    "SELECT game_id FROM swipe_history WHERE user_id = ? AND decision = 'no'",
    [userId],
  ).map((r) => r.game_id);
}

export function getSwipeHistory(userId: number, opts?: { limit?: number; offset?: number; decision?: string; search?: string }) {
  let sql = `SELECT sh.id, sh.game_id, sh.decision, sh.swiped_at, g.id as gid, g.name, g.header_image, g.genres, g.tags, g.review_score, g.price_cents, g.price_currency, g.developers, g.publishers, g.platforms, g.short_desc, g.release_date, g.review_count
    FROM swipe_history sh
    INNER JOIN games g ON sh.game_id = g.id
    WHERE sh.user_id = ?`;
  const params: unknown[] = [userId];

  if (opts?.decision) {
    sql += ' AND sh.decision = ?';
    params.push(opts.decision);
  }
  if (opts?.search) {
    sql += ' AND g.name LIKE ?';
    params.push(`%${opts.search}%`);
  }

  sql += ' ORDER BY sh.swiped_at DESC';

  if (opts?.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
    if (opts?.offset) {
      sql += ' OFFSET ?';
      params.push(opts.offset);
    }
  }

  return all<Record<string, unknown>>(sql, params).map((row) => ({
    id: row.id as number,
    gameId: row.game_id as number,
    decision: row.decision as string,
    swipedAt: row.swiped_at as number,
    game: dbGameToGame({ ...row, id: row.gid }),
  }));
}

export function updateSwipeDecision(swipeId: number, userId: number, decision: SwipeDecision): boolean {
  run('UPDATE swipe_history SET decision = ?, swiped_at = ? WHERE id = ? AND user_id = ?',
    [decision, nowUnix(), swipeId, userId]);
  return true;
}

export function deleteSwipe(swipeId: number, userId: number): boolean {
  run('DELETE FROM swipe_history WHERE id = ? AND user_id = ?', [swipeId, userId]);
  return true;
}

export function getSwipeStats(userId: number) {
  const yes = get<{ c: number }>("SELECT count(*) as c FROM swipe_history WHERE user_id = ? AND decision = 'yes'", [userId]);
  const no = get<{ c: number }>("SELECT count(*) as c FROM swipe_history WHERE user_id = ? AND decision = 'no'", [userId]);
  const maybe = get<{ c: number }>("SELECT count(*) as c FROM swipe_history WHERE user_id = ? AND decision = 'maybe'", [userId]);
  return { yes: yes?.c ?? 0, no: no?.c ?? 0, maybe: maybe?.c ?? 0 };
}

// ── Taste Profile ───────────────────────────────────────────────────────────

export function getTasteProfile(userId: number): TasteProfile | null {
  const row = get<Record<string, unknown>>('SELECT * FROM taste_profiles WHERE user_id = ?', [userId]);
  if (!row) return null;
  return {
    genreScores: parseJson(row.genre_scores, {}),
    tagScores: parseJson(row.tag_scores, {}),
    pricePref: parseJson(row.price_pref, { min: 0, max: 6000, avg: 1500 }),
    playtimePref: parseJson(row.playtime_pref, { avgHours: 20, preferLong: false }),
    aiSummary: (row.ai_summary as string) ?? null,
  };
}

export function upsertTasteProfile(userId: number, genreScores: Record<string, number>, tagScores: Record<string, number>, pricePref: unknown, playtimePref: unknown): void {
  run(
    `INSERT INTO taste_profiles (user_id, genre_scores, tag_scores, price_pref, playtime_pref, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       genre_scores=excluded.genre_scores, tag_scores=excluded.tag_scores,
       price_pref=excluded.price_pref, playtime_pref=excluded.playtime_pref, updated_at=excluded.updated_at`,
    [userId, JSON.stringify(genreScores), JSON.stringify(tagScores), JSON.stringify(pricePref), JSON.stringify(playtimePref), nowUnix()],
  );
}

export function getLastExpansionAt(userId: number): number {
  const row = get<{ last_expansion_at: number }>('SELECT last_expansion_at FROM taste_profiles WHERE user_id = ?', [userId]);
  return row?.last_expansion_at ?? 0;
}

export function setLastExpansionAt(userId: number, timestamp: number): void {
  run('UPDATE taste_profiles SET last_expansion_at = ? WHERE user_id = ?', [timestamp, userId]);
}

// ── Discovery Queue ─────────────────────────────────────────────────────────

export function getDiscoveryQueue(userId: number, filters: DiscoveryFilters, mode: DiscoveryMode = 'default', maxHours?: number): Array<{ game: Game; score: number }> {
  const swipedIds = getSwipedIds(userId);
  const ownedIds = getUserGameIds(userId);
  const excludeIds = [...new Set([...swipedIds, ...ownedIds])];

  let sql = 'SELECT * FROM games WHERE 1=1';
  const params: unknown[] = [];

  if (excludeIds.length > 0) {
    const placeholders = excludeIds.map(() => '?').join(',');
    sql += ` AND id NOT IN (${placeholders})`;
    params.push(...excludeIds);
  }

  if (filters.minPrice !== undefined) { sql += ' AND price_cents >= ?'; params.push(filters.minPrice); }
  if (filters.maxPrice !== undefined) { sql += ' AND price_cents <= ?'; params.push(filters.maxPrice); }
  if (filters.minReviewScore !== undefined) { sql += ' AND review_score >= ?'; params.push(filters.minReviewScore); }
  if (filters.genres?.length) {
    for (const g of filters.genres) {
      sql += ' AND LOWER(genres) LIKE ?';
      params.push(`%${g.toLowerCase()}%`);
    }
  }

  if (mode === 'hidden_gems') {
    sql += ' AND review_score >= 80 AND review_count <= 5000';
  } else if (mode === 'new_releases') {
    const yr = new Date().getFullYear() - 1;
    sql += ' AND release_date >= ?';
    params.push(yr.toString());
  }

  const profile = getTasteProfile(userId);
  const hasProfile = profile && (Object.keys(profile.genreScores).length > 0 || Object.keys(profile.tagScores).length > 0);

  if (hasProfile) {
    sql += ' AND cached_at > 0';  // exclude stubs with no genre/tag data
  } else {
    sql += ' ORDER BY review_count DESC, review_score DESC LIMIT 10';
  }

  const rows = all<Record<string, unknown>>(sql, params);

  // Get tag blacklist for filtering (applies even without taste profile)
  const tagBlacklist = getBlacklistedTagsSet(getBlacklistedTags(userId));

  // Get publisher/developer blacklist
  const blacklistedPubs = new Set(
    all<{ name: string }>("SELECT name FROM publisher_blacklist WHERE user_id = ? AND type = 'publisher'", [userId])
      .map((r) => r.name.toLowerCase()),
  );
  const blacklistedDevs = new Set(
    all<{ name: string }>("SELECT name FROM publisher_blacklist WHERE user_id = ? AND type = 'developer'", [userId])
      .map((r) => r.name.toLowerCase()),
  );

  // When user explicitly selects tags in filters, don't blacklist-filter those tags
  const explicitTags = filters.tags?.length ? new Set(filters.tags.map((t) => t.toLowerCase())) : null;

  // Filter by blacklists (applies even without taste profile)
  const filtered = rows.filter((row) => {
    const pubs = parseJson<string[]>(row.publishers, []);
    const devs = parseJson<string[]>(row.developers, []);
    if (pubs.some((p) => blacklistedPubs.has(p.toLowerCase()))) return false;
    if (devs.some((d) => blacklistedDevs.has(d.toLowerCase()))) return false;

    // Exclude games that have any blacklisted tag (unless user explicitly chose those tags)
    const gameTags = parseJson<string[]>(row.tags, []);
    if (gameTags.some((t) => {
      const lower = t.toLowerCase();
      return tagBlacklist.has(lower) && (!explicitTags || !explicitTags.has(lower));
    })) return false;

    if (maxHours) {
      const gameGenres = parseJson<string[]>(row.genres, []);
      const estHours = gameGenres.reduce<number>((min, g) => {
        const est = (config.estimatedPlaytimeByGenre as Record<string, number>)[g.toLowerCase()];
        return est ? Math.min(min, est) : min;
      }, config.estimatedPlaytimeDefault);
      if (estHours > maxHours) return false;
    }
    return true;
  });

  if (!hasProfile) {
    return filtered.map((r) => ({ game: dbGameToGame(r), score: 0 }));
  }

  const genreMap = new Map(
    Object.entries(profile!.genreScores)
      .filter(([, s]) => s > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, config.recTopGenresCount)
      .map(([name, score]) => [name.toLowerCase(), score] as [string, number]),
  );
  const tagMap = new Map(
    Object.entries(profile!.tagScores)
      .filter(([, s]) => s > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, config.recTopTagsCount)
      .map(([name, score]) => [name.toLowerCase(), score] as [string, number]),
  );

  const scored = filtered
    .map((row) => {
      const gameGenres = parseJson<string[]>(row.genres, []);
      const gameTags = parseJson<string[]>(row.tags, []);

      let genreMatch = weightedMatch(gameGenres, genreMap);
      const tagMatch = weightedMatch(gameTags, tagMap);
      const reviewNorm = ((row.review_score as number) ?? 50) / 100;

      let recency = 0.5;
      if (row.release_date) {
        const releaseYear = parseInt((row.release_date as string).slice(0, 4));
        if (!isNaN(releaseYear)) {
          recency = Math.max(0, 1 - (new Date().getFullYear() - releaseYear) / 10);
        }
      }

      if (mode === 'contrarian') genreMatch = 1 - genreMatch;
      else if (mode === 'genre_deep_dive' && filters.genres?.length) genreMatch *= 2;

      const score = 0.4 * genreMatch + 0.3 * tagMatch + 0.2 * reviewNorm + 0.1 * recency;
      return { game: dbGameToGame(row), score };
    });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 30);
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.max(0, i - Math.floor(Math.random() * 5));
    [top[i], top[j]] = [top[j], top[i]];
  }

  return top.slice(0, 10);
}

// ── Recommendations ─────────────────────────────────────────────────────────

export function getRecommendations(userId: number, opts?: { limit?: number; offset?: number; minPrice?: number; maxPrice?: number; genres?: string[] }) {
  let sql = `SELECT r.id, r.score, r.ai_explanation, r.generated_at, r.source,
    g.id as game_id, g.name, g.short_desc, g.header_image, g.genres, g.tags,
    g.release_date, g.price_cents, g.price_currency, g.review_score, g.review_count,
    g.developers, g.publishers, g.platforms
    FROM recommendations r
    INNER JOIN games g ON r.game_id = g.id
    WHERE r.user_id = ? AND r.dismissed = 0`;
  const params: unknown[] = [userId];

  if (opts?.minPrice !== undefined) { sql += ' AND g.price_cents >= ?'; params.push(opts.minPrice); }
  if (opts?.maxPrice !== undefined) { sql += ' AND g.price_cents <= ?'; params.push(opts.maxPrice); }
  if (opts?.genres?.length) {
    for (const g of opts.genres) {
      sql += ' AND LOWER(g.genres) LIKE ?';
      params.push(`%${g.toLowerCase()}%`);
    }
  }

  sql += ' ORDER BY r.score DESC';
  const limit = opts?.limit ?? 20;
  sql += ' LIMIT ?';
  params.push(limit);
  if (opts?.offset) { sql += ' OFFSET ?'; params.push(opts.offset); }

  return all<Record<string, unknown>>(sql, params).map((row) => ({
    id: row.id as number,
    game: dbGameToGame({ ...row, id: row.game_id }),
    score: row.score as number,
    aiExplanation: (row.ai_explanation as string) ?? null,
    generatedAt: row.generated_at as number,
    source: (row.source as string) ?? 'heuristic',
    scoreBreakdown: (row.score_breakdown as string) ?? null,
    heuristicScore: (row.heuristic_score as number) ?? null,
  }));
}

export function upsertRecommendation(userId: number, gameId: number, score: number, explanation: string, source: 'ai' | 'heuristic', scoreBreakdown?: string, heuristicScore?: number): void {
  getDb().run(
    `INSERT INTO recommendations (user_id, game_id, score, ai_explanation, generated_at, dismissed, source, score_breakdown, heuristic_score)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(user_id, game_id) DO UPDATE SET
       score=excluded.score, ai_explanation=excluded.ai_explanation,
       generated_at=excluded.generated_at, dismissed=0, source=excluded.source,
       score_breakdown=excluded.score_breakdown, heuristic_score=excluded.heuristic_score`,
    [userId, gameId, score, explanation || null, nowUnix(), source, scoreBreakdown || null, heuristicScore ?? null] as any[],
  );
}

export function updateRecommendationExplanation(recId: number, userId: number, explanation: string): void {
  run('UPDATE recommendations SET ai_explanation = ? WHERE id = ? AND user_id = ?', [explanation, recId, userId]);
}

export function dismissRecommendation(recId: number, userId: number): void {
  run('UPDATE recommendations SET dismissed = 1 WHERE id = ? AND user_id = ?', [recId, userId]);
}

export function clearDismissedRecommendations(userId: number): void {
  run('DELETE FROM recommendations WHERE user_id = ? AND dismissed = 1', [userId]);
}

export function getUndismissedRecIds(userId: number): number[] {
  return all<{ game_id: number }>(
    'SELECT game_id FROM recommendations WHERE user_id = ? AND dismissed = 0',
    [userId],
  ).map((r) => r.game_id);
}

// ── Bookmarks ───────────────────────────────────────────────────────────────

export function getBookmarkIds(userId: number): number[] {
  return all<{ game_id: number }>('SELECT game_id FROM bookmarks WHERE user_id = ?', [userId])
    .map((r) => r.game_id);
}

export function addBookmark(userId: number, gameId: number): void {
  run('INSERT INTO bookmarks (user_id, game_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [userId, gameId]);
}

export function removeBookmark(userId: number, gameId: number): void {
  run('DELETE FROM bookmarks WHERE user_id = ? AND game_id = ?', [userId, gameId]);
}

export function getBookmarkedGames(userId: number): Game[] {
  const rows = all<Record<string, unknown>>(
    `SELECT g.* FROM bookmarks b INNER JOIN games g ON b.game_id = g.id WHERE b.user_id = ? ORDER BY b.created_at DESC`,
    [userId],
  );
  return rows.map(dbGameToGame);
}

// ── Backlog ─────────────────────────────────────────────────────────────────

export function getBacklog(userId: number) {
  const rows = all<Record<string, unknown>>(
    `SELECT ug.playtime_mins, ug.last_played, g.*, bo.position
     FROM user_games ug
     INNER JOIN games g ON ug.game_id = g.id
     LEFT JOIN backlog_order bo ON bo.user_id = ug.user_id AND bo.game_id = ug.game_id
     WHERE ug.user_id = ? AND ug.playtime_mins < 120 AND ug.from_wishlist = 0
     ORDER BY bo.position ASC NULLS LAST, ug.last_played DESC`,
    [userId],
  );
  return rows.map((r) => ({
    game: dbGameToGame(r),
    playtimeMins: (r.playtime_mins as number) ?? 0,
    lastPlayed: (r.last_played as number) ?? null,
    position: (r.position as number) ?? null,
  }));
}

export function reorderBacklog(userId: number, gameIds: number[]): void {
  getDb().run('DELETE FROM backlog_order WHERE user_id = ?', [userId] as any[]);
  for (let i = 0; i < gameIds.length; i++) {
    getDb().run('INSERT INTO backlog_order (user_id, game_id, position) VALUES (?, ?, ?)', [userId, gameIds[i], i] as any[]);
  }
  persistDb();
}

// ── Collections ─────────────────────────────────────────────────────────────

export function getCollections(userId: number): Collection[] {
  return all<Record<string, unknown>>(
    `SELECT c.*, (SELECT count(*) FROM collection_games cg WHERE cg.collection_id = c.id) as game_count
     FROM collections c WHERE c.user_id = ? ORDER BY c.created_at DESC`,
    [userId],
  ).map((r) => ({
    id: r.id as number,
    name: r.name as string,
    description: (r.description as string) ?? null,
    color: (r.color as string) ?? '#8b5cf6',
    icon: (r.icon as string) ?? 'fa-folder',
    gameCount: (r.game_count as number) ?? 0,
    createdAt: (r.created_at as number) ?? 0,
  }));
}

export function createCollection(userId: number, name: string, description?: string, color?: string, icon?: string): number {
  run('INSERT INTO collections (user_id, name, description, color, icon) VALUES (?, ?, ?, ?, ?)',
    [userId, name, description ?? null, color ?? '#8b5cf6', icon ?? 'fa-folder']);
  const row = get<{ id: number }>('SELECT last_insert_rowid() as id');
  return row?.id ?? 0;
}

export function updateCollection(id: number, userId: number, updates: { name?: string; description?: string; color?: string; icon?: string }): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
  if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description); }
  if (updates.color !== undefined) { sets.push('color = ?'); vals.push(updates.color); }
  if (updates.icon !== undefined) { sets.push('icon = ?'); vals.push(updates.icon); }
  if (sets.length === 0) return;
  vals.push(id, userId);
  run(`UPDATE collections SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, vals);
}

export function deleteCollection(id: number, userId: number): void {
  run('DELETE FROM collection_games WHERE collection_id = ?', [id]);
  run('DELETE FROM collections WHERE id = ? AND user_id = ?', [id, userId]);
}

export function getCollectionGames(collectionId: number): Game[] {
  return all<Record<string, unknown>>(
    'SELECT g.* FROM collection_games cg INNER JOIN games g ON cg.game_id = g.id WHERE cg.collection_id = ? ORDER BY cg.added_at DESC',
    [collectionId],
  ).map(dbGameToGame);
}

export function addGameToCollection(collectionId: number, gameId: number): void {
  run('INSERT INTO collection_games (collection_id, game_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [collectionId, gameId]);
}

export function removeGameFromCollection(collectionId: number, gameId: number): void {
  run('DELETE FROM collection_games WHERE collection_id = ? AND game_id = ?', [collectionId, gameId]);
}

// ── Game Notes ──────────────────────────────────────────────────────────────

export function getGameNote(userId: number, gameId: number): GameNote | null {
  const row = get<Record<string, unknown>>(
    'SELECT game_id, content, updated_at FROM game_notes WHERE user_id = ? AND game_id = ?',
    [userId, gameId],
  );
  if (!row) return null;
  return { gameId: row.game_id as number, content: row.content as string, updatedAt: row.updated_at as number };
}

export function saveGameNote(userId: number, gameId: number, content: string): void {
  if (!content.trim()) {
    run('DELETE FROM game_notes WHERE user_id = ? AND game_id = ?', [userId, gameId]);
    return;
  }
  run(
    `INSERT INTO game_notes (user_id, game_id, content, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, game_id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`,
    [userId, gameId, content, nowUnix()],
  );
}

// ── Game Status ─────────────────────────────────────────────────────────────

export function getGameStatuses(userId: number, statusFilter?: GameStatusType): GameStatusEntry[] {
  let sql = `SELECT gs.*, g.name, g.header_image, g.genres, g.tags, g.release_date,
    g.price_cents, g.price_currency, g.review_score, g.review_count, g.developers, g.publishers, g.platforms, g.short_desc
    FROM game_status gs
    INNER JOIN games g ON gs.game_id = g.id
    WHERE gs.user_id = ?`;
  const params: unknown[] = [userId];
  if (statusFilter) { sql += ' AND gs.status = ?'; params.push(statusFilter); }
  sql += ' ORDER BY gs.updated_at DESC';

  return all<Record<string, unknown>>(sql, params).map((r) => ({
    gameId: r.game_id as number,
    status: r.status as GameStatusType,
    startedAt: (r.started_at as number) ?? null,
    completedAt: (r.completed_at as number) ?? null,
    updatedAt: r.updated_at as number,
    game: dbGameToGame(r),
  }));
}

export function setGameStatus(userId: number, gameId: number, status: GameStatusType): void {
  const now = nowUnix();
  run(
    `INSERT INTO game_status (user_id, game_id, status, started_at, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, game_id) DO UPDATE SET
       status=excluded.status, started_at=excluded.started_at,
       completed_at=excluded.completed_at, updated_at=excluded.updated_at`,
    [userId, gameId, status,
      status === 'playing' ? now : null,
      status === 'completed' ? now : null,
      now],
  );
}

// ── User Settings ───────────────────────────────────────────────────────────

export function getUserSettings(userId: number): UserSettings {
  const row = get<Record<string, unknown>>('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
  return {
    theme: ((row?.theme as string) ?? 'dark') as 'dark' | 'light',
    backupDir: (row?.backup_dir as string) ?? null,
    backupIntervalHours: (row?.backup_interval_hours as number) ?? 24,
    ollamaUrl: (row?.ollama_url as string) ?? null,
    ollamaModel: (row?.ollama_model as string) ?? null,
    cacheTtlSeconds: (row?.cache_ttl_seconds as number) ?? null,
    language: (row?.language as string) ?? 'en',
    keyboardShortcuts: parseJson(row?.keyboard_shortcuts, null),
    explanationTemplate: (row?.explanation_template as string) ?? null,
  };
}

export function saveUserSettings(userId: number, settings: Partial<UserSettings>): void {
  const row = get('SELECT user_id FROM user_settings WHERE user_id = ?', [userId]);
  if (!row) {
    run(`INSERT INTO user_settings (user_id, theme, ollama_url, ollama_model, cache_ttl_seconds, language, keyboard_shortcuts, explanation_template, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, settings.theme ?? 'dark', settings.ollamaUrl ?? null, settings.ollamaModel ?? null,
       settings.cacheTtlSeconds ?? null, settings.language ?? 'en',
       settings.keyboardShortcuts ? JSON.stringify(settings.keyboardShortcuts) : null,
       settings.explanationTemplate ?? null, nowUnix()]);
  } else {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (settings.theme !== undefined) { sets.push('theme = ?'); vals.push(settings.theme); }
    if (settings.ollamaUrl !== undefined) { sets.push('ollama_url = ?'); vals.push(settings.ollamaUrl); }
    if (settings.ollamaModel !== undefined) { sets.push('ollama_model = ?'); vals.push(settings.ollamaModel); }
    if (settings.cacheTtlSeconds !== undefined) { sets.push('cache_ttl_seconds = ?'); vals.push(settings.cacheTtlSeconds); }
    if (settings.language !== undefined) { sets.push('language = ?'); vals.push(settings.language); }
    if (settings.keyboardShortcuts !== undefined) { sets.push('keyboard_shortcuts = ?'); vals.push(JSON.stringify(settings.keyboardShortcuts)); }
    if (settings.explanationTemplate !== undefined) { sets.push('explanation_template = ?'); vals.push(settings.explanationTemplate); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?'); vals.push(nowUnix());
    vals.push(userId);
    run(`UPDATE user_settings SET ${sets.join(', ')} WHERE user_id = ?`, vals);
  }
}

// ── Chat Messages ───────────────────────────────────────────────────────────

export function getChatHistory(userId: number, limit = 50): ChatMessage[] {
  return all<Record<string, unknown>>(
    'SELECT id, role, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT ?',
    [userId, limit],
  ).map((r) => ({
    id: r.id as number,
    role: r.role as 'user' | 'assistant',
    content: r.content as string,
    createdAt: r.created_at as number,
  }));
}

export function addChatMessage(userId: number, role: 'user' | 'assistant', content: string): number {
  run('INSERT INTO chat_messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)',
    [userId, role, content, nowUnix()]);
  const row = get<{ id: number }>('SELECT last_insert_rowid() as id');
  return row?.id ?? 0;
}

export function clearChatHistory(userId: number): void {
  run('DELETE FROM chat_messages WHERE user_id = ?', [userId]);
}

// ── Price Alerts ────────────────────────────────────────────────────────────

export function getPriceAlerts(userId: number): PriceAlert[] {
  return all<Record<string, unknown>>(
    `SELECT pa.*, g.name, g.header_image, g.genres, g.tags, g.release_date,
      g.price_cents as current_game_price, g.price_currency, g.review_score, g.review_count,
      g.developers, g.publishers, g.platforms, g.short_desc
     FROM price_alerts pa
     INNER JOIN games g ON pa.game_id = g.id
     WHERE pa.user_id = ? ORDER BY pa.created_at DESC`,
    [userId],
  ).map((r) => ({
    id: r.id as number,
    gameId: r.game_id as number,
    targetPriceCents: (r.target_price_cents as number) ?? null,
    currentPriceCents: (r.current_price_cents as number) ?? null,
    lastChecked: (r.last_checked as number) ?? null,
    alerted: !!(r.alerted),
    game: dbGameToGame(r),
  }));
}

export function createPriceAlert(userId: number, gameId: number, targetPriceCents: number): void {
  run('INSERT INTO price_alerts (user_id, game_id, target_price_cents) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
    [userId, gameId, targetPriceCents]);
}

export function deletePriceAlert(id: number, userId: number): void {
  run('DELETE FROM price_alerts WHERE id = ? AND user_id = ?', [id, userId]);
}

// ── Publisher Blacklist ─────────────────────────────────────────────────────

export function getBlacklist(userId: number): PublisherBlacklist[] {
  return all<Record<string, unknown>>(
    'SELECT id, name, type FROM publisher_blacklist WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  ).map((r) => ({
    id: r.id as number,
    name: r.name as string,
    type: (r.type as 'publisher' | 'developer') ?? 'publisher',
  }));
}

export function addToBlacklist(userId: number, name: string, type: 'publisher' | 'developer'): void {
  run('INSERT INTO publisher_blacklist (user_id, name, type) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
    [userId, name, type]);
}

export function removeFromBlacklist(id: number, userId: number): void {
  run('DELETE FROM publisher_blacklist WHERE id = ? AND user_id = ?', [id, userId]);
}

// ── Auto Categories ─────────────────────────────────────────────────────────

export function getAutoCategories(userId: number): Array<{ category: string; games: AutoCategory[] }> {
  const rows = all<Record<string, unknown>>(
    `SELECT ac.game_id, ac.category, ac.confidence,
      g.name, g.header_image, g.genres, g.tags, g.release_date,
      g.price_cents, g.price_currency, g.review_score, g.review_count,
      g.developers, g.publishers, g.platforms, g.short_desc
     FROM auto_categories ac
     INNER JOIN games g ON ac.game_id = g.id
     WHERE ac.user_id = ?
     ORDER BY ac.category, ac.confidence DESC`,
    [userId],
  );

  const grouped: Record<string, AutoCategory[]> = {};
  for (const r of rows) {
    const cat = r.category as string;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      gameId: r.game_id as number,
      category: cat,
      confidence: (r.confidence as number) ?? 0,
      game: dbGameToGame(r),
    });
  }

  return Object.entries(grouped).map(([category, games]) => ({ category, games }));
}

export function upsertAutoCategory(userId: number, gameId: number, category: string, confidence: number): void {
  getDb().run(
    `INSERT INTO auto_categories (user_id, game_id, category, confidence)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, game_id) DO UPDATE SET category=excluded.category, confidence=excluded.confidence, categorized_at=unixepoch()`,
    [userId, gameId, category, confidence] as any[],
  );
}

// ── Profile Snapshots & AI Summaries ────────────────────────────────────────

export function saveProfileSnapshot(userId: number, genreScores: Record<string, number>, tagScores: Record<string, number>): void {
  // Max 1 per hour
  const last = get<{ created_at: number }>(
    'SELECT created_at FROM profile_snapshots WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId],
  );
  if (last && nowUnix() - last.created_at < 3600) return;

  const stats = get<{ c: number; p: number }>(
    'SELECT count(*) as c, coalesce(sum(playtime_mins), 0) as p FROM user_games WHERE user_id = ?',
    [userId],
  );
  run('INSERT INTO profile_snapshots (user_id, genre_scores, tag_scores, total_games, total_playtime_hours, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, JSON.stringify(genreScores), JSON.stringify(tagScores), stats?.c ?? 0, Math.round((stats?.p ?? 0) / 60), nowUnix()]);
}

export function getProfileSnapshots(userId: number, limit = 20): ProfileSnapshot[] {
  return all<Record<string, unknown>>(
    'SELECT * FROM profile_snapshots WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit],
  ).map((s) => ({
    id: s.id as number,
    topGenres: Object.entries(parseJson<Record<string, number>>(s.genre_scores, {}))
      .sort(([, a], [, b]) => b - a).slice(0, 8)
      .map(([name, score]) => ({ name, score })),
    topTags: Object.entries(parseJson<Record<string, number>>(s.tag_scores, {}))
      .sort(([, a], [, b]) => b - a).slice(0, 8)
      .map(([name, score]) => ({ name, score })),
    totalGames: (s.total_games as number) ?? 0,
    totalPlaytimeHours: (s.total_playtime_hours as number) ?? 0,
    createdAt: (s.created_at as number) ?? 0,
  }));
}

export function getAiSummaries(userId: number, limit = 10): AiSummaryEntry[] {
  return all<Record<string, unknown>>(
    'SELECT id, summary, created_at FROM ai_summary_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit],
  ).map((s) => ({
    id: s.id as number,
    summary: s.summary as string,
    createdAt: s.created_at as number,
  }));
}

export function saveAiSummary(userId: number, summary: string): void {
  run('INSERT INTO ai_summary_history (user_id, summary, created_at) VALUES (?, ?, ?)', [userId, summary, nowUnix()]);
  run('UPDATE taste_profiles SET ai_summary = ?, updated_at = ? WHERE user_id = ?', [summary, nowUnix(), userId]);
}

// ── Gaming DNA ──────────────────────────────────────────────────────────────

export function getGamingDNA(userId: number): GamingDNA {
  const blacklistedTags = getBlacklistedTags(userId);
  const blacklistSet = getBlacklistedTagsSet(blacklistedTags);

  const profile = getTasteProfile(userId);
  const genreScores = profile?.genreScores ?? {};
  const tagScores = profile?.tagScores ?? {};

  const topGenres = Object.entries(genreScores)
    .sort(([, a], [, b]) => b - a).slice(0, 8)
    .map(([name, score]) => ({ name, score }));

  const topTags = Object.entries(tagScores)
    .filter(([name]) => !blacklistSet.has(name.toLowerCase()))
    .sort(([, a], [, b]) => b - a).slice(0, 8)
    .map(([name, score]) => ({ name, score }));

  // Count games per tag
  const tagRows = all<{ tags: string }>(
    'SELECT g.tags FROM user_games ug INNER JOIN games g ON ug.game_id = g.id WHERE ug.user_id = ?',
    [userId],
  );
  const tagCounts: Record<string, number> = {};
  for (const row of tagRows) {
    if (!row.tags) continue;
    for (const t of parseJson<string[]>(row.tags, [])) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }

  const allTagNames = new Set([...Object.keys(tagScores), ...Object.keys(tagCounts), ...blacklistedTags]);
  const allTags = Array.from(allTagNames)
    .map((name) => ({ name, score: tagScores[name] ?? 0, blacklisted: blacklistSet.has(name.toLowerCase()), count: tagCounts[name] || 0 }))
    .sort((a, b) => b.count - a.count || b.score - a.score);

  const stats = get<{ c: number; p: number }>(
    'SELECT count(*) as c, coalesce(sum(playtime_mins), 0) as p FROM user_games WHERE user_id = ?',
    [userId],
  );

  const swipeStats = getSwipeStats(userId);

  return {
    topGenres,
    topTags,
    allTags,
    totalGames: stats?.c ?? 0,
    totalPlaytimeHours: Math.round((stats?.p ?? 0) / 60),
    swipeStats,
    aiSummary: profile?.aiSummary ?? null,
  };
}

// ── Blacklisted Tags ────────────────────────────────────────────────────────

export function getBlacklistedTags(userId: number): string[] {
  const row = get<{ blacklisted_tags: string }>('SELECT blacklisted_tags FROM users WHERE id = ?', [userId]);
  return row?.blacklisted_tags ? parseJson(row.blacklisted_tags, DEFAULT_BLACKLISTED_TAGS) : DEFAULT_BLACKLISTED_TAGS;
}

/** @deprecated Use getBlacklistedTags */
export const getIgnoredTags = getBlacklistedTags;

export function setTagBlacklisted(userId: number, tag: string, blacklisted: boolean): string[] {
  const current = getBlacklistedTags(userId);
  let updated: string[];
  if (blacklisted) {
    if (!current.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      updated = [...current, tag];
    } else {
      updated = current;
    }
  } else {
    updated = current.filter((t) => t.toLowerCase() !== tag.toLowerCase());
  }
  run('UPDATE users SET blacklisted_tags = ? WHERE id = ?', [JSON.stringify(updated), userId]);
  return updated;
}

/** @deprecated Use setTagBlacklisted */
export const setTagIgnored = setTagBlacklisted;

export function resetBlacklistToDefaults(userId: number): void {
  run('UPDATE users SET blacklisted_tags = ? WHERE id = ?', [JSON.stringify(DEFAULT_BLACKLISTED_TAGS), userId]);
}

/** @deprecated Use resetBlacklistToDefaults */
export const resetIgnoredTagsToDefaults = resetBlacklistToDefaults;

// ── Tag Catalog ─────────────────────────────────────────────────────────────

export function rebuildTagCatalog(steamTags?: { name: string }[]): void {
  // Count tags from locally cached games
  const rows = all<{ tags: string }>('SELECT tags FROM games WHERE tags IS NOT NULL AND tags != \'\'');
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const tag of parseJson<string[]>(row.tags, [])) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }

  // Merge Steam community tags (game_count = 0 if not found locally)
  if (steamTags) {
    for (const st of steamTags) {
      if (!(st.name in counts)) {
        counts[st.name] = 0;
      }
    }
  }

  getDb().run('DELETE FROM tag_catalog');
  const now = Math.floor(Date.now() / 1000);
  for (const [name, count] of Object.entries(counts)) {
    getDb().run('INSERT OR REPLACE INTO tag_catalog (name, game_count, updated_at) VALUES (?, ?, ?)', [name, count, now]);
  }
  persistDb();
}

export function searchTagCatalog(query: string, limit = 20): { name: string; gameCount: number }[] {
  if (!query.trim()) return [];
  return all<{ name: string; game_count: number }>(
    'SELECT name, game_count FROM tag_catalog WHERE LOWER(name) LIKE ? ORDER BY game_count DESC LIMIT ?',
    [`%${query.toLowerCase()}%`, limit],
  ).map((r) => ({ name: r.name, gameCount: r.game_count }));
}

export function getTagCatalogCount(): number {
  const row = get<{ c: number }>('SELECT count(*) as c FROM tag_catalog');
  return row?.c ?? 0;
}

// ── Library & Wishlist ──────────────────────────────────────────────────────

export function getLibrary(userId: number, opts?: { limit?: number; offset?: number; sort?: string }) {
  let orderBy = 'ug.last_played DESC NULLS LAST';
  if (opts?.sort === 'playtime') orderBy = 'ug.playtime_mins DESC';
  else if (opts?.sort === 'name') orderBy = 'g.name ASC';

  let sql = `SELECT g.*, ug.playtime_mins, ug.last_played, ug.from_wishlist
    FROM user_games ug
    INNER JOIN games g ON ug.game_id = g.id
    WHERE ug.user_id = ? ORDER BY ${orderBy}`;
  const params: unknown[] = [userId];

  if (opts?.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
    if (opts?.offset) { sql += ' OFFSET ?'; params.push(opts.offset); }
  }

  return all<Record<string, unknown>>(sql, params).map((r) => ({
    game: dbGameToGame(r),
    playtimeMins: (r.playtime_mins as number) ?? 0,
    lastPlayed: (r.last_played as number) ?? null,
    fromWishlist: !!(r.from_wishlist),
  }));
}

export function getWishlistGames(userId: number) {
  return all<Record<string, unknown>>(
    `SELECT g.* FROM user_games ug
     INNER JOIN games g ON ug.game_id = g.id
     WHERE ug.user_id = ? AND ug.from_wishlist = 1 AND ug.playtime_mins = 0
     ORDER BY g.name ASC`,
    [userId],
  ).map(dbGameToGame);
}

// ── Stats / Dashboard ───────────────────────────────────────────────────────

export function getDashboardStats(userId: number): DashboardStats {
  const stats = get<{ totalGames: number; totalPlaytime: number; totalValue: number }>(
    `SELECT count(*) as totalGames,
      coalesce(sum(ug.playtime_mins), 0) as totalPlaytime,
      coalesce(sum(g.price_cents), 0) as totalValue
     FROM user_games ug
     INNER JOIN games g ON ug.game_id = g.id
     WHERE ug.user_id = ?`,
    [userId],
  );

  // Games by genre
  const gameRows = all<{ genres: string }>(
    'SELECT g.genres FROM user_games ug INNER JOIN games g ON ug.game_id = g.id WHERE ug.user_id = ?',
    [userId],
  );
  const genreCounts: Record<string, number> = {};
  for (const r of gameRows) {
    for (const g of parseJson<string[]>(r.genres, [])) {
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    }
  }
  const gamesByGenre = Object.entries(genreCounts)
    .sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([genre, count]) => ({ genre, count }));

  // Games by year
  const yearRows = all<{ release_date: string }>(
    'SELECT g.release_date FROM user_games ug INNER JOIN games g ON ug.game_id = g.id WHERE ug.user_id = ? AND g.release_date IS NOT NULL',
    [userId],
  );
  const yearCounts: Record<string, number> = {};
  for (const r of yearRows) {
    const yr = r.release_date?.slice(0, 4);
    if (yr) yearCounts[yr] = (yearCounts[yr] || 0) + 1;
  }
  const gamesByYear = Object.entries(yearCounts)
    .sort(([a], [b]) => b.localeCompare(a)).slice(0, 15)
    .map(([year, count]) => ({ year, count }));

  // Played vs unplayed
  const played = get<{ c: number }>(
    'SELECT count(*) as c FROM user_games WHERE user_id = ? AND playtime_mins > 0',
    [userId],
  );
  const totalGames = stats?.totalGames ?? 0;

  // Top played
  const topPlayed = all<Record<string, unknown>>(
    `SELECT g.*, ug.playtime_mins FROM user_games ug
     INNER JOIN games g ON ug.game_id = g.id
     WHERE ug.user_id = ? AND ug.playtime_mins > 0
     ORDER BY ug.playtime_mins DESC LIMIT 10`,
    [userId],
  ).map((r) => ({ game: dbGameToGame(r), playtimeMins: r.playtime_mins as number }));

  // Swipe stats
  const swipeStats = getSwipeStats(userId);

  // Recent activity (last 30 days)
  const thirtyDaysAgo = nowUnix() - 30 * 24 * 60 * 60;
  const activityRows = all<{ day: string; c: number }>(
    `SELECT date(swiped_at, 'unixepoch') as day, count(*) as c
     FROM swipe_history WHERE user_id = ? AND swiped_at > ?
     GROUP BY day ORDER BY day DESC`,
    [userId, thirtyDaysAgo],
  );

  return {
    totalGames,
    totalPlaytimeHours: Math.round((stats?.totalPlaytime ?? 0) / 60),
    totalValueCents: stats?.totalValue ?? 0,
    gamesByGenre,
    gamesByYear,
    playedVsUnplayed: { played: played?.c ?? 0, unplayed: totalGames - (played?.c ?? 0) },
    topPlayedGames: topPlayed,
    swipeStats,
    recentActivity: activityRows.map((r) => ({ date: r.day, swipes: r.c })),
  };
}

// ── Similar Games ───────────────────────────────────────────────────────────

export function getSimilarGames(appid: number, userId: number, limit = 10): Array<{ game: Game; similarity: number }> {
  const source = getGame(appid);
  if (!source) return [];

  const ownedIds = getUserGameIds(userId);
  const swipedIds = getSwipedIds(userId);
  const excludeIds = new Set([appid, ...ownedIds, ...swipedIds]);

  const candidates = all<Record<string, unknown>>(
    'SELECT * FROM games WHERE id != ? AND cached_at > 0',
    [appid],
  ).filter((r) => !excludeIds.has(r.id as number));

  const srcGenres = new Set(source.genres.map((g) => g.toLowerCase()));
  const srcTags = new Set(source.tags.map((t) => t.toLowerCase()));

  const scored = candidates.map((r) => {
    const genres = parseJson<string[]>(r.genres, []);
    const tags = parseJson<string[]>(r.tags, []);
    const genreOverlap = genres.filter((g) => srcGenres.has(g.toLowerCase())).length / Math.max(srcGenres.size, 1);
    const tagOverlap = tags.filter((t) => srcTags.has(t.toLowerCase())).length / Math.max(srcTags.size, 1);
    return { game: dbGameToGame(r), similarity: genreOverlap * 0.5 + tagOverlap * 0.5 };
  });

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

// ── Export / Import ─────────────────────────────────────────────────────────

export function exportUserData(userId: number) {
  const blacklistedTags = getBlacklistedTags(userId);
  const profile = getTasteProfile(userId);

  const swipes = all<{ game_id: number; name: string; decision: string; swiped_at: number }>(
    `SELECT sh.game_id, g.name, sh.decision, sh.swiped_at
     FROM swipe_history sh INNER JOIN games g ON sh.game_id = g.id
     WHERE sh.user_id = ?`,
    [userId],
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tags: { scores: profile?.tagScores ?? {}, blacklisted: blacklistedTags },
    genres: { scores: profile?.genreScores ?? {} },
    swipeHistory: swipes.map((s) => ({
      gameId: s.game_id,
      gameName: s.name,
      decision: s.decision,
      swipedAt: s.swiped_at,
    })),
  };
}

export function importUserData(userId: number, data: {
  tags?: { ignored?: string[]; blacklisted?: string[]; scores?: Record<string, number> };
  genres?: { scores?: Record<string, number> };
  swipeHistory?: { gameId: number; gameName?: string; decision: string; swipedAt?: number }[];
}): { importedTags: number; importedSwipes: number } {
  let importedTags = 0;
  let importedSwipes = 0;

  // Blacklisted tags — merge (set union, case-insensitive)
  const tagList = data.tags?.blacklisted ?? data.tags?.ignored;
  if (tagList?.length) {
    const current = getBlacklistedTags(userId);
    const currentLower = new Set(current.map((t) => t.toLowerCase()));
    const newTags = tagList.filter((t) => !currentLower.has(t.toLowerCase()));
    if (newTags.length > 0) {
      const merged = [...current, ...newTags];
      run('UPDATE users SET blacklisted_tags = ? WHERE id = ?', [JSON.stringify(merged), userId]);
    }
    importedTags = newTags.length;
  }

  // Swipe history — upsert with "most recent wins"
  if (data.swipeHistory?.length) {
    for (const swipe of data.swipeHistory) {
      if (!['yes', 'no', 'maybe'].includes(swipe.decision)) continue;
      upsertGameStub(swipe.gameId, swipe.gameName ?? `Game ${swipe.gameId}`);
      const swipedAt = swipe.swipedAt ?? nowUnix();
      const changed = importSwipe(userId, swipe.gameId, swipe.decision as SwipeDecision, swipedAt);
      if (changed) importedSwipes++;
    }
    persistDb();
  }

  return { importedTags, importedSwipes };
}

// ── Batch persist (for bulk operations) ─────────────────────────────────────

export function batchPersist(): void {
  persistDb();
}

// ── Profile (for user page) ─────────────────────────────────────────────────

export function getUserProfile(userId: number) {
  const user = getUser(userId);
  if (!user) return null;

  const stats = get<{ c: number; p: number; w: number }>(
    `SELECT count(*) as c, coalesce(sum(playtime_mins), 0) as p,
      coalesce(sum(case when from_wishlist = 1 then 1 else 0 end), 0) as w
     FROM user_games WHERE user_id = ?`,
    [userId],
  );

  return {
    user,
    stats: {
      totalGames: stats?.c ?? 0,
      totalPlaytimeHours: Math.round((stats?.p ?? 0) / 60),
      wishlistCount: stats?.w ?? 0,
    },
  };
}
