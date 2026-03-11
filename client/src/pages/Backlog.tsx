import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, Link } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { api } from '../lib/api';
import type { Game } from '../../../shared/types';
import BookmarkButton from '../components/BookmarkButton';

interface BacklogEntry {
  game: Game;
  playtimeMins: number;
  fromWishlist: boolean;
}

interface PrioritizedEntry extends BacklogEntry {
  reason: string;
}

function formatPlaytime(mins: number): string {
  if (mins === 0) return 'Never played';
  if (mins < 60) return `${mins} mins played`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return remaining > 0 ? `${hours}h ${remaining}m played` : `${hours}h played`;
}

function reviewColor(score: number | null): string {
  if (score === null) return 'var(--muted-foreground)';
  if (score > 70) return 'oklch(0.72 0.19 142)';
  if (score >= 40) return 'oklch(0.75 0.18 85)';
  return 'var(--destructive-foreground)';
}

export default function Backlog() {
  const { user, loading: authLoading, syncStatus } = useAuth();
  const [backlog, setBacklog] = useState<BacklogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [prioritized, setPrioritized] = useState<PrioritizedEntry[] | null>(null);

  const prevSyncStatus = useRef(syncStatus);

  const fetchBacklog = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api.get<BacklogEntry[]>('/backlog')
      .then(setBacklog)
      .catch(() => setBacklog([]))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    fetchBacklog();
  }, [fetchBacklog]);

  // Refetch when sync transitions to 'synced'
  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      fetchBacklog();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, fetchBacklog]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const result = await api.post<{ prioritized: PrioritizedEntry[] }>('/backlog/analyze');
      setPrioritized(result.prioritized);
    } catch {
      // silently fail
    } finally {
      setAnalyzing(false);
    }
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Your Backlog</h1>
        <button
          onClick={handleAnalyze}
          disabled={analyzing || backlog.length === 0}
          className="bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {analyzing ? 'Analyzing...' : 'Analyze with AI'}
        </button>
      </div>

      {prioritized && prioritized.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3">
            AI Recommendations - Play These Next
          </h2>
          <div className="flex flex-col gap-2">
            {prioritized.map((entry, i) => (
              <Link
                key={entry.game.id}
                to={`/game/${entry.game.id}`}
                className="flex items-center gap-4 p-3 rounded-lg bg-[var(--card)] border border-[var(--primary)] border-opacity-30 hover:border-opacity-60 transition-colors"
              >
                <span className="text-lg font-bold text-[var(--primary)] w-6 text-center shrink-0">
                  {i + 1}
                </span>
                {entry.game.headerImage && (
                  <img
                    src={entry.game.headerImage}
                    alt={entry.game.name}
                    className="w-24 aspect-video object-cover rounded shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--card-foreground)] truncate">{entry.game.name}</p>
                  <p className="text-sm text-[var(--muted-foreground)] line-clamp-2">{entry.reason}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-[var(--card)]">
              <div className="w-24 aspect-video bg-[var(--muted)] rounded animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-5 w-1/3 bg-[var(--muted)] rounded animate-pulse" />
                <div className="h-4 w-1/4 bg-[var(--muted)] rounded animate-pulse" />
                <div className="flex gap-1.5">
                  <div className="h-4 w-14 bg-[var(--muted)] rounded-full animate-pulse" />
                  <div className="h-4 w-10 bg-[var(--muted)] rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : backlog.length === 0 ? (
        <div className="text-center py-20 text-[var(--muted-foreground)]">
          {syncStatus === 'syncing' ? (
            <>
              <p className="text-lg mb-2">Syncing your Steam library...</p>
              <p className="text-sm">Your backlog will appear once sync is complete.</p>
              <div className="mt-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
            </>
          ) : (
            <>
              <p className="text-lg mb-2">No unplayed games in your library.</p>
              <p className="text-sm">You must be busy!</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {backlog.map((entry) => (
            <Link
              key={entry.game.id}
              to={`/game/${entry.game.id}`}
              className="flex items-center gap-4 p-3 rounded-lg bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
            >
              {entry.game.headerImage && (
                <img
                  src={entry.game.headerImage}
                  alt={entry.game.name}
                  className="w-24 aspect-video object-cover rounded shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-[var(--card-foreground)] truncate">{entry.game.name}</p>
                  {entry.fromWishlist && (
                    <span className="shrink-0 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full px-2 py-0.5 text-xs">
                      Wishlist
                    </span>
                  )}
                </div>
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
                </div>
                {entry.game.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {entry.game.genres.slice(0, 4).map((genre) => (
                      <span
                        key={genre}
                        className="bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-full px-2 py-0.5 text-xs"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <BookmarkButton gameId={entry.game.id} />
              <a
                href={`steam://addtowishlist/${entry.game.id}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)] hover:text-[oklch(0.72_0.19_142)]"
                title="Add to Steam Wishlist"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
