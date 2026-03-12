import { Hono } from 'hono';
import { eq, and, lt, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { games, user_games, taste_profiles, backlog_order } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { generateJSON } from '../services/ollama';
import { config } from '../config';
import type { Game } from '../../shared/types';

type AuthEnv = {
  Variables: {
    userId: number;
  };
};

const backlog = new Hono<AuthEnv>();

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

function estimatePlaytimeHours(genres: string[]): number {
  for (const genre of genres) {
    const key = genre.toLowerCase();
    if (key in config.estimatedPlaytimeByGenre) {
      return config.estimatedPlaytimeByGenre[key];
    }
  }
  return config.estimatedPlaytimeDefault;
}

backlog.use('*', requireAuth);

backlog.get('/', async (c) => {
  const userId = c.get('userId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  // Fetch taste profile for scoring
  const profile = db
    .select()
    .from(taste_profiles)
    .where(eq(taste_profiles.user_id, userId))
    .get();

  const genreScores: Record<string, number> = profile?.genre_scores
    ? JSON.parse(profile.genre_scores)
    : {};
  const tagScores: Record<string, number> = profile?.tag_scores
    ? JSON.parse(profile.tag_scores)
    : {};

  const topGenres = new Set(
    Object.entries(genreScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name]) => name.toLowerCase()),
  );
  const topTags = new Set(
    Object.entries(tagScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([name]) => name.toLowerCase()),
  );

  const hasProfile = topGenres.size > 0 || topTags.size > 0;

  // Fetch all backlog games (low playtime)
  const rows = db
    .select({
      game: games,
      playtime_mins: user_games.playtime_mins,
      from_wishlist: user_games.from_wishlist,
    })
    .from(user_games)
    .innerJoin(games, eq(user_games.game_id, games.id))
    .where(
      and(
        eq(user_games.user_id, userId),
        lt(user_games.playtime_mins, 120),
      )
    )
    .all();

  // Load manual order
  const orderRows = db
    .select({ game_id: backlog_order.game_id, position: backlog_order.position })
    .from(backlog_order)
    .where(eq(backlog_order.user_id, userId))
    .all();
  const manualOrder = new Map(orderRows.map((r) => [r.game_id, r.position]));

  if (!hasProfile) {
    // No taste profile — fall back to review_score ordering
    const sorted = rows
      .sort((a, b) => {
        // Manual order takes precedence
        const aOrder = manualOrder.get(a.game.id);
        const bOrder = manualOrder.get(b.game.id);
        if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
        if (aOrder !== undefined) return -1;
        if (bOrder !== undefined) return 1;
        // Games with some playtime first
        const aHasPlaytime = (a.playtime_mins ?? 0) > 0 ? 0 : 1;
        const bHasPlaytime = (b.playtime_mins ?? 0) > 0 ? 0 : 1;
        if (aHasPlaytime !== bHasPlaytime) return aHasPlaytime - bHasPlaytime;
        return (b.game.review_score ?? 0) - (a.game.review_score ?? 0);
      })
      .slice(offset, offset + limit);

    return c.json(sorted.map((row) => {
      const gameObj = dbGameToGame(row.game);
      return {
        game: gameObj,
        playtimeMins: row.playtime_mins ?? 0,
        fromWishlist: row.from_wishlist === 1,
        estimatedHours: estimatePlaytimeHours(gameObj.genres),
        manualPosition: manualOrder.get(row.game.id) ?? null,
      };
    }));
  }

  // Score each backlog game by taste match
  const scored = rows.map((row) => {
    const gameGenres: string[] = row.game.genres ? JSON.parse(row.game.genres) : [];
    const gameTags: string[] = row.game.tags ? JSON.parse(row.game.tags) : [];

    const genreMatch = gameGenres.filter((g) => topGenres.has(g.toLowerCase())).length / Math.max(topGenres.size, 1);
    const tagMatch = gameTags.filter((t) => topTags.has(t.toLowerCase())).length / Math.max(topTags.size, 1);
    const reviewNorm = (row.game.review_score ?? 50) / 100;

    // Wishlist bonus — user explicitly wanted this game
    const wishlistBonus = row.from_wishlist === 1 ? 0.15 : 0;

    const score = 0.4 * genreMatch + 0.3 * tagMatch + 0.2 * reviewNorm + 0.1 * wishlistBonus;

    return { row, score };
  });

  scored.sort((a, b) => {
    // Manual order takes precedence
    const aOrder = manualOrder.get(a.row.game.id);
    const bOrder = manualOrder.get(b.row.game.id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return b.score - a.score;
  });

  const result = scored
    .slice(offset, offset + limit)
    .map((s) => {
      const gameObj = dbGameToGame(s.row.game);
      return {
        game: gameObj,
        playtimeMins: s.row.playtime_mins ?? 0,
        fromWishlist: s.row.from_wishlist === 1,
        estimatedHours: estimatePlaytimeHours(gameObj.genres),
        manualPosition: manualOrder.get(s.row.game.id) ?? null,
      };
    });

  return c.json(result);
});

backlog.post('/:gameId/mark-played', async (c) => {
  const userId = c.get('userId');
  const gameId = Number(c.req.param('gameId'));

  const existing = db
    .select()
    .from(user_games)
    .where(and(eq(user_games.user_id, userId), eq(user_games.game_id, gameId)))
    .get();

  if (!existing) {
    return c.json({ error: 'Game not found in library' }, 404);
  }

  // Set playtime to 120 mins (the backlog threshold) to move it out of backlog
  const newPlaytime = Math.max(existing.playtime_mins ?? 0, 120);
  db.update(user_games)
    .set({ playtime_mins: newPlaytime })
    .where(and(eq(user_games.user_id, userId), eq(user_games.game_id, gameId)))
    .run();

  return c.json({ success: true });
});

// POST /api/backlog/reorder — set manual priority order
backlog.post('/reorder', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ gameId: number; direction: 'up' | 'down' }>();

  if (!body.gameId || !['up', 'down'].includes(body.direction)) {
    return c.json({ error: 'Invalid request: gameId and direction (up/down) required' }, 400);
  }

  // Get current order for this user
  const existing = db
    .select()
    .from(backlog_order)
    .where(eq(backlog_order.user_id, userId))
    .all();

  const orderMap = new Map(existing.map((r) => [r.game_id, r.position]));

  const currentPos = orderMap.get(body.gameId);
  const newPos = body.direction === 'up'
    ? (currentPos !== undefined ? currentPos - 1 : 0)
    : (currentPos !== undefined ? currentPos + 1 : orderMap.size);

  // Shift other items
  for (const [gameId, pos] of orderMap) {
    if (gameId === body.gameId) continue;
    if (body.direction === 'up' && pos >= newPos && pos < (currentPos ?? orderMap.size)) {
      orderMap.set(gameId, pos + 1);
    } else if (body.direction === 'down' && pos <= newPos && pos > (currentPos ?? -1)) {
      orderMap.set(gameId, pos - 1);
    }
  }
  orderMap.set(body.gameId, Math.max(0, newPos));

  // Upsert all positions
  for (const [gameId, position] of orderMap) {
    db.insert(backlog_order)
      .values({ user_id: userId, game_id: gameId, position })
      .onConflictDoUpdate({
        target: [backlog_order.user_id, backlog_order.game_id],
        set: { position },
      })
      .run();
  }

  return c.json({ success: true });
});

backlog.post('/analyze', async (c) => {
  const userId = c.get('userId');

  // Fetch backlog games
  const backlogRows = db
    .select({
      game: games,
      playtime_mins: user_games.playtime_mins,
      from_wishlist: user_games.from_wishlist,
    })
    .from(user_games)
    .innerJoin(games, eq(user_games.game_id, games.id))
    .where(
      and(
        eq(user_games.user_id, userId),
        lt(user_games.playtime_mins, 120),
      )
    )
    .orderBy(desc(games.review_score))
    .limit(100)
    .all();

  if (backlogRows.length === 0) {
    return c.json({ prioritized: [] });
  }

  // Fetch taste profile
  const profile = db
    .select()
    .from(taste_profiles)
    .where(eq(taste_profiles.user_id, userId))
    .get();

  const genreScores: Record<string, number> = profile?.genre_scores
    ? JSON.parse(profile.genre_scores)
    : {};
  const tagScores: Record<string, number> = profile?.tag_scores
    ? JSON.parse(profile.tag_scores)
    : {};

  const topGenres = Object.entries(genreScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  const topTags = Object.entries(tagScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  const gameList = backlogRows.map((row) => {
    const g = row.game;
    const genres: string[] = g.genres ? JSON.parse(g.genres) : [];
    return `- ${g.name} (appid: ${g.id}, genres: ${genres.join(', ')}, score: ${g.review_score ?? 'N/A'})`;
  }).join('\n');

  const prompt = `Given this gamer's taste profile: Top genres: ${topGenres.join(', ')}. Top tags: ${topTags.join(', ')}.
They have these unplayed games:
${gameList}

Rank the top 10 games they should play next and explain briefly why for each. Return JSON: { "prioritized": [{ "appid": number, "reason": string }] }`;

  type AnalysisResult = { prioritized: { appid: number; reason: string }[] };

  const aiResult = await generateJSON<AnalysisResult>(prompt);

  if (aiResult && aiResult.prioritized) {
    // Enrich with game details
    const gameMap = new Map(
      backlogRows.map((row) => [row.game.id, { game: dbGameToGame(row.game), playtimeMins: row.playtime_mins ?? 0, fromWishlist: row.from_wishlist === 1 }])
    );

    const prioritized = aiResult.prioritized
      .filter((item) => gameMap.has(item.appid))
      .map((item) => ({
        ...gameMap.get(item.appid)!,
        reason: item.reason,
      }));

    return c.json({ prioritized });
  }

  // Fallback: sort by review_score
  const fallback = backlogRows
    .slice(0, 10)
    .map((row) => ({
      game: dbGameToGame(row.game),
      playtimeMins: row.playtime_mins ?? 0,
      fromWishlist: row.from_wishlist === 1,
      reason: 'Recommended based on review score.',
    }));

  return c.json({ prioritized: fallback });
});

export default backlog;
