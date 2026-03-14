// React context providing DB instance + initialization state.
// Replaces AuthProvider at app root for local-first mode.

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { initDb } from '../db/index';
import * as queries from '../db/queries';
import type { LocalConfig } from '../db/queries';
import { runSync, ALL_CATEGORIES, type SyncCategory, type SyncState, type SyncCallback } from '../services/sync-manager';

type DbStatus = 'loading' | 'ready' | 'error';
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface DbContextType {
  status: DbStatus;
  error: string | null;
  config: LocalConfig | null;
  userId: number | null;
  syncStatus: SyncStatus;
  syncState: SyncState | null;
  refreshConfig: () => Promise<void>;
  triggerSync: (categories?: SyncCategory[]) => Promise<void>;
}

const DbContext = createContext<DbContextType | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DbStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [localConfig, setLocalConfig] = useState<LocalConfig | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        const cfg = await queries.getLocalConfig();
        setLocalConfig(cfg);

        if (cfg.setupComplete && cfg.steamId) {
          const uid = queries.ensureUser(cfg.steamId, cfg.displayName ?? undefined, cfg.avatarUrl ?? undefined, cfg.profileUrl ?? undefined, cfg.countryCode ?? undefined);
          setUserId(uid);
        }

        setStatus('ready');
      } catch (e) {
        console.error('[db-context] Init failed:', e);
        setError(e instanceof Error ? e.message : 'Failed to initialize database');
        setStatus('error');
      }
    })();
  }, []);

  const refreshConfig = useCallback(async () => {
    const cfg = await queries.getLocalConfig();
    setLocalConfig(cfg);
    if (cfg.steamId) {
      const uid = queries.ensureUser(cfg.steamId, cfg.displayName ?? undefined, cfg.avatarUrl ?? undefined, cfg.profileUrl ?? undefined, cfg.countryCode ?? undefined);
      setUserId(uid);
    }
  }, []);

  const triggerSync = useCallback(async (categories?: SyncCategory[]) => {
    if (syncingRef.current || !localConfig?.steamId || !localConfig.steamApiKey) return;
    syncingRef.current = true;
    setSyncStatus('syncing');

    const cats = categories ?? [...ALL_CATEGORIES];
    const uid = userId ?? queries.ensureUser(localConfig.steamId);

    try {
      await runSync(
        uid,
        localConfig.steamId,
        localConfig.steamApiKey,
        cats,
        (state) => {
          setSyncState(state);
          if (state.step === 'complete') {
            setSyncStatus('synced');
            syncingRef.current = false;
          } else if (state.step === 'error') {
            setSyncStatus('error');
            syncingRef.current = false;
          }
        },
        localConfig.countryCode ?? undefined,
      );
    } catch (e) {
      console.error('[sync] Failed:', e);
      setSyncStatus('error');
      syncingRef.current = false;
    }
  }, [localConfig, userId]);

  return (
    <DbContext.Provider value={{ status, error, config: localConfig, userId, syncStatus, syncState, refreshConfig, triggerSync }}>
      {children}
    </DbContext.Provider>
  );
}

export function useDb() {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within DbProvider');
  return ctx;
}
