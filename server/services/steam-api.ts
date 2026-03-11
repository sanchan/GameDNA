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
  if (!STEAM_API_KEY) {
    console.warn('[steam-api] STEAM_API_KEY is not set - cannot fetch owned games');
    return [];
  }
  try {
    await limiter.acquire();
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
    await limiter.acquire();
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
