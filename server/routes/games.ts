import { Hono } from 'hono';
import { eq, and, like, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { games } from '../db/schema';
import { getCachedGame, cacheGame } from '../services/game-cache';
import { storeApiLimiter } from '../services/steam-api';

const gamesRouter = new Hono();

gamesRouter.get('/search', async (c) => {
  const q = c.req.query('q');
  const genre = c.req.query('genre');
  const minScore = c.req.query('minScore');
  const maxPrice = c.req.query('maxPrice');
  const page = parseInt(c.req.query('page') ?? '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
  const offset = (page - 1) * limit;

  const conditions = [];

  if (q) {
    conditions.push(like(games.name, `%${q}%`));
  }

  if (genre) {
    conditions.push(like(games.genres, `%${genre}%`));
  }

  if (minScore) {
    conditions.push(gte(games.review_score, parseInt(minScore, 10)));
  }

  if (maxPrice) {
    // maxPrice is in dollars, price_cents is in cents
    conditions.push(lte(games.price_cents, parseInt(maxPrice, 10) * 100));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(games)
      .where(where)
      .limit(limit)
      .offset(offset)
      .all(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(games)
      .where(where)
      .get(),
  ]);

  const total = countResult?.count ?? 0;

  return c.json({
    games: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

gamesRouter.get('/:appid', async (c) => {
  const appid = parseInt(c.req.param('appid'), 10);
  if (isNaN(appid)) {
    return c.json({ error: 'Invalid appid' }, 400);
  }

  // Try cache first
  let game = await getCachedGame(appid);
  if (!game) {
    // Fetch and cache
    game = await cacheGame(appid);
  }

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  return c.json(game);
});

// GET /api/games/:appid/media — fetch screenshots + movies from Steam on-demand
gamesRouter.get('/:appid/media', async (c) => {
  const appid = parseInt(c.req.param('appid'), 10);
  if (isNaN(appid)) {
    return c.json({ error: 'Invalid appid' }, 400);
  }

  try {
    await storeApiLimiter.acquire();
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}`,
    );
    if (!res.ok) return c.json({ screenshots: [], movies: [] });

    const data = (await res.json()) as Record<
      string,
      { success: boolean; data?: Record<string, unknown> }
    >;
    const entry = data[String(appid)];
    if (!entry?.success || !entry.data) {
      return c.json({ screenshots: [], movies: [] });
    }

    const d = entry.data;

    const screenshots = (
      (d.screenshots as Array<{ id: number; path_thumbnail: string; path_full: string }>) ?? []
    ).map((s) => ({
      id: s.id,
      thumbnail: s.path_thumbnail,
      full: s.path_full,
    }));

    const movies = (
      (d.movies as Array<{
        id: number;
        name: string;
        thumbnail: string;
        webm?: { '480': string; max: string };
        mp4?: { '480': string; max: string };
      }>) ?? []
    ).map((m) => ({
      id: m.id,
      name: m.name,
      thumbnail: m.thumbnail,
      webm480: m.webm?.['480'] ?? null,
      webmMax: m.webm?.max ?? null,
      mp4480: m.mp4?.['480'] ?? null,
      mp4Max: m.mp4?.max ?? null,
    }));

    // Cache for 1 hour
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json({ screenshots, movies });
  } catch {
    return c.json({ screenshots: [], movies: [] });
  }
});

export default gamesRouter;
