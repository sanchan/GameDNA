import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { publisher_blacklist } from '../db/schema';

const blacklistRoutes = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

// GET /api/blacklist
blacklistRoutes.get('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const rows = db
    .select()
    .from(publisher_blacklist)
    .where(eq(publisher_blacklist.user_id, session.userId))
    .all();

  return c.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type ?? 'publisher',
  })));
});

// POST /api/blacklist
blacklistRoutes.post('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { name, type } = await c.req.json<{ name: string; type?: string }>();
  if (!name?.trim()) return c.json({ error: 'Name required' }, 400);

  db.insert(publisher_blacklist)
    .values({
      user_id: session.userId,
      name: name.trim(),
      type: type === 'developer' ? 'developer' : 'publisher',
    })
    .onConflictDoNothing()
    .run();

  return c.json({ success: true });
});

// DELETE /api/blacklist/:id
blacklistRoutes.delete('/:id', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  db.delete(publisher_blacklist)
    .where(and(eq(publisher_blacklist.id, id), eq(publisher_blacklist.user_id, session.userId)))
    .run();

  return c.json({ success: true });
});

export default blacklistRoutes;
