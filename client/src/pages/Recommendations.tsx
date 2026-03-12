import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/use-auth';
import { api } from '../lib/api';
import GameGrid from '../components/GameGrid';
import WhyThisGame from '../components/WhyThisGame';
import type { Recommendation } from '../../../shared/types';

export default function Recommendations() {
  const { t } = useTranslation();
  const { user, loading: authLoading, syncStatus } = useAuth();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [explainRec, setExplainRec] = useState<Recommendation | null>(null);
  const [sortBy, setSortBy] = useState('best-match');
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [genreFilter, setGenreFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const prevSyncStatus = useRef(syncStatus);

  const fetchRecs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (priceFilter !== 'all') {
        if (priceFilter === 'under10') params.set('maxPrice', '1000');
        else if (priceFilter === 'under20') params.set('maxPrice', '2000');
        else if (priceFilter === 'under30') params.set('maxPrice', '3000');
        else if (priceFilter === 'over30') params.set('minPrice', '3000');
      }
      if (genreFilter !== 'all') params.set('genres', genreFilter);

      const qs = params.toString();
      const data = await api.get<Recommendation[]>(`/recommendations${qs ? '?' + qs : ''}`);
      setRecs(data);
      setDismissedIds(new Set());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [genreFilter, priceFilter]);

  useEffect(() => {
    if (user) fetchRecs();
  }, [user, fetchRecs]);

  // Refetch when sync transitions to 'synced'
  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      fetchRecs();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, fetchRecs]);

  const handleGenerate = async (onlyDismissed = false) => {
    setGenerating(true);
    try {
      await api.post<{ count: number }>('/recommendations/generate', { onlyDismissed });
      await fetchRecs();
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const handleExplain = (recId: number) => {
    const rec = recs.find((r) => r.id === recId);
    if (rec) setExplainRec(rec);
  };

  const handleDismiss = async (recId: number) => {
    try {
      await api.post(`/recommendations/${recId}/dismiss`);
      setDismissedIds((prev) => new Set(prev).add(recId));
    } catch {
      // ignore
    }
  };

  // Collect unique genres for filter
  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    recs.forEach((r) => r.game.genres.forEach((g) => genres.add(g)));
    return Array.from(genres).sort();
  }, [recs]);

  const hasDismissed = dismissedIds.size > 0;

  const sortedRecs = [...recs].sort((a, b) => {
    switch (sortBy) {
      case 'highest-rated':
        return (b.game.reviewScore ?? 0) - (a.game.reviewScore ?? 0);
      case 'most-popular':
        return (b.game.reviewCount ?? 0) - (a.game.reviewCount ?? 0);
      case 'price-low':
        return (a.game.priceCents ?? 0) - (b.game.priceCents ?? 0);
      case 'price-high':
        return (b.game.priceCents ?? 0) - (a.game.priceCents ?? 0);
      default:
        return b.score - a.score;
    }
  });

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-8 gap-6">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">{t('recommendations.title')}</h1>
          <p className="text-[var(--muted-foreground)]">
            {t('recommendations.subtitle')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => handleGenerate(false)}
            disabled={generating || syncStatus === 'syncing'}
            className="flex items-center justify-center space-x-2 px-6 py-3 bg-[var(--primary)] hover:opacity-80 text-[var(--primary-foreground)] rounded-lg font-semibold transition-all disabled:opacity-50"
          >
            <i className="fa-solid fa-rotate-right" />
            <span>{generating ? t('recommendations.generating') : t('recommendations.regenerate')}</span>
          </button>
          {hasDismissed && (
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating}
              className="flex items-center justify-center space-x-2 px-5 py-3 bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-lg font-semibold transition-all disabled:opacity-50"
            >
              <i className="fa-solid fa-arrows-rotate" />
              <span>{t('recommendations.regenerateDismissed')}</span>
            </button>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-3 bg-[#242424] border border-[#333] rounded-lg focus:outline-none focus:border-[var(--primary)] transition-colors"
          >
            <option value="best-match">{t('recommendations.sortOptions.bestMatch')}</option>
            <option value="highest-rated">{t('recommendations.sortOptions.highestRated')}</option>
            <option value="most-popular">{t('recommendations.sortOptions.mostPopular')}</option>
            <option value="price-low">{t('recommendations.sortOptions.priceLow')}</option>
            <option value="price-high">{t('recommendations.sortOptions.priceHigh')}</option>
          </select>
        </div>
      </div>

      {/* Filters */}
      {recs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="px-4 py-2 bg-[#242424] border border-[#333] rounded-lg text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
          >
            <option value="all">{t('common.allGenres')}</option>
            {allGenres.map((genre) => (
              <option key={genre} value={genre}>{genre}</option>
            ))}
          </select>
          <select
            value={priceFilter}
            onChange={(e) => setPriceFilter(e.target.value)}
            className="px-4 py-2 bg-[#242424] border border-[#333] rounded-lg text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
          >
            <option value="all">{t('recommendations.allPrices')}</option>
            <option value="under10">{t('recommendations.under10')}</option>
            <option value="under20">{t('recommendations.under20')}</option>
            <option value="under30">{t('recommendations.under30')}</option>
            <option value="over30">{t('recommendations.over30')}</option>
          </select>
        </div>
      )}

      {/* AI Status Banner */}
      {recs.length > 0 && !loading && (
        <div className="bg-gradient-to-r from-purple-600/10 to-[var(--primary)]/10 border border-[var(--primary)]/30 rounded-xl p-4 mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[var(--primary)]/20 rounded-full flex items-center justify-center">
              <i className="fa-solid fa-brain text-[var(--primary)]" />
            </div>
            <div>
              <div className="font-semibold">{t('recommendations.aiAnalysisComplete')}</div>
              <div className="text-sm text-[var(--muted-foreground)]">
                {t('recommendations.gamesFoundByDNA', { count: recs.length })}
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center space-x-2 text-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-green-500 font-medium">{t('common.active')}</span>
          </div>
        </div>
      )}

      {loading || syncStatus === 'syncing' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {syncStatus === 'syncing' && (
            <div className="col-span-full text-center py-8 text-[var(--muted-foreground)]">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
                <i className="fa-solid fa-brain text-2xl text-[var(--primary)] animate-pulse" />
              </div>
              <p className="text-sm font-medium text-[var(--foreground)] mb-1">{t('recommendations.syncingRecommendations')}</p>
              <p className="text-xs">{t('recommendations.syncingSubtext')}</p>
            </div>
          )}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#242424] border border-[#333] rounded-2xl overflow-hidden">
              <div className="h-64 bg-[#1a1a1a] animate-pulse" />
              <div className="p-6 flex flex-col gap-3">
                <div className="flex justify-between">
                  <div className="flex-1">
                    <div className="h-6 w-3/4 bg-[#1a1a1a] rounded animate-pulse mb-2" />
                    <div className="h-4 w-1/2 bg-[#1a1a1a] rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-16 bg-[#1a1a1a] rounded animate-pulse" />
                </div>
                <div className="flex gap-2">
                  <div className="h-6 w-14 bg-[#1a1a1a] rounded-full animate-pulse" />
                  <div className="h-6 w-20 bg-[#1a1a1a] rounded animate-pulse" />
                </div>
                <div className="flex gap-2">
                  <div className="h-6 w-20 bg-[#1a1a1a] rounded-full animate-pulse" />
                  <div className="h-6 w-16 bg-[#1a1a1a] rounded-full animate-pulse" />
                  <div className="h-6 w-14 bg-[#1a1a1a] rounded-full animate-pulse" />
                </div>
                <div className="h-10 w-full bg-[#1a1a1a] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedRecs.length > 0 ? (
        <GameGrid
          games={sortedRecs}
          onExplain={handleExplain}
          onDismiss={handleDismiss}
          dismissedIds={dismissedIds}
        />
      ) : (
        <div className="text-center py-20 text-[var(--muted-foreground)]">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
            <i className="fa-solid fa-wand-magic-sparkles text-3xl text-[var(--primary)]" />
          </div>
          <p className="text-xl font-semibold text-[var(--foreground)] mb-2">{t('recommendations.noRecommendations')}</p>
          <p className="text-sm mb-6 max-w-md mx-auto">{t('recommendations.noRecsDescription')}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => handleGenerate(false)}
              disabled={generating}
              className="flex items-center gap-2 px-6 py-3 bg-[var(--primary)] hover:opacity-80 text-[var(--primary-foreground)] rounded-lg font-semibold transition-all disabled:opacity-50"
            >
              <i className="fa-solid fa-rotate-right" />
              <span>{t('recommendations.regenerate')}</span>
            </button>
            <a
              href="/discover"
              className="flex items-center gap-2 px-6 py-3 bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-lg font-semibold transition-all"
            >
              <i className="fa-solid fa-compass" />
              <span>{t('recommendations.goToDiscovery')}</span>
            </a>
          </div>
        </div>
      )}

      <WhyThisGame
        gameId={explainRec?.id ?? 0}
        gameName={explainRec?.game.name ?? ''}
        gameImage={explainRec?.game.headerImage}
        gameDeveloper={explainRec?.game.developers?.[0]}
        matchScore={explainRec?.score}
        open={explainRec !== null}
        onClose={() => setExplainRec(null)}
      />
    </div>
  );
}
