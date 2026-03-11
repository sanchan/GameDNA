import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate, Link } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { api } from '../lib/api';
import type { SwipeDecision } from '../../../shared/types';
import type { Game } from '../../../shared/types';

interface SwipeEntry {
  id: number;
  game: Game;
  decision: string;
  swipedAt: number;
}

interface HistoryResponse {
  items: SwipeEntry[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 20;

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeAgo(unix: number): string {
  const seconds = Math.floor(Date.now() / 1000 - unix);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(unix);
}

export default function History() {
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<SwipeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState('newest');
  const [dateRange, setDateRange] = useState('all');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [filter]);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));
      if (filter !== 'all') params.set('decision', filter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const data = await api.get<HistoryResponse>(`/history?${params}`);
      setEntries(data.items);
      setTotal(data.total);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [user, filter, debouncedSearch, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleChangeDecision = async (entryId: number, newDecision: SwipeDecision) => {
    setUpdatingId(entryId);
    try {
      await api.post(`/history/${entryId}`, { decision: newDecision });
      // If filtering by decision and the new one doesn't match, remove from list
      if (filter !== 'all' && newDecision !== filter) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setTotal((t) => t - 1);
      } else {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId ? { ...e, decision: newDecision } : e,
          ),
        );
      }
    } catch {
      // ignore
    } finally {
      setUpdatingId(null);
    }
  };

  // Compute decision summary counts from current data context
  const summary = useMemo(() => {
    const yes = entries.filter((e) => e.decision === 'yes').length;
    const maybe = entries.filter((e) => e.decision === 'maybe').length;
    const no = entries.filter((e) => e.decision === 'no').length;
    const totalSwipes = total;
    // Approximate this week count from loaded entries
    const oneWeekAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
    const thisWeek = entries.filter((e) => e.swipedAt >= oneWeekAgo).length;
    return { yes, maybe, no, totalSwipes, thisWeek };
  }, [entries, total]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Header */}
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-3">Swipe History</h1>
      <p className="text-[var(--muted-foreground)] mb-8">
        Review and manage your past game decisions
      </p>

      {/* Search and Filters */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8">
        {/* Search input */}
        <div className="relative mb-4">
          <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Search games..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
          />
        </div>

        {/* Filter selects */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
          >
            <option value="all">All Decisions</option>
            <option value="yes">Yes</option>
            <option value="maybe">Maybe</option>
            <option value="no">No</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>
      </div>

      {/* Decision Summary */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold mb-4">Decision Summary</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Yes card */}
          <div className="bg-[#1a1a1a] border-2 border-green-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <i className="fa-solid fa-thumbs-up text-green-500" />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)]">Yes</p>
                <p className="text-2xl font-bold text-green-500">{summary.yes}</p>
              </div>
            </div>
            <div className="w-full bg-[#333] rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${entries.length ? (summary.yes / entries.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Maybe card */}
          <div className="bg-[#1a1a1a] border-2 border-yellow-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <i className="fa-solid fa-minus text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)]">Maybe</p>
                <p className="text-2xl font-bold text-yellow-500">{summary.maybe}</p>
              </div>
            </div>
            <div className="w-full bg-[#333] rounded-full h-2">
              <div
                className="bg-yellow-500 h-2 rounded-full transition-all"
                style={{ width: `${entries.length ? (summary.maybe / entries.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* No card */}
          <div className="bg-[#1a1a1a] border-2 border-red-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <i className="fa-solid fa-thumbs-down text-red-500" />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)]">No</p>
                <p className="text-2xl font-bold text-red-500">{summary.no}</p>
              </div>
            </div>
            <div className="w-full bg-[#333] rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full transition-all"
                style={{ width: `${entries.length ? (summary.no / entries.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Bottom stats row */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#333]">
          <div className="text-center">
            <p className="text-2xl font-bold">{summary.totalSwipes}</p>
            <p className="text-sm text-[var(--muted-foreground)]">Total Swipes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{summary.thisWeek}</p>
            <p className="text-sm text-[var(--muted-foreground)]">This Week</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">
              {summary.totalSwipes > 0 ? Math.max(1, Math.round(summary.thisWeek / 7)) : 0}
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">Avg. Per Day</p>
          </div>
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          {total} {total === 1 ? 'result' : 'results'}
          {debouncedSearch && ` for "${debouncedSearch}"`}
        </p>
      )}

      {/* History list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#242424] border border-[#333] rounded-xl p-4 flex items-center gap-4">
              <div className="w-32 h-20 bg-[#333] rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-5 w-1/3 bg-[#333] rounded animate-pulse" />
                <div className="h-4 w-1/4 bg-[#333] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-[var(--muted-foreground)]">
          {debouncedSearch || filter !== 'all' ? (
            <>
              <i className="fa-solid fa-search text-4xl mb-4 block opacity-30" />
              <p className="text-lg mb-2">No matching swipes found.</p>
              <p className="text-sm">Try a different search or filter.</p>
            </>
          ) : (
            <>
              <i className="fa-solid fa-clock-rotate-left text-4xl mb-4 block opacity-30" />
              <p className="text-lg mb-2">No swipe history yet.</p>
              <p className="text-sm">
                Head to{' '}
                <Link to="/discover" className="text-[var(--primary)] hover:underline">
                  Discover
                </Link>{' '}
                to start swiping!
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {entries.map((entry) => {
              const otherDecisions = (['yes', 'maybe', 'no'] as SwipeDecision[]).filter(
                (d) => d !== entry.decision,
              );

              return (
                <div
                  key={entry.id}
                  className="bg-[#242424] border border-[#333] rounded-xl p-4 hover:border-[var(--primary)] transition-all"
                >
                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    <Link to={`/game/${entry.game.id}`} className="shrink-0">
                      {entry.game.headerImage ? (
                        <img
                          src={entry.game.headerImage}
                          alt={entry.game.name}
                          className="w-32 h-20 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-32 h-20 bg-[#333] rounded-lg flex items-center justify-center">
                          <i className="fa-solid fa-gamepad text-[var(--muted-foreground)]" />
                        </div>
                      )}
                    </Link>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <Link to={`/game/${entry.game.id}`} className="hover:underline">
                        <h3 className="font-bold text-lg truncate">{entry.game.name}</h3>
                      </Link>

                      {entry.game.genres.length > 0 && (
                        <p className="text-sm text-[var(--muted-foreground)] truncate mt-0.5">
                          {entry.game.genres.slice(0, 3).join(', ')}
                        </p>
                      )}

                      <p className="text-xs text-[var(--muted-foreground)] mt-1 flex items-center gap-1">
                        <i className="fa-solid fa-clock text-[10px]" />
                        Swiped {timeAgo(entry.swipedAt)}
                      </p>

                      {/* Change decision buttons */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {otherDecisions.map((d) => {
                          const config: Record<string, { label: string; icon: string; hoverBg: string; hoverText: string }> = {
                            yes: { label: 'Change to Yes', icon: 'fa-thumbs-up', hoverBg: 'hover:bg-green-500/20', hoverText: 'hover:text-green-500' },
                            maybe: { label: 'Change to Maybe', icon: 'fa-minus', hoverBg: 'hover:bg-yellow-500/20', hoverText: 'hover:text-yellow-500' },
                            no: { label: 'Change to No', icon: 'fa-thumbs-down', hoverBg: 'hover:bg-red-500/20', hoverText: 'hover:text-red-500' },
                          };
                          const c = config[d];
                          return (
                            <button
                              key={d}
                              onClick={() => handleChangeDecision(entry.id, d)}
                              disabled={updatingId === entry.id}
                              className={`text-xs px-3 py-1.5 rounded-lg border border-[#333] text-[var(--muted-foreground)] transition-all disabled:opacity-50 ${c.hoverBg} ${c.hoverText}`}
                            >
                              <i className={`fa-solid ${c.icon} mr-1`} />
                              {c.label}
                            </button>
                          );
                        })}

                        <Link
                          to={`/game/${entry.game.id}`}
                          className="text-xs px-3 py-1.5 rounded-lg border border-[#333] text-[var(--muted-foreground)] hover:bg-[var(--primary)]/20 hover:text-[var(--primary)] transition-all"
                        >
                          <i className="fa-solid fa-eye mr-1" />
                          View Game
                        </Link>
                      </div>
                    </div>

                    {/* Decision badge */}
                    <div className="shrink-0">
                      {entry.decision === 'yes' && (
                        <span className="bg-green-500/20 text-green-500 px-4 py-2 rounded-full font-bold text-sm inline-flex items-center gap-2">
                          <i className="fa-solid fa-thumbs-up" />
                          Yes
                        </span>
                      )}
                      {entry.decision === 'maybe' && (
                        <span className="bg-yellow-500/20 text-yellow-500 px-4 py-2 rounded-full font-bold text-sm inline-flex items-center gap-2">
                          <i className="fa-solid fa-minus" />
                          Maybe
                        </span>
                      )}
                      {entry.decision === 'no' && (
                        <span className="bg-red-500/20 text-red-500 px-4 py-2 rounded-full font-bold text-sm inline-flex items-center gap-2">
                          <i className="fa-solid fa-thumbs-down" />
                          No
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-lg text-sm bg-[#242424] border border-[#333] text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-30 disabled:hover:border-[#333] transition-all"
              >
                <i className="fa-solid fa-chevron-left mr-1" />
                Prev
              </button>
              <span className="text-sm text-[var(--muted-foreground)]">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 rounded-lg text-sm bg-[#242424] border border-[#333] text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-30 disabled:hover:border-[#333] transition-all"
              >
                Next
                <i className="fa-solid fa-chevron-right ml-1" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
