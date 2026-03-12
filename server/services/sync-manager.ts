import { eq } from 'drizzle-orm';
import { db } from '../db';
import { sync_states } from '../db/schema';
import { config } from '../config';

export type SyncCategory = 'library' | 'wishlist' | 'backlog' | 'tags';

export const ALL_CATEGORIES: SyncCategory[] = ['library', 'wishlist', 'backlog', 'tags'];

export type CategoryStatus = 'idle' | 'syncing' | 'complete' | 'error';

export interface CategorySyncState {
  status: CategoryStatus;
  progress: number; // 0-100
  detail: string;
}

export interface SyncState {
  categories: Record<SyncCategory, CategorySyncState>;
  gamesCount: number;
  wishlistCount: number;
  startedAt: number;
  completedAt: number | null;
}

// Legacy compat: derive a single step from categories
export type SyncStep =
  | 'idle'
  | 'starting'
  | 'fetching-library'
  | 'caching-library'
  | 'building-profile'
  | 'seeding-discovery'
  | 'generating-recommendations'
  | 'complete'
  | 'error';

// In-memory cache to avoid hitting DB on every status poll.
// The DB is the source of truth; this cache is synced on every write.
const memCache = new Map<number, SyncState>();

function defaultCategoryState(): Record<SyncCategory, CategorySyncState> {
  return {
    library: { status: 'idle', progress: 0, detail: '' },
    wishlist: { status: 'idle', progress: 0, detail: '' },
    backlog: { status: 'idle', progress: 0, detail: '' },
    tags: { status: 'idle', progress: 0, detail: '' },
  };
}

// ── Persistence helpers ──────────────────────────────────────────────────────

function persistState(userId: number, state: SyncState): void {
  memCache.set(userId, state);
  db.insert(sync_states)
    .values({
      user_id: userId,
      state: JSON.stringify(state),
      started_at: state.startedAt,
      completed_at: state.completedAt,
    })
    .onConflictDoUpdate({
      target: sync_states.user_id,
      set: {
        state: JSON.stringify(state),
        started_at: state.startedAt,
        completed_at: state.completedAt,
      },
    })
    .run();
}

function loadState(userId: number): SyncState | null {
  const cached = memCache.get(userId);
  if (cached) return cached;

  const row = db.select().from(sync_states).where(eq(sync_states.user_id, userId)).get();
  if (!row) return null;

  try {
    const state = JSON.parse(row.state) as SyncState;
    memCache.set(userId, state);
    return state;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getSyncStatus(userId: number): SyncState | null {
  return loadState(userId);
}

/** Returns overall step derived from category states (for legacy polling compat) */
export function getOverallStep(state: SyncState): SyncStep {
  const cats = state.categories;
  const statuses = ALL_CATEGORIES.map((c) => cats[c].status);
  if (statuses.some((s) => s === 'error')) return 'error';
  if (statuses.every((s) => s === 'idle')) return 'idle';
  if (statuses.every((s) => s === 'complete' || s === 'idle')) {
    return statuses.some((s) => s === 'complete') ? 'complete' : 'idle';
  }
  // Something is syncing
  if (cats.tags.status === 'syncing') return 'generating-recommendations';
  if (cats.backlog.status === 'syncing') return 'building-profile';
  if (cats.wishlist.status === 'syncing') return 'fetching-library';
  if (cats.library.status === 'syncing') return 'fetching-library';
  return 'starting';
}

/** Returns overall progress (0-100) derived from active categories */
export function getOverallProgress(state: SyncState, activeCategories: SyncCategory[]): number {
  if (activeCategories.length === 0) return 0;
  const total = activeCategories.reduce((sum, c) => sum + state.categories[c].progress, 0);
  return Math.round(total / activeCategories.length);
}

export function startSync(userId: number, categories: SyncCategory[]): boolean {
  const existing = loadState(userId);
  // Check if any of the requested categories are currently syncing
  if (existing) {
    const anySyncing = categories.some((c) => existing.categories[c].status === 'syncing');
    if (anySyncing) return false;
  }

  const cats = existing?.categories ?? defaultCategoryState();
  for (const cat of categories) {
    cats[cat] = { status: 'syncing', progress: 0, detail: 'Starting...' };
  }

  const state: SyncState = {
    categories: cats,
    gamesCount: existing?.gamesCount ?? 0,
    wishlistCount: existing?.wishlistCount ?? 0,
    startedAt: Date.now(),
    completedAt: null,
  };

  persistState(userId, state);
  return true;
}

export function updateCategory(userId: number, category: SyncCategory, partial: Partial<CategorySyncState>): void {
  const existing = loadState(userId);
  if (!existing) return;
  existing.categories[category] = { ...existing.categories[category], ...partial };
  persistState(userId, existing);
}

export function updateSyncCounts(userId: number, counts: { gamesCount?: number; wishlistCount?: number }): void {
  const existing = loadState(userId);
  if (!existing) return;
  if (counts.gamesCount !== undefined) existing.gamesCount = counts.gamesCount;
  if (counts.wishlistCount !== undefined) existing.wishlistCount = counts.wishlistCount;
  persistState(userId, existing);
}

export function markCategoryComplete(userId: number, category: SyncCategory): void {
  const existing = loadState(userId);
  if (!existing) return;
  existing.categories[category] = { status: 'complete', progress: 100, detail: 'Complete' };
  // Check if all active categories are done
  const allDone = ALL_CATEGORIES.every((c) => existing.categories[c].status !== 'syncing');
  if (allDone) {
    existing.completedAt = Date.now();
  }
  persistState(userId, existing);
}

export function markCategoryError(userId: number, category: SyncCategory, detail: string): void {
  const existing = loadState(userId);
  if (!existing) return;
  existing.categories[category] = { ...existing.categories[category], status: 'error', detail };
  const allDone = ALL_CATEGORIES.every((c) => existing.categories[c].status !== 'syncing');
  if (allDone) {
    existing.completedAt = Date.now();
  }
  persistState(userId, existing);
}

export function isSyncRecent(userId: number): boolean {
  const existing = loadState(userId);
  if (!existing) return false;
  const step = getOverallStep(existing);
  if (step !== 'complete') return false;
  if (!existing.completedAt) return false;
  return Date.now() - existing.completedAt < config.syncRecentThresholdMs;
}

/** Remove sync states older than the recent threshold to prevent unbounded growth. */
export function cleanupSyncStates(): void {
  const cutoff = Date.now() - config.syncRecentThresholdMs;
  // Only clean completed syncs that are no longer "recent"
  const rows = db.select().from(sync_states).all();
  for (const row of rows) {
    if (row.completed_at && row.completed_at < cutoff) {
      memCache.delete(row.user_id);
      // Don't delete from DB — keep last sync state for reference.
      // Just clear from memory cache so it doesn't grow unbounded.
    }
  }
}

// Legacy compat helpers
export function updateSync(userId: number, partial: { step?: SyncStep; progress?: number; detail?: string; gamesCount?: number; wishlistCount?: number; completedAt?: number | null }): void {
  const existing = loadState(userId);
  if (!existing) return;
  if (partial.gamesCount !== undefined) existing.gamesCount = partial.gamesCount;
  if (partial.wishlistCount !== undefined) existing.wishlistCount = partial.wishlistCount;
  if (partial.completedAt !== undefined) existing.completedAt = partial.completedAt;
  persistState(userId, existing);
}
