import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and, notInArray, desc, gte, lte, like, sql } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { games, swipe_history, user_games, taste_profiles } from '../db/schema';
import { recalculateTasteProfile } from '../services/taste-profile';
import type { Game } from '../../shared/types';

const discovery = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

function dbGameToGame(row: typeof games.$inferSelect): Game {
  return {
    id: row.id,
    name: row.name,
    shortDesc: row.short_desc,
    headerImage: row.header_image,
    genres: row.genres ? JSON.parse(row.genres) : [],
    tags: row.tags ? JSON.parse(row.tags) : [],
    releaseDate: row.release_date,
    priceCents: row.price_cents,
    reviewScore: row.review_score,
    reviewCount: row.review_count,
    developers: row.developers ? JSON.parse(row.developers) : [],
    publishers: row.publishers ? JSON.parse(row.publishers) : [],
    platforms: row.platforms ? JSON.parse(row.platforms) : { windows: false, mac: false, linux: false },
  };
}

discovery.get('/queue', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { userId } = session;

  // Parse filter params
  const minPrice = c.req.query('minPrice');
  const maxPrice = c.req.query('maxPrice');
  const minReviewScore = c.req.query('minReviewScore');
  const genresParam = c.req.query('genres');

  // Get IDs already swiped
  const swipedRows = db
    .select({ gameId: swipe_history.game_id })
    .from(swipe_history)
    .where(eq(swipe_history.user_id, userId))
    .all();
  const swipedIds = swipedRows.map((r) => r.gameId);

  // Get IDs already owned
  const ownedRows = db
    .select({ gameId: user_games.game_id })
    .from(user_games)
    .where(eq(user_games.user_id, userId))
    .all();
  const ownedIds = ownedRows.map((r) => r.gameId!);

  const excludeIds = [...new Set([...swipedIds, ...ownedIds])];

  // Build conditions
  const conditions: any[] = [];

  if (excludeIds.length > 0) {
    conditions.push(notInArray(games.id, excludeIds));
  }

  if (minPrice !== undefined) {
    conditions.push(gte(games.price_cents, Number(minPrice)));
  }
  if (maxPrice !== undefined) {
    conditions.push(lte(games.price_cents, Number(maxPrice)));
  }
  if (minReviewScore !== undefined) {
    conditions.push(gte(games.review_score, Number(minReviewScore)));
  }
  if (genresParam) {
    const genreList = genresParam.split(',').map((g) => g.trim().toLowerCase());
    for (const genre of genreList) {
      conditions.push(like(games.genres, `%${genre}%`));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch taste profile for personalized scoring
  const profile = db
    .select()
    .from(taste_profiles)
    .where(eq(taste_profiles.user_id, userId))
    .get();

  const genreScores: Record<string, number> = profile?.genre_scores
    ? JSON.parse(profile.genre_scores)
    : {};
  const tagScores: Record<string, number> = profile?.tag_scores
    ? JSON.parse(profile.tag_scores)
    : {};

  const topGenres = new Set(
    Object.entries(genreScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name]) => name.toLowerCase()),
  );
  const topTags = new Set(
    Object.entries(tagScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([name]) => name.toLowerCase()),
  );

  const hasProfile = topGenres.size > 0 || topTags.size > 0;

  // Fetch more candidates than needed so we can score and sort
  const rows = db
    .select()
    .from(games)
    .where(whereClause)
    .orderBy(desc(games.review_count), desc(games.review_score))
    .limit(hasProfile ? 200 : 10)
    .all();

  if (!hasProfile) {
    // No taste profile yet — fall back to popular games
    return c.json(rows.map(dbGameToGame));
  }

  // Score each game by taste match
  const scored = rows.map((game) => {
    const gameGenres: string[] = game.genres ? JSON.parse(game.genres) : [];
    const gameTags: string[] = game.tags ? JSON.parse(game.tags) : [];

    const genreMatch = gameGenres.filter((g) => topGenres.has(g.toLowerCase())).length / Math.max(topGenres.size, 1);
    const tagMatch = gameTags.filter((t) => topTags.has(t.toLowerCase())).length / Math.max(topTags.size, 1);
    const reviewNorm = (game.review_score ?? 50) / 100;

    // Recency boost
    let recency = 0.5;
    if (game.release_date) {
      const releaseYear = parseInt(game.release_date.slice(0, 4));
      const currentYear = new Date().getFullYear();
      if (!isNaN(releaseYear)) {
        const age = currentYear - releaseYear;
        recency = Math.max(0, 1 - age / 10);
      }
    }

    const score = 0.4 * genreMatch + 0.3 * tagMatch + 0.2 * reviewNorm + 0.1 * recency;
    return { game, score };
  });

  // Sort by taste score descending, add some randomness to avoid showing same order
  scored.sort((a, b) => b.score - a.score);

  // Take top 30, shuffle slightly for variety, return 10
  const top = scored.slice(0, 30);
  for (let i = top.length - 1; i > 0; i--) {
    // Only shuffle within small windows to keep high-scoring games near top
    const j = Math.max(0, i - Math.floor(Math.random() * 5));
    [top[i], top[j]] = [top[j], top[i]];
  }

  const result: Game[] = top.slice(0, 10).map((s) => dbGameToGame(s.game));
  return c.json(result);
});

discovery.post('/swipe', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { userId } = session;
  const body = await c.req.json<{ gameId: number; decision: string }>();

  if (!body.gameId || !['yes', 'no', 'maybe'].includes(body.decision)) {
    return c.json({ error: 'Invalid request: gameId and decision (yes/no/maybe) required' }, 400);
  }

  const nowUnix = Math.floor(Date.now() / 1000);

  db.insert(swipe_history)
    .values({
      user_id: userId,
      game_id: body.gameId,
      decision: body.decision,
      swiped_at: nowUnix,
    })
    .onConflictDoUpdate({
      target: [swipe_history.user_id, swipe_history.game_id],
      set: {
        decision: body.decision,
        swiped_at: nowUnix,
      },
    })
    .run();

  // Fire and forget: recalculate taste profile
  recalculateTasteProfile(userId).catch(() => {});

  return c.json({ success: true });
});

export default discovery;
