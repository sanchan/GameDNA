import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate, Link, useSearchParams } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useBookmarks } from '../hooks/use-bookmarks';
import { api } from '../lib/api';
import type { Game } from '../../../shared/types';

interface LibraryEntry {
  game: Game;
  playtimeMins: number;
  lastPlayed: number | null;
}

function formatPlaytime(mins: number): string {
  if (mins === 0) return 'Never played';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} played`;
  const hours = Math.floor(mins / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} played`;
}

function formatPlaytimeShort(mins: number): string {
  if (mins === 0) return '0h';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60).toLocaleString()}h`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  const mins = Math.floor(diff / 60);
  if (diff < 3600) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(diff / 3600);
  if (diff < 86400) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(diff / 86400);
  if (diff < 604800) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(diff / 604800);
  if (diff < 2592000) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(diff / 2592000);
  if (diff < 31536000) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(diff / 31536000);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

function formatPrice(cents: number | null, currency?: string | null): string {
  if (cents === null || cents === 0) return 'Free';
  const amount = cents / 100;
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
    } catch { /* fall through */ }
  }
  return `$${amount.toFixed(2)}`;
}

function ReviewBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  let colorClasses: string;
  if (score >= 70) {
    colorClasses = 'bg-green-500/20 text-green-500';
  } else if (score >= 40) {
    colorClasses = 'bg-yellow-500/20 text-yellow-500';
  } else {
    colorClasses = 'bg-red-500/20 text-red-500';
  }
  return (
    <div className={`flex items-center space-x-1 ${colorClasses} px-3 py-1.5 rounded-full font-bold text-sm`}>
      <i className="fa-solid fa-thumbs-up" />
      <span>{score}%</span>
    </div>
  );
}

const tabs = [
  { key: 'library', label: 'Library', icon: 'fa-solid fa-book' },
  { key: 'bookmarks', label: 'Bookmarks', icon: 'fa-regular fa-bookmark' },
  { key: 'wishlist', label: 'Wishlist', icon: 'fa-regular fa-heart' },
] as const;

type TabKey = (typeof tabs)[number]['key'];
type SortKey = 'recent' | 'name-asc' | 'name-desc' | 'price-low' | 'price-high' | 'rating';

export default function MyLists() {
  const { user, loading: authLoading } = useAuth();
  const { toggle: toggleBookmark } = useBookmarks();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabKey) || 'library';

  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [bookmarkGames, setBookmarkGames] = useState<Game[]>([]);
  const [wishlist, setWishlist] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('recent');

  const setTab = (tab: TabKey) => {
    setSearchParams({ tab });
    setSearch('');
    setGenreFilter('');
    setSortBy('recent');
  };

  const fetchTab = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (activeTab === 'library') {
        const data = await api.get<LibraryEntry[]>('/lists/library');
        setLibrary(data);
      } else if (activeTab === 'bookmarks') {
        const data = await api.get<Game[]>('/lists/bookmarks');
        setBookmarkGames(data);
      } else if (activeTab === 'wishlist') {
        const data = await api.get<Game[]>('/lists/wishlist');
        setWishlist(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    fetchTab();
  }, [fetchTab]);

  // Collect all unique genres for the filter dropdown
  const allGenres = useMemo(() => {
    const genreSet = new Set<string>();
    if (activeTab === 'library') {
      library.forEach((e) => e.game.genres.forEach((g) => genreSet.add(g)));
    } else if (activeTab === 'bookmarks') {
      bookmarkGames.forEach((g) => g.genres.forEach((genre) => genreSet.add(genre)));
    } else {
      wishlist.forEach((g) => g.genres.forEach((genre) => genreSet.add(genre)));
    }
    return Array.from(genreSet).sort();
  }, [activeTab, library, bookmarkGames, wishlist]);

  // Stats for library
  const libraryStats = useMemo(() => {
    const total = library.length;
    const totalPlaytimeMins = library.reduce((sum, e) => sum + e.playtimeMins, 0);
    const played = library.filter((e) => e.playtimeMins > 0).length;
    const neverPlayed = total - played;
    return { total, totalPlaytimeMins, played, neverPlayed };
  }, [library]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const searchLower = search.toLowerCase();

  const filteredLibrary = library.filter((e) => {
    if (searchLower && !e.game.name.toLowerCase().includes(searchLower)) return false;
    if (genreFilter && !e.game.genres.some((g) => g.toLowerCase() === genreFilter.toLowerCase())) return false;
    return true;
  });

  const filteredBookmarks = bookmarkGames.filter((g) => {
    if (searchLower && !g.name.toLowerCase().includes(searchLower)) return false;
    if (genreFilter && !g.genres.some((genre) => genre.toLowerCase() === genreFilter.toLowerCase())) return false;
    return true;
  });

  const filteredWishlist = wishlist.filter((g) => {
    if (searchLower && !g.name.toLowerCase().includes(searchLower)) return false;
    if (genreFilter && !g.genres.some((genre) => genre.toLowerCase() === genreFilter.toLowerCase())) return false;
    return true;
  });

  const handleRemoveBookmark = async (gameId: number) => {
    await toggleBookmark(gameId);
    setBookmarkGames((prev) => prev.filter((g) => g.id !== gameId));
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-3">My Lists</h1>
        <p className="text-gray-400 text-lg max-w-3xl">Organize and manage your gaming collections. Keep track of games you want to play, bookmarks, and wishlist items.</p>
      </div>

      {/* Tabs */}
      <div className="mb-8">
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-2 inline-flex space-x-2">
          {tabs.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeTab === key
                  ? 'bg-[var(--primary)] text-[#1a1a1a]'
                  : 'hover:bg-[#1a1a1a] text-gray-400'
              }`}
            >
              <i className={`${icon} mr-2`} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
          <div className="flex-1 relative">
            <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search games in your lists..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg pl-12 pr-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-[var(--primary)] transition-all"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--primary)] transition-all"
            >
              <option value="">All Genres</option>
              {allGenres.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--primary)] transition-all"
            >
              <option value="recent">Sort: Recent</option>
              <option value="name-asc">Sort: Name A-Z</option>
              <option value="name-desc">Sort: Name Z-A</option>
              <option value="price-low">Sort: Price Low-High</option>
              <option value="price-high">Sort: Price High-Low</option>
              <option value="rating">Sort: Rating</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#242424] border border-[#333] rounded-xl p-4 flex items-center gap-4">
              <div className="w-32 h-20 bg-[#1a1a1a] rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-5 w-1/3 bg-[#1a1a1a] rounded animate-pulse" />
                <div className="h-4 w-1/4 bg-[#1a1a1a] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'library' ? (
        <LibraryTab entries={filteredLibrary} stats={libraryStats} sortBy={sortBy} />
      ) : activeTab === 'bookmarks' ? (
        <BookmarksTab games={filteredBookmarks} onRemove={handleRemoveBookmark} sortBy={sortBy} />
      ) : (
        <WishlistTab games={filteredWishlist} sortBy={sortBy} />
      )}
    </div>
  );
}

function sortGames<T extends { game?: Game } & Partial<Game>>(items: T[], sortBy: SortKey, getGame: (item: T) => Game): T[] {
  const sorted = [...items];
  switch (sortBy) {
    case 'name-asc':
      sorted.sort((a, b) => getGame(a).name.localeCompare(getGame(b).name));
      break;
    case 'name-desc':
      sorted.sort((a, b) => getGame(b).name.localeCompare(getGame(a).name));
      break;
    case 'price-low':
      sorted.sort((a, b) => (getGame(a).priceCents ?? 0) - (getGame(b).priceCents ?? 0));
      break;
    case 'price-high':
      sorted.sort((a, b) => (getGame(b).priceCents ?? 0) - (getGame(a).priceCents ?? 0));
      break;
    case 'rating':
      sorted.sort((a, b) => (getGame(b).reviewScore ?? 0) - (getGame(a).reviewScore ?? 0));
      break;
    default:
      break; // 'recent' = default API order
  }
  return sorted;
}

function GameCardActions({ game, extraButtons }: { game: Game; extraButtons?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {extraButtons}
      <Link
        to={`/game/${game.id}`}
        className="flex items-center space-x-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
      >
        <i className="fa-solid fa-eye" />
        <span>View Details</span>
      </Link>
      <a
        href={`steam://store/${game.id}`}
        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold transition-all"
      >
        <i className="fa-brands fa-steam" />
        <span>Open in Steam</span>
      </a>
    </div>
  );
}

function LibraryTab({ entries, stats, sortBy }: { entries: LibraryEntry[]; stats: { total: number; totalPlaytimeMins: number; played: number; neverPlayed: number }; sortBy: SortKey }) {
  const sorted = sortGames(entries, sortBy, (e) => e.game);

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#242424] border border-[#333] rounded-xl p-5 text-center">
          <div className="text-3xl font-black text-[var(--primary)] mb-1">{stats.total.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Total Games</div>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-5 text-center">
          <div className="text-3xl font-black text-green-500 mb-1">{stats.played.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Played</div>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-5 text-center">
          <div className="text-3xl font-black text-yellow-500 mb-1">{stats.neverPlayed.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Never Played</div>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-5 text-center">
          <div className="text-3xl font-black text-purple-500 mb-1">{formatPlaytimeShort(stats.totalPlaytimeMins)}</div>
          <div className="text-sm text-gray-400">Total Playtime</div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <i className="fa-solid fa-book text-4xl mb-4 block" />
          <p className="text-lg mb-2">No games found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((entry) => (
            <div key={entry.game.id} className="bg-[#242424] border border-[#333] rounded-xl p-4 hover:border-[var(--primary)] transition-all group">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Link to={`/game/${entry.game.id}`} className="w-full sm:w-32 h-20 shrink-0 rounded-lg overflow-hidden">
                  {entry.game.headerImage ? (
                    <img src={entry.game.headerImage} alt={entry.game.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#1a1a1a]" />
                  )}
                </Link>
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <Link to={`/game/${entry.game.id}`}>
                        <h3 className="text-xl font-bold mb-2 truncate hover:text-[var(--primary)] transition-colors">{entry.game.name}</h3>
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {entry.game.genres.slice(0, 3).map((genre) => (
                          <span key={genre} className="bg-[#1a1a1a] px-3 py-1 rounded-full text-xs font-medium">{genre}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ReviewBadge score={entry.game.reviewScore} />
                      {entry.game.priceCents !== null && (
                        <div className="text-2xl font-black text-[var(--primary)]">
                          {formatPrice(entry.game.priceCents, entry.game.priceCurrency)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="text-sm text-gray-400">
                      <i className="fa-solid fa-clock mr-1" />{formatPlaytime(entry.playtimeMins)}
                    </div>
                    {entry.lastPlayed && (
                      <>
                        <span className="text-gray-600">&bull;</span>
                        <div className="text-sm text-gray-400">Last played: {formatTimeAgo(entry.lastPlayed)}</div>
                      </>
                    )}
                  </div>
                  <GameCardActions game={entry.game} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BookmarksTab({ games, onRemove, sortBy }: { games: Game[]; onRemove: (id: number) => void; sortBy: SortKey }) {
  const sorted = sortGames(games, sortBy, (g) => g);

  return (
    <div className="space-y-6">
      {/* Bookmarks header card */}
      <div className="bg-[#242424] border border-[#333] rounded-xl p-6 text-center">
        <div className="w-20 h-20 bg-[#1a1a1a] rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fa-regular fa-bookmark text-4xl text-[var(--primary)]" />
        </div>
        <h3 className="text-xl font-bold mb-2">{games.length} Bookmarked {games.length === 1 ? 'Game' : 'Games'}</h3>
        <p className="text-gray-400">Games you've saved for later consideration</p>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <i className="fa-regular fa-bookmark text-4xl mb-4 block" />
          <p className="text-lg mb-2">No bookmarks yet.</p>
          <p className="text-sm">
            Bookmark games from{' '}
            <Link to="/discover" className="text-[var(--primary)] hover:underline">Discover</Link>
            {' '}to save them here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((game) => (
            <div key={game.id} className="bg-[#242424] border border-[#333] rounded-xl p-4 hover:border-[var(--primary)] transition-all group">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Link to={`/game/${game.id}`} className="w-full sm:w-32 h-20 shrink-0 rounded-lg overflow-hidden">
                  {game.headerImage ? (
                    <img src={game.headerImage} alt={game.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#1a1a1a]" />
                  )}
                </Link>
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <Link to={`/game/${game.id}`}>
                        <h3 className="text-xl font-bold mb-2 truncate hover:text-[var(--primary)] transition-colors">{game.name}</h3>
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {game.genres.slice(0, 3).map((genre) => (
                          <span key={genre} className="bg-[#1a1a1a] px-3 py-1 rounded-full text-xs font-medium">{genre}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ReviewBadge score={game.reviewScore} />
                      {game.priceCents !== null && (
                        <div className="text-2xl font-black text-[var(--primary)]">
                          {formatPrice(game.priceCents, game.priceCurrency)}
                        </div>
                      )}
                    </div>
                  </div>
                  <GameCardActions
                    game={game}
                    extraButtons={
                      <>
                        <button
                          onClick={() => onRemove(game.id)}
                          className="flex items-center space-x-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-red-500 hover:text-red-500 rounded-lg text-sm font-semibold transition-all"
                        >
                          <i className="fa-solid fa-xmark" />
                          <span>Remove Bookmark</span>
                        </button>
                        <a
                          href={`steam://addtowishlist/${game.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center space-x-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
                        >
                          <i className="fa-regular fa-heart" />
                          <span>Add to Wishlist</span>
                        </a>
                      </>
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WishlistTab({ games, sortBy }: { games: Game[]; sortBy: SortKey }) {
  const sorted = sortGames(games, sortBy, (g) => g);

  return (
    <div className="space-y-6">
      {/* Wishlist header card */}
      <div className="bg-[#242424] border border-[#333] rounded-xl p-6 text-center">
        <div className="w-20 h-20 bg-[#1a1a1a] rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fa-regular fa-heart text-4xl text-[var(--primary)]" />
        </div>
        <h3 className="text-xl font-bold mb-2">{games.length} Wishlisted {games.length === 1 ? 'Game' : 'Games'}</h3>
        <p className="text-gray-400">Games from your Steam wishlist</p>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <i className="fa-regular fa-heart text-4xl mb-4 block" />
          <p className="text-lg mb-2">No wishlist games found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((game) => (
            <div key={game.id} className="bg-[#242424] border border-[#333] rounded-xl p-4 hover:border-[var(--primary)] transition-all group">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Link to={`/game/${game.id}`} className="w-full sm:w-32 h-20 shrink-0 rounded-lg overflow-hidden">
                  {game.headerImage ? (
                    <img src={game.headerImage} alt={game.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#1a1a1a]" />
                  )}
                </Link>
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <Link to={`/game/${game.id}`}>
                        <h3 className="text-xl font-bold mb-2 truncate hover:text-[var(--primary)] transition-colors">{game.name}</h3>
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {game.genres.slice(0, 3).map((genre) => (
                          <span key={genre} className="bg-[#1a1a1a] px-3 py-1 rounded-full text-xs font-medium">{genre}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ReviewBadge score={game.reviewScore} />
                      {game.priceCents !== null && (
                        <div className="text-2xl font-black text-[var(--primary)]">
                          {formatPrice(game.priceCents, game.priceCurrency)}
                        </div>
                      )}
                    </div>
                  </div>
                  <GameCardActions
                    game={game}
                    extraButtons={
                      <a
                        href={`steam://store/${game.id}`}
                        className="flex items-center space-x-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
                      >
                        <i className="fa-solid fa-cart-shopping" />
                        <span>Buy on Steam</span>
                      </a>
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
