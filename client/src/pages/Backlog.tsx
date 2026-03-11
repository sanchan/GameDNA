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

function formatPlaytimeShort(mins: number): string {
  if (mins === 0) return '0h';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
}

function matchScoreColor(score: number | null): string {
  if (score === null) return '#888';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

export default function Backlog() {
  const { user, loading: authLoading, syncStatus } = useAuth();
  const [backlog, setBacklog] = useState<BacklogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [prioritized, setPrioritized] = useState<PrioritizedEntry[] | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);

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
      setLastAnalyzed(new Date());
    } catch {
      // silently fail
    } finally {
      setAnalyzing(false);
    }
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const totalPlaytimeMins = backlog.reduce((sum, e) => sum + e.playtimeMins, 0);
  const totalPlaytimeHours = Math.floor(totalPlaytimeMins / 60);
  const unplayedCount = backlog.filter((e) => e.playtimeMins === 0).length;
  const highPriorityCount = prioritized?.length ?? 0;
  const avgScore = backlog.length > 0
    ? Math.round(
        backlog.filter((e) => e.game.reviewScore !== null)
          .reduce((sum, e) => sum + (e.game.reviewScore ?? 0), 0) /
        (backlog.filter((e) => e.game.reviewScore !== null).length || 1)
      )
    : 0;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-3 text-white">
          AI Backlog Analysis
        </h1>
        <p className="text-[var(--muted-foreground)] text-lg">
          Let AI prioritize your unplayed games and discover hidden gems in your library.
        </p>
      </div>

      {/* Analysis Header Card */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-[var(--primary)]/20 rounded-full w-12 h-12 flex items-center justify-center shrink-0">
              <i className="fa-solid fa-brain text-[var(--primary)] text-xl" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">AI Analysis Ready</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                {lastAnalyzed
                  ? `Last analyzed: ${lastAnalyzed.toLocaleDateString()} at ${lastAnalyzed.toLocaleTimeString()}`
                  : `${backlog.length} games ready for analysis`}
              </p>
            </div>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || backlog.length === 0}
            className="bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] rounded-xl text-lg font-bold px-6 py-4 shadow-lg shadow-[var(--primary)]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
          >
            <i className="fa-solid fa-wand-magic-sparkles" />
            {analyzing ? 'Analyzing...' : 'Analyze with AI'}
          </button>
        </div>
      </div>

      {/* Backlog Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-500/20 rounded-lg w-10 h-10 flex items-center justify-center">
              <i className="fa-solid fa-gamepad text-blue-400" />
            </div>
            <span className="text-sm text-[var(--muted-foreground)]">Unplayed Games</span>
          </div>
          <p className="text-3xl font-bold text-white">{unplayedCount}</p>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-purple-500/20 rounded-lg w-10 h-10 flex items-center justify-center">
              <i className="fa-solid fa-clock text-purple-400" />
            </div>
            <span className="text-sm text-[var(--muted-foreground)]">Total Playtime</span>
          </div>
          <p className="text-3xl font-bold text-white">{totalPlaytimeHours}h</p>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-500/20 rounded-lg w-10 h-10 flex items-center justify-center">
              <i className="fa-solid fa-star text-green-400" />
            </div>
            <span className="text-sm text-[var(--muted-foreground)]">High Priority</span>
          </div>
          <p className="text-3xl font-bold text-white">{highPriorityCount}</p>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-yellow-500/20 rounded-lg w-10 h-10 flex items-center justify-center">
              <i className="fa-solid fa-chart-line text-yellow-400" />
            </div>
            <span className="text-sm text-[var(--muted-foreground)]">Avg Match Score</span>
          </div>
          <p className="text-3xl font-bold text-white">{avgScore}%</p>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#242424] border border-[#333] rounded-xl p-6 animate-pulse">
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-48 h-32 bg-[#333] rounded-lg" />
                <div className="flex-1 flex flex-col gap-3">
                  <div className="h-7 w-1/3 bg-[#333] rounded" />
                  <div className="h-4 w-1/2 bg-[#333] rounded" />
                  <div className="flex gap-2">
                    <div className="h-6 w-16 bg-[#333] rounded-full" />
                    <div className="h-6 w-20 bg-[#333] rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : backlog.length === 0 ? (
        <div className="text-center py-20 text-[var(--muted-foreground)]">
          {syncStatus === 'syncing' ? (
            <>
              <i className="fa-solid fa-sync fa-spin text-4xl text-[var(--primary)] mb-4" />
              <p className="text-lg mb-2">Syncing your Steam library...</p>
              <p className="text-sm">Your backlog will appear once sync is complete.</p>
            </>
          ) : (
            <>
              <i className="fa-solid fa-gamepad text-4xl mb-4 opacity-50" />
              <p className="text-lg mb-2">No unplayed games in your library.</p>
              <p className="text-sm">You must be busy!</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Prioritized (High Priority) Items */}
          {prioritized && prioritized.map((entry) => (
            <div
              key={`pri-${entry.game.id}`}
              className="bg-[#242424] border-2 border-green-500/30 hover:border-green-500 rounded-xl p-6 transition-colors"
            >
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Thumbnail */}
                {entry.game.headerImage && (
                  <Link to={`/game/${entry.game.id}`} className="shrink-0">
                    <img
                      src={entry.game.headerImage}
                      alt={entry.game.name}
                      className="w-full lg:w-48 h-32 object-cover rounded-lg"
                    />
                  </Link>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <Link to={`/game/${entry.game.id}`} className="text-2xl font-bold text-white hover:text-[var(--primary)] transition-colors truncate">
                      {entry.game.name}
                    </Link>
                    <span className="shrink-0 bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                      High Priority
                    </span>
                  </div>

                  {/* Genre pills */}
                  {entry.game.genres.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {entry.game.genres.slice(0, 5).map((genre) => (
                        <span
                          key={genre}
                          className="bg-[#333] text-[var(--muted-foreground)] rounded-full px-3 py-1 text-xs"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* AI Recommendation */}
                  {entry.reason && (
                    <div className="bg-[#1a1a1a] rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-3">
                        <i className="fa-solid fa-lightbulb text-[var(--primary)] mt-0.5" />
                        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                          {entry.reason}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`steam://run/${entry.game.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <i className="fa-solid fa-play" />
                      Play Now
                    </a>
                    <a
                      href={`steam://addtowishlist/${entry.game.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-[#333] hover:bg-[#444] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <i className="fa-solid fa-heart" />
                      Add to Wishlist
                    </a>
                    <Link
                      to={`/game/${entry.game.id}`}
                      className="bg-[#333] hover:bg-[#444] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <i className="fa-solid fa-eye" />
                      View Details
                    </Link>
                    <BookmarkButton gameId={entry.game.id} size={18} />
                  </div>
                </div>

                {/* Right side: Score + Playtime */}
                <div className="shrink-0 flex lg:flex-col items-center lg:items-end gap-4 lg:gap-2">
                  {entry.game.reviewScore !== null && (
                    <div className="text-center lg:text-right">
                      <p className="text-xs text-[var(--muted-foreground)] mb-1">Match Score</p>
                      <p
                        className="text-4xl font-black"
                        style={{ color: matchScoreColor(entry.game.reviewScore) }}
                      >
                        {entry.game.reviewScore}%
                      </p>
                    </div>
                  )}
                  <div className="text-center lg:text-right">
                    <p className="text-xs text-[var(--muted-foreground)] mb-1">Est. Playtime</p>
                    <p className="text-lg font-bold text-white">{formatPlaytimeShort(entry.playtimeMins)}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Normal Backlog Items */}
          {backlog
            .filter((entry) => !prioritized?.some((p) => p.game.id === entry.game.id))
            .map((entry) => (
              <div
                key={entry.game.id}
                className="bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-xl p-6 transition-colors"
              >
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Thumbnail */}
                  {entry.game.headerImage && (
                    <Link to={`/game/${entry.game.id}`} className="shrink-0">
                      <img
                        src={entry.game.headerImage}
                        alt={entry.game.name}
                        className="w-full lg:w-48 h-32 object-cover rounded-lg"
                      />
                    </Link>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Link to={`/game/${entry.game.id}`} className="text-2xl font-bold text-white hover:text-[var(--primary)] transition-colors truncate">
                        {entry.game.name}
                      </Link>
                      {entry.fromWishlist && (
                        <span className="shrink-0 bg-[var(--primary)]/20 text-[var(--primary)] text-xs font-bold px-3 py-1 rounded-full">
                          Wishlist
                        </span>
                      )}
                    </div>

                    {/* Genre pills */}
                    {entry.game.genres.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {entry.game.genres.slice(0, 5).map((genre) => (
                          <span
                            key={genre}
                            className="bg-[#333] text-[var(--muted-foreground)] rounded-full px-3 py-1 text-xs"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Playtime info */}
                    <p className="text-sm text-[var(--muted-foreground)] mb-4">
                      {formatPlaytime(entry.playtimeMins)}
                    </p>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`steam://run/${entry.game.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <i className="fa-solid fa-play" />
                        Play Now
                      </a>
                      <a
                        href={`steam://addtowishlist/${entry.game.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#333] hover:bg-[#444] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <i className="fa-solid fa-heart" />
                        Add to Wishlist
                      </a>
                      <Link
                        to={`/game/${entry.game.id}`}
                        className="bg-[#333] hover:bg-[#444] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <i className="fa-solid fa-eye" />
                        View Details
                      </Link>
                      <BookmarkButton gameId={entry.game.id} size={18} />
                    </div>
                  </div>

                  {/* Right side: Score + Playtime */}
                  <div className="shrink-0 flex lg:flex-col items-center lg:items-end gap-4 lg:gap-2">
                    {entry.game.reviewScore !== null && (
                      <div className="text-center lg:text-right">
                        <p className="text-xs text-[var(--muted-foreground)] mb-1">Match Score</p>
                        <p
                          className="text-4xl font-black"
                          style={{ color: matchScoreColor(entry.game.reviewScore) }}
                        >
                          {entry.game.reviewScore}%
                        </p>
                      </div>
                    )}
                    <div className="text-center lg:text-right">
                      <p className="text-xs text-[var(--muted-foreground)] mb-1">Est. Playtime</p>
                      <p className="text-lg font-bold text-white">{formatPlaytimeShort(entry.playtimeMins)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
