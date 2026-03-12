import { eq, and, gt, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { games } from '../db/schema';
import { getAppDetails } from './steam-api';
import { config } from '../config';

type Game = typeof games.$inferSelect;

export async function getCachedGame(appid: number): Promise<Game | null> {
  const game = db.select().from(games).where(eq(games.id, appid)).get();
  if (!game) return null;

  const now = Math.floor(Date.now() / 1000);
  if (game.cached_at && now - game.cached_at < config.cacheTtlSeconds) {
    return game;
  }

  return null; // stale
}

/** Fetch and cache a single game, with retry + exponential backoff. */
export async function cacheGame(appid: number, cc?: string): Promise<Game | null> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.cacheRetryAttempts; attempt++) {
    try {
      const details = await getAppDetails(appid, cc);
      if (!details) return null; // not found / delisted — don't retry

      const now = Math.floor(Date.now() / 1000);

      const values = {
        id: details.appid,
        name: details.name,
        short_desc: details.short_description,
        header_image: details.header_image,
        genres: JSON.stringify(details.genres),
        tags: JSON.stringify(details.tags),
        release_date: details.release_date,
        price_cents: details.price_cents,
        price_currency: details.price_currency,
        review_score: details.metacritic_score,
        review_count: details.review_count,
        developers: JSON.stringify(details.developers),
        publishers: JSON.stringify(details.publishers),
        platforms: JSON.stringify(details.platforms),
        cached_at: now,
      };

      // Upsert: insert or update on conflict
      db.insert(games)
        .values(values)
        .onConflictDoUpdate({
          target: games.id,
          set: {
            name: values.name,
            short_desc: values.short_desc,
            header_image: values.header_image,
            genres: values.genres,
            tags: values.tags,
            release_date: values.release_date,
            price_cents: values.price_cents,
            price_currency: values.price_currency,
            review_score: values.review_score,
            review_count: values.review_count,
            developers: values.developers,
            publishers: values.publishers,
            platforms: values.platforms,
            cached_at: values.cached_at,
          },
        })
        .run();

      return db.select().from(games).where(eq(games.id, appid)).get() ?? null;
    } catch (e) {
      lastError = e;
      if (attempt < config.cacheRetryAttempts) {
        const delay = config.cacheRetryBaseDelayMs * Math.pow(2, attempt);
        console.warn(`[game-cache] Retry ${attempt + 1}/${config.cacheRetryAttempts} for appid ${appid} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error(`[game-cache] Failed to cache appid ${appid} after ${config.cacheRetryAttempts + 1} attempts:`, lastError);
  return null;
}

export async function ensureGamesCached(
  appids: number[],
  onProgress?: (cached: number, total: number) => void,
  cc?: string,
): Promise<void> {
  if (appids.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  const staleThreshold = now - config.cacheTtlSeconds;

  // Find which appids are already cached and fresh
  // Query in chunks to avoid SQLite variable limits
  const freshIds = new Set<number>();
  for (let i = 0; i < appids.length; i += config.sqlChunkSize) {
    const chunk = appids.slice(i, i + config.sqlChunkSize);
    const cached = db
      .select({ id: games.id })
      .from(games)
      .where(and(inArray(games.id, chunk), gt(games.cached_at, staleThreshold)))
      .all();
    for (const row of cached) {
      freshIds.add(row.id);
    }
  }

  const needsCaching = appids.filter((id) => !freshIds.has(id));
  if (needsCaching.length === 0) return;

  // Fetch in batches with delays between batches to avoid rate limits
  for (let i = 0; i < needsCaching.length; i += config.cacheBatchSize) {
    const batch = needsCaching.slice(i, i + config.cacheBatchSize);
    await Promise.allSettled(batch.map((appid) => cacheGame(appid, cc)));

    if (onProgress) {
      onProgress(Math.min(i + config.cacheBatchSize, needsCaching.length), needsCaching.length);
    }

    // Delay between batches to be respectful of Steam's rate limits
    if (i + config.cacheBatchSize < needsCaching.length) {
      await new Promise((r) => setTimeout(r, config.cacheBatchDelayMs));
    }
  }
}

/** Re-cache games that have a price but no currency info (legacy data). */
export async function recacheGamesWithoutCurrency(cc?: string): Promise<number> {
  const rows = db
    .select({ id: games.id })
    .from(games)
    .where(and(isNotNull(games.price_cents), gt(games.price_cents, 0), isNull(games.price_currency)))
    .all();

  if (rows.length === 0) return 0;

  const appids = rows.map((r) => r.id);
  console.log(`[game-cache] Re-caching ${appids.length} games missing currency info`);

  let done = 0;
  for (let i = 0; i < appids.length; i += config.cacheBatchSize) {
    const batch = appids.slice(i, i + config.cacheBatchSize);
    await Promise.allSettled(batch.map((appid) => cacheGame(appid, cc)));
    done += batch.length;
    if (i + config.cacheBatchSize < appids.length) {
      await new Promise((r) => setTimeout(r, config.cacheBatchDelayMs));
    }
  }

  console.log(`[game-cache] Re-cached ${done} games with regional pricing`);
  return done;
}
