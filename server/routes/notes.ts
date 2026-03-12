import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { game_notes } from '../db/schema';

const notesRoutes = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

// GET /api/notes/:gameId
notesRoutes.get('/:gameId', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const gameId = Number(c.req.param('gameId'));
  const note = db
    .select()
    .from(game_notes)
    .where(and(eq(game_notes.user_id, session.userId), eq(game_notes.game_id, gameId)))
    .get();

  if (!note) return c.json({ gameId, content: '', updatedAt: 0 });

  return c.json({ gameId: note.game_id, content: note.content, updatedAt: note.updated_at });
});

// PUT /api/notes/:gameId
notesRoutes.put('/:gameId', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const gameId = Number(c.req.param('gameId'));
  const { content } = await c.req.json<{ content: string }>();
  const now = Math.floor(Date.now() / 1000);

  if (!content?.trim()) {
    db.delete(game_notes)
      .where(and(eq(game_notes.user_id, session.userId), eq(game_notes.game_id, gameId)))
      .run();
    return c.json({ success: true });
  }

  db.insert(game_notes)
    .values({ user_id: session.userId, game_id: gameId, content: content.trim(), updated_at: now })
    .onConflictDoUpdate({
      target: [game_notes.user_id, game_notes.game_id],
      set: { content: content.trim(), updated_at: now },
    })
    .run();

  return c.json({ success: true });
});

export default notesRoutes;
