import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and, notInArray, desc, like, sql } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { games, user_games, swipe_history } from '../db/schema';
import type { Game } from '../../shared/types';

const similarRoutes = new Hono();

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
    priceCurrency: row.price_currency,
    reviewScore: row.review_score,
    reviewCount: row.review_count,
    developers: row.developers ? JSON.parse(row.developers) : [],
    publishers: row.publishers ? JSON.parse(row.publishers) : [],
    platforms: row.platforms ? JSON.parse(row.platforms) : { windows: false, mac: false, linux: false },
  };
}

// GET /api/similar/:appid — find games similar to a given game
similarRoutes.get('/:appid', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const appid = Number(c.req.param('appid'));

  // Get the reference game
  const refGame = db.select().from(games).where(eq(games.id, appid)).get();
  if (!refGame) return c.json({ error: 'Game not found' }, 404);

  const refGenres: string[] = refGame.genres ? JSON.parse(refGame.genres) : [];
  const refTags: string[] = refGame.tags ? JSON.parse(refGame.tags) : [];

  if (refGenres.length === 0 && refTags.length === 0) {
    return c.json([]);
  }

  // Get IDs to exclude (the game itself + already swiped)
  const swipedRows = db
    .select({ gameId: swipe_history.game_id })
    .from(swipe_history)
    .where(eq(swipe_history.user_id, session.userId))
    .all();
  const excludeIds = [appid, ...swipedRows.map((r) => r.gameId)];

  // Find candidates that share at least one genre
  const conditions: any[] = [notInArray(games.id, excludeIds)];

  // Match any of the reference genres
  for (const genre of refGenres.slice(0, 3)) {
    conditions.push(like(games.genres, `%${genre}%`));
  }

  const candidates = db
    .select()
    .from(games)
    .where(and(...conditions))
    .orderBy(desc(games.review_count))
    .limit(100)
    .all();

  // Score by similarity
  const refGenreSet = new Set(refGenres.map((g) => g.toLowerCase()));
  const refTagSet = new Set(refTags.map((t) => t.toLowerCase()));

  const scored = candidates.map((game) => {
    const gameGenres: string[] = game.genres ? JSON.parse(game.genres) : [];
    const gameTags: string[] = game.tags ? JSON.parse(game.tags) : [];

    const genreOverlap = gameGenres.filter((g) => refGenreSet.has(g.toLowerCase())).length;
    const tagOverlap = gameTags.filter((t) => refTagSet.has(t.toLowerCase())).length;

    const genreScore = genreOverlap / Math.max(refGenreSet.size, 1);
    const tagScore = tagOverlap / Math.max(refTagSet.size, 1);
    const reviewBonus = (game.review_score ?? 50) / 100 * 0.2;

    const score = genreScore * 0.5 + tagScore * 0.3 + reviewBonus;

    return { game, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return c.json(
    scored.slice(0, 12).map((s) => ({
      game: dbGameToGame(s.game),
      similarity: Math.round(s.score * 100),
    }))
  );
});

export default similarRoutes;
