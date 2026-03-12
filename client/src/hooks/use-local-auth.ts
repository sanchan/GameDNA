// Local-first auth hook — reads config from client DB.
// Replaces use-auth.ts for local-first mode.

import { useDb } from '../contexts/db-context';
import type { User } from '../../../shared/types';
import * as queries from '../db/queries';

export function useLocalAuth() {
  const { config, userId, syncStatus, syncState, triggerSync } = useDb();

  const user: User | null = userId ? queries.getUser(userId) : null;

  return {
    user,
    loading: false,
    isSetupComplete: config?.setupComplete ?? false,
    steamId: config?.steamId ?? null,
    apiKey: config?.steamApiKey ?? null,
    syncStatus,
    syncProgress: syncState ? {
      step: syncState.step,
      progress: syncState.progress,
      detail: syncState.detail,
      gamesCount: syncState.gamesCount,
      wishlistCount: syncState.wishlistCount,
      categories: syncState.categories,
    } : null,
    triggerSync,
    login: () => { /* no-op in local mode */ },
    logout: () => { /* no-op in local mode */ },
  };
}
