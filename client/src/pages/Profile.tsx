import { useEffect, useRef, useState, useCallback } from 'react';
import { Navigate, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth, type SyncCategory, type CategorySyncState } from '../hooks/use-auth';
import { useProfile, useGamingDNA } from '../hooks/use-profile';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';
import RadarChart from '../components/RadarChart';
import type { ProfileSnapshot, AiSummaryEntry } from '../../../shared/types';

interface GenreGame {
  id: number;
  name: string;
  headerImage: string | null;
  playtimeMins: number;
}

export default function Profile() {
  const { t } = useTranslation();
  const { user, loading: authLoading, syncStatus, syncProgress, triggerSync } = useAuth();
  const { userId } = useDb();
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useProfile();
  const { data: dna, isLoading: dnaLoading, refetch: refetchDna } = useGamingDNA();
  const prevSyncStatus = useRef(syncStatus);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Interactive radar state
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [genreGames, setGenreGames] = useState<GenreGame[]>([]);
  const [loadingGenreGames, setLoadingGenreGames] = useState(false);

  // Profile evolution state
  const [snapshots, setSnapshots] = useState<ProfileSnapshot[]>([]);
  const [showEvolution, setShowEvolution] = useState(false);

  // AI summary history state
  const [summaryHistory, setSummaryHistory] = useState<AiSummaryEntry[]>([]);
  const [showSummaryHistory, setShowSummaryHistory] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [refreshCache, setRefreshCache] = useState(false);
  const [hiddenBars, setHiddenBars] = useState<Record<string, boolean>>({});
  const [fadingBars, setFadingBars] = useState<Record<string, boolean>>({});

  // Auto-hide completed progress bars after 3s
  useEffect(() => {
    const categories = syncProgress?.categories;
    if (!categories) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const key of Object.keys(categories)) {
      if (categories[key]?.status === 'complete' && !hiddenBars[key] && !fadingBars[key]) {
        setFadingBars(prev => ({ ...prev, [key]: true }));
        timers.push(setTimeout(() => {
          setHiddenBars(prev => ({ ...prev, [key]: true }));
          setFadingBars(prev => ({ ...prev, [key]: false }));
        }, 3000));
      }
      if (categories[key]?.status === 'syncing' && hiddenBars[key]) {
        setHiddenBars(prev => ({ ...prev, [key]: false }));
        setFadingBars(prev => ({ ...prev, [key]: false }));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [syncProgress?.categories]);

  const handleExport = useCallback(() => {
    if (!userId) return;
    try {
      const data = queries.exportUserData(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gamedna-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, [userId]);

  const handleImport = useCallback(async (file: File) => {
    if (!userId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = queries.importUserData(userId, data);
      setImportResult(`Imported ${result.importedTags} ignored tags, ${result.importedSwipes} swipes`);
      refetchDna();
    } catch (e) {
      setImportResult('Import failed — invalid file format');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [userId, refetchDna]);

  // Refetch profile data when sync transitions to 'synced'
  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      refetchProfile();
      refetchDna();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, refetchProfile, refetchDna]);

  // Handle genre click on radar chart
  const handleGenreClick = useCallback((genre: string) => {
    if (!userId) return;
    if (selectedGenre === genre) {
      setSelectedGenre(null);
      setGenreGames([]);
      return;
    }
    setSelectedGenre(genre);
    setLoadingGenreGames(true);
    try {
      // Get library games matching this genre
      const lib = queries.getLibrary(userId, { limit: 1000 });
      const matched = lib
        .filter((e) => e.game.genres.some((g) => g.toLowerCase() === genre.toLowerCase()))
        .sort((a, b) => b.playtimeMins - a.playtimeMins)
        .slice(0, 12)
        .map((e) => ({
          id: e.game.id,
          name: e.game.name,
          headerImage: e.game.headerImage,
          playtimeMins: e.playtimeMins,
        }));
      setGenreGames(matched);
    } catch {
      setGenreGames([]);
    } finally {
      setLoadingGenreGames(false);
    }
  }, [userId, selectedGenre]);

  // Fetch profile snapshots
  const handleShowEvolution = useCallback(() => {
    if (!userId) return;
    if (showEvolution) {
      setShowEvolution(false);
      return;
    }
    try {
      const data = queries.getProfileSnapshots(userId);
      setSnapshots(data);
      setShowEvolution(true);
    } catch {
      setSnapshots([]);
      setShowEvolution(true);
    }
  }, [userId, showEvolution]);

  // Fetch AI summary history
  const handleShowSummaryHistory = useCallback(() => {
    if (!userId) return;
    if (showSummaryHistory) {
      setShowSummaryHistory(false);
      return;
    }
    try {
      const data = queries.getAiSummaries(userId);
      setSummaryHistory(data);
      setShowSummaryHistory(true);
    } catch {
      setSummaryHistory([]);
      setShowSummaryHistory(true);
    }
  }, [userId, showSummaryHistory]);

  // Generate new AI summary (placeholder — requires AI integration)
  const handleGenerateSummary = useCallback(() => {
    if (!userId) return;
    setGeneratingSummary(true);
    try {
      // AI summary generation requires Ollama/WebLLM (Phase 3)
      queries.saveAiSummary(userId, 'AI summary generation requires Ollama or WebLLM setup. Configure your AI provider in Settings.');
      refetchDna();
      const data = queries.getAiSummaries(userId);
      setSummaryHistory(data);
    } catch {
      // ignore
    } finally {
      setGeneratingSummary(false);
    }
  }, [userId, refetchDna]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const loading = profileLoading || dnaLoading;

  if (loading) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8 mb-8 animate-pulse">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-[#333]" />
            <div className="flex-1 space-y-3">
              <div className="h-8 w-48 bg-[#333] rounded" />
              <div className="h-5 w-32 bg-[#333] rounded" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#242424] border border-[#333] rounded-xl p-6 animate-pulse">
              <div className="h-10 w-20 bg-[#333] rounded mb-2" />
              <div className="h-4 w-16 bg-[#333] rounded" />
            </div>
          ))}
        </div>
        <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8 mb-8 animate-pulse">
          <div className="h-[300px] bg-[#333] rounded" />
        </div>
      </div>
    );
  }

  const totalSwipes = dna
    ? dna.swipeStats.yes + dna.swipeStats.no + dna.swipeStats.maybe
    : 0;

  const syncCategories: { key: SyncCategory; label: string; icon: string; iconColor: string; bgColor: string }[] = [
    { key: 'library', label: 'Library', icon: 'fa-gamepad', iconColor: 'text-blue-500', bgColor: 'bg-blue-500/20' },
    { key: 'wishlist', label: 'Wishlist', icon: 'fa-heart', iconColor: 'text-pink-500', bgColor: 'bg-pink-500/20' },
    { key: 'backlog', label: 'Backlog', icon: 'fa-database', iconColor: 'text-amber-500', bgColor: 'bg-amber-500/20' },
    { key: 'cache', label: 'Refresh Cache', icon: 'fa-rotate', iconColor: 'text-cyan-500', bgColor: 'bg-cyan-500/20' },
    { key: 'tags', label: 'Tags', icon: 'fa-tags', iconColor: 'text-purple-500', bgColor: 'bg-purple-500/20' },
  ];

  const anyCategorySyncing = syncCategories.some(
    ({ key }) => syncProgress?.categories?.[key]?.status === 'syncing'
  );

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area (Left 2/3) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Profile Header Card */}
          <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName ?? 'Avatar'}
                  className="w-24 h-24 lg:w-32 lg:h-32 rounded-full border-4 border-[var(--primary)]"
                />
              )}
              <div className="flex-1">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
                  <h1 className="text-3xl lg:text-4xl font-black text-white">
                    {user.displayName ?? 'Gamer'}
                  </h1>
                  <div className="flex items-center space-x-2">
                    <div className="w-10 h-10 bg-[var(--primary)]/20 rounded-lg flex items-center justify-center">
                      <i className="fa-brands fa-steam text-[var(--primary)] text-xl" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">{t('profile.steamId')}</p>
                      <p className="text-sm font-bold">{user.steamId}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <button
                    onClick={() => triggerSync()}
                    disabled={syncStatus === 'syncing'}
                    className="flex items-center space-x-2 px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                  >
                    <i className="fa-solid fa-arrows-rotate" />
                    <span>{syncStatus === 'syncing' ? t('common.syncing') : t('common.syncLibrary')}</span>
                  </button>
                  <button className="flex items-center space-x-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all">
                    <i className="fa-solid fa-share-nodes" />
                    <span>{t('profile.shareProfile')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <i className="fa-solid fa-gamepad text-blue-500 text-xl" />
                </div>
                <span className="text-4xl font-black text-white">{dna?.totalGames ?? 0}</span>
              </div>
              <h3 className="text-sm text-gray-400 mb-1">{t('profile.gamesOwned')}</h3>
              <p className="text-xs text-gray-500">{t('profile.inSteamLibrary')}</p>
            </div>
            <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <i className="fa-solid fa-clock text-purple-500 text-xl" />
                </div>
                <span className="text-4xl font-black text-white">{dna?.totalPlaytimeHours.toLocaleString() ?? 0}</span>
              </div>
              <h3 className="text-sm text-gray-400 mb-1">{t('profile.hoursPlayed')}</h3>
              <p className="text-xs text-gray-500">{t('profile.totalPlaytime')}</p>
            </div>
            <div className="bg-[#242424] border border-[#333] rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <i className="fa-solid fa-hand-pointer text-green-500 text-xl" />
                </div>
                <span className="text-4xl font-black text-white">{totalSwipes}</span>
              </div>
              <h3 className="text-sm text-gray-400 mb-1">{t('profile.totalSwipes')}</h3>
              <p className="text-xs text-gray-500">{t('profile.discoveryActivity')}</p>
            </div>
          </div>

          {/* Radar Chart Section */}
          {dna && dna.topGenres.length > 0 && (
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{t('profile.gamingPreferenceProfile')}</h2>
                  <p className="text-gray-400 text-sm">{t('profile.gamingPreferenceSubtitle')}</p>
                  <p className="text-xs text-[var(--primary)] mt-1">{t('profile.clickGenreHint')}</p>
                </div>
                <div className="flex items-center gap-3 mt-4 lg:mt-0">
                  <button
                    onClick={handleShowEvolution}
                    className="flex items-center space-x-2 px-4 py-3 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
                  >
                    <i className="fa-solid fa-chart-line" />
                    <span>{t('profile.profileEvolution')}</span>
                  </button>
                  <button
                    onClick={() => { refetchDna(); refetchProfile(); }}
                    className="flex items-center space-x-2 px-4 py-3 bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
                  >
                    <i className="fa-solid fa-rotate" />
                    <span>{t('profile.refreshProfile')}</span>
                  </button>
                </div>
              </div>
              <div className="max-w-lg mx-auto">
                <RadarChart data={dna.topGenres} onGenreClick={handleGenreClick} />
              </div>

              {/* Genre games popup */}
              {selectedGenre && (
                <div className="mt-6 bg-[#1a1a1a] rounded-xl p-5 border border-[var(--primary)]/30">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">
                      {t('profile.gamesInGenre', { genre: selectedGenre })}
                    </h3>
                    <button
                      onClick={() => { setSelectedGenre(null); setGenreGames([]); }}
                      className="text-gray-400 hover:text-white"
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                  {loadingGenreGames ? (
                    <div className="flex gap-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="w-32 h-20 bg-[#333] rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : genreGames.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {genreGames.map((game) => (
                        <Link
                          key={game.id}
                          to={`/game/${game.id}`}
                          className="bg-[#242424] rounded-lg overflow-hidden hover:ring-1 hover:ring-[var(--primary)] transition-all"
                        >
                          {game.headerImage ? (
                            <img src={game.headerImage} alt={game.name} className="w-full aspect-video object-cover" />
                          ) : (
                            <div className="w-full aspect-video bg-[#333] flex items-center justify-center">
                              <i className="fa-solid fa-gamepad text-gray-500" />
                            </div>
                          )}
                          <div className="p-2">
                            <p className="text-xs font-semibold truncate">{game.name}</p>
                            <p className="text-[10px] text-gray-500">
                              {game.playtimeMins > 0 ? `${Math.round(game.playtimeMins / 60)}h played` : 'Never played'}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No games found for this genre.</p>
                  )}
                </div>
              )}

              {/* Profile Evolution */}
              {showEvolution && (
                <div className="mt-6 bg-[#1a1a1a] rounded-xl p-5 border border-purple-500/30">
                  <h3 className="text-lg font-bold text-white mb-2">{t('profile.profileEvolution')}</h3>
                  <p className="text-sm text-gray-400 mb-4">{t('profile.profileEvolutionSubtitle')}</p>
                  {snapshots.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('profile.noSnapshots')}</p>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {snapshots.map((snapshot) => (
                        <div key={snapshot.id} className="bg-[#242424] rounded-lg p-4 flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-xs text-gray-400 mb-1">
                              {new Date((snapshot.createdAt ?? 0) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {snapshot.topGenres.slice(0, 5).map((g) => (
                                <span key={g.name} className="px-2 py-0.5 bg-[var(--primary)]/20 text-[var(--primary)] rounded text-[10px] font-bold">
                                  {g.name}: {g.score.toFixed(2)}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right ml-4 shrink-0">
                            <p className="text-sm font-bold">{snapshot.totalGames} games</p>
                            <p className="text-xs text-gray-500">{snapshot.totalPlaytimeHours}h</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tag Filters Link */}
          {dna && dna.allTags.length > 0 && (
            <Link
              to="/filters"
              className="block bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-2xl p-6 lg:p-8 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-[var(--primary)]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fa-solid fa-sliders text-[var(--primary)] text-2xl" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white mb-1">{t('profile.tagPreferences')}</h2>
                    <p className="text-gray-400 text-sm">{t('profile.tagPreferencesSubtitle')}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-[var(--primary)] font-medium">
                        {dna.allTags.filter((t) => !t.blacklisted).length} active
                      </span>
                      <span className="text-xs text-gray-500">
                        {dna.allTags.filter((t) => t.blacklisted).length} blacklisted
                      </span>
                    </div>
                  </div>
                </div>
                <i className="fa-solid fa-arrow-right text-gray-500 group-hover:text-[var(--primary)] transition-colors text-lg" />
              </div>
            </Link>
          )}

          {/* AI Summary */}
          {dna?.aiSummary && (
            <div className="bg-gradient-to-br from-[var(--primary)]/10 to-purple-500/10 border border-[var(--primary)]/30 rounded-2xl p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
                <div className="flex items-start space-x-4">
                  <div className="w-14 h-14 bg-[var(--primary)]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fa-solid fa-brain text-[var(--primary)] text-2xl" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">{t('profile.aiGamingSummary')}</h2>
                    <p className="text-gray-400 text-sm">{t('profile.aiGamingSummarySubtitle')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleShowSummaryHistory}
                    className="flex items-center space-x-2 px-4 py-3 bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all"
                  >
                    <i className="fa-solid fa-clock-rotate-left" />
                    <span>{t('profile.summaryHistory')}</span>
                  </button>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={generatingSummary}
                    className="flex items-center space-x-2 px-4 py-3 bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    <i className={`fa-solid ${generatingSummary ? 'fa-spinner fa-spin' : 'fa-rotate'}`} />
                    <span>{generatingSummary ? t('profile.generatingSummary') : t('profile.generateNewSummary')}</span>
                  </button>
                </div>
              </div>
              <div className="bg-[#242424]/50 rounded-xl p-6">
                <p className="text-gray-300 leading-relaxed">
                  {dna.aiSummary.split(/(\b(?:RPG|FPS|action|strategy|indie|simulation|adventure|puzzle|multiplayer|singleplayer|co-op|competitive|casual|hardcore)\b)/gi).map((part, i) =>
                    i % 2 === 1 ? (
                      <span key={i} className="text-[var(--primary)] font-bold">{part}</span>
                    ) : (
                      part
                    )
                  )}
                </p>
              </div>

              {/* Summary History */}
              {showSummaryHistory && (
                <div className="mt-6 bg-[#1a1a1a] rounded-xl p-5 border border-[var(--primary)]/20">
                  <h3 className="text-lg font-bold text-white mb-4">{t('profile.previousSummaries')}</h3>
                  {summaryHistory.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('profile.noSummaryHistory')}</p>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {summaryHistory.map((entry) => (
                        <div key={entry.id} className="bg-[#242424] rounded-lg p-4">
                          <p className="text-xs text-gray-400 mb-2">
                            {new Date((entry.createdAt ?? 0) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                          <p className="text-sm text-gray-300 leading-relaxed">{entry.summary}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar (Right 1/3) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Sync Library */}
          <div className="bg-[#242424] border border-[#333] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">{t('profile.syncLibraryCard')}</h3>
              <button
                onClick={() => {
                  if (refreshCache) {
                    triggerSync(['library', 'wishlist', 'backlog', 'cache', 'tags']);
                  } else {
                    triggerSync();
                  }
                }}
                disabled={anyCategorySyncing}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                <i className={`fa-solid fa-arrows-rotate text-xs ${anyCategorySyncing ? 'animate-spin' : ''}`} />
                <span>{anyCategorySyncing ? t('common.syncing') : t('profile.syncAll', 'Sync All')}</span>
              </button>
            </div>

            {/* Refresh Cache toggle */}
            <div className="flex items-center justify-between mb-4 bg-[#1a1a1a] rounded-xl px-4 py-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i className="fa-solid fa-rotate text-cyan-500 text-xs" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white">Refresh game cache</h4>
                  <p className="text-[10px] text-gray-500">Re-fetch all game data on Sync All</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={refreshCache}
                  onChange={(e) => setRefreshCache(e.target.checked)}
                />
                <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500" />
              </label>
            </div>

            <div className="space-y-3">
              {syncCategories.map(({ key, label, icon, iconColor, bgColor }) => {
                const catState = syncProgress?.categories?.[key] ?? { status: 'idle' as const, progress: 0, detail: '' };
                const isSyncing = catState.status === 'syncing';
                const isComplete = catState.status === 'complete';
                const isError = catState.status === 'error';

                return (
                  <div key={key} className="bg-[#1a1a1a] rounded-xl p-4">
                    <div className={`flex items-center justify-between${(isSyncing || isError || (isComplete && !hiddenBars[key])) && !fadingBars[key] ? ' mb-2' : ''}`}>
                      <div className="flex items-center space-x-3">
                        <div className={`w-9 h-9 ${bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          <i className={`fa-solid ${icon} ${iconColor} text-sm`} />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white">{label}</h4>
                          {isSyncing && catState.detail && (
                            <p className="text-xs text-gray-400 mt-0.5">{catState.detail}</p>
                          )}
                          {isComplete && (
                            <p className="text-xs text-green-400 mt-0.5">
                              <i className="fa-solid fa-check mr-1" />Complete
                            </p>
                          )}
                          {isError && (
                            <p className="text-xs text-red-400 mt-0.5">
                              <i className="fa-solid fa-xmark mr-1" />{catState.detail || 'Failed'}
                            </p>
                          )}
                        </div>
                      </div>
                      {!isSyncing && (
                        <button
                          onClick={() => triggerSync([key])}
                          disabled={anyCategorySyncing}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#242424] border border-[#333] hover:border-[var(--primary)] transition-all disabled:opacity-30"
                          title={`Sync ${label}`}
                        >
                          <i className="fa-solid fa-arrows-rotate text-xs text-gray-400" />
                        </button>
                      )}
                      {isSyncing && (
                        <div className="w-8 h-8 flex items-center justify-center">
                          <i className="fa-solid fa-arrows-rotate text-xs text-[var(--primary)] animate-spin" />
                        </div>
                      )}
                    </div>
                    {/* Progress bar - hidden when idle, fades out after completion */}
                    {(isSyncing || isError || (isComplete && !hiddenBars[key])) && (
                      <div
                        className={`h-1.5 bg-[#333] rounded-full overflow-hidden mt-2 transition-all duration-500 ${
                          fadingBars[key] ? 'opacity-0 max-h-0 mt-0' : 'opacity-100 max-h-4'
                        }`}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isError ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-[var(--primary)]'
                          }`}
                          style={{ width: `${isComplete ? 100 : catState.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>

          {/* Data Actions */}
          <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 space-y-3">
            <h3 className="text-lg font-bold text-white mb-5">{t('profile.dataActions', 'Data')}</h3>
              <button
                onClick={handleExport}
                className="w-full bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-xl p-3 flex items-center space-x-3 transition-all group"
              >
                <div className="w-9 h-9 bg-green-500/20 group-hover:bg-green-500/30 rounded-lg flex items-center justify-center flex-shrink-0 transition-all">
                  <i className="fa-solid fa-download text-green-500 text-sm" />
                </div>
                <div className="text-left flex-1">
                  <h4 className="font-bold text-sm">{t('profile.exportData')}</h4>
                  <p className="text-xs text-gray-400">{t('profile.downloadAsJSON')}</p>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="w-full bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-xl p-3 flex items-center space-x-3 transition-all group disabled:opacity-50"
              >
                <div className="w-9 h-9 bg-purple-500/20 group-hover:bg-purple-500/30 rounded-lg flex items-center justify-center flex-shrink-0 transition-all">
                  <i className="fa-solid fa-upload text-purple-500 text-sm" />
                </div>
                <div className="text-left flex-1">
                  <h4 className="font-bold text-sm">{importing ? t('profile.importing') : t('profile.importData')}</h4>
                  <p className="text-xs text-gray-400">{t('profile.restorePreferences')}</p>
                </div>
              </button>

            {importResult && (
              <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-3">
                <p className="text-xs text-gray-300">{importResult}</p>
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="bg-[#242424] border border-[#333] rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-6">{t('profile.quickLinks', 'Quick Links')}</h3>
            <div className="space-y-3">
              <Link
                to="/history"
                className="block bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-xl p-4 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-[var(--primary)]/20 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-clock-rotate-left text-[var(--primary)]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm mb-0.5">{t('profile.viewHistory')}</h4>
                      <p className="text-xs text-gray-400">{t('profile.totalSwipesCount', { count: totalSwipes })}</p>
                    </div>
                  </div>
                  <i className="fa-solid fa-arrow-right text-gray-500 group-hover:text-[var(--primary)] transition-colors" />
                </div>
              </Link>

              <Link
                to="/backlog"
                className="block bg-[#1a1a1a] border border-[#333] hover:border-[var(--primary)] rounded-xl p-4 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-[var(--primary)]/20 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-list-check text-[var(--primary)]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm mb-0.5">{t('profile.manageBacklog')}</h4>
                      <p className="text-xs text-gray-400">{t('profile.gamesInLibrary', { count: dna?.totalGames ?? 0 })}</p>
                    </div>
                  </div>
                  <i className="fa-solid fa-arrow-right text-gray-500 group-hover:text-[var(--primary)] transition-colors" />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
        }}
      />
    </div>
  );
}
