import { createContext, useContext, ReactNode, useState, useEffect, useCallback, useRef, createElement } from 'react';
import { api } from '../lib/api';
import type { User } from '../../../shared/types';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export type SyncCategory = 'library' | 'wishlist' | 'backlog' | 'tags';
export type CategoryStatus = 'idle' | 'syncing' | 'complete' | 'error';

export interface CategorySyncState {
  status: CategoryStatus;
  progress: number;
  detail: string;
}

export interface SyncProgress {
  step: string;
  progress: number;
  detail: string;
  gamesCount: number;
  wishlistCount: number;
  categories: Record<SyncCategory, CategorySyncState>;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  syncStatus: SyncStatus;
  syncProgress: SyncProgress | null;
  login: () => void;
  logout: () => Promise<void>;
  triggerSync: (categories?: SyncCategory[]) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const defaultCategories: Record<SyncCategory, CategorySyncState> = {
  library: { status: 'idle', progress: 0, detail: '' },
  wishlist: { status: 'idle', progress: 0, detail: '' },
  backlog: { status: 'idle', progress: 0, detail: '' },
  tags: { status: 'idle', progress: 0, detail: '' },
};

interface SyncResponse {
  status: 'started' | 'in_progress' | 'already_synced';
  categories?: string[];
}

interface SyncStatusResponse {
  step: string;
  progress: number;
  detail: string;
  gamesCount: number;
  wishlistCount: number;
  categories: Record<SyncCategory, CategorySyncState>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const syncTriggered = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const status = await api.get<SyncStatusResponse>('/user/sync-status');
        setSyncProgress({
          step: status.step,
          progress: status.progress,
          detail: status.detail,
          gamesCount: status.gamesCount,
          wishlistCount: status.wishlistCount,
          categories: status.categories ?? defaultCategories,
        });

        if (status.step === 'complete') {
          setSyncStatus('synced');
          stopPolling();
          try {
            const updatedUser = await api.get<User>('/auth/me');
            setUser(updatedUser);
          } catch {
            // non-fatal
          }
        } else if (status.step === 'error') {
          setSyncStatus('error');
          stopPolling();
        }
      } catch {
        // polling error, keep trying
      }
    }, 2000);
  }, [stopPolling]);

  const doSync = useCallback(async (categories?: SyncCategory[]) => {
    setSyncStatus('syncing');
    setSyncProgress({
      step: 'starting',
      progress: 0,
      detail: 'Starting sync...',
      gamesCount: 0,
      wishlistCount: 0,
      categories: {
        ...defaultCategories,
        ...(categories
          ? Object.fromEntries(categories.map((c) => [c, { status: 'syncing' as const, progress: 0, detail: 'Starting...' }]))
          : Object.fromEntries(Object.keys(defaultCategories).map((c) => [c, { status: 'syncing' as const, progress: 0, detail: 'Starting...' }]))
        ),
      },
    });
    try {
      const body = categories ? { categories } : undefined;
      const result = await api.post<SyncResponse>('/user/sync', body);

      if (result.status === 'started' || result.status === 'in_progress') {
        startPolling();
      }
    } catch {
      setSyncStatus('error');
    }
  }, [startPolling]);

  const triggerSync = useCallback(async (categories?: SyncCategory[]) => {
    if (syncStatus === 'syncing') {
      // Allow syncing individual categories even when others are syncing
      // But check if the specific requested categories are already syncing
      if (syncProgress?.categories && categories) {
        const allRequested = categories.every((c) => syncProgress.categories[c].status === 'syncing');
        if (allRequested) return;
      } else {
        return;
      }
    }
    await doSync(categories);
  }, [syncStatus, syncProgress, doSync]);

  useEffect(() => {
    api.get<User>('/auth/me')
      .then(async (u) => {
        setUser(u);

        if (syncTriggered.current) return;
        syncTriggered.current = true;

        try {
          const status = await api.get<SyncStatusResponse>('/user/sync-status');

          if (status.step === 'complete') {
            setSyncStatus('synced');
            setSyncProgress({
              step: status.step,
              progress: status.progress,
              detail: status.detail,
              gamesCount: status.gamesCount,
              wishlistCount: status.wishlistCount,
              categories: status.categories ?? defaultCategories,
            });
          } else if (status.step !== 'idle') {
            setSyncStatus('syncing');
            setSyncProgress({
              step: status.step,
              progress: status.progress,
              detail: status.detail,
              gamesCount: status.gamesCount,
              wishlistCount: status.wishlistCount,
              categories: status.categories ?? defaultCategories,
            });
            startPolling();
          } else {
            doSync();
          }
        } catch {
          doSync();
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [doSync, startPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const login = () => {
    window.location.href = '/api/auth/login';
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
    setSyncStatus('idle');
    setSyncProgress(null);
    syncTriggered.current = false;
    stopPolling();
  };

  return createElement(AuthContext.Provider, {
    value: { user, loading, syncStatus, syncProgress, login, logout, triggerSync },
  }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
