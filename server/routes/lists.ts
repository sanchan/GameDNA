import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { bookmarks, games, user_games } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { config } from '../config';
import type { Game } from '../../shared/types';

type AuthEnv = {
  Variables: {
    userId: number;
  };
};

const lists = new Hono<AuthEnv>();

lists.use('*', requireAuth);

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

function parsePagination(c: { req: { query: (k: string) => string | undefined } }) {
  const limit = Math.min(
    parseInt(c.req.query('limit') ?? String(config.defaultPageSize), 10) || config.defaultPageSize,
    config.maxPageSize,
  );
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
  return { limit, offset };
}

// GET /api/lists/library — owned games (paginated)
lists.get('/library', async (c) => {
  const userId = c.get('userId');
  const { limit, offset } = parsePagination(c);

  const whereClause = and(eq(user_games.user_id, userId), eq(user_games.from_wishlist, 0));

  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(user_games)
    .where(whereClause)
    .get();

  const rows = db
    .select({
      userGame: user_games,
      game: games,
    })
    .from(user_games)
    .innerJoin(games, eq(user_games.game_id, games.id))
    .where(whereClause)
    .orderBy(desc(user_games.last_played))
    .limit(limit)
    .offset(offset)
    .all();

  return c.json({
    items: rows.map((r) => ({
      game: dbGameToGame(r.game),
      playtimeMins: r.userGame.playtime_mins ?? 0,
      lastPlayed: r.userGame.last_played ?? null,
    })),
    total: countRow?.count ?? 0,
    limit,
    offset,
  });
});

// GET /api/lists/wishlist — Steam wishlist games (paginated)
lists.get('/wishlist', async (c) => {
  const userId = c.get('userId');
  const { limit, offset } = parsePagination(c);

  const whereClause = and(eq(user_games.user_id, userId), eq(user_games.from_wishlist, 1));

  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(user_games)
    .where(whereClause)
    .get();

  const rows = db
    .select({
      userGame: user_games,
      game: games,
    })
    .from(user_games)
    .innerJoin(games, eq(user_games.game_id, games.id))
    .where(whereClause)
    .orderBy(desc(user_games.synced_at))
    .limit(limit)
    .offset(offset)
    .all();

  return c.json({
    items: rows.map((r) => dbGameToGame(r.game)),
    total: countRow?.count ?? 0,
    limit,
    offset,
  });
});

// GET /api/lists/bookmarks — bookmarked games (paginated)
lists.get('/bookmarks', async (c) => {
  const userId = c.get('userId');
  const { limit, offset } = parsePagination(c);

  const whereClause = eq(bookmarks.user_id, userId);

  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(whereClause)
    .get();

  const rows = db
    .select({
      bookmark: bookmarks,
      game: games,
    })
    .from(bookmarks)
    .innerJoin(games, eq(bookmarks.game_id, games.id))
    .where(whereClause)
    .orderBy(desc(bookmarks.created_at))
    .limit(limit)
    .offset(offset)
    .all();

  return c.json({
    items: rows.map((r) => dbGameToGame(r.game)),
    total: countRow?.count ?? 0,
    limit,
    offset,
  });
});

// GET /api/lists/bookmarks/ids — all bookmarked game IDs (for UI state)
lists.get('/bookmarks/ids', async (c) => {
  const userId = c.get('userId');

  const rows = db
    .select({ gameId: bookmarks.game_id })
    .from(bookmarks)
    .where(eq(bookmarks.user_id, userId))
    .all();

  return c.json(rows.map((r) => r.gameId));
});

// POST /api/lists/bookmarks/:gameId — add bookmark
lists.post('/bookmarks/:gameId', async (c) => {
  const userId = c.get('userId');
  const gameId = Number(c.req.param('gameId'));

  db.insert(bookmarks)
    .values({ user_id: userId, game_id: gameId })
    .onConflictDoNothing()
    .run();

  return c.json({ success: true, bookmarked: true });
});

// DELETE /api/lists/bookmarks/:gameId — remove bookmark
lists.delete('/bookmarks/:gameId', async (c) => {
  const userId = c.get('userId');
  const gameId = Number(c.req.param('gameId'));

  db.delete(bookmarks)
    .where(and(eq(bookmarks.user_id, userId), eq(bookmarks.game_id, gameId)))
    .run();

  return c.json({ success: true, bookmarked: false });
});

export default lists;
