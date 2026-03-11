import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
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
  return useQuery({
    queryKey: ['user-profile'],
    queryFn: () => api.get<ProfileResponse>('/user/profile'),
    staleTime: 0, // Always refetch - data may change after sync
  });
}

export function useGamingDNA() {
  return useQuery({
    queryKey: ['gaming-dna'],
    queryFn: () => api.get<GamingDNA>('/user/gaming-dna'),
    staleTime: 0, // Always refetch - data may change after sync
  });
}
