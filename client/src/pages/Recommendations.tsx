import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import * as queries from '../db/queries';
import { generateRecommendations } from '../services/recommendation';
import { whyNotThisGame, type WhyNotResult } from '../services/why-not';
import GameGrid from '../components/GameGrid';
import { Select } from '../components/Select';
import WhyThisGame from '../components/WhyThisGame';
import type { Recommendation } from '../../../shared/types';

export default function Recommendations() {
  const { t } = useTranslation();
  const { user, loading: authLoading, syncStatus } = useAuth();
  const { userId } = useDb();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [explainRec, setExplainRec] = useState<Recommendation | null>(null);
  const [sortBy, setSortBy] = useState('best-match');
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [genreFilter, setGenreFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const prevSyncStatus = useRef(syncStatus);
  const [whyNotQuery, setWhyNotQuery] = useState('');
  const [whyNotResult, setWhyNotResult] = useState<WhyNotResult | null>(null);

  const fetchRecs = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    try {
      const opts: { minPrice?: number; maxPrice?: number; genres?: string[] } = {};
      if (priceFilter === 'under10') opts.maxPrice = 1000;
      else if (priceFilter === 'under20') opts.maxPrice = 2000;
      else if (priceFilter === 'under30') opts.maxPrice = 3000;
      else if (priceFilter === 'over30') opts.minPrice = 3000;
      if (genreFilter !== 'all') opts.genres = [genreFilter];

      const data = queries.getRecommendations(userId, opts);
      setRecs(data.map((r) => {
        let scoreBreakdown = null;
        if (r.scoreBreakdown) {
          try { scoreBreakdown = JSON.parse(r.scoreBreakdown); } catch { /* ignore */ }
        }
        return {
          id: r.id,
          game: r.game,
          score: r.score,
          aiExplanation: r.aiExplanation,
          generatedAt: r.generatedAt,
          source: r.source as 'ai' | 'heuristic',
          scoreBreakdown,
          heuristicScore: r.heuristicScore,
        };
      }));
      setDismissedIds(new Set());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [userId, genreFilter, priceFilter]);

  useEffect(() => {
    if (userId) fetchRecs();
  }, [userId, fetchRecs]);

  useEffect(() => {
    if (prevSyncStatus.current === 'syncing' && syncStatus === 'synced') {
      fetchRecs();
    }
    prevSyncStatus.current = syncStatus;
  }, [syncStatus, fetchRecs]);

  const handleGenerate = async (onlyDismissed = false) => {
    if (!userId) return;
    setGenerating(true);
    try {
      await generateRecommendations(userId, onlyDismissed);
      fetchRecs();
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

  const handleExplanationSaved = (recId: number, explanation: string) => {
    setRecs((prev) => prev.map((r) => r.id === recId ? { ...r, aiExplanation: explanation } : r));
    if (explainRec?.id === recId) {
      setExplainRec((prev) => prev ? { ...prev, aiExplanation: explanation } : prev);
    }
  };

  const handleDismiss = (recId: number) => {
    if (!userId) return;
    queries.dismissRecommendation(recId, userId);
    setDismissedIds((prev) => new Set(prev).add(recId));
  };

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
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-8 gap-6">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">{t('recommendations.title')}</h1>
          <p className="text-[var(--muted-foreground)]">{t('recommendations.subtitle')}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => handleGenerate(false)}
            disabled={generating || syncStatus === 'syncing'}
            className="flex items-center justify-center space-x-2 px-6 py-2.5 bg-[var(--primary)] hover:opacity-80 text-[var(--primary-foreground)] rounded-lg font-semibold transition-all disabled:opacity-50"
          >
            <i className="fa-solid fa-rotate-right" />
            <span>{generating ? t('recommendations.generating') : t('recommendations.regenerate')}</span>
          </button>
          {hasDismissed && (
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating}
              className="flex items-center justify-center space-x-2 px-5 py-2.5 bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-lg font-semibold transition-all disabled:opacity-50"
            >
              <i className="fa-solid fa-arrows-rotate" />
              <span>{t('recommendations.regenerateDismissed')}</span>
            </button>
          )}
          <Select
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'best-match', label: t('recommendations.sortOptions.bestMatch') },
              { value: 'highest-rated', label: t('recommendations.sortOptions.highestRated') },
              { value: 'most-popular', label: t('recommendations.sortOptions.mostPopular') },
              { value: 'price-low', label: t('recommendations.sortOptions.priceLow') },
              { value: 'price-high', label: t('recommendations.sortOptions.priceHigh') },
            ]}
          />
        </div>
      </div>

      {recs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Select
            value={genreFilter}
            onChange={setGenreFilter}
            size="sm"
            options={[
              { value: 'all', label: t('common.allGenres') },
              ...allGenres.map((genre) => ({ value: genre, label: genre })),
            ]}
          />
          <Select
            value={priceFilter}
            onChange={setPriceFilter}
            size="sm"
            options={[
              { value: 'all', label: t('recommendations.allPrices') },
              { value: 'under10', label: t('recommendations.under10') },
              { value: 'under20', label: t('recommendations.under20') },
              { value: 'under30', label: t('recommendations.under30') },
              { value: 'over30', label: t('recommendations.over30') },
            ]}
          />

          {/* Why Not This Game? search */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Why not this game? (App ID)"
                value={whyNotQuery}
                onChange={(e) => {
                  setWhyNotQuery(e.target.value);
                  setWhyNotResult(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && whyNotQuery.trim() && userId) {
                    const appid = parseInt(whyNotQuery.trim());
                    if (!isNaN(appid)) {
                      setWhyNotResult(whyNotThisGame(userId, appid));
                    }
                  }
                }}
                className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-sm w-48 focus:border-[var(--primary)] outline-none transition-colors"
              />
              <i className="fa-solid fa-magnifying-glass absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs" />
            </div>
          </div>
        </div>
      )}

      {/* Why Not result */}
      {whyNotResult && (
        <div className="bg-[#242424] border border-[#333] rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <i className="fa-solid fa-circle-question text-amber-400" />
              {whyNotResult.found ? `Why not "${whyNotResult.gameName}"?` : 'Game not found'}
            </h3>
            <button onClick={() => setWhyNotResult(null)} className="text-gray-500 hover:text-white text-xs">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <ul className="space-y-1">
            {whyNotResult.reasons.map((r, i) => (
              <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                <i className="fa-solid fa-circle text-[4px] mt-2 shrink-0 text-gray-500" />
                {r}
              </li>
            ))}
          </ul>
          {whyNotResult.score != null && (
            <p className="text-xs text-gray-500 mt-2">Match score: {Math.round(whyNotResult.score * 100)}%</p>
          )}
        </div>
      )}

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
        recId={explainRec?.id}
        gameId={explainRec?.game.id ?? 0}
        gameName={explainRec?.game.name ?? ''}
        gameImage={explainRec?.game.headerImage}
        gameDeveloper={explainRec?.game.developers?.[0]}
        matchScore={explainRec?.score}
        aiExplanation={explainRec?.aiExplanation}
        open={explainRec !== null}
        onClose={() => setExplainRec(null)}
        onExplanationSaved={handleExplanationSaved}
      />
    </div>
  );
}
