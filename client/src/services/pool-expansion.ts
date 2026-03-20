// Taste-driven game pool expansion — searches Steam for games
// matching the user's top genres/tags to seed the local discovery DB.

import * as db from '../db/queries';
import { searchSteamStore } from './steam-api';
import { ensureGamesCached } from './game-cache';
import { config } from './config';

// Generic single-word genres that are too broad on their own but useful in combinations
const GENERIC_SOLO = new Set(['action', 'indie', 'casual', 'adventure', 'simulation', 'free to play', 'rpg', 'strategy']);

export async function expandGamePool(
  userId: number,
  onProgress?: (cached: number, total: number) => void,
  cc?: string,
): Promise<number> {
  // Gate: need a taste profile with enough data
  const profile = db.getTasteProfile(userId);
  if (!profile) return 0;

  const positiveGenres = Object.entries(profile.genreScores)
    .filter(([, s]) => s > 0)
    .sort(([, a], [, b]) => b - a);
  if (positiveGenres.length < 3) return 0; // sparse profile — not enough signal

  // Cooldown check
  const pe = config.poolExpansion;
  const lastExpansion = db.getLastExpansionAt(userId);
  if (Date.now() - lastExpansion * 1000 < pe.minIntervalMs) return 0;

  // Build search terms from top genres + tags
  // Instead of blacklisting generic genres entirely, use them in 2-term combinations
  // e.g. "RPG Story-driven" instead of just "RPG"
  const searchTerms: string[] = [];
  const specificGenres: string[] = [];
  const genericGenres: string[] = [];

  for (const [name] of positiveGenres) {
    if (GENERIC_SOLO.has(name.toLowerCase())) {
      genericGenres.push(name);
    } else {
      specificGenres.push(name);
    }
  }

  const positiveTags = Object.entries(profile.tagScores)
    .filter(([, s]) => s > 0)
    .sort(([, a], [, b]) => b - a);

  const specificTags: string[] = [];
  for (const [name] of positiveTags) {
    if (!GENERIC_SOLO.has(name.toLowerCase())) {
      specificTags.push(name);
    }
  }

  // Add specific genres directly
  for (const name of specificGenres) {
    if (searchTerms.length >= pe.maxSearchTerms) break;
    searchTerms.push(name);
  }

  // Combine generic genres with top specific tags for targeted searches
  for (const genre of genericGenres) {
    if (searchTerms.length >= pe.maxSearchTerms) break;
    const tag = specificTags.find((t) =>
      !searchTerms.some((s) => s.toLowerCase() === `${genre} ${t}`.toLowerCase()),
    );
    if (tag) {
      searchTerms.push(`${genre} ${tag}`);
    }
  }

  // Add remaining specific tags
  for (const name of specificTags) {
    if (searchTerms.length >= pe.maxSearchTerms) break;
    if (!searchTerms.some((t) => t.toLowerCase() === name.toLowerCase())) {
      searchTerms.push(name);
    }
  }

  if (searchTerms.length === 0) return 0;

  // Build exclusion set
  const excludeIds = new Set([
    ...db.getAllCachedGameIds(),
    ...db.getUserGameIds(userId),
    ...db.getSwipedIds(userId),
  ]);

  // Search Steam for each term, collect unique new IDs
  const newIds: number[] = [];
  const seen = new Set<number>();

  for (const term of searchTerms) {
    try {
      const searchResult = await searchSteamStore(term);
      for (const r of searchResult.data) {
        if (!excludeIds.has(r.id) && !seen.has(r.id)) {
          seen.add(r.id);
          newIds.push(r.id);
        }
      }
    } catch (e) {
      console.error(`[pool-expansion] Search error for "${term}":`, e);
    }
    if (newIds.length >= pe.maxNewGamesPerExpand) break;
  }

  const capped = newIds.slice(0, pe.maxNewGamesPerExpand);
  if (capped.length === 0) {
    db.setLastExpansionAt(userId, Math.floor(Date.now() / 1000));
    return 0;
  }

  // Cache the new games
  await ensureGamesCached(capped, onProgress, cc);

  // Record expansion timestamp
  db.setLastExpansionAt(userId, Math.floor(Date.now() / 1000));

  return capped.length;
}
