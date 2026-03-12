// Client-side recommendation engine — layers 1-3.
// Layer 3 uses the pluggable AI engine (Ollama or WebLLM) when available.

import { getDb } from '../db/index';
import * as db from '../db/queries';
import { getIgnoredTagsSet } from './tag-filter';
import { config } from './config';
import { aiScoreRecommendations } from './ai-features';

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

function heuristicScore(
  game: Record<string, unknown>,
  topGenres: Set<string>,
  topTags: Set<string>,
): number {
  const gameGenres = parseJson<string[]>(game.genres, []);
  const gameTags = parseJson<string[]>(game.tags, []);

  const genreMatch = gameGenres.filter((g) => topGenres.has(g.toLowerCase())).length / Math.max(topGenres.size, 1);
  const tagMatch = gameTags.filter((t) => topTags.has(t.toLowerCase())).length / Math.max(topTags.size, 1);
  const reviewNorm = ((game.review_score as number) ?? 50) / 100;

  let recency = 0.5;
  if (game.release_date) {
    const releaseYear = parseInt((game.release_date as string).slice(0, 4));
    if (!isNaN(releaseYear)) {
      recency = Math.max(0, 1 - (new Date().getFullYear() - releaseYear) / 10);
    }
  }

  const w = config.scoring;
  return w.genreWeight * genreMatch + w.tagWeight * tagMatch + w.reviewWeight * reviewNorm + w.recencyWeight * recency;
}

export async function generateRecommendations(userId: number, onlyDismissed = false): Promise<number> {
  // Layer 1: Get taste profile
  const profile = db.getTasteProfile(userId);
  if (!profile) return 0;

  // Load ignored tags
  const ignoredTags = db.getIgnoredTags(userId);
  const ignoredSet = getIgnoredTagsSet(ignoredTags);

  const topGenres = new Set(
    Object.entries(profile.genreScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, config.recTopGenresCount)
      .map(([name]) => name.toLowerCase()),
  );

  const topTags = new Set(
    Object.entries(profile.tagScores)
      .filter(([name]) => !ignoredSet.has(name.toLowerCase()))
      .sort(([, a], [, b]) => b - a)
      .slice(0, config.recTopTagsCount)
      .map(([name]) => name.toLowerCase()),
  );

  // Layer 2: SQL pre-filter
  const ownedIds = db.getUserGameIds(userId);
  const swipedNoIds = db.getSwipedNoIds(userId);
  const existingRecIds = db.getUndismissedRecIds(userId);

  if (onlyDismissed) {
    db.clearDismissedRecommendations(userId);
  }

  const excludeIds = [...new Set([...ownedIds, ...swipedNoIds, ...existingRecIds])];

  let sql = 'SELECT * FROM games WHERE 1=1';
  const params: unknown[] = [];

  if (excludeIds.length > 0) {
    const placeholders = excludeIds.map(() => '?').join(',');
    sql += ` AND id NOT IN (${placeholders})`;
    params.push(...excludeIds);
  }

  sql += ' ORDER BY review_count DESC LIMIT ?';
  params.push(config.recCandidatePoolSize);

  const candidates = queryAll(sql, params);

  const scored = candidates
    .map((game) => ({
      game,
      hScore: heuristicScore(game, topGenres, topTags),
    }))
    .sort((a, b) => b.hScore - a.hScore)
    .slice(0, config.recHeuristicTopN);

  if (scored.length === 0) return 0;

  // Layer 3: AI scoring (falls back to heuristic if unavailable)
  const aiResults = await aiScoreRecommendations(userId, scored);

  let count = 0;
  if (aiResults) {
    for (const result of aiResults) {
      const source = result.explanation ? 'ai' : 'heuristic';
      db.upsertRecommendation(userId, result.appid, result.score, result.explanation, source);
      count++;
    }
  } else {
    // Fallback: heuristic only
    for (const s of scored) {
      db.upsertRecommendation(userId, s.game.id as number, s.hScore, '', 'heuristic');
      count++;
    }
  }

  db.batchPersist();
  return count;
}
