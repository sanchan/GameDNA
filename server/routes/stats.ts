import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and, desc, gte, sql, lt } from 'drizzle-orm';
import { getSession } from '../lib/session';
import { db } from '../db';
import { games, user_games, swipe_history, taste_profiles, profile_snapshots } from '../db/schema';
import type { Game } from '../../shared/types';

const statsRoutes = new Hono();

function requireAuth(c: any): { userId: number } | null {
  const token = getCookie(c, 'session');
  if (!token) return null;
  return getSession(token);
}

function dbGameToGame(row: any): Game {
  return {
    id: row.id ?? row.game_id,
    name: row.name,
    shortDesc: row.short_desc ?? null,
    headerImage: row.header_image ?? null,
    genres: row.genres ? (typeof row.genres === 'string' ? JSON.parse(row.genres) : row.genres) : [],
    tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
    releaseDate: row.release_date ?? null,
    priceCents: row.price_cents ?? null,
    priceCurrency: row.price_currency ?? null,
    reviewScore: row.review_score ?? null,
    reviewCount: row.review_count ?? null,
    developers: row.developers ? (typeof row.developers === 'string' ? JSON.parse(row.developers) : row.developers) : [],
    publishers: row.publishers ? (typeof row.publishers === 'string' ? JSON.parse(row.publishers) : row.publishers) : [],
    platforms: row.platforms ? (typeof row.platforms === 'string' ? JSON.parse(row.platforms) : row.platforms) : { windows: false, mac: false, linux: false },
  };
}

// GET /api/stats/dashboard
statsRoutes.get('/dashboard', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { userId } = session;

  // Total games & playtime
  const ownedRows = db
    .select({ playtime_mins: user_games.playtime_mins, game_id: user_games.game_id, from_wishlist: user_games.from_wishlist })
    .from(user_games)
    .where(eq(user_games.user_id, userId))
    .all();

  const ownedGames = ownedRows.filter((r) => !r.from_wishlist);
  const totalPlaytimeMins = ownedGames.reduce((sum, r) => sum + (r.playtime_mins ?? 0), 0);
  const played = ownedGames.filter((r) => (r.playtime_mins ?? 0) > 0).length;
  const unplayed = ownedGames.length - played;

  // Total library value
  const gameIds = ownedGames.map((r) => r.game_id!);
  let totalValueCents = 0;
  if (gameIds.length > 0) {
    const chunk = gameIds.slice(0, 500);
    const priceRows = db
      .select({ price_cents: games.price_cents })
      .from(games)
      .where(sql`${games.id} IN (${sql.join(chunk.map((id) => sql`${id}`), sql`,`)})`)
      .all();
    totalValueCents = priceRows.reduce((sum, r) => sum + (r.price_cents ?? 0), 0);
  }

  // Games by genre
  const genreMap = new Map<string, number>();
  if (gameIds.length > 0) {
    const chunk = gameIds.slice(0, 500);
    const genreRows = db
      .select({ genres: games.genres })
      .from(games)
      .where(sql`${games.id} IN (${sql.join(chunk.map((id) => sql`${id}`), sql`,`)})`)
      .all();
    for (const row of genreRows) {
      const genres: string[] = row.genres ? JSON.parse(row.genres) : [];
      for (const g of genres) {
        genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
      }
    }
  }
  const gamesByGenre = [...genreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([genre, count]) => ({ genre, count }));

  // Games by release year
  const yearMap = new Map<string, number>();
  if (gameIds.length > 0) {
    const chunk = gameIds.slice(0, 500);
    const yearRows = db
      .select({ release_date: games.release_date })
      .from(games)
      .where(sql`${games.id} IN (${sql.join(chunk.map((id) => sql`${id}`), sql`,`)})`)
      .all();
    for (const row of yearRows) {
      const match = row.release_date?.match(/(\d{4})/);
      const year = match ? match[1] : 'Unknown';
      yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
    }
  }
  const gamesByYear = [...yearMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, count]) => ({ year, count }));

  // Top 10 most played
  const topPlayedRows = db
    .select({
      game_id: user_games.game_id,
      playtime_mins: user_games.playtime_mins,
      name: games.name,
      header_image: games.header_image,
      genres: games.genres,
      tags: games.tags,
      release_date: games.release_date,
      price_cents: games.price_cents,
      price_currency: games.price_currency,
      review_score: games.review_score,
      review_count: games.review_count,
      developers: games.developers,
      publishers: games.publishers,
      platforms: games.platforms,
    })
    .from(user_games)
    .innerJoin(games, eq(user_games.game_id, games.id))
    .where(and(eq(user_games.user_id, userId), eq(user_games.from_wishlist, 0)))
    .orderBy(desc(user_games.playtime_mins))
    .limit(10)
    .all();

  const topPlayedGames = topPlayedRows.map((r) => ({
    game: dbGameToGame({ ...r, id: r.game_id }),
    playtimeMins: r.playtime_mins ?? 0,
  }));

  // Swipe stats
  const swipeRows = db
    .select({ decision: swipe_history.decision })
    .from(swipe_history)
    .where(eq(swipe_history.user_id, userId))
    .all();

  const swipeStats = { yes: 0, no: 0, maybe: 0 };
  for (const row of swipeRows) {
    if (row.decision === 'yes') swipeStats.yes++;
    else if (row.decision === 'no') swipeStats.no++;
    else if (row.decision === 'maybe') swipeStats.maybe++;
  }

  // Recent activity (last 30 days)
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const activityRows = db
    .select({ swiped_at: swipe_history.swiped_at })
    .from(swipe_history)
    .where(and(eq(swipe_history.user_id, userId), gte(swipe_history.swiped_at, thirtyDaysAgo)))
    .all();

  const activityMap = new Map<string, number>();
  for (const row of activityRows) {
    const date = new Date((row.swiped_at ?? 0) * 1000).toISOString().slice(0, 10);
    activityMap.set(date, (activityMap.get(date) ?? 0) + 1);
  }
  const recentActivity = [...activityMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, swipes]) => ({ date, swipes }));

  return c.json({
    totalGames: ownedGames.length,
    totalPlaytimeHours: Math.round(totalPlaytimeMins / 60),
    totalValueCents,
    gamesByGenre,
    gamesByYear,
    playedVsUnplayed: { played, unplayed },
    topPlayedGames,
    swipeStats,
    recentActivity,
  });
});

// GET /api/stats/year-in-review?year=2025
statsRoutes.get('/year-in-review', async (c) => {
  const session = requireAuth(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { userId } = session;
  const year = Number(c.req.query('year') || new Date().getFullYear());
  const yearStart = Math.floor(new Date(`${year}-01-01`).getTime() / 1000);
  const yearEnd = Math.floor(new Date(`${year + 1}-01-01`).getTime() / 1000);

  // Swipes during this year
  const swipeRows = db
    .select({ decision: swipe_history.decision, swiped_at: swipe_history.swiped_at, game_id: swipe_history.game_id })
    .from(swipe_history)
    .where(and(eq(swipe_history.user_id, userId), gte(swipe_history.swiped_at, yearStart), lt(swipe_history.swiped_at, yearEnd)))
    .all();

  const swipeBreakdown = { yes: 0, no: 0, maybe: 0 };
  const monthlyMap = new Map<string, number>();
  const genreSet = new Set<string>();

  for (const row of swipeRows) {
    if (row.decision === 'yes') swipeBreakdown.yes++;
    else if (row.decision === 'no') swipeBreakdown.no++;
    else if (row.decision === 'maybe') swipeBreakdown.maybe++;

    const month = new Date((row.swiped_at ?? 0) * 1000).toISOString().slice(0, 7);
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + 1);
  }

  // Get genres from swiped-yes games
  const yesGameIds = swipeRows.filter((r) => r.decision === 'yes').map((r) => r.game_id);
  if (yesGameIds.length > 0) {
    const chunk = yesGameIds.slice(0, 500);
    const genreRows = db
      .select({ genres: games.genres })
      .from(games)
      .where(sql`${games.id} IN (${sql.join(chunk.map((id) => sql`${id}`), sql`,`)})`)
      .all();
    for (const row of genreRows) {
      const genres: string[] = row.genres ? JSON.parse(row.genres) : [];
      for (const g of genres) genreSet.add(g);
    }
  }

  // Top genre from taste profile
  const profile = db.select().from(taste_profiles).where(eq(taste_profiles.user_id, userId)).get();
  const genreScores: Record<string, number> = profile?.genre_scores ? JSON.parse(profile.genre_scores) : {};
  const topGenre = Object.entries(genreScores).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'Unknown';

  // Top played game
  const topPlayedRow = db
    .select({
      game_id: user_games.game_id,
      playtime_mins: user_games.playtime_mins,
      name: games.name,
      header_image: games.header_image,
      genres: games.genres,
      tags: games.tags,
      release_date: games.release_date,
      price_cents: games.price_cents,
      price_currency: games.price_currency,
      review_score: games.review_score,
      review_count: games.review_count,
      developers: games.developers,
      publishers: games.publishers,
      platforms: games.platforms,
    })
    .from(user_games)
    .innerJoin(games, eq(user_games.game_id, games.id))
    .where(and(eq(user_games.user_id, userId), eq(user_games.from_wishlist, 0)))
    .orderBy(desc(user_games.playtime_mins))
    .limit(1)
    .get();

  const monthlyActivity = [...monthlyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, swipes]) => ({ month, swipes }));

  // Profile evolution: snapshots at start and end of year
  const startSnapshot = db.select().from(profile_snapshots)
    .where(and(eq(profile_snapshots.user_id, userId), gte(profile_snapshots.created_at, yearStart)))
    .limit(1)
    .get();
  const endSnapshot = db.select().from(profile_snapshots)
    .where(and(eq(profile_snapshots.user_id, userId), lt(profile_snapshots.created_at, yearEnd)))
    .orderBy(desc(profile_snapshots.created_at))
    .limit(1)
    .get();

  return c.json({
    year,
    topGenre,
    topPlayedGame: topPlayedRow ? {
      game: dbGameToGame({ ...topPlayedRow, id: topPlayedRow.game_id }),
      playtimeMins: topPlayedRow.playtime_mins ?? 0,
    } : null,
    totalDiscoveries: swipeBreakdown.yes,
    totalSwipes: swipeRows.length,
    genresExplored: genreSet.size,
    swipeBreakdown,
    monthlyActivity,
    profileEvolution: {
      start: startSnapshot?.genre_scores ? JSON.parse(startSnapshot.genre_scores) : {},
      end: endSnapshot?.genre_scores ? JSON.parse(endSnapshot.genre_scores) : {},
    },
  });
});

// POST /api/stats/compare-profiles — compare exported profiles
statsRoutes.post('/compare-profiles', async (c) => {
  const body = await c.req.json<{
    profile1: { name: string; topGenres: { name: string; score: number }[] };
    profile2: { name: string; topGenres: { name: string; score: number }[] };
  }>();

  const genres1 = new Set(body.profile1.topGenres.map((g) => g.name.toLowerCase()));
  const genres2 = new Set(body.profile2.topGenres.map((g) => g.name.toLowerCase()));

  const shared = [...genres1].filter((g) => genres2.has(g));
  const unique1 = [...genres1].filter((g) => !genres2.has(g));
  const unique2 = [...genres2].filter((g) => !genres1.has(g));

  // Cosine similarity on shared genres
  const allGenres = new Set([...genres1, ...genres2]);
  const scores1 = new Map(body.profile1.topGenres.map((g) => [g.name.toLowerCase(), g.score]));
  const scores2 = new Map(body.profile2.topGenres.map((g) => [g.name.toLowerCase(), g.score]));

  let dotProduct = 0, mag1 = 0, mag2 = 0;
  for (const g of allGenres) {
    const s1 = scores1.get(g) ?? 0;
    const s2 = scores2.get(g) ?? 0;
    dotProduct += s1 * s2;
    mag1 += s1 * s1;
    mag2 += s2 * s2;
  }
  const similarity = mag1 > 0 && mag2 > 0 ? dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2)) : 0;

  return c.json({
    user1: body.profile1,
    user2: body.profile2,
    similarity: Math.round(similarity * 100),
    sharedGenres: shared,
    uniqueToUser1: unique1,
    uniqueToUser2: unique2,
  });
});

export default statsRoutes;
