import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and, desc } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { game_status, games } from '../db/schema';

const gameStatusRoutes = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

// GET /api/game-status — all statuses for user
gameStatusRoutes.get('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const statusFilter = c.req.query('status');

  const conditions = [eq(game_status.user_id, session.userId)];
  if (statusFilter) {
    conditions.push(eq(game_status.status, statusFilter));
  }

  const rows = db
    .select({
      game_id: game_status.game_id,
      status: game_status.status,
      started_at: game_status.started_at,
      completed_at: game_status.completed_at,
      updated_at: game_status.updated_at,
      name: games.name,
      header_image: games.header_image,
      genres: games.genres,
      review_score: games.review_score,
    })
    .from(game_status)
    .innerJoin(games, eq(game_status.game_id, games.id))
    .where(and(...conditions))
    .orderBy(desc(game_status.updated_at))
    .all();

  return c.json(rows.map((r) => ({
    gameId: r.game_id,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    updatedAt: r.updated_at,
    game: {
      id: r.game_id,
      name: r.name,
      headerImage: r.header_image,
      genres: r.genres ? JSON.parse(r.genres) : [],
      reviewScore: r.review_score,
    },
  })));
});

// GET /api/game-status/:gameId
gameStatusRoutes.get('/:gameId', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const gameId = Number(c.req.param('gameId'));
  const row = db
    .select()
    .from(game_status)
    .where(and(eq(game_status.user_id, session.userId), eq(game_status.game_id, gameId)))
    .get();

  if (!row) return c.json({ gameId, status: null });

  return c.json({
    gameId: row.game_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  });
});

// PUT /api/game-status/:gameId
gameStatusRoutes.put('/:gameId', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const gameId = Number(c.req.param('gameId'));
  const { status } = await c.req.json<{ status: string | null }>();
  const now = Math.floor(Date.now() / 1000);

  const validStatuses = ['playing', 'completed', 'abandoned', 'plan_to_play'];

  if (status === null) {
    db.delete(game_status)
      .where(and(eq(game_status.user_id, session.userId), eq(game_status.game_id, gameId)))
      .run();
    return c.json({ success: true });
  }

  if (!validStatuses.includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  db.insert(game_status)
    .values({
      user_id: session.userId,
      game_id: gameId,
      status,
      started_at: status === 'playing' ? now : null,
      completed_at: status === 'completed' ? now : null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [game_status.user_id, game_status.game_id],
      set: {
        status,
        ...(status === 'completed' ? { completed_at: now } : {}),
        ...(status === 'playing' ? { started_at: now } : {}),
        updated_at: now,
      },
    })
    .run();

  return c.json({ success: true });
});

export default gameStatusRoutes;
