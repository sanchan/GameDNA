import { eq, and, gt, inArray } from 'drizzle-orm';
import { db } from '../db';
import { games } from '../db/schema';
import { getAppDetails } from './steam-api';

const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

type Game = typeof games.$inferSelect;

export async function getCachedGame(appid: number): Promise<Game | null> {
  const game = db.select().from(games).where(eq(games.id, appid)).get();
  if (!game) return null;

  const now = Math.floor(Date.now() / 1000);
  if (game.cached_at && now - game.cached_at < SEVEN_DAYS_S) {
    return game;
  }

  return null; // stale
}

export async function cacheGame(appid: number): Promise<Game | null> {
  const details = await getAppDetails(appid);
  if (!details) return null;

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
}

export async function ensureGamesCached(
  appids: number[],
  onProgress?: (cached: number, total: number) => void,
): Promise<void> {
  if (appids.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  const staleThreshold = now - SEVEN_DAYS_S;

  // Find which appids are already cached and fresh
  // Query in chunks to avoid SQLite variable limits
  const freshIds = new Set<number>();
  const chunkSize = 500;
  for (let i = 0; i < appids.length; i += chunkSize) {
    const chunk = appids.slice(i, i + chunkSize);
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

  // Fetch in batches of 3 with delays between batches to avoid rate limits
  const batchSize = 3;
  for (let i = 0; i < needsCaching.length; i += batchSize) {
    const batch = needsCaching.slice(i, i + batchSize);
    await Promise.allSettled(batch.map((appid) => cacheGame(appid)));

    if (onProgress) {
      onProgress(Math.min(i + batchSize, needsCaching.length), needsCaching.length);
    }

    // Delay between batches to be respectful of Steam's rate limits
    if (i + batchSize < needsCaching.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
