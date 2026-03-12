import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useDb } from '../contexts/db-context';
import { useToast } from '../components/Toast';
import * as queries from '../db/queries';
import { recalculateTasteProfile } from '../services/taste-profile';
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

export function useDiscovery() {
  const queryClient = useQueryClient();
  const { syncStatus } = useAuth();
  const { userId } = useDb();
  const { toast } = useToast();
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>('default');
  const [maxHours, setMaxHours] = useState<number | undefined>(undefined);
  const [queue, setQueue] = useState<ScoredGame[]>([]);
  const [swipedCount, setSwipedCount] = useState(0);
  const [totalLoaded, setTotalLoaded] = useState(0);
  const [animatingOut, setAnimatingOut] = useState<'left' | 'right' | 'down' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const prevSyncStatus = useRef(syncStatus);

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

  // Initial load
  useEffect(() => {
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

  const current = queue[0] ?? undefined;
  const currentGame = current?.game;
  const currentScore = current?.score ?? null;

  const swipe = useCallback(
    (decision: SwipeDecision) => {
      if (!currentGame || !userId) return;

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
    if (!userId) return;
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
    canUndo: swipedCount > 0,
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
  };
}
