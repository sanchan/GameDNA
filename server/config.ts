// Centralized configuration — all magic numbers and tunable constants live here.
// Override via environment variables where noted.

export const config = {
  // ── Cache ──────────────────────────────────────────────────────────────
  /** Game metadata cache TTL in seconds (env: CACHE_TTL_SECONDS, default 7 days) */
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 7 * 24 * 60 * 60,

  // ── Sessions ───────────────────────────────────────────────────────────
  /** Session lifetime in ms (30 days) */
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** How often to run expired-session cleanup in ms (1 hour) */
  sessionCleanupIntervalMs: 60 * 60 * 1000,

  // ── Sync ───────────────────────────────────────────────────────────────
  /** Consider a sync "recent" if completed within this many ms (5 min) */
  syncRecentThresholdMs: 5 * 60 * 1000,

  // ── Rate limiting ──────────────────────────────────────────────────────
  /** Steam Web API: max requests per window */
  webApiMaxTokens: 200,
  /** Steam Web API: refill window in ms (5 min) */
  webApiRefillMs: 300_000,
  /** Steam Store API: max requests per window */
  storeApiMaxTokens: 30,
  /** Steam Store API: refill window in ms (30s) */
  storeApiRefillMs: 30_000,

  // ── Game caching batches ───────────────────────────────────────────────
  /** How many games to fetch concurrently when batch-caching */
  cacheBatchSize: 3,
  /** Delay between cache batches in ms */
  cacheBatchDelayMs: 1000,
  /** Max appids per SQL IN() clause to stay within SQLite variable limits */
  sqlChunkSize: 500,

  // ── Retry ──────────────────────────────────────────────────────────────
  /** Max retries when fetching game details fails */
  cacheRetryAttempts: 2,
  /** Initial backoff delay in ms (doubles on each retry) */
  cacheRetryBaseDelayMs: 1000,

  // ── Recommendation scoring weights ─────────────────────────────────────
  scoring: {
    genreWeight: 0.4,
    tagWeight: 0.3,
    reviewWeight: 0.2,
    recencyWeight: 0.1,
  },

  // ── Recommendation pipeline sizes ──────────────────────────────────────
  /** SQL pre-filter: how many candidates to pull from DB */
  recCandidatePoolSize: 200,
  /** How many candidates pass heuristic filter to reach AI layer */
  recHeuristicTopN: 50,
  /** Ollama AI scoring batch size */
  recAiBatchSize: 10,
  /** Top genres used in scoring */
  recTopGenresCount: 10,
  /** Top tags used in scoring */
  recTopTagsCount: 15,

  // ── Taste profile weights ──────────────────────────────────────────────
  tasteWeights: {
    /** Playtime > 10h */
    highPlaytime: 1.0,
    /** Playtime 1–10h */
    mediumPlaytime: 0.5,
    /** Playtime < 1h */
    lowPlaytime: 0.1,
    /** Swipe yes */
    swipeYes: 1.0,
    /** Swipe maybe */
    swipeMaybe: 0.3,
    /** Swipe no */
    swipeNo: -0.5,
  },

  // ── API client (browser side is configured separately) ─────────────────
  /** Client-side request timeout in ms (env: API_TIMEOUT_MS, default 30s) */
  apiTimeoutMs: Number(process.env.API_TIMEOUT_MS) || 30_000,

  // ── Pagination defaults ────────────────────────────────────────────────
  /** Default page size for list endpoints */
  defaultPageSize: 50,
  /** Maximum allowed page size */
  maxPageSize: 200,
} as const;
