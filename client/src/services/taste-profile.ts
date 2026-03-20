// Client-side taste profile calculator — port of server/services/taste-profile.ts.
// Pure computation with client DB reads/writes.

import { getDb } from '../db/index';
import * as db from '../db/queries';
import { config } from './config';

function parseJson<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string' || !val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
  const results: T[] = [];
  const stmt = getDb().prepare(sql);
  if (params) stmt.bind(params as any[]);
  while (stmt.step()) results.push(stmt.getAsObject() as T);
  stmt.free();
  return results;
}

export function recalculateTasteProfile(userId: number): void {
  // Fetch all user_games with game data (includes from_wishlist flag)
  const userGamesRows = queryAll<{ playtime_mins: number; genres: string; tags: string; price_cents: number | null; from_wishlist: number }>(
    `SELECT ug.playtime_mins, g.genres, g.tags, g.price_cents, ug.from_wishlist
     FROM user_games ug
     INNER JOIN games g ON ug.game_id = g.id
     WHERE ug.user_id = ?`,
    [userId],
  );

  // Fetch all swipe_history with game data and timestamp for temporal decay
  const swipeRows = queryAll<{ decision: string; genres: string; tags: string; price_cents: number | null; swiped_at: number | null }>(
    `SELECT sh.decision, g.genres, g.tags, g.price_cents, sh.swiped_at
     FROM swipe_history sh
     INNER JOIN games g ON sh.game_id = g.id
     WHERE sh.user_id = ?`,
    [userId],
  );

  // Fetch bookmarked games
  const bookmarkRows = queryAll<{ genres: string; tags: string; price_cents: number | null }>(
    `SELECT g.genres, g.tags, g.price_cents
     FROM bookmarks b
     INNER JOIN games g ON b.game_id = g.id
     WHERE b.user_id = ?`,
    [userId],
  );

  const genreScoresRaw: Record<string, number> = {};
  const tagScoresRaw: Record<string, number> = {};

  const nowSec = Math.floor(Date.now() / 1000);

  for (const row of userGamesRows) {
    const tw = config.tasteWeights;
    let weight: number;
    if (row.from_wishlist === 1) {
      weight = tw.wishlist;
    } else {
      const playtime = row.playtime_mins ?? 0;
      // Normalize playtime by expected genre duration to avoid RPG/MMO inflation
      const genres = parseJson<string[]>(row.genres, []);
      const primaryGenre = genres[0]?.toLowerCase() ?? '';
      const expectedHours = config.estimatedPlaytimeByGenre[primaryGenre] ?? config.estimatedPlaytimeDefault;
      const actualHours = playtime / 60;
      const normalizedPlaytime = actualHours / expectedHours; // >1 means played beyond expected

      if (normalizedPlaytime > 1.0) weight = tw.highPlaytime;
      else if (normalizedPlaytime > 0.3) weight = tw.mediumPlaytime;
      else weight = tw.lowPlaytime;
    }

    for (const g of parseJson<string[]>(row.genres, [])) {
      genreScoresRaw[g] = (genreScoresRaw[g] ?? 0) + weight;
    }
    for (const t of parseJson<string[]>(row.tags, [])) {
      tagScoresRaw[t] = (tagScoresRaw[t] ?? 0) + weight;
    }
  }

  for (const row of swipeRows) {
    const sw = config.tasteWeights;
    const baseWeight = row.decision === 'yes' ? sw.swipeYes : row.decision === 'maybe' ? sw.swipeMaybe : sw.swipeNo;

    // Apply temporal decay: recent swipes matter more than old ones
    let decayFactor = 1.0;
    if (row.swiped_at) {
      const daysSinceSwipe = (nowSec - row.swiped_at) / 86400;
      decayFactor = Math.exp(-config.temporalDecayRate * daysSinceSwipe);
    }
    const weight = baseWeight * decayFactor;

    for (const g of parseJson<string[]>(row.genres, [])) {
      genreScoresRaw[g] = (genreScoresRaw[g] ?? 0) + weight;
    }
    for (const t of parseJson<string[]>(row.tags, [])) {
      tagScoresRaw[t] = (tagScoresRaw[t] ?? 0) + weight;
    }
  }

  // Bookmark contributions
  const bookmarkWeight = config.tasteWeights.bookmark;
  for (const row of bookmarkRows) {
    for (const g of parseJson<string[]>(row.genres, [])) {
      genreScoresRaw[g] = (genreScoresRaw[g] ?? 0) + bookmarkWeight;
    }
    for (const t of parseJson<string[]>(row.tags, [])) {
      tagScoresRaw[t] = (tagScoresRaw[t] ?? 0) + bookmarkWeight;
    }
  }

  // Normalize scores: clamp negatives to 0, ratio to max (preserves proportions)
  const normalize = (scores: Record<string, number>): Record<string, number> => {
    const result: Record<string, number> = {};
    const entries = Object.entries(scores);
    if (entries.length === 0) return {};

    // Clamp negatives to 0 — the negative signal already reduced raw totals during accumulation
    const positive: [string, number][] = entries.map(([k, v]) => [k, Math.max(v, 0)]);
    const maxVal = Math.max(...positive.map(([, v]) => v));
    if (maxVal === 0) {
      for (const [key] of positive) result[key] = 0;
      return result;
    }

    // Ratio to max — preserves proportions (50 vs 5 → 1.0 vs 0.1)
    for (const [key, val] of positive) {
      result[key] = Math.round((val / maxVal) * 100) / 100;
    }
    return result;
  };

  const genreScores = normalize(genreScoresRaw);
  const tagScores = normalize(tagScoresRaw);

  // Calculate price_pref
  const prices: number[] = [];
  for (const row of userGamesRows) {
    if (row.price_cents != null) prices.push(row.price_cents);
  }
  for (const row of swipeRows) {
    if (row.decision === 'yes' && row.price_cents != null) prices.push(row.price_cents);
  }

  const pricePref = prices.length > 0
    ? {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      }
    : { min: 0, max: 0, avg: 0 };

  // Calculate playtime_pref
  const playtimes = userGamesRows
    .map((r) => (r.playtime_mins ?? 0) / 60)
    .filter((h) => h > 0);

  const avgHours = playtimes.length > 0
    ? Math.round((playtimes.reduce((a, b) => a + b, 0) / playtimes.length) * 10) / 10
    : 0;

  const playtimePref = { avgHours, preferLong: avgHours > 20 };

  db.upsertTasteProfile(userId, genreScores, tagScores, pricePref, playtimePref);
  db.saveProfileSnapshot(userId, genreScores, tagScores);
}
