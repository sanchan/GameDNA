import { useState, useEffect, useCallback } from 'react';
import { Navigate, Link, useSearchParams } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useBookmarks } from '../hooks/use-bookmarks';
import { api } from '../lib/api';
import type { Game } from '../../../shared/types';

interface LibraryEntry {
  game: Game;
  playtimeMins: number;
}

function formatPlaytime(mins: number): string {
  if (mins === 0) return 'Never played';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClasses}`}>
      <i className="fa-solid fa-thumbs-up text-[10px]" />
      {score}%
    </span>
  );
}

const tabs = [
  { key: 'library', label: 'Library', icon: 'fa-solid fa-book' },
  { key: 'bookmarks', label: 'Bookmarks', icon: 'fa-regular fa-bookmark' },
  { key: 'wishlist', label: 'Wishlist', icon: 'fa-regular fa-heart' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export default function MyLists() {
  const { user, loading: authLoading } = useAuth();
  const { toggle: toggleBookmark, isBookmarked } = useBookmarks();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabKey) || 'library';

  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [bookmarkGames, setBookmarkGames] = useState<Game[]>([]);
  const [wishlist, setWishlist] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const setTab = (tab: TabKey) => {
    setSearchParams({ tab });
    setSearch('');
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

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const searchLower = search.toLowerCase();

  const filteredLibrary = search
    ? library.filter((e) => e.game.name.toLowerCase().includes(searchLower))
    : library;

  const filteredBookmarks = search
    ? bookmarkGames.filter((g) => g.name.toLowerCase().includes(searchLower))
    : bookmarkGames;

  const filteredWishlist = search
    ? wishlist.filter((g) => g.name.toLowerCase().includes(searchLower))
    : wishlist;

  const handleRemoveBookmark = async (gameId: number) => {
    await toggleBookmark(gameId);
    setBookmarkGames((prev) => prev.filter((g) => g.id !== gameId));
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Header */}
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-3">My Lists</h1>
      <p className="text-gray-400 mb-8">Manage your library, bookmarks, and wishlist.</p>

      {/* Tabs */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-2 inline-flex space-x-2 mb-8">
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
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

      {/* Search */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8">
        <div className="relative">
          <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search your games..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg pl-12 pr-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-[var(--primary)] transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col gap-4">
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
        <LibraryList entries={filteredLibrary} />
      ) : activeTab === 'bookmarks' ? (
        <BookmarkList games={filteredBookmarks} onRemove={handleRemoveBookmark} />
      ) : (
        <GameList games={filteredWishlist} label="wishlist" />
      )}
    </div>
  );
}

function GameItemCard({ game, children, rightContent }: { game: Game; children?: React.ReactNode; rightContent?: React.ReactNode }) {
  return (
    <div className="bg-[#242424] border border-[#333] rounded-xl p-4 hover:border-[var(--primary)] transition-all">
      <div className="flex items-center gap-4">
        <Link to={`/game/${game.id}`} className="shrink-0">
          {game.headerImage ? (
            <img
              src={game.headerImage}
              alt={game.name}
              className="w-32 h-20 object-cover rounded-lg"
            />
          ) : (
            <div className="w-32 h-20 bg-[#1a1a1a] rounded-lg" />
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={`/game/${game.id}`}>
            <h3 className="text-xl font-bold mb-2 truncate hover:text-[var(--primary)] transition-colors">{game.name}</h3>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {game.genres.slice(0, 3).map((genre) => (
              <span key={genre} className="bg-[#1a1a1a] px-3 py-1 rounded-full text-xs font-medium">
                {genre}
              </span>
            ))}
            <ReviewBadge score={game.reviewScore} />
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          {game.priceCents !== null && (
            <span className="text-2xl font-black text-[var(--primary)]">
              {formatPrice(game.priceCents, game.priceCurrency)}
            </span>
          )}
          {children}
        </div>
        {rightContent && (
          <div className="shrink-0 flex items-center gap-2">
            {rightContent}
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryList({ entries }: { entries: LibraryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <i className="fa-solid fa-book text-4xl mb-4 block" />
        <p className="text-lg mb-2">No games found.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-gray-400 mb-4">
        {entries.length} {entries.length === 1 ? 'game' : 'games'}
      </p>
      <div className="flex flex-col gap-4">
        {entries.map((entry) => (
          <GameItemCard key={entry.game.id} game={entry.game}>
            <span className="text-sm text-gray-400">
              <i className="fa-regular fa-clock mr-1" />
              {formatPlaytime(entry.playtimeMins)}
            </span>
          </GameItemCard>
        ))}
      </div>
    </>
  );
}

function BookmarkList({ games, onRemove }: { games: Game[]; onRemove: (id: number) => void }) {
  if (games.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <i className="fa-regular fa-bookmark text-4xl mb-4 block" />
        <p className="text-lg mb-2">No bookmarks yet.</p>
        <p className="text-sm">
          Bookmark games from{' '}
          <Link to="/discover" className="text-[var(--primary)] hover:underline">Discover</Link>
          {' '}to save them here.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-gray-400 mb-4">
        {games.length} {games.length === 1 ? 'game' : 'games'}
      </p>
      <div className="flex flex-col gap-4">
        {games.map((game) => (
          <GameItemCard
            key={game.id}
            game={game}
            rightContent={
              <>
                <a
                  href={`steam://addtowishlist/${game.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold px-4 py-2 transition-all"
                  title="Add to Steam Wishlist"
                >
                  <i className="fa-regular fa-heart" />
                </a>
                <button
                  onClick={() => onRemove(game.id)}
                  className="bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold px-4 py-2 transition-all"
                  title="Remove bookmark"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </>
            }
          />
        ))}
      </div>
    </>
  );
}

function GameList({ games, label }: { games: Game[]; label: string }) {
  if (games.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <i className="fa-regular fa-heart text-4xl mb-4 block" />
        <p className="text-lg mb-2">No {label} games found.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-gray-400 mb-4">
        {games.length} {games.length === 1 ? 'game' : 'games'}
      </p>
      <div className="flex flex-col gap-4">
        {games.map((game) => (
          <GameItemCard key={game.id} game={game} />
        ))}
      </div>
    </>
  );
}
