const STEAM_API_KEY = process.env.STEAM_API_KEY || '';

// Token bucket rate limiter: 200 requests per 5 minutes
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

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens <= 0) {
      const waitMs = this.refillMs - (Date.now() - this.lastRefill);
      await new Promise((r) => setTimeout(r, waitMs));
      this.refill();
    }
    this.tokens--;
  }

  private refill() {
    const now = Date.now();
    if (now - this.lastRefill >= this.refillMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }
}

const limiter = new RateLimiter();

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
}

export async function getOwnedGames(steamId: string): Promise<OwnedGame[]> {
  try {
    await limiter.acquire();
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json&include_appinfo=1&include_played_free_games=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      response?: { games?: OwnedGame[] };
    };
    return data.response?.games ?? [];
  } catch {
    return [];
  }
}

export async function getWishlist(steamId: string): Promise<number[]> {
  const appids: number[] = [];
  let page = 0;

  try {
    while (true) {
      await limiter.acquire();
      const url = `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/?p=${page}`;
      const res = await fetch(url);

      if (res.status === 403) {
        // Wishlist is private
        return [];
      }
      if (!res.ok) break;

      const data = (await res.json()) as Record<string, unknown>;
      const keys = Object.keys(data);
      if (keys.length === 0) break;

      for (const key of keys) {
        const id = parseInt(key, 10);
        if (!isNaN(id)) appids.push(id);
      }
      page++;
    }
  } catch {
    // Return whatever we collected so far
  }

  return appids;
}

export async function getAppDetails(
  appid: number,
): Promise<GameDetails | null> {
  try {
    await limiter.acquire();
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as Record<
      string,
      { success: boolean; data?: Record<string, unknown> }
    >;
    const entry = data[String(appid)];
    if (!entry?.success || !entry.data) return null;

    const d = entry.data as Record<string, unknown>;

    const genresRaw = (d.genres as Array<{ id: string; description: string }>) ?? [];
    const categoriesRaw = (d.categories as Array<{ id: number; description: string }>) ?? [];
    const genres = genresRaw.map((g) => g.description);
    const tags = [
      ...genres,
      ...categoriesRaw.slice(0, 10).map((c) => c.description),
    ];

    const priceOverview = d.price_overview as
      | { final?: number }
      | undefined;
    const metacritic = d.metacritic as { score?: number } | undefined;
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
      metacritic_score: metacritic?.score ?? null,
      review_count: recommendations?.total ?? null,
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

export async function getPlayerSummary(
  steamId: string,
): Promise<PlayerSummary | null> {
  try {
    await limiter.acquire();
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
    };
  } catch {
    return null;
  }
}
