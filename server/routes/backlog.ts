import { Hono } from 'hono';
import { eq, and, lt, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { games, user_games, taste_profiles } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { generateJSON } from '../services/ollama';
import type { Game } from '../../shared/types';

const backlog = new Hono();

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

backlog.use('*', requireAuth);

backlog.get('/', async (c) => {
  const userId = c.get('userId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

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
    .orderBy(
      // Games with some playtime first, then by review score
      sql`CASE WHEN ${user_games.playtime_mins} > 0 THEN 0 ELSE 1 END`,
      desc(games.review_score),
    )
    .limit(limit)
    .offset(offset)
    .all();

  const result = rows.map((row) => ({
    game: dbGameToGame(row.game),
    playtimeMins: row.playtime_mins ?? 0,
    fromWishlist: row.from_wishlist === 1,
  }));

  return c.json(result);
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
