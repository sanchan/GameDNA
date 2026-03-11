import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/use-auth';
import { useDiscovery } from '../hooks/use-discovery';
import { useGamingDNA } from '../hooks/use-profile';
import { api } from '../lib/api';
import GameCard from '../components/GameCard';
import SwipeControls from '../components/SwipeControls';
import FilterPanel, { useFilterCount } from '../components/FilterPanel';
import type { Game, SwipeDecision } from '../../../shared/types';

interface HistoryItem {
  id: number;
  game: Game;
  decision: SwipeDecision;
  swipedAt: number;
}

interface HistoryResponse {
  items: HistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export default function Discovery() {
  const { t } = useTranslation();
  const { user, loading: authLoading, syncStatus } = useAuth();
  const { currentGame, currentScore, swipe, isLoading, filters, setFilters, animatingOut, refetchQueue, swipedCount, totalLoaded } = useDiscovery();
  const [loadingMore, setLoadingMore] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterCount = useFilterCount(filters);

  // Fetch swipe stats from GamingDNA
  const { data: dna } = useGamingDNA();
  const swipeStats = dna?.swipeStats;

  // Fetch recent swipes
  const { data: recentSwipesData } = useQuery({
    queryKey: ['recent-swipes'],
    queryFn: () => api.get<HistoryResponse>('/history?limit=8'),
    staleTime: 30_000,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!currentGame) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        swipe('no');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        swipe('maybe');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        swipe('yes');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentGame, swipe]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const result = await api.post<{ added: number }>('/discovery/load-more');
      if (result.added > 0) {
        refetchQueue();
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const animationClass = animatingOut
    ? animatingOut === 'left'
      ? 'discovery-swipe-out-left'
      : animatingOut === 'right'
        ? 'discovery-swipe-out-right'
        : 'discovery-swipe-out-down'
    : 'discovery-swipe-in';

  const recentSwipes = recentSwipesData?.items ?? [];

  const decisionBadge = (decision: SwipeDecision) => {
    switch (decision) {
      case 'yes':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">{t('discovery.liked')}</span>;
      case 'no':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">{t('discovery.passed')}</span>;
      case 'maybe':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">{t('discovery.maybe')}</span>;
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-5rem)]">
      {/* Sidebar filter panel - desktop */}
      <FilterPanel
        filters={filters}
        onApply={setFilters}
        className="hidden lg:block h-screen sticky top-20"
      />

      {/* Mobile filter overlay */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85vw]">
            <FilterPanel
              filters={filters}
              onApply={(f) => {
                setFilters(f);
                setMobileFiltersOpen(false);
              }}
              className="h-full"
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-2">{t('discovery.title')}</h1>
            <p className="text-gray-400">{t('discovery.subtitle')}</p>
          </div>
          {/* Mobile filter button */}
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#242424] border border-[#333] rounded-lg text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors lg:hidden"
          >
            <i className="fa-solid fa-filter" />
            <span>{t('common.filters')}</span>
            {filterCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-[var(--primary)] text-[#1a1a1a] rounded-full">
                {filterCount}
              </span>
            )}
          </button>
        </div>

        {/* Card container */}
        <div className="max-w-md mx-auto">
          {isLoading || loadingMore ? (
            /* Skeleton card */
            <div className="bg-[#242424] border border-[#333] rounded-2xl overflow-hidden">
              <div className="h-64 bg-[#1a1a1a] animate-pulse" />
              <div className="p-6 flex flex-col gap-3">
                <div className="h-6 w-3/4 bg-[#1a1a1a] rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-[#1a1a1a] rounded animate-pulse" />
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
              {loadingMore && (
                <div className="p-4 pt-0 text-center">
                  <p className="text-sm text-[var(--muted-foreground)]">{t('discovery.fetchingGames')}</p>
                </div>
              )}
            </div>
          ) : currentGame ? (
            <div key={currentGame.id} className={animationClass}>
              <GameCard game={currentGame} score={currentScore ? currentScore * 100 : null} />
            </div>
          ) : (
            <div className="flex items-center justify-center text-center text-[var(--muted-foreground)] py-20">
              {syncStatus === 'syncing' ? (
                <div>
                  <p className="text-lg mb-2">{t('discovery.settingUpQueue')}</p>
                  <p className="text-sm">{t('discovery.syncingLibrary')}</p>
                  <div className="mt-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
                </div>
              ) : (
                <div>
                  <p className="text-lg mb-2">{t('discovery.noMoreGames')}</p>
                  <p className="text-sm mb-4">{t('discovery.loadMorePrompt')}</p>
                  <button
                    onClick={handleLoadMore}
                    className="bg-[var(--primary)] text-[var(--primary-foreground)] px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    {t('discovery.loadMoreButton')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Swipe buttons — outside the card */}
          {currentGame && !isLoading && (
            <SwipeControls onSwipe={swipe} />
          )}
        </div>

        {/* Discovery Stats */}
        <div className="max-w-4xl mx-auto mt-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-[var(--primary)] mb-2">{swipeStats ? (swipeStats.yes + swipeStats.no + swipeStats.maybe) : swipedCount}</div>
              <div className="text-sm text-gray-400">{t('discovery.gamesSwiped')}</div>
            </div>
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-green-500 mb-2">{swipeStats?.yes ?? '--'}</div>
              <div className="text-sm text-gray-400">{t('discovery.liked')}</div>
            </div>
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-yellow-500 mb-2">{swipeStats?.maybe ?? '--'}</div>
              <div className="text-sm text-gray-400">{t('discovery.maybeLater')}</div>
            </div>
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-red-500 mb-2">{swipeStats?.no ?? '--'}</div>
              <div className="text-sm text-gray-400">{t('discovery.passed')}</div>
            </div>
          </div>
        </div>

        {/* Recent Swipes */}
        {recentSwipes.length > 0 && (
          <div className="max-w-4xl mx-auto mt-12">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">{t('discovery.recentSwipes')}</h3>
              <a
                href="/history"
                className="text-[var(--primary)] hover:text-[var(--primary)]/80 font-semibold text-sm flex items-center space-x-2"
              >
                <span>{t('discovery.viewAll')}</span>
                <i className="fa-solid fa-arrow-right" />
              </a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {recentSwipes.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#242424] border border-[#333] rounded-xl overflow-hidden hover:border-[#444] transition-colors"
                >
                  {item.game.headerImage && (
                    <img
                      src={item.game.headerImage}
                      alt={item.game.name}
                      className="w-full aspect-video object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="p-3">
                    <h4 className="text-sm font-semibold truncate mb-2">{item.game.name}</h4>
                    {decisionBadge(item.decision)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pro Tip Banner */}
        <div className="max-w-4xl mx-auto mt-12 bg-gradient-to-br from-purple-600/10 to-[var(--primary)]/10 border border-[var(--primary)]/30 rounded-2xl p-8">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 bg-[var(--primary)]/20 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-lightbulb text-[var(--primary)] text-xl" />
            </div>
            <div>
              <h4 className="text-xl font-bold mb-2">{t('discovery.proTip')}</h4>
              <p className="text-gray-400 leading-relaxed">
                {t('discovery.proTipText')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .discovery-swipe-in {
          animation: discoveryFadeIn 0.25s ease-out;
        }
        .discovery-swipe-out-left {
          animation: discoverySlideLeft 0.3s ease-in forwards;
        }
        .discovery-swipe-out-right {
          animation: discoverySlideRight 0.3s ease-in forwards;
        }
        .discovery-swipe-out-down {
          animation: discoverySlideDown 0.3s ease-in forwards;
        }
        @keyframes discoveryFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes discoverySlideLeft {
          to { opacity: 0; transform: translateX(-120%) rotate(-8deg); }
        }
        @keyframes discoverySlideRight {
          to { opacity: 0; transform: translateX(120%) rotate(8deg); }
        }
        @keyframes discoverySlideDown {
          to { opacity: 0; transform: translateY(60px) scale(0.9); }
        }
      `}</style>
    </div>
  );
}
