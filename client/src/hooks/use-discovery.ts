import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
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
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [queue, setQueue] = useState<Game[]>([]);
  const [animatingOut, setAnimatingOut] = useState<'left' | 'right' | 'down' | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['discovery-queue', filters],
    queryFn: () => api.get<Game[]>(`/discovery/queue${buildQueryString(filters)}`),
  });

  // Sync fetched data into local queue
  useEffect(() => {
    if (data && data.length > 0) {
      setQueue((prev) => {
        const existingIds = new Set(prev.map((g) => g.id));
        const newGames = data.filter((g) => !existingIds.has(g.id));
        return [...prev, ...newGames];
      });
    }
  }, [data]);

  // Auto-fetch more when queue runs low
  useEffect(() => {
    if (queue.length < 3 && !isLoading) {
      queryClient.invalidateQueries({ queryKey: ['discovery-queue', filters] });
    }
  }, [queue.length, isLoading, filters, queryClient]);

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

  return {
    queue,
    currentGame,
    swipe,
    isLoading: isLoading && queue.length === 0,
    filters,
    setFilters,
    animatingOut,
  };
}
