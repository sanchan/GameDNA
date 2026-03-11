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

const syncStates = new Map<number, SyncState>();

const RECENT_THRESHOLD_MS = 5 * 60 * 1000;

function defaultCategoryState(): Record<SyncCategory, CategorySyncState> {
  return {
    library: { status: 'idle', progress: 0, detail: '' },
    wishlist: { status: 'idle', progress: 0, detail: '' },
    backlog: { status: 'idle', progress: 0, detail: '' },
    tags: { status: 'idle', progress: 0, detail: '' },
  };
}

export function getSyncStatus(userId: number): SyncState | null {
  return syncStates.get(userId) ?? null;
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
  const existing = syncStates.get(userId);
  // Check if any of the requested categories are currently syncing
  if (existing) {
    const anySyncing = categories.some((c) => existing.categories[c].status === 'syncing');
    if (anySyncing) return false;
  }

  const cats = existing?.categories ?? defaultCategoryState();
  for (const cat of categories) {
    cats[cat] = { status: 'syncing', progress: 0, detail: 'Starting...' };
  }

  syncStates.set(userId, {
    categories: cats,
    gamesCount: existing?.gamesCount ?? 0,
    wishlistCount: existing?.wishlistCount ?? 0,
    startedAt: Date.now(),
    completedAt: null,
  });

  return true;
}

export function updateCategory(userId: number, category: SyncCategory, partial: Partial<CategorySyncState>): void {
  const existing = syncStates.get(userId);
  if (!existing) return;
  existing.categories[category] = { ...existing.categories[category], ...partial };
}

export function updateSyncCounts(userId: number, counts: { gamesCount?: number; wishlistCount?: number }): void {
  const existing = syncStates.get(userId);
  if (!existing) return;
  if (counts.gamesCount !== undefined) existing.gamesCount = counts.gamesCount;
  if (counts.wishlistCount !== undefined) existing.wishlistCount = counts.wishlistCount;
}

export function markCategoryComplete(userId: number, category: SyncCategory): void {
  updateCategory(userId, category, { status: 'complete', progress: 100, detail: 'Complete' });
  // Check if all active categories are done
  const state = syncStates.get(userId);
  if (!state) return;
  const allDone = ALL_CATEGORIES.every((c) => state.categories[c].status !== 'syncing');
  if (allDone) {
    state.completedAt = Date.now();
  }
}

export function markCategoryError(userId: number, category: SyncCategory, detail: string): void {
  updateCategory(userId, category, { status: 'error', detail });
  const state = syncStates.get(userId);
  if (!state) return;
  const allDone = ALL_CATEGORIES.every((c) => state.categories[c].status !== 'syncing');
  if (allDone) {
    state.completedAt = Date.now();
  }
}

export function isSyncRecent(userId: number): boolean {
  const existing = syncStates.get(userId);
  if (!existing) return false;
  const step = getOverallStep(existing);
  if (step !== 'complete') return false;
  if (!existing.completedAt) return false;
  return Date.now() - existing.completedAt < RECENT_THRESHOLD_MS;
}

// Legacy compat helpers
export function updateSync(userId: number, partial: { step?: SyncStep; progress?: number; detail?: string; gamesCount?: number; wishlistCount?: number; completedAt?: number | null }): void {
  const existing = syncStates.get(userId);
  if (!existing) return;
  if (partial.gamesCount !== undefined) existing.gamesCount = partial.gamesCount;
  if (partial.wishlistCount !== undefined) existing.wishlistCount = partial.wishlistCount;
  if (partial.completedAt !== undefined) existing.completedAt = partial.completedAt;
}
