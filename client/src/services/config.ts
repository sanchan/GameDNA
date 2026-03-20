// Client-side config — mirrors server/config.ts without process.env references.

export const config = {
  cacheTtlSeconds: 7 * 24 * 60 * 60, // 7 days
  syncRecentThresholdMs: 5 * 60 * 1000,

  webApiMaxTokens: 200,
  webApiRefillMs: 300_000,
  storeApiMaxTokens: 30,
  storeApiRefillMs: 30_000,

  cacheBatchSize: 3,
  cacheBatchDelayMs: 1000,
  sqlChunkSize: 500,

  cacheRetryAttempts: 2,
  cacheRetryBaseDelayMs: 1000,

  scoring: {
    genreWeight: 0.4,
    tagWeight: 0.3,
    reviewWeight: 0.2,
    recencyWeight: 0.1,
  },

  recCandidatePoolSize: 200,
  recHeuristicTopN: 50,
  recAiBatchSize: 10,
  recTopGenresCount: 10,
  recTopTagsCount: 15,

  tasteWeights: {
    highPlaytime: 1.0,
    mediumPlaytime: 0.5,
    lowPlaytime: 0.1,
    wishlist: 0.3,
    bookmark: 0.5,
    swipeYes: 1.0,
    swipeMaybe: 0.3,
    swipeNo: -0.8,
  },

  poolExpansion: {
    maxSearchTerms: 8,           // 3 genres + 5 tags
    maxNewGamesPerExpand: 100,   // cap per expansion run
    minIntervalMs: 30 * 60_000, // 30min cooldown
    topGenreCount: 3,
    topTagCount: 5,
  },

  // Temporal decay: swipes/signals decay over time so recent preferences matter more
  temporalDecayRate: 0.01,        // ~50% weight after 70 days

  // Bayesian review credibility: games with few reviews are pulled toward the global mean
  reviewCredibilityThreshold: 5000,  // reviews needed for full credibility
  globalAverageReviewScore: 70,      // assumed global average (%)

  // Cold start: minimum swipes before profile is considered reliable
  coldStartThreshold: 20,

  apiTimeoutMs: 30_000,
  defaultPageSize: 50,
  maxPageSize: 200,

  estimatedPlaytimeByGenre: {
    'rpg': 50, 'strategy': 40, 'simulation': 35, 'adventure': 25,
    'action': 15, 'indie': 12, 'casual': 8, 'racing': 10,
    'sports': 15, 'puzzle': 10, 'platformer': 10, 'shooter': 12,
    'fighting': 8, 'mmo': 100, 'massively multiplayer': 100,
    'free to play': 20, 'early access': 15,
  } as Record<string, number>,
  estimatedPlaytimeDefault: 15,
} as const;
