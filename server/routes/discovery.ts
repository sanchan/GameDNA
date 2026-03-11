import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and, notInArray, desc, gte, lte, like, sql } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { games, swipe_history, user_games } from '../db/schema';
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

  const rows = db
    .select()
    .from(games)
    .where(whereClause)
    .orderBy(desc(games.review_count), desc(games.review_score))
    .limit(10)
    .all();

  const result: Game[] = rows.map(dbGameToGame);
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
