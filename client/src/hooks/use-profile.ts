import { useQuery } from '@tanstack/react-query';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';
import type { GamingDNA, User } from '../../../shared/types';

interface ProfileResponse {
  user: User;
  stats: {
    totalGames: number;
    totalPlaytimeHours: number;
    wishlistCount: number;
  };
}

export function useProfile() {
  const { userId } = useDb();

  return useQuery({
    queryKey: ['user-profile', userId],
    queryFn: (): ProfileResponse | null => {
      if (!userId) return null;
      return queries.getUserProfile(userId);
    },
    enabled: !!userId,
    staleTime: 0,
  });
}

export function useGamingDNA() {
  const { userId } = useDb();

  return useQuery({
    queryKey: ['gaming-dna', userId],
    queryFn: (): GamingDNA | null => {
      if (!userId) return null;
      return queries.getGamingDNA(userId);
    },
    enabled: !!userId,
    staleTime: 0,
  });
}
