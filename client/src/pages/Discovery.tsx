import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useDiscovery } from '../hooks/use-discovery';
import { api } from '../lib/api';
import GameCard from '../components/GameCard';
import SwipeControls from '../components/SwipeControls';
import FilterPanel from '../components/FilterPanel';
import type { SwipeDecision } from '../../../shared/types';

export default function Discovery() {
  const { user, loading: authLoading, syncStatus } = useAuth();
  const { currentGame, swipe, isLoading, filters, setFilters, animatingOut, refetchQueue, swipedCount, totalLoaded } = useDiscovery();
  const [loadingMore, setLoadingMore] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!currentGame) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        swipe('no');
      } else if (e.key === 'ArrowDown') {
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col items-center">
        <FilterPanel filters={filters} onApply={setFilters} />

        {totalLoaded > 0 && (
          <div className="w-full max-w-sm mb-4">
            <div className="flex justify-between text-xs text-[var(--muted-foreground)] mb-1">
              <span>{swipedCount} swiped</span>
              <span>{totalLoaded - swipedCount} remaining</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                style={{ width: `${Math.round((swipedCount / totalLoaded) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="relative min-h-[500px] flex items-start justify-center w-full">
          {isLoading || loadingMore ? (
            /* Skeleton card */
            <div className="max-w-sm w-full rounded-xl overflow-hidden bg-[var(--card)] shadow-lg">
              <div className="w-full aspect-video bg-[var(--muted)] animate-pulse" />
              <div className="p-4 flex flex-col gap-3">
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
            <div key={currentGame.id} className={animationClass}>
              <GameCard game={currentGame} />
            </div>
          ) : (
            <div className="text-center py-20 text-[var(--muted-foreground)]">
              {syncStatus === 'syncing' ? (
                <>
                  <p className="text-lg mb-2">Setting up your discovery queue...</p>
                  <p className="text-sm">Syncing your Steam library and loading games. This may take a moment.</p>
                  <div className="mt-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
                </>
              ) : (
                <>
                  <p className="text-lg mb-2">No more games to discover!</p>
                  <p className="text-sm mb-4">Want to load more games from Steam?</p>
                  <button
                    onClick={handleLoadMore}
                    className="bg-[var(--primary)] text-[var(--primary-foreground)] px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Load More Games
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <SwipeControls onSwipe={swipe} disabled={!currentGame || isLoading} />

        <p className="text-xs text-[var(--muted-foreground)] mt-4">
          Use arrow keys: Left = No, Down = Maybe, Right = Yes
        </p>
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
