export type SwipeDecision = 'yes' | 'no' | 'maybe';

export interface User {
  id: number;
  steamId: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}

export interface Game {
  id: number;
  name: string;
  shortDesc: string | null;
  headerImage: string | null;
  genres: string[];
  tags: string[];
  releaseDate: string | null;
  priceCents: number | null;
  priceCurrency: string | null;
  reviewScore: number | null;
  reviewCount: number | null;
  developers: string[];
  publishers: string[];
  platforms: { windows: boolean; mac: boolean; linux: boolean };
}

export interface TasteProfile {
  genreScores: Record<string, number>;
  tagScores: Record<string, number>;
  pricePref: { min: number; max: number; avg: number };
  playtimePref: { avgHours: number; preferLong: boolean };
  aiSummary: string | null;
}

export interface Recommendation {
  id: number;
  game: Game;
  score: number;
  aiExplanation: string | null;
  generatedAt: number;
}

export interface SwipeRecord {
  gameId: number;
  decision: SwipeDecision;
  swipedAt: number;
}

export interface DiscoveryFilters {
  minPrice?: number;
  maxPrice?: number;
  minReviewScore?: number;
  genres?: string[];
  tags?: string[];
  releasedAfter?: string;
}

export interface GamingDNA {
  topGenres: { name: string; score: number }[];
  topTags: { name: string; score: number }[];
  allTags: { name: string; score: number; ignored: boolean; count: number }[];
  totalGames: number;
  totalPlaytimeHours: number;
  swipeStats: { yes: number; no: number; maybe: number };
  aiSummary: string | null;
}
