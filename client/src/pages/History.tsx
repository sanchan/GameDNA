import { useState, useEffect, useCallback } from 'react';
import { Navigate, Link } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { api } from '../lib/api';
import type { Game, SwipeDecision } from '../../../shared/types';

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

const decisionConfig: Record<string, { label: string; color: string; bg: string }> = {
  yes: { label: 'Yes', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  maybe: { label: 'Maybe', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
  no: { label: 'No', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const PAGE_SIZE = 20;

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">Swipe History</h1>

      {/* Search + segmented filter */}
      <div className="flex gap-2 mb-6 items-stretch">
        {/* Search input */}
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
            placeholder="Search games..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
          />
        </div>

        {/* Segmented buttons */}
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden shrink-0">
          {[
            { key: 'all', label: 'All' },
            { key: 'yes', label: 'Yes' },
            { key: 'maybe', label: 'Maybe' },
            { key: 'no', label: 'No' },
          ].map(({ key, label }, i, arr) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                i < arr.length - 1 ? 'border-r border-[var(--border)]' : ''
              } ${
                filter === key
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-xs text-[var(--muted-foreground)] mb-3">
          {total} {total === 1 ? 'result' : 'results'}
          {debouncedSearch && ` for "${debouncedSearch}"`}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
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
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-[var(--muted-foreground)]">
          {debouncedSearch || filter !== 'all' ? (
            <>
              <p className="text-lg mb-2">No matching swipes found.</p>
              <p className="text-sm">Try a different search or filter.</p>
            </>
          ) : (
            <>
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
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
              >
                <Link to={`/game/${entry.game.id}`} className="shrink-0">
                  {entry.game.headerImage ? (
                    <img
                      src={entry.game.headerImage}
                      alt={entry.game.name}
                      className="w-24 aspect-video object-cover rounded"
                    />
                  ) : (
                    <div className="w-24 aspect-video bg-[var(--muted)] rounded" />
                  )}
                </Link>

                <div className="flex-1 min-w-0">
                  <Link to={`/game/${entry.game.id}`} className="hover:underline">
                    <p className="font-semibold text-[var(--card-foreground)] truncate">
                      {entry.game.name}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3 mt-1">
                    {entry.game.genres.length > 0 && (
                      <span className="text-xs text-[var(--muted-foreground)] truncate">
                        {entry.game.genres.slice(0, 3).join(', ')}
                      </span>
                    )}
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {formatDate(entry.swipedAt ?? 0)}
                    </span>
                  </div>
                </div>

                {/* Decision buttons */}
                <div className="flex rounded-md overflow-hidden border border-[var(--border)] shrink-0">
                  {(['yes', 'maybe', 'no'] as SwipeDecision[]).map((d, i, arr) => {
                    const dc = decisionConfig[d];
                    const isActive = entry.decision === d;
                    return (
                      <button
                        key={d}
                        onClick={() => handleChangeDecision(entry.id, d)}
                        disabled={updatingId === entry.id}
                        className={`px-2 py-1 text-xs font-medium transition-all disabled:opacity-50 ${
                          i < arr.length - 1 ? 'border-r border-[var(--border)]' : ''
                        }`}
                        style={{
                          backgroundColor: isActive ? dc.bg : 'transparent',
                          color: isActive ? dc.color : 'var(--muted-foreground)',
                        }}
                        title={dc.label}
                      >
                        {dc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-md text-sm bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-30 disabled:hover:bg-[var(--card)]"
              >
                Prev
              </button>
              <span className="text-sm text-[var(--muted-foreground)]">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-md text-sm bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-30 disabled:hover:bg-[var(--card)]"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
