// Client-side taste profile calculator — port of server/services/taste-profile.ts.
// Pure computation with client DB reads/writes.
//
// Improvements:
// - User-configurable temporal decay rate (from scoring_weights table)
// - Dynamic playtime normalization: uses user's own median playtime per genre
//   instead of hardcoded estimates
// - Improved negative signal handling: tracks tag co-occurrence so swiping No
//   on a bad RPG doesn't penalize all RPG tags equally

import * as db from '../db/queries';
import { parseJson, queryAll } from '../db/helpers';
import { config } from './config';

/**
 * Calculate median playtime per genre from the user's own library data.
 * Falls back to config.estimatedPlaytimeByGenre if not enough data.
 */
function getUserPlaytimeByGenre(
  userGamesRows: { playtime_mins: number; genres: string; from_wishlist: number }[],
): Record<string, number> {
  const genrePlaytimes: Record<string, number[]> = {};
  for (const row of userGamesRows) {
    if (row.from_wishlist === 1) continue;
    const hours = (row.playtime_mins ?? 0) / 60;
    if (hours <= 0) continue;
    for (const g of parseJson<string[]>(row.genres, [])) {
      const key = g.toLowerCase();
      if (!genrePlaytimes[key]) genrePlaytimes[key] = [];
      genrePlaytimes[key].push(hours);
    }
  }

  const result: Record<string, number> = {};
  for (const [genre, times] of Object.entries(genrePlaytimes)) {
    if (times.length < 3) continue; // need at least 3 games for a meaningful median
    times.sort((a, b) => a - b);
    const mid = Math.floor(times.length / 2);
    result[genre] = times.length % 2 === 0
      ? (times[mid - 1] + times[mid]) / 2
      : times[mid];
  }
  return result;
}

/**
 * Track co-occurrence of tags with Yes vs No swipes.
 * A tag that appears in both Yes and No swipes isn't the problem —
 * only penalize tags that appear predominantly in No swipes.
 */
function buildNegativeSignalMap(
  swipeRows: { decision: string; tags: string }[],
): Map<string, number> {
  const tagYes: Record<string, number> = {};
  const tagNo: Record<string, number> = {};

  for (const row of swipeRows) {
    const tags = parseJson<string[]>(row.tags, []);
    for (const t of tags) {
      if (row.decision === 'yes' || row.decision === 'maybe') {
        tagYes[t] = (tagYes[t] ?? 0) + 1;
      } else if (row.decision === 'no') {
        tagNo[t] = (tagNo[t] ?? 0) + 1;
      }
    }
  }

  // For each tag, compute a penalty factor:
  // If the tag appears more in No than Yes, it gets a stronger penalty.
  // If it appears equally, penalty is reduced (the tag itself isn't the issue).
  const penalties = new Map<string, number>();
  for (const [tag, noCount] of Object.entries(tagNo)) {
    const yesCount = tagYes[tag] ?? 0;
    const total = yesCount + noCount;
    if (total === 0) continue;
    // Ratio of No swipes for this tag: 1.0 = always No, 0.5 = even split
    const noRatio = noCount / total;
    // Only penalize if predominantly negative (>60% No)
    const penaltyMultiplier = noRatio > 0.6 ? noRatio : 0;
    if (penaltyMultiplier > 0) {
      penalties.set(tag, penaltyMultiplier);
    }
  }
  return penalties;
}

export function recalculateTasteProfile(userId: number): void {
  // Load user-configurable temporal decay rate
  const weights = db.getScoringWeights(userId);

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

  // Dynamic playtime normalization: use user's own data, fall back to config
  const userPlaytime = getUserPlaytimeByGenre(userGamesRows);

  for (const row of userGamesRows) {
    const tw = config.tasteWeights;
    let weight: number;
    if (row.from_wishlist === 1) {
      weight = tw.wishlist;
    } else {
      const playtime = row.playtime_mins ?? 0;
      // Use user's own median playtime per genre when available
      const genres = parseJson<string[]>(row.genres, []);
      const primaryGenre = genres[0]?.toLowerCase() ?? '';
      const expectedHours = userPlaytime[primaryGenre]
        ?? config.estimatedPlaytimeByGenre[primaryGenre]
        ?? config.estimatedPlaytimeDefault;
      const actualHours = playtime / 60;
      const normalizedPlaytime = actualHours / expectedHours;

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

  // Build co-occurrence map for smarter negative signals
  const negativeSignals = buildNegativeSignalMap(swipeRows);
  const decayRate = weights.temporalDecayRate;

  for (const row of swipeRows) {
    const sw = config.tasteWeights;
    const baseWeight = row.decision === 'yes' ? sw.swipeYes : row.decision === 'maybe' ? sw.swipeMaybe : sw.swipeNo;

    // Apply user-configurable temporal decay
    let decayFactor = 1.0;
    if (row.swiped_at) {
      const daysSinceSwipe = (nowSec - row.swiped_at) / 86400;
      decayFactor = Math.exp(-decayRate * daysSinceSwipe);
    }

    for (const g of parseJson<string[]>(row.genres, [])) {
      let weight = baseWeight * decayFactor;
      // For No swipes, apply co-occurrence-aware penalty
      if (row.decision === 'no') {
        const penalty = negativeSignals.get(g) ?? 0;
        weight = sw.swipeNo * penalty * decayFactor;
      }
      genreScoresRaw[g] = (genreScoresRaw[g] ?? 0) + weight;
    }
    for (const t of parseJson<string[]>(row.tags, [])) {
      let weight = baseWeight * decayFactor;
      if (row.decision === 'no') {
        const penalty = negativeSignals.get(t) ?? 0;
        weight = sw.swipeNo * penalty * decayFactor;
      }
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
