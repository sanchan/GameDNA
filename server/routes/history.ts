import { Hono } from 'hono';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
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
  const dateRange = c.req.query('dateRange');

  const conditions: ReturnType<typeof eq>[] = [eq(swipe_history.user_id, userId)];
  if (filterDecision && ['yes', 'no', 'maybe'].includes(filterDecision)) {
    conditions.push(eq(swipe_history.decision, filterDecision));
  }
  if (search) {
    // Escape LIKE special characters to prevent unintended wildcards
    const escapedSearch = search.replace(/[%_]/g, '\\$&');
    conditions.push(sql`${games.name} LIKE ${'%' + escapedSearch + '%'} ESCAPE '\\'`);
  }
  if (dateRange && dateRange !== 'all') {
    const now = Math.floor(Date.now() / 1000);
    const ranges: Record<string, number> = {
      '7days': 7 * 86400,
      '30days': 30 * 86400,
      '3months': 90 * 86400,
      '6months': 180 * 86400,
      'year': 365 * 86400,
    };
    const seconds = ranges[dateRange];
    if (seconds) {
      conditions.push(gte(swipe_history.swiped_at, now - seconds));
    }
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

// GET /api/history/stats — temporal swipe statistics (daily counts for last 30 days)
history.get('/stats', async (c) => {
  const userId = c.get('userId');

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;

  const rows = db
    .select({
      day: sql<string>`date(${swipe_history.swiped_at}, 'unixepoch')`,
      decision: swipe_history.decision,
      count: sql<number>`count(*)`,
    })
    .from(swipe_history)
    .where(and(
      eq(swipe_history.user_id, userId),
      gte(swipe_history.swiped_at, thirtyDaysAgo),
    ))
    .groupBy(sql`date(${swipe_history.swiped_at}, 'unixepoch')`, swipe_history.decision)
    .all();

  // Build daily stats map
  const dailyStats: Record<string, { yes: number; no: number; maybe: number }> = {};
  for (const row of rows) {
    if (!dailyStats[row.day]) {
      dailyStats[row.day] = { yes: 0, no: 0, maybe: 0 };
    }
    const decision = row.decision as 'yes' | 'no' | 'maybe';
    dailyStats[row.day][decision] = row.count;
  }

  // Fill in missing days
  const result: { date: string; yes: number; no: number; maybe: number; total: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const stats = dailyStats[dateStr] ?? { yes: 0, no: 0, maybe: 0 };
    result.push({ date: dateStr, ...stats, total: stats.yes + stats.no + stats.maybe });
  }

  return c.json(result);
});

export default history;
