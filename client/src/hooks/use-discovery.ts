import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from './use-auth';
import type { Game, SwipeDecision, DiscoveryFilters } from '../../../shared/types';

function buildQueryString(filters: DiscoveryFilters): string {
  const params = new URLSearchParams();
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
  if (filters.minReviewScore !== undefined) params.set('minReviewScore', String(filters.minReviewScore));
  if (filters.genres && filters.genres.length > 0) params.set('genres', filters.genres.join(','));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useDiscovery() {
  const queryClient = useQueryClient();
  const { syncStatus } = useAuth();
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [queue, setQueue] = useState<Game[]>([]);
  const [animatingOut, setAnimatingOut] = useState<'left' | 'right' | 'down' | null>(null);
  const prevSyncStatus = useRef(syncStatus);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['discovery-queue', filters],
    queryFn: () => api.get<Game[]>(`/discovery/queue${buildQueryString(filters)}`),
    staleTime: 0, // Always refetch on mount - discovery needs fresh data
  });

  // Refetch queue when sync transitions to 'synced'
  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      setQueue([]);
      refetch();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, refetch]);

  // Sync fetched data into local queue
  useEffect(() => {
    if (data && data.length > 0) {
      setQueue((prev) => {
        const existingIds = new Set(prev.map((g) => g.id));
        const newGames = data.filter((g) => !existingIds.has(g.id));
        return [...prev, ...newGames];
      });
    }
  }, [data, dataUpdatedAt]);

  // Auto-fetch more when queue runs low
  useEffect(() => {
    if (queue.length < 3 && !isLoading) {
      refetch();
    }
  }, [queue.length, isLoading, refetch]);

  const swipeMutation = useMutation({
    mutationFn: (params: { gameId: number; decision: SwipeDecision }) =>
      api.post<{ success: boolean }>('/discovery/swipe', params),
  });

  const currentGame = queue[0] ?? undefined;

  const swipe = useCallback(
    (decision: SwipeDecision) => {
      if (!currentGame) return;

      const direction = decision === 'no' ? 'left' : decision === 'yes' ? 'right' : 'down';
      setAnimatingOut(direction);

      // After animation, remove card and post to API
      setTimeout(() => {
        setQueue((prev) => prev.slice(1));
        setAnimatingOut(null);
        swipeMutation.mutate({ gameId: currentGame.id, decision });
      }, 300);
    },
    [currentGame, swipeMutation],
  );

  const refetchQueue = useCallback(() => {
    setQueue([]);
    refetch();
  }, [refetch]);

  return {
    queue,
    currentGame,
    swipe,
    isLoading: isLoading && queue.length === 0,
    filters,
    setFilters,
    animatingOut,
    refetchQueue,
  };
}
