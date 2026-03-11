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

function reviewColor(score: number | null): string {
  if (score === null) return 'var(--muted-foreground)';
  if (score >= 70) return 'oklch(0.72 0.19 142)';
  if (score >= 40) return 'oklch(0.75 0.18 85)';
  return 'oklch(0.65 0.2 25)';
}

const tabs = [
  { key: 'library', label: 'Library' },
  { key: 'bookmarks', label: 'Bookmarks' },
  { key: 'wishlist', label: 'Wishlist' },
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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">My Lists</h1>

      {/* Tab bar + search */}
      <div className="flex gap-2 mb-6 items-stretch">
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden shrink-0">
          {tabs.map(({ key, label }, i, arr) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                i < arr.length - 1 ? 'border-r border-[var(--border)]' : ''
              } ${
                activeTab === key
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-[var(--card)]">
              <div className="w-24 aspect-video bg-[var(--muted)] rounded animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-5 w-1/3 bg-[var(--muted)] rounded animate-pulse" />
                <div className="h-4 w-1/4 bg-[var(--muted)] rounded animate-pulse" />
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

function LibraryList({ entries }: { entries: LibraryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-20 text-[var(--muted-foreground)]">
        <p className="text-lg mb-2">No games found.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-xs text-[var(--muted-foreground)] mb-3">
        {entries.length} {entries.length === 1 ? 'game' : 'games'}
      </p>
      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <Link
            key={entry.game.id}
            to={`/game/${entry.game.id}`}
            className="flex items-center gap-4 p-3 rounded-lg bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
          >
            {entry.game.headerImage ? (
              <img
                src={entry.game.headerImage}
                alt={entry.game.name}
                className="w-24 aspect-video object-cover rounded shrink-0"
              />
            ) : (
              <div className="w-24 aspect-video bg-[var(--muted)] rounded shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--card-foreground)] truncate">{entry.game.name}</p>
              <div className="flex items-center gap-3 mt-1">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: entry.playtimeMins > 0 ? 'oklch(0.75 0.18 85 / 0.15)' : 'var(--muted)',
                    color: entry.playtimeMins > 0 ? 'oklch(0.75 0.18 85)' : 'var(--muted-foreground)',
                  }}
                >
                  {formatPlaytime(entry.playtimeMins)}
                </span>
                {entry.game.reviewScore !== null && (
                  <span className="text-xs" style={{ color: reviewColor(entry.game.reviewScore) }}>
                    {entry.game.reviewScore}%
                  </span>
                )}
                {entry.game.genres.length > 0 && (
                  <span className="text-xs text-[var(--muted-foreground)] truncate">
                    {entry.game.genres.slice(0, 3).join(', ')}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function BookmarkList({ games, onRemove }: { games: Game[]; onRemove: (id: number) => void }) {
  if (games.length === 0) {
    return (
      <div className="text-center py-20 text-[var(--muted-foreground)]">
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
      <p className="text-xs text-[var(--muted-foreground)] mb-3">
        {games.length} {games.length === 1 ? 'game' : 'games'}
      </p>
      <div className="flex flex-col gap-2">
        {games.map((game) => (
          <div
            key={game.id}
            className="flex items-center gap-4 p-3 rounded-lg bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
          >
            <Link to={`/game/${game.id}`} className="shrink-0">
              {game.headerImage ? (
                <img
                  src={game.headerImage}
                  alt={game.name}
                  className="w-24 aspect-video object-cover rounded"
                />
              ) : (
                <div className="w-24 aspect-video bg-[var(--muted)] rounded" />
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={`/game/${game.id}`} className="hover:underline">
                <p className="font-semibold text-[var(--card-foreground)] truncate">{game.name}</p>
              </Link>
              <div className="flex items-center gap-3 mt-1">
                {game.reviewScore !== null && (
                  <span className="text-xs" style={{ color: reviewColor(game.reviewScore) }}>
                    {game.reviewScore}%
                  </span>
                )}
                {game.genres.length > 0 && (
                  <span className="text-xs text-[var(--muted-foreground)] truncate">
                    {game.genres.slice(0, 3).join(', ')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a
                href={`steam://addtowishlist/${game.id}`}
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] hover:text-[oklch(0.72_0.19_142)]"
                title="Add to Steam Wishlist"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </a>
              <button
                onClick={() => onRemove(game.id)}
                className="p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--destructive-foreground)]"
                title="Remove bookmark"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function GameList({ games, label }: { games: Game[]; label: string }) {
  if (games.length === 0) {
    return (
      <div className="text-center py-20 text-[var(--muted-foreground)]">
        <p className="text-lg mb-2">No {label} games found.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-xs text-[var(--muted-foreground)] mb-3">
        {games.length} {games.length === 1 ? 'game' : 'games'}
      </p>
      <div className="flex flex-col gap-2">
        {games.map((game) => (
          <Link
            key={game.id}
            to={`/game/${game.id}`}
            className="flex items-center gap-4 p-3 rounded-lg bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
          >
            {game.headerImage ? (
              <img
                src={game.headerImage}
                alt={game.name}
                className="w-24 aspect-video object-cover rounded shrink-0"
              />
            ) : (
              <div className="w-24 aspect-video bg-[var(--muted)] rounded shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--card-foreground)] truncate">{game.name}</p>
              <div className="flex items-center gap-3 mt-1">
                {game.reviewScore !== null && (
                  <span className="text-xs" style={{ color: reviewColor(game.reviewScore) }}>
                    {game.reviewScore}%
                  </span>
                )}
                {game.genres.length > 0 && (
                  <span className="text-xs text-[var(--muted-foreground)] truncate">
                    {game.genres.slice(0, 3).join(', ')}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
