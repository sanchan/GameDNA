// Client-side recommendation engine — layers 1-3.
// Layer 3 uses the pluggable AI engine (Ollama or WebLLM) when available.

import { getDb } from '../db/index';
import * as db from '../db/queries';
import { getBlacklistedTagsSet } from './tag-filter';
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

function weightedMatch(gameItems: string[], profileMap: Map<string, number>): number {
  if (profileMap.size === 0) return 0;
  let matched = 0;
  for (const item of gameItems) {
    const score = profileMap.get(item.toLowerCase());
    if (score !== undefined && score > 0) matched += score;
  }
  const totalWeight = Array.from(profileMap.values()).reduce((s, v) => s + Math.max(v, 0), 0);
  return totalWeight > 0 ? matched / totalWeight : 0;
}

export interface ScoreBreakdown {
  genreMatch: number;
  tagMatch: number;
  reviewScore: number;
  recency: number;
  matchedGenres: string[];
  matchedTags: string[];
  reviewCredibility: number;
}

function heuristicScoreWithBreakdown(
  game: Record<string, unknown>,
  topGenres: Map<string, number>,
  topTags: Map<string, number>,
): { score: number; breakdown: ScoreBreakdown } {
  const gameGenres = parseJson<string[]>(game.genres, []);
  const gameTags = parseJson<string[]>(game.tags, []);

  const genreMatch = weightedMatch(gameGenres, topGenres);
  const tagMatch = weightedMatch(gameTags, topTags);

  // Bayesian review credibility: games with few reviews are pulled toward global average
  const rawReviewScore = (game.review_score as number) ?? config.globalAverageReviewScore;
  const reviewCount = (game.review_count as number) ?? 0;
  const credibility = Math.min(reviewCount / config.reviewCredibilityThreshold, 1.0);
  const adjustedReviewScore = credibility * rawReviewScore + (1 - credibility) * config.globalAverageReviewScore;
  const reviewNorm = adjustedReviewScore / 100;

  let recency = 0.5;
  if (game.release_date) {
    const releaseYear = parseInt((game.release_date as string).slice(0, 4));
    if (!isNaN(releaseYear)) {
      recency = Math.max(0, 1 - (new Date().getFullYear() - releaseYear) / 10);
    }
  }

  // Track which genres/tags actually matched the profile
  const matchedGenres = gameGenres.filter((g) => {
    const s = topGenres.get(g.toLowerCase());
    return s !== undefined && s > 0;
  });
  const matchedTags = gameTags.filter((t) => {
    const s = topTags.get(t.toLowerCase());
    return s !== undefined && s > 0;
  });

  const w = config.scoring;
  const score = w.genreWeight * genreMatch + w.tagWeight * tagMatch + w.reviewWeight * reviewNorm + w.recencyWeight * recency;

  return {
    score,
    breakdown: {
      genreMatch,
      tagMatch,
      reviewScore: reviewNorm,
      recency,
      matchedGenres,
      matchedTags,
      reviewCredibility: credibility,
    },
  };
}

export async function generateRecommendations(userId: number, onlyDismissed = false): Promise<number> {
  // Layer 1: Get taste profile
  const profile = db.getTasteProfile(userId);
  if (!profile) return 0;

  // Load blacklisted tags
  const blacklistedTags = db.getBlacklistedTags(userId);
  const blacklistSet = getBlacklistedTagsSet(blacklistedTags);

  const topGenres = new Map(
    Object.entries(profile.genreScores)
      .filter(([, s]) => s > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, config.recTopGenresCount)
      .map(([name, score]) => [name.toLowerCase(), score] as [string, number]),
  );

  const topTags = new Map(
    Object.entries(profile.tagScores)
      .filter(([name, s]) => s > 0 && !blacklistSet.has(name.toLowerCase()))
      .sort(([, a], [, b]) => b - a)
      .slice(0, config.recTopTagsCount)
      .map(([name, score]) => [name.toLowerCase(), score] as [string, number]),
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

  sql += ' AND cached_at > 0 LIMIT 2000';  // safety valve; score everything

  const candidates = queryAll(sql, params);

  // Filter out candidates with blacklisted tags
  const filtered = candidates.filter((game) => {
    const gameTags = parseJson<string[]>(game.tags, []);
    return !gameTags.some((t) => blacklistSet.has(t.toLowerCase()));
  });

  const scored = filtered
    .map((game) => {
      const { score, breakdown } = heuristicScoreWithBreakdown(game, topGenres, topTags);
      return { game, hScore: score, breakdown };
    })
    .sort((a, b) => b.hScore - a.hScore)
    .slice(0, config.recHeuristicTopN);

  if (scored.length === 0) return 0;

  // Layer 3: AI scoring (falls back to heuristic if unavailable)
  const aiResults = await aiScoreRecommendations(userId, scored);

  let count = 0;
  if (aiResults) {
    for (const result of aiResults) {
      const source = result.explanation ? 'ai' : 'heuristic';
      const entry = scored.find((s) => (s.game.id as number) === result.appid);
      const breakdownJson = entry ? JSON.stringify(entry.breakdown) : '';
      db.upsertRecommendation(userId, result.appid, result.score, result.explanation, source, breakdownJson, entry?.hScore);
      count++;
    }
  } else {
    // Fallback: heuristic only
    for (const s of scored) {
      const breakdownJson = JSON.stringify(s.breakdown);
      db.upsertRecommendation(userId, s.game.id as number, s.hScore, '', 'heuristic', breakdownJson, s.hScore);
      count++;
    }
  }

  db.batchPersist();
  return count;
}
