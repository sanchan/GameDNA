import { createContext, useContext, ReactNode, useState, useEffect, useCallback, useRef, createElement } from 'react';
import { api } from '../lib/api';
import type { User } from '../../../shared/types';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface SyncProgress {
  step: string;
  progress: number;
  detail: string;
  gamesCount: number;
  wishlistCount: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  syncStatus: SyncStatus;
  syncProgress: SyncProgress | null;
  login: () => void;
  logout: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface SyncResponse {
  status: 'started' | 'in_progress' | 'already_synced';
  gamesCount?: number;
  wishlistCount?: number;
}

interface SyncStatusResponse {
  step: string;
  progress: number;
  detail: string;
  gamesCount: number;
  wishlistCount: number;
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

  const doSync = useCallback(async () => {
    setSyncStatus('syncing');
    setSyncProgress({ step: 'starting', progress: 0, detail: 'Starting sync...', gamesCount: 0, wishlistCount: 0 });
    try {
      const result = await api.post<SyncResponse>('/user/sync');

      if (result.status === 'started' || result.status === 'in_progress') {
        startPolling();
      }
    } catch {
      setSyncStatus('error');
    }
  }, [startPolling]);

  const triggerSync = useCallback(async () => {
    if (syncStatus === 'syncing') return;
    await doSync();
  }, [syncStatus, doSync]);

  useEffect(() => {
    api.get<User>('/auth/me')
      .then(async (u) => {
        setUser(u);

        if (syncTriggered.current) return;
        syncTriggered.current = true;

        // Check server-side sync status before deciding to auto-sync
        try {
          const status = await api.get<SyncStatusResponse>('/user/sync-status');

          if (status.step === 'complete') {
            // Already synced previously — don't re-sync automatically
            setSyncStatus('synced');
            setSyncProgress({
              step: status.step,
              progress: status.progress,
              detail: status.detail,
              gamesCount: status.gamesCount,
              wishlistCount: status.wishlistCount,
            });
          } else if (status.step !== 'idle') {
            // Sync is currently in progress (started from another tab/before refresh)
            setSyncStatus('syncing');
            startPolling();
          } else {
            // Never synced — first login, auto-sync
            doSync();
          }
        } catch {
          // Can't check status, try syncing
          doSync();
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [doSync, startPolling]);

  // Cleanup polling on unmount
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
