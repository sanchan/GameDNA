import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from './use-auth';
import { useToast } from '../components/Toast';
import type { Game, SwipeDecision, DiscoveryFilters, DiscoveryMode } from '../../../shared/types';

interface ScoredGame {
  game: Game;
  score: number;
}

function buildQueryString(filters: DiscoveryFilters, mode?: DiscoveryMode, maxHours?: number): string {
  const params = new URLSearchParams();
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
  if (filters.minReviewScore !== undefined) params.set('minReviewScore', String(filters.minReviewScore));
  if (filters.genres && filters.genres.length > 0) params.set('genres', filters.genres.join(','));
  if (mode && mode !== 'default') params.set('mode', mode);
  if (maxHours) params.set('maxHours', String(maxHours));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const SWIPE_LABELS: Record<SwipeDecision, string> = {
  yes: 'Added to Liked',
  no: 'Passed',
  maybe: 'Saved for later',
};

export function useDiscovery() {
  const queryClient = useQueryClient();
  const { syncStatus } = useAuth();
  const { toast } = useToast();
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>('default');
  const [maxHours, setMaxHours] = useState<number | undefined>(undefined);
  const [queue, setQueue] = useState<ScoredGame[]>([]);
  const [swipedCount, setSwipedCount] = useState(0);
  const [totalLoaded, setTotalLoaded] = useState(0);
  const [animatingOut, setAnimatingOut] = useState<'left' | 'right' | 'down' | null>(null);
  const [lastSwipedGame, setLastSwipedGame] = useState<{ game: Game; score: number } | null>(null);
  const prevSyncStatus = useRef(syncStatus);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['discovery-queue', filters, discoveryMode, maxHours],
    queryFn: () => api.get<ScoredGame[]>(`/discovery/queue${buildQueryString(filters, discoveryMode, maxHours)}`),
    staleTime: 0,
  });

  // Refetch queue when sync transitions to 'synced'
  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      setQueue([]);
      setSwipedCount(0);
      setTotalLoaded(0);
      refetch();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, refetch]);

  // Sync fetched data into local queue
  useEffect(() => {
    if (data && data.length > 0) {
      setQueue((prev) => {
        const existingIds = new Set(prev.map((sg) => sg.game.id));
        const newItems = data.filter((sg) => !existingIds.has(sg.game.id));
        if (newItems.length > 0) {
          setTotalLoaded((t) => t + newItems.length);
        }
        return [...prev, ...newItems];
      });
    }
  }, [data, dataUpdatedAt]);

  // Auto-fetch more when queue runs low (but not when fully exhausted)
  useEffect(() => {
    if (queue.length > 0 && queue.length < 3 && !isLoading) {
      refetch();
    }
  }, [queue.length, isLoading, refetch]);

  const swipeMutation = useMutation({
    mutationFn: (params: { gameId: number; decision: SwipeDecision }) =>
      api.post<{ success: boolean }>('/discovery/swipe', params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gaming-dna'] });
      queryClient.invalidateQueries({ queryKey: ['recent-swipes'] });
      toast(SWIPE_LABELS[variables.decision], 'success');
    },
    onError: () => {
      toast('Failed to save swipe', 'error');
    },
  });

  const undoMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean; undone: { gameId: number; decision: string; game: Game | null } }>('/discovery/undo'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['gaming-dna'] });
      queryClient.invalidateQueries({ queryKey: ['recent-swipes'] });
      if (data.undone?.game) {
        // Re-insert the game at the front of the queue
        setQueue((prev) => [{ game: data.undone.game!, score: 0 }, ...prev]);
        setSwipedCount((c) => Math.max(0, c - 1));
        toast(`Undid swipe on "${data.undone.game.name}"`, 'success');
      }
    },
    onError: () => {
      toast('No swipes to undo', 'error');
    },
  });

  const current = queue[0] ?? undefined;
  const currentGame = current?.game;
  const currentScore = current?.score ?? null;

  const swipe = useCallback(
    (decision: SwipeDecision) => {
      if (!currentGame) return;

      // Save last swiped game for undo
      setLastSwipedGame({ game: currentGame, score: currentScore ?? 0 });

      const direction = decision === 'no' ? 'left' : decision === 'yes' ? 'right' : 'down';
      setAnimatingOut(direction);

      // After animation, remove card and post to API
      setTimeout(() => {
        setQueue((prev) => prev.slice(1));
        setSwipedCount((c) => c + 1);
        setAnimatingOut(null);
        swipeMutation.mutate({ gameId: currentGame.id, decision });
      }, 300);
    },
    [currentGame, currentScore, swipeMutation],
  );

  const undo = useCallback(() => {
    undoMutation.mutate();
  }, [undoMutation]);

  const refetchQueue = useCallback(() => {
    setQueue([]);
    setSwipedCount(0);
    setTotalLoaded(0);
    refetch();
  }, [refetch]);

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
