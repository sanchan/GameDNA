import type { Recommendation } from '../../../shared/types';
import GameCard from './GameCard';

interface GameGridProps {
  games: Recommendation[];
  onExplain?: (id: number) => void;
  onDismiss?: (id: number) => void;
}

export default function GameGrid({ games, onExplain }: GameGridProps) {
  if (games.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {games.map((rec) => (
        <div key={rec.id} className="flex flex-col">
          <GameCard
            game={rec.game}
            score={rec.score * 100}
            className="cursor-pointer"
          />
          {onExplain && (
            <button
              onClick={() => onExplain(rec.id)}
              className="text-[var(--primary)] hover:opacity-80 text-sm font-semibold flex items-center space-x-1.5 mt-3 px-6"
            >
              <span>Why this game?</span>
              <i className="fa-solid fa-arrow-right text-xs" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
