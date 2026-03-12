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
  source: 'ai' | 'heuristic';
}

export interface ProfileSnapshot {
  id: number;
  topGenres: { name: string; score: number }[];
  topTags: { name: string; score: number }[];
  totalGames: number;
  totalPlaytimeHours: number;
  createdAt: number;
}

export interface AiSummaryEntry {
  id: number;
  summary: string;
  createdAt: number;
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

// ── Phase 4 types ──────────────────────────────────────────────────────────

export interface Collection {
  id: number;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  gameCount: number;
  createdAt: number;
}

export interface GameNote {
  gameId: number;
  content: string;
  updatedAt: number;
}

export type GameStatusType = 'playing' | 'completed' | 'abandoned' | 'plan_to_play';

export interface GameStatusEntry {
  gameId: number;
  status: GameStatusType;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  game?: Game;
}

export interface UserSettings {
  theme: 'dark' | 'light';
  backupDir: string | null;
  backupIntervalHours: number;
  ollamaUrl: string | null;
  ollamaModel: string | null;
  cacheTtlSeconds: number | null;
  language: string;
  keyboardShortcuts: Record<string, string> | null;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface AutoCategory {
  gameId: number;
  category: string;
  confidence: number;
  game?: Game;
}

export interface PriceAlert {
  id: number;
  gameId: number;
  targetPriceCents: number | null;
  currentPriceCents: number | null;
  lastChecked: number | null;
  alerted: boolean;
  game?: Game;
}

export interface PublisherBlacklist {
  id: number;
  name: string;
  type: 'publisher' | 'developer';
}

export type DiscoveryMode = 'default' | 'hidden_gems' | 'new_releases' | 'genre_deep_dive' | 'contrarian';

export interface DashboardStats {
  totalGames: number;
  totalPlaytimeHours: number;
  totalValueCents: number;
  gamesByGenre: { genre: string; count: number }[];
  gamesByYear: { year: string; count: number }[];
  playedVsUnplayed: { played: number; unplayed: number };
  topPlayedGames: { game: Game; playtimeMins: number }[];
  swipeStats: { yes: number; no: number; maybe: number };
  recentActivity: { date: string; swipes: number }[];
}

export interface YearInReview {
  year: number;
  topGenre: string;
  topPlayedGame: { game: Game; playtimeMins: number } | null;
  totalDiscoveries: number;
  totalSwipes: number;
  genresExplored: number;
  swipeBreakdown: { yes: number; no: number; maybe: number };
  monthlyActivity: { month: string; swipes: number }[];
  profileEvolution: { start: Record<string, number>; end: Record<string, number> };
}

export interface ProfileComparison {
  user1: { name: string; topGenres: { name: string; score: number }[] };
  user2: { name: string; topGenres: { name: string; score: number }[] };
  similarity: number;
  sharedGenres: string[];
  uniqueToUser1: string[];
  uniqueToUser2: string[];
}
