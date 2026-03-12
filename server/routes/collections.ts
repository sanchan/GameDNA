import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and, sql, desc } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { collections, collection_games, games } from '../db/schema';

const collectionsRoutes = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

// GET /api/collections — list user's collections
collectionsRoutes.get('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const rows = db
    .select({
      id: collections.id,
      name: collections.name,
      description: collections.description,
      color: collections.color,
      icon: collections.icon,
      created_at: collections.created_at,
    })
    .from(collections)
    .where(eq(collections.user_id, session.userId))
    .orderBy(desc(collections.created_at))
    .all();

  const result = rows.map((r) => {
    const count = db
      .select({ count: sql<number>`count(*)` })
      .from(collection_games)
      .where(eq(collection_games.collection_id, r.id))
      .get();
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      color: r.color ?? '#8b5cf6',
      icon: r.icon ?? 'fa-folder',
      gameCount: count?.count ?? 0,
      createdAt: r.created_at ?? 0,
    };
  });

  return c.json(result);
});

// POST /api/collections — create collection
collectionsRoutes.post('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<{ name: string; description?: string; color?: string; icon?: string }>();
  if (!body.name?.trim()) return c.json({ error: 'Name required' }, 400);

  const result = db
    .insert(collections)
    .values({
      user_id: session.userId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      color: body.color || '#8b5cf6',
      icon: body.icon || 'fa-folder',
    })
    .returning()
    .get();

  return c.json({ id: result.id, name: result.name, description: result.description, color: result.color, icon: result.icon, gameCount: 0, createdAt: result.created_at });
});

// PUT /api/collections/:id — update collection
collectionsRoutes.put('/:id', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; description?: string; color?: string; icon?: string }>();

  const existing = db.select().from(collections).where(and(eq(collections.id, id), eq(collections.user_id, session.userId))).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(collections)
    .set({
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(body.color ? { color: body.color } : {}),
      ...(body.icon ? { icon: body.icon } : {}),
    })
    .where(eq(collections.id, id))
    .run();

  return c.json({ success: true });
});

// DELETE /api/collections/:id
collectionsRoutes.delete('/:id', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  const existing = db.select().from(collections).where(and(eq(collections.id, id), eq(collections.user_id, session.userId))).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.delete(collection_games).where(eq(collection_games.collection_id, id)).run();
  db.delete(collections).where(eq(collections.id, id)).run();

  return c.json({ success: true });
});

// GET /api/collections/:id/games — list games in collection
collectionsRoutes.get('/:id/games', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  const existing = db.select().from(collections).where(and(eq(collections.id, id), eq(collections.user_id, session.userId))).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const rows = db
    .select({
      game_id: collection_games.game_id,
      added_at: collection_games.added_at,
      name: games.name,
      header_image: games.header_image,
      genres: games.genres,
      review_score: games.review_score,
      price_cents: games.price_cents,
      price_currency: games.price_currency,
    })
    .from(collection_games)
    .innerJoin(games, eq(collection_games.game_id, games.id))
    .where(eq(collection_games.collection_id, id))
    .orderBy(desc(collection_games.added_at))
    .all();

  return c.json(rows.map((r) => ({
    id: r.game_id,
    name: r.name,
    headerImage: r.header_image,
    genres: r.genres ? JSON.parse(r.genres) : [],
    reviewScore: r.review_score,
    priceCents: r.price_cents,
    priceCurrency: r.price_currency,
    addedAt: r.added_at,
  })));
});

// POST /api/collections/:id/games — add game to collection
collectionsRoutes.post('/:id/games', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  const { gameId } = await c.req.json<{ gameId: number }>();

  const existing = db.select().from(collections).where(and(eq(collections.id, id), eq(collections.user_id, session.userId))).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.insert(collection_games)
    .values({ collection_id: id, game_id: gameId })
    .onConflictDoNothing()
    .run();

  return c.json({ success: true });
});

// DELETE /api/collections/:id/games/:gameId — remove game from collection
collectionsRoutes.delete('/:id/games/:gameId', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  const gameId = Number(c.req.param('gameId'));

  db.delete(collection_games)
    .where(and(eq(collection_games.collection_id, id), eq(collection_games.game_id, gameId)))
    .run();

  return c.json({ success: true });
});

export default collectionsRoutes;
