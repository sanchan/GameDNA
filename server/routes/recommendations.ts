import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { getCookie } from 'hono/cookie';
import { eq, and, desc } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { games, recommendations } from '../db/schema';
import { generateRecommendations, explainRecommendation } from '../services/recommendation';
import type { Game, Recommendation } from '../../shared/types';

const recommendationRoutes = new Hono();

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

recommendationRoutes.post('/generate', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const count = await generateRecommendations(session.userId);
  return c.json({ count });
});

recommendationRoutes.get('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const limit = Number(c.req.query('limit') || '20');
  const offset = Number(c.req.query('offset') || '0');

  const rows = db
    .select({
      rec: recommendations,
      game: games,
    })
    .from(recommendations)
    .innerJoin(games, eq(recommendations.game_id, games.id))
    .where(
      and(
        eq(recommendations.user_id, session.userId),
        eq(recommendations.dismissed, 0),
      ),
    )
    .orderBy(desc(recommendations.score))
    .limit(limit)
    .offset(offset)
    .all();

  const result: Recommendation[] = rows.map((row) => ({
    id: row.rec.id,
    game: dbGameToGame(row.game),
    score: row.rec.score ?? 0,
    aiExplanation: row.rec.ai_explanation,
    generatedAt: row.rec.generated_at ?? 0,
  }));

  return c.json(result);
});

recommendationRoutes.get('/:id/explain', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const recId = Number(c.req.param('id'));
  const rec = db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.id, recId), eq(recommendations.user_id, session.userId)))
    .get();

  if (!rec) return c.json({ error: 'Recommendation not found' }, 404);

  const result = await explainRecommendation(session.userId, rec.game_id);

  if (typeof result === 'string') {
    return c.text(result);
  }

  // Stream the response
  return streamText(c, async (stream) => {
    for await (const token of result) {
      await stream.write(token);
    }
  });
});

recommendationRoutes.post('/:id/dismiss', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const recId = Number(c.req.param('id'));

  db.update(recommendations)
    .set({ dismissed: 1 })
    .where(and(eq(recommendations.id, recId), eq(recommendations.user_id, session.userId)))
    .run();

  return c.json({ success: true });
});

export default recommendationRoutes;
