// Client-side Steam API — calls go through the micro-proxy to avoid CORS issues
// in browser mode. In Tauri, calls go directly to Steam (no proxy needed).

import { config } from './config';

const PROXY_BASE = `${import.meta.env.VITE_API_BASE || '/api'}/steam`;
const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * In Tauri mode, convert proxy URLs to direct Steam API URLs.
 * In browser mode, return the proxy URL unchanged.
 */
function resolveSteamUrl(proxyUrl: string, apiKey?: string): string {
  if (!IS_TAURI) return proxyUrl;

  const rel = proxyUrl.startsWith(PROXY_BASE) ? proxyUrl.slice(PROXY_BASE.length) : proxyUrl;

  if (rel.startsWith('/web/')) {
    const path = rel.slice(5);
    const sep = path.includes('?') ? '&' : '?';
    return `https://api.steampowered.com/${path}${apiKey ? `${sep}key=${apiKey}` : ''}`;
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
const DAILY_KEY = 'gamedna_api_calls';

/** Read the current daily API call count (resets at midnight). */
export function getDailyApiUsage(): { count: number; limit: number; date: string } {
  const today = new Date().toISOString().slice(0, 10);
  const raw = localStorage.getItem(DAILY_KEY);
  if (!raw) return { count: 0, limit: DAILY_LIMIT, date: today };
  try {
    const data = JSON.parse(raw) as { date: string; count: number };
    if (data.date !== today) return { count: 0, limit: DAILY_LIMIT, date: today };
    return { count: data.count, limit: DAILY_LIMIT, date: today };
  } catch {
    return { count: 0, limit: DAILY_LIMIT, date: today };
  }
}

/** Track daily API call count to respect the Steam 100K/day limit. */
function checkDailyLimit(count: number = 1): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const raw = localStorage.getItem(DAILY_KEY);
  let data: { date: string; count: number } = { date: today, count: 0 };
  if (raw) {
    try {
      data = JSON.parse(raw);
      if (data.date !== today) data = { date: today, count: 0 };
    } catch { data = { date: today, count: 0 }; }
  }
  if (data.count + count > DAILY_LIMIT) return false;
  data.count += count;
  localStorage.setItem(DAILY_KEY, JSON.stringify(data));
  return true;
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

/** Fetch via proxy (browser) or directly (Tauri). For web API calls with API key. */
async function fetchWithProxy(url: string, apiKey?: string): Promise<Response> {
  if (!checkDailyLimit()) throw new Error('Steam API daily limit (100,000 calls) reached. Try again tomorrow.');
  const resolved = resolveSteamUrl(url, apiKey);
  if (IS_TAURI) return fetch(resolved);
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-steam-api-key'] = apiKey;
  return fetch(url, { headers });
}

export async function getOwnedGames(steamId: string, apiKey: string): Promise<OwnedGame[]> {
  try {
    await webApiLimiter.acquire();
    const res = await fetchWithProxy(
      `${PROXY_BASE}/web/IPlayerService/GetOwnedGames/v0001/?steamid=${steamId}&format=json&include_appinfo=1&include_played_free_games=1`,
      apiKey,
    );
    if (!res.ok) return [];
    const data = await res.json() as { response?: { games?: OwnedGame[] } };
    return data.response?.games ?? [];
  } catch (e) {
    console.error('[steam-api] GetOwnedGames error:', e);
    return [];
  }
}

export async function getWishlist(steamId: string, apiKey: string): Promise<number[]> {
  try {
    await webApiLimiter.acquire();
    const res = await fetchWithProxy(
      `${PROXY_BASE}/web/IWishlistService/GetWishlist/v1/?steamid=${steamId}`,
      apiKey,
    );
    if (!res.ok) return [];
    const data = await res.json() as { response: { items?: Array<{ appid: number }> } };
    return (data.response.items ?? []).map((item) => item.appid);
  } catch (e) {
    console.error('[steam-api] GetWishlist error:', e);
    return [];
  }
}

export async function getAppDetails(appid: number, cc?: string): Promise<GameDetails | null> {
  try {
    await storeApiLimiter.acquire(2);
    if (!checkDailyLimit(2)) throw new Error('Steam API daily limit reached');
    const ccParam = cc ? `&cc=${cc}` : '';

    const [detailsRes, reviewsRes] = await Promise.all([
      fetch(resolveSteamUrl(`${PROXY_BASE}/store/appdetails?appids=${appid}${ccParam}`)),
      fetch(resolveSteamUrl(`${PROXY_BASE}/reviews/${appid}?json=1&purchase_type=all&num_per_page=0`)),
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
    const res = await fetch(resolveSteamUrl(`${PROXY_BASE}/store/featured`));
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
      const res = await fetch(resolveSteamUrl(url));
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
export async function getSteamTags(): Promise<{ tagid: number; name: string }[]> {
  try {
    await storeApiLimiter.acquire();
    if (!checkDailyLimit()) throw new Error('Steam API daily limit reached');
    const res = await fetch(resolveSteamUrl(`${PROXY_BASE}/tagdata/populartags/english`));
    if (!res.ok) return [];
    const data = await res.json();
    // Response is an array of { tagid, name } objects
    if (Array.isArray(data)) {
      return data.filter((t: unknown) => t && typeof t === 'object' && 'name' in (t as Record<string, unknown>))
        .map((t: { tagid: number; name: string }) => ({ tagid: t.tagid, name: t.name }));
    }
    return [];
  } catch (e) {
    console.error('[steam-api] getSteamTags error:', e);
    return [];
  }
}

/** Search the Steam Store by term via the storesearch endpoint. */
export async function searchSteamStore(term: string): Promise<{ id: number; name: string; headerImage: string }[]> {
  if (!term.trim()) return [];
  try {
    await storeApiLimiter.acquire();
    if (!checkDailyLimit()) return [];
    const res = await fetch(resolveSteamUrl(`${PROXY_BASE}/store/storesearch?term=${encodeURIComponent(term)}&l=english&cc=us`));
    if (!res.ok) return [];
    const data = await res.json() as { items?: Array<{ id: number; name: string; tiny_image: string }> };
    return (data.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      headerImage: item.tiny_image?.replace('capsule_sm_120', 'header') ?? '',
    }));
  } catch (e) {
    console.error('[steam-api] searchSteamStore error:', e);
    return [];
  }
}

export async function getPlayerSummary(steamId: string, apiKey: string): Promise<PlayerSummary | null> {
  try {
    await webApiLimiter.acquire();
    const res = await fetchWithProxy(
      `${PROXY_BASE}/web/ISteamUser/GetPlayerSummaries/v0002/?steamids=${steamId}`,
      apiKey,
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      response?: { players?: PlayerSummary[] };
    };
    return data.response?.players?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Resolve a Steam profile URL or vanity name to a steam ID. */
export async function resolveVanityUrl(vanityName: string, apiKey: string): Promise<string | null> {
  try {
    await webApiLimiter.acquire();
    const res = await fetchWithProxy(
      `${PROXY_BASE}/web/ISteamUser/ResolveVanityURL/v0001/?vanityurl=${encodeURIComponent(vanityName)}`,
      apiKey,
    );
    if (!res.ok) return null;
    const data = await res.json() as { response?: { success: number; steamid?: string } };
    if (data.response?.success === 1 && data.response.steamid) {
      return data.response.steamid;
    }
    return null;
  } catch {
    return null;
  }
}
