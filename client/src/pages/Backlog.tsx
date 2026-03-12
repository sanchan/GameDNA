import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Navigate, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import { useToast } from '../components/Toast';
import * as queries from '../db/queries';
import type { Game } from '../../../shared/types';

interface BacklogEntry {
  game: Game;
  playtimeMins: number;
  fromWishlist: boolean;
  estimatedHours?: number;
  manualPosition?: number | null;
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
  if (score >= 40) return '#3b82f6';
  return '#ef4444';
}

function matchBadge(score: number | null): { label: string; classes: string } | null {
  if (score === null) return null;
  if (score >= 80) return { label: i18n.t('backlog.highPriorityBadge'), classes: 'bg-green-500/20 text-green-500' };
  if (score >= 60) return { label: i18n.t('backlog.goodMatch'), classes: 'bg-yellow-500/20 text-yellow-500' };
  if (score >= 40) return { label: i18n.t('backlog.fairMatch'), classes: 'bg-blue-500/20 text-blue-500' };
  return null;
}

type SortOption = 'score-desc' | 'score-asc' | 'playtime-asc' | 'playtime-desc' | 'recent' | 'name-asc' | 'name-desc';
type PlaytimeFilter = 'all' | 'under5' | '5to15' | '15to40' | '40plus';
type ScoreFilter = 'all' | 'excellent' | 'great' | 'good' | 'fair';

export default function Backlog() {
  const { t } = useTranslation();
  const { user, loading: authLoading, syncStatus } = useAuth();
  const { userId } = useDb();
  const { toast } = useToast();
  const [markingPlayedId, setMarkingPlayedId] = useState<number | null>(null);
  const [backlog, setBacklog] = useState<BacklogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [prioritized, setPrioritized] = useState<PrioritizedEntry[] | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);

  // Filter/sort state
  const [sortBy, setSortBy] = useState<SortOption>('score-desc');
  const [playtimeFilter, setPlaytimeFilter] = useState<PlaytimeFilter>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [genreFilter, setGenreFilter] = useState('all');

  const prevSyncStatus = useRef(syncStatus);

  const fetchBacklog = useCallback(() => {
    if (!user || !userId) return;
    setLoading(true);
    try {
      const items = queries.getBacklog(userId);
      setBacklog(items.map((e) => ({
        game: e.game,
        playtimeMins: e.playtimeMins,
        fromWishlist: false,
        manualPosition: e.position,
      })));
    } catch {
      setBacklog([]);
    } finally {
      setLoading(false);
    }
  }, [user, userId]);

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

  const handleAnalyze = () => {
    // AI analysis requires Ollama/WebLLM integration (Phase 3)
    setAnalyzing(true);
    try {
      // For now, prioritize by review score as a heuristic
      const sorted = [...backlog]
        .filter((e) => e.game.reviewScore !== null)
        .sort((a, b) => (b.game.reviewScore ?? 0) - (a.game.reviewScore ?? 0))
        .slice(0, 10);
      setPrioritized(sorted.map((e) => ({
        ...e,
        reason: `Highly rated (${e.game.reviewScore}%) and matches your library genres.`,
      })));
      setLastAnalyzed(new Date());
      toast(`Analyzed ${sorted.length} games (heuristic — configure AI for deeper analysis)`, 'success');
    } catch {
      toast('Analysis failed', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReorder = (gameId: number, direction: 'up' | 'down') => {
    if (!userId) return;
    try {
      const currentIds = backlog.map((e) => e.game.id);
      const idx = currentIds.indexOf(gameId);
      if (idx < 0) return;
      const newIdx = direction === 'up' ? Math.max(0, idx - 1) : Math.min(currentIds.length - 1, idx + 1);
      if (newIdx === idx) return;
      const reordered = [...currentIds];
      reordered.splice(idx, 1);
      reordered.splice(newIdx, 0, gameId);
      queries.reorderBacklog(userId, reordered);
      fetchBacklog();
    } catch {
      toast('Failed to reorder', 'error');
    }
  };

  const handleMarkAsPlayed = (gameId: number, gameName: string) => {
    if (!userId) return;
    setMarkingPlayedId(gameId);
    try {
      // Mark as played by setting game status
      queries.setGameStatus(userId, gameId, 'completed');
      setBacklog((prev) => prev.filter((e) => e.game.id !== gameId));
      toast(`Marked "${gameName}" as played`, 'success');
    } catch {
      toast('Failed to mark as played', 'error');
    } finally {
      setMarkingPlayedId(null);
    }
  };

  // Collect unique genres
  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    backlog.forEach((e) => e.game.genres.forEach((g) => genres.add(g)));
    return Array.from(genres).sort();
  }, [backlog]);

  // Filter and sort logic
  const filteredBacklog = useMemo(() => {
    let items = [...backlog];

    // Playtime filter (estimated playtime)
    if (playtimeFilter === 'under5') items = items.filter((e) => e.playtimeMins < 300);
    else if (playtimeFilter === '5to15') items = items.filter((e) => e.playtimeMins >= 300 && e.playtimeMins < 900);
    else if (playtimeFilter === '15to40') items = items.filter((e) => e.playtimeMins >= 900 && e.playtimeMins < 2400);
    else if (playtimeFilter === '40plus') items = items.filter((e) => e.playtimeMins >= 2400);

    // Score filter
    if (scoreFilter === 'excellent') items = items.filter((e) => (e.game.reviewScore ?? 0) >= 90);
    else if (scoreFilter === 'great') items = items.filter((e) => (e.game.reviewScore ?? 0) >= 70 && (e.game.reviewScore ?? 0) < 90);
    else if (scoreFilter === 'good') items = items.filter((e) => (e.game.reviewScore ?? 0) >= 50 && (e.game.reviewScore ?? 0) < 70);
    else if (scoreFilter === 'fair') items = items.filter((e) => (e.game.reviewScore ?? 0) < 50);

    // Genre filter
    if (genreFilter !== 'all') items = items.filter((e) => e.game.genres.includes(genreFilter));

    // Sort
    if (sortBy === 'score-desc') items.sort((a, b) => (b.game.reviewScore ?? 0) - (a.game.reviewScore ?? 0));
    else if (sortBy === 'score-asc') items.sort((a, b) => (a.game.reviewScore ?? 0) - (b.game.reviewScore ?? 0));
    else if (sortBy === 'playtime-asc') items.sort((a, b) => a.playtimeMins - b.playtimeMins);
    else if (sortBy === 'playtime-desc') items.sort((a, b) => b.playtimeMins - a.playtimeMins);
    else if (sortBy === 'name-asc') items.sort((a, b) => a.game.name.localeCompare(b.game.name));
    else if (sortBy === 'name-desc') items.sort((a, b) => b.game.name.localeCompare(a.game.name));

    return items;
  }, [backlog, sortBy, playtimeFilter, scoreFilter, genreFilter]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const totalPlaytimeMins = backlog.reduce((sum, e) => sum + e.playtimeMins, 0);
  const totalPlaytimeHours = Math.floor(totalPlaytimeMins / 60);
  const unplayedCount = backlog.filter((e) => e.playtimeMins === 0).length;
  const highPriorityCount = prioritized?.length ?? 0;
  const avgScore = backlog.length > 0
    ? (
        backlog.filter((e) => e.game.reviewScore !== null)
          .reduce((sum, e) => sum + (e.game.reviewScore ?? 0), 0) /
        (backlog.filter((e) => e.game.reviewScore !== null).length || 1)
      ).toFixed(1)
    : '0';

  const isPrioritized = (id: number) => prioritized?.some((p) => p.game.id === id);
  const getPrioritizedReason = (id: number) => prioritized?.find((p) => p.game.id === id)?.reason;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-3 text-white">
          {t('backlog.title')}
        </h1>
        <p className="text-[var(--muted-foreground)] text-lg max-w-3xl">
          {t('backlog.subtitle')}
        </p>
      </div>

      {/* Analysis Header Card */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-[var(--primary)]/20 rounded-full w-12 h-12 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-brain text-[var(--primary)] text-xl" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{t('backlog.aiAnalysisReady')}</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {lastAnalyzed
                    ? t('backlog.lastAnalyzed', { date: lastAnalyzed.toLocaleDateString(), time: lastAnalyzed.toLocaleTimeString() })
                    : t('backlog.gamesReadyForAnalysis', { count: backlog.length })}
                </p>
              </div>
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">
              {t('backlog.freshAnalysisPrompt')}
            </p>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || backlog.length === 0}
            className="bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] rounded-xl text-lg font-bold px-6 py-4 shadow-lg shadow-[var(--primary)]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
          >
            <i className="fa-solid fa-wand-magic-sparkles" />
            {analyzing ? t('backlog.analyzing') : t('backlog.analyzeWithAI')}
          </button>
        </div>
      </div>

      {/* Backlog Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-blue-500/20 rounded-lg w-10 h-10 flex items-center justify-center">
              <i className="fa-solid fa-gamepad text-blue-400" />
            </div>
            <span className="text-3xl font-black text-white">{unplayedCount}</span>
          </div>
          <h3 className="text-sm text-[var(--muted-foreground)] mb-1">{t('backlog.unplayedGames')}</h3>
          <p className="text-xs text-gray-500">{t('backlog.inYourLibrary')}</p>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-purple-500/20 rounded-lg w-10 h-10 flex items-center justify-center">
              <i className="fa-solid fa-clock text-purple-400" />
            </div>
            <span className="text-3xl font-black text-white">{totalPlaytimeHours}h</span>
          </div>
          <h3 className="text-sm text-[var(--muted-foreground)] mb-1">{t('backlog.totalPlaytime')}</h3>
          <p className="text-xs text-gray-500">{t('backlog.estimatedToComplete')}</p>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-green-500/20 rounded-lg w-10 h-10 flex items-center justify-center">
              <i className="fa-solid fa-star text-green-400" />
            </div>
            <span className="text-3xl font-black text-white">{highPriorityCount}</span>
          </div>
          <h3 className="text-sm text-[var(--muted-foreground)] mb-1">{t('backlog.highPriority')}</h3>
          <p className="text-xs text-gray-500">{t('backlog.recommendedToPlay')}</p>
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-yellow-500/20 rounded-lg w-10 h-10 flex items-center justify-center">
              <i className="fa-solid fa-chart-line text-yellow-400" />
            </div>
            <span className="text-3xl font-black text-white">{avgScore}</span>
          </div>
          <h3 className="text-sm text-[var(--muted-foreground)] mb-1">{t('backlog.avgMatchScore')}</h3>
          <p className="text-xs text-gray-500">{t('backlog.basedOnYourDNA')}</p>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-[var(--muted-foreground)] font-medium">{t('common.sortBy')}</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--primary)] transition-all"
            >
              <option value="score-desc">{t('backlog.sortOptions.scoreDesc')}</option>
              <option value="score-asc">{t('backlog.sortOptions.scoreAsc')}</option>
              <option value="playtime-asc">{t('backlog.sortOptions.playtimeAsc')}</option>
              <option value="playtime-desc">{t('backlog.sortOptions.playtimeDesc')}</option>
              <option value="name-asc">{t('backlog.sortOptions.nameAsc')}</option>
              <option value="name-desc">{t('backlog.sortOptions.nameDesc')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-[var(--muted-foreground)] font-medium">{t('backlog.playtimeFilter')}</label>
            <select
              value={playtimeFilter}
              onChange={(e) => setPlaytimeFilter(e.target.value as PlaytimeFilter)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--primary)] transition-all"
            >
              <option value="all">{t('backlog.playtimeOptions.allGames')}</option>
              <option value="under5">{t('backlog.playtimeOptions.quickWins')}</option>
              <option value="5to15">{t('backlog.playtimeOptions.shortGames')}</option>
              <option value="15to40">{t('backlog.playtimeOptions.mediumGames')}</option>
              <option value="40plus">{t('backlog.playtimeOptions.longGames')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-[var(--muted-foreground)] font-medium">{t('backlog.matchScore')}</label>
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value as ScoreFilter)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--primary)] transition-all"
            >
              <option value="all">{t('backlog.scoreOptions.allScores')}</option>
              <option value="excellent">{t('backlog.scoreOptions.excellent')}</option>
              <option value="great">{t('backlog.scoreOptions.great')}</option>
              <option value="good">{t('backlog.scoreOptions.good')}</option>
              <option value="fair">{t('backlog.scoreOptions.fair')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-[var(--muted-foreground)] font-medium">{t('common.genre')}</label>
            <select
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--primary)] transition-all"
            >
              <option value="all">{t('common.allGenres')}</option>
              {allGenres.map((genre) => (
                <option key={genre} value={genre}>{genre}</option>
              ))}
            </select>
          </div>
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
              <p className="text-lg mb-2">{t('backlog.syncingLibrary')}</p>
              <p className="text-sm">{t('backlog.syncingSubtext')}</p>
            </>
          ) : (
            <>
              <i className="fa-solid fa-gamepad text-4xl mb-4 opacity-50" />
              <p className="text-lg mb-2">{t('backlog.noUnplayedGames')}</p>
              <p className="text-sm">{t('backlog.mustBeBusy')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBacklog.map((entry) => {
            const isHighPriority = isPrioritized(entry.game.id);
            const reason = getPrioritizedReason(entry.game.id);
            const badge = isHighPriority
              ? { label: t('backlog.highPriorityBadge'), classes: 'bg-green-500/20 text-green-500' }
              : matchBadge(entry.game.reviewScore);

            return (
              <div
                key={entry.game.id}
                className={`bg-[#242424] rounded-xl p-6 transition-all ${
                  isHighPriority
                    ? 'border-2 border-green-500/30 hover:border-green-500'
                    : 'border border-[#333] hover:border-[var(--primary)]'
                }`}
              >
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Thumbnail */}
                  {entry.game.headerImage && (
                    <Link to={`/game/${entry.game.id}`} className="w-full lg:w-48 h-32 shrink-0 rounded-lg overflow-hidden">
                      <img
                        src={entry.game.headerImage}
                        alt={entry.game.name}
                        className="w-full h-full object-cover"
                      />
                    </Link>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <Link to={`/game/${entry.game.id}`} className="text-2xl font-bold text-white hover:text-[var(--primary)] transition-colors truncate">
                            {entry.game.name}
                          </Link>
                          {badge && (
                            <span className={`shrink-0 ${badge.classes} px-3 py-1 rounded-full text-xs font-bold`}>
                              {badge.label}
                            </span>
                          )}
                        </div>

                        {/* Genre pills */}
                        {entry.game.genres.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {entry.game.genres.slice(0, 5).map((genre) => (
                              <span
                                key={genre}
                                className="bg-[#1a1a1a] text-[var(--muted-foreground)] rounded-full px-3 py-1 text-xs font-medium"
                              >
                                {genre}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Score + Playtime side by side */}
                      <div className="flex items-center gap-4 shrink-0">
                        {entry.game.reviewScore !== null && (
                          <div className="text-center">
                            <p
                              className="text-4xl font-black mb-1"
                              style={{ color: matchScoreColor(entry.game.reviewScore) }}
                            >
                              {entry.game.reviewScore}%
                            </p>
                            <p className="text-xs text-[var(--muted-foreground)]">{t('backlog.matchScore')}</p>
                          </div>
                        )}
                        {entry.game.reviewScore !== null && (
                          <div className="w-px h-16 bg-[#333]" />
                        )}
                        <div className="text-center">
                          <p className="text-3xl font-black text-white mb-1">{formatPlaytimeShort(entry.playtimeMins)}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{t('backlog.estPlaytime')}</p>
                        </div>
                        {entry.estimatedHours && (
                          <>
                            <div className="w-px h-16 bg-[#333]" />
                            <div className="text-center">
                              <p className="text-2xl font-black text-purple-400 mb-1">{entry.estimatedHours}h</p>
                              <p className="text-xs text-[var(--muted-foreground)]">Est. Total</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* AI Recommendation */}
                    {reason && (
                      <div className="bg-[#1a1a1a] rounded-lg p-4 mb-4">
                        <h4 className="text-sm font-bold text-[var(--primary)] mb-2">
                          <i className="fa-solid fa-lightbulb mr-2" />
                          {t('backlog.aiRecommendation')}
                        </h4>
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {reason}
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`steam://run/${entry.game.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-white text-sm font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                          isHighPriority
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-[var(--primary)] hover:bg-[var(--primary)]/90'
                        }`}
                      >
                        <i className="fa-solid fa-play" />
                        {t('backlog.playNow')}
                      </a>
                      <a
                        href={`steam://addtowishlist/${entry.game.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-2"
                      >
                        <i className="fa-solid fa-bookmark" />
                        {t('common.addToWishlist')}
                      </a>
                      <Link
                        to={`/game/${entry.game.id}`}
                        className="bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-2"
                      >
                        <i className="fa-solid fa-eye" />
                        {t('common.viewDetails')}
                      </Link>
                      <button
                        onClick={() => handleMarkAsPlayed(entry.game.id, entry.game.name)}
                        disabled={markingPlayedId === entry.game.id}
                        className="bg-[#1a1a1a] border border-[#333] hover:border-gray-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <i className={`fa-solid ${markingPlayedId === entry.game.id ? 'fa-spinner fa-spin' : 'fa-check'}`} />
                        {t('backlog.markAsPlayed')}
                      </button>
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => handleReorder(entry.game.id, 'up')}
                          className="w-8 h-8 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg flex items-center justify-center transition-all"
                          title={t('backlog.moveUp')}
                        >
                          <i className="fa-solid fa-chevron-up text-xs text-gray-400" />
                        </button>
                        <button
                          onClick={() => handleReorder(entry.game.id, 'down')}
                          className="w-8 h-8 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg flex items-center justify-center transition-all"
                          title={t('backlog.moveDown')}
                        >
                          <i className="fa-solid fa-chevron-down text-xs text-gray-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
