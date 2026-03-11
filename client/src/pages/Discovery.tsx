import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/use-auth';
import { useDiscovery } from '../hooks/use-discovery';
import { useGamingDNA } from '../hooks/use-profile';
import { api } from '../lib/api';
import GameCard from '../components/GameCard';
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
  const { user, loading: authLoading, syncStatus } = useAuth();
  const { currentGame, swipe, isLoading, filters, setFilters, animatingOut, refetchQueue, swipedCount, totalLoaded } = useDiscovery();
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
      ? 'swipe-out-left'
      : animatingOut === 'right'
        ? 'swipe-out-right'
        : 'swipe-out-down'
    : 'swipe-in';

  const recentSwipes = recentSwipesData?.items ?? [];

  const decisionBadge = (decision: SwipeDecision) => {
    switch (decision) {
      case 'yes':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Liked</span>;
      case 'no':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Passed</span>;
      case 'maybe':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">Maybe</span>;
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-5rem)]">
      {/* Sidebar filter panel - desktop */}
      <FilterPanel
        filters={filters}
        onApply={setFilters}
        className="hidden lg:block w-80 h-screen sticky top-20"
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
            <h1 className="text-3xl lg:text-4xl font-bold mb-2">Discover Games</h1>
            <p className="text-gray-400">Swipe through personalized recommendations</p>
          </div>
          {/* Mobile filter button */}
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#242424] border border-[#333] rounded-lg text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors lg:hidden"
          >
            <i className="fa-solid fa-filter" />
            <span>Filters</span>
            {filterCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-[var(--primary)] text-[#1a1a1a] rounded-full">
                {filterCount}
              </span>
            )}
          </button>
        </div>

        {/* Card container */}
        <div className="max-w-md mx-auto">
          <div className="relative h-[600px]">
            {isLoading || loadingMore ? (
              /* Skeleton card */
              <div className="absolute inset-0 bg-[#242424] border border-[#333] rounded-3xl overflow-hidden shadow-lg">
                <div className="w-full h-[360px] bg-[var(--muted)] animate-pulse" />
                <div className="p-6 flex flex-col gap-3">
                  <div className="h-6 w-3/4 bg-[var(--muted)] rounded animate-pulse" />
                  <div className="flex gap-1.5">
                    <div className="h-5 w-16 bg-[var(--muted)] rounded-full animate-pulse" />
                    <div className="h-5 w-12 bg-[var(--muted)] rounded-full animate-pulse" />
                    <div className="h-5 w-20 bg-[var(--muted)] rounded-full animate-pulse" />
                  </div>
                  <div className="h-4 w-1/2 bg-[var(--muted)] rounded animate-pulse" />
                  <div className="h-12 w-full bg-[var(--muted)] rounded animate-pulse" />
                </div>
                {loadingMore && (
                  <div className="p-4 pt-0 text-center">
                    <p className="text-sm text-[var(--muted-foreground)]">Fetching new games from Steam...</p>
                  </div>
                )}
              </div>
            ) : currentGame ? (
              <>
                {/* Back card */}
                <div className="absolute inset-0 bg-[#242424]/30 border border-[#333] rounded-3xl transform translate-y-8 scale-90 pointer-events-none" />
                {/* Middle card */}
                <div className="absolute inset-0 bg-[#242424]/50 border border-[#333] rounded-3xl transform translate-y-4 scale-95 pointer-events-none" />
                {/* Main card */}
                <div key={currentGame.id} className={`absolute inset-0 ${animationClass}`}>
                  <GameCard game={currentGame} onSwipe={swipe} onInfo={() => window.open(`/game/${currentGame.id}`, '_blank')} />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center text-[var(--muted-foreground)]">
                {syncStatus === 'syncing' ? (
                  <div>
                    <p className="text-lg mb-2">Setting up your discovery queue...</p>
                    <p className="text-sm">Syncing your Steam library and loading games. This may take a moment.</p>
                    <div className="mt-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
                  </div>
                ) : (
                  <div>
                    <p className="text-lg mb-2">No more games to discover!</p>
                    <p className="text-sm mb-4">Want to load more games from Steam?</p>
                    <button
                      onClick={handleLoadMore}
                      className="bg-[var(--primary)] text-[var(--primary-foreground)] px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      Load More Games
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Discovery Stats */}
        <div className="max-w-4xl mx-auto mt-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-[var(--primary)] mb-2">{swipeStats ? (swipeStats.yes + swipeStats.no + swipeStats.maybe) : swipedCount}</div>
              <div className="text-sm text-gray-400">Games Swiped</div>
            </div>
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-green-500 mb-2">{swipeStats?.yes ?? '--'}</div>
              <div className="text-sm text-gray-400">Liked</div>
            </div>
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-yellow-500 mb-2">{swipeStats?.maybe ?? '--'}</div>
              <div className="text-sm text-gray-400">Maybe Later</div>
            </div>
            <div className="bg-[#242424] border border-[#333] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-red-500 mb-2">{swipeStats?.no ?? '--'}</div>
              <div className="text-sm text-gray-400">Passed</div>
            </div>
          </div>
        </div>

        {/* Recent Swipes */}
        {recentSwipes.length > 0 && (
          <div className="max-w-4xl mx-auto mt-12">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">Recent Swipes</h3>
              <a
                href="/history"
                className="text-[var(--primary)] hover:text-[var(--primary)]/80 font-semibold text-sm flex items-center space-x-2"
              >
                <span>View All</span>
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
              <h4 className="text-xl font-bold mb-2">Pro Tip</h4>
              <p className="text-gray-400 leading-relaxed">
                The more you swipe, the better our AI understands your preferences!
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .swipe-in {
          animation: fadeIn 0.25s ease-out;
        }
        .swipe-out-left {
          animation: slideLeft 0.3s ease-in forwards;
        }
        .swipe-out-right {
          animation: slideRight 0.3s ease-in forwards;
        }
        .swipe-out-down {
          animation: slideDown 0.3s ease-in forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideLeft {
          to { opacity: 0; transform: translateX(-120%) rotate(-8deg); }
        }
        @keyframes slideRight {
          to { opacity: 0; transform: translateX(120%) rotate(8deg); }
        }
        @keyframes slideDown {
          to { opacity: 0; transform: translateY(60px) scale(0.9); }
        }
      `}</style>
    </div>
  );
}
