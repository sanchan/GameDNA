import { Hono } from 'hono';
import { eq, and, desc, like, sql } from 'drizzle-orm';
import { db } from '../db';
import { swipe_history, games } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { recalculateTasteProfile } from '../services/taste-profile';
import type { Game } from '../../shared/types';

type AuthEnv = {
  Variables: {
    userId: number;
  };
};

const history = new Hono<AuthEnv>();

history.use('*', requireAuth);

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

// GET /api/history — paginated swipe history with game details
history.get('/', async (c) => {
  const userId = c.get('userId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 200);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);
  const filterDecision = c.req.query('decision');
  const search = c.req.query('search')?.trim();

  const conditions: ReturnType<typeof eq>[] = [eq(swipe_history.user_id, userId)];
  if (filterDecision && ['yes', 'no', 'maybe'].includes(filterDecision)) {
    conditions.push(eq(swipe_history.decision, filterDecision));
  }
  if (search) {
    conditions.push(like(games.name, `%${search}%`));
  }

  const whereClause = and(...conditions);

  // Get total count for pagination
  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(swipe_history)
    .innerJoin(games, eq(swipe_history.game_id, games.id))
    .where(whereClause)
    .get();

  const total = countRow?.count ?? 0;

  const rows = db
    .select({
      swipe: swipe_history,
      game: games,
    })
    .from(swipe_history)
    .innerJoin(games, eq(swipe_history.game_id, games.id))
    .where(whereClause)
    .orderBy(desc(swipe_history.swiped_at))
    .limit(limit)
    .offset(offset)
    .all();

  const items = rows.map((row) => ({
    id: row.swipe.id,
    game: dbGameToGame(row.game),
    decision: row.swipe.decision,
    swipedAt: row.swipe.swiped_at,
  }));

  return c.json({ items, total, limit, offset });
});

// POST /api/history/:id — update a swipe decision
history.post('/:id', async (c) => {
  const userId = c.get('userId');
  const swipeId = Number(c.req.param('id'));
  const body = await c.req.json<{ decision: string }>();

  if (!['yes', 'no', 'maybe'].includes(body.decision)) {
    return c.json({ error: 'Invalid decision' }, 400);
  }

  // Verify the swipe belongs to this user
  const existing = db
    .select()
    .from(swipe_history)
    .where(eq(swipe_history.id, swipeId))
    .get();

  if (!existing || existing.user_id !== userId) {
    return c.json({ error: 'Not found' }, 404);
  }

  const nowUnix = Math.floor(Date.now() / 1000);

  db.update(swipe_history)
    .set({
      decision: body.decision,
      swiped_at: nowUnix,
    })
    .where(eq(swipe_history.id, swipeId))
    .run();

  // Recalculate taste profile
  recalculateTasteProfile(userId).catch(() => {});

  return c.json({ success: true });
});

// DELETE /api/history/:id — remove a swipe entry
history.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const swipeId = Number(c.req.param('id'));

  const existing = db
    .select()
    .from(swipe_history)
    .where(eq(swipe_history.id, swipeId))
    .get();

  if (!existing || existing.user_id !== userId) {
    return c.json({ error: 'Not found' }, 404);
  }

  db.delete(swipe_history)
    .where(eq(swipe_history.id, swipeId))
    .run();

  // Recalculate taste profile
  recalculateTasteProfile(userId).catch(() => {});

  return c.json({ success: true });
});

export default history;
