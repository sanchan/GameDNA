import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and, desc } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { price_alerts, games } from '../db/schema';
import { getAppDetails, storeApiLimiter } from '../services/steam-api';

const dealsRoutes = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

// GET /api/deals — list user's price alerts
dealsRoutes.get('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const rows = db
    .select({
      id: price_alerts.id,
      game_id: price_alerts.game_id,
      target_price_cents: price_alerts.target_price_cents,
      current_price_cents: price_alerts.current_price_cents,
      last_checked: price_alerts.last_checked,
      alerted: price_alerts.alerted,
      created_at: price_alerts.created_at,
      name: games.name,
      header_image: games.header_image,
      price_cents: games.price_cents,
      price_currency: games.price_currency,
      review_score: games.review_score,
    })
    .from(price_alerts)
    .innerJoin(games, eq(price_alerts.game_id, games.id))
    .where(eq(price_alerts.user_id, session.userId))
    .orderBy(desc(price_alerts.created_at))
    .all();

  return c.json(rows.map((r) => ({
    id: r.id,
    gameId: r.game_id,
    targetPriceCents: r.target_price_cents,
    currentPriceCents: r.current_price_cents ?? r.price_cents,
    lastChecked: r.last_checked,
    alerted: !!r.alerted,
    game: {
      id: r.game_id,
      name: r.name,
      headerImage: r.header_image,
      priceCents: r.price_cents,
      priceCurrency: r.price_currency,
      reviewScore: r.review_score,
    },
  })));
});

// POST /api/deals — create price alert
dealsRoutes.post('/', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { gameId, targetPriceCents } = await c.req.json<{ gameId: number; targetPriceCents?: number }>();

  // Get current price
  const game = db.select({ price_cents: games.price_cents }).from(games).where(eq(games.id, gameId)).get();

  db.insert(price_alerts)
    .values({
      user_id: session.userId,
      game_id: gameId,
      target_price_cents: targetPriceCents ?? null,
      current_price_cents: game?.price_cents ?? null,
      last_checked: Math.floor(Date.now() / 1000),
    })
    .onConflictDoNothing()
    .run();

  return c.json({ success: true });
});

// DELETE /api/deals/:id
dealsRoutes.delete('/:id', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const id = Number(c.req.param('id'));
  db.delete(price_alerts)
    .where(and(eq(price_alerts.id, id), eq(price_alerts.user_id, session.userId)))
    .run();

  return c.json({ success: true });
});

// POST /api/deals/check — check prices for all alerts
dealsRoutes.post('/check', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const alerts = db
    .select()
    .from(price_alerts)
    .where(eq(price_alerts.user_id, session.userId))
    .all();

  const now = Math.floor(Date.now() / 1000);
  let deals: { gameId: number; gameName: string; oldPrice: number; newPrice: number }[] = [];

  // Check up to 5 games at a time to avoid rate limits
  for (const alert of alerts.slice(0, 5)) {
    try {
      await storeApiLimiter.acquire();
      const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${alert.game_id}`);
      if (!res.ok) continue;
      const data = await res.json() as Record<string, { success: boolean; data?: { price_overview?: { final?: number }; name?: string } }>;
      const entry = data[String(alert.game_id)];
      if (!entry?.success || !entry.data) continue;

      const newPrice = entry.data.price_overview?.final ?? null;
      const gameName = entry.data.name ?? '';

      db.update(price_alerts)
        .set({ current_price_cents: newPrice, last_checked: now })
        .where(eq(price_alerts.id, alert.id))
        .run();

      if (newPrice !== null && alert.target_price_cents !== null && newPrice <= alert.target_price_cents) {
        deals.push({
          gameId: alert.game_id,
          gameName,
          oldPrice: alert.current_price_cents ?? 0,
          newPrice,
        });
        db.update(price_alerts).set({ alerted: 1 }).where(eq(price_alerts.id, alert.id)).run();
      }
    } catch {
      continue;
    }
  }

  return c.json({ checked: Math.min(alerts.length, 5), deals });
});

export default dealsRoutes;
