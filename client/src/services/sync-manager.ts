// Client-side sync manager — port of server/routes/user.ts:runCategorySync.
// Runs entirely in the browser with progress callbacks.

import * as db from '../db/queries';
import { getOwnedGames, getWishlist, getPopularGameIds, getSteamTags } from './steam-api';
import { ensureGamesCached, forceRefreshGames } from './game-cache';
import { recalculateTasteProfile } from './taste-profile';
import { generateRecommendations } from './recommendation';

export type SyncCategory = 'library' | 'wishlist' | 'backlog' | 'tags' | 'cache';
export const ALL_CATEGORIES: SyncCategory[] = ['library', 'wishlist', 'backlog', 'tags'];
/** Extended categories including cache refresh — used when user opts in. */
export const ALL_CATEGORIES_WITH_CACHE: SyncCategory[] = ['library', 'wishlist', 'backlog', 'cache', 'tags'];

export type CategoryStatus = 'idle' | 'syncing' | 'complete' | 'error';

export interface CategorySyncState {
  status: CategoryStatus;
  progress: number;
  detail: string;
}

export interface SyncState {
  categories: Record<SyncCategory, CategorySyncState>;
  gamesCount: number;
  wishlistCount: number;
  step: string;
  progress: number;
  detail: string;
}

export type SyncCallback = (state: SyncState) => void;

function defaultState(): Record<SyncCategory, CategorySyncState> {
  return {
    library: { status: 'idle', progress: 0, detail: '' },
    wishlist: { status: 'idle', progress: 0, detail: '' },
    backlog: { status: 'idle', progress: 0, detail: '' },
    tags: { status: 'idle', progress: 0, detail: '' },
    cache: { status: 'idle', progress: 0, detail: '' },
  };
}

function deriveOverall(cats: Record<SyncCategory, CategorySyncState>, gamesCount: number, wishlistCount: number): SyncState {
  const allKeys = ALL_CATEGORIES_WITH_CACHE;
  const statuses = allKeys.map((c) => cats[c].status);
  let step = 'idle';

  if (statuses.some((s) => s === 'error')) step = 'error';
  else if (statuses.every((s) => s === 'complete' || s === 'idle')) {
    step = statuses.some((s) => s === 'complete') ? 'complete' : 'idle';
  } else if (cats.tags.status === 'syncing') step = 'generating-recommendations';
  else if (cats.cache.status === 'syncing') step = 'refreshing-cache';
  else if (cats.backlog.status === 'syncing') step = 'building-profile';
  else if (cats.wishlist.status === 'syncing' || cats.library.status === 'syncing') step = 'fetching-library';
  else step = 'starting';

  const active = allKeys.filter((c) => cats[c].status !== 'idle');
  const progress = active.length > 0
    ? Math.round(active.reduce((sum, c) => sum + cats[c].progress, 0) / active.length)
    : 0;

  const syncingCat = allKeys.find((c) => cats[c].status === 'syncing');
  const detail = syncingCat ? cats[syncingCat].detail : step === 'complete' ? 'Sync complete!' : '';

  return { categories: cats, gamesCount, wishlistCount, step, progress, detail };
}

export async function runSync(
  userId: number,
  steamId: string,
  apiKey: string,
  categories: SyncCategory[],
  onProgress: SyncCallback,
  cc?: string,
): Promise<void> {
  const has = (c: SyncCategory) => categories.includes(c);
  const cats = defaultState();
  let gamesCount = 0;
  let wishlistCount = 0;

  for (const c of categories) {
    cats[c] = { status: 'syncing', progress: 0, detail: 'Starting...' };
  }
  onProgress(deriveOverall(cats, gamesCount, wishlistCount));

  let ownedGames: Array<{ appid: number; name: string; playtime_forever: number; rtime_last_played?: number }> = [];
  let wishlistAppids: number[] = [];

  // --- Library ---
  if (has('library')) {
    try {
      cats.library = { status: 'syncing', progress: 10, detail: 'Fetching owned games from Steam...' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      ownedGames = await getOwnedGames(steamId, apiKey);
      gamesCount = ownedGames.length;
      cats.library = { status: 'syncing', progress: 50, detail: `Found ${ownedGames.length} games. Saving...` };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      for (const game of ownedGames) {
        db.upsertGameStub(game.appid, game.name || `Game ${game.appid}`);
      }

      for (const game of ownedGames) {
        db.upsertUserGame(userId, game.appid, game.playtime_forever, game.rtime_last_played ?? null);
      }
      db.batchPersist();

      cats.library = { status: 'complete', progress: 100, detail: 'Complete' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));
    } catch (e) {
      cats.library = { status: 'error', progress: 0, detail: `Failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));
    }
  }

  // --- Wishlist ---
  if (has('wishlist')) {
    try {
      cats.wishlist = { status: 'syncing', progress: 10, detail: 'Fetching wishlist from Steam...' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      wishlistAppids = await getWishlist(steamId, apiKey);
      wishlistCount = wishlistAppids.length;
      cats.wishlist = { status: 'syncing', progress: 50, detail: `Found ${wishlistAppids.length} wishlist items. Saving...` };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      for (const appid of wishlistAppids) {
        db.upsertGameStub(appid, `Game ${appid}`);
      }

      const ownedSet = new Set(ownedGames.map((g) => g.appid));
      for (const appid of wishlistAppids) {
        if (!ownedSet.has(appid)) {
          db.upsertUserGame(userId, appid, 0, null, true);
        }
      }
      db.batchPersist();

      cats.wishlist = { status: 'complete', progress: 100, detail: 'Complete' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));
    } catch (e) {
      cats.wishlist = { status: 'error', progress: 0, detail: `Failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));
    }
  }

  // --- Backlog (game detail caching + discovery seeding) ---
  if (has('backlog')) {
    try {
      cats.backlog = { status: 'syncing', progress: 5, detail: 'Caching game details...' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      // Cache all played games (sorted by playtime so most-played finish first)
      const topPlayedAppids = ownedGames
        .filter((g) => g.playtime_forever > 60)
        .sort((a, b) => b.playtime_forever - a.playtime_forever)
        .map((g) => g.appid);

      if (topPlayedAppids.length > 0) {
        cats.backlog.detail = `Fetching details for ${topPlayedAppids.length} top games...`;
        cats.backlog.progress = 10;
        onProgress(deriveOverall(cats, gamesCount, wishlistCount));

        await ensureGamesCached(topPlayedAppids, (cached, total) => {
          cats.backlog.progress = 10 + Math.round((cached / total) * 30);
          cats.backlog.detail = `Game details... (${cached}/${total})`;
          onProgress(deriveOverall(cats, gamesCount, wishlistCount));
        }, cc);
      }

      // Cache wishlist game details
      const ownedSet = new Set(ownedGames.map((g) => g.appid));
      const wishlistOnly = wishlistAppids.filter((id) => !ownedSet.has(id));
      if (wishlistOnly.length > 0) {
        cats.backlog = { status: 'syncing', progress: 40, detail: `Fetching wishlist details... (0/${wishlistOnly.length})` };
        onProgress(deriveOverall(cats, gamesCount, wishlistCount));

        await ensureGamesCached(wishlistOnly, (cached, total) => {
          cats.backlog.progress = 40 + Math.round((cached / total) * 15);
          cats.backlog.detail = `Wishlist details... (${cached}/${total})`;
          onProgress(deriveOverall(cats, gamesCount, wishlistCount));
        }, cc);
      }

      // Seed popular games for discovery
      cats.backlog = { status: 'syncing', progress: 55, detail: 'Loading discovery catalog...' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      try {
        const popularIds = await getPopularGameIds();
        const allUserAppids = new Set([...ownedGames.map((g) => g.appid), ...wishlistAppids]);
        const discoveryIds = popularIds.filter((id) => !allUserAppids.has(id));

        await ensureGamesCached(discoveryIds, (cached, total) => {
          cats.backlog.progress = 55 + Math.round((cached / total) * 40);
          cats.backlog.detail = `Discovery catalog... (${cached}/${total})`;
          onProgress(deriveOverall(cats, gamesCount, wishlistCount));
        }, cc);
      } catch (e) {
        console.error('[sync] Discovery seeding error:', e);
      }

      cats.backlog = { status: 'complete', progress: 100, detail: 'Complete' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));
    } catch (e) {
      cats.backlog = { status: 'error', progress: 0, detail: `Failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));
    }
  }

  // --- Cache (force-refresh all cached games) ---
  if (has('cache')) {
    try {
      cats.cache = { status: 'syncing', progress: 5, detail: 'Finding cached games...' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      // Get all game IDs that have been cached (have a cached_at > 0)
      const cachedAppids = db.getAllCachedGameIds();
      if (cachedAppids.length === 0) {
        cats.cache = { status: 'complete', progress: 100, detail: 'No games to refresh' };
        onProgress(deriveOverall(cats, gamesCount, wishlistCount));
      } else {
        cats.cache = { status: 'syncing', progress: 10, detail: `Refreshing ${cachedAppids.length} games...` };
        onProgress(deriveOverall(cats, gamesCount, wishlistCount));

        await forceRefreshGames(cachedAppids, (cached, total) => {
          cats.cache.progress = 10 + Math.round((cached / total) * 85);
          cats.cache.detail = `Refreshing games... (${cached}/${total})`;
          onProgress(deriveOverall(cats, gamesCount, wishlistCount));
        }, cc);

        cats.cache = { status: 'complete', progress: 100, detail: 'Complete' };
        onProgress(deriveOverall(cats, gamesCount, wishlistCount));
      }
    } catch (e) {
      cats.cache = { status: 'error', progress: 0, detail: `Failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));
    }
  }

  // --- Tags (tag catalog + taste profile + recommendations) ---
  if (has('tags')) {
    try {
      cats.tags = { status: 'syncing', progress: 5, detail: 'Fetching Steam tags...' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      let steamTags: { name: string }[] = [];
      try {
        steamTags = await getSteamTags();
      } catch (e) {
        console.error('[sync] Steam tags fetch error:', e);
      }

      cats.tags = { status: 'syncing', progress: 10, detail: 'Building tag catalog...' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      try { db.rebuildTagCatalog(steamTags); } catch (e) {
        console.error('[sync] tag catalog error:', e);
      }

      cats.tags = { status: 'syncing', progress: 15, detail: 'Building taste profile...' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      try { recalculateTasteProfile(userId); } catch (e) {
        console.error('[sync] taste profile error:', e);
      }

      cats.tags = { status: 'syncing', progress: 50, detail: 'Generating recommendations...' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));

      try {
        const recCount = generateRecommendations(userId);
        cats.tags = { status: 'syncing', progress: 95, detail: `Generated ${recCount} recommendations!` };
        onProgress(deriveOverall(cats, gamesCount, wishlistCount));
      } catch (e) {
        console.error('[sync] Recommendation generation error:', e);
        cats.tags = { status: 'syncing', progress: 80, detail: 'Recommendations skipped' };
        onProgress(deriveOverall(cats, gamesCount, wishlistCount));
      }

      cats.tags = { status: 'complete', progress: 100, detail: 'Complete' };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));
    } catch (e) {
      cats.tags = { status: 'error', progress: 0, detail: `Failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
      onProgress(deriveOverall(cats, gamesCount, wishlistCount));
    }
  }
}
