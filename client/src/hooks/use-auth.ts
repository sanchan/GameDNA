// Auth hook — now a thin wrapper over local-first DB context.
// Maintains the same interface so all existing pages work unchanged.

import { type ReactNode, createElement, Fragment, useMemo, useCallback } from 'react';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';
import type { User } from '../../../shared/types';
import type { SyncCategory, CategorySyncState } from '../services/sync-manager';

export type { SyncCategory, CategorySyncState };

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface SyncProgress {
  step: string;
  progress: number;
  detail: string;
  gamesCount: number;
  wishlistCount: number;
  categories: Record<SyncCategory, CategorySyncState>;
}

const defaultCategories: Record<SyncCategory, CategorySyncState> = {
  library: { status: 'idle', progress: 0, detail: '' },
  wishlist: { status: 'idle', progress: 0, detail: '' },
  backlog: { status: 'idle', progress: 0, detail: '' },
  cache: { status: 'idle', progress: 0, detail: '' },
  tags: { status: 'idle', progress: 0, detail: '' },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // No-op wrapper — DbProvider handles everything now.
  return createElement(Fragment, null, children);
}

export function useAuth() {
  const { config, userId, syncStatus, syncState, triggerSync } = useDb();

  const user: User | null = useMemo(
    () => userId ? queries.getUser(userId) : null,
    [userId, config?.customDisplayName],
  );

  const syncProgress: SyncProgress | null = useMemo(() => syncState ? {
    step: syncState.step,
    progress: syncState.progress,
    detail: syncState.detail,
    gamesCount: syncState.gamesCount,
    wishlistCount: syncState.wishlistCount,
    categories: syncState.categories,
  } : null, [syncState]);

  const wrappedTriggerSync = useCallback(async (categories?: SyncCategory[]) => {
    await triggerSync(categories);
  }, [triggerSync]);

  return {
    user,
    loading: false,
    syncStatus: syncStatus as SyncStatus,
    syncProgress,
    login: () => { /* local mode — setup via onboarding */ },
    logout: () => { /* local mode — use settings to reset */ },
    triggerSync: wrappedTriggerSync,
  };
}
