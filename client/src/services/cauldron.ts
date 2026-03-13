// The Cauldron — mix multiple games to discover new ones.
// Heuristic layer scores DB candidates by genre/tag overlap with input games.
// AI layer (optional) re-ranks with explanations via the pluggable AI engine.

import { getDb } from '../db/index';
import * as queries from '../db/queries';
import { getAiEngine } from './ai-engine';
import { config } from './config';
import { ensureGamesCached } from './game-cache';
import type { Game, Recommendation } from '../../../shared/types';

function parseJson<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string' || !val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
  const results: T[] = [];
  const stmt = getDb().prepare(sql);
  if (params) stmt.bind(params as any[]);
  while (stmt.step()) results.push(stmt.getAsObject() as T);
  stmt.free();
  return results;
}

export interface CauldronResult {
  id: number;
  game: Game;
  score: number;
  explanation: string;
  source: 'ai' | 'heuristic';
}

function dbRowToGame(row: Record<string, unknown>): Game {
  return {
    id: row.id as number,
    name: row.name as string,
    shortDesc: (row.short_desc as string) ?? null,
    headerImage: (row.header_image as string) ?? null,
    genres: parseJson<string[]>(row.genres, []),
    tags: parseJson<string[]>(row.tags, []),
    releaseDate: (row.release_date as string) ?? null,
    priceCents: (row.price_cents as number) ?? null,
    priceCurrency: (row.price_currency as string) ?? null,
    reviewScore: (row.review_score as number) ?? null,
    reviewCount: (row.review_count as number) ?? null,
    developers: parseJson<string[]>(row.developers, []),
    publishers: parseJson<string[]>(row.publishers, []),
    platforms: parseJson<{ windows: boolean; mac: boolean; linux: boolean }>(row.platforms, { windows: false, mac: false, linux: false }),
    screenshots: parseJson<{ thumbnail: string; full: string }[]>(row.screenshots, []),
    movies: parseJson<{ thumbnail: string; webm480: string; webmMax: string }[]>(row.movies, []),
  };
}

/** Ensure all input games exist in the local DB before cooking. */
export async function ensureInputGamesCached(games: { id: number }[]): Promise<void> {
  const ids = games.map((g) => g.id);
  await ensureGamesCached(ids);
}

export async function cookCauldron(
  inputGames: Game[],
  onStatus?: (msg: string) => void,
): Promise<CauldronResult[]> {
  if (inputGames.length < 2) return [];

  onStatus?.('Collecting ingredients...');

  // Collect genres and tags from input games
  const allGenres = new Set<string>();
  const allTags = new Set<string>();
  const inputIds = new Set(inputGames.map((g) => g.id));

  for (const game of inputGames) {
    for (const g of game.genres) allGenres.add(g.toLowerCase());
    for (const t of game.tags) allTags.add(t.toLowerCase());
  }

  onStatus?.('Searching the database...');

  // Query candidates from DB, excluding input games
  const excludePlaceholders = [...inputIds].map(() => '?').join(',');
  const candidates = queryAll(
    `SELECT * FROM games WHERE id NOT IN (${excludePlaceholders}) ORDER BY review_count DESC LIMIT ?`,
    [...inputIds, config.recCandidatePoolSize],
  );

  if (candidates.length === 0) return [];

  // Score candidates by overlap
  const w = config.scoring;
  const scored = candidates.map((row) => {
    const gameGenres = parseJson<string[]>(row.genres, []);
    const gameTags = parseJson<string[]>(row.tags, []);

    const genreOverlap = gameGenres.filter((g) => allGenres.has(g.toLowerCase())).length / Math.max(allGenres.size, 1);
    const tagOverlap = gameTags.filter((t) => allTags.has(t.toLowerCase())).length / Math.max(allTags.size, 1);
    const reviewNorm = ((row.review_score as number) ?? 50) / 100;

    const score = w.genreWeight * genreOverlap + w.tagWeight * tagOverlap + w.reviewWeight * reviewNorm;

    return { row, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 20);

  if (top.length === 0) return [];

  // Try AI layer (only if model is already loaded — don't force a download)
  const engine = getAiEngine();
  let aiResults: { appid: number; score: number; explanation: string }[] | null = null;

  if (engine && engine.isModelReady()) {
    onStatus?.('Asking AI to mix the potion...');
    try {
      const healthy = await engine.checkHealth();
      if (healthy) {
        const inputSummary = inputGames.map((g) =>
          `"${g.name}" (genres: ${g.genres.join(', ')}, tags: ${g.tags.slice(0, 5).join(', ')})`
        ).join('\n');

        const candidateList = top.map((s) => {
          const g = s.row;
          const genres = parseJson<string[]>(g.genres, []);
          const tags = parseJson<string[]>(g.tags, []);
          return `- appid: ${g.id}, name: "${g.name}", genres: [${genres.join(', ')}], tags: [${tags.slice(0, 5).join(', ')}], review_score: ${g.review_score ?? 'N/A'}`;
        }).join('\n');

        const prompt = `You are a game recommendation engine. The user put these games into a "cauldron" to mix them together and find similar games that blend their qualities.

Input games:
${inputSummary}

Candidate games to rank:
${candidateList}

Re-rank these candidates based on how well they blend the qualities of the input games. Score each from 0 to 1 and explain in 1-2 sentences why it's a good mix of the input games.

Respond with a JSON object: {"games": [{"appid": number, "score": number, "explanation": "string"}]}`;

        // Timeout after 60s to avoid hanging forever if AI stalls
        const aiPromise = engine.generateJSON<{ games: { appid: number; score: number; explanation: string }[] }>(prompt);
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 60_000));
        const result = await Promise.race([aiPromise, timeoutPromise]);

        if (result?.games) {
          aiResults = result.games;
        }
      }
    } catch {
      // Fall back to heuristic
    }
  }

  onStatus?.('Brewing results...');

  // Build final results
  const results: CauldronResult[] = [];

  if (aiResults) {
    // Map AI results to games
    const rowMap = new Map(top.map((s) => [s.row.id as number, s]));
    for (const ai of aiResults) {
      const entry = rowMap.get(ai.appid);
      if (!entry) continue;
      results.push({
        id: ai.appid,
        game: dbRowToGame(entry.row),
        score: ai.score,
        explanation: ai.explanation,
        source: 'ai',
      });
    }
    // Add any heuristic-only results not covered by AI
    for (const s of top) {
      const appid = s.row.id as number;
      if (!results.find((r) => r.id === appid)) {
        results.push({
          id: appid,
          game: dbRowToGame(s.row),
          score: s.score,
          explanation: '',
          source: 'heuristic',
        });
      }
    }
  } else {
    for (const s of top) {
      results.push({
        id: s.row.id as number,
        game: dbRowToGame(s.row),
        score: s.score,
        explanation: '',
        source: 'heuristic',
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, 20);
}
