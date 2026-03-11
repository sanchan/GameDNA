import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';
import { users, user_games, games, swipe_history, taste_profiles } from '../db/schema';
import { getOwnedGames, getWishlist } from '../services/steam-api';
import { ensureGamesCached } from '../services/game-cache';
import type { GamingDNA } from '../../shared/types';

type AuthEnv = {
  Variables: {
    userId: number;
  };
};

const user = new Hono<AuthEnv>();

user.use('*', requireAuth);

user.post('/sync', async (c) => {
  const userId = c.get('userId');

  // Get the user's steam_id
  const userRow = db.select().from(users).where(eq(users.id, userId)).get();
  if (!userRow) {
    return c.json({ error: 'User not found' }, 404);
  }

  const steamId = userRow.steam_id;

  // Fetch owned games and wishlist in parallel
  const [ownedGames, wishlistAppids] = await Promise.all([
    getOwnedGames(steamId),
    getWishlist(steamId),
  ]);

  // Collect all appids that need caching
  const ownedAppids = ownedGames.map((g) => g.appid);
  const allAppids = [...new Set([...ownedAppids, ...wishlistAppids])];

  // Cache game metadata
  await ensureGamesCached(allAppids);

  const now = Math.floor(Date.now() / 1000);
  const wishlistSet = new Set(wishlistAppids);

  // Upsert owned games into user_games
  for (const game of ownedGames) {
    db.insert(user_games)
      .values({
        user_id: userId,
        game_id: game.appid,
        playtime_mins: game.playtime_forever,
        last_played: game.rtime_last_played || null,
        from_wishlist: wishlistSet.has(game.appid) ? 1 : 0,
        synced_at: now,
      })
      .onConflictDoUpdate({
        target: [user_games.user_id, user_games.game_id],
        set: {
          playtime_mins: game.playtime_forever,
          last_played: game.rtime_last_played || null,
          from_wishlist: wishlistSet.has(game.appid) ? 1 : 0,
          synced_at: now,
        },
      })
      .run();
  }

  // Upsert wishlist-only games (not already owned)
  const ownedSet = new Set(ownedAppids);
  for (const appid of wishlistAppids) {
    if (ownedSet.has(appid)) continue;
    db.insert(user_games)
      .values({
        user_id: userId,
        game_id: appid,
        playtime_mins: 0,
        last_played: null,
        from_wishlist: 1,
        synced_at: now,
      })
      .onConflictDoUpdate({
        target: [user_games.user_id, user_games.game_id],
        set: {
          from_wishlist: 1,
          synced_at: now,
        },
      })
      .run();
  }

  return c.json({
    gamesCount: ownedGames.length,
    wishlistCount: wishlistAppids.length,
  });
});

user.get('/profile', async (c) => {
  const userId = c.get('userId');

  const userRow = db.select().from(users).where(eq(users.id, userId)).get();
  if (!userRow) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Get game stats
  const stats = db
    .select({
      totalGames: sql<number>`count(*)`,
      totalPlaytime: sql<number>`coalesce(sum(${user_games.playtime_mins}), 0)`,
      wishlistCount: sql<number>`coalesce(sum(case when ${user_games.from_wishlist} = 1 then 1 else 0 end), 0)`,
    })
    .from(user_games)
    .where(eq(user_games.user_id, userId))
    .get();

  return c.json({
    user: {
      id: userRow.id,
      steamId: userRow.steam_id,
      displayName: userRow.display_name,
      avatarUrl: userRow.avatar_url,
      profileUrl: userRow.profile_url,
    },
    stats: {
      totalGames: stats?.totalGames ?? 0,
      totalPlaytimeHours: Math.round((stats?.totalPlaytime ?? 0) / 60),
      wishlistCount: stats?.wishlistCount ?? 0,
    },
  });
});

user.get('/gaming-dna', async (c) => {
  const userId = c.get('userId');

  // Get taste profile
  const tasteProfile = db
    .select()
    .from(taste_profiles)
    .where(eq(taste_profiles.user_id, userId))
    .get();

  const genreScores: Record<string, number> = tasteProfile?.genre_scores
    ? JSON.parse(tasteProfile.genre_scores)
    : {};
  const tagScores: Record<string, number> = tasteProfile?.tag_scores
    ? JSON.parse(tasteProfile.tag_scores)
    : {};

  // Top 8 genres
  const topGenres = Object.entries(genreScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, score]) => ({ name, score }));

  // Top 8 tags
  const topTags = Object.entries(tagScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, score]) => ({ name, score }));

  // Total games and playtime
  const gameStats = db
    .select({
      totalGames: sql<number>`count(*)`,
      totalPlaytime: sql<number>`coalesce(sum(${user_games.playtime_mins}), 0)`,
    })
    .from(user_games)
    .where(eq(user_games.user_id, userId))
    .get();

  // Swipe stats
  const yesCount = db
    .select({ count: sql<number>`count(*)` })
    .from(swipe_history)
    .where(and(eq(swipe_history.user_id, userId), eq(swipe_history.decision, 'yes')))
    .get();

  const noCount = db
    .select({ count: sql<number>`count(*)` })
    .from(swipe_history)
    .where(and(eq(swipe_history.user_id, userId), eq(swipe_history.decision, 'no')))
    .get();

  const maybeCount = db
    .select({ count: sql<number>`count(*)` })
    .from(swipe_history)
    .where(and(eq(swipe_history.user_id, userId), eq(swipe_history.decision, 'maybe')))
    .get();

  const result: GamingDNA = {
    topGenres,
    topTags,
    totalGames: gameStats?.totalGames ?? 0,
    totalPlaytimeHours: Math.round((gameStats?.totalPlaytime ?? 0) / 60),
    swipeStats: {
      yes: yesCount?.count ?? 0,
      no: noCount?.count ?? 0,
      maybe: maybeCount?.count ?? 0,
    },
    aiSummary: tasteProfile?.ai_summary ?? null,
  };

  return c.json(result);
});

export default user;
