import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useDb } from '../contexts/db-context';
import { useToast } from '../components/Toast';
import * as queries from '../db/queries';
import { recalculateTasteProfile } from '../services/taste-profile';
import { getColdStartStatus } from '../services/recommendation';
import type { Game, SwipeDecision, DiscoveryFilters, DiscoveryMode } from '../../../shared/types';

interface ScoredGame {
  game: Game;
  score: number;
}

const SWIPE_LABELS: Record<SwipeDecision, string> = {
  yes: 'Added to Liked',
  no: 'Passed',
  maybe: 'Saved for later',
};

// Persist queue state across remounts (e.g. navigating to GameDetail and back)
let cachedQueue: ScoredGame[] = [];
let cachedSwipedCount = 0;
let cachedTotalLoaded = 0;
// Undo stack: keep up to 10 undoable swipes
let undoStack: { game: Game; decision: SwipeDecision }[] = [];
const MAX_UNDO_DEPTH = 10;

// Persist filters to localStorage
const FILTER_STORAGE_KEY = 'gamedna_discovery_filters';
const MODE_STORAGE_KEY = 'gamedna_discovery_mode';

function loadPersistedFilters(): DiscoveryFilters {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function loadPersistedMode(): DiscoveryMode {
  try {
    return (localStorage.getItem(MODE_STORAGE_KEY) as DiscoveryMode) ?? 'default';
  } catch { return 'default'; }
}

export function useDiscovery() {
  const queryClient = useQueryClient();
  const { syncStatus } = useAuth();
  const { userId } = useDb();
  const { toast } = useToast();
  const [filters, setFiltersState] = useState<DiscoveryFilters>(loadPersistedFilters);
  const [discoveryMode, setDiscoveryModeState] = useState<DiscoveryMode>(loadPersistedMode);
  const [maxHours, setMaxHours] = useState<number | undefined>(undefined);
  const [queue, setQueue] = useState<ScoredGame[]>(cachedQueue);
  const [swipedCount, setSwipedCount] = useState(cachedSwipedCount);
  const [totalLoaded, setTotalLoaded] = useState(cachedTotalLoaded);
  const [animatingOut, setAnimatingOut] = useState<'left' | 'right' | 'down' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const prevSyncStatus = useRef(syncStatus);

  // Cold start status
  const [coldStart, setColdStart] = useState<{ isColdStart: boolean; current: number; threshold: number } | null>(null);

  useEffect(() => {
    if (userId) {
      setColdStart(getColdStartStatus(userId));
    }
  }, [userId, swipedCount]);

  // Persist filters and mode
  const setFilters = useCallback((f: DiscoveryFilters) => {
    setFiltersState(f);
    try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(f)); } catch {}
  }, []);

  const setDiscoveryMode = useCallback((m: DiscoveryMode) => {
    setDiscoveryModeState(m);
    try { localStorage.setItem(MODE_STORAGE_KEY, m); } catch {}
  }, []);

  // Keep module-level cache in sync
  useEffect(() => { cachedQueue = queue; }, [queue]);
  useEffect(() => { cachedSwipedCount = swipedCount; }, [swipedCount]);
  useEffect(() => { cachedTotalLoaded = totalLoaded; }, [totalLoaded]);

  const fetchQueue = useCallback(() => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const results = queries.getDiscoveryQueue(userId, filters, discoveryMode, maxHours);
      setQueue((prev) => {
        const existingIds = new Set(prev.map((sg) => sg.game.id));
        const newItems = results.filter((sg) => !existingIds.has(sg.game.id));
        if (newItems.length > 0) {
          setTotalLoaded((t) => t + newItems.length);
        }
        return [...prev, ...newItems];
      });
    } catch (e) {
      console.error('[discovery] Queue fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [userId, filters, discoveryMode, maxHours]);

  // Initial load (skip if we have cached games from a previous mount)
  const skipInitialFetch = useRef(queue.length > 0);
  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    if (userId) fetchQueue();
  }, [userId, filters, discoveryMode, maxHours, fetchQueue]);

  // Refetch queue when sync transitions to 'synced'
  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      setQueue([]);
      setSwipedCount(0);
      setTotalLoaded(0);
      fetchQueue();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, fetchQueue]);

  // Auto-fetch more when queue runs low
  useEffect(() => {
    if (queue.length > 0 && queue.length < 3 && !isLoading) {
      fetchQueue();
    }
  }, [queue.length, isLoading, fetchQueue]);

  // Pre-load next card images for instant transitions
  useEffect(() => {
    const preloadCount = 2;
    for (let i = 1; i <= preloadCount && i < queue.length; i++) {
      const img = queue[i]?.game?.headerImage;
      if (img) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'image';
        link.href = img;
        document.head.appendChild(link);
      }
    }
  }, [queue]);

  const current = queue[0] ?? undefined;
  const currentGame = current?.game;
  const currentScore = current?.score ?? null;

  const swipe = useCallback(
    (decision: SwipeDecision) => {
      if (!currentGame || !userId) return;

      // Push to undo stack
      undoStack.push({ game: currentGame, decision });
      if (undoStack.length > MAX_UNDO_DEPTH) undoStack.shift();

      const direction = decision === 'no' ? 'left' : decision === 'yes' ? 'right' : 'down';
      setAnimatingOut(direction);

      setTimeout(() => {
        setQueue((prev) => prev.slice(1));
        setSwipedCount((c) => c + 1);
        setAnimatingOut(null);

        // Record to local DB
        queries.recordSwipe(userId, currentGame.id, decision);

        // Recalculate taste profile in background
        try { recalculateTasteProfile(userId); } catch {}

        queryClient.invalidateQueries({ queryKey: ['gaming-dna'] });
        queryClient.invalidateQueries({ queryKey: ['recent-swipes'] });
        toast(SWIPE_LABELS[decision], 'success');
      }, 300);
    },
    [currentGame, userId, queryClient, toast],
  );

  const undo = useCallback(() => {
    if (!userId || undoStack.length === 0) return;
    const last = undoStack.pop()!;
    // Undo in DB
    const result = queries.undoLastSwipe(userId);
    if (result?.game) {
      setQueue((prev) => [{ game: result.game!, score: 0 }, ...prev]);
      setSwipedCount((c) => Math.max(0, c - 1));
      try { recalculateTasteProfile(userId); } catch {}
      queryClient.invalidateQueries({ queryKey: ['gaming-dna'] });
      queryClient.invalidateQueries({ queryKey: ['recent-swipes'] });
      toast(`Undid swipe on "${result.game.name}"`, 'success');
    } else {
      toast('No swipes to undo', 'error');
    }
  }, [userId, queryClient, toast]);

  const refetchQueue = useCallback(() => {
    setQueue([]);
    setSwipedCount(0);
    setTotalLoaded(0);
    fetchQueue();
  }, [fetchQueue]);

  return {
    queue,
    currentGame,
    currentScore,
    swipe,
    undo,
    canUndo: undoStack.length > 0,
    undoDepth: undoStack.length,
    isLoading: isLoading && queue.length === 0,
    filters,
    setFilters,
    animatingOut,
    refetchQueue,
    swipedCount,
    totalLoaded,
    discoveryMode,
    setDiscoveryMode,
    maxHours,
    setMaxHours,
    coldStart,
  };
}
