import { useTranslation } from 'react-i18next';
import type { Recommendation } from '../../../shared/types';
import GameCard from './GameCard';

interface GameGridProps {
  games: Recommendation[];
  onExplain?: (id: number) => void;
  onDismiss?: (id: number) => void;
  dismissedIds?: Set<number>;
}

export default function GameGrid({ games, onExplain, onDismiss, dismissedIds }: GameGridProps) {
  const { t } = useTranslation();
  if (games.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {games.map((rec) => {
        const isDismissed = dismissedIds?.has(rec.id);

        if (isDismissed) {
          return (
            <div
              key={rec.id}
              className="bg-[#1a1a1a] border border-[#333] border-dashed rounded-2xl overflow-hidden flex flex-col items-center justify-center min-h-[360px] opacity-60"
            >
              <i className="fa-solid fa-ban text-3xl text-[var(--muted-foreground)] mb-3" />
              <p className="text-[var(--muted-foreground)] font-medium">{t('gameGrid.gameDismissed')}</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">{rec.game.name}</p>
            </div>
          );
        }

        return (
          <div key={rec.id} className="flex flex-col">
            <GameCard
              game={rec.game}
              score={rec.score * 100}
              className="cursor-pointer"
            />
            <div className="flex items-center justify-between mt-3 px-6">
              {onExplain && (
                <button
                  onClick={() => onExplain(rec.id)}
                  className="text-[var(--primary)] hover:opacity-80 text-sm font-semibold flex items-center space-x-1.5"
                >
                  <span>{t('gameGrid.whyThisGame')}</span>
                  <i className="fa-solid fa-arrow-right text-xs" />
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={() => onDismiss(rec.id)}
                  className="text-[var(--muted-foreground)] hover:text-red-400 text-sm flex items-center space-x-1.5 transition-colors"
                  title="Dismiss game"
                >
                  <i className="fa-solid fa-xmark" />
                  <span>{t('gameGrid.dismiss')}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
