import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate, Link, useSearchParams } from 'react-router';
import { useTranslation, Trans } from 'react-i18next';
import i18n from '../i18n';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import { useBookmarks } from '../hooks/use-bookmarks';
import { useToast } from '../components/Toast';
import * as queries from '../db/queries';
import { Select } from '../components/Select';
import type { Game, Collection } from '../../../shared/types';

interface LibraryEntry {
  game: Game;
  playtimeMins: number;
  lastPlayed: number | null;
}

function formatPlaytime(mins: number): string {
  if (mins === 0) return i18n.t('myLists.playtime.neverPlayed');
  if (mins < 60) return i18n.t('myLists.playtime.minutesPlayed', { count: mins });
  const hours = Math.floor(mins / 60);
  return i18n.t('myLists.playtime.hoursPlayed', { count: hours });
}

function formatPlaytimeShort(mins: number): string {
  if (mins === 0) return '0h';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60).toLocaleString()}h`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return i18n.t('myLists.timeAgo.justNow');
  const mins = Math.floor(diff / 60);
  if (diff < 3600) return i18n.t('myLists.timeAgo.minutesAgo', { count: mins });
  const hours = Math.floor(diff / 3600);
  if (diff < 86400) return i18n.t('myLists.timeAgo.hoursAgo', { count: hours });
  const days = Math.floor(diff / 86400);
  if (diff < 604800) return i18n.t('myLists.timeAgo.daysAgo', { count: days });
  const weeks = Math.floor(diff / 604800);
  if (diff < 2592000) return i18n.t('myLists.timeAgo.weeksAgo', { count: weeks });
  const months = Math.floor(diff / 2592000);
  if (diff < 31536000) return i18n.t('myLists.timeAgo.monthsAgo', { count: months });
  const years = Math.floor(diff / 31536000);
  return i18n.t('myLists.timeAgo.yearsAgo', { count: years });
}

function formatPrice(cents: number | null, currency?: string | null): string {
  if (cents === null || cents === 0) return i18n.t('common.free');
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

type TabKey = 'library' | 'bookmarks' | 'wishlist' | 'collections';
type SortKey = 'recent' | 'name-asc' | 'name-desc' | 'price-low' | 'price-high' | 'rating';

export default function MyLists() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { userId } = useDb();
  const { toggle: toggleBookmark } = useBookmarks();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabKey) || 'library';

  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [bookmarkGames, setBookmarkGames] = useState<Game[]>([]);
  const [wishlist, setWishlist] = useState<Game[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<number | null>(null);
  const [collectionGames, setCollectionGames] = useState<any[]>([]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showNewCollection, setShowNewCollection] = useState(false);
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

  const fetchTab = useCallback(() => {
    if (!user || !userId) return;
    setLoading(true);
    try {
      if (activeTab === 'library') {
        const items = queries.getLibrary(userId, { limit: 200 });
        setLibrary(items);
      } else if (activeTab === 'bookmarks') {
        const items = queries.getBookmarkedGames(userId);
        setBookmarkGames(items);
      } else if (activeTab === 'wishlist') {
        const items = queries.getWishlistGames(userId);
        setWishlist(items);
      } else if (activeTab === 'collections') {
        const data = queries.getCollections(userId);
        setCollections(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user, userId, activeTab]);

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
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-3">{t('myLists.title')}</h1>
        <p className="text-[var(--text-muted)] text-lg max-w-3xl">{t('myLists.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="mb-8">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-2 inline-flex space-x-2">
          {([
            { key: 'library' as TabKey, label: t('myLists.tabs.library'), icon: 'fa-solid fa-book' },
            { key: 'bookmarks' as TabKey, label: t('myLists.tabs.bookmarks'), icon: 'fa-regular fa-bookmark' },
            { key: 'wishlist' as TabKey, label: t('myLists.tabs.wishlist'), icon: 'fa-regular fa-heart' },
            { key: 'collections' as TabKey, label: 'Collections', icon: 'fa-solid fa-folder' },
          ]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeTab === key
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'hover:bg-[var(--background)] text-[var(--text-muted)]'
              }`}
            >
              <i className={`${icon} mr-2`} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-8">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
          <div className="flex-1 relative">
            <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder={t('myLists.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg pl-12 pr-4 py-2.5 text-[var(--foreground)] placeholder:text-gray-500 focus:outline-none focus:border-[var(--primary)] transition-all"
            />
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={genreFilter}
              onChange={setGenreFilter}
              options={[
                { value: '', label: t('common.allGenres') },
                ...allGenres.map((g) => ({ value: g, label: g })),
              ]}
            />
            <Select
              value={sortBy}
              onChange={(v) => setSortBy(v as SortKey)}
              options={[
                { value: 'recent', label: t('myLists.sortRecent') },
                { value: 'name-asc', label: t('myLists.sortNameAsc') },
                { value: 'name-desc', label: t('myLists.sortNameDesc') },
                { value: 'price-low', label: t('myLists.sortPriceLow') },
                { value: 'price-high', label: t('myLists.sortPriceHigh') },
                { value: 'rating', label: t('myLists.sortRating') },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4">
              <div className="w-32 h-20 bg-[var(--background)] rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-5 w-1/3 bg-[var(--background)] rounded animate-pulse" />
                <div className="h-4 w-1/4 bg-[var(--background)] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'library' ? (
        <LibraryTab entries={filteredLibrary} stats={libraryStats} sortBy={sortBy} />
      ) : activeTab === 'bookmarks' ? (
        <BookmarksTab games={filteredBookmarks} onRemove={handleRemoveBookmark} sortBy={sortBy} />
      ) : activeTab === 'collections' ? (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            {showNewCollection ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Collection name..."
                  className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-gray-500 focus:outline-none focus:border-[var(--primary)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCollectionName.trim() && userId) {
                      try {
                        const newId = queries.createCollection(userId, newCollectionName.trim());
                        const updated = queries.getCollections(userId);
                        setCollections(updated);
                        setNewCollectionName('');
                        setShowNewCollection(false);
                        toast('Collection created', 'success');
                      } catch { toast('Failed to create collection', 'error'); }
                    }
                  }}
                />
                <button onClick={() => setShowNewCollection(false)} className="text-[var(--text-muted)] hover:text-[var(--foreground)] text-sm">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewCollection(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl text-sm font-medium hover:opacity-90"
              >
                <i className="fa-solid fa-plus" />
                New Collection
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 animate-pulse">
                  <div className="h-6 w-32 bg-[var(--muted)] rounded mb-2" />
                  <div className="h-4 w-20 bg-[var(--muted)] rounded" />
                </div>
              ))}
            </div>
          ) : collections.length === 0 ? (
            <div className="text-center py-16">
              <i className="fa-solid fa-folder-open text-4xl text-gray-500 mb-4 block" />
              <p className="text-[var(--text-muted)] mb-2">No collections yet</p>
              <p className="text-sm text-gray-500">Create collections to organize your games your way.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map((col) => (
                <button
                  key={col.id}
                  onClick={() => {
                    setSelectedCollection(col.id);
                    try {
                      const g = queries.getCollectionGames(col.id);
                      setCollectionGames(g);
                    } catch { setCollectionGames([]); }
                  }}
                  className={`text-left bg-[var(--card)] border rounded-2xl p-6 transition-all hover:border-[var(--primary)] ${selectedCollection === col.id ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${col.color}33` }}>
                      <i className={`fa-solid ${col.icon}`} style={{ color: col.color }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--foreground)]">{col.name}</h3>
                      <p className="text-xs text-[var(--text-muted)]">{col.gameCount} games</p>
                    </div>
                  </div>
                  {col.description && <p className="text-xs text-gray-500">{col.description}</p>}
                </button>
              ))}
            </div>
          )}

          {selectedCollection && collectionGames.length > 0 && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[var(--foreground)]">
                  {collections.find((c) => c.id === selectedCollection)?.name} Games
                </h3>
                <button onClick={() => { setSelectedCollection(null); setCollectionGames([]); }} className="text-[var(--text-muted)] hover:text-[var(--foreground)]">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {collectionGames.map((game: any) => (
                  <Link key={game.id} to={`/game/${game.id}`} className="group">
                    <div className="aspect-video rounded-lg overflow-hidden mb-2">
                      {game.headerImage ? (
                        <img src={game.headerImage} alt={game.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full bg-[var(--muted)] flex items-center justify-center"><i className="fa-solid fa-gamepad text-gray-500" /></div>
                      )}
                    </div>
                    <p className="text-xs font-semibold truncate">{game.name}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
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
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {extraButtons}
      <Link
        to={`/game/${game.id}`}
        className="flex items-center space-x-2 px-4 py-2 bg-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
      >
        <i className="fa-solid fa-eye" />
        <span>{t('common.viewDetails')}</span>
      </Link>
      <a
        href={`steam://store/${game.id}`}
        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold transition-all"
      >
        <i className="fa-brands fa-steam" />
        <span>{t('common.openInSteam')}</span>
      </a>
    </div>
  );
}

function LibraryTab({ entries, stats, sortBy }: { entries: LibraryEntry[]; stats: { total: number; totalPlaytimeMins: number; played: number; neverPlayed: number }; sortBy: SortKey }) {
  const { t } = useTranslation();
  const sorted = sortGames(entries, sortBy, (e) => e.game);

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-center">
          <div className="text-3xl font-black text-[var(--primary)] mb-1">{stats.total.toLocaleString()}</div>
          <div className="text-sm text-[var(--text-muted)]">{t('myLists.totalGames')}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-center">
          <div className="text-3xl font-black text-green-500 mb-1">{stats.played.toLocaleString()}</div>
          <div className="text-sm text-[var(--text-muted)]">{t('myLists.played')}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-center">
          <div className="text-3xl font-black text-yellow-500 mb-1">{stats.neverPlayed.toLocaleString()}</div>
          <div className="text-sm text-[var(--text-muted)]">{t('myLists.neverPlayed')}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-center">
          <div className="text-3xl font-black text-purple-500 mb-1">{formatPlaytimeShort(stats.totalPlaytimeMins)}</div>
          <div className="text-sm text-[var(--text-muted)]">{t('myLists.totalPlaytime')}</div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-20 text-[var(--text-muted)]">
          <i className="fa-solid fa-book text-4xl mb-4 block" />
          <p className="text-lg mb-2">{t('myLists.noGamesFound')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((entry) => (
            <div key={entry.game.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] transition-all group">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Link to={`/game/${entry.game.id}`} className="w-full sm:w-32 h-20 shrink-0 rounded-lg overflow-hidden">
                  {entry.game.headerImage ? (
                    <img src={entry.game.headerImage} alt={entry.game.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[var(--background)]" />
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
                          <span key={genre} className="bg-[var(--background)] px-3 py-1 rounded-full text-xs font-medium">{genre}</span>
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
                    <div className="text-sm text-[var(--text-muted)]">
                      <i className="fa-solid fa-clock mr-1" />{formatPlaytime(entry.playtimeMins)}
                    </div>
                    {entry.lastPlayed && (
                      <>
                        <span className="text-gray-600">&bull;</span>
                        <div className="text-sm text-[var(--text-muted)]">{t('myLists.lastPlayed', { time: formatTimeAgo(entry.lastPlayed) })}</div>
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
  const { t } = useTranslation();
  const sorted = sortGames(games, sortBy, (g) => g);

  return (
    <div className="space-y-6">
      {/* Bookmarks header card */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center">
        <div className="w-20 h-20 bg-[var(--background)] rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fa-regular fa-bookmark text-4xl text-[var(--primary)]" />
        </div>
        <h3 className="text-xl font-bold mb-2">{t('myLists.bookmarkedGames', { count: games.length })}</h3>
        <p className="text-[var(--text-muted)]">{t('myLists.bookmarksSavedLater')}</p>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-20 text-[var(--text-muted)]">
          <i className="fa-regular fa-bookmark text-4xl mb-4 block" />
          <p className="text-lg mb-2">{t('myLists.noBookmarksYet')}</p>
          <p className="text-sm">
            <Trans i18nKey="myLists.bookmarkFromDiscover" components={{ link: <Link to="/discover" className="text-[var(--primary)] hover:underline" /> }} />
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((game) => (
            <div key={game.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] transition-all group">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Link to={`/game/${game.id}`} className="w-full sm:w-32 h-20 shrink-0 rounded-lg overflow-hidden">
                  {game.headerImage ? (
                    <img src={game.headerImage} alt={game.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[var(--background)]" />
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
                          <span key={genre} className="bg-[var(--background)] px-3 py-1 rounded-full text-xs font-medium">{genre}</span>
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
                          className="flex items-center space-x-2 px-4 py-2 bg-[var(--background)] border border-[var(--border)] hover:border-red-500 hover:text-red-500 rounded-lg text-sm font-semibold transition-all"
                        >
                          <i className="fa-solid fa-xmark" />
                          <span>{t('common.removeBookmark')}</span>
                        </button>
                        <a
                          href={`steam://addtowishlist/${game.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center space-x-2 px-4 py-2 bg-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
                        >
                          <i className="fa-regular fa-heart" />
                          <span>{t('common.addToWishlist')}</span>
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
  const { t } = useTranslation();
  const sorted = sortGames(games, sortBy, (g) => g);

  return (
    <div className="space-y-6">
      {/* Wishlist header card */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center">
        <div className="w-20 h-20 bg-[var(--background)] rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fa-regular fa-heart text-4xl text-[var(--primary)]" />
        </div>
        <h3 className="text-xl font-bold mb-2">{t('myLists.wishlistedGames', { count: games.length })}</h3>
        <p className="text-[var(--text-muted)]">{t('myLists.wishlistFromSteam')}</p>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-20 text-[var(--text-muted)]">
          <i className="fa-regular fa-heart text-4xl mb-4 block" />
          <p className="text-lg mb-2">{t('myLists.noWishlistGames')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((game) => (
            <div key={game.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] transition-all group">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Link to={`/game/${game.id}`} className="w-full sm:w-32 h-20 shrink-0 rounded-lg overflow-hidden">
                  {game.headerImage ? (
                    <img src={game.headerImage} alt={game.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[var(--background)]" />
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
                          <span key={genre} className="bg-[var(--background)] px-3 py-1 rounded-full text-xs font-medium">{genre}</span>
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
                        className="flex items-center space-x-2 px-4 py-2 bg-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
                      >
                        <i className="fa-solid fa-cart-shopping" />
                        <span>{t('myLists.buyOnSteam')}</span>
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
