// Client-side recommendation engine — layers 1-3.
// Layer 3 uses the pluggable AI engine (Ollama or WebLLM) when available.
//
// Improvements over the original:
// - User-configurable scoring weights (stored in DB, falls back to config.ts defaults)
// - Cold start detection: returns early with a flag when < threshold swipes
// - Diversity/exploration: reserves a portion of slots for outside-comfort-zone picks
// - Improved negative signal handling via co-occurrence tracking

import * as db from '../db/queries';
import { parseJson, queryAll, weightedMatch } from '../db/helpers';
import { getBlacklistedTagsSet } from './tag-filter';
import { config } from './config';
import { aiScoreRecommendations } from './ai-features';

export interface ScoreBreakdown {
  genreMatch: number;
  tagMatch: number;
  reviewScore: number;
  recency: number;
  matchedGenres: string[];
  matchedTags: string[];
  reviewCredibility: number;
  isExploration?: boolean;
}

function heuristicScoreWithBreakdown(
  game: Record<string, unknown>,
  topGenres: Map<string, number>,
  topTags: Map<string, number>,
  weights: db.ScoringWeights,
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

  const score = weights.genreWeight * genreMatch
    + weights.tagWeight * tagMatch
    + weights.reviewWeight * reviewNorm
    + weights.recencyWeight * recency;

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

/** Check if user is in cold start (< threshold swipes). Returns progress info. */
export function getColdStartStatus(userId: number): { isColdStart: boolean; current: number; threshold: number } {
  const count = db.getSwipeCount(userId);
  return {
    isColdStart: count < config.coldStartThreshold,
    current: count,
    threshold: config.coldStartThreshold,
  };
}

export async function generateRecommendations(userId: number, onlyDismissed = false): Promise<number> {
  // Layer 1: Get taste profile
  const profile = db.getTasteProfile(userId);
  if (!profile) return 0;

  // Load user-configurable scoring weights (falls back to defaults)
  const weights = db.getScoringWeights(userId);

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

  // Score all candidates
  const allScored = filtered.map((game) => {
    const { score, breakdown } = heuristicScoreWithBreakdown(game, topGenres, topTags, weights);
    return { game, hScore: score, breakdown };
  });

  // ── Diversity: reserve exploration slots ────────────────────────────────
  // Pick top matches for the main slots, then fill exploration slots with
  // high-rated games that are OUTSIDE the user's typical genres.
  const explorationRatio = weights.explorationRatio;
  const totalSlots = config.recHeuristicTopN;
  const explorationSlots = Math.max(1, Math.round(totalSlots * explorationRatio));
  const mainSlots = totalSlots - explorationSlots;

  // Main picks: sorted by heuristic score
  const mainPicks = [...allScored]
    .sort((a, b) => b.hScore - a.hScore)
    .slice(0, mainSlots);

  const mainIds = new Set(mainPicks.map((s) => s.game.id as number));

  // Exploration picks: high review score, LOW genre/tag match (outside comfort zone)
  const explorationPicks = allScored
    .filter((s) => {
      const id = s.game.id as number;
      if (mainIds.has(id)) return false;
      const reviewScore = (s.game.review_score as number) ?? 0;
      return reviewScore >= 80 && s.breakdown.genreMatch < 0.3;
    })
    .sort((a, b) => {
      // Prefer highly reviewed games the user wouldn't normally see
      const aReview = (a.game.review_score as number) ?? 0;
      const bReview = (b.game.review_score as number) ?? 0;
      return bReview - aReview;
    })
    .slice(0, explorationSlots)
    .map((s) => ({
      ...s,
      breakdown: { ...s.breakdown, isExploration: true },
    }));

  const scored = [...mainPicks, ...explorationPicks];

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

// ── "Why NOT this game?" reverse explainer ──────────────────────────────────

export function explainWhyNot(userId: number, gameId: number): {
  factors: { name: string; current: number; needed: number; description: string }[];
  summary: string;
} | null {
  const profile = db.getTasteProfile(userId);
  if (!profile) return null;

  const weights = db.getScoringWeights(userId);
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

  const game = queryAll('SELECT * FROM games WHERE id = ?', [gameId])[0];
  if (!game) return null;

  const { breakdown } = heuristicScoreWithBreakdown(game, topGenres, topTags, weights);

  const factors: { name: string; current: number; needed: number; description: string }[] = [];

  if (breakdown.genreMatch < 0.5) {
    const gameGenres = parseJson<string[]>(game.genres, []);
    const missingGenres = gameGenres.filter((g) => !topGenres.has(g.toLowerCase()));
    factors.push({
      name: 'Genre Match',
      current: Math.round(breakdown.genreMatch * 100),
      needed: 50,
      description: missingGenres.length > 0
        ? `Your profile doesn't strongly favor ${missingGenres.slice(0, 3).join(', ')}. Swipe Yes on more ${missingGenres[0]} games to boost this.`
        : 'Your genre preferences don\'t align strongly with this game.',
    });
  }

  if (breakdown.tagMatch < 0.4) {
    const gameTags = parseJson<string[]>(game.tags, []);
    const missingTags = gameTags.filter((t) => !topTags.has(t.toLowerCase()));
    factors.push({
      name: 'Tag Match',
      current: Math.round(breakdown.tagMatch * 100),
      needed: 40,
      description: missingTags.length > 0
        ? `Tags like ${missingTags.slice(0, 3).join(', ')} aren't in your top preferences yet.`
        : 'The game\'s tags don\'t match your taste profile.',
    });
  }

  if (breakdown.reviewScore < 0.7) {
    factors.push({
      name: 'Community Reviews',
      current: Math.round(breakdown.reviewScore * 100),
      needed: 70,
      description: `This game has a ${Math.round(breakdown.reviewScore * 100)}% review score, which is below the threshold for strong recommendations.`,
    });
  }

  if (breakdown.recency < 0.3) {
    factors.push({
      name: 'Release Recency',
      current: Math.round(breakdown.recency * 100),
      needed: 30,
      description: 'This game is older, which slightly reduces its recommendation score. This doesn\'t mean it\'s bad — just that newer games get a small boost.',
    });
  }

  // Check if blacklisted tags are blocking it
  const gameTags = parseJson<string[]>(game.tags, []);
  const blockedTags = gameTags.filter((t) => blacklistSet.has(t.toLowerCase()));
  if (blockedTags.length > 0) {
    factors.push({
      name: 'Blacklisted Tags',
      current: 0,
      needed: 0,
      description: `This game has blacklisted tags: ${blockedTags.join(', ')}. Remove them from your blacklist in Tag Filters to see this game.`,
    });
  }

  const summary = factors.length === 0
    ? 'This game actually scores well! It may already be in your recommendations.'
    : `${factors.length} factor${factors.length > 1 ? 's' : ''} keeping this game from your recommendations.`;

  return { factors, summary };
}
