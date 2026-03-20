// Client-side Steam API — calls go through the micro-proxy to avoid CORS issues
// in browser mode. In Tauri, calls go directly to Steam (no proxy needed).

import { config } from './config';
import { logApiCall } from './api-audit';

const PROXY_BASE = '/api/steam';
// Only bypass proxy in Tauri production builds (https://tauri.localhost).
// In tauri:dev the webview loads from http://localhost:5173 where CORS applies,
// but the proxy is running so we use it like browser mode.
const IS_TAURI_PROD = typeof window !== 'undefined'
  && '__TAURI_INTERNALS__' in window
  && window.location.protocol !== 'http:';

/**
 * In Tauri mode, convert proxy URLs to direct Steam API URLs.
 * In browser mode, return the proxy URL unchanged.
 */
/**
 * In Tauri mode, convert proxy URLs to direct Steam API URLs.
 * API key is NO LONGER injected into the URL — it goes via headers instead
 * to avoid leaking in browser history, network inspectors, and crash reports.
 */
function resolveSteamUrl(proxyUrl: string): string {
  if (!IS_TAURI_PROD) return proxyUrl;

  const rel = proxyUrl.startsWith(PROXY_BASE) ? proxyUrl.slice(PROXY_BASE.length) : proxyUrl;

  if (rel.startsWith('/web/')) {
    const path = rel.slice(5);
    return `https://api.steampowered.com/${path}`;
  }
  if (rel.startsWith('/store/')) {
    return `https://store.steampowered.com/api/${rel.slice(7)}`;
  }
  if (rel.startsWith('/tagdata/')) {
    return `https://store.steampowered.com${rel}`;
  }
  if (rel.startsWith('/reviews/')) {
    return `https://store.steampowered.com/appreviews/${rel.slice(9)}`;
  }

  return proxyUrl;
}
export const DAILY_LIMIT = 100_000;

// ── Rate limit tracking (SQLite-backed with localStorage fallback) ──────────
// Rate limits are tracked in SQLite to avoid localStorage manipulation. Falls
// back to localStorage if DB isn't initialized yet (early startup).

import { getDb, persistDb } from '../db/index';

/** Read the current daily API call count (resets at midnight). */
export function getDailyApiUsage(): { count: number; limit: number; date: string } {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const stmt = getDb().prepare('SELECT date, count FROM rate_limits WHERE id = 1');
    if (stmt.step()) {
      const row = stmt.getAsObject() as { date: string; count: number };
      stmt.free();
      if (row.date !== today) return { count: 0, limit: DAILY_LIMIT, date: today };
      return { count: row.count, limit: DAILY_LIMIT, date: today };
    }
    stmt.free();
  } catch {
    // DB not ready — fall through
  }
  return { count: 0, limit: DAILY_LIMIT, date: today };
}

/** Track daily API call count to respect the Steam 100K/day limit. */
function checkDailyLimit(count: number = 1): boolean {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT date, count FROM rate_limits WHERE id = 1');
    let data = { date: today, count: 0 };
    if (stmt.step()) {
      const row = stmt.getAsObject() as { date: string; count: number };
      data = row.date === today ? { date: today, count: row.count } : { date: today, count: 0 };
    }
    stmt.free();

    if (data.count + count > DAILY_LIMIT) return false;
    data.count += count;
    db.run(
      'INSERT INTO rate_limits (id, date, count) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET date = excluded.date, count = excluded.count',
      [data.date, data.count] as any[],
    );
    persistDb();
    return true;
  } catch {
    // DB not ready — allow the call (best effort)
    return true;
  }
}

// Token bucket rate limiter (client-side version)
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number = 200,
    private refillMs: number = 300000,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
      this.refill();
      if (this.tokens <= 0) {
        const waitMs = this.refillMs - (Date.now() - this.lastRefill);
        await new Promise((r) => setTimeout(r, waitMs));
        this.refill();
      }
      this.tokens--;
    }
  }

  private refill() {
    const now = Date.now();
    if (now - this.lastRefill >= this.refillMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }
}

const webApiLimiter = new RateLimiter(config.webApiMaxTokens, config.webApiRefillMs);
const storeApiLimiter = new RateLimiter(config.storeApiMaxTokens, config.storeApiRefillMs);

// ── Request deduplication ────────────────────────────────────────────────────
// If a request for a given key (e.g. appid) is already in-flight, reuse the
// existing promise instead of firing a duplicate network call.
const inflight = new Map<string, Promise<any>>();

function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export interface OwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
  rtime_last_played: number;
  img_icon_url: string;
}

export interface GameDetails {
  appid: number;
  name: string;
  short_description: string;
  header_image: string;
  genres: string[];
  tags: string[];
  release_date: string;
  price_cents: number | null;
  price_currency: string | null;
  metacritic_score: number | null;
  review_count: number | null;
  developers: string[];
  publishers: string[];
  platforms: { windows: boolean; mac: boolean; linux: boolean };
  screenshots: { thumbnail: string; full: string }[];
  movies: { thumbnail: string; webm480: string; webmMax: string }[];
}

export interface PlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
  profileurl: string;
  loccountrycode?: string;
}

/** Fetch with audit logging — wraps fetch to record all external API calls. */
async function auditedFetch(url: string, init?: RequestInit): Promise<Response> {
  const start = Date.now();
  // Strip API keys from logged URL for privacy
  const sanitizedUrl = url.replace(/key=[^&]+/, 'key=***');
  try {
    const res = await fetch(url, init);
    logApiCall({ timestamp: Date.now(), method: init?.method ?? 'GET', url: sanitizedUrl, status: res.status, durationMs: Date.now() - start });
    return res;
  } catch (e) {
    logApiCall({ timestamp: Date.now(), method: init?.method ?? 'GET', url: sanitizedUrl, status: null, durationMs: Date.now() - start, error: e instanceof Error ? e.message : 'Unknown' });
    throw e;
  }
}

/** Fetch via proxy (browser) or directly (Tauri). For web API calls with API key. */
async function fetchWithProxy(url: string, apiKey?: string): Promise<Response> {
  if (!checkDailyLimit()) throw new Error('Steam API daily limit (100,000 calls) reached. Try again tomorrow.');
  const resolved = resolveSteamUrl(url);
  if (IS_TAURI_PROD) {
    // In Tauri prod, inject API key as query param on the resolved URL (direct Steam call).
    // The URL stays local to the Tauri process and isn't exposed to browser history.
    const tauriUrl = new URL(resolved);
    if (apiKey) tauriUrl.searchParams.set('key', apiKey);
    return auditedFetch(tauriUrl.toString());
  }
  // In browser dev, send API key via header — the proxy injects it server-side.
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-steam-api-key'] = apiKey;
  return auditedFetch(url, { headers });
}

export class SteamApiError extends Error {
  constructor(
    message: string,
    public readonly code: 'NETWORK' | 'AUTH' | 'RATE_LIMIT' | 'NOT_FOUND' | 'PARSE' | 'DAILY_LIMIT',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'SteamApiError';
  }
}

export interface SteamResult<T> {
  data: T;
  error?: SteamApiError;
}

function classifyError(e: unknown, res?: Response): SteamApiError {
  if (e instanceof SteamApiError) return e;
  if (res) {
    if (res.status === 401 || res.status === 403) return new SteamApiError('Invalid API key or insufficient permissions', 'AUTH', res.status);
    if (res.status === 429) return new SteamApiError('Steam API rate limit exceeded', 'RATE_LIMIT', res.status);
    if (res.status === 404) return new SteamApiError('Resource not found', 'NOT_FOUND', res.status);
    return new SteamApiError(`Steam API returned ${res.status}`, 'NETWORK', res.status);
  }
  const msg = e instanceof Error ? e.message : 'Unknown error';
  if (msg.includes('daily limit')) return new SteamApiError(msg, 'DAILY_LIMIT');
  return new SteamApiError(msg, 'NETWORK');
}

export async function getOwnedGames(steamId: string, apiKey: string): Promise<SteamResult<OwnedGame[]>> {
  try {
    await webApiLimiter.acquire();
    const res = await fetchWithProxy(
      `${PROXY_BASE}/web/IPlayerService/GetOwnedGames/v0001/?steamid=${steamId}&format=json&include_appinfo=1&include_played_free_games=1`,
      apiKey,
    );
    if (!res.ok) return { data: [], error: classifyError(null, res) };
    const data = await res.json() as { response?: { games?: OwnedGame[] } };
    return { data: data.response?.games ?? [] };
  } catch (e) {
    console.error('[steam-api] GetOwnedGames error:', e);
    return { data: [], error: classifyError(e) };
  }
}

export async function getWishlist(steamId: string, apiKey: string): Promise<SteamResult<number[]>> {
  try {
    await webApiLimiter.acquire();
    const res = await fetchWithProxy(
      `${PROXY_BASE}/web/IWishlistService/GetWishlist/v1/?steamid=${steamId}`,
      apiKey,
    );
    if (!res.ok) return { data: [], error: classifyError(null, res) };
    const data = await res.json() as { response: { items?: Array<{ appid: number }> } };
    return { data: (data.response.items ?? []).map((item) => item.appid) };
  } catch (e) {
    console.error('[steam-api] GetWishlist error:', e);
    return { data: [], error: classifyError(e) };
  }
}

export function getAppDetails(appid: number, cc?: string): Promise<GameDetails | null> {
  return dedup(`appdetails:${appid}:${cc ?? ''}`, () => _getAppDetailsImpl(appid, cc));
}

async function _getAppDetailsImpl(appid: number, cc?: string): Promise<GameDetails | null> {
  try {
    await storeApiLimiter.acquire(2);
    if (!checkDailyLimit(2)) throw new Error('Steam API daily limit reached');
    const ccParam = cc ? `&cc=${cc}` : '';

    const [detailsRes, reviewsRes] = await Promise.all([
      auditedFetch(resolveSteamUrl(`${PROXY_BASE}/store/appdetails?appids=${appid}${ccParam}`)),
      auditedFetch(resolveSteamUrl(`${PROXY_BASE}/reviews/${appid}?json=1&purchase_type=all&num_per_page=0`)),
    ]);

    if (!detailsRes.ok) return null;

    const data = await detailsRes.json() as Record<string, { success: boolean; data?: Record<string, unknown> }>;
    const entry = data[String(appid)];
    if (!entry?.success || !entry.data) return null;

    const d = entry.data;

    let reviewScore: number | null = null;
    let reviewCount: number | null = null;
    try {
      if (reviewsRes.ok) {
        const reviewData = await reviewsRes.json() as {
          query_summary?: { total_positive?: number; total_negative?: number; total_reviews?: number };
        };
        const summary = reviewData.query_summary;
        if (summary?.total_reviews && summary.total_reviews > 0) {
          reviewScore = Math.round(((summary.total_positive ?? 0) / summary.total_reviews) * 100);
          reviewCount = summary.total_reviews;
        }
      }
    } catch { /* fallback */ }

    const genresRaw = (d.genres as Array<{ id: string; description: string }>) ?? [];
    const categoriesRaw = (d.categories as Array<{ id: number; description: string }>) ?? [];
    const genres = genresRaw.map((g) => g.description);
    const tags = [...genres, ...categoriesRaw.slice(0, 10).map((c) => c.description)];

    // Map Steam content_descriptors to NSFW tags for filtering
    const contentDescriptors = (d.content_descriptors as { ids?: number[] })?.ids ?? [];
    const descriptorTagMap: Record<number, string[]> = {
      1: ['Sexual Content', 'Nudity'],
      3: ['NSFW', 'Adult Only'],
      4: ['Sexual Content', 'Nudity', 'NSFW'],
      5: ['Mature'],
    };
    for (const id of contentDescriptors) {
      const mapped = descriptorTagMap[id];
      if (mapped) {
        for (const t of mapped) {
          if (!tags.includes(t)) tags.push(t);
        }
      }
    }

    const priceOverview = d.price_overview as { final?: number; currency?: string } | undefined;
    const recommendations = d.recommendations as { total?: number } | undefined;
    const releaseDate = d.release_date as { date?: string } | undefined;
    const platforms = (d.platforms as { windows?: boolean; mac?: boolean; linux?: boolean }) ?? {};

    const screenshotsRaw = (d.screenshots as Array<{ path_thumbnail?: string; path_full?: string }>) ?? [];
    const screenshots = screenshotsRaw.map((s) => ({
      thumbnail: s.path_thumbnail ?? '',
      full: s.path_full ?? '',
    })).filter((s) => s.thumbnail && s.full);

    const moviesRaw = (d.movies as Array<{ thumbnail?: string; webm?: { '480'?: string; max?: string } }>) ?? [];
    const movies = moviesRaw.map((m) => ({
      thumbnail: m.thumbnail ?? '',
      webm480: m.webm?.['480'] ?? '',
      webmMax: m.webm?.max ?? '',
    })).filter((m) => m.thumbnail && (m.webm480 || m.webmMax));

    return {
      appid,
      name: (d.name as string) ?? '',
      short_description: (d.short_description as string) ?? '',
      header_image: (d.header_image as string) ?? '',
      genres,
      tags,
      release_date: releaseDate?.date ?? '',
      price_cents: priceOverview?.final ?? null,
      price_currency: priceOverview?.currency ?? null,
      metacritic_score: reviewScore,
      review_count: reviewCount ?? recommendations?.total ?? null,
      developers: (d.developers as string[]) ?? [],
      publishers: (d.publishers as string[]) ?? [],
      platforms: {
        windows: platforms.windows ?? false,
        mac: platforms.mac ?? false,
        linux: platforms.linux ?? false,
      },
      screenshots,
      movies,
    };
  } catch {
    return null;
  }
}

export async function getPopularGameIds(): Promise<number[]> {
  const curatedIds = [
    1091500, 1174180, 1245620, 292030, 374320, 1938090, 1551360, 1593500, 1817070,
    2050650, 1222670, 1449560, 553850, 1158310, 394360, 1259420, 1446780, 1326470,
    1086940, 1151640, 990080, 1817190, 2358720, 1716740, 1145360, 2379780, 1794680,
    413150, 367520, 1966720, 105600, 1145350, 730, 1172470, 578080, 1085660, 359550,
    252490, 346110, 892970, 108600, 1063730, 1332010, 1623730, 227300, 255710,
    1625450, 739630, 753640, 2195250, 1293830, 1426210, 1113560, 431960, 570, 440,
    945360, 1599340, 236390,
  ];

  try {
    await storeApiLimiter.acquire();
    if (!checkDailyLimit()) throw new Error('Steam API daily limit reached');
    const res = await auditedFetch(resolveSteamUrl(`${PROXY_BASE}/store/featured`));
    if (res.ok) {
      const data = await res.json() as {
        featured_win?: Array<{ id: number }>;
        featured_mac?: Array<{ id: number }>;
        featured_linux?: Array<{ id: number }>;
      };
      const featuredIds = [
        ...(data.featured_win ?? []),
        ...(data.featured_mac ?? []),
        ...(data.featured_linux ?? []),
      ].map((g) => g.id);
      return [...new Set([...curatedIds, ...featuredIds])];
    }
  } catch { /* fall back */ }

  return curatedIds;
}

export async function fetchMoreGameIds(exclude: Set<number>): Promise<number[]> {
  const ids = new Set<number>();

  const endpoints = [
    `${PROXY_BASE}/store/featuredcategories`,
    `${PROXY_BASE}/store/featured`,
  ];

  for (const url of endpoints) {
    try {
      await storeApiLimiter.acquire();
      if (!checkDailyLimit()) break;
      const res = await auditedFetch(resolveSteamUrl(url));
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      const extractIds = (obj: unknown): void => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            if (item && typeof item === 'object') {
              const id = (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).appid;
              if (typeof id === 'number' && !exclude.has(id)) ids.add(id);
            }
          }
          return;
        }
        for (const val of Object.values(obj as Record<string, unknown>)) {
          if (val && typeof val === 'object' && 'items' in (val as Record<string, unknown>)) {
            extractIds((val as Record<string, unknown>).items);
          } else if (Array.isArray(val)) { extractIds(val); }
        }
      };
      extractIds(data);
    } catch { /* continue */ }
  }

  return [...ids];
}

/** Fetch all Steam community tags via the tagdata/populartags endpoint. */
export async function getSteamTags(): Promise<SteamResult<{ tagid: number; name: string }[]>> {
  try {
    await storeApiLimiter.acquire();
    if (!checkDailyLimit()) return { data: [], error: new SteamApiError('Steam API daily limit reached', 'DAILY_LIMIT') };
    const res = await auditedFetch(resolveSteamUrl(`${PROXY_BASE}/tagdata/populartags/english`));
    if (!res.ok) return { data: [], error: classifyError(null, res) };
    const data = await res.json();
    if (Array.isArray(data)) {
      const tags = data.filter((t: unknown) => t && typeof t === 'object' && 'name' in (t as Record<string, unknown>))
        .map((t: { tagid: number; name: string }) => ({ tagid: t.tagid, name: t.name }));
      return { data: tags };
    }
    return { data: [] };
  } catch (e) {
    console.error('[steam-api] getSteamTags error:', e);
    return { data: [], error: classifyError(e) };
  }
}

/** Search the Steam Store by term via the storesearch endpoint. */
export async function searchSteamStore(term: string): Promise<SteamResult<{ id: number; name: string; headerImage: string }[]>> {
  if (!term.trim()) return { data: [] };
  try {
    await storeApiLimiter.acquire();
    if (!checkDailyLimit()) return { data: [], error: new SteamApiError('Steam API daily limit reached', 'DAILY_LIMIT') };
    const res = await auditedFetch(resolveSteamUrl(`${PROXY_BASE}/store/storesearch?term=${encodeURIComponent(term)}&l=english&cc=us`));
    if (!res.ok) return { data: [], error: classifyError(null, res) };
    const data = await res.json() as { items?: Array<{ id: number; name: string; tiny_image: string }> };
    const items = (data.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      headerImage: item.tiny_image?.replace('capsule_sm_120', 'header') ?? '',
    }));
    return { data: items };
  } catch (e) {
    console.error('[steam-api] searchSteamStore error:', e);
    return { data: [], error: classifyError(e) };
  }
}

export async function getPlayerSummary(steamId: string, apiKey: string): Promise<SteamResult<PlayerSummary | null>> {
  try {
    await webApiLimiter.acquire();
    const res = await fetchWithProxy(
      `${PROXY_BASE}/web/ISteamUser/GetPlayerSummaries/v0002/?steamids=${steamId}`,
      apiKey,
    );
    if (!res.ok) return { data: null, error: classifyError(null, res) };
    const data = await res.json() as {
      response?: { players?: PlayerSummary[] };
    };
    return { data: data.response?.players?.[0] ?? null };
  } catch (e) {
    return { data: null, error: classifyError(e) };
  }
}

/** Resolve a Steam profile URL or vanity name to a steam ID. */
export async function resolveVanityUrl(vanityName: string, apiKey: string): Promise<SteamResult<string | null>> {
  try {
    await webApiLimiter.acquire();
    const res = await fetchWithProxy(
      `${PROXY_BASE}/web/ISteamUser/ResolveVanityURL/v0001/?vanityurl=${encodeURIComponent(vanityName)}`,
      apiKey,
    );
    if (!res.ok) return { data: null, error: classifyError(null, res) };
    const data = await res.json() as { response?: { success: number; steamid?: string } };
    if (data.response?.success === 1 && data.response.steamid) {
      return { data: data.response.steamid };
    }
    return { data: null };
  } catch (e) {
    return { data: null, error: classifyError(e) };
  }
}
