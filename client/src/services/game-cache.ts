// Client-side game cache — port of server/services/game-cache.ts.
// Uses client DB (sql.js) instead of Drizzle.

import * as db from '../db/queries';
import { getAppDetails } from './steam-api';
import { config } from './config';

export async function cacheGame(appid: number, cc?: string): Promise<boolean> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.cacheRetryAttempts; attempt++) {
    try {
      const details = await getAppDetails(appid, cc);
      if (!details) return false; // not found / delisted

      db.upsertGame({
        id: details.appid,
        name: details.name,
        short_description: details.short_description,
        header_image: details.header_image,
        genres: details.genres,
        tags: details.tags,
        release_date: details.release_date,
        price_cents: details.price_cents,
        price_currency: details.price_currency,
        metacritic_score: details.metacritic_score,
        review_count: details.review_count,
        developers: details.developers,
        publishers: details.publishers,
        platforms: details.platforms,
        screenshots: details.screenshots,
        movies: details.movies,
      });

      return true;
    } catch (e) {
      lastError = e;
      if (attempt < config.cacheRetryAttempts) {
        const delay = config.cacheRetryBaseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`[game-cache] Retry ${attempt + 1}/${config.cacheRetryAttempts} for appid ${appid} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error(`[game-cache] Failed to cache appid ${appid}:`, lastError);
  return false;
}

/** Force-refresh game cache for given appids, ignoring TTL. */
export async function forceRefreshGames(
  appids: number[],
  onProgress?: (cached: number, total: number) => void,
  cc?: string,
): Promise<void> {
  if (appids.length === 0) return;

  for (let i = 0; i < appids.length; i += config.cacheBatchSize) {
    const batch = appids.slice(i, i + config.cacheBatchSize);
    await Promise.allSettled(batch.map((appid) => cacheGame(appid, cc)));

    if (onProgress) {
      onProgress(Math.min(i + config.cacheBatchSize, appids.length), appids.length);
    }

    if (i + config.cacheBatchSize < appids.length) {
      await new Promise((r) => setTimeout(r, config.cacheBatchDelayMs));
    }
  }

  db.batchPersist();
}

export async function ensureGamesCached(
  appids: number[],
  onProgress?: (cached: number, total: number) => void,
  cc?: string,
): Promise<void> {
  if (appids.length === 0) return;

  const needsCaching = db.getStaleAppIds(appids);
  if (needsCaching.length === 0) return;

  for (let i = 0; i < needsCaching.length; i += config.cacheBatchSize) {
    const batch = needsCaching.slice(i, i + config.cacheBatchSize);
    await Promise.allSettled(batch.map((appid) => cacheGame(appid, cc)));

    if (onProgress) {
      onProgress(Math.min(i + config.cacheBatchSize, needsCaching.length), needsCaching.length);
    }

    if (i + config.cacheBatchSize < needsCaching.length) {
      await new Promise((r) => setTimeout(r, config.cacheBatchDelayMs));
    }
  }

  db.batchPersist();
}
