import { eq } from 'drizzle-orm';
import { db } from '../db';
import { games, swipe_history, user_games, taste_profiles, users } from '../db/schema';
import { getIgnoredTagsSet } from './tag-filter';
import { config } from '../config';

export async function recalculateTasteProfile(userId: number): Promise<void> {
  // Load user's ignored tags
  const userRow = db.select({ ignored_tags: users.ignored_tags }).from(users).where(eq(users.id, userId)).get();
  const userIgnoredTags: string[] | undefined = userRow?.ignored_tags ? JSON.parse(userRow.ignored_tags) : undefined;
  const ignoredSet = getIgnoredTagsSet(userIgnoredTags);
  // Fetch all user_games with game data
  const userGamesRows = db
    .select({
      playtime_mins: user_games.playtime_mins,
      genres: games.genres,
      tags: games.tags,
      price_cents: games.price_cents,
    })
    .from(user_games)
    .innerJoin(games, eq(user_games.game_id, games.id))
    .where(eq(user_games.user_id, userId))
    .all();

  // Fetch all swipe_history with game data
  const swipeRows = db
    .select({
      decision: swipe_history.decision,
      genres: games.genres,
      tags: games.tags,
      price_cents: games.price_cents,
    })
    .from(swipe_history)
    .innerJoin(games, eq(swipe_history.game_id, games.id))
    .where(eq(swipe_history.user_id, userId))
    .all();

  // Calculate genre_scores
  const genreScoresRaw: Record<string, number> = {};
  const tagScoresRaw: Record<string, number> = {};

  for (const row of userGamesRows) {
    const playtime = row.playtime_mins ?? 0;
    const tw = config.tasteWeights;
    const weight = playtime > 600 ? tw.highPlaytime : playtime >= 60 ? tw.mediumPlaytime : tw.lowPlaytime;

    const genres: string[] = row.genres ? JSON.parse(row.genres) : [];
    for (const g of genres) {
      genreScoresRaw[g] = (genreScoresRaw[g] ?? 0) + weight;
    }

    const tags: string[] = row.tags ? JSON.parse(row.tags) : [];
    for (const t of tags) {
      if (!ignoredSet.has(t.toLowerCase())) {
        tagScoresRaw[t] = (tagScoresRaw[t] ?? 0) + weight;
      }
    }
  }

  for (const row of swipeRows) {
    const sw = config.tasteWeights;
    const weight = row.decision === 'yes' ? sw.swipeYes : row.decision === 'maybe' ? sw.swipeMaybe : sw.swipeNo;

    const genres: string[] = row.genres ? JSON.parse(row.genres) : [];
    for (const g of genres) {
      genreScoresRaw[g] = (genreScoresRaw[g] ?? 0) + weight;
    }

    const tags: string[] = row.tags ? JSON.parse(row.tags) : [];
    for (const t of tags) {
      if (!ignoredSet.has(t.toLowerCase())) {
        tagScoresRaw[t] = (tagScoresRaw[t] ?? 0) + weight;
      }
    }
  }

  // Normalize scores to 0-1 range
  const normalize = (scores: Record<string, number>): Record<string, number> => {
    const values = Object.values(scores);
    if (values.length === 0) return {};
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(scores)) {
      result[key] = range === 0 ? 0.5 : Math.round(((val - min) / range) * 100) / 100;
    }
    return result;
  };

  const genreScores = normalize(genreScoresRaw);
  const tagScores = normalize(tagScoresRaw);

  // Calculate price_pref from owned + yes-swiped games
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

  const playtimePref = {
    avgHours,
    preferLong: avgHours > 20,
  };

  const now = Math.floor(Date.now() / 1000);

  // Upsert into taste_profiles
  db.insert(taste_profiles)
    .values({
      user_id: userId,
      genre_scores: JSON.stringify(genreScores),
      tag_scores: JSON.stringify(tagScores),
      price_pref: JSON.stringify(pricePref),
      playtime_pref: JSON.stringify(playtimePref),
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: taste_profiles.user_id,
      set: {
        genre_scores: JSON.stringify(genreScores),
        tag_scores: JSON.stringify(tagScores),
        price_pref: JSON.stringify(pricePref),
        playtime_pref: JSON.stringify(playtimePref),
        updated_at: now,
      },
    })
    .run();
}
