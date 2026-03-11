import { createContext, useContext, ReactNode, useState, useEffect, useCallback, useRef, createElement } from 'react';
import { api } from '../lib/api';
import type { User } from '../../../shared/types';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface SyncResult {
  gamesCount: number;
  wishlistCount: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  syncStatus: SyncStatus;
  syncResult: SyncResult | null;
  login: () => void;
  logout: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const syncTriggered = useRef(false);

  const doSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const result = await api.post<SyncResult>('/user/sync');
      setSyncResult(result);
      setSyncStatus('synced');
      // Re-fetch user info (displayName/avatar may have been updated during sync)
      try {
        const updatedUser = await api.get<User>('/auth/me');
        setUser(updatedUser);
      } catch {
        // non-fatal
      }
    } catch {
      setSyncStatus('error');
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncStatus === 'syncing') return;
    await doSync();
  }, [syncStatus, doSync]);

  useEffect(() => {
    api.get<User>('/auth/me')
      .then((u) => {
        setUser(u);
        // Auto-sync on first successful auth
        if (!syncTriggered.current) {
          syncTriggered.current = true;
          doSync();
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [doSync]);

  const login = () => {
    window.location.href = '/api/auth/login';
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
    setSyncStatus('idle');
    setSyncResult(null);
    syncTriggered.current = false;
  };

  return createElement(AuthContext.Provider, {
    value: { user, loading, syncStatus, syncResult, login, logout, triggerSync },
  }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
