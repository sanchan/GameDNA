import { useEffect } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { useDiscovery } from '../hooks/use-discovery';
import GameCard from '../components/GameCard';
import SwipeControls from '../components/SwipeControls';
import FilterPanel from '../components/FilterPanel';
import type { SwipeDecision } from '../../../shared/types';

export default function Discovery() {
  const { user, loading: authLoading } = useAuth();
  const { currentGame, swipe, isLoading, filters, setFilters, animatingOut } = useDiscovery();

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

        <div className="relative min-h-[500px] flex items-start justify-center w-full">
          {isLoading ? (
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
            </div>
          ) : currentGame ? (
            <div key={currentGame.id} className={animationClass}>
              <GameCard game={currentGame} />
            </div>
          ) : (
            <div className="text-center py-20 text-[var(--muted-foreground)]">
              <p className="text-lg mb-2">No more games to discover!</p>
              <p className="text-sm">Adjust your filters or check back later.</p>
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
