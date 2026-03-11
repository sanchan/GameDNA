import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';
import { users, user_games, games, swipe_history, taste_profiles } from '../db/schema';
import { getOwnedGames, getWishlist, getPopularGameIds } from '../services/steam-api';
import { ensureGamesCached } from '../services/game-cache';
import { recalculateTasteProfile } from '../services/taste-profile';
import { generateRecommendations } from '../services/recommendation';
import { getSyncStatus, startSync, updateSync } from '../services/sync-manager';
import { DEFAULT_IGNORED_TAGS, getIgnoredTagsSet } from '../services/tag-filter';
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

  // If sync is already in progress, return status
  const existing = getSyncStatus(userId);
  if (existing && existing.step !== 'complete' && existing.step !== 'error') {
    return c.json({ status: 'in_progress' });
  }

  // Get the user's steam_id
  const userRow = db.select().from(users).where(eq(users.id, userId)).get();
  if (!userRow) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Start sync - returns false if already in progress (race condition guard)
  if (!startSync(userId)) {
    return c.json({ status: 'in_progress' });
  }

  const steamId = userRow.steam_id;
  const countryCode = userRow.country_code ?? undefined;
  console.log(`[sync] Starting sync for user ${userId} (steam: ${steamId}, cc: ${countryCode ?? 'auto'})`);

  // Run sync in background (don't await)
  runSyncInBackground(userId, steamId, countryCode);

  return c.json({ status: 'started' });
});

async function runSyncInBackground(userId: number, steamId: string, cc?: string) {
  try {
    // Step 1: Fetch library from Steam Web API (1 call each, fast)
    updateSync(userId, { step: 'fetching-library', progress: 10, detail: 'Fetching your Steam library...' });

    const [ownedGames, wishlistAppids] = await Promise.all([
      getOwnedGames(steamId),
      getWishlist(steamId),
    ]);
    console.log(`[sync] Fetched ${ownedGames.length} owned games, ${wishlistAppids.length} wishlist items`);

    updateSync(userId, {
      progress: 25,
      detail: `Found ${ownedGames.length} games. Saving to library...`,
      gamesCount: ownedGames.length,
      wishlistCount: wishlistAppids.length,
    });

    // Step 2: Insert stub game records for FK constraints (no Steam Store API calls!)
    const now = Math.floor(Date.now() / 1000);
    for (const game of ownedGames) {
      db.insert(games)
        .values({
          id: game.appid,
          name: game.name || `Game ${game.appid}`,
          cached_at: 0,
        })
        .onConflictDoNothing()
        .run();
    }
    for (const appid of wishlistAppids) {
      db.insert(games)
        .values({
          id: appid,
          name: `Game ${appid}`,
          cached_at: 0,
        })
        .onConflictDoNothing()
        .run();
    }

    // Step 3: Upsert owned games into user_games
    updateSync(userId, { step: 'caching-library', progress: 40, detail: 'Saving your game library...' });

    const wishlistSet = new Set(wishlistAppids);
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

    // Upsert wishlist-only games
    const ownedAppids = ownedGames.map((g) => g.appid);
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

    // Step 4: Build taste profile
    updateSync(userId, { step: 'building-profile', progress: 50, detail: 'Building your taste profile...' });

    // Fetch details for top played games only
    const topPlayedAppids = ownedGames
      .filter((g) => g.playtime_forever > 60)
      .sort((a, b) => b.playtime_forever - a.playtime_forever)
      .slice(0, 50)
      .map((g) => g.appid);

    if (topPlayedAppids.length > 0) {
      updateSync(userId, {
        progress: 55,
        detail: `Fetching details for your top ${topPlayedAppids.length} games...`,
      });
      await ensureGamesCached(topPlayedAppids, (cached, total) => {
        const progress = 55 + Math.round((cached / total) * 10);
        updateSync(userId, {
          progress,
          detail: `Fetching game details... (${cached}/${total})`,
        });
      }, cc);
    }

    await recalculateTasteProfile(userId).catch((e) => {
      console.error('[sync] taste profile error:', e);
    });

    // Step 5: Seed popular games for discovery
    updateSync(userId, { step: 'seeding-discovery', progress: 68, detail: 'Loading discovery catalog...' });

    try {
      const popularIds = await getPopularGameIds();
      const allUserAppids = new Set([...ownedAppids, ...wishlistAppids]);
      const discoveryIds = popularIds.filter((id) => !allUserAppids.has(id));
      console.log(`[sync] Seeding ${discoveryIds.length} popular games for discovery`);

      await ensureGamesCached(discoveryIds, (cached, total) => {
        const seedProgress = 68 + Math.round((cached / total) * 15);
        updateSync(userId, {
          progress: seedProgress,
          detail: `Loading discovery catalog... (${cached}/${total})`,
        });
      }, cc);

      console.log('[sync] Popular games seeding complete');
    } catch (e) {
      console.error('[sync] Popular games seeding error:', e);
    }

    // Step 6: Generate recommendations
    updateSync(userId, { step: 'generating-recommendations', progress: 85, detail: 'Generating personalized recommendations...' });

    try {
      const recCount = await generateRecommendations(userId);
      console.log(`[sync] Generated ${recCount} recommendations for user ${userId}`);
      updateSync(userId, { progress: 98, detail: `Generated ${recCount} recommendations!` });
    } catch (e) {
      console.error('[sync] Recommendation generation error:', e);
    }

    // Done
    updateSync(userId, {
      step: 'complete',
      progress: 100,
      detail: 'Sync complete!',
      completedAt: Date.now(),
    });
    console.log(`[sync] Sync complete for user ${userId}`);
  } catch (e) {
    console.error('[sync] Sync error:', e);
    updateSync(userId, {
      step: 'error',
      detail: `Sync failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      completedAt: Date.now(),
    });
  }
}

user.get('/sync-status', async (c) => {
  const userId = c.get('userId');
  const state = getSyncStatus(userId);
  if (!state) {
    return c.json({ step: 'idle', progress: 0, detail: '', gamesCount: 0, wishlistCount: 0 });
  }
  return c.json({
    step: state.step,
    progress: state.progress,
    detail: state.detail,
    gamesCount: state.gamesCount,
    wishlistCount: state.wishlistCount,
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

  // Get user's ignored tags
  const userRow = db.select({ ignored_tags: users.ignored_tags }).from(users).where(eq(users.id, userId)).get();
  const userIgnoredTags: string[] = userRow?.ignored_tags ? JSON.parse(userRow.ignored_tags) : DEFAULT_IGNORED_TAGS;
  const ignoredSet = getIgnoredTagsSet(userIgnoredTags);

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

  // Top 8 tags (excluding ignored)
  const topTags = Object.entries(tagScores)
    .filter(([name]) => !ignoredSet.has(name.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, score]) => ({ name, score }));

  // All tags sorted by score (including ignored, with flag)
  const allTags = Object.entries(tagScores)
    .sort((a, b) => b[1] - a[1])
    .map(([name, score]) => ({ name, score, ignored: ignoredSet.has(name.toLowerCase()) }));

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
    allTags,
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

// Tag management endpoints
user.get('/ignored-tags', async (c) => {
  const userId = c.get('userId');
  const userRow = db.select({ ignored_tags: users.ignored_tags }).from(users).where(eq(users.id, userId)).get();
  const ignoredTags: string[] = userRow?.ignored_tags ? JSON.parse(userRow.ignored_tags) : DEFAULT_IGNORED_TAGS;
  return c.json({ ignoredTags, defaults: DEFAULT_IGNORED_TAGS });
});

user.post('/ignored-tags', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ tag: string; ignored: boolean }>();

  // Get current ignored tags
  const userRow = db.select({ ignored_tags: users.ignored_tags }).from(users).where(eq(users.id, userId)).get();
  const currentTags: string[] = userRow?.ignored_tags ? JSON.parse(userRow.ignored_tags) : [...DEFAULT_IGNORED_TAGS];

  let updated: string[];
  if (body.ignored) {
    // Add to ignored list
    if (!currentTags.some((t) => t.toLowerCase() === body.tag.toLowerCase())) {
      updated = [...currentTags, body.tag];
    } else {
      updated = currentTags;
    }
  } else {
    // Remove from ignored list
    updated = currentTags.filter((t) => t.toLowerCase() !== body.tag.toLowerCase());
  }

  db.update(users)
    .set({ ignored_tags: JSON.stringify(updated) })
    .where(eq(users.id, userId))
    .run();

  // Recalculate taste profile with new ignored tags
  recalculateTasteProfile(userId).catch(() => {});

  return c.json({ ignoredTags: updated });
});

// Export user data as JSON
user.get('/export', async (c) => {
  const userId = c.get('userId');

  // Get ignored tags
  const userRow = db.select({ ignored_tags: users.ignored_tags }).from(users).where(eq(users.id, userId)).get();
  const ignoredTags: string[] = userRow?.ignored_tags ? JSON.parse(userRow.ignored_tags) : DEFAULT_IGNORED_TAGS;

  // Get all tag scores from taste profile
  const tasteProfile = db
    .select()
    .from(taste_profiles)
    .where(eq(taste_profiles.user_id, userId))
    .get();

  const tagScores: Record<string, number> = tasteProfile?.tag_scores
    ? JSON.parse(tasteProfile.tag_scores)
    : {};
  const genreScores: Record<string, number> = tasteProfile?.genre_scores
    ? JSON.parse(tasteProfile.genre_scores)
    : {};

  // Get swipe history
  const swipes = db
    .select({
      gameId: swipe_history.game_id,
      gameName: games.name,
      decision: swipe_history.decision,
      swipedAt: swipe_history.swiped_at,
    })
    .from(swipe_history)
    .innerJoin(games, eq(swipe_history.game_id, games.id))
    .where(eq(swipe_history.user_id, userId))
    .all();

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tags: {
      scores: tagScores,
      ignored: ignoredTags,
    },
    genres: {
      scores: genreScores,
    },
    swipeHistory: swipes.map((s) => ({
      gameId: s.gameId,
      gameName: s.gameName,
      decision: s.decision,
      swipedAt: s.swipedAt,
    })),
  };

  return c.json(exportData);
});

// Import user data from JSON
user.post('/import', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    tags?: { ignored?: string[] };
    swipeHistory?: { gameId: number; decision: string; swipedAt?: number }[];
  }>();

  let importedTags = 0;
  let importedSwipes = 0;

  // Import ignored tags
  if (body.tags?.ignored) {
    db.update(users)
      .set({ ignored_tags: JSON.stringify(body.tags.ignored) })
      .where(eq(users.id, userId))
      .run();
    importedTags = body.tags.ignored.length;
  }

  // Import swipe history
  if (body.swipeHistory && body.swipeHistory.length > 0) {
    const nowUnix = Math.floor(Date.now() / 1000);
    for (const swipe of body.swipeHistory) {
      if (!['yes', 'no', 'maybe'].includes(swipe.decision)) continue;

      // Ensure game stub exists for FK
      db.insert(games)
        .values({
          id: swipe.gameId,
          name: `Game ${swipe.gameId}`,
          cached_at: 0,
        })
        .onConflictDoNothing()
        .run();

      db.insert(swipe_history)
        .values({
          user_id: userId,
          game_id: swipe.gameId,
          decision: swipe.decision,
          swiped_at: swipe.swipedAt ?? nowUnix,
        })
        .onConflictDoUpdate({
          target: [swipe_history.user_id, swipe_history.game_id],
          set: {
            decision: swipe.decision,
            swiped_at: swipe.swipedAt ?? nowUnix,
          },
        })
        .run();
      importedSwipes++;
    }

    // Recalculate taste profile after importing swipes
    recalculateTasteProfile(userId).catch(() => {});
  }

  return c.json({ importedTags, importedSwipes });
});

export default user;
