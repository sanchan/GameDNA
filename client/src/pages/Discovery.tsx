import { useEffect, useState, useRef, useCallback } from 'react';
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
  const { user, loading: authLoading, syncStatus, syncProgress } = useAuth();
  const { currentGame, currentScore, swipe, undo, canUndo, isLoading, filters, setFilters, animatingOut, refetchQueue, swipedCount, totalLoaded } = useDiscovery();
  const [loadingMore, setLoadingMore] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const filterCount = useFilterCount(filters);
  const scrollKeyRef = useRef('discovery-scroll');

  // Touch gesture state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchDeltaRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [dragStyle, setDragStyle] = useState<React.CSSProperties>({});
  const isDraggingRef = useRef(false);

  // Save scroll position before navigating away
  useEffect(() => {
    const saveScroll = () => {
      sessionStorage.setItem(scrollKeyRef.current, String(window.scrollY));
    };
    window.addEventListener('beforeunload', saveScroll);
    return () => {
      saveScroll();
      window.removeEventListener('beforeunload', saveScroll);
    };
  }, []);

  // Restore scroll position on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(scrollKeyRef.current);
    if (saved) {
      requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
    }
  }, []);

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
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (canUndo) undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentGame, swipe, undo, canUndo]);

  // Touch gesture handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!currentGame || animatingOut) return;
    touchStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    touchDeltaRef.current = { x: 0, y: 0 };
    isDraggingRef.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [currentGame, animatingOut]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!touchStartRef.current || animatingOut) return;
    const dx = e.clientX - touchStartRef.current.x;
    const dy = e.clientY - touchStartRef.current.y;
    touchDeltaRef.current = { x: dx, y: dy };

    // Only start dragging after 10px threshold
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      isDraggingRef.current = true;
    }

    if (isDraggingRef.current) {
      const rotation = dx * 0.05;
      const opacity = Math.max(0.3, 1 - Math.abs(dx) / 400);
      setDragStyle({
        transform: `translateX(${dx}px) translateY(${Math.max(0, dy * 0.3)}px) rotate(${rotation}deg)`,
        opacity,
        transition: 'none',
      });
    }
  }, [animatingOut]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!touchStartRef.current) return;

    const dx = touchDeltaRef.current.x;
    const dy = touchDeltaRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;

    touchStartRef.current = null;
    setDragStyle({});

    if (!isDraggingRef.current) {
      // It was a tap, not a drag — toggle preview
      if (elapsed < 300 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        setShowPreview((prev) => !prev);
      }
      return;
    }

    isDraggingRef.current = false;

    // Determine swipe threshold (100px or fast velocity)
    const velocity = Math.abs(dx) / elapsed;
    const threshold = velocity > 0.5 ? 50 : 100;

    if (dx > threshold) {
      swipe('yes');
    } else if (dx < -threshold) {
      swipe('no');
    } else if (dy > 80) {
      swipe('maybe');
    }
  }, [swipe]);

  // Reset preview when game changes
  useEffect(() => {
    setShowPreview(false);
  }, [currentGame?.id]);

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
          <div className="flex items-center gap-3">
            {/* Session counter */}
            {swipedCount > 0 && (
              <span className="px-3 py-1.5 bg-[var(--primary)]/20 text-[var(--primary)] rounded-full text-sm font-bold">
                {t('discovery.sessionCounter', { count: swipedCount })}
              </span>
            )}
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
            <>
              <div
                ref={cardRef}
                key={currentGame.id}
                className={animatingOut ? animationClass : 'discovery-swipe-in'}
                style={!animatingOut ? dragStyle : undefined}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <GameCard game={currentGame} score={currentScore ? currentScore * 100 : null} />
              </div>

              {/* Preview panel — expanded game details */}
              {showPreview && (
                <div className="mt-4 bg-[#242424] border border-[#333] rounded-2xl p-6 discovery-swipe-in">
                  {currentGame.shortDesc && (
                    <p className="text-sm text-gray-300 mb-4 leading-relaxed">{currentGame.shortDesc}</p>
                  )}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {currentGame.releaseDate && (
                      <div>
                        <span className="text-gray-500">Release:</span>{' '}
                        <span className="text-white">{currentGame.releaseDate}</span>
                      </div>
                    )}
                    {currentGame.reviewScore !== null && (
                      <div>
                        <span className="text-gray-500">Reviews:</span>{' '}
                        <span className="text-white">{currentGame.reviewScore}% positive</span>
                      </div>
                    )}
                    {currentGame.developers.length > 0 && (
                      <div>
                        <span className="text-gray-500">Developer:</span>{' '}
                        <span className="text-white">{currentGame.developers[0]}</span>
                      </div>
                    )}
                    {currentGame.priceCents !== null && (
                      <div>
                        <span className="text-gray-500">Price:</span>{' '}
                        <span className="text-white">
                          {currentGame.priceCents === 0 ? 'Free' : `$${(currentGame.priceCents / 100).toFixed(2)}`}
                        </span>
                      </div>
                    )}
                  </div>
                  {currentGame.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      {currentGame.tags.slice(0, 8).map((tag) => (
                        <span key={tag} className="bg-[#1a1a1a] text-gray-400 px-2 py-0.5 rounded text-xs">{tag}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-3 text-center">Tap card again to collapse</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center text-center text-[var(--muted-foreground)] py-20">
              {syncStatus === 'syncing' ? (
                <div className="max-w-sm mx-auto">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
                    <i className="fa-brands fa-steam text-3xl text-[var(--primary)] animate-pulse" />
                  </div>
                  <p className="text-lg font-semibold text-[var(--foreground)] mb-2">{t('discovery.syncingLibrary')}</p>
                  {syncProgress && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-[var(--muted-foreground)]">{syncProgress.detail}</span>
                        <span className="text-sm font-medium text-[var(--primary)]">{syncProgress.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--primary)] rounded-full transition-all duration-500"
                          style={{ width: `${syncProgress.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {!syncProgress && (
                    <div className="mt-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
                  )}
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

          {/* Swipe buttons + Undo — outside the card */}
          {currentGame && !isLoading && (
            <div className="relative">
              <SwipeControls onSwipe={swipe} />
              {canUndo && (
                <button
                  onClick={undo}
                  className="absolute -left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#242424] border border-[#333] hover:border-[var(--primary)] rounded-full flex items-center justify-center transition-all text-gray-400 hover:text-[var(--primary)]"
                  title={t('discovery.undoSwipe')}
                >
                  <i className="fa-solid fa-rotate-left text-sm" />
                </button>
              )}
              {/* Swipe hint on mobile */}
              <p className="text-center text-xs text-gray-500 mt-3 sm:hidden">{t('discovery.swipeHint')}</p>
            </div>
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
