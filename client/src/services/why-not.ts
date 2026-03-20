// "Why Not This Game?" — explains why a specific game wasn't recommended.
// Checks each exclusion reason and scoring factor.

import { getDb } from '../db/index';
import * as db from '../db/queries';
import { getBlacklistedTagsSet } from './tag-filter';
import { config } from './config';

export interface WhyNotResult {
  found: boolean;
  gameName?: string;
  reasons: string[];
  score?: number;
  threshold?: number;
}

function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null {
  const stmt = getDb().prepare(sql);
  if (params) stmt.bind(params as any[]);
  const result = stmt.step() ? (stmt.getAsObject() as T) : null;
  stmt.free();
  return result;
}

export function whyNotThisGame(userId: number, appid: number): WhyNotResult {
  const reasons: string[] = [];

  // Check if game exists in cache
  const game = queryOne<{ id: number; name: string; genres: string; tags: string; review_score: number | null; cached_at: number | null }>(
    'SELECT id, name, genres, tags, review_score, cached_at FROM games WHERE id = ?',
    [appid],
  );

  if (!game) {
    return { found: false, reasons: ['This game is not in your local game cache. Try syncing or searching for it first.'] };
  }

  if (!game.cached_at) {
    reasons.push('Game metadata has not been fully cached yet (only a stub entry exists).');
  }

  // Check if owned
  const owned = queryOne<{ game_id: number }>(
    'SELECT game_id FROM user_games WHERE user_id = ? AND game_id = ?',
    [userId, appid],
  );
  if (owned) {
    reasons.push('This game is in your library — owned games are excluded from recommendations.');
  }

  // Check if swiped no
  const swipedNo = queryOne<{ decision: string }>(
    'SELECT decision FROM swipe_history WHERE user_id = ? AND game_id = ?',
    [userId, appid],
  );
  if (swipedNo) {
    reasons.push(`You swiped "${swipedNo.decision}" on this game — ${swipedNo.decision === 'no' ? 'rejected games are excluded' : 'it was already processed'}.`);
  }

  // Check blacklisted tags
  const blacklistedTags = db.getBlacklistedTags(userId);
  const blacklistSet = getBlacklistedTagsSet(blacklistedTags);
  let gameTags: string[] = [];
  try { gameTags = JSON.parse(game.tags || '[]'); } catch { /* */ }
  const blockedTags = gameTags.filter((t) => blacklistSet.has(t.toLowerCase()));
  if (blockedTags.length > 0) {
    reasons.push(`Filtered by blacklisted tag${blockedTags.length > 1 ? 's' : ''}: ${blockedTags.join(', ')}.`);
  }

  // Check if already recommended
  const existing = queryOne<{ score: number; dismissed: number }>(
    'SELECT score, dismissed FROM recommendations WHERE user_id = ? AND game_id = ?',
    [userId, appid],
  );
  if (existing) {
    if (existing.dismissed) {
      reasons.push(`Previously recommended (score: ${Math.round(existing.score * 100)}%) but you dismissed it.`);
    } else {
      reasons.push(`Already in your recommendations with a ${Math.round(existing.score * 100)}% match score.`);
    }
    return { found: true, gameName: game.name, reasons, score: existing.score };
  }

  // If no exclusion reason found, the game just scored too low
  if (reasons.length === 0 && game.cached_at) {
    reasons.push('This game was not excluded but may have scored below the top 50 candidates. Its match score was too low to make the recommendation list.');
  }

  return { found: true, gameName: game.name, reasons };
}
