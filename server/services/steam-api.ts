import { config } from '../config';

const STEAM_API_KEY = process.env.STEAM_API_KEY || '';

// Token bucket rate limiter
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

// Separate rate limiters for different Steam API endpoints
const webApiLimiter = new RateLimiter(config.webApiMaxTokens, config.webApiRefillMs);
export const storeApiLimiter = new RateLimiter(config.storeApiMaxTokens, config.storeApiRefillMs);

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
}

export interface PlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
  profileurl: string;
  loccountrycode?: string;
}

export async function getOwnedGames(steamId: string): Promise<OwnedGame[]> {
  if (!STEAM_API_KEY) {
    console.warn('[steam-api] STEAM_API_KEY is not set - cannot fetch owned games');
    return [];
  }
  try {
    await webApiLimiter.acquire();
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json&include_appinfo=1&include_played_free_games=1`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[steam-api] GetOwnedGames failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = (await res.json()) as {
      response?: { games?: OwnedGame[] };
    };
    const games = data.response?.games ?? [];
    console.log(`[steam-api] GetOwnedGames: found ${games.length} games for ${steamId}`);
    return games;
  } catch (e) {
    console.error('[steam-api] GetOwnedGames error:', e);
    return [];
  }
}

export async function getWishlist(steamId: string): Promise<number[]> {
  try {
    await webApiLimiter.acquire();
    const url = `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamId}&key=${STEAM_API_KEY}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`[steam-api] GetWishlist HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      response: { items?: Array<{ appid: number }> };
    };

    return (data.response.items ?? []).map((item) => item.appid);
  } catch (e) {
    console.error('[steam-api] GetWishlist error:', e);
    return [];
  }
}

export async function getAppDetails(
  appid: number,
  cc?: string,
): Promise<GameDetails | null> {
  try {
    // Acquire 2 tokens: one for details, one for reviews (both are store API)
    await storeApiLimiter.acquire(2);

    const ccParam = cc ? `&cc=${cc}` : '';

    // Fetch app details and review summary in parallel (both are store API)
    const [detailsRes, reviewsRes] = await Promise.all([
      fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}${ccParam}`),
      fetch(`https://store.steampowered.com/appreviews/${appid}?json=1&purchase_type=all&num_per_page=0`),
    ]);

    if (!detailsRes.ok) return null;

    const data = (await detailsRes.json()) as Record<
      string,
      { success: boolean; data?: Record<string, unknown> }
    >;
    const entry = data[String(appid)];
    if (!entry?.success || !entry.data) return null;

    const d = entry.data as Record<string, unknown>;

    // Parse review summary
    let reviewScore: number | null = null;
    let reviewCount: number | null = null;
    try {
      if (reviewsRes.ok) {
        const reviewData = (await reviewsRes.json()) as {
          query_summary?: {
            total_positive?: number;
            total_negative?: number;
            total_reviews?: number;
          };
        };
        const summary = reviewData.query_summary;
        if (summary && summary.total_reviews && summary.total_reviews > 0) {
          reviewScore = Math.round(
            ((summary.total_positive ?? 0) / summary.total_reviews) * 100,
          );
          reviewCount = summary.total_reviews;
        }
      }
    } catch {
      // Fall back to recommendations.total if reviews API fails
    }

    const genresRaw = (d.genres as Array<{ id: string; description: string }>) ?? [];
    const categoriesRaw = (d.categories as Array<{ id: number; description: string }>) ?? [];
    const genres = genresRaw.map((g) => g.description);
    const tags = [
      ...genres,
      ...categoriesRaw.slice(0, 10).map((c) => c.description),
    ];

    const priceOverview = d.price_overview as
      | { final?: number; currency?: string }
      | undefined;
    const recommendations = d.recommendations as
      | { total?: number }
      | undefined;
    const releaseDate = d.release_date as { date?: string } | undefined;
    const platforms = (d.platforms as {
      windows?: boolean;
      mac?: boolean;
      linux?: boolean;
    }) ?? { windows: false, mac: false, linux: false };

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
    };
  } catch {
    return null;
  }
}

// Fetch popular/top-selling game appids from Steam for discovery seeding
export async function getPopularGameIds(): Promise<number[]> {
  // Curated list of well-known popular games across genres
  // This ensures discovery always has content even if Steam API fails
  const curatedIds = [
    // Action/Adventure
    1091500, // Cyberpunk 2077
    1174180, // Red Dead Redemption 2
    1245620, // Elden Ring
    292030,  // The Witcher 3
    374320,  // Dark Souls III
    1938090, // Call of Duty MW III
    1551360, // Forza Horizon 5
    1593500, // God of War
    1817070, // Marvel's Spider-Man Remastered
    2050650, // Resident Evil 4 (2023)
    1222670, // The Outer Worlds
    1449560, // Lies of P
    553850,  // Helldivers 2
    // Strategy
    1158310, // Crusader Kings III
    394360,  // Hearts of Iron IV
    1259420, // Humankind
    1446780, // Manor Lords
    1326470, // Sons of the Forest
    // RPG
    1086940, // Baldur's Gate 3
    1151640, // Horizon Zero Dawn
    990080,  // Hogwarts Legacy
    1817190, // Marvel's Spider-Man Miles Morales
    2358720, // Black Myth: Wukong
    1716740, // Persona 3 Reload
    // Roguelike/Indie
    1145360, // Hades
    2379780, // Balatro
    1794680, // Vampire Survivors
    413150,  // Stardew Valley
    367520,  // Hollow Knight
    1966720, // Lethal Company
    105600,  // Terraria
    1145350, // Hades II (Early Access)
    // FPS
    730,     // Counter-Strike 2
    1172470, // Apex Legends
    578080,  // PUBG
    1085660, // Destiny 2
    359550,  // Tom Clancy's Rainbow Six Siege
    // Survival/Crafting
    252490,  // Rust
    346110,  // ARK: Survival Evolved
    892970,  // Valheim
    108600,  // Project Zomboid
    1063730, // New World
    // Simulation
    1332010, // Stray
    1623730, // Palworld
    227300,  // Euro Truck Simulator 2
    255710,  // Cities: Skylines
    1625450, // Cities: Skylines II
    // Horror
    1966720, // Lethal Company
    739630,  // Phasmophobia
    753640,  // Outlast
    // Sports/Racing
    2195250, // EA Sports FC 24
    1293830, // Forza Horizon 4
    // Puzzle/Platformer
    1426210, // It Takes Two
    1113560, // Neon White
    431960,  // Wallpaper Engine
    // Multiplayer
    570,     // Dota 2
    440,     // Team Fortress 2
    945360,  // Among Us
    1599340, // Lost Ark
    236390,  // War Thunder
  ];

  try {
    // Try to fetch Steam's featured games for additional variety
    await storeApiLimiter.acquire();
    const res = await fetch('https://store.steampowered.com/api/featured');
    if (res.ok) {
      const data = (await res.json()) as {
        featured_win?: Array<{ id: number }>;
        featured_mac?: Array<{ id: number }>;
        featured_linux?: Array<{ id: number }>;
      };
      const featuredIds = [
        ...(data.featured_win ?? []),
        ...(data.featured_mac ?? []),
        ...(data.featured_linux ?? []),
      ].map((g) => g.id);

      // Combine curated + featured, deduplicate
      return [...new Set([...curatedIds, ...featuredIds])];
    }
  } catch {
    // Fall back to curated list
  }

  return curatedIds;
}

// Fetch more game IDs from Steam's various browse endpoints
export async function fetchMoreGameIds(exclude: Set<number>): Promise<number[]> {
  const ids = new Set<number>();

  // Try multiple Steam endpoints to get a diverse set of games
  const endpoints = [
    'https://store.steampowered.com/api/featuredcategories',
    'https://store.steampowered.com/api/featured',
  ];

  for (const url of endpoints) {
    try {
      await storeApiLimiter.acquire();
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;

      // Extract app IDs from various response structures
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
          } else if (Array.isArray(val)) {
            extractIds(val);
          }
        }
      };
      extractIds(data);
    } catch {
      // continue to next endpoint
    }
  }

  // Also try the search API for top-rated games across different genres
  const searchTags = ['indie', 'rpg', 'action', 'strategy', 'simulation', 'adventure', 'puzzle', 'platformer', 'roguelike', 'survival'];
  // Pick 3 random tags each time for variety
  const shuffled = searchTags.sort(() => Math.random() - 0.5).slice(0, 3);

  for (const tag of shuffled) {
    try {
      await storeApiLimiter.acquire();
      const url = `https://store.steampowered.com/search/results/?sort_by=Reviews_DESC&tags=${tag}&category1=998&json=1&start=0&count=50`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      // Extract appids from the HTML/JSON response
      const matches = text.matchAll(/data-ds-appid="(\d+)"/g);
      for (const match of matches) {
        const id = parseInt(match[1], 10);
        if (!isNaN(id) && !exclude.has(id)) ids.add(id);
      }
    } catch {
      // continue
    }
  }

  return [...ids];
}

export async function getPlayerSummary(
  steamId: string,
): Promise<PlayerSummary | null> {
  try {
    await webApiLimiter.acquire();
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      response?: {
        players?: Array<{
          steamid: string;
          personaname: string;
          avatarfull: string;
          profileurl: string;
          loccountrycode?: string;
        }>;
      };
    };

    const player = data.response?.players?.[0];
    if (!player) return null;

    return {
      steamid: player.steamid,
      personaname: player.personaname,
      avatarfull: player.avatarfull,
      profileurl: player.profileurl,
      loccountrycode: player.loccountrycode,
    };
  } catch {
    return null;
  }
}
