import { useEffect, useState, useRef, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/use-auth';
import { useDb } from '../contexts/db-context';
import { useDiscovery } from '../hooks/use-discovery';
import { useGamingDNA } from '../hooks/use-profile';
import * as queries from '../db/queries';
import { expandGamePool } from '../services/pool-expansion';
import GameCard from '../components/GameCard';
import type { GameCardHandle } from '../components/GameCard';
import SwipeControls from '../components/SwipeControls';
import FilterPanel, { useFilterCount } from '../components/FilterPanel';
import { Select } from '../components/Select';
import type { Game, SwipeDecision } from '../../../shared/types';

interface HistoryItem {
  id: number;
  game: Game;
  decision: SwipeDecision;
  swipedAt: number;
}

function RecentSwipeCard({ item, userId, onReswipe }: { item: HistoryItem; userId: number; onReswipe: () => void }) {
  const { t } = useTranslation();
  const [decision, setDecision] = useState(item.decision);

  const handleSwipe = (newDecision: SwipeDecision) => {
    queries.recordSwipe(userId, item.game.id, newDecision);
    setDecision(newDecision);
    onReswipe();
  };

  const decisionBadge = (d: SwipeDecision) => {
    switch (d) {
      case 'yes':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">{t('discovery.liked')}</span>;
      case 'no':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">{t('discovery.passed')}</span>;
      case 'maybe':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">{t('discovery.maybe')}</span>;
    }
  };

  return (
    <div className="group bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--muted-foreground)] transition-colors">
      {item.game.headerImage && (
        <div className="relative">
          <img
            src={item.game.headerImage}
            alt={item.game.name}
            className="w-full aspect-video object-cover transition-all group-hover:blur-[5px]"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 transition-opacity opacity-0 group-hover:opacity-100 pointer-events-none">
            <button
              onClick={() => handleSwipe('no')}
              className={`pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${decision === 'no' ? 'bg-red-500 text-white' : 'bg-white/20 text-red-400 hover:bg-red-500/30'}`}
              title={t('discovery.passed')}
            >
              <i className="fa-solid fa-thumbs-down text-sm" />
            </button>
            <button
              onClick={() => handleSwipe('maybe')}
              className={`pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${decision === 'maybe' ? 'bg-yellow-500 text-[var(--foreground)]' : 'bg-white/20 text-yellow-400 hover:bg-yellow-500/30'}`}
              title={t('discovery.maybe')}
            >
              <i className="fa-solid fa-minus text-sm" />
            </button>
            <button
              onClick={() => handleSwipe('yes')}
              className={`pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${decision === 'yes' ? 'bg-green-500 text-white' : 'bg-white/20 text-green-400 hover:bg-green-500/30'}`}
              title={t('discovery.liked')}
            >
              <i className="fa-solid fa-thumbs-up text-sm" />
            </button>
          </div>
        </div>
      )}
      <div className="p-3">
        <a href={`/game/${item.game.id}`} className="text-sm font-semibold truncate mb-2 block hover:text-[var(--primary)] transition-colors">
          {item.game.name}
        </a>
        {decisionBadge(decision)}
      </div>
    </div>
  );
}

export default function Discovery() {
  const { t } = useTranslation();
  const { user, loading: authLoading, syncStatus, syncProgress } = useAuth();
  const { userId, config } = useDb();
  const { currentGame, currentScore, swipe, undo, canUndo, undoDepth, isLoading, filters, setFilters, animatingOut, refetchQueue, swipedCount, totalLoaded, discoveryMode, setDiscoveryMode, maxHours, setMaxHours, coldStart } = useDiscovery();
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = useFilterCount(filters);
  const scrollKeyRef = useRef('discovery-scroll');

  // Touch gesture state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchDeltaRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [dragStyle, setDragStyle] = useState<React.CSSProperties>({});
  const isDraggingRef = useRef(false);
  const gameCardRef = useRef<GameCardHandle>(null);
  const navigate = useNavigate();

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

  // Fetch recent swipes from local DB
  const [recentSwipesData, setRecentSwipesData] = useState<{ items: HistoryItem[] } | null>(null);
  const [recentSwipesRevision, setRecentSwipesRevision] = useState(0);
  useEffect(() => {
    if (!userId) return;
    try {
      const items = queries.getSwipeHistory(userId, { limit: 8 });
      setRecentSwipesData({
        items: items.map((e) => ({
          id: e.id,
          game: e.game,
          decision: e.decision as SwipeDecision,
          swipedAt: e.swipedAt,
        })),
      });
    } catch { /* ignore */ }
  }, [userId, swipedCount, recentSwipesRevision]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!currentGame) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        swipe('no');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        gameCardRef.current?.openGallery();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        swipe('maybe');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        swipe('yes');
      } else if (e.key === ' ') {
        e.preventDefault();
        navigate(`/game/${currentGame.id}`);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (canUndo) undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentGame, swipe, undo, canUndo, navigate]);

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

  const handleLoadMore = async () => {
    if (!userId || loadingMore) return;
    setLoadingMore(true);
    try {
      await expandGamePool(userId, undefined, config?.countryCode ?? undefined);
      refetchQueue();
    } catch (e) {
      console.error('[discovery] Load more error:', e);
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
      {/* Main content */}
      <div className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 min-w-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-2">{t('discovery.title')}</h1>
            <p className="text-[var(--text-muted)]">{t('discovery.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Session counter */}
            {swipedCount > 0 && (
              <span className="px-3 py-1.5 bg-[var(--primary)]/20 text-[var(--primary)] rounded-full text-sm font-bold">
                {t('discovery.sessionCounter', { count: swipedCount })}
              </span>
            )}

            {/* Discovery Mode selector */}
            <Select
              value={discoveryMode}
              onChange={(v) => { setDiscoveryMode(v as any); refetchQueue(); }}
              size="sm"
              options={[
                { value: 'default', label: 'All Games' },
                { value: 'hidden_gems', label: 'Hidden Gems' },
                { value: 'new_releases', label: 'New Releases' },
                { value: 'genre_deep_dive', label: 'Genre Deep Dive' },
                { value: 'contrarian', label: 'Contrarian' },
                { value: 'challenge_my_taste', label: 'Challenge My Taste' },
                { value: 'undiscovered_gems', label: 'Undiscovered Gems' },
              ]}
            />

            {/* Time filter */}
            <Select
              value={maxHours?.toString() ?? ''}
              onChange={(v) => { setMaxHours(v ? Number(v) : undefined); refetchQueue(); }}
              size="sm"
              options={[
                { value: '', label: 'Any Length' },
                { value: '2', label: 'Under 2h' },
                { value: '5', label: 'Under 5h' },
                { value: '10', label: 'Under 10h' },
                { value: '20', label: 'Under 20h' },
                { value: '50', label: 'Under 50h' },
              ]}
            />

            {/* Filter toggle button */}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors cursor-pointer ${filtersOpen
                  ? 'bg-[var(--primary)]/15 border-[var(--primary)] text-[var(--primary)]'
                  : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--muted-foreground)]'
                }`}
            >
              <i className="fa-solid fa-filter" />
              <span className="hidden sm:inline">{t('common.filters')}</span>
              {filterCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-medium bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full">
                  {filterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Cold Start Progress */}
        {coldStart?.isColdStart && (
          <div className="max-w-md mx-auto mb-6">
            <div className="bg-[var(--card)] border border-[var(--primary)]/30 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
                  <i className="fa-solid fa-flask text-[var(--primary)] text-sm" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Warming up your taste profile
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {coldStart.current}/{coldStart.threshold} swipes to unlock personalized recommendations
                  </p>
                </div>
              </div>
              <div className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (coldStart.current / coldStart.threshold) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Card container */}
        <div className="max-w-md mx-auto">
          {isLoading || loadingMore ? (
            /* Skeleton card */
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="h-64 bg-[var(--background)] animate-pulse" />
              <div className="p-6 flex flex-col gap-3">
                <div className="h-6 w-3/4 bg-[var(--background)] rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-[var(--background)] rounded animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-6 w-14 bg-[var(--background)] rounded-full animate-pulse" />
                  <div className="h-6 w-20 bg-[var(--background)] rounded animate-pulse" />
                </div>
                <div className="flex gap-2">
                  <div className="h-6 w-20 bg-[var(--background)] rounded-full animate-pulse" />
                  <div className="h-6 w-16 bg-[var(--background)] rounded-full animate-pulse" />
                  <div className="h-6 w-14 bg-[var(--background)] rounded-full animate-pulse" />
                </div>
                <div className="h-10 w-full bg-[var(--background)] rounded animate-pulse" />
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
                <GameCard ref={gameCardRef} game={currentGame} score={currentScore ? currentScore * 100 : null} />
              </div>
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
                    disabled={loadingMore}
                    className="bg-[var(--primary)] text-[var(--primary-foreground)] px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <i className="fa-solid fa-arrows-rotate animate-spin text-xs" />
                        {t('discovery.fetchingGames')}
                      </span>
                    ) : (
                      t('discovery.loadMoreButton')
                    )}
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
                  className="absolute -left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] rounded-full flex items-center justify-center transition-all text-[var(--text-muted)] hover:text-[var(--primary)]"
                  title={`${t('discovery.undoSwipe')} (${undoDepth} available)`}
                >
                  <i className="fa-solid fa-rotate-left text-sm" />
                  {undoDepth > 1 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full text-[10px] font-bold flex items-center justify-center">
                      {undoDepth}
                    </span>
                  )}
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
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-[var(--primary)] mb-2">{swipeStats ? (swipeStats.yes + swipeStats.no + swipeStats.maybe) : swipedCount}</div>
              <div className="text-sm text-[var(--text-muted)]">{t('discovery.gamesSwiped')}</div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-green-500 mb-2">{swipeStats?.yes ?? '--'}</div>
              <div className="text-sm text-[var(--text-muted)]">{t('discovery.liked')}</div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-yellow-500 mb-2">{swipeStats?.maybe ?? '--'}</div>
              <div className="text-sm text-[var(--text-muted)]">{t('discovery.maybeLater')}</div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-red-500 mb-2">{swipeStats?.no ?? '--'}</div>
              <div className="text-sm text-[var(--text-muted)]">{t('discovery.passed')}</div>
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
                <RecentSwipeCard
                  key={item.id}
                  item={item}
                  userId={userId!}
                  onReswipe={() => setRecentSwipesRevision((r) => r + 1)}
                />
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
              <p className="text-[var(--text-muted)] leading-relaxed">
                {t('discovery.proTipText')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right-side filter panel */}
      {filtersOpen && (
        <div className="hidden md:block shrink-0">
          <FilterPanel
            filters={filters}
            onApply={setFilters}
            className="h-screen sticky top-0 xl:top-0 border-l border-[var(--border)]"
            dna={dna}
          />
        </div>
      )}

      {/* Mobile/tablet filter overlay */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFiltersOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw]">
            <FilterPanel
              filters={filters}
              onApply={(f) => {
                setFilters(f);
                setFiltersOpen(false);
              }}
              className="h-full"
              dna={dna}
            />
          </div>
        </div>
      )}

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
