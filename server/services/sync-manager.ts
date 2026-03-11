export type SyncStep =
  | 'starting'
  | 'fetching-library'
  | 'caching-library'
  | 'building-profile'
  | 'seeding-discovery'
  | 'generating-recommendations'
  | 'complete'
  | 'error';

export interface SyncState {
  step: SyncStep;
  progress: number; // 0-100
  detail: string;
  gamesCount: number;
  wishlistCount: number;
  startedAt: number;
  completedAt: number | null;
}

const syncStates = new Map<number, SyncState>();

const RECENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function getSyncStatus(userId: number): SyncState | null {
  return syncStates.get(userId) ?? null;
}

export function startSync(userId: number): boolean {
  const existing = syncStates.get(userId);
  if (existing && existing.step !== 'complete' && existing.step !== 'error') {
    return false; // already in progress
  }

  syncStates.set(userId, {
    step: 'starting',
    progress: 0,
    detail: 'Starting sync...',
    gamesCount: 0,
    wishlistCount: 0,
    startedAt: Date.now(),
    completedAt: null,
  });

  return true;
}

export function updateSync(userId: number, partial: Partial<SyncState>): void {
  const existing = syncStates.get(userId);
  if (!existing) return;
  syncStates.set(userId, { ...existing, ...partial });
}

export function isSyncRecent(userId: number): boolean {
  const existing = syncStates.get(userId);
  if (!existing) return false;
  if (existing.step !== 'complete') return false;
  if (!existing.completedAt) return false;
  return Date.now() - existing.completedAt < RECENT_THRESHOLD_MS;
}
