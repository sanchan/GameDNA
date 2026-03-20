// Shared DB query helpers — used by recommendation.ts, taste-profile.ts, ai-features.ts.
// Avoids duplicate queryAll/parseJson definitions across services.

import { getDb } from './index';

export function parseJson<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string' || !val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

export function queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
  const results: T[] = [];
  const stmt = getDb().prepare(sql);
  if (params) stmt.bind(params as any[]);
  while (stmt.step()) results.push(stmt.getAsObject() as T);
  stmt.free();
  return results;
}

export function weightedMatch(gameItems: string[], profileMap: Map<string, number>): number {
  if (profileMap.size === 0) return 0;
  let matched = 0;
  for (const item of gameItems) {
    const score = profileMap.get(item.toLowerCase());
    if (score !== undefined && score > 0) matched += score;
  }
  const totalWeight = Array.from(profileMap.values()).reduce((s, v) => s + Math.max(v, 0), 0);
  return totalWeight > 0 ? matched / totalWeight : 0;
}
